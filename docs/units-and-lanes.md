# Units and subagents

Work does not live in the conversation. It lives in a unit of work: a folder that opens when the work starts, closes when it ends, and outlives every working period and compaction that touches it. When work is handed to a subagent, the same shape repeats one level down, as a dispatch.

This page covers the container and the flow: what a unit is, what its folder holds, how its life is spent, how a boot finds it among several, and how delegated work is dispatched, traced, reported, and resumed. The artifact contracts themselves (the grammars, entry liveness, closure) belong to the record page; this page cares about how the folder is used.

## The unit

Everything you do belongs to a unit of work. You never manage them: you name what you want, and the agent finds the matching unit or bootstraps a new one, and tells you which.

A unit lives at `.contexture/units/<slug>/`; the folder name is the unit's slug, and the path is its identity. A unit an older release wrote under the deprecated `.contexture/sessions/<slug>/` still reads from there, with one warning per read, and moves whole at its next write; `ctx unit migrate --all` moves the rest, the closed units among them, which no write moves. It opens when the work starts, and it dies when the work is done, not when a chat ends. Working periods come and go, context windows come and go, the unit stays.

The unit is the context boundary. When the agent works on it, it reads that unit's files and nothing else. No rule has to say "do not read the rest": the layout bounds the load by construction. The filesystem is the index, and the folder's lifecycle bounds it.

The unit is also the memory boundary. A returning session loads that one unit, not the pile. Closed work stays on disk as history and stops loading, because a boot looks only at what is active. And because each unit carries its own record, unrelated threads stay apart: separate pieces of work do not merge into one another's context.

## The folder's anatomy

```
.contexture/units/<unit>/
  state.md       where the unit stands: status, anchor, objective, repos, mounts
  journal.md     the memory: what happened, append-only
  knowledge.md   what was settled, each with a reference
  backlog.md     the work declared ahead
  lanes/         dispatched work, one folder per subagent
```

`state.md` holds the state, the only artifact updated in place, and only through `ctx unit stamp`, `refs`, `close`, and `reopen`. It says where the unit stands: its status (ACTIVE or CLOSED), its current anchor, the objective, the repos it touches, and optional reference units (`ref_sessions`). Nothing else; detail lives behind references. The next move is not stored: it is derived from the backlog at presentation (the first IN_PROGRESS task, else the first open task, every status but DONE). The state is not a log: it gets overwritten, never appended to, so it can never become history in disguise. An agent's attention is finite, so every working period starts by reading exactly this one small file, whole.

`backlog.md` is the work declared ahead: a living queue of tasks, each with a status, an objective, references, and containers for its substantive detail. It evolves as the work teaches: a mid-stride pivot, a bug fix, or a new task inserts or appends without rewriting what stands; a task that turned out wrong or unneeded is dropped. A task completes with its evidence (`ctx unit task complete`), and the completion receipt lands in the journal in the same write.

`journal.md` is the memory: the running record of what happened. Entries land as things happen, never batched at the end, and they are never edited afterward; a revision supersedes its predecessor by reference. Each entry carries what happened, the result, and why the next step follows. The journal exists to rebuild the working context from scratch: a fresh boot loads the live entries and nothing else, and holds the position without the conversation.

`knowledge.md` holds what was settled, written at decision and discovery moments. Each finding points at the full version in the record, or carries the whole story itself when no stable version exists. Knowledge is where answers accumulate; the journal is where they were found.

`lanes/` holds delegated work, one folder per dispatch; its own section follows.

The record files share one design rule: each is written as a creation act, never as a maintenance sweep, and each write rides its command; no one edits them by hand, and under the posix driver the driver is the only code that touches them. `state.md` is refreshed as the work moves (`ctx unit stamp`, `refs`, `close`, `reopen`); `backlog.md` evolves in place as tasks move (`ctx unit task add`, `update`, `start`, `complete`, `reopen`, `drop`); `journal.md` only grows (`ctx unit record`, the receipts `task complete` and `task drop` write, the anchors `stamp` appends), which is why it survives every compaction intact; `knowledge.md` changes through `ctx unit finding` (add, update, supersede, drop).

## The unit's life

A unit lives through working periods, and four acts bracket them: boot opens a period, refresh keeps the record current inside one, close ends the period or the unit, and handoff proves the record before the context goes. The unit's own life runs from ACTIVE to CLOSED.

### Boot

The first thing the agent does in a fresh context, mechanically:

1. Read the overlays: the workspace overlay, then the local amendments. Both are tiny; where they disagree, the workspace wins.
2. Boot unconditionally. The first message of a fresh context is the move signal whatever its shape, a question as much as a task.
3. Get the field and match. Two commands list the candidates, the units and the rhythms, and the message is read against them:

   ```
   .contexture/ctx unit list
   .contexture/ctx rhythm list
   ```

   A close unit match proposes continuing that unit; no match proposes a new one. The request read against each rhythm's `use when` names the rhythm that serves it, or none.
