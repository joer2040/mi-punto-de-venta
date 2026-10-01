-- CAJA-03A: origen del efectivo en compras + bloqueo de movimientos 1101 durante el conteo.
--
-- 1. create_purchase_with_ledger: p_payment acepta cash_source ('caja_operativa' | 'caja_fuerte')
--    obligatorio cuando method = efectivo y prohibido en otros métodos.
--      caja_operativa → 1101 + cash_session_id de la caja abierta (sin primer conteo)
--      caja_fuerte    → 1102, cash_session_id NULL, no requiere caja abierta
--      tarjeta / transferencia → 1103 (sin cambio)
-- 2. Guard "caja en proceso de cierre" (first_counted_cash IS NOT NULL) en:
--      create_purchase_with_ledger (caja_operativa), record_transfer (1101),
--      record_owner_contribution (destino 1101), reverse_journal_entry (asiento 1101
--      ligado a la caja en conteo).
--
-- Sin cambios de tablas/columnas, sin UPDATE de datos, firmas sin cambio.

-- ─────────────────────────────────────────────────────────────────────────────
-- create_purchase_with_ledger
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_purchase_with_ledger(p_provider_id uuid, p_center_id uuid, p_invoice_ref text, p_items jsonb, p_payment jsonb, p_performed_by uuid, p_idempotency_key text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_purchase_id        uuid;
  v_total_amount       numeric(14,2);
  v_merch_amount       numeric(14,2);
  v_expense_amount     numeric(14,2);   -- items sin material_id → 5102
  v_payment_method     text;
  v_payment_amount     numeric(14,2);
  v_cash_source        text;
  v_cash_session_id    uuid;
  v_cash_session_count integer;
  v_first_counted_cash numeric(14,2);
  v_ledger_cutover_at  timestamptz;
  v_financial_op_id    uuid;
  v_journal_entry_id   uuid;
  v_acct_caja_op       uuid;
  v_acct_caja_fuerte   uuid;
  v_acct_banco         uuid;
  v_acct_pago          uuid;
  v_acct_compras       uuid;
  v_acct_gastos        uuid;
  v_after_stock        numeric(12,4);
  v_before_stock       numeric(12,4);
  v_idem_hash          text;
  v_idem_row           public.idempotency_requests%rowtype;
  v_result             jsonb;
  item_rec             record;
  v_entry_number       text;
begin

  if p_provider_id is null then
    raise exception 'Falta provider_id.';
  end if;
  if p_center_id is null then
    raise exception 'Falta center_id.';
  end if;
  if p_performed_by is null then
    raise exception 'Falta performed_by.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra debe incluir al menos un artículo.';
  end if;

  v_total_amount   := 0;
  v_merch_amount   := 0;
  v_expense_amount := 0;

  for item_rec in select * from jsonb_array_elements(p_items) loop
    declare
      v_qty  numeric(12,4);
      v_cost numeric(14,2);
    begin
      v_qty  := coalesce(nullif(trim(item_rec.value->>'quantity'), ''), '0')::numeric(12,4);
      v_cost := coalesce(nullif(trim(item_rec.value->>'unit_cost'), ''), '0')::numeric(14,2);

      if v_qty <= 0 then
        raise exception 'Cada artículo debe tener cantidad mayor que cero.';
      end if;
      if v_cost < 0 then
        raise exception 'El costo unitario no puede ser negativo.';
      end if;

      v_total_amount := v_total_amount + (v_qty * v_cost);

      if (item_rec.value->>'material_id') is not null and trim(item_rec.value->>'material_id') <> '' then
        v_merch_amount := v_merch_amount + (v_qty * v_cost);
      else
        v_expense_amount := v_expense_amount + (v_qty * v_cost);
      end if;
    end;
  end loop;

  v_total_amount   := round(v_total_amount,   2);
  v_merch_amount   := round(v_merch_amount,   2);
  v_expense_amount := round(v_expense_amount, 2);

  if p_payment is not null then
    v_payment_method := lower(trim(coalesce(p_payment->>'method', '')));
    v_payment_amount := coalesce(nullif(trim(p_payment->>'amount'), ''), '0')::numeric(14,2);
    v_cash_source    := lower(trim(coalesce(p_payment->>'cash_source', '')));

    if v_payment_method not in ('efectivo', 'tarjeta', 'transferencia') then
      raise exception 'Método de pago no soportado: %.', p_payment->>'method';
    end if;

    if abs(v_payment_amount - v_total_amount) > 0.01 then
      raise exception 'El importe del pago (%) no coincide con el total de la compra (%).', v_payment_amount, v_total_amount;
    end if;

    -- Origen del efectivo: obligatorio en efectivo, prohibido en otros métodos
    if v_payment_method = 'efectivo' then
      if v_cash_source not in ('caja_operativa', 'caja_fuerte') then
        raise exception 'Selecciona el origen del efectivo (caja_operativa o caja_fuerte).'
          using errcode = 'P0001';
      end if;
    elsif v_cash_source <> '' then
      raise exception 'El origen del efectivo solo aplica a pagos en Efectivo.'
        using errcode = 'P0001';
    end if;

    -- Solo Caja operativa (1101) se liga a la caja abierta
    if v_payment_method = 'efectivo' and v_cash_source = 'caja_operativa' then
      select count(*) into v_cash_session_count
      from public.cash_sessions where status = 'open';

      if v_cash_session_count > 1 then
        raise exception 'Se encontró más de una caja abierta.';
      end if;

      select id, first_counted_cash into v_cash_session_id, v_first_counted_cash
      from public.cash_sessions where status = 'open'
      for update;

      if v_cash_session_id is null then
        raise exception 'No hay una caja abierta. Debes abrir caja para pagar compras desde Caja operativa.';
      end if;

      if v_first_counted_cash is not null then
        raise exception 'La caja está en proceso de cierre y no permite movimientos de efectivo.'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  v_idem_hash := md5(jsonb_build_object(
    'provider_id', p_provider_id,
    'center_id',   p_center_id,
    'invoice_ref', coalesce(p_invoice_ref, ''),
    'items',       p_items
  )::text);

  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'purchase' and idempotency_key = p_idempotency_key
    for share;

    if found then
      if v_idem_row.request_hash = v_idem_hash then
        return v_idem_row.response_json;
      else
        raise exception 'La clave de idempotencia "%" ya fue usada con una carga distinta.', p_idempotency_key;
      end if;
    end if;
  end if;

  insert into public.purchases
    (provider_id, center_id, invoice_ref, total_amount)
  values
    (p_provider_id, p_center_id, nullif(trim(coalesce(p_invoice_ref, '')), ''), v_total_amount)
  returning id into v_purchase_id;

  insert into public.purchase_items
    (purchase_id, material_id, item_description, quantity, unit_cost)
  select
    v_purchase_id,
    nullif(trim(coalesce(item->>'material_id', '')), '')::uuid,
    coalesce(trim(item->>'item_description'), ''),
    (item->>'quantity')::numeric(12,4),
    (item->>'unit_cost')::numeric(14,2)
  from jsonb_array_elements(p_items) item;

  insert into public.inventory_movements (
    center_id, material_id, movement_type, direction, quantity,
    before_stock, after_stock, unit_cost, unit_price,
    reference_table, reference_id, reference_number, reason_code, notes, performed_by
  )
  select
    p_center_id,
    nullif(trim(coalesce(item->>'material_id', '')), '')::uuid,
    'purchase', 'in',
    (item->>'quantity')::numeric(12,4),
    inv.stock_actual - (item->>'quantity')::numeric(12,4),
    inv.stock_actual,
    (item->>'unit_cost')::numeric(14,2),
    null,
    'purchases', v_purchase_id, nullif(trim(coalesce(p_invoice_ref, '')), ''),
    'purchase_invoice', 'Entrada de inventario por compra',
    p_performed_by::text
  from jsonb_array_elements(p_items) item
  join public.inventory inv
    on inv.material_id = nullif(trim(coalesce(item->>'material_id', '')), '')::uuid
   and inv.center_id   = p_center_id
  where nullif(trim(coalesce(item->>'material_id', '')), '') is not null;

  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by,
    'purchase_created',
    'purchases',
    v_purchase_id,
    jsonb_build_object(
      'provider_id',    p_provider_id,
      'center_id',      p_center_id,
      'invoice_ref',    p_invoice_ref,
      'total_amount',   v_total_amount,
      'merch_amount',   v_merch_amount,
      'expense_amount', v_expense_amount,
      'item_count',     jsonb_array_length(p_items),
      'has_payment',    p_payment is not null,
      'cash_source',    nullif(v_cash_source, '')
    ),
    'success'
  );

  select ledger_cutover_at into v_ledger_cutover_at
  from public.ledger_settings where id = true;

  if v_ledger_cutover_at is not null and now() >= v_ledger_cutover_at and p_payment is not null then

    select id into v_acct_caja_op     from public.financial_accounts where code = '1101' and is_active and is_system;
    select id into v_acct_caja_fuerte from public.financial_accounts where code = '1102' and is_active and is_system;
    select id into v_acct_banco       from public.financial_accounts where code = '1103' and is_active and is_system;
    select id into v_acct_compras     from public.financial_accounts where code = '1201' and is_active and is_system;
    select id into v_acct_gastos      from public.financial_accounts where code = '5102' and is_active and is_system;

    if v_acct_caja_op is null or v_acct_caja_fuerte is null or v_acct_banco is null
       or v_acct_compras is null or v_acct_gastos is null then
      raise exception 'Cuentas del sistema incompletas. Verifica el catálogo financiero.';
    end if;

    -- Cuenta de pago resuelta en servidor: nunca se acepta un account_id del cliente
    v_acct_pago := case
      when v_payment_method = 'efectivo' and v_cash_source = 'caja_operativa' then v_acct_caja_op
      when v_payment_method = 'efectivo' and v_cash_source = 'caja_fuerte'    then v_acct_caja_fuerte
      else v_acct_banco
    end;

    v_entry_number := 'JE-CMP-' || upper(substr(v_purchase_id::text, 1, 8));

    insert into public.journal_entries (
      entry_number, entry_type, status, occurred_at,
      source_type, source_id, created_by, idempotency_key
    )
    values (
      v_entry_number, 'purchase', 'pending', now(),
      'purchases', v_purchase_id, p_performed_by, p_idempotency_key
    )
    returning id into v_journal_entry_id;

    -- Débitos: 1201 para mercancía, 5102 para gastos
    if v_merch_amount > 0 then
      insert into public.journal_lines
        (journal_entry_id, financial_account_id, debit, credit, description)
      values
        (v_journal_entry_id, v_acct_compras, v_merch_amount, 0,
         'Compra mercancía — ' || coalesce(nullif(trim(p_invoice_ref), ''), v_entry_number));
    end if;

    if v_expense_amount > 0 then
      insert into public.journal_lines
        (journal_entry_id, financial_account_id, debit, credit, description)
      values
        (v_journal_entry_id, v_acct_gastos, v_expense_amount, 0,
         'Gasto operativo — ' || coalesce(nullif(trim(p_invoice_ref), ''), v_entry_number));
    end if;

    insert into public.journal_lines
      (journal_entry_id, financial_account_id, debit, credit, description)
    values (
      v_journal_entry_id,
      v_acct_pago,
      0,
      v_total_amount,
      'Pago ' || (p_payment->>'method') || ' — ' || coalesce(nullif(trim(p_invoice_ref), ''), v_entry_number)
    );

    update public.journal_entries set status = 'confirmed' where id = v_journal_entry_id;

    insert into public.financial_operations (
      operation_type, total_amount, cash_session_id,
      source_type, source_id, journal_entry_id,
      performed_by, idempotency_key
    )
    values (
      'purchase', v_total_amount, v_cash_session_id,
      'purchases', v_purchase_id, v_journal_entry_id,
      p_performed_by, p_idempotency_key
    )
    returning id into v_financial_op_id;

    insert into public.financial_payments
      (financial_operation_id, payment_method, financial_account_id, amount)
    values (
      v_financial_op_id,
      initcap(p_payment->>'method'),
      v_acct_pago,
      v_total_amount
    );

    update public.purchases
       set financial_operation_id = v_financial_op_id,
           journal_entry_id       = v_journal_entry_id
     where id = v_purchase_id;

  end if;

  select to_jsonb(p) || jsonb_build_object(
           'journal_entry_id',       v_journal_entry_id,
           'financial_operation_id', v_financial_op_id
         )
    into v_result
  from public.purchases p where p.id = v_purchase_id;

  if p_idempotency_key is not null then
    insert into public.idempotency_requests
      (scope, idempotency_key, request_hash, status, response_json)
    values
      ('purchase', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- record_transfer — guard cuando participa 1101
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_transfer(p_from_code text, p_to_code text, p_amount numeric, p_description text, p_performed_by uuid, p_idempotency_key text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_from_acct_id       uuid;
  v_to_acct_id         uuid;
  v_cash_session_id    uuid;
  v_first_counted_cash numeric(14,2);
  v_journal_entry_id   uuid;
  v_financial_op_id    uuid;
  v_entry_number       text;
  v_idem_hash          text;
  v_idem_row           public.idempotency_requests%rowtype;
  v_result             jsonb;
  FUND_CODES           constant text[] := array['1101','1102','1103'];
begin

  if p_performed_by is null then
    raise exception 'Falta performed_by.';
  end if;
  if p_from_code is null or p_to_code is null then
    raise exception 'Falta cuenta origen o destino.';
  end if;
  if p_from_code = p_to_code then
    raise exception 'Las cuentas origen y destino deben ser distintas.';
  end if;
  if not (p_from_code = any(FUND_CODES)) then
    raise exception 'Cuenta origen no permitida para traspasos: %.', p_from_code;
  end if;
  if not (p_to_code = any(FUND_CODES)) then
    raise exception 'Cuenta destino no permitida para traspasos: %.', p_to_code;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe del traspaso debe ser mayor que cero.';
  end if;

  -- Ledger activo
  if not exists (select 1 from public.ledger_settings where id = true and ledger_cutover_at is not null) then
    raise exception 'El ledger no está activo. Activa el ledger antes de registrar traspasos.';
  end if;

  -- Caja requerida si alguna cuenta es 1101; bloqueada durante el conteo
  if p_from_code = '1101' or p_to_code = '1101' then
    select id, first_counted_cash into v_cash_session_id, v_first_counted_cash
    from public.cash_sessions where status = 'open'
    for update;
    if v_cash_session_id is null then
      raise exception 'No hay caja abierta. Caja operativa (1101) requiere sesión activa.';
    end if;
    if v_first_counted_cash is not null then
      raise exception 'La caja está en proceso de cierre y no permite movimientos de efectivo.'
        using errcode = 'P0001';
    end if;
  end if;

  -- Cuentas
  select id into v_from_acct_id from public.financial_accounts where code = p_from_code and is_active;
  select id into v_to_acct_id   from public.financial_accounts where code = p_to_code   and is_active;
  if v_from_acct_id is null or v_to_acct_id is null then
    raise exception 'Una de las cuentas del traspaso no está disponible.';
  end if;

  -- Idempotencia
  v_idem_hash := md5(jsonb_build_object(
    'from', p_from_code, 'to', p_to_code,
    'amount', p_amount, 'description', coalesce(p_description,'')
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'transfer' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  v_entry_number := 'JE-TRP-' || upper(substr(gen_random_uuid()::text, 1, 8));

  -- Asiento
  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at, created_by, idempotency_key)
  values
    (v_entry_number, 'transfer', 'pending', now(), p_performed_by, p_idempotency_key)
  returning id into v_journal_entry_id;

  insert into public.journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
  values
    (v_journal_entry_id, v_to_acct_id,   p_amount, 0,        coalesce(p_description,'Traspaso') || ' — entrada'),
    (v_journal_entry_id, v_from_acct_id, 0,        p_amount, coalesce(p_description,'Traspaso') || ' — salida');

  update public.journal_entries set status = 'confirmed' where id = v_journal_entry_id;

  -- Operación financiera
  insert into public.financial_operations
    (operation_type, total_amount, cash_session_id, journal_entry_id, performed_by, idempotency_key)
  values
    ('transfer', p_amount, v_cash_session_id, v_journal_entry_id, p_performed_by, p_idempotency_key)
  returning id into v_financial_op_id;

  -- Auditoría
  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'transfer_recorded', 'journal_entries', v_journal_entry_id,
    jsonb_build_object(
      'from_code', p_from_code, 'to_code', p_to_code,
      'amount', p_amount, 'entry_number', v_entry_number
    ), 'success'
  );

  v_result := jsonb_build_object(
    'journal_entry_id',       v_journal_entry_id,
    'financial_operation_id', v_financial_op_id,
    'entry_number',           v_entry_number,
    'from_code',              p_from_code,
    'to_code',                p_to_code,
    'amount',                 p_amount
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('transfer', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- record_owner_contribution — guard cuando el destino es 1101
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_owner_contribution(p_destination_code text, p_amount numeric, p_description text, p_performed_by uuid, p_idempotency_key text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_dest_acct_id       uuid;
  v_aport_acct_id      uuid;
  v_cash_session_id    uuid;
  v_first_counted_cash numeric(14,2);
  v_journal_entry_id   uuid;
  v_financial_op_id    uuid;
  v_entry_number       text;
  v_idem_hash          text;
  v_idem_row           public.idempotency_requests%rowtype;
  v_result             jsonb;
  FUND_CODES           constant text[] := array['1101','1102','1103'];
begin

  if p_performed_by is null then raise exception 'Falta performed_by.'; end if;
  if not (p_destination_code = any(FUND_CODES)) then
    raise exception 'Cuenta destino no válida para aportación: %.', p_destination_code;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe de la aportación debe ser mayor que cero.';
  end if;

  if not exists (select 1 from public.ledger_settings where id = true and ledger_cutover_at is not null) then
    raise exception 'El ledger no está activo.';
  end if;

  -- 1101 requiere caja abierta; bloqueada durante el conteo
  if p_destination_code = '1101' then
    select id, first_counted_cash into v_cash_session_id, v_first_counted_cash
    from public.cash_sessions where status = 'open' for update;
    if v_cash_session_id is null then
      raise exception 'No hay caja abierta. Aportación a Caja operativa requiere sesión activa.';
    end if;
    if v_first_counted_cash is not null then
      raise exception 'La caja está en proceso de cierre y no permite movimientos de efectivo.'
        using errcode = 'P0001';
    end if;
  end if;

  select id into v_dest_acct_id  from public.financial_accounts where code = p_destination_code and is_active;
  select id into v_aport_acct_id from public.financial_accounts where code = '3101' and is_active;
  if v_dest_acct_id is null or v_aport_acct_id is null then
    raise exception 'Cuentas del sistema incompletas.';
  end if;

  v_idem_hash := md5(jsonb_build_object(
    'type','contribution','dest', p_destination_code,
    'amount', p_amount, 'description', coalesce(p_description,'')
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'contribution' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  v_entry_number := 'JE-APT-' || upper(substr(gen_random_uuid()::text, 1, 8));

  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at, created_by, idempotency_key)
  values
    (v_entry_number, 'owner_contribution', 'pending', now(), p_performed_by, p_idempotency_key)
  returning id into v_journal_entry_id;

  insert into public.journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
  values
    (v_journal_entry_id, v_dest_acct_id,  p_amount, 0,        coalesce(p_description,'Aportación del propietario')),
    (v_journal_entry_id, v_aport_acct_id, 0,        p_amount, coalesce(p_description,'Aportación del propietario'));

  update public.journal_entries set status = 'confirmed' where id = v_journal_entry_id;

  insert into public.financial_operations
    (operation_type, total_amount, cash_session_id, journal_entry_id, performed_by, idempotency_key)
  values
    ('owner_contribution', p_amount, v_cash_session_id, v_journal_entry_id, p_performed_by, p_idempotency_key)
  returning id into v_financial_op_id;

  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'owner_contribution_recorded', 'journal_entries', v_journal_entry_id,
    jsonb_build_object('destination_code', p_destination_code, 'amount', p_amount,
                       'entry_number', v_entry_number), 'success'
  );

  v_result := jsonb_build_object(
    'journal_entry_id',       v_journal_entry_id,
    'financial_operation_id', v_financial_op_id,
    'entry_number',           v_entry_number,
    'destination_code',       p_destination_code,
    'amount',                 p_amount
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('contribution', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- reverse_journal_entry — guard si el asiento toca 1101 y pertenece a la caja en conteo
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reverse_journal_entry(p_journal_entry_id uuid, p_authorized_by uuid, p_justification text, p_performed_by uuid, p_idempotency_key text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_original         public.journal_entries%rowtype;
  v_reversal_id      uuid;
  v_auth_id          uuid;
  v_entry_number     text;
  v_idem_hash        text;
  v_idem_row         public.idempotency_requests%rowtype;
  v_result           jsonb;
  v_counting_session uuid;
begin

  if p_performed_by is null then raise exception 'Falta performed_by.'; end if;
  if p_authorized_by is null then raise exception 'La reversa requiere autorización.'; end if;
  if p_performed_by = p_authorized_by then
    raise exception 'La reversa debe ser autorizada por un usuario distinto al solicitante.';
  end if;
  if p_journal_entry_id is null then raise exception 'Falta journal_entry_id.'; end if;

  -- Leer asiento original
  select * into v_original
  from public.journal_entries
  where id = p_journal_entry_id
  for share;

  if not found then
    raise exception 'Asiento no encontrado.';
  end if;
  if v_original.status <> 'confirmed' then
    raise exception 'Solo se pueden revertir asientos confirmados (status=confirmed). Este tiene status=%.', v_original.status;
  end if;
  if v_original.created_by = p_authorized_by then
    raise exception 'El autorizador no puede ser el mismo usuario que creó el asiento original.';
  end if;

  -- Guard: el asiento toca 1101 y su operación pertenece a una caja abierta en conteo.
  -- FOR SHARE sobre la sesión serializa contra el primer conteo (que toma FOR UPDATE).
  select cs.id into v_counting_session
  from public.financial_operations fo
  join public.cash_sessions cs on cs.id = fo.cash_session_id
  where fo.journal_entry_id = p_journal_entry_id
    and cs.status = 'open'
    and cs.first_counted_cash is not null
    and exists (
      select 1
      from public.journal_lines jl
      join public.financial_accounts a on a.id = jl.financial_account_id
      where jl.journal_entry_id = p_journal_entry_id
        and a.code = '1101'
    )
  for share of cs;

  if v_counting_session is not null then
    raise exception 'La caja está en proceso de cierre y no permite movimientos de efectivo.'
      using errcode = 'P0001';
  end if;

  v_idem_hash := md5(jsonb_build_object(
    'entry_id', p_journal_entry_id, 'authorized_by', p_authorized_by,
    'justification', coalesce(p_justification,'')
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'reversal' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  -- Registro de autorización
  insert into public.financial_authorizations
    (request_type, entity_type, entity_id, requested_by, authorized_by, justification)
  values
    ('reversal', 'journal_entries', p_journal_entry_id, p_performed_by, p_authorized_by,
     coalesce(p_justification,'Reversa autorizada'))
  returning id into v_auth_id;

  v_entry_number := 'JE-REV-' || upper(substr(gen_random_uuid()::text, 1, 8));

  -- Asiento de reversa (espejo)
  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at, source_type, source_id,
     reversal_of_id, created_by, authorization_id, idempotency_key)
  values
    (v_entry_number, 'reversal', 'pending', now(),
     v_original.source_type, v_original.source_id,
     p_journal_entry_id, p_performed_by, v_auth_id, p_idempotency_key)
  returning id into v_reversal_id;

  -- Líneas espejo (débito ↔ crédito invertidos)
  insert into public.journal_lines
    (journal_entry_id, financial_account_id, debit, credit, description)
  select
    v_reversal_id,
    financial_account_id,
    credit,   -- invertir
    debit,    -- invertir
    'REVERSA: ' || coalesce(description, '')
  from public.journal_lines
  where journal_entry_id = p_journal_entry_id;

  -- Confirmar reversa (trigger valida balance)
  update public.journal_entries set status = 'confirmed' where id = v_reversal_id;

  -- Marcar original como revertido
  update public.journal_entries set status = 'reversed' where id = p_journal_entry_id;

  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'journal_entry_reversed', 'journal_entries', p_journal_entry_id,
    jsonb_build_object(
      'reversal_entry_id', v_reversal_id, 'authorized_by', p_authorized_by,
      'justification', p_justification, 'entry_number', v_entry_number
    ), 'success'
  );

  v_result := jsonb_build_object(
    'reversal_entry_id',    v_reversal_id,
    'original_entry_id',   p_journal_entry_id,
    'authorization_id',    v_auth_id,
    'entry_number',        v_entry_number
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('reversal', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos: CREATE OR REPLACE conserva ACLs; se reafirman según 20260922020000.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.create_purchase_with_ledger(uuid, uuid, text, jsonb, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.create_purchase_with_ledger(uuid, uuid, text, jsonb, jsonb, uuid, text) to service_role;

revoke all on function public.record_transfer(text, text, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_transfer(text, text, numeric, text, uuid, text) to service_role;

revoke all on function public.record_owner_contribution(text, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_owner_contribution(text, numeric, text, uuid, text) to service_role;

revoke all on function public.reverse_journal_entry(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_journal_entry(uuid, uuid, text, uuid, text) to service_role;
