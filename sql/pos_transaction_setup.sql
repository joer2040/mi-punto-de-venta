-- Historical/manual support script.
-- Source of truth now lives in supabase/migrations and supabase/functions.
-- Keep this file as reference or for controlled SQL Editor use only.
--
-- POS transaction hardening for mi-punto-de-venta
-- Run this script in the Supabase SQL editor.

alter table if exists public.table_orders
  add column if not exists waiter_edit_locked boolean not null default false;

comment on column public.table_orders.waiter_edit_locked is
  'Cuando es true, un mesero ya no puede disminuir cantidades ni remover productos de la mesa; solo agregar o aumentar.';

update public.table_orders orders
set waiter_edit_locked = true
from public.tables tables
where tables.current_order_id = orders.id
  and tables.status = 'ocupada'
  and coalesce(orders.waiter_edit_locked, false) = false;
