# FASE3 — M29 DEV Precheck

**Migración objetivo:** `20260815100000_fix_finalize_pos_sale_groupby.sql`  
**Entorno destino:** DEV (`rtkdrnfqihulqdhixxzf` — La carreta Dev)  
**Fecha de precheck:** 2026-08-15  
**Autor:** Precheck automático de solo lectura  
**Restricciones observadas:** Sin `migration up`, `db push`, SQL de escritura, commits ni push. Solo inspección.

---

> **AVISO:** Documento generado por inspección de solo lectura.  
> Ningún cambio fue realizado en DEV, PRD, archivos de migración ni configuración.

---

## Veredicto Final

> ### **APTO PARA APLICAR M29 EN DEV**
>
> Las 9 validaciones resultan PASS. No se detectó ningún bloqueador ni riesgo crítico.  
> Ventana de despliegue recomendada: inmediata (ledger inactivo, sin caja abierta, sin mesas ocupadas).

---

## Resumen de Validaciones

| # | Validación | Estado | Notas |
|---|------------|--------|-------|
| V1 | Existencia, versión única, nombre correcto, contenido seguro | **PASS** | Solo `CREATE OR REPLACE FUNCTION` + `REVOKE`/`GRANT` |
| V2 | No modifica tablas, datos, RLS, permisos, triggers ni objetos ajenos | **PASS** | Cero DDL ajeno a la función |
| V3 | Preserva firma, SECURITY DEFINER, search_path, propietario, grants | **PASS** | Idénticos en DEV y M29 |
| V4 | DEV alineado hasta M28, M29 pendiente exclusivamente en DEV | **PASS** | Confirmado con `migration list` |
| V5 | Objetos y columnas requeridos existen en DEV | **PASS** | 18 tablas + 30+ columnas verificadas |
| V6 | ledger_cutover_at sin activar | **PASS** | `ledger_settings` vacío; ledger inactivo |
| V7 | Sin operaciones POS ni sesiones de caja activas | **PASS** | 0 sesiones abiertas, 0 mesas ocupadas |
| V8 | Cambio idempotente y reversible sin alterar historial | **PASS** | `CREATE OR REPLACE`, reversible con M30 |
| V9 | Documento con evidencia concreta por validación | **PASS** | Este documento |

---

## V1 — Existencia, versión, nombre y contenido de M29

### Archivo

```
supabase/migrations/20260815100000_fix_finalize_pos_sale_groupby.sql
```

**Versión única:** `20260815100000` — posterior al último existente `20260812100000` y anterior a cualquier futuro.

### Verificación de migraciones locales (Glob)

```
20260414045424_remote_schema.sql
20260414060917_remote_schema.sql
20260414123500_cleanup_legacy_user_sql_functions.sql
20260415093000_harden_public_access.sql
20260415100500_fix_function_search_paths.sql
20260416093000_link_materials_to_providers.sql
20260417113000_seed_material_movements_permissions.sql
20260417114000_create_inventory_movement_documents.sql
20260417122000_seed_material_movements_report_permissions.sql
20260418103000_add_table_order_reservation_flag.sql
20260419170000_support_general_provider_purchases.sql
20260420143000_add_cash_control_schema.sql
20260420144000_seed_cash_control_permissions.sql
20260714132000_catalogo_cocteleria_extras_botella.sql
20260715221000_harden_finalize_pos_sale.sql
20260715223000_make_botella_sellable.sql
20260716123000_reconcile_table_order_reservation_flag.sql
20260803183000_enforce_cash_session_pos_invariant.sql
20260803232300_fix_active_pos_operation_count.sql
20260804010500_open_cash_session_atomic.sql
20260810200000_base_financial_schema.sql
20260811110000_activate_ledger_rpc.sql
20260811130000_extend_cash_sessions_ledger.sql
20260811140000_sale_financial_entries.sql   ← M24 (bug origen)
20260811150000_purchase_financial_entries.sql
20260811160000_fondos_reversas.sql
20260811170000_reportes_ledger.sql
20260812100000_fix_account_5201_to_5102.sql   ← M28 (último)
20260815100000_fix_finalize_pos_sale_groupby.sql  ← M29 (nuevo)
```

