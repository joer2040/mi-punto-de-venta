# FASE3 R9 — UI Finanzas Fase 3B: Traspaso entre fondos (DEV)

**Fecha:** 2026-08-16  
**Rama:** `chore/code-cleanup`

---

## Archivos creados / modificados

| Archivo | Acción |
|---|---|
| `src/components/FinancesTransferPanel.jsx` | Nuevo — formulario de traspaso |
| `src/pages/FinancesHome.jsx` | Modificado — activa card Traspaso, integra panel |

---

## `FinancesTransferPanel.jsx`

Componente auto-contenido. Maneja su propio estado. NO es una ruta/página — FinancesHome lo renderiza inline.

### Flujo de estados

```
[Formulario] → Continuar → [FinanceConfirm] → Confirmar traspaso → [Resultado]
                 ↑ back                ↓ Cancelar
                 └─────────────────────┘

[Resultado success] → "Nueva operación" → [Formulario reset]
                    → "Ver pólizas"    → navega a finances-journal
[Resultado error]   → × (dismiss)      → muestra formulario de nuevo
```

### Campos

| Campo | Tipo | Reglas |
|---|---|---|
| Fondo origen | select | Requerido; opciones: 1101, 1102, 1103 |
| Fondo destino | select | Requerido; distinto al origen |
| Importe | number | Requerido; > 0; máx 2 decimales |
| Descripción | text | Opcional; máx 200 chars; default "Traspaso entre fondos" |

### Validación

```javascript
const validateTransfer = ({ fromCode, toCode, amount }) => {
  // fromCode required
  // toCode required
  // fromCode !== toCode  →  error en toCode
  // amount: isFinite, > 0, max 2 decimals
}
```

Errores inline por campo (`fieldErrors`). Sin `window.alert`. Sin `window.confirm`.

### Idempotency key

```javascript
// Generada al montar el panel (useRef):
const idempotencyKeyRef = useRef(generateIdempotencyKey())

// Rotada después de cada intento (éxito o error):
idempotencyKeyRef.current = generateIdempotencyKey()
```

### Llamada al servicio

```javascript
await financialService.recordTransfer({
  fromCode: form.fromCode,
  toCode: form.toCode,
  amount: parseFloat(form.amount),
  description: form.description.trim() || null,
  idempotencyKey: idempotencyKeyRef.current,
})
```

`financialService.recordTransfer` convierte a snake_case y envía via `supabase.functions.invoke('financial-operations')`. Sin llamadas directas a DB.

### Confirm lines (ejemplo)

```
Origen: Caja operativa
Destino: Banco
Importe: $500.00
Descripción: Traspaso entre fondos
```

### Infraestructura usada

- `FinanceAlert` — resultado success (green) y error (red)
- `FinanceConfirm` — paso de confirmación (amber)
- `generateIdempotencyKey` — key por operación

---

## `FinancesHome.jsx` (cambios)

- Agrega `useState` import y `activeOperation` state (null | 'transfer')
- Agrega import `FinancesTransferPanel`
- Card "Traspaso entre fondos" cambia de `<div disabled>` a `<button onClick>` para superadmin
- Otras 4 cards siguen disabled "Próximamente"
- Alert mensaje actualizado: "Traspaso entre fondos disponible. Aportación... próximamente."
- Cuando `activeOperation === 'transfer'`: panel aparece en lugar de las cards (maxWidth 640px)
- Panel tiene botón × que setea `activeOperation(null)` y vuelve a las cards

---

## Validación automática

```
npx eslint src/components/FinancesTransferPanel.jsx src/pages/FinancesHome.jsx
→ 0 errores ✅

npm run test:finance
→ 88/88 pass, 0 fail ✅

npm run build
→ FinancesHome-C1b4de_m.js  13.67 kB  (era 5.56 kB — +8.1 kB panel+confirm+idempotency)
→ ✓ built in 5.50s, sin errores ✅
```

---

## Checklist revalidación manual browser

| Caso | Check |
|---|---|
| Hub Finanzas: card "Traspaso" con acento violet, botón "Ejecutar" | ⬜ |
| Alert info actualizado: "Traspaso disponible" | ⬜ |
| Click "Ejecutar" → panel aparece, cards desaparecen | ⬜ |
| Panel: selects origen/destino con opciones 1101/1102/1103 | ⬜ |
| Validación: mismo origen y destino → error inline en "Fondo destino" | ⬜ |
| Validación: importe 0 o vacío → error inline en "Importe" | ⬜ |
| Validación: importe 3 decimales → error inline en "Importe" | ⬜ |
| Sin errores → click "Continuar →" → aparece FinanceConfirm amber | ⬜ |
| FinanceConfirm muestra: Origen, Destino, Importe, Descripción | ⬜ |
| "Cancelar" en FinanceConfirm → vuelve al formulario (datos conservados) | ⬜ |
| "Confirmar traspaso" → Network: POST a financial-operations, action=record_transfer | ⬜ |
| Éxito → FinanceAlert green con monto y fondos | ⬜ |
| "Nueva operación" → resetea formulario | ⬜ |
| "Ver pólizas" → navega a finances-journal | ⬜ |
| × en panel → vuelve a cards de operaciones | ⬜ |

---

## Estado de operaciones

| Operación | Estado |
|---|---|
| Traspaso entre fondos | ✅ Implementado |
| Aportación del propietario | ⬜ Pendiente autorización |
| Retiro del propietario | ⬜ Pendiente autorización |
| Resolución de diferencia | ⬜ Pendiente autorización |
| Reversa de póliza | ⬜ Pendiente autorización |
