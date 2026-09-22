-- Fix anon_security_definer_function_executable warnings.
-- Root cause: PostgreSQL grants EXECUTE to PUBLIC by default on CREATE FUNCTION.
-- Prior migrations revoked from anon/authenticated directly but never FROM PUBLIC,
-- so anon inherited EXECUTE via PUBLIC. Fix: REVOKE ALL FROM PUBLIC first, then
-- re-grant only to the roles that legitimately need direct execution.

begin;

-- Trigger functions — no role needs direct EXECUTE;
-- trigger invocations bypass the EXECUTE privilege check.
revoke all on function public.assert_journal_entry_balanced()
  from public, anon, authenticated;

revoke all on function public.protect_system_financial_accounts()
  from public, anon, authenticated;

-- Bootstrap utility — post-setup, no active role should call this via API.
revoke all on function public.bootstrap_superadmin(uuid, text, text)
  from public, anon, authenticated;

-- Session check functions — authenticated users only (used in RLS policies
-- scoped to authenticated; anon never triggers those policies).
revoke all on function public.current_app_is_manager()
  from public, anon;
grant execute on function public.current_app_is_manager()
  to authenticated;

revoke all on function public.current_app_is_superadmin()
  from public, anon;
grant execute on function public.current_app_is_superadmin()
  to authenticated;

-- Document number generator — service_role only (called via adminClient in
-- erp-operations Edge Function; never called from frontend or anon context).
revoke all on function public.next_inventory_movement_document_number()
  from public, anon, authenticated;
grant execute on function public.next_inventory_movement_document_number()
  to service_role;

commit;