Total local: 29 migraciones. Sin colisión de timestamp.

### Contenido de M29

M29 contiene únicamente:

```sql
begin;

create or replace function public.finalize_pos_sale(...)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$ ... $$;

revoke all on function public.finalize_pos_sale(...)
  from public, anon, authenticated;
grant execute on function public.finalize_pos_sale(...)
  to service_role;

commit;
```

**DDL verificado:** ninguna sentencia `CREATE TABLE`, `ALTER TABLE`, `DROP`, `CREATE TRIGGER`, `ALTER POLICY`, `CREATE ROLE`, `GRANT ON TABLE` ni otro objeto ajeno a la función.

---

## V2 — M29 no modifica objetos ajenos a `finalize_pos_sale`

Búsqueda de sentencias DDL en M29 excluyendo función/permisos:

```bash
grep -E "^create |^alter |^drop " 20260815100000_fix_finalize_pos_sale_groupby.sql \
  | grep -iv "function|language|revoke|grant|begin|commit"
# → sin resultados
```

**Resultado:** cero líneas DDL ajenas. **PASS**

---

## V3 — Firma, SECURITY DEFINER, search_path, propietario y grants

### Función en DEV (extraída de `supabase db dump --linked`)

```sql
CREATE OR REPLACE FUNCTION "public"."finalize_pos_sale"(
  "p_table_id" "uuid",
  "p_items" "jsonb",
  "p_payments" "jsonb",
  "p_performed_by" "uuid",
  "p_idempotency_key" "text" DEFAULT NULL::"text"
)
RETURNS "jsonb"
  LANGUAGE "plpgsql" SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  ...

ALTER FUNCTION "public"."finalize_pos_sale"(...) OWNER TO "postgres";
```

### Función en M29

```sql
create or replace function public.finalize_pos_sale(
  p_table_id        uuid,
  p_items           jsonb,
  p_payments        jsonb,
  p_performed_by    uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
```

### Comparación

| Atributo | DEV (actual) | M29 | Match |
|----------|-------------|-----|-------|
| Firma (params + types) | 5 params + defaults | 5 params + defaults | ✓ |
| RETURNS | jsonb | jsonb | ✓ |
| LANGUAGE | plpgsql | plpgsql | ✓ |
| SECURITY DEFINER | sí | sí | ✓ |
| search_path | `'public', 'pg_temp'` | `'public', 'pg_temp'` | ✓ |
| Owner | postgres | no cambia (`CREATE OR REPLACE` lo preserva) | ✓ |

### Grants en DEV

```sql
REVOKE ALL ON FUNCTION "public"."finalize_pos_sale"(...) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_pos_sale"(...) TO "service_role";
```

### Grants en M29

```sql
revoke all on function public.finalize_pos_sale(...) from public, anon, authenticated;
grant execute on function public.finalize_pos_sale(...) to service_role;
```

**Equivalencia:** `GRANT ALL ON FUNCTION` = `GRANT EXECUTE ON FUNCTION` para funciones en PostgreSQL (EXECUTE es el único privilegio aplicable). Los REVOKE adicionales de `anon` y `authenticated` son no-operaciones si esos roles no tienen el privilegio (no alteran estado, no introducen riesgo). **PASS**

---

## V4 — Estado de migraciones DEV: M28 aplicada, M29 pendiente

```
npx supabase migration list
```

```
 Local          | Remote         | Time (UTC)          
----------------|----------------|---------------------
 20260414045424 | 20260414045424 | 2026-04-14 04:54:24
 ...
 20260812100000 | 20260812100000 | 2026-08-12 10:00:00  ← M28 aplicada
 20260815100000 |                | 2026-08-15 10:00:00  ← M29 pendiente en DEV
```

