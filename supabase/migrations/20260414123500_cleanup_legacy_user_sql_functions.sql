-- Cleanup legacy SQL user-management RPCs replaced by Edge Functions.
-- The app now uses supabase/functions/user-admin/index.ts for all writes.

drop function if exists public.create_app_user(text, text, text, boolean, uuid[]);
drop function if exists public.update_app_user(uuid, text, text, text, boolean, uuid[]);
drop function if exists public.delete_app_user(uuid);