4. Propose the move and wait. The proposal names the unit and the rhythm: a propose match is asked, an auto match is stated as applying, and no match names the default design loop. Even a message that names its unit explicitly gets the proposal stated as a confirmation. The human's reply settles the unit and the rhythm before anything loads; the human still chooses the process.
5. Run the load and keep calling until a page reads complete (read every page the map reports):

   ```bash
   .contexture/ctx unit load <unit>
   .contexture/ctx unit load refs <ref_1> ... <ref_N> [<page>]
   ```

   The map names each section and its pages: state, backlog, knowledge, the live journal, and any declared `ref_sessions` under read-only banners. The backlog section renders its DONE task blocks compactly (the task line, status, objective, description); open and statusless blocks render whole, and the file itself is never edited. The load is one subtraction: live means not closed; anchors order periods, never liveness. Knowledge loads fully; it is small, and every line is a settled decision. Reference units are consulted on demand with `load refs <ref_1> ... <ref_N>`: they stream read-only under their own banner, map, and tail, apart from the unit load.
6. Read the rhythm in force: `.contexture/ctx rhythm current <unit>` prints one line, the rhythm in force with its next gate, completed, stale, or none in force, from the unit's last stamp; `ctx rhythm show <name>` prints a confirmed rhythm's body.
7. Ground check with `git status -sb`. The working tree and the upstream delta are machine-derived facts; the unit files are claims. In a mismatch, the tree wins, and the reconciliation journals as work, never as a note.
8. Stamp the new period: the stamp moves `current_anchor` to the next anchor and appends the anchor line with the period's number and today's date (`@anchor A<N> <date>`), no receipt text: the anchor orders periods, and the git state and anything else worth keeping land as journal entries. A boot is a fresh context load, never a turn boundary; turns inside one working context journal under the standing anchor. `.contexture/ctx unit entry list <unit> --anchor=A<N>` lists the entries written in one period:

   ```bash
   .contexture/ctx unit stamp <unit>
   ```
9. Continue from the backlog's derived move (the first `IN_PROGRESS` task, else the first open task, every status but `DONE`; `ctx unit list` prints it) in the confirmed rhythm: at the next gate `ctx rhythm current` names when that rhythm is the one in force, else at its first step (`ctx rhythm show <name>`); or in the default design loop when no rhythm is confirmed. The first entry after a rhythm is confirmed carries its first stamp (`ctx unit record --rhythm`), and every stamped write prints the next gate.

New work bootstraps a unit instead of joining one: run `.contexture/ctx unit bootstrap <slug> "<objective>" [<repos>]`; the storage driver creates the unit whole (the state at A1 with its folded first anchor, an empty backlog and knowledge), and the verb prints the state and the first-task reminder; then continue at step 6.

### Refresh

The artifact sweep, shared by rhythm boundaries, close, and handoff: the events journaled, the backlog statuses advanced, the derived move read from the backlog, the harvest run over every open flag (one candidate each; a candidate that meets the bar lands in knowledge and its entry closes by reference; one that does not drops), and the journal audit run. It keeps the record current mid-flight, so nothing waits for the period end.

### Close

Two distinct ends:

- Period end (a turn ends; the unit continues): run the refresh, then close the period's resolved threads by reference. The stray audit's checklist is the open-thread tail the journal audit prints: every thread that resolved this period closes now. The journal audit must exit 0; it is a repair instrument, and what it flags is fixed before the period ends, never noted. The folder stays ACTIVE.
- Unit close (the backlog completes, or the human ends the unit): append the closing events and the next-move decision, re-read the files and confirm consistency, promote durable knowledge by the harvest bar (the agent lands what deserves knowledge and drops the rest), then mark the unit CLOSED (`ctx unit close`).

### Handoff

The proof before context death. When a context is about to die (compaction, tool change, a long break): run the period-end writes if they are not done, then verify with the bounded cold read. Run `ctx unit load <unit>` and read the map and the state page, the backlog section with its open tasks whole, the journal's tail (this period's entries), and the knowledge tail when this period landed findings; the full-body pass belongs to the next boot, a fresh context. The audit exits 0. The sweep reads the whole open list: every entry is confirmed as a live thread or a legitimate receipt, and a resolved thread missing its stamp closes here. Gaps close while the context is still full, never after compaction.

Boot is the reader; handoff is the writer's proof. Both run against the same record, from opposite sides of the context boundary.

## The field

