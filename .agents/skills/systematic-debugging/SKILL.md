---
name: systematic-debugging
summary: Debug bugs in mi-punto-de-venta with a strict root-cause-first workflow.
when_to_use: Use when a defect is unclear, intermittent, or already resisted one or more ad hoc fixes.
---

# Systematic Debugging

## Goal

Find the real cause before changing code, then apply the smallest safe fix and verify it.

## Repo focus

- UI flows in `src/pages`
- App wiring in `src/App.jsx`
- API clients in `src/api`
- Supabase logic in `supabase/functions`
- Schema or permission issues in `supabase/migrations`

## Required workflow

1. Restate the bug in one precise sentence.
2. Identify the exact failing flow, page, function, query, or deployment step.
3. Reproduce the issue with the smallest possible path.
4. Gather evidence before editing:
   - relevant files
   - exact error text
   - recent related changes
   - environment involved: local, dev, or prod
5. Form 1-3 explicit hypotheses.
6. Test hypotheses with minimal changes or direct inspection.
7. Fix only the confirmed cause.
8. Verify with the lightest valid check first, then stronger validation if needed.

## Repo-specific checks

- For frontend behavior, prefer `npm.cmd run build` after the fix.
- For Supabase issues, separate:
  - client bug
  - edge function bug
  - migration or permission bug
  - env/config bug
- For auth issues with edge functions, verify whether `Verify JWT` expectations and runtime auth flow match project docs.

## Rules

- Do not guess and patch blindly.
- Do not mix unrelated cleanup into the fix.
- Preserve existing user changes.
- If the issue is operational, say so clearly instead of forcing a code change.

## Output

Always end with:
- root cause
- exact fix made
- verification performed
- remaining risk, if any
