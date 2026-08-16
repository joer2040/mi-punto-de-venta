# FASE3 — R8: Diseño de Seguridad de la API Financiera

**Fecha de inspección:** 2026-08-15  
**Fecha de implementación:** 2026-08-15  
**Entorno inspeccionado:** código fuente LOCAL (sin modificar archivos ni DB)  
**Base:** R7 PASS (28/28 tests) — veredicto `APTO PARA INICIAR UI FINANZAS`  
**Restricciones aplicadas:** código de la Edge Function, pruebas automatizadas y documentación. Sin despliegues a DEV/PRD, sin SQL de escritura, sin alteración de migraciones, ledger, datos, secretos, commits ni push.

---

## Resumen Ejecutivo

La fachada `financial-operations/index.ts` **ya existe** e implementa 10 de 12 RPCs financieras usando el patrón dual-cliente correcto. Las 2 RPCs restantes (`finalize_pos_sale`, `create_purchase_with_ledger`) ya están expuestas en `pos-operations` y `erp-operations` respectivamente.

Se identificaron **3 brechas de autorización críticas** y **1 brecha de CORS** que fueron **corregidas en esta iteración**. Todas las brechas G01–G08 están cerradas.

**Veredicto R8 diseño:** `APTO PARA IMPLEMENTAR API FINANCIERA SEGURA`  
**Veredicto R8 implementación:** `APTO PARA DESPLEGAR API FINANCIERA SEGURA EN DEV`

---

## 1. Auditoría de 12 RPCs Financieras

Todas las RPCs financieras comparten: `SECURITY DEFINER`, `set search_path to public, pg_temp`, `GRANT EXECUTE … TO service_role`. Ninguna es accesible por `anon` o `authenticated` directamente.

### 1.1 RPCs de Escritura

| # | RPC | Firma abreviada | Efecto | Idempotencia | Cuentas |
|---|-----|----------------|--------|--------------|---------|
| R1 | `activate_ledger` | `(performed_by, opening_op numeric, opening_ft numeric, opening_banco numeric, bank_pending jsonb, idem_key)` → jsonb | Establece `ledger_cutover_at`; crea JE `initial_balance` confirmado | scope=`activation` (early) | 1101↑ 1102↑ 1103↑ vs 3101↑ |
| R2 | `finalize_pos_sale` | `(table_id, items jsonb, payments jsonb, performed_by, idem_key)` → jsonb | Crea venta + sale_items; reduce inventory; crea JE `sale` confirmado; cierra mesa | scope=`sale` — **CHECK ORDER: validación de mesa PRIMERO, idempotencia en línea ~476** | 1101/4101 según método pago |
| R3 | `create_purchase_with_ledger` | `(provider_id, center_id, invoice_ref, items jsonb, payment jsonb, performed_by, idem_key)` → jsonb | Crea compra + purchase_items; actualiza inventario; crea JE `purchase` confirmado | scope=`purchase` (early) | 1201/5201 vs fondo pago |
| R4 | `record_transfer` | `(from_code, to_code, amount numeric(14,2), description, performed_by, idem_key)` → jsonb | Crea JE `transfer` confirmado entre fondos; requiere caja abierta si involucra 1101 | scope=`transfer` (early) | Solo entre 1101/1102/1103 |
| R5 | `record_owner_contribution` | `(destination_code, amount numeric(14,2), description, performed_by, idem_key)` → jsonb | Crea JE `contribution` confirmado; débito fondo destino, crédito 3101 | scope=`contribution` (early) | fondo↑ vs 3101↑ |
| R6 | `record_owner_withdrawal` | `(source_code, amount numeric(14,2), description, performed_by, authorized_by, idem_key)` → jsonb | Crea JE `withdrawal` confirmado; crédito fondo origen, débito 3201 | scope=`withdrawal` (early) | fondo↓ vs 3201↑ |
| R7 | `reverse_journal_entry` | `(journal_entry_id, authorized_by, justification, performed_by, idem_key)` → jsonb | Crea JE `reversal` confirmado con líneas invertidas; marca original como revertido | scope=`reversal` (early) | Invierte líneas del JE original |
| R8 | `resolve_cash_discrepancy` | `(cash_session_id, resolution_type, amount numeric(14,2), motive, performed_by, idem_key)` → jsonb | Crea registro de resolución de diferencia + JE confirmado | scope=`discrepancy` (early) | sobrante: 1101↑/4201↑; faltante: 5301↑/1101↓ |

### 1.2 RPCs de Consulta

