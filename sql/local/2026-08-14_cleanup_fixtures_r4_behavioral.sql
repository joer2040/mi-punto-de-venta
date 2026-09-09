-- ============================================================
-- CLEANUP: FIXTURES R4 PRUEBAS CONDUCTUALES
-- ============================================================
-- EXCLUSIVAMENTE LOCAL. PROHIBIDO EJECUTAR EN DEV O PRD.
-- ============================================================
-- Elimina ÚNICAMENTE los fixtures con UUIDs fijos de R4.
-- Cada paso incluye condición de campo para evitar eliminar datos
-- reales que no correspondan al fixture esperado.
--
-- Orden seguro (inverso a dependencias):
--   1. UPDATE tables  → libera FK circular (validado: number='T-TEST-R4')
--   2. DELETE table_orders (validado: table_id=...0007)
--   3. DELETE tables  (validado: number='T-TEST-R4')
--   4. DELETE inventory  → (material_id=...0009, center_id=...0002)
--   5. DELETE materials  (validado: name='Material Test R4', cat_id=...0005)
--   6. DELETE auth.users → cascada ON DELETE CASCADE a app_profiles
--
-- Triggers en cleanup:
--   UPDATE tables (ocupada→libre): WHEN (NEW.status='ocupada' ...) = false
--     → trigger no dispara → sin bypass.
--   DELETE de table_orders, tables, inventory, materials, auth.users:
--     ningún trigger M18 cubre DELETE → sin bypass.
--
-- Método de ejecución:
--   docker cp sql/local/2026-08-14_cleanup_fixtures_r4_behavioral.sql \
--     supabase_db_mi-punto-de-venta:/tmp/cleanup_r4.sql
--   docker exec supabase_db_mi-punto-de-venta \
--     psql -U postgres -d postgres -f /tmp/cleanup_r4.sql
-- ============================================================

begin;

do $$
declare
  v_user_id     uuid := '10000000-0000-0000-0000-000000000006';
  v_table_id    uuid := '10000000-0000-0000-0000-000000000007';
  v_order_id    uuid := '10000000-0000-0000-0000-000000000008';
  v_material_id uuid := '10000000-0000-0000-0000-000000000009';
  v_cat_id      uuid := '10000000-0000-0000-0000-000000000005';
  v_center_id   uuid := '10000000-0000-0000-0000-000000000002';
begin

  raise notice '============================================================';
  raise notice 'Cleanup Fixtures R4: inicio';
  raise notice 'EXCLUSIVAMENTE LOCAL. PROHIBIDO EN DEV O PRD.';
  raise notice '============================================================';

  -- Paso 1: Liberar FK circular (tables.current_order_id → table_orders)
  -- Trigger tables_activate_require_open_cash_session:
  --   WHEN (NEW.status='ocupada' OR NEW.current_order_id IS NOT NULL) AND changed
  --   → NEW.status='libre', NEW.current_order_id=NULL → WHEN = false → sin bypass.
  -- Condición de campo: number='T-TEST-R4' para no tocar tables reales.

  update public.tables
     set status           = 'libre',
         current_order_id = null
   where id     = v_table_id
     and number = 'T-TEST-R4';

  if found then
    raise notice '[1] tables LIBERADA id=% → status=libre current_order_id=NULL', v_table_id;
  else
    raise notice '[1] tables no encontrada o no coincide number=T-TEST-R4 — omitido';
  end if;

  -- Paso 2: Eliminar table_orders
  -- Trigger table_orders_require_open_cash_session: solo INSERT/UPDATE, no DELETE.
  -- Condición de campo: table_id=v_table_id para confirmar es nuestro fixture.

  delete from public.table_orders
   where id       = v_order_id
     and table_id = v_table_id;

  if found then
    raise notice '[2] table_orders ELIMINADA id=%', v_order_id;
  else
    raise notice '[2] table_orders no encontrada o table_id no coincide — omitido';
  end if;

  -- Paso 3: Eliminar tables
  -- Condición de campo: number='T-TEST-R4'.

  delete from public.tables
   where id     = v_table_id
     and number = 'T-TEST-R4';

  if found then
    raise notice '[3] tables ELIMINADA id=%', v_table_id;
  else
    raise notice '[3] tables no encontrada o number no coincide — omitido';
  end if;

  -- Paso 4: Eliminar fila de inventory antes de materials (FK material_id → materials)
  -- (material_id, center_id) es clave única — condición suficientemente específica.

  delete from public.inventory
   where material_id = v_material_id
     and center_id   = v_center_id;

  if found then
    raise notice '[4] inventory ELIMINADA material_id=% center_id=%', v_material_id, v_center_id;
  else
    raise notice '[4] inventory no encontrada — omitido';
  end if;

  -- Paso 5: Eliminar materials
  -- Condición de campo: name='Material Test R4' y cat_id=v_cat_id.

  delete from public.materials
   where id     = v_material_id
     and name   = 'Material Test R4'
     and cat_id = v_cat_id;

  if found then
    raise notice '[5] materials ELIMINADO id=%', v_material_id;
  else
    raise notice '[5] materials no encontrado o datos no coinciden — omitido';
  end if;

  -- Paso 6: Eliminar auth.users
  -- ON DELETE CASCADE propaga a app_profiles.
  -- auth.users no tiene campo de negocio adicional para validar.

  delete from auth.users where id = v_user_id;

  if found then
    raise notice '[6] auth.users ELIMINADO id=% (cascada a app_profiles)', v_user_id;
  else
    raise notice '[6] auth.users no encontrado id=% — omitido', v_user_id;
  end if;

  raise notice '------------------------------------------------------------';
  raise notice 'Cleanup Fixtures R4: COMPLETADO';
  raise notice '------------------------------------------------------------';

end $$;

commit;
