# FASE3 R9 — Validación integrada UI Finanzas (read-only) DEV

**Fecha:** 2026-08-16  
**Rama:** `chore/code-cleanup` (no se tocan cambios ajenos)  
**Supabase:** DEV (`rtkdrnfqihulqdhixxzf`)

---

## 1. Alcance validado

Módulo de Finanzas completo en su fase read-only (Fase 2 terminada):

| Pantalla | Archivo | EF action |
|---|---|---|
| Hub Finanzas | `src/pages/FinancesHome.jsx` | — |
| Saldos de cuentas | `src/pages/FinancesBalances.jsx` | `get_account_balances` |
| Pólizas / Asientos | `src/pages/FinancesJournal.jsx` | `get_journal_report` |
| Mayor contable | `src/pages/FinancesLedger.jsx` | `get_account_ledger` |
| Sesiones de caja | `src/pages/FinancesCashSessions.jsx` | `get_cash_sessions_report` |

Servicio HTTP: `src/api/financialService.js`  
Permisos frontend: `src/lib/permissionConfig.js`  
Routing: `src/App.jsx`

---

## 2. Validación automática

### 2.1 Lint (ESLint)

```
npx eslint src/api/financialService.js \
  src/pages/FinancesHome.jsx \
  src/pages/FinancesBalances.jsx \
  src/pages/FinancesJournal.jsx \
  src/pages/FinancesLedger.jsx \
  src/pages/FinancesCashSessions.jsx \
  src/App.jsx \
  src/lib/permissionConfig.js
```

**Resultado: 0 errores, 0 advertencias** ✅

### 2.2 Build de producción

```
npm run build
```

Chunks financieros emitidos:

| Chunk | Tamaño | gzip |
|---|---|---|
| `financialService-DYR38H6i.js` | 2.07 kB | 0.83 kB |
| `FinancesHome-DN7c_JAF.js` | 4.16 kB | 1.61 kB |
| `FinancesBalances-C3ZT0eDV.js` | 4.11 kB | 1.62 kB |
| `FinancesJournal-NzgpNKwj.js` | 5.58 kB | 2.13 kB |
| `FinancesCashSessions-BaQGOnri.js` | 5.69 kB | 2.05 kB |
| `FinancesLedger-DmKHtwQU.js` | 5.86 kB | 2.18 kB |

**Resultado: ✓ built in ~5s, sin errores** ✅

### 2.3 Tests unitarios

```
npm run test:finance
```

Cubre: `financialRules.test.js`, `handler.test.js`, `cashRules.test.js`

**Resultado: 88/88 pass, 0 fail** ✅

Tests relevantes para finanzas (handler.test.js):
- CORS: G04 — 9 pruebas: origen autorizado echo exacto, no autorizado → 403, sin wildcard `*`, S2S sin headers
- Auth: JWT ausente/inválido → 401
- G01/G02/G03/G05: mesero bloqueado en todas las acciones financieras → 403, RPC=0
- G05: manager y superadmin con acceso read (`get_account_balances`, `get_journal_report`, `get_account_ledger`, `get_cash_sessions_report`)
- G07/G08: validación de inputs — UUID, idempotency key, fund code, resolution type

---

## 3. Validación de seguridad (greps)

### 3.1 Sin acceso directo a DB desde páginas financieras

Grep `supabase.from\(` y `\.rpc\(` en `src/pages/Finances*.jsx`:

```
→ 0 coincidencias ✅
```

Ninguna página finaciera toca la DB directamente.

### 3.2 Único punto de entrada — `functions.invoke`

Grep `functions.invoke` en `src/`:

```
src/api/cashControlService.js  → 'cash-operations'
src/api/erpService.js          → 'erp-operations'
src/api/financialService.js    → 'financial-operations'
src/api/posService.js          → 'pos-operations'
src/api/securityService.js     → 'user-admin'
```

Solo `financialService.js` invoca `financial-operations`. Las páginas solo importan `financialService`. ✅

### 3.3 `financialService` importado exclusivamente en páginas correctas

```
src/pages/FinancesBalances.jsx   → financialService.getAccountBalances
src/pages/FinancesJournal.jsx    → financialService.getJournalReport
src/pages/FinancesLedger.jsx     → financialService.getAccountLedger
src/pages/FinancesCashSessions.jsx → financialService.getCashSessionsReport
```

✅ Sin importaciones en páginas no financieras.

---

## 4. Validación de permisos frontend

### 4.1 `permissionConfig.js` — mapeos

```javascript
SCREEN_KEYS.FINANCES = 'finances'

PAGE_PERMISSION_MAP:
  finances            → 'finances'
  finances-balances   → 'finances'
  finances-journal    → 'finances'
  finances-ledger     → 'finances'
  finances-sessions   → 'finances'

PAGE_ORDER: [..., 'finances', 'finances-balances', 'finances-journal',
             'finances-ledger', 'finances-sessions', 'security']
```

