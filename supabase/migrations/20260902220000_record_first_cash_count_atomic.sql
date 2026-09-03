-- Sprint 2B M3: record_first_cash_count_atomic
-- Primer conteo de caja: registra counted_cash, cierra si diferencia=0,
-- o guarda primer conteo si diferencia!=0.
-- Requiere p_session_id explícito — nunca selecciona "la sesión más reciente".
-- Idempotente: mismo valor ya registrado → retorna estado actual sin escrituras.
-- T28: sesión ya cerrada con mismo primer conteo → idempotente.

begin;

create or replace function public.record_first_cash_count_atomic(
  p_session_id   uuid,
  p_counted_cash numeric(14,2),
  p_counted_by   uuid
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
  v_closed_at         timestamptz;
begin
  if p_session_id is null then
    raise exception 'Falta session_id.' using errcode = 'P0001';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'El efectivo contado no puede ser negativo.' using errcode = 'P0001';
  end if;
  if p_counted_by is null then
    raise exception 'Falta counted_by.' using errcode = 'P0001';
  end if;

  -- Advisory lock compartido: serializa todas las transiciones críticas de caja
  perform pg_advisory_xact_lock(hashtextextended('public.cash_session_atomic', 0));

  -- Bloquear ESA sesión específica (nunca selecciona por status)
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

  -- T28: sesión ya cerrada sin diferencia, mismo primer conteo → idempotente
  if v_session.status = 'closed'
     and v_session.first_counted_cash = p_counted_cash
     and v_session.final_counted_cash is null then
    return jsonb_build_object(
      'ok', true,
      'close_result', 'closed',
      'session', to_jsonb(v_session)
    );
  end if;

  -- Conflicto: sesión ya cerrada con monto diferente
  if v_session.status = 'closed'
     and v_session.first_counted_cash is distinct from p_counted_cash then
    return jsonb_build_object(
      'ok', false,
      'error', 'Conflicto: la sesión ya fue cerrada con monto diferente.'
    );
  end if;

  -- Sesión en estado inesperado (closed_with_pending_difference, etc.)
  if v_session.status != 'open' then
    return jsonb_build_object(
      'ok', false,
      'error', 'La sesión ya fue cerrada.'
    );
  end if;

  -- Idempotencia: primer conteo ya registrado con mismo valor (diff != 0, sesión 'open')
  if v_session.first_counted_cash is not null
     and v_session.first_counted_cash = p_counted_cash then
    return jsonb_build_object(
      'ok', true,
      'close_result', 'already_first_counted',
      'session', to_jsonb(v_session)
    );
  end if;

  -- Conflicto: primer conteo distinto ya registrado
  if v_session.first_counted_cash is not null
     and v_session.first_counted_cash != p_counted_cash then
    return jsonb_build_object(
      'ok', false,
      'error', 'Conflicto: ya existe primer conteo con monto diferente.'
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

  -- Calcular ventas en efectivo
  select coalesce(sum(total_amount), 0)::numeric(14,2)
    into v_sales_cash_total
  from public.sales
  where cash_session_id = p_session_id
    and lower(trim(coalesce(payment_method, ''))) = 'efectivo';

  v_expected   := v_session.opening_amount + v_sales_cash_total;
  v_difference := round(p_counted_cash - v_expected, 2);

  -- ── Sin diferencia: cierre completo atómico ─────────────────────────────
  if v_difference = 0 then
    v_closed_at := now();

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

    -- Cierre atómico con snapshot
    update public.cash_sessions
    set
      status              = 'closed',
      closed_at           = v_closed_at,
      closed_by           = p_counted_by,
      first_counted_cash  = p_counted_cash,
      sales_cash_total    = v_sales_cash_total,
      expected_cash_total = v_expected,
      closing_amount      = p_counted_cash,
      profit_total        = v_profit_total,
      difference_amount   = 0,
      report_pdf_metadata = jsonb_build_object(
        'generated_at',       v_closed_at,
        'suggested_file_name',
          'corte-caja-' ||
          to_char(v_session.opened_at at time zone 'America/Mexico_City', 'YYYYMMDD-HH24MI') ||
          '-' || left(v_session.id::text, 8) || '.pdf'
      )
    where id = p_session_id
      and status = 'open'
    returning * into v_result_session;

    if not found then
      raise exception 'La caja cambió de estado antes de completar el cierre.' using errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'ok', true,
      'close_result', 'closed',
      'session', to_jsonb(v_result_session)
    );
  end if;

  -- ── Con diferencia: guardar primer conteo, mantener 'open' ──────────────
  -- Almacenar expected_cash_total para idempotencia futura (T28 con diff!=0 path)
  update public.cash_sessions
  set
    first_counted_cash  = p_counted_cash,
    difference_amount   = v_difference,
    expected_cash_total = v_expected,
    sales_cash_total    = v_sales_cash_total
  where id = p_session_id
    and status = 'open'
    and first_counted_cash is null   -- guard DB contra doble primer conteo concurrente
  returning * into v_result_session;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Conflicto: ya existe primer conteo (concurrencia). Intenta de nuevo.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'close_result', 'difference_detected',
    'difference', v_difference,
    'expected_cash', v_expected,
    'counted_cash', p_counted_cash,
    'session', to_jsonb(v_result_session)
  );
end;
$$;

comment on function public.record_first_cash_count_atomic(uuid, numeric, uuid) is
  'Registra primer conteo de caja. Cierra atomicamente si diferencia=0. Idempotente por session_id.';
revoke all on function public.record_first_cash_count_atomic(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.record_first_cash_count_atomic(uuid, numeric, uuid) to service_role;

commit;
