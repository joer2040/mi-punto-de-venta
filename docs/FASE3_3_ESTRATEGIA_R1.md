# Fase 3.3 — Estrategia R1: Alineación del Historial de Migraciones DEV

**Fecha de diseño:** 2026-08-12  
**Rama:** `chore/code-cleanup`  
**Proyecto DEV:** `rtkdrnfqihulqdhixxzf`  
**Estado:** DISEÑO ÚNICAMENTE — ningún comando ejecutado

---

## Contexto

`supabase migration list --linked` muestra las 7 migraciones del ledger con columna Remote vacía. Los objetos ya existen en DEV (confirmado en Fase 3.2: 11 tablas, 25 constraints, 28 índices, 14 funciones, 2 triggers, 12 grants — todos EXIST). El historial de la tabla `supabase_migrations.schema_migrations` de DEV no tiene registros para esas versiones.

`migration repair --status applied` inserta un registro en el historial remoto de migraciones. No ejecuta el SQL de la migración ni modifica por sí mismo los objetos de negocio. Sólo puede usarse si DEV ya representa fielmente esa migración local.

---

## Prerrequisitos (verificar antes de ejecutar R1)

| # | Verificación | Comando | Criterio de éxito |
|---|---|---|---|
| P1 | Historial actual confirma Remote vacío para las 7 | `npx supabase migration list --linked` | Las 7 versiones sin Remote |
| P2 | Proyecto DEV enlazado y accesible | `npx supabase migration list --linked` | El comando consulta correctamente el proyecto `rtkdrnfqihulqdhixxzf` y muestra el historial remoto esperado |
| P3 | Ledger inactivo en DEV | Confirmar `ledger_cutover_at = NULL` | T-12 PASS del preflight anterior |
| P4 | `20260812100000` fuera de lista de repair | Revisión manual | No incluirla en ningún comando R1 |
| P5 | Captura de estado previo y evidencia de auditoría | Ver detalle bajo la tabla | Ver detalle bajo la tabla |
| P6 | Verificación de cuerpos completos y privilegios efectivos de funciones no inspeccionadas en Fase 3.2 | Ver detalle bajo la tabla | Todo `Coincide`; sin `Difiere`, `No existe` ni `No verificable` |

> **Nota P2:** `supabase status` verifica el stack local y no constituye evidencia de conexión al proyecto remoto DEV. La evidencia de enlace remoto para R1 es la ejecución exitosa de `migration list --linked` contra el proyecto esperado.

### Detalle P5 — Captura de estado previo y evidencia de auditoría

Antes de ejecutar cualquier comando de R1, documentar y conservar:

1. Salida completa de `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;` ejecutada en Supabase SQL Editor del proyecto DEV.
2. Salida de `npx supabase migration list --linked`.
3. Fecha y hora UTC exacta, identificador del proyecto (`rtkdrnfqihulqdhixxzf`) y nombre del ejecutor.
4. **Nota:** esto es evidencia de auditoría, no un respaldo integral de DEV. No sustituye a un backup de base de datos.

### Detalle P6 — Verificación de cuerpos completos y privilegios efectivos

Las siguientes funciones no tuvieron verificación de cuerpo completo en Fase 3.2. **Bloquean R1** si alguna arroja `Difiere`, `No existe` o `No verificable`:

**Cuerpos a comparar (DEV vs SQL local):**
- `record_transfer`
- `record_owner_contribution`
- `resolve_cash_discrepancy`
- `get_journal_report`
- `get_account_ledger`
- `get_cash_sessions_report`

Obtener definición real con `pg_get_functiondef(p.oid)` y comparar contra el fuente local en `supabase/migrations/20260811160000_fondos_reversas.sql` y `20260811170000_reportes_ledger.sql`.

**Privilegios efectivos a verificar para cada función crítica:**

```sql
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'record_transfer',
    'record_owner_contribution',
    'resolve_cash_discrepancy',
    'get_journal_report',
    'get_account_ledger',
    'get_cash_sessions_report'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
```

Resultado esperado:

- La consulta debe devolver exactamente 6 filas: una por cada función incluida en la lista de P6.
- No debe faltar ninguna función esperada.
- No debe aparecer ninguna sobrecarga o función adicional con los nombres consultados.
- Para cada una de las 6 filas:
  - `anon_can_exec = false`
  - `authenticated_can_exec = false`
  - `service_role_can_exec = true`
