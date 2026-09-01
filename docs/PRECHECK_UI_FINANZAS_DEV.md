# PRECHECK UI Finanzas DEV

**Fecha:** 2026-08-16  
**Fuente:** inspección estática del código en `chore/code-cleanup` (working tree local)  
**Base backend:** `main@a55c5db` — `financial-operations` v2 activa en DEV  
**Restricciones:** sin cambios de código, sin tocar Supabase, DB, secretos ni PRD.

---

## 1. Resumen ejecutivo

El frontend es una SPA React 19 + Vite con routing de estado interno (sin React Router). Usa un sistema de permisos robusto basado en `permissionConfig.js` + `AuthContext` + tablas `app_permissions`. El patrón para consumir Edge Functions ya está establecido en `erpService.js` y `cashControlService.js` y es directamente replicable para `financialService.js`. Existe un componente `ReportView` reutilizable que cubre las cuatro pantallas de consulta financiera con costo mínimo.

**Brechas para implementar la UI:**

| # | Brecha | Archivo | Criticidad |
|---|--------|---------|-----------|
| B1 | `SCREEN_KEYS.FINANCES` no existe | `permissionConfig.js` | Alta |
| B2 | Ruta `finances` no existe en `App.jsx` | `App.jsx` | Alta |
| B3 | `financialService.js` no existe | `src/api/` | Alta |
| B4 | `ALLOWED_ORIGINS` no configurado en DEV | Supabase secrets | Alta (bloqueo CORS) |
| B5 | Sin sistema de notificaciones/toasts | — | Media |
| B6 | Sin modales de confirmación reutilizables | — | Media |
| B7 | Permisos de Finanzas no existen en DB | `app_permissions` | Alta |

**Veredicto:** `LISTO PARA DISEÑAR — IMPLEMENTACIÓN POSIBLE CON PATRONES EXISTENTES`

---

## 2. Estructura frontend detectada

```
src/
├── api/
│   ├── authService.js          # Auth: signIn, signOut, getSession, getCurrentProfile, getCurrentPermissions
│   ├── cashControlService.js   # EF cash-operations: open/close/overview
│   ├── erpService.js           # EF erp-operations: compras, materiales, movimientos
│   ├── materialService.js      # Queries directas Supabase: ventas, inventario, compras
│   ├── posService.js           # EF pos-operations: mesas, ventas
│   ├── providerService.js      # Query directa: proveedores
│   └── securityService.js      # EF user-admin: usuarios y roles
├── components/
│   ├── MaterialForm.jsx        # Formulario de materiales (reutilizable)
│   └── ReportView.jsx          # Tabla paginada + filtros + export Excel (muy reutilizable)
├── contexts/
│   └── AuthContext.jsx         # Sesión, roles, permisos, idle timeout
├── lib/
│   ├── designTokens.js         # Sistema de tokens: colors, space, type, radius, shadow
│   ├── permissionConfig.js     # SCREEN_KEYS, ACTION_KEYS, PAGE_PERMISSION_MAP, PAGE_ORDER
│   ├── reportUtils.js          # formatCurrency, formatDateTime, downloadReportAsExcel
│   ├── supabase.js             # Cliente Supabase con guards de ambiente (DEV/PRD)
│   └── useResponsive.js        # Hook isMobile/isTablet
├── pages/
│   ├── AccessDenied.jsx
│   ├── CashControl.jsx         # Control y corte de caja (PDF con jsPDF)
│   ├── Home.jsx                # Hub de módulos con cards
│   ├── Inventory.jsx
│   ├── InventoryReport.jsx
│   ├── Login.jsx
│   ├── MaterialMovements.jsx
│   ├── MaterialMovementsReport.jsx
│   ├── POS.jsx
│   ├── ProviderMaster.jsx
│   ├── PurchaseEntry.jsx
│   ├── PurchasesReport.jsx
│   ├── ReportsHome.jsx         # Hub de reportes con cards (patrón replicable)
│   ├── SalesReport.jsx
│   └── SecurityUsers.jsx
└── assets/
    └── la_carreta_sin_fondo.png
```

**Ausente (necesario para UI Finanzas):**
- `src/api/financialService.js`
- `src/pages/FinancesHome.jsx`
- `src/pages/Finances*.jsx` (reportes y formularios)

