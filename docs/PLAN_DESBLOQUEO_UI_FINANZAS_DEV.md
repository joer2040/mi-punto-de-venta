# PLAN DESBLOQUEO UI Finanzas DEV

**Fecha:** 2026-08-16  
**Estado:** Plan técnico — sin cambios aplicados  
**Fuentes:** PRECHECK_UI_FINANZAS_DEV.md · HANDOFF_FINANZAS_LA_CARRETA_2026-08-16.md · inspección de código y migraciones  
**Restricciones:** Solo diseño. Sin modificaciones, SQL ejecutado, commits, push ni toques a PRD.

---

## 1. Resumen ejecutivo

Dos bloqueos previenen cualquier prueba manual de la UI de Finanzas en DEV:

1. **CORS**: `ALLOWED_ORIGINS` no configurado → toda llamada desde navegador a `financial-operations` recibe 403 antes del handler.
2. **Permisos en DB**: Las filas `finances:view` y `finances:manage` no existen en `app_permissions` → `canAccessPage('finances')` siempre devuelve `false` para usuarios no-superadmin.

Ambos se resuelven con una configuración de secret y una ejecución de SQL DEV. **El código frontend puede escribirse sin resolver estos bloqueos**, pero las pruebas con usuarios no-superadmin están bloqueadas hasta que ambos se apliquen.

**Orden de trabajo recomendado:**

```
Paso 0 — CORS + permisos DB (bloqueos de entorno, 1 vez)
Paso 1 — financialService.js
Paso 2 — permissionConfig.js
Paso 3 — App.jsx (routing + lazy import)
Paso 4 — FinancesHome.jsx + FinancesBalances.jsx
Paso 5 — Resto de reportes (Journal, Ledger, CashSessions)
Paso 6 — Notificaciones + modales de confirmación
Paso 7 — Formularios de operación (transfer, contrib, etc.)
Paso 8 — Pruebas DEV end-to-end
```

---

## 2. Decisiones necesarias antes de implementar

| # | Decisión | Opciones | Recomendación |
|---|----------|----------|---------------|
| D1 | ¿Desde dónde se prueba la UI en DEV? | Local (`localhost:5173`) / Vercel preview | **Local primero**, añadir Vercel preview después |
| D2 | ¿Color de acento para módulo Finanzas? | `violet700 #7c3aed` / `teal700 #0f766e` | **`violet700`** — diferencia visual clara con reportes (`amber700`) y ventas (`teal700`) |
| D3 | ¿Operaciones de escritura: modal o sub-página? | Modal dentro de `FinancesHome` / sub-páginas tipo `finances-transfer` | **Modal inline** para MVP — menos routing, más rápido de implementar |
| D4 | ¿`activate_ledger` necesita UI en MVP? | Sí / No (ledger ya activo) | **No en MVP** — reservar para administración futura |
| D5 | ¿Quién genera la `idempotency_key`? | Frontend al montar formulario / backend | **Frontend**, con `crypto.randomUUID()` al montar el formulario |
| D6 | ¿`authorized_by` en retiro/reversa es el mismo usuario activo? | Mismo usuario / selector de otro usuario | **Mismo usuario (`user.id`)** para MVP — simplifica el formulario |

---

## 3. Bloqueo CORS / ALLOWED_ORIGINS

### Contexto

El handler R8 lee `ALLOWED_ORIGINS` como secret de Supabase Edge Function:

```javascript
const allowedOrigins = (getEnv('ALLOWED_ORIGINS') ?? '')
  .split(',').map((o) => o.trim()).filter(Boolean)
```

Si la variable está vacía o ausente → `allowedOrigins = []` → `getCorsOriginHeader` retorna `null` → toda petición con header `Origin` recibe 403 antes de autenticarse.

### URL(s) a configurar

| Entorno de prueba | Origen |
|-------------------|--------|
| Vite local (puerto por defecto) | `http://localhost:5173` |
| Vite local (si 5173 ocupado, puerto encontrado en logs) | `http://localhost:5174` |
| Último Vercel preview DEV detectado | `https://mi-punto-de-venta-3id2dlttr-joer2040s-projects.vercel.app` |

**Nota:** Los Vercel preview URLs son efímeros y cambian por rama y por despliegue. Añadir `localhost:5173` resuelve el flujo de desarrollo local sin depender de un URL cambiante. El URL de Vercel preview se añade cuando se quiera probar desde Vercel.

### Valor recomendado de `ALLOWED_ORIGINS`

```
http://localhost:5173,http://localhost:5174
```

Cuando se quiera probar en Vercel preview, añadir ese origen separado por coma:

```
http://localhost:5173,http://localhost:5174,https://mi-punto-de-venta-3id2dlttr-joer2040s-projects.vercel.app
```

### Comando propuesto — NO ejecutar

```bash
npx supabase secrets set \
  ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174" \
  --project-ref rtkdrnfqihulqdhixxzf
```

Para añadir el Vercel preview después (sin sobrescribir otros secrets):

```bash
npx supabase secrets set \
  ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,https://mi-punto-de-venta-3id2dlttr-joer2040s-projects.vercel.app" \
  --project-ref rtkdrnfqihulqdhixxzf
```

### Advertencias de seguridad

- **Nunca usar `*`** — el handler R8 no lo emitirá (G04), pero si se pusiera `*` en la lista, devolvería `*` a cualquier origen.
- El URL de Vercel preview cambia. Revisar que el origen siga siendo válido antes de cada sesión de prueba en Vercel.
- En PRD, `ALLOWED_ORIGINS` debe apuntar únicamente al dominio de la UI de producción — nunca incluir `localhost` ni previews.
- El secret se aplica en la próxima invocación de la función; no requiere re-deploy.

