-- Fix auth_rls_initplan WARN on app_profiles and app_user_roles.
-- Replace auth.uid() with (select auth.uid()) so Postgres evaluates
-- the JWT claim once per query instead of once per row.
-- Semantic behaviour is identical; only planner evaluation order changes.

DROP POLICY "profiles_self_or_superadmin_select" ON public.app_profiles;
CREATE POLICY "profiles_self_or_superadmin_select" ON public.app_profiles
  FOR SELECT TO authenticated
  USING (
    (id = (select auth.uid()))
    OR public.current_app_is_superadmin()
    OR public.current_app_is_manager()
  );

DROP POLICY "user_roles_self_or_superadmin_select" ON public.app_user_roles;
CREATE POLICY "user_roles_self_or_superadmin_select" ON public.app_user_roles
  FOR SELECT TO authenticated
  USING (
    (user_id = (select auth.uid()))
    OR public.current_app_is_superadmin()
    OR public.current_app_is_manager()
  );
