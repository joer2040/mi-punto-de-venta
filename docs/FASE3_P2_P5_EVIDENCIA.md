# Fase 3 - Evidencia P2 y P5: Estado Pre-R1

**Fecha y hora UTC:** 2026-08-12T17:19:57Z
**Proyecto DEV:** `rtkdrnfqihulqdhixxzf`
**Rama:** `chore/code-cleanup`
**Ejecutor:** joer2040
**Tipo:** Lectura unicamente. Sin DML, DDL, migration repair, db push ni deployments.

---

## P2 - Proyecto DEV enlazado y accesible

**Comando ejecutado:**
```
npx supabase migration list --linked
```

**Salida completa:**

```
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260414045424 | 20260414045424 | 2026-04-14 04:54:24
   20260414060917 | 20260414060917 | 2026-04-14 06:09:17
   20260414123500 | 20260414123500 | 2026-04-14 12:35:00
   20260415093000 | 20260415093000 | 2026-04-15 09:30:00
   20260415100500 | 20260415100500 | 2026-04-15 10:05:00
   20260416093000 | 20260416093000 | 2026-04-16 09:30:00
   20260417113000 | 20260417113000 | 2026-04-17 11:30:00
   20260417114000 | 20260417114000 | 2026-04-17 11:40:00
   20260417122000 | 20260417122000 | 2026-04-17 12:20:00
   20260418103000 | 20260418103000 | 2026-04-18 10:30:00
   20260419170000 | 20260419170000 | 2026-04-19 17:00:00
   20260420143000 | 20260420143000 | 2026-04-20 14:30:00
   20260420144000 | 20260420144000 | 2026-04-20 14:40:00
   20260714132000 | 20260714132000 | 2026-07-14 13:20:00
   20260715221000 | 20260715221000 | 2026-07-15 22:10:00
   20260715223000 | 20260715223000 | 2026-07-15 22:30:00
   20260716123000 | 20260716123000 | 2026-07-16 12:30:00
   20260803183000 | 20260803183000 | 2026-08-03 18:30:00
   20260803232300 | 20260803232300 | 2026-08-03 23:23:00
   20260804010500 | 20260804010500 | 2026-08-04 01:05:00
   20260810200000 |                | 2026-08-10 20:00:00
   20260811110000 |                | 2026-08-11 11:00:00
   20260811130000 |                | 2026-08-11 13:00:00
   20260811140000 |                | 2026-08-11 14:00:00
   20260811150000 |                | 2026-08-11 15:00:00
   20260811160000 |                | 2026-08-11 16:00:00
   20260811170000 |                | 2026-08-11 17:00:00
   20260812100000 |                | 2026-08-12 10:00:00
```

> **Nota:** `npx supabase migration list --linked` es el comando de evidencia para P2 per estrategia R1. `npx supabase status` no entrega estado de migraciones individuales.

**Analisis P2:**

| Observacion | Valor |
|---|---|
| Migraciones Local = Remote | 20 (pre-ledger, sin cambios) |
| Migraciones Local-only (ledger) | 7: `20260810200000` ... `20260811170000` |
| `20260812100000` en Remote | No - correctamente excluida de R1 |
| Proyecto responde | Si - CLI conecto y devolvio tabla sin error |

**Criterio P2:** CUMPLIDO - proyecto enlazado y accesible; estado de migraciones confirmado.

---

## P5 - Captura de estado previo (`schema_migrations`) como auditoria

**Comando ejecutado:**
```sql
SELECT version, name, statements
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

**Columnas devueltas:** `version`, `name`, `statements`

**Resumen - 20 filas (Remote):**

| # | version | name | statements (count) |
|---|---|---|---|
| 1 | `20260414045424` | `remote_schema` | 291 |
| 2 | `20260414060917` | `remote_schema` | 1 |
| 3 | `20260414123500` | `cleanup_legacy_user_sql_functions` | 3 |
| 4 | `20260415093000` | `harden_public_access` | 103 |
| 5 | `20260415100500` | `fix_function_search_paths` | 8 |
| 6 | `20260416093000` | `link_materials_to_providers` | 5 |
| 7 | `20260417113000` | `seed_material_movements_permissions` | 4 |
| 8 | `20260417114000` | `create_inventory_movement_documents` | 7 |
| 9 | `20260417122000` | `seed_material_movements_report_permissions` | 4 |
| 10 | `20260418103000` | `add_table_order_reservation_flag` | 2 |
| 11 | `20260419170000` | `support_general_provider_purchases` | 2 |
| 12 | `20260420143000` | `add_cash_control_schema` | 14 |
| 13 | `20260420144000` | `seed_cash_control_permissions` | 4 |
| 14 | `20260714132000` | `catalogo_cocteleria_extras_botella` | 6 |
| 15 | `20260715221000` | `harden_finalize_pos_sale` | 3 |
| 16 | `20260715223000` | `make_botella_sellable` | 1 |
| 17 | `20260716123000` | `reconcile_table_order_reservation_flag` | 1 |
| 18 | `20260803183000` | `enforce_cash_session_pos_invariant` | 20 |
| 19 | `20260803232300` | `fix_active_pos_operation_count` | 6 |
| 20 | `20260804010500` | `open_cash_session_atomic` | 6 |
### Detalle de statements por fila

Formato: cada fila de `schema_migrations` con sus `statements[]` completos.

---

#### Fila 1 - ``20260414045424`` | ``remote_schema`` (291 statements)

```sql
-- [0]
SET statement_timeout = 0

-- [1]
SET lock_timeout = 0

-- [2]
SET idle_in_transaction_session_timeout = 0

-- [3]
SET client_encoding = 'UTF8'

-- [4]
SET standard_conforming_strings = on

-- [5]
SELECT pg_catalog.set_config('search_path', '', false)

-- [6]
SET check_function_bodies = false

-- [7]
SET xmloption = content

-- [8]
SET client_min_messages = warning

-- [9]
SET row_security = off

-- [10]
COMMENT ON SCHEMA "public" IS 'standard public schema'

-- [11]
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql"

-- [12]
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions"

-- [13]
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions"

-- [14]
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault"

-- [15]
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions"

-- [16]
CREATE OR REPLACE FUNCTION "public"."assert_valid_username"("p_username" "text") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
begin
  if p_username is null or public.normalize_username(p_username) = '' then
    raise exception 'El usuario es obligatorio.';
  end if;

  if public.normalize_username(p_username) !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'El usuario debe tener entre 3 y 30 caracteres y solo usar letras, numeros, punto, guion o guion bajo.';
  end if;
end;
$_$

-- [17]
ALTER FUNCTION "public"."assert_valid_username"("p_username" "text") OWNER TO "postgres"

-- [18]
CREATE OR REPLACE FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text" DEFAULT 'Administrador General'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  normalized_username text;
  internal_email text;
begin
  if exists(select 1 from public.app_profiles) then
    raise exception 'El superadministrador inicial ya fue creado.';
  end if;

  if not exists(select 1 from auth.users where id = p_user_id) then
    raise exception 'El usuario auth indicado no existe.';
  end if;

  perform public.assert_valid_username(p_username);

  normalized_username := public.normalize_username(p_username);
  internal_email := public.username_to_auth_email(normalized_username);

  insert into public.app_profiles (id, username, full_name, email, status, is_superadmin)
  values (p_user_id, normalized_username, p_full_name, internal_email, 'active', true);

  insert into public.audit_log (entity_type, entity_id, event_type, new_values, notes, performed_by)
  values (
    'app_profile',
    p_user_id,
    'superadmin_bootstrap',
    jsonb_build_object('username', normalized_username, 'full_name', p_full_name),
    'Creacion del superadministrador inicial',
    'bootstrap'
  );

  return p_user_id;
end;
$$

-- [19]
ALTER FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text") OWNER TO "postgres"

-- [20]
CREATE OR REPLACE FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text" DEFAULT NULL::"text", "p_is_superadmin" boolean DEFAULT false, "p_role_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  normalized_username text;
  internal_email text;
  new_user_id uuid;
begin
  if not public.current_app_is_superadmin() then
    raise exception 'No tienes permisos para crear usuarios.';
  end if;

  normalized_username := public.normalize_username(p_username);
  internal_email := public.username_to_auth_email(normalized_username);
  new_user_id := public.create_auth_user(normalized_username, p_password);

  insert into public.app_profiles (id, username, full_name, email, status, is_superadmin)
  values (new_user_id, normalized_username, p_full_name, internal_email, 'active', coalesce(p_is_superadmin, false));

  if coalesce(array_length(p_role_ids, 1), 0) > 0 then
    insert into public.app_user_roles (user_id, role_id)
    select new_user_id, role_id
    from unnest(p_role_ids) as role_id
    on conflict do nothing;
  end if;

  insert into public.audit_log (entity_type, entity_id, event_type, new_values, notes, performed_by)
  values (
    'app_profile',
    new_user_id,
    'user_created',
    jsonb_build_object(
      'username', normalized_username,
      'full_name', p_full_name,
      'is_superadmin', coalesce(p_is_superadmin, false),
      'role_ids', coalesce(to_jsonb(p_role_ids), '[]'::jsonb)
    ),
    'Alta de usuario desde panel de seguridad',
    auth.uid()::text
  );

  if coalesce(array_length(p_role_ids, 1), 0) > 0 then
    insert into public.audit_log (entity_type, entity_id, event_type, new_values, notes, performed_by)
    values (
      'app_profile',
      new_user_id,
      'role_assigned',
      jsonb_build_object('role_ids', coalesce(to_jsonb(p_role_ids), '[]'::jsonb)),
      'Asignacion inicial de roles',
      auth.uid()::text
    );
  end if;

  return new_user_id;
end;
$$

-- [21]
ALTER FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) OWNER TO "postgres"

-- [22]
CREATE OR REPLACE FUNCTION "public"."current_app_is_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.app_profiles profiles
    join public.app_user_roles user_roles on user_roles.user_id = profiles.id
    join public.app_roles roles on roles.id = user_roles.role_id
    where profiles.id = auth.uid()
      and profiles.status = 'active'
      and roles.name = 'manager'
  );
$$

-- [23]
ALTER FUNCTION "public"."current_app_is_manager"() OWNER TO "postgres"

-- [24]
CREATE OR REPLACE FUNCTION "public"."current_app_is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.app_profiles
    where id = auth.uid()
      and is_superadmin = true
      and status = 'active'
  );
$$

-- [25]
ALTER FUNCTION "public"."current_app_is_superadmin"() OWNER TO "postgres"

-- [26]
CREATE OR REPLACE FUNCTION "public"."delete_app_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  profile_snapshot public.app_profiles%rowtype;
begin
  if not public.current_app_is_superadmin() then
    raise exception 'No tienes permisos para eliminar usuarios.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'No puedes eliminar tu propio usuario.';
  end if;

  select *
    into profile_snapshot
  from public.app_profiles
  where id = p_user_id;

  if not found then
    raise exception 'Usuario no encontrado.';
  end if;

  insert into public.audit_log (entity_type, entity_id, event_type, old_values, notes, performed_by)
  values (
    'app_profile',
    p_user_id,
    'user_deleted',
    jsonb_build_object(
      'username', profile_snapshot.username,
      'full_name', profile_snapshot.full_name,
      'status', profile_snapshot.status,
      'is_superadmin', profile_snapshot.is_superadmin
    ),
    'Eliminacion de usuario desde panel de seguridad',
    auth.uid()::text
  );

  delete from auth.users where id = p_user_id;
end;
$$

-- [27]
ALTER FUNCTION "public"."delete_app_user"("p_user_id" "uuid") OWNER TO "postgres"

-- [28]
CREATE OR REPLACE FUNCTION "public"."handle_new_material"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Insertar automáticamente en la tabla de inventory para el primer centro que encuentre
    INSERT INTO public.inventory (material_id, center_id, stock_actual, costo_promedio, precio_venta)
    VALUES (
        NEW.id, 
        (SELECT id FROM public.centers LIMIT 1), -- Asigna el primer centro por defecto
        0, 
        0, 
        0
    );
    RETURN NEW;
END;
$$

-- [29]
ALTER FUNCTION "public"."handle_new_material"() OWNER TO "postgres"

