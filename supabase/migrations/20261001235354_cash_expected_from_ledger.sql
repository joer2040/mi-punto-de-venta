-- CAJA-03B: efectivo esperado desde el ledger (Caja operativa 1101).
--
-- Fuente única: get_cash_session_expected(session).
--   expected_cash_total = opening_amount + Σ(debit − credit) de líneas 1101 en asientos
--   'confirmed' vinculados a la sesión vía financial_operations.cash_session_id.
--   Nunca se usa journal_entries.source_type/source_id para vincular (las reversas copian
--   el origen del asiento original).
--
-- Cambios:
-- 1. get_cash_session_expected (nuevo): cálculo vivo solo para sesión abierta sin primer
--    conteo; sesiones contadas o cerradas devuelven el snapshot almacenado (sin recálculo).
-- 2. record_first_cash_count_atomic: congela expected + breakdown desde UNA evaluación del
--    helper; breakdown en report_pdf_metadata.cash_expected_breakdown (merge JSONB).
-- 3. submit_cash_recount_atomic: usa el expected congelado; no recalcula.
-- 4. close_cash_session_atomic (legacy, sin llamadores): usa el helper; sin fórmula legacy.
-- 5. reverse_journal_entry: bloquea la sesión vinculada FOR SHARE antes de revisar el
--    conteo (serializa contra el FOR UPDATE del primer conteo) y rechaza revertir reversas.
--
-- Sin tablas ni columnas nuevas, sin DML de datos, sin backfill. Firmas sin cambio.

