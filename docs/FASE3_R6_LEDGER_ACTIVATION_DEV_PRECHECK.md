# FASE3 — R6: Precheck de Activación del Ledger en DEV

**Fecha:** 2026-08-15  
**Entorno:** DEV (`rtkdrnfqihulqdhixxzf` — La carreta Dev)  
**Tipo:** Solo lectura — ningún cambio ejecutado  
**Restricciones observadas:** Sin RPCs de escritura, SQL de escritura, migration up, db push, commits ni push. Solo inspección.

---

## Veredicto Final

> ### **APTO PARA ACTIVAR LEDGER EN DEV**
>
> Las 9 validaciones resultan PASS sin bloqueadores.  
> **Condición operativa pendiente (no técnica):** el operador debe determinar y proveer los saldos iniciales reales antes de ejecutar la activación (`p_opening_cash_operativa`, `p_opening_cash_fuerte`, `p_opening_banco`).

---

## Resumen de Validaciones

| # | Validación | Estado |
|---|------------|--------|
| V1 | DEV y `origin/main` alineados hasta M29 | **PASS** |
| V2 | `ledger_settings` sin activación | **PASS** |
| V3 | Sin sesiones abiertas, mesas, órdenes ni ventas en proceso | **PASS** |
| V4 | Cuentas sistema 1101, 1103, 4101, 5102, 3101 (+ 1102) — activas, sin duplicados | **PASS** |
| V5 | `activate_ledger` existe — firma, permisos, precondiciones, efectos documentados | **PASS** |
| V6 | Usuarios DEV superadmin autorizados identificados | **PASS** |
| V7 | Constraints de balance, idempotencia y reportes presentes post-M29 | **PASS** |
| V8 | Reversibilidad analizada — activación es **irreversible** por diseño | **PASS** (documentado) |
| V9 | Runbook exacto generado | **PASS** |

---

## V1 — Alineación DEV / `origin/main` hasta M29

### `supabase migration list`

```
 Local          | Remote         | Time (UTC)
----------------|----------------|---------------------
 20260414045424 | 20260414045424 | 2026-04-14 04:54:24
 ...
 20260812100000 | 20260812100000 | 2026-08-12 10:00:00  ← M28
 20260815100000 | 20260815100000 | 2026-08-15 10:00:00  ← M29 ✓
```

29 migraciones. Local = Remote para todas. Sin pendientes. **PASS**

### `git log origin/main -3`

```
60cd7be Merge pull request #5: fix(ledger): correct finalize_pos_sale payment group by
2f66cdc fix(ledger): correct finalize_pos_sale payment group by
8a8fbcf feat(pos): caja segura y busqueda de productos (#4)
```

M29 en `origin/main`. **PASS**

---

## V2 — `ledger_settings` sin activación

```
-- Data for Name: ledger_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--
[sin filas]
```

Tabla vacía. `ledger_cutover_at = NULL`. **PASS**

### Schema de `ledger_settings`

```sql
CREATE TABLE IF NOT EXISTS "public"."ledger_settings" (
    "id"                       boolean DEFAULT true NOT NULL,
    "ledger_cutover_at"        timestamp with time zone,
    "initial_journal_entry_id" uuid,
    "activated_by"             uuid,
    "activated_at"             timestamp with time zone,
    "created_at"               timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ledger_settings_singleton" CHECK (id = true)
);
COMMENT ON TABLE "public"."ledger_settings" IS
  'Singleton de configuración del ledger. Solo puede existir una fila (id = true).';
```

---

## V3 — Estado operativo limpio

Fuente: `supabase db dump --linked --data-only`

| Indicador | Conteo | Estado |
|-----------|--------|--------|
| `cash_sessions` con `status='open'` | 0 | **PASS** |
| `tables` con `status='ocupada'` | 0 | **PASS** |
| `table_orders` activos | 0 | **PASS** |
| `idempotency_requests` scope=sale pendientes | 0 | **PASS** |

Todas las precondiciones operativas de `activate_ledger` están satisfechas en el momento del precheck.

---

## V4 — Cuentas del sistema requeridas

Fuente: data dump sección `financial_accounts`.

