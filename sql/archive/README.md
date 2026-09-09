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

### `prod/`

Contains historical one-off production data interventions retained for audit
and implementation history.

Files under `prod/` are **not operational scripts**, are not part of the
migration pipeline, and must not be re-run against current production unless
a new controlled intervention is explicitly reviewed and authorized.
