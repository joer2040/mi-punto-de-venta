# FASE3 - R4: Bootstrap Local para Migracion M14

**Generado:** 2026-08-13  
**Ejecutor:** joer2040  
**Script:** `sql/local/2026-08-13_bootstrap_m14_prerequisites.sql`  
**Estado:** PENDIENTE DE EJECUCION

---

> **AVISO DE ENTORNO**  
> Este documento y el script que describe son EXCLUSIVAMENTE para la base de datos
> PostgreSQL local del proyecto. Cualquier ejecucion contra DEV o PRD esta
> terminantemente prohibida.

---

## 1. Proposito

La migracion `20260714132000_catalogo_cocteleria_extras_botella.sql` (M14) requiere
que cuatro registros base existan en la base de datos ANTES de que se ejecute.
Esos registros no son creados por ninguna de las migraciones M1-M13 que la preceden
(son datos operativos, no estructurales).

El script de bootstrap inserta esos cuatro registros de forma controlada e idempotente
sobre la base local que ya tiene M1-M13 aplicadas y M14 pendiente.

---

## 2. Prerequisito: Estado Requerido de la Base Local

El script debe ejecutarse sobre una base local que se encuentre en el siguiente estado:

| Condicion                                   | Esperado                  |
|---------------------------------------------|---------------------------|
| Migraciones M1-M13 aplicadas                | SI (todas exitosas)       |
| Migracion M14 en estado pendiente (fallida) | SI                        |
| Tablas `organizations`, `centers`, `uoms`, `providers` existentes | SI (creadas por M1) |
| Datos en esas tablas                        | NO (base local virginal)  |
| Supabase local activo (Docker)              | SI                        |

Este estado ocurre despues de ejecutar `npx supabase migration up --local` en una base
local vacia: el CLI aplica M1-M13 exitosamente y falla en M14 porque las tablas existen
pero estan vacias. Las migraciones M1-M13 permanecen aplicadas (cada una se confirma
en su propia transaccion antes de intentar la siguiente).

---

## 3. Datos que Inserta el Script

| Paso | Tabla           | Dato insertado                              | UUID fijo                              |
|------|-----------------|---------------------------------------------|----------------------------------------|
| 1/4  | `organizations` | `Organizacion Test Local`, MXN              | `10000000-0000-0000-0000-000000000001` |
| 2/4  | `centers`       | `Bar Principal`, type='bar'                 | `10000000-0000-0000-0000-000000000002` |
| 3/4  | `uoms`          | `Pieza`, abbr='pz', is_base=true            | `10000000-0000-0000-0000-000000000003` |
| 4/4  | `providers`     | `Proveedor General`, rfc='XAXX010101000'    | `10000000-0000-0000-0000-000000000004` |

Los UUIDs fijos se usan SOLO al insertar. Si el registro ya existe (reutilizacion),
el UUID encontrado en la base prevalece independientemente del fijo.

---

## 4. Controles del Script (Logica por Paso)

### Paso 1: Organizacion

| Filas encontradas | Accion                                         |
|-------------------|------------------------------------------------|
| 0                 | INSERT con UUID fijo y nombre 'Organizacion Test Local' |
| 1                 | Reutilizar. No modifica nada.                  |
| > 1               | `raise exception` -- M14 exige exactamente 1  |

### Paso 2: Centro 'Bar Principal'

Busqueda: `lower(trim(name)) = lower('Bar Principal')` (mismo criterio que M14 y `finalize_pos_sale`).

| Filas encontradas | Accion                                                      |
|-------------------|-------------------------------------------------------------|
| 0                 | INSERT con UUID fijo, vinculado al org_id del paso 1       |
| 1                 | Reutilizar. No modifica nada.                               |
| > 1               | `raise exception` -- M14 exige exactamente 1               |

### Paso 3: UOM Pieza

Busqueda: `lower(trim(abbr)) in ('pz','pza') OR lower(trim(name)) in ('pieza','piezas')`
(mismo criterio que M14).

| Filas encontradas | Accion                                                   |
|-------------------|----------------------------------------------------------|
| 0                 | INSERT: name='Pieza', abbr='pz', is_base=true           |
| 1                 | Reutilizar. No modifica nada.                            |
| > 1               | `raise exception` -- M14 exige exactamente 1            |

### Paso 4: Proveedor General

Busqueda: `lower(trim(name)) = lower('Proveedor General')`.

| Filas encontradas | Accion                                                        |
|-------------------|---------------------------------------------------------------|
| 0                 | INSERT: name='Proveedor General', rfc='XAXX010101000'        |
| 1                 | Reutilizar. No modifica nada.                                 |
| > 1               | `raise exception` -- M14 exige maximo 1                      |

Nota: `providers.rfc` es `NOT NULL` en el schema (definido en M1). RFC ficticio
`XAXX010101000` es el RFC generico de uso local en Mexico -- nunca valido en SAT.

---

## 5. Resultados Esperados (NOTICE de psql)

