# FASE3 R9 — UI Finanzas Fase 3D: Resolución de diferencia (DEV)

**Fecha:** 2026-08-17  
**Rama:** `chore/code-cleanup`

---

## Archivos creados / modificados

| Archivo | Acción |
|---|---|
| `src/components/FinancesDiscrepancyPanel.jsx` | Nuevo — formulario de resolución de diferencia |
| `src/pages/FinancesHome.jsx` | Modificado — activa card Resolución, agrega elif branch, actualiza alert |

---

## `FinancesDiscrepancyPanel.jsx`

### Campos

| Campo | Tipo | Reglas |
|---|---|---|
| ID de sesión de caja | text input | Requerido; formato UUID `/^[0-9a-f]{8}-...-[0-9a-f]{12}$/i` |
| Tipo de resolución | select | Requerido; `sobrante` \| `faltante` |
| Importe | number | Requerido; > 0; máx 2 decimales |
| Motivo | textarea | Requerido |

### Validación

```javascript
const validateDiscrepancy = ({ cashSessionId, resolutionType, amount, motive }) => {
  // cashSessionId: not empty + UUID regex
  // resolutionType: required
  // amount: isFinite, > 0, max 2 decimals
  // motive: not empty
}
```

Errores inline por campo. Sin `window.alert`. Sin `window.confirm`.

### Llamada al servicio

```javascript
await financialService.resolveDiscrepancy({
  cashSessionId: form.cashSessionId.trim(),
  resolutionType: form.resolutionType,
  amount: parseFloat(form.amount),
  motive: form.motive.trim(),
  idempotencyKey: idempotencyKeyRef.current,
})
```

`financialService.resolveDiscrepancy` envía `cash_session_id`, `resolution_type`, `amount`, `motive`, `idempotency_key` vía `financial-operations` (`resolve_cash_discrepancy`).

### Confirm lines (ejemplo)

```
Sesión: 4a8f09cc-... (UUID completo)
Tipo: Sobrante
Importe: $25.00
Motivo: Diferencia detectada en cierre nocturno
```

### Flujo de estados

Mismo que Transfer y Contribution:
- Formulario → Continuar → FinanceConfirm → Confirmar resolución → Resultado
- Éxito: "Nueva operación" / "Ver pólizas"
- Error: dismiss → formulario visible de nuevo

---

## `FinancesHome.jsx` (cambios)

- Agrega import `FinancesDiscrepancyPanel`
- elif `activeOperation === 'discrepancy'` → muestra panel
- Card 'discrepancy' se activa (botón con onClick)
- Condición activa: `transfer || contribution || discrepancy`
- Alert: `"Traspaso, Aportación y Resolución disponibles"` / `"Retiro del propietario y Reversa de póliza próximamente."`

---

## Validación automática

```
npx eslint src/components/FinancesDiscrepancyPanel.jsx src/pages/FinancesHome.jsx
→ 0 errores ✅

npm run test:finance
→ 88/88 pass, 0 fail ✅

npm run build
→ FinancesHome-Dn7_QZWg.js  25.91 kB  (era 19.42 kB — +6.49 kB panel discrepancia)
→ ✓ built in 6.06s, sin errores ✅
```

---

## Checklist revalidación manual browser

Para probar se necesita `cash_session_id` de una sesión cerrada con diferencia en DEV.
Obtenerlo desde Reportes → Sesiones de caja (columna `session_id`).

| Caso | Check |
|---|---|
| Hub Finanzas: 3 cards activas — Traspaso, Aportación, Resolución | ⬜ |
| Alert: "Traspaso, Aportación y Resolución disponibles" | ⬜ |
| 2 cards disabled: Retiro, Reversa | ⬜ |
| Click "Ejecutar" en Resolución de diferencia → panel aparece | ⬜ |
| Validación: UUID vacío → "El ID de sesión es obligatorio" | ⬜ |
| Validación: UUID malformado → "El ID de sesión debe ser un UUID válido" | ⬜ |
| Validación: importe 0 → "El importe debe ser mayor que 0" | ⬜ |
| Validación: motivo vacío → "El motivo es obligatorio" | ⬜ |
| Form válido → "Continuar →" → FinanceConfirm amber con Sesión, Tipo, Importe, Motivo | ⬜ |
| "Cancelar" → vuelve al formulario (datos conservados) | ⬜ |
| "Confirmar resolución" → Network: POST financial-operations, action=resolve_cash_discrepancy | ⬜ |
| Éxito → FinanceAlert green | ⬜ |
| "Ver pólizas" → navega a finances-journal con nueva póliza | ⬜ |
| × en panel → vuelve a cards de operaciones | ⬜ |
| Regresión: Traspaso y Aportación siguen funcionando | ⬜ |

---

## Estado de operaciones

| Operación | Estado |
|---|---|
| Traspaso entre fondos | ✅ Implementado y validado (3B) |
| Aportación del propietario | ✅ Implementado y validado (3C) |
| Resolución de diferencia | ✅ Implementado — pendiente validación manual |
| Retiro del propietario | ⬜ Pendiente autorización |
| Reversa de póliza | ⬜ Pendiente autorización |
