# Análisis de Migraciones — Riesgo para PRD

**Fecha:** 2026-08-17  
**Alcance:** Tres migraciones marcadas ⚠️ en `ANALISIS_REGLAS_NEGOCIO_DEV_VS_PRD.md`.  
**Método:** Lectura completa del SQL de cada migración + comparación contra la versión PRD actual de cada función.  
**NO AUTORIZADO:** Sin cambios de código, DB, commits ni push.

---

## Contexto: Estado actual de PRD

Función `finalize_pos_sale` en PRD (migración `20260715221000_harden_finalize_pos_sale.sql`):
- Firma: `(p_table_id uuid, p_items jsonb, p_payment_method text, p_performed_by uuid)`
- Solo acepta `'Efectivo'` — excepción si otro método
- Requiere caja abierta SIEMPRE (sin importar método de pago)
- Sin ledger, sin idempotencia

Tabla `cash_sessions` en PRD:
- Columnas existentes: id, status, initial_cash, expected_cash_total, etc.
- Constraint: `status in ('open', 'closed')`

Tablas `financial_operations`, `financial_payments`: no existen en PRD.

---

## Migración 1: `20260811130000_extend_cash_sessions_ledger.sql`

### Qué cambia exactamente

```sql
-- Tres columnas nullable nuevas en cash_sessions:
alter table public.cash_sessions
  add column if not exists first_counted_cash  numeric(14,2),
  add column if not exists final_counted_cash  numeric(14,2),
  add column if not exists difference_amount   numeric(14,2);

-- Constraint de status extendida:
alter table public.cash_sessions
  drop constraint if exists cash_sessions_status_check;
alter table public.cash_sessions
  add constraint cash_sessions_status_check
    check (status in ('open', 'closed', 'closed_with_pending_difference'));
```

### Modifica funciones/triggers existentes

No. Solo estructura de tabla y constraint CHECK.

### Aditiva vs altera comportamiento

Completamente aditiva:
- Columnas: `if not exists` + nullable + sin DEFAULT NOT NULL → filas existentes quedan con NULL. Safe.
- Constraint: `drop constraint if exists` no falla si no existe. La nueva constraint incluye todos los valores anteriores (`'open'`, `'closed'`) más uno nuevo. Filas existentes con `'open'` o `'closed'` pasan el nuevo CHECK sin problema.
- La función `close_cash_session_atomic` NO se modifica en esta migración. Sigue escribiendo `'closed'`. El nuevo status `'closed_with_pending_difference'` solo sería usado por código nuevo que aún no existe en PRD.

### Impacto potencial

| Área | Impacto |
|---|---|
| Apertura de caja | Ninguno |
| Cierre de caja | Ninguno — `close_cash_session_atomic` no se modifica |
| Venta POS | Ninguno |
| Mesas/barras activas | Ninguno |
| `finalize_pos_sale` | Ninguno |
| `cash_sessions` existentes | Cero. Filas válidas bajo nueva constraint. Columnas nuevas = NULL |

### Riesgo

**BAJO**

### Recomendación

**Promoción segura.** No requiere pruebas adicionales. Totalmente aditiva y sin efecto en código existente.

---

## Migración 2: `20260811140000_sale_financial_entries.sql`

### Qué cambia exactamente

**Parte aditiva (segura):**

```sql
-- Crea tablas nuevas:
create table if not exists public.financial_operations (...)
create table if not exists public.financial_payments (...)

-- Agrega columnas nullable a sales:
alter table public.sales
  add column if not exists financial_operation_id uuid,
  add column if not exists journal_entry_id        uuid;

-- Agrega FKs con manejo de duplicado:
do $$ begin alter table public.sales add constraint ... end $$;

-- Índices condicionales:
create index if not exists sales_financial_operation_idx ...
create index if not exists sales_journal_entry_idx ...
```

**Parte crítica — firma de finalize_pos_sale:**

```sql
-- Elimina función PRD actual:
drop function if exists public.finalize_pos_sale(uuid, jsonb, text, uuid);

-- Crea nueva función con firma diferente:
create or replace function public.finalize_pos_sale(
  p_table_id        uuid,
  p_items           jsonb,
  p_payments        jsonb,          -- era: p_payment_method text
  p_performed_by    uuid,
  p_idempotency_key text default null   -- parámetro nuevo
)
```

### Modifica funciones/triggers existentes

**Sí. `finalize_pos_sale` es reemplazada completamente.**  
DROP de firma `(uuid, jsonb, text, uuid)` + CREATE de firma `(uuid, jsonb, jsonb, uuid, text)`.  
No hay overload — la firma antigua desaparece.

### Aditiva vs altera comportamiento

No es aditiva para `finalize_pos_sale`. Es un reemplazo de firma con cambios de comportamiento:

