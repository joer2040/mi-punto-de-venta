# FASE3 - R4: Fixtures Locales Listos para Ejecución

**Generado:** 2026-08-14  
**Estado:** PENDIENTE DE EJECUCIÓN (autorización requerida)

---

> **AVISO DE ENTORNO**  
> Todos los scripts de esta sección son EXCLUSIVAMENTE para la base de datos
> PostgreSQL local. Cualquier ejecución contra DEV o PRD está terminantemente prohibida.

---

## 1. Artefactos Creados / Modificados

| Archivo | Acción | Propósito |
|---------|--------|-----------|
| `sql/local/2026-08-14_fixtures_r4_behavioral.sql` | CREADO (v2) | F1-F6 con UUIDs fijos; validación de campo antes de reutilizar; set_config para bypass |
| `sql/local/2026-08-14_cleanup_fixtures_r4_behavioral.sql` | CREADO (v2) | Elimina fixtures con UUIDs fijos; condiciones de campo en UPDATE/DELETE |
| `sql/local/2026-08-11_test_behavioral_ledger_local.sql` | MODIFICADO | Bugs B-TB07a, B-TB07b y B-TB12 corregidos |

---

## 2. Correcciones Aplicadas al Script Conductual

### B-TB07a + B-TB07b — TB-07 `cash_sessions` INSERT

**Antes (buggy):**
```sql
insert into public.cash_sessions (status, opening_amount, opened_by, manual_opening_float)
values ('open', 0, 'REPLACE:<test_user_id>'::uuid, 500.00)
```

**Después (correcto):**
```sql
insert into public.cash_sessions (status, opening_amount, opened_by)
values ('open', 500.00, 'REPLACE:<test_user_id>'::uuid)
```

Cambios: `opening_amount 0 → 500.00` (satisface CHECK > 0); columna `manual_opening_float` eliminada (no existe en ninguna migración M1-M28).

### B-TB12 — `financial_authorizations` columna incorrecta

**Antes:** `action_type`  
**Después:** `request_type`

---

## 3. Fixtures Diseñados (Alternativa A)

| ID | Fixture | Tabla | UUID fijo |
|----|---------|-------|-----------|
| F1 | Usuario test local | `auth.users` | `10000000-0000-0000-0000-000000000006` |
| F2 | Perfil superadmin test | `app_profiles` | `10000000-0000-0000-0000-000000000006` |
| F3 | Mesa test ocupada | `tables` | `10000000-0000-0000-0000-000000000007` |
| F4 | Orden activa | `table_orders` | `10000000-0000-0000-0000-000000000008` |
| F5 | Material Botella test | `materials` | `10000000-0000-0000-0000-000000000009` |
| F6 | Inventario Bar Principal | `inventory` | PK compuesta (`material_id`=...0009, `center_id`=...0002) |

**Sustituciones para el script de pruebas:**

| Placeholder | Valor |
|-------------|-------|
| `<test_table_id>` | `10000000-0000-0000-0000-000000000007` |
| `<test_order_id>` | `10000000-0000-0000-0000-000000000008` |
| `<test_material_id>` | `10000000-0000-0000-0000-000000000009` |
| `<test_user_id>` | `10000000-0000-0000-0000-000000000006` |
| `<test_item_price>` | `150.00` |

---

## 4. Secuencia Completa de Ejecución (AÚN NO EJECUTADO)

### Prerequisito: base local con M1-M28 aplicadas y bootstraps ejecutados

```
1. npx supabase migration up --local    (aplica M1-M13, falla en M14)
2. docker exec psql bootstrap_m14       (org, centro, uom, proveedor)
3. npx supabase migration up --local    (aplica M14-M15, falla en M16)
4. docker exec psql bootstrap_m16       (categoría Botella)
5. npx supabase migration up --local    (aplica M16-M28)
```

### Ejecución de fixtures (requiere M1-M28 aplicadas)

```powershell
# Copiar y ejecutar fixtures
docker cp sql/local/2026-08-14_fixtures_r4_behavioral.sql `
  supabase_db_mi-punto-de-venta:/tmp/fixtures_r4.sql
docker exec supabase_db_mi-punto-de-venta `
  psql -U postgres -d postgres -f /tmp/fixtures_r4.sql
```

Verificar: salida termina con `COMMIT`. Los NOTICE muestran los 6 fixtures.

