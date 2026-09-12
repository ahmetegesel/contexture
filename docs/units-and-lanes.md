# Units and lanes

Work does not live in the conversation. It lives in a unit of work: a folder that opens when the work starts, closes when it ends, and outlives every working period and compaction that touches it. When work is handed to a subagent, the same shape repeats one level down, as a lane.

This page covers the container and the flow: what a unit is, what its folder holds, how its life is spent, how a boot finds it among several, and how delegated work is dispatched, traced, reported, and resumed. The artifact contracts themselves (the grammars, entry liveness, closure) belong to the record page; this page cares about how the folder is used.

## The unit

Everything you do belongs to a unit of work. You never manage them: you name what you want, and the agent finds the matching unit or bootstraps a new one, and tells you which.

A unit lives at `.contexture/sessions/<slug>/`; the folder name is the unit's slug, and the path is its identity. It opens when the work starts, and it dies when the work is done, not when a chat ends. Working periods come and go, context windows come and go, the unit stays.

The unit is the context boundary. When the agent works on it, it reads that unit's files and nothing else. No rule has to say "do not read the rest": the layout bounds the load by construction. The filesystem is the index, and the folder's lifecycle bounds it.

The unit is also the memory boundary. A returning session loads that one unit, not the pile. Closed work stays on disk as history and stops loading, because a boot looks only at what is active. And because each unit carries its own record, unrelated threads stay apart: separate pieces of work do not merge into one another's context.

## The folder's anatomy

```
.contexture/sessions/<unit>/
  state.md       the pointer: where the work stands
  journal.md     the memory: what happened, append-only
  knowledge.md   what was settled, each with a reference
  backlog.md     the work declared ahead
  lanes/         dispatched work, one folder per lane
```

`state.md` is the only file edited freely. It says where the unit stands: its status (ACTIVE or CLOSED), its current anchor, the one next action, the objective, and the repos it touches. Nothing else; detail lives behind references. It is a pointer, not a log: it gets overwritten, never appended to, so it can never become history in disguise. An agent's attention is finite, so every working period starts by reading exactly this one small file, whole.

`backlog.md` is the work declared ahead: a living queue of tasks, each with a status, an objective, references, and containers for its substantive detail. It evolves non-destructively: a mid-stride pivot, a bug fix, or a new task inserts or appends without rewriting what is uncompleted. A task completes with its evidence, and the completion lands in the journal in the same breath.

`journal.md` is the memory: the running record of what happened. Entries land as things happen, never batched at the end, and they are never edited afterward; a revision supersedes its predecessor by reference. Each entry carries what happened, the result, and why the next step follows. The journal exists to rebuild the working context from scratch: a fresh boot loads the live entries and nothing else, and holds the position without the conversation.

`knowledge.md` holds what was settled, written at decision and discovery moments. Each finding points at the full version in the record, or carries the whole story itself when no stable version exists. Knowledge is where answers accumulate; the journal is where they were found.

`lanes/` holds delegated work, one folder per dispatch; its own section follows.

The record files share one design rule: each is written as a creation act, never as a maintenance sweep. `state.md` is the pointer, rewritten as the work moves; `backlog.md` evolves in place as tasks move; `journal.md` and `knowledge.md` only grow, which is why they survive every compaction intact.

## The unit's life

A unit lives through working periods, and four acts bracket them: boot opens a period, refresh keeps the record current inside one, close ends the period or the unit, and handoff proves the record before the context goes. The unit's own life runs from ACTIVE to CLOSED.

### Boot

The first thing the agent does in a fresh context, mechanically:

1. Read the overlays: the workspace overlay, then the local amendments. Both are tiny; where they disagree, the workspace wins.
2. Boot unconditionally. The first message of a fresh context is the move signal whatever its shape, a question as much as a task.
3. Get the field and match. One grep lists the candidates, and the message is read against them:

   ```
   grep -rl "status: ACTIVE" .contexture/sessions/*/state.md
   ```

   A close match proposes continuing that unit; no match proposes a new one.
