-- PROFIT-02: gross profit of all sales linked to the session.
-- Current inventory average cost is intentional; no historical backfill.
create or replace function public.get_cash_session_profit(p_session_id uuid)
returns numeric
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(
    si.quantity * (si.unit_price - coalesce(i.costo_promedio, 0))
  ), 0)::numeric(14,2)
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  left join public.inventory i
    on i.material_id = si.material_id and i.center_id = s.center_id
  where s.cash_session_id = p_session_id;
$function$;

revoke all on function public.get_cash_session_profit(uuid) from public, anon, authenticated;
grant execute on function public.get_cash_session_profit(uuid) to service_role;

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
  v_exp               record;
  v_breakdown         jsonb;
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

  -- Efectivo esperado: UNA evaluación del helper; todo el snapshot sale de aquí
  select * into v_exp from public.get_cash_session_expected(p_session_id);
  if not found or v_exp.is_frozen then
    raise exception 'La caja cambió de estado antes de calcular el efectivo esperado.' using errcode = 'P0001';
  end if;

  v_sales_cash_total := v_exp.sales_cash;
  v_expected         := v_exp.expected_cash_total;
  v_difference       := round(p_counted_cash - v_expected, 2);
  v_breakdown        := jsonb_build_object(
    'opening_amount',      v_exp.opening_amount,
    'sales_cash',          v_exp.sales_cash,
    'purchases_cash',      v_exp.purchases_cash,
    'transfers_net',       v_exp.transfers_net,
    'contributions',       v_exp.contributions,
    'other_net',           v_exp.other_net,
    'net_movement',        v_exp.net_movement,
    'expected_cash_total', v_exp.expected_cash_total
  );

  -- ── Sin diferencia: cierre completo atómico ─────────────────────────────
  if v_difference = 0 then
    v_closed_at := now();

    -- Calcular utilidad
    v_profit_total := public.get_cash_session_profit(p_session_id);

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

    -- Cierre atómico con snapshot (metadata: merge, se preservan keys existentes)
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
      report_pdf_metadata = coalesce(report_pdf_metadata, '{}'::jsonb) || jsonb_build_object(
        'generated_at',       v_closed_at,
        'suggested_file_name',
          'corte-caja-' ||
          to_char(v_session.opened_at at time zone 'America/Mexico_City', 'YYYYMMDD-HH24MI') ||
          '-' || left(v_session.id::text, 8) || '.pdf',
        'cash_expected_breakdown', v_breakdown
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
    sales_cash_total    = v_sales_cash_total,
    report_pdf_metadata = coalesce(report_pdf_metadata, '{}'::jsonb)
                          || jsonb_build_object('cash_expected_breakdown', v_breakdown)
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

  -- Calcular utilidad
  v_profit_total := public.get_cash_session_profit(p_session_id);

  -- Expected congelado en el primer conteo (movimientos 1101 bloqueados desde entonces)
  v_expected       := v_session.expected_cash_total;
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

  -- Cierre atómico: expected/sales_cash_total/breakdown congelados no se tocan
  update public.cash_sessions
  set
    status              = v_closing_status,
    closed_at           = v_closed_at,
    closed_by           = p_counted_by,
    final_counted_cash  = p_second_counted_cash,
    closing_amount      = p_second_counted_cash,
    profit_total        = v_profit_total,
    difference_amount   = v_difference,
    report_pdf_metadata = coalesce(report_pdf_metadata, '{}'::jsonb) || jsonb_build_object(
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

create or replace function public.close_cash_session_atomic(p_closed_by uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_open_session public.cash_sessions%rowtype;
  v_closed_session public.cash_sessions%rowtype;
  v_active_operation_count integer;
  v_exp record;
  v_profit_total numeric(12,2);
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

  -- Efectivo esperado: helper autoritativo (una evaluación)
  select * into v_exp from public.get_cash_session_expected(v_open_session.id);

  v_profit_total := public.get_cash_session_profit(v_open_session.id);

  v_closed_at := now();
  v_report_pdf_metadata := jsonb_build_object(
    'generated_at', v_closed_at,
    'suggested_file_name',
      'corte-caja-' ||
      to_char(v_open_session.opened_at at time zone 'America/Mexico_City', 'YYYYMMDD-HH24MI') ||
      '-' || left(v_open_session.id::text, 8) || '.pdf'
  );
  -- Breakdown solo si el cálculo fue vivo; una sesión ya contada conserva su snapshot
  if not v_exp.is_frozen then
    v_report_pdf_metadata := v_report_pdf_metadata || jsonb_build_object(
      'cash_expected_breakdown', jsonb_build_object(
        'opening_amount',      v_exp.opening_amount,
        'sales_cash',          v_exp.sales_cash,
        'purchases_cash',      v_exp.purchases_cash,
        'transfers_net',       v_exp.transfers_net,
        'contributions',       v_exp.contributions,
        'other_net',           v_exp.other_net,
        'net_movement',        v_exp.net_movement,
        'expected_cash_total', v_exp.expected_cash_total
      )
    );
  end if;

  update public.cash_sessions cash_session
  set status = 'closed',
      closed_at = v_closed_at,
      closed_by = p_closed_by,
      sales_cash_total = v_exp.sales_cash,
      expected_cash_total = v_exp.expected_cash_total,
      closing_amount = v_exp.expected_cash_total,
      profit_total = v_profit_total,
      report_pdf_metadata = coalesce(cash_session.report_pdf_metadata, '{}'::jsonb) || v_report_pdf_metadata
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
$function$;