-- [30]
CREATE OR REPLACE FUNCTION "public"."normalize_username"("p_username" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(btrim(p_username));
$$

-- [31]
ALTER FUNCTION "public"."normalize_username"("p_username" "text") OWNER TO "postgres"

-- [32]
CREATE OR REPLACE FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT 'active'::"text", "p_is_superadmin" boolean DEFAULT false, "p_role_ids" "uuid"[] DEFAULT ARRAY[]::"uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  previous_profile public.app_profiles%rowtype;
  normalized_username text;
  internal_email text;
begin
  if not public.current_app_is_superadmin() then
    raise exception 'No tienes permisos para actualizar usuarios.';
  end if;

  select *
    into previous_profile
  from public.app_profiles
  where id = p_user_id;

  if not found then
    raise exception 'Usuario no encontrado.';
  end if;

  perform public.assert_valid_username(p_username);
  normalized_username := public.normalize_username(p_username);
  internal_email := public.username_to_auth_email(normalized_username);

  if exists(
    select 1
    from public.app_profiles
    where username = normalized_username
      and id <> p_user_id
  ) then
    raise exception 'Ya existe un usuario con ese nombre.';
  end if;

  update auth.users
  set
    email = internal_email,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', normalized_username),
    updated_at = now()
  where id = p_user_id;

  update auth.identities
  set
    provider_id = internal_email,
    identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', internal_email, 'username', normalized_username),
    updated_at = now()
  where user_id = p_user_id
    and provider = 'email';

  update public.app_profiles
  set
    username = normalized_username,
    full_name = p_full_name,
    email = internal_email,
    status = case when p_status in ('active', 'inactive') then p_status else previous_profile.status end,
    is_superadmin = coalesce(p_is_superadmin, false)
  where id = p_user_id;

  delete from public.app_user_roles where user_id = p_user_id;

  if coalesce(array_length(p_role_ids, 1), 0) > 0 then
    insert into public.app_user_roles (user_id, role_id)
    select p_user_id, role_id
    from unnest(p_role_ids) as role_id
    on conflict do nothing;
  end if;

  insert into public.audit_log (entity_type, entity_id, event_type, old_values, new_values, notes, performed_by)
  values (
    'app_profile',
    p_user_id,
    case when previous_profile.status <> 'inactive' and p_status = 'inactive' then 'user_deactivated' else 'user_updated' end,
    jsonb_build_object(
      'username', previous_profile.username,
      'full_name', previous_profile.full_name,
      'status', previous_profile.status,
      'is_superadmin', previous_profile.is_superadmin
    ),
    jsonb_build_object(
      'username', normalized_username,
      'full_name', p_full_name,
      'status', p_status,
      'is_superadmin', coalesce(p_is_superadmin, false),
      'role_ids', coalesce(to_jsonb(p_role_ids), '[]'::jsonb)
    ),
    'Actualizacion de usuario desde panel de seguridad',
    auth.uid()::text
  );

  insert into public.audit_log (entity_type, entity_id, event_type, new_values, notes, performed_by)
  values (
    'app_profile',
    p_user_id,
    'role_assigned',
    jsonb_build_object('role_ids', coalesce(to_jsonb(p_role_ids), '[]'::jsonb)),
    'Actualizacion de roles del usuario',
    auth.uid()::text
  );
end;
$$

-- [33]
ALTER FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text", "p_status" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) OWNER TO "postgres"

-- [34]
CREATE OR REPLACE FUNCTION "public"."update_inventory_on_purchase"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_center_id UUID;
BEGIN
    -- Obtener el centro de la compra
    SELECT center_id INTO v_center_id FROM public.purchases WHERE id = NEW.purchase_id;

    -- Actualizar el inventario: Sumar stock y recalcular costo promedio
    UPDATE public.inventory
    SET 
        stock_actual = stock_actual + NEW.quantity,
        costo_promedio = CASE 
            WHEN (stock_actual + NEW.quantity) > 0 
            THEN ((stock_actual * costo_promedio) + (NEW.quantity * NEW.unit_cost)) / (stock_actual + NEW.quantity)
            ELSE NEW.unit_cost 
        END,
        updated_at = NOW()
    WHERE material_id = NEW.material_id AND center_id = v_center_id;

    RETURN NEW;
END;
$$

-- [35]
ALTER FUNCTION "public"."update_inventory_on_purchase"() OWNER TO "postgres"

-- [36]
CREATE OR REPLACE FUNCTION "public"."update_inventory_on_sale"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_center_id UUID;
BEGIN
    -- Obtener el centro de la venta
    SELECT center_id INTO v_center_id FROM public.sales WHERE id = NEW.sale_id;

    -- Restar el stock del inventario
    UPDATE public.inventory
    SET 
        stock_actual = stock_actual - NEW.quantity,
        updated_at = NOW()
    WHERE material_id = NEW.material_id AND center_id = v_center_id;

    RETURN NEW;
END;
$$

-- [37]
ALTER FUNCTION "public"."update_inventory_on_sale"() OWNER TO "postgres"

-- [38]
CREATE OR REPLACE FUNCTION "public"."username_to_auth_email"("p_username" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select public.normalize_username(p_username) || '@usuarios.mi-punto-de-venta.local';
$$

-- [39]
ALTER FUNCTION "public"."username_to_auth_email"("p_username" "text") OWNER TO "postgres"

-- [40]
SET default_tablespace = ''

-- [41]
SET default_table_access_method = "heap"

-- [42]
CREATE TABLE IF NOT EXISTS "public"."app_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "screen_key" "text" NOT NULL,
    "action_key" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
)

-- [43]
ALTER TABLE "public"."app_permissions" OWNER TO "postgres"

-- [44]
COMMENT ON TABLE "public"."app_permissions" IS 'Catalogo de permisos atomicos por pantalla y accion.'

-- [45]
CREATE TABLE IF NOT EXISTS "public"."app_profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "full_name" "text",
    "email" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_superadmin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
)

-- [46]
ALTER TABLE "public"."app_profiles" OWNER TO "postgres"

-- [47]
COMMENT ON TABLE "public"."app_profiles" IS 'Perfiles de acceso de la aplicacion, enlazados a auth.users con identificador visible por username.'

-- [48]
CREATE TABLE IF NOT EXISTS "public"."app_role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
)

-- [49]
ALTER TABLE "public"."app_role_permissions" OWNER TO "postgres"

-- [50]
CREATE TABLE IF NOT EXISTS "public"."app_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
)

-- [51]
ALTER TABLE "public"."app_roles" OWNER TO "postgres"

-- [52]
COMMENT ON TABLE "public"."app_roles" IS 'Catalogo de roles para asignacion de permisos por pantalla y accion.'

-- [53]
CREATE TABLE IF NOT EXISTS "public"."app_user_roles" (
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
)

-- [54]
ALTER TABLE "public"."app_user_roles" OWNER TO "postgres"

-- [55]
CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "old_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "new_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "performed_by" "text",
    CONSTRAINT "audit_log_event_type_check" CHECK (("event_type" = ANY (ARRAY['material_created'::"text", 'material_updated'::"text", 'price_updated'::"text", 'provider_created'::"text", 'purchase_created'::"text", 'inventory_adjusted'::"text", 'user_created'::"text", 'user_updated'::"text", 'user_deactivated'::"text", 'user_deleted'::"text", 'role_created'::"text", 'role_updated'::"text", 'role_assigned'::"text", 'superadmin_bootstrap'::"text"])))
)

-- [56]
ALTER TABLE "public"."audit_log" OWNER TO "postgres"

-- [57]
COMMENT ON TABLE "public"."audit_log" IS 'Bitacora administrativa para cambios de catalogos y datos maestros.'

-- [58]
CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "name" "text" NOT NULL,
    "def_tax" numeric(5,2) DEFAULT 16.00,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_for_sale" boolean DEFAULT false,
    "is_inventoried" boolean DEFAULT true
)

-- [59]
ALTER TABLE "public"."categories" OWNER TO "postgres"

-- [60]
CREATE TABLE IF NOT EXISTS "public"."centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
)

-- [61]
ALTER TABLE "public"."centers" OWNER TO "postgres"

-- [62]
CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_id" "uuid",
    "center_id" "uuid",
    "stock_actual" numeric(12,4) DEFAULT 0.0000,
    "costo_promedio" numeric(12,2) DEFAULT 0.00,
    "precio_venta" numeric(12,2) DEFAULT 0.00,
    "stock_minimo" numeric(12,2) DEFAULT 0.00,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_no_negativo" CHECK (("stock_actual" >= (0)::numeric))
)

-- [63]
ALTER TABLE "public"."inventory" OWNER TO "postgres"

-- [64]
CREATE TABLE IF NOT EXISTS "public"."inventory_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "material_id" "uuid" NOT NULL,
    "previous_stock" numeric(12,3) NOT NULL,
    "new_stock" numeric(12,3) NOT NULL,
    "difference_qty" numeric(12,3) NOT NULL,
    "reason_code" "text" NOT NULL,
    "notes" "text",
    "authorization_code" "text",
    "performed_by" "text",
    CONSTRAINT "inventory_adjustments_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['manual_count'::"text", 'correction'::"text", 'damage'::"text", 'loss'::"text", 'opening_balance'::"text"])))
)

-- [65]
ALTER TABLE "public"."inventory_adjustments" OWNER TO "postgres"

-- [66]
COMMENT ON TABLE "public"."inventory_adjustments" IS 'Documento formal para correcciones manuales de inventario.'

-- [67]
CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "center_id" "uuid" NOT NULL,
    "material_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "quantity" numeric(12,3) NOT NULL,
    "before_stock" numeric(12,3),
    "after_stock" numeric(12,3),
    "unit_cost" numeric(12,2),
    "unit_price" numeric(12,2),
    "reference_table" "text",
    "reference_id" "uuid",
    "reference_number" "text",
    "reason_code" "text",
    "notes" "text",
    "performed_by" "text",
    CONSTRAINT "inventory_movements_direction_check" CHECK (("direction" = ANY (ARRAY['in'::"text", 'out'::"text", 'adjust'::"text"]))),
    CONSTRAINT "inventory_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['purchase'::"text", 'sale'::"text", 'manual_adjustment'::"text", 'initial_stock'::"text"]))),
    CONSTRAINT "inventory_movements_quantity_check" CHECK (("quantity" > (0)::numeric))
)

-- [68]
ALTER TABLE "public"."inventory_movements" OWNER TO "postgres"

-- [69]
COMMENT ON TABLE "public"."inventory_movements" IS 'Libro historico de movimientos de inventario para compras, ventas y ajustes.'

-- [70]
CREATE TABLE IF NOT EXISTS "public"."materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text",
    "name" "text" NOT NULL,
    "cat_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "buy_uom_id" "uuid",
    "sell_uom_id" "uuid",
    "conversion_factor" numeric(12,4) DEFAULT 1
)

-- [71]
ALTER TABLE "public"."materials" OWNER TO "postgres"

-- [72]
CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "base_currency" character varying(3) DEFAULT 'MXN'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"()
)

-- [73]
ALTER TABLE "public"."organizations" OWNER TO "postgres"

-- [74]
CREATE TABLE IF NOT EXISTS "public"."providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "rfc" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
)

-- [75]
ALTER TABLE "public"."providers" OWNER TO "postgres"

-- [76]
CREATE TABLE IF NOT EXISTS "public"."purchase_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_id" "uuid",
    "material_id" "uuid",
    "quantity" numeric(12,4) NOT NULL,
    "unit_cost" numeric(12,2) NOT NULL,
    "subtotal" numeric(12,2) GENERATED ALWAYS AS (("quantity" * "unit_cost")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"()
)

-- [77]
ALTER TABLE "public"."purchase_items" OWNER TO "postgres"

-- [78]
CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid",
    "supplier_id" "uuid",
    "total_amount" numeric(12,2) DEFAULT 0.00,
    "reference_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "provider_id" "uuid",
    "invoice_ref" "text"
)

-- [79]
ALTER TABLE "public"."purchases" OWNER TO "postgres"

-- [80]
CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid",
    "material_id" "uuid",
    "quantity" numeric(12,4) NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "subtotal" numeric(12,2) GENERATED ALWAYS AS (("quantity" * "unit_price")) STORED
)

-- [81]
ALTER TABLE "public"."sale_items" OWNER TO "postgres"

-- [82]
CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid",
    "total_amount" numeric(12,2) DEFAULT 0.00,
    "payment_method" "text" DEFAULT 'Efectivo'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "document_number" "text"
)

-- [83]
ALTER TABLE "public"."sales" OWNER TO "postgres"

-- [84]
CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "name" "text" NOT NULL,
    "contact_info" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
)

-- [85]
ALTER TABLE "public"."suppliers" OWNER TO "postgres"

-- [86]
CREATE TABLE IF NOT EXISTS "public"."table_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_id" "uuid",
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "total" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "waiter_edit_locked" boolean DEFAULT false NOT NULL
)

-- [87]
ALTER TABLE "public"."table_orders" OWNER TO "postgres"

-- [88]
COMMENT ON COLUMN "public"."table_orders"."waiter_edit_locked" IS 'Cuando es true, un mesero ya no puede disminuir cantidades ni remover productos de la mesa; solo agregar o aumentar.'

-- [89]
CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" "text" NOT NULL,
    "status" "text" DEFAULT 'libre'::"text",
    "active_order_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "current_order_id" "uuid"
)

-- [90]
ALTER TABLE "public"."tables" OWNER TO "postgres"

-- [91]
CREATE TABLE IF NOT EXISTS "public"."uoms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "abbr" character varying(10) NOT NULL,
    "is_base" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
)

-- [92]
ALTER TABLE "public"."uoms" OWNER TO "postgres"

-- [93]
ALTER TABLE ONLY "public"."app_permissions"
    ADD CONSTRAINT "app_permissions_pkey" PRIMARY KEY ("id")

-- [94]
ALTER TABLE ONLY "public"."app_permissions"
    ADD CONSTRAINT "app_permissions_screen_key_action_key_key" UNIQUE ("screen_key", "action_key")

