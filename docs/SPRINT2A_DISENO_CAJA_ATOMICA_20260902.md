# Sprint 2A — Diseño: Caja Atómica
**Fecha:** 2026-09-02  
**Tipo:** Análisis y diseño — SIN cambios de código ni PRD  
**Rama:** `chore/code-cleanup`

---

## 1. Resumen ejecutivo

PRD opera correctamente. No hay P0 activos. Sin embargo, el flujo de Caja
(`cash-operations`) tiene cuatro problemas de concurrencia y consistencia
que aumentan el riesgo con el tiempo:

1. **Doble apertura simultánea** → DB constraint la captura, pero la EF
   retorna 500 genérico en lugar de 409 amigable.
2. **Primer conteo sin lock** → dos managers simultáneos pueden sobreescribir
   `first_counted_cash` (last-write-wins, sin detección).
3. **Snapshot de inventario no atómico con el cierre** → retry de cierre
   inserta snapshots duplicados.
4. **`close_cash_session_atomic` existente** → no soporta el flujo de dos
   conteos, no puede sustituir la EF actual sin extenderse.

El objetivo de Sprint 2A es diseñar nuevos RPCs que encapsulen toda la lógica
crítica transaccional en DB, dejando la EF solo para auth, autorización y
mapping de errores.

**PRD puede continuar operando.** Ningún cambio en este sprint.

---

## 2. Arquitectura actual

```
CashControl.jsx
  └─ cashControlService.js
       └─ cash-operations EF (Deno)
            ├─ loadOpenSession        (SELECT, sin lock)
            ├─ loadActiveSaleCount    (SELECT tables)
            ├─ loadSalesSummary       (SELECT sales + sale_items + inventory)
            ├─ createInventorySnapshot (SELECT inventory → INSERT snapshots)
            ├─ loadSnapshotRows       (SELECT snapshots)
            ├─ performClose           (INSERT snapshot + UPDATE cash_sessions)
            └─ UPDATE cash_sessions   (primer conteo: sin cambiar status)
```

**Problemas del diseño actual:**
- La lógica de negocio transaccional vive en la EF (Deno/TypeScript), fuera de DB.
- Múltiples round-trips entre EF y DB en operaciones que deberían ser atómicas.
- Sin advisory locks → ventanas de race condition entre SELECT y write.

---

## 3. Flujo apertura actual

```
UI: handleOpenSession(amount)
  ↓
cashControlService.openCashSession(amount)
  ↓
cash-operations EF: action='open_cash_session'
  1. Auth + autorización (loadCallerContext)
  2. Validar openingAmount > 0
  3. loadOpenSession()
     → SELECT * FROM cash_sessions WHERE status='open' LIMIT 1
       ← Sin FOR UPDATE, sin advisory lock
  4. Si sesión abierta → return 409
  5. INSERT INTO cash_sessions { status='open', opening_amount, ... }
     ← Si race condition: falla con unique violation → 500 sin manejar
  6. createInventorySnapshot(sessionId, 'opening')
     → loadInventoriableInventory() → SELECT inventory
     → INSERT INTO cash_session_inventory_snapshots (N rows)
       ← Operación SEPARADA del INSERT de la sesión
  7. return { session }
```

### Problema crítico: ventana TOCTOU

```
t0: A: SELECT → null (no sesión abierta)
t0: B: SELECT → null (no sesión abierta)
t1: A: INSERT cash_sessions → OK (session_id_A)
t1: B: INSERT cash_sessions → UNIQUE VIOLATION (unique index)
t2: A: createInventorySnapshot → OK
t2: B: EF devuelve 500 (unique_violation sin capturar)
```

**Protección DB:** `cash_sessions_single_open_idx` — `UNIQUE ON (status) WHERE status='open'`  
→ A nivel de datos, la consistencia se mantiene.  
→ A nivel de UX: Terminal B recibe `500 Error interno` en vez de `409 Ya existe sesión`.

### Problema crítico: snapshot no atómico con apertura

Si `createInventorySnapshot` (paso 6) falla por cualquier razón:
- La sesión `cash_sessions` YA está insertada en DB (status='open')
- El snapshot de apertura NO existe
- La apertura queda en estado parcial: sesión abierta sin inventario inicial
- El PDF de cierre no tendrá comparativa de inventario apertura vs. cierre

No hay rollback automático porque INSERT (paso 5) y INSERT snapshot (paso 6) son transacciones separadas.

---

## 4. `open_cash_session_atomic` — Análisis completo

**Firma:** `open_cash_session_atomic(p_opening_amount numeric, p_opened_by uuid) RETURNS jsonb`  
**Seguridad:** SECURITY DEFINER, `search_path = public, pg_temp`  
**Permisos:** EXECUTE solo a `service_role` (revocado de public/anon/authenticated)

### Mecanismo de concurrencia

```sql
perform pg_advisory_xact_lock(hashtextextended('public.open_cash_session_atomic', 0));
```

Advisory lock de transacción: serializa TODOS los intentos de apertura globalmente.
Solo un proceso puede ejecutar este bloque a la vez. Si B llega mientras A está dentro → B espera.

```sql
select cash_session.id
  into v_existing_session_id
from public.cash_sessions cash_session
where cash_session.status = 'open'
  for update;  -- ← Lock a nivel de fila
```

Doble verificación post-lock: incluso si el advisory lock se libera, el FOR UPDATE
garantiza que la lectura es consistente con el estado actual.

### Atomicidad completa

```sql
-- En la misma transacción:
INSERT INTO cash_sessions → v_opened_session
INSERT INTO cash_session_inventory_snapshots (SELECT FROM inventory)
```

Si el snapshot falla → la transacción entera hace rollback → no queda sesión sin snapshot.

### Errores de negocio

| Condición | Retorno |
|---|---|
| Sesión ya abierta | `{ ok: false, error: 'Ya existe una caja abierta...', active_sales_count: 0 }` |
| Ventas activas | `{ ok: false, error: 'No puedes abrir la caja mientras...', active_sales_count: N }` |
| unique_violation | `{ ok: false, error: 'Ya existe una caja abierta...', active_sales_count: 0 }` |
| Éxito | `{ ok: true, session: { ... }, active_sales_count: 0 }` |

### ¿Puede sustituir la lógica actual de apertura?

**SÍ, completamente.** El RPC cubre todos los casos de la EF y agrega:
- Advisory lock
- FOR UPDATE de verificación
- Atomicidad apertura + snapshot
- Manejo amigable de unique violation

### Incompatibilidades con frontend actual

**Ninguna.** El payload de retorno `{ ok, session }` es distinto del actual `{ session }`.
La EF puede adaptar el mapeo de salida:

```js
const result = await adminClient.rpc('open_cash_session_atomic', { ... })
if (!result.data?.ok) return json({ error: result.data?.error }, 409)
return json({ session: serializeSession(result.data?.session) })
```

### ¿Qué lógica queda en la EF?

1. Auth + autorización (`loadCallerContext`, `canManageCashControl`)
2. Validación de payload (`openingAmount > 0`)
3. Llamada al RPC con `user.id`
4. Mapeo de respuesta `{ ok, session }` → `{ session }`
5. Mapeo de errores RPC → HTTP status codes

