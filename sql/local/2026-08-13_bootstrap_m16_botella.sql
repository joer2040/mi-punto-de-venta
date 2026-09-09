-- ============================================================
-- BOOTSTRAP LOCAL: PREREQUISITO PARA MIGRACION M16
-- ============================================================
-- EXCLUSIVAMENTE LOCAL. PROHIBIDO EJECUTAR EN DEV O PRD.
-- ============================================================
-- Proposito:
--   Insertar la categoria 'Botella' que requiere la migracion
--   20260715223000_make_botella_sellable.sql (M16) para ejecutarse
--   sin error.
--
--   M14 (catalogo_cocteleria_extras_botella) crea 'Botella' solo si
--   existe una categoria 'Botellas/Otros' a renombrar. En base local
--   virginal esa categoria no existe, por lo que M14 no crea 'Botella'
--   y M16 falla con: "Se esperaba exactamente una categoria Botella y
--   se encontraron 0."
--
-- Prerequisito: M1-M15 aplicadas, M16 pendiente.
--
-- Metodo de ejecucion (psql no esta en PATH del host):
--
--   Paso 1 - Copiar al contenedor:
--     docker cp sql/local/2026-08-13_bootstrap_m16_botella.sql \
--       supabase_db_mi-punto-de-venta:/tmp/bootstrap_m16.sql
--
--   Paso 2 - Ejecutar:
--     docker exec supabase_db_mi-punto-de-venta \
--       psql -U postgres -d postgres -f /tmp/bootstrap_m16.sql
--
-- UUIDs fijos (solo al insertar):
--   categoria Botella: 10000000-0000-0000-0000-000000000005
--
-- Siguiente paso tras ejecucion exitosa:
--   npx supabase migration up --local
-- ============================================================

begin;

do $$
declare
  v_org_id        uuid;
  v_org_count     integer;
  v_botella_id    uuid;
  v_botella_count integer;
begin

  raise notice '============================================================';
  raise notice 'Bootstrap M16: inicio';
  raise notice 'EXCLUSIVAMENTE LOCAL. PROHIBIDO EN DEV O PRD.';
  raise notice '============================================================';

  -- ── 1. ORGANIZACION (control de entorno) ─────────────────────────────────────
  -- M14 ya debio haberse ejecutado. La org insertada por el bootstrap M14
  -- debe existir. Cualquier valor distinto de 1 indica entorno inesperado.

  select count(*), (array_agg(id))[1]
    into v_org_count, v_org_id
  from public.organizations;

  if v_org_count <> 1 then
    raise exception
      '[1/2][ORG] ERROR: % organizaciones encontradas. Se requiere exactamente 1. '
      'Verificar que el bootstrap M14 fue ejecutado correctamente.',
      v_org_count;
  end if;

  raise notice '[1/2][ORG] OK  id=% name=%',
    v_org_id,
    (select name from public.organizations where id = v_org_id);

  -- ── 2. CATEGORIA "Botella" ────────────────────────────────────────────────────
  -- M16 busca: lower(trim(name)) = lower('Botella')
  -- Si count <> 1 lanza exception. Por eso necesitamos exactamente 1.
  --
  -- Valores del INSERT:
  --   is_for_sale = true          (M16 lo setea; insertar ya con valor correcto)
  --   is_inventoried = true       (M16 lo setea)
  --   is_internal_production = false  (M16 lo setea; columna agregada por M14)
  --   def_tax = 16.00             (IVA estandar, igual que Extras y Cocteleria)

  select count(*), (array_agg(id))[1]
    into v_botella_count, v_botella_id
  from public.categories
  where lower(trim(name)) = lower('Botella');

  if v_botella_count = 0 then
    v_botella_id := '10000000-0000-0000-0000-000000000005'::uuid;
    insert into public.categories (
      id, org_id, name, def_tax,
      is_for_sale, is_inventoried, is_internal_production
    )
    values (
      v_botella_id, v_org_id, 'Botella', 16.00,
      true, true, false
    );
    raise notice '[2/2][BOTELLA] INSERTADA  id=% name=Botella org_id=%',
      v_botella_id, v_org_id;

  elsif v_botella_count = 1 then
    raise notice '[2/2][BOTELLA] REUTILIZADA id=% name=%',
      v_botella_id,
      (select name from public.categories where id = v_botella_id);

  else
    raise exception
      '[2/2][BOTELLA] ERROR: % categorias con nombre "Botella" encontradas. '
      'M16 exige exactamente 1.',
      v_botella_count;
  end if;

  -- ── RESUMEN ───────────────────────────────────────────────────────────────────
  raise notice '------------------------------------------------------------';
  raise notice 'Bootstrap M16: COMPLETADO';
  raise notice '  org id:       %', v_org_id;
  raise notice '  botella id:   %', v_botella_id;
  raise notice '------------------------------------------------------------';
  raise notice 'Siguiente paso: npx supabase migration up --local';

end $$;

commit;
