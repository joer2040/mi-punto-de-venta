# FASE3 - R4: Preflight para Diseño de Fixtures Locales

**Generado:** 2026-08-13  
**Script de pruebas:** `sql/local/2026-08-11_test_behavioral_ledger_local.sql`  
**Alcance:** Pruebas conductuales TB-01 a TB-13 (ledger inactivo)  
**Tipo:** PREFLIGHT UNICAMENTE — ningun fixture creado ni ejecutado

---

> **AVISO DE ENTORNO**  
> Analisis exclusivo sobre la base de datos PostgreSQL local del proyecto.  
> Ningun comando SQL, Supabase, Docker, commit ni push fue ejecutado en este documento.

---

## 1. Estado Confirmado de la Base Local

| Condicion | Estado |
|-----------|--------|
| Migraciones aplicadas | 28/28 (incluyendo `20260812100000_fix_account_5201_to_5102.sql`) |
| Ledger financiero | INACTIVO (`ledger_settings` vacia o `ledger_cutover_at IS NULL`) |
| Sesion de caja abierta | NO |
| Tabla con `status='ocupada'` | NO |
| Perfil de superadmin en `app_profiles` | NO |
| Materiales con `precio_venta > 0` | SI — pero `stock_actual = 0` |
| Categoria 'Botella' | SI — creada por bootstrap M16 |
| Centro 'Bar Principal' | SI — creado por bootstrap M14 |
| Cuenta financiera 5102 | SI (preflight del script pasaria) |
| Cuenta financiera 5201 | NO (eliminada por M28 — preflight pasaria) |

---

## 2. Analisis por Prueba: Ruta de Ejecucion y Fixtures Necesarios

### Nota: orden de validacion en `finalize_pos_sale` (M24)

La funcion valida en este orden:
1. `p_table_id` → mesa existe y tiene `current_order_id`
2. Por cada item en `p_items` → material existe, inventario en Bar Principal, `precio_venta > 0`
3. Idempotencia temprana (si clave ya existe y hash coincide → retorna cacheado)
4. Por cada pago en `p_payments` → metodo valido, monto > 0
5. Suma de pagos = total calculado de inventario (tolerancia 0.01)
6. Si algun pago es Efectivo → busca `cash_sessions` con `status='open'`
7. Crea venta + items; si ledger activo → crea asientos contables
8. Registra idempotencia (SIEMPRE si clave no nula — independiente de ledger)

**Implicacion clave:** Para que TB-01/02/03 fallen por el motivo CORRECTO (pago invalido, monto cero, monto negativo), la funcion debe superar los pasos 1 y 2 primero. Por eso todos los tests TB-01..09 necesitan el mismo conjunto base de fixtures.

---

### TB-01: Metodo de pago no soportado (Cripto)

| Campo | Detalle |
|-------|---------|
| Tipo | Rechazo esperado → `exception when others` |
| Aislamiento | Inner BEGIN/EXCEPTION (sin outer BEGIN/ROLLBACK) |
| Atomicidad verificada | SI: cuenta filas en `sales` antes/despues |
| Punto de fallo esperado | Paso 4 — validacion de metodo de pago |
| Fixtures necesarios | Mesa ocupada con orden activa, material con inventario y `precio_venta > 0` |
| `<test_user_id>` | Cualquier UUID valido (sin FK a app_profiles con ledger inactivo) |

### TB-02: Importe cero

| Campo | Detalle |
|-------|---------|
| Tipo | Rechazo esperado |
| Punto de fallo esperado | Paso 4 — validacion de monto > 0 |
| Fixtures necesarios | Mismos que TB-01 |

### TB-03: Importe negativo

| Fixtures necesarios | Mismos que TB-01. |

### TB-04: Suma de pagos ≠ total de items

| Campo | Detalle |
|-------|---------|
| Tipo | Rechazo esperado + verificacion de atomicidad |
| Punto de fallo esperado | Paso 5 — suma de pagos |
| Fixtures necesarios | Mismos que TB-01 |
| Riesgo de test invalido | Si `precio_venta = 1.00`, el pago fijo `amount:1.00` del test no generaria fallo. Usar `precio_venta ≠ 1.00` en el fixture de inventario. |

### TB-05: Efectivo sin sesion de caja

| Campo | Detalle |
|-------|---------|
| Tipo | Rechazo esperado |
| Punto de fallo esperado | Paso 6 — no hay `cash_sessions` con `status='open'` |
| Fixtures necesarios | Mismos que TB-01, **MAS**: `amount:REPLACE:<test_item_price>` DEBE ser igual al `precio_venta` real del inventario. Si no coincide, el fallo ocurrira en paso 5 (suma incorrecta), no en paso 6, dando PARTIAL en vez de PASS. |
| Prerequisito | `<test_item_price>` = valor exacto de `inventory.precio_venta` del material fixture |

### TB-06: Solo Tarjeta sin sesion de caja → exito

| Campo | Detalle |
|-------|---------|
| Tipo | Exito esperado — venta se crea |
| Aislamiento | `BEGIN/ROLLBACK` externo |
| Fixtures necesarios | Mesa ocupada, orden, material, inventario (`precio_venta > 0`, `stock_actual >= 1`) |
| Verificacion post-ejecucion | `SELECT` de `financial_operations` JOIN `journal_lines` — retornara **VACIO** porque ledger INACTIVO. No es un error; la venta si se crea en `sales`/`sale_items`. |
| Nota | Los SELECT de verificacion incluidos en el script no pueden confirmar asientos contables con ledger inactivo. Resultado: prueba ejecuta sin error, pero la verificacion visual queda inconcluible. |

### TB-07: Pago mixto Efectivo + Tarjeta

