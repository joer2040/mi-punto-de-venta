# FASE3 - R4: Preflight Pruebas Conductuales (PostgreSQL Local)

**Generado:** 2026-08-13  
**Ejecutor:** joer2040  
**Proyecto DEV:** rtkdrnfqihulqdhixxzf  
**Script objetivo:** `sql/local/2026-08-11_test_behavioral_ledger_local.sql`  
**Resultado:** BLOQUEADO - 3 prerequisitos pendientes

---

## 1. Inspeccion de Seguridad del Script

Script analizado: NO ejecutado. Inspeccion estatica unicamente.

### 1.1 Estructura general

| Componente          | Detalle                                                |
|---------------------|--------------------------------------------------------|
| Total de pruebas    | 13 (TB-01 a TB-13)                                     |
| Metodo de aislamiento | `BEGIN / ROLLBACK` en cada prueba                    |
| Escrituras permanentes | NINGUNA - todo se revierte                           |
| Objetivo de entorno | PostgreSQL local con TODAS las migraciones aplicadas   |
| Prohibicion explicita | "PROHIBIDO EJECUTAR EN DEV" (linea 3 del script)    |

### 1.2 Bloque PREFLIGHT interno (lineas 34-~80)

El script tiene su propio bloque `DO $$` de preflight que valida antes de continuar:

| Verificacion preflight interna     | Condicion esperada                                      |
|------------------------------------|----------------------------------------------------------|
| Ledger inactivo                    | `ledger_cutover_at IS NULL`                             |
| Cuenta `5102` presente             | `financial_accounts.code = '5102' AND is_system = true` |
| Cuenta `5201` ausente              | no debe existir en `financial_accounts`                  |
| RPCs del ledger presentes          | 6 funciones requeridas en `information_schema.routines`  |

### 1.3 Catalogo de pruebas

| ID    | Descripcion                                         | Patron de aislamiento |
|-------|-----------------------------------------------------|-----------------------|
| TB-01 | Metodo `Cripto` rechazado                           | BEGIN / ROLLBACK      |
| TB-02 | Monto 0 rechazado                                   | BEGIN / ROLLBACK      |
| TB-03 | Monto negativo rechazado                            | BEGIN / ROLLBACK      |
| TB-04 | Suma de pagos != total rechazada atomicamente        | BEGIN / ROLLBACK      |
| TB-05 | Efectivo sin sesion de caja activa rechazado        | BEGIN / ROLLBACK      |
| TB-06 | Solo Tarjeta sin sesion - permitido                 | BEGIN / ROLLBACK      |
| TB-07 | Mixto Efectivo+Tarjeta - split correcto             | BEGIN / ROLLBACK      |
| TB-08 | Transferencia debita cuenta 1103                    | BEGIN / ROLLBACK      |
| TB-09 | Idempotencia - misma clave repite resultado         | BEGIN / ROLLBACK      |
| TB-10 | Idempotencia - misma clave + payload diferente = conflicto | BEGIN / ROLLBACK |
| TB-11 | Asiento no balanceado bloqueado por trigger         | BEGIN / ROLLBACK      |
| TB-12 | Auto-autorizacion rechazada por CHECK constraint    | BEGIN / ROLLBACK      |
| TB-13 | `get_cash_sessions_report` disponible (solo lectura)| Lectura directa       |

**Veredicto de seguridad: APTO**  
El script no produce escrituras permanentes. Puede ejecutarse de forma segura una vez que el entorno local este correctamente configurado.

---

## 2. Estado del Entorno Local

### 2.1 Supabase local

| Item                  | Estado                                         |
|-----------------------|------------------------------------------------|
| Supabase local        | ACTIVO (confirmado via `supabase status`)      |
| PostgreSQL version    | 17.6 (PostgreSQL 17.6.1)                       |
| URL local             | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Docker container      | `supabase_db_mi-punto-de-venta` - RUNNING      |
| `psql` en PATH host   | NO disponible                                  |
| `psql` via Docker     | DISPONIBLE (`docker exec supabase_db_mi-punto-de-venta psql`) |

### 2.2 Esquema publico local

```sql
-- Consulta ejecutada:
docker exec supabase_db_mi-punto-de-venta psql -U postgres -d postgres \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

-- Resultado:
 count
-------
     0
```

**Tablas en `public`: 0**  
La base de datos local existe pero no tiene ninguna migracion aplicada.

### 2.3 Migraciones disponibles localmente (no aplicadas)

28 archivos en `supabase/migrations/`:

| # | Version           | Nombre abreviado                                    |
|---|-------------------|-----------------------------------------------------|
|  1| 20260414045424    | remote_schema                                       |
|  2| 20260414060917    | remote_schema                                       |
|  3| 20260414123500    | cleanup_legacy_user_sql_functions                   |
|  4| 20260415093000    | harden_public_access                                |
|  5| 20260415100500    | fix_function_search_paths                           |
|  6| 20260416093000    | link_materials_to_providers                         |
|  7| 20260417113000    | seed_material_movements_permissions                 |
|  8| 20260417114000    | create_inventory_movement_documents                 |
|  9| 20260417122000    | seed_material_movements_report_permission           |
| 10| 20260418103000    | add_table_order_reservation_flag                    |
| 11| 20260419170000    | support_general_provider_purchases                  |
| 12| 20260420143000    | add_cash_control_schema                             |
| 13| 20260420144000    | seed_cash_control_permissions                       |
| 14| 20260714132000    | catalogo_cocteleria_extras_botella                  |
| 15| 20260715221000    | harden_finalize_pos_sale                            |
| 16| 20260715223000    | make_botella_sellable                               |
| 17| 20260716123000    | reconcile_table_order_reservation_flag              |
| 18| 20260803183000    | enforce_cash_session_pos_invariant                  |
| 19| 20260803232300    | fix_active_pos_operation_count                      |
| 20| 20260804010500    | open_cash_session_atomic                            |
| 21| 20260810200000    | base_financial_schema (LEDGER)                      |
| 22| 20260811110000    | activate_ledger_rpc (LEDGER)                        |
| 23| 20260811130000    | extend_cash_sessions_ledger (LEDGER)                |
| 24| 20260811140000    | sale_financial_entries (LEDGER)                     |
| 25| 20260811150000    | purchase_financial_entries (LEDGER)                 |
| 26| 20260811160000    | fondos_reversas (LEDGER)                            |
| 27| 20260811170000    | reportes_ledger (LEDGER)                            |
| 28| 20260812100000    | fix_account_5201_to_5102 (LEDGER)                   |