-- [95]
ALTER TABLE ONLY "public"."app_profiles"
    ADD CONSTRAINT "app_profiles_email_key" UNIQUE ("email")

-- [96]
ALTER TABLE ONLY "public"."app_profiles"
    ADD CONSTRAINT "app_profiles_pkey" PRIMARY KEY ("id")

-- [97]
ALTER TABLE ONLY "public"."app_profiles"
    ADD CONSTRAINT "app_profiles_username_key" UNIQUE ("username")

-- [98]
ALTER TABLE ONLY "public"."app_role_permissions"
    ADD CONSTRAINT "app_role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")

-- [99]
ALTER TABLE ONLY "public"."app_roles"
    ADD CONSTRAINT "app_roles_name_key" UNIQUE ("name")

-- [100]
ALTER TABLE ONLY "public"."app_roles"
    ADD CONSTRAINT "app_roles_pkey" PRIMARY KEY ("id")

-- [101]
ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_pkey" PRIMARY KEY ("user_id", "role_id")

-- [102]
ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")

-- [103]
ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id")

-- [104]
ALTER TABLE ONLY "public"."centers"
    ADD CONSTRAINT "centers_pkey" PRIMARY KEY ("id")

-- [105]
ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")

-- [106]
ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_material_id_center_id_key" UNIQUE ("material_id", "center_id")

-- [107]
ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")

-- [108]
ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")

-- [109]
ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id")

-- [110]
ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_sku_key" UNIQUE ("sku")

-- [111]
ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")

-- [112]
ALTER TABLE ONLY "public"."providers"
    ADD CONSTRAINT "providers_pkey" PRIMARY KEY ("id")

-- [113]
ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")

-- [114]
ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")

-- [115]
ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")

-- [116]
ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id")

-- [117]
ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")

-- [118]
ALTER TABLE ONLY "public"."table_orders"
    ADD CONSTRAINT "table_orders_pkey" PRIMARY KEY ("id")

-- [119]
ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id")

-- [120]
ALTER TABLE ONLY "public"."uoms"
    ADD CONSTRAINT "uoms_pkey" PRIMARY KEY ("id")

-- [121]
CREATE INDEX "idx_app_permissions_screen_action" ON "public"."app_permissions" USING "btree" ("screen_key", "action_key")

-- [122]
CREATE INDEX "idx_app_profiles_status" ON "public"."app_profiles" USING "btree" ("status")

-- [123]
CREATE INDEX "idx_app_user_roles_role_id" ON "public"."app_user_roles" USING "btree" ("role_id")

-- [124]
CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id", "created_at" DESC)

-- [125]
CREATE INDEX "idx_audit_log_event_type" ON "public"."audit_log" USING "btree" ("event_type", "created_at" DESC)

-- [126]
CREATE INDEX "idx_inventory_adjustments_center_created_at" ON "public"."inventory_adjustments" USING "btree" ("center_id", "created_at" DESC)

-- [127]
CREATE INDEX "idx_inventory_adjustments_material_created_at" ON "public"."inventory_adjustments" USING "btree" ("material_id", "created_at" DESC)

-- [128]
CREATE INDEX "idx_inventory_movements_center_created_at" ON "public"."inventory_movements" USING "btree" ("center_id", "created_at" DESC)

-- [129]
CREATE INDEX "idx_inventory_movements_material_created_at" ON "public"."inventory_movements" USING "btree" ("material_id", "created_at" DESC)

-- [130]
CREATE INDEX "idx_inventory_movements_reference" ON "public"."inventory_movements" USING "btree" ("reference_table", "reference_id")

-- [131]
CREATE INDEX "idx_sales_document_number" ON "public"."sales" USING "btree" ("document_number")

-- [132]
CREATE OR REPLACE TRIGGER "on_material_created" AFTER INSERT ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_material"()

-- [133]
CREATE OR REPLACE TRIGGER "tr_update_inventory_on_purchase" AFTER INSERT ON "public"."purchase_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_on_purchase"()

-- [134]
CREATE OR REPLACE TRIGGER "tr_update_inventory_on_sale" AFTER INSERT ON "public"."sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_on_sale"()

-- [135]
ALTER TABLE ONLY "public"."app_profiles"
    ADD CONSTRAINT "app_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE

-- [136]
ALTER TABLE ONLY "public"."app_role_permissions"
    ADD CONSTRAINT "app_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."app_permissions"("id") ON DELETE CASCADE

-- [137]
ALTER TABLE ONLY "public"."app_role_permissions"
    ADD CONSTRAINT "app_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."app_roles"("id") ON DELETE CASCADE

-- [138]
ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."app_roles"("id") ON DELETE CASCADE

-- [139]
ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_profiles"("id") ON DELETE CASCADE

-- [140]
ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE

-- [141]
ALTER TABLE ONLY "public"."centers"
    ADD CONSTRAINT "centers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE

-- [142]
ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id")

-- [143]
ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id")

-- [144]
ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE CASCADE

-- [145]
ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE

-- [146]
ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id")

-- [147]
ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id")

-- [148]
ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_buy_uom_id_fkey" FOREIGN KEY ("buy_uom_id") REFERENCES "public"."uoms"("id")

-- [149]
ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_cat_id_fkey" FOREIGN KEY ("cat_id") REFERENCES "public"."categories"("id")

-- [150]
ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_sell_uom_id_fkey" FOREIGN KEY ("sell_uom_id") REFERENCES "public"."uoms"("id")

-- [151]
ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id")

-- [152]
ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE CASCADE

-- [153]
ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id")

-- [154]
ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id")

-- [155]
ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id")

-- [156]
ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id")

-- [157]
ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE

-- [158]
ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id")

-- [159]
ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")

-- [160]
ALTER TABLE ONLY "public"."table_orders"
    ADD CONSTRAINT "table_orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id")

-- [161]
ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_current_order_id_fkey" FOREIGN KEY ("current_order_id") REFERENCES "public"."table_orders"("id")

-- [162]
ALTER TABLE "public"."app_permissions" ENABLE ROW LEVEL SECURITY

-- [163]
ALTER TABLE "public"."app_profiles" ENABLE ROW LEVEL SECURITY

-- [164]
ALTER TABLE "public"."app_role_permissions" ENABLE ROW LEVEL SECURITY

-- [165]
ALTER TABLE "public"."app_roles" ENABLE ROW LEVEL SECURITY

-- [166]
ALTER TABLE "public"."app_user_roles" ENABLE ROW LEVEL SECURITY

-- [167]
CREATE POLICY "permissions_authenticated_select" ON "public"."app_permissions" FOR SELECT TO "authenticated" USING (true)

-- [168]
CREATE POLICY "profiles_self_or_superadmin_select" ON "public"."app_profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."current_app_is_superadmin"() OR "public"."current_app_is_manager"()))

-- [169]
CREATE POLICY "role_permissions_authenticated_select" ON "public"."app_role_permissions" FOR SELECT TO "authenticated" USING (true)

-- [170]
CREATE POLICY "roles_authenticated_select" ON "public"."app_roles" FOR SELECT TO "authenticated" USING (true)

-- [171]
CREATE POLICY "user_roles_self_or_superadmin_select" ON "public"."app_user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."current_app_is_superadmin"() OR "public"."current_app_is_manager"()))

-- [172]
ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres"

-- [173]
GRANT USAGE ON SCHEMA "public" TO "postgres"

-- [174]
GRANT USAGE ON SCHEMA "public" TO "anon"

-- [175]
GRANT USAGE ON SCHEMA "public" TO "authenticated"

-- [176]
GRANT USAGE ON SCHEMA "public" TO "service_role"

-- [177]
GRANT ALL ON FUNCTION "public"."assert_valid_username"("p_username" "text") TO "anon"

-- [178]
GRANT ALL ON FUNCTION "public"."assert_valid_username"("p_username" "text") TO "authenticated"

-- [179]
GRANT ALL ON FUNCTION "public"."assert_valid_username"("p_username" "text") TO "service_role"

-- [180]
GRANT ALL ON FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text") TO "anon"

-- [181]
GRANT ALL ON FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text") TO "authenticated"

-- [182]
GRANT ALL ON FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text") TO "service_role"

-- [183]
GRANT ALL ON FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "anon"

-- [184]
GRANT ALL ON FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "authenticated"

-- [185]
GRANT ALL ON FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "service_role"

-- [186]
GRANT ALL ON FUNCTION "public"."current_app_is_manager"() TO "anon"

-- [187]
GRANT ALL ON FUNCTION "public"."current_app_is_manager"() TO "authenticated"

-- [188]
GRANT ALL ON FUNCTION "public"."current_app_is_manager"() TO "service_role"

-- [189]
GRANT ALL ON FUNCTION "public"."current_app_is_superadmin"() TO "anon"

-- [190]
GRANT ALL ON FUNCTION "public"."current_app_is_superadmin"() TO "authenticated"

-- [191]
GRANT ALL ON FUNCTION "public"."current_app_is_superadmin"() TO "service_role"

-- [192]
GRANT ALL ON FUNCTION "public"."delete_app_user"("p_user_id" "uuid") TO "anon"

-- [193]
GRANT ALL ON FUNCTION "public"."delete_app_user"("p_user_id" "uuid") TO "authenticated"

-- [194]
GRANT ALL ON FUNCTION "public"."delete_app_user"("p_user_id" "uuid") TO "service_role"

-- [195]
GRANT ALL ON FUNCTION "public"."handle_new_material"() TO "anon"

-- [196]
GRANT ALL ON FUNCTION "public"."handle_new_material"() TO "authenticated"

-- [197]
GRANT ALL ON FUNCTION "public"."handle_new_material"() TO "service_role"

-- [198]
GRANT ALL ON FUNCTION "public"."normalize_username"("p_username" "text") TO "anon"

-- [199]
GRANT ALL ON FUNCTION "public"."normalize_username"("p_username" "text") TO "authenticated"

-- [200]
GRANT ALL ON FUNCTION "public"."normalize_username"("p_username" "text") TO "service_role"

-- [201]
GRANT ALL ON FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text", "p_status" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "anon"

-- [202]
GRANT ALL ON FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text", "p_status" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "authenticated"

-- [203]
GRANT ALL ON FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text", "p_status" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "service_role"

-- [204]
GRANT ALL ON FUNCTION "public"."update_inventory_on_purchase"() TO "anon"

-- [205]
GRANT ALL ON FUNCTION "public"."update_inventory_on_purchase"() TO "authenticated"

-- [206]
GRANT ALL ON FUNCTION "public"."update_inventory_on_purchase"() TO "service_role"

-- [207]
GRANT ALL ON FUNCTION "public"."update_inventory_on_sale"() TO "anon"

-- [208]
GRANT ALL ON FUNCTION "public"."update_inventory_on_sale"() TO "authenticated"

-- [209]
GRANT ALL ON FUNCTION "public"."update_inventory_on_sale"() TO "service_role"

-- [210]
GRANT ALL ON FUNCTION "public"."username_to_auth_email"("p_username" "text") TO "anon"

-- [211]
GRANT ALL ON FUNCTION "public"."username_to_auth_email"("p_username" "text") TO "authenticated"

-- [212]
GRANT ALL ON FUNCTION "public"."username_to_auth_email"("p_username" "text") TO "service_role"

-- [213]
GRANT ALL ON TABLE "public"."app_permissions" TO "anon"

-- [214]
GRANT ALL ON TABLE "public"."app_permissions" TO "authenticated"

-- [215]
GRANT ALL ON TABLE "public"."app_permissions" TO "service_role"

-- [216]
GRANT ALL ON TABLE "public"."app_profiles" TO "anon"

-- [217]
GRANT ALL ON TABLE "public"."app_profiles" TO "authenticated"

-- [218]
GRANT ALL ON TABLE "public"."app_profiles" TO "service_role"

-- [219]
GRANT ALL ON TABLE "public"."app_role_permissions" TO "anon"

-- [220]
GRANT ALL ON TABLE "public"."app_role_permissions" TO "authenticated"

-- [221]
GRANT ALL ON TABLE "public"."app_role_permissions" TO "service_role"

-- [222]
GRANT ALL ON TABLE "public"."app_roles" TO "anon"

-- [223]
GRANT ALL ON TABLE "public"."app_roles" TO "authenticated"

-- [224]
GRANT ALL ON TABLE "public"."app_roles" TO "service_role"

-- [225]
GRANT ALL ON TABLE "public"."app_user_roles" TO "anon"

-- [226]
GRANT ALL ON TABLE "public"."app_user_roles" TO "authenticated"

-- [227]
GRANT ALL ON TABLE "public"."app_user_roles" TO "service_role"

-- [228]
GRANT ALL ON TABLE "public"."audit_log" TO "anon"

-- [229]
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated"

-- [230]
GRANT ALL ON TABLE "public"."audit_log" TO "service_role"

-- [231]
GRANT ALL ON TABLE "public"."categories" TO "anon"

-- [232]
GRANT ALL ON TABLE "public"."categories" TO "authenticated"

-- [233]
GRANT ALL ON TABLE "public"."categories" TO "service_role"

-- [234]
GRANT ALL ON TABLE "public"."centers" TO "anon"