| # | RPC | Firma abreviada | Retorna |
|---|-----|----------------|---------|
| R9 | `get_account_balances` | `(as_of timestamptz DEFAULT null)` | `TABLE(account_id, code, name, account_type, total_debit, total_credit, balance)` |
| R10 | `get_journal_report` | `(from_date date, to_date date)` | `TABLE(entry_id, entry_number, entry_type, occurred_at, source_type, source_id, line_id, account_code, account_name, debit, credit, line_desc)` |
| R11 | `get_account_ledger` | `(account_code text, from_date date DEFAULT null, to_date date DEFAULT null)` | `TABLE(line_id, entry_id, entry_number, entry_type, occurred_at, description, debit, credit, running_balance)` |
| R12 | `get_cash_sessions_report` | `(from_date date DEFAULT null, to_date date DEFAULT null)` | `TABLE(session_id, status, opened_at, closed_at, opening_amount, expected_cash, first_counted_cash, final_counted_cash, difference_amount, resolution_type, resolution_amount, resolution_motive, resolution_entry)` |

### 1.3 Dato crítico: orden de validación en finalize_pos_sale (R2)

`finalize_pos_sale` valida el estado de la mesa en la línea ~77 **antes** de consultar idempotencia (~línea 476). Consecuencia directa para la UI:

- Primer llamado exitoso: devuelve `{ sale_id, journal_entry_id, … }` → **guardar inmediatamente en localStorage o estado**.
- Si la red falla antes de que el cliente reciba la respuesta y la mesa ya se liberó: **no hay retry seguro con la misma idempotency_key** porque el RPC fallará en la validación de mesa, no en idempotencia.
- Estrategia de UI: antes de reintentar, consultar si la venta ya existe (`sale_id`/`journal_entry_id` conocido) o leer el estado de la mesa/orden. Nunca hacer retry ciego en red flaky.

---

## 2. Auditoría de Edge Functions y Patrón de Autorización Existente

### 2.1 Edge Functions relevantes

| Edge Function | Acciones | loadCallerContext | Autorización interna |
|--------------|----------|-------------------|---------------------|
| `financial-operations` | 11 acciones financieras | `is_superadmin` + `status='active'` | Superadmin: `activate_ledger`, `reverse_journal_entry`, `record_owner_withdrawal` — resto: cualquier activo |
| `pos-operations` | `save_table_order`, `finalize_sale` | `is_superadmin` + roles desde `app_user_roles` | Superadmin, manager, mesero |
| `cash-operations` | 4 acciones de caja | `is_superadmin` + roles + permisos granulares | Superadmin/manager: todo; `cash_control:manage`: abrir/cerrar/reconteo; `cash_control:view`: solo lectura |
| `erp-operations` | 8 acciones ERP | `is_superadmin` + roles | Solo superadmin o manager |
| `user-admin` | 3 acciones de usuarios | `is_superadmin` + roles | Superadmin o manager (con restricción: manager solo puede gestionar meseros) |

### 2.2 Patrón dual-cliente (patrón canónico del repositorio)

```typescript
// requestClient: anon key + JWT del usuario → SOLO para validar identidad
const requestClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${token}` } }
})
const { data: { user }, error } = await requestClient.auth.getUser()
if (error || !user) throw appError('No autenticado.', 401)

// adminClient: service_role → TODAS las operaciones DB/RPC
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
```

- `service_role` **nunca sale del servidor** ni se incluye en respuestas.
- `requestClient.auth.getUser()` valida el JWT contra el servidor de Supabase; no se acepta el JWT como fuente de verdad sin validación.

### 2.3 Patrón de carga de roles (pos-operations, cash-operations)

```typescript
const { data: userRoles } = await adminClient
  .from('app_user_roles')
  .select('app_roles(name)')
  .eq('user_id', userId)