### Validación posterior

```bash
# 1. Verificar que el secret quedó registrado (sin imprimir el valor)
npx supabase secrets list --project-ref rtkdrnfqihulqdhixxzf | grep ALLOWED_ORIGINS

# 2. Smoke test CORS desde terminal
curl -s -D - -o /dev/null \
  -X OPTIONS https://rtkdrnfqihulqdhixxzf.supabase.co/functions/v1/financial-operations \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  | grep -E "HTTP|access-control-allow-origin"
# Debe devolver: HTTP/2 200 + access-control-allow-origin: http://localhost:5173

# 3. Smoke test origen no autorizado (debe seguir siendo 403)
curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS https://rtkdrnfqihulqdhixxzf.supabase.co/functions/v1/financial-operations \
  -H "Origin: https://evil.com"
# Debe devolver: 403
```

---

## 4. Permisos financieros en DB DEV

### Schema confirmado

```sql
-- app_permissions
CREATE TABLE public.app_permissions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  screen_key  text NOT NULL,
  action_key  text NOT NULL,
  description text,
  UNIQUE (screen_key, action_key)
);

-- app_role_permissions  
CREATE TABLE public.app_role_permissions (
  role_id       uuid REFERENCES public.app_roles(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES public.app_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Índice
CREATE INDEX idx_app_permissions_screen_action ON public.app_permissions (screen_key, action_key);
```

**RLS:** `authenticated` puede hacer SELECT en las tres tablas (necesario para que `authService.getCurrentPermissions` funcione).

### Decisión de diseño de permisos

| Pantalla | screen_key | Quién lo tiene |
|----------|-----------|----------------|
| Hub de Finanzas + todas las pantallas de lectura | `finances` / `view` | Manager + Administrador Operativo |
| Operaciones de escritura (transfer, contrib, etc.) | `finances` / `manage` | Solo Superadmin (por contrato R8) |

**Superadmin no necesita filas en `app_role_permissions`** — `can()` en `AuthContext.jsx` devuelve `true` si `is_superadmin`, sin consultar la tabla. No se insertarán filas para superadmin.

**Nota:** `manage` en la UI controla la visibilidad de los botones de operación. El backend siempre valida el rol independientemente — la UI solo oculta/muestra, nunca es el guard de seguridad real.

### SQL propuesto — NO ejecutar

```sql
begin;

-- 1. Crear permisos en catálogo
insert into public.app_permissions (screen_key, action_key, description)
values
  ('finances', 'view',   'Ver el módulo de Finanzas: saldos, pólizas, mayor y sesiones de caja.'),
  ('finances', 'manage', 'Ejecutar operaciones financieras: traspasos, aportaciones, retiros, resoluciones y reversas.')
on conflict (screen_key, action_key) do update
  set description = excluded.description;

-- 2. Asignar finances:view a manager y administrador operativo
insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from   public.app_roles       roles
join   public.app_permissions permissions
       on  permissions.screen_key = 'finances'
       and permissions.action_key = 'view'
where  lower(trim(roles.name)) in ('manager', 'administrador operativo')
on conflict do nothing;

-- NOTA: finances:manage NO se asigna a roles de tabla.
-- Superadmin accede vía is_superadmin=true (bypass en AuthContext y en handler R8).
-- Manager y Administrador Operativo nunca ejecutan operaciones superadmin-only.

commit;
```

### Rollback seguro propuesto

```sql
begin;

-- Eliminar asignaciones de rol
delete from public.app_role_permissions
where permission_id in (
  select id from public.app_permissions
  where screen_key = 'finances'
);

-- Eliminar permisos del catálogo
delete from public.app_permissions
where screen_key = 'finances';

commit;
```

### Validación posterior

```sql
-- Confirmar permisos creados
select screen_key, action_key, description
from   public.app_permissions
where  screen_key = 'finances'
order  by action_key;
-- Debe devolver: finances/manage y finances/view

-- Confirmar asignación a roles
select r.name as rol, p.screen_key, p.action_key
from   public.app_role_permissions rp
join   public.app_roles            r  on r.id = rp.role_id
join   public.app_permissions      p  on p.id = rp.permission_id
where  p.screen_key = 'finances'
order  by r.name, p.action_key;
-- Debe devolver: administrador operativo/view, manager/view
-- NO debe aparecer: mesero ni superadmin (no tienen fila en tabla)
```

### Riesgos

- Si los roles en DEV tienen nombres distintos (caso o espacios extra), el `lower(trim(...))` del INSERT los saltará silenciosamente. Verificar con la query de validación.
- No crear el permiso `finances:manage` como fila de rol podría confundir a futuro. Documentar en el mismo SQL que es intencional (bypass por `is_superadmin`).

---

## 5. Cambios propuestos en `permissionConfig.js`

### Decisión: un solo `SCREEN_KEYS.FINANCES`

**Usar únicamente `finances` como screen key para todo el módulo.** No crear sub-keys por pantalla (`finances_balances`, `finances_journal`, etc.).

**Justificación:**
1. Cada pantalla existente de reportes (inventory, purchases, sales, movements) tiene su propia key porque algunos roles pueden tener acceso a un reporte pero no a otros. En Finanzas, el acceso es binario: manager ve todo, mesero no ve nada.
2. Sub-keys requieren filas adicionales en `app_permissions` + `app_role_permissions` sin agregar control granular real.
3. Si en el futuro se necesita separar (ej. un rol que solo ve saldos), se agregan sub-keys en ese momento con una migración.

