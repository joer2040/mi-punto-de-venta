# Predeploy — Sprint 2B Caja Atómica — PRD
**Fecha preparación:** 2026-09-03 · **Entorno objetivo:** PRD (`cxpouhmrpcpiohrueuwk`) · **DEV validado:** ✅

> **ESTE DOCUMENTO ES READ-ONLY HASTA AUTORIZACIÓN B3.**
> Ningún paso de deploy se ejecuta hasta confirmar B3, B4 y B5.

---

## Commit y archivos

| Campo | Valor |
|-------|-------|
| Commit | `a61d138` — "fix: make cash session transitions atomic" |
| Branch | `chore/code-cleanup` |
| Remote | `github.com/joer2040/mi-punto-de-venta` |
| cash-operations DEV | ✅ ACTIVE v13 (2026-09-03 02:57:09 UTC) |
| pos-operations DEV | ✅ ACTIVE v22 (2026-09-03) |
| T01–T28 DEV | ✅ 0 FAIL |
| PRD modificado hoy | ❌ NO |

### Migraciones a aplicar (DEV → PRD)

| # | Archivo | Descripción |
|---|---------|-------------|
| M1 | `20260902200000_update_open_cash_session_atomic_lock.sql` | Unifica clave advisory lock: `'public.cash_session_atomic'` compartida en los 3 RPCs |
| M2 | `20260902210000_block_sales_during_cash_close.sql` | Guard `first_counted_cash IS NOT NULL` en trigger `require_open_cash_session_for_pos_operation` + guard en `finalize_pos_sale` |
| M3 | `20260902220000_record_first_cash_count_atomic.sql` | RPC `record_first_cash_count_atomic` — primer conteo atómico con advisory lock + snapshot |
| M4 | `20260902230000_submit_cash_recount_atomic.sql` | RPC `submit_cash_recount_atomic` — segundo conteo atómico, cierre completo |

> Todas las migraciones son idempotentes (`CREATE OR REPLACE`). Si M1–M4 ya estuviesen aplicadas, re-aplicar no causa daño.

---

## B3 — Autorización explícita PRD

**Estado: ⛔ PENDIENTE**

No inferir autorización bajo ninguna circunstancia.

Se requiere confirmación explícita del responsable antes de:
- `supabase db push --linked` (migrations PRD)
- `supabase functions deploy cash-operations`
- `supabase functions deploy pos-operations`
- Cualquier SQL de escritura PRD
- Smoke tests operacionales en PRD

**B3 AUTORIZADO — 2026-09-07. Jaime (responsable técnico).**

> Deploy bloqueado hasta B4 y B5 completados.

### Criterios para solicitar B3

B3 puede solicitarse solamente cuando **todos** los siguientes estén completos:

| Prerequisito | Estado |
|-------------|--------|
| Rollback de EF documentado (Casos A y B con impacto M2 explícito) | ✅ Documentado en sección Rollback |
| Impacto especial de M2 documentado (trigger + `finalize_pos_sale` en rollback EF) | ✅ Documentado — Caso B |
| Rollback DB de M2 preparado como artifact (`backups/rollback_m2_predeploy_20260903.sql`) | ✅ Preparado — NO ejecutado |
| Alcance real de B4 claramente definido como "targeted operational backup" | ✅ Documentado en sección B4 |

> **Nota:** Todos los prerequisitos de B3 están completos — artifact M2 preparado. B3 puede solicitarse cuando el responsable esté disponible para autorizar.

---

## B4 — Backup predeploy PRD (targeted operational)

**Estado: 🔄 EN EJECUCIÓN — 2026-09-07**

> **Alcance explícito:** Schema completo `public` (DDL) + data dirigida de 12 tablas operacionales críticas. **NO es backup completo** (no incluye logs, audit, tablas auxiliares).

> **Herramienta:** `pg_dump` nativo. `supabase db dump --linked` descartado (requiere Docker no disponible en este ambiente).

> **Archivos objetivo:**
> - `backups/backup_prd_20260907_pre_sprint2b_schema.sql`
> - `backups/backup_prd_20260907_pre_sprint2b_data.sql`

> **Credenciales:** Capturadas en tiempo de ejecución via `supabase db dump --dry-run`. NO almacenadas en documentación ni código.

