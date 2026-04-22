---
name: naming-analyzer
summary: Review names in this codebase for clarity, intent, and consistency.
when_to_use: Use during refactors, reviews, or when names are making the code harder to understand than the logic itself.
---

# Naming Analyzer

## Goal

Find naming problems that reduce readability or lead to wrong assumptions.

## Main targets

- React components
- hooks and state variables
- service functions in `src/api`
- Supabase function handlers
- SQL objects where naming leaks into app logic

## Required workflow

1. Review names in context, not in isolation.
2. Check whether the name matches actual behavior.
3. Flag:
   - vague names
   - misleading names
   - inconsistent pairs
   - boolean names without boolean shape
   - overloaded names with multiple meanings
4. Prefer small rename sets with high clarity gain.

## Repo-specific guidance

- Page names in `src/pages` should reflect user-facing modules.
- Service method names should reflect the backend operation, not the UI label.
- Avoid mixing Spanish and English in identifiers unless the repo already depends on a specific domain term.
- Keep domain words stable when they map to business concepts such as `cash session`, `inventory`, `purchase`, or `sales report`.

## Output

Report:
- strongest naming issues first
- suggested rename
- why the current name is weak
- blast radius if renamed