| Campo | Detalle |
|-------|---------|
| Tipo | Exito esperado |
| Aislamiento | `BEGIN/ROLLBACK` externo |
| Fixtures necesarios | Mismos que TB-06 |
| **BUGS DETECTADOS (B-TB07a + B-TB07b)** | El INSERT de `cash_sessions` tiene dos errores: (a) `opening_amount=0` viola `CHECK (opening_amount > 0)`; (b) columna `manual_opening_float` NO EXISTE en ninguna migracion (grep: 0 coincidencias en M1-M28). El INSERT falla por (b) antes de llegar a (a). Ver Seccion 7 (Bugs). |
| Impacto | TB-07 falla antes de ejecutar `finalize_pos_sale`. Correcciones requeridas: `opening_amount=500.00` y eliminar `manual_opening_float` de la lista de columnas. |
| Nota sobre triggers | El INSERT en `cash_sessions` NO tiene trigger de caja abierta — solo `table_orders` y `tables` lo tienen. La sesion puede crearse dentro del BEGIN/ROLLBACK de TB-07 sin restriccion adicional. |

### TB-08: Solo Transferencia → debita 1103

| Campo | Detalle |
|-------|---------|
| Tipo | Exito esperado |
| Aislamiento | `BEGIN/ROLLBACK` externo |
| Fixtures necesarios | Mismos que TB-06 |
| Nota | Con ledger inactivo, la verificacion via `journal_lines` retorna vacio. Igual que TB-06. |

### TB-09: Idempotencia — misma clave + mismo payload

| Campo | Detalle |
|-------|---------|
| Tipo | Exito esperado — segunda llamada retorna resultado original |
| Aislamiento | `BEGIN/ROLLBACK` externo |
| Fixtures necesarios | Mismos que TB-06 |
| **Verificacion confirmada** | `idempotency_requests` se registra SIEMPRE al final de `finalize_pos_sale` si `p_idempotency_key is not null` (lineas 714-721 de M24) — independiente del estado del ledger. TB-09 funcionara correctamente. |

### TB-10: Idempotencia — misma clave + payload diferente → conflicto

| Campo | Detalle |
|-------|---------|
| Tipo | Verificacion de logica de deteccion de conflicto |
| Aislamiento | `BEGIN/ROLLBACK` externo |
| Fixtures necesarios | **NINGUNO** — INSERT directo en `idempotency_requests` dentro del bloque. Sin FK externas criticas. |

### TB-11: Atomicidad ante trigger — asiento desbalanceado

| Campo | Detalle |
|-------|---------|
| Tipo | Rechazo por trigger `trg_assert_journal_entry_balanced` |
| Aislamiento | `BEGIN/ROLLBACK` externo |
| Fixtures necesarios | **`<test_user_id>` DEBE existir en `app_profiles`** |
| Motivo FK | `journal_entries.created_by uuid not null references public.app_profiles(id)` — FK enforced |
| Blocker critico | `app_profiles.id → auth.users.id ON DELETE CASCADE`. Para insertar en `app_profiles`, primero insertar en `auth.users`. Requiere conocer columnas NOT NULL de `auth.users` (schema GoTrue). Ver Blocker B1. |

### TB-12: Autoautorizacion (no_self_auth) → rechazo por CHECK

| Campo | Detalle |
|-------|---------|
| Tipo | Rechazo por `check_violation` esperado |
| Aislamiento | `BEGIN/ROLLBACK` externo |
| Fixtures necesarios | Ninguno efectivo |
| **BUG DETECTADO (B-TB12)** | El script usa columna `action_type` que NO EXISTE en `financial_authorizations`. La tabla tiene `request_type text not null`. El INSERT falla con `undefined_column` — excepcion capturada en `when others then`, no en `when check_violation then`. Resultado: `TB-12 PARTIAL excepcion pero no check_violation: column "action_type" of relation "financial_authorizations" does not exist`. Ver Seccion 6. |
| Impacto | TB-12 reporta PARTIAL independientemente de fixtures. Necesita correccion de nombre de columna en el script antes de ser ejecutable. |

### TB-13: Calculo de expected_cash

| Campo | Detalle |
|-------|---------|
| Tipo | Solo lectura — `SELECT * FROM get_cash_sessions_report() LIMIT 1` |
| Fixtures necesarios | **NINGUNO** — retornara SKIP si no hay sesiones de caja registradas |
| Estado esperado | SKIP con el mensaje `TB-13 SKIP sin sesiones de caja registradas — ejecutar despues de TB-07` |

---

## 3. Invariante de Caja: Analisis de Triggers (M18 + M19)

> Fuentes:
> - **M18** `20260803183000_enforce_cash_session_pos_invariant.sql` — define triggers y funciones
> - **M19** `20260803232300_fix_active_pos_operation_count.sql` — reemplaza `active_pos_operation_count()`

### 3.1 Triggers activos tras M18 (y correccion de funcion en M19)

#### `table_orders_require_open_cash_session`

```sql
-- Trigger literal de M18 (linea 59-63):
drop trigger if exists table_orders_require_open_cash_session on public.table_orders;
create trigger table_orders_require_open_cash_session
before insert or update on public.table_orders
for each row
execute function public.require_open_cash_session_for_pos_operation();
```

**SIN clausula WHEN.** Fires en TODO INSERT o UPDATE sobre `table_orders`.

#### `tables_insert_require_open_cash_session`

```sql
-- Trigger literal de M18 (linea 64-72):
drop trigger if exists tables_insert_require_open_cash_session on public.tables;
create trigger tables_insert_require_open_cash_session
before insert on public.tables
for each row
when (
  lower(trim(coalesce(new.status, ''))) = 'ocupada'
  or new.current_order_id is not null
)
execute function public.require_open_cash_session_for_pos_operation();
```

Fires en INSERT solo si `status='ocupada'` o `current_order_id IS NOT NULL`.  
INSERT con `status='libre'` y `current_order_id=NULL` → **trigger NO dispara**.

#### `tables_activate_require_open_cash_session`

```sql
-- Trigger literal de M18 (linea 73-87):
drop trigger if exists tables_activate_require_open_cash_session on public.tables;
create trigger tables_activate_require_open_cash_session
before update of status, current_order_id on public.tables
for each row
when (
  (
    lower(trim(coalesce(new.status, ''))) = 'ocupada'
    or new.current_order_id is not null
  )
  and (
    old.status is distinct from new.status
    or old.current_order_id is distinct from new.current_order_id
  )
)
execute function public.require_open_cash_session_for_pos_operation();
```

