# Plan de deploy coordinado — Finanzas PRD

**Fecha:** 2026-08-17  
**Rama:** `chore/code-cleanup`  
**Estado:** Borrador para revisión — NO autorizado para ejecución todavía.

---

## 1. Resumen ejecutivo

El módulo de Finanzas está **completo y validado en DEV**. Incluye 5 operaciones financieras, 4 reportes, 10 migraciones y la Edge Function `financial-operations`.

`pos-operations` ya es compatible con la nueva firma de `finalize_pos_sale`: no se requieren cambios de código en esa EF. La cadena completa (POS.jsx → posService.js → pos-operations EF → DB RPC) ya fue actualizada en DEV.

El deploy a PRD requiere una **ventana de mantenimiento coordinada** donde EF y migraciones se apliquen en el menor intervalo posible. Si quedan desincronizadas, las ventas en PRD fallan mientras la firma DB y la EF no coincidan.

**Restricciones vigentes hasta nueva autorización:**
- No activar ledger en PRD sin autorización explícita y saldos iniciales definidos.
- No ejecutar operaciones financieras reales en PRD durante smoke tests.

---

## 2. Estado confirmado en DEV

### Cadena POS actualizada

```
POS.jsx
  payments: [{ method: 'Efectivo', amount: X }]
    ↓
posService.js
  invokePosOperation('finalize_sale', { payments })
    ↓
pos-operations EF (index.ts:576-614)
  lee body.payments → construye Payment[]
  adminClient.rpc('finalize_pos_sale', {
    p_table_id, p_items, p_payments, p_performed_by, p_idempotency_key
  })
    ↓
finalize_pos_sale(uuid, jsonb, jsonb, uuid, text)   ← nueva firma
```

### Fallback legacy en EF

La EF acepta ambos formatos de entrada:
- **Nuevo:** `body.payments = [{method: 'Efectivo', amount: X}]` — lo que envía POS.jsx
- **Legacy:** `body.payment_method = 'Efectivo'` — clientes anteriores; EF convierte a array automáticamente

### Idempotencia en POS

`POS.jsx` no envía `idempotency_key`. EF pasa `null`. RPC omite el check de idempotencia cuando `p_idempotency_key IS NULL`. Sin efecto operativo.

### Tests disponibles

```
npm run test:finance    → financial-operations + cash-operations (88/88 pass)
npm run build           → clean (probado en DEV)
eslint                  → 0 errores en componentes financieros
```

**Limitación:** No existe suite unitaria para `pos-operations`. Validación del flujo de venta con nueva firma fue manual en DEV.

### Hallazgo crítico: permisos Finanzas no están en ninguna migración

`finances:view` y `finances:manage` no existen en `app_permissions`. Ninguna migración hace el seed. En DEV funciona porque todos los usuarios son superadmin (bypass total). En PRD, usuarios con rol Manager/Administrador Operativo **no verán el módulo de Finanzas** hasta que se haga el seed.

---

## 3. Riesgo principal de deploy

### R1 — Brecha EF/DB (ALTO)

| Momento | Estado EF PRD | Estado DB PRD | Resultado |
|---|---|---|---|
| Antes del deploy | EF vieja (llama firma antigua) | DB vieja (firma antigua) | ✅ POS funciona |
| **Brecha:** DB actualizada, EF no | EF vieja (llama `text, uuid`) | DB nueva (firma `jsonb, uuid, text`) | ❌ POS FALLA |
| **Brecha:** EF actualizada, DB no | EF nueva (llama `jsonb, uuid, text`) | DB vieja (firma `text, uuid`) | ❌ POS FALLA |
| Después del deploy | EF nueva | DB nueva | ✅ POS funciona |

La brecha es inevitable. El objetivo es minimizarla: segundos, no minutos.

**Secuencia recomendada para minimizar brecha:**
1. Desplegar nueva EF `pos-operations` primero (la EF nueva falla si DB es vieja, pero brecha dura solo el tiempo de `db push`)
2. Aplicar `db push` inmediatamente

Durante la brecha (segundos), ventas nuevas que lleguen fallan. Ventas en vuelo no se afectan (ya pasaron por EF).

### R2 — BUG-M24-001 en migración 20260811140000 (MEDIO)

