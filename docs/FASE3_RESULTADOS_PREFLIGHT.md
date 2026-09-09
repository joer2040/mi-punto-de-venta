# FASE 3 — Resultados Preflight DEV + Diseño de Pruebas Locales

**Fecha de ejecución:** 2026-08-11  
**Rama:** `chore/code-cleanup`  
**Proyecto DEV:** `rtkdrnfqihulqdhixxzf`  
**Ejecutado por:** Claude Code (sesión Fase 3.1)

---

## 1. Confirmación de Seguridad Previa

El script `sql/dev/2026-08-11_test_schema_readonly.sql` fue inspeccionado antes de ejecutarse.

| Categoría de riesgo | Hallazgo |
|---|---|
| DDL (`CREATE`, `ALTER`, `DROP`, `GRANT`) | **NINGUNO** |
| DML (`INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE`) | **NINGUNO** |
| Llamadas a RPCs con efectos persistentes | Una sola: `get_account_balances(null)` — función de reporte, solo lectura, `SECURITY DEFINER` sin escritura |
| Comandos administrativos | **NINGUNO** |
| `activate_ledger` | **NO presente** |
| `supabase db push` / `migration repair` | **NO ejecutados** |

**Veredicto de seguridad:** APROBADO. Script 100% de lectura. Seguro para DEV.

---

## 2. Resultados Ejecutados en DEV

Script ejecutado: `sql/dev/2026-08-11_test_schema_safe_run.sql`  
Método: `npx supabase db query --linked --file <script>` — **solo lectura**  
Resultado del comando: EXIT 0 — todos los bloques completaron sin excepción no capturada.

| Test | Objeto verificado | Esperado | Encontrado | Estado | Evidencia |
|---|---|---|---|---|---|
| **T-01** | 11 tablas del ledger | Todas presentes | Todas presentes | **PASS** | `11 tablas del ledger presentes` |
| **T-02** | 7 columnas extendidas (sales, purchases, cash_sessions) | Todas presentes | Todas presentes | **PASS** | `7 columnas extendidas presentes` |
| **T-03** | Catálogo: 11 cuentas incluyendo 5102, sin 5201 | 5102 presente, 5201 ausente | 5102 **ausente**, 5201 **presente** | **FAIL (esperado)** | `cuentas faltantes: 5102 \| 5201 AÚN existe → migración 20260812100000 no aplicada` |
| **T-04** | 3 triggers críticos (`trg_protect_system_accounts`, `trg_assert_journal_entry_balanced`, `tr_update_inventory_on_purchase`) | Todos presentes | Todos presentes | **PASS** | `3 triggers críticos presentes` |
| **T-05** | `trg_assert_journal_entry_balanced` — timing y evento | `BEFORE UPDATE` | `BEFORE UPDATE` | **PASS** | `BEFORE UPDATE en journal_entries` |
| **T-06** | `financial_payments_method_check` — 3 métodos | `Efectivo`, `Tarjeta`, `Transferencia` | Constraint confirma los 3 | **PASS** | `CHECK ((payment_method = ANY (ARRAY['Efectivo'::text, 'Tarjeta'::text, 'Transferencia'::text])))` |
| **T-07** | `financial_authorizations_no_self_auth` | Presente | `CHECK ((requested_by <> authorized_by))` | **PASS** | Constraint exacto confirmado |
| **T-08** | Firma de `finalize_pos_sale` | Nueva firma `(uuid,jsonb,jsonb,uuid,text)`, sin firma antigua `text` | Firma nueva presente, antigua eliminada | **PASS** | `firma nueva confirmada, antigua eliminada` |
| **T-09** | 12 RPCs del ledger | Todas presentes | Todas presentes | **PASS** | `12 RPCs del ledger presentes` |
| **T-10** | 6 índices de rendimiento | Todos presentes | Todos presentes | **PASS** | `6 índices de rendimiento presentes` |
| **T-11** | Asientos `confirmed` balanceados (`debit = credit`) | 0 desbalanceados | 0 desbalanceados | **PASS** | `todos los asientos confirmed balanceados` |
| **T-12** | `ledger_cutover_at` — ledger inactivo | `NULL` | `NULL` | **PASS** | `ledger_cutover_at = NULL → ledger inactivo` |
| **T-13** | Registros de idempotencia huérfanos | 0 | 0 | **PASS** | `sin registros de idempotencia huérfanos` |
| **T-14** | `get_account_balances(null)` — filas devueltas | ≥ 11 | 11 | **PASS** | `11 cuentas devueltas` |
| **T-15** | `cash_sessions_status_check` — incluye `closed_with_pending_difference` | Presente | Presente | **PASS** | `closed_with_pending_difference incluido` |
| **T-16** | `financial_authorizations_no_self_auth` — columnas comparadas | `requested_by <> authorized_by` | Confirma ambas columnas | **PASS** | `requested_by <> authorized_by confirmado` |

