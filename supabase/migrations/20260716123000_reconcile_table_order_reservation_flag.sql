-- Reconciles environments where the original migration is registered but its
-- structural effect is missing. Existing incompatible definitions are never
-- changed automatically.

do $$
declare
  v_type_oid oid;
  v_not_null boolean;
  v_default_expression text;
  v_comment text;
begin
  select a.atttypid,
         a.attnotnull,
         pg_get_expr(d.adbin, d.adrelid),
         col_description(a.attrelid, a.attnum)
    into v_type_oid,
         v_not_null,
         v_default_expression,
         v_comment
  from pg_attribute a
  left join pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where a.attrelid = 'public.table_orders'::regclass
    and a.attname = 'reservation_applied'
    and a.attnum > 0
    and not a.attisdropped;

  if not found then
    alter table public.table_orders
      add column reservation_applied boolean not null default false;

    comment on column public.table_orders.reservation_applied is
      'Indica si los productos de la mesa ya descontaron temporalmente inventario como reserva operativa.';

    return;
  end if;

  if v_type_oid <> 'boolean'::regtype
     or v_not_null is not true
     or v_default_expression is distinct from 'false' then
    raise exception
      'public.table_orders.reservation_applied existe con una definicion incompatible (tipo %, not_null %, default %).',
      format_type(v_type_oid, null),
      v_not_null,
      coalesce(v_default_expression, '<null>');
  end if;

  if v_comment is distinct from
     'Indica si los productos de la mesa ya descontaron temporalmente inventario como reserva operativa.' then
    comment on column public.table_orders.reservation_applied is
      'Indica si los productos de la mesa ya descontaron temporalmente inventario como reserva operativa.';
  end if;
end
$$;