### Diff conceptual

```javascript
// src/lib/permissionConfig.js — CAMBIOS PROPUESTOS (no aplicar)

export const SCREEN_KEYS = {
  HOME: 'home',
  MASTER: 'master',
  PROVIDERS: 'providers',
  PURCHASES: 'purchases',
  MOVEMENTS: 'movements',
  CASH_CONTROL: 'cash_control',
  REPORTS: 'reports',
  REPORT_INVENTORY: 'report_inventory',
  REPORT_PURCHASES: 'report_purchases',
  REPORT_SALES: 'report_sales',
  REPORT_MATERIAL_MOVEMENTS: 'report_material_movements',
  POS: 'pos',
  SECURITY_USERS: 'security_users',
+ FINANCES: 'finances',           // ← nueva entrada
}

// ACTION_KEYS — sin cambios (VIEW y MANAGE ya existen)

export const PAGE_PERMISSION_MAP = {
  home: SCREEN_KEYS.HOME,
  master: SCREEN_KEYS.MASTER,
  providers: SCREEN_KEYS.PROVIDERS,
  purchases: SCREEN_KEYS.PURCHASES,
  movements: SCREEN_KEYS.MOVEMENTS,
  'cash-control': SCREEN_KEYS.CASH_CONTROL,
  reports: SCREEN_KEYS.REPORTS,
  'report-inventory': SCREEN_KEYS.REPORT_INVENTORY,
  'report-purchases': SCREEN_KEYS.REPORT_PURCHASES,
  'report-sales': SCREEN_KEYS.REPORT_SALES,
  'report-movements': SCREEN_KEYS.REPORT_MATERIAL_MOVEMENTS,
  pos: SCREEN_KEYS.POS,
  security: SCREEN_KEYS.SECURITY_USERS,
+ finances: SCREEN_KEYS.FINANCES,           // ← nueva entrada
+ 'finances-balances': SCREEN_KEYS.FINANCES, // ← sub-rutas reutilizan la misma key
+ 'finances-journal':  SCREEN_KEYS.FINANCES,
+ 'finances-ledger':   SCREEN_KEYS.FINANCES,
+ 'finances-sessions': SCREEN_KEYS.FINANCES,
}

export const PAGE_ORDER = [
  'home',
  'master',
  'providers',
  'purchases',
  'movements',
  'cash-control',
  'reports',
  'report-inventory',
  'report-purchases',
  'report-sales',
  'report-movements',
  'pos',
+ 'finances',            // ← antes de 'security'
+ 'finances-balances',
+ 'finances-journal',
+ 'finances-ledger',
+ 'finances-sessions',
  'security',
]
```

`PRIMARY_NAV_PAGES` en `App.jsx` (no en `permissionConfig.js`) también necesita `'finances'`:

```javascript
// App.jsx — CAMBIO PROPUESTO (no aplicar)
const PRIMARY_NAV_PAGES = [
  'home', 'master', 'providers', 'purchases', 'movements',
  'cash-control', 'reports', 'pos',
+ 'finances',    // ← muestra en nav solo si canAccessPage('finances') === true
  'security',
]

const PAGE_LABELS = {
  // ...existentes...
+ finances: 'Finanzas',
+ 'finances-balances': 'Saldos',
+ 'finances-journal':  'Pólizas',
+ 'finances-ledger':   'Mayor contable',
+ 'finances-sessions': 'Sesiones de caja',
}
```

### Archivos afectados

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/lib/permissionConfig.js` | Añadir `SCREEN_KEYS.FINANCES` + 5 entradas en `PAGE_PERMISSION_MAP` + 5 en `PAGE_ORDER` |
| `src/App.jsx` | Añadir `'finances'` a `PRIMARY_NAV_PAGES`, 5 labels en `PAGE_LABELS`, lazy import, case en `PageContent` |

---

## 6. Diseño propuesto de `financialService.js`

Archivo: `src/api/financialService.js`

### Contrato real del handler (confirmado desde `handler.js`)

| Acción | Autorización | Parámetros requeridos | Respuesta |
|--------|-------------|----------------------|-----------|
| `get_ledger_status` | Manager | — | `{ is_active, ledger_cutover_at, activated_at }` |
| `get_account_balances` | Manager | `as_of?` (ISO string) | `{ balances: [...] }` |
| `get_journal_report` | Manager | `from_date`, `to_date` (YYYY-MM-DD) | `{ entries: [...] }` |
| `get_account_ledger` | Manager | `account_code`, `from_date?`, `to_date?` | `{ ledger: [...] }` |
| `get_cash_sessions_report` | Manager | `from_date?`, `to_date?` | `{ sessions: [...] }` |
| `record_transfer` | Manager | `from_code`, `to_code`, `amount`, `description?`, `idempotency_key?` | `{ transfer: {...} }` |
| `record_owner_contribution` | Manager | `destination_code`, `amount`, `description?`, `idempotency_key?` | `{ contribution: {...} }` |
| `record_owner_withdrawal` | **Superadmin** | `source_code`, `amount`, `authorized_by` (UUID), `description?`, `idempotency_key?` | `{ withdrawal: {...} }` |
| `resolve_cash_discrepancy` | Manager | `cash_session_id` (UUID), `resolution_type` (`sobrante`/`faltante`), `amount`, `motive`, `idempotency_key?` | `{ resolution: {...} }` |
| `reverse_journal_entry` | **Superadmin** | `journal_entry_id` (UUID), `authorized_by` (UUID), `justification`, `idempotency_key?` | `{ reversal: {...} }` |

### Código propuesto — NO aplicar

```javascript
// src/api/financialService.js
import { supabase } from '../lib/supabase'