### Ubicación

```
mi-punto-de-venta/backups/
```

Directorio ignorado por `.gitignore` (línea 41: `backups/`). Backups previos presentes:
- `backup_prd_20260901_pre_ledger.sql` (schema)
- `backup_prd_20260901_pre_ledger_data.sql` (data)

### Comandos cuando sea autorizado

```bash
# 1. Schema
supabase db dump --linked \
  --file backups/backup_prd_20260903_pre_sprint2b.sql \
  2>&1

# 2. Data dirigida — tablas operacionales críticas (NO backup completo)
# Cubre: cash_sessions, cash_session_inventory_snapshots, sales, table_orders, tables
supabase db dump --linked --data-only \
  --table public.cash_sessions \
  --table public.cash_session_inventory_snapshots \
  --table public.sales \
  --table public.table_orders \
  --table public.tables \
  --file backups/backup_prd_20260903_pre_sprint2b_data.sql \
  2>&1
```

### Verificación post-backup (antes de continuar)

```bash
# Confirmar archivos existen y tienen tamaño razonable
ls -lh backups/backup_prd_20260903_pre_sprint2b*.sql

# Confirmar NO staged
git status backups/
# Esperado: "nothing to commit" o listado como untracked (por .gitignore)
```

**Criterio GO para B4:** Ambos archivos existen, tamaño > 0, antigüedad < 1 hora respecto al inicio del cutover.

---

## B5 — Ventana operativa (caja cerrada)

**Estado: ✅ PASS CON EXCEPCIÓN DOCUMENTADA — 2026-09-07**

### Resultado verificación (2026-09-07)

| Condición obligatoria | Valor obtenido | Estado |
|----------------------|---------------|--------|
| Sesiones de caja abiertas | `0` | ✅ |
| Mesas ocupadas | `0` | ✅ |
| Operaciones POS activas (`active_pos_operation_count()`) | `0` | ✅ |
| Cierres/reconteos pendientes | `0` | ✅ |
| Financial operations recientes (<15 min) | `0` | ✅ |

| Condición especial | Valor | Decisión |
|-------------------|-------|----------|
| `count(*) FROM public.table_orders` | `209` | **EXCEPCIÓN ACEPTADA** — ver nota |
| `table_orders` referenciados por mesa activa | `0` | ✅ |

> **Excepción documentada — TECH-DEBT: cleanup historical orphan table_orders**
> Los 209 registros en `table_orders` son pedidos huérfanos históricos del período 2026-04-18 al 2026-07-16.
> Ninguno tiene una mesa (`tables`) con `current_order_id` apuntándole.
> `active_pos_operation_count()` = 0 — el sistema no los considera operaciones activas.
> M1–M4 no procesan retroactivamente estos rows.
> Criterio operativo definitivo aprobado: **no deben existir operaciones POS activas**, independientemente del conteo bruto histórico de `table_orders`.
> Limpieza pendiente como deuda técnica separada — **NO limpiar durante este deploy**.

### Condiciones obligatorias (definición actualizada)

### Condiciones recomendadas

| Condición | Query | Valor esperado |
|-----------|-------|---------------|
| Sin cierre/reconteo pendiente | `SELECT count(*) FROM public.cash_sessions WHERE status = 'open' AND first_counted_cash IS NOT NULL;` | `0` |
| Sin financial_operations recientes (< 15 min) | `SELECT count(*) FROM public.financial_operations WHERE created_at > now() - interval '15 minutes';` | `0` |

### Cómo ejecutar cuando sea autorizado

```bash
supabase db query --linked "
  SELECT
    (SELECT count(*) FROM public.cash_sessions WHERE status = 'open')     AS cajas_abiertas,
    (SELECT count(*) FROM public.tables WHERE status = 'ocupada')          AS mesas_ocupadas,
    (SELECT count(*) FROM public.table_orders)                             AS pedidos_activos,
    (SELECT public.active_pos_operation_count())                           AS pos_ops_activas,
    (SELECT count(*) FROM public.cash_sessions
      WHERE status = 'open' AND first_counted_cash IS NOT NULL)            AS cierres_pendientes,
    (SELECT count(*) FROM public.financial_operations
      WHERE created_at > now() - interval '15 minutes')                    AS ops_financieras_recientes;
" -o table
```

