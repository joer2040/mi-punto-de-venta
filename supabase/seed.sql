-- ============================================================
-- SEED LOCAL DE PRUEBAS -- SOLO ENTORNO LOCAL
-- Datos ficticios. PROHIBIDO usar en DEV o PRD.
-- ============================================================
-- Proposito: datos base minimos para que supabase db reset --local
--   aplique todas las migraciones, incluyendo
--   20260714132000_catalogo_cocteleria_extras_botella.sql
--
-- NOTA DE EJECUCION: Supabase aplica este archivo DESPUES de todas
--   las migraciones. Para que los datos esten disponibles DURANTE
--   la migracion 20260714132000, se require adicionalmente una
--   migracion de inicializacion (ver FASE3_R4_SEED_LOCAL.md).
--
-- Todos los INSERT son idempotentes via ON CONFLICT DO NOTHING.
-- UUIDs fijos para relaciones predecibles entre tablas.
-- ============================================================

-- UUIDs fijos del seed local
-- org:      10000000-0000-0000-0000-000000000001
-- center:   10000000-0000-0000-0000-000000000002
-- uom_pz:   10000000-0000-0000-0000-000000000003
-- provider: 10000000-0000-0000-0000-000000000004

-- 1. Organizacion (requerida por: 20260714132000, categorias, centros)
INSERT INTO public.organizations (id, name, base_currency)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Organizacion Test Local',
  'MXN'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Centro "Bar Principal" (requerido LITERALMENTE por: 20260714132000,
--    finalize_pos_sale, 20260715221000)
INSERT INTO public.centers (id, org_id, name, type)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Bar Principal',
  'bar'
)
ON CONFLICT (id) DO NOTHING;

-- 3. UOM Pieza (requerida por: 20260714132000 — abbr o name in ('pz','pza','pieza','piezas'))
INSERT INTO public.uoms (id, name, abbr, is_base)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'Pieza',
  'pz',
  true
)
ON CONFLICT (id) DO NOTHING;

-- 4. Proveedor General (requerido por: 20260714132000 para insertar sku=10009
--    cuando no existe — v_general_provider_id no puede ser null en ese caso)
--    RFC ficticio: XAXX010101000 (RFC generico de uso local)
INSERT INTO public.providers (id, name, rfc)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  'Proveedor General',
  'XAXX010101000'
)
ON CONFLICT (id) DO NOTHING;
