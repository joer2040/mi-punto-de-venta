-- Corrección incremental: renombrar cuenta 5201 → 5102.
-- No modifica migraciones históricas; solo actualiza el código de cuenta y los RPCs que lo referencian.
-- IMPORTANTE: financial_accounts.id NO cambia → journal_lines existentes no se afectan.

begin;

-- ============================================================
-- 1. Renombrar código 5201 → 5102
-- ============================================================

update public.financial_accounts
   set code = '5102'
 where code = '5201'
   and is_system = true;

-- ============================================================
-- 2. Actualizar RPC create_purchase_with_ledger
--    Único cambio respecto a 20260811150000: code = '5102' (era '5201').
-- ============================================================

create or replace function public.create_purchase_with_ledger(
  p_provider_id     uuid,
  p_center_id       uuid,
  p_invoice_ref     text,
  p_items           jsonb,
  p_payment         jsonb,
  p_performed_by    uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_purchase_id        uuid;
  v_total_amount       numeric(14,2);
  v_merch_amount       numeric(14,2);
  v_expense_amount     numeric(14,2);   -- items sin material_id → 5102
  v_payment_method     text;
  v_payment_amount     numeric(14,2);
  v_cash_session_id    uuid;
  v_cash_session_count integer;
  v_ledger_cutover_at  timestamptz;
  v_financial_op_id    uuid;
  v_journal_entry_id   uuid;
  v_acct_caja_op       uuid;
  v_acct_banco         uuid;
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

    if v_payment_method not in ('efectivo', 'tarjeta', 'transferencia') then
      raise exception 'Método de pago no soportado: %.', p_payment->>'method';
    end if;

    if abs(v_payment_amount - v_total_amount) > 0.01 then
      raise exception 'El importe del pago (%) no coincide con el total de la compra (%).', v_payment_amount, v_total_amount;
    end if;

    if v_payment_method = 'efectivo' then
      select count(*) into v_cash_session_count
      from public.cash_sessions where status = 'open';

      if v_cash_session_count > 1 then
        raise exception 'Se encontró más de una caja abierta.';
      end if;

      select id into v_cash_session_id
      from public.cash_sessions where status = 'open'
      for update;

      if v_cash_session_id is null then
        raise exception 'No hay una caja abierta. Debes abrir caja para pagar compras en efectivo.';
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
      'has_payment',    p_payment is not null
    ),
    'success'
  );

  select ledger_cutover_at into v_ledger_cutover_at
  from public.ledger_settings where id = true;

  if v_ledger_cutover_at is not null and now() >= v_ledger_cutover_at and p_payment is not null then

    select id into v_acct_caja_op  from public.financial_accounts where code = '1101' and is_active and is_system;
    select id into v_acct_banco    from public.financial_accounts where code = '1103' and is_active and is_system;
    select id into v_acct_compras  from public.financial_accounts where code = '1201' and is_active and is_system;
    select id into v_acct_gastos   from public.financial_accounts where code = '5102' and is_active and is_system;

    if v_acct_caja_op is null or v_acct_banco is null or v_acct_compras is null or v_acct_gastos is null then
      raise exception 'Cuentas del sistema incompletas. Verifica el catálogo financiero.';
    end if;

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
      case v_payment_method when 'efectivo' then v_acct_caja_op else v_acct_banco end,
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
      case v_payment_method when 'efectivo' then v_acct_caja_op else v_acct_banco end,
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
$$;

revoke all on function public.create_purchase_with_ledger(uuid, uuid, text, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_purchase_with_ledger(uuid, uuid, text, jsonb, jsonb, uuid, text)
  to service_role;

-- ============================================================
-- 3. Verificación inline
-- ============================================================

do $$
begin
  if not exists (
    select 1 from public.financial_accounts
    where code = '5102' and is_system and is_active
  ) then
    raise exception 'FALLO: código 5102 no encontrado después del fix.';
  end if;

  if exists (
    select 1 from public.financial_accounts where code = '5201'
  ) then
    raise exception 'FALLO: código 5201 aún existe después del fix.';
  end if;

  raise notice 'OK  financial_accounts.code 5201 → 5102 aplicado correctamente.';
end $$;

commit;