Migración `20260811140000` introduce un bug GROUP BY en `finalize_pos_sale`. El bug solo activa cuando ledger está activo. PRD no tendrá ledger activo inicialmente. Migración `20260815100000` (incluida en el batch) lo corrige. Prioridad: aplicar batch completo antes de activar ledger.

### R3 — Permisos Finanzas no seeded (MEDIO)

Sin seed de `finances:view` en `app_permissions`, el módulo Finanzas es invisible para usuarios no-superadmin en PRD. Requiere migración o script separado antes del deploy.

---

## 4. Orden recomendado de deploy PRD

### Pre-ventana (preparación sin tiempo límite)

- [ ] **P1** — Confirmar snapshot/backup de PRD DB activo y reciente.
- [ ] **P2** — Crear migración seed de permisos Finanzas (ver Sección 8 — Pendientes).
- [ ] **P3** — Confirmar saldos iniciales reales para ledger (NO para este deploy; para activación futura).
- [ ] **P4** — Confirmar que `app_user_roles` en PRD tiene roles asignados correctamente (Manager/Admin Operativo/Superadmin).
- [ ] **P5** — Revisar CORS/ALLOWED_ORIGINS para `financial-operations` en PRD.
- [ ] **P6** — Preparar scripts de rollback (ver Sección 7).
- [ ] **P7** — Confirmar que nadie está operando PRD durante la ventana.

### Ventana de mantenimiento (orden estricto)

```
Tiempo 0:00  —  Anunciar mantenimiento. POS debería estar inactivo.
Tiempo 0:01  —  Paso 1: deploy EF pos-operations (nueva firma)
Tiempo 0:02  —  Paso 2: supabase db push --linked (batch completo Finance)
               → Durante Paso 1 → Paso 2: brecha de ~60s donde ventas fallan
Tiempo 0:05  —  Paso 3: deploy EF financial-operations (nueva, no existe en PRD)
Tiempo 0:06  —  Paso 4: deploy resto de EFs si cambiaron (cash-operations, erp-operations)
Tiempo 0:08  —  Paso 5: ejecutar smoke tests POS (ver Sección 5)
Tiempo 0:15  —  Paso 6: confirmar Finanzas visible para usuarios autorizados
Tiempo 0:20  —  Anunciar fin de mantenimiento
```

**NO incluir en esta ventana:**
- Activación de ledger
- Ejecución de operaciones financieras reales
- Cambio de secrets de PRD (fuera de scope)

### Sobre el orden de Paso 1 y Paso 2

Opción A (recomendada): EF primero, luego DB push.
- Brecha: EF nueva llama firma nueva que no existe aún → ventas fallan durante `db push` (típicamente < 60s)
- Recuperación automática cuando `db push` termina

Opción B: DB push primero, luego EF.
- Brecha: DB nueva sin firma antigua → EF vieja falla → ventas fallan hasta que nueva EF se deploya
- El deploy de EF en Supabase tarda varios segundos extra vs `db push`
- Brecha potencialmente más larga

**Preferir Opción A.** La brecha de `db push` es más predecible.

---

## 5. Smoke tests PRD post-deploy

Ejecutar **sin activar ledger**. Estas pruebas validan que el deploy no rompió el comportamiento preexistente.

### 5.1 Flujo de venta POS

| Test | Pasos | Resultado esperado |
|---|---|---|
| Venta básica con Efectivo | Abrir caja → abrir mesa → agregar producto → cobrar | Venta registrada, mesa liberada, número de documento generado |
| POS bloqueado sin caja | Cerrar caja → intentar abrir mesa | Error: "No hay una caja abierta..." |
| Cierre bloqueado con mesa activa | Abrir caja → abrir mesa → intentar cerrar caja | Error: no se puede cerrar con mesas activas |
| Cubeta Mixta (si hay stock) | Agregar cubeta → cobrar | Venta con precio $32 registrada |

### 5.2 Control de caja

| Test | Pasos | Resultado esperado |
|---|---|---|
| Apertura de caja | Abrir caja con monto inicial > 0 | Caja abierta, snapshot inicial |
| Una sola caja | Intentar abrir segunda caja | Error: ya hay una caja abierta |
| Cierre sin ventas activas | Abrir y cerrar caja sin mesas | Caja cerrada correctamente |