**Resumen:** 15/16 PASS — 1 FAIL esperado (T-03).

### Nota sobre T-03

T-03 falla porque DEV tiene cuenta `5201` (código incorrecto) en lugar de `5102`. La migración `supabase/migrations/20260812100000_fix_account_5201_to_5102.sql` existe en el repositorio como archivo no rastreado pero **no ha sido aplicada en DEV**. Este FAIL es anticipado y documentado. No indica error en el esquema base; solo que el fix pendiente de autorización no se ha ejecutado.

---

## 3. Diseño de Pruebas Locales (Pendientes de Ejecución)

Archivo: `sql/local/2026-08-11_test_behavioral_ledger_local.sql`

Estas pruebas **NO han sido ejecutadas** (requieren PostgreSQL local con todas las migraciones). El diseño está listo y aislado con `BEGIN/ROLLBACK`.

| Test | Escenario | Tipo de prueba | Estado de diseño |
|---|---|---|---|
| **TB-01** | Método no soportado (`Cripto`) → rechazo atómico | Validación + atomicidad | Diseñado. Mensaje exacto `PENDIENTE DE VALIDAR` |
| **TB-02** | Importe cero → rechazo | Validación de monto | Diseñado |
| **TB-03** | Importe negativo → rechazo | Validación de monto | Diseñado |
| **TB-04** | Suma pagos ≠ total items → rechazo + atomicidad | Suma + consistencia | Diseñado |
| **TB-05** | Efectivo sin sesión de caja → rechazo | Condicionalidad sesión | Diseñado. Mensaje exacto `PENDIENTE DE VALIDAR` |
| **TB-06** | Solo Tarjeta sin sesión → permitido, débita 1103 | Método sin sesión | Diseñado. `cash_session_id = NULL` `PENDIENTE DE VALIDAR` |
| **TB-07** | Mixto Efectivo + Tarjeta → 1101=60, 1103=40, 4101=100 | Pagos mixtos | Diseñado. `expected_cash` `PENDIENTE DE VALIDAR` |
| **TB-08** | Solo Transferencia → débita 1103 | Método transferencia | Diseñado. `PENDIENTE DE VALIDAR` |
| **TB-09** | Idempotencia válida — mismo key+payload → resultado original | Idempotencia | Diseñado con `BEGIN/ROLLBACK` |
| **TB-10** | Idempotencia conflicto — mismo key, payload diferente → error | Idempotencia conflicto | Diseñado. Simula lógica directamente |
| **TB-11** | Asiento desbalanceado → trigger hace ROLLBACK | Atomicidad trigger | Diseñado con `BEGIN/ROLLBACK` |
| **TB-12** | Autoautorización → `check_violation` por `no_self_auth` | Segregación autorización | Diseñado con `BEGIN/ROLLBACK` |
| **TB-13** | `expected_cash` = solo componente Efectivo | Cálculo caja | `PENDIENTE DE VALIDAR` — requiere sesión + ventas previas |

---

## 4. Defectos Comprobados

### GAP-01 — `finalize_pos_sale`: elemento sin clave `method` bypasea validación

**Comprobado en código:** `supabase/migrations/20260811140000_sale_financial_entries.sql`