---

## 3. Bloqueadores Identificados

### BLOQUEADOR 1: Base local sin migraciones

**Descripcion:**  
La base de datos local tiene 0 tablas en el esquema `public`. Ninguna de las 28 migraciones ha sido aplicada. El script de prueba conductual requiere el esquema completo incluyendo la migracion `20260812100000`.

**Solucion requerida:**  
Ejecutar `supabase db reset` en el entorno local. Este comando:
1. Elimina y recrea la base local desde cero
2. Aplica todas las migraciones en orden
3. Ejecuta `seed.sql` si existe

**Autorizacion requerida:** SI - `supabase db reset` esta en la lista de operaciones que requieren autorizacion explicita del usuario.

**Riesgo:** LOCAL UNICAMENTE - no afecta DEV ni PRD. Solo borra datos locales efimeros.

---

### BLOQUEADOR 2: `psql` no disponible en PATH del host

**Descripcion:**  
El comando `psql` no esta instalado ni en el PATH del sistema Windows. El script se ejecuta con:  
```
psql -U postgres -d <db_local> -f sql/local/2026-08-11_test_behavioral_ledger_local.sql
```

**Solucion disponible (sin instalacion adicional):**  
`psql` esta disponible dentro del contenedor Docker `supabase_db_mi-punto-de-venta`. Se puede ejecutar via:
```powershell
# Copiar el archivo al contenedor y ejecutar
docker cp sql/local/2026-08-11_test_behavioral_ledger_local.sql `
  supabase_db_mi-punto-de-venta:/tmp/test_behavioral.sql

docker exec supabase_db_mi-punto-de-venta `
  psql -U postgres -d postgres -f /tmp/test_behavioral.sql
```

**Autorizacion requerida:** NO - tecnica alternativa equivalente. No requiere instalacion de software adicional.

**Nota:** Requiere que el BLOQUEADOR 1 este resuelto primero (base con migraciones aplicadas).

---

### BLOQUEADOR 3: Marcadores de datos de prueba sin sustituir

**Descripcion:**  
El script contiene 5 marcadores de sustitucion que deben reemplazarse con UUIDs y valores reales de la base local antes de ejecutar:

| Marcador              | Descripcion                                             | Fuente                           |
|-----------------------|---------------------------------------------------------|----------------------------------|
| `<test_table_id>`     | UUID de una tabla con `status='ocupada'` y `current_order_id IS NOT NULL` | `public.tables`  |
| `<test_order_id>`     | UUID del `table_orders` correspondiente a esa tabla     | `public.table_orders`            |
| `<test_material_id>`  | UUID de un material con `is_active=true` y precio definido | `public.materials`            |
| `<test_user_id>`      | UUID de `app_profiles` con `is_superadmin=true`         | `public.app_profiles`            |
| `<test_item_price>`   | Precio unitario del material (numeric)                  | `public.material_prices` o equiv |

**Solucion requerida:**  
Una vez que el BLOQUEADOR 1 este resuelto (base con migraciones + datos seed), consultar la base local para obtener los UUIDs reales y sustituirlos en el script (o en una copia de trabajo del script).

**Autorizacion requerida:** NO - operacion de lectura + edicion de script local.

**Nota:** Si el `seed.sql` de Supabase no incluye datos de prueba suficientes, sera necesario insertar datos minimos manualmente o mediante un script de fixtures.

---

## 4. Plan de Resolucion

Para que R4 pueda ejecutarse, los bloqueadores deben resolverse en este orden:

| Paso | Accion                                          | Autorizacion | Riesgo    |
|------|--------------------------------------------------|--------------|-----------|
| 4.1  | Autorizar y ejecutar `supabase db reset`         | REQUERIDA    | Local solo|
| 4.2  | Verificar que las 28 migraciones quedaron aplicadas | --        | Ninguno   |
| 4.3  | Consultar base local para obtener UUIDs de prueba| --          | Ninguno   |
| 4.4  | Sustituir los 5 marcadores en el script          | --           | Ninguno   |
| 4.5  | Ejecutar script via `docker exec psql`           | --           | Ninguno   |

---

## 5. Resumen de Estado

| Item                        | Estado                  |
|-----------------------------|-------------------------|
| Inspeccion de seguridad del script | APROBADO          |
| Supabase local activo       | APROBADO                |
| PostgreSQL local accesible  | APROBADO (via Docker)   |
| `psql` disponible           | APROBADO (via Docker exec) |
| Base local con migraciones  | BLOQUEADOR 1 - pendiente |
| `psql` en host PATH         | BLOQUEADOR 2 - alternativa Docker disponible |
| Marcadores de prueba        | BLOQUEADOR 3 - pendiente datos seed |

**Estado R4:** BLOQUEADO - requiere autorizacion de `supabase db reset` para continuar.

---

*Documento generado por inspeccion estatica. Ninguna migracion, DDL, DML, deploy, commit ni push fue ejecutado durante este preflight.*
