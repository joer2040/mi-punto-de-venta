-- ============================================================
-- BOOTSTRAP LOCAL: PREREQUISITOS PARA MIGRACION M14
-- ============================================================
-- EXCLUSIVAMENTE LOCAL. PROHIBIDO EJECUTAR EN DEV O PRD.
-- ============================================================
-- Proposito:
--   Insertar los datos minimos que requiere la migracion
--   20260714132000_catalogo_cocteleria_extras_botella.sql
--   para ejecutarse sin error sobre una base local que ya tiene
--   las migraciones M1-M13 aplicadas.
--
-- Ejecutar SOLO despues de que migration up --local haya aplicado
--   M1-M13 y se haya detenido en M14 por falta de datos base.
--
-- Metodo de ejecucion (psql no esta en PATH del host):
--
--   Paso 1 - Copiar al contenedor:
--     docker cp sql/local/2026-08-13_bootstrap_m14_prerequisites.sql \
--       supabase_db_mi-punto-de-venta:/tmp/bootstrap_m14.sql
--
--   Paso 2 - Ejecutar:
--     docker exec supabase_db_mi-punto-de-venta \
--       psql -U postgres -d postgres -f /tmp/bootstrap_m14.sql
--
-- UUIDs fijos (solo se usan al insertar):
--   org:      10000000-0000-0000-0000-000000000001
--   center:   10000000-0000-0000-0000-000000000002
--   uom:      10000000-0000-0000-0000-000000000003
--   provider: 10000000-0000-0000-0000-000000000004
--
-- Siguiente paso tras la ejecucion exitosa:
--   npx supabase migration up --local
-- ============================================================

begin;

do $$
declare
  v_org_id       uuid;
  v_org_count    integer;
  v_center_id    uuid;
  v_center_count integer;
  v_uom_id       uuid;
  v_uom_count    integer;
  v_prov_id      uuid;
  v_prov_count   integer;
begin

  raise notice '============================================================';
  raise notice 'Bootstrap M14: inicio';
  raise notice 'EXCLUSIVAMENTE LOCAL. PROHIBIDO EN DEV O PRD.';
  raise notice '============================================================';

  -- ── 1. ORGANIZACION ──────────────────────────────────────────────────────────
  -- M14 exige exactamente 1 fila en public.organizations.
  -- 0 filas: insertar. 1 fila: reutilizar. >1: error.

  select count(*), (array_agg(id))[1]
    into v_org_count, v_org_id
  from public.organizations;

  if v_org_count = 0 then
    v_org_id := '10000000-0000-0000-0000-000000000001'::uuid;
    insert into public.organizations (id, name, base_currency)
    values (v_org_id, 'Organizacion Test Local', 'MXN');
    raise notice '[1/4][ORG] INSERTADA  id=% name=%',
      v_org_id, 'Organizacion Test Local';

  elsif v_org_count = 1 then
    raise notice '[1/4][ORG] REUTILIZADA id=% name=%',
      v_org_id,
      (select name from public.organizations where id = v_org_id);

  else
    raise exception
      '[1/4][ORG] ERROR: % organizaciones encontradas. M14 exige exactamente 1.',
      v_org_count;
  end if;

  -- ── 2. CENTRO "Bar Principal" ────────────────────────────────────────────────
  -- M14 (y finalize_pos_sale) busca lower(trim(name)) = 'bar principal'.
  -- 0: insertar vinculado a la org. 1: reutilizar. >1: error.

  select count(*), (array_agg(id))[1]
    into v_center_count, v_center_id
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  if v_center_count = 0 then
    v_center_id := '10000000-0000-0000-0000-000000000002'::uuid;
    insert into public.centers (id, org_id, name, type)
    values (v_center_id, v_org_id, 'Bar Principal', 'bar');
    raise notice '[2/4][CENTRO] INSERTADO  id=% name=% org_id=%',
      v_center_id, 'Bar Principal', v_org_id;

  elsif v_center_count = 1 then
    raise notice '[2/4][CENTRO] REUTILIZADO id=% name=%',
      v_center_id,
      (select name from public.centers where id = v_center_id);

  else
    raise exception
      '[2/4][CENTRO] ERROR: % centros con nombre "Bar Principal". Se requiere exactamente 1.',
      v_center_count;
  end if;

  -- ── 3. UOM PIEZA ─────────────────────────────────────────────────────────────
  -- M14 busca abbr IN ('pz','pza') OR name IN ('pieza','piezas').
  -- 0: insertar Pieza/pz. >1: error. 1: reutilizar.

  select count(*), (array_agg(id))[1]
    into v_uom_count, v_uom_id
  from public.uoms
  where lower(trim(abbr)) in ('pz', 'pza')
     or lower(trim(name)) in ('pieza', 'piezas');

  if v_uom_count = 0 then
    v_uom_id := '10000000-0000-0000-0000-000000000003'::uuid;
    insert into public.uoms (id, name, abbr, is_base)
    values (v_uom_id, 'Pieza', 'pz', true);
    raise notice '[3/4][UOM] INSERTADA  id=% name=% abbr=%',
      v_uom_id, 'Pieza', 'pz';

  elsif v_uom_count = 1 then
    raise notice '[3/4][UOM] REUTILIZADA id=% name=% abbr=%',
      v_uom_id,
      (select name from public.uoms where id = v_uom_id),
      (select abbr from public.uoms where id = v_uom_id);

  else
    raise exception
      '[3/4][UOM] ERROR: % unidades equivalentes a pieza encontradas. Se requiere exactamente 1.',
      v_uom_count;
  end if;

  -- ── 4. PROVEEDOR GENERAL ─────────────────────────────────────────────────────
  -- M14 necesita Proveedor General para insertar sku='10009' si no existe.
  -- En base local virginal sku='10009' no existe, por lo que es obligatorio.
  -- providers.rfc es NOT NULL en el schema.
  -- 0: insertar. 1: reutilizar. >1: error.

  select count(*), (array_agg(id))[1]
    into v_prov_count, v_prov_id
  from public.providers
  where lower(trim(name)) = lower('Proveedor General');

  if v_prov_count = 0 then
    v_prov_id := '10000000-0000-0000-0000-000000000004'::uuid;
    insert into public.providers (id, name, rfc)
    values (v_prov_id, 'Proveedor General', 'XAXX010101000');
    raise notice '[4/4][PROVEEDOR] INSERTADO  id=% name=% rfc=%',
      v_prov_id, 'Proveedor General', 'XAXX010101000';

  elsif v_prov_count = 1 then
    raise notice '[4/4][PROVEEDOR] REUTILIZADO id=% name=%',
      v_prov_id,
      (select name from public.providers where id = v_prov_id);

  else
    raise exception
      '[4/4][PROVEEDOR] ERROR: % proveedores con nombre "Proveedor General". Se requiere exactamente 1.',
      v_prov_count;
  end if;

  -- ── RESUMEN ───────────────────────────────────────────────────────────────────
  raise notice '------------------------------------------------------------';
  raise notice 'Bootstrap M14: COMPLETADO';
  raise notice '  org id:       %', v_org_id;
  raise notice '  center id:    %', v_center_id;
  raise notice '  uom id:       %', v_uom_id;
  raise notice '  provider id:  %', v_prov_id;
  raise notice '------------------------------------------------------------';
  raise notice 'Siguiente paso: npx supabase migration up --local';

end $$;

commit;
