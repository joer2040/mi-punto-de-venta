-- CAJA-03A hotfix: idempotencia de compras sensible al pago.
--
-- create_purchase_with_ledger calculaba v_idem_hash sin el pago, por lo que la misma
-- idempotency_key con otro cash_source o método se trataba como replay válido.
-- Ahora el hash incluye el pago normalizado (method, amount, cash_source).
--
-- Único cambio funcional: composición de v_idem_hash. Resto del cuerpo idéntico a
-- 20260929100000_purchase_cash_source_and_count_guard.sql. Firma sin cambio.

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

  -- Hash semántico: incluye el pago normalizado (method/amount/cash_source) para que
  -- reutilizar la misma clave con otro origen o método se rechace como carga distinta.
  v_idem_hash := md5(jsonb_build_object(
    'provider_id', p_provider_id,
    'center_id',   p_center_id,
    'invoice_ref', coalesce(p_invoice_ref, ''),
    'items',       p_items,
    'payment',     case
                     when p_payment is null then null
                     else jsonb_build_object(
                       'method',      v_payment_method,
                       'amount',      v_payment_amount,
                       'cash_source', nullif(v_cash_source, '')
                     )
                   end
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

-- Permisos: se reafirman (solo service_role).
revoke all on function public.create_purchase_with_ledger(uuid, uuid, text, jsonb, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.create_purchase_with_ledger(uuid, uuid, text, jsonb, jsonb, uuid, text) to service_role;