### 5.3 Módulo Finanzas

| Test | Pasos | Resultado esperado |
|---|---|---|
| Visibilidad de módulo | Login con usuario Manager → ver nav | Finanzas visible (requiere P2 resuelto) |
| Saldos de cuentas | Abrir Finanzas → ver Saldos | Reporte carga sin error |
| Pólizas | Abrir Finanzas → ver Pólizas | Reporte carga sin error (puede estar vacío) |
| Mayor | Abrir Finanzas → ver Mayor contable | Reporte carga sin error |
| Sesiones de caja | Abrir Finanzas → ver Sesiones | Muestra sesiones existentes |
| Operaciones financieras | Ninguna — NO ejecutar en PRD durante smoke | N/A |

### 5.4 Verificaciones de consola

- Sin errores JavaScript en consola del browser
- Sin errores en logs de Edge Functions (Supabase dashboard)
- HTTP 200 en todas las llamadas de reportes

---

## 6. Activación de ledger PRD

**Esta es una fase separada, no parte del deploy inicial.**

Requiere antes de ejecutarse:
1. **Saldos iniciales reales** — determinar cuánto dinero hay en Caja Operativa (1101), Caja Fuerte (1102), Banco (1103) al momento de corte.
2. **Autorización explícita** del responsable del negocio.
3. **Fecha de corte definida** — todas las transacciones desde esa fecha generarán asientos contables.
4. **Revisión del plan de activación** (proceso separado — `activate_ledger` RPC con saldos iniciales).

**Secuencia de activación (cuando sea autorizada):**
1. Confirmar batch de migraciones Finance aplicado (incluyendo `20260815100000`).
2. Ejecutar `activate_ledger` con saldos reales vía `financial-operations` EF.
3. Confirmar que `ledger_settings.ledger_cutover_at` tiene timestamp correcto.
4. Ejecutar una venta de prueba (Efectivo) y validar que aparece póliza JE-VTA-XXXXX en Pólizas.
5. Verificar saldo en cuentas de Caja Operativa post-venta.

**Jamás hacer `activate_ledger` antes de confirmar que `20260815100000` está aplicado** — el bug GROUP BY en `20260811140000` causaría que cada venta fallara.

---

## 7. Rollback conceptual

**IMPORTANTE:** No improvisar rollback en caliente. Los scripts de rollback deben estar redactados, revisados y disponibles ANTES de iniciar la ventana.

### Si falla el deploy de EF pos-operations

- Revertir a la versión anterior de la EF (requiere tener el código de la EF vieja disponible como deployment anterior en Supabase dashboard o en git).
- La EF vieja llama la firma antigua de `finalize_pos_sale`.
- Si DB push no ha corrido aún: POS funciona normalmente.
- Si DB push ya corrió: POS sigue fallando aunque se revierta la EF — la firma antigua ya no existe en DB.

### Si falla el DB push (migración)

- Supabase `db push` es transaccional por migración. Si una migración falla, las siguientes no se aplican.
- Si falla durante `20260811140000` (la crítica): posible estado intermedio donde la firma antigua fue droppada pero la nueva no fue creada. POS roto.
- Script de rollback para este caso:
  ```sql
  -- SOLO si 20260811140000 falló a mitad y no puede re-correrse:
  -- Recrear la firma antigua de finalize_pos_sale manualmente
  -- (texto completo de 20260715221000_harden_finalize_pos_sale.sql)
  -- REQUIERE revisión antes de ejecutar — NO improvisar
  ```
- Si las migraciones anteriores a `20260811140000` corrieron bien y esa falla: las tablas `financial_operations`, `financial_payments` ya fueron creadas. Puede volver a correr solo esa migración.

### Si POS falla después del deploy completo

Síntoma: ventas retornan error de DB.

Diagnóstico rápido:
1. Verificar en Supabase Edge Logs el mensaje exacto de error.
2. Si dice `function finalize_pos_sale(uuid, jsonb, text, uuid) does not exist` → EF vieja aún en PRD. Re-desplegar EF nueva.
3. Si dice `column "pay" must appear in the GROUP BY` → bug de `20260811140000` sin fix. Verificar que `20260815100000` se aplicó. Si no, aplicar manualmente.
4. Si dice `Cuentas del sistema incompletas` → ledger está activo pero catálogo incompleto. No debería ocurrir si ledger no fue activado.