Several units can be active at once. The field is what a boot sees: every unit whose state says ACTIVE, bytewise by unit name. Each unit renders its slug, anchor, the derived next line (the first IN_PROGRESS task, else the first open task, every status but DONE; `next: <slug> (<status>)`, or an explicit none form), and its objective. The view reads no journal, so it prints no thread count and no date.

The opening message is the primary signal; the field is the cross-check. The agent reads the message against the candidates, proposes its pick (continue this one, or bootstrap a new one), and waits for the human's word. A sweep of the folders before knowing the ask spends context on irrelevant text; matching the message first and verifying with one grep is the boot's order.

When no unit matches, the agent bootstraps one and says so. The bootstrap is minimal: the unit ACTIVE at A1, whose folded first anchor names the objective and the git state, and the first action set to declaring the work. The next stamp opens A2.

Units stay independent. Each keeps its own record; cross-references between units never merge their records, and a period that closes on one unit does not touch another. A later period simply boots on whichever unit the work points to.

## Subagents, the delegated unit

When the agent hands work to a subagent, the dispatch gets its own lane inside the unit the work belongs to, created by the dispatcher from its brief: `ctx lane create <unit> <lane>` takes the brief as flags and composes the recipe from them. A lane holds the three artifacts the dispatch needs to be self-contained: the recipe (the brief it received), the lane journal (the trace of what it did), and the report (the evidence it leaves). Under the posix driver they are the files `recipe.md`, `journal.md`, and `report.md` in the folder `lanes/<slug>/`; under another driver they live in its store; either way the lane verbs (`ctx lane show`, `record`, `report`) are the only way in.

Delegation is first-class; an orchestrating agent is the clearest example, not a special citizen: it learns from every report while its own context stays lean, and the detail never enters its window.

The memory is in the record, so nothing depends on the subagent surviving. If a subagent stalls or dies, its lane still holds the brief, the trace, and the report so far; a re-dispatch resumes from the lane, continuing from the last uncompleted task, never rebuilding from scratch. A crash costs the dispatch, not the work.

One writer per surface: the unit's main journal records the dispatch (the subagent's lane slug), and the subagent records the execution. The subagent never writes the unit's record surfaces; the dispatcher never mines the subagent journal for what the report should carry.

The lane does the containment work. It is a derived structure: write isolation, auditability, and crash resumption fall out of the lane itself, and the standard journal grammar applies inside. Nothing extra needs remembering, and `AGENTS.md` stays lean.

*In practice:* an enrichment subagent hit a harness concurrency limit and died mid-edit. A fresh instance read the action trace, verified the unjournaled edit against git, and continued without rebuilding. The seam held because the lane, not the conversation, carried the state.

## The subagent contracts

What makes subagents portable between agents is a contract: the subagent's own obligations, and what the dispatcher owes back.

### The recipe, and the subagent's boot

The recipe is the brief in the record: the dispatcher gives the brief as the flags of `ctx lane create`, the verb composes and stores the recipe, and the subagent reads it with `ctx lane show <unit> <lane> recipe`. It slices the parent's attention into exact references (entry slugs, line ranges, artifact symbols) and isolated facts one per line; broad folder dumps are forbidden. It sequences the tasks with their exit conditions and fences writes with an explicit scope. It also names the active branch/worktree the subagent works on, so the subagent knows where to edit and commit; its working root sits in the write scope. A message-brief dies at compaction; a recipe in the record survives, and that persistence is the audit trail.

Before any work, the subagent boots read-only: the overlays, the unit's state, backlog, and knowledge, the recipe, and every reference the recipe names. Its first journal entry is the load receipt: the refs loaded ride as `--ref` lines on that entry (`ctx lane record --ref`, repeatable), never one per line inside the one line `--what`. An unresolved reference is a defect in the brief; the subagent stops and reports it, never working around the gap.

### The subagent journal

The subagent journals at action granularity as things happen (`ctx lane record`), never batched to the end: every state-changing action (a file written, a command with a non-obvious result), every claim formed, every decision point taken, every drift notice. Each entry carries the action, its result, and why the next step follows. Only task receipts batch, at task completion.

The journal is the audit trail and the resumption surface. It says where the work stopped and why the next step followed, which is exactly what a fresh instance needs to continue.

### Drift and steering

A decision inside the brief is the subagent's to make, and it journals it. A wall, or a decision beyond the brief, is drift; it is never improvised past. The subagent stops and reports what it found, where it stands, and where it drifted. Where the harness supports a steering channel, the subagent pauses and asks; where it does not, it stops gracefully. Either way the report and the journal land, so a steer continues a live subagent and a re-dispatch resumes a dead one.

The contract names no channel: steering is a harness capability, and plain files are the portable part. What the convention owes is the stop, the report, and the resumable folder.

### The report