const invokeFinancialOperation = async (action, payload = {}) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('financial-operations', {
    body: { action, ...payload },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  })

  if (error) {
    const response = error.context

    if (response && typeof response.clone === 'function') {
      const jsonResponse = response.clone()
      const textResponse = response.clone()

      let parsedJson = null
      try { parsedJson = await jsonResponse.json() } catch { /* ignorar */ }
      if (parsedJson?.error) throw new Error(parsedJson.error)

      let errorText = ''
      try { errorText = await textResponse.text() } catch { /* ignorar */ }
      if (errorText) throw new Error(errorText)
    }

    throw new Error(error.message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export const financialService = {
  // ── Consultas (Manager y Superadmin) ──────────────────────────────────────

  getLedgerStatus: () =>
    invokeFinancialOperation('get_ledger_status'),

  getAccountBalances: (asOf = null) =>
    invokeFinancialOperation('get_account_balances', {
      ...(asOf ? { as_of: asOf } : {}),
    }),

  getJournalReport: (fromDate, toDate) =>
    invokeFinancialOperation('get_journal_report', {
      from_date: fromDate,
      to_date: toDate,
    }),

  getAccountLedger: (accountCode, fromDate = null, toDate = null) =>
    invokeFinancialOperation('get_account_ledger', {
      account_code: accountCode,
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate   ? { to_date: toDate }     : {}),
    }),

  getCashSessionsReport: (fromDate = null, toDate = null) =>
    invokeFinancialOperation('get_cash_sessions_report', {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate   ? { to_date: toDate }     : {}),
    }),

  // ── Operaciones de escritura (Manager) ────────────────────────────────────

  recordTransfer: ({ fromCode, toCode, amount, description, idempotencyKey }) =>
    invokeFinancialOperation('record_transfer', {
      from_code:       fromCode,
      to_code:         toCode,
      amount:          Number(amount),
      description:     description || undefined,
      idempotency_key: idempotencyKey,
    }),

  recordOwnerContribution: ({ destinationCode, amount, description, idempotencyKey }) =>
    invokeFinancialOperation('record_owner_contribution', {
      destination_code: destinationCode,
      amount:           Number(amount),
      description:      description || undefined,
      idempotency_key:  idempotencyKey,
    }),

  resolveDiscrepancy: ({ cashSessionId, resolutionType, amount, motive, idempotencyKey }) =>
    invokeFinancialOperation('resolve_cash_discrepancy', {
      cash_session_id:  cashSessionId,
      resolution_type:  resolutionType,
      amount:           Number(amount),
      motive,
      idempotency_key:  idempotencyKey,
    }),

  // ── Operaciones de escritura (Superadmin only) ────────────────────────────

  recordOwnerWithdrawal: ({ sourceCode, amount, authorizedBy, description, idempotencyKey }) =>
    invokeFinancialOperation('record_owner_withdrawal', {
      source_code:     sourceCode,
      amount:          Number(amount),
      authorized_by:   authorizedBy,
      description:     description || undefined,
      idempotency_key: idempotencyKey,
    }),

  reverseJournalEntry: ({ journalEntryId, authorizedBy, justification, idempotencyKey }) =>
    invokeFinancialOperation('reverse_journal_entry', {
      journal_entry_id: journalEntryId,
      authorized_by:    authorizedBy,
      justification,
      idempotency_key:  idempotencyKey,
    }),
}
```

### Validaciones frontend mínimas

El handler ya valida en backend. El frontend debe validar ANTES del submit para UX:

| Campo | Validación frontend |
|-------|-------------------|
| `amount` | `> 0`, numérico, máx 2 decimales |
| `from_code` / `to_code` / `destination_code` / `source_code` | Uno de `['1101', '1102', '1103']` |
| `cash_session_id`, `journal_entry_id`, `authorized_by` | Formato UUID (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) |
| `resolution_type` | `'sobrante'` o `'faltante'` |
| `from_date` / `to_date` | Formato `YYYY-MM-DD` |
| `justification` | No vacío para reversas |
| `motive` | No vacío para discrepancias |
| `idempotency_key` | `/^[A-Za-z0-9\-_.]{1,128}$/` (generada automáticamente, no la valida el usuario) |

### Riesgos

- **El mayor riesgo:** añadir accidentalmente `supabase.rpc('record_transfer', {...})` en vez de `invokeFinancialOperation`. El nombre del archivo `financialService.js` y los métodos nombrados por dominio (no por RPC) ayudan, pero requiere revisión en code review.
- **Doble consumo del body:** usar `.clone()` antes de leer el response, igual que `cashControlService.js`.
- **409 idempotencia:** el handler devuelve 409 cuando la clave ya fue usada. El frontend debe presentar esto como "operación ya registrada" y no como error, mostrando el resultado de la operación anterior (que viene en el body).

---

## 7. Diseño propuesto de FinancesHome

### Estructura de archivos

```
src/pages/
├── FinancesHome.jsx        # Hub + modales de operación
├── FinancesBalances.jsx    # Saldos de cuentas (ReportView)
├── FinancesJournal.jsx     # Pólizas contables (ReportView)
├── FinancesLedger.jsx      # Mayor por cuenta (ReportView + selector)
└── FinancesCashSessions.jsx # Sesiones de caja financieras (ReportView)
```

### Cambios requeridos en `App.jsx` — conceptuales, no aplicar

```javascript
// Lazy imports añadir:
const FinancesHome          = lazy(() => import('./pages/FinancesHome'))
const FinancesBalances      = lazy(() => import('./pages/FinancesBalances'))
const FinancesJournal       = lazy(() => import('./pages/FinancesJournal'))
const FinancesLedger        = lazy(() => import('./pages/FinancesLedger'))
const FinancesCashSessions  = lazy(() => import('./pages/FinancesCashSessions'))