Fires en UPDATE de `status` o `current_order_id` SOLO cuando el nuevo valor activa la mesa  
(`status='ocupada'` o `current_order_id IS NOT NULL`) Y el valor cambio.  
**UPDATE que setea `status='libre'` y `current_order_id=NULL` → trigger NO dispara.**

#### `cash_sessions_prevent_close_with_active_pos_operations`

```sql
-- Trigger literal de M18 (linea 112-117):
drop trigger if exists cash_sessions_prevent_close_with_active_pos_operations on public.cash_sessions;
create trigger cash_sessions_prevent_close_with_active_pos_operations
before update of status on public.cash_sessions
for each row
when (old.status = 'open' and new.status = 'closed')
execute function public.prevent_cash_close_with_active_pos_operations();
```

Llama a `active_pos_operation_count()` que cuenta:
- Tablas con `status='ocupada'` O `current_order_id IS NOT NULL`
- Ordenes huerfanas en `table_orders` sin referencia desde `tables.current_order_id`

Si count > 0 → raise exception, cierre bloqueado.

#### Funcion disparadora compartida (M18)

```sql
-- M18 (20260803183000) linea 33-57:
create or replace function public.require_open_cash_session_for_pos_operation()
returns trigger language plpgsql security definer as $$
declare v_cash_session_id uuid;
begin
  select cash_session.id into v_cash_session_id
  from public.cash_sessions cash_session
  where cash_session.status = 'open'
  order by cash_session.opened_at desc limit 1 for update;

  if v_cash_session_id is null then
    raise exception 'No hay una caja abierta. Debes abrir caja antes de abrir mesas, barras o modificar pedidos.'
      using errcode = 'P0001';
  end if;
  return new;
end; $$;
```

#### Funcion `active_pos_operation_count` — version definitiva (M19)

M19 reemplaza la version de M18. La version definitiva NO cuenta ordenes huerfanas:

```sql
-- M19 (20260803232300) — version definitiva:
create or replace function public.active_pos_operation_count()
returns integer language sql stable security definer
set search_path to public as $$
  select count(*)::integer
  from public.tables station
  where lower(trim(coalesce(station.status, ''))) = 'ocupada'
     or station.current_order_id is not null;
$$;
-- comment: 'Cuenta exclusivamente mesas o barras activas.
--           Los table_orders historicos sin current_order_id no representan ventas en proceso.'
```

**Diferencia M18 vs M19:** M18 contaba tambien `table_orders` sin referencia desde `tables.current_order_id` (ordenes huerfanas). M19 elimina ese conteo. Solo las mesas en estado activo (`ocupada` o con `current_order_id IS NOT NULL`) bloquean el cierre de caja. Un fixture F4 que exista pero cuya mesa no lo referencie ya NO bloquea el cierre (M19 en adelante).

---

### 3.2 Respuesta a las tres preguntas de diseño

#### Pregunta 1: ¿Se puede crear una mesa ocupada con orden activa sin sesion abierta?

**BLOQUEADO via INSERT/UPDATE normales.**

- INSERT `table_orders` → trigger `table_orders_require_open_cash_session` sin WHEN → dispara siempre → exige sesion.
- UPDATE `tables.status='ocupada'` → trigger `tables_activate_require_open_cash_session` → dispara → exige sesion.

**Solucion para el script de fixtures:** usar `SET session_replication_role = 'replica'` como superuser (docker exec psql). Esto desactiva todos los triggers no-replica en la sesion. Permite INSERT en `table_orders` y UPDATE de `tables` a 'ocupada' sin sesion abierta. Restaurar con `SET session_replication_role = 'origin'` al terminar.

Esto es requerido porque la alternativa (abrir sesion + fijar fixtures + dejar sesion abierta) impide TB-05.

#### Pregunta 2: ¿Se puede crear una mesa libre con orden activa sin sesion?

- INSERT `tables` con `status='libre'`, `current_order_id=NULL`: **POSIBLE** (trigger WHEN false).
- INSERT `table_orders`: **BLOQUEADO** (trigger sin WHEN).
- **Requiere el mismo bypass** via `session_replication_role = 'replica'`.

#### Pregunta 3: ¿Se puede crear una sesion ficticia y cerrarla/borrarla dentro de pruebas?

**Apertura (INSERT en `cash_sessions`):**
NO hay trigger sobre INSERT en `cash_sessions`. Insertar dentro de BEGIN/ROLLBACK funciona si las columnas son validas.

**`finalize_pos_sale` dentro del mismo BEGIN/ROLLBACK:**
- UPDATE de `tables` a 'libre' + `current_order_id=NULL`: trigger `tables_activate_require_open_cash_session` NO dispara (nueva condicion WHEN es false).
- DELETE de `table_orders`: trigger `table_orders_require_open_cash_session` fires solo en INSERT/UPDATE, NO en DELETE. Sin bloqueo.
- Por tanto, `finalize_pos_sale` ejecuta correctamente dentro del bloque si la sesion fue creada antes en el mismo bloque.

**Cierre dentro del mismo bloque:**
`active_pos_operation_count()` = 0 despues de que `finalize_pos_sale` pone la mesa en 'libre'. El trigger de cierre no bloquearia. Pero en TB-07 el cierre no es necesario: el ROLLBACK revierte todo.

**Bloqueo real de TB-07:** No es el trigger — es el bug en el INSERT de la sesion (ver Seccion 7).

---

### 3.3 Impacto en fixtures: conflicto TB-05 vs mesa 'ocupada' persistente

| Escenario | Consecuencia |
|-----------|-------------|
| Fixture crea sesion y la deja abierta | TB-05 hace SKIP ("cerrar antes de ejecutar") — test nunca valida el rechazo |
| Fixture crea sesion y cierra tras setup | Trigger bloquea cierre mientras la mesa este 'ocupada' |
| Fixture bypasea triggers con `session_replication_role` | Mesa 'ocupada' persiste SIN sesion → TB-05 ejecuta correctamente |

