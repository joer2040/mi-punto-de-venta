# Sprint 2B — Caja Atómica — Registro de Deploy PRD
**Fecha de deploy:** 2026-09-07 (M0–M4 + EF) → 2026-09-08 (HF1) → 2026-09-09 (HF2 + smoke final)  
**Entorno:** PRD `cxpouhmrpcpiohrueuwk` / `lacarreta.mobi`  
**Branch:** `chore/code-cleanup` · **Commit:** `a61d138` (`a61d13826a217d8e7067872d12b52efceac74baf`)  
**Estado final:** ✅ COMPLETADO — SMOKE PASS

---

## 1. Resumen ejecutivo

Sprint 2B "Caja Atómica" desplegado exitosamente en PRD. El objetivo era hacer las transiciones de sesión de caja atómicas: apertura, primer conteo, cierre final, con bloqueo POS durante el cierre y snapshots de inventario pareados.

Deployment requirió 5 migraciones base (M0–M4), 2 hotfixes post-smoke (HF1+HF2), y actualización de la Edge Function `cash-operations`. Un data fix controlado corrigió un registro del smoke pre-HF2.

**Resultado:** Caja cerrada con `difference=0`, journal balanceado, 30 snapshots (15+15), PDF generado. Rollback no requerido.

---

## 2. Alcance — Artefactos desplegados

### Migraciones

| # | Archivo | Descripción | Fecha |
|---|---------|-------------|-------|
| M0 | `20260902100000_track_close_cash_session_atomic.sql` | Tracking inicial cierre atómico | 2026-09-07 |
| M1 | `20260902200000_update_open_cash_session_atomic_lock.sql` | Advisory lock unificado `'public.cash_session_atomic'` en los 3 RPCs | 2026-09-07 |
| M2 | `20260902210000_block_sales_during_cash_close.sql` | Guard `first_counted_cash IS NOT NULL` en trigger + `finalize_pos_sale` | 2026-09-07 |
| M3 | `20260902220000_record_first_cash_count_atomic.sql` | RPC `record_first_cash_count_atomic` — primer conteo + snapshot | 2026-09-07 |
| M4 | `20260902230000_submit_cash_recount_atomic.sql` | RPC `submit_cash_recount_atomic` — cierre completo, PDF, journal | 2026-09-07 |
| HF1 | `20260908100000_fix_finalize_pos_sale_payment_method_case.sql` | Normalización Title Case en `financial_payments.payment_method` | 2026-09-08 |
| HF2 | `20260909100000_fix_finalize_pos_sale_dominant_payment_method_case.sql` | Normalización Title Case en `v_dominant_method` (`sales.payment_method`) | 2026-09-09 |

### Edge Functions

| Función | Acción | Versión final |
|---------|--------|---------------|
| `cash-operations` | Redeployada con `buildSessionOverview`, `open/close/record/submit` | v18 (post-HF2) |
| `pos-operations` | Redeployada con guard M2 (`P0001` propagation fix) | v7 |

### Código fuente

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/cash-operations/cashRules.js` | Añadida `normalizePaymentMethod` (defensive — refleja normalización DB) |
| `supabase/functions/cash-operations/cashRules.test.js` | 3 tests regresión O3 añadidos (88→91 total) |

---

## 3. Gates predeploy

| Gate | Estado | Evidencia |
|------|--------|-----------|
| B3 — Autorización explícita | ✅ AUTORIZADO | Jaime (responsable técnico) — 2026-09-07 |
| B4 — Backup targeted predeploy | ✅ COMPLETADO | Schema + data 12 tablas operacionales — `backups/backup_prd_20260907_pre_sprint2b_*.sql` |
| B5 — Ventana operativa | ✅ PASS CON EXCEPCIÓN | 0 cajas abiertas, 0 mesas, `active_pos_operation_count()=0`. Excepción documentada: 209 `table_orders` históricos huérfanos — aprobado como tech-debt |

---

## 4. Deploy en producción — cronología

| Momento | Acción | Resultado |
|---------|--------|-----------|
| 2026-09-07 | `supabase db push --linked` → M0–M4 aplicadas | ✅ 5 migraciones presentes en `schema_migrations` |
| 2026-09-07 | `supabase functions deploy cash-operations` | ✅ EF activa |
| 2026-09-07 | `supabase functions deploy pos-operations` | ✅ EF activa |
| 2026-09-07 | Primer smoke — apertura + venta + cierre | ❌ HTTP 500 — ver Incidente 1 |
| 2026-09-08 | HF1 aplicada vía `supabase db push --linked` | ✅ Presente en historial |
| 2026-09-08 | `supabase functions deploy cash-operations` (post-HF1) | ✅ Redeployada |
| 2026-09-08 | Segundo smoke — cierre | ❌ `cash_sales=0` — ver Incidente 2 |
| 2026-09-09 | HF2 aplicada vía `supabase db push --linked` | ✅ Presente en historial |
| 2026-09-09 | `supabase functions deploy cash-operations` (post-HF2) | ✅ Redeployada |
| 2026-09-09 | Data fix controlado — sale `8f61e38a-...` | ✅ `payment_method='Efectivo'` |
| 2026-09-09 | Smoke final — cierre completo | ✅ HTTP 200, `close_result=closed`, `difference=0` |

---

## 5. Incidente 1 — HTTP 500 en smoke inicial

**Síntoma:** `close_cash_session` devolvió HTTP 500 al primer intento de cierre.

**Root cause:** `finalize_pos_sale` insertaba en `financial_payments` con `payment_method = trim(pay->>'method')` → valor lowercase `'efectivo'`. La tabla `financial_payments` tiene CHECK constraint que requiere valores Title Case (`'Efectivo'`, `'Tarjeta'`, `'Transferencia'`). Violación de constraint → excepción en la transacción atómica → 500.

**Fix — HF1 (`20260908100000`):**
```sql
-- Dentro de finalize_pos_sale, al construir financial_payments insert:
v_fp_method := CASE lower(trim(pay->>'method'))
  WHEN 'efectivo'      THEN 'Efectivo'
  WHEN 'tarjeta'       THEN 'Tarjeta'
  WHEN 'transferencia' THEN 'Transferencia'
  ELSE trim(pay->>'method')