const roleNames = (userRoles ?? []).map(r => r.app_roles?.name?.toLowerCase())
const isManager = roleNames.some(n => ['manager', 'administrador operativo'].includes(n))
const isWaiter  = roleNames.includes('mesero')
```

`financial-operations` **no carga roles** — su `loadCallerContext` solo lee `is_superadmin`. Esta es la brecha principal.

### 2.4 CORS actual

Todas las EFs usan `'Access-Control-Allow-Origin': '*'` (wildcard). No hay restricción por origen.

---

## 3. Roles y Modelo de Autorización Real

### 3.1 Fuente de verdad

| Mecanismo | Descripción |
|-----------|-------------|
| `app_profiles.is_superadmin` | Flag booleano; superadministrador; no es un rol en `app_roles` |
| `app_roles` | Roles nombrados: `manager`, `administrador operativo`, `mesero` (y potencialmente `admin` según M20 de permisos de caja) |
| `app_user_roles` | Tabla de asociación usuario↔rol |
| `app_permissions` | `(screen_key, action_key)` — p.ej. `(cash_control, view)` |
| `app_role_permissions` | Asociación rol↔permiso |

### 3.2 isManager (definición consolidada del repositorio)

Un usuario es "manager" si tiene cualquiera de estos roles: `manager` O `administrador operativo`. Esto es consistente en `pos-operations`, `cash-operations`, `erp-operations` y `user-admin`.

### 3.3 Roles que NO existen (no inventar)

No existen roles `finanzas`, `contador`, `tesorero`, `finance_admin`, `gerente`, `director` ni ninguna variación. Solo usar los roles reales del sistema.

### 3.4 Mapa de autorización propuesto para Finanzas

| Acción | Superadmin | Manager | Mesero | Notas |
|--------|-----------|---------|--------|-------|
| `get_ledger_status` | ✅ | ✅ | ❌ | Solo staff financiero |
| `get_account_balances` | ✅ | ✅ | ❌ | Dato contable sensible |
| `get_journal_report` | ✅ | ✅ | ❌ | Libro diario completo |
| `get_account_ledger` | ✅ | ✅ | ❌ | Mayor contable |
| `get_cash_sessions_report` | ✅ | ✅ | ❌ | Ya expuesto en cash-operations para manager+ |
| `record_transfer` | ✅ | ✅ | ❌ | Movimiento de fondos |
| `record_owner_contribution` | ✅ | ✅ | ❌ | Aportación de capital |
| `resolve_cash_discrepancy` | ✅ | ✅ | ❌ | Cierre contable |
| `record_owner_withdrawal` | ✅ | ❌ | ❌ | Solo superadmin |
| `reverse_journal_entry` | ✅ | ❌ | ❌ | Solo superadmin |
| `activate_ledger` | ✅ | ❌ | ❌ | Solo superadmin |

> `finalize_pos_sale` y `create_purchase_with_ledger` no se exponen en la UI de Finanzas; ya están cubiertos por `pos-operations` y `erp-operations` con sus propias reglas.

---

## 4. Análisis de Brechas en `financial-operations/index.ts`

### 4.1 Brechas críticas (bloquean inicio de UI)

| ID | Brecha | Ubicación | Impacto |
|----|--------|-----------|---------|
| **G01** | `record_transfer` sin chequeo de rol — cualquier usuario activo puede mover fondos | `financial-operations/index.ts`, acción `record_transfer` | Usuario mesero puede transferir entre cajas |
| **G02** | `record_owner_contribution` sin chequeo de rol — cualquier usuario activo puede registrar aportaciones de capital | `financial-operations/index.ts`, acción `record_owner_contribution` | Usuario mesero puede inflar el capital contable |
| **G03** | `resolve_cash_discrepancy` sin chequeo de rol — cualquier usuario activo puede registrar resoluciones de caja | `financial-operations/index.ts`, acción `resolve_cash_discrepancy` | Usuario mesero puede alterar saldos de caja |

### 4.2 Brechas de defensa en profundidad (no bloquean, deben corregirse en R8)

| ID | Brecha | Ubicación | Impacto |
|----|--------|-----------|---------|
| **G04** | CORS wildcard `'*'` — cualquier origen puede invocar la EF | Todas las EFs | Menor mientras el JWT siga siendo requerido; riesgo si hay CSRF-like patterns en el futuro |
| **G05** | Consultas `get_*` (R9–R12) sin chequeo de rol — cualquier usuario activo accede a datos contables completos | `financial-operations/index.ts` | Mesero puede ver libro diario, mayor y saldos |
| **G06** | `loadCallerContext` no carga roles — lógica más sofisticada futura requerirá roles ya disponibles | `financial-operations/index.ts`, función `loadCallerContext` | Refactoring inevitable; mejor hacerlo ahora |
| **G07** | No hay validación de formato UUID para `journal_entry_id` y `authorized_by` | `financial-operations/index.ts`, acción `reverse_journal_entry` | Payload malformado llega directamente al RPC |
| **G08** | No hay validación de formato de idempotency_key — longitud, caracteres | Todas las acciones write en `financial-operations` | RPC puede recibir claves degeneradas |

### 4.3 Lo que funciona correctamente (no tocar)

- Dual-client pattern: `requestClient` para validar JWT, `adminClient` para todas las ops DB
- `service_role` solo existe en el servidor, nunca en respuesta al cliente
- Lista cerrada de acciones — no hay endpoint genérico de RPC-by-name
- Validación de `amount > 0` en acciones de escritura
- Validación de campos requeridos (`p_performed_by`, `p_from_code`, etc.)
- Validación de método de pago en `erp-operations` (reutilizable en R8)
- Manejo de errores con `appError(message, status)` uniforme

---

## 5. Diseño de Fachada Segura

### 5.1 `loadCallerContext` extendido

El nuevo `loadCallerContext` en `financial-operations` debe cargar roles igual que `pos-operations`:

```typescript
const loadCallerContext = async (adminClient, userId) => {
  const { data: profile } = await adminClient
    .from('app_profiles')
    .select('id, is_superadmin, status')
    .eq('id', userId)
    .maybeSingle()

  if (!profile || profile.status !== 'active') {
    throw appError('No tienes permisos para operar el módulo financiero.', 403)
  }

  const { data: userRoles } = await adminClient
    .from('app_user_roles')
    .select('app_roles(name)')
    .eq('user_id', userId)

  const roleNames = (userRoles ?? []).map(r => r.app_roles?.name?.toLowerCase() ?? '')
  const isManager = profile.is_superadmin ||
    roleNames.some(n => ['manager', 'administrador operativo'].includes(n))

  return {
    profile,
    isSuperadmin: Boolean(profile.is_superadmin),
    isManager,
  }
}
```

### 5.2 Guards de autorización

```typescript
const requireManager = (ctx) => {
  if (!ctx.isManager) throw appError('Se requiere perfil de manager o superior.', 403)
}
const requireSuperadmin = (ctx) => {
  if (!ctx.isSuperadmin) throw appError('Se requiere superadministrador.', 403)
}
```

Aplicación por acción:

```
get_ledger_status       → requireManager
get_account_balances    → requireManager
get_journal_report      → requireManager
get_account_ledger      → requireManager
get_cash_sessions_report→ requireManager
record_transfer         → requireManager   ← CORRIGE G01
record_owner_contribution → requireManager ← CORRIGE G02
resolve_cash_discrepancy → requireManager  ← CORRIGE G03
record_owner_withdrawal → requireSuperadmin (ya implementado)
reverse_journal_entry   → requireSuperadmin (ya implementado)
activate_ledger         → requireSuperadmin (ya implementado)
```

### 5.3 Validación de payload

```typescript
// UUIDs
const isValidUUID = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Idempotency key: 1-128 caracteres, solo alfanumérico/guion/punto
const isValidIdempotencyKey = (v) =>
  typeof v === 'string' && /^[A-Za-z0-9\-_.]{1,128}$/.test(v)