| Código | Nombre | Tipo | is_system | is_active | Usada por |
|--------|--------|------|-----------|-----------|-----------|
| 1101 | Caja operativa | asset | true | true | `activate_ledger`, `finalize_pos_sale` |
| **1102** | **Caja fuerte** | **asset** | **true** | **true** | **`activate_ledger`** (requerida, no solicitada en checklist original) |
| 1103 | Banco | asset | true | true | `activate_ledger`, `finalize_pos_sale` |
| 3101 | Aportaciones del propietario | equity | true | true | `activate_ledger` (crédito inicial) |
| 4101 | Ingresos por ventas | income | true | true | `finalize_pos_sale` |
| 5102 | Gastos operativos generales | expense | true | true | otras operaciones |

Ningún código duplicado. Todas presentes y activas. **PASS**

> **Nota:** `activate_ledger` requiere `1102` (Caja fuerte) internamente. Está presente y activa; no era parte del checklist original pero fue verificada.

---

## V5 — Función `activate_ledger`

### Firma exacta (extraída de `supabase db dump --linked`)

```sql
CREATE OR REPLACE FUNCTION "public"."activate_ledger"(
  "p_performed_by"          uuid,
  "p_opening_cash_operativa" numeric,
  "p_opening_cash_fuerte"    numeric,
  "p_opening_banco"          numeric,
  "p_bank_pending_items"     jsonb  DEFAULT '[]'::jsonb,
  "p_idempotency_key"        text   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
```

### Permisos

```sql
REVOKE ALL ON FUNCTION "public"."activate_ledger"(...) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_ledger"(...) TO "service_role";
```

Invocable únicamente con `service_role`. No accesible por `anon` ni `authenticated`. Requiere llamada desde Edge Function o backend autorizado.

### Precondiciones (validadas dentro de la función)

| Orden | Precondición | Excepción si falla |
|-------|-------------|---------------------|
| 1 | `p_performed_by` es `superadmin` activo en `app_profiles` | `'Solo un Superadministrador activo puede activar el ledger.'` |
| 2 | `ledger_cutover_at IS NULL` (no activado previamente) | `'El ledger ya fue activado el <fecha>.'` |
| 3 | Sin sesiones de caja abiertas | `'Existe una sesión de caja abierta. Ciérrala antes de activar el ledger.'` |
| 4 | Sin mesas ocupadas | `'Hay mesas con pedidos activos. Ciérralos antes de activar el ledger.'` |
| 5 | Todos los montos >= 0 | `'Los saldos iniciales no pueden ser negativos.'` |
| 6 | Total de saldos iniciales > 0 | `'El saldo inicial total debe ser mayor que cero.'` |
| 7 | Cuentas sistema 1101, 1102, 1103, 3101 existen y activas | `'Cuentas del sistema incompletas. Verifica el catálogo financiero.'` |

### Efectos (en orden de ejecución)

1. **Crea `journal_entries`** (entry_type=`'initial_balance'`, status=`pending` → `confirmed`)
2. **Crea `journal_lines`** de débito por cada monto > 0:
   - `1101` ← `p_opening_cash_operativa`
   - `1102` ← `p_opening_cash_fuerte`
   - `1103` ← `p_opening_banco`
3. **Crea `journal_lines`** crédito único a `3101` (Aportaciones del propietario) = suma total
4. **Trigger `assert_journal_entry_balanced`** valida débitos = créditos al confirmar
5. (Opcional) Inserta `bank_reconciliation_items` si `p_bank_pending_items` no vacío
6. **Upsert `ledger_settings`**: establece `ledger_cutover_at = now()`, `initial_journal_entry_id`, `activated_by`, `activated_at`
7. **Inserta `audit_events`** con snapshot completo
8. (Opcional) Registra idempotencia en `idempotency_requests`

### Retorno

```json
{
  "ledger_cutover_at":         "<timestamp>",
  "initial_journal_entry_id":  "<uuid>",
  "activated_at":              "<timestamp>",
  "total_initial_balance":     "<numeric>"
}
```

**PASS** — función presente, permisos correctos, precondiciones documentadas.

---

## V6 — Usuarios DEV autorizados para activar

Fuente: data dump sección `app_profiles`.

| id | username | email | status | is_superadmin |
|----|----------|-------|--------|---------------|
| `7bf6bf2e-e5e7-47bf-8708-eb06281d7ca7` | admindev | admindev@usuarios.mi-punto-de-venta.local | active | true |
| `43ffc20b-9866-4c2f-8c51-6852c5b583c5` | codexdebug | codexdebug@usuarios.mi-punto-de-venta.local | active | true |