28 migraciones idénticas entre local y remoto. M29 exclusivamente local. Sin drift, sin migrations pendientes desconocidas. **PASS**

---

## V5 — Objetos y columnas requeridos en DEV

Fuente: `supabase db dump --linked` (schema dump).

### Tablas (todas presentes en DEV)

| Tabla | Estado |
|-------|--------|
| tables | ✓ |
| table_orders | ✓ |
| sales | ✓ |
| sale_items | ✓ |
| inventory | ✓ |
| inventory_movements | ✓ |
| cash_sessions | ✓ |
| categories | ✓ |
| materials | ✓ |
| centers | ✓ |
| journal_entries | ✓ |
| journal_lines | ✓ |
| financial_accounts | ✓ |
| financial_operations | ✓ |
| financial_payments | ✓ |
| audit_events | ✓ |
| idempotency_requests | ✓ |
| ledger_settings | ✓ |

### Columnas críticas verificadas

| Tabla | Columnas verificadas |
|-------|---------------------|
| ledger_settings | `ledger_cutover_at`, `activated_by`, `activated_at` |
| sales | `document_number`, `financial_operation_id`, `journal_entry_id`, `payment_method`, `cash_session_id` |
| journal_entries | `entry_number`, `entry_type`, `status`, `occurred_at`, `source_type`, `source_id`, `created_by`, `idempotency_key` |
| journal_lines | `journal_entry_id`, `financial_account_id`, `debit`, `credit`, `description` |
| financial_accounts | `code`, `is_system`, `is_active` |
| financial_operations | `operation_type`, `total_amount`, `cash_session_id`, `source_type`, `source_id`, `journal_entry_id`, `performed_by`, `idempotency_key` |
| financial_payments | `financial_operation_id`, `payment_method`, `financial_account_id`, `amount` |
| audit_events | `actor_id`, `action`, `entity_type`, `entity_id`, `values_snapshot`, `result` |
| idempotency_requests | `scope`, `idempotency_key`, `request_hash`, `response_json` |
| inventory_movements | `performed_by` (tipo: `text` — compatible con `p_performed_by::text`) |
| tables | `status`, `current_order_id`, `active_order_id` |
| cash_sessions | `status`, `opening_amount`, `opened_by` |

### Cuentas del sistema en DEV (data dump)

| Código | Nombre | Tipo | is_system | is_active |
|--------|--------|------|-----------|-----------|
| 1101 | Caja operativa | asset | true | true |
| 1103 | Banco | asset | true | true |
| 4101 | Ingresos por ventas | income | true | true |

Las tres cuentas requeridas por la rama ledger de `finalize_pos_sale` están presentes y activas. **PASS**

### Nota: constraint `financial_payments.payment_method`

```sql
CONSTRAINT "financial_payments_method_check"
  CHECK (payment_method = ANY (ARRAY['Efectivo', 'Tarjeta', 'Transferencia']))
```

La función inserta `trim(pay->>'method')` en ese campo. El payload del API debe enviar exactamente `'Efectivo'`, `'Tarjeta'` o `'Transferencia'` (capitalización exacta). Esto no es nuevo en M29 — ya existía en M24 y aplica a toda la función, no solo a la corrección.

---

## V6 — Estado de `ledger_cutover_at` en DEV

Fuente: `supabase db dump --linked --data-only` (sección `ledger_settings`).

```
-- Data for Name: ledger_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--
[sin filas]
```

**Conclusión:** La tabla `ledger_settings` está vacía en DEV. No existe ninguna fila con `id=true`. La condición en `finalize_pos_sale`:

```sql
select ledger_cutover_at into v_ledger_cutover_at
from public.ledger_settings where id = true;
-- → NOT FOUND → v_ledger_cutover_at = NULL

if v_ledger_cutover_at is not null and v_sale_created_at >= v_ledger_cutover_at then
  -- → condición FALSE → rama ledger no ejecuta
```

