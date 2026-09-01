# FASE3 — R9: UI Finanzas Fase 1 — Implementación

**Fecha:** 2026-08-16  
**Entorno:** local (sin commits ni deploys)  
**Alcance:** servicio financiero, permisos frontend, routing, hub page  
**Restricciones aplicadas:** sin PRD, sin Supabase, sin commits, sin push.

---

## 1. Archivos creados / modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/api/financialService.js` | Creado | Servicio seguro para `financial-operations` |
| `src/lib/permissionConfig.js` | Modificado | `SCREEN_KEYS.FINANCES` + 5 entradas en mapa + PAGE_ORDER |
| `src/App.jsx` | Modificado | Lazy import, label, nav, 5 casos routing |
| `src/pages/FinancesHome.jsx` | Creado | Hub con 4 cards de reporte + 5 de operación |

---

## 2. `financialService.js`

Patrón idéntico a `cashControlService.js`:

- `invokeFinancialOperation(action, payload)` — privado
- `supabase.auth.getSession()` para obtener token
- `supabase.functions.invoke('financial-operations', ...)` — única forma permitida
- Defensive clone en error body para extraer mensaje del handler
- No llama `supabase.rpc()` ni `supabase.from()` en ningún punto

**Operaciones exportadas:**

| Método | Acción R8 | Autorización |
|--------|----------|-------------|
| `getLedgerStatus()` | `get_ledger_status` | Manager |
| `getAccountBalances(asOf?)` | `get_account_balances` | Manager |
| `getJournalReport(from, to)` | `get_journal_report` | Manager |
| `getAccountLedger(code, from?, to?)` | `get_account_ledger` | Manager |
| `getCashSessionsReport(from?, to?)` | `get_cash_sessions_report` | Manager |
| `recordTransfer({...})` | `record_transfer` | Manager |
| `recordOwnerContribution({...})` | `record_owner_contribution` | Manager |
| `resolveDiscrepancy({...})` | `resolve_cash_discrepancy` | Manager |
| `recordOwnerWithdrawal({...})` | `record_owner_withdrawal` | Superadmin |
| `reverseJournalEntry({...})` | `reverse_journal_entry` | Superadmin |

`activate_ledger` no expuesto — ledger ya activo en DEV.

---

## 3. `permissionConfig.js`

```diff
+ FINANCES: 'finances',          // → SCREEN_KEYS

// PAGE_PERMISSION_MAP:
+ finances: SCREEN_KEYS.FINANCES,
+ 'finances-balances': SCREEN_KEYS.FINANCES,
+ 'finances-journal': SCREEN_KEYS.FINANCES,
+ 'finances-ledger': SCREEN_KEYS.FINANCES,
+ 'finances-sessions': SCREEN_KEYS.FINANCES,

// PAGE_ORDER (antes de 'security'):
+ 'finances',
+ 'finances-balances',
+ 'finances-journal',
+ 'finances-ledger',
+ 'finances-sessions',
```

Todas las sub-páginas comparten `SCREEN_KEYS.FINANCES` → misma permission check: `can('finances', 'view')`.

---

## 4. `App.jsx`

```diff
+ const FinancesHome = lazy(() => import('./pages/FinancesHome'))

// PAGE_LABELS:
+ finances: 'Finanzas',

// PRIMARY_NAV_PAGES:
- [..., 'pos', 'security']
+ [..., 'pos', 'finances', 'security']

// PageContent:
+ case 'finances':
+   return <FinancesHome onNavigate={onNavigate} />
+ case 'finances-balances':
+ case 'finances-journal':
+ case 'finances-ledger':
+ case 'finances-sessions':
+   return <div style={pageLoadingStyle}>En construcción</div>
```

---

## 5. `FinancesHome.jsx`

Hub page con patrón idéntico a `ReportsHome.jsx`. Acento: `violet700 (#7c3aed)`.

**Sección Reportes** — visible si `canAccessPage(card.id)` (requiere `finances:view`):
- Saldos de cuentas → `finances-balances`
- Pólizas / Asientos → `finances-journal`
- Mayor contable → `finances-ledger`
- Sesiones de caja → `finances-sessions`

**Sección Operaciones** — visible solo si `isSuperadmin`:
- 5 cards deshabilitadas con badge "Próximamente"
- Sin `onClick` — operaciones se implementan en Fase 3

Hero gradient: `#f5f3ff → #ffffff → #dbeafe` (violet50 + blanco + blue100).

---

## 6. Validación

### Lint

```
npx eslint src/api/financialService.js src/lib/permissionConfig.js src/App.jsx src/pages/FinancesHome.jsx
```

**Resultado:** sin output → 0 errores, 0 warnings.

### Build

```
npm run build
```

**Resultado:** ✓ 348 modules transformed — built in 6.08s  
`FinancesHome-DRyXV3yW.js` presente en bundle (4.16 kB).

### Tests

```
npm run test:finance
```

**Resultado:** 88/88 PASS — sin regresiones.

---

## 7. Comportamiento esperado por rol

| Rol | Nav muestra "Finanzas" | FinancesHome | Cards reporte | Cards operación |
|-----|----------------------|-------------|--------------|----------------|
| Superadmin | ✅ | ✅ | ✅ 4 cards activas | ✅ 5 cards (disabled) |
| Manager | ✅ | ✅ | ✅ 4 cards activas | ❌ no visible |
| Administrador Operativo | ✅ | ✅ | ✅ 4 cards activas | ❌ no visible |
| Mesero | ❌ | ❌ | N/A | N/A |

**Nota:** con `app_user_roles` actualmente vacío en DEV, solo superadmin puede probar. Para probar con manager/admin.op., crear usuario en SecurityUsers y asignar rol.

---

## 8. Pendiente — Fase 2

- `src/pages/FinancesBalances.jsx` — saldos con `ReportView`
- `src/pages/FinancesJournal.jsx` — pólizas con filtro de fechas
- `src/pages/FinancesLedger.jsx` — mayor con selector de cuenta
- `src/pages/FinancesCashSessions.jsx` — sesiones históricas

---

*Documento generado: 2026-08-16. Sin commits. Sin deploys. Sin SQL. Sin PRD tocado.*