// Monto: número finito > 0, máximo 2 decimales
const isValidAmount = (v) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 &&
  Number(v.toFixed(2)) === v

// Código de cuenta de fondos
const FUND_CODES = ['1101', '1102', '1103']
const isValidFundCode = (v) => FUND_CODES.includes(v)

// Método de pago (normalizado a capitalized)
const PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia']
const normalizePaymentMethod = (v) => {
  const lower = (v ?? '').toLowerCase()
  return PAYMENT_METHODS.find(m => m.toLowerCase() === lower) ?? null
}
```

### 5.4 CORS configurable (corrige G04)

```typescript
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map(o => o.trim()).filter(Boolean)

const getCorsHeaders = (requestOrigin) => {
  const origin = ALLOWED_ORIGINS.length === 0
    ? '*'  // fallback para DEV si no está configurado
    : ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : null
  return origin
    ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
    : {}   // origen no permitido — no añadir header Allow-Origin
}
```

`ALLOWED_ORIGINS` se configura como secret en Supabase Vault o variable de entorno del Edge Runtime. En DEV puede dejarse vacío (fallback `*`). En PRD: URL exacta del frontend.

### 5.5 Manejo uniforme de errores y trazabilidad

El patrón `appError(message, status)` ya existe. Añadir `request_id` único por invocación:

```typescript
const requestId = crypto.randomUUID()
// incluir en respuestas de error y en console.error(...)
// respuesta de error: { error: message, request_id: requestId }
```

### 5.6 Particularidad de finalize_pos_sale — contrato especial para UI

`finalize_pos_sale` **NO se agrega a `financial-operations`**. Ya está en `pos-operations/finalize_sale`. La UI de Finanzas **no llama directamente a este endpoint**; lo invoca la UI de POS. La UI de Finanzas solo lee los JE resultantes via `get_journal_report` / `get_account_ledger`.

---

## 6. Contrato Exacto de API para la UI

### 6.1 Base URL

```
POST https://<project>.supabase.co/functions/v1/financial-operations
Authorization: Bearer <user-jwt>
Content-Type: application/json
```

### 6.2 Envelope de request/response

**Request:**
```json
{ "action": "<action_name>", "payload": { … } }
```

**Response (success):**
```json
{ "data": { … } }
```

**Response (error):**
```json
{ "error": "<mensaje legible>", "request_id": "<uuid>" }
```

### 6.3 Endpoints de consulta

#### `get_ledger_status`
- Roles: manager+
- Payload: `{}`
- Response: `{ is_active: boolean, ledger_cutover_at: string|null, activated_at: string|null, initial_journal_entry_id: string|null }`

#### `get_account_balances`
- Roles: manager+
- Payload: `{ as_of?: string }` (ISO 8601 timestamptz, opcional)
- Response: `{ balances: Array<{ account_id, code, name, account_type, total_debit, total_credit, balance }> }`

#### `get_journal_report`
- Roles: manager+
- Payload: `{ from_date: string, to_date: string }` (YYYY-MM-DD)
- Response: `{ entries: Array<{ entry_id, entry_number, entry_type, occurred_at, source_type, source_id, lines: Array<{ line_id, account_code, account_name, debit, credit, line_desc }> }> }`
- Nota de paginación: el RPC retorna todas las filas del rango; la UI debe limitar el rango de fechas (máx. 31 días recomendado). No hay cursor de paginación en el RPC actual.

#### `get_account_ledger`
- Roles: manager+
- Payload: `{ account_code: string, from_date?: string, to_date?: string }`
- Validación: `account_code` no puede ser vacío
- Response: `{ lines: Array<{ line_id, entry_id, entry_number, entry_type, occurred_at, description, debit, credit, running_balance }> }`

#### `get_cash_sessions_report`
- Roles: manager+
- Payload: `{ from_date?: string, to_date?: string }`
- Response: `{ sessions: Array<{ session_id, status, opened_at, closed_at, opening_amount, expected_cash, first_counted_cash, final_counted_cash, difference_amount, resolution_type, resolution_amount, resolution_motive, resolution_entry }> }`

### 6.4 Endpoints de escritura

#### `activate_ledger`
- Roles: superadmin
- Payload:
  ```json
  {
    "opening_cash_operativa": 1000.00,
    "opening_cash_fuerte": 0.00,
    "opening_banco": 5000.00,
    "bank_pending_items": [],
    "idempotency_key": "ACTIVATE-2026-08-15"
  }
  ```
- Validación: montos ≥ 0 (no necesariamente > 0; puede haber fondo con saldo inicial cero), `idempotency_key` formato válido
- Response: `{ data: { activated_at, initial_journal_entry_id, ledger_cutover_at, total_initial_balance } }`
- Idempotencia: segunda llamada con misma clave devuelve misma respuesta sin error

#### `record_transfer`
- Roles: manager+
- Payload:
  ```json
  {
    "from_code": "1101",
    "to_code": "1102",
    "amount": 500.00,
    "description": "Traslado a caja fuerte",
    "idempotency_key": "TRF-20260815-001"
  }
  ```
- Validación: `from_code` y `to_code` deben ser `['1101','1102','1103']`; `from_code ≠ to_code`; `amount > 0`; `idempotency_key` requerido (para esta acción la UI siempre debe proveer una)
- Response: `{ data: { journal_entry_id, entry_number, from_code, to_code, amount, occurred_at } }`
- Idempotencia: misma clave + mismo hash → respuesta cacheada; misma clave + distinto hash → error 409

#### `record_owner_contribution`
- Roles: manager+
- Payload:
  ```json
  {
    "destination_code": "1103",
    "amount": 10000.00,
    "description": "Aportación agosto 2026",
    "idempotency_key": "CONTRIB-20260815-001"
  }
  ```
- Validación: `destination_code` en `['1101','1102','1103']`; `amount > 0`; `idempotency_key` requerido
- Response: `{ data: { journal_entry_id, entry_number, destination_code, amount, occurred_at } }`

#### `record_owner_withdrawal`
- Roles: superadmin
- Payload:
  ```json
  {
    "source_code": "1101",
    "amount": 2000.00,
    "description": "Retiro personal agosto 2026",
    "authorized_by": "<uuid del superadmin autorizante>",
    "idempotency_key": "WIT-20260815-001"
  }
  ```
- Validación: `source_code` en `['1101','1102','1103']`; `amount > 0`; `authorized_by` UUID válido; `idempotency_key` requerido
- Response: `{ data: { journal_entry_id, entry_number, source_code, amount, authorized_by, occurred_at } }`

#### `reverse_journal_entry`
- Roles: superadmin
- Payload:
  ```json
  {
    "journal_entry_id": "<uuid>",
    "authorized_by": "<uuid>",
    "justification": "Error de captura: duplicado con JE-VENTA-XXXX",
    "idempotency_key": "REV-20260815-JE-001"
  }
  ```
- Validación: `journal_entry_id` UUID válido; `authorized_by` UUID válido; `justification` no vacío; `idempotency_key` requerido
- Response: `{ data: { reversal_entry_id, reversal_entry_number, original_entry_id, occurred_at } }`

#### `resolve_cash_discrepancy`
- Roles: manager+
- Payload:
  ```json
  {
    "cash_session_id": "<uuid>",
    "resolution_type": "sobrante",
    "amount": 50.00,
    "motive": "Diferencia de cambio",
    "idempotency_key": "DISC-20260815-001"
  }
  ```
- Validación: `cash_session_id` UUID válido; `resolution_type` en `['sobrante','faltante']`; `amount > 0`; `motive` no vacío; `idempotency_key` requerido
- Response: `{ data: { journal_entry_id, entry_number, resolution_type, amount, occurred_at } }`

### 6.5 Errores estándar

| HTTP | Código semántico | Cuándo |
|------|-----------------|--------|
| 401 | No autenticado | JWT ausente, expirado o inválido |
| 403 | No autorizado | Usuario activo pero sin rol requerido |
| 400 | Payload inválido | UUID malformado, monto negativo, campo requerido ausente |
| 409 | Idempotency conflict | Misma clave con payload distinto |
| 409 | Operación duplicada | JE ya revertido, ledger ya activo, etc. |
| 422 | Regla de negocio | No hay caja abierta, cuenta inactiva, fondos insuficientes |
| 500 | Error interno | Fallo inesperado — incluir `request_id` para trazabilidad |

### 6.6 Comportamiento de retry

| Escenario | Acción |
|-----------|--------|
| Red flaky en acción sin idempotency_key | NO reintentar; consultar estado y mostrar feedback al usuario |
| Red flaky con idempotency_key (R4–R8, `activate_ledger`) | Reintentar con misma clave — M26 RPCs verifican idempotencia ANTES de lógica de negocio |
| Red flaky en `finalize_pos_sale` vía pos-operations | Ver sección 1.3 — NO reintentar ciegamente; verificar estado de mesa/venta primero |
| Error 409 idempotency conflict | No reintentar; la clave ya fue usada con otro payload; usar nueva clave |
| Error 422 regla de negocio | No reintentar; condición de negocio debe corregirse primero |
| Error 5xx | Reintentar con backoff exponencial (máx. 3 intentos) usando la misma idempotency_key |

### 6.7 Generación de idempotency_key por parte de la UI

```javascript
// Patrón recomendado: prefijo-semántico + fecha + UUID corto
const generateIdempotencyKey = (prefix) =>
  `${prefix}-${new Date().toISOString().slice(0,10)}-${crypto.randomUUID().slice(0,8)}`