**Criterio GO para B5:** Todos los valores = 0.

---

## Orden de cutover — NO EJECUTAR AÚN

> Pasos 1–4 = prerequisitos. Pasos 5+ = deploy. Solo ejecutar desde paso 5 con B3+B4+B5 confirmados.

### Fase 0 — Prerequisitos

```
[ ] Paso 1: Confirmar B3 — autorización explícita del responsable
[ ] Paso 2: Ejecutar B4 — backup schema + data, verificar archivos
[ ] Paso 3: Ejecutar B5 — verificar 0 cajas abiertas, 0 mesas, 0 pedidos
[ ] Paso 4: Registrar estado PRD predeploy (migration list, EF versions)
```

```bash
# Paso 4 — estado predeploy
supabase migration list --linked
# Confirmar: M1-M4 NO aparecen todavía
```

### Fase 1 — Migraciones

```
[ ] Paso 5: Aplicar M1–M4 PRD
```

```bash
supabase db push --linked
```

```
[ ] Paso 6: Verificar migraciones aplicadas
```

```bash
supabase migration list --linked
# Esperado: las 4 migraciones de 20260902 aparecen como aplicadas
```

```bash
# Verificación funcional
supabase db query --linked "
  SELECT routine_name, routine_type
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'open_cash_session_atomic',
      'record_first_cash_count_atomic',
      'submit_cash_recount_atomic',
      'require_open_cash_session_for_pos_operation'
    )
  ORDER BY routine_name;
" -o table
# Esperado: 4 funciones presentes
```

### Fase 2 — Edge Functions

```
[ ] Paso 7: Deploy cash-operations
```

```bash
supabase functions deploy cash-operations --project-ref cxpouhmrpcpiohrueuwk
```

```
[ ] Paso 8: Verificar cash-operations activa
```

```bash
# Confirmar versión en dashboard Supabase PRD > v13
# O verificar via función de estado si disponible
```

```
[ ] Paso 9: Deploy pos-operations
```

```bash
supabase functions deploy pos-operations --project-ref cxpouhmrpcpiohrueuwk
```

```
[ ] Paso 10: Verificar pos-operations activa
```

### Fase 3 — Smoke tests controlados

```
[ ] Paso 11: Smoke test operacional
```

Secuencia mínima:
1. Abrir caja PRD (`open_cash_session_atomic`) — monto pequeño real
2. Hacer una venta POS en efectivo
3. Primer conteo con diff=0 → verificar `status=closed`, snapshots ≥ N opening + closing
4. Confirmar `report_pdf_metadata` generado
5. Confirmar 0 errores 500 en EF logs

```
[ ] Paso 12: Verificación DB integridad post-smoke
```

```bash
supabase db query --linked "
  SELECT
    cs.status,
    cs.first_counted_cash IS NOT NULL AS tiene_primer_conteo,
    (SELECT count(*) FROM public.cash_session_inventory_snapshots s
      WHERE s.cash_session_id = cs.id AND s.snapshot_type = 'opening') AS snap_opening,
    (SELECT count(*) FROM public.cash_session_inventory_snapshots s
      WHERE s.cash_session_id = cs.id AND s.snapshot_type = 'closing') AS snap_closing
  FROM public.cash_sessions cs
  ORDER BY cs.created_at DESC
  LIMIT 3;
" -o table
```

### Fase 4 — Monitoreo y cierre

```
[ ] Paso 13: Monitoreo 30 min post-deploy
```
- 0 errores 500 inesperados en cash-operations
- 0 errores 500 inesperados en pos-operations
- Caja smoke cerrada correctamente

```
[ ] Paso 14: Cierre del cutover
```
- Registrar versiones finales PRD
- Actualizar doc con fecha/hora de deploy real
- Confirmar CLI re-linkeada a PRD

---

## Rollback

### Condiciones de rollback

Detener smoke y evaluar rollback si ocurre **cualquiera** de:

| Condición | Acción inmediata |
|-----------|-----------------|
| HTTP 500 inesperado en cash-operations | Detener. No generar más operaciones |
| Apertura o cierre de caja falla con error no esperado | Detener |
| Sesión con estado inconsistente (ej: `open` con `closed_at` no nulo) | Detener |
| `cash_session_inventory_snapshots` count ≠ N esperado | Detener |
| POS bloqueado fuera del proceso de cierre (sin `first_counted_cash IS NOT NULL`) | Detener |
| Error generalizado de Edge Function (health check falla) | Detener |

### Procedimiento de rollback EF

```bash
# Redeployar versión anterior de cash-operations
# (obtener deployment ID anterior del dashboard Supabase PRD)
supabase functions deploy cash-operations \
  --project-ref cxpouhmrpcpiohrueuwk \
  --import-map <path-anterior>
# O usar dashboard Supabase → Functions → cash-operations → rollback

# Mismo procedimiento para pos-operations si afectada
```

> **Advertencia crítica M2:** Rollback de EF solo (cash-operations / pos-operations) **NO restaura el estado pre-M2** de la DB. M2 modifica comportamiento existente: trigger `require_open_cash_session_for_pos_operation` y RPC `finalize_pos_sale`. Si M2 está aplicado en PRD, una EF antigua operará contra DB con nuevas reglas. Ver Caso B y Caso C.

**No ejecutar rollback preventivo** — solo ante fallo confirmado.

### Matriz de rollback

#### Caso A — Falla cash-operations nueva

| Campo | Detalle |
|-------|---------|
| Síntoma | cash-operations falla, pos-operations funciona |
| Acción | Rollback cash-operations a versión anterior. Mantener pos-operations nueva si operativa. Mantener M1–M4 en DB. |
| Impacto M2 | EF anterior de cash-operations no llama a `record_first_cash_count_atomic` ni `submit_cash_recount_atomic` (M3/M4). Trigger M2 permanece activo — `first_counted_cash IS NOT NULL` seguirá bloqueando POS si caja queda en ese estado. |
| Verificación | Confirmar caja operable (apertura + cierre sin M3/M4). Ninguna sesión con `first_counted_cash IS NOT NULL` pendiente. |

#### Caso B — Falla pos-operations nueva

| Campo | Detalle |
|-------|---------|
| Síntoma | pos-operations falla, cash-operations funciona |
| Acción | Rollback pos-operations a versión anterior. |
| Impacto M2 — crítico | EF anterior de pos-operations enfrentará trigger M2. Si caja tiene `first_counted_cash IS NOT NULL`, el trigger lanzará P0001. La EF antigua captura `PostgrestError` como `instanceof Error = false` → devuelve "Error inesperado" (no mensaje de negocio). **Comportamiento degradado: bloqueo POS funciona correctamente, pero mensaje al usuario es genérico.** No es rotura silenciosa, pero sí degradación de experiencia. Documentar explícitamente como estado conocido. |
| Verificación | Confirmar 0 sesiones con `first_counted_cash IS NOT NULL` abiertas antes de dejar EF antigua. Si hay alguna: cerrar manual vía cash-operations nueva o escalar. |

#### Caso C — Falla derivada de M2 (comportamiento inesperado de trigger o `finalize_pos_sale`)

| Campo | Detalle |
|-------|---------|
| Síntoma | Bloqueo POS incorrecto, transacciones falla por P0001 fuera del flujo esperado, inconsistencia en sesiones |
| Acción preparada | Restaurar definición previa de `require_open_cash_session_for_pos_operation` y `finalize_pos_sale` desde control de fuentes. SQL preparado en artifact: `backups/rollback_m2_predeploy_20260903.sql`. **NO ejecutar hasta escalar y autorizar explícitamente.** |
| Fuente SQL rollback | Migración anterior: recuperar definición pre-M2 de `require_open_cash_session_for_pos_operation` desde `supabase/migrations/` (búsqueda en git log). Aplicar con `supabase db query --linked -f backups/rollback_m2_predeploy_20260903.sql` solo con autorización. |
| Nota | Este caso implica rollback de schema DB — acción irreversible en sesión activa. Detener operación completa antes de ejecutar. |

#### Caso D — Problema de datos o migración DB grave