---

## 3. Rutas, navegación y layout actual

### Sistema de routing

No hay React Router. El routing es un `useReducer` en `App.jsx`:

```javascript
// Página activa = string key en estado + localStorage
const [uiState, dispatch] = useReducer(uiReducer, undefined, getInitialUiState)
// Navegación
dispatch({ type: 'set-page', page: 'finances' })
```

Cada página es un `case` en el switch de `PageContent`. Para añadir Finanzas:
1. Agregar el key a `PRIMARY_NAV_PAGES` (controla qué aparece en la nav)
2. Agregar la etiqueta a `PAGE_LABELS`
3. Agregar el `case` en `PageContent`
4. Registrar lazy import

### Páginas existentes y sus keys

| Key en `App.jsx` | Componente | En nav principal |
|-------------------|------------|-----------------|
| `home` | `Home` | Sí |
| `master` | `Inventory` | Sí |
| `providers` | `ProviderMaster` | Sí |
| `purchases` | `PurchaseEntry` | Sí |
| `movements` | `MaterialMovements` | Sí |
| `cash-control` | `CashControl` | Sí |
| `reports` | `ReportsHome` | Sí |
| `report-inventory` | `InventoryReport` | No (sub-ruta de reports) |
| `report-purchases` | `PurchasesReport` | No |
| `report-sales` | `SalesReport` | No |
| `report-movements` | `MaterialMovementsReport` | No |
| `pos` | `POS` | Sí |
| `security` | `SecurityUsers` | Sí |

### Layout

- `AppShell` — header fijo desktop, drawer móvil deslizante
- Header desktop: `La Carreta` + user name + `<nav>` con pills de botones
- Drawer móvil: overlay + aside `position: fixed`, `translateX`-animated
- `<main>` fullwidth, páginas se renderizan con `<Suspense>`
- Sin sidebar lateral; la navegación es horizontal en desktop
- `STORAGE_KEY` persiste la última página en `localStorage`
- Idle timeout: 10 minutos → `signOut` automático

### Patrón hub → sub-páginas

`ReportsHome` redirige internamente con `onNavigate(card.id)`. Este mismo patrón aplica para un hub de Finanzas: `FinancesHome` navega a sub-páginas de reporte y operación.

---

## 4. Autenticación y sesión

### Flujo completo

1. Login (`authService.signIn`) → `supabase.auth.signInWithPassword`
2. `onAuthStateChange` dispara `loadAccess(session)` en cada cambio
3. `loadAccess`: carga `app_profiles` (profile + `is_superadmin`) y permisos concurrentemente
4. Permisos: `app_user_roles` → `app_role_permissions` → `app_permissions` (3 queries)
5. Token `session.access_token` se usa manualmente en headers de Edge Functions

### Obtención del token para Edge Functions

```javascript
// Patrón existente en erpService.js y cashControlService.js
const { data: { session } } = await supabase.auth.getSession()
await supabase.functions.invoke('financial-operations', {
  body: { action, ...payload },
  headers: session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined,
})
```

`financialService.js` replicará exactamente este patrón.

### Protección de rutas

No existe un `<PrivateRoute>`. La protección es en `AppShell`:
- `!isAuthenticated` → muestra `<Login />`
- `!isActive` → muestra `<AccessDenied />`
- `canAccessPage(currentPage)` → redirige a primera página permitida
- Nav items filtrados por `canAccessPage`

Finanzas necesita:
- `PAGE_PERMISSION_MAP['finances'] = SCREEN_KEYS.FINANCES`
- Permiso `finances:view` cargado desde DB para que `canAccessPage('finances')` retorne `true`

### Estado de sesión disponible en `useAuth()`

```javascript
const {
  session,           // Supabase Session
  user,              // Supabase User
  profile,           // app_profiles row (id, username, full_name, status, is_superadmin)
  roleIds,           // UUID[] de roles del usuario
  roleNames,         // string[] nombres de roles
  permissionKeys,    // string[] 'screen_key:action_key'
  isAuthenticated,   // boolean
  isSuperadmin,      // boolean
  isManager,         // boolean (manager || administrador operativo)
  isWaiter,          // boolean
  isActive,          // profile.status !== 'inactive'
  can,               // (screenKey, actionKey?) => boolean
  canAccessPage,     // (pageKey) => boolean
  signIn, signOut, refreshAccess,
} = useAuth()
```

