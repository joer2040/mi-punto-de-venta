# FASE3 - R4: Seed Local para Pruebas Conductuales

**Generado:** 2026-08-13  
**Ejecutor:** joer2040  
**Archivo creado:** `supabase/seed.sql`  
**Migracion objetivo:** `20260714132000_catalogo_cocteleria_extras_botella.sql`

---

## 1. Dependencias Inspeccionadas

### 1.1 Migraciones con dependencia de datos pre-existentes

| Migracion              | Datos requeridos                          | Tipo de verificacion               |
|------------------------|-------------------------------------------|------------------------------------|
| `20260714132000`       | 1 org, 1 centro 'Bar Principal', 1 UOM pieza, Proveedor General | `raise exception` si falta |
| `20260715223000`       | Categoria 'Botella'                        | `raise exception` si != 1 fila     |

`20260715223000` no requiere datos del seed: la categoria 'Botella' la crea la propia migracion `20260714132000` durante su ejecucion.

### 1.2 Requerimientos literales de `20260714132000`

Inspeccion directa del DO block (lineas 16-323):

| Verificacion en migracion                         | Condicion de fallo                                      | Fuente del requerimiento        |
|---------------------------------------------------|---------------------------------------------------------|---------------------------------|
| `SELECT count(*) FROM public.organizations`       | `= 0` o `> 1` levanta exception                         | Linia 17-27                    |
| `SELECT id FROM public.centers WHERE lower(trim(name)) = lower('Bar Principal')` | `= 0` o `> 1` levanta exception | Linia 33-49 |
| `SELECT id FROM public.uoms WHERE abbr IN ('pz','pza') OR name IN ('pieza','piezas')` | `> 1` levanta exception; `IS NULL` levanta exception | Linia 51-69 |
| `SELECT id FROM public.providers WHERE lower(trim(name)) = lower('Proveedor General')` | `> 1` levanta exception; NULL bloquea INSERT de sku='10009' | Linia 71-83, 284-291 |

### 1.3 Relaciones FK verificadas

| Tabla      | Columna   | Referencia          | Implicacion para seed           |
|------------|-----------|---------------------|---------------------------------|
| `centers`  | `org_id`  | `organizations(id)` | Org debe insertarse antes       |
| `categories` | `org_id` | `organizations(id)` | Org requerida (FK)             |
| `materials` | `buy_uom_id`, `sell_uom_id` | `uoms(id)` | UOM requerida antes INSERT materials |
| `inventory` | `center_id` | `centers(id)`      | Centro requerido antes INSERT inventory |
| `inventory` | `material_id` | `materials(id)`  | Material requerido antes INSERT inventory |

### 1.4 Trigger critico: `handle_new_material`

La migracion `20260414045424` define un trigger que al insertar un material
ejecuta:

```sql
INSERT INTO public.inventory (material_id, center_id, ...)
VALUES (NEW.id, (SELECT id FROM public.centers LIMIT 1), 0, 0, 0);
```

Si no existe ningun centro cuando `20260714132000` inserta materiales nuevos
(sku `7501035010559`, `7501035010560`, `10009`), el trigger inserta
`center_id = NULL`. Esto no viola el esquema (columna sin NOT NULL), pero
crea filas con centro nulo.

La migracion `20260714132000` luego hace `INSERT INTO inventory ... ON CONFLICT (material_id, center_id) DO UPDATE`. El conflicto solo se dispara si
`(material_id, center_id)` coincide. Con center_id NULL en la fila del trigger
y el center_id del Bar Principal en la insercion explicita, NO hay conflicto,
por lo que se crean 2 filas por material (una con center_id NULL, otra
correcta). Esto es aceptable funcionalmente pero no ideal.

**Conclusion:** Para que el trigger use el centro correcto, 'Bar Principal'
debe existir ANTES de que `20260714132000` inserte materiales.

---

## 2. Datos Incluidos en el Seed

| Dato semilla           | Valor                        | Motivo                                           | Migracion o dependencia          | Metodo idempotente             |
|------------------------|------------------------------|--------------------------------------------------|----------------------------------|--------------------------------|
| Organizacion           | `Organizacion Test Local`    | Requerida literalmente (count=1)                 | `20260714132000` linea 21        | `ON CONFLICT (id) DO NOTHING`  |
| Centro                 | `Bar Principal` (tipo 'bar') | Requerido literalmente (nombre exacto, case-insensitive) | `20260714132000` linea 37, `20260715221000`, `finalize_pos_sale` | `ON CONFLICT (id) DO NOTHING` |
| UOM                    | `Pieza`, abbr `pz`           | Requerida para materiales (pieza/pz/pza)         | `20260714132000` linea 53-68     | `ON CONFLICT (id) DO NOTHING`  |
| Proveedor General      | `Proveedor General`, RFC `XAXX010101000` | Requerido para INSERT sku='10009' cuando no existe | `20260714132000` linea 284-291 | `ON CONFLICT (id) DO NOTHING` |

### UUIDs fijos utilizados