Ambos satisfacen la precondición 1 de `activate_ledger`. **PASS**

> El operador debe usar el UUID del usuario con el que autentica la acción. Se recomienda `admindev` como perfil operativo principal.

---

## V7 — Restricciones de balance, idempotencia y reportes (post-M29)

### Trigger de balance

```sql
CREATE OR REPLACE TRIGGER "trg_assert_journal_entry_balanced"
  BEFORE UPDATE ON "public"."journal_entries"
  FOR EACH ROW
  WHEN (new.status = 'confirmed' AND old.status = 'pending')
  EXECUTE FUNCTION "public"."assert_journal_entry_balanced"();
```

Presente y activo. Rechaza asientos sin líneas o con débitos ≠ créditos. **PASS**

### Constraints en `journal_lines`

```sql
CONSTRAINT "journal_lines_credit_non_negative"  CHECK (credit >= 0)
CONSTRAINT "journal_lines_debit_non_negative"   CHECK (debit >= 0)
CONSTRAINT "journal_lines_not_both_sides"       CHECK (NOT (debit > 0 AND credit > 0))
CONSTRAINT "journal_lines_one_side_required"    CHECK (debit > 0 OR credit > 0)
```

Todos presentes. **PASS**

### Idempotencia

```sql
-- idempotency_requests
CONSTRAINT "idempotency_requests_scope_key_unique" UNIQUE (scope, idempotency_key)
-- journal_entries
CREATE UNIQUE INDEX "journal_entries_idempotency_idx" ON journal_entries (idempotency_key) WHERE idempotency_key IS NOT NULL
```

`activate_ledger` usa `scope='activate_ledger'`. Si se provee una `idempotency_key`, un reintento con la misma clave y payload idéntico devuelve el resultado anterior sin re-ejecutar. **PASS**

### Reportes financieros

| Función | Presente |
|---------|---------|
| `get_account_balances(p_as_of timestamptz DEFAULT NULL)` | ✓ |
| `get_journal_report(p_from_date date, p_to_date date)` | ✓ |
| `get_account_ledger(p_account_code text, p_from_date date, p_to_date date)` | ✓ |

Tabla `bank_reconciliation_items` presente (necesaria para partidas bancarias pendientes opcionales). **PASS**

---

## V8 — Reversibilidad

### Conclusión

**La activación del ledger es IRREVERSIBLE por diseño.**

La función incluye:
```sql
if found and v_settings.ledger_cutover_at is not null then
  raise exception 'El ledger ya fue activado el %.', v_settings.activated_at;
end if;
```

Una vez que `ledger_settings.ledger_cutover_at IS NOT NULL`:
- No existe función `deactivate_ledger` ni `revert_ledger`.
- Llamar `activate_ledger` de nuevo lanza excepción.
- El asiento inicial (`JE-INICIAL-*`) queda `confirmed` y no puede revertirse con los mecanismos normales (`reverse_journal_entry` podría revertir el asiento, pero no anula `ledger_cutover_at`).

### Impacto operativo de activar

| Efecto inmediato | Descripción |
|-----------------|-------------|
| Todas las ventas posteriores | Crean `journal_entries` + `journal_lines` automáticamente en `finalize_pos_sale` |
| Cierres de caja posteriores | Crearán entradas contables (según diseño de `close_cash_session_atomic`) |
| Reportes financieros | Se vuelven operativos con datos reales acumulados desde `ledger_cutover_at` |
| Ajuste de inventario, compras, fondos | Las funciones respectivas también entran en modo ledger activo |

### Camino de rollback técnico (destructivo — solo como último recurso)

Si la activación resulta incorrecta, la única opción es intervención manual directa en DEV:
```sql
-- NO EJECUTAR sin autorización explícita — altera datos operativos
UPDATE public.ledger_settings
   SET ledger_cutover_at = NULL, initial_journal_entry_id = NULL,
       activated_by = NULL, activated_at = NULL
 WHERE id = true;
-- Adicionalmente: revertir o eliminar el journal_entry inicial
```

Esta operación requiere acceso `service_role` o `postgres` directo y deja el historial de `journal_entries` inconsistente si ya se procesaron ventas bajo ledger activo.