-- [235]
GRANT ALL ON TABLE "public"."centers" TO "authenticated"

-- [236]
GRANT ALL ON TABLE "public"."centers" TO "service_role"

-- [237]
GRANT ALL ON TABLE "public"."inventory" TO "anon"

-- [238]
GRANT ALL ON TABLE "public"."inventory" TO "authenticated"

-- [239]
GRANT ALL ON TABLE "public"."inventory" TO "service_role"

-- [240]
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "anon"

-- [241]
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "authenticated"

-- [242]
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "service_role"

-- [243]
GRANT ALL ON TABLE "public"."inventory_movements" TO "anon"

-- [244]
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated"

-- [245]
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role"

-- [246]
GRANT ALL ON TABLE "public"."materials" TO "anon"

-- [247]
GRANT ALL ON TABLE "public"."materials" TO "authenticated"

-- [248]
GRANT ALL ON TABLE "public"."materials" TO "service_role"

-- [249]
GRANT ALL ON TABLE "public"."organizations" TO "anon"

-- [250]
GRANT ALL ON TABLE "public"."organizations" TO "authenticated"

-- [251]
GRANT ALL ON TABLE "public"."organizations" TO "service_role"

-- [252]
GRANT ALL ON TABLE "public"."providers" TO "anon"

-- [253]
GRANT ALL ON TABLE "public"."providers" TO "authenticated"

-- [254]
GRANT ALL ON TABLE "public"."providers" TO "service_role"

-- [255]
GRANT ALL ON TABLE "public"."purchase_items" TO "anon"

-- [256]
GRANT ALL ON TABLE "public"."purchase_items" TO "authenticated"

-- [257]
GRANT ALL ON TABLE "public"."purchase_items" TO "service_role"

-- [258]
GRANT ALL ON TABLE "public"."purchases" TO "anon"

-- [259]
GRANT ALL ON TABLE "public"."purchases" TO "authenticated"

-- [260]
GRANT ALL ON TABLE "public"."purchases" TO "service_role"

-- [261]
GRANT ALL ON TABLE "public"."sale_items" TO "anon"

-- [262]
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated"

-- [263]
GRANT ALL ON TABLE "public"."sale_items" TO "service_role"

-- [264]
GRANT ALL ON TABLE "public"."sales" TO "anon"

-- [265]
GRANT ALL ON TABLE "public"."sales" TO "authenticated"

-- [266]
GRANT ALL ON TABLE "public"."sales" TO "service_role"

-- [267]
GRANT ALL ON TABLE "public"."suppliers" TO "anon"

-- [268]
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated"

-- [269]
GRANT ALL ON TABLE "public"."suppliers" TO "service_role"

-- [270]
GRANT ALL ON TABLE "public"."table_orders" TO "anon"

-- [271]
GRANT ALL ON TABLE "public"."table_orders" TO "authenticated"

-- [272]
GRANT ALL ON TABLE "public"."table_orders" TO "service_role"

-- [273]
GRANT ALL ON TABLE "public"."tables" TO "anon"

-- [274]
GRANT ALL ON TABLE "public"."tables" TO "authenticated"

-- [275]
GRANT ALL ON TABLE "public"."tables" TO "service_role"

-- [276]
GRANT ALL ON TABLE "public"."uoms" TO "anon"

-- [277]
GRANT ALL ON TABLE "public"."uoms" TO "authenticated"

-- [278]
GRANT ALL ON TABLE "public"."uoms" TO "service_role"

-- [279]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres"

-- [280]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon"

-- [281]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated"

-- [282]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role"

-- [283]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres"

-- [284]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon"

-- [285]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated"

-- [286]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role"

-- [287]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres"

-- [288]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon"

-- [289]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated"

-- [290]
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role"
```

---

#### Fila 2 - ``20260414060917`` | ``remote_schema`` (1 statements)

```sql
-- [0]
drop extension if exists "pg_net"
```

---

#### Fila 3 - ``20260414123500`` | ``cleanup_legacy_user_sql_functions`` (3 statements)

```sql
-- [0]
-- Cleanup legacy SQL user-management RPCs replaced by Edge Functions.
-- The app now uses supabase/functions/user-admin/index.ts for all writes.

drop function if exists public.create_app_user(text, text, text, boolean, uuid[])

-- [1]
drop function if exists public.update_app_user(uuid, text, text, text, boolean, uuid[])

-- [2]
drop function if exists public.delete_app_user(uuid)
```

---

#### Fila 4 - ``20260415093000`` | ``harden_public_access`` (103 statements)

```sql
-- [0]
-- Harden public/authenticated access without breaking the current app.
-- Strategy:
-- 1. Remove overly broad default privileges for future objects.
-- 2. Revoke direct client write access on current public tables.
-- 3. Enable RLS on operational tables that are currently missing it.
-- 4. Keep authenticated read access only where the current frontend still reads directly.
-- 5. Revoke execute on internal helper/trigger functions that clients should never call.

begin

-- [1]
-- Future objects in public should not inherit open access for anon/authenticated.
alter default privileges for role postgres in schema public revoke all on tables from anon

-- [2]
alter default privileges for role postgres in schema public revoke all on tables from authenticated

-- [3]
alter default privileges for role postgres in schema public revoke all on sequences from anon

-- [4]
alter default privileges for role postgres in schema public revoke all on sequences from authenticated

-- [5]
alter default privileges for role postgres in schema public revoke all on functions from anon

-- [6]
alter default privileges for role postgres in schema public revoke all on functions from authenticated

-- [7]
-- Remove broad access from current tables, then re-grant the minimum needed reads.
revoke all on table public.app_permissions from anon, authenticated

-- [8]
revoke all on table public.app_profiles from anon, authenticated

-- [9]
revoke all on table public.app_role_permissions from anon, authenticated

-- [10]
revoke all on table public.app_roles from anon, authenticated

-- [11]
revoke all on table public.app_user_roles from anon, authenticated

-- [12]
revoke all on table public.audit_log from anon, authenticated

-- [13]
revoke all on table public.categories from anon, authenticated

-- [14]
revoke all on table public.centers from anon, authenticated

-- [15]
revoke all on table public.inventory from anon, authenticated

-- [16]
revoke all on table public.inventory_adjustments from anon, authenticated

-- [17]
revoke all on table public.inventory_movements from anon, authenticated

-- [18]
revoke all on table public.materials from anon, authenticated

-- [19]
revoke all on table public.organizations from anon, authenticated

-- [20]
revoke all on table public.providers from anon, authenticated

-- [21]
revoke all on table public.purchase_items from anon, authenticated

-- [22]
revoke all on table public.purchases from anon, authenticated

-- [23]
revoke all on table public.sale_items from anon, authenticated

-- [24]
revoke all on table public.sales from anon, authenticated

-- [25]
revoke all on table public.suppliers from anon, authenticated

-- [26]
revoke all on table public.table_orders from anon, authenticated

-- [27]
revoke all on table public.tables from anon, authenticated

-- [28]
revoke all on table public.uoms from anon, authenticated

-- [29]
grant select on table public.app_permissions to authenticated

-- [30]
grant select on table public.app_profiles to authenticated

-- [31]
grant select on table public.app_role_permissions to authenticated

-- [32]
grant select on table public.app_roles to authenticated

-- [33]
grant select on table public.app_user_roles to authenticated

-- [34]
grant select on table public.categories to authenticated

-- [35]
grant select on table public.centers to authenticated

-- [36]
grant select on table public.inventory to authenticated

-- [37]
grant select on table public.inventory_movements to authenticated

-- [38]
grant select on table public.materials to authenticated

-- [39]
grant select on table public.providers to authenticated

-- [40]
grant select on table public.purchase_items to authenticated

-- [41]
grant select on table public.purchases to authenticated

-- [42]
grant select on table public.sale_items to authenticated

-- [43]
grant select on table public.sales to authenticated

-- [44]
grant select on table public.table_orders to authenticated

-- [45]
grant select on table public.tables to authenticated

-- [46]
grant select on table public.uoms to authenticated

-- [47]
-- No direct client writes should remain on public sequences either.
revoke all on all sequences in schema public from anon, authenticated

-- [48]
-- Functions that are only internal or sensitive should not be executable by anon/authenticated.
revoke all on function public.assert_valid_username(text) from anon, authenticated

-- [49]
revoke all on function public.bootstrap_superadmin(uuid, text, text) from anon, authenticated

-- [50]
revoke all on function public.handle_new_material() from anon, authenticated

-- [51]
revoke all on function public.normalize_username(text) from anon, authenticated

-- [52]
revoke all on function public.update_inventory_on_purchase() from anon, authenticated

-- [53]
revoke all on function public.update_inventory_on_sale() from anon, authenticated

-- [54]
revoke all on function public.username_to_auth_email(text) from anon, authenticated

-- [55]
-- Policy helpers remain available to authenticated because existing RLS policies depend on them.
revoke all on function public.current_app_is_manager() from anon

-- [56]
revoke all on function public.current_app_is_superadmin() from anon

-- [57]
grant execute on function public.current_app_is_manager() to authenticated

-- [58]
grant execute on function public.current_app_is_superadmin() to authenticated

-- [59]
-- Turn on RLS for the operational tables that were previously exposed by grants alone.
alter table public.audit_log enable row level security

-- [60]
alter table public.categories enable row level security

-- [61]
alter table public.centers enable row level security

-- [62]
alter table public.inventory enable row level security

-- [63]
alter table public.inventory_adjustments enable row level security

-- [64]
alter table public.inventory_movements enable row level security

-- [65]
alter table public.materials enable row level security

-- [66]
alter table public.organizations enable row level security

-- [67]
alter table public.providers enable row level security

-- [68]
alter table public.purchase_items enable row level security

-- [69]
alter table public.purchases enable row level security

-- [70]
alter table public.sale_items enable row level security

-- [71]
alter table public.sales enable row level security

-- [72]
alter table public.suppliers enable row level security

-- [73]
alter table public.table_orders enable row level security

-- [74]
alter table public.tables enable row level security

-- [75]
alter table public.uoms enable row level security

-- [76]
-- Preserve current app behavior: authenticated users can still read the tables the frontend uses directly.
drop policy if exists categories_authenticated_select on public.categories

-- [77]
create policy categories_authenticated_select
on public.categories
for select
to authenticated
using (true)

-- [78]
drop policy if exists centers_authenticated_select on public.centers

-- [79]
create policy centers_authenticated_select
on public.centers
for select
to authenticated
using (true)

-- [80]
drop policy if exists inventory_authenticated_select on public.inventory

-- [81]
create policy inventory_authenticated_select
on public.inventory
for select
to authenticated
using (true)

-- [82]
drop policy if exists inventory_movements_authenticated_select on public.inventory_movements

-- [83]
create policy inventory_movements_authenticated_select
on public.inventory_movements
for select
to authenticated
using (true)

-- [84]
drop policy if exists materials_authenticated_select on public.materials

-- [85]
create policy materials_authenticated_select
on public.materials
for select
to authenticated
using (true)

-- [86]
drop policy if exists providers_authenticated_select on public.providers

-- [87]
create policy providers_authenticated_select
on public.providers
for select
to authenticated
using (true)

-- [88]
drop policy if exists purchase_items_authenticated_select on public.purchase_items

-- [89]
create policy purchase_items_authenticated_select
on public.purchase_items
for select
to authenticated
using (true)

-- [90]
drop policy if exists purchases_authenticated_select on public.purchases

-- [91]
create policy purchases_authenticated_select
on public.purchases
for select
to authenticated
using (true)

-- [92]
drop policy if exists sale_items_authenticated_select on public.sale_items

-- [93]
create policy sale_items_authenticated_select
on public.sale_items
for select
to authenticated
using (true)

-- [94]
drop policy if exists sales_authenticated_select on public.sales

-- [95]
create policy sales_authenticated_select
on public.sales
for select
to authenticated
using (true)

-- [96]
drop policy if exists table_orders_authenticated_select on public.table_orders

-- [97]
create policy table_orders_authenticated_select
on public.table_orders
for select
to authenticated
using (true)

-- [98]
drop policy if exists tables_authenticated_select on public.tables

-- [99]
create policy tables_authenticated_select
on public.tables
for select
to authenticated
using (true)

-- [100]
drop policy if exists uoms_authenticated_select on public.uoms

-- [101]
create policy uoms_authenticated_select
on public.uoms
for select
to authenticated
using (true)

-- [102]
commit
```

---

#### Fila 5 - ``20260415100500`` | ``fix_function_search_paths`` (8 statements)

```sql
-- [0]
-- Fix Supabase linter warnings for mutable function search_path.
-- This migration does not change function logic; it only pins the schema resolution.

begin

-- [1]
alter function public.handle_new_material()
  set search_path = public

-- [2]
alter function public.update_inventory_on_purchase()
  set search_path = public

-- [3]
alter function public.update_inventory_on_sale()
  set search_path = public

-- [4]
alter function public.assert_valid_username(text)
  set search_path = public

-- [5]
alter function public.normalize_username(text)
  set search_path = public

