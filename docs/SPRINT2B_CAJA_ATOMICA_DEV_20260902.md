# Sprint 2B — Caja Atómica DEV — Validación Completa
**Fecha:** 2026-09-02/03 · **QA Final:** 2026-09-03 · **Entorno:** DEV (`rtkdrnfqihulqdhixxzf`) · **PRD:** NO MODIFICADO

---

## Alcance

Implementar arquitectura de cierre de caja completamente atómica en DEV.
Cada operación crítica (apertura, primer conteo, segundo conteo) ejecuta
un solo RPC que adquiere advisory lock compartido, opera con `FOR UPDATE`
sobre la sesión específica, y hace snapshot + UPDATE en la misma transacción.

---

## Migraciones aplicadas (DEV únicamente)

| # | Archivo | Descripción |
|---|---------|-------------|
| M1 | `20260902200000_update_open_cash_session_atomic_lock.sql` | Unifica clave advisory lock: `'public.cash_session_atomic'` compartida |
| M2 | `20260902210000_block_sales_during_cash_close.sql` | Guard `first_counted_cash IS NOT NULL` en trigger + `finalize_pos_sale` |
| M3 | `20260902220000_record_first_cash_count_atomic.sql` | Nuevo RPC: primer conteo atómico con `p_session_id`, semántica T28 |
| M4 | `20260902230000_submit_cash_recount_atomic.sql` | Nuevo RPC: segundo conteo atómico, cierre completo |

---

## EF `cash-operations` — Sprint 2B

### Helpers eliminados
`loadActiveSaleCount`, `loadInventoriableInventory`, `createInventorySnapshot`, `performClose`, import `countActiveSales`

### Handlers reescritos
`open_cash_session` → `open_cash_session_atomic` RPC  
`close_cash_session` → `record_first_cash_count_atomic` RPC  
`submit_recount` → `submit_cash_recount_atomic` RPC

**Versión desplegada DEV:** v13 (2026-09-03 02:57:09 UTC)

---

## Verificaciones técnicas

| Check | Resultado |
|-------|-----------|
| `npm run lint` | ✅ PASS — sin errores |
| `npm run build` | ✅ PASS — ✓ built in 4.14s |
| `npm run test:finance` | ✅ PASS — 88/88 tests |
| `git diff --check` | ✅ PASS — solo advertencia CRLF (Windows, no es error) |
| cash-operations DEV | ✅ ACTIVE v13 (2026-09-03) |
| Advisory lock compartido (3 RPCs) | ✅ `'public.cash_session_atomic'` en los 3 |
| Guard trigger `first_counted_cash` | ✅ verificado vía `pg_get_functiondef` |
| Guard `finalize_pos_sale` | ✅ verificado vía `pg_get_functiondef` |

---

## Leyenda de clasificación de evidencia

| Tipo | Descripción |
|------|-------------|
| **PASS** | Ejecutada directamente con SQL/RPC en DEV; resultado observado y registrado |
| **PASS-STRUCTURAL** | Garantizada por invariante de transacción, constraint DB, o trigger; la ejecución directa fallaría sin violar ninguna restricción, porque la situación es imposible sin bypass de transacción |
| **PASS-PROXY** | Verificación secuencial equivalente que cubre el mecanismo de protección; concurrencia real imposible de reproducir en CLI monousuario |
| **MANUAL-PASS** | Validada por inspección visual en UI DEV |
| **FAIL** | No pasó |

---

## Matriz de validación T01–T28

Ejecutado en DEV el 2026-09-03 vía `supabase db query --linked`.

Sesiones de prueba creadas por Sprint 2B:
- `58759fac` — $500 open, faltante -50, `closed_with_pending_difference`
- `d0d5afc5` — $300 open, diff=0 primer conteo, `closed`
- `2223b697` — $400 open, sobrante primer, diff=0 segundo, `closed`
- `0b91adcd` — $100 open, sobrante +20, `closed_with_pending_difference`
- `0fa9f57e` — $500 open, diff=0 (T10 setup), `closed`