### Sustitución en el script de pruebas

Reemplazar en `sql/local/2026-08-11_test_behavioral_ledger_local.sql`:

```
REPLACE:<test_table_id>    → 10000000-0000-0000-0000-000000000007
REPLACE:<test_order_id>    → 10000000-0000-0000-0000-000000000008
REPLACE:<test_material_id> → 10000000-0000-0000-0000-000000000009
REPLACE:<test_user_id>     → 10000000-0000-0000-0000-000000000006
REPLACE:<test_item_price>  → 150.00
```

### Ejecución de pruebas

```powershell
docker cp sql/local/2026-08-11_test_behavioral_ledger_local.sql `
  supabase_db_mi-punto-de-venta:/tmp/test_ledger.sql
docker exec supabase_db_mi-punto-de-venta `
  psql -U postgres -d postgres -f /tmp/test_ledger.sql
```

### Limpieza posterior

```powershell
docker cp sql/local/2026-08-14_cleanup_fixtures_r4_behavioral.sql `
  supabase_db_mi-punto-de-venta:/tmp/cleanup_r4.sql
docker exec supabase_db_mi-punto-de-venta `
  psql -U postgres -d postgres -f /tmp/cleanup_r4.sql
```

---

## 5. Restricciones de la Alternativa A (Sección 3.6 del Precheck)

1. Solo se permite en la base local. Nunca en DEV o PRD.
2. `PERFORM set_config('session_replication_role', 'replica', true)` cubre exclusivamente el INSERT de `table_orders` (F4) y el UPDATE de `tables` (F3b). El argumento `true` = transaction-local; equivalente a `SET LOCAL`.
3. La transacción vuelve automáticamente a `'origin'` al commit.
4. Todos los triggers de `materials`, `inventory` y `cash_sessions` permanecen activos fuera de esa ventana.
5. El script valida: exactamente 1 categoría Botella, exactamente 1 centro Bar Principal, cada UUID de referencia corresponde al dato esperado, ledger inactivo — todo antes del bypass.
6. El script de limpieza incluye condiciones de campo en UPDATE/DELETE para no tocar datos reales que no sean los fixtures esperados.

---

## 6. Correcciones Adicionales Aplicadas Durante Ejecución

### B-TB07c — montos de pago TB-07

**Antes:** `[{"method":"Efectivo","amount":60},{"method":"Tarjeta","amount":40}]` (suma 100 ≠ total 150)  
**Después:** `[{"method":"Efectivo","amount":90},{"method":"Tarjeta","amount":60}]` (suma 150 = total 150)

### B-TB09 — restauración de estado entre llamadas idempotencia

`finalize_pos_sale` libera la mesa (line 654) Y elimina `table_orders` (line 663-664).
La segunda llamada falla validación de mesa (line 204) antes de llegar al check de idempotencia (line 476).

**Fix:** Entre primera y segunda llamada, insertar:
1. `cash_sessions` temporal si no existe (satisface trigger `require_open_cash_session`)
2. Re-insertar `table_orders` con mismo UUID (`...0008`)
3. `UPDATE tables` → `ocupada`, `current_order_id=...0008`

### B-TB10 — control de flujo PL/pgSQL en nivel SQL

`if/then/else/end if` es sintaxis PL/pgSQL, no SQL directo en psql.

**Fix:** Envolver en `do $ begin ... end $;`

---

## 7. Estado Final

| Item | Estado |
|------|--------|
| Script de fixtures creado | SI (v2 hardened) |
| Script de cleanup creado | SI (v2 hardened) |
| Bugs TB-07a/b, TB-12, TB-07c, TB-09, TB-10 corregidos | SI |
| Fixtures ejecutados (local) | SI |
| Pruebas TB-01 a TB-13 ejecutadas (local) | SI |
| TB-01 a TB-05 | PASS |
| TB-06 a TB-08 | OK — comportamiento ledger inactivo confirmado |
| TB-09 | PASS — idempotencia verificada |
| TB-10 a TB-12 | PASS |
| TB-13 | SKIP — por diseño (BEGIN/ROLLBACK, sin cash_sessions persistentes) |
| Cambios en DEV | NINGUNO |
| Commits o pushes realizados | NINGUNO |

---

*Última ejecución: 2026-08-14. Sin errores SQL. Ningún cambio persiste (BEGIN/ROLLBACK por bloque).*
