# Hotfix Reportes Finanzas — Post-Ledger PRD 2026-09-01

## Resumen

Dos commits de hotfix aplicados a `chore/code-cleanup` tras la activación del ledger PRD el 2026-09-01.

---

## Commit 1 — `c6d6366` — fix(finanzas): adjust post-ledger reports

### Alcance

Tres páginas corregidas tras activación del ledger:

| Página | Problema | Fix |
|---|---|---|
| `FinancesBalances.jsx` | Ecuación contable sin renderizar correctamente | Ajuste de lógica visual de ecuación |
| `FinancesLedger.jsx` | Selector mostraba < 11 cuentas | Ampliado al catálogo completo de 11 cuentas |
| `FinancesCashSessions.jsx` | Sesión nocturna 2026-09-01 no visible (timezone) | Convierte rango local a UTC expandido + re-filtra por fecha local |

### Deploy

| Campo | Valor |
|---|---|
| Deployment ID | `dpl_EcR7pxrsg9yX5VVLL6P1FA6tUVkC` |
| URL | `https://lacarreta.mobi` |
| Fecha | 2026-09-01 (post-activación) |

### Validaciones PRD (post c6d6366)

| Check | Resultado |
|---|---|
| V0 Bundle | ✅ nuevo bundle detectado |
| V1 Saldos — ecuación contable | ✅ `$1,500` y `$24,000` visibles |
| V2 Mayor — selector 11 cuentas + `JE-VTA-02092026014501` | ✅ |
| V3 Sesiones — fecha `01/09/2026` visible | ✅ |
| CONSOLA — 0 errores app | ✅ |

---

## Commit 2 — `46aec2b` — fix(finanzas): show counted cash fallback in sessions

### Diagnóstico

Columna `Contado` mostraba `—` para la sesión nocturna 2026-09-01 en PRD.

**Query read-only PRD confirmó:**

```json
{
  "first_counted_cash":  "11.00",
  "final_counted_cash":  null,
  "closing_amount":      "11.00",
  "difference_amount":   "0.00"
}
```

**Causa raíz:** La sesión cerró via flujo simple (un solo conteo). El sistema popula `first_counted_cash` + `difference_amount` pero no `final_counted_cash`. El campo `final_counted_cash` solo se escribe cuando hay paso explícito de aprobación del manager.

El frontend leía únicamente `final_counted_cash`, que era `null` → mostraba `—`.

### Fix

Archivo: `src/pages/FinancesCashSessions.jsx`

Cambio: `final_counted_cash ?? first_counted_cash` como valor del campo Contado.

**Renderizado (tabla):**
```jsx
// antes
{row.final_counted_cash != null ? formatCurrency(row.final_counted_cash) : '—'}

// después
{(row.final_counted_cash ?? row.first_counted_cash) != null
  ? formatCurrency(row.final_counted_cash ?? row.first_counted_cash)
  : '—'}
```

**Exportación CSV:**
```js
// antes
contado: s.final_counted_cash != null ? formatCurrency(s.final_counted_cash) : '',

// después
contado: (s.final_counted_cash ?? s.first_counted_cash) != null ? formatCurrency(s.final_counted_cash ?? s.first_counted_cash) : '',
```

### Semántica

`final_counted_cash` = conteo final aprobado por manager (flujo doble conteo).
`first_counted_cash` = primer conteo por cajero.

Cuando solo existe flujo simple (un conteo), `first_counted_cash` es el valor correcto para Contado.
La función SQL `get_cash_sessions_report` ya retorna ambos campos — no requirió cambio en backend ni migración.

### Validaciones locales

| Check | Resultado |
|---|---|
| ESLint `FinancesCashSessions.jsx` | ✅ 0 warnings |
| Build Vite | ✅ `FinancesCashSessions-XnCjPgAh.js` |
| test:finance | ✅ 88/88 |
| git diff --check | ✅ sin whitespace errors |

### Deploy

| Campo | Valor |
|---|---|
| Deployment ID | `dpl_4BVMWMrhGA2jEuiCmJkySuA99G3T` |
| Bundle | `FinancesCashSessions-XnCjPgAh.js` (nuevo vs `c6d6366`) |
| URL | `https://lacarreta.mobi` |
| Fecha | 2026-09-01 |

### Validación PRD — APROBADA

Validación visual directa en `lacarreta.mobi → Finanzas → Sesiones` post-deploy.

| Campo | Valor |
|---|---|
| Bundle principal | `index-Bt2WLM1X.js` |
| Chunk sesiones | `FinancesCashSessions-XnCjPgAh.js` |
| Sesión nocturna visible | `19:43–19:46` |
| Fondo inicial | `$1.00` |
| Esperado | `$11.00` |
| **Contado** | **`$11.00`** ✅ (antes mostraba `—`) |
| Diferencia | `$0.00` |
| Consola | 0 errores |
| Operaciones nuevas | ninguna |
| Estado | **APROBADO** |

---

## Estado final

| Reporte | Estado |
|---|---|
| Saldos — ecuación contable | ✅ |
| Mayor — selector 11 cuentas | ✅ |
| Sesiones — fecha 01/09/2026 visible | ✅ |
| Sesiones — columna `Contado` = `$11.00` | ✅ verificado en PRD |

---

## Referencias

- `docs/ACTIVACION_LEDGER_PRD_20260901.md`
- `docs/VALIDACION_POST_ACTIVACION_LEDGER_PRD_20260901.md`
- `scripts/validate-finanzas-reports.mjs`
- `src/pages/FinancesCashSessions.jsx`
- `supabase/migrations/20260811170000_reportes_ledger.sql` — `get_cash_sessions_report` RPC