**Decision de diseño:** El script de fixtures usara `session_replication_role='replica'` para insertar F4 y actualizar F3. No se crea ninguna sesion de caja en el fixture. TB-07 creara su propia sesion dentro de su BEGIN/ROLLBACK (corrigiendo primero los bugs).

---

### 3.4 TB-05: Analisis de Alternativas de Fixture

TB-05 valida que `finalize_pos_sale` rechace pagos en Efectivo cuando no hay sesion de caja abierta. El test tiene un SKIP explícito si encuentra una sesion abierta. Esto crea tension con la creacion de fixtures de mesa 'ocupada', que normalmente exige una sesion abierta (trigger M18).

#### Alternativa A — Fixture sin sesion, bypass de triggers de creacion

Crear mesa 'ocupada' y orden activa usando `SET LOCAL session_replication_role = 'replica'` durante la ventana de insercion critica:

```sql
SET LOCAL session_replication_role = 'replica';
-- INSERT table_orders (trigger table_orders_require_open_cash_session no dispara)
-- UPDATE tables SET status='ocupada', current_order_id=... (trigger tables_activate no dispara)
SET LOCAL session_replication_role = 'origin';
```

Estado resultante: mesa 'ocupada' con orden activa, **sin ninguna sesion de caja**.

| Aspecto | Evaluacion |
|---------|------------|
| TB-05 | EJECUTA y valida el rechazo → PASS |
| Estado de fixtures | "Imposible" en flujo real (mesa ocupada sin historial de caja abierta) |
| `session_replication_role` impacto | Desactiva TODOS los triggers no-replica en la transaccion; el scope se limita al window indicado |
| `on_material_created` | Si F5 ocurre fuera de la ventana replica, el trigger SI dispara → auto-crea fila en inventory |
| Complejidad operativa | Media — requiere entender que `SET LOCAL` aplica solo en la transaccion activa |
| Riesgo | Bajo si el scope de replica se mantiene minimo (solo los 2 DML que lo requieren) |

#### Alternativa B — Fixture con sesion real + bypass de cierre

Abrir una sesion de caja real (sin bypass), crear fixtures normalmente (triggers satisfechos), luego cerrar la sesion forzando el cierre via bypass del trigger de cierre:

```sql
-- Paso 1: abrir sesion (valido, sin bypass)
INSERT INTO cash_sessions (status, opening_amount, opened_by) VALUES ('open', 500.00, <uuid>);

-- Paso 2: crear mesa + orden (triggers OK, hay sesion)
INSERT INTO tables ...; INSERT INTO table_orders ...; UPDATE tables SET status='ocupada' ...;

-- Paso 3: cerrar sesion forzado (bypass del trigger de cierre)
SET LOCAL session_replication_role = 'replica';
UPDATE cash_sessions SET status = 'closed', closed_at = now() WHERE status = 'open';
SET LOCAL session_replication_role = 'origin';
```

Estado resultante: mesa 'ocupada' con orden activa, sesion cerrada, **sin sesion abierta**.

| Aspecto | Evaluacion |
|---------|------------|
| TB-05 | EJECUTA y valida el rechazo → PASS |
| Estado de fixtures | Mas "realista" — la mesa fue abierta con una sesion valida |
| `session_replication_role` impacto | Solo se usa en el cierre forzado; los triggers de creacion funcionan normalmente |
| `active_pos_operation_count()` durante Paso 3 | Cuenta 1 (mesa 'ocupada') → trigger de cierre rechazaria → por eso Paso 3 requiere bypass |
| `cash_session.closed_by` | Quedaria NULL (no hay un UUID valido de usuario aun) — columna nullable |
| `cash_session.closing_amount`, etc. | Quedarian en DEFAULT 0 — no hay saldo calculado — diferencia semantica con cierre real |
| Complejidad operativa | Alta — 3 fases distintas, una sesion que existe y queda cerrada con datos incompletos |
| Riesgo | Medio — la sesion cerrada "fantasma" con `closing_amount=0` podria confundir diagnosticos futuros |

#### Comparacion directa

| Criterio | Alternativa A | Alternativa B |
|----------|--------------|--------------|
| TB-05 PASS | SI | SI |
| TB-07 (sesion temporal en BEGIN/ROLLBACK) | OK — ninguna sesion preexistente | OK — sesion cerrada no interfiere con UNIQUE INDEX de 'open' |
| Realismo del estado de fixture | Bajo (estado imposible) | Medio (sesion existio pero cierre fue forzado) |
| Uso de `session_replication_role` | En creacion de mesa/orden | En cierre de sesion |
| Sesion de caja residual | NINGUNA | 1 sesion cerrada con datos incompletos |
| Riesgo para otros tests | Bajo | Bajo, pero sesion residual visible en queries de `cash_sessions` |
| Lineas de bypass en script | 2 (`SET LOCAL ... 'replica'` + `SET LOCAL ... 'origin'`) | 2 mismas, en diferente lugar |

**Ambas alternativas logran el mismo estado final y permiten TB-05 PASS. La diferencia es que Alternativa A evita dejar una sesion de caja residual con datos incompletos. Alternativa B deja evidencia de que hubo un ciclo de caja aunque sea forzado.**

### 3.5 Matriz de Decisión: Alternativa A vs B

| Alternativa | Cubre TB-05 | Integridad normal | Riesgo | Limpieza | Recomendacion |
|-------------|-------------|-------------------|--------|----------|---------------|
| A — bypass minimo al crear fixture | Si | Estado imposible solo local | Controlado | Eliminar por UUID fijo | **Recomendada** |
| B — abrir y cerrar caja forzadamente | Si | Deja una sesion cerrada artificial | Medio | Mas compleja | No recomendada |

### 3.6 Alternativa Seleccionada: A

Se selecciona **Alternativa A** con las siguientes restricciones de implementacion:

