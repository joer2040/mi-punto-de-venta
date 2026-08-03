begin;

create or replace function public.active_pos_operation_count()
returns integer
language sql
stable
security definer
set search_path to public
as $$
  with active_stations as (
    select 'station:' || station.id::text as operation_key
    from public.tables station
    where lower(trim(coalesce(station.status, ''))) = 'ocupada'
       or station.current_order_id is not null
  ),
  orphan_orders as (
    select 'order:' || active_order.id::text as operation_key
    from public.table_orders active_order
    where not exists (
      select 1
      from public.tables station
      where station.current_order_id = active_order.id
    )
  )
  select count(*)::integer
  from (
    select operation_key from active_stations
    union all
    select operation_key from orphan_orders
  ) active_operations;
$$;

revoke all on function public.active_pos_operation_count() from public, anon, authenticated;
grant execute on function public.active_pos_operation_count() to service_role;

create or replace function public.require_open_cash_session_for_pos_operation()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_cash_session_id uuid;
begin
  select cash_session.id
    into v_cash_session_id
  from public.cash_sessions cash_session
  where cash_session.status = 'open'
  order by cash_session.opened_at desc
  limit 1
  for update;

  if v_cash_session_id is null then
    raise exception 'No hay una caja abierta. Debes abrir caja antes de abrir mesas, barras o modificar pedidos.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.require_open_cash_session_for_pos_operation() from public, anon, authenticated;

drop trigger if exists table_orders_require_open_cash_session on public.table_orders;
create trigger table_orders_require_open_cash_session
before insert or update on public.table_orders
for each row
execute function public.require_open_cash_session_for_pos_operation();

drop trigger if exists tables_insert_require_open_cash_session on public.tables;
create trigger tables_insert_require_open_cash_session
before insert on public.tables
for each row
when (
  lower(trim(coalesce(new.status, ''))) = 'ocupada'
  or new.current_order_id is not null
)
execute function public.require_open_cash_session_for_pos_operation();

drop trigger if exists tables_activate_require_open_cash_session on public.tables;
create trigger tables_activate_require_open_cash_session
before update of status, current_order_id on public.tables
for each row
when (
  (
    lower(trim(coalesce(new.status, ''))) = 'ocupada'
    or new.current_order_id is not null
  )
  and (
    old.status is distinct from new.status
    or old.current_order_id is distinct from new.current_order_id
  )
)
execute function public.require_open_cash_session_for_pos_operation();

create or replace function public.prevent_cash_close_with_active_pos_operations()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_active_operation_count integer;
begin
  if old.status = 'open' and new.status = 'closed' then
    v_active_operation_count := public.active_pos_operation_count();

    if v_active_operation_count > 0 then
      raise exception 'No puedes cerrar la caja mientras haya mesas, barras o pedidos activos.'
        using
          errcode = 'P0001',
          detail = format('active_sales_count=%s', v_active_operation_count);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_cash_close_with_active_pos_operations() from public, anon, authenticated;

drop trigger if exists cash_sessions_prevent_close_with_active_pos_operations on public.cash_sessions;
create trigger cash_sessions_prevent_close_with_active_pos_operations
before update of status on public.cash_sessions
for each row
when (old.status = 'open' and new.status = 'closed')
execute function public.prevent_cash_close_with_active_pos_operations();

create or replace function public.close_cash_session_atomic(
  p_closed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_open_session public.cash_sessions%rowtype;
  v_closed_session public.cash_sessions%rowtype;
  v_active_operation_count integer;
  v_sales_cash_total numeric(12,2);
  v_profit_total numeric(12,2);
  v_closing_amount numeric(12,2);
  v_closed_at timestamptz;
  v_report_pdf_metadata jsonb;
begin
  if p_closed_by is null then
    raise exception 'Falta closed_by para cerrar la caja.' using errcode = 'P0001';
  end if;

  select cash_session.*
    into v_open_session
  from public.cash_sessions cash_session
  where cash_session.status = 'open'
  order by cash_session.opened_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'No existe una caja abierta para cerrar.',
      'active_sales_count', 0
    );
  end if;

  v_active_operation_count := public.active_pos_operation_count();
  if v_active_operation_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'No puedes cerrar la caja mientras haya ventas activas. Finaliza o cancela todos los pedidos antes de cerrar la caja.',
      'active_sales_count', v_active_operation_count
    );
  end if;

  delete from public.cash_session_inventory_snapshots snapshot
  where snapshot.cash_session_id = v_open_session.id
    and snapshot.snapshot_type = 'closing';

  insert into public.cash_session_inventory_snapshots (
    cash_session_id,
    snapshot_type,
    material_id,
    material_name,
    quantity,
    average_cost
  )
  select
    v_open_session.id,
    'closing',
    inventory.material_id,
    material.name,
    inventory.stock_actual,
    inventory.costo_promedio
  from public.inventory inventory
  join public.materials material
    on material.id = inventory.material_id
  left join public.categories category
    on category.id = material.cat_id
  where nullif(trim(material.name), '') is not null
    and coalesce(category.is_inventoried, true) = true
  order by lower(material.name), inventory.material_id;

  select coalesce(sum(sale.total_amount), 0)::numeric(12,2)
    into v_sales_cash_total
  from public.sales sale
  where sale.cash_session_id = v_open_session.id
    and lower(trim(coalesce(sale.payment_method, ''))) = lower('Efectivo');

  select coalesce(
    sum(
      sale_item.quantity *
      (sale_item.unit_price - coalesce(inventory.costo_promedio, 0))
    ),
    0
  )::numeric(12,2)
    into v_profit_total
  from public.sales sale
  join public.sale_items sale_item
    on sale_item.sale_id = sale.id
  left join public.inventory inventory
    on inventory.material_id = sale_item.material_id
   and inventory.center_id = sale.center_id
  where sale.cash_session_id = v_open_session.id
    and lower(trim(coalesce(sale.payment_method, ''))) = lower('Efectivo');

  v_closed_at := now();
  v_closing_amount := v_open_session.opening_amount + v_sales_cash_total;
  v_report_pdf_metadata := jsonb_build_object(
    'generated_at', v_closed_at,
    'suggested_file_name',
      'corte-caja-' ||
      to_char(v_open_session.opened_at at time zone 'America/Mexico_City', 'YYYYMMDD-HH24MI') ||
      '-' || left(v_open_session.id::text, 8) || '.pdf'
  );

  update public.cash_sessions cash_session
  set status = 'closed',
      closed_at = v_closed_at,
      closed_by = p_closed_by,
      sales_cash_total = v_sales_cash_total,
      expected_cash_total = v_closing_amount,
      closing_amount = v_closing_amount,
      profit_total = v_profit_total,
      report_pdf_metadata = v_report_pdf_metadata
  where cash_session.id = v_open_session.id
    and cash_session.status = 'open'
  returning cash_session.* into v_closed_session;

  if not found then
    raise exception 'La caja cambio de estado antes de completar el cierre.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'session', to_jsonb(v_closed_session),
    'active_sales_count', 0
  );
end;
$$;

revoke all on function public.close_cash_session_atomic(uuid) from public, anon, authenticated;
grant execute on function public.close_cash_session_atomic(uuid) to service_role;

commit;
