# FASE3 - R4: Bootstrap Local para Migracion M16

**Generado:** 2026-08-13  
**Ejecutor:** joer2040  
**Script:** `sql/local/2026-08-13_bootstrap_m16_botella.sql`  
**Estado:** PENDIENTE DE EJECUCION

---

> **AVISO DE ENTORNO**  
> Este documento y el script que describe son EXCLUSIVAMENTE para la base de datos
> PostgreSQL local del proyecto. Cualquier ejecucion contra DEV o PRD esta
> terminantemente prohibida.

---

## 1. Contexto y Causa del Fallo

### Estado confirmado de la base local

| Migraciones aplicadas | M1 a M15 (15/28)               |
|-----------------------|--------------------------------|
| Migracion pendiente   | M16: `20260715223000_make_botella_sellable.sql` |
| Error reportado       | "Se esperaba exactamente una categoria Botella y se encontraron 0." |

### Por que M16 falla si M14 se aplico

M16 requiere exactamente 1 categoria con `lower(trim(name)) = lower('Botella')`.

M14 (`catalogo_cocteleria_extras_botella`) no crea 'Botella' de forma incondicional.
Solo la crea si existe una categoria 'Botellas/Otros' a renombrar (lineas 167-173 de M14).
En una base local virginal, 'Botellas/Otros' no existe. Por tanto, M14 completa su
ejecucion sin insertar 'Botella', y M16 falla.

Categorias que SI crea M14 incondicionalmente en base virginal:
- 'Extras' (INSERT si no existe)
- 'Cocteleria' (INSERT si no existe)

Categoria que M14 NO crea si no hay 'Botellas/Otros':
- 'Botella' (solo renombraria 'Botellas/Otros' si existiera)

---

## 2. Prerequisito: Estado Requerido de la Base Local

| Condicion                                   | Requerido                |
|---------------------------------------------|--------------------------|
| Bootstrap M14 ejecutado previamente         | SI                       |
| Migraciones M1-M15 aplicadas                | SI                       |
| Migracion M16 pendiente (fallida)           | SI                       |
| Exactamente 1 organizacion en `organizations` | SI (insertada por bootstrap M14) |
| Tabla `categories` existente con columna `is_internal_production` | SI (M14 la agrego) |
| Categoria 'Botella' en `categories`         | NO (ausencia es el problema) |
| Supabase local activo (Docker)              | SI                       |

---

## 3. Controles del Script

### Paso 1: Control de organizacion (verificacion de entorno)

| Condicion             | Accion                                                           |
|-----------------------|------------------------------------------------------------------|
| count <> 1            | `raise exception` -- entorno inesperado, detener                |
| count = 1             | Conservar UUID para usar como `org_id` en la categoria          |

Este control valida que el bootstrap M14 fue ejecutado correctamente.
Si hay 0 organizaciones, significa que el M14 bootstrap no corrio.
Si hay >1, el entorno tiene datos de multiple origen.

### Paso 2: Categoria 'Botella'

Busqueda: `lower(trim(name)) = lower('Botella')` (mismo criterio que M16 linea 14).

| Filas encontradas | Accion                                                            |
|-------------------|-------------------------------------------------------------------|
| 0                 | INSERT con UUID fijo, vinculado al org_id del paso 1             |
| 1                 | Reutilizar. No modifica nada. M16 hara el UPDATE necesario.      |
| > 1               | `raise exception` -- M16 fallaria igual con >1                   |

### Valores del INSERT de 'Botella'

| Columna                | Valor    | Razon                                            |
|------------------------|----------|--------------------------------------------------|
| `id`                   | UUID fijo `10000000-0000-0000-0000-000000000005` | Determinismo |
| `org_id`               | UUID de la organizacion unica | FK requerida              |
| `name`                 | `'Botella'` | Nombre literal requerido por M16              |
| `def_tax`              | `16.00`  | IVA estandar (igual que Extras y Cocteleria en M14) |
| `is_for_sale`          | `true`   | M16 lo setea; se inserta ya con valor correcto   |
| `is_inventoried`       | `true`   | M16 lo setea; se inserta ya con valor correcto   |
| `is_internal_production` | `false` | M16 lo setea; columna agregada por M14 (NOT NULL DEFAULT false) |

Nota: M16 hace UPDATE sobre 'Botella' unicamente si alguno de esos tres flags
difiere del valor esperado. Al insertar con los valores correctos, el UPDATE de M16
no tendra efecto -- lo cual es correcto y esperado.

---

## 4. Resultados Esperados (NOTICE de psql)

En base local en estado M1-M15 con 0 categorias 'Botella':

