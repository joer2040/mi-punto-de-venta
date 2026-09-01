# FASE3 — R9: Permisos Financieros DB DEV

**Fecha (UTC):** 2026-08-16  
**Entorno:** DEV (`rtkdrnfqihulqdhixxzf`)  
**Acción:** Seed de roles base + permisos `finances:view` y `finances:manage` en DEV  
**Restricciones aplicadas:** sin PRD, sin código, sin migraciones, sin commits, sin SQL destructivo, sin `app_user_roles`.

---

## 1. Hallazgo previo — `app_roles` vacío

Al intentar ejecutar el SQL de permisos financieros, se descubrió que `app_roles` tenía 0 filas en DEV. Las tablas `app_role_permissions` y `app_user_roles` también estaban vacías.

| Tabla | Filas pre-seed |
|-------|---------------|
| `app_permissions` | 5 (cash_control, movements, report_material_movements) |
| `app_roles` | **0** — nunca seeded |
| `app_role_permissions` | **0** — dependencia de app_roles vacío |
| `app_user_roles` | **0** |

**Causa raíz:** `sql/archive/security_auth_setup.sql` contiene el seed original de roles pero nunca fue aplicado a DEV. Las migrations de permisos posteriores (cash_control, movements, etc.) corrieron con JOIN a `app_roles` vacío → 0 filas insertadas en `app_role_permissions`.

**DEV funcionó hasta ahora solo con cuentas superadmin** (`is_superadmin=true` en `app_profiles` → bypass de todos los permisos de rol).

### Análisis del rol `admin`

Referenciado en 3 migrations como filtro defensivo (`WHERE lower(roles.name) in ('manager', 'administrador operativo', 'admin')`). No tiene funcionalidad propia en el frontend — `SecurityUsers.jsx:209` usa `'admin'` como label de display para `is_superadmin`, no como rol de DB. **No incluido en seed.**

---

## 2. SQLs ejecutados

### Paso 1 — Seed de roles base

**Archivo:** `sql/dev/2026-08-16_seed_app_roles_dev.sql`

```sql
begin;

insert into public.app_roles (name)
values
  ('manager'),
  ('administrador operativo'),
  ('mesero')
on conflict (name) do nothing;

-- Validación inline
do $$
declare
  role_count int;
begin
  select count(*) into role_count
  from public.app_roles
  where lower(name) in ('manager', 'administrador operativo', 'mesero');

  if role_count < 3 then
    raise exception 'ERROR: se esperaban 3 roles, se encontraron %', role_count;
  end if;

  raise notice 'OK: % roles presentes en app_roles', role_count;
end;
$$;

commit;
```

**Resultado:** `rows: []` sin error → validación `DO $$` pasó.

### Paso 2 — Permisos financieros (re-ejecución idempotente)

**Archivo:** `sql/dev/2026-08-16_seed_finances_permissions.sql`

```sql
begin;

insert into public.app_permissions (screen_key, action_key, description)
values
  ('finances', 'view',   'Ver el módulo de Finanzas: saldos, pólizas, mayor y sesiones de caja.'),
  ('finances', 'manage', 'Ejecutar operaciones financieras: traspasos, aportaciones, retiros, resoluciones y reversas.')
on conflict (screen_key, action_key) do update
  set description = excluded.description;

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from   public.app_roles       roles
join   public.app_permissions permissions
       on  permissions.screen_key = 'finances'
       and permissions.action_key = 'view'
where  lower(trim(roles.name)) in ('manager', 'administrador operativo')
on conflict do nothing;

-- Validación inline
do $$ ... $$;

commit;
```

**Resultado:** `rows: []` sin error.

---

## 3. Validación

### `app_roles` post-seed

| id | name |
|----|------|
| `4337ed94-...` | administrador operativo |
| `e79c8256-...` | manager |
| `d35eb8a8-...` | mesero |

### `app_permissions` — permisos financieros

| screen_key | action_key | description |
|-----------|-----------|-------------|
| `finances` | `manage` | Ejecutar operaciones financieras... |
| `finances` | `view` | Ver el módulo de Finanzas... |

### `app_role_permissions` — asignaciones financieras

| rol | screen_key | action_key |
|-----|-----------|-----------|
| `administrador operativo` | `finances` | `view` |
| `manager` | `finances` | `view` |

### Verificación negativa — mesero no asignado

```sql
select ... where p.screen_key = 'finances' and lower(r.name) = 'mesero'
-- rows: []  ✅
```

---

## 4. Resumen de validaciones

| Check | Resultado |
|-------|-----------|
| `app_roles` tiene 3 filas (manager, admin.op., mesero) | ✅ |
| `finances:view` en `app_permissions` | ✅ |
| `finances:manage` en `app_permissions` | ✅ |
| `manager` tiene `finances:view` | ✅ |
| `administrador operativo` tiene `finances:view` | ✅ |
| `mesero` NO tiene `finances:view` | ✅ |
| `finances:manage` sin asignación de rol | ✅ (intencional — solo superadmin) |
| SQL destructivo ejecutado | ❌ Ninguno |
| `app_user_roles` modificado | ❌ No tocado |
| PRD modificado | ❌ No tocado |

---

## 5. Efecto en autenticación

Cuando un usuario con rol `manager` o `administrador operativo` haga login, `authService.getCurrentPermissions` retornará `'finances:view'` en su array de `permissionKeys`. El `can('finances', 'view')` en `AuthContext` devolverá `true` → el módulo Finanzas aparecerá en navegación.

**Condición:** el usuario debe tener una fila en `app_user_roles` apuntando al rol correcto. Con `app_user_roles` actualmente vacío, los usuarios existentes en DEV siguen funcionando como superadmin por ahora. Al crear nuevos usuarios con rol manager/administrador operativo desde la UI, sí obtendrán acceso.

---

## 6. Nota — permissions de módulos anteriores

Las migrations de permisos de cash_control, movements y report_material_movements también corrieron con `app_roles` vacío → sus asignaciones de `app_role_permissions` son también 0. No son parte de esta tarea (R9 Finanzas), pero se documentan como pendiente si se necesita que roles manager/mesero accedan a esos módulos sin superadmin.

---

## 7. Próximo paso

Con CORS y permisos DB desbloqueados, el siguiente paso es implementar la UI de Finanzas siguiendo el `PLAN_DESBLOQUEO_UI_FINANZAS_DEV.md`:

- **Fase 1:** `financialService.js` + `permissionConfig.js` + routing en `App.jsx`
- **Fase 2:** Pantallas de solo lectura (`FinancesHome`, `FinancesBalances`, `FinancesJournal`, `FinancesLedger`, `FinancesCashSessions`)
- **Fase 3:** Formularios de operación

---

*Documento generado: 2026-08-16. Sin código modificado. Sin migraciones tocadas. Sin PRD modificado.*