// Casos en PageContent añadir:
case 'finances':
  return <FinancesHome onNavigate={onNavigate} />
case 'finances-balances':
  return <FinancesBalances />
case 'finances-journal':
  return <FinancesJournal />
case 'finances-ledger':
  return <FinancesLedger />
case 'finances-sessions':
  return <FinancesCashSessions />
```

### `FinancesHome.jsx` — estructura de cards

```
FINANZAS                                             [eyebrow violet700]
Módulo Financiero                                    [título]
Consulta saldos, movimientos y gestión financiera.  [subtítulo]

────────── REPORTES (finances:view) ──────────────
┌──────────────────┐  ┌──────────────────┐
│ Reporte          │  │ Reporte          │
│ Saldos de cuentas│  │ Pólizas          │
│ Consulta saldos  │  │ Asientos         │
│ actuales por     │  │ contables por    │
│ cuenta contable. │  │ rango de fechas. │
└──────────────────┘  └──────────────────┘
┌──────────────────┐  ┌──────────────────┐
│ Reporte          │  │ Reporte          │
│ Mayor contable   │  │ Sesiones de caja │
│ Movimientos por  │  │ Histórico de     │
│ cuenta con saldo │  │ sesiones y       │
│ acumulado.       │  │ diferencias.     │
└──────────────────┘  └──────────────────┘

────────── OPERACIONES (finances:manage / Superadmin) ──────
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐
│ Operación        │  │ Operación        │  │ Operación    │
│ Traspaso         │  │ Aportación       │  │ Retiro       │
│ Entre fondos     │  │ Del propietario  │  │ Del prop.    │
│ (manager)        │  │ (manager)        │  │ (superadmin) │
└──────────────────┘  └──────────────────┘  └──────────────┘
┌──────────────────┐  ┌──────────────────┐
│ Operación        │  │ Operación        │
│ Discrepancia     │  │ Reversa          │
│ (manager)        │  │ (superadmin)     │
└──────────────────┘  └──────────────────┘
```

**Copy exacto sugerido para hub:**

```
Eyebrow:     FINANZAS
Título:      Módulo Financiero
Subtítulo:   Consulta saldos de cuentas, pólizas, mayor contable y sesiones de caja.
             Registra traspasos, aportaciones y resuelve diferencias.

Cards de reporte:
- "Saldos de cuentas" / "Consulta el saldo actual de cada cuenta contable."
- "Pólizas / Asientos" / "Revisa todos los movimientos contables por rango de fechas."
- "Mayor contable" / "Consulta el historial de movimientos de una cuenta con saldo acumulado."
- "Sesiones de caja" / "Histórico de sesiones de caja con sus diferencias y resoluciones."

Cards de operación (solo si can('finances', 'manage')):
- "Traspaso entre fondos" / "Mueve efectivo entre Caja operativa, Caja fuerte y Banco."
- "Aportación del propietario" / "Registra una entrada de capital a los fondos."
- "Retiro del propietario" / "Registra un retiro de capital de los fondos. Requiere autorización."
- "Resolución de diferencia" / "Registra el sobrante o faltante de una sesión de caja."
- "Reversa de póliza" / "Revierte un asiento contable con justificación. Requiere autorización."
```

### Permisos visuales en el hub

```javascript
// Dentro de FinancesHome.jsx
const { can, isSuperadmin, isManager } = useAuth()

// Reportes — visible si can('finances', 'view')
const canViewFinances = can(SCREEN_KEYS.FINANCES, ACTION_KEYS.VIEW)

// Operaciones — visible si superadmin (bypass de can())
const canManageFinances = isSuperadmin

// En el futuro, si se quiere permitir manager ver las cards de operación:
// const canManageFinances = can(SCREEN_KEYS.FINANCES, ACTION_KEYS.MANAGE)
// Por ahora, todas las operaciones son superadmin-only o manager-only en backend;
// para MVP se muestra el bloque a superadmin y se notifica al manager cuando intenta.
```

### Riesgos de UI

- **Doble guard:** el módulo ocultará en nav si `canAccessPage('finances') === false`. Pero si alguien navegara directamente (ej. editando localStorage), el componente debe verificar permisos internamente también.
- Los botones de operación deben estar deshabilitados (no solo ocultos) para usuarios con `finances:view` pero sin `finances:manage`, con tooltip explicativo.

---

## 8. Estrategia MVP de notificaciones y confirmaciones

### Situación actual

El proyecto usa `window.alert` para errores críticos y texto inline para feedback. No existe toast ni modal reutilizable.

### Recomendación MVP: estado inline por formulario

Para las pantallas de reportes (solo lectura): el estado de error inline es suficiente:

```javascript
// Patrón mínimo en FinancesBalances.jsx
const [error, setError] = useState(null)
const [loading, setLoading] = useState(true)

