-- ============================================================================
-- HISTORICAL PRODUCTION INTERVENTION
-- Date: 2026-05-02
-- Environment: PRD
--
-- Context:
-- One-off recalculation of costo_promedio using the weighted average of
-- purchases from April 2026.
--
-- DO NOT RE-RUN against current production data.
-- Re-execution can overwrite current inventory costs using the historical
-- April 2026 calculation window.
--
-- Retained for audit/history only.
-- Not part of the migration or normal deployment pipeline.
-- ============================================================================

begin;

with purchase_avg as (
  select
    p.center_id,
    pi.material_id,
    round(
      (sum(pi.quantity * pi.unit_cost) / nullif(sum(pi.quantity), 0))::numeric,
      2
    ) as avg_cost
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  where p.created_at >= timestamptz '2026-04-01 00:00:00-06'
    and pi.material_id is not null
  group by p.center_id, pi.material_id
),
updated as (
  update public.inventory inv
  set costo_promedio = pa.avg_cost
  from purchase_avg pa
  where inv.center_id = pa.center_id
    and inv.material_id = pa.material_id
    and inv.stock_actual > 0
    and inv.costo_promedio is distinct from pa.avg_cost
  returning inv.center_id, inv.material_id, inv.stock_actual, inv.costo_promedio
)
select count(*) as updated_rows
from updated;

commit;