---

## 5. Roles y permisos actuales

### Roles en sistema

| Rol | `is_superadmin` | `isManager` | `isWaiter` | Acceso financiero R8 |
|-----|----------------|-------------|------------|---------------------|
| Superadmin | `true` | — | — | Todo (incluso `activate_ledger`, `reverse_journal_entry`, `record_owner_withdrawal`) |
| Manager | `false` | `true` | — | Consultas + `record_transfer`, `record_owner_contribution`, `resolve_cash_discrepancy` |
| Administrador Operativo | `false` | `true` | — | Mismo que Manager |
| Mesero | `false` | `false` | `true` | Ninguno (403 en handler) |
| Sin rol | `false` | `false` | `false` | Ninguno (403 en handler) |

`isManagerRoleName` en `AuthContext.jsx`:
```javascript
const isManagerRoleName = (value = '') =>
  ['manager', 'administrador operativo'].includes(normalizeRoleName(value))
```

### Sistema de permisos

`app_permissions` tabla con filas `(screen_key, action_key)`.  
Formato de clave: `'finances:view'`, `'finances:manage'`.

`can(screenKey, actionKey)`:
- Superadmin → siempre `true`
- Otros → comprueba si `'${screenKey}:${actionKey}'` existe en `permissionKeys`

### Pantallas registradas en `permissionConfig.js`

```javascript
SCREEN_KEYS = {
  HOME, MASTER, PROVIDERS, PURCHASES, MOVEMENTS,
  CASH_CONTROL, REPORTS, REPORT_INVENTORY, REPORT_PURCHASES,
  REPORT_SALES, REPORT_MATERIAL_MOVEMENTS, POS, SECURITY_USERS
}
```

**`SCREEN_KEYS.FINANCES` no existe** — es la primera adición necesaria.

### Visibilidad de nav por rol

Los nav items se generan con:
```javascript
PRIMARY_NAV_PAGES.filter((pageKey) => canAccessPage(pageKey))
```

El módulo Finanzas aparecerá en el menú solo si el usuario tiene el permiso `finances:view`. Meseros y usuarios sin permisos financieros no verán la opción.

---

## 6. Consumo actual de Supabase y Edge Functions

### Patrón Edge Function (canónico en el proyecto)

`erpService.js` es la referencia más completa:

```javascript
const invokeErpOperation = async (action, payload) => {
  const { data: { session } } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('erp-operations', {
    body: { action, ...payload },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  })

  if (error) {
    const response = error.context
    if (response) {
      try {
        const errorBody = await response.json()
        throw new Error(errorBody?.error || error.message)
      } catch { /* try text */ }
    }
    throw new Error(error.message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}
```

`cashControlService.js` añade un manejo más defensivo con `response.clone()` para evitar el consumo doble del body.

`financialService.js` debe replicar el patrón de `cashControlService.js` (más defensivo).

### Queries directas a Supabase (solo tablas no-financieras)

`authService.js` consulta directamente: `app_profiles`, `app_user_roles`, `app_role_permissions`, `app_permissions`. Estas no son tablas financieras — aceptable.

`materialService.js` consulta directamente: `sale_orders`, `inventory`, `purchase_orders`, etc. Estas son tablas operativas — aceptable.

**Principio del proyecto:** las RPCs financieras (`SECURITY DEFINER`, `service_role only`) nunca se llaman directamente desde el navegador. Solo via `financial-operations`.

### Manejo de errores y loading

Patrón actual en páginas de reporte:
```javascript
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)  // no todas las páginas lo tienen

useEffect(() => {
  const load = async () => {
    try {
      const data = await service.method()
      setState(data)
    } catch (error) {
      console.error('...', error)
      // window.alert(error.message) en algunas páginas
    } finally {
      setLoading(false)
    }
  }
  load()
}, [])
```

