-- Fase 7 patch: incluir pólizas con status 'reversed' en reportes de auditoría.
--
-- Antes: get_journal_report y get_account_ledger filtraban je.status = 'confirmed'.
-- Efecto: las pólizas originales (reversed) no aparecían en Pólizas ni en Mayor,
--         aunque sí afectaban saldos hasta ser reversadas.
--
-- Corrección:
--   - Filtro extendido a je.status in ('confirmed', 'reversed').
--   - Se agrega columna entry_status al resultado (al final, compatible con OR REPLACE).
--
-- get_account_balances NO se modifica: los saldos ya son correctos porque la
-- entrada de reversa (nueva póliza confirmed) compensa la original.

begin;

-- ============================================================
-- 1. get_journal_report — incluir reversed + exponer entry_status
-- ============================================================
-- DROP + CREATE necesario: PostgreSQL no permite create or replace
-- cuando cambia el tipo de retorno de una función returns table.

drop function if exists public.get_journal_report(date, date);

create function public.get_journal_report(
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
  line_desc     text,
  entry_status  text
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
    jl.description        as line_desc,
    je.status             as entry_status
  from public.journal_entries je
  join public.journal_lines   jl on jl.journal_entry_id = je.id
  join public.financial_accounts fa on fa.id = jl.financial_account_id
  where je.status in ('confirmed', 'reversed')
    and je.occurred_at >= (p_from_date at time zone 'UTC')
    and je.occurred_at <  (p_to_date   at time zone 'UTC' + interval '1 day')
  order by je.occurred_at, je.entry_number, fa.code;
$$;

-- ============================================================
-- 2. get_account_ledger — incluir reversed + exponer entry_status
-- ============================================================

drop function if exists public.get_account_ledger(text, date, date);

create function public.get_account_ledger(
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
  running_balance numeric(14,2),
  entry_status    text
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
      jl.credit,
      je.status      as entry_status
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    cross join account
    where jl.financial_account_id = account.id
      and je.status in ('confirmed', 'reversed')
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
    case
      when (select account_type from account) in ('asset','expense')
        then sum(l.debit - l.credit)  over (order by l.occurred_at, l.line_id)
      else
           sum(l.credit - l.debit)    over (order by l.occurred_at, l.line_id)
    end::numeric(14,2) as running_balance,
    l.entry_status
  from lines l
  order by l.occurred_at, l.line_id;
$$;

-- ============================================================
-- 3. Grants — mantener igual que en migración original
-- ============================================================

revoke all on function public.get_journal_report(date, date)        from public, anon, authenticated;
revoke all on function public.get_account_ledger(text, date, date)  from public, anon, authenticated;

grant execute on function public.get_journal_report(date, date)     to service_role;
grant execute on function public.get_account_ledger(text, date, date) to service_role;

commit;
