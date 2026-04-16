-- Harden public/authenticated access without breaking the current app.
-- Strategy:
-- 1. Remove overly broad default privileges for future objects.
-- 2. Revoke direct client write access on current public tables.
-- 3. Enable RLS on operational tables that are currently missing it.
-- 4. Keep authenticated read access only where the current frontend still reads directly.
-- 5. Revoke execute on internal helper/trigger functions that clients should never call.

begin;

-- Future objects in public should not inherit open access for anon/authenticated.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on sequences from authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke all on functions from authenticated;

-- Remove broad access from current tables, then re-grant the minimum needed reads.
revoke all on table public.app_permissions from anon, authenticated;
revoke all on table public.app_profiles from anon, authenticated;
revoke all on table public.app_role_permissions from anon, authenticated;
revoke all on table public.app_roles from anon, authenticated;
revoke all on table public.app_user_roles from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.centers from anon, authenticated;
revoke all on table public.inventory from anon, authenticated;
revoke all on table public.inventory_adjustments from anon, authenticated;
revoke all on table public.inventory_movements from anon, authenticated;
revoke all on table public.materials from anon, authenticated;
revoke all on table public.organizations from anon, authenticated;
revoke all on table public.providers from anon, authenticated;
revoke all on table public.purchase_items from anon, authenticated;
revoke all on table public.purchases from anon, authenticated;
revoke all on table public.sale_items from anon, authenticated;
revoke all on table public.sales from anon, authenticated;
revoke all on table public.suppliers from anon, authenticated;
revoke all on table public.table_orders from anon, authenticated;
revoke all on table public.tables from anon, authenticated;
revoke all on table public.uoms from anon, authenticated;

grant select on table public.app_permissions to authenticated;
grant select on table public.app_profiles to authenticated;
grant select on table public.app_role_permissions to authenticated;
grant select on table public.app_roles to authenticated;
grant select on table public.app_user_roles to authenticated;
grant select on table public.categories to authenticated;
grant select on table public.centers to authenticated;
grant select on table public.inventory to authenticated;
grant select on table public.inventory_movements to authenticated;
grant select on table public.materials to authenticated;
grant select on table public.providers to authenticated;
grant select on table public.purchase_items to authenticated;
grant select on table public.purchases to authenticated;
grant select on table public.sale_items to authenticated;
grant select on table public.sales to authenticated;
grant select on table public.table_orders to authenticated;
grant select on table public.tables to authenticated;
grant select on table public.uoms to authenticated;

-- No direct client writes should remain on public sequences either.
revoke all on all sequences in schema public from anon, authenticated;

-- Functions that are only internal or sensitive should not be executable by anon/authenticated.
revoke all on function public.assert_valid_username(text) from anon, authenticated;
revoke all on function public.bootstrap_superadmin(uuid, text, text) from anon, authenticated;
revoke all on function public.handle_new_material() from anon, authenticated;
revoke all on function public.normalize_username(text) from anon, authenticated;
revoke all on function public.update_inventory_on_purchase() from anon, authenticated;
revoke all on function public.update_inventory_on_sale() from anon, authenticated;
revoke all on function public.username_to_auth_email(text) from anon, authenticated;

-- Policy helpers remain available to authenticated because existing RLS policies depend on them.
revoke all on function public.current_app_is_manager() from anon;
revoke all on function public.current_app_is_superadmin() from anon;
grant execute on function public.current_app_is_manager() to authenticated;
grant execute on function public.current_app_is_superadmin() to authenticated;

-- Turn on RLS for the operational tables that were previously exposed by grants alone.
alter table public.audit_log enable row level security;
alter table public.categories enable row level security;
alter table public.centers enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.materials enable row level security;
alter table public.organizations enable row level security;
alter table public.providers enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchases enable row level security;
alter table public.sale_items enable row level security;
alter table public.sales enable row level security;
alter table public.suppliers enable row level security;
alter table public.table_orders enable row level security;
alter table public.tables enable row level security;
alter table public.uoms enable row level security;

-- Preserve current app behavior: authenticated users can still read the tables the frontend uses directly.
drop policy if exists categories_authenticated_select on public.categories;
create policy categories_authenticated_select
on public.categories
for select
to authenticated
using (true);

drop policy if exists centers_authenticated_select on public.centers;
create policy centers_authenticated_select
on public.centers
for select
to authenticated
using (true);

drop policy if exists inventory_authenticated_select on public.inventory;
create policy inventory_authenticated_select
on public.inventory
for select
to authenticated
using (true);

drop policy if exists inventory_movements_authenticated_select on public.inventory_movements;
create policy inventory_movements_authenticated_select
on public.inventory_movements
for select
to authenticated
using (true);

drop policy if exists materials_authenticated_select on public.materials;
create policy materials_authenticated_select
on public.materials
for select
to authenticated
using (true);

drop policy if exists providers_authenticated_select on public.providers;
create policy providers_authenticated_select
on public.providers
for select
to authenticated
using (true);

drop policy if exists purchase_items_authenticated_select on public.purchase_items;
create policy purchase_items_authenticated_select
on public.purchase_items
for select
to authenticated
using (true);

drop policy if exists purchases_authenticated_select on public.purchases;
create policy purchases_authenticated_select
on public.purchases
for select
to authenticated
using (true);

drop policy if exists sale_items_authenticated_select on public.sale_items;
create policy sale_items_authenticated_select
on public.sale_items
for select
to authenticated
using (true);

drop policy if exists sales_authenticated_select on public.sales;
create policy sales_authenticated_select
on public.sales
for select
to authenticated
using (true);

drop policy if exists table_orders_authenticated_select on public.table_orders;
create policy table_orders_authenticated_select
on public.table_orders
for select
to authenticated
using (true);

drop policy if exists tables_authenticated_select on public.tables;
create policy tables_authenticated_select
on public.tables
for select
to authenticated
using (true);

drop policy if exists uoms_authenticated_select on public.uoms;
create policy uoms_authenticated_select
on public.uoms
for select
to authenticated
using (true);

commit;
