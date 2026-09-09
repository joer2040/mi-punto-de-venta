-- Fase 7: Reportes del ledger.
-- Índices de rendimiento + RPCs: get_account_balances, get_journal_report,
-- get_account_ledger, get_cash_sessions_report.

begin;

-- ============================================================
-- 1. Índices para rendimiento en consultas de reportes
-- ============================================================

create index if not exists journal_entries_occurred_confirmed_idx
  on public.journal_entries (occurred_at)
  where status = 'confirmed';

create index if not exists journal_entries_status_occurred_idx
  on public.journal_entries (status, occurred_at);

create index if not exists journal_lines_account_entry_idx
  on public.journal_lines (financial_account_id, journal_entry_id);

-- ============================================================
-- 2. get_account_balances
--    Saldos por cuenta a una fecha dada (o ahora).
--    balance = débitos - créditos para activos/gastos;
--              créditos - débitos para pasivos/capital/ingresos.
-- ============================================================

create or replace function public.get_account_balances(
  p_as_of timestamptz default null
)
returns table (
  account_id   uuid,
  code         text,
  name         text,
  account_type text,
  total_debit  numeric(14,2),
  total_credit numeric(14,2),
  balance      numeric(14,2)
)
language sql
security definer
stable
set search_path to public
as $$
  select
    fa.id                                                                              as account_id,
    fa.code,
    fa.name,
    fa.account_type,
    coalesce(sum(jl.debit),  0)::numeric(14,2)                                        as total_debit,
    coalesce(sum(jl.credit), 0)::numeric(14,2)                                        as total_credit,
    case
      when fa.account_type in ('asset','expense')
        then (coalesce(sum(jl.debit),0) - coalesce(sum(jl.credit),0))::numeric(14,2)
      else
           (coalesce(sum(jl.credit),0) - coalesce(sum(jl.debit),0))::numeric(14,2)
    end                                                                                as balance
  from public.financial_accounts fa
  left join public.journal_lines  jl on jl.financial_account_id = fa.id
  left join public.journal_entries je on je.id = jl.journal_entry_id
                                      and je.status = 'confirmed'
                                      and (p_as_of is null or je.occurred_at <= p_as_of)
  where fa.is_active
  group by fa.id, fa.code, fa.name, fa.account_type
  order by fa.code;
$$;

-- ============================================================
-- 3. get_journal_report
--    Asientos confirmados en un rango de fechas con sus líneas.
-- ============================================================

create or replace function public.get_journal_report(
  p_from_date date,
  p_to_date   date
)
returns table (
  entry_id      uuid,
  entry_number  text,
  entry_type    text,
  occurred_at   timestamptz,
  source_type   text,
  source_id     uuid,
  line_id       uuid,
  account_code  text,
  account_name  text,
  debit         numeric(14,2),
  credit        numeric(14,2),
  line_desc     text
)
language sql
security definer
stable
set search_path to public
as $$
  select
    je.id                 as entry_id,
    je.entry_number,
    je.entry_type,
    je.occurred_at,
    je.source_type,
    je.source_id,
    jl.id                 as line_id,
    fa.code               as account_code,
    fa.name               as account_name,
    jl.debit,
    jl.credit,
    jl.description        as line_desc
  from public.journal_entries je
  join public.journal_lines   jl on jl.journal_entry_id = je.id
  join public.financial_accounts fa on fa.id = jl.financial_account_id
  where je.status = 'confirmed'
    and je.occurred_at >= (p_from_date at time zone 'UTC')
    and je.occurred_at <  (p_to_date   at time zone 'UTC' + interval '1 day')
  order by je.occurred_at, je.entry_number, fa.code;
$$;

-- ============================================================
-- 4. get_account_ledger
--    Mayor por cuenta: partidas y saldo acumulado.
-- ============================================================