### Si falla la activación del ledger (fase posterior)

- Ledger no activo = ventas siguen funcionando sin asientos.
- Re-intentar `activate_ledger` con saldos corregidos.
- No hay rollback destructivo — la activación del ledger es reversible solo si no hay asientos confirmados.

---

## 8. Pendientes antes de PRD

### P1 — Migración seed de permisos Finanzas (BLOQUEANTE para usuarios no-superadmin)

No existe migración que agregue `finances:view` a `app_permissions` ni que la asigne a roles. Sin esto, Manager/Administrador Operativo no ven el módulo. Debe crearse una migración similar a `20260420144000_seed_cash_control_permissions.sql`:

```sql
-- Pendiente: crear como migración numerada
insert into public.app_permissions (screen_key, action_key, description)
values
  ('finances', 'view',   'Ver el módulo de finanzas y reportes contables.'),
  ('finances', 'manage', 'Ejecutar operaciones financieras (traspasos, aportaciones, retiros).')
on conflict (screen_key, action_key) do update
  set description = excluded.description;

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'finances'
 and permissions.action_key in ('view')  -- 'manage' se asigna solo a superadmin/manager según política PRD
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing;
```

**Nota:** Definir qué roles reciben `finances:manage` (operaciones) vs solo `finances:view` (reportes) — decisión de negocio pendiente.

### P2 — Confirmar roles en PRD

`app_user_roles` en DEV está vacío. Todos son superadmin. En PRD, confirmar que usuarios reales tienen roles asignados correctamente, especialmente Manager. Sin roles, ningún permiso aplica (solo superadmin ve todo).

### P3 — CORS y secrets de financial-operations en PRD

`financial-operations` no existe en PRD. Verificar:
- URL de la EF configurada correctamente en `financialService.js` (debe coincidir con PRD project ref).
- Variables de entorno necesarias en la EF (SUPABASE_URL, SERVICE_ROLE_KEY, SUPABASE_ANON_KEY).
- CORS configurado si el frontend de PRD está en dominio distinto.

### P4 — Saldos iniciales para ledger

Requeridos únicamente para la activación del ledger (fase posterior). No bloqueantes para el deploy inicial.

| Cuenta | Descripción | Saldo a definir |
|---|---|---|
| 1101 | Caja operativa | Efectivo físico en caja al momento de corte |
| 1102 | Caja fuerte | Efectivo en caja fuerte al momento de corte |
| 1103 | Banco | Saldo bancario al momento de corte |

### P5 — Backup/snapshot confirmado

Antes de iniciar la ventana: confirmar backup automático de PRD en Supabase dashboard, o ejecutar backup manual. Documentar el timestamp del último backup.

### P6 — Scripts de rollback redactados y revisados

Los escenarios de rollback de la Sección 7 deben tener SQL final listo para pegar, no solo conceptual.

### P7 — Ventana de mantenimiento comunicada

Coordinar con operadores de La Carreta para que POS no esté en uso durante la ventana (~20 min).

---

## 9. Resultado final

**Plan PRD listo para revisión**

El módulo de Finanzas está completo y validado en DEV. La EF `pos-operations` ya es compatible. No se requieren cambios de código adicionales.

El plan está completo a nivel técnico, pero **bloqueado para ejecución** por:

| Bloqueo | Descripción | Responsable |
|---|---|---|
| **B1** | Migración seed de permisos Finanzas no existe (P1) | DEV — crear antes de ventana |
| **B2** | Scripts de rollback no redactados en SQL final (P6) | DEV — redactar antes de ventana |
| **B3** | Autorización explícita para ejecutar deploy PRD | Negocio |
| **B4** | Confirmación de backup PRD (P5) | Operaciones |
| **B5** | Ventana de mantenimiento coordinada con operadores (P7) | Negocio |

Una vez resueltos B1–B5, el deploy puede proceder siguiendo la secuencia de la Sección 4.

**La activación del ledger es una fase separada, posterior al deploy, y requiere autorización independiente.**