-- ─────────────────────────────────────────────────────────────────────────────
-- get_cash_session_expected
-- ─────────────────────────────────────────────────────────────────────────────
-- Semántica del breakdown (sesión viva):
--   sales_cash     = Σ neto 1101 de operaciones 'sale' (componente efectivo exacto)
--   purchases_cash = magnitud positiva del efectivo que salió por compras desde Caja operativa
--   transfers_net  = neto con signo (+ entra al cajón, − sale del cajón)
--   contributions  = Σ neto 1101 de 'owner_contribution'
--   other_net      = neto con signo de cualquier otro operation_type vinculado
--   net_movement   = Σ(debit − credit) total (sin allowlist)
-- Sesión congelada (contada o cerrada): valores almacenados; si no existe snapshot de
-- breakdown (sesiones históricas) purchases/transfers/contributions = NULL y
-- other_net = expected − opening − sales.
create or replace function public.get_cash_session_expected(p_cash_session_id uuid)
returns table (
  cash_session_id     uuid,
  opening_amount      numeric(14,2),
  sales_cash          numeric(14,2),
  purchases_cash      numeric(14,2),
  transfers_net       numeric(14,2),
  contributions       numeric(14,2),
  other_net           numeric(14,2),
  net_movement        numeric(14,2),
  expected_cash_total numeric(14,2),
  is_frozen           boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  with s as (
    select cs.*,
           (cs.status <> 'open' or cs.first_counted_cash is not null) as frozen,
           cs.report_pdf_metadata -> 'cash_expected_breakdown' as snap
    from public.cash_sessions cs
    where cs.id = p_cash_session_id
  ),
  live as (
    select fo.operation_type, (jl.debit - jl.credit) as net
    from s
    join public.financial_operations fo on fo.cash_session_id = s.id
    join public.journal_entries je      on je.id = fo.journal_entry_id and je.status = 'confirmed'
    join public.journal_lines jl        on jl.journal_entry_id = je.id
    join public.financial_accounts fa   on fa.id = jl.financial_account_id and fa.code = '1101'
    where not s.frozen
  ),
  agg as (
    select
      coalesce(sum(net) filter (where operation_type = 'sale'), 0)                 as sales,
      coalesce(-sum(net) filter (where operation_type = 'purchase'), 0)            as purchases,
      coalesce(sum(net) filter (where operation_type = 'transfer'), 0)             as transfers,
      coalesce(sum(net) filter (where operation_type = 'owner_contribution'), 0)   as contributions,
      coalesce(sum(net) filter (where operation_type not in
        ('sale', 'purchase', 'transfer', 'owner_contribution')), 0)                as other,
      coalesce(sum(net), 0)                                                        as total
    from live
  )
  select
    s.id,
    s.opening_amount::numeric(14,2),
    case
      when not s.frozen      then agg.sales
      when s.snap is not null then (s.snap ->> 'sales_cash')::numeric
      else s.sales_cash_total
    end::numeric(14,2),
    case
      when not s.frozen      then agg.purchases
      when s.snap is not null then (s.snap ->> 'purchases_cash')::numeric
    end::numeric(14,2),
    case
      when not s.frozen      then agg.transfers
      when s.snap is not null then (s.snap ->> 'transfers_net')::numeric
    end::numeric(14,2),
    case
      when not s.frozen      then agg.contributions
      when s.snap is not null then (s.snap ->> 'contributions')::numeric
    end::numeric(14,2),
    case
      when not s.frozen      then agg.other
      when s.snap is not null then (s.snap ->> 'other_net')::numeric
      else s.expected_cash_total - s.opening_amount - s.sales_cash_total
    end::numeric(14,2),
    case
      when not s.frozen      then agg.total
      when s.snap is not null then (s.snap ->> 'net_movement')::numeric
      else s.expected_cash_total - s.opening_amount
    end::numeric(14,2),
    case
      when not s.frozen then s.opening_amount + agg.total
      else s.expected_cash_total
    end::numeric(14,2),
    s.frozen
  from s cross join agg;
$function$;

comment on function public.get_cash_session_expected(uuid) is
  'CAJA-03B: efectivo esperado de Caja operativa (1101) desde el ledger. Vivo solo para sesión abierta sin primer conteo; snapshot almacenado en otro caso.';

-- ─────────────────────────────────────────────────────────────────────────────
-- record_first_cash_count_atomic — freeze desde una sola evaluación del helper
-- ─────────────────────────────────────────────────────────────────────────────
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

comment on function public.record_first_cash_count_atomic(uuid, numeric, uuid) is
  'Registra primer conteo de caja. Congela expected (ledger 1101) y breakdown. Cierra atomicamente si diferencia=0. Idempotente por session_id.';

-- ─────────────────────────────────────────────────────────────────────────────
-- submit_cash_recount_atomic — usa el expected congelado en el primer conteo
-- ─────────────────────────────────────────────────────────────────────────────
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

comment on function public.submit_cash_recount_atomic(uuid, numeric, uuid) is
  'Segundo conteo de caja contra el expected congelado en el primer conteo. Cierra con closed o closed_with_pending_difference. Idempotente por session_id.';

-- ─────────────────────────────────────────────────────────────────────────────
-- close_cash_session_atomic (legacy, sin llamadores) — sin fórmula legacy
-- ─────────────────────────────────────────────────────────────────────────────
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

comment on function public.close_cash_session_atomic(uuid) is
  'Legacy (sin llamadores). Cierra la caja abierta con snapshot de inventario; efectivo esperado desde get_cash_session_expected. '
  'No soporta el flujo de dos conteos. Retiro pendiente en limpieza separada.';

-- ─────────────────────────────────────────────────────────────────────────────
-- reverse_journal_entry — lock de sesión antes de revisar conteo; sin reversa de reversa
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reverse_journal_entry(p_journal_entry_id uuid, p_authorized_by uuid, p_justification text, p_performed_by uuid, p_idempotency_key text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_original         public.journal_entries%rowtype;
  v_reversal_id      uuid;
  v_auth_id          uuid;
  v_entry_number     text;
  v_idem_hash        text;
  v_idem_row         public.idempotency_requests%rowtype;
  v_result           jsonb;
  v_session_status   text;
  v_session_counted  numeric(14,2);
begin

  if p_performed_by is null then raise exception 'Falta performed_by.'; end if;
  if p_authorized_by is null then raise exception 'La reversa requiere autorización.'; end if;
  if p_performed_by = p_authorized_by then
    raise exception 'La reversa debe ser autorizada por un usuario distinto al solicitante.';
  end if;
  if p_journal_entry_id is null then raise exception 'Falta journal_entry_id.'; end if;

  -- Leer asiento original
  select * into v_original
  from public.journal_entries
  where id = p_journal_entry_id
  for share;

  if not found then
    raise exception 'Asiento no encontrado.';
  end if;
  if v_original.status <> 'confirmed' then
    raise exception 'Solo se pueden revertir asientos confirmados (status=confirmed). Este tiene status=%.', v_original.status;
  end if;
  if v_original.entry_type = 'reversal' then
    raise exception 'No se puede revertir un asiento de reversa.' using errcode = 'P0001';
  end if;
  if v_original.created_by = p_authorized_by then
    raise exception 'El autorizador no puede ser el mismo usuario que creó el asiento original.';
  end if;

  -- Guard: si el asiento toca 1101 y pertenece a una caja, bloquear esa sesión FOR SHARE
  -- SIN filtrar por conteo; el lock espera al FOR UPDATE del primer conteo y la fila se
  -- re-evalúa, así que first_counted_cash leído aquí es el vigente.
  select cs.status, cs.first_counted_cash
    into v_session_status, v_session_counted
  from public.financial_operations fo
  join public.cash_sessions cs on cs.id = fo.cash_session_id
  where fo.journal_entry_id = p_journal_entry_id
    and exists (
      select 1
      from public.journal_lines jl
      join public.financial_accounts a on a.id = jl.financial_account_id
      where jl.journal_entry_id = p_journal_entry_id
        and a.code = '1101'
    )
  for share of cs;

  if v_session_status = 'open' and v_session_counted is not null then
    raise exception 'La caja está en proceso de cierre y no permite movimientos de efectivo.'
      using errcode = 'P0001';
  end if;

  v_idem_hash := md5(jsonb_build_object(
    'entry_id', p_journal_entry_id, 'authorized_by', p_authorized_by,
    'justification', coalesce(p_justification,'')
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'reversal' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  -- Registro de autorización
  insert into public.financial_authorizations
    (request_type, entity_type, entity_id, requested_by, authorized_by, justification)
  values
    ('reversal', 'journal_entries', p_journal_entry_id, p_performed_by, p_authorized_by,
     coalesce(p_justification,'Reversa autorizada'))
  returning id into v_auth_id;

  v_entry_number := 'JE-REV-' || upper(substr(gen_random_uuid()::text, 1, 8));

  -- Asiento de reversa (espejo)
  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at, source_type, source_id,
     reversal_of_id, created_by, authorization_id, idempotency_key)
  values
    (v_entry_number, 'reversal', 'pending', now(),
     v_original.source_type, v_original.source_id,
     p_journal_entry_id, p_performed_by, v_auth_id, p_idempotency_key)
  returning id into v_reversal_id;

  -- Líneas espejo (débito ↔ crédito invertidos)
  insert into public.journal_lines
    (journal_entry_id, financial_account_id, debit, credit, description)
  select
    v_reversal_id,
    financial_account_id,
    credit,   -- invertir
    debit,    -- invertir
    'REVERSA: ' || coalesce(description, '')
  from public.journal_lines
  where journal_entry_id = p_journal_entry_id;

  -- Confirmar reversa (trigger valida balance)
  update public.journal_entries set status = 'confirmed' where id = v_reversal_id;

  -- Marcar original como revertido
  update public.journal_entries set status = 'reversed' where id = p_journal_entry_id;

  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'journal_entry_reversed', 'journal_entries', p_journal_entry_id,
    jsonb_build_object(
      'reversal_entry_id', v_reversal_id, 'authorized_by', p_authorized_by,
      'justification', p_justification, 'entry_number', v_entry_number
    ), 'success'
  );

  v_result := jsonb_build_object(
    'reversal_entry_id',    v_reversal_id,
    'original_entry_id',   p_journal_entry_id,
    'authorization_id',    v_auth_id,
    'entry_number',        v_entry_number
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('reversal', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos: solo service_role
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.get_cash_session_expected(uuid) from public, anon, authenticated;
grant execute on function public.get_cash_session_expected(uuid) to service_role;

revoke all on function public.record_first_cash_count_atomic(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.record_first_cash_count_atomic(uuid, numeric, uuid) to service_role;

revoke all on function public.submit_cash_recount_atomic(uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.submit_cash_recount_atomic(uuid, numeric, uuid) to service_role;

revoke all on function public.close_cash_session_atomic(uuid) from public, anon, authenticated;
grant execute on function public.close_cash_session_atomic(uuid) to service_role;

revoke all on function public.reverse_journal_entry(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_journal_entry(uuid, uuid, text, uuid, text) to service_role;