-- [6]
alter function public.username_to_auth_email(text)
  set search_path = public

-- [7]
commit
```

---

#### Fila 6 - ``20260416093000`` | ``link_materials_to_providers`` (5 statements)

```sql
-- [0]
begin

-- [1]
alter table public.materials
  add column if not exists provider_id uuid

-- [2]
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_provider_id_fkey'
  ) then
    alter table public.materials
      add constraint materials_provider_id_fkey
      foreign key (provider_id) references public.providers(id);
  end if;
end $$

-- [3]
create index if not exists materials_provider_id_idx
  on public.materials(provider_id)

-- [4]
commit
```

---

#### Fila 7 - ``20260417113000`` | ``seed_material_movements_permissions`` (4 statements)

```sql
-- [0]
begin

-- [1]
insert into public.app_permissions (screen_key, action_key, description)
values
  ('movements', 'view', 'Ver modulo de movimiento de materiales.'),
  ('movements', 'create', 'Registrar movimientos de entrada y salida de materiales.')
on conflict (screen_key, action_key) do update
set description = excluded.description

-- [2]
insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'movements'
 and permissions.action_key in ('view', 'create')
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing

-- [3]
commit
```

---

#### Fila 8 - ``20260417114000`` | ``create_inventory_movement_documents`` (7 statements)

```sql
-- [0]
begin

-- [1]
create sequence if not exists public.inventory_movement_document_seq
  as bigint
  minvalue 1
  maxvalue 999999999
  start with 1
  increment by 1
  no cycle

-- [2]
create or replace function public.next_inventory_movement_document_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  next_value := nextval('public.inventory_movement_document_seq');

  if next_value > 999999999 then
    raise exception 'Se alcanzo el maximo consecutivo para movimientos de materiales.';
  end if;

  return lpad(next_value::text, 9, '0');
end;
$$

-- [3]
revoke all on function public.next_inventory_movement_document_number() from anon, authenticated

-- [4]
grant execute on function public.next_inventory_movement_document_number() to service_role

-- [5]
revoke all on sequence public.inventory_movement_document_seq from anon, authenticated

-- [6]
commit
```

---

#### Fila 9 - ``20260417122000`` | ``seed_material_movements_report_permissions`` (4 statements)

```sql
-- [0]
begin

-- [1]
insert into public.app_permissions (screen_key, action_key, description)
values
  ('report_material_movements', 'view', 'Ver reporte de movimiento de materiales.')
on conflict (screen_key, action_key) do update
set description = excluded.description

-- [2]
insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'report_material_movements'
 and permissions.action_key = 'view'
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing

-- [3]
commit
```

---

#### Fila 10 - ``20260418103000`` | ``add_table_order_reservation_flag`` (2 statements)

```sql
-- [0]
alter table public.table_orders
add column if not exists reservation_applied boolean not null default false

-- [1]
comment on column public.table_orders.reservation_applied is
'Indica si los productos de la mesa ya descontaron temporalmente inventario como reserva operativa.'
```

---

#### Fila 11 - ``20260419170000`` | ``support_general_provider_purchases`` (2 statements)

```sql
-- [0]
alter table public.purchase_items
  add column if not exists item_description text not null default ''

-- [1]
insert into public.providers (name, rfc, phone, email, address)
select 'Proveedor General', 'XAXX010101000', null, null, null
where not exists (
  select 1
  from public.providers
  where lower(name) = lower('Proveedor General')
)
```

---

#### Fila 12 - ``20260420143000`` | ``add_cash_control_schema`` (14 statements)

```sql
-- [0]
begin

-- [1]
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'closed')),
  opening_amount numeric(12,2) not null check (opening_amount > 0),
  sales_cash_total numeric(12,2) not null default 0.00,
  expected_cash_total numeric(12,2) not null default 0.00,
  closing_amount numeric(12,2) not null default 0.00,
  profit_total numeric(12,2) not null default 0.00,
  opened_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone,
  opened_by uuid not null,
  closed_by uuid,
  report_pdf_metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
)

-- [2]
comment on table public.cash_sessions is
  'Sesion global de caja para apertura, seguimiento de ventas en efectivo y corte.'

-- [3]
create unique index if not exists cash_sessions_single_open_idx
  on public.cash_sessions (status)
  where status = 'open'

-- [4]
create index if not exists cash_sessions_opened_at_idx
  on public.cash_sessions (opened_at desc)

-- [5]
create table if not exists public.cash_session_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('opening', 'closing')),
  material_id uuid not null references public.materials(id),
  material_name text not null,
  quantity numeric(12,4) not null default 0.0000,
  average_cost numeric(12,2) not null default 0.00,
  created_at timestamp with time zone not null default now()
)

-- [6]
comment on table public.cash_session_inventory_snapshots is
  'Snapshot del inventario al abrir y cerrar una sesion de caja.'

-- [7]
create index if not exists cash_session_inventory_snapshots_session_idx
  on public.cash_session_inventory_snapshots (cash_session_id, snapshot_type, material_name)

-- [8]
alter table public.sales
  add column if not exists cash_session_id uuid

-- [9]
do $$
begin
  alter table public.sales
    add constraint sales_cash_session_id_fkey
    foreign key (cash_session_id) references public.cash_sessions(id) on delete set null;
exception
  when duplicate_object then null;
end $$

-- [10]
create index if not exists sales_cash_session_id_idx
  on public.sales (cash_session_id)

-- [11]
grant all on table public.cash_sessions to service_role

-- [12]
grant all on table public.cash_session_inventory_snapshots to service_role

-- [13]
commit
```

---

#### Fila 13 - ``20260420144000`` | ``seed_cash_control_permissions`` (4 statements)

```sql
-- [0]
begin

-- [1]
insert into public.app_permissions (screen_key, action_key, description)
values
  ('cash_control', 'view', 'Ver el modulo de control y corte de caja.'),
  ('cash_control', 'manage', 'Abrir y cerrar sesiones de caja.')
on conflict (screen_key, action_key) do update
set description = excluded.description

-- [2]
insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'cash_control'
 and permissions.action_key in ('view', 'manage')
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing

-- [3]
commit
```

---

#### Fila 14 - ``20260714132000`` | ``catalogo_cocteleria_extras_botella`` (6 statements)

```sql
-- [0]
alter table public.categories
  add column if not exists is_internal_production boolean not null default false

-- [1]
do $$
declare
  v_cocteleria_id uuid;
  v_extras_id uuid;
  v_botella_id uuid;
  v_botellas_otros_id uuid;
  v_botanas_category_id uuid;
  v_piece_uom_id uuid;
  v_general_provider_id uuid;
  v_org_id uuid;
  v_bar_center_id uuid;
  v_match_count integer;
  v_sku text;
begin
  select count(*)
    into v_match_count
  from public.organizations;

  if v_match_count = 0 then
    raise exception 'No se encontro una organizacion configurada.';
  end if;

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una organizacion configurada.';
  end if;

  select id
    into v_org_id
  from public.organizations;

  select count(*)
    into v_match_count
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  if v_match_count = 0 then
    raise exception 'No se encontro el centro Bar Principal.';
  end if;

  if v_match_count > 1 then
    raise exception 'Se encontro mas de un centro Bar Principal.';
  end if;

  select id
    into v_bar_center_id
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  select count(*)
    into v_match_count
  from public.uoms
  where lower(trim(abbr)) in ('pz', 'pza')
     or lower(trim(name)) in ('pieza', 'piezas');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una unidad equivalente a pieza.';
  end if;

  select id
    into v_piece_uom_id
  from public.uoms
  where lower(trim(abbr)) in ('pz', 'pza')
     or lower(trim(name)) in ('pieza', 'piezas');

  if v_piece_uom_id is null then
    raise exception 'No se encontro una unidad equivalente a pieza.';
  end if;

  select count(*)
    into v_match_count
  from public.providers
  where lower(trim(name)) = lower('Proveedor General');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de un proveedor Proveedor General.';
  end if;

  select id
    into v_general_provider_id
  from public.providers
  where lower(trim(name)) = lower('Proveedor General');

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) = lower('Extras');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Extras.';
  end if;

  select id
    into v_extras_id
  from public.categories
  where lower(trim(name)) = lower('Extras');

  if v_extras_id is null then
    insert into public.categories (org_id, name, def_tax, is_for_sale, is_inventoried, is_internal_production)
    values (v_org_id, 'Extras', 16.00, true, true, false)
    returning id into v_extras_id;
  else
    update public.categories
       set name = 'Extras',
           is_for_sale = true,
           is_inventoried = true,
           is_internal_production = false
     where id = v_extras_id;
  end if;

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) in (lower('Cocteleria'), lower('Coctelería'));

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Cocteleria.';
  end if;

  select id
    into v_cocteleria_id
  from public.categories
  where lower(trim(name)) in (lower('Cocteleria'), lower('Coctelería'));

  if v_cocteleria_id is null then
    insert into public.categories (org_id, name, def_tax, is_for_sale, is_inventoried, is_internal_production)
    values (v_org_id, 'Coctelería', 16.00, true, false, true)
    returning id into v_cocteleria_id;
  else
    update public.categories
       set name = 'Coctelería',
           is_for_sale = true,
           is_inventoried = false,
           is_internal_production = true
     where id = v_cocteleria_id;
  end if;

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) = lower('Botella');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Botella.';
  end if;

  select id
    into v_botella_id
  from public.categories
  where lower(trim(name)) = lower('Botella');

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) = lower('Botellas/Otros');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Botellas/Otros.';
  end if;

  select id
    into v_botellas_otros_id
  from public.categories
  where lower(trim(name)) = lower('Botellas/Otros');

  if v_botella_id is null and v_botellas_otros_id is not null then
    update public.categories
       set name = 'Botella',
           is_inventoried = true,
           is_internal_production = false
     where id = v_botellas_otros_id
     returning id into v_botella_id;
  elsif v_botella_id is not null then
    update public.categories
       set is_inventoried = true,
           is_internal_production = false
     where id = v_botella_id;

    if v_botellas_otros_id is not null and v_botellas_otros_id <> v_botella_id then
      update public.materials
         set cat_id = v_botella_id
       where cat_id = v_botellas_otros_id;

      delete from public.categories
       where id = v_botellas_otros_id
         and not exists (
           select 1
           from public.materials
           where cat_id = v_botellas_otros_id
         );
    end if;
  end if;

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) = lower('Botanas');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Botanas.';
  end if;

  select id
    into v_botanas_category_id
  from public.categories
  where lower(trim(name)) = lower('Botanas');

  foreach v_sku in array array['1480051534', '10001', '10002', '2222', '75035259', '75021597', '7501035010559', '7501035010560', '10009']
  loop
    select count(*)
      into v_match_count
    from public.materials
    where sku = v_sku;

    if v_match_count > 1 then
      raise exception 'Se encontro mas de un material con SKU %.', v_sku;
    end if;
  end loop;

  update public.materials
     set cat_id = v_extras_id
   where cat_id = v_botanas_category_id
     and v_botanas_category_id is not null;

  update public.materials
     set cat_id = v_cocteleria_id,
         provider_id = null
   where sku in ('1480051534', '10001', '10002', '2222');

  update public.materials
     set name = 'Tequila Cuervo Especial Shot',
         cat_id = v_cocteleria_id,
         provider_id = null,
         buy_uom_id = v_piece_uom_id,
         sell_uom_id = v_piece_uom_id,
         conversion_factor = 1
   where sku = '2222';

  update public.materials
     set cat_id = v_extras_id,
         buy_uom_id = v_piece_uom_id,
         sell_uom_id = v_piece_uom_id,
         conversion_factor = 1
   where sku in ('75035259', '75021597');

  if exists (select 1 from public.materials where sku = '7501035010559') then
    update public.materials
       set name = 'MEZCALITA LA CARRETA (JAMAICA)',
           cat_id = v_cocteleria_id,
           provider_id = null,
           buy_uom_id = v_piece_uom_id,
           sell_uom_id = v_piece_uom_id,
           conversion_factor = 1
     where sku = '7501035010559';
  else
    insert into public.materials (sku, name, cat_id, provider_id, buy_uom_id, sell_uom_id, conversion_factor)
    values ('7501035010559', 'MEZCALITA LA CARRETA (JAMAICA)', v_cocteleria_id, null, v_piece_uom_id, v_piece_uom_id, 1);
  end if;

  if exists (select 1 from public.materials where sku = '7501035010560') then
    update public.materials
       set name = 'MEZCALITA DE LA DONA (GUAYABA)',
           cat_id = v_cocteleria_id,
           provider_id = null,
           buy_uom_id = v_piece_uom_id,
           sell_uom_id = v_piece_uom_id,
           conversion_factor = 1
     where sku = '7501035010560';
  else
    insert into public.materials (sku, name, cat_id, provider_id, buy_uom_id, sell_uom_id, conversion_factor)
    values ('7501035010560', 'MEZCALITA DE LA DONA (GUAYABA)', v_cocteleria_id, null, v_piece_uom_id, v_piece_uom_id, 1);
  end if;

  if exists (select 1 from public.materials where sku = '10009') then
    update public.materials
       set name = 'BOTANAS',
           cat_id = v_extras_id,
           provider_id = coalesce(provider_id, v_general_provider_id),
           buy_uom_id = v_piece_uom_id,
           sell_uom_id = v_piece_uom_id,
           conversion_factor = 1
     where sku = '10009';
  else
    if v_general_provider_id is null then
      raise exception 'No se encontro Proveedor General para crear BOTANAS.';
    end if;

    insert into public.materials (sku, name, cat_id, provider_id, buy_uom_id, sell_uom_id, conversion_factor)
    values ('10009', 'BOTANAS', v_extras_id, v_general_provider_id, v_piece_uom_id, v_piece_uom_id, 1);
  end if;

  insert into public.inventory (material_id, center_id, stock_actual, costo_promedio, precio_venta, stock_minimo)
  select m.id,
         c.id,
         0,
         0,
         case m.sku
           when '7501035010559' then 110
           when '7501035010560' then 110
           when '10009' then 20
           when '2222' then 45
           else 0
         end,
         0
  from public.materials m
  join public.centers c on c.id = v_bar_center_id
  where m.sku in ('7501035010559', '7501035010560', '10009', '2222')
  on conflict (material_id, center_id) do update
    set precio_venta = case excluded.precio_venta
                         when 0 then public.inventory.precio_venta
                         else excluded.precio_venta
                       end,
        updated_at = now();

  delete from public.categories
   where id = v_botanas_category_id
     and v_botanas_category_id is not null
     and not exists (
       select 1
       from public.materials
       where cat_id = v_botanas_category_id
     );