4. Propose the move and wait. Even a message that names its unit explicitly gets the proposal stated as a confirmation. The human's reply settles the unit before anything loads.
5. Read `state.md` whole and bump the anchor counter. A boot is a fresh context load, never a turn boundary; turns inside one working context journal under the standing anchor.
6. Read the backlog, run the rhythm index, and load the live journal. The load is one subtraction: live means not closed. Anchors order periods and receipt loads; they never decide liveness. The script streams the live entries' bodies whole in one shot:

   ```
   awk -f .contexture/scripts/journal-active.awk \
     .contexture/sessions/<unit>/journal.md .contexture/sessions/<unit>/journal.md
   ```

   Knowledge loads fully; it is small, and every line is a settled decision.
7. Ground check with `git status -sb`. The working tree and the upstream delta are machine-derived facts; the session files are claims. In a mismatch, the tree wins, and the reconciliation journals as work, never as a note.
8. Stamp the load receipt: an anchor line naming the loaded set and the git state. `grep "^@anchor"` reconstructs the map of periods and their receipts.
9. Continue from `next_action`, following the invoked rhythm, the matching rhythm on its trigger, or the default loop.

New work bootstraps a unit instead of joining one: the agent creates `state.md` with `status: ACTIVE`, `current_anchor: A0`, and `next_action: "backlog the first task"`, then continues at step 5; the first boot stamps A1.

### Refresh

The artifact sweep, shared by rhythm boundaries, close, and handoff: the events journaled, the backlog statuses advanced, `next_action` refreshed in state (one terse pointer, overwritten never prepended), the harvest run over every open flag (one candidate each; confirmed candidates land in knowledge and their entries close by reference), and the journal audit run. It keeps the record current mid-flight, so nothing waits for the period end.

### Close

Two distinct ends:

- Period end (a turn ends; the unit continues): run the refresh, then close the period's resolved threads by reference. The stray audit's checklist is the open-thread tail the journal audit prints: every thread that resolved this period closes now. The journal audit must exit 0; it is a repair instrument, and what it flags is fixed before the period ends, never noted. The folder stays ACTIVE.
- Unit close (the backlog completes, or the human ends the unit): append the closing events and the next-move decision, re-read the files and confirm consistency, promote durable knowledge at the human's direction, then mark the unit CLOSED.

### Handoff

The proof before context death. When a context is about to die (compaction, tool change, a long break): run the period-end writes if they are not done, then verify with the cold read. Run the active stream and read it as a fresh boot would; the record must reconstruct the position without the conversation. The audit exits 0. The sweep reads the whole open list: every entry is confirmed as a live thread or a legitimate receipt, and a resolved thread missing its stamp closes here. Gaps close while the context is still full, never after compaction.

Boot is the reader; handoff is the writer's proof. Both run against the same record, from opposite sides of the context boundary.

## The field

Several units can be active at once. The field is what a boot sees: every unit whose state says ACTIVE.

The opening message is the primary signal; the field is the cross-check. The agent reads the message against the candidates, proposes its pick (continue this one, or bootstrap a new one), and waits for the human's word. A sweep of the folders before knowing the ask spends context on irrelevant text; matching the message first and verifying with one grep is the boot's order.

When no unit matches, the agent bootstraps one and says so. The bootstrap is minimal: a state file with the unit ACTIVE, its anchor counter at zero, and the first action set to declaring the work. The first boot stamps A1.

Units stay independent. Each keeps its own record; cross-references between units never merge their records, and a period that closes on one unit does not touch another. A later period simply boots on whichever unit the work points to.

## Lanes, the delegated unit

When the agent hands work to a subagent, the dispatch gets its own unit folder: a lane at `lanes/<slug>/`, inside the unit the work belongs to. Inside are the three files the dispatch needs to be self-contained: `recipe.md` (the brief it received), `journal.md` (the trace of what it did), and `report.md` (the evidence it leaves).