- Cualquier ausencia, fila adicional o valor distinto bloquea R1.

---

## Comandos de R1 (en orden cronológico estricto)

> **Ejecutar uno a uno. Verificar `migration list` después de cada uno antes de continuar.**

```powershell
# Directorio: D:\ProjectsDEV\pventa\mi-punto-de-venta
cd "D:\ProjectsDEV\pventa\mi-punto-de-venta"

# 1 de 7
npx supabase migration repair 20260810200000 --status applied --linked
npx supabase migration list --linked
# ✔ Confirmar: 20260810200000 aparece en Remote
# ✔ Confirmar: ninguna otra versión nueva en Remote
# ✔ Confirmar: 20260812100000 sigue sin Remote
# ✗ Si aparece versión inesperada o falla la validación: DETENER y escalar

# 2 de 7
npx supabase migration repair 20260811110000 --status applied --linked
npx supabase migration list --linked
# ✔ Confirmar: 20260811110000 aparece en Remote
# ✔ Confirmar: ninguna otra versión nueva en Remote
# ✔ Confirmar: 20260812100000 sigue sin Remote
# ✗ Si aparece versión inesperada o falla la validación: DETENER y escalar

# 3 de 7
npx supabase migration repair 20260811130000 --status applied --linked
npx supabase migration list --linked
# ✔ Confirmar: 20260811130000 aparece en Remote
# ✔ Confirmar: ninguna otra versión nueva en Remote
# ✔ Confirmar: 20260812100000 sigue sin Remote
# ✗ Si aparece versión inesperada o falla la validación: DETENER y escalar

# 4 de 7
npx supabase migration repair 20260811140000 --status applied --linked
npx supabase migration list --linked
# ✔ Confirmar: 20260811140000 aparece en Remote
# ✔ Confirmar: ninguna otra versión nueva en Remote
# ✔ Confirmar: 20260812100000 sigue sin Remote
# ✗ Si aparece versión inesperada o falla la validación: DETENER y escalar

# 5 de 7
npx supabase migration repair 20260811150000 --status applied --linked
npx supabase migration list --linked
# ✔ Confirmar: 20260811150000 aparece en Remote
# ✔ Confirmar: ninguna otra versión nueva en Remote
# ✔ Confirmar: 20260812100000 sigue sin Remote
# ✗ Si aparece versión inesperada o falla la validación: DETENER y escalar

# 6 de 7
npx supabase migration repair 20260811160000 --status applied --linked
npx supabase migration list --linked
# ✔ Confirmar: 20260811160000 aparece en Remote
# ✔ Confirmar: ninguna otra versión nueva en Remote
# ✔ Confirmar: 20260812100000 sigue sin Remote
# ✗ Si aparece versión inesperada o falla la validación: DETENER y escalar

# 7 de 7
npx supabase migration repair 20260811170000 --status applied --linked
npx supabase migration list --linked
# ✔ Confirmar: 20260811170000 aparece en Remote
# ✔ Confirmar: ninguna otra versión nueva en Remote
# ✔ Confirmar: 20260812100000 sigue sin Remote
# ✗ Si aparece versión inesperada o falla la validación: DETENER y escalar
```

---

## Verificación Post-R1 (criterios de éxito)

### Criterio 1 — Historial sincronizado

`npx supabase migration list --linked` debe mostrar:

```
   Local          | Remote
  20260810200000  | 20260810200000
  20260811110000  | 20260811110000
  20260811130000  | 20260811130000
  20260811140000  | 20260811140000
  20260811150000  | 20260811150000
  20260811160000  | 20260811160000
  20260811170000  | 20260811170000
  20260812100000  |                  ← correcto: aún sin Remote
```

### Criterio 2 — Objetos DEV intactos

Re-ejecutar `sql/dev/2026-08-11_test_schema_safe_run.sql` contra DEV:

```powershell
npx supabase db query --linked --file "sql/dev/2026-08-11_test_schema_safe_run.sql"
```

Resultado esperado: **15/16 PASS** (T-03 sigue FAIL hasta aplicar `20260812100000`). Si algún test que antes pasaba ahora falla, hay regresión — escalar inmediatamente.

### Criterio 3 — `schema_migrations` solo tiene las versiones correctas

Consulta en Supabase SQL Editor (DEV):

```sql
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
WHERE version BETWEEN '20260810000000' AND '20260811999999'
ORDER BY version;
```

Resultado esperado: 7 filas, una por versión. Sin `20260812100000`.

