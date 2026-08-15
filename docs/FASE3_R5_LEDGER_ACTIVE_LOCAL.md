# FASE3 - R5: Simulación de Ledger Activo — Local

**Fecha:** 2026-08-15  
**Estado:** COMPLETADO — TODOS LOS TESTS PASS (post-M29)

---

> **AVISO DE ENTORNO**  
> Script exclusivamente local. Prohibido ejecutar en DEV o PRD.

---

## 1. Objetivo

Verificar el comportamiento del sistema con ledger activo:

1. Infraestructura ledger (journal_entries, triggers, reportes).
2. `finalize_pos_sale` con cutover en el **futuro** (venta pre-corte): no crea entradas contables.
3. `finalize_pos_sale` con cutover en el **presente** (venta post-corte): crea journal_entry + líneas + balances correctos.

---

## 2. Resultados de Ejecución (post-M29)

| Test | Estado | Descripción |
|------|--------|-------------|
| TB-R5-01 | **PASS** | Trigger rechazó asiento sin líneas |
| TB-R5-02 | **PASS** | Asiento balanceado confirmado; `get_account_balances` correcto |
| TB-R5-03 | **PASS** | `get_journal_report` devuelve asientos del día |
| TB-R5-04 | **PASS** | `get_account_ledger` muestra `running_balance` correcto |
| TB-R5-05 | **PASS** | `finalize_pos_sale` pre-corte: venta OK, `journal_entry_id=null` |
| TB-R5-06 | **PASS** | `finalize_pos_sale` post-corte: `journal_entry_id` creado, 1103=150.00, 4101=150.00 |

---

## 3. BUG-M24-001: GROUP BY inválido en `finalize_pos_sale` — CORREGIDO (M29)

### Descripción

`finalize_pos_sale` contenía un error SQL en la sentencia que inserta líneas de asiento contable. El error **solo se manifestaba cuando el ledger estaba activo** (`ledger_cutover_at IS NOT NULL` y `sale_created_at >= ledger_cutover_at`). En R4, el ledger estaba inactivo y esa rama nunca se ejecutó.

### Ubicación original del bug

| Campo | Valor |
|-------|-------|
| Migración original | `supabase/migrations/20260811140000_sale_financial_entries.sql` |
| Línea aprox. | 577–590 (INSERT INTO journal_lines ... GROUP BY) |
| Función | `public.finalize_pos_sale(uuid, jsonb, jsonb, uuid, text)` |

### Error observado (antes de M29)

```
ERROR: column "pay.value" must appear in the GROUP BY clause
       or be used in an aggregate function
```

### Causa raíz

```sql
-- BUGGY (M24 original)
insert into public.journal_lines
  (journal_entry_id, financial_account_id, debit, credit, description)
select
  v_journal_entry_id,
  case lower(trim(pay->>'method'))
    when 'efectivo'      then v_acct_caja_op
    when 'tarjeta'       then v_acct_banco
    when 'transferencia' then v_acct_banco
  end,
  sum((pay->>'amount')::numeric(14,2)),
  0,
  'Cobro ' || trim(pay->>'method') || ' — venta ' || v_document_number  -- ← BUG
from jsonb_array_elements(p_payments) pay
group by lower(trim(pay->>'method'));                                     -- ← trim() no está aquí
```

`trim(pay->>'method')` en el campo `description` referenciaba `pay` desde `jsonb_array_elements`, pero no estaba incluido en el `GROUP BY` (que tenía `lower(trim(...))`). PostgreSQL rechaza la sentencia en tiempo de ejecución porque las dos expresiones no son funcionalmente equivalentes.

### Impacto

- Afectaba **todos los métodos de pago** (Efectivo, Tarjeta, Transferencia).
- El sistema **no podía registrar ninguna venta POS** con ledger activo.
- El bug estaba latente desde M24; no se descubrió en R4 porque el ledger estaba inactivo.

### Corrección aplicada (M29)

**Migración:** `supabase/migrations/20260815100000_fix_finalize_pos_sale_groupby.sql`

**Fix mínimo — una línea cambiada:**

```sql
-- ANTES (buggy)
group by lower(trim(pay->>'method'));

-- DESPUÉS (M29)
group by lower(trim(pay->>'method')), trim(pay->>'method');
```

La función reemplazada en M29 (`CREATE OR REPLACE FUNCTION`) preserva integramente:
- Firma: `public.finalize_pos_sale(uuid, jsonb, jsonb, uuid, text)`
- `SECURITY DEFINER`
- `set search_path to public, pg_temp`
- Permisos: `REVOKE ALL FROM public, anon, authenticated; GRANT EXECUTE TO service_role`
- Toda la lógica de negocio (validaciones, cubetas, idempotencia, audit_events, etc.)

### Evidencia de aplicación

```
Connecting to local database...
Applying migration 20260815100000_fix_finalize_pos_sale_groupby.sql...
Local database is up to date.
```

---

## 4. Hallazgos de Infraestructura Ledger

Todos los componentes de infraestructura del ledger funcionan correctamente:

