# Análisis: pos-operations — Compatibilidad con nueva firma de finalize_pos_sale

**Fecha:** 2026-08-17  
**Rama:** `chore/code-cleanup`  
**Alcance:** Solo análisis + confirmación de estado. Sin cambios de código, sin deploy.

---

## Hallazgo principal

**La Edge Function `pos-operations` en DEV ya llama la nueva firma.**  
No se requieren cambios de código. El ajuste ya está implementado.

---

## Trazabilidad completa de la cadena

### Capa 1 — Frontend (`src/pages/POS.jsx:1351-1355`)

```javascript
const { sale } = await posService.finalizeSale({
  table_id: finalizingTable.id,
  expected_order_id: finalizingTable.current_order_id,
  items: normalizedCart,
  payments: [{ method: 'Efectivo', amount: saleAmount }],
})
```

Envía `payments` como array. No envía `payment_method` (campo de la firma antigua).

### Capa 2 — Service (`src/api/posService.js:54-61`)

```javascript
async finalizeSale({ table_id, expected_order_id, items, payments }) {
  return invokePosOperation('finalize_sale', {
    table_id,
    expected_order_id,
    items: items || [],
    payments,
  })
}
```

Pasa `payments` directamente al body de la EF. Sin transformación.

### Capa 3 — Edge Function (`supabase/functions/pos-operations/index.ts:576-614`)

**Lectura de payments — compatible con formato nuevo y legacy:**

```typescript
// Build payments array. Accept new format [{method, amount}] or legacy payment_method.
type Payment = { method: string; amount: number }
const VALID_PAYMENT_METHODS = new Set(['efectivo', 'tarjeta', 'transferencia'])
let payments: Payment[]
if (Array.isArray(body.payments) && body.payments.length > 0) {
  // Nuevo formato: body.payments = [{method: 'Efectivo', amount: X}]
  payments = (body.payments as unknown[]).map((p: Record<string, unknown>) => ({
    method: String(p?.method ?? '').trim(),
    amount: toNumber(p?.amount, 0),
  })).filter((p) => p.method && p.amount > 0)
} else {
  // Legacy: body.payment_method = 'Efectivo'
  const legacyMethod = String(body.payment_method ?? CASH_PAYMENT_METHOD).trim()
  payments = [{ method: legacyMethod, amount: computedTotal }]
}
```

**Llamada a la RPC — nueva firma:**

```typescript
const { data: finalizedSale, error: finalizeError } = await adminClient.rpc('finalize_pos_sale', {
  p_table_id:        table.id,
  p_items:           rpcItems,
  p_payments:        payments,          // ← p_payments jsonb (nuevo)
  p_performed_by:    user.id,
  p_idempotency_key: idempotencyKey,    // ← parámetro nuevo (null si no enviado)
})
```

### Capa 4 — DB RPC (`finalize_pos_sale`)

Firma nueva (migración `20260811140000` + fix `20260815100000`):
```sql
finalize_pos_sale(
  p_table_id        uuid,
  p_items           jsonb,
  p_payments        jsonb,
  p_performed_by    uuid,
  p_idempotency_key text default null
)
```

---

## Compatibilidad backward en la EF

La EF acepta dos formatos de entrada:

| Formato | Campo enviado | Comportamiento |
|---|---|---|
| **Nuevo** (DEV actual) | `body.payments = [{method, amount}]` | Array leído directamente |
| **Legacy** | `body.payment_method = 'Efectivo'` | Convierte a `[{method, amount: computedTotal}]` |

Esto garantiza que si PRD tiene un cliente antiguo que envíe `payment_method`, la EF nueva no rompe.

---

## Idempotencia en flujo actual

`POS.jsx` no envía `idempotency_key` actualmente:
```javascript
// No hay idempotency_key en la llamada de POS.jsx
posService.finalizeSale({ table_id, expected_order_id, items, payments })
```

La EF lee:
```typescript
const idempotencyKey = body.idempotency_key ? String(body.idempotency_key).trim() : null
```

Resultado: `idempotencyKey = null`. La RPC lo acepta y omite el check de idempotencia:
```sql
if p_idempotency_key is not null then
  -- omitido
end if;
```

Sin efecto operativo. El flujo de venta funciona igual que antes.

---

## Comparación: EF actual en DEV vs. EF antigua en PRD

| Aspecto | EF antigua (PRD) | EF nueva (DEV) |
|---|---|---|
| Campo de pago recibido | `body.payment_method text` | `body.payments [{method, amount}]` (+ fallback legacy) |
| Llamada a RPC | `rpc('finalize_pos_sale', { p_table_id, p_items, p_payment_method, p_performed_by })` | `rpc('finalize_pos_sale', { p_table_id, p_items, p_payments, p_performed_by, p_idempotency_key })` |
| Firma DB requerida | `(uuid, jsonb, text, uuid)` — OLD | `(uuid, jsonb, jsonb, uuid, text)` — NEW |
| Soporte multi-pago | No | Sí (Efectivo, Tarjeta, Transferencia) |
| Idempotencia | No | Sí (opcional, `null` si no enviado) |

---

## Invariantes de negocio conservados

La EF nueva conserva todos los checks de la antigua:
- ✅ Cubeta Mixta: 10 piezas exactas, $32, 5 SKUs whitelisted
- ✅ Cubeta Caguamita: 5 piezas exactas, $26, SKU único
- ✅ Precios del servidor (inventario), no del cliente
- ✅ Solo métodos válidos: Efectivo, Tarjeta, Transferencia
- ✅ Caja abierta requerida si hay componente Efectivo
- ✅ Bloqueo de modificación para meseros

**Cambio de comportamiento documentado:**  
La nueva `finalize_pos_sale` RPC NO requiere caja abierta para ventas 100% Tarjeta/Transferencia. La EF actual de POS siempre envía Efectivo, por lo que esto no afecta el flujo actual.

---

## Conclusión: estado del ajuste

| Capa | Estado | Acción requerida |
|---|---|---|
| `POS.jsx` | ✅ Ya envía `payments` array | Ninguna |
| `posService.js` | ✅ Ya pasa `payments` a EF | Ninguna |
| `pos-operations` EF | ✅ Ya llama nueva firma RPC | **Desplegar a PRD** junto con migraciones |
| DB `finalize_pos_sale` | ⏳ Nueva firma solo en DEV | Aplicar migraciones `20260811140000` + `20260815100000` |

**No se requieren cambios de código.** El ajuste ya está implementado en DEV.  
El único paso pendiente es el deploy coordinado: EF + migraciones a PRD en misma ventana.

---

## Tests existentes

`npm run test:finance` cubre `financial-operations` y `cash-operations`. No existe suite de tests unitarios para `pos-operations`. La validación del flujo de venta con nueva firma fue hecha manualmente en DEV (evidencia en sesiones anteriores de la rama).

---

## Restricciones respetadas

- ✅ No se modificó código
- ✅ No se ejecutó deploy
- ✅ No se tocó PRD
- ✅ No se activó ledger
- ✅ No se hicieron commits ni push
