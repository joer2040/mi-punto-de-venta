-- MIGRATION: Track close_cash_session_atomic
-- Purpose : Version-control a function that exists in PRD but was never
--           tracked in the migrations repo.
-- Context : Detected during preventive audit 2026-09-02.
--           The function was created directly in PRD (dashboard/ad-hoc)
--           and is NOT called by the current cash-operations Edge Function,
--           which handles close via multi-step direct DML with two-phase
--           counting support (first_count + submit_recount).
-- Status  : Idempotent CREATE OR REPLACE — safe to apply to any environment
--           that already has the function (PRD) or doesn't (DEV/staging).
-- WARNING : This RPC does NOT support the current two-phase close flow
--           (first_counted_cash / final_counted_cash fields).
--           Do NOT call this RPC from cash-operations without extending it
--           to support the two-phase close business rule.

begin;

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
$function$;

comment on function public.close_cash_session_atomic(uuid) is
  'Cierra la caja abierta atomicamente con snapshot de inventario y calculo de totales. '
  'NOTA: No soporta el flujo de dos conteos (first_counted_cash/final_counted_cash). '
  'La EF cash-operations usa DML directo con soporte de dos conteos; este RPC es un '
  'artefacto historico versionado por auditoria preventiva 2026-09-02.';

revoke all on function public.close_cash_session_atomic(uuid) from public, anon, authenticated;
grant execute on function public.close_cash_session_atomic(uuid) to service_role;

commit;