**No existe un sistema de toasts.** Errores se reportan con `console.error` y ocasionalmente `window.alert`. Las páginas de operaciones (CashControl, PurchaseEntry) usan `window.alert` para errores críticos y texto inline para confirmaciones.

Para Finanzas (operaciones financieras con confirmación y feedback claro), se necesitará un mecanismo de notificación más formal: toast inline, mensaje de estado, o modal de resultado.

---

## 7. Componentes reutilizables disponibles

### `ReportView` (`src/components/ReportView.jsx`)

**Altamente reutilizable.** Props:

| Prop | Tipo | Descripción |
|------|------|-------------|
| `title` | string | Título del reporte |
| `filters` | ReactNode | Zona de filtros (slot libre) |
| `rows` | array | Datos filtrados |
| `columns` | `[{key, label}]` | Definición de columnas |
| `renderRow` | `(row, index) => ReactNode` | Render de cada fila |
| `exportColumns` | array | Columnas para Excel |
| `exportRows` | array | Filas para Excel |
| `exportFileName` | string | Nombre del archivo |
| `summary` | ReactNode | Pie de tabla (totales) |
| `emptyText` | string | Estado vacío |
| `isMobile` | boolean | |

**Incluye:** paginación (10/20 filas), export Excel, conteo de registros, scroll horizontal en tablas.

Aplica directamente para: saldos de cuentas, pólizas, mayor contable, sesiones de caja.

### `designTokens.js`

Tokens de diseño completos — `colors`, `space` (2px–40px), `type` (escalas de tamaño y peso), `radius`, `shadow`. Toda la UI usa inline styles con estos tokens.

### `reportUtils.js`

- `formatCurrency(value)` — MXN con 2 decimales
- `formatDateTime(value)` — es-MX localizado
- `formatNumericFolio(value)` — extrae dígitos
- `downloadReportAsExcel` — async, lazy-load de xlsx
- `clampRowsPerPage`, `getPageSizeOptions`

Aplican directamente para todos los reportes financieros.

### `useResponsive` hook

```javascript
const { isMobile, isTablet } = useResponsive()
```

Usado en todas las páginas. Finanzas debe pasarlo igual.

### `useAuth` hook

Expone `isSuperadmin`, `isManager`, `can(screenKey, actionKey)` — suficiente para mostrar/ocultar secciones y botones de operación financiera dentro del módulo.

### Sin reutilizar (no existen aún)

- Modal de confirmación reutilizable
- Toast / banner de éxito/error
- Componente de estado de carga estandarizado
- Componente de campo de formulario con validación

---

## 8. Estilos y convenciones UI

### Sistema visual

**Inline styles exclusivamente** — sin Tailwind, sin shadcn/ui, sin CSS Modules, sin styled-components. Los estilos son objetos JS estáticos, a veces como constantes fuera del componente o como funciones que reciben `isMobile`.

### Paleta de colores (de `designTokens.js`)

| Token | Hex | Uso |
|-------|-----|-----|
| `gray900` | `#0f172a` | Texto principal, header |
| `gray500` | `#64748b` | Texto secundario |
| `gray300` | `#cbd5e1` | Bordes |
| `gray100` | `#f8fafc` | Fondo de app |
| `white` | `#ffffff` | Cards, tablas |
| `blue700` | `#1d4ed8` | Acciones primarias, filtros |
| `blue600` | `#2563eb` | Hover buttons |
| `green500` | `#16a34a` | Indicadores positivos |
| `red600` | `#dc2626` | Errores, alertas |
| `teal700` | `#0f766e` | Importes de ventas |
| `amber700` | `#b45309` | Eyebrows / tags de reportes |

El acento del módulo Finanzas aún no está definido. Candidatos: `violet700` (`#7c3aed`) o `teal700`. `amber700` está tomado por reportes operativos.

### Patrones de spacing

- Cards: `padding: space[7] space[8]` (`14px 16px`)
- Contenedores de página: `padding: space[8] space[10]` (`16px 20px`) desktop / `space[6]` (`12px`) mobile
- Gaps entre elementos: `space[5]–space[7]`

### Cards

```javascript
// Patrón Home/ReportsHome
{
  backgroundColor: colors.white,
  borderRadius: radius.xl,      // 18px
  padding: `${space[7]} ${space[8]}`,
  boxShadow: shadow.md,
  borderTop: `5px solid ${accentColor}`,
}
```

