## Golden rules

1. **Persisted state is the source of truth.** Never rely on conversation
   history. Session files survive compaction, tool changes, and breaks.
2. **Load only what you need.** Read the active session's live surfaces;
   leave closed sessions untouched unless a task requires them.
3. **Process is free.** Rhythms are human-chosen, never imposed. Govern the
   output, not the process.
4. **Mitigate, don't solve.** Nudge-level defaults. A mechanic earns its
   place only when the failure is costly/frequent, cheap to check, and
   nudge-unreliable.
5. **Compose from the record, never from conversation.** Rewrites are
   grounded in journal/knowledge — the only sources that survive
   compaction.
6. **Verify before you close.** Never mark work done without evidence;
   re-read the session files and confirm consistency at close.

## Layout

- `AGENTS.md` — this file: interaction defaults + navigation
- `sessions/` — one folder per unit of work (private, gitignored)
- `rhythms/`  — your personal workflow patterns (private, gitignored)
- `archive/`  — retired material

## Session anatomy

A session folder is a unit of work and outlives individual working periods.
Each folder holds four files, each with its own mutation profile:

- `state.md`     — the live pointer: status, current anchor, next_action,
  objective, repos. Refreshed at period ends; read whole at boot.
- `plan.md`      — the current declaration: goal + steps + exit criteria.
  Edited only at re-plan moments: touch only what the re-plan changes,
  replace in place; grounded in the record; dies with the unit.
- `journal.md`   — append-only events + `@anchor` declarations. Entries are
  born with STATUS open|closed and never edited; closure is by reference —
  a fresh entry carries `SUPERSEDES/CLOSES: <ref> — reason`.
- `knowledge.md` — findings born with STATUS open|closed, carrying REF and
  SUMMARY; closure by reference, never edited. The raw material for
  grounded compositions.
- `recipes/`     — dispatch briefs (one per subagent dispatch, naming where
  the report lands). `reports/` — the lanes' evidence reports. The
  dispatch's persistence is the audit trail.

## Boot sequence

1. Locate active sessions: `grep -rl "status: ACTIVE" sessions/`.
2. Multiple? List them; ask which to continue (default: last-touched).
3. Read the session's `state.md` whole. Bump the anchor: append
   `@anchor A<N> — "one-liner"` to `journal.md`.
4. Read `plan.md`; grep the journal for the anchor map (`^@anchor`) and
   open items (`STATUS: open`).
5. Continue from `next_action`, following the human-selected rhythm.
6. No active session? Ask which unit of work to start.

## Interaction defaults

- One design question per turn; ground it before asking.
- Discuss before significant decisions; the human may interrupt anytime.
- Never claim verification you did not perform.
- Name artifacts by what they are, not by session shorthand.
- A queued message mid-act: complete the act first, then address the
  message — halt immediately only on an explicit stop, hold, or redirect.

## Subagents

This section governs every subagent dispatch.

- Every dispatch is session-persisted: the brief is a file under
  `recipes/`, naming where the report lands; the report lands under
  `reports/`; the returned message is a summary only.
- On drift, a lane never improvises: it stops and reports what it found,
  where it stands, and what drifted — pausing to ask for steering where
  possible, aborting gracefully where it is not.
- The report lands no matter how the lane ended, so a re-dispatch resumes
  from the report instead of rebuilding context from nothing.
- A lane's "passed" is never the gate: the dispatching agent re-verifies
  load-bearing claims itself.

## Period end and unit close

Period end (a turn finishes; the unit continues):

1. Append events to `journal.md`; refresh `next_action` in `state.md`.
2. Add findings to `knowledge.md` as they crystallize.
3. The folder stays ACTIVE.

Unit close (the plan completes, or the human ends the unit):

1. Append closing events and the next-move decision to `journal.md`.
2. Promote durable knowledge at the human's direction.
3. Mark the folder CLOSED. Sessions stay private — nothing is committed.

## Git discipline

Git tracks the convention — this file and other tracked material. Session
work is private and never committed: the audit trail for work is the
session journal and close summary; `git revert` is the recovery path for
the convention. Never push without explicit instruction.
