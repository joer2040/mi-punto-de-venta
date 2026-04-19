## SQL Archive

This folder keeps historical SQL scripts that are no longer the active source of truth.

Use them only when:
- you need implementation history
- you are comparing old manual setup against current migrations
- you are recovering a one-off script for controlled manual use

Do not add new operational scripts here.
Prefer:
- `sql/dev/`
- `sql/prod/`
- `supabase/migrations/`
