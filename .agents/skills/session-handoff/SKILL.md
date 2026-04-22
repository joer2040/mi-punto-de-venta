---
name: session-handoff
summary: Save or resume actionable context for long-running work in mi-punto-de-venta.
when_to_use: Use when work will continue later, changes span multiple sessions, or a safe handoff is needed.
---

# Session Handoff

## Goal

Preserve enough context so the next session can continue without rediscovery.

## Storage

Use `.agents/skills/session-handoff/templates/handoff-template.md` as the canonical format for handoff notes.

## Create workflow

When creating a handoff, capture:
- objective
- current status
- files touched
- commands already run
- validations completed
- blockers
- exact next step

## Resume workflow

When resuming from a handoff:
1. Read the last handoff note.
2. Confirm whether the working tree still matches the note.
3. Verify assumptions before coding.
4. Continue from the last safe step, not from memory.

## Repo-specific rules

- Mention whether the work affects local app code, Supabase backend, or both.
- Record if dev and prod are already diverged or synchronized.
- Record any manual dashboard steps, especially for Supabase and Vercel.

## Output

Handoffs must be short, factual, and executable by the next session.