end $$

-- [2]
create or replace function public.update_inventory_on_sale()
returns trigger
language plpgsql
set search_path to public
as $$
declare
  v_center_id uuid;
  v_is_inventoried boolean;
  v_material_exists boolean;
  v_category_id uuid;
  v_category_exists boolean;
begin
  select center_id
    into v_center_id
  from public.sales
  where id = new.sale_id;

  if v_center_id is null then
    raise exception 'No se encontro centro para la venta %.', new.sale_id;
  end if;

  select exists (
           select 1
           from public.materials
           where id = new.material_id
         )
    into v_material_exists;

  if v_material_exists is false then
    raise exception 'No se encontro material % para actualizar inventario.', new.material_id;
  end if;

  select cat_id
    into v_category_id
  from public.materials
  where id = new.material_id;

  if v_category_id is null then
    raise exception 'No se encontro categoria para el material %.', new.material_id;
  end if;

  select exists (
           select 1
           from public.categories
           where id = v_category_id
         )
    into v_category_exists;

  if v_category_exists is false then
    raise exception 'No existe la categoria % para el material %.', v_category_id, new.material_id;
  end if;

  select is_inventoried
    into v_is_inventoried
  from public.categories
  where id = v_category_id;

  if v_is_inventoried is false then
    return new;
  end if;

  perform 1
  from public.inventory
  where material_id = new.material_id
    and center_id = v_center_id
  for update;

  if not found then
    raise exception 'No existe inventario para material % en centro %.', new.material_id, v_center_id;
  end if;

  update public.inventory
     set stock_actual = stock_actual - new.quantity,
         updated_at = now()
   where material_id = new.material_id
     and center_id = v_center_id
     and stock_actual >= new.quantity;

  if not found then
    raise exception 'Stock insuficiente para material % en centro %.', new.material_id, v_center_id;
  end if;

  return new;
end;
$$