// En render:
{error && <div style={errorBannerStyle}>{error}</div>}
```

Para los formularios de operación (escritura con idempotencia):

```javascript
// Estado de resultado por formulario
const [result, setResult] = useState(null)   // null | 'success' | 'duplicate' | 'error'
const [resultMessage, setResultMessage] = useState('')
```

### Componente `FinanceAlert` sugerido — dónde viviría

`src/components/FinanceAlert.jsx` — componente simple, solo para Finanzas en MVP:

```javascript
// Pseudocódigo — no aplicar
const FinanceAlert = ({ type, message, onDismiss }) => {
  if (!message) return null
  const style = type === 'success' ? successStyle
              : type === 'duplicate' ? warningStyle
              : errorStyle
  return (
    <div style={style}>
      <span>{message}</span>
      {onDismiss && <button onClick={onDismiss}>✕</button>}
    </div>
  )
}
```

Colores sugeridos:
- Error: `colors.red100` / `colors.red700`
- Éxito: `colors.green100` / `colors.green700`
- Duplicado (409): `colors.amber50` / `colors.amber700`

### Confirmaciones de operaciones delicadas

Para retiros y reversas (operaciones superadmin-only, difíciles de revertir):

```javascript
// Estado local de confirmación — sin componente modal
const [isConfirming, setIsConfirming] = useState(false)

// Primera pantalla: formulario + botón "Continuar"
// Segunda pantalla (isConfirming === true): resumen de lo que se va a hacer + botón "Confirmar" + "Cancelar"
```

**No crear infraestructura de modal compartido para MVP** — dos formularios de operación (retiro y reversa) no justifican un sistema de portales. El estado `isConfirming` local es suficiente y más simple de depurar.

### Cuándo NO conviene crear más infraestructura

- Si el MVP solo tiene formularios de traspaso, aportación y resolución de discrepancia (que no requieren confirmación extra), un `FinanceAlert` inline es suficiente.
- Si los toasts se necesitan en otros módulos, agregarlos en ese momento como trabajo separado — no para Finanzas.

---

## 9. Estrategia de `idempotency_key`

### Regla del handler

```
/^[A-Za-z0-9\-_.]{1,128}$/
```

`crypto.randomUUID()` genera `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` — cumple el regex, longitud ~36.

### Estrategia frontend

```javascript
// Al montar el formulario de operación — generar una vez:
const [idempotencyKey] = useState(() => crypto.randomUUID())

// Preservar en estado — NO regenerar en retries
// Si el usuario abre el formulario de nuevo (desmonta y remonta), genera una nueva clave
// → operación nueva → correcto
```

### Flujo de retry

```
1. Usuario llena formulario y hace clic en "Confirmar"
2. Frontend envía con idempotencyKey fija
3. Si error de red → usuario puede reintentar → misma clave → el handler la ignora si ya fue procesada
4. Si recibe 409 → mostrar "Esta operación ya fue registrada" con referencia al resultado original
5. Si éxito → mostrar número de póliza devuelto → resetear formulario con NUEVA clave
```

### Formato de clave sugerido

`crypto.randomUUID()` es suficiente. No se necesita prefijo por tipo de operación para MVP. El handler no requiere semántica en la clave — solo validez del formato.

### Riesgo

- Si el componente de formulario se desmonta por error de React (ej. Suspense fallback) y remonta, genera una nueva clave, convirtiendo un retry en una operación nueva. Mitigación: asegurarse de que el formulario solo se desmonte cuando el usuario explícitamente cancele o después de éxito.

---

## 10. Plan de pruebas DEV

### Datos mínimos requeridos

| Usuario | Rol en DB | Propósito de prueba |
|---------|-----------|---------------------|
| Superadmin existente | `is_superadmin=true` | Todo el módulo + operaciones superadmin-only |
| Usuario manager | Rol `manager` en `app_user_roles` | Reportes + operaciones manager; bloqueado en superadmin-only |
| Usuario admin. operativo | Rol `administrador operativo` | Igual que manager |
| Mesero | Rol `mesero` | No debe ver el módulo ni acceder |
| Usuario sin rol | Sin roles | No debe ver el módulo ni acceder |

### Checklist de validación por rol

#### Superadmin

- [ ] Opción "Finanzas" aparece en navegación
- [ ] `FinancesHome` carga correctamente con todas las cards (reportes + operaciones)
- [ ] `FinancesBalances` carga saldos con status 200 de la Edge Function
- [ ] `FinancesJournal` carga pólizas con rango de fechas
- [ ] `FinancesLedger` carga mayor de cuenta `1101`
- [ ] `FinancesCashSessions` carga sesiones de caja
- [ ] Formulario de traspaso: envío exitoso devuelve número de póliza
- [ ] Formulario de aportación: envío exitoso devuelve número de póliza
- [ ] Formulario de retiro: disponible y enviable (superadmin-only)
- [ ] Formulario de reversa: disponible y enviable (superadmin-only)
- [ ] Idempotencia: segundo submit con misma clave devuelve 409 con resultado original
- [ ] Logout por inactividad (10 min): funcionando sin cambios

#### Manager / Administrador Operativo

- [ ] Opción "Finanzas" aparece en navegación
- [ ] `FinancesHome` carga con cards de reportes visibles
- [ ] Cards de operaciones superadmin-only: NO visibles O visibles pero deshabilitadas con mensaje explicativo
- [ ] `FinancesBalances`, `FinancesJournal`, `FinancesLedger`, `FinancesCashSessions`: cargando correctamente
- [ ] Formulario de traspaso: disponible y exitoso (manager puede)
- [ ] Formulario de aportación: disponible y exitoso (manager puede)
- [ ] Retiro/reversa: rechazado con 403 si intentara llamarlo (no debe haber botón visible)
- [ ] Backend confirma 403 para `record_owner_withdrawal` con token de manager

#### Mesero

- [ ] Opción "Finanzas" NO aparece en navegación
- [ ] Acceso directo a `finances` (modificando localStorage): redirige a primera página permitida
- [ ] Cualquier llamada manual a `financial-operations` con token de mesero devuelve 403 del handler

#### Usuario sin rol

- [ ] Mismo comportamiento que mesero para Finanzas
- [ ] Handler devuelve 403 con mensaje "No tienes permisos para operar el módulo financiero."

### Validaciones CORS y seguridad

- [ ] CORS: request con `Origin: http://localhost:5173` → `Access-Control-Allow-Origin: http://localhost:5173` en respuesta
- [ ] CORS: request con `Origin: https://evil.com` → 403 antes de autenticación
- [ ] Sin `Origin` (curl/Postman): llega al handler, valida JWT normalmente
- [ ] No existen llamadas `supabase.rpc(...)` en `financialService.js` (code review)
- [ ] No existen llamadas `supabase.from('journal_entries')...` en frontend (code review)

### Evidencia a capturar

- Capturas de pantalla de la nav con cada rol
- Respuesta JSON de `get_account_balances` exitosa (con datos reales de DEV)
- Respuesta 403 del handler para mesero (Network tab de DevTools)
- Respuesta 409 de idempotencia en segundo submit
- Headers CORS en una respuesta exitosa (Origin header presente, ACAO = localhost)

### Criterios de aprobación

- Superadmin: todas las pantallas de lectura cargan datos reales de DEV
- Manager: reportes funcionan; operaciones superadmin-only bloqueadas en UI y en backend
- Mesero: módulo invisible en nav; 403 en cualquier intento de acceso directo
- Sin datos financieros sensibles en localStorage ni en la consola del navegador

---

## 11. Archivos que se tocarían en implementación

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `src/lib/permissionConfig.js` | Existente | Añadir `SCREEN_KEYS.FINANCES`, entradas en `PAGE_PERMISSION_MAP` y `PAGE_ORDER` |
| `src/App.jsx` | Existente | Lazy imports, `PAGE_LABELS`, `PRIMARY_NAV_PAGES`, casos en `PageContent` |
| `src/api/financialService.js` | **Nuevo** | Servicio completo |
| `src/pages/FinancesHome.jsx` | **Nuevo** | Hub con cards |
| `src/pages/FinancesBalances.jsx` | **Nuevo** | Saldos con ReportView |
| `src/pages/FinancesJournal.jsx` | **Nuevo** | Pólizas con ReportView |
| `src/pages/FinancesLedger.jsx` | **Nuevo** | Mayor con ReportView + selector de cuenta |
| `src/pages/FinancesCashSessions.jsx` | **Nuevo** | Sesiones con ReportView |
| `src/components/FinanceAlert.jsx` | **Nuevo** | Banner de estado inline |

**No se tocan:** `AuthContext.jsx`, `supabase.js`, `designTokens.js`, `reportUtils.js`, `ReportView.jsx`.

Total: 2 archivos modificados, 7 archivos nuevos.

---

## 12. SQL propuesto, no ejecutado

```sql
-- ARCHIVO: sql/dev/2026-08-16_seed_finances_permissions.sql
-- ENTORNO: DEV únicamente
-- PROPÓSITO: Crear permisos del módulo de Finanzas y asignarlos a roles
-- IDEMPOTENTE: Sí (ON CONFLICT DO NOTHING / DO UPDATE)
-- ROLLBACK: Ver sección 4

begin;

insert into public.app_permissions (screen_key, action_key, description)
values
  ('finances', 'view',   'Ver el módulo de Finanzas: saldos, pólizas, mayor y sesiones de caja.'),
  ('finances', 'manage', 'Ejecutar operaciones financieras: traspasos, aportaciones, retiros, resoluciones y reversas.')
on conflict (screen_key, action_key) do update
  set description = excluded.description;

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from   public.app_roles       roles
join   public.app_permissions permissions
       on  permissions.screen_key = 'finances'
       and permissions.action_key = 'view'
where  lower(trim(roles.name)) in ('manager', 'administrador operativo')
on conflict do nothing;

-- Validación inline
do $$
declare
  perm_count  int;
  assign_count int;
begin
  select count(*) into perm_count
  from public.app_permissions
  where screen_key = 'finances';

  select count(*) into assign_count
  from public.app_role_permissions rp
  join public.app_permissions p on p.id = rp.permission_id
  where p.screen_key = 'finances';

  if perm_count < 2 then
    raise exception 'ERROR: se esperaban 2 permisos finances, se encontraron %', perm_count;
  end if;
  raise notice 'OK: % permisos finances creados, % asignaciones de rol', perm_count, assign_count;
end;
$$;

commit;
```

---

## 13. Comandos propuestos, no ejecutados

### Configurar ALLOWED_ORIGINS en DEV

```bash
# Local solamente (primera iteración)
npx supabase secrets set \
  ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174" \
  --project-ref rtkdrnfqihulqdhixxzf

# Con Vercel preview (cuando se necesite)
npx supabase secrets set \
  ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,https://mi-punto-de-venta-3id2dlttr-joer2040s-projects.vercel.app" \
  --project-ref rtkdrnfqihulqdhixxzf
```

### Verificar que el secret quedó registrado