**Qué se elimina de la EF:**
- `loadOpenSession`
- `createInventorySnapshot` para apertura
- INSERT directo de `cash_sessions`

---

## 5. Flujo cierre actual y diagrama de estados

### Estado de sesión (diagrama)

```
                     ┌─────────────────────┐
                     │        OPEN          │
                     │  first_counted_cash  │
                     │       = NULL         │
                     └──────────┬───────────┘
                                │
                    close_cash_session(counted_cash)
                                │
                    ┌─────────────────────┐
                    │  expected = opening + salesCashTotal
                    │  difference = counted - expected
                    └─────────────────────┘
                                │
               ┌────────────────┴────────────────┐
          difference == 0               difference != 0
               │                                 │
               ▼                                 ▼
    ┌──────────────────┐           ┌────────────────────────┐
    │     CLOSED       │           │   OPEN (intermedio)    │
    │ status='closed'  │           │  first_counted_cash    │
    │ first_counted    │           │       = counted        │
    │ closing_inventory│           │  difference_amount set │
    └──────────────────┘           └───────────┬────────────┘
                                               │
                                   submit_recount(second_counted_cash)
                                               │
                               ┌───────────────┴────────────────┐
                          diff == 0                    diff != 0
                               │                                 │
                               ▼                                 ▼
                   ┌──────────────────┐         ┌──────────────────────────┐
                   │     CLOSED       │         │ CLOSED_WITH_PENDING_DIFF │
                   │ status='closed'  │         │ status=                  │
                   │ final_counted    │         │ 'closed_with_pending_    │
                   │ closing_inventory│         │  difference'             │
                   └──────────────────┘         │ final_counted_cash       │
                                                │ closing_inventory        │
                                                └───────────┬──────────────┘
                                                            │
                                              resolve_cash_discrepancy()
                                              (via financial-operations EF)
                                                            │
                                            ┌───────────────┴────────────┐
                                       shortage/omitted          surplus
                                            │                            │
                                    Débito 5101                  Débito 1101
                                    Crédito 1101                 Crédito 4102
                                            │                            │
                                    ┌───────────────────────────────────┐
                                    │  cash_discrepancy_resolutions     │
                                    │  (UNIQUE ON cash_session_id)      │
                                    │  status: closed_with_pending_diff │
                                    │  (status no cambia)               │
                                    └───────────────────────────────────┘
```

**Nombres reales de estados en DB:**
- `'open'` — sesión activa (con o sin `first_counted_cash`)
- `'closed'` — cerrada con diferencia == 0
- `'closed_with_pending_difference'` — cerrada con diferencia != 0, pendiente resolución

**Nota crítica:** El status no cambia después de `resolve_cash_discrepancy`. La sesión queda permanentemente como `closed_with_pending_difference`. La resolución se registra en la tabla `cash_discrepancy_resolutions`.

### Flujo detallado `close_cash_session`

```
EF close_cash_session (primer conteo):
  1. loadOpenSession()  ← SELECT sin lock
  2. Verificar first_counted_cash == null
  3. Verificar counted_cash >= 0
  4. loadActiveSaleCount()  ← SELECT tables
  5. loadSalesSummary()  ← 3 SELECTs (sales, sale_items, inventory)
  6. expected = opening + salesCashTotal
  7. difference = round(counted - expected, 2)
  
  if difference == 0:
    8. performClose(counted, 'closed', isFirstCount=true)
       a. loadSnapshotRows('opening')  ← SELECT (read only)
       b. createInventorySnapshot('closing')
          → loadInventoriableInventory()  ← SELECT
          → INSERT snapshots (N rows)     ← OPERACIÓN SEPARADA
       c. UPDATE cash_sessions SET status='closed',
          first_counted_cash=counted, ...
          WHERE status='open'            ← OPTIMISTIC LOCK solo en status
    9. return { close_result: 'closed', session, sales, inventories }
  
  if difference != 0:
    8. UPDATE cash_sessions SET
          first_counted_cash=counted,
          difference_amount=difference
          WHERE id=openSession.id AND status='open'
          ← SIN lock en first_counted_cash, STATUS PERMANECE 'OPEN'
    9. return { close_result: 'difference_detected', difference, ... }
```

### Flujo detallado `submit_recount`

```
EF submit_recount (segundo conteo):
  1. loadOpenSession()  ← SELECT sin lock
  2. Verificar first_counted_cash != null
  3. Verificar second_counted_cash >= 0
  4. loadActiveSaleCount()
  5. loadSalesSummary()  ← recalculado al momento del segundo conteo
     ← si hubo ventas entre primer y segundo conteo, el expected puede cambiar
  6. difference = round(secondCount - expected, 2)
  7. closingStatus = difference==0 ? 'closed' : 'closed_with_pending_difference'
  8. performClose(secondCount, closingStatus, isFirstCount=false)
     a. loadSnapshotRows('opening')
     b. createInventorySnapshot('closing')
        → INSERT (sin DELETE previo) ← snapshot duplicado si retry!
     c. UPDATE cash_sessions SET status=closingStatus,
        final_counted_cash=secondCount, difference_amount=difference, ...
        WHERE id=openSession.id AND status='open'
  9. return { close_result: closingStatus, session, difference, ... }
```

---

## 6. `close_cash_session_atomic` — Análisis

**Firma:** `close_cash_session_atomic(p_closed_by uuid) RETURNS jsonb`  
**Recibe:** Solo el `user_id`; no recibe `counted_cash`

### ¿Qué calcula?

| Campo | Cálculo |
|---|---|
| `sales_cash_total` | SUM(total_amount) WHERE payment_method = 'Efectivo' |
| `profit_total` | SUM(qty × (unit_price - avg_cost)) para ventas Efectivo |
| `expected_cash_total` | opening_amount + sales_cash_total |
| `closing_amount` | = expected_cash_total (sin contar físicamente) |

### ¿Qué hace bien?

- Advisory-lock implícito: `FOR UPDATE` en la sesión abierta serializa la ejecución
- DELETE de closing snapshot antes de INSERT → no genera duplicados en retry
- Todo en una sola transacción

### ¿Qué NO puede hacer?

| Capacidad requerida | RPC actual |
|---|---|
| Aceptar `counted_cash` físico | ❌ No tiene parámetro |
| Registrar `first_counted_cash` | ❌ No existe |
| Registrar `final_counted_cash` | ❌ No existe |
| Detectar diferencia | ❌ Calcula expected = opening + ventas, cierra sin comparar |
| Status `closed_with_pending_difference` | ❌ Solo soporta `closed` |
| Flujo de dos conteos | ❌ Cierra en un solo paso |
| `difference_amount` real | ❌ No calculado |

---

## 7. Gap Analysis — EF actual vs. RPCs atómicos

| Capability | EF actual | `open_atomic` | `close_atomic` actual |
|---|---|---|---|
| Doble apertura → 409 amigable | ❌ → 500 | ✅ | N/A |
| Apertura atómica con snapshot | ❌ | ✅ | N/A |
| Advisory lock apertura | ❌ | ✅ | N/A |
| FOR UPDATE en verificación | ❌ | ✅ | ✅ |
| counted_cash como parámetro | ✅ | N/A | ❌ |
| Primer conteo con lock | ❌ (last-write-wins) | N/A | N/A |
| Segundo conteo con lock | ✅ (status optim.) | N/A | N/A |
| first_counted_cash | ✅ | N/A | ❌ |
| final_counted_cash | ✅ | N/A | ❌ |
| difference_amount real | ✅ | N/A | ❌ |
| Status closed_with_pending_diff | ✅ | N/A | ❌ |
| Snapshot sin duplicados en retry | ❌ | N/A | ✅ (DELETE+INSERT) |
| Cierre + snapshot atómico | ❌ | N/A | ✅ |
| ledger entry diferencia | N/A (fin. ops) | N/A | ❌ |