### Botones de acción primaria

```javascript
{
  borderRadius: radius.md,       // 10px
  backgroundColor: colors.blue700,
  color: colors.white,
  fontWeight: type.black,        // 900
  padding: `${space[4]} ${space[7]}`,
  cursor: 'pointer',
}
```

### Tablas

Thead `#4a5568` con texto blanco; `borderCollapse: collapse`; filas con `borderBottom: 1px solid #e2e8f0`. `minWidth: 760px` con overflow horizontal.

### Formularios

Labels con `display: block`, inputs con `borderRadius: radius.md`, `border: 1px solid colors.gray300`, `boxSizing: border-box`. No existe un componente de input reutilizable — cada página define sus estilos de input.

### Eyebrows / módulo tags

```javascript
{
  color: accentColor,
  fontWeight: type.black,
  fontSize: type.xs,             // 0.72rem
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}
```

---

## 9. Propuesta inicial de ubicación del módulo Finanzas

### Keys de página sugeridas

```
finances           → hub de Finanzas (análogo a 'reports')
finances-balances  → Saldos de cuentas
finances-journal   → Pólizas / journal report
finances-ledger    → Mayor por cuenta
finances-sessions  → Sesiones de caja financieras
finances-transfer  → Formulario: traspaso entre fondos
finances-contrib   → Formulario: aportación del propietario
finances-withdraw  → Formulario: retiro del propietario
finances-disc      → Formulario: resolución de discrepancia
finances-reverse   → Formulario: reversa de póliza
```

Los formularios de operación (transfer, contrib, withdraw, disc, reverse) pueden vivir como modales dentro de `finances` o como sub-páginas de la misma forma que `report-*` vive bajo `reports`.

### Estructura de archivos sugerida

```
src/
├── api/
│   └── financialService.js        # invokeFinancialOperation + métodos por acción
├── pages/
│   ├── FinancesHome.jsx           # Hub: cards con permisos por acción
│   ├── FinancesBalances.jsx       # Saldos — usa ReportView
│   ├── FinancesJournal.jsx        # Pólizas — usa ReportView
│   ├── FinancesLedger.jsx         # Mayor — usa ReportView con selector de cuenta
│   └── FinancesCashSessions.jsx   # Sesiones de caja — usa ReportView
└── lib/
    └── permissionConfig.js        # Agregar SCREEN_KEYS.FINANCES + sub-keys
```

Los formularios de operación (traspaso, aportación, retiro, discrepancia, reversa) se proponen como secciones dentro de `FinancesHome.jsx` con modales inline, no como páginas separadas, para mantener el conteo de rutas manejable.

### Permisos visuales sugeridos

| Screen key | Action | Quién lo tiene |
|------------|--------|----------------|
| `finances` | `view` | Manager + Superadmin |
| `finances_balances` | `view` | Manager + Superadmin |
| `finances_journal` | `view` | Manager + Superadmin |
| `finances_ledger` | `view` | Manager + Superadmin |
| `finances_sessions` | `view` | Manager + Superadmin |
| `finances` | `manage` | Superadmin only |

En código: `can('finances', 'manage')` determina si se muestran los botones de acción de escritura (traspaso, aportación, retiro, etc.). `can('finances', 'view')` controla el acceso básico al módulo.

### `permissionConfig.js` — adiciones requeridas

```javascript
// Agregar a SCREEN_KEYS
FINANCES: 'finances',
FINANCES_BALANCES: 'finances_balances',
FINANCES_JOURNAL: 'finances_journal',
FINANCES_LEDGER: 'finances_ledger',
FINANCES_SESSIONS: 'finances_sessions',

// Agregar a PAGE_PERMISSION_MAP
'finances': SCREEN_KEYS.FINANCES,
'finances-balances': SCREEN_KEYS.FINANCES_BALANCES,
// ...etc

// Agregar a PAGE_ORDER (antes de 'security')
// ...finances, finances-balances, ...

// Agregar a PRIMARY_NAV_PAGES
'finances'
```

### `financialService.js` — estructura sugerida

