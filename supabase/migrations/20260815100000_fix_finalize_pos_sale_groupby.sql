-- M29: Corrección BUG-M24-001 en finalize_pos_sale
-- Causa: la sentencia INSERT INTO journal_lines usaba GROUP BY lower(trim(pay->>'method'))
-- pero referenciaba trim(pay->>'method') en el campo description sin incluirlo en GROUP BY.
-- PostgreSQL rechaza la sentencia en runtime cuando el ledger está activo.
-- Fix mínimo: agregar trim(pay->>'method') al GROUP BY.
-- La firma, permisos, SECURITY DEFINER y search_path no cambian.

begin;

create or replace function public.finalize_pos_sale(
  p_table_id        uuid,
  p_items           jsonb,
  p_payments        jsonb,
  p_performed_by    uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_table              public.tables%rowtype;
  v_order              public.table_orders%rowtype;
  v_expected_order_id  uuid;
  v_center_id          uuid;
  v_cash_session_id    uuid;
  v_cash_session_count integer;
  v_sale_id            uuid;
  v_sale_created_at    timestamptz;
  v_document_number    text;
  v_sequence           integer;
  v_total_amount       numeric(12,2);
  v_total_payments     numeric(14,2);
  v_cash_amount        numeric(14,2);
  v_dominant_method    text;
  v_invalid_count      integer;
  v_missing_count      integer;
  v_ambiguous_count    integer;
  v_day_start          timestamptz;
  v_day_end            timestamptz;
  v_sale               jsonb;
  -- Ledger
  v_ledger_cutover_at  timestamptz;
  v_financial_op_id    uuid;
  v_journal_entry_id   uuid;
  v_acct_caja_op       uuid;
  v_acct_banco         uuid;
  v_acct_ingresos      uuid;
  v_idem_hash          text;
  v_idem_row           public.idempotency_requests%rowtype;
begin

  -- ── Validaciones básicas ─────────────────────────────────────────────────
  if p_table_id is null then
    raise exception 'Falta table_id.';
  end if;

  if p_performed_by is null then
    raise exception 'Falta performed_by.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La mesa no tiene productos para cobrar.';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Debes especificar al menos un método de pago.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_payments) pay
    where lower(trim(pay->>'method')) not in ('efectivo', 'tarjeta', 'transferencia')
  ) then
    raise exception 'Método de pago no soportado.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_payments) pay
    where coalesce(nullif(pay->>'amount', ''), '0')::numeric(14,2) <= 0
  ) then
    raise exception 'El importe de cada pago debe ser mayor que cero.';
  end if;

  -- ── Mesa y pedido ────────────────────────────────────────────────────────
  select * into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Mesa no encontrada.';
  end if;

  if lower(trim(coalesce(v_table.status, ''))) <> lower('ocupada')
     or v_table.current_order_id is null then
    raise exception 'La mesa no tiene un pedido activo o la venta ya fue finalizada.';
  end if;

  select * into v_order
  from public.table_orders
  where id = v_table.current_order_id
    and table_id = v_table.id
  for update;

  if not found then
    raise exception 'Pedido abierto no encontrado para la mesa %.', v_table.id;
  end if;

  -- ── Centro ───────────────────────────────────────────────────────────────
  select count(*) into v_ambiguous_count
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  if v_ambiguous_count = 0 then
    raise exception 'No se encontró el centro Bar Principal.';
  end if;
  if v_ambiguous_count > 1 then
    raise exception 'Se encontró más de un centro Bar Principal.';
  end if;

  select id into v_center_id
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  -- ── Artículos: tabla temporal y validaciones ─────────────────────────────
  create temporary table if not exists pg_temp.finalize_pos_sale_raw_items_v2 (
    order_id_text    text,
    material_id_text text,
    quantity_text    text,
    bundle_id_text   text,
    bundle_type_text text
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_raw_items_v2;

  insert into pg_temp.finalize_pos_sale_raw_items_v2
    (order_id_text, material_id_text, quantity_text, bundle_id_text, bundle_type_text)
  select trim(order_id), trim(material_id), trim(quantity),
         nullif(trim(bundle_id), ''), nullif(lower(trim(bundle_type)), '')
  from jsonb_to_recordset(p_items) as item(
    order_id text, material_id text, quantity text, bundle_id text, bundle_type text
  );

  select count(*) into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2
  where coalesce(order_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(material_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(quantity_text, '') !~ '^[0-9]+(\.[0-9]+)?$'
     or case when coalesce(quantity_text,'') ~ '^[0-9]+(\.[0-9]+)?$' then quantity_text::numeric <= 0 else true end
     or (bundle_id_text is null) <> (bundle_type_text is null)
     or coalesce(bundle_type_text, '') not in ('', 'cubeta', 'cubeta_caguamita');

  if v_invalid_count > 0 then
    raise exception 'La lista de artículos contiene valores inválidos.';
  end if;

  select count(distinct order_id_text) into v_ambiguous_count
  from pg_temp.finalize_pos_sale_raw_items_v2;

  if v_ambiguous_count <> 1 then
    raise exception 'La lista de artículos no identifica un único pedido.';
  end if;

  select min(order_id_text)::uuid into v_expected_order_id
  from pg_temp.finalize_pos_sale_raw_items_v2;

  if v_expected_order_id is distinct from v_order.id then
    raise exception 'El pedido activo de la mesa cambió antes de la finalización.';
  end if;

  select count(*) into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2
  where bundle_type_text is not null
    and quantity_text::numeric <> trunc(quantity_text::numeric);

  if v_invalid_count > 0 then
    raise exception 'Los bundles solo admiten cantidades enteras.';
  end if;

  select count(*) into v_ambiguous_count
  from (
    select bundle_id_text from pg_temp.finalize_pos_sale_raw_items_v2
    where bundle_id_text is not null
    group by bundle_id_text having count(distinct bundle_type_text) > 1
  ) bad;

  if v_ambiguous_count > 0 then
    raise exception 'Un bundle no puede mezclar tipos distintos.';
  end if;

  select count(*) into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  left join public.materials material on material.id = item.material_id_text::uuid
  where material.id is null;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales inexistentes.';
  end if;

  select count(*) into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material on material.id = item.material_id_text::uuid
  left join public.categories category on category.id = material.cat_id
  where category.id is null or category.is_for_sale is not true;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales sin categoría vendible.';
  end if;

  perform inventory.id
  from public.inventory inventory
  join (select distinct material_id_text::uuid as material_id from pg_temp.finalize_pos_sale_raw_items_v2) item
    on item.material_id = inventory.material_id
  where inventory.center_id = v_center_id
  order by inventory.material_id
  for update of inventory;

  select count(*) into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  left join public.inventory inventory
    on inventory.material_id = item.material_id_text::uuid
   and inventory.center_id = v_center_id
  where inventory.id is null or inventory.precio_venta is null or inventory.precio_venta <= 0;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales sin precio de venta válido.';
  end if;

  -- ── Validaciones de cubetas ──────────────────────────────────────────────
  select count(*) into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material on material.id = item.material_id_text::uuid
  join public.categories category on category.id = material.cat_id
  where item.bundle_type_text = 'cubeta'
    and (
      coalesce(material.sku,'') not in ('75004132','7501064115400','7501064101410','750106696971','7501064101465')
      or lower(trim(category.name)) <> lower('Cerveza')
    );
  if v_invalid_count > 0 then raise exception 'La Cubeta Mixta contiene un producto no permitido.'; end if;

  select count(*) into v_invalid_count
  from (select bundle_id_text from pg_temp.finalize_pos_sale_raw_items_v2
        where bundle_type_text = 'cubeta' group by bundle_id_text having sum(quantity_text::numeric) <> 10) bad;
  if v_invalid_count > 0 then raise exception 'La Cubeta Mixta debe contener exactamente 10 piezas.'; end if;

  select count(*) into v_invalid_count
  from (
    select item.bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2 item
    join public.inventory inventory on inventory.material_id = item.material_id_text::uuid and inventory.center_id = v_center_id
    where item.bundle_type_text = 'cubeta'
    group by item.bundle_id_text having count(distinct inventory.precio_venta) <> 1
  ) bad;
  if v_invalid_count > 0 then raise exception 'La Cubeta Mixta requiere productos con el mismo precio base.'; end if;

  select count(*) into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material on material.id = item.material_id_text::uuid
  join public.categories category on category.id = material.cat_id
  where item.bundle_type_text = 'cubeta_caguamita'
    and (coalesce(material.sku,'') <> '7503024416459' or lower(trim(category.name)) <> lower('Cerveza'));
  if v_invalid_count > 0 then raise exception 'La Cubeta Caguamita contiene un producto no permitido.'; end if;

  select count(*) into v_invalid_count
  from (select bundle_id_text from pg_temp.finalize_pos_sale_raw_items_v2
        where bundle_type_text = 'cubeta_caguamita' group by bundle_id_text having sum(quantity_text::numeric) <> 5) bad;
  if v_invalid_count > 0 then raise exception 'La Cubeta Caguamita debe contener exactamente 5 piezas.'; end if;

  -- ── Artículos canónicos ──────────────────────────────────────────────────
  create temporary table if not exists pg_temp.finalize_pos_sale_items_v2 (
    material_id uuid,
    quantity    numeric(12,4),
    unit_price  numeric(12,2)
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_items_v2;

  insert into pg_temp.finalize_pos_sale_items_v2 (material_id, quantity, unit_price)
  select priced.material_id, sum(priced.quantity)::numeric(12,4), priced.unit_price
  from (
    select item.material_id_text::uuid as material_id,
           item.quantity_text::numeric as quantity,
           case item.bundle_type_text
             when 'cubeta'           then 32.00::numeric(12,2)
             when 'cubeta_caguamita' then 26.00::numeric(12,2)
             else inventory.precio_venta::numeric(12,2)
           end as unit_price
    from pg_temp.finalize_pos_sale_raw_items_v2 item
    join public.inventory inventory
      on inventory.material_id = item.material_id_text::uuid
     and inventory.center_id = v_center_id
  ) priced
  group by priced.material_id, priced.unit_price;

  select count(*) into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 raw
  where not exists (
    select 1 from pg_temp.finalize_pos_sale_items_v2 canon
    where canon.material_id = raw.material_id_text::uuid
  );
  if v_missing_count > 0 then raise exception 'No se pudo construir la lista canónica completa de la venta.'; end if;

  -- ── Total ────────────────────────────────────────────────────────────────
  select coalesce(sum(quantity * unit_price), 0)::numeric(12,2) into v_total_amount
  from pg_temp.finalize_pos_sale_items_v2;

  if v_total_amount <= 0 then
    raise exception 'El total de la venta debe ser mayor que cero.';
  end if;

  -- ── Validar pagos contra total ───────────────────────────────────────────
  select coalesce(sum((pay->>'amount')::numeric(14,2)), 0) into v_total_payments
  from jsonb_array_elements(p_payments) pay;

  if abs(v_total_payments - v_total_amount) > 0.01 then
    raise exception 'El total de pagos (%) no coincide con el total de la venta (%).', v_total_payments, v_total_amount;
  end if;

  select coalesce(sum((pay->>'amount')::numeric(14,2)), 0) into v_cash_amount
  from jsonb_array_elements(p_payments) pay
  where lower(trim(pay->>'method')) = 'efectivo';

  -- Método dominante para campo legacy sales.payment_method
  select trim(pay->>'method') into v_dominant_method
  from jsonb_array_elements(p_payments) pay
  order by (pay->>'amount')::numeric(14,2) desc
  limit 1;

  -- ── Sesión de caja (solo si hay componente en efectivo) ──────────────────
  if v_cash_amount > 0 then
    select count(*) into v_cash_session_count
    from public.cash_sessions where status = 'open';

    if v_cash_session_count > 1 then
      raise exception 'Se encontró más de una caja abierta.';
    end if;

    select id into v_cash_session_id
    from public.cash_sessions where status = 'open'
    for update;

    if v_cash_session_id is null then
      raise exception 'No hay una caja abierta. Debes abrir caja antes de registrar ventas en efectivo.';
    end if;
  else
    v_cash_session_id := null;
  end if;

  -- ── Idempotencia ─────────────────────────────────────────────────────────
  v_idem_hash := md5(jsonb_build_object(
    'table_id', p_table_id,
    'order_id', v_expected_order_id,
    'payments', p_payments
  )::text);

  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'sale' and idempotency_key = p_idempotency_key
    for share;

    if found then
      if v_idem_row.request_hash = v_idem_hash then
        return v_idem_row.response_json;
      else
        raise exception 'La clave de idempotencia "%" ya fue usada con una carga distinta.', p_idempotency_key;
      end if;
    end if;
  end if;

  -- ── Número de documento ──────────────────────────────────────────────────
  v_sale_created_at := now();
  v_day_start := date_trunc('day', v_sale_created_at at time zone 'UTC') at time zone 'UTC';
  v_day_end   := v_day_start + interval '1 day';

  perform pg_advisory_xact_lock(
    hashtext('finalize_pos_sale_document:' || to_char(v_day_start at time zone 'UTC', 'YYYYMMDD'))
  );

  select count(*) + 1 into v_sequence
  from public.sales
  where created_at >= v_day_start and created_at < v_day_end;

  v_document_number :=
    to_char(v_sale_created_at at time zone 'UTC', 'DDMMYYYYHH24MI') ||
    lpad(v_sequence::text, 2, '0');

  -- ── INSERT venta ─────────────────────────────────────────────────────────
  insert into public.sales (
    center_id, total_amount, payment_method, cash_session_id, created_at, document_number
  )
  values (
    v_center_id, v_total_amount, v_dominant_method, v_cash_session_id, v_sale_created_at, v_document_number
  )
  returning id into v_sale_id;

  -- ── sale_items ───────────────────────────────────────────────────────────
  insert into public.sale_items (sale_id, material_id, quantity, unit_price)
  select v_sale_id, material_id, quantity, unit_price
  from pg_temp.finalize_pos_sale_items_v2;

  -- ── inventory_movements (solo artículos inventariados) ───────────────────
  insert into public.inventory_movements (
    center_id, material_id, movement_type, direction, quantity,
    before_stock, after_stock, unit_cost, unit_price,
    reference_table, reference_id, reference_number, reason_code, notes, performed_by
  )
  select v_center_id,
         item.material_id,
         'sale', 'out', item.quantity,
         inventory.stock_actual + item.quantity,
         inventory.stock_actual,
         null, item.unit_price,
         'sales', v_sale_id, v_document_number,
         'sale_ticket', 'Salida de inventario por venta',
         p_performed_by::text
  from (
    select material_id,
           sum(quantity)::numeric(12,4) as quantity,
           round(sum(quantity * unit_price) / sum(quantity), 2)::numeric(12,2) as unit_price
    from pg_temp.finalize_pos_sale_items_v2
    group by material_id
  ) item
  join public.materials  material  on material.id  = item.material_id
  join public.categories category  on category.id  = material.cat_id
  join public.inventory  inventory on inventory.material_id = item.material_id
                                  and inventory.center_id   = v_center_id
  where category.is_inventoried is true;

  -- ── Asientos del ledger (solo si activo y post-corte) ────────────────────
  select ledger_cutover_at into v_ledger_cutover_at
  from public.ledger_settings where id = true;

  if v_ledger_cutover_at is not null and v_sale_created_at >= v_ledger_cutover_at then

    select id into v_acct_caja_op  from public.financial_accounts where code = '1101' and is_active and is_system;
    select id into v_acct_banco    from public.financial_accounts where code = '1103' and is_active and is_system;
    select id into v_acct_ingresos from public.financial_accounts where code = '4101' and is_active and is_system;

    if v_acct_caja_op is null or v_acct_banco is null or v_acct_ingresos is null then
      raise exception 'Cuentas del sistema incompletas. Verifica el catálogo financiero.';
    end if;

    -- Asiento pending
    insert into public.journal_entries (
      entry_number, entry_type, status, occurred_at,
      source_type, source_id, created_by, idempotency_key
    )
    values (
      'JE-VTA-' || v_document_number,
      'sale', 'pending', v_sale_created_at,
      'sales', v_sale_id, p_performed_by, p_idempotency_key
    )
    returning id into v_journal_entry_id;

    -- Líneas de débito agrupadas por cuenta (tarjeta + transferencia → misma cuenta 1103)
    -- FIX BUG-M24-001: agregar trim(pay->>'method') al GROUP BY para satisfacer la
    -- referencia en el campo description sin usar un agregado.
    insert into public.journal_lines
      (journal_entry_id, financial_account_id, debit, credit, description)
    select
      v_journal_entry_id,
      case lower(trim(pay->>'method'))
        when 'efectivo'      then v_acct_caja_op
        when 'tarjeta'       then v_acct_banco
        when 'transferencia' then v_acct_banco
      end,
      sum((pay->>'amount')::numeric(14,2)),
      0,
      'Cobro ' || trim(pay->>'method') || ' — venta ' || v_document_number
    from jsonb_array_elements(p_payments) pay
    group by lower(trim(pay->>'method')), trim(pay->>'method');

    -- Línea de crédito: ingresos por ventas
    insert into public.journal_lines
      (journal_entry_id, financial_account_id, debit, credit, description)
    values
      (v_journal_entry_id, v_acct_ingresos, 0, v_total_amount::numeric(14,2),
       'Ingreso venta ' || v_document_number);

    -- Confirmar (trigger valida balance)
    update public.journal_entries set status = 'confirmed' where id = v_journal_entry_id;

    -- Operación financiera
    insert into public.financial_operations (
      operation_type, total_amount, cash_session_id,
      source_type, source_id, journal_entry_id,
      performed_by, idempotency_key
    )
    values (
      'sale', v_total_amount::numeric(14,2), v_cash_session_id,
      'sales', v_sale_id, v_journal_entry_id,
      p_performed_by, p_idempotency_key
    )
    returning id into v_financial_op_id;

    -- Pagos desglosados
    insert into public.financial_payments
      (financial_operation_id, payment_method, financial_account_id, amount)
    select
      v_financial_op_id,
      trim(pay->>'method'),
      case lower(trim(pay->>'method'))
        when 'efectivo'      then v_acct_caja_op
        when 'tarjeta'       then v_acct_banco
        when 'transferencia' then v_acct_banco
      end,
      (pay->>'amount')::numeric(14,2)
    from jsonb_array_elements(p_payments) pay;

    -- Vincular venta al ledger
    update public.sales
       set financial_operation_id = v_financial_op_id,
           journal_entry_id       = v_journal_entry_id
     where id = v_sale_id;

    -- Auditoría
    insert into public.audit_events
      (actor_id, action, entity_type, entity_id, values_snapshot, result)
    values (
      p_performed_by, 'sale_confirmed', 'sales', v_sale_id,
      jsonb_build_object(
        'document_number',        v_document_number,
        'total_amount',           v_total_amount,
        'journal_entry_id',       v_journal_entry_id,
        'financial_operation_id', v_financial_op_id,
        'cash_amount',            v_cash_amount
      ),
      'success'
    );

  end if;

  -- ── Liberar mesa ─────────────────────────────────────────────────────────
  update public.tables
     set status = 'libre', current_order_id = null
   where id = v_table.id
     and lower(trim(coalesce(status, ''))) = lower('ocupada')
     and current_order_id = v_order.id;

  if not found then
    raise exception 'El pedido activo de la mesa cambió durante la finalización.';
  end if;

  delete from public.table_orders
  where id = v_order.id and table_id = v_table.id;

  if not found then
    raise exception 'No se pudo consumir el pedido activo de la mesa.';
  end if;

  -- ── Construir respuesta ──────────────────────────────────────────────────
  select to_jsonb(sale_row)
       || jsonb_build_object(
            'items',
            coalesce(
              (
                select jsonb_agg(
                         jsonb_build_object(
                           'material_id',    item.material_id_text::uuid,
                           'name',           material.name,
                           'quantity',       item.quantity_text::numeric,
                           'unit_price',
                             case item.bundle_type_text
                               when 'cubeta'           then 32.00::numeric(12,2)
                               when 'cubeta_caguamita' then 26.00::numeric(12,2)
                               else inventory.precio_venta::numeric(12,2)
                             end,
                           'base_unit_price', inventory.precio_venta::numeric(12,2),
                           'bundle_id',       item.bundle_id_text,
                           'bundle_type',     item.bundle_type_text,
                           'bundle_label',
                             case item.bundle_type_text
                               when 'cubeta'           then 'Cubeta Mixta'
                               when 'cubeta_caguamita' then 'Cubeta Caguamita'
                               else null
                             end
                         )
                         order by item.bundle_id_text nulls last, material.name, item.material_id_text
                       )
                from pg_temp.finalize_pos_sale_raw_items_v2 item
                join public.materials material  on material.id  = item.material_id_text::uuid
                join public.inventory inventory on inventory.material_id = material.id
                                               and inventory.center_id   = v_center_id
              ),
              '[]'::jsonb
            ),
            'payments',               p_payments,
            'journal_entry_id',       v_journal_entry_id,
            'financial_operation_id', v_financial_op_id
          )
    into v_sale
  from public.sales sale_row
  where sale_row.id = v_sale_id;

  -- Registrar idempotencia
  if p_idempotency_key is not null then
    insert into public.idempotency_requests
      (scope, idempotency_key, request_hash, status, response_json)
    values
      ('sale', p_idempotency_key, v_idem_hash, 'completed', v_sale)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_sale;
end;
$$;

revoke all on function public.finalize_pos_sale(uuid, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.finalize_pos_sale(uuid, jsonb, jsonb, uuid, text)
  to service_role;

commit;
