# Fase 3.1 — Entrega: Preflight DEV + Script Conductual Corregido

**Fecha:** 2026-08-11  
**Rama:** `chore/code-cleanup`

---

## Qué se ejecutó

### Paso 1 — Validación de seguridad previa

Inspeccionado `sql/dev/2026-08-11_test_schema_readonly.sql`. Confirmado: sin DDL, sin DML, sin RPCs con efectos persistentes. Solo `get_account_balances(null)` (función de reporte, lectura pura). **APROBADO para DEV.**

### Paso 2 — Ejecución del preflight en DEV

El script original usa `RAISE EXCEPTION` que aborta en el primer FAIL — T-03 detenía el run completo. Se creó `sql/dev/2026-08-11_test_schema_safe_run.sql`: misma lógica pero los resultados se almacenan en tabla temporal y se devuelven como filas, permitiendo que todos los tests corran aunque alguno falle.

Resultado de `npx supabase db query --linked --file sql/dev/2026-08-11_test_schema_safe_run.sql`:

- **15/16 PASS**
- **1 FAIL (T-03, esperado):** cuenta `5102` ausente, `5201` presente → migración `20260812100000` no aplicada en DEV

### Paso 3 — Corrección del script conductual

El `sql/dev/2026-08-11_test_behavioral_ledger.sql` original tenía 4 problemas de diseño:

| Problema | Tests afectados | Severidad |
|---|---|---|
| `\set` variables (psql metacommands) ignoradas en `supabase db query` → UUIDs literales inválidos | TB-01 a TB-05 | Alta |
| `INSERT` en `idempotency_requests` + `DELETE` sin `BEGIN/ROLLBACK` exterior | TB-09 | Media |
| DML en sub-bloques PL/pgSQL sin `BEGIN/ROLLBACK` externo — puede persistir fuera del handler | TB-10, TB-11 | Media |
| TB-06, TB-07 correctamente comentados pero incompletos | TB-06, TB-07 | Baja |

Creado `sql/local/2026-08-11_test_behavioral_ledger_local.sql` con:
- Header `-- SOLO POSTGRESQL LOCAL. PROHIBIDO EJECUTAR EN DEV.`
- Preflight que detiene ejecución si prerrequisitos faltan
- Marcadores explícitos `REPLACE:<nombre>` en lugar de UUIDs hardcoded o `\set`
- Cada bloque DML/RPC envuelto en `BEGIN; ... ROLLBACK;`
- Sin cleanup manual — el `ROLLBACK` es suficiente
- 13 casos de prueba (TB-01 a TB-13) cubriendo todos los escenarios del `fase3.1.md`
- Items `PENDIENTE DE VALIDAR` donde el comportamiento no está comprobado en código

---

## Archivos creados o modificados

| Archivo | Acción | Notas |
|---|---|---|
| `sql/dev/2026-08-11_test_schema_safe_run.sql` | Creado | Wrapper seguro — resultados en tabla temporal |
| `sql/local/2026-08-11_test_behavioral_ledger_local.sql` | Creado | Script conductual corregido para PostgreSQL local |
| `docs/FASE3_RESULTADOS_PREFLIGHT.md` | Creado | Matriz completa de resultados, defectos, hipótesis, evidencia |
| `docs/FASE3_1_ENTREGA.md` | Creado | Este archivo |

No se modificaron migraciones, código productivo, Edge Functions ni frontend.

---

## Resumen de resultados DEV

| Estado | Cantidad | Tests |
|---|---|---|
| PASS | 15 | T-01, T-02, T-04–T-16 |
| FAIL (esperado) | 1 | T-03 — migración `20260812100000` pendiente |
| NO ejecutado en DEV | — | Todo el script conductual |

---

## Próxima compuerta

Requiere aprobación explícita antes de continuar:

1. **R1** — `supabase migration repair --status applied` (7 migraciones sin registrar)
2. **R2** — Aplicar `20260812100000` en DEV (fix `5201 → 5102`)
3. **R3** — Re-run `test_schema_safe_run.sql` → esperado 16/16 PASS
4. **R4** — Ejecutar `test_behavioral_ledger_local.sql` en PostgreSQL local
5. **R5** — Nueva migración para GAP-01 (`pay->>'method' IS NULL`)

**Detenido. Esperando aprobación.**
