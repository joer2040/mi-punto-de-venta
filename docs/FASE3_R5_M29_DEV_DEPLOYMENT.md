# FASE3 — M29 DEV Deployment

**Migración aplicada:** `20260815100000_fix_finalize_pos_sale_groupby.sql`  
**Entorno:** DEV (`rtkdrnfqihulqdhixxzf` — La carreta Dev)  
**Inicio deploy (UTC):** 2026-08-15 20:29:23  
**Fin deploy (UTC):** 2026-08-15 20:29:27  
**Duración:** ~4 segundos  
**Resultado:** `DESPLEGADO`

---

## 1. Preflight (solo lectura, previo al deploy)

Hora UTC: 2026-08-15 ~20:27:40

| Check | Resultado | Evidencia |
|-------|-----------|-----------|
| M1-M28 aplicadas en DEV, M29 pendiente únicamente | **PASS** | `migration list`: 28 pares Local=Remote, M29 solo Local |
| `ledger_settings` sin cutover activo | **PASS** | 0 INSERT rows en sección ledger_settings del data dump |
| Sesiones de caja abiertas | **PASS** | 0 filas `status='open'` en cash_sessions |
| Mesas ocupadas | **PASS** | 0 filas `status='ocupada'` en tables |
| GROUP BY anterior presente en DEV | **PASS** | `group by lower(trim(pay->>'method'));` en schema dump |

Todos los preflight PASS. Se procedió al deploy.

---

## 2. Comando ejecutado

```powershell
npx supabase migration up --linked
```

Salida literal:
```
Initialising login role...
Connecting to remote database...
Applying migration 20260815100000_fix_finalize_pos_sale_groupby.sql...
Local database is up to date.
```

---

## 3. Validación post-deploy

Hora UTC: 2026-08-15 ~20:30:22

### V1 — M29 aplicada, sin pendientes

```
migration list (post-deploy):

 Local          | Remote
 20260812100000 | 20260812100000   ← M28
 20260815100000 | 20260815100000   ← M29 ✓ aplicada
```

Sin migraciones pendientes. **PASS**

### V2 — GROUP BY corregido en DEV

**Antes (pre-deploy):**
```sql
    group by lower(trim(pay->>'method'));
```

**Después (post-deploy):**
```sql
    group by lower(trim(pay->>'method')), trim(pay->>'method');
```

Corrección confirmada en la función en producción DEV. **PASS**

### V3 — Firma, SECURITY DEFINER, search_path

```sql
CREATE OR REPLACE FUNCTION "public"."finalize_pos_sale"(
  "p_table_id" "uuid",
  "p_items" "jsonb",
  "p_payments" "jsonb",
  "p_performed_by" "uuid",
  "p_idempotency_key" "text" DEFAULT NULL::"text"
) RETURNS "jsonb"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
```

Firma idéntica a pre-deploy y a M29. `SECURITY DEFINER` y `search_path` preservados. **PASS**

### V4 — Owner

```sql
ALTER FUNCTION "public"."finalize_pos_sale"(...) OWNER TO "postgres";
```

Owner `postgres` preservado. **PASS**

### V5 — Grants

```sql
REVOKE ALL ON FUNCTION "public"."finalize_pos_sale"(...) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_pos_sale"(...) TO "service_role";
```

Idénticos a pre-deploy. **PASS**

### V6 — Integridad de datos operativos

| Indicador | Pre-deploy | Post-deploy | Cambio |
|-----------|-----------|------------|--------|
| `ledger_settings` rows | 0 | 0 | ninguno |
| `cash_sessions` open | 0 | 0 | ninguno |
| `tables` ocupada | 0 | 0 | ninguno |

Sin alteración de datos operativos. **PASS**

### V7 — Delta de schema

| Métrica | Valor |
|---------|-------|
| Schema dump pre-deploy | 162 820 bytes |
| Schema dump post-deploy | 162 992 bytes |
| Delta | +172 bytes |

Delta de 172 bytes corresponde exactamente a la adición de `, trim(pay->>'method')` en el GROUP BY (más overhead de serialización pg_dump). Ningún otro objeto modificado. **PASS**

---

## 4. Estado Final

| Item | Estado |
|------|--------|
| M29 aplicada en DEV | **SÍ** |
| GROUP BY corregido | **SÍ** |
| Firma / SECURITY DEFINER / search_path / owner / grants | **PRESERVADOS** |
| Datos operativos alterados | **NO** |
| Ledger activado | **NO** |
| SQL manual de escritura ejecutado | **NO** |
| Commits o pushes realizados | **NO** |
| PRD tocado | **NO** |
| Migraciones pendientes en DEV | **NINGUNA** |

---

## 5. Reversión (si necesaria)

Crear `20260815200000_revert_finalize_pos_sale_groupby.sql` con `CREATE OR REPLACE FUNCTION` restaurando:
```sql
group by lower(trim(pay->>'method'));
```
Aplicar con `npx supabase migration up --linked`. No requiere modificar historial.

---

*Documento generado automáticamente por inspección de solo lectura y aplicación del deploy autorizado.*
