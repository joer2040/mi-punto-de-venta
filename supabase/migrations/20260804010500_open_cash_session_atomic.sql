begin;
create or replace function public.open_cash_session_atomic(
  p_opening_amount numeric,
  p_opened_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_existing_session_id uuid;
  v_active_operation_count integer;
  v_opened_session public.cash_sessions%rowtype;
begin
  if p_opening_amount is null or p_opening_amount <= 0 then
    raise exception 'Debes ingresar un monto inicial mayor a 0.'
      using errcode = 'P0001';
  end if;

  if p_opened_by is null then
    raise exception 'Falta opened_by para abrir la caja.'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('public.open_cash_session_atomic', 0));

  select cash_session.id
    into v_existing_session_id
  from public.cash_sessions cash_session
  where cash_session.status = 'open'
  order by cash_session.opened_at desc
  limit 1
  for update;

  if v_existing_session_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya existe una caja abierta. Debes cerrarla antes de abrir una nueva.',
      'active_sales_count', 0
    );
  end if;

  v_active_operation_count := public.active_pos_operation_count();
  if v_active_operation_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'No puedes abrir la caja mientras haya mesas, barras o pedidos activos.',
      'active_sales_count', v_active_operation_count
    );
  end if;

  insert into public.cash_sessions (
    status,
    opening_amount,
    sales_cash_total,
    expected_cash_total,
    closing_amount,
    profit_total,
    opened_by
  )
  values (
    'open',
    p_opening_amount,
    0,
    p_opening_amount,
    p_opening_amount,
    0,
    p_opened_by
  )
  returning * into v_opened_session;

  insert into public.cash_session_inventory_snapshots (
    cash_session_id,
    snapshot_type,
    material_id,
    material_name,
    quantity,
    average_cost
  )
  select
    v_opened_session.id,
    'opening',
    inventory.material_id,
    material.name,
    inventory.stock_actual,
    inventory.costo_promedio
  from public.inventory inventory
  join public.materials material
    on material.id = inventory.material_id
  left join public.categories category
    on category.id = material.cat_id
  where coalesce(material.name, '') <> ''
    and coalesce(category.is_inventoried, true) = true
  order by lower(material.name), inventory.material_id;

  return jsonb_build_object(
    'ok', true,
    'session', to_jsonb(v_opened_session),
    'active_sales_count', 0
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya existe una caja abierta. Debes cerrarla antes de abrir una nueva.',
      'active_sales_count', 0
    );
end;
$$;
comment on function public.open_cash_session_atomic(numeric, uuid) is
  'Abre una unica caja y captura su inventario inicial dentro de la misma transaccion.';
revoke all on function public.open_cash_session_atomic(numeric, uuid) from public, anon, authenticated;
grant execute on function public.open_cash_session_atomic(numeric, uuid) to service_role;
commit;
