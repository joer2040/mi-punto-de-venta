-- ============================================================
-- WRAPPER DE EJECUCIÓN SEGURA — PRUEBAS DE ESQUEMA FASE 3
-- Usa tabla temporal para capturar resultados; los devuelve como
-- filas para que supabase db query los muestre en output JSON.
-- SOLO LECTURA — seguro contra DEV.
-- ============================================================

create temp table if not exists t_results (
  test_id text,
  status  text,
  detail  text
);

-- ── T-01: Tablas del ledger ───────────────────────────────────────────────────
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
    insert into t_results values ('T-01','FAIL','tablas faltantes: ' || array_to_string(missing,', '));
  else
    insert into t_results values ('T-01','PASS','11 tablas del ledger presentes');
  end if;
end $$;

-- ── T-02: Columnas extendidas ─────────────────────────────────────────────────
do $$
declare
  col record;
  missing text[] := '{}';
begin
  for col in values
    ('sales',         'financial_operation_id'),
    ('sales',         'journal_entry_id'),
    ('purchases',     'financial_operation_id'),
    ('purchases',     'journal_entry_id'),
    ('cash_sessions', 'first_counted_cash'),
    ('cash_sessions', 'final_counted_cash'),
    ('cash_sessions', 'difference_amount')
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = col.column1
        and column_name  = col.column2
    ) then
      missing := array_append(missing, col.column1 || '.' || col.column2);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    insert into t_results values ('T-02','FAIL','columnas faltantes: ' || array_to_string(missing,', '));
  else
    insert into t_results values ('T-02','PASS','7 columnas extendidas presentes');
  end if;
end $$;

-- ── T-03: Catálogo de cuentas (5102, no 5201) ─────────────────────────────────
do $$
declare
  missing_codes text[];
  has_5201 boolean;
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
  select exists(select 1 from public.financial_accounts where code = '5201') into has_5201;

  if missing_codes is not null and array_length(missing_codes, 1) > 0 then
    insert into t_results values ('T-03','FAIL','cuentas faltantes: ' || array_to_string(missing_codes,', ') || case when has_5201 then ' | 5201 AÚN existe → migración 20260812100000 no aplicada' else '' end);
  elsif has_5201 then
    insert into t_results values ('T-03','FAIL','5201 aún existe y 5102 ausente → migración 20260812100000 no aplicada');
  else
    insert into t_results values ('T-03','PASS','11 cuentas correctas: 5102 presente, 5201 ausente');
  end if;
end $$;

-- ── T-04: Triggers críticos ───────────────────────────────────────────────────
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
      where trigger_schema     = 'public'
        and event_object_table = trig.column1
        and trigger_name       = trig.column2
    ) then
      missing := array_append(missing, trig.column1 || '.' || trig.column2);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    insert into t_results values ('T-04','FAIL','triggers faltantes: ' || array_to_string(missing,', '));
  else
    insert into t_results values ('T-04','PASS','3 triggers críticos presentes');
  end if;
end $$;

-- ── T-05: trg_assert_journal_entry_balanced es BEFORE UPDATE ─────────────────
do $$
declare
  timing text;
  event  text;
begin
  select action_timing, event_manipulation
    into timing, event
  from information_schema.triggers
  where trigger_schema     = 'public'
    and event_object_table = 'journal_entries'
    and trigger_name       = 'trg_assert_journal_entry_balanced'
  limit 1;

  if timing is null then
    insert into t_results values ('T-05','FAIL','trigger no encontrado');
  elsif upper(timing) <> 'BEFORE' or upper(event) <> 'UPDATE' then
    insert into t_results values ('T-05','FAIL','timing=' || timing || ' event=' || event || ' (esperado BEFORE UPDATE)');
  else
    insert into t_results values ('T-05','PASS','BEFORE UPDATE en journal_entries');
  end if;
end $$;

-- ── T-06: Constraint financial_payments_method_check ─────────────────────────
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.financial_payments'::regclass
    and conname  = 'financial_payments_method_check';

  if def is null then
    insert into t_results values ('T-06','FAIL','constraint no existe');
  elsif def not like '%Efectivo%' or def not like '%Tarjeta%' or def not like '%Transferencia%' then
    insert into t_results values ('T-06','FAIL','constraint incompleto: ' || def);
  else
    insert into t_results values ('T-06','PASS', left(def, 120));
  end if;
end $$;

-- ── T-07: Constraint financial_authorizations no_self_auth ───────────────────
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.financial_authorizations'::regclass
    and conname  = 'financial_authorizations_no_self_auth';

  if def is null then
    insert into t_results values ('T-07','FAIL','constraint no_self_auth no existe');
  else
    insert into t_results values ('T-07','PASS', left(def, 120));
  end if;
end $$;

-- ── T-08: Firma nueva de finalize_pos_sale ────────────────────────────────────
do $$
declare
  fn_count  integer;
  old_count integer;
begin
  select count(*) into fn_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finalize_pos_sale'
    and pg_get_function_arguments(p.oid) like '%jsonb%jsonb%';

  select count(*) into old_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finalize_pos_sale'
    and pg_get_function_arguments(p.oid) like '%text%'
    and pg_get_function_arguments(p.oid) not like '%jsonb%jsonb%';

  if fn_count = 0 then
    insert into t_results values ('T-08','FAIL','firma (uuid,jsonb,jsonb,uuid,text) no encontrada');
  elsif old_count > 0 then
    insert into t_results values ('T-08','FAIL','firma antigua (payment_method text) aún existe');
  else
    insert into t_results values ('T-08','PASS','firma nueva confirmada, antigua eliminada');
  end if;
