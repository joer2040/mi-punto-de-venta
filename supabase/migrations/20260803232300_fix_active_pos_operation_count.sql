begin;

create or replace function public.active_pos_operation_count()
returns integer
language sql
stable
security definer
set search_path to public
as $$
  select count(*)::integer
  from public.tables station
  where lower(trim(coalesce(station.status, ''))) = 'ocupada'
     or station.current_order_id is not null;
$$;

comment on function public.active_pos_operation_count() is
  'Cuenta exclusivamente mesas o barras activas. Los table_orders historicos sin current_order_id no representan ventas en proceso.';

revoke all on function public.active_pos_operation_count() from public, anon, authenticated;
grant execute on function public.active_pos_operation_count() to service_role;

commit;
