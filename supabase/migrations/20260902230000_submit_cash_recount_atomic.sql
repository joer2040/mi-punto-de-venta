-- Sprint 2B M4: submit_cash_recount_atomic
-- Segundo conteo de caja: recalcula expected, cierra con 'closed' o
-- 'closed_with_pending_difference'. DELETE+INSERT snapshot en una transacción.
-- Requiere p_session_id explícito.
-- Idempotente: sesión ya cerrada con mismo segundo conteo → retorna estado final.

begin;

create or replace function public.submit_cash_recount_atomic(
  p_session_id          uuid,
  p_second_counted_cash numeric(14,2),
  p_counted_by          uuid
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_session           public.cash_sessions%rowtype;
  v_result_session    public.cash_sessions%rowtype;
  v_active_count      integer;
  v_sales_cash_total  numeric(14,2);
  v_profit_total      numeric(14,2);
  v_expected          numeric(14,2);
  v_difference        numeric(14,2);
  v_closing_status    text;
  v_closed_at         timestamptz;
begin
  if p_session_id is null then
    raise exception 'Falta session_id.' using errcode = 'P0001';
  end if;
  if p_second_counted_cash is null or p_second_counted_cash < 0 then
    raise exception 'El segundo conteo no puede ser negativo.' using errcode = 'P0001';
  end if;
  if p_counted_by is null then
    raise exception 'Falta counted_by.' using errcode = 'P0001';
  end if;

  -- Advisory lock compartido
  perform pg_advisory_xact_lock(hashtextextended('public.cash_session_atomic', 0));

  -- Bloquear ESA sesión específica
  select *
    into v_session
  from public.cash_sessions
  where id = p_session_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Sesión de caja no encontrada.'
    );
  end if;

  -- Idempotencia: sesión ya cerrada con mismo segundo conteo → retornar estado final
  if v_session.status in ('closed', 'closed_with_pending_difference')
     and v_session.final_counted_cash = p_second_counted_cash then
    return jsonb_build_object(
      'ok', true,
      'close_result', v_session.status,
      'session', to_jsonb(v_session)
    );
  end if;

  -- Conflicto: sesión ya cerrada con monto diferente
  if v_session.status in ('closed', 'closed_with_pending_difference')
     and v_session.final_counted_cash is distinct from p_second_counted_cash then
    return jsonb_build_object(
      'ok', false,
      'error', 'Conflicto: la sesión ya fue cerrada con segundo conteo diferente.'
    );
  end if;

  -- Sesión debe estar 'open'
  if v_session.status != 'open' then
    return jsonb_build_object(
      'ok', false,
      'error', 'La sesión no está abierta.'
    );
  end if;

  -- Primer conteo obligatorio
  if v_session.first_counted_cash is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'No hay un primer conteo registrado. Usa record_first_cash_count_atomic primero.'
    );
  end if;

  -- Verificar ventas activas
  v_active_count := public.active_pos_operation_count();
  if v_active_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'No puedes cerrar la caja mientras haya mesas, barras o pedidos activos.',
      'active_sales_count', v_active_count
    );
  end if;

  -- Recalcular expected al momento del segundo conteo
  select coalesce(sum(total_amount), 0)::numeric(14,2)
    into v_sales_cash_total
  from public.sales
  where cash_session_id = p_session_id
    and lower(trim(coalesce(payment_method, ''))) = 'efectivo';

  -- Calcular utilidad
  select coalesce(sum(
      sale_item.quantity * (sale_item.unit_price - coalesce(inventory.costo_promedio, 0))
    ), 0)::numeric(14,2)
    into v_profit_total
  from public.sales sale
  join public.sale_items sale_item on sale_item.sale_id = sale.id
  left join public.inventory inventory
    on inventory.material_id = sale_item.material_id
   and inventory.center_id = sale.center_id
  where sale.cash_session_id = p_session_id
    and lower(trim(coalesce(sale.payment_method, ''))) = 'efectivo';

  v_expected       := v_session.opening_amount + v_sales_cash_total;
  v_difference     := round(p_second_counted_cash - v_expected, 2);
  v_closing_status := case when v_difference = 0 then 'closed' else 'closed_with_pending_difference' end;
  v_closed_at      := now();

  -- Snapshot closing: DELETE idempotente + INSERT en misma transacción
  delete from public.cash_session_inventory_snapshots
  where cash_session_id = p_session_id
    and snapshot_type = 'closing';

  insert into public.cash_session_inventory_snapshots (
    cash_session_id, snapshot_type, material_id, material_name, quantity, average_cost
  )
  select
    p_session_id, 'closing',
    inventory.material_id, material.name,
    inventory.stock_actual, inventory.costo_promedio
  from public.inventory inventory
  join public.materials material on material.id = inventory.material_id
  left join public.categories category on category.id = material.cat_id
  where coalesce(nullif(trim(material.name), ''), null) is not null
    and coalesce(category.is_inventoried, true) = true
  order by lower(material.name), inventory.material_id;

  -- Cierre atómico: snapshot + status en misma transacción
  update public.cash_sessions
  set
    status              = v_closing_status,
    closed_at           = v_closed_at,
    closed_by           = p_counted_by,
    final_counted_cash  = p_second_counted_cash,
    sales_cash_total    = v_sales_cash_total,
    expected_cash_total = v_expected,
    closing_amount      = p_second_counted_cash,
    profit_total        = v_profit_total,
    difference_amount   = v_difference,
    report_pdf_metadata = jsonb_build_object(
      'generated_at',       v_closed_at,
      'suggested_file_name',
        'corte-caja-' ||
        to_char(v_session.opened_at at time zone 'America/Mexico_City', 'YYYYMMDD-HH24MI') ||
        '-' || left(v_session.id::text, 8) || '.pdf'
    )
  where id = p_session_id
    and status = 'open'
    and first_counted_cash is not null   -- guard: segundo conteo requiere primer conteo
  returning * into v_result_session;

  if not found then
    raise exception 'La caja cambió de estado antes de completar el cierre.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'close_result', v_closing_status,
    'difference', v_difference,
    'expected_cash', v_expected,
    'second_counted_cash', p_second_counted_cash,
    'session', to_jsonb(v_result_session)
  );
end;
$$;

comment on function public.submit_cash_recount_atomic(uuid, numeric, uuid) is
  'Segundo conteo de caja. Cierra con closed o closed_with_pending_difference. Idempotente por session_id.';
revoke all on function public.submit_cash_recount_atomic(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.submit_cash_recount_atomic(uuid, numeric, uuid) to service_role;

commit;
