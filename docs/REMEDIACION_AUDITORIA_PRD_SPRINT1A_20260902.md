# Remediación Auditoría PRD — Sprint 1A
**Fecha:** 2026-09-02  
**Referencia:** `docs/AUDITORIA_PREVENTIVA_PRD_POST_INCIDENTE_20260902.md`  
**Alcance:** Sin cambios a PRD. Solo local + build DEV.

---

## Tareas ejecutadas

### 1. ALLOWED_ORIGINS documentado ✅

**Archivo creado:** `docs/ENVIRONMENT.md`

Documenta:
- Todas las variables de entorno por componente (Vercel, EFs, local dev)
- Valor actual de `ALLOWED_ORIGINS` en PRD: `https://lacarreta.mobi`
- Impacto de `ALLOWED_ORIGINS` vacío (módulo financiero completo bloqueado)
- Checklist obligatorio al cambiar de dominio
- Formato multi-origin (separado por comas)

**Hallazgo P1-01 parcialmente mitigado.** El riesgo persiste (secret no cambia), pero la
superficie de conocimiento está documentada. El checklist previene el escenario más probable
de ruptura (cambio de dominio sin actualizar el secret).

---

### 2. close_cash_session_atomic versionado localmente ✅

**Archivo creado:** `supabase/migrations/20260902100000_track_close_cash_session_atomic.sql`

- Cuerpo completo recuperado de PRD vía `pg_get_functiondef` (read-only)
- Idempotente (`CREATE OR REPLACE`) — aplica a PRD sin efecto lateral
- Contiene comentarios de contexto: por qué existe, por qué NO se usa, el drift con el flujo de dos conteos
- `revoke`/`grant` de permisos idénticos a `open_cash_session_atomic`

**La migración NO fue aplicada.** Requiere autorización explícita antes de hacer `supabase db push`.

**Hallazgo P1-02 mitigado.** La función ya está en control de versiones. Si el schema de PRD
se resetea o se crea un entorno nuevo, la función no se pierde.

**Drift documentado:** `close_cash_session_atomic` no soporta el flujo de dos conteos
(`first_counted_cash` / `final_counted_cash`). La EF `cash-operations` sí lo soporta.
El comentario en la migración advierte explícitamente sobre esto.

---

### 3. securityService.js — patrón de error corregido ✅

**Archivo editado:** `src/api/securityService.js`

**Problema confirmado:** `invokeUserAdmin` usaba el patrón peligroso idéntico al incidente
original en `erpService.js`:

```js
// ANTES (patrón peligroso):
try {
  const errorBody = await response.json()      // lee el body
  throw new Error(errorBody?.error || ...)     // throw...
} catch {                                      // ...atrapado por su propio catch
  try {
    const errorText = await response.text()    // body ya consumido → falla
    throw new Error(errorText || ...)
  } catch {
    throw new Error(error.message)             // siempre cae aquí: mensaje genérico
  }
}
```

El resultado: errores de `user-admin` EF siempre mostraban el mensaje genérico de Supabase,
no el error real del backend. Ahora usa el patrón `clone()` correcto:

```js
// DESPUÉS (patrón clone correcto):
if (response && typeof response.clone === 'function') {
  const jsonResponse = response.clone()
  const textResponse = response.clone()
  let errorBody = null
  try { errorBody = await jsonResponse.json() } catch { }
  if (errorBody?.error) throw new Error(errorBody.error)
  let errorText = ''
  try { errorText = await textResponse.text() } catch { }
  if (errorText) throw new Error(errorText)
}
throw new Error(error.message)
```

**Hallazgo P3-01 cerrado.** Operaciones afectadas: crear usuario, actualizar usuario,
eliminar usuario — ahora muestran el error real del backend.

---

### 4. finalizeSale — idempotency_key implementada con persistencia por intento ✅

**Archivos editados:**
- `src/api/posService.js`
- `src/pages/POS.jsx`

**Sprint 1A.1 — Idempotencia endurecida (post-revisión):**

La implementación inicial generaba `crypto.randomUUID()` inline en cada llamada, lo cual
no permitía reutilizar la key en retries. Se reemplazó por `useRef` persistente por `order_id`.

**posService.js:** `finalizeSale` acepta y reenvía `idempotency_key`:

```js
async finalizeSale({ table_id, expected_order_id, items, payments, idempotency_key }) {
  return invokePosOperation('finalize_sale', {
    table_id, expected_order_id, items: items || [], payments, idempotency_key,
  })
}
```

**POS.jsx — Estrategia `useRef` keyed por `order_id`:**

```js
// Ref declarado junto a finalizeSaleInFlightRef:
const finalizeSaleIdempotencyKeyRef = useRef(null)
// Forma: { orderId: string, key: string } | null

// En handleFinalizeSale, después de validar finalizingTable:
const currentOrderId = finalizingTable.current_order_id
if (
  !finalizeSaleIdempotencyKeyRef.current ||
  finalizeSaleIdempotencyKeyRef.current.orderId !== currentOrderId
) {
  finalizeSaleIdempotencyKeyRef.current = { orderId: currentOrderId, key: crypto.randomUUID() }
}
const idempotencyKey = finalizeSaleIdempotencyKeyRef.current.key

// Llamada usa idempotencyKey (no randomUUID() inline):
idempotency_key: idempotencyKey,

// En success path (no en finally):
finalizeSaleIdempotencyKeyRef.current = null
```

