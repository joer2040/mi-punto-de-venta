# FASE3 R9 — UI Finanzas Fase 3C: Aportación del propietario (DEV)

**Fecha:** 2026-08-17  
**Rama:** `chore/code-cleanup`

---

## Archivos creados / modificados

| Archivo | Acción |
|---|---|
| `src/components/FinancesOwnerContributionPanel.jsx` | Nuevo — formulario de aportación |
| `src/pages/FinancesHome.jsx` | Modificado — activa card Aportación, agrega elif branch |

---

## `FinancesOwnerContributionPanel.jsx`

Misma estructura que `FinancesTransferPanel`. Auto-contenido. FinancesHome lo renderiza inline.

### Flujo de estados

```
[Formulario] → Continuar → [FinanceConfirm] → Confirmar aportación → [Resultado]
                 ↑ back                ↓ Cancelar
                 └─────────────────────┘

[Resultado success] → "Nueva operación" → [Formulario reset]
                    → "Ver pólizas"    → navega a finances-journal
[Resultado error]   → × (dismiss)      → muestra formulario de nuevo
```

### Campos

| Campo | Tipo | Reglas |
|---|---|---|
| Fondo destino | select | Requerido; opciones: 1101, 1102, 1103 |
| Importe | number | Requerido; > 0; máx 2 decimales |
| Descripción | text | Opcional; máx 200 chars; default "Aportación del propietario" |

### Validación

```javascript
const validateContribution = ({ destinationCode, amount }) => {
  // destinationCode required
  // amount: isFinite, > 0, max 2 decimals
}
```

### Llamada al servicio

```javascript
await financialService.recordOwnerContribution({
  destinationCode: form.destinationCode,
  amount: parseFloat(form.amount),
  description: form.description.trim() || null,
  idempotencyKey: idempotencyKeyRef.current,
})
```

`financialService.recordOwnerContribution` convierte a snake_case (`destination_code`, `amount`, `idempotency_key`) y envía via `supabase.functions.invoke('financial-operations', action='record_owner_contribution')`.

### Confirm lines (ejemplo)

```
Destino: Caja operativa
Importe: $500.00
Descripción: Aportación del propietario
```

---

## `FinancesHome.jsx` (cambios)

- Agrega import `FinancesOwnerContributionPanel`
- Condición de panel: `transfer` → elif `contribution` → else grid de cards
- Cards activas: `transfer` y `contribution` — renderizadas como `<button>` con ACCENT violet
- Card `contribution` usa `card.id` como key (limpieza: unificado con transfer, mismo pattern)
- Alert actualizado: `title="Traspaso y Aportación disponibles"` / `message="Retiro, Resolución de diferencia y Reversa próximamente."`
- Restantes 3 cards siguen disabled

---

## Validación automática

```
npx eslint src/components/FinancesOwnerContributionPanel.jsx src/pages/FinancesHome.jsx
→ 0 errores ✅

npm run test:finance
→ 88/88 pass, 0 fail ✅

npm run build
→ FinancesHome-Cvx9_YgY.js  19.42 kB  (era 13.67 kB — +5.75 kB panel aportación)
→ ✓ built in 7.40s, sin errores ✅
```

---

## Checklist revalidación manual browser

| Caso | Check |
|---|---|
| Hub Finanzas: 2 cards activas — "Traspaso" y "Aportación" — ambas con "Ejecutar" | ⬜ |
| Alert info: "Traspaso y Aportación disponibles" | ⬜ |
| 3 cards disabled: Retiro, Resolución de diferencia, Reversa | ⬜ |
| Click "Ejecutar" en Aportación → panel aparece | ⬜ |
| Panel: select fondo destino con opciones 1101/1102/1103 | ⬜ |
| Validación: importe vacío → error inline "El importe debe ser mayor que 0" | ⬜ |
| Validación: importe 3 decimales → error "El importe admite máximo 2 decimales" | ⬜ |
| Form válido → "Continuar →" → FinanceConfirm amber con Destino, Importe, Descripción | ⬜ |
| "Cancelar" en FinanceConfirm → vuelve al formulario (datos conservados) | ⬜ |
| "Confirmar aportación" → Network: POST financial-operations, action=record_owner_contribution | ⬜ |
| Éxito → FinanceAlert green con monto y fondo | ⬜ |
| "Nueva operación" → resetea formulario | ⬜ |
| "Ver pólizas" → navega a finances-journal con nueva póliza | ⬜ |
| × en panel → vuelve a cards de operaciones | ⬜ |
| Traspaso sigue funcionando igual (regresión) | ⬜ |

---

## Estado de operaciones

| Operación | Estado |
|---|---|
| Traspaso entre fondos | ✅ Implementado y validado (3B) |
| Aportación del propietario | ✅ Implementado — pendiente validación manual |
| Retiro del propietario | ⬜ Pendiente autorización |
| Resolución de diferencia | ⬜ Pendiente autorización |
| Reversa de póliza | ⬜ Pendiente autorización |