**Conclusión:** `close_cash_session_atomic` NO puede sustituir la EF actual.
Necesita ser extendido con dos nuevos RPCs.

---

## 8. Arquitectura objetivo

```
CashControl.jsx
  └─ cashControlService.js
       └─ cash-operations EF (Deno) — delgado
            ├─ Auth + autorización
            ├─ Validación de payload
            ├─ open_cash_session_atomic()      RPC ← ya existe ✅
            ├─ record_first_cash_count_atomic() RPC ← nuevo
            └─ submit_cash_recount_atomic()     RPC ← nuevo
```

La EF queda como adaptador HTTP:
- Parsea body
- Valida tipos
- Llama RPC
- Mapea `{ ok, session }` → respuesta HTTP

Toda lógica transaccional vive en DB.

### Opción A — RPCs separados (RECOMENDADA)

```sql
open_cash_session_atomic(p_opening_amount, p_opened_by)     -- ya existe
record_first_cash_count_atomic(p_session_id, p_counted_cash, p_counted_by)
submit_cash_recount_atomic(p_session_id, p_second_counted_cash, p_counted_by)
```

**Ventajas:**
- Responsabilidad única por RPC
- Testeable independientemente
- Fácil rollback unitario si uno falla
- Firma clara y específica
- No rompe el RPC de apertura existente

**Desventajas:**
- 2 nuevas migraciones

### Opción B — RPC de transición de estado

```sql
transition_cash_session_atomic(
  p_action text,  -- 'open' | 'first_count' | 'second_count'
  p_opening_amount numeric default null,
  p_counted_cash numeric default null,
  p_session_id uuid default null,
  p_user_id uuid
)
```

**Ventajas:** Un solo RPC

**Desventajas:**
- Parámetros opcionales complejos
- Difícil de testear en aislamiento
- Firma ambigua
- Mayor riesgo de regresión en una función grande

**Decisión: Opción A.**

### Diseño de `record_first_cash_count_atomic`

```sql
record_first_cash_count_atomic(
  p_session_id    uuid,
  p_counted_cash  numeric(14,2),
  p_counted_by    uuid
) RETURNS jsonb
```

Comportamiento:
```sql
SECURITY DEFINER
search_path = public, pg_temp

BEGIN
  -- 1. Advisory lock compartido — serializa TODAS las transiciones de caja
  PERFORM pg_advisory_xact_lock(hashtextextended('public.cash_session_atomic', 0));

  -- 2. SELECT FOR UPDATE: bloquear ESA sesión específica (nunca "la más reciente")
  SELECT * INTO v_session FROM cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  -- 3. Validaciones
  IF NOT FOUND → { ok: false, error: 'Sesión de caja no encontrada.' }
  -- T28: sesión ya cerrada sin diferencia, mismo primer conteo → idempotente (cero escrituras)
  IF v_session.status = 'closed'
     AND v_session.first_counted_cash = p_counted_cash
     AND v_session.final_counted_cash IS NULL
    → { ok: true, close_result: 'closed', session }  -- retorna sin modificar datos ni snapshot
  -- Conflicto: sesión ya cerrada con monto diferente
  IF v_session.status = 'closed'
     AND v_session.first_counted_cash IS DISTINCT FROM p_counted_cash
    → { ok: false, error: 'Conflicto: la sesión ya fue cerrada con monto diferente.' }
  -- Sesión en otro estado != 'open' (p.ej. closed_with_pending_difference)
  IF v_session.status != 'open'
    → { ok: false, error: 'La sesión ya fue cerrada.' }
  -- Idempotencia: primer conteo ya registrado con mismo valor (diferencia != 0, sesión sigue 'open')
  IF v_session.first_counted_cash IS NOT NULL
     AND v_session.first_counted_cash = p_counted_cash
    → { ok: true, close_result: 'already_first_counted', session }
  -- Conflicto: primer conteo distinto ya registrado
  IF v_session.first_counted_cash IS NOT NULL
     AND v_session.first_counted_cash != p_counted_cash
    → { ok: false, error: 'Conflicto: ya existe primer conteo con monto diferente.' }
  IF p_counted_cash < 0 → error
  IF active_pos_operation_count() > 0 → { ok: false, error: '...ventas activas' }

  -- 4. Calcular
  v_sales_cash_total = SUM(total_amount) WHERE cash_session_id = v_session.id
                       AND payment_method = 'Efectivo'
  v_expected = v_session.opening_amount + v_sales_cash_total
  v_difference = p_counted_cash - v_expected

  -- 5. Si diferencia == 0 → cierre completo
  IF v_difference == 0 THEN
    DELETE closing snapshots (idempotente)
    INSERT closing snapshot
    UPDATE cash_sessions SET
      status = 'closed',
      first_counted_cash = p_counted_cash,
      sales_cash_total = v_sales_cash_total,
      expected_cash_total = v_expected,
      closing_amount = p_counted_cash,
      difference_amount = 0,
      closed_at = now(), closed_by = p_counted_by,
      ...
    WHERE id = v_session.id AND status = 'open'
    RETURN { ok: true, close_result: 'closed', session }

  -- 6. Si diferencia != 0 → registrar primer conteo, mantener 'open'
  ELSE
    UPDATE cash_sessions SET
      first_counted_cash = p_counted_cash,
      difference_amount = v_difference
    WHERE id = v_session.id AND status = 'open'
      AND first_counted_cash IS NULL  ← GUARD extra
    IF NOT FOUND → { ok: false, error: 'Primer conteo ya registrado (concurrencia).' }
    RETURN { ok: true, close_result: 'difference_detected', difference, expected }
  END IF;
END;
```

### Diseño de `submit_cash_recount_atomic`

```sql
submit_cash_recount_atomic(
  p_session_id           uuid,
  p_second_counted_cash  numeric(14,2),
  p_counted_by           uuid
) RETURNS jsonb
```

