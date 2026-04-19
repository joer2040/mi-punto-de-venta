## SQL Scripts

This folder is only for support SQL outside the primary schema history.

Current source of truth:
- `supabase/migrations/` for committed schema history
- `supabase/functions/` for deployed Edge Functions

Subfolders:
- `sql/dev/` for development-only support scripts
- `sql/prod/` for production-only operational scripts
- `sql/archive/` for historical manual scripts kept as reference

Recommended execution flow:
- use `npm run supabase:sql:dev -- -File sql/dev/<file>.sql` for dev
- use `npm run supabase:sql:prod -- -File sql/prod/<file>.sql -AllowProduction` for prod

Cleanup rule going forward:
- avoid adding new long-lived schema changes only in `sql/`
- prefer `supabase/migrations/` for durable database changes