**Comportamiento verificado (4 escenarios):**

| Escenario | Comportamiento |
|---|---|
| Venta normal | ref = null → UUID generado → venta creada → ref limpiado ✅ |
| Doble click | `finalizeSaleInFlightRef` bloquea segunda llamada antes de UUID ✅ |
| Retry con red perdida | catch no limpia ref → mismo orderId → UUID reutilizado → cache RPC ✅ |
| Nueva venta (otra mesa/orden) | success limpió ref O nuevo orderId → UUID fresco ✅ |

**El ref NO se limpia en `finally`** (que siempre corre). Solo se limpia en el success path.
En error, el ref persiste para el próximo retry.

**Cadena completa verificada:**
```
POS.jsx → finalizeSaleIdempotencyKeyRef.current.key
  → posService.finalizeSale({ idempotency_key })
    → pos-operations EF línea 520: body.idempotency_key
      → finalize_pos_sale RPC (p_idempotency_key)
        → idempotency_requests tabla (scope='pos_finalize', key=UUID)
```

**Hallazgo P2-03 cerrado.** Idempotencia real: mismo intento lógico → misma key.  
Retry de red → respuesta cacheada del servidor → sin venta duplicada.

---

### 5. erp-operations anon key (P3-02)

**No modificado.** Cambio es en Edge Function, requiere deploy. Se aplaza a Sprint 2.

---

## Validación DEV

| Check | Resultado |
|---|---|
| `npm run lint` | ✅ Sin errores |
| `npm run build` | ✅ Built sin errores |
| `npm run test:finance` | ✅ 88/88 pass, 0 fail |
| `git diff --check` | ✅ Sin whitespace errors (LF/CRLF warning solo informativo) |

Chunks actualizados:
- `SecurityUsers-Bckgk8Lr.js` — fix `securityService.js` clone()
- `POS-Bsnj6bxu.js` — idempotencia endurecida con `useRef`
- `posService` — incluido en chunk de POS

No se ejecutaron operaciones de negocio. No se hizo deploy.

---

## Archivos modificados (resumen)

| Archivo | Tipo | Cambio |
|---|---|---|
| `docs/ENVIRONMENT.md` | NUEVO | Documentación de variables de entorno y ALLOWED_ORIGINS |
| `supabase/migrations/20260902100000_track_close_cash_session_atomic.sql` | NUEVO | Versionar función PRD sin migración |
| `src/api/securityService.js` | EDITADO | Fix patrón clone() en error handler |
| `src/api/posService.js` | EDITADO | Agregar idempotency_key a finalizeSale |
| `src/pages/POS.jsx` | EDITADO | Generar y pasar idempotency_key en handleFinalizeSale |

---

## Hallazgos actualizados post-Sprint 1A

| ID | Hallazgo | Estado |
|---|---|---|
| P1-01 | ALLOWED_ORIGINS no verificable | DOCUMENTADO — riesgo persiste pero mitigado con checklist |
| P1-02 | close_cash_session_atomic sin migración | CERRADO — versionado en repo |
| P2-01 | open_cash_session no usa RPC atómico | PENDIENTE — Sprint 2 (cash-operations refactor) |
| P2-02 | close_cash_session no usa RPC atómico | PENDIENTE — Sprint 2 |
| P2-03 | finalizeSale sin idempotency_key | CERRADO |
| P2-04 | payment_method legacy en cálculo de caja | PENDIENTE — Sprint 4 (cuando haya multi-pago) |
| P3-01 | securityService clone() faltante | CERRADO |
| P3-02 | erp-operations anon key inconsistente | PENDIENTE — Sprint 2 |
| P3-03 | Supabase CLI desactualizado | PENDIENTE — mantenimiento |

---

## Riesgos encontrados durante Sprint 1A

**Ninguno nuevo.** Todos los cambios son de bajo riesgo y compilaron sin errores.

**Drift documentado (ya conocido):** `close_cash_session_atomic` no soporta dos conteos.
El comentario en la migración lo advierte explícitamente.

---

## PRD modificado

**NO.** Cero cambios a PRD:
- No SQL de escritura
- No db push
- No Edge Function deploy
- No Vercel deploy
- No cambios de secrets
- No operaciones de negocio

---

## Siguiente paso recomendado

Autorizar **commit** de los 5 archivos de Sprint 1A en `chore/code-cleanup` o rama nueva.  
Luego autorizar `supabase db push` de la migración `20260902100000` a DEV/staging para validar
que la función se crea correctamente en entorno fresco antes de aplicar a PRD.

Sprint 2 (separado): refactorizar `cash-operations` para usar RPCs atómicos + homogenizar
`erp-operations` anon key.