// Ejemplos:
// "TRF-2026-08-15-a3f4b2c1"
// "CONTRIB-2026-08-15-f1d2e3b4"
// "WIT-2026-08-15-9a8b7c6d"
```

La clave se genera **al momento de mostrar el formulario** (no al hacer submit), se persiste en estado local del componente y se reutiliza en retries.

---

## 7. Clasificación de Exposición

### 7.1 Lo que la UI puede consultar (con rol manager+)

- Estado del ledger (`get_ledger_status`)
- Saldos de cuentas (`get_account_balances`)
- Libro diario con filtro de fechas (`get_journal_report`)
- Mayor de cuenta (`get_account_ledger`)
- Reporte de sesiones de caja (`get_cash_sessions_report`)

Estos datos **viajan en el body de respuesta de la EF**; nunca se expone la consulta directa a tablas financieras desde el cliente.

### 7.2 Lo que requiere autorización operativa (manager+ o superadmin)

- Transferencias entre fondos (`record_transfer`) → manager+
- Aportaciones de capital (`record_owner_contribution`) → manager+
- Resolución de diferencias de caja (`resolve_cash_discrepancy`) → manager+
- Retiros del propietario (`record_owner_withdrawal`) → superadmin
- Reversa de asientos (`reverse_journal_entry`) → superadmin
- Activación del ledger (`activate_ledger`) → superadmin

### 7.3 Lo que nunca debe llegar al navegador

| Recurso | Razón |
|---------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso irrestricto a DB — solo en EF server-side |
| Tablas `journal_entries`, `journal_lines`, `financial_accounts`, `ledger_settings`, `idempotency_requests` | RLS=false; acceso directo bypasearía toda la lógica de negocio |
| Tablas `cash_discrepancy_resolutions`, `financial_operations` | RLS=false; mismo riesgo |
| Firma interna de RPCs (nombres de argumentos, lógica SQL) | No exponer mensajes de error internos de PostgreSQL sin sanitizar |
| `authorized_by` UUID resuelto | La EF puede validar que el `authorized_by` enviado por la UI es el mismo `user.id` del superadmin autenticado — no confiar en el UUID enviado ciegamente |

---

## 8. Estructura de Archivos para Implementación R8

Solo se modifican/crean los archivos listados. No hay nuevas migraciones, no hay nuevas EFs.

```
supabase/functions/financial-operations/
  index.ts              ← MODIFICAR: loadCallerContext extendido, guards, CORS, validaciones
  _shared/
    types.ts            ← CREAR: tipos TypeScript compartidos (FinancialContext, etc.)
    validators.ts       ← CREAR: isValidUUID, isValidIdempotencyKey, isValidAmount, isValidFundCode
    cors.ts             ← CREAR: getCorsHeaders con ALLOWED_ORIGINS