### Trigger `assert_journal_entry_balanced`
- Rechaza UPDATE a `status='confirmed'` si el asiento no tiene líneas.
- Rechaza asientos con débitos ≠ créditos (verificado en R4 TB-11).

### `get_account_balances()`
- Refleja correctamente los asientos confirmados dentro de la misma transacción.
- Cuentas tipo `asset/expense`: balance = débitos − créditos.
- Cuentas tipo `equity/income/liability`: balance = créditos − débitos.
- Verificado: 1101=1000.00, 3101=1000.00 (asiento inicial); 1103=150.00, 4101=150.00 (venta TB-R5-06).

### `get_journal_report(from, to)`
- Devuelve asientos confirmados en el rango. Verificado: 2 líneas para asiento inicial del día.

### `get_account_ledger(code)`
- Muestra mayor con `running_balance` acumulado. Verificado: 1101 debit=1000, running_balance=1000.

### `finalize_pos_sale` — rama pre-corte (TB-R5-05)
- Con `ledger_cutover_at = now() + 1 hour`, la condición `v_sale_created_at >= v_ledger_cutover_at` es **false**.
- La función completa exitosamente: `sales` + `sale_items` + `inventory_movements`.
- `journal_entry_id = null` y `financial_operation_id = null` en la respuesta y en `sales`.

### `finalize_pos_sale` — rama post-corte (TB-R5-06, post-M29)
- Con `ledger_cutover_at = now()`, la condición es **true**.
- La función crea `journal_entry` (confirmed) + `journal_lines` debit/credit + `financial_operations` + `financial_payments`.
- Respuesta incluye `journal_entry_id` no nulo.
- Balances correctos: 1103 (Banco/Tarjeta) = 150.00, 4101 (Ingresos) = 150.00.

---

## 5. Diseño del Script R5

### Restricciones implementadas

| Restricción | Solución |
|-------------|----------|
| `activate_ledger()` no llamable (mesas ocupadas de R4) | INSERT directo a `ledger_settings` |
| `open_cash_session_atomic()` no llamable (mesas ocupadas de R4) | INSERT directo a `cash_sessions` |
| Triggers M18 para ocupar mesa | Caja abierta dentro de la transacción satisface el check |
| Sin bypass de triggers | No requerido (secuencia: caja abierta → mesa ocupada) |
| Todos los cambios rollback | Un único `BEGIN/ROLLBACK` externo |

### UUIDs R5

| Fixture | UUID | Propósito |
|---------|------|-----------|
| auth.users / app_profiles | `20000000-…-0001` | Usuario temporal R5 |
| tables | `20000000-…-0002` | Mesa T-R5-LEDGER |
| table_orders TB-R5-05 | `20000000-…-0011` | Orden para test pre-corte |
| table_orders TB-R5-06 | `20000000-…-0012` | Orden para test post-corte |
| materials / inventory | `20000000-…-0009` | Material R5 Ledger |

Rango `20000000-*` no colisiona con R4 (`10000000-*`).

### Secuencia de ejecución

```
1. PRE: validar entorno (ledger inactivo, cuentas, Botella, Bar Principal)
2. SETUP: auth.users, app_profiles, materials, inventory, tables(libre), ledger_settings(NOW())
3. TB-R5-01: journal_entry vacío → trigger rechaza
4. TB-R5-02: journal_entry balanceado → confirmed → get_account_balances correcto
5. TB-R5-03: get_journal_report devuelve asiento del día
6. TB-R5-04: get_account_ledger running_balance correcto
7. cash_sessions INSERT (abre caja directamente)
8. TB-R5-05: ledger_settings.cutover_at = NOW()+1h → finalize_pos_sale → venta OK, ledger null
9. TB-R5-06: ledger_settings.cutover_at = NOW() → finalize_pos_sale → asiento contable completo (post-M29)
10. ROLLBACK
```

---

## 6. Ejecución

```powershell
docker cp sql/local/2026-08-14_test_ledger_active_local.sql `
  supabase_db_mi-punto-de-venta:/tmp/test_r5.sql
docker exec supabase_db_mi-punto-de-venta `
  bash -c "psql -U postgres -d postgres -f /tmp/test_r5.sql 2>&1"
```

---

## 7. Estado

| Item | Estado |
|------|--------|
| Script R5 creado | SI |
| TB-R5-01 a TB-R5-06 | **PASS** |
| BUG-M24-001 detectado | SI (confirmado en R5 inicial) |
| M29 creada | SI — `20260815100000_fix_finalize_pos_sale_groupby.sql` |
| M29 aplicada (local) | SI — `npx supabase migration up --local` |
| TB-R5-06 post-M29 | **PASS** — journal_entry_id creado, balances correctos |
| Cambios en DEV | NINGUNO |
| Commits o pushes realizados | NINGUNO |

---

*Última ejecución: 2026-08-15. Sin errores SQL. Ningún cambio persiste (BEGIN/ROLLBACK). M29 aplicada solo en entorno LOCAL.*
