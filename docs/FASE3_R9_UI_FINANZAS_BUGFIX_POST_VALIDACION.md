# FASE3 R9 — Bugfix post-validación manual UI Finanzas (DEV)

**Fecha:** 2026-08-16  
**Rama:** `chore/code-cleanup`

---

## Bugs reportados en validación manual

| # | Pantalla | Descripción | Tipo |
|---|---|---|---|
| B1 | Home | Sin card de Finanzas | Faltante |
| B2 | Saldos | Input fecha de corte se vacía tras Consultar | Bug estado |
| B3 | Pólizas / Mayor | Error amber no observado con fechas inválidas | UX / No bug |
| B4 | Pólizas | Export Excel falla — `Sheet name cannot contain : \ / ? * [ ]` | Bug crítico |

---

## B1 — Home sin card de Finanzas

**Root cause:** `sections` array en `src/pages/Home.jsx` no incluía `'finances'`.

**Fix:** Agregado entre `pos` y `security`:
```javascript
{
  id: 'finances',
  label: 'Finanzas',
  description: 'Consulta saldos de cuentas, polizas contables, mayor y sesiones de caja.',
  accent: '#7c3aed',  // violet700
},
```

`Home` ya filtra por `canAccessPage(section.id)`, por lo que la card solo aparece cuando el usuario tiene `finances:view`. ✅

**Archivo:** `src/pages/Home.jsx`

---

## B2 — Saldos: input fecha de corte se vacía tras Consultar

**Root cause:** `FinancesBalances` hacía early return `<div>Cargando...</div>` cuando `loading = true`. En este estado, el componente devuelve un árbol distinto → `ReportView` (que contiene el input `value={asOfInput}`) se desmonta. A diferencia de las otras 3 pantallas (Journal, Ledger, Sessions) que tienen `useEffect` que REPOPULA las fechas al montar, `FinancesBalances` inicializa `asOfInput = ''` sin efecto de repoblado. Al remontar `ReportView`, el input vuelve a `''` aunque el estado React técnicamente persiste — el problema es que al reinicializar el componente la fecha se pierde en la transición.

**Fix:** Eliminado el early return para loading. Ahora el `ReportView` permanece siempre montado. El estado de loading se expresa a través de:
- `rows={loading ? [] : balances}` — tabla vacía durante carga
- `emptyText={loading ? 'Cargando saldos de cuentas...' : 'Sin cuentas activas con movimientos.'}` — mensaje contextual
- `summary={loading ? null : <span>...</span>}` — summary oculto durante carga

El early return de error sí se mantiene (no afecta el input porque ocurre ante fallo total).

**Archivo:** `src/pages/FinancesBalances.jsx`

---

## B3 — Error amber inline no observado en Pólizas / Mayor

**Análisis:** Código verificado correcto. `colors.amber50 = '#fff7ed'`, `colors.amber700 = '#b45309'` — ambos existen en `designTokens.js`. La lógica de validación funciona:

- Journal: requiere ambas fechas; `from > to` → error
- Ledger: solo valida si ambas presentes y `from > to` → error
- En ambos casos, `setDateError(msg)` se llama, `loading` no cambia, el componente renderiza el banner en el filter card sticky

**Causa probable:** El filter card es `position: sticky, top: 0`. Al estar scrolleado para ver la tabla y activar la validación, el banner aparece en el área sticky en la PARTE SUPERIOR del viewport — área que el usuario miraba menos.

**Acción:** Sin cambios de código. El comportamiento es correcto. Documentado como limitación UX de scroll.

---

## B4 — Export Excel Pólizas: Sheet name con caracteres inválidos

**Root cause:** `ReportView.handleExport` pasa `sheetName: title` a `downloadReportAsExcel`. Para Pólizas, `title = "Pólizas / Asientos contables"` → `/` viola restricción de Excel para nombres de hoja (`[`, `]`, `:`, `\`, `/`, `?`, `*` están prohibidos).

El código anterior solo hacía `.slice(0, 31)` sin sanitizar.

**Fix en `src/lib/reportUtils.js`:**
```javascript
// Antes:
XLSX.utils.book_append_sheet(workbook, worksheet, String(sheetName || 'Reporte').slice(0, 31))

// Después:
const sanitized = String(sheetName || 'Reporte')
  .replace(/[:\\/?*[\]]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const safeSheetName = (sanitized || 'Reporte').slice(0, 31)
XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName)
```

Resultado para cada reporte:

| Título | Sheet name resultante |
|---|---|
| `Saldos de cuentas` | `Saldos de cuentas` |
| `Pólizas / Asientos contables` | `Pólizas   Asientos contables` |
| `Mayor contable` | `Mayor contable` |
| `Sesiones de caja` | `Sesiones de caja` |

La fix es centralizada — protege todos los reportes presentes y futuros.

**Archivo:** `src/lib/reportUtils.js`

---

## Validación post-fix

### Lint
```
npx eslint src/lib/reportUtils.js src/pages/FinancesBalances.jsx src/pages/Home.jsx
→ 0 errores, 0 advertencias ✅
```

### Tests
```
npm run test:finance
→ 88/88 pass, 0 fail ✅
```

### Build
| Chunk | Tamaño | Estado |
|---|---|---|
| `reportUtils-BTJ1I5Y3.js` | 1.11 kB | ✅ regenerado |
| `FinancesBalances-bql9ji2i.js` | 4.05 kB | ✅ regenerado |
| `Home-BKZhH24X.js` | 4.79 kB | ✅ regenerado |

Build completo en 4.59s, sin errores. ✅

---

## Checklist de revalidación manual pendiente

| Caso | Check |
|---|---|
| Home muestra card "Finanzas" para superadmin | ⬜ Pendiente |
| Click en card "Finanzas" → navega a hub | ⬜ Pendiente |
| Saldos: ingresar fecha → Consultar → input mantiene la fecha | ⬜ Pendiente |
| Saldos: "Limpiar fecha" habilitado después de consultar con fecha | ⬜ Pendiente |
| Pólizas: Export descarga `polizas-contables.xlsx` sin error | ⬜ Pendiente |
| Mayor: Export descarga `mayor-1101.xlsx` sin error | ⬜ Pendiente |
| Pólizas: fecha inválida → banner amber en área sticky superior | ⬜ Pendiente |