En base local virginal (todos los datos ausentes), la salida esperada es:

```
NOTICE:  ============================================================
NOTICE:  Bootstrap M14: inicio
NOTICE:  EXCLUSIVAMENTE LOCAL. PROHIBIDO EN DEV O PRD.
NOTICE:  ============================================================
NOTICE:  [1/4][ORG] INSERTADA  id=10000000-0000-0000-0000-000000000001 name=Organizacion Test Local
NOTICE:  [2/4][CENTRO] INSERTADO  id=10000000-0000-0000-0000-000000000002 name=Bar Principal org_id=10000000-0000-0000-0000-000000000001
NOTICE:  [3/4][UOM] INSERTADA  id=10000000-0000-0000-0000-000000000003 name=Pieza abbr=pz
NOTICE:  [4/4][PROVEEDOR] INSERTADO  id=10000000-0000-0000-0000-000000000004 name=Proveedor General rfc=XAXX010101000
NOTICE:  ------------------------------------------------------------
NOTICE:  Bootstrap M14: COMPLETADO
NOTICE:    org id:       10000000-0000-0000-0000-000000000001
NOTICE:    center id:    10000000-0000-0000-0000-000000000002
NOTICE:    uom id:       10000000-0000-0000-0000-000000000003
NOTICE:    provider id:  10000000-0000-0000-0000-000000000004
NOTICE:  ------------------------------------------------------------
NOTICE:  Siguiente paso: npx supabase migration up --local
COMMIT
```

Si cualquier paso falla con `raise exception`, el `BEGIN/COMMIT` completo hace rollback
y ningun dato queda insertado parcialmente.

---

## 6. Procedimiento Completo (AUN NO EJECUTADO)

El flujo completo para levantar la base local con las 28 migraciones es de tres pasos:

### Paso A: Primera aplicacion de migraciones (M1-M13)

```powershell
# Desde D:\ProjectsDEV\pventa\mi-punto-de-venta
npx supabase migration up --local
```

**Resultado esperado:** M1-M13 aplicadas, error en M14 por datos faltantes. El CLI
se detiene. Las tablas de schema existen. La base queda en estado M13.

### Paso B: Bootstrap de datos prerequisito

```powershell
# Copiar el script al contenedor Docker
docker cp sql/local/2026-08-13_bootstrap_m14_prerequisites.sql `
  supabase_db_mi-punto-de-venta:/tmp/bootstrap_m14.sql

# Ejecutar via psql dentro del contenedor
docker exec supabase_db_mi-punto-de-venta `
  psql -U postgres -d postgres -f /tmp/bootstrap_m14.sql
```

**Verificar:** Los 4 NOTICE deben decir INSERTADA/INSERTADO y finalizar con `COMMIT`.
Si algun NOTICE dice ERROR o aparece `ROLLBACK`, detener y revisar.

### Paso C: Segunda aplicacion de migraciones (M14-M28)

```powershell
npx supabase migration up --local
```

**Resultado esperado:** M14-M28 aplicadas exitosamente. Las 28 migraciones quedan
en estado `applied` en la base local.

---

## 7. Por Que el Script Esta en `sql/local/` y No en `supabase/migrations/`

- `supabase/migrations/` es el directorio de migraciones gestionadas por el CLI.
  Cualquier archivo ahi puede ser aplicado a DEV/PRD accidentalmente via `db push`.
- `sql/local/` es el directorio de scripts manuales de entorno local. No es
  procesado automaticamente por ningun comando de Supabase.
- El bootstrap usa datos ficticios que nunca deben existir en DEV o PRD.
- La separacion garantiza que el bootstrap sea un paso manual explicito y nunca
  un efecto secundario de un comando de despliegue.

---

## 8. Prohibicion DEV/PRD

Este script NO debe ejecutarse nunca en:

- El proyecto DEV (`rtkdrnfqihulqdhixxzf`)
- El proyecto PRD
- Ningun entorno de Supabase remoto (`--linked`)

Los datos que inserta son ficticios (`Organizacion Test Local`, RFC `XAXX010101000`)
e incompatibles con datos reales. Su aplicacion en ambientes remotos corromperia
datos maestros de organizacion y proveedores.

---

## 9. Confirmacion de Estado Actual

| Item                        | Estado                                   |
|-----------------------------|------------------------------------------|
| Script bootstrap creado     | SI (`sql/local/2026-08-13_bootstrap_m14_prerequisites.sql`) |
| Paso A ejecutado            | NO -- pendiente de autorizacion          |
| Script bootstrap ejecutado  | NO -- pendiente de autorizacion          |
| Paso C ejecutado            | NO -- pendiente de autorizacion          |
| Cambios en DEV              | NINGUNO                                  |
| Commits o pushes realizados | NINGUNO                                  |

---

*Documento generado por inspeccion estatica. Ninguna migracion, DDL, DML, deploy,
commit ni push fue ejecutado.*
