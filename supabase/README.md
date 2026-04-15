## Supabase Source Of Truth

This project now uses `supabase/` as the primary source of truth for Supabase-related assets.

What lives here:
- `migrations/`: versioned database schema pulled from or pushed to the remote Supabase project.
- `functions/`: Edge Functions deployed to Supabase online.
- `config.toml`: local Supabase project configuration for CLI and Docker-based local development.

Recommended workflow:
1. Make schema changes intentionally.
2. Keep database history in `supabase/migrations/`.
3. Keep Edge Functions in `supabase/functions/`.
4. Use `npx.cmd supabase link --project-ref ...` to connect this repo to the hosted project.
5. Use `npx.cmd supabase db pull` to bring remote schema changes into migrations.
6. Use `npx.cmd supabase db push` to apply committed migrations to the linked remote project.

Important note:
- Files under `../sql/` are now considered support or historical scripts.
- New database changes should prefer migrations under `supabase/migrations/`.