1. **Solo se permite en la base local.** Nunca en DEV o PRD.
2. `SET LOCAL session_replication_role = 'replica'` debe abarcar **exclusivamente** el INSERT de `table_orders` y el UPDATE de `tables` — ni un paso mas.
3. La transaccion debe volver automaticamente al rol `'origin'` al terminar la ventana; `SET LOCAL` garantiza la reversion al commit/rollback.
4. Fuera de esa ventana deben quedar activos todos los triggers — en particular los de `materials`, `inventory`, y `cash_sessions`.
5. El script futuro debe validar manualmente los UUID/FK antes del bypass (F3 existente, `cat_id` = `...-005` existente, etc.).
6. Debe existir un script de limpieza posterior que elimine unicamente los fixtures con UUIDs fijos (`10000000-...-0006` al `...-0009`), en orden seguro inverso a las dependencias.

---

## 4. Inventario de Restricciones por Tabla Relevante

### `auth.users` (schema GoTrue)

Evidencia obtenida: solo `id` es `NOT NULL`. Las demas columnas permiten NULL o tienen defaults.

| Columna | Restriccion confirmada | Para fixture F1 |
|---------|------------------------|-----------------|
| id | PK uuid **NOT NULL** | UUID fijo `10000000-...-0006` |
| email | NULL permitido | Omitir o usar email ficticio |
| encrypted_password | NULL permitido | Omitir o usar hash ficticio |
| (todas las demas) | NULL o default | Omitir — INSERT minimo: solo `id` |

**INSERT minimo viable:**
```sql
INSERT INTO auth.users (id) VALUES ('10000000-0000-0000-0000-000000000006');
```

**V1 RESUELTA.** No requiere `\d auth.users`.

**Impacto en `app_profiles` (F2):** `app_profiles` requiere `id`, `username`, `email` como NOT NULL. `full_name` permite NULL. `status` e `is_superadmin` tienen defaults. El `email` de `app_profiles` es el email interno de la app (`<username>@app.local`), no el de `auth.users`.

### `app_profiles`

Columnas confirmadas por inspeccion literal de `bootstrap_superadmin` (M1 linea 52):
```sql
insert into public.app_profiles (id, username, full_name, email, status, is_superadmin)
values (p_user_id, normalized_username, p_full_name, internal_email, 'active', true);
```

| Columna | Restriccion | Para fixture F2 |
|---------|-------------|-----------------|
| id | PK, FK → auth.users(id) ON DELETE CASCADE | = UUID de F1 |
| username | NOT NULL (funcion siempre lo provee) | cualquier texto normalizado |
| full_name | NULL permitido | omitir o usar texto de test |
| email | NOT NULL | formato `<username>@app.local` (segun `username_to_auth_email`) |
| status | NOT NULL DEFAULT 'active' | omitir — usa default |
| is_superadmin | NOT NULL DEFAULT false | `true` para test |

**V2 RESUELTA** — campos obligatorios: `id`, `username`, `email`. `full_name` permite NULL. `status` e `is_superadmin` tienen defaults.

### `tables` (mesas POS)

| Columna | Restriccion | Para fixture F3 |
|---------|-------------|-----------------|
| id | PK uuid | UUID fijo |
| number | text NOT NULL | texto de identificacion (ej. `'T-TEST'`) |
| status | text DEFAULT 'libre' | Insertar 'libre', luego UPDATE a 'ocupada' |
| current_order_id | uuid NULLABLE, FK → table_orders(id) | NULL al insertar; UPDATE despues de F4 |
| active_order_id | uuid NULLABLE | Sin FK visible; NULL es valido |

**Triggers activos sobre `tables` (M18):**
- INSERT con `status='libre'`, `current_order_id=NULL` → **sin trigger** (WHEN false).
- UPDATE a `status='ocupada'` o `current_order_id IS NOT NULL` → **trigger dispara** → exige sesion abierta.

**Dependencia circular confirmada:**  
`table_orders.table_id → tables(id)` Y `tables.current_order_id → table_orders(id)`.  
Orden de insercion: INSERT tabla (libre, current=NULL) → INSERT orden → UPDATE tabla ('ocupada', current=orden).  
Los pasos INSERT orden y UPDATE tabla requieren bypass via `session_replication_role`.

### `table_orders`

| Columna | Restriccion | Para fixture F4 |
|---------|-------------|-----------------|
| id | PK uuid | UUID fijo |
| table_id | uuid NULLABLE, FK → tables(id) | = UUID de F3 |
| items | jsonb DEFAULT `'[]'` | `'[]'` valido para test |
| total | numeric DEFAULT 0 | 0 valido |
| waiter_edit_locked | boolean NOT NULL DEFAULT false | false |

**Trigger activo sobre `table_orders` (M18):**
- TODO INSERT o UPDATE → `table_orders_require_open_cash_session` **sin WHEN** → siempre dispara → exige sesion.
- Bypass requerido via `session_replication_role = 'replica'`.

**No se requiere columna `status` en `table_orders`** — la funcion solo verifica `table_id = v_table.id` y `id = v_table.current_order_id`.

### `materials`

| Columna | Restriccion | Para fixture F5 |
|---------|-------------|-----------------|
| id | PK uuid | UUID fijo |
| **cat_id** | FK → categories(id) | = `10000000-0000-0000-0000-000000000005` (Botella) |
| name | **NOT NULL** | texto de identificacion (ej. `'Material Test'`) |
| (demas columnas) | NULL o DEFAULT — ninguna adicional es NOT NULL | omitir |

**V4 RESUELTA** — solo `name` es NOT NULL en `materials`. Las demas columnas permiten NULL o tienen default.

**Columna es `cat_id`, NO `category_id`.** Confirmado por inspeccion del trigger `close_cash_session_atomic` en M18 (linea 187: `category.id = material.cat_id`) y por `update_inventory_on_sale` en M14.

**Nota:** El script de pruebas menciona `is_active=true` en comentarios pero esa columna NO existe en `materials`. La validez del material se determina por: `categories.is_for_sale = true` + inventario en Bar Principal con `precio_venta > 0`.