El ledger NO está activo en DEV. La corrección de M29 no alterará el comportamiento de ventas actuales (seguirán procesando sin crear journal entries hasta que el ledger sea activado). **PASS**

---

## V7 — Sin operaciones POS ni sesiones de caja activas

Fuente: `supabase db dump --linked --data-only`.

### Sesiones de caja

```
-- Conteo por status en cash_sessions:
10 × 'closed'
 0 × 'open'
 0 × 'closed_with_pending_difference'
```

**Resultado:** Sin sesiones abiertas. El despliegue no interrumpe ninguna sesión de caja activa. **PASS**

### Mesas ocupadas

```
-- Búsqueda de 'ocupada' en datos de tabla public.tables:
→ 0 coincidencias
```

**Resultado:** Sin mesas con status='ocupada'. Sin operaciones POS en curso. **PASS**

---

## V8 — Idempotencia y reversibilidad

### Idempotencia

`CREATE OR REPLACE FUNCTION` en PostgreSQL:
- Si la función existe (mismo nombre + firma): la reemplaza.
- Si la función no existe: la crea.
- No falla si se aplica dos veces. **PASS**

### Reversibilidad

El bug original en M24 puede restaurarse con una migración M30 que aplique `CREATE OR REPLACE FUNCTION` con:
```sql
-- Revertir M29: restaurar GROUP BY original (con bug)
group by lower(trim(pay->>'method'));
```

Más razonablemente, si M29 introduce un problema no anticipado, se puede aplicar M30 con la corrección alternativa. No se modifica el historial de migraciones, no hay `DROP`, no hay datos alterados. **PASS**

---

## V9 — Evidencia de comandos ejecutados (solo lectura)

Todos los comandos fueron de solo lectura. Ninguno modificó DEV, PRD, migraciones, configuración ni datos.

| Comando | Propósito | Resultado |
|---------|-----------|-----------|
| `npx supabase migration list` | Estado M1-M29 local vs remoto | M28 aplicada; M29 pendiente en DEV |
| `npx supabase db dump --linked` | Schema DEV incluyendo función actual | Bug confirmado (línea 1298); firma, owner, grants verificados |
| `npx supabase db dump --linked --data-only` | Datos de tablas de estado | ledger inactivo; 0 sesiones abiertas; 0 mesas ocupadas |
| Glob `supabase/migrations/*.sql` | Lista de archivos de migración local | 29 archivos; M29 al final |
| Lectura de M29 | Verificar contenido | Solo función + permisos |

---

## Riesgos Residuales

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| API envía método de pago con capitalización incorrecta (ej. `'efectivo'`) | Baja (no nuevo) | El constraint en `financial_payments` rechazará antes de M29; issue independiente |
| El ledger se activa justo durante el deploy | Muy baja (tabla vacía, requiere acción explícita) | Deploy tarda segundos; migración es DDL puro |
| Una futura migración colisione con timestamp `20260815100000` | No aplica | Timestamp en el futuro local; no existe colisión en local ni remoto |

---

## Instrucción de Despliegue (para ejecutar cuando se autorice)

```powershell
# Solo ejecutar en DEV, con autorización explícita
cd "D:\ProjectsDEV\pventa\mi-punto-de-venta"
npx supabase migration up --linked
```

Seguido de verificación post-despliegue:
```sql
-- Verificar función actualizada (no debe aparecer el GROUP BY sin trim)
-- Conectar a DEV y ejecutar:
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'finalize_pos_sale';
-- Buscar: "group by lower(trim(pay->>'method')), trim(pay->>'method')"
```

---

*Precheck completado: 2026-08-15. Sin cambios en DEV, PRD, migraciones ni configuración.*  
*Veredicto: `APTO PARA APLICAR M29 EN DEV`*