---

## Plan de Rollback

`supabase migration repair` admite `--status reverted`. Para deshacer cualquier paso:

```powershell
# Revertir una versión específica (ejemplo: deshacer el paso 7)
npx supabase migration repair 20260811170000 --status reverted --linked

# Si se quiere revertir todo R1:
npx supabase migration repair 20260811170000 --status reverted --linked
npx supabase migration repair 20260811160000 --status reverted --linked
npx supabase migration repair 20260811150000 --status reverted --linked
npx supabase migration repair 20260811140000 --status reverted --linked
npx supabase migration repair 20260811130000 --status reverted --linked
npx supabase migration repair 20260811110000 --status reverted --linked
npx supabase migration repair 20260810200000 --status reverted --linked
```

**`--status reverted` elimina únicamente el registro en `schema_migrations`. No revierte objetos de esquema, no ejecuta SQL de rollback, y no modifica datos. Si cualquier comando falla o el estado resultante no coincide con el esperado, detener y escalar — no continuar con los siguientes pasos.

---

## Análisis de Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| `repair` modifica objetos de esquema | **Nula** | — | Por diseño, `repair` solo escribe en `schema_migrations`. Confirmado en docs Supabase. |
| `supabase db push` accidental post-R1 ejecuta `20260812100000` | Baja | Alto | `20260812100000` seguirá como Local-only. Un `db push` sí la ejecutaría. **No ejecutar `db push` hasta completar R2 y obtener aprobación.** |
| Orden incorrecto de versiones | Baja | Bajo | Los comandos están en orden cronológico estricto. `schema_migrations` no impone FK entre versiones. |
| DEV no acepta repair (permisos) | Baja | Medio | Verificar con P2 antes. Si falla, escalar — no intentar workarounds. |
| Versión `20260812100000` incluida por error | Baja | Alto | Listar versiones en los comandos explícitamente. Revisar antes de ejecutar cada uno. |

---

## Lo que R1 NO Resuelve

| Pendiente | Descripción | Proceso requerido |
|---|---|---|
| **R2** | Aplicar `20260812100000` en DEV (`5201 → 5102`, nuevo `create_purchase_with_ledger`) | Aprobación separada; ejecutar como migración incremental normal |
| **R3** | Re-run del preflight post-R2 (esperado 16/16 PASS) | Posterior a R2 |
| **R4** | Ejecutar `test_behavioral_ledger_local.sql` en PostgreSQL local | Requiere base local con todas las migraciones |
| **R5** | Fix GAP-01 (`pay->>'method' IS NULL` en `finalize_pos_sale`) | Nueva migración, aprobación separada |
| **Cuerpos completos no verificados** | `record_transfer`, `record_owner_contribution`, `resolve_cash_discrepancy`, RPCs de reporte | Cubierto por P6 — bloquea R1 hasta aprobación |
| **REVOKE en anon/authenticated** | No verificado en Fase 3.2 | Cubierto por P6 — bloquea R1 hasta aprobación con `has_function_privilege()` |

---

## Impacto en Flujo de Trabajo Post-R1

Una vez completado R1:

- `supabase migration list --linked` — historial limpio para las 7 versiones del ledger.
- `supabase db push` — solo intentará aplicar `20260812100000`. **Seguirá sin autorización hasta R2.**
- Nuevas migraciones futuras — podrán crearse y aplicarse con flujo normal.
- Homologación DEV/PRD — R1 es prerrequisito para eventual apply en PRD (Fases 8.x).

---

## Secuencia Recomendada de Compuertas

```
R1 (este documento)
  └─ Aprobación explícita
     └─ Ejecutar 7 × migration repair
        └─ Verificación: migration list + preflight 15/16
           └─ R2: aprobación para 20260812100000
              └─ Aplicar como migration normal
                 └─ R3: preflight → 16/16 PASS
                    └─ R4: pruebas locales conductuales
                       └─ R5: GAP-01 fix migration
```

---

## Evidencia de No Ejecución

- Ningún comando ejecutado en esta actividad.
- Ningún archivo del proyecto modificado.
- Documento generado como análisis y diseño únicamente.
- Estado DEV sin cambios respecto al cierre de Fase 3.2.

---

R1 sólo estará listo para autorización cuando P1–P6 estén aprobados y `20260812100000` permanezca excluida.

**Detenido. Esperando aprobación explícita para ejecutar R1.**
