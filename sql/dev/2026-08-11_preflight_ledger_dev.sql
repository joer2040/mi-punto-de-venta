-- ============================================================
-- PREFLIGHT LEDGER — DEV
-- Ejecutar en Supabase SQL Editor (DEV) antes del release a PRD.
-- Debe completarse sin errores ni NOTICEs de fallo.
-- ============================================================

-- ── 1. Tablas del ledger ─────────────────────────────────────────────────────
do $$
declare
  missing text[] := '{}';
  tbl text;
begin
  foreach tbl in array array[
    'financial_accounts','ledger_settings','journal_entries','journal_lines',
    'idempotency_requests','audit_events','bank_reconciliation_items',
    'financial_operations','financial_payments',
    'financial_authorizations','cash_discrepancy_resolutions'
  ] loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      missing := array_append(missing, tbl);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception 'FALLO Tablas faltantes: %', array_to_string(missing, ', ');
  end if;
  raise notice 'OK  Tablas del ledger: todas presentes.';
end $$;

-- ── 2. Columnas extendidas ───────────────────────────────────────────────────
do $$
declare
  col record;
  missing text[] := '{}';
begin
  for col in values
    ('sales',     'financial_operation_id'),
    ('sales',     'journal_entry_id'),
    ('purchases', 'financial_operation_id'),
    ('purchases', 'journal_entry_id'),
    ('cash_sessions', 'first_counted_cash'),
    ('cash_sessions', 'final_counted_cash'),
    ('cash_sessions', 'difference_amount')
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name  = col.column1
        and column_name = col.column2
    ) then
      missing := array_append(missing, col.column1 || '.' || col.column2);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception 'FALLO Columnas extendidas faltantes: %', array_to_string(missing, ', ');
  end if;
  raise notice 'OK  Columnas extendidas: todas presentes.';
end $$;

-- ── 3. Cuentas del sistema ────────────────────────────────────────────────────
do $$
declare
  missing_codes text[];
begin
  select array_agg(required.code order by required.code)
    into missing_codes
  from (values
    ('1101'),('1102'),('1103'),
    ('1201'),('1202'),
    ('3101'),('3102'),
    ('4101'),('4102'),
    ('5101'),('5102')
  ) as required(code)
  where not exists (
    select 1 from public.financial_accounts fa
    where fa.code = required.code and fa.is_system and fa.is_active
  );

  if missing_codes is not null and array_length(missing_codes, 1) > 0 then
    raise exception 'FALLO Cuentas del sistema faltantes: %', array_to_string(missing_codes, ', ');
  end if;
  raise notice 'OK  Cuentas del sistema: 11 cuentas activas.';
end $$;

-- ── 4. Triggers críticos ──────────────────────────────────────────────────────
do $$
declare
  trig record;
  missing text[] := '{}';
begin
  for trig in values
    ('financial_accounts', 'trg_protect_system_accounts'),
    ('journal_entries',    'trg_assert_journal_entry_balanced'),
    ('purchase_items',     'tr_update_inventory_on_purchase')
  loop
    if not exists (
      select 1 from information_schema.triggers
      where trigger_schema = 'public'
        and event_object_table = trig.column1
        and trigger_name       = trig.column2
    ) then
      missing := array_append(missing, trig.column1 || '.' || trig.column2);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception 'FALLO Triggers faltantes: %', array_to_string(missing, ', ');
  end if;
  raise notice 'OK  Triggers críticos: todos presentes.';
end $$;

-- ── 5. RPCs del ledger ────────────────────────────────────────────────────────
do $$
declare
  fn text;
  missing text[] := '{}';
begin
  foreach fn in array array[
    'activate_ledger',
    'finalize_pos_sale',
    'create_purchase_with_ledger',
    'record_transfer',
    'record_owner_contribution',
    'record_owner_withdrawal',
    'reverse_journal_entry',
    'resolve_cash_discrepancy',
    'get_account_balances',
    'get_journal_report',
    'get_account_ledger',
    'get_cash_sessions_report'
  ] loop
    if not exists (
      select 1 from information_schema.routines
      where routine_schema = 'public'
        and routine_name   = fn
        and routine_type   = 'FUNCTION'
    ) then
      missing := array_append(missing, fn);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception 'FALLO RPCs faltantes: %', array_to_string(missing, ', ');
  end if;
  raise notice 'OK  RPCs del ledger: todas presentes.';
end $$;

-- ── 6. Constraint cash_sessions status incluye closed_with_pending_difference
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.cash_sessions'::regclass
    and conname  = 'cash_sessions_status_check';

  if def not like '%closed_with_pending_difference%' then
    raise exception 'FALLO Constraint cash_sessions_status_check no incluye closed_with_pending_difference.';
  end if;
  raise notice 'OK  Constraint cash_sessions_status_check extendido.';
end $$;