Comportamiento:
```sql
BEGIN
  -- 1. Advisory lock compartido
  PERFORM pg_advisory_xact_lock(hashtextextended('public.cash_session_atomic', 0));

  -- 2. SELECT FOR UPDATE: bloquear ESA sesión específica
  SELECT * INTO v_session FROM cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  -- 3. Validaciones
  IF NOT FOUND → error
  -- Idempotencia: sesión ya cerrada con mismo segundo conteo → retornar estado final
  IF v_session.status IN ('closed', 'closed_with_pending_difference')
     AND v_session.final_counted_cash = p_second_counted_cash
    → { ok: true, close_result: v_session.status, session }
  -- Conflicto: sesión ya cerrada con monto diferente → error explícito
  IF v_session.status IN ('closed', 'closed_with_pending_difference')
     AND v_session.final_counted_cash != p_second_counted_cash
    → { ok: false, error: 'Conflicto: sesión ya cerrada con monto diferente.' }
  IF v_session.status != 'open' → error
  IF v_session.first_counted_cash IS NULL → error (debe hacer primer conteo)
  IF p_second_counted_cash < 0 → error
  IF active_pos_operation_count() > 0 → error

  -- 4. Recalcular expected al momento del segundo conteo
  v_sales_cash_total = SUM(...)  -- puede haber cambiado desde primer conteo
  v_expected = opening + v_sales_cash_total
  v_difference = p_second_counted_cash - v_expected
  v_closing_status = CASE WHEN v_difference = 0 THEN 'closed'
                          ELSE 'closed_with_pending_difference' END

  -- 5. Snapshot atómico (DELETE + INSERT en misma transacción)
  DELETE FROM cash_session_inventory_snapshots
  WHERE cash_session_id = v_session.id AND snapshot_type = 'closing';

  INSERT INTO cash_session_inventory_snapshots (...) SELECT ...;

  -- 6. Cierre atómico
  UPDATE cash_sessions SET
    status = v_closing_status,
    final_counted_cash = p_second_counted_cash,
    sales_cash_total = v_sales_cash_total,
    expected_cash_total = v_expected,
    closing_amount = p_second_counted_cash,
    difference_amount = v_difference,
    closed_at = now(), closed_by = p_counted_by,
    ...
  WHERE id = v_session.id AND status = 'open'
    AND first_counted_cash IS NOT NULL  ← GUARD extra

  IF NOT FOUND → raise exception (estado cambió)

  RETURN { ok: true, close_result: v_closing_status, session, difference }
END;
```

---

## 9. Invariantes de negocio

| ID | Invariante | Enforced hoy | Enforced objetivo |
|---|---|---|---|
| INV-01 | Solo una sesión `open` | ✅ DB unique index | ✅ + advisory lock |
| INV-02 | Sesión cerrada no reabre | ✅ CHECK(status IN...) | ✅ |
| INV-03 | Segundo conteo requiere primer conteo | ✅ EF check | ✅ DB guard |
| INV-04 | Póliza diferencia: una por sesión | ✅ UNIQUE(cash_session_id) | ✅ |
| INV-05 | Apertura + snapshot inicial atómicos | ❌ EF multiop | ✅ RPC |
| INV-06 | Cierre + snapshot final atómicos | ❌ EF multiop | ✅ RPC |
| INV-07 | Ventas activas bloquean cierre | ✅ EF + DB trigger | ✅ |
| INV-08 | No doble submit de primer conteo | ❌ (last-write-wins) | ✅ DB guard WHERE NULL |
| INV-09 | No doble submit de segundo conteo | ✅ (status optimistic) | ✅ + advisory lock |
| INV-10 | Snapshot closing sin duplicados | ❌ EF no borra antes | ✅ DELETE+INSERT |
| INV-11 | `difference_amount` = counted - expected | ✅ EF | ✅ RPC |
| INV-12 | Segundo conteo: expected recalculado | ✅ EF | ✅ RPC |
| INV-13 | Apertura prohibida con ventas activas | ✅ RPC open_atomic | ✅ |
| INV-14 | Resolución diferencia: ledger activo req. | ✅ RPC resolve | ✅ |
| INV-15 | Resolución diferencia: montivo obligatorio | ✅ RPC resolve | ✅ |

---

## 10. Concurrencia — Análisis completo

### Apertura simultánea (dos terminales)

| Paso | Terminal A | Terminal B | Protección actual | Protección objetivo |
|---|---|---|---|---|
| loadOpenSession | null | null | Ninguna | N/A (advisory lock) |
| INSERT cash_sessions | OK → session_A | unique violation → **500** | DB unique index | advisory lock → B espera → `{ ok: false }` amigable |
| createSnapshot | OK | (fallido) | N/A | N/A (todo en RPC A) |

**Actual:** DB consistente, UX rota (500).  
**Objetivo:** DB consistente, UX correcta (409 con mensaje).

### Primer conteo simultáneo (dos managers)

| Paso | Manager A | Manager B | Protección actual | Protección objetivo |
|---|---|---|---|---|
| loadOpenSession | first_counted=null | first_counted=null | Ninguna | advisory lock → B espera |
| UPDATE first_counted | → A_amount | → **B_amount (overwrite)** | Ninguna | DB guard `WHERE first_counted IS NULL` → B recibe `{ ok: false }` |

**Actual:** last-write-wins, ambos reciben 200, primer conteo tiene valor inesperado.  
**Objetivo:** solo A gana, B recibe error amigable.

### Segundo conteo simultáneo (retry o dos terminales)

| Paso | Terminal A | Terminal B | Protección actual |
|---|---|---|---|
| UPDATE status='closed' WHERE status='open' | OK | 0 rows → throw | ✅ optimistic lock |

**Actual:** suficientemente protegido por optimistic lock en status.  
**Objetivo:** advisory lock agrega protección adicional + mensajes más claros.

### Snapshot en retry de cierre

| Paso | Intento 1 | Intento 2 | Actual | Objetivo |
|---|---|---|---|---|
| createInventorySnapshot | INSERT (N rows) | INSERT OTRA VEZ → 2N rows | ❌ duplicados | DELETE + INSERT en misma TX |

**Actual:** snapshots duplicados si hay retry antes de commitear el status change.  
**Objetivo:** DELETE idempotente antes de INSERT en misma transacción.

---

## 11. Idempotencia

### Operaciones actuales sin idempotency_key

| Operación | ¿Tiene idem key? | Protección alternativa | Riesgo |
|---|---|---|---|
| open_cash_session | ❌ | DB unique index | Bajo (UI no retry agresivo) |
| close_cash_session (primer conteo) | ❌ | Optimistic lock en status | Medio (last-write-wins en first_counted) |
| submit_recount | ❌ | Optimistic lock en status | Bajo |

### Diseño recomendado de idempotencia

Para los nuevos RPCs, NO se recomienda idempotency_key del tipo tabla `idempotency_requests` (como en `finalize_pos_sale`). Razón: las operaciones de caja son inherentemente de "una sola instancia activa" — el advisory lock + los guards en DB ya garantizan que un segundo intento con los MISMOS parámetros resulta en `{ ok: false }` amigable o retorna el estado actual.

**Alternativa recomendada:** que el RPC retorne el estado actual de la sesión si ya está en el estado que el cliente intentaba alcanzar:

```sql
-- record_first_cash_count_atomic:
IF v_session.first_counted_cash IS NOT NULL
   AND v_session.first_counted_cash = p_counted_cash THEN
  -- retry con mismo valor → retornar estado actual (idempotente)
  RETURN { ok: true, close_result: 'already_counted', session: v_session }
ELSIF v_session.first_counted_cash IS NOT NULL
   AND v_session.first_counted_cash != p_counted_cash THEN
  -- segundo intento con valor diferente → error
  RETURN { ok: false, error: 'Ya existe primer conteo con valor distinto.' }
```

Esto es equivalente funcional a idempotencia sin necesitar tabla de requests.

---

## 12. Ledger — Interacción con diferencias de caja

### Flujo de póliza de diferencia

```
close_cash_session → status = 'closed_with_pending_difference'
                         │
                         │ (usuario navega a FinancesHome)
                         ▼
             resolve_cash_discrepancy(
               cash_session_id,
               resolution_type = 'shortage' | 'surplus' | 'omitted_event',
               amount,
               motive,
               performed_by,
               idempotency_key
             )
                         │
               ┌─────────┴──────────────┐
           shortage/omitted            surplus
               │                         │
         Débito 5101                Débito 1101
         Crédito 1101               Crédito 4102
               │                         │
         INSERT cash_discrepancy_resolutions (UNIQUE)
         INSERT journal_entry (confirmed)
```

### ¿Es atómico cierre + póliza?

**NO, intencionalmente.** El diseño separa:
- `close_cash_session` → registra la diferencia contada
- `resolve_cash_discrepancy` → contabiliza la diferencia (requiere decisión del usuario)

Entre los dos pasos, el saldo contable del ledger NO incluye la diferencia. Esto es correcto: la diferencia solo existe contablemente cuando el usuario decide si es faltante, sobrante o evento omitido.

### ¿Hay riesgo de doble póliza?

**No.** `cash_discrepancy_resolutions` tiene `UNIQUE ON (cash_session_id)`. Un segundo intento de `resolve_cash_discrepancy` falla con:  
`"Esta sesión ya tiene una resolución registrada."`

Y la idempotency_key del RPC (`scope='discrepancy'`) protege el retry de red.

### ¿Qué pasa si falla la póliza después del cierre?

- Sesión queda `closed_with_pending_difference`
- Ledger no tiene la entrada de diferencia
- El usuario puede reintentar `resolve_cash_discrepancy` (idempotente por key + unique)
- No hay inconsistencia de datos: el saldo contable aún no refleja la diferencia

**Riesgo:** Si el usuario nunca resuelve la diferencia, el módulo de finanzas mostrará la sesión como pendiente indefinidamente. No hay degradación de datos, solo de UX.

### Nuevos RPCs y ledger

Los RPCs `record_first_cash_count_atomic` y `submit_cash_recount_atomic` NO deben generar pólizas de diferencia internamente. La póliza es un paso separado con decisión de usuario. Los RPCs solo registran el estado de conteo en `cash_sessions`.

---

## 13. Reportes — Impacto

### Campos críticos en `FinancesCashSessions.jsx`

| Campo | Source | Compatibilidad |
|---|---|---|
| `first_counted_cash` | `cash_sessions.first_counted_cash` | ✅ Los nuevos RPCs lo escriben |
| `final_counted_cash` | `cash_sessions.final_counted_cash` | ✅ `submit_cash_recount_atomic` lo escribe |
| `difference_amount` | `cash_sessions.difference_amount` | ✅ Calculado en ambos RPCs |
| `sales_cash_total` | `cash_sessions.sales_cash_total` | ✅ Calculado en ambos RPCs |
| `expected_cash_total` | `cash_sessions.expected_cash_total` | ✅ Calculado en ambos RPCs |
| `closing_amount` | `cash_sessions.closing_amount` | ✅ = counted_cash en nuevo diseño |
| `report_pdf_metadata` | `cash_sessions.report_pdf_metadata` | ✅ SET en ambos RPCs |

### Fallback ya implementado en EF

En `serializeSession`:
```js
first_counted_cash:  session.first_counted_cash != null ? toNumber(...) : null,
final_counted_cash:  session.final_counted_cash  != null ? toNumber(...) : null,
difference_amount:   session.difference_amount   != null ? toNumber(...) : null,
```

Los nuevos RPCs deben respetar estos valores null para el estado `open` sin primer conteo.

### PDF de cierre

`getSuggestedFileName` en la EF usa `opened_at` + `id` → no depende de la lógica de cierre.  
`report_pdf_metadata` es generado en el RPC al momento del cierre → compatible.

**Impacto en reportes: ninguno** si los nuevos RPCs escriben los mismos campos.

---

## 14. Estrategia de migración

### Etapa 1 — Nuevos RPCs sin cambiar consumidor (DEV)

- Crear migración `record_first_cash_count_atomic`
- Crear migración `submit_cash_recount_atomic`
- Aplicar a DEV
- Verificar firma, permisos, comportamiento en aislamiento

**Sin cambios a la EF.** Sin cambios a PRD.

### Etapa 2 — Tests DEV completos

- Ejecutar matriz de 22 casos de prueba en DEV
- Verificar invariantes
- Verificar que los RPCs devuelven los mismos campos que la EF actual
- Verificar que `first_counted_cash`, `final_counted_cash`, `difference_amount` son correctos

### Etapa 3 — Cambiar `cash-operations` para usar RPCs (DEV)

- Modificar EF en local
- Deploy de EF a DEV solamente
- Smoke tests en DEV

### Etapa 4 — Smoke tests DEV E2E

- Ciclo completo: apertura → ventas → cierre sin diferencia
- Ciclo completo: apertura → ventas → cierre con diferencia → segundo conteo → resolución
- Verificar PDF generado correctamente

### Etapa 5 — Deploy PRD en ventana controlada

Condiciones:
- No hay sesión abierta en PRD (o se coordinó con el equipo para ventana de cierre)
- Migrations aplicadas a PRD PRIMERO (`db push`)
- EF desplegada DESPUÉS de migrations confirmadas
- Primer uso monitoreado

### Etapa 6 — Monitoreo post-deploy

- Verificar logs de EF: sin errores 500
- Verificar `cash_sessions`: todos los campos correctamente escritos
- Verificar snapshots: exactamente 1 opening + 1 closing por sesión
- Verificar ledger: sin pólizas desbalanceadas

### Rollback por etapa

| Etapa | Rollback |
|---|---|
| 1 (nuevas migrations DEV) | DROP FUNCTION en DEV, no impacta PRD |
| 2 (tests DEV) | N/A (solo tests) |
| 3 (EF DEV) | Redeployar EF anterior en DEV |
| 4 (smoke DEV) | N/A |
| 5 (PRD) | Redeployar EF anterior en PRD (migrations no requieren rollback — CREATE OR REPLACE es idempotente; nuevo flujo no activo hasta deploy EF) |
| 6 (monitoreo) | Si anomalía: redeployar EF anterior inmediatamente |

---

## 15. Plan de pruebas DEV

### Apertura

| ID | Caso | Verificar |
|---|---|---|
| T01 | Apertura normal ($500) | Sesión status='open', snapshot opening con inventario actual |
| T02 | Doble click simultáneo | Solo 1 sesión creada, 409 amigable en el segundo |
| T03 | Dos dispositivos simultáneos | Solo 1 sesión, segundo recibe error descriptivo (no 500) |
| T04 | Apertura con sesión existente | 409 "Ya existe caja abierta" |
| T05 | Apertura con ventas activas | Error "mesas activas" |
| T06 | Apertura: fallo simulado en snapshot | Sesión no queda creada (rollback atómico) |

### Cierre — Primer conteo

| ID | Caso | Verificar |
|---|---|---|
| T07 | Cierre sin diferencia (primer conteo = expected) | status='closed', first_counted_cash set, closing_snapshot creado |
| T08 | Cierre con sobrante | status='open' con first_counted_cash, difference_amount > 0 |
| T09 | Cierre con faltante | status='open' con first_counted_cash, difference_amount < 0 |
| T10 | Cierre con ventas activas | 409 con active_sales_count |
| T11 | Doble click en primer conteo | Solo un write; segundo recibe "ya existe primer conteo" |
| T12 | Dos managers primer conteo simultáneo | Solo uno gana; otro recibe error descriptivo |
| T28 | Retry de primer conteo (mismo `counted_cash`) después de cierre sin diferencia | Respuesta idempotente: `{ ok: true, close_result: 'closed' }` — cero escrituras adicionales, snapshot intacto |

### Segundo conteo

| ID | Caso | Verificar |
|---|---|---|
| T13 | Segundo conteo = 0 diferencia | status='closed', final_counted_cash set, difference_amount=0 |
| T14 | Segundo conteo con diferencia remanente | status='closed_with_pending_difference' |
| T15 | Doble submit_recount simultáneo | Solo uno cierra; otro recibe error |
| T16 | submit_recount sin primer conteo previo | 409 descriptivo |
| T17 | submit_recount con caja ya cerrada | 409 "no existe caja abierta" |
| T18 | Retry por timeout (mismo second_counted_cash) | Idempotente → mismo resultado |

### Ledger

| ID | Caso | Verificar |
|---|---|---|
| T19 | Resolver sobrante (surplus) | Póliza: Débito 1101 / Crédito 4102, Debe = Haber |
| T20 | Resolver faltante (shortage) | Póliza: Débito 5101 / Crédito 1101, Debe = Haber |
| T21 | Sesión con diferencia=0 | No genera póliza de diferencia |
| T22 | Doble resolve_cash_discrepancy | Segunda llamada: "sesión ya tiene resolución" |

### Congelamiento operativo

| ID | Caso | Verificar |
|---|---|---|
| T27 | Venta después de primer conteo con diferencia | Rechazada: `La caja está en proceso de cierre. No se pueden registrar nuevas ventas.` |

### Reportes

| ID | Caso | Verificar |
|---|---|---|
| T23 | Sesión visible en FinancesCashSessions | Todos los campos correctos |
| T24 | first_counted_cash visible | Correcto cuando aplica, null cuando no |
| T25 | PDF corte de caja | suggested_file_name correcto, contenido completo |
| T26 | difference_amount visible | Correcto para sobrante, faltante y cero |

---

## 16. Rollback completo

**Prioridad máxima:** La EF anterior puede ser redeployada en < 5 minutos.

Los nuevos RPCs son `CREATE OR REPLACE`. El código anterior de la EF no usa los nuevos RPCs → el rollback de la EF restaura el comportamiento anterior completamente.

Las migrations de los nuevos RPCs NO modifican tablas ni datos → no requieren rollback de datos.

**Señal de rollback:** cualquier sesión con status incorrecto, snapshot count != 2 (opening + closing), o error 500 en cash-operations después del deploy.

---

## 17. Clasificación de riesgos

### P0 — Ninguno activo en PRD

### P1 — Latentes, bajo probabilidad

| ID | Hallazgo | Escenario |
|---|---|---|
| P1-03 | Primer conteo sin lock → last-write-wins | Dos managers cierran caja simultáneamente; unlikely en POS de restaurante |
| P1-04 | Snapshot duplicado en retry de cierre | Red drop + retry antes de que el status cambie; snapshot count = 2N |

### P2 — Latentes, UX rota

| ID | Hallazgo | Impacto |
|---|---|---|
| P2-05 | Doble apertura → 500 en vez de 409 | Usuario confundido; datos consistentes |
| P2-06 | Apertura no atómica con snapshot | CERRADO (Sprint 2B): `cash-operations` delega a `open_cash_session_atomic` → apertura + snapshot atómicos |

### P3 — Deuda técnica

| ID | Hallazgo |
|---|---|
| P3-04 | `close_cash_session_atomic` existente no alineado con flujo de dos conteos |
| P3-05 | EF tiene lógica de negocio compleja (5+ queries por operación) |
| P3-06 | Sin idempotency_key en operaciones de caja |

---

## 18. Recomendación final

**PRD puede continuar operando sin cambios urgentes.**

Los hallazgos P1-03 y P1-04 requieren condiciones de concurrencia muy específicas que son extremadamente poco probables en operación normal de un restaurante (single-shift, un cajero activo).

**Orden de implementación recomendado para Sprint 2B (4 migraciones):**

1. **Migración 1:** Actualizar `open_cash_session_atomic` — cambiar clave advisory lock a `'public.cash_session_atomic'`  
   → Unifica serialización con los nuevos RPCs

2. **Migración 2:** `block_sales_during_cash_close` — modificar trigger `require_open_cash_session_for_pos_operation` + guard en `finalize_pos_sale`  
   → Cierra gap P1-NEW: ventas posibles después del primer conteo

3. **Migración 3:** `record_first_cash_count_atomic(p_session_id, p_counted_cash, p_counted_by)` con advisory lock compartido, guard idempotente  
   → Cierra P1-03 (last-write-wins) y P2-06 (snapshot atómico)

4. **Migración 4:** `submit_cash_recount_atomic(p_session_id, p_second_counted_cash, p_counted_by)` con advisory lock compartido, DELETE+INSERT snapshot, idempotencia por estado  
   → Cierra P1-04 (snapshot duplicado)

5. **Modificación EF:** `cash-operations` usa los 3 RPCs (open ya existe) + pasa `session_id` explícito  
   → Cierra P2-05 (500 en doble apertura)

6. **Validar en DEV:** Matriz T01-T27  
   **Deploy en PRD:** Ventana de cierre (no sesión abierta)

---

## 19. Alcance Sprint 2B sugerido

### Archivos a crear/modificar

| Archivo | Tipo | Cambio |
|---|---|---|
| `supabase/migrations/20260902200000_update_open_cash_session_atomic_lock.sql` | NUEVO | Cambiar clave advisory lock a `'public.cash_session_atomic'` |
| `supabase/migrations/20260902210000_block_sales_during_cash_close.sql` | NUEVO | Trigger + finalize_pos_sale guard en `first_counted_cash IS NULL` |
| `supabase/migrations/20260902220000_record_first_cash_count_atomic.sql` | NUEVO | RPC primer conteo con `p_session_id` |
| `supabase/migrations/20260902230000_submit_cash_recount_atomic.sql` | NUEVO | RPC segundo conteo con `p_session_id` |
| `supabase/functions/cash-operations/index.ts` | MODIFICADO | Usar RPCs, pasar `session_id` explícito |

### Archivos sin cambio en Sprint 2B

- `CashControl.jsx` — sin cambios (contrato EF permanece igual)
- `cashControlService.js` — sin cambios
- `close_cash_session_atomic` — no se usa, se documenta el drift

### Entregables Sprint 2B

1. Cuatro nuevas migraciones con diseño de Sprint 2A + 2A.1
2. EF modificada para usar RPCs con `session_id` explícito
3. Tests T01-T27 ejecutados en DEV
4. Deploy en PRD con monitoreo

---

---

## 20. Sprint 2A.1 — Hardening previo a implementación

**Fecha:** 2026-09-02 (misma sesión que Sprint 2A)  
**Tipo:** Cierre de decisiones de diseño — SIN cambios funcionales

---

### 20.1 Session ID obligatorio

**Decisión:** Ambos nuevos RPCs reciben `p_session_id uuid` como primer parámetro.

**Problema que resuelve:**  
Sin `p_session_id`, los RPCs seleccionarían "la sesión open más reciente". Un retry
de una solicitud antigua podría llegar después de que la sesión original fue cerrada
y una nueva fue abierta — afectando la sesión nueva en vez de la original.

```
Timeline problemático (sin p_session_id):
  t0: Sesión A abierta
  t1: Manager ejecuta primer conteo para Sesión A
  t2: Red corta — respuesta perdida. Sesión A queda con first_counted_cash set.
  t3: Manager resuelve manualmente: cierra Sesión A, abre Sesión B
  t4: Retry automático del cliente llega a `record_first_cash_count_atomic`
      → Sin session_id: SELECT WHERE status='open' → encuentra Sesión B
      → Registra first_counted_cash en Sesión B ← CORRUPTO

Timeline correcto (con p_session_id):
  t4: Retry llega con p_session_id = Sesión A
      → WHERE id = Sesión_A → encontrada, status = 'closed'
      → { ok: false, error: 'La sesión ya fue cerrada.' }
      → Sesión B intacta ✅
```

**Garantías del diseño con `p_session_id`:**

| Escenario | Comportamiento |
|---|---|
| `p_session_id` no existe en DB | `{ ok: false, error: 'Sesión no encontrada.' }` |
| `p_session_id` existe, status ≠ 'open' | Error descriptivo (ya cerrada) |
| `p_session_id` correcto, primer conteo idéntico ya registrado | `{ ok: true, close_result: 'already_first_counted', session }` — idempotente |
| `p_session_id` correcto, primer conteo diferente ya registrado | `{ ok: false, error: 'Conflicto: ya existe primer conteo con monto diferente.' }` |
| `p_session_id` de sesión diferente a la actual | Error (no es 'open' o no existe) — NUNCA toca sesión actual |

**¿Cómo obtiene la EF el `session_id`?**

La EF llama `loadOpenSession()` (SELECT, sin lock) para obtener el ID de la sesión actual.
Lo pasa al RPC. El RPC hace el `WHERE id = p_session_id FOR UPDATE` — el lock real vive en el RPC.

La ventana entre SELECT (EF) y FOR UPDATE (RPC) es inofensiva: si la sesión cambió entre los
dos, el RPC detecta el estado inesperado y retorna error amigable. Nunca toca otra sesión.

---

### 20.2 Advisory lock compartido — análisis y decisión

**Estado actual de `open_cash_session_atomic`:**

```sql
-- Línea 26 de 20260804010500_open_cash_session_atomic.sql:
perform pg_advisory_xact_lock(hashtextextended('public.open_cash_session_atomic', 0));
```

Clave actual: `'public.open_cash_session_atomic'`  
Clave propuesta para nuevos RPCs: `'public.cash_session_atomic'`

**Estas son CLAVES DIFERENTES.** `pg_advisory_xact_lock` serializa solo dentro del mismo
espacio de clave. Si `open` usa una clave y los nuevos RPCs usan otra, los tres NO se
serializan entre sí.

**Análisis de riesgo sin clave compartida:**

```
¿Puede `open` + `record_first_count` ejecutarse en paralelo?
  - open: advisory_lock('open_cash_session_atomic') → SELECT WHERE status='open' FOR UPDATE
  - record_first_count: advisory_lock('cash_session_atomic') → SELECT WHERE id=X FOR UPDATE

  Ambos locks tienen CLAVES DISTINTAS → se ejecutan en paralelo.
  open: busca WHERE status='open' → null (sesión cerrada) → INSERT nueva sesión
  record_first_count: busca WHERE id=X → sesión X (cerrada) → { ok: false, ya cerrada }
  → No hay race. Correctos por separado.
```

```
¿Puede `open` + `open` ejecutarse en paralelo?
  Ambos usan 'public.open_cash_session_atomic' → SERIALIZADO.
  Segundo open espera al primero. ✅
```

```
¿Puede `record_first_count` + `submit_recount` del mismo session_id ejecutarse en paralelo?
  Con clave compartida 'public.cash_session_atomic': SERIALIZADO.
  Sin clave compartida: cada uno tiene su propia clave → en paralelo.
  Pero: FOR UPDATE en mismo row los serializa a nivel de fila de todas formas.
  → El advisory lock compartido es redundante para este caso, pero preferible por claridad.
```

**Decisión:** Cambiar `open_cash_session_atomic` a usar `'public.cash_session_atomic'`.

**Justificación:** Aunque el riesgo de race entre `open` y los nuevos RPCs es bajo gracias
al `FOR UPDATE` por `id`, el advisory lock compartido provee una barrera global explícita:
**en todo momento, solo una operación crítica de caja puede ejecutarse**. Esto es coherente,
fácil de razonar, y consistente con la intención del diseño atómico.

**Tradeoff:** Throughput ligeramente reducido. Irrelevante en POS de restaurante (una operación
de caja activa a la vez por diseño de negocio).

**Migración requerida:**

```sql
-- 20260902200000_update_open_cash_session_atomic_lock.sql
-- Reemplaza la línea 26 con la nueva clave compartida.
-- CREATE OR REPLACE — idempotente, safe en DEV y PRD.
```

---

### 20.3 Congelamiento operativo después del primer conteo

**Pregunta:** ¿Puede ejecutarse `finalize_pos_sale` después de que `first_counted_cash` es set?

**Respuesta: SÍ, actualmente.**

**Evidencia en código:**

`require_open_cash_session_for_pos_operation()` (trigger en `table_orders` + `tables`):
```sql
-- Verificación actual (línea 45-46, 20260803183000_enforce_cash_session_pos_invariant.sql):
where cash_session.status = 'open'
-- ← Solo verifica status. NO verifica first_counted_cash.
```

`finalize_pos_sale` (migración `20260715221000_harden_finalize_pos_sale.sql`):
```sql
-- Verificación actual (líneas 370-386):
select count(*) into v_cash_session_count from public.cash_sessions where status = 'open';
if v_cash_session_count > 1 then raise exception 'Se encontro mas de una caja abierta.'; end if;
select id into v_cash_session_id from public.cash_sessions where status = 'open' for update;
if v_cash_session_id is null then raise exception 'No hay una caja abierta...'; end if;
-- ← Solo verifica status. NO verifica first_counted_cash.
```

**Escenario problemático actual:**

```
t0: Sesión abierta, ventas normales
t1: Manager ejecuta primer conteo → diferencia detectada
    cash_sessions.first_counted_cash = 500
    cash_sessions.status = 'open'  ← SIN CAMBIO
t2: Mesero finaliza una venta (Efectivo $200) → PERMITIDO HOY
    cash_sessions.status = 'open' → trigger y finalize_pos_sale no bloquean
t3: Manager hace segundo conteo
    expected recalculated = opening + ventas_incluyendo_t2
    difference ≠ difference detectada en t1
    ← Estado inconsistente: el PDF mostrará diferencia distinta a la comunicada al manager
```

**Consecuencia:** La diferencia vista por el manager en t1 (que guía la decisión de resolución
shortage/surplus/omitted_event) NO corresponde a la diferencia final registrada en DB.

**Política recomendada:** `first_counted_cash IS NOT NULL` → caja en proceso de cierre →
nuevas ventas bloqueadas.