-- [3]
create or replace function public.finalize_pos_sale(
  p_table_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_performed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_table public.tables%rowtype;
  v_order public.table_orders%rowtype;
  v_center_id uuid;
  v_cash_session_id uuid;
  v_sale_id uuid;
  v_sale_created_at timestamptz;
  v_document_number text;
  v_sequence integer;
  v_total_amount numeric(12,2);
  v_invalid_count integer;
  v_missing_count integer;
  v_ambiguous_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_sale jsonb;
  v_cash_session_count integer;
begin
  if p_table_id is null then
    raise exception 'Falta table_id.';
  end if;

  if p_performed_by is null then
    raise exception 'Falta performed_by.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La mesa no tiene productos para cobrar.';
  end if;

  select *
    into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Mesa no encontrada.';
  end if;

  if v_table.current_order_id is not null then
    select *
      into v_order
    from public.table_orders
    where id = v_table.current_order_id
      and table_id = v_table.id
    for update;

    if not found then
      raise exception 'Pedido abierto no encontrado para la mesa %.', v_table.id;
    end if;
  end if;

  select count(*)
    into v_ambiguous_count
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  if v_ambiguous_count = 0 then
    raise exception 'No se encontro el centro Bar Principal.';
  end if;

  if v_ambiguous_count > 1 then
    raise exception 'Se encontro mas de un centro Bar Principal.';
  end if;

  select id
    into v_center_id
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  create temporary table if not exists pg_temp.finalize_pos_sale_raw_items (
    material_id_text text,
    quantity_text text,
    unit_price_text text
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_raw_items;

  insert into pg_temp.finalize_pos_sale_raw_items (material_id_text, quantity_text, unit_price_text)
  select trim(material_id),
         trim(quantity),
         trim(unit_price)
  from jsonb_to_recordset(p_items) as item(material_id text, quantity text, unit_price text);

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items
  where coalesce(material_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(quantity_text, '') !~ '^[0-9]+(\.[0-9]+)?$'
     or coalesce(unit_price_text, '') !~ '^[0-9]+(\.[0-9]+)?$'
     or case when coalesce(quantity_text, '') ~ '^[0-9]+(\.[0-9]+)?$' then quantity_text::numeric <= 0 else true end
     or case when coalesce(unit_price_text, '') ~ '^[0-9]+(\.[0-9]+)?$' then unit_price_text::numeric < 0 else true end;

  if v_invalid_count > 0 then
    raise exception 'La lista de articulos contiene valores invalidos.';
  end if;

  create temporary table if not exists pg_temp.finalize_pos_sale_items (
    material_id uuid,
    quantity numeric(12,4),
    unit_price numeric(12,2)
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_items;

  select count(*)
    into v_ambiguous_count
  from (
    select material_id_text
    from pg_temp.finalize_pos_sale_raw_items
    group by material_id_text
    having count(distinct unit_price_text::numeric) > 1
  ) duplicated_prices;

  if v_ambiguous_count > 0 then
    raise exception 'Un material no puede finalizarse con precios distintos en la misma venta.';
  end if;

  insert into pg_temp.finalize_pos_sale_items (material_id, quantity, unit_price)
  select material_id_text::uuid,
         sum(quantity_text::numeric)::numeric(12,4),
         min(unit_price_text::numeric)::numeric(12,2)
  from pg_temp.finalize_pos_sale_raw_items
  group by material_id_text;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_items item
  left join public.materials material on material.id = item.material_id
  where material.id is null;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales inexistentes.';
  end if;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_items item
  join public.materials material on material.id = item.material_id
  left join public.categories category on category.id = material.cat_id
  where material.cat_id is null
     or category.id is null;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales sin categoria valida.';
  end if;

  select coalesce(sum(quantity * unit_price), 0)::numeric(12,2)
    into v_total_amount
  from pg_temp.finalize_pos_sale_items;

  if lower(trim(coalesce(p_payment_method, 'Efectivo'))) = lower('Efectivo') then
    select count(*)
      into v_cash_session_count
    from public.cash_sessions
    where status = 'open';

    if v_cash_session_count > 1 then
      raise exception 'Se encontro mas de una caja abierta.';
    end if;

    select id
      into v_cash_session_id
    from public.cash_sessions
    where status = 'open';

    if v_cash_session_id is null then
      raise exception 'No hay una caja abierta. Debes abrir caja antes de finalizar ventas en efectivo.';
    end if;
  end if;

  v_sale_created_at := now();
  v_day_start := date_trunc('day', v_sale_created_at at time zone 'UTC') at time zone 'UTC';
  v_day_end := v_day_start + interval '1 day';

  perform pg_advisory_xact_lock(hashtext('finalize_pos_sale_document:' || to_char(v_day_start at time zone 'UTC', 'YYYYMMDD')));

  select count(*) + 1
    into v_sequence
  from public.sales
  where created_at >= v_day_start
    and created_at < v_day_end;

  v_document_number :=
    to_char(v_sale_created_at at time zone 'UTC', 'DDMMYYYYHH24MI') ||
    lpad(v_sequence::text, 2, '0');

  insert into public.sales (center_id, total_amount, payment_method, cash_session_id, created_at, document_number)
  values (v_center_id, v_total_amount, coalesce(nullif(trim(p_payment_method), ''), 'Efectivo'), v_cash_session_id, v_sale_created_at, v_document_number)
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, material_id, quantity, unit_price)
  select v_sale_id,
         material_id,
         quantity,
         unit_price
  from pg_temp.finalize_pos_sale_items;

  insert into public.inventory_movements (
    center_id,
    material_id,
    movement_type,
    direction,
    quantity,
    before_stock,
    after_stock,
    unit_cost,
    unit_price,
    reference_table,
    reference_id,
    reference_number,
    reason_code,
    notes,
    performed_by
  )
  select v_center_id,
         item.material_id,
         'sale',
         'out',
         item.quantity,
         inventory.stock_actual + item.quantity,
         inventory.stock_actual,
         null,
         item.unit_price,
         'sales',
         v_sale_id,
         v_document_number,
         'sale_ticket',
         'Salida de inventario por venta',
         p_performed_by::text
  from pg_temp.finalize_pos_sale_items item
  join public.materials material on material.id = item.material_id
  join public.categories category on category.id = material.cat_id
  join public.inventory inventory on inventory.material_id = item.material_id
                             and inventory.center_id = v_center_id
  where category.is_inventoried is true;

  update public.tables
     set status = 'libre',
         current_order_id = null
   where id = v_table.id;

  if v_table.current_order_id is not null then
    delete from public.table_orders
     where id = v_table.current_order_id;
  end if;

  select to_jsonb(sale_row)
    into v_sale
  from public.sales sale_row
  where sale_row.id = v_sale_id;

  return v_sale;
end;
$$

-- [4]
revoke all on function public.finalize_pos_sale(uuid, jsonb, text, uuid) from public, anon, authenticated

-- [5]
grant execute on function public.finalize_pos_sale(uuid, jsonb, text, uuid) to service_role
```

---

#### Fila 15 - ``20260715221000`` | ``harden_finalize_pos_sale`` (3 statements)

```sql
-- [0]
-- Fase 2.3: endurece el cierre atomico de ventas.
-- La funcion conserva su firma publica, pero deja de confiar en precios y
-- metodos de pago proporcionados por el cliente.

create or replace function public.finalize_pos_sale(
  p_table_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_performed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_table public.tables%rowtype;
  v_order public.table_orders%rowtype;
  v_expected_order_id uuid;
  v_center_id uuid;
  v_cash_session_id uuid;
  v_sale_id uuid;
  v_sale_created_at timestamptz;
  v_document_number text;
  v_payment_method text;
  v_sequence integer;
  v_total_amount numeric(12,2);
  v_invalid_count integer;
  v_missing_count integer;
  v_ambiguous_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_sale jsonb;
  v_cash_session_count integer;
begin
  if p_table_id is null then
    raise exception 'Falta table_id.';
  end if;

  if p_performed_by is null then
    raise exception 'Falta performed_by.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La mesa no tiene productos para cobrar.';
  end if;

  if lower(trim(coalesce(p_payment_method, ''))) <> lower('Efectivo') then
    raise exception 'Metodo de pago no soportado.';
  end if;

  v_payment_method := 'Efectivo';

  select *
    into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Mesa no encontrada.';
  end if;

  if lower(trim(coalesce(v_table.status, ''))) <> lower('ocupada')
     or v_table.current_order_id is null then
    raise exception 'La mesa no tiene un pedido activo o la venta ya fue finalizada.';
  end if;

  select *
    into v_order
  from public.table_orders
  where id = v_table.current_order_id
    and table_id = v_table.id
  for update;

  if not found then
    raise exception 'Pedido abierto no encontrado para la mesa %.', v_table.id;
  end if;

  select count(*)
    into v_ambiguous_count
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  if v_ambiguous_count = 0 then
    raise exception 'No se encontro el centro Bar Principal.';
  end if;

  if v_ambiguous_count > 1 then
    raise exception 'Se encontro mas de un centro Bar Principal.';
  end if;

  select id
    into v_center_id
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  create temporary table if not exists pg_temp.finalize_pos_sale_raw_items_v2 (
    order_id_text text,
    material_id_text text,
    quantity_text text,
    bundle_id_text text,
    bundle_type_text text
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_raw_items_v2;

  insert into pg_temp.finalize_pos_sale_raw_items_v2 (
    order_id_text,
    material_id_text,
    quantity_text,
    bundle_id_text,
    bundle_type_text
  )
  select trim(order_id),
         trim(material_id),
         trim(quantity),
         nullif(trim(bundle_id), ''),
         nullif(lower(trim(bundle_type)), '')
  from jsonb_to_recordset(p_items) as item(
    order_id text,
    material_id text,
    quantity text,
    bundle_id text,
    bundle_type text
  );

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2
  where coalesce(order_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(material_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(quantity_text, '') !~ '^[0-9]+(\.[0-9]+)?$'
     or case
          when coalesce(quantity_text, '') ~ '^[0-9]+(\.[0-9]+)?$'
            then quantity_text::numeric <= 0
          else true
        end
     or (bundle_id_text is null) <> (bundle_type_text is null)
     or coalesce(bundle_type_text, '') not in ('', 'cubeta', 'cubeta_caguamita');

  if v_invalid_count > 0 then
    raise exception 'La lista de articulos contiene valores invalidos.';
  end if;

  select count(distinct order_id_text)
    into v_ambiguous_count
  from pg_temp.finalize_pos_sale_raw_items_v2;

  if v_ambiguous_count <> 1 then
    raise exception 'La lista de articulos no identifica un unico pedido.';
  end if;

  select min(order_id_text)::uuid
    into v_expected_order_id
  from pg_temp.finalize_pos_sale_raw_items_v2;

  if v_expected_order_id is distinct from v_order.id then
    raise exception 'El pedido activo de la mesa cambio antes de la finalizacion.';
  end if;

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2
  where bundle_type_text is not null
    and quantity_text::numeric <> trunc(quantity_text::numeric);

  if v_invalid_count > 0 then
    raise exception 'Los bundles solo admiten cantidades enteras.';
  end if;

  select count(*)
    into v_ambiguous_count
  from (
    select bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2
    where bundle_id_text is not null
    group by bundle_id_text
    having count(distinct bundle_type_text) > 1
  ) mixed_bundle_types;

  if v_ambiguous_count > 0 then
    raise exception 'Un bundle no puede mezclar tipos distintos.';
  end if;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  left join public.materials material
    on material.id = item.material_id_text::uuid
  where material.id is null;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales inexistentes.';
  end if;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material
    on material.id = item.material_id_text::uuid
  left join public.categories category
    on category.id = material.cat_id
  where category.id is null
     or category.is_for_sale is not true;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales sin categoria vendible.';
  end if;

  perform inventory.id
  from public.inventory inventory
  join (
    select distinct material_id_text::uuid as material_id
    from pg_temp.finalize_pos_sale_raw_items_v2
  ) item
    on item.material_id = inventory.material_id
  where inventory.center_id = v_center_id
  order by inventory.material_id
  for update of inventory;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  left join public.inventory inventory
    on inventory.material_id = item.material_id_text::uuid
   and inventory.center_id = v_center_id
  where inventory.id is null
     or inventory.precio_venta is null
     or inventory.precio_venta <= 0;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales sin precio de venta valido.';
  end if;

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material
    on material.id = item.material_id_text::uuid
  join public.categories category
    on category.id = material.cat_id
  where item.bundle_type_text = 'cubeta'
    and (
      coalesce(material.sku, '') not in (
        '75004132',
        '7501064115400',
        '7501064101410',
        '750106696971',
        '7501064101465'
      )
      or lower(trim(category.name)) <> lower('Cerveza')
    );

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Mixta contiene un producto no permitido.';
  end if;

  select count(*)
    into v_invalid_count
  from (
    select bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2
    where bundle_type_text = 'cubeta'
    group by bundle_id_text
    having sum(quantity_text::numeric) <> 10
  ) invalid_cubeta_quantities;

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Mixta debe contener exactamente 10 piezas.';
  end if;

  select count(*)
    into v_invalid_count
  from (
    select item.bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2 item
    join public.inventory inventory
      on inventory.material_id = item.material_id_text::uuid
     and inventory.center_id = v_center_id
    where item.bundle_type_text = 'cubeta'
    group by item.bundle_id_text
    having count(distinct inventory.precio_venta) <> 1
  ) invalid_cubeta_prices;

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Mixta requiere productos con el mismo precio base.';
  end if;

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material
    on material.id = item.material_id_text::uuid
  join public.categories category
    on category.id = material.cat_id
  where item.bundle_type_text = 'cubeta_caguamita'
    and (
      coalesce(material.sku, '') <> '7503024416459'
      or lower(trim(category.name)) <> lower('Cerveza')
    );

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Caguamita contiene un producto no permitido.';
  end if;

  select count(*)
    into v_invalid_count
  from (
    select bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2
    where bundle_type_text = 'cubeta_caguamita'
    group by bundle_id_text
    having sum(quantity_text::numeric) <> 5
  ) invalid_caguamita_quantities;

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Caguamita debe contener exactamente 5 piezas.';
  end if;

  create temporary table if not exists pg_temp.finalize_pos_sale_items_v2 (
    material_id uuid,
    quantity numeric(12,4),
    unit_price numeric(12,2)
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_items_v2;

  insert into pg_temp.finalize_pos_sale_items_v2 (material_id, quantity, unit_price)
  select priced.material_id,
         sum(priced.quantity)::numeric(12,4),
         priced.unit_price
  from (
    select item.material_id_text::uuid as material_id,
           item.quantity_text::numeric as quantity,
           case item.bundle_type_text
             when 'cubeta' then 32.00::numeric(12,2)
             when 'cubeta_caguamita' then 26.00::numeric(12,2)
             else inventory.precio_venta::numeric(12,2)
           end as unit_price
    from pg_temp.finalize_pos_sale_raw_items_v2 item
    join public.inventory inventory
      on inventory.material_id = item.material_id_text::uuid
     and inventory.center_id = v_center_id
  ) priced
  group by priced.material_id, priced.unit_price;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 raw_item
  where not exists (
    select 1
    from pg_temp.finalize_pos_sale_items_v2 canonical_item
    where canonical_item.material_id = raw_item.material_id_text::uuid
  );

  if v_missing_count > 0 then
    raise exception 'No se pudo construir la lista canonica completa de la venta.';
  end if;

  select coalesce(sum(quantity * unit_price), 0)::numeric(12,2)
    into v_total_amount
  from pg_temp.finalize_pos_sale_items_v2;

  if v_total_amount <= 0 then
    raise exception 'El total de la venta debe ser mayor que cero.';
  end if;

  select count(*)
    into v_cash_session_count
  from public.cash_sessions
  where status = 'open';

  if v_cash_session_count > 1 then
    raise exception 'Se encontro mas de una caja abierta.';
  end if;

  select id
    into v_cash_session_id
  from public.cash_sessions
  where status = 'open'
  for update;

  if v_cash_session_id is null then
    raise exception 'No hay una caja abierta. Debes abrir caja antes de finalizar ventas en efectivo.';
  end if;

  v_sale_created_at := now();
  v_day_start := date_trunc('day', v_sale_created_at at time zone 'UTC') at time zone 'UTC';
  v_day_end := v_day_start + interval '1 day';

  perform pg_advisory_xact_lock(
    hashtext('finalize_pos_sale_document:' || to_char(v_day_start at time zone 'UTC', 'YYYYMMDD'))
  );

  select count(*) + 1
    into v_sequence
  from public.sales
  where created_at >= v_day_start
    and created_at < v_day_end;

  v_document_number :=
    to_char(v_sale_created_at at time zone 'UTC', 'DDMMYYYYHH24MI') ||
    lpad(v_sequence::text, 2, '0');

  insert into public.sales (
    center_id,
    total_amount,
    payment_method,
    cash_session_id,
    created_at,
    document_number
  )
  values (
    v_center_id,
    v_total_amount,
    v_payment_method,
    v_cash_session_id,
    v_sale_created_at,
    v_document_number
  )
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, material_id, quantity, unit_price)
  select v_sale_id,
         material_id,
         quantity,
         unit_price
  from pg_temp.finalize_pos_sale_items_v2;

  insert into public.inventory_movements (
    center_id,
    material_id,
    movement_type,
    direction,
    quantity,
    before_stock,
    after_stock,
    unit_cost,
    unit_price,
    reference_table,
    reference_id,
    reference_number,
    reason_code,
    notes,
    performed_by
  )
  select v_center_id,
         item.material_id,
         'sale',
         'out',
         item.quantity,
         inventory.stock_actual + item.quantity,
         inventory.stock_actual,
         null,
         item.unit_price,
         'sales',
         v_sale_id,
         v_document_number,
         'sale_ticket',
         'Salida de inventario por venta',
         p_performed_by::text
  from (
    select material_id,
           sum(quantity)::numeric(12,4) as quantity,
           round(sum(quantity * unit_price) / sum(quantity), 2)::numeric(12,2) as unit_price
    from pg_temp.finalize_pos_sale_items_v2
    group by material_id
  ) item
  join public.materials material
    on material.id = item.material_id
  join public.categories category
    on category.id = material.cat_id
  join public.inventory inventory
    on inventory.material_id = item.material_id
   and inventory.center_id = v_center_id
  where category.is_inventoried is true;

  update public.tables
     set status = 'libre',
         current_order_id = null
   where id = v_table.id
     and lower(trim(coalesce(status, ''))) = lower('ocupada')
     and current_order_id = v_order.id;

  if not found then
    raise exception 'El pedido activo de la mesa cambio durante la finalizacion.';
  end if;

  delete from public.table_orders
  where id = v_order.id
    and table_id = v_table.id;

  if not found then
    raise exception 'No se pudo consumir el pedido activo de la mesa.';
  end if;

  select to_jsonb(sale_row) || jsonb_build_object(
           'items',
           coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'material_id', item.material_id_text::uuid,
                          'name', material.name,
                          'quantity', item.quantity_text::numeric,
                          'unit_price',
                            case item.bundle_type_text
                              when 'cubeta' then 32.00::numeric(12,2)
                              when 'cubeta_caguamita' then 26.00::numeric(12,2)
                              else inventory.precio_venta::numeric(12,2)
                            end,
                          'base_unit_price', inventory.precio_venta::numeric(12,2),
                          'bundle_id', item.bundle_id_text,
                          'bundle_type', item.bundle_type_text,
                          'bundle_label',
                            case item.bundle_type_text
                              when 'cubeta' then 'Cubeta Mixta'
                              when 'cubeta_caguamita' then 'Cubeta Caguamita'
                              else null
                            end
                        )
                        order by item.bundle_id_text nulls last, material.name, item.material_id_text
                      )
               from pg_temp.finalize_pos_sale_raw_items_v2 item
               join public.materials material
                 on material.id = item.material_id_text::uuid
               join public.inventory inventory
                 on inventory.material_id = material.id
                and inventory.center_id = v_center_id
             ),
             '[]'::jsonb
           )
         )
    into v_sale
  from public.sales sale_row
  where sale_row.id = v_sale_id;

  return v_sale;
end;
$$

-- [1]
revoke all on function public.finalize_pos_sale(uuid, jsonb, text, uuid)
  from public, anon, authenticated

-- [2]
grant execute on function public.finalize_pos_sale(uuid, jsonb, text, uuid)
  to service_role
```

---

#### Fila 16 - ``20260715223000`` | ``make_botella_sellable`` (1 statements)

```sql
-- [0]
-- Fase 2.3: habilita la categoria Botella para venta con inventario.
-- Esta correccion solo modifica los indicadores operativos de la categoria.

do $$
declare
  v_botella_id uuid;
  v_match_count bigint;
begin
  select count(*),
         (array_agg(id order by id))[1]
    into v_match_count,
         v_botella_id
  from public.categories
  where lower(trim(name)) = lower('Botella');

  if v_match_count <> 1 then
    raise exception
      'Se esperaba exactamente una categoria Botella y se encontraron %.',
      v_match_count;
  end if;

  update public.categories
     set is_for_sale = true,
         is_inventoried = true,
         is_internal_production = false
   where id = v_botella_id
     and lower(trim(name)) = lower('Botella')
     and (
       is_for_sale is distinct from true
       or is_inventoried is distinct from true
       or is_internal_production is distinct from false
     );
end
$$
```

---

#### Fila 17 - ``20260716123000`` | ``reconcile_table_order_reservation_flag`` (1 statements)

```sql
-- [0]
-- Reconciles environments where the original migration is registered but its
-- structural effect is missing. Existing incompatible definitions are never
-- changed automatically.

do $$
declare
  v_type_oid oid;
  v_not_null boolean;
  v_default_expression text;
  v_comment text;
begin
  select a.atttypid,
         a.attnotnull,
         pg_get_expr(d.adbin, d.adrelid),
         col_description(a.attrelid, a.attnum)
    into v_type_oid,
         v_not_null,
         v_default_expression,
         v_comment
  from pg_attribute a
  left join pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where a.attrelid = 'public.table_orders'::regclass
    and a.attname = 'reservation_applied'
    and a.attnum > 0
    and not a.attisdropped;

  if not found then
    alter table public.table_orders
      add column reservation_applied boolean not null default false;

    comment on column public.table_orders.reservation_applied is
      'Indica si los productos de la mesa ya descontaron temporalmente inventario como reserva operativa.';

    return;
  end if;

  if v_type_oid <> 'boolean'::regtype
     or v_not_null is not true
     or v_default_expression is distinct from 'false' then
    raise exception
      'public.table_orders.reservation_applied existe con una definicion incompatible (tipo %, not_null %, default %).',
      format_type(v_type_oid, null),
      v_not_null,
      coalesce(v_default_expression, '<null>');
  end if;

  if v_comment is distinct from
     'Indica si los productos de la mesa ya descontaron temporalmente inventario como reserva operativa.' then
    comment on column public.table_orders.reservation_applied is
      'Indica si los productos de la mesa ya descontaron temporalmente inventario como reserva operativa.';
  end if;
end
$$
```

---

#### Fila 18 - ``20260803183000`` | ``enforce_cash_session_pos_invariant`` (20 statements)

```sql
-- [0]
begin

-- [1]
create or replace function public.active_pos_operation_count()
returns integer
language sql
stable
security definer
set search_path to public
as $$
  with active_stations as (
    select 'station:' || station.id::text as operation_key
    from public.tables station
    where lower(trim(coalesce(station.status, ''))) = 'ocupada'
       or station.current_order_id is not null
  ),
  orphan_orders as (
    select 'order:' || active_order.id::text as operation_key
    from public.table_orders active_order
    where not exists (
      select 1
      from public.tables station
      where station.current_order_id = active_order.id
    )
  )
  select count(*)::integer
  from (
    select operation_key from active_stations
    union all
    select operation_key from orphan_orders
  ) active_operations;
$$

-- [2]
revoke all on function public.active_pos_operation_count() from public, anon, authenticated

-- [3]
grant execute on function public.active_pos_operation_count() to service_role

-- [4]
create or replace function public.require_open_cash_session_for_pos_operation()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_cash_session_id uuid;
begin
  select cash_session.id
    into v_cash_session_id
  from public.cash_sessions cash_session
  where cash_session.status = 'open'
  order by cash_session.opened_at desc
  limit 1
  for update;

  if v_cash_session_id is null then
    raise exception 'No hay una caja abierta. Debes abrir caja antes de abrir mesas, barras o modificar pedidos.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$

-- [5]
revoke all on function public.require_open_cash_session_for_pos_operation() from public, anon, authenticated

-- [6]
drop trigger if exists table_orders_require_open_cash_session on public.table_orders

-- [7]
create trigger table_orders_require_open_cash_session
before insert or update on public.table_orders
for each row
execute function public.require_open_cash_session_for_pos_operation()

-- [8]
drop trigger if exists tables_insert_require_open_cash_session on public.tables

-- [9]
create trigger tables_insert_require_open_cash_session
before insert on public.tables
for each row
when (
  lower(trim(coalesce(new.status, ''))) = 'ocupada'
  or new.current_order_id is not null
)
execute function public.require_open_cash_session_for_pos_operation()

-- [10]
drop trigger if exists tables_activate_require_open_cash_session on public.tables

-- [11]
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
execute function public.require_open_cash_session_for_pos_operation()

-- [12]
create or replace function public.prevent_cash_close_with_active_pos_operations()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_active_operation_count integer;
begin
  if old.status = 'open' and new.status = 'closed' then
    v_active_operation_count := public.active_pos_operation_count();

    if v_active_operation_count > 0 then
      raise exception 'No puedes cerrar la caja mientras haya mesas, barras o pedidos activos.'
        using
          errcode = 'P0001',
          detail = format('active_sales_count=%s', v_active_operation_count);
    end if;
  end if;

  return new;
end;
$$

-- [13]
revoke all on function public.prevent_cash_close_with_active_pos_operations() from public, anon, authenticated

-- [14]
drop trigger if exists cash_sessions_prevent_close_with_active_pos_operations on public.cash_sessions

-- [15]
create trigger cash_sessions_prevent_close_with_active_pos_operations
before update of status on public.cash_sessions
for each row
when (old.status = 'open' and new.status = 'closed')
execute function public.prevent_cash_close_with_active_pos_operations()

-- [16]
create or replace function public.close_cash_session_atomic(
  p_closed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_open_session public.cash_sessions%rowtype;
  v_closed_session public.cash_sessions%rowtype;
  v_active_operation_count integer;
  v_sales_cash_total numeric(12,2);
  v_profit_total numeric(12,2);
  v_closing_amount numeric(12,2);
  v_closed_at timestamptz;
  v_report_pdf_metadata jsonb;
begin
  if p_closed_by is null then
    raise exception 'Falta closed_by para cerrar la caja.' using errcode = 'P0001';
  end if;

  select cash_session.*
    into v_open_session
  from public.cash_sessions cash_session
  where cash_session.status = 'open'
  order by cash_session.opened_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'No existe una caja abierta para cerrar.',
      'active_sales_count', 0
    );
  end if;

  v_active_operation_count := public.active_pos_operation_count();
  if v_active_operation_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'No puedes cerrar la caja mientras haya ventas activas. Finaliza o cancela todos los pedidos antes de cerrar la caja.',
      'active_sales_count', v_active_operation_count
    );
  end if;

  delete from public.cash_session_inventory_snapshots snapshot
  where snapshot.cash_session_id = v_open_session.id
    and snapshot.snapshot_type = 'closing';

  insert into public.cash_session_inventory_snapshots (
    cash_session_id,
    snapshot_type,
    material_id,
    material_name,
    quantity,
    average_cost
  )
  select
    v_open_session.id,
    'closing',
    inventory.material_id,
    material.name,
    inventory.stock_actual,
    inventory.costo_promedio
  from public.inventory inventory
  join public.materials material
    on material.id = inventory.material_id
  left join public.categories category
    on category.id = material.cat_id
  where nullif(trim(material.name), '') is not null
    and coalesce(category.is_inventoried, true) = true
  order by lower(material.name), inventory.material_id;

  select coalesce(sum(sale.total_amount), 0)::numeric(12,2)
    into v_sales_cash_total
  from public.sales sale
  where sale.cash_session_id = v_open_session.id
    and lower(trim(coalesce(sale.payment_method, ''))) = lower('Efectivo');

  select coalesce(
    sum(
      sale_item.quantity *
      (sale_item.unit_price - coalesce(inventory.costo_promedio, 0))
    ),
    0
  )::numeric(12,2)
    into v_profit_total
  from public.sales sale
  join public.sale_items sale_item
    on sale_item.sale_id = sale.id
  left join public.inventory inventory
    on inventory.material_id = sale_item.material_id
   and inventory.center_id = sale.center_id
  where sale.cash_session_id = v_open_session.id
    and lower(trim(coalesce(sale.payment_method, ''))) = lower('Efectivo');

  v_closed_at := now();
  v_closing_amount := v_open_session.opening_amount + v_sales_cash_total;
  v_report_pdf_metadata := jsonb_build_object(
    'generated_at', v_closed_at,
    'suggested_file_name',
      'corte-caja-' ||
      to_char(v_open_session.opened_at at time zone 'America/Mexico_City', 'YYYYMMDD-HH24MI') ||
      '-' || left(v_open_session.id::text, 8) || '.pdf'
  );

  update public.cash_sessions cash_session
  set status = 'closed',
      closed_at = v_closed_at,
      closed_by = p_closed_by,
      sales_cash_total = v_sales_cash_total,
      expected_cash_total = v_closing_amount,
      closing_amount = v_closing_amount,
      profit_total = v_profit_total,
      report_pdf_metadata = v_report_pdf_metadata
  where cash_session.id = v_open_session.id
    and cash_session.status = 'open'
  returning cash_session.* into v_closed_session;

  if not found then
    raise exception 'La caja cambio de estado antes de completar el cierre.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'session', to_jsonb(v_closed_session),
    'active_sales_count', 0
  );
end;
$$

-- [17]
revoke all on function public.close_cash_session_atomic(uuid) from public, anon, authenticated

-- [18]
grant execute on function public.close_cash_session_atomic(uuid) to service_role

-- [19]
commit
```

---

#### Fila 19 - ``20260803232300`` | ``fix_active_pos_operation_count`` (6 statements)

```sql
-- [0]
begin

-- [1]
create or replace function public.active_pos_operation_count()
returns integer
language sql
stable
security definer
set search_path to public
as $$
  select count(*)::integer
  from public.tables station
  where lower(trim(coalesce(station.status, ''))) = 'ocupada'
     or station.current_order_id is not null;
$$

-- [2]
comment on function public.active_pos_operation_count() is
  'Cuenta exclusivamente mesas o barras activas. Los table_orders historicos sin current_order_id no representan ventas en proceso.'

-- [3]
revoke all on function public.active_pos_operation_count() from public, anon, authenticated

-- [4]
grant execute on function public.active_pos_operation_count() to service_role

-- [5]
commit
```

---

#### Fila 20 - ``20260804010500`` | ``open_cash_session_atomic`` (6 statements)

```sql
-- [0]
begin

-- [1]
create or replace function public.open_cash_session_atomic(
  p_opening_amount numeric,
  p_opened_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_existing_session_id uuid;
  v_active_operation_count integer;
  v_opened_session public.cash_sessions%rowtype;
begin
  if p_opening_amount is null or p_opening_amount <= 0 then
    raise exception 'Debes ingresar un monto inicial mayor a 0.'
      using errcode = 'P0001';
  end if;

  if p_opened_by is null then
    raise exception 'Falta opened_by para abrir la caja.'
      using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('public.open_cash_session_atomic', 0));

  select cash_session.id
    into v_existing_session_id
  from public.cash_sessions cash_session
  where cash_session.status = 'open'
  order by cash_session.opened_at desc
  limit 1
  for update;

  if v_existing_session_id is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya existe una caja abierta. Debes cerrarla antes de abrir una nueva.',
      'active_sales_count', 0
    );
  end if;

  v_active_operation_count := public.active_pos_operation_count();
  if v_active_operation_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'No puedes abrir la caja mientras haya mesas, barras o pedidos activos.',
      'active_sales_count', v_active_operation_count
    );
  end if;

  insert into public.cash_sessions (
    status,
    opening_amount,
    sales_cash_total,
    expected_cash_total,
    closing_amount,
    profit_total,
    opened_by
  )
  values (
    'open',
    p_opening_amount,
    0,
    p_opening_amount,
    p_opening_amount,
    0,
    p_opened_by
  )
  returning * into v_opened_session;

  insert into public.cash_session_inventory_snapshots (
    cash_session_id,
    snapshot_type,
    material_id,
    material_name,
    quantity,
    average_cost
  )
  select
    v_opened_session.id,
    'opening',
    inventory.material_id,
    material.name,
    inventory.stock_actual,
    inventory.costo_promedio
  from public.inventory inventory
  join public.materials material
    on material.id = inventory.material_id
  left join public.categories category
    on category.id = material.cat_id
  where coalesce(material.name, '') <> ''
    and coalesce(category.is_inventoried, true) = true
  order by lower(material.name), inventory.material_id;

  return jsonb_build_object(
    'ok', true,
    'session', to_jsonb(v_opened_session),
    'active_sales_count', 0
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya existe una caja abierta. Debes cerrarla antes de abrir una nueva.',
      'active_sales_count', 0
    );