**Decisión irreversible. Validar saldos iniciales antes de activar.**

---

## V9 — Runbook de Activación en DEV

> **ESTE RUNBOOK NO FUE EJECUTADO.** Solo describe el procedimiento autorizado futuro.

### Prerrequisitos inmediatos antes de ejecutar

```sql
-- Verificar estado operativo (ejecutar en DEV como solo lectura):
SELECT
  (SELECT count(*) FROM public.cash_sessions WHERE status = 'open')   AS open_sessions,
  (SELECT count(*) FROM public.tables WHERE lower(status) = 'ocupada') AS occupied_tables,
  (SELECT ledger_cutover_at FROM public.ledger_settings WHERE id = true) AS cutover_at;
-- Esperado: open_sessions=0, occupied_tables=0, cutover_at=NULL
```

### Paso 1 — Determinar saldos iniciales reales (operativo)

El operador debe:
1. Contar el efectivo real en caja operativa → `p_opening_cash_operativa`
2. Contar el efectivo real en caja fuerte → `p_opening_cash_fuerte` (puede ser 0)
3. Verificar saldo bancario real → `p_opening_banco`
4. (Opcional) Listar cheques/transferencias pendientes → `p_bank_pending_items`

### Paso 2 — Ejecutar activación via Edge Function o `service_role`

```sql
-- Ejecutar via Edge Function autorizada o cliente con service_role:
SELECT public.activate_ledger(
  '7bf6bf2e-e5e7-47bf-8708-eb06281d7ca7'::uuid,  -- admindev UUID
  <p_opening_cash_operativa>::numeric,              -- Ej: 1500.00
  <p_opening_cash_fuerte>::numeric,                 -- Ej: 0.00 (si no hay)
  <p_opening_banco>::numeric,                       -- Ej: 45000.00
  '[]'::jsonb,                                      -- Partidas bancarias pendientes (opcional)
  'ACTIVATE-LEDGER-DEV-20260815'::text              -- Clave idempotencia (recomendada)
);
```

> Si la activación se llama desde la UI/app, el UUID del usuario se toma del JWT activo.

### Paso 3 — Validaciones inmediatas post-activación (solo lectura)

```sql
-- 1. ledger_settings confirmado
SELECT id, ledger_cutover_at, activated_at, initial_journal_entry_id
FROM public.ledger_settings WHERE id = true;
-- Esperado: fila con ledger_cutover_at NOT NULL

-- 2. Asiento inicial confirmado
SELECT je.entry_number, je.entry_type, je.status, je.occurred_at,
       sum(jl.debit) as total_debit, sum(jl.credit) as total_credit
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.entry_type = 'initial_balance'
GROUP BY je.id, je.entry_number, je.entry_type, je.status, je.occurred_at;
-- Esperado: status='confirmed', total_debit = total_credit = suma saldos iniciales

-- 3. Balances contables visibles
SELECT code, name, balance
FROM public.get_account_balances()
WHERE code IN ('1101','1102','1103','3101');
-- Esperado: balances = saldos provistos (activos=debit, equity=credit)
```

### Criterios de rollback seguro

| Condición | Acción |
|-----------|--------|
| `activate_ledger` lanza excepción por precondición | Sin efecto — reintentar tras corregir la precondición |
| `activate_ledger` lanza excepción por balance del asiento | Sin efecto (transacción revertida) — verificar cuentas catálogo |
| `activate_ledger` completó pero saldos son incorrectos | Intervención manual directa en DB (ver V8 — destructivo) — escalar antes de procesar cualquier venta |
| `activate_ledger` completó con saldos correctos pero idempotency_key incorrecta | No hay rollback funcional disponible; la idempotency_key ya fue consumida con esos montos |

---

## Fuentes de Evidencia

| Comando | Propósito |
|---------|-----------|
| `npx supabase migration list` | Alineación M1-M29 local vs remoto |
| `git log origin/main -3` | M29 en `origin/main` |
| `npx supabase db dump --linked` | Schema DEV: función, triggers, constraints, grants |
| `npx supabase db dump --linked --data-only` | Datos DEV: cuentas, sesiones, mesas, perfiles |

---

*Precheck completado: 2026-08-15. Sin cambios ejecutados en DEV, PRD, migraciones ni configuración.*  
*Veredicto: `APTO PARA ACTIVAR LEDGER EN DEV`*