END;
```

**Verificación:** HTTP 500 eliminado en smoke post-HF1. `financial_payments.payment_method = 'Efectivo'` — constraint satisfecha.

---

## 6. Incidente 2 — cash_sales=0 (O3)

**Síntoma:** Post-HF1, `close_cash_session` respondió HTTP 200 pero `sales_cash_total=0` en la respuesta de `get_session_overview`. El cierre fue rechazado preventivamente.

**Root cause (O3):**  
`finalize_pos_sale` calculaba `v_dominant_method = trim(pay->>'method')` → guardaba `'efectivo'` (lowercase) en `sales.payment_method`.  
`loadSalesSummary` en la EF filtraba `.eq('payment_method', 'Efectivo')` (exact Title Case match).  
La venta smoke quedó excluida de `sales_cash_total` → `expected_cash_total = opening_amount + 0 = 200` en vez de `220`.

**Fix — HF2 (`20260909100000`):**
```sql
-- Dentro de finalize_pos_sale, al asignar v_dominant_method:
SELECT
  CASE lower(trim(pay->>'method'))
    WHEN 'efectivo'      THEN 'Efectivo'
    WHEN 'tarjeta'       THEN 'Tarjeta'
    WHEN 'transferencia' THEN 'Transferencia'
    ELSE trim(pay->>'method')
  END
INTO v_dominant_method
FROM jsonb_array_elements(p_payments) pay
ORDER BY (pay->>'amount')::numeric(14,2) DESC
LIMIT 1;
```

**Verificación:** `sales.payment_method = 'Efectivo'` (Title Case), `loadSalesSummary` incluye la venta, `sales_cash_total=20.00`.

---

## 7. Data fix controlado

**Contexto:** La venta del smoke pre-HF2 (`8f61e38a-3b03-4d2f-b7c0-1c2bb4ad8637`) tenía `payment_method='efectivo'` (lowercase) — guardada por `finalize_pos_sale` antes de HF2.

**Autorización:** Jaime — 2026-09-09.

**SQL ejecutado:**
```sql
DO $$
BEGIN
  UPDATE public.sales
  SET payment_method = 'Efectivo'
  WHERE id = '8f61e38a-3b03-4d2f-b7c0-1c2bb4ad8637'
    AND payment_method = 'efectivo';
  IF NOT FOUND THEN RAISE EXCEPTION 'row not found or already fixed'; END IF;