| Aspecto | PRD (vieja) | DEV (nueva) |
|---|---|---|
| Métodos de pago | Solo `'Efectivo'` | `'Efectivo'`, `'Tarjeta'`, `'Transferencia'` |
| Parámetro de pago | `p_payment_method text` | `p_payments jsonb` (array de {method, amount}) |
| Caja requerida | Siempre (sin excepción) | Solo si `v_cash_amount > 0` |
| Idempotencia | Sin soporte | `p_idempotency_key` (opcional) |
| Ledger | Sin asientos | Crea asientos si `ledger_cutover_at IS NOT NULL` |
| Validación total pago | No aplica (solo Efectivo) | `sum(payments) ≈ total_amount` (margen ±0.01) |

**Reglas de negocio conservadas intactas:**
- Cubeta Mixta: 10 piezas exactas, $32, 5 SKUs whitelisted
- Cubeta Caguamita: 5 piezas exactas, $26, SKU único
- Precios del servidor (inventario), no del cliente
- Locking `FOR UPDATE` en `tables`, `inventory`
- Advisory lock para número de documento por día
- Mesa liberada atómicamente al final

**Comportamiento diferente por diseño:**  
La nueva función NO requiere caja abierta si todos los pagos son Tarjeta/Transferencia. En PRD actual, TODAS las ventas eran Efectivo → siempre requerían caja. Si el POS envía solo Tarjeta/Transferencia en DEV, no necesita caja abierta. Esto es intencional y correcto, pero representa un cambio de regla operativa.

**BUG activo en esta migración (BUG-M24-001):**  
En el bloque de `insert into journal_lines`:
```sql
-- INCORRECTO (esta migración):
group by lower(trim(pay->>'method'));
-- trim(pay->>'method') aparece en SELECT pero no en GROUP BY
-- → PostgreSQL error en runtime cuando ledger está activo
```
El bug se activa SOLO cuando `ledger_cutover_at IS NOT NULL`. PRD no tendrá ledger activo inmediatamente. Pero debe corregirse (migración 20260815100000) ANTES de activar el ledger en PRD.

### Impacto sobre Edge Function pos-operations

**Crítico.** PRD's `pos-operations` Edge Function llama actualmente a:
```
finalize_pos_sale(p_table_id, p_items, p_payment_method::text, p_performed_by)
```
Después de esta migración, esa firma **no existe**. Cualquier venta en PRD fallaría con:
```
ERROR: function finalize_pos_sale(uuid, jsonb, text, uuid) does not exist
```

### Impacto potencial

| Área | Impacto |
|---|---|
| Apertura de caja | Ninguno |
| Cierre de caja | Ninguno |
| Venta POS | **CRÍTICO** — función desaparece; EF llama firma inexistente |
| Mesas/barras activas | Ninguno (triggers no modificados) |
| `finalize_pos_sale` | **Reemplazada completamente** |
| `cash_sessions` existentes | Ninguno en filas. La función ahora guarda `cash_session_id` null en ventas no-efectivo. |

### Riesgo

**ALTO**

### Recomendación

**Promoción posible con pruebas previas — requiere ajuste previo.**

Prerequisitos antes de aplicar a PRD:
1. **Actualizar `pos-operations` Edge Function** para llamar la nueva firma con `p_payments jsonb` en lugar de `p_payment_method text`. El deploy de la EF y el `db push` deben ocurrir en la misma ventana de mantenimiento.
2. **Aplicar migración 20260815100000** antes de activar el ledger.
3. **Prueba end-to-end en staging:** apertura caja → venta con Efectivo → venta con Tarjeta (si aplica) → cierre.
4. **Ventana de mantenimiento:** durante el deploy hay una brecha donde la vieja EF no puede llamar a la nueva función. Duración: segundos, pero real.

---

## Migración 3: `20260815100000_fix_finalize_pos_sale_groupby.sql`

### Qué cambia exactamente

Un solo cambio en el `GROUP BY` del INSERT a `journal_lines` dentro de `finalize_pos_sale`:

```sql
-- ANTES (en migración 20260811140000 — tiene BUG):
from jsonb_array_elements(p_payments) pay
group by lower(trim(pay->>'method'));

-- DESPUÉS (esta migración — FIX):
from jsonb_array_elements(p_payments) pay
group by lower(trim(pay->>'method')), trim(pay->>'method');
```

El resto de la función es idéntico a la versión de `20260811140000`.

**Por qué falla sin el fix:** PostgreSQL exige que toda expresión en SELECT que no sea un agregado aparezca en GROUP BY. `trim(pay->>'method')` aparece en el campo `description` del SELECT pero no estaba en GROUP BY. PostgreSQL rechaza la sentencia en runtime → INSERT falla → transacción completa rollback → venta no registrada.

