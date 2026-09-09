# Evidencia: Separación explícita de tipo de compra y método de pago

**Fecha:** 2026-08-18  
**Rama:** `chore/code-cleanup`  
**Alcance:** UI + service + EF — sin migraciones, sin activar ledger, sin tocar PRD.

---

## Resumen de cambios

| Archivo | Tipo de cambio |
|---|---|
| `src/pages/PurchaseEntry.jsx` | UI: selector tipo, método de pago, modales, handlers |
| `src/pages/PurchasesReport.jsx` | Reporte: filtro y columna "Tipo" |
| `src/api/erpService.js` | Service: forward payment, idempotency_key, purchase_type |
| `src/api/materialService.js` | Service: forward params + derivar purchase_type en reporte |
| `supabase/functions/erp-operations/index.ts` | EF: reemplazar isGeneralProviderPurchase con purchase_type |

---

## 1. Contrato verificado antes de implementar

### EF `erp-operations` — `record_purchase`
- Ya leía `body.payment` (líneas 525-526) y `body.idempotency_key` (línea 527).
- Ya validaba método (`efectivo`, `tarjeta`, `transferencia`) y amount (líneas 651-662).
- Ya llamaba `create_purchase_with_ledger` con `p_payment` y `p_idempotency_key` (líneas 664-672).
- **NO estaba cableado desde UI/service** — solo faltaba enviar los campos.

### RPC `create_purchase_with_ledger`
- Deriva tipo de item de `material_id`: presente → 1201 (merch), ausente → 5102 (gastos).
- Activa asientos de ledger solo si `ledger_cutover_at IS NOT NULL AND p_payment IS NOT NULL`.
- Sin cambios requeridos en el RPC.

### Métodos de pago aceptados por EF/RPC
- `Efectivo` → requiere caja abierta si ledger activo
- `Transferencia` → cuenta 1103 si ledger activo
- `Tarjeta` → cuenta 1103 si ledger activo

---

## 2. Cambios en UI (`PurchaseEntry.jsx`)

### Estado nuevo
```
purchaseType: ''       // '' | 'inventory' | 'expense'
paymentMethod: ''      // '' | 'Efectivo' | 'Transferencia' | 'Tarjeta'
showTypeChangeModal: false
pendingPurchaseType: ''
```

### Flujo de usuario
1. Seleccionar "Tipo de documento" (Compra de inventario / Gasto operativo) — requerido.
2. Seleccionar proveedor — deshabilitado hasta que haya tipo.
3. Seleccionar método de pago — requerido antes del Check.
4. Agregar renglones:
   - **Inventario**: selector de materiales filtrados por proveedor.
   - **Gasto**: campo libre de descripción (material_id = null).
5. Check → modal muestra tipo + proveedor + folio + método + renglones + total.
6. Confirmar → submit con `payment`, `idempotency_key = crypto.randomUUID()`, `purchase_type`.

### Invariante de homogeneidad
- Si tipo = inventario: solo items con `material_id`.
- Si tipo = gasto: solo items con `item_description` (material_id = null).
- Cambiar tipo con items en lista requiere confirmación modal (TypeChangeModal).

### Constantes eliminadas (muertas por el cambio)
- `GENERAL_PROVIDER_NAME`
- `normalizeProviderName`
- `isGeneralProviderRecord`

La clasificación ya no depende del nombre del proveedor — depende del `purchaseType` seleccionado explícitamente.

---

## 3. Cambios en EF (`erp-operations/index.ts`)

### Antes
```typescript
const isGeneralProviderPurchase = normalizeText(providerSnapshot.name) === normalizeText(GENERAL_PROVIDER_NAME)
// if (isGeneralProviderPurchase) → free-form items allowed
// else → material_id required
```

### Después
```typescript
const purchaseType = String(body.purchase_type ?? '').trim()
if (!purchaseType || !['inventory', 'expense'].includes(purchaseType)) {
  return json({ error: 'Tipo de compra requerido: inventory o expense.' }, 400)
}
// if (purchaseType === 'expense') → free-form items, material_id forbidden
// else (purchaseType === 'inventory') → material_id required
```

**Impacto:** Cualquier proveedor puede registrar gastos operativos (no solo "Proveedor General"). La clasificación es explícita y no deriva del nombre del proveedor.

---

## 4. Cambios en reporte (`PurchasesReport.jsx` + `materialService.js`)

### Derivación de tipo sin nueva migración
`getPurchaseItemsSummary` lee `purchase_items.material_id`:
- Si algún item tiene `material_id` → `'inventory'` → "Compra de inventario"
- Si todos los items tienen `material_id = null` → `'expense'` → "Gasto operativo"

Compras históricas (anteriores a este cambio) que mezclaban items aparecerán como "Compra de inventario" (dominante). Compras puramente de "Proveedor General" existentes aparecerán como "Gasto operativo".

### Reporte: nuevo campo `purchase_type`
- Columna "Tipo" visible en tabla y exportable.
- Filtro "Tipo" con opciones: Todos / Compra de inventario / Gasto operativo.
- Grid de filtros: de 3 columnas a 4.

---

## 5. Validación

| Check | Resultado |
|---|---|
| `npm run lint` | ✅ Sin errores ni warnings |
| `npm run build` | ✅ build exitoso — `PurchaseEntry-DdQQ7Mj_.js` generado |
| Suite de tests | No existe en el proyecto |

---

## 6. Comportamiento con ledger inactivo (estado actual)

- `payment` se envía al RPC con método y monto.
- RPC valida: método válido + monto = total de compra.
- Si `paymentMethod = 'Efectivo'`: RPC verifica caja abierta (incluso sin ledger activo).
- Ledger inactivo → bloque de asientos NO se ejecuta → no se generan journal_entries.
- La compra se registra en `purchases` + `purchase_items` + `inventory_movements` (igual que antes).

**Nota:** Con ledger inactivo, las compras en efectivo requieren caja abierta. Esto es correcto y consistente con el flujo de ventas.

---

## 7. Restricciones cumplidas

- ✅ No se tocó PRD.
- ✅ No se activó ledger.
- ✅ No se ejecutó SQL manual.
- ✅ No se modificó `financialService`.
- ✅ No se crearon módulos nuevos.
- ✅ Un solo flujo de compras (mismo `PurchaseEntry.jsx`, mismo `record_purchase`).
- ✅ No se hicieron commits ni push.
- ✅ Documentos homogéneos por tipo (solo inventario O solo gasto por documento).
