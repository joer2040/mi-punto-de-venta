


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






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
$_$;


ALTER FUNCTION "public"."assert_valid_username"("p_username" "text") OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text") OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."current_app_is_manager"() OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."current_app_is_superadmin"() OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."delete_app_user"("p_user_id" "uuid") OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."handle_new_material"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_username"("p_username" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(btrim(p_username));
$$;


ALTER FUNCTION "public"."normalize_username"("p_username" "text") OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text", "p_status" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."update_inventory_on_purchase"() OWNER TO "postgres";


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
$$;


ALTER FUNCTION "public"."update_inventory_on_sale"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."username_to_auth_email"("p_username" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select public.normalize_username(p_username) || '@usuarios.mi-punto-de-venta.local';
$$;


ALTER FUNCTION "public"."username_to_auth_email"("p_username" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "screen_key" "text" NOT NULL,
    "action_key" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_permissions" IS 'Catalogo de permisos atomicos por pantalla y accion.';



CREATE TABLE IF NOT EXISTS "public"."app_profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "full_name" "text",
    "email" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_superadmin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."app_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_profiles" IS 'Perfiles de acceso de la aplicacion, enlazados a auth.users con identificador visible por username.';



CREATE TABLE IF NOT EXISTS "public"."app_role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."app_roles" IS 'Catalogo de roles para asignacion de permisos por pantalla y accion.';



CREATE TABLE IF NOT EXISTS "public"."app_user_roles" (
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_user_roles" OWNER TO "postgres";


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
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_log" IS 'Bitacora administrativa para cambios de catalogos y datos maestros.';



CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "name" "text" NOT NULL,
    "def_tax" numeric(5,2) DEFAULT 16.00,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_for_sale" boolean DEFAULT false,
    "is_inventoried" boolean DEFAULT true
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."centers" OWNER TO "postgres";


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
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


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
);


ALTER TABLE "public"."inventory_adjustments" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_adjustments" IS 'Documento formal para correcciones manuales de inventario.';



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
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_movements" IS 'Libro historico de movimientos de inventario para compras, ventas y ajustes.';



CREATE TABLE IF NOT EXISTS "public"."materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text",
    "name" "text" NOT NULL,
    "cat_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "buy_uom_id" "uuid",
    "sell_uom_id" "uuid",
    "conversion_factor" numeric(12,4) DEFAULT 1
);


ALTER TABLE "public"."materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "base_currency" character varying(3) DEFAULT 'MXN'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "rfc" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_id" "uuid",
    "material_id" "uuid",
    "quantity" numeric(12,4) NOT NULL,
    "unit_cost" numeric(12,2) NOT NULL,
    "subtotal" numeric(12,2) GENERATED ALWAYS AS (("quantity" * "unit_cost")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid",
    "supplier_id" "uuid",
    "total_amount" numeric(12,2) DEFAULT 0.00,
    "reference_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "provider_id" "uuid",
    "invoice_ref" "text"
);


ALTER TABLE "public"."purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid",
    "material_id" "uuid",
    "quantity" numeric(12,4) NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "subtotal" numeric(12,2) GENERATED ALWAYS AS (("quantity" * "unit_price")) STORED
);


ALTER TABLE "public"."sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "center_id" "uuid",
    "total_amount" numeric(12,2) DEFAULT 0.00,
    "payment_method" "text" DEFAULT 'Efectivo'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "document_number" "text"
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "name" "text" NOT NULL,
    "contact_info" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."table_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_id" "uuid",
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "total" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "waiter_edit_locked" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."table_orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."table_orders"."waiter_edit_locked" IS 'Cuando es true, un mesero ya no puede disminuir cantidades ni remover productos de la mesa; solo agregar o aumentar.';



CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" "text" NOT NULL,
    "status" "text" DEFAULT 'libre'::"text",
    "active_order_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "current_order_id" "uuid"
);


ALTER TABLE "public"."tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."uoms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "abbr" character varying(10) NOT NULL,
    "is_base" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."uoms" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_permissions"
    ADD CONSTRAINT "app_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_permissions"
    ADD CONSTRAINT "app_permissions_screen_key_action_key_key" UNIQUE ("screen_key", "action_key");