La validación de método se realiza con:
```sql
if exists (
  select 1 from jsonb_array_elements(p_payments) pay
  where pay->>'method' not in ('Efectivo', 'Tarjeta', 'Transferencia')
)
```

Un elemento sin clave `method` produce `pay->>'method' = NULL`. `NULL NOT IN (...)` evalúa a `NULL` (no `TRUE`), por lo que `EXISTS` devuelve `FALSE` y la validación se omite. El elemento llega a las líneas de inserción donde `pay->>'method'` es NULL y la FK/NOT NULL constraint de `financial_payments.payment_method` dispara `not_null_violation` — ROLLBACK ocurre, pero el mensaje es confuso.

**Corrección pendiente:** añadir `OR pay->>'method' IS NULL` a la condición EXISTS. Requiere nueva migración. **No aplicada — pendiente de autorización.**

---

## 5. Hipótesis y Brechas No Comprobadas (PENDIENTE DE VALIDAR)

| ID | Hipótesis | Por qué no verificada |
|---|---|---|
| H-01 | `Transferencia` débita `1103` igual que `Tarjeta` | Solo confirmado por lectura del código (TB-08 no ejecutado) |
| H-02 | Pago mixto genera `journal_lines` separadas por método | TB-07 no ejecutado |
| H-03 | `expected_cash` en `cash-operations` EF suma solo componente Efectivo | Lógica en Edge Function — no accesible sin ejecutar TB-07 |
| H-04 | 2ª llamada con misma clave idempotencia devuelve JSON idéntico | TB-09 no ejecutado |
| H-05 | `finalize_pos_sale` con solo Tarjeta crea `financial_operations.cash_session_id = NULL` | TB-06 no ejecutado |
| H-06 | `get_cash_sessions_report` incluye campo `expected_cash` | No llamada en pruebas |

---

## 6. Evidencia de No Intervención en DEV

| Afirmación | Evidencia |
|---|---|
| Ledger **no activado** en DEV | T-12 PASS: `ledger_cutover_at = NULL` confirmado por ejecución real contra DEV |
| DEV **no recibió DML ni DDL** | Script ejecutado: `test_schema_safe_run.sql` — solo `SELECT`, `DO$$` con lecturas de `information_schema`/`pg_catalog`/tablas públicas. Sin `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER` |
| Pruebas conductuales **no ejecutadas en DEV** | `test_behavioral_ledger.sql` y `test_behavioral_ledger_local.sql` no fueron pasados a `supabase db query`. Solo `test_schema_safe_run.sql` fue ejecutado |
| Migración `20260812100000` **no aplicada** en DEV | T-03 FAIL confirma que `5201` sigue en DEV y `5102` no existe |
| `activate_ledger` **no invocada** | T-12 PASS; no aparece en ningún script ejecutado |
| `supabase db push` / `migration repair` **no ejecutados** | No presentes en ningún comando de la sesión |

---

## 7. Próxima Compuerta de Aprobación

Para avanzar a Fase 4 se requiere aprobación explícita para:

1. **R1 (alta prioridad):** Ejecutar `supabase migration repair --status applied` para registrar las 7 migraciones del ledger ya aplicadas en DEV pero no registradas en la tabla `supabase_migrations`.
2. **R2 (prerrequisito de T-03):** Aplicar migración `20260812100000_fix_account_5201_to_5102.sql` en DEV — cambia `5201 → 5102` y actualiza el RPC `create_purchase_with_ledger`.
3. **R3 (post R2):** Volver a ejecutar `test_schema_safe_run.sql` — se espera 16/16 PASS.
4. **R4 (Fase 4):** Ejecutar `test_behavioral_ledger_local.sql` en base PostgreSQL local con migraciones completas. Requiere UUIDs reales de la base local.
5. **R5 (post pruebas locales):** Corregir GAP-01 con nueva migración (añadir `OR pay->>'method' IS NULL` a validación en `finalize_pos_sale`).

**Detenido en espera de aprobación. No avanzar a R1–R5 sin autorización explícita.**