```
NOTICE:  ============================================================
NOTICE:  Bootstrap M16: inicio
NOTICE:  EXCLUSIVAMENTE LOCAL. PROHIBIDO EN DEV O PRD.
NOTICE:  ============================================================
NOTICE:  [1/2][ORG] OK  id=10000000-0000-0000-0000-000000000001 name=Organizacion Test Local
NOTICE:  [2/2][BOTELLA] INSERTADA  id=10000000-0000-0000-0000-000000000005 name=Botella org_id=10000000-0000-0000-0000-000000000001
NOTICE:  ------------------------------------------------------------
NOTICE:  Bootstrap M16: COMPLETADO
NOTICE:    org id:       10000000-0000-0000-0000-000000000001
NOTICE:    botella id:   10000000-0000-0000-0000-000000000005
NOTICE:  ------------------------------------------------------------
NOTICE:  Siguiente paso: npx supabase migration up --local
COMMIT
```

Si el script se ejecuta por segunda vez (idempotencia):

```
NOTICE:  [1/2][ORG] OK  id=10000000-... name=Organizacion Test Local
NOTICE:  [2/2][BOTELLA] REUTILIZADA id=10000000-... name=Botella
NOTICE:  Bootstrap M16: COMPLETADO
COMMIT
```

Si aparece `ROLLBACK` o `ERROR` en lugar de `COMMIT`, el transaccion completo es
revertido y ningun dato queda insertado parcialmente.

---

## 5. Procedimiento de Ejecucion (AUN NO EJECUTADO)

### Paso A: Ejecutar el bootstrap

```powershell
# Desde D:\ProjectsDEV\pventa\mi-punto-de-venta

# Copiar script al contenedor Docker
docker cp sql/local/2026-08-13_bootstrap_m16_botella.sql `
  supabase_db_mi-punto-de-venta:/tmp/bootstrap_m16.sql

# Ejecutar via psql dentro del contenedor
docker exec supabase_db_mi-punto-de-venta `
  psql -U postgres -d postgres -f /tmp/bootstrap_m16.sql
```

**Verificar:** La salida debe terminar con `COMMIT`. Los NOTICE deben mostrar
`INSERTADA` o `REUTILIZADA`, nunca `ERROR`.

### Paso B: Reanudar migraciones

```powershell
npx supabase migration up --local
```

**Resultado esperado:** M16-M28 aplicadas exitosamente. Las 28 migraciones
quedan en estado `applied` en la base local.

---

## 6. Relacion con el Bootstrap M14

Este bootstrap es el segundo de dos bootstraps locales necesarios para
levantar la base desde cero:

| Bootstrap                                          | Datos que inserta                             | Resuelve              |
|----------------------------------------------------|-----------------------------------------------|-----------------------|
| `2026-08-13_bootstrap_m14_prerequisites.sql`       | Org, Centro 'Bar Principal', UOM Pieza, Proveedor General | M14 pendiente |
| `2026-08-13_bootstrap_m16_botella.sql` (este)      | Categoria 'Botella'                           | M16 pendiente         |

Secuencia completa para base local desde 0 tablas:

```
1. npx supabase migration up --local   (aplica M1-M13, falla en M14)
2. docker exec psql bootstrap_m14      (inserta org/centro/uom/proveedor)
3. npx supabase migration up --local   (aplica M14-M15, falla en M16)
4. docker exec psql bootstrap_m16      (inserta categoria Botella)
5. npx supabase migration up --local   (aplica M16-M28)
```

---

## 7. Prohibicion DEV/PRD

Este script NO debe ejecutarse en:

- El proyecto DEV (`rtkdrnfqihulqdhixxzf`)
- El proyecto PRD
- Ningun entorno de Supabase remoto (`--linked`)

La categoria 'Botella' ya existe en DEV con su UUID real y datos de
produccion. Ejecutar este script en DEV crearia un duplicado o podria
corromper relaciones existentes. DEV y PRD tienen sus propios datos de
catalogo, nunca reemplazados por datos ficticios locales.

---

## 8. Estado Actual

| Item                          | Estado                                           |
|-------------------------------|--------------------------------------------------|
| Script bootstrap M16 creado   | SI (`sql/local/2026-08-13_bootstrap_m16_botella.sql`) |
| Bootstrap M16 ejecutado       | NO -- pendiente de autorizacion                  |
| Paso B (`migration up`)       | NO -- pendiente de autorizacion                  |
| Cambios en DEV                | NINGUNO                                          |
| Commits o pushes realizados   | NINGUNO                                          |

---

*Documento generado por inspeccion estatica. Ninguna migracion, DDL, DML, deploy,
commit ni push fue ejecutado.*