**Impacto de trigger `on_material_created`:** INSERT en `materials` dispara `handle_new_material()` que hace INSERT automatico en `inventory` con `center_id = (SELECT id FROM centers LIMIT 1)` (= Bar Principal). Por tanto, F6 debe ser UPDATE del inventario auto-creado, NO INSERT separado — a menos que el INSERT de F5 ocurra dentro de la ventana `session_replication_role='replica'` (que desactivaria el trigger).

### `inventory`

| Columna | Restriccion | Para fixture F6 |
|---------|-------------|-----------------|
| material_id | FK → materials(id), parte de PK compuesta? | = UUID de F5 |
| center_id | FK → centers(id) | = `10000000-0000-0000-0000-000000000002` (Bar Principal) |
| precio_venta | numeric NOT NULL | > 0, valor exacto = `<test_item_price>` |
| stock_actual | numeric | >= 1 para TB-06/08/09; TB-01..05 no lo requieren |
| (demas columnas) | NULL o DEFAULT — ninguna columna de negocio adicional es NOT NULL | omitir |

**V4 RESUELTA** — `inventory` no tiene columnas de negocio adicionales NOT NULL. `id` tiene default. Las relaciones estan protegidas por FK/UNIQUE.

### `cash_sessions`

| Columna | Restriccion | Para TB-07 (nota: bugs activos) |
|---------|-------------|----------------------------------|
| status | CHECK ('open', 'closed') | 'open' |
| opening_amount | numeric NOT NULL, CHECK (> 0) | **BUG B-TB07a: script usa 0** |
| opened_by | uuid NOT NULL, **SIN FK** (sin referencia a app_profiles) | Cualquier UUID valido |
| manual_opening_float | **COLUMNA NO EXISTE** — verificado por grep en todas las migraciones: cero coincidencias. | **BUG B-TB07b: columna inexistente** |
| UNIQUE INDEX | Solo 1 sesion 'open' a la vez | Si hay sesion previa 'open', INSERT falla |

**V3 RESUELTA — `manual_opening_float` CONFIRMADA INEXISTENTE.** Ninguna migracion (M1 a M28) define esta columna. Es un bug de script, no un pendiente de verificacion.

**Columnas adicionales agregadas por M23 (`extend_cash_sessions_ledger`):**
- `first_counted_cash numeric(14,2)` — nullable
- `final_counted_cash numeric(14,2)` — nullable
- `difference_amount numeric(14,2)` — nullable
- CHECK status ampliado: ahora permite `'open' | 'closed' | 'closed_with_pending_difference'`

**Trigger activo sobre `cash_sessions` (M18):**
- INSERT en `cash_sessions`: **sin trigger** — insertar sesion sin restriccion adicional.
- UPDATE status='closed': trigger `cash_sessions_prevent_close_with_active_pos_operations` → llama `active_pos_operation_count()` (version M19) → bloquea si hay mesas activas.

### `financial_authorizations`

| Columna | Restriccion | Para TB-12 (nota: bug activo) |
|---------|-------------|-------------------------------|
| id | PK uuid auto | |
| request_type | text NOT NULL | **BUG: script usa `action_type` (inexistente)** |
| requested_by | uuid NOT NULL, FK → app_profiles(id) | |
| authorized_by | uuid NOT NULL, FK → app_profiles(id) | |
| CHECK no_self_auth | requested_by ≠ authorized_by | |
| decision | text NOT NULL DEFAULT 'approved', CHECK ('approved','rejected') | |

---

## 4. Matriz de Candidatos de Fixtures

| ID | Fixture | Tabla | UUID fijo | Para tests | Dependencias | Persiste post-test |
|----|---------|-------|-----------|------------|--------------|-------------------|
| F1 | Usuario test local | auth.users | `10000000-...-0006` | TB-11 | NINGUNA | SI |
| F2 | Perfil superadmin test | app_profiles | `10000000-...-0006` | TB-11 | F1 | SI |
| F3 | Mesa test ocupada | tables | `10000000-...-0007` | TB-01..09 | NINGUNA | SI (UPDATE a 'ocupada') |
| F4 | Orden activa | table_orders | `10000000-...-0008` | TB-01..09 | F3 | SI |
| F5 | Material Botella test | materials | `10000000-...-0009` | TB-01..09 | Botella (`cat_id` = `...-005`) | SI |
| F6 | Inventario Bar Principal | inventory | (PK compuesta) | TB-01..09 | F5 + Center (`...-002`); creado por trigger si F5 no usa bypass | SI |

**Sobre `<test_user_id>` en TB-01..09:**
Con ledger INACTIVO, `finalize_pos_sale` almacena `p_performed_by` como TEXT en `inventory_movements` (sin FK a `app_profiles`). No hay INSERT en `financial_operations` (que si tiene `performed_by → app_profiles(id)` NOT NULL FK). Por tanto, para TB-01..09, `<test_user_id>` puede ser cualquier UUID valido — NO requiere F1/F2.

F1/F2 son requeridos UNICAMENTE para TB-11.

**Sobre F3/F4 (dependencia circular + bypass de triggers):**

`SET LOCAL` aplica solo en la transaccion activa y se revierte automaticamente al commit/rollback.

Orden de insercion (Alternativa A, ver Seccion 3.4):
```
1. INSERT F3 (tables, status='libre', current_order_id=NULL)  -- OK sin bypass (WHEN false)
2. SET LOCAL session_replication_role = 'replica';             -- ventana minima de bypass
3. INSERT F4 (table_orders, table_id=F3.id)                   -- trigger SIN WHEN → REQUIERE bypass
4. UPDATE F3 SET status='ocupada', current_order_id=F4.id     -- trigger dispara → REQUIERE bypass
5. SET LOCAL session_replication_role = 'origin';             -- restaura triggers
```

La ventana de bypass (pasos 2-5) es minima e intencionada. Los fixtures F1/F2/F5/F6 ocurren fuera de ella.

Sin bypass, los pasos 3 y 4 fallan con "No hay una caja abierta." Ver Seccion 3.4 para alternativas.