ALTER TABLE ONLY "public"."app_profiles"
    ADD CONSTRAINT "app_profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_profiles"
    ADD CONSTRAINT "app_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_profiles"
    ADD CONSTRAINT "app_profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."app_role_permissions"
    ADD CONSTRAINT "app_role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."app_roles"
    ADD CONSTRAINT "app_roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."app_roles"
    ADD CONSTRAINT "app_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_pkey" PRIMARY KEY ("user_id", "role_id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."centers"
    ADD CONSTRAINT "centers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_material_id_center_id_key" UNIQUE ("material_id", "center_id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."providers"
    ADD CONSTRAINT "providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."table_orders"
    ADD CONSTRAINT "table_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."uoms"
    ADD CONSTRAINT "uoms_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_app_permissions_screen_action" ON "public"."app_permissions" USING "btree" ("screen_key", "action_key");



CREATE INDEX "idx_app_profiles_status" ON "public"."app_profiles" USING "btree" ("status");



CREATE INDEX "idx_app_user_roles_role_id" ON "public"."app_user_roles" USING "btree" ("role_id");



CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "idx_audit_log_event_type" ON "public"."audit_log" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_inventory_adjustments_center_created_at" ON "public"."inventory_adjustments" USING "btree" ("center_id", "created_at" DESC);



CREATE INDEX "idx_inventory_adjustments_material_created_at" ON "public"."inventory_adjustments" USING "btree" ("material_id", "created_at" DESC);



CREATE INDEX "idx_inventory_movements_center_created_at" ON "public"."inventory_movements" USING "btree" ("center_id", "created_at" DESC);



CREATE INDEX "idx_inventory_movements_material_created_at" ON "public"."inventory_movements" USING "btree" ("material_id", "created_at" DESC);



CREATE INDEX "idx_inventory_movements_reference" ON "public"."inventory_movements" USING "btree" ("reference_table", "reference_id");



CREATE INDEX "idx_sales_document_number" ON "public"."sales" USING "btree" ("document_number");



CREATE OR REPLACE TRIGGER "on_material_created" AFTER INSERT ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_material"();



CREATE OR REPLACE TRIGGER "tr_update_inventory_on_purchase" AFTER INSERT ON "public"."purchase_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_on_purchase"();



CREATE OR REPLACE TRIGGER "tr_update_inventory_on_sale" AFTER INSERT ON "public"."sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_on_sale"();



ALTER TABLE ONLY "public"."app_profiles"
    ADD CONSTRAINT "app_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_role_permissions"
    ADD CONSTRAINT "app_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."app_permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_role_permissions"
    ADD CONSTRAINT "app_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."app_roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."app_roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_user_roles"
    ADD CONSTRAINT "app_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."centers"
    ADD CONSTRAINT "centers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_buy_uom_id_fkey" FOREIGN KEY ("buy_uom_id") REFERENCES "public"."uoms"("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_cat_id_fkey" FOREIGN KEY ("cat_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_sell_uom_id_fkey" FOREIGN KEY ("sell_uom_id") REFERENCES "public"."uoms"("id");



ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id");



ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."table_orders"
    ADD CONSTRAINT "table_orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_current_order_id_fkey" FOREIGN KEY ("current_order_id") REFERENCES "public"."table_orders"("id");



ALTER TABLE "public"."app_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_authenticated_select" ON "public"."app_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_self_or_superadmin_select" ON "public"."app_profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."current_app_is_superadmin"() OR "public"."current_app_is_manager"()));



CREATE POLICY "role_permissions_authenticated_select" ON "public"."app_role_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "roles_authenticated_select" ON "public"."app_roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "user_roles_self_or_superadmin_select" ON "public"."app_user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."current_app_is_superadmin"() OR "public"."current_app_is_manager"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."assert_valid_username"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."assert_valid_username"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assert_valid_username"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_superadmin"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_app_user"("p_username" "text", "p_password" "text", "p_full_name" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_app_is_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_app_is_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_is_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_app_is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_app_is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_is_superadmin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_app_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_app_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_app_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_material"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_material"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_material"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_username"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_username"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_username"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text", "p_status" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text", "p_status" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_app_user"("p_user_id" "uuid", "p_username" "text", "p_full_name" "text", "p_status" "text", "p_is_superadmin" boolean, "p_role_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_on_purchase"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_on_purchase"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_on_purchase"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_on_sale"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_on_sale"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_on_sale"() TO "service_role";



GRANT ALL ON FUNCTION "public"."username_to_auth_email"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."username_to_auth_email"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."username_to_auth_email"("p_username" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."app_permissions" TO "anon";
GRANT ALL ON TABLE "public"."app_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."app_profiles" TO "anon";
GRANT ALL ON TABLE "public"."app_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."app_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."app_role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."app_role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."app_role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."app_roles" TO "anon";
GRANT ALL ON TABLE "public"."app_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."app_roles" TO "service_role";



GRANT ALL ON TABLE "public"."app_user_roles" TO "anon";
GRANT ALL ON TABLE "public"."app_user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."app_user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."centers" TO "anon";
GRANT ALL ON TABLE "public"."centers" TO "authenticated";
GRANT ALL ON TABLE "public"."centers" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."materials" TO "anon";
GRANT ALL ON TABLE "public"."materials" TO "authenticated";
GRANT ALL ON TABLE "public"."materials" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."providers" TO "anon";
GRANT ALL ON TABLE "public"."providers" TO "authenticated";
GRANT ALL ON TABLE "public"."providers" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchases" TO "anon";
GRANT ALL ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";



GRANT ALL ON TABLE "public"."sale_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."table_orders" TO "anon";
GRANT ALL ON TABLE "public"."table_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."table_orders" TO "service_role";



GRANT ALL ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT ALL ON TABLE "public"."uoms" TO "anon";
GRANT ALL ON TABLE "public"."uoms" TO "authenticated";
GRANT ALL ON TABLE "public"."uoms" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































