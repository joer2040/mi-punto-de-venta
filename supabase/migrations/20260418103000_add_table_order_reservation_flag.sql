alter table public.table_orders
add column if not exists reservation_applied boolean not null default false;

comment on column public.table_orders.reservation_applied is
'Indica si los productos de la mesa ya descontaron temporalmente inventario como reserva operativa.';
