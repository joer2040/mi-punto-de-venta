-- Fix Supabase linter warnings for mutable function search_path.
-- This migration does not change function logic; it only pins the schema resolution.

begin;

alter function public.handle_new_material()
  set search_path = public;

alter function public.update_inventory_on_purchase()
  set search_path = public;

alter function public.update_inventory_on_sale()
  set search_path = public;

alter function public.assert_valid_username(text)
  set search_path = public;

alter function public.normalize_username(text)
  set search_path = public;

alter function public.username_to_auth_email(text)
  set search_path = public;

commit;
