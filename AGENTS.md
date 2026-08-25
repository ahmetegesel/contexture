# AGENTS.md — Workspace Convention

## What this workspace is

A vendor-neutral convention for AI-assisted, multi-session work: lean prose in
this file, a `sessions/` folder that persists work state, a `rhythms/` folder of
human-chosen workflow patterns, and git as the audit/recovery substrate.
Everything here runs on tools every harness already provides — bash, grep,
read — and nothing else.

## Golden rules

1. **No vendor lock-in.** Plain files, prose, and universal tools only. No
   custom scripts, no harness features (skills, hooks, commands, plugins), no
   installs. The harness is interchangeable.
2. **Persisted state is the source of truth.** Never rely on conversation
   history. Session files survive compaction, harness switches, and breaks.
3. **Load only what you need.** The active session is the working set; closed
   sessions stay archived unless a task requires them.
4. **Process is free.** Rhythms are human-chosen, never imposed. We govern the
   output, not the process.
5. **Mitigate, don't solve.** Nudge-level defaults. A mechanic earns its place
   only when the failure is costly/frequent, cheap to check, and nudge-unreliable.
6. **Verify before you close.** Never mark work done without verification. The
   human reviews the diff at session end — that review is the gate.

## Layout

- `AGENTS.md` — this file: interaction defaults + navigation
- `sessions/` — one folder per session; the active session is the working set
- `rhythms/`  — human-chosen workflow patterns (markdown), picked per task
- `archive/`  — closed sessions and retired material

## Boot sequence

1. Locate the active session: `grep -rl "status: ACTIVE" sessions/`.
2. Read its state file whole; grep its journal for open items.
3. Continue from the persisted `next_action`, using the rhythm the human
   selected if one is active.
4. No active session? Say so and ask which rhythm to start with.

## Interaction defaults

- One design question per turn; ground it before asking.
- Discuss before significant decisions; the human may interrupt anytime.
- Never claim verification you did not perform.
- Name artifacts by what they are, not by session shorthand.

## Session close

1. Append events to the journal; persist `next_action` and durable knowledge.
2. Re-read the session files and confirm consistency.
3. Mark the session closed and commit — commits are checkpoints.
4. The human reviews the diff; that review is the gate for the next session.

## Git discipline

Commit at every session boundary. `git diff` is the audit trail; `git revert`
is the recovery path. Never push without explicit instruction.