Delegation is first-class; an orchestrating agent is the clearest example, not a special citizen: it learns from every report while its own context stays lean, and the detail never enters its window.

The memory is physical, so nothing depends on the subagent surviving. If a lane stalls or dies, its folder still holds the brief, the trace, and the report so far; a re-dispatch resumes from the folder, continuing from the last uncompleted task, never rebuilding from scratch. A crash costs the dispatch, not the work.

One writer per surface: the session journal records the dispatch (the lane folder path), and the lane records the execution. The lane never writes session surfaces; the dispatcher never mines the lane journal for what the report should carry.

The lane's folder layout does the containment work. It is a derived structure: write isolation, auditability, and crash resumption fall out of the folder itself, and the standard journal grammar applies inside. Nothing extra needs remembering, and `AGENTS.md` stays lean.

*In practice:* an enrichment lane hit a harness concurrency limit and died mid-edit. A fresh instance read the action trace, verified the unjournaled edit against git, and continued without rebuilding. The seam held because the folder, not the conversation, carried the state.

## The lane contracts

What makes lanes portable between agents is a contract: the lane's own obligations, and what the dispatcher owes back.

### The recipe, and the lane's boot

The recipe is the brief on disk. It slices the parent's attention into exact references (entry slugs, line ranges, artifact symbols) and isolated facts one per line; broad folder dumps are forbidden. It sequences the tasks with their exit conditions and fences writes with an explicit scope. A message-brief dies at compaction; a recipe on disk survives, and that persistence is the audit trail.

Before any work, the lane boots read-only: the overlays, the unit's state, backlog, and knowledge, the recipe, and every reference the recipe names. Its first journal entry is the load receipt: the refs loaded, one per line. An unresolved reference is a defect in the brief; the lane stops and reports it, never working around the gap.

### The lane journal

The lane journals at action granularity as things happen, never batched to the end: every state-changing action (a file written, a command with a non-obvious result), every claim formed, every decision point taken, every drift notice. Each entry carries the action, its result, and why the next step follows. Only task receipts batch, at task completion.

The journal is the audit trail and the resumption surface. It says where the work stopped and why the next step followed, which is exactly what a fresh instance needs to continue.

### Drift and steering

A decision inside the brief is the lane's to make, and it journals it. A wall, or a decision beyond the brief, is drift; it is never improvised past. The lane stops and reports what it found, where it stands, and where it drifted. Where the harness supports a steering channel, the lane pauses and asks; where it does not, it stops gracefully. Either way the report and the journal land, so a steer continues a live lane and a re-dispatch resumes a dead one.

The contract names no channel: steering is a harness capability, and plain files are the portable part. What the convention owes is the stop, the report, and the resumable folder.

### The report

The report is the dispatcher's only window into the dispatch. It must be self-sufficient: an orientation block that mirrors the recipe's tasks with their proven exit conditions, claims each carrying an epistemic mark (VERIFIED, INFERRED, or ABSENT), verbatim evidence, and the structural detail the dispatcher needs to re-verify and decide, and typed risks naming what was skipped and what rests on inference. The dispatcher reads it whole, no exception; an unread part wears the look of review.

A lane that cannot write its report returns the artifact verbatim: nothing before it, nothing after it, and the dispatcher persists it byte-clean.

### Dispatch discipline

- The dispatcher reads the report, never the lane journal. A thin report triggers a re-dispatch, never journal-mining.
- A lane's "passed" is never the gate. The dispatcher re-verifies the load-bearing claims itself. *In practice:* a lane reports that nothing uses a field; the dispatcher re-runs the search, case-insensitively, with every separator spelling, and finds the field in use. The absence claim dies; the fresh search was the gate.
- Lanes run in the background: the turn ends at launch, and the conversation never blocks on a lane.
- Parallel lanes are only for independent domains. Shared state or ordering means sequential, however tempting the fan-out.

And every dispatch is journaled in the session journal: an entry carrying the lane folder path.