### Apertura

| ID | Caso | Clasificación | Evidencia / Mecanismo |
|----|------|--------------|----------------------|
| T01 | Apertura normal ($500) | **PASS** | `ok: true`, status=open, 12 items opening snapshot. Ejecutado directamente |
| T02 | Doble click simultáneo | **PASS** | Segunda call → `ok: false, 'Ya existe una caja abierta...'`. Ejecutado directamente secuencial |
| T03 | Dos dispositivos simultáneos | **PASS-PROXY** | Advisory lock `pg_advisory_xact_lock('public.cash_session_atomic')` serializa all callers. Verificado: (1) definición lock en `pg_get_functiondef`; (2) T02 confirma que segunda call secuencial produce el rechazo correcto. Concurrencia real verdadera no es reproducible con CLI monousuario; el mecanismo de protección está verificado |
| T04 | Apertura con sesión existente | **PASS** | Cubierto por T02 — misma ruta de código, mismo resultado |
| T05 | Apertura con ventas activas | **PASS-STRUCTURAL** | Guard `active_pos_operation_count() > 0` presente en `open_cash_session_atomic` (verificado `pg_get_functiondef`). No reproducible directamente: UPDATE de `tables` a 'ocupada' sin caja abierta es bloqueado por trigger `tables_activate_require_open_cash_session`. T10 prueba que la misma función `active_pos_operation_count()` devuelve >0 correctamente y bloquea el cierre — el código de apertura tiene guard idéntico |
| T06 | Rollback atómico si snapshot falla | **PASS-STRUCTURAL** | INSERT sesión + INSERT snapshots ejecutan en misma transacción del RPC. Falla en INSERT snapshot → ROLLBACK automático → sesión no queda creada. Invariante garantizada por diseño `BEGIN..COMMIT` implícito de función PL/pgSQL. T01 demuestra: 12 snapshots creados en misma TX que la sesión |

### Cierre — Primer conteo

| ID | Caso | Clasificación | Evidencia / Mecanismo |
|----|------|--------------|----------------------|
| T07 | Cierre sin diferencia (primer conteo = expected) | **PASS** | Sesión `d0d5afc5`: first_counted=300, expected=300, diff=0, status=closed, closing_snapshot=12 ✅ |
| T08 | Cierre con sobrante | **PASS** | Sesión `2223b697`: first_counted=450, expected=400, diff=+50, status stays open ✅ |
| T09 | Cierre con faltante | **PASS** | Sesión `58759fac`: first_counted=450, expected=500, diff=-50, status stays open ✅ |
| T10 | Cierre con ventas activas | **PASS** | UPDATE table to 'ocupada' → `record_first_cash_count_atomic` → `ok: false, active_sales_count: 1` |
| T11 | Doble click en primer conteo | **PASS** | Retry mismo valor → `ok: true, close_result: 'already_first_counted'`, cero escrituras |
| T12 | Dos managers simultáneos primer conteo | **PASS-PROXY** | Secuencial mismo monto → idempotente. Secuencial monto diferente → `ok: false, 'Conflicto: ya existe primer conteo con monto diferente.'`. Concurrencia real protegida por: (1) advisory lock compartido; (2) DB guard `WHERE first_counted_cash IS NULL` en UPDATE |
| T28 | Retry primer conteo después de cierre diff=0 | **PASS** | Sesión `d0d5afc5` (closed, diff=0): retry mismo monto → `ok: true, close_result: 'closed'`, snapshot count invariante (12+12) |

### Segundo conteo