```javascript
// Mismo patrón que cashControlService.js
const invokeFinancialOperation = async (action, payload = {}) => {
  const { data: { session } } = await supabase.auth.getSession()
  const { data, error } = await supabase.functions.invoke('financial-operations', {
    body: { action, ...payload },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  })
  // manejo de error (patrón cashControlService con clone defensivo)
  if (data?.error) throw new Error(data.error)
  return data
}

export const financialService = {
  // Consultas
  getAccountBalances: (asOf) => invokeFinancialOperation('get_account_balances', { as_of: asOf }),
  getJournalReport: (fromDate, toDate) => invokeFinancialOperation('get_journal_report', { from_date: fromDate, to_date: toDate }),
  getAccountLedger: (code, from, to) => invokeFinancialOperation('get_account_ledger', { account_code: code, from_date: from, to_date: to }),
  getCashSessionsReport: (from, to) => invokeFinancialOperation('get_cash_sessions_report', { from_date: from, to_date: to }),
  getLedgerStatus: () => invokeFinancialOperation('get_ledger_status'),

  // Operaciones — solo invocadas desde componentes con can('finances', 'manage')
  recordTransfer: (payload) => invokeFinancialOperation('record_transfer', payload),
  recordOwnerContribution: (payload) => invokeFinancialOperation('record_owner_contribution', payload),
  recordOwnerWithdrawal: (payload) => invokeFinancialOperation('record_owner_withdrawal', payload),
  resolveDiscrepancy: (payload) => invokeFinancialOperation('resolve_cash_discrepancy', payload),
  reverseJournalEntry: (payload) => invokeFinancialOperation('reverse_journal_entry', payload),
}
```

---

## 10. Riesgos detectados

### R1 — CORS bloqueado (bloqueo actual)

`ALLOWED_ORIGINS` no configurado en DEV. Cualquier llamada desde navegador a `financial-operations` retornará 403 CORS antes de llegar al handler. **La UI no funcionará hasta configurar este secret.**

Acción requerida antes de iniciar UI: determinar la URL de la UI DEV (Vite local `http://localhost:5173` o Vercel preview) y configurar `ALLOWED_ORIGINS` en Supabase secrets DEV.

### R2 — Permisos de Finanzas no existen en DB

Las tablas `app_permissions`, `app_role_permissions` no tienen entradas para `finances*` screen keys. Si se añade el módulo en frontend sin crear los permisos en DB, ningún usuario (salvo superadmin) podrá acceder a la ruta.

Acción: crear filas en `app_permissions` e `app_role_permissions` para roles manager/administrador operativo antes de probar con esos roles.

### R3 — Riesgo de llamar RPCs financieras directamente

El patrón de `materialService.js` y `providerService.js` llama `supabase.from('tabla').select()` directamente. Un desarrollador podría, por error, añadir `supabase.rpc('record_transfer', {...})` al `financialService.js`.

Las RPCs financieras son `SECURITY DEFINER`, `service_role only` — una llamada directa desde `anon` recibirá error de Postgres (`permission denied`), pero el intento quedaría registrado. La mitigación es claridad de convención: `financialService.js` solo llama `supabase.functions.invoke('financial-operations', ...)`.

### R4 — Sin sistema de notificaciones/toasts

Las operaciones financieras (traspaso, aportación, reversa) requieren feedback claro de éxito/error con el número de póliza resultante. El patrón actual (`window.alert` o texto inline) es insuficiente para operaciones financieras con idempotencia. Se necesita al menos un banner de estado inline por formulario.

### R5 — Sin modales de confirmación reutilizables

Las acciones irreversibles (retiro, reversa) requieren confirmación explícita. El proyecto no tiene un componente de modal reutilizable. Se necesitará implementar uno o usar el patrón de estado local `isConfirming` con UI condicional.

### R6 — Idempotency key: generación y retry

El handler R8 valida `idempotency_key` con regex `/^[A-Za-z0-9\-_.]{1,128}$/`. El frontend debe:
1. Generar la clave antes de presentar el formulario (o al enviar)
2. Guardar la clave si hay error de red para poder reintentarla
3. No regenerar la clave en cada click de "Reintentar"

No existe ningún patrón de idempotency key en el frontend actual.