```bash
npx supabase secrets list --project-ref rtkdrnfqihulqdhixxzf | grep ALLOWED_ORIGINS
```

### Ejecutar el SQL de permisos DEV (cuando se autorice)

```bash
npx supabase db execute \
  --file sql/dev/2026-08-16_seed_finances_permissions.sql \
  --project-ref rtkdrnfqihulqdhixxzf
```

### Smoke test CORS post-configuración

```bash
# Debe devolver 200 + ACAO header con http://localhost:5173
curl -s -D - -o /dev/null \
  -X OPTIONS https://rtkdrnfqihulqdhixxzf.supabase.co/functions/v1/financial-operations \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"

# Debe devolver 403 (sin ACAO header)
curl -s -o /dev/null -w "Status: %{http_code}\n" \
  -X OPTIONS https://rtkdrnfqihulqdhixxzf.supabase.co/functions/v1/financial-operations \
  -H "Origin: https://evil.com"
```

### Iniciar dev server local para pruebas

```bash
cd D:/ProjectsDEV/pventa/mi-punto-de-venta
npm run dev
# Confirmar que corre en http://localhost:5173 (o 5174 si hay conflicto)
```

---

## 14. Riesgos y mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|-------------|---------|------------|
| R1 | `ALLOWED_ORIGINS` mal configurado → CORS bloqueado | Alta (primer despliegue) | Alto | Smoke test inmediato post-configuración |
| R2 | Roles en DB con nombres distintos al esperado → permisos no asignados | Baja | Alto | Query de validación inline en SQL + query posterior |
| R3 | `financialService.js` llama `supabase.rpc` accidentalmente | Baja | Alto | Revisión de código (grep `supabase.rpc` en financialService) en PR |
| R4 | Vercel preview URL cambia entre sesiones → CORS falla en Vercel | Alta | Medio | Probar desde localhost primero; actualizar ALLOWED_ORIGINS con el nuevo URL cuando sea necesario |
| R5 | Doble consumo del body del error antes de leer JSON | Media | Medio | Usar `.clone()` igual que `cashControlService.js` |
| R6 | `idempotency_key` regenerada en retry → operación duplicada | Media | Alto | Generar la clave en `useState(() => crypto.randomUUID())` — se preserva por vida del componente |
| R7 | Usuario manager intenta `record_owner_withdrawal` desde UI | Baja | Bajo | El backend devuelve 403; la UI debe no mostrar el botón pero manejar el error igualmente |
| R8 | Paginación de 10/20 rows insuficiente para pólizas históricas | Media | Bajo | No bloquea MVP; `reportUtils.js` puede ajustarse después |
| R9 | `finances:manage` no asignado a ningún rol → botones de operación nunca visibles para no-superadmin | Baja | Medio | Intencional en MVP: todas las operaciones de escritura son superadmin-only o necesitan revisión explícita del manager. Documentar. |

---

## 15. Recomendación final de implementación por fases

### Fase 0 — Desbloqueo de entorno (precondición)

**No requiere código. Requiere decisión y ejecución.**

1. Confirmar URL de prueba local (`http://localhost:5173`)
2. Configurar `ALLOWED_ORIGINS` en DEV → smoke test CORS
3. Ejecutar SQL de permisos DEV → validar con query

**Criterio de salida:** CORS pasa para localhost, roles manager/admin.operativo ven `finances:view` en su `permissionKeys`.

---

### Fase 1 — Servicio y configuración (sin UI visible)

1. Crear `src/api/financialService.js`
2. Actualizar `src/lib/permissionConfig.js`
3. Añadir `finances` a `App.jsx` (lazy import + case vacío → `<div>En construcción</div>`)
4. Verificar que "Finanzas" aparece en nav para manager y no para mesero

**Criterio de salida:** Nav muestra "Finanzas" para manager, no para mesero. `financialService.getLedgerStatus()` devuelve datos reales desde la consola del browser (sin UI todavía).

---

### Fase 2 — Pantallas de solo lectura

1. `FinancesHome.jsx` (hub con cards de reportes)
2. `FinancesBalances.jsx`
3. `FinancesJournal.jsx`
4. `FinancesLedger.jsx` (con selector de cuenta)
5. `FinancesCashSessions.jsx`

**Criterio de salida:** Manager ve y puede filtrar los 4 reportes con datos reales de DEV.

---

### Fase 3 — Operaciones financieras

1. `FinanceAlert.jsx`
2. Modal de traspaso entre fondos
3. Modal de aportación del propietario
4. Modal de resolución de discrepancia
5. (Superadmin) Modal de retiro + modal de reversa

**Criterio de salida:** Superadmin puede ejecutar las 5 operaciones. Manager puede ejecutar las 3 que le corresponden. Idempotencia verificada manualmente (segundo submit devuelve 409 y muestra el resultado anterior).

---

### Fase 4 — Pruebas E2E y preparación para PRD

1. Ejecutar checklist completo de la sección 10 con cada rol
2. Capturar evidencia (pantallas, Network tab)
3. Documentar en `FASE3_R9_UI_FINANZAS_DEV_VALIDATION.md`
4. Preparar precheck de PRD (separado — no iniciar hasta aprobar Fase 4)

**Criterio de salida:** Todos los ítems del checklist aprobados. Sin llamadas directas a RPCs financieras. Sin `access-control-allow-origin: *` en respuestas del handler.

---

*Documento generado: 2026-08-16. Sin cambios aplicados. Sin SQL ejecutado. Sin secrets configurados.*
