alter table public.purchase_items
  add column if not exists item_description text not null default '';

insert into public.providers (name, rfc, phone, email, address)
select 'Proveedor General', 'XAXX010101000', null, null, null
where not exists (
  select 1
  from public.providers
  where lower(name) = lower('Proveedor General')
);