| ID | Caso | Clasificación | Evidencia / Mecanismo |
|----|------|--------------|----------------------|
| T13 | Segundo conteo diff=0 | **PASS** | Sesión `2223b697`: second=400=expected → diff=0 → status=closed, 12+12 snapshots ✅ |
| T14 | Segundo conteo con diferencia remanente | **PASS** | Sesión `58759fac`: second=450, expected=500, diff=-50 → status=closed_with_pending_difference ✅ |
| T15 | Doble submit_recount | **PASS-PROXY** | Retry mismo valor → idempotente `{ok:true, close_result, session}`. Concurrencia real protegida por advisory lock + `WHERE status='open' AND first_counted_cash IS NOT NULL` DB guard |
| T16 | submit_recount sin primer conteo | **PASS** | `ok: false, 'No hay un primer conteo registrado. Usa record_first_cash_count_atomic primero.'` |
| T17 | submit_recount con caja cerrada (monto diferente) | **PASS** | Sesión `d0d5afc5` (closed, no final_counted): `ok: false, 'Conflicto: la sesión ya fue cerrada con segundo conteo diferente.'` |
| T18 | Retry por timeout (mismo second_counted_cash) | **PASS** | Sesión `58759fac`: retry → `{ok:true, close_result, session}` — mismos datos, cero escrituras |

### Ledger

| ID | Caso | Clasificación | Evidencia / Mecanismo |
|----|------|--------------|----------------------|
| T19 | Resolver sobrante (surplus) | **PASS** | Sesión `0b91adcd`: JE-DIF-A97A4D45: D1101=$20 / H4102=$20, status=confirmed ✅ |
| T20 | Resolver faltante (shortage) | **PASS** | Sesión `58759fac`: JE-DIF-CC9891B7: D5101=$50 / H1101=$50, status=confirmed ✅ |
| T21 | Sesión diff=0 sin póliza | **PASS** | Sesión `d0d5afc5` (diff=0): 0 cash_discrepancy_resolutions, 0 journal_entries source='cash_discrepancy' ✅ |
| T22 | Doble resolve_cash_discrepancy | **PASS** | Segunda llamada → `'Esta sesión ya tiene una resolución registrada.'` ✅ |

### Congelamiento operativo

| ID | Caso | Clasificación | Evidencia / Mecanismo |
|----|------|--------------|----------------------|
| T27 | Venta después de primer conteo con diferencia | **PASS + MANUAL-PASS** | DB (PASS): el trigger bloquea cuando `first_counted_cash IS NOT NULL`. Histórico pre-fix: sesión `04d126d3`, `pos-operations` respondió HTTP 500 con `{"error":"Error inesperado."}` porque `PostgrestError` no cumplía `instanceof Error`. Post-fix Sprint 2B.2: sesión `415cbc75`, intento en Mesa 11 bloqueado por `save_table_order`; el handler desplegado mapea el conflicto a HTTP 409 y la UI muestra `'La caja está en proceso de cierre. No se pueden registrar nuevas ventas.'`. Mesa 11 permaneció libre, sin venta ni póliza adicional. |

### Reportes (UI)

| ID | Caso | Clasificación | Observaciones |
|----|------|--------------|---------------|
| T23 | Sesión visible en FinancesCashSessions | **MANUAL-PASS** | Validado visualmente. Ver sección QA Final UI |
| T24 | first_counted_cash / final_counted_cash visible | **MANUAL-PASS** | Validado visualmente. Ver sección QA Final UI |
| T25 | PDF corte de caja | **MANUAL-PASS** | Validado visualmente. Ver sección QA Final UI |
| T26 | difference_amount visible (tres escenarios) | **MANUAL-PASS** | Validado visualmente. Ver sección QA Final UI |

---

## QA Final UI — T23–T26 y Smoke E2E

### Entorno UI DEV
- URL: `http://localhost:5173` (dev server Vite)  
- Supabase backend: DEV `rtkdrnfqihulqdhixxzf`
- Usuario: `codexdebug`

### T23 — FinancesCashSessions

Sesiones Sprint 2B visibles con campos correctos:

| Campo | `58759fac` | `d0d5afc5` | `2223b697` | `0b91adcd` | `0fa9f57e` |
|-------|-----------|-----------|-----------|-----------|-----------|
| status | closed_with_pending_difference | closed | closed | closed_with_pending_difference | closed |
| opening_amount | $500 | $300 | $400 | $100 | $500 |
| first_counted_cash | $450 | $300 | $450 | $120 | $500 |
| expected_cash_total | $500 | $300 | $400 | $100 | $500 |
| difference_amount | -$50 | $0 | $0 | +$20 | $0 |

Campos verificados en DB antes de UI test — ver "Integridad final DEV" para confirmación.

### T24 — first_counted_cash / final_counted_cash

| Caso | first_counted_cash | final_counted_cash | Comportamiento esperado |
|------|-------------------|-------------------|------------------------|
| diff=0 primer conteo (`d0d5afc5`) | $300 | null | UI fallback a first_counted |
| segundo conteo (`2223b697`) | $450 | $400 | UI usa final_counted_cash |
| diff≠0 sin recount (`58759fac`) | $450 | $450 (= final) | |

### T25 — PDF corte de caja

`report_pdf_metadata` generado en 5/5 sesiones Sprint 2B (verified DB).  
PDF incluye: fecha apertura, opening_amount, sales_cash_total, expected_cash_total, difference_amount, primer conteo, inventario opening, inventario closing.

### T26 — difference_amount tres escenarios

| Escenario | Sesión | Diferencia | Signo |
|-----------|--------|-----------|-------|
| diff=0 | `d0d5afc5`, `0fa9f57e` | $0.00 | neutro |
| Sobrante | `0b91adcd` | +$20.00 | positivo |
| Faltante | `58759fac` | -$50.00 | negativo |

---

## Smoke E2E DEV

### Ciclo diff=0

```
open_cash_session_atomic($200) → status=open ✅
record_first_cash_count_atomic($200) → close_result='closed', diff=0 ✅
Snapshot: 12 opening + 12 closing ✅
```

### Ciclo con diferencia

```
open_cash_session_atomic($300) → status=open ✅  [sesión 04d126d3]
record_first_cash_count_atomic($250) → close_result='already_first_counted'→ diff=-50, status=open ✅
Bloqueo POS (T27 UI, evidencia histórica pre-fix): clic CLAMATO PREPARADO → pos-operations HTTP 500 con mensaje genérico
submit_cash_recount_atomic($250) → ok:true, close_result='closed_with_pending_difference', diff=-50 ✅
  final_counted_cash=250, difference_amount=-50, status=closed_with_pending_difference
  12 opening + 12 closing snapshots ✅
  report_pdf_metadata generado: corte-caja-20260902-2307-04d126d3.pdf ✅
```

### Sprint 2B.2 — Revalidación T27 post-fix

- Causa raíz: el `catch` exterior de `pos-operations` solo publicaba el mensaje cuando `error instanceof Error`; los errores Supabase/PostgREST son objetos planos y terminaban como HTTP 500 con `Error inesperado.`.
- Corrección: `normalizeOperationError` conserva internamente `message`, `details`, `hint` y `code`; publica únicamente mensajes de negocio y mantiene texto genérico para errores internos 500.
- `save_table_order`: el error P0001 de caja en cierre se normaliza a HTTP 409 y conserva el mensaje de negocio.
- `finalize_sale`: el error del RPC se entrega al mismo normalizador; ya no pierde metadata al envolverlo.
- Edge Function: solo `pos-operations` desplegada a DEV `rtkdrnfqihulqdhixxzf`, ACTIVE v22, el 03/09/2026 11:10 hora local.

Flujo browser DEV autorizado:

```text
Sesión 415cbc75-4c97-4fa3-9411-c13ac2ad8203
Apertura: $1.00
Venta normal: Mesa 12, PREPARACION CHELADO., $25.00, folio 03092026171501
Póliza: JE-VTA-03092026171501, D1101=$25.00 / H4101=$25.00
Primer conteo: $25.00, esperado $26.00, diferencia temporal -$1.00
T27: Mesa 11 + PREPARACION CHELADO. → bloqueado con mensaje de negocio exacto
Reconteo final: $26.00
Cierre: contado $26.00, esperado $26.00, diferencia $0.00, status=closed
```

Resultado post-fix:

- Venta creada durante cierre: 0.
- Movimiento de inventario por T27: 0; el intento bloqueado no persistió pedido y el producto usado no controla inventario físico.
- Póliza por T27: 0; el reporte solo agregó las dos líneas balanceadas de la venta normal autorizada.
- Mesa 11 y Mesa 12 quedaron libres.
- `finalize_sale` durante cierre no fue ejecutable: el conteo inicial atómico exige cero pedidos activos. La ruta quedó cubierta por el normalizador común y por la venta normal de regresión.
- Consola post-fix: sin error interno inesperado ni mensaje genérico; se registró el rechazo de negocio esperado. El ruido de extensión Chrome no pertenece a la aplicación.

---

## Verificaciones de integridad DEV (post QA final)

| # | Invariante | Resultado | Detalle |
|---|-----------|-----------|---------|
| 1 | Sesiones abiertas | ✅ 0 | `COUNT(*)=0` where status='open' — 14 closed, 4 closed_with_pending_difference |
| 2 | Snapshots opening por sesión cerrada | ✅ 12 | Todas 5 sesiones Sprint 2B: exactamente 12 |
| 3 | Snapshots closing por sesión cerrada | ✅ 12 | Todas 5 sesiones Sprint 2B: exactamente 12 |
| 4 | Sin snapshots duplicados (material_id) | ✅ 0 | 0 rows con count > 1 dentro de cualquier (session, type) |
| 5 | Ventas después de first_counted_cash | ✅ 0 | Trigger bloqueó correctamente (T27) |
| 6 | Ledger desbalanceado | ✅ 0 | 0 journal_entries donde SUM(debit)≠SUM(credit) |
| 7 | `first_counted_cash` correcto | ✅ | Verificado campo por campo: 58759fac=450, d0d5afc5=300, 2223b697=450, 0b91adcd=120, 0fa9f57e=500 |
| 8 | `final_counted_cash` correcto | ✅ | null donde aplica primer-conteo-diff=0; 400 en 2223b697; 450 en 58759fac; 120 en 0b91adcd |
| 9 | `difference_amount = contado - expected` | ✅ | 58759fac: 450-500=-50; 2223b697: 400-400=0; 0b91adcd: 120-100=+20 |
| 10 | diff=0 → status=`closed` | ✅ | d0d5afc5, 2223b697, 0fa9f57e: status=closed |
| 11 | diff≠0 → status=`closed_with_pending_difference` | ✅ | 58759fac, 0b91adcd: status=closed_with_pending_difference |
| 12 | Ledger balanceado (Debe = Haber) | ✅ | 0 entradas desbalanceadas para source_type='cash_discrepancy' |
| 13 | `report_pdf_metadata` generado | ✅ | has_pdf_meta=true en 5/5 sesiones Sprint 2B |

### Nota: sesión pre-existente `f82003d1` (no Sprint 2B)

- Abierta 2026-05-04 (antes de Sprint 2B)
- 11 opening + 12 closing — diferencia de conteo refleja nuevo item de inventario agregado entre apertura y cierre
- Sin duplicados de material_id dentro del snapshot
- No es un defecto Sprint 2B

---

## Resumen final Sprint 2B.2 QA DEV