### R7 — `finalize_pos_sale` y el estado de mesa

La UI de POS ya existe. Pero si en el futuro la UI de Finanzas muestra reversas de ventas, debe recordar que `finalize_pos_sale` valida estado de mesa antes de idempotencia. Una reversa no reactiva la mesa — eso es comportamiento esperado, pero necesita documentarse para los usuarios.

### R8 — Página de permisos de DB (app_permissions) fuera de scope de UI

Los permisos `finances:view` y `finances:manage` deben existir en DB y asignarse a roles mediante `app_role_permissions`. Esto requiere SQL (INSERT) en DEV. No afecta código frontend pero bloquea pruebas con usuarios no-superadmin.

### R9 — Límite de paginación hardcodeado en `reportUtils.js`

`PAGE_SIZE_OPTIONS = [10, 20]` — para reportes financieros con muchos movimientos podría ser insuficiente. No es un bloqueo para MVP pero es un punto de fricción.

---

## 11. Preguntas abiertas antes de implementar

1. **URL DEV de la UI**: ¿La UI se sirve en `http://localhost:5173` local, en Vercel preview o en una URL DEV fija? Define qué valor configurar en `ALLOWED_ORIGINS`.

2. **Acento de color para Finanzas**: ¿`violet700` (`#7c3aed`) o `teal700` (`#0f766e`)? `amber700` ya es Reportes; `teal700` se usa en ventas. Se recomienda `violet700` para diferenciación visual.

3. **Operaciones financieras: ¿modal o sub-página?** Para traspaso, aportación, retiro, discrepancia y reversa: ¿modal dentro de `FinancesHome` o sub-páginas separadas? Modal reduce complejidad de routing; sub-páginas facilitan deep linking y son más consistentes con el patrón `report-*`.

4. **¿Quién genera la `idempotency_key`?** ¿Frontend (`crypto.randomUUID()` al cargar el formulario) o backend? Se recomienda frontend — genera al montar el formulario, preserva en estado para retries.

5. **¿`activate_ledger` necesita UI?** El ledger ya está activo en DEV. El MVP podría omitir esta pantalla y reservarla para administración futura.

6. **Permisos en DB**: ¿Los INSERT de `app_permissions` y `app_role_permissions` se hacen con una migración SQL o manualmente en DEV? Si se hace con migración, hay que coordinar con el estado de migraciones (M29 es la última).

7. **`record_owner_withdrawal` requiere `authorized_by`**: ¿Es el mismo usuario que ejecuta, u otro usuario del sistema? ¿La UI debe tener un campo para seleccionar quién autoriza?

8. **Toast/notificaciones**: ¿Se implementa un componente de notificación propio o se usa `window.alert` temporalmente? Dado que el proyecto no tiene dependencias de UI, se recomienda un componente simple de estado inline por formulario para MVP.

---

## 12. Recomendación de siguiente paso

**Secuencia sugerida antes de escribir código:**

1. **Definir `ALLOWED_ORIGINS` en DEV** con la URL de la UI local o Vercel preview. Sin esto, ninguna prueba manual funcionará.

2. **Crear permisos en DB DEV**: INSERT en `app_permissions` para `finances:view` y `finances:manage`; INSERT en `app_role_permissions` para manager y administrador operativo con `finances:view`, y para superadmin con ambos. Sin esto, pruebas con usuario no-superadmin están bloqueadas.

3. **Implementar en este orden:**
   - `financialService.js` (sin UI — testeable con console)
   - `SCREEN_KEYS.FINANCES` en `permissionConfig.js`
   - `FinancesHome.jsx` (hub con cards, permisos visuales)
   - `FinancesBalances.jsx` — primera pantalla de solo lectura con `ReportView`
   - `FinancesJournal.jsx`, `FinancesLedger.jsx`, `FinancesCashSessions.jsx`
   - Formularios de operación (traspaso primero, luego los demás)

4. **Commit y PR por módulo**, no un PR monolítico.

5. **Smoke test end-to-end en DEV** con usuario manager y usuario superadmin antes de considerar PRD.

---

*Documento generado: 2026-08-16. Solo inspección. Sin modificaciones de código, base de datos, secretos ni otros entornos.*