The report is the dispatcher's only window into the dispatch, landed with `ctx lane report` (the body on stdin, any size). It must be self-sufficient: the sections the recipe's `REPORT` block names, each claim carrying its grounding (a file and symbol, a command and its output, or a record reference), verbatim evidence, the structural detail the dispatcher needs to re-verify and decide, and what was skipped and what rests on inference. The dispatcher reads it whole, no exception; an unread part wears the look of review.

A subagent that cannot write its report returns the artifact verbatim: nothing before it, nothing after it, and the dispatcher persists it byte-clean.

### The brief and the composed recipe

The dispatcher never writes a recipe by hand: it gives the brief as the flags of `ctx lane create`, and the verb composes the recipe from them, so every recipe has one shape and its fixed parts are never forgotten. `ctx lane help create` names each flag with its purpose.

- Required: `--goal` (the deliverable or decision the lane feeds, and where it stops), `--branch` (the checkout or worktree and its branch, at a commit), `--writes` (read only, or the roots it edits and how it commits), at least one `--scope` (a step or question with its exit condition; the verb numbers the steps in the given order), and at least one `--report` (a section the report owes: its name and what it carries).
- Optional: `--ref` (an exact pointer the subagent reads at boot), `--task` (exactly `backlog#<slug>`), `--decision` (exactly `journal#<slug>`), `--rhythm` (`<name> <N> <GATE>`, checked by the rule `ctx unit record` checks a rhythm by), `--fact` (one isolated constraint), and `--substrate` (where code, tests, and commits land, for a worktree lane). Every value is one line.

The composed recipe reads, in the shared dialect (heads at column 0, bodies indented two spaces): the `@recipe <lane>` header with `UNIT`, `LANE`, `BRANCH`, and the given `RHYTHM`, `TASKS`, and `DECISIONS`; `GOAL`; the given `REFS`; `SCOPE`; the given `FACTS` and `SUBSTRATE`; then the blocks the verb writes itself: `BOUNDARY (hard rules)` (the `/tmp` and permission prompt rule with the lane's scratch folder, the runner rule with the rule that no background process is left running and a hung command is stopped, never abandoned, the record door: the lane journal and the report plus only what the write scope adds, the write scope, and the drift rule), `BOOT` (the law layer and both overlays, the unit load, the recipe, every reference, each task and decision read whole through `ctx unit task show` and `ctx unit entry show`, since the load carries only the live journal and the open tasks whole, so a closed decision or a done task's criteria still reach the lane, and the load receipt), `JOURNAL`, and `REPORT` (`@report <lane>`, the `VERDICT` line, the `--report` sections in order, and the line that the report and the journal land whatever the outcome). A workspace or personal rule (an install rule, a writing rule) rides `--fact` or `--writes`.

On success the verb prints the dispatch prompt, the launch message the harness hands the subagent, in three lines: the recipe read, the boundary, runner, and background process rules, and the summary only return. The prompt is never stored; a re-dispatch of an existing lane fills `<unit>` and `<lane>` in the template `ctx lane help create` prints. The verb never reads stdin, so a script that pipes a recipe meets the one line refusal naming the five required flags.

The report is the one document the subagent writes whole: the lane verbs store and return it raw, its sections are the ones the recipe's `REPORT` block names, and every claim carries its grounding.

### Dispatch discipline

- The dispatcher reads the report, never the subagent journal. A thin report triggers a re-dispatch, never journal-mining.
- The dispatcher never runs raw exploration. A lookup with unbounded output whose target it does not already hold (a grep, a find, a read to locate, a record sweep through `ctx unit search`, a census, an earlier recipe read to learn how to brief) runs in a lane and comes back as a report, so the exploration never fills the dispatcher's context with what it did not need. The docs map is the dispatcher's own read and is never delegated: the index, an owning doc, and a ranked, capped `ctx docs query` exist to give it the whole picture compactly, so docs-first stays wholly its own. Its other own reads are named targets (the boot, `ctx unit task show`, `entry show`, `resolve`, `ctx lane show`) and the re-run of a command a report names. Where the harness cannot dispatch a subagent, the agent explores in place.
- A subagent's "passed" is never the gate. The dispatcher re-verifies the load-bearing claims by re-running the commands the report names. *In practice:* a subagent reports that nothing uses a field; the dispatcher re-runs the report's own command and sees it return nothing, but the command searched one spelling, so the doubt goes to a fresh lane, which searches case-insensitively with every separator spelling and finds the field in use. The absence claim dies; the fresh lane's search was the gate.
- Subagents run in the background: the turn ends at launch, and the conversation never blocks on a subagent.
- Parallel subagents are only for independent domains. Shared state or ordering means sequential, however tempting the fan-out.

And every dispatch is journaled in the unit's main journal: an entry carrying the subagent's lane slug.