end $$;

-- ── T-09: RPCs del ledger presentes ──────────────────────────────────────────
do $$
declare
  fn text;
  missing text[] := '{}';
begin
  foreach fn in array array[
    'activate_ledger','finalize_pos_sale','create_purchase_with_ledger',
    'record_transfer','record_owner_contribution','record_owner_withdrawal',
    'reverse_journal_entry','resolve_cash_discrepancy',
    'get_account_balances','get_journal_report','get_account_ledger','get_cash_sessions_report'
  ] loop
    if not exists (
      select 1 from information_schema.routines
      where routine_schema = 'public' and routine_name = fn and routine_type = 'FUNCTION'
    ) then
      missing := array_append(missing, fn);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    insert into t_results values ('T-09','FAIL','RPCs faltantes: ' || array_to_string(missing,', '));
  else
    insert into t_results values ('T-09','PASS','12 RPCs del ledger presentes');
  end if;
end $$;

-- ── T-10: Índices de rendimiento ──────────────────────────────────────────────
do $$
declare
  idx text;
  missing text[] := '{}';
begin
  foreach idx in array array[
    'journal_entries_occurred_confirmed_idx','journal_entries_status_occurred_idx',
    'journal_lines_account_entry_idx','financial_operations_source_idx',
    'sales_financial_operation_idx','purchases_financial_operation_idx'
  ] loop
    if not exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = idx
    ) then
      missing := array_append(missing, idx);
    end if;
  end loop;
  if array_length(missing, 1) > 0 then
    insert into t_results values ('T-10','FAIL','índices faltantes: ' || array_to_string(missing,', '));
  else
    insert into t_results values ('T-10','PASS','6 índices de rendimiento presentes');
  end if;
end $$;

-- ── T-11: Asientos confirmed balanceados ──────────────────────────────────────
do $$
declare unbalanced integer;
begin
  select count(*) into unbalanced
  from public.journal_entries je
  where je.status = 'confirmed'
    and exists (select 1 from public.journal_lines where journal_entry_id = je.id)
    and (select sum(debit)  from public.journal_lines where journal_entry_id = je.id)
     <> (select sum(credit) from public.journal_lines where journal_entry_id = je.id);

  if unbalanced > 0 then
    insert into t_results values ('T-11','FAIL', unbalanced || ' asientos confirmed desbalanceados');
  else
    insert into t_results values ('T-11','PASS','todos los asientos confirmed balanceados');
  end if;
end $$;

-- ── T-12: Ledger NO activo ────────────────────────────────────────────────────
do $$
declare cutover timestamptz;
begin
  select ledger_cutover_at into cutover from public.ledger_settings where id = true;
  if cutover is not null then
    insert into t_results values ('T-12','WARN','ledger activo desde ' || cutover::text);
  else
    insert into t_results values ('T-12','PASS','ledger_cutover_at = NULL → ledger inactivo');
  end if;
end $$;

-- ── T-13: Sin registros idempotencia huérfanos ───────────────────────────────
do $$
declare orphans integer;
begin
  select count(*) into orphans
  from public.idempotency_requests
  where status = 'completed' and response_json is null;

  if orphans > 0 then
    insert into t_results values ('T-13','FAIL', orphans || ' registros completed sin response_json');
  else
    insert into t_results values ('T-13','PASS','sin registros de idempotencia huérfanos');
  end if;
end $$;

-- ── T-14: get_account_balances devuelve ≥ 11 filas ───────────────────────────
do $$
declare row_count integer;
begin
  begin
    select count(*) into row_count from public.get_account_balances(null);
    if row_count < 11 then
      insert into t_results values ('T-14','FAIL', 'solo ' || row_count || ' filas (esperado ≥ 11)');
    else
      insert into t_results values ('T-14','PASS', row_count || ' cuentas devueltas');
    end if;
  exception when others then
    insert into t_results values ('T-14','FAIL','excepción: ' || sqlerrm);
  end;
end $$;

-- ── T-15: cash_sessions status incluye closed_with_pending_difference ─────────
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.cash_sessions'::regclass
    and conname  = 'cash_sessions_status_check';

  if def is null then
    insert into t_results values ('T-15','FAIL','constraint cash_sessions_status_check no encontrado');
  elsif def not like '%closed_with_pending_difference%' then
    insert into t_results values ('T-15','FAIL','no incluye closed_with_pending_difference: ' || left(def,80));
  else
    insert into t_results values ('T-15','PASS','closed_with_pending_difference incluido');
  end if;
end $$;

-- ── T-16: financial_authorizations.no_self_auth semántica correcta ────────────
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.financial_authorizations'::regclass
    and conname  = 'financial_authorizations_no_self_auth';

  if def is null then
    insert into t_results values ('T-16','FAIL','constraint no_self_auth no encontrado');
  elsif def not like '%requested_by%' or def not like '%authorized_by%' then
    insert into t_results values ('T-16','FAIL','columnas incorrectas: ' || left(def,80));
  else
    insert into t_results values ('T-16','PASS','requested_by <> authorized_by confirmado');
  end if;
end $$;

-- ── RESULTADOS ───────────────────────────────────────────────────────────────
select test_id, status, detail from t_results order by test_id;
