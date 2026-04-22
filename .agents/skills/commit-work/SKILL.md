---
name: commit-work
summary: Turn working tree changes into clean, scoped commits for this repo.
when_to_use: Use when work is done and changes need to be grouped, committed, and prepared for push or deploy.
---

# Commit Work

## Goal

Create intentional, reviewable commits with clean scope.

## Repo focus

This project mixes:
- frontend app code
- Supabase functions
- SQL migrations
- operational docs

These should not be mixed without reason.

## Required workflow

1. Inspect the working tree.
2. Group changes by outcome, not by timestamp.
3. Separate at least these categories when they coexist:
   - feature or bugfix code
   - migrations
   - docs
   - local-only or env-only changes
4. Exclude files that must not ship.
5. Write a commit message that matches the real scope.
6. Before commit, state what is included and what is intentionally excluded.

## Repo-specific rules

- Never commit `.env.local` or `.env.development.local`.
- Treat dev-only visual markers as local-only unless explicitly requested.
- Prefer separate commits for:
  - `src/` functional changes
  - `supabase/` backend changes
  - `docs/` release or auth documentation
- If a release affects Vercel and Supabase, mention both in the summary to the user.

## Commit style

Prefer:
- `feat: ...`
- `fix: ...`
- `docs: ...`
- `refactor: ...`

Keep the subject specific.

## Output

Always report:
- commit message
- included files or scope
- excluded files, if any
- whether push is still pending