src/lib/
  permissionConfig.js   ← MODIFICAR: añadir SCREEN_KEY 'finanzas'

src/contexts/
  AuthContext.jsx       ← NO modificar (isManager ya disponible)

src/App.jsx             ← MODIFICAR: registrar ruta/página 'finanzas' con PAGE_LABELS y guard

src/pages/
  FinanzasPage.jsx      ← CREAR (en implementación R8 de UI)

src/services/
  financialService.js   ← CREAR: wrapper de fetch hacia financial-operations EF

docs/
  FASE3_R8_FINANCIAL_API_SECURITY_DESIGN.md   ← este documento
```

### 8.1 Archivos que NO se tocan

- `supabase/migrations/` — ningún archivo nuevo
- `supabase/functions/pos-operations/index.ts` — `finalize_sale` permanece ahí
- `supabase/functions/erp-operations/index.ts` — `record_purchase` permanece ahí
- `supabase/functions/cash-operations/index.ts` — sin cambios
- `supabase/functions/user-admin/index.ts` — sin cambios
- Código fuente de RPCs en DB — sin cambios

### 8.2 Cambio mínimo en `permissionConfig.js`

```javascript
// Añadir a SCREEN_KEYS:
FINANZAS: 'finanzas',
```

Y los permisos correspondientes (si se requiere control granular de permisos dentro del módulo):
```javascript
// En app_permissions (vía migración o seed):
// ('finanzas', 'view')   — ver dashboards
// ('finanzas', 'manage') — ejecutar operaciones
// Por ahora: control de acceso via rol (isManager) en EF; pantalla no requiere permisos granulares en V1
```

---

## 9. Implementación — Resultados

### 9.1 Archivos creados / modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `supabase/functions/financial-operations/handler.js` | **CREADO** | Handler factory testeable: toda la lógica extraída, sin dependencias de Deno |
| `supabase/functions/financial-operations/handler.test.js` | **CREADO** | 33 tests HTTP de integración (mocks de cliente Supabase + env) |
| `supabase/functions/financial-operations/financialRules.js` | **MODIFICADO** | `getCorsOriginHeader` corregido: sin fallback `'*'` |
| `supabase/functions/financial-operations/financialRules.test.js` | **MODIFICADO** | Tests CORS actualizados (eliminados tests que esperaban `'*'`, añadidos 4 nuevos) |
| `supabase/functions/financial-operations/index.ts` | **MODIFICADO** | Ahora es adaptador delgado: importa `handler.js`, pasa `createClient` y `Deno.env` |

### 9.2 Resultados de tests

| Suite | Tests | PASS | FAIL |
|-------|-------|------|------|
| `financialRules.test.js` | 50 | 50 | 0 |
| `handler.test.js` | 33 | 33 | 0 |
| `cashRules.test.js` (regresión) | 5 | 5 | 0 |
| **Total** | **88** | **88** | **0** |

Lint: 0 errores. Sin regresiones en módulos adyacentes.

### 9.3 Estado de cada brecha

| ID | Brecha | Estado | Evidencia (tests) |
|----|--------|--------|-------------------|
| **G01** | `record_transfer` sin rol | ✅ CERRADA | `handler.test.js`: "mesero → record_transfer → 403, RPC=0"; "usuario sin rol → 403, RPC=0" |
| **G02** | `record_owner_contribution` sin rol | ✅ CERRADA | `handler.test.js`: "mesero → record_owner_contribution → 403, RPC=0" |
| **G03** | `resolve_cash_discrepancy` sin rol | ✅ CERRADA | `handler.test.js`: "mesero → resolve_cash_discrepancy → 403, RPC=0" |
| **G04** | CORS wildcard `'*'` — **fix completo** | ✅ CERRADA | `handler.test.js`: 9 tests CORS; `getCorsOriginHeader` nunca retorna `'*'`; ALLOWED_ORIGINS ausente → 403 OPTIONS/POST; origen no permitido → 403 antes de auth; `financialRules.test.js`: "nunca retorna `'*'`" |
| **G05** | Reportes `get_*` sin rol | ✅ CERRADA | `handler.test.js`: 5 tests "mesero → get_* → 403, RPC=0" |
| **G06** | `loadCallerContext` sin roles | ✅ CERRADA | `handler.js` + `handler.test.js`: baseline 403 para mesero y sin-rol verificado en todos los tests G01-G05 |
| **G07** | Sin validación UUID | ✅ CERRADA | `handler.test.js`: 4 tests UUID; `financialRules.test.js`: 7 tests `isValidUUID` |
| **G08** | Sin validación `idempotency_key` | ✅ CERRADA | `handler.test.js`: 2 tests idempotency key; `financialRules.test.js`: 9 tests `isValidIdempotencyKey` |

### 9.4 Matriz de roles aplicada

| Acción | Superadmin | Manager | Administrador Operativo | Mesero | Sin rol |
|--------|-----------|---------|------------------------|--------|---------|
| `get_ledger_status` | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |
| `activate_ledger` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| `record_transfer` | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |
| `record_owner_contribution` | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |
| `record_owner_withdrawal` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| `reverse_journal_entry` | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| `resolve_cash_discrepancy` | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |
| `get_account_balances` | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |
| `get_journal_report` | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |
| `get_account_ledger` | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |
| `get_cash_sessions_report` | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |

> "Manager" y "Administrador Operativo" son roles distintos en `app_roles` pero ambos producen `isManager=true` (mismo patrón que `pos-operations` y `erp-operations`).  
> La línea de corte `!isSuperadmin && !isManager → 403` se aplica en `loadCallerContext`, antes de llegar a cualquier acción.

### 9.5 Decisiones de autorización

1. **Baseline en `loadCallerContext`**: cualquier usuario activo que no sea superadmin ni manager obtiene 403 antes de evaluar la acción. Igual que `erp-operations`. Esto cubre G01–G03 en la raíz y G05 de forma defensiva.

2. **`activate_ledger` y `reverse_journal_entry`**: superadmin-only. Ya lo eran; se mantienen con el nuevo guard `callerIsSuperadmin` que encapsula la lógica.

3. **CORS configurable**: variable de entorno `ALLOWED_ORIGINS` (lista separada por comas). Si está vacía o no configurada, se usa `'*'` como fallback para DEV — **no es un error, es intencional**. En PRD debe configurarse con la URL del frontend.

4. **Compatibilidad hacia atrás**: ningún payload válido existente es rechazado. Los campos UUID opcionalmente ausentes se manejan igual que antes (vacíos rechazan antes de llegar al RPC). Los códigos de fondo ya eran `'1101'/'1102'/'1103'` — la validación solo formaliza lo que el RPC ya rechazaba.

### 9.6 Fortalezas confirmadas (no retrocedidas)

- RPC-level: `SECURITY DEFINER + service_role only` — integridad contable garantizada en DB
- Dual-client pattern: `requestClient` para JWT, `adminClient` para DB/RPC
- Lista cerrada de acciones — sin passthrough genérico de RPC-by-name
- `service_role` nunca expuesto en respuestas al cliente
- `// @ts-nocheck` mantenido consistente con el resto de EFs del repositorio

