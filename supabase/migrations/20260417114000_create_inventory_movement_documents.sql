begin;

create sequence if not exists public.inventory_movement_document_seq
  as bigint
  minvalue 1
  maxvalue 999999999
  start with 1
  increment by 1
  no cycle;

create or replace function public.next_inventory_movement_document_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  next_value := nextval('public.inventory_movement_document_seq');

  if next_value > 999999999 then
    raise exception 'Se alcanzo el maximo consecutivo para movimientos de materiales.';
  end if;

  return lpad(next_value::text, 9, '0');
end;
$$;

revoke all on function public.next_inventory_movement_document_number() from anon, authenticated;
grant execute on function public.next_inventory_movement_document_number() to service_role;

revoke all on sequence public.inventory_movement_document_seq from anon, authenticated;

commit;