**Cuándo se activa el bug:** Solo dentro del bloque condicional:
```sql
if v_ledger_cutover_at is not null and v_sale_created_at >= v_ledger_cutover_at then
  -- BUG está aquí
end if;
```
Sin ledger activo, el bloque no se ejecuta y el bug es inerte.

### Modifica funciones/triggers existentes

Sí — `create or replace function public.finalize_pos_sale(uuid, jsonb, jsonb, uuid, text)`. La misma firma nueva de la migración 20260811140000.

### Aditiva vs altera comportamiento

Fix quirúrgico. Un cambio de una línea a GROUP BY. Sin cambio de comportamiento de negocio.

**Caso práctico:** para métodos 'Efectivo', 'Tarjeta', 'Transferencia' (Title Case):
- `lower(trim('Efectivo'))` = `'efectivo'`
- `trim('Efectivo')` = `'Efectivo'`
- Ambas expressions son distintas → requeridas en GROUP BY por separado
- En la práctica, para un método dado solo hay un valor original → grupos idénticos antes y después del fix
- El fix solo afecta a la sintaxis, no al resultado de los grupos

### Comportamiento en PRD sin `20260811140000` aplicada

Si se aplica esta migración como parte del batch completo (`supabase db push`):
1. `20260811140000` corre primero → crea la nueva firma con bug
2. `20260815100000` corre segundo → reemplaza con la versión corregida

Si (por error) se aplicara en PRD en aislamiento, antes de `20260811140000`:
- PRD tiene firma `(uuid, jsonb, text, uuid)` (vieja)
- Esta migración crearía `(uuid, jsonb, jsonb, uuid, text)` COMO NUEVA FUNCIÓN (no como reemplazo, porque son firmas distintas)
- Ambas coexistirían; la nueva no sería llamada por nadie
- PRD POS seguiría funcionando con la vieja
- Situación anómala pero no catastrófica

**Conclusión: no aplicar en aislamiento. Siempre como parte del batch completo.**

### Impacto potencial

| Área | Impacto |
|---|---|
| Apertura de caja | Ninguno |
| Cierre de caja | Ninguno |
| Venta POS | Positivo: corrige error que bloquearía ventas cuando ledger activo |
| Mesas/barras activas | Ninguno |
| `finalize_pos_sale` | Reemplazada con versión corregida |
| `cash_sessions` existentes | Ninguno |

### Riesgo

**BAJO** — en el contexto del batch completo.  
**MEDIO** — si se aplica en aislamiento (genera overload innecesario de función).

### Recomendación

**Promoción posible con pruebas previas.** Debe aplicarse como parte del batch de Finance, no de forma aislada. Aplicar antes de activar el ledger en PRD.

---

## Resumen ejecutivo

| Migración | Riesgo | Recomendación | Prerequisito |
|---|---|---|---|
| `20260811130000` extend_cash_sessions_ledger | **BAJO** | **Promoción segura** | Ninguno |
| `20260811140000` sale_financial_entries | **ALTO** | **Promoción posible con pruebas previas** | Deploy coordinado de `pos-operations` EF |
| `20260815100000` fix_finalize_pos_sale_groupby | **BAJO** (batch) | **Promoción posible con pruebas previas** | Aplicar DESPUÉS de `20260811140000` |

---

## Plan de deploy recomendado

### Paso 1 — Preparación (sin ventana de mantenimiento)
- [ ] Actualizar `pos-operations` Edge Function para llamar nueva firma `(uuid, jsonb, jsonb, uuid, text)`.
- [ ] Probar nueva EF contra ambiente staging o DEV con caja abierta.
- [ ] Confirmar que venta estándar (Efectivo) y cierre de mesa funcionen con nueva EF.

### Paso 2 — Ventana de mantenimiento PRD
- [ ] Aplicar batch completo de migraciones de Finance (`supabase db push --linked` en PRD).
- [ ] Deploy de la nueva `pos-operations` Edge Function.
- [ ] Verificar POS en PRD: abrir mesa → agregar producto → cobrar → cerrar mesa.
- [ ] Verificar que caja sigue abriéndose y cerrándose normalmente.

### Paso 3 — Antes de activar ledger en PRD
- [ ] Confirmar que migración `20260815100000` fue aplicada (parte del batch del Paso 2).
- [ ] Activar ledger con saldos iniciales reales (proceso separado, requiere autorización).
- [ ] Probar una venta completa con ledger activo y verificar asientos en Pólizas.

---

## Hallazgo adicional: cambio de regla de caja para ventas no-Efectivo

En PRD actual, `finalize_pos_sale` siempre requiere caja abierta (todas las ventas son Efectivo).

En la nueva versión, ventas 100% Tarjeta/Transferencia no requieren caja abierta. Esto es correcto a nivel contable (el dinero va a Banco, no a Caja operativa), pero representa un cambio de operativa en PRD si el negocio decide aceptar métodos no-efectivo en el futuro. Documentar como decisión tomada por diseño.
