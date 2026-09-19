-- Migration: add_material_safe_delete
-- Adds is_active soft-delete flag to materials, extends audit_log constraint,
-- and creates the atomic delete_material_safely RPC.

-- 1. Soft-delete flag (all existing rows default to active)
ALTER TABLE public.materials
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- 2. Extend audit_log event_type CHECK — preserve all existing values
ALTER TABLE public.audit_log
  DROP CONSTRAINT audit_log_event_type_check;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'material_created'::text,
    'material_updated'::text,
    'material_deactivated'::text,
    'material_deleted'::text,
    'price_updated'::text,
    'provider_created'::text,
    'purchase_created'::text,
    'inventory_adjusted'::text,
    'user_created'::text,
    'user_updated'::text,
    'user_deactivated'::text,
    'user_deleted'::text,
    'role_created'::text,
    'role_updated'::text,
    'role_assigned'::text,
    'superadmin_bootstrap'::text
  ]));

-- 3. Atomic RPC: decides blocked / deactivated / deleted in a single transaction.
--    Called exclusively from erp-operations Edge Function via service_role client.
CREATE OR REPLACE FUNCTION public.delete_material_safely(
  p_material_id  uuid,
  p_performed_by text DEFAULT 'system'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_material    record;
  v_stock       numeric;
  v_has_history boolean;
  v_audit_old   jsonb;
BEGIN
  -- A. Load material + inventoriable flag from category
  SELECT
    m.id,
    m.sku,
    m.name,
    m.is_active,
    COALESCE(c.is_inventoried, true) AS is_inventoried
  INTO v_material
  FROM public.materials m
  LEFT JOIN public.categories c ON c.id = m.cat_id
  WHERE m.id = p_material_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  -- B. Stock sum across all centers
  SELECT COALESCE(SUM(stock_actual), 0)
  INTO v_stock
  FROM public.inventory
  WHERE material_id = p_material_id;

  IF v_material.is_inventoried AND v_stock > 0 THEN
    RETURN jsonb_build_object(
      'result', 'blocked',
      'reason', 'stock_available',
      'stock',  v_stock
    );
  END IF;

  -- C. History check — EXISTS only, no full scans
  SELECT (
    EXISTS (SELECT 1 FROM public.inventory_movements             WHERE material_id = p_material_id)
    OR EXISTS (SELECT 1 FROM public.inventory_adjustments        WHERE material_id = p_material_id)
    OR EXISTS (SELECT 1 FROM public.purchase_items               WHERE material_id = p_material_id)
    OR EXISTS (SELECT 1 FROM public.sale_items                   WHERE material_id = p_material_id)
    OR EXISTS (SELECT 1 FROM public.cash_session_inventory_snapshots WHERE material_id = p_material_id)
  ) INTO v_has_history;

  v_audit_old := jsonb_build_object(
    'id',        v_material.id,
    'name',      v_material.name,
    'sku',       v_material.sku,
    'is_active', v_material.is_active
  );

  -- D. Has history → soft delete (preserve referential integrity)
  IF v_has_history THEN
    UPDATE public.materials
    SET is_active = false
    WHERE id = p_material_id;

    INSERT INTO public.audit_log (
      entity_type, entity_id, event_type,
      old_values, new_values, notes, performed_by
    ) VALUES (
      'material', p_material_id, 'material_deactivated',
      v_audit_old,
      jsonb_build_object('is_active', false),
      'Material desactivado: tiene historial de operaciones',
      p_performed_by
    );

    RETURN jsonb_build_object('result', 'deactivated');
  END IF;

  -- E. No history → write audit first, then hard delete
  --    (inventory row is removed by existing ON DELETE CASCADE)
  INSERT INTO public.audit_log (
    entity_type, entity_id, event_type,
    old_values, new_values, notes, performed_by
  ) VALUES (
    'material', p_material_id, 'material_deleted',
    v_audit_old,
    jsonb_build_object('deleted', true),
    'Material eliminado permanentemente: sin historial de operaciones',
    p_performed_by
  );

  DELETE FROM public.materials WHERE id = p_material_id;

  RETURN jsonb_build_object('result', 'deleted');
END;
$$;

-- Same permission pattern as existing atomic RPCs (record_first_cash_count_atomic, etc.)
REVOKE ALL ON FUNCTION public.delete_material_safely(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_material_safely(uuid, text) TO service_role;