-- ── 7. Firma nueva de finalize_pos_sale (p_payments jsonb, no text) ───────────
do $$
declare
  fn_count integer;
begin
  select count(*) into fn_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finalize_pos_sale'
    and pg_get_function_arguments(p.oid) like '%jsonb%jsonb%';

  if fn_count = 0 then
    raise exception 'FALLO finalize_pos_sale con firma (uuid, jsonb, jsonb, uuid, text) no encontrada.';
  end if;

  -- Firma antigua no debe existir
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'finalize_pos_sale'
      and pg_get_function_arguments(p.oid) like '%text%'
      and pg_get_function_arguments(p.oid) not like '%jsonb%jsonb%'
  ) then
    raise exception 'FALLO finalize_pos_sale con firma antigua (p_payment_method text) aún existe.';
  end if;

  raise notice 'OK  finalize_pos_sale: firma nueva confirmada, firma antigua eliminada.';
end $$;

-- ── 8. ledger_settings singleton ─────────────────────────────────────────────
do $$
declare
  cnt integer;
begin
  select count(*) into cnt from public.ledger_settings;
  if cnt > 1 then
    raise exception 'FALLO Más de una fila en ledger_settings (singleton violado).';
  end if;
  raise notice 'OK  ledger_settings singleton: % fila(s).', cnt;
end $$;

-- ── 9. Asientos existentes balanceados ────────────────────────────────────────
do $$
declare
  unbalanced integer;
begin
  select count(*) into unbalanced
  from public.journal_entries je
  where je.status = 'confirmed'
    and exists (select 1 from public.journal_lines where journal_entry_id = je.id)
    and (
      select sum(debit) from public.journal_lines where journal_entry_id = je.id
    ) <>
    (
      select sum(credit) from public.journal_lines where journal_entry_id = je.id
    );

  if unbalanced > 0 then
    raise exception 'FALLO % asientos confirmed con débitos ≠ créditos.', unbalanced;
  end if;
  raise notice 'OK  Balance del ledger: todos los asientos confirmed están balanceados.';
end $$;

-- ── 10. Índices de reporte ────────────────────────────────────────────────────
do $$
declare
  idx text;
  missing text[] := '{}';
begin
  foreach idx in array array[
    'journal_entries_occurred_confirmed_idx',
    'journal_entries_status_occurred_idx',
    'journal_lines_account_entry_idx',
    'financial_operations_source_idx',
    'sales_financial_operation_idx',
    'purchases_financial_operation_idx'
  ] loop
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = idx
    ) then
      missing := array_append(missing, idx);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    raise exception 'FALLO Índices faltantes: %', array_to_string(missing, ', ');
  end if;
  raise notice 'OK  Índices de rendimiento: todos presentes.';
end $$;

-- ── 11. Prueba funcional: get_account_balances ────────────────────────────────
do $$
declare
  row_count integer;
begin
  select count(*) into row_count from public.get_account_balances(null);
  if row_count = 0 then
    raise exception 'FALLO get_account_balances devolvió 0 filas (espera ≥ 11 cuentas activas).';
  end if;
  raise notice 'OK  get_account_balances: % cuentas devueltas.', row_count;
end $$;

-- ── 12. Prueba funcional: ledger balanceado desde reportes ───────────────────
do $$
declare
  total_debit  numeric(14,2);
  total_credit numeric(14,2);
begin
  -- Si el ledger está activo, la suma de débitos debe igualar la de créditos
  if exists (select 1 from public.ledger_settings where id = true and ledger_cutover_at is not null) then
    select
      coalesce(sum(jl.debit),  0),
      coalesce(sum(jl.credit), 0)
    into total_debit, total_credit
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.status = 'confirmed';

    if total_debit <> total_credit then
      raise exception 'FALLO El ledger no está balanceado globalmente: débitos=% créditos=%.', total_debit, total_credit;
    end if;
    raise notice 'OK  Ledger global balanceado: débitos=% = créditos=%.', total_debit, total_credit;
  else
    raise notice 'INFO Ledger no activo en DEV — omitiendo verificación de balance global.';
  end if;
end $$;

-- ── 13. Idempotency: no hay claves huérfanas ─────────────────────────────────
do $$
declare
  orphans integer;
begin
  select count(*) into orphans
  from public.idempotency_requests
  where status = 'completed'
    and response_json is null;

  if orphans > 0 then
    raise exception 'FALLO % registros de idempotencia completed sin response_json.', orphans;
  end if;
  raise notice 'OK  Idempotency: sin registros huérfanos.';
end $$;

-- ── RESUMEN ───────────────────────────────────────────────────────────────────
do $$
begin
  raise notice '';
  raise notice '══════════════════════════════════════════════════════════════';
  raise notice 'PREFLIGHT LEDGER DEV — COMPLETADO SIN ERRORES';
  raise notice 'DEV está listo para release a PRD.';
  raise notice '══════════════════════════════════════════════════════════════';
end $$;