**Sobre F6 (idempotencia):**
La tabla `inventory` usa `(material_id, center_id)` como clave unica o PK compuesta (pendiente de verificar exactamente). La insercion debe ser idempotente con ON CONFLICT.

---

## 6. Verificaciones Pendientes Antes de Crear el Script

| # | Estado | Verificacion | Evidencia | Afecta |
|---|--------|--------------|-----------|--------|
| V1 | **RESUELTA** | Columnas NOT NULL de `auth.users` — solo `id` es NOT NULL | Evidencia local obtenida | F1 |
| V2 | **RESUELTA** | Columnas NOT NULL de `app_profiles` — confirmadas por `bootstrap_superadmin` (M1) | Inspeccion estatica | F2 |
| V3 | **RESUELTA** | `manual_opening_float` en `cash_sessions` — INEXISTENTE (grep: 0 en M1-M28) | Grep exhaustivo | TB-07 bug B-TB07b |
| V4 | **RESUELTA** | Columnas NOT NULL de `materials` e `inventory` | Solo `name` NOT NULL en materials; inventory sin columnas de negocio adicionales NOT NULL | F5, F6 |
| V5 | **RESUELTA** | Columna FK de materials para categoria — es `cat_id`, no `category_id` | Evidencia en M14 y M18 | F5 |
| V6 | **RESUELTA** | F6 debe ser UPDATE no INSERT — `on_material_created` crea la fila automaticamente | Inspeccion trigger M1 | F6 |

Todas las verificaciones estan resueltas por inspeccion estatica y evidencia local.

---

## 7. Bugs Detectados en el Script de Pruebas

> Estos bugs son en `sql/local/2026-08-11_test_behavioral_ledger_local.sql`.  
> No son bugs en migraciones ni en codigo productivo.

### Bug B-TB07a: `opening_amount = 0` viola CHECK constraint

**Linea afectada** (TB-07, linea ~245 del script):
```sql
-- INCORRECTO (bug):
insert into public.cash_sessions (status, opening_amount, opened_by, manual_opening_float)
values ('open', 0, 'REPLACE:<test_user_id>'::uuid, 500.00)
```

**Constraint violada:** `CHECK (opening_amount > 0)` definida en `20260420143000_add_cash_control_schema.sql`.

**Resultado actual:** El INSERT falla con `check_violation` antes de ejecutar `finalize_pos_sale`. TB-07 nunca llega a probar la logica de pago mixto.

**Correccion requerida:** Cambiar `opening_amount` de `0` a un valor > 0 (ej. `500.00`).

### Bug B-TB07b: Columna `manual_opening_float` no existe en `cash_sessions`

**Linea afectada** (TB-07, linea ~245 del script — mismo INSERT que B-TB07a):
```sql
-- INCORRECTO (bug):
insert into public.cash_sessions (status, opening_amount, opened_by, manual_opening_float)
--                                                                     ^^^^^^^^^^^^^^^^^^^
--                                                          columna que NO existe
values ('open', 0, 'REPLACE:<test_user_id>'::uuid, 500.00)
```

**Evidencia:** Busqueda por `manual_opening_float` y `opening_float` en todas las migraciones (M1 a M28) — **cero coincidencias**. La columna nunca fue definida en ningun DDL del proyecto.

**Resultado actual:** El INSERT falla con `ERROR: column "manual_opening_float" of relation "cash_sessions" does not exist`. Este error ocurre ANTES de la validacion del CHECK de `opening_amount`.

**Correccion requerida:** Eliminar `manual_opening_float` de la lista de columnas del INSERT. El INSERT correcto es:
```sql
insert into public.cash_sessions (status, opening_amount, opened_by)
values ('open', 500.00, 'REPLACE:<test_user_id>'::uuid)
```

### Bug B-TB12: Columna `action_type` no existe en `financial_authorizations`

**Linea afectada** (TB-12, linea ~408 del script):
```sql
-- INCORRECTO (bug):
insert into public.financial_authorizations
  (requested_by, authorized_by, action_type, entity_type, entity_id, decision)
```

**Columna correcta:** `request_type text not null` (no `action_type`).

**Resultado actual:** El INSERT falla con `ERROR: column "action_type" of relation "financial_authorizations" does not exist`. La excepcion cae en `when others then`, no en `when check_violation then`. Resultado del test: `TB-12 PARTIAL excepcion pero no check_violation: column "action_type"...`.

**Correccion requerida:** Cambiar `action_type` por `request_type` en el INSERT de TB-12.

---

## 8. Comportamiento Esperado con Ledger INACTIVO

Las pruebas TB-06/08/09 incluyen `SELECT` de `financial_operations` y `journal_lines`.  
Con ledger **INACTIVO**, estos SELECT retornan vacio — esto es correcto y esperado.

| Prueba | `finalize_pos_sale` ejecuta | Sale/sale_items creados | financial_operations | journal_entries | idempotency_requests |
|--------|-----------------------------|-------------------------|----------------------|-----------------|----------------------|
| TB-06 | SI (Tarjeta) | SI (en ROLLBACK) | NO | NO | SI (si clave not null) |
| TB-07 | NO (bug B-TB07) | NO | NO | NO | NO |
| TB-08 | SI (Transferencia) | SI (en ROLLBACK) | NO | NO | SI |
| TB-09 | SI x2 (Tarjeta) | SI x1 (2da call = cache) | NO | NO | SI — 1 fila, verificable |

**TB-09 es completamente verificable con ledger inactivo** porque `idempotency_requests` se registra independientemente del ledger (confirmado en M24 lineas 714-721).

TB-06/08: la prueba ejecuta sin error pero los SELECT de verificacion de asientos retornan vacio. Los tests no fallan — no tienen `RAISE EXCEPTION` en la ruta de exito, solo `SELECT` para visualizacion.

---

## 9. Script de Fixtures Propuesto

**Nombre:** `sql/local/2026-08-13_fixtures_r4_behavioral.sql`

