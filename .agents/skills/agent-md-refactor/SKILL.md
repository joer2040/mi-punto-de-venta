---
name: agent-md-refactor
summary: Refactor AGENTS.md and similar instruction files so they stay clear, compact, and non-contradictory.
when_to_use: Use when AGENTS.md or related docs become long, repetitive, vague, or internally inconsistent.
---

# Agent MD Refactor

## Goal

Improve agent instruction files without losing intent.

## Target files

- `AGENTS.md`
- operational docs that shape agent behavior
- short local usage notes for repo-specific workflows

## Required workflow

1. Read the full file before editing.
2. Identify:
   - contradictions
   - duplicated rules
   - vague instructions
   - outdated process steps
3. Keep hard constraints.
4. Remove repetition.
5. Group rules by purpose.
6. Preserve practical invocation examples when they help the user.

## Repo-specific guidance

- Keep `Caveman` instructions intact unless the user asks to change them.
- Keep project-specific operational rules near the bottom if they are optional.
- Do not turn `AGENTS.md` into a long manual; move long process docs into `docs/` when needed.

## Output

Always explain:
- what was clarified
- what was removed or merged
- whether any behavior changed
