-- FUNDS-01B: get_account_balances respeta status y p_as_of.
--
-- Antes: el filtro de status/p_as_of estaba en un LEFT JOIN a journal_entries,
--        pero sum(jl.debit)/sum(jl.credit) agregaban todas las líneas de la cuenta.
--        Efecto: p_as_of no recortaba nada y se incluían asientos pending.
--
-- Corrección: agregado filtrado por cuenta (journal_lines JOIN journal_entries)
--             unido con LEFT JOIN a financial_accounts. Cuentas activas sin
--             movimientos válidos siguen apareciendo con 0/0/0.
--
-- Estados incluidos: 'confirmed' y 'reversed'. reverse_journal_entry marca el
-- original como 'reversed' y crea un espejo 'confirmed'; ambos deben sumarse
-- para que el par neto sea 0. Solo 'confirmed' dejaría el espejo sin
-- contrapartida (saldo -X por cada reversa). 'pending' queda excluido.
--
-- Firma, columnas, LANGUAGE sql, STABLE, SECURITY DEFINER y ACL sin cambios.

begin;

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
    fa.id                                                     as account_id,
    fa.code,
    fa.name,
    fa.account_type,
    coalesce(t.debit,  0)::numeric(14,2)                      as total_debit,
    coalesce(t.credit, 0)::numeric(14,2)                      as total_credit,
    case
      when fa.account_type in ('asset','expense')
        then (coalesce(t.debit,0)  - coalesce(t.credit,0))::numeric(14,2)
      else
           (coalesce(t.credit,0) - coalesce(t.debit,0))::numeric(14,2)
    end                                                       as balance
  from public.financial_accounts fa
  left join (
    select jl.financial_account_id,
           sum(jl.debit)  as debit,
           sum(jl.credit) as credit
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.status in ('confirmed', 'reversed')
      and (p_as_of is null or je.occurred_at <= p_as_of)
    group by jl.financial_account_id
  ) t on t.financial_account_id = fa.id
  where fa.is_active
  order by fa.code;
$$;

revoke all on function public.get_account_balances(timestamptz) from public, anon, authenticated;
grant execute on function public.get_account_balances(timestamptz) to service_role;

commit;
