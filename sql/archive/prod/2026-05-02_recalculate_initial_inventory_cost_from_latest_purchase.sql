-- ============================================================================
-- HISTORICAL PRODUCTION INTERVENTION
-- Date: 2026-05-02
-- Environment: PRD
--
-- Context:
-- One-off correction of costo_promedio for initial-stock materials,
-- replacing the prior cost with the latest recorded purchase price available
-- to the script at execution time.
--
-- DO NOT RE-RUN against current production data.
-- The result depends on current purchase history and is not stable over time.
--
-- Retained for audit/history only.
-- Not part of the migration or normal deployment pipeline.
-- ============================================================================

begin;

with initial_materials as (
  select distinct center_id, material_id
  from public.inventory_movements
  where movement_type = 'initial_stock'
),
latest_purchase as (
  select distinct on (p.center_id, pi.material_id)
    p.center_id,
    pi.material_id,
    pi.unit_cost as latest_unit_cost
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  where pi.material_id is not null
  order by p.center_id, pi.material_id, p.created_at desc, pi.created_at desc, pi.id desc
),
updated as (
  update public.inventory inv
  set costo_promedio = lp.latest_unit_cost
  from initial_materials im
  join latest_purchase lp
    on lp.center_id = im.center_id
   and lp.material_id = im.material_id
  where inv.center_id = im.center_id
    and inv.material_id = im.material_id
    and inv.costo_promedio is distinct from lp.latest_unit_cost
  returning inv.center_id, inv.material_id, inv.costo_promedio
)
select count(*) as updated_rows
from updated;

commit;