✅ Todas las rutas del módulo mapean a `SCREEN_KEYS.FINANCES`.

### 4.2 `AuthContext.jsx` — lógica `can()`

```javascript
// Superadmin bypassa TODO
if (authState.profile?.is_superadmin) return true

// Rol normal: busca 'finances:view' en permissionKeys
return authState.permissionKeys.includes(`${screenKey}:${actionKey}`)
```

`canAccessPage('finances')` → `can('finances', 'view')` → busca `finances:view` en permisos del usuario.

### 4.3 `FinancesHome.jsx` — visibilidad sección Operaciones

```javascript
{isSuperadmin && (
  // Sección "Operaciones financieras" — solo superadmin la ve
  // Cards deshabilitadas / "Próximamente"
)}
```

✅ Operaciones ocultas para manager y administrador operativo hasta Fase 3.

### 4.4 Permisos en DEV DB (configurados en sesión anterior)

| Rol | finances:view | finances:manage |
|---|---|---|
| manager | ✅ | ✗ |
| administrador operativo | ✅ | ✗ |
| mesero | ✗ | ✗ |
| superadmin (`is_superadmin=true`) | ✅ (bypass) | ✅ (bypass) |

`app_user_roles` puede estar vacío en DEV — usuarios actuales de prueba son superadmin.  
**Pendiente:** Asignar un usuario de prueba con rol `manager` para validar visibilidad condicional del nav.

---

## 5. Validación de routing (`App.jsx`)

```javascript
// Lazy imports financieros
const FinancesHome         = lazy(() => import('./pages/FinancesHome'))
const FinancesBalances     = lazy(() => import('./pages/FinancesBalances'))
const FinancesJournal      = lazy(() => import('./pages/FinancesJournal'))
const FinancesLedger       = lazy(() => import('./pages/FinancesLedger'))
const FinancesCashSessions = lazy(() => import('./pages/FinancesCashSessions'))

// PAGE_LABELS
finances: 'Finanzas'

// PRIMARY_NAV_PAGES
[..., 'finances', 'security']

// PageContent switch
case 'finances':          → <FinancesHome onNavigate={onNavigate} />
case 'finances-balances': → <FinancesBalances />
case 'finances-journal':  → <FinancesJournal />
case 'finances-ledger':   → <FinancesLedger />
case 'finances-sessions': → <FinancesCashSessions />
```

✅ Sin placeholders. Los 5 casos están cableados.

---

## 6. CORS DEV

Configurado en sesión anterior (FASE3_R9_CORS_ALLOWED_ORIGINS_DEV.md):

```
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

Handler retorna `Access-Control-Allow-Origin` con el origen exacto (no wildcard).  
6/6 smoke tests pasaron. Test suite unitaria G04 (9 pruebas) pasa. ✅

---

## 7. Validación manual pendiente (no ejecutable automáticamente)

Requiere servidor de desarrollo corriendo + usuario autenticado en DEV:

| Caso | Descripción | Estado |
|---|---|---|
| M-01 | Nav muestra "Finanzas" para superadmin | Pendiente manual |
| M-02 | Hub `/finances` carga sin error | Pendiente manual |
| M-03 | Sección Operaciones visible solo para superadmin | Pendiente manual |
| M-04 | `/finances-balances` carga saldos desde EF | Pendiente manual |
| M-05 | `/finances-journal` carga pólizas con fechas del mes actual | Pendiente manual |
| M-06 | `/finances-ledger` carga mayor de 1101 del mes actual | Pendiente manual |
| M-07 | `/finances-sessions` carga sesiones del mes actual | Pendiente manual |
| M-08 | Filtro de fechas inválido muestra error amber inline | Pendiente manual |
| M-09 | Botón "Exportar Excel" genera archivo | Pendiente manual |
| M-10 | Usuario sin `finances:view` no ve "Finanzas" en nav | Pendiente — `app_user_roles` vacío en DEV |

---

## 8. Estado de implementación

| Fase | Descripción | Estado |
|---|---|---|
| Fase 1 | Servicio, permisos, routing, hub | ✅ Completo |
| Fase 2A | Saldos de cuentas | ✅ Completo |
| Fase 2B | Pólizas / Asientos | ✅ Completo |
| Fase 2C | Mayor contable | ✅ Completo |
| Fase 2D | Sesiones de caja | ✅ Completo |
| Fase 3 | Operaciones de escritura (Traspaso, Aportación, Retiro, Discrepancia, Reversa) | Pendiente autorización |

---

## 9. Veredicto

**La UI financiera read-only está lista para validación manual en DEV.**

Todas las validaciones automáticas pasan: lint 0 errores, build limpio, 88/88 tests unitarios, 0 llamadas directas a DB desde frontend, 100% del tráfico pasa por `financial-operations` Edge Function.