**Guard recomendado: DB layer (doble protección)**

**Capa 1 — Trigger `require_open_cash_session_for_pos_operation`:**

```sql
-- Cambio en la función del trigger:
-- ANTES:
select cash_session.id
  into v_cash_session_id
from public.cash_sessions cash_session
where cash_session.status = 'open'
  for update;

if v_cash_session_id is null then
  raise exception 'No hay una caja abierta...'
end if;

-- DESPUÉS (distingue dos errores distintos):
select cash_session.*
  into v_cash_session
from public.cash_sessions cash_session
where cash_session.status = 'open'
  for update;

if not found then
  raise exception 'No hay una caja abierta. Debes abrir caja antes de abrir mesas, barras o modificar pedidos.'
    using errcode = 'P0001';
end if;

if v_cash_session.first_counted_cash is not null then
  raise exception 'La caja está en proceso de cierre. No se pueden registrar nuevas ventas.'
    using errcode = 'P0001';
end if;
```

**Cobertura:** Bloquea `save_table_order`, `finalize_pos_sale`, cualquier INSERT/UPDATE en
`table_orders`, y cambios en `tables` (status=ocupada / current_order_id). Cubre TODOS los
caminos posibles con una sola modificación.

**Capa 2 — `finalize_pos_sale` RPC:**

```sql
-- Agregar después del check de v_cash_session_id IS NULL:
if exists (
  select 1 from public.cash_sessions
  where status = 'open' and first_counted_cash is not null
) then
  raise exception 'La caja está en proceso de cierre. No se pueden registrar nuevas ventas.'
    using errcode = 'P0001';
end if;
```

Esta segunda capa es redundante si el trigger ya bloquea, pero da un mensaje de error
más claro a nivel de RPC antes de que el trigger llegue a dispararse.

**¿El trigger bloquea `finalize_pos_sale`?**

Sí. `finalize_pos_sale` hace UPDATE en `table_orders` (limpia `current_order_id`). El trigger
`table_orders_require_open_cash_session` se dispara BEFORE UPDATE en `table_orders`. Si
`first_counted_cash IS NOT NULL` → raise exception → toda la transacción de `finalize_pos_sale`
hace rollback (incluido el INSERT de venta). DB queda consistente.

**¿Hay falsos positivos?**

Solo si `first_counted_cash` se establece sin que realmente el manager haya iniciado el cierre.
Con los nuevos RPCs, `first_counted_cash` solo se establece en `record_first_cash_count_atomic`,
que requiere autenticación y permisos de manager. No hay falsos positivos esperados.

**Migración requerida:**

```sql
-- 20260902210000_block_sales_during_cash_close.sql
-- 1. CREATE OR REPLACE require_open_cash_session_for_pos_operation()
--    → agrega check en first_counted_cash IS NOT NULL
-- 2. CREATE OR REPLACE finalize_pos_sale(...)
--    → agrega check secundario
```

**Impacto en tests existentes:**

- T07 (cierre sin diferencia): `record_first_cash_count_atomic` → diferencia=0 → cierra directo,
  `first_counted_cash` solo existe brevemente antes del close → no hay ventana para bloquear ventas
- T08/T09 (cierre con diferencia): `first_counted_cash` set, status='open' → ventas BLOQUEADAS
- T27 (nuevo): verificar el bloqueo explícitamente

---

### 20.4 Idempotencia final — decisión

**Pregunta:** Con `p_session_id` + guards DB + advisory lock, ¿es necesaria la tabla `idempotency_requests`?

**Respuesta: NO.**

**Comparativa:**

| Mecanismo | finalize_pos_sale | record_first_cash_count_atomic |
|---|---|---|
| Tabla `idempotency_requests` | ✅ Sí (por idempotency_key UUID) | ❌ No necesaria |
| Advisory lock | ❌ No | ✅ Por `'public.cash_session_atomic'` |
| `p_session_id` + FOR UPDATE | ❌ No (usa table_id + order_id) | ✅ Sí |
| Guard en estado actual | Parcial (via RPC return) | ✅ Completo |

**¿Por qué `finalize_pos_sale` sí necesita la tabla y los RPCs de caja no?**

`finalize_pos_sale` puede ejecutarse múltiples veces para la MISMA orden (retries de red), y
la orden finalizada queda invisible al cliente (tabla limpia). Sin la tabla, no hay forma de
detectar "ya procesé esta solicitud". El UUID de idempotencia es el único identificador estable.

Para las operaciones de caja:
- La sesión es ÚNICA y VISIBLE en DB (el cliente tiene su ID)
- El estado actual de `first_counted_cash` / `final_counted_cash` / `status` es la fuente de
  verdad del replay
- Un retry con mismo `p_session_id` + mismo monto → `already_first_counted` o estado actual → idempotente
- Un retry con mismo `p_session_id` + monto diferente → `Conflicto` (correcto: algo cambió)
- Un retry con `p_session_id` de sesión cerrada → error descriptivo → no toca sesión nueva

**Conclusión:** La idempotencia basada en `(session_id, estado actual)` es suficiente y más
simple que una tabla de requests. Sin overhead de escritura extra.

---

### 20.5 Nuevo caso de prueba T27

| ID | Caso | Precondición | Acción | Resultado esperado |
|---|---|---|---|---|
| T27 | Venta después de primer conteo con diferencia | Sesión abierta, venta previa, primer conteo ejecutado con diferencia ≠ 0 | Intentar crear o finalizar venta | `{ error: 'La caja está en proceso de cierre. No se pueden registrar nuevas ventas.' }` HTTP 422 |

**Caminos a probar en T27:**
- `save_table_order` con mesa nueva → bloqueado por trigger
- `finalize_pos_sale` de pedido preexistente → bloqueado por trigger + RPC guard
- Apertura de nueva mesa (status='ocupada') → bloqueado por trigger en `tables`

---

### 20.6 Alcance definitivo Sprint 2B

**4 migraciones, en orden:**

| # | Archivo | Función |
|---|---|---|
| 1 | `20260902200000_update_open_cash_session_atomic_lock.sql` | Unifica advisory lock con clave `'public.cash_session_atomic'` |
| 2 | `20260902210000_block_sales_during_cash_close.sql` | Bloquea ventas cuando `first_counted_cash IS NOT NULL` (trigger + RPC) |
| 3 | `20260902220000_record_first_cash_count_atomic.sql` | Nuevo RPC primer conteo con `p_session_id` |
| 4 | `20260902230000_submit_cash_recount_atomic.sql` | Nuevo RPC segundo conteo con `p_session_id` |

**1 modificación de EF:**

| Archivo | Cambio |
|---|---|
| `supabase/functions/cash-operations/index.ts` | Delegar lógica transaccional a RPCs; pasar `session_id` explícito |

**Sin cambios en frontend** (`CashControl.jsx`, `cashControlService.js`).

**Precondición de deploy PRD:**  
Caja cerrada (status ≠ 'open'). Migrations primero, EF después.

**Señal de rollback:**  
Error 500 en cash-operations, sesión con estado inesperado, snapshot count ≠ 2.

---

*Generado: 2026-09-02 | Sprint 2A.1 | Branch: chore/code-cleanup | Sin cambios a PRD*