**Descripcion:** Script idempotente que crea en la base local todos los datos necesarios para ejecutar las pruebas conductuales TB-01 a TB-13. Usa `SET session_replication_role = 'replica'` para insertar F4 y actualizar F3 sin requerir sesion de caja abierta. No crea ninguna sesion de caja (TB-05 requiere que no haya). Produce los 6 fixtures con UUIDs fijos y termina con RAISE NOTICE de los valores a sustituir en el script de pruebas. Exclusivamente local. Idempotente: reutiliza si ya existen.

**Prerequisitos del script:**
1. Bootstraps M14 y M16 ejecutados (org, centro, uom, proveedor, categoria Botella presentes)
2. Las 28 migraciones aplicadas
3. Verificaciones V1 y V4 completadas (resueltas por inspeccion estatica)

**Secuencia de insercion interna del script (Alternativa A):**

```
1. F1: INSERT auth.users (id = 10000000-...-0006)              ← solo id requerido
2. F2: INSERT app_profiles (id, username, email, is_superadmin=true)    ← full_name omitido (NULL permitido); status usa default
3. F3a: INSERT tables (status='libre', current_order_id=NULL)  ← sin bypass (WHEN false)
4. SET LOCAL session_replication_role = 'replica';             ← inicio ventana minima
5. F4: INSERT table_orders (table_id = F3.id)                  ← bypass requerido
6. F3b: UPDATE tables SET status='ocupada', current_order_id=F4.id   ← bypass requerido
7. SET LOCAL session_replication_role = 'origin';              ← fin ventana — triggers restaurados
8. F5: INSERT materials (cat_id = 10000000-...-005)            ← FUERA del bypass; trigger on_material_created dispara
9. F6: UPDATE inventory SET precio_venta=150.00, stock_actual=10
       WHERE material_id=F5.id AND center_id=10000000-...-002  ← UPDATE de la fila auto-creada por trigger
```

**Por que F6 es UPDATE, no INSERT:**  
El INSERT de F5 (paso 8) dispara `on_material_created` → `handle_new_material()` → INSERT automatico en `inventory` con `center_id = Bar Principal`. Si F6 intentara INSERT sobre la misma `(material_id, center_id)`, fallaria por conflicto de clave unica. La solucion es UPDATE de la fila ya creada por el trigger.

**Valores fijos que el script producira:**

| Placeholder del test | UUID/Valor del fixture |
|---------------------|------------------------|
| `<test_table_id>` | `10000000-0000-0000-0000-000000000007` |
| `<test_order_id>` | `10000000-0000-0000-0000-000000000008` |
| `<test_material_id>` | `10000000-0000-0000-0000-000000000009` |
| `<test_user_id>` | `10000000-0000-0000-0000-000000000006` |
| `<test_item_price>` | `150.00` (valor definido en F6) |

**Este script NO se crea en este documento.** Solo nombre, descripcion y diseño quedan propuestos.

---

## 10. Resumen de Blockers

| ID | Blocker | Afecta | Tipo | Estado |
|----|---------|--------|------|--------|
| B1 | auth.users schema sin verificar | F1 | — | **RESUELTO** — solo `id` NOT NULL |
| B2 | materials/inventory columnas NOT NULL | F5, F6 | — | **RESUELTO** — solo `name` NOT NULL en materials; inventory sin columnas adicionales NOT NULL |
| B3 | Triggers de caja bloquean INSERT/UPDATE de mesa sin sesion | F3, F4 | Tecnico — resuelto con `SET LOCAL session_replication_role='replica'` | **RESUELTO EN DISEÑO** |
| B4 | `category_id` vs `cat_id` en materials | F5 | — | **RESUELTO** — columna correcta confirmada: `cat_id` |
| B5 | F6 INSERT vs UPDATE (trigger `on_material_created`) | F6 | — | **RESUELTO EN DISEÑO** — F6 es UPDATE |
| B6 | Bug B-TB07a: `opening_amount=0` viola CHECK (opening_amount > 0) | TB-07 | Bug de script | **ACTIVO** |
| B7 | Bug B-TB07b: columna `manual_opening_float` inexistente | TB-07 | Bug de script | **ACTIVO** |
| B8 | Bug B-TB12: columna `action_type` (correcta: `request_type`) | TB-12 | Bug de script | **ACTIVO** |

**Blockers para DISENAR el script:** Ninguno.  
**Blockers para EJECUTAR el script:** Ninguno de fixtures. B6/B7/B8 son bugs en el script de pruebas — deben corregirse antes de ejecutar TB-07 y TB-12.

---

## 11. Verdict

**DISEÑO DE FIXTURES LISTO PARA AUTORIZACIÓN**

La estructura de fixtures esta completamente definida:

- **6 candidatos (F1-F6)** con UUIDs fijos, dependencias confirmadas y secuencia de insercion detallada
- **Invariante de caja (M18/M19) analizada:** triggers confirmados por lectura literal; Alternativa A seleccionada con restricciones explicitas (Secciones 3.5-3.6)
- **6 de 6 verificaciones resueltas** por inspeccion estatica y evidencia local:
  - V1: `auth.users` — solo `id` NOT NULL
  - V2: `app_profiles` — campos obligatorios `id`, `username`, `email`; `full_name` permite NULL
  - V3: `manual_opening_float` — inexistente (bug de script)
  - V4: `materials` — solo `name` NOT NULL; `inventory` sin columnas de negocio adicionales NOT NULL
  - V5: `cat_id` — columna correcta de materials
  - V6: F6 es UPDATE (trigger `on_material_created` crea la fila)
- **3 bugs confirmados** en el script de pruebas (B-TB07a, B-TB07b, B-TB12) — no bloquean fixtures; si bloquean TB-07 y TB-12

Pasos autorizables en orden:
1. **Correccion de bugs** B-TB07a, B-TB07b, B-TB12 en el script de pruebas — edicion de archivo local
2. **Crear** `sql/local/2026-08-13_fixtures_r4_behavioral.sql`

---

*Documento generado por inspeccion estatica. Ninguna migracion, DDL, DML, deploy, commit ni push fue ejecutado.*