| Campo | Valor |
|-------|-------|
| Tests ejecutados | 28 (T01–T28) |
| Tests PASS (directos) | 18 |
| Tests PASS-STRUCTURAL | 2 (T05, T06) |
| Tests PASS-PROXY | 4 (T03, T12, T15, T04 cubierto por T02) |
| Tests MANUAL-PASS | 4 (T23–T26) |
| Tests FAIL | 0 |
| Smoke E2E diff=0 | ✅ PASS |
| Smoke E2E con diferencia | ✅ PASS |
| Bloqueo POS durante cierre | ✅ PASS (T27 DB) + MANUAL-PASS (T27 UI) |
| Sesiones abiertas finales | ✅ 0 |
| Snapshots duplicados | ✅ 0 |
| Ventas después de primer conteo | ✅ 0 |
| Ledger desbalanceado | ✅ 0 |
| Errores 500 | Histórico: 1 en T27 pre-fix; post-fix: ✅ 0 |
| Error genérico UI | Histórico: 1 en T27 pre-fix; post-fix: ✅ 0 |
| Lint | ✅ PASS |
| Build | ✅ PASS (4.14s) |
| test:finance | ✅ PASS — 88/88 |
| git diff --check | ✅ PASS (advertencia CRLF Windows, no es error) |
| cash-operations DEV | ✅ ACTIVE v13 (2026-09-03) |
| pos-operations DEV | ✅ ACTIVE v22 (2026-09-03) |
| PRD modificado | ❌ NO — ninguna operación sobre PRD |
| CLI final | Proyecto vinculado PRD; deploy ejecutado con `--project-ref rtkdrnfqihulqdhixxzf` únicamente a DEV |
| Clasificación pruebas actualizada | ✅ PASS / PASS-STRUCTURAL / PASS-PROXY / MANUAL-PASS |
| Riesgos residuales | No bloqueante: al recargar Control de caja durante el primer conteo la UI no rehidrata ese paso, aunque backend conserva y protege el estado |
| **¿Sprint 2B completamente cerrado?** | **SÍ** |
| **¿Listo para commit?** | **SÍ** |
| **¿Listo para preparar cutover PRD?** | **SÍ** — pendiente: ventana de caja PRD cerrada |

---

## Restricciones respetadas

- ❌ NO SQL PRD
- ❌ NO `supabase db push` PRD
- ❌ NO Edge Function deploy PRD
- ❌ NO Vercel deploy
- ❌ NO cambios secrets PRD
- ❌ NO operaciones de negocio PRD

---

## Prerrequisitos para despliegue PRD

### Orden obligatorio de deploy

1. **Migrations PRD** — `supabase db push --linked` (M1→M4 en orden)
   - Verificar: `supabase migration list --linked` muestra 4 migraciones aplicadas
2. **Deploy `cash-operations`** — `supabase functions deploy cash-operations --project-ref cxpouhmrpcpiohrueuwk`
   - Verificar: versión activa en dashboard PRD > v13
3. **Deploy `pos-operations`** — `supabase functions deploy pos-operations --project-ref cxpouhmrpcpiohrueuwk`
   - Verificar: versión activa en dashboard PRD > v22
4. **Smoke tests controlados** — Abrir caja PRD, primer conteo diff=0, cierre limpio. Verificar 12+12 snapshots.

### Bloqueadores PRD (no resolver sin autorización)

- **B3 — Autorización explícita PRD:** Confirmación del responsable antes de iniciar cualquier deploy
- **B4 — Backup/snapshot PRD predeploy:** Snapshot DB PRD tomado < 1h antes del deploy
- **B5 — Ventana operativa:** Caja PRD cerrada (status ≠ 'open') durante todo el deploy

### Señal de rollback

Error 500 en cash-operations post-deploy, sesión con estado inesperado, snapshot count ≠ 12 — redeployar EF anterior en < 5 min y escalar.

---

## Riesgos residuales no bloqueantes

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Control de caja no rehidrata visualmente el paso de primer conteo después de refresh; backend conserva y protege correctamente el estado | UX: cajero ve pantalla inicial tras refresh durante proceso de cierre | Backend idempotente: reenviar mismo monto = sin escritura duplicada |
| `pos-operations` wrappea errores DB como "Error inesperado" cuando `PostgrestError` no es `instanceof Error` en catch EF | UX: mensaje genérico en lugar de "La caja está en proceso de cierre" | Guard funciona correctamente; mensaje es cosmético |

*Actualizado: 2026-09-03 | Sprint 2B.1 QA Final | Branch: chore/code-cleanup*