END $$;
```

**Verificación post-fix:**
- `sales.payment_method = 'Efectivo'` ✅
- `journal_entries` no afectados (fix solo en `sales`, no en `financial_payments`) ✅
- `loadSalesSummary` incluye la venta ✅

**Alcance:** 1 row en `public.sales`. Sin efecto en otros registros.

---

## 8. Evidencia smoke final — 2026-09-09

### Sesión de caja

| Campo | Valor |
|-------|-------|
| `id` | `4a87ec46-6b96-439b-a8a3-f27f792dd7e3` |
| `status` | `closed` |
| `opening_amount` | `200.00` |
| `sales_cash_total` | `20.00` |
| `expected_cash_total` | `220.00` |
| `first_counted_cash` | `220.00` |
| `difference_amount` | `0.00` |
| `closed_at` | `2026-09-09 14:24:43.517146+00` |
| `report_pdf_metadata.suggested_file_name` | `corte-caja-20260908-0815-4a87ec46.pdf` |
| `report_pdf_metadata.generated_at` | `2026-09-09T14:24:43.517146+00:00` |

### Cierre (HTTP)

| Campo | Valor |
|-------|-------|
| HTTP status | `200` |
| `close_result` | `closed` |
| `first_counted` | `220` |
| `difference` | `0` |

### Venta smoke

| Campo | Valor |
|-------|-------|
| `id` | `8f61e38a-3b03-4d2f-b7c0-1c2bb4ad8637` |
| Folio | `09092026002001` |
| `payment_method` | `Efectivo` |
| `total_amount` | `20.00` |
| `cash_session_id` | `4a87ec46-...` |

### Snapshots de inventario

| Tipo | Count | Cobertura |
|------|-------|-----------|
| `opening` | 15 | 15/15 materiales inventariados |
| `closing` | 15 | 15/15 materiales inventariados — match perfecto |
| Duplicados | 0 | — |

### Libro mayor

| Campo | Valor |
|-------|-------|
| `journal_entries` (source_type='sales', source_id=venta) | 1 |
| Debe `1101` (Caja) | `20.00` |
| Haber `4101` (Ingresos) | `20.00` |
| `status` | `confirmed` |
| Balanceado | ✅ |

### Discrepancias

| Tabla | Count |
|-------|-------|
| `cash_discrepancy_resolutions` | `0` |
| `journal_entries` por discrepancia | `0` |
| `financial_operations` por discrepancia | `0` |

### Estado final PRD (B5 post-smoke)

| Condición | Valor |
|-----------|-------|
| Sesiones abiertas | `0` |
| Mesas ocupadas | `0` |
| `tables.id = d5a10289-...` (Mesa 12) status | `libre` |
| `tables.current_order_id` Mesa 12 | `NULL` |

---

## 9. Evidencia de atomicidad

`finalize_pos_sale` (SECURITY DEFINER, `search_path = public, pg_temp`) ejecuta en transacción única:

| Control | Mecanismo |
|---------|-----------|
| Exclusión mutua | `pg_advisory_xact_lock(hashtext('public.cash_session_atomic'))` — mismo lock en `open`, `record_first`, `submit_recount` |
| Guard in-close | `IF v_session.first_counted_cash IS NOT NULL THEN RAISE ... 'La caja está en proceso de cierre'` — bloquea POS durante conteo |
| Idempotencia | `idempotency_requests` — misma clave de operación no se puede ejecutar dos veces |
| Cleanup tabla | `table_orders` limpiada al cerrar |
| Snapshots | 15 opening + 15 closing confirmados en smoke — cobertura completa |
| Journal | `journal_entries` + `financial_operations` en misma transacción — balance garantizado |

---

## 10. Controles de seguridad y operacionales

| Control | Implementación |
|---------|---------------|
| Credenciales | Nunca impresas en chat, logs ni archivos. Capturadas vía `SecureString`, zeroed inmediatamente después de uso |
| JWT | Solo en memoria de sesión PS. No guardado en disco, Registry, ni env vars persistentes |
| `service_role` | No usada como auth de usuario. Usada solo en GRANT SQL (permisos de función) |
| DB access | Session Pooler SSL (`PGSSLMODE=require`) + `PGCLIENTENCODING=UTF8` |
| Backups | `backups/` en `.gitignore`. No incluidos en commit |
| Scripts PRD | En scratchpad de sesión — no versionados en repo |
| Hotfixes | Aplicados vía `supabase db push --linked` — registrados en `schema_migrations` |

---

## 11. Residuos conocidos / Tech Debt

| ID | Descripción | Prioridad |
|----|-------------|-----------|
| TD-01 | **209 orphan `table_orders`** — registros históricos 2026-04-18 a 2026-07-16, ninguno con mesa activa. `active_pos_operation_count()=0`. Cleanup pendiente separado. | Baja |
| TD-02 | **Smoke sale `8f61e38a-...`** — dato de prueba en PRD, `payment_method` corregido manualmente. No es operación real. | Info (no acción) |
| TD-03 | **`normalizePaymentMethod` en `cashRules.js`** — refleja normalización DB como capa defensiva. Sin impacto en flujo actual (EF no controla `payment_method` directamente). | Baja |
| TD-04 | **`MONITOREO_LEDGER_PRD_20260901_7DIAS.md`** — checklist C1-C12 completado con datos 2026-09-02. Monitoreo continuo post-Sprint 2B a discreción del equipo. | Info |

---

## 12. Estado final

| Métrica | Valor |
|---------|-------|
| Sprint 2B | ✅ **COMPLETADO** |
| Fecha cierre | 2026-09-09 |
| Smoke PRD | ✅ **PASS** |
| Rollback | ✅ **NO REQUERIDO** |
| Tests unitarios | ✅ 91/91 PASS |
| Lint | ✅ 0 errores |
| Build | ✅ Vite — dist generado |
| Migraciones PRD | 7 (M0–M4 + HF1 + HF2) |
| PRD estable | ✅ 0 sesiones abiertas, 0 mesas ocupadas |

**Responsable:** Jaime  
**Documento preparado:** 2026-09-09 — fin de sprint

---

*Ref: [`PREDEPLOY_SPRINT2B_CAJA_ATOMICA_PRD_20260903.md`](PREDEPLOY_SPRINT2B_CAJA_ATOMICA_PRD_20260903.md) · [`SPRINT2B_CAJA_ATOMICA_DEV_20260902.md`](SPRINT2B_CAJA_ATOMICA_DEV_20260902.md) · [`MONITOREO_LEDGER_PRD_20260901_7DIAS.md`](MONITOREO_LEDGER_PRD_20260901_7DIAS.md)*