| Tabla           | UUID fijo                                      |
|-----------------|------------------------------------------------|
| `organizations` | `10000000-0000-0000-0000-000000000001`         |
| `centers`       | `10000000-0000-0000-0000-000000000002`         |
| `uoms`          | `10000000-0000-0000-0000-000000000003`         |
| `providers`     | `10000000-0000-0000-0000-000000000004`         |

UUIDs fijos usados para hacer las relaciones (FK `org_id`, `center_id`) predecibles y el seed completamente determinista.

---

## 3. Datos Deliberadamente Excluidos

| Dato                    | Razon de exclusion                                                    |
|-------------------------|-----------------------------------------------------------------------|
| Usuarios / `app_profiles` | Ninguna migracion lo requiere; depende de `auth.users` (auth schema) |
| Sesiones de caja        | Ninguna migracion lo requiere; son datos operativos, no estructurales |
| Mesas / `tables`        | Ninguna migracion lo requiere                                         |
| Categorias              | Creadas por `20260714132000` si no existen                            |
| Materiales              | Creados o actualizados por `20260714132000`                           |
| Inventario              | Poblado por trigger + migracion, no por seed                          |
| Cuentas financieras     | Sembradas por `20260810200000` (ledger migration)                     |
| Roles y permisos        | Sembrados por migraciones propias (`20260417113000`, etc.)            |

---

## 4. Bloqueador Critico: Orden de Ejecucion de Supabase

### 4.1 Comportamiento confirmado de `supabase db reset`

`supabase db reset --local` ejecuta en este orden:
1. Elimina y recrea la base de datos
2. Aplica las 28 migraciones en orden de timestamp
3. **Aplica `seed.sql` DESPUES de todas las migraciones**

Fuente confirmada en `supabase/config.toml`:
```toml
[db.seed]
# If enabled, seeds the database after migrations during a db reset.
enabled = false
sql_paths = []
```

### 4.2 Consecuencia para la migracion `20260714132000`

`seed.sql` se ejecutaria en el paso 3, DESPUES de que la migracion
`20260714132000` ya intento ejecutarse en el paso 2 y fallo por falta
de datos. Por lo tanto, **`seed.sql` no puede satisfacer las
dependencias de datos de esa migracion**.

### 4.3 Problema adicional: seed deshabilitado en config.toml

`enabled = false` y `sql_paths = []` en `config.toml` significan que
`supabase/seed.sql` no se aplicaria en absoluto con la configuracion
actual. Para que sea aplicado, se requiere:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

Esta actualizacion de `config.toml` NO fue realizada en esta tarea
(fuera del alcance autorizado).

---

## 5. Solucion Requerida para Desbloquear `db reset`

Para que `supabase db reset --local` aplique las 28 migraciones sin error,
los datos base deben estar disponibles ANTES de que `20260714132000` se ejecute.

### Solucion recomendada: Nueva migracion de inicializacion local

Crear un nuevo archivo de migracion con timestamp entre `20260420144000`
y `20260714132000`, por ejemplo:

```
supabase/migrations/20260701000000_local_seed_base_data.sql
```

Con el mismo contenido que `supabase/seed.sql` (mismos INSERT idempotentes).
Esta es una NUEVA migracion, no una modificacion de migraciones existentes.

**Ventajas:**
- Se ejecuta durante el paso 2 (migraciones), antes de `20260714132000`
- Los datos estan disponibles cuando `20260714132000` los necesita
- El trigger `handle_new_material` usa el centro correcto
- Idempotente (ON CONFLICT DO NOTHING)

**Consideracion:** Esta migracion existe solo en el repositorio local y
nunca deberia aplicarse a DEV o PRD (son datos ficticios de prueba). Puede
marcarse explicitamente con `-- LOCAL ONLY` y manejarse con `migration repair`
si fuera necesario en el futuro.

**Autorizacion requerida:** SI - creacion de nuevo archivo de migracion.

---

## 6. Veredicto

```
SEED LOCAL BLOQUEADO
```

`supabase/seed.sql` fue creado con los datos correctos e idempotentes.
Sin embargo, por diseno de Supabase, el seed se ejecuta DESPUES de las
migraciones, por lo que no puede satisfacer la dependencia de datos de
`20260714132000`. Adicionalmente, el seed esta deshabilitado en
`config.toml` (`enabled = false`).

Para desbloquear `supabase db reset --local` se requiere:

| Accion                                              | Autorizacion requerida |
|-----------------------------------------------------|------------------------|
| Crear `supabase/migrations/20260701000000_local_seed_base_data.sql` | SI |
| Actualizar `supabase/config.toml` ([db.seed] enabled=true, sql_paths) | Opcional si se usa la migracion |

---

## 7. Confirmacion de Ejecucion

- Ninguna migracion fue ejecutada durante esta tarea.
- Ningun comando `supabase db reset`, `db push` o `migration repair` fue ejecutado.
- No se ejecuto SQL contra DEV ni PRD.
- No se realizaron commits ni pushes.
- No se modificaron migraciones existentes.
- Cambios realizados: creacion de `supabase/seed.sql` y `docs/FASE3_R4_SEED_LOCAL.md`.

---

*Documento generado por inspeccion estatica de migraciones. Datos 100% ficticios.*