### 9.7 Comportamiento CORS definitivo

| Escenario | Resultado |
|-----------|-----------|
| `ALLOWED_ORIGINS` vacío/ausente + request con Origin | 403 antes de auth (OPTIONS y POST) |
| `ALLOWED_ORIGINS` vacío/ausente + sin Origin (servidor) | Pasa al handler; sin CORS headers en respuesta |
| Origin en la lista permitida | Respuesta incluye `Access-Control-Allow-Origin: <ese-origen>` + `Vary: Origin` |
| Origin NO en la lista | 403 (OPTIONS explícito) o 403 JSON (POST) antes de auth/RPC |
| `'*'` nunca aparece en ninguna respuesta | Garantizado por `getCorsOriginHeader` y tests |

Para deployment en DEV: configurar `ALLOWED_ORIGINS` con la URL exacta del frontend DEV (o dejar vacío si sólo se accede servidor-a-servidor desde Postman/scripts).  
Para PRD: obligatorio configurar `ALLOWED_ORIGINS` antes del primer deployment.

### 9.8 Pendientes para deployment

1. Configurar `ALLOWED_ORIGINS` como variable de Edge Function en DEV y PRD (URL exacta del frontend).
2. Añadir `SCREEN_KEYS.FINANZAS` en `src/lib/permissionConfig.js` cuando se implemente la UI.
3. Registrar la ruta `/finanzas` en `src/App.jsx` con guard `isManager`.

---

> ### **APTO PARA DESPLEGAR API FINANCIERA SEGURA EN DEV**
>
> 88/88 tests PASS (50 pure + 33 HTTP integration + 5 regresión). Sin regresiones.  
> Brechas G01–G08 cerradas con evidencia de tests de handler real.  
> G04 corregido de forma definitiva: wildcard eliminado; sin fallback; ALLOWED_ORIGINS ausente bloquea cualquier solicitud de navegador.  
> Bloqueador para PRD: configurar `ALLOWED_ORIGINS` antes del primer deployment.

---

*Documento actualizado: 2026-08-16. Implementación completada sin modificaciones a DB, migraciones, datos DEV/PRD, secretos, commits ni push.*