| Campo | Detalle |
|-------|---------|
| Síntoma | Corrupción de datos, migración falla a mitad, estado inconsistente masivo en tablas operacionales |
| Acción | **Detener toda operación. No ejecutar SQL improvisado.** Escalar a responsable. Usar `backups/backup_prd_20260903_pre_sprint2b.sql` + `backups/backup_prd_20260903_pre_sprint2b_data.sql` como fuente de recuperación. Plan de restauración definido en escalación. |
| Recordatorio B4 | El backup B4 es **targeted** (no completo). Recuperación parcial puede ser suficiente para tablas operacionales. Evaluar alcance real antes de proceder. |

---

## Criterios GO / NO-GO

| Criterio | Estado actual | Requerido para GO |
|----------|--------------|-------------------|
| B3 — Autorización explícita | ✅ AUTORIZADO 2026-09-07 | ✅ |
| B4 — Backup targeted < 1h | 🔄 EN EJECUCIÓN | ✅ Schema + data generados, tamaño > 0, antigüedad < 1h |
| B5 — Ventana operativa | ✅ PASS CON EXCEPCIÓN | ✅ |
| Commit en branch | ✅ `a61d138` en `chore/code-cleanup` | ✅ |
| DEV validado T01–T28 | ✅ 0 FAIL | ✅ |
| PRD no modificado | ✅ | ✅ |

**GO/NO-GO actual: 🔄 PENDIENTE B4**

**Razón:** B4 en ejecución (pg_dump). Todos los demás criterios cumplidos. GO/NO-GO se reevalúa al completar B4.

---

## Información de contacto / escalación

- Responsable de autorización B3: **[pendiente confirmación]**
- Ventana de deploy preferida: **[pendiente definición]**
- Canal de escalación ante rollback: **[pendiente definición]**

---

*Preparado: 2026-09-03 | Branch: `chore/code-cleanup` | Commit: `a61d138` | PRD: NO MODIFICADO*

---

## Execution Result — COMPLETADO

**Fecha ejecución:** 2026-09-07 (M0–M4 + EF) → 2026-09-08 (HF1) → 2026-09-09 (HF2 + smoke final)  
**Responsable:** Jaime

### Gates ejecutados

| Gate | Resultado | Fecha |
|------|-----------|-------|
| B3 — Autorización | ✅ AUTORIZADO | 2026-09-07 |
| B4 — Backup targeted | ✅ COMPLETADO | 2026-09-07 — `backups/backup_prd_20260907_pre_sprint2b_*.sql` |
| B5 — Ventana operativa | ✅ PASS CON EXCEPCIÓN | 2026-09-07 — 209 orphan `table_orders` aceptados (tech-debt) |

### Migraciones aplicadas

| # | Versión | Estado |
|---|---------|--------|
| M0 | `20260902100000` | ✅ Aplicada |
| M1 | `20260902200000` | ✅ Aplicada |
| M2 | `20260902210000` | ✅ Aplicada |
| M3 | `20260902220000` | ✅ Aplicada |
| M4 | `20260902230000` | ✅ Aplicada |
| HF1 | `20260908100000` | ✅ Aplicada — fix `financial_payments` CHECK constraint |
| HF2 | `20260909100000` | ✅ Aplicada — fix `sales.payment_method` lowercase (O3) |

### Edge Functions

| Función | Estado |
|---------|--------|
| `cash-operations` | ✅ Redeployada — v18 post-HF2 |
| `pos-operations` | ✅ Redeployada — v7 |

### Smoke final — 2026-09-09

| Campo | Valor |
|-------|-------|
| Session | `4a87ec46-6b96-439b-a8a3-f27f792dd7e3` |
| close HTTP | `200` |
| `close_result` | `closed` |
| `first_counted` | `220` |
| `difference` | `0` |
| Snapshots | `15 opening + 15 closing` |
| Journal | `Debe 1101=20, Haber 4101=20` — balanceado |
| PDF | `corte-caja-20260908-0815-4a87ec46.pdf` — generado |

### Rollback

✅ **NO requerido.** Smoke PASS. PRD estable.

**Estado final:** ✅ SPRINT 2B COMPLETADO — 2026-09-09

> Registro detallado: [`SPRINT2B_CAJA_ATOMICA_PRD_DEPLOYMENT_20260909.md`](SPRINT2B_CAJA_ATOMICA_PRD_DEPLOYMENT_20260909.md)