end;
$$

-- [2]
comment on function public.open_cash_session_atomic(numeric, uuid) is
  'Abre una unica caja y captura su inventario inicial dentro de la misma transaccion.'

-- [3]
revoke all on function public.open_cash_session_atomic(numeric, uuid) from public, anon, authenticated

-- [4]
grant execute on function public.open_cash_session_atomic(numeric, uuid) to service_role

-- [5]
commit
```


**Analisis P5:**

| Observacion | Valor |
|---|---|
| Total filas en `schema_migrations` (Remote) | **20** |
| Versiones ledger presentes (`20260810200000`+) | Ninguna |
| `20260812100000` presente | No |
| Coherencia con P2 (Remote) | Identicas 20 versiones |

**Criterio P5:** CUMPLIDO - estado previo capturado. Ninguna migracion ledger en `schema_migrations` Remote. R1 operara sobre base limpia conocida.

---

## 3. Resumen de Prerrequisitos R1 (estado actualizado)

| Prerrequisito | Estado |
|---|---|
| P1 - Historial Remote vacio para las 7 ledger (Fase 3.2) | APROBADO |
| P2 - Proyecto DEV enlazado y accesible | APROBADO (este documento) |
| P3 - Ledger inactivo en DEV (T-12 PASS en preflight) | APROBADO |
| P4 - `20260812100000` excluida de repair | APROBADO (diseno confirma exclusion) |
| P5 - Captura de estado previo y auditoria | APROBADO (este documento) |
| P6 - Cuerpos completos y privilegios verificados | APROBADO (ver `FASE3_P6_RESULTADOS.md`) |

Todos los prerrequisitos P1-P6 estan APROBADOS.

R1 solo estara listo para autorizacion cuando el usuario otorgue aprobacion explicita y `20260812100000` permanezca excluida.

---

## 4. Evidencia de No Intervencion

- Solo se ejecutaron `SELECT` y `npx supabase migration list --linked` (lectura unicamente).
- Sin `INSERT`, `UPDATE`, `DELETE`, DDL, `migration repair`, `db push`, `activate_ledger`, ni deployments.
- Sin modificaciones a migraciones, codigo productivo ni frontend.
- Estado de DEV sin cambios respecto a la captura realizada.