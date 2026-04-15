## SQL Scripts

These files are kept as manual or historical support scripts.

Current guidance:
- `supabase/migrations/` is the primary database history for the project.
- `supabase/functions/` is the primary home for deployed Supabase Edge Functions.

Use the scripts in this folder when:
- you need a one-off manual setup in Supabase SQL Editor,
- you want to inspect historical setup steps,
- or you are converting older manual SQL into formal migrations.

Recommended cleanup rule going forward:
- avoid introducing new long-lived schema changes only in `sql/`;
- prefer adding or updating migrations under `supabase/migrations/`.