create or replace function public.get_account_ledger(
  p_account_code text,
  p_from_date    date default null,
  p_to_date      date default null
)
returns table (
  line_id         uuid,
  entry_id        uuid,
  entry_number    text,
  entry_type      text,
  occurred_at     timestamptz,
  description     text,
  debit           numeric(14,2),
  credit          numeric(14,2),
  running_balance numeric(14,2)
)
language sql
security definer
stable
set search_path to public
as $$
  with account as (
    select id, account_type from public.financial_accounts
    where code = p_account_code and is_active
    limit 1
  ),
  lines as (
    select
      jl.id          as line_id,
      je.id          as entry_id,
      je.entry_number,
      je.entry_type,
      je.occurred_at,
      jl.description,
      jl.debit,
      jl.credit
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    cross join account
    where jl.financial_account_id = account.id
      and je.status = 'confirmed'
      and (p_from_date is null or je.occurred_at >= (p_from_date at time zone 'UTC'))
      and (p_to_date   is null or je.occurred_at <  (p_to_date   at time zone 'UTC' + interval '1 day'))
  )
  select
    l.line_id,
    l.entry_id,
    l.entry_number,
    l.entry_type,
    l.occurred_at,
    l.description,
    l.debit,
    l.credit,
    -- Saldo acumulado: signo según lado normal de la cuenta
    case
      when (select account_type from account) in ('asset','expense')
        then sum(l.debit - l.credit)  over (order by l.occurred_at, l.line_id)
      else
           sum(l.credit - l.debit)    over (order by l.occurred_at, l.line_id)
    end::numeric(14,2) as running_balance
  from lines l
  order by l.occurred_at, l.line_id;
$$;

-- ============================================================
-- 5. get_cash_sessions_report
--    Sesiones de caja con diferencias y resoluciones.
-- ============================================================

create or replace function public.get_cash_sessions_report(
  p_from_date date default null,
  p_to_date   date default null
)
returns table (
  session_id          uuid,
  status              text,
  opened_at           timestamptz,
  closed_at           timestamptz,
  opening_amount      numeric(14,2),
  expected_cash       numeric(14,2),
  first_counted_cash  numeric(14,2),
  final_counted_cash  numeric(14,2),
  difference_amount   numeric(14,2),
  resolution_type     text,
  resolution_amount   numeric(14,2),
  resolution_motive   text,
  resolution_entry    text
)
language sql
security definer
stable
set search_path to public
as $$
  select
    cs.id                          as session_id,
    cs.status,
    cs.created_at                  as opened_at,
    cs.closed_at,
    cs.opening_amount::numeric(14,2),
    cs.expected_cash_total::numeric(14,2) as expected_cash,
    cs.first_counted_cash,
    cs.final_counted_cash,
    cs.difference_amount,
    cdr.resolution_type,
    cdr.amount                     as resolution_amount,
    cdr.motive                     as resolution_motive,
    je.entry_number                as resolution_entry
  from public.cash_sessions cs
  left join public.cash_discrepancy_resolutions cdr on cdr.cash_session_id = cs.id
  left join public.journal_entries              je  on je.id = cdr.journal_entry_id
  where (p_from_date is null or cs.created_at >= (p_from_date at time zone 'UTC'))
    and (p_to_date   is null or cs.created_at <  (p_to_date   at time zone 'UTC' + interval '1 day'))
  order by cs.created_at desc;
$$;

-- ============================================================
-- 6. Grants
-- ============================================================

revoke all on function public.get_account_balances(timestamptz)             from public, anon, authenticated;
revoke all on function public.get_journal_report(date, date)                from public, anon, authenticated;
revoke all on function public.get_account_ledger(text, date, date)          from public, anon, authenticated;
revoke all on function public.get_cash_sessions_report(date, date)          from public, anon, authenticated;

grant execute on function public.get_account_balances(timestamptz)          to service_role;
grant execute on function public.get_journal_report(date, date)             to service_role;
grant execute on function public.get_account_ledger(text, date, date)       to service_role;
grant execute on function public.get_cash_sessions_report(date, date)       to service_role;

commit;
