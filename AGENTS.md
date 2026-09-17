# contexture v0.43.0: the shared base; workspaces overlay it via AGENTS.workspace.md, never edit this file
@laws
  source-of-truth: session files = ONLY source of truth; never conversation. files survive compaction, tool change, break; conversation does not.
  load-only-needed: load only what you need: the active session's live surfaces; closed sessions untouched unless the task needs them.
  writer-holds-volume: the schema holds the shape, the writer holds the volume: guidance names what deserves the record, never how much; token efficiency is the dialect, never a cap on content; omit ornament, never substance.
  process-free: process is free: rhythms human-chosen, never imposed; govern OUTPUT, not process.
  compose-from-record: compose from the record, never from conversation: rewrites grounded in journal/knowledge.
  verify-before-close: verify before close: no done without evidence; never claim verification you did not perform; re-read the files, confirm consistency.
  harvest-the-human: harvest the human: question to surface durable knowledge; crystallize into compact candidates; land with approval; land when deserved, never just to record; developing ideas stay in the journal.
  workspace-confinement: the current workspace (the repo/worktree the agent was started in) is the boundary; never read, write, search, or otherwise reach outside it unless the human specifically asks for that act; an apparent outside need stops and asks: the agent never roams; the harness's saved copy of a command's own truncated output is the agent's own output, sanctioned to read, read-only, the named file alone; the temp-file routing stays unsanctioned.

@layout
  AGENTS.md       = laws + navigation (this file)
  AGENTS.workspace.md = the workspace's shared overlay, tracked: @replace | @append per section; survives every sync untouched; wins over local
  AGENTS.local.md = your amendments; amend, never contradict: the laws stand; survives every sync untouched
  .contexture/ONBOARDING.md   = agentic adoption guideline: instructions for agents onboarding contexture into a repository; deleted when the adoption closes
  .contexture/templates/      = artifact grammars: the shapes to fill at write time
  .contexture/scripts/        = the session.sh entry point (run .contexture/scripts/session.sh help; --help and -h are the same table) over the awk workers (active, bootstrap, load, stamp, record, board, audit, index, query)
  .contexture/sessions/       = one folder per unit of work
  .contexture/rhythms/        = workflow patterns; the contract and the default live in @rhythms

@record
  unit of work = session folder; outlives working periods, dies with the unit. shapes live in .contexture/templates/; every artifact is written by filling its grammar directly, the template in hand is the complete shape; this section: the map: what each artifact records and why; the workflows live in their sections.
  dialect: typed blocks at column 0, bodies indent 2; :: opens a block scalar; | means alternation only; [ ] wraps optional parts in value examples, never around field names; -> means flow; # starts a comment. lowercase keys on the state (status: ACTIVE); spellings are contractual; laws are slug-addressed: `slug: statement`, referenced @laws#<slug>; slugs are unique across the merged base + overlays.
  references: a pointer names its target exactly: the section and step (@refresh), or path#symbol (journal.md#slug); a vague prose mention is a defect
  folder status = unit lifecycle (status: ACTIVE | CLOSED); journal entries and findings carry no status: closure and supersession by reference only.
  the state    = live pointer: where the unit stands and what happens next; the only file edited freely; read WHOLE at boot; terse by design, the map, not the content: detail lives behind refs; optional ref_sessions declares read-only sessions mounted at boot; refreshed as the work moves via session.sh stamp, next, refs, close (every backlog update, task landing, period end).
  the backlog  = the current declaration: actionable tasks (objective + status + description + acceptance criteria + implementation details + refs); the workflow in @backlog; written via session.sh append, amend, flip, drop.
  the journal  = the single recording surface: append-only events + @anchor declarations; the workflow in @journal; written via session.sh append, stamp.
  knowledge    = settled findings: what is true, what was decided and why, what was ruled out; an intent to act takes the @task shape in the backlog (session.sh append), a developing idea stays a journal event; REF -> the full version in append-only artifacts: relative path#symbol (journal.md#entry, lanes/x/report.md#claim), never a dynamic file; no REF, no story = hypothesis, never base a task on it; claims outlive their anchors, unlike journal entries; every finding lands via the harvest (@refresh).
  lanes/       = dispatch units, one folder per subagent (the record's older name for it is lane: the folder keeps that name): recipe.md (brief) + journal.md (incremental trace) + report.md (evidence); re-dispatch resumes from the folder; the contract in @subagents.

@journal
  why :: the journal rebuilds the working context from scratch: a fresh boot loads the active entries (live = not closed) and nothing else; what that reconstruction needs is what deserves an entry; the importance bar is the reader who comes back with only the files
  dialect :: the token-efficient form preserves the context window while minimizing info loss; the compression makes completeness cheap; record fully, without worry; the dialect serves the pour, never caps it
  formation :: an event lands when it happens, never batched at period end; interaction beats journal as they happen (@interact); work beats never wait for an interaction beat
  substance :: an entry carries what happened, the result, and why the next step follows
  folding :: entries may fold into a comprehensive digest at a human-called chapter turn: one entry carrying its chapter's synthesis and its decision sets whole, written for a reader with no prior context; the digest's CLOSES fold the originals by reference and stand as the fetch map; folded entries leave the load, never the file
  liveness :: entries are append-only, never edited; an entry closes only when a later CLOSES/SUPERSEDES names it; every closer carries a verdict word: done | superseded | dropped | folded, then the reason; the closer's WHAT carries the resolution: a close without a statement is a lie; chase every closer in the same breath it resolves
  reading :: a summary or a folded digest is an entry point, never the whole story: the refs and closers name the detail, and the entries behind them stay in the file; when a summary leaves a question open, fetch the original by its slug (session.sh query entry <unit> <slug>): fetching is the reader's judgement, one line away
  markings :: THREAD: <what it awaits> = the unit awaits an act outside its own flow (the human's response, a dispatched subagent's report, another unit's act); required on every session entry, none when nothing outside acts; stamped at birth, never flipped; the resolving entry closes it same-breath. THREAD: none = receipt: the final word on a completed fact, no closer obligation; the agent's own executions (the state and the board carry them) and the harvest (the audit's KNOWLEDGE check carries it) are not threads. KNOWLEDGE: true = the harvest's input. GROUP: <token> = the agent's topic thread, chosen in the conversation, stable within the unit. RHYTHM: <name> <N> <GATE> = the process in force, stamped on the entries that advance the rhythm; a stamp, never updated. REF: "path#symbol" = grounding. an entry uses the fields it needs; unused fields are omitted, never bracketed.
  anchors :: @anchor lines are period ordering + load receipts, never liveness: no entry loads or skips by its anchor; a thread paused stays open: an open tail in the boot load is the reminder; resume = fresh entries + a next_action ref, never a fake close

@backlog
  the backlog is the current declaration of work, written to be executed from no matter when the agent looks; a living queue: tasks advance, update, and drop as the work teaches; the journal holds the history
  declaration: the task is where intent survives the conversation; an intent to act is a task even when rough (readiness comes at activation); a worthless one costs a line, a missing one is unrecoverable. when unsure, declare; when the need dissolves, drop it
  the schema guides the task shape: @task <slug> with STATUS (TODO | IN_PROGRESS | DONE), OBJECTIVE, REFS, DESCRIPTION ::, ACCEPTANCE CRITERIA ::, IMPLEMENTATION DETAILS ::; the writer holds the volume
  evolution: tasks can be added, updated, reordered, or dropped; mid-stride pivots insert a new task without rewriting the standing ones
  dedicated containers: DESCRIPTION carries context and scope, ACCEPTANCE CRITERIA carries checkable done-conditions, IMPLEMENTATION DETAILS carries the specification and the execution blueprint: the requirements and decisions the change must honor, and how it lands; omit ornament, never substance
  REFS names its targets exactly (path#symbol): journal items (journal.md#slug), subagent reports (lanes/x/report.md#claim), knowledge findings (knowledge.md#NAME), or an artifact (file#symbol); the spec stands alone: a ref navigates, it never substitutes for the meaning
  compose from the record (@laws#compose-from-record): material living only in the conversation lands in the record first, then the task references it
  readiness: a task marked IN_PROGRESS is executable as written; every needed decision lives in the task or behind a REF
  activation: before IN_PROGRESS, the executor scans the task: placeholders, checkable criteria, resolving REFs; a failing task returns, never execute around a gap
  no placeholders: TBD, "similar to <task>", "as appropriate" mean the task is not ready
  task progress: active work marks STATUS: IN_PROGRESS; completion marks STATUS: DONE and lands a journal event "backlog/<slug>: DONE" carrying its evidence: the command run and its observed result; the backlog updates in place as tasks move; newly discovered work appends or inserts as a fresh @task
  unit completion: all tasks reach STATUS: DONE and unit exit criteria are met; completion + the next move land in the journal

@query
  surfaces: the journal + knowledge.
  journal:   live = not closed: the load list = every entry whose slug no CLOSES/SUPERSEDES names, whole file, all anchors. anchors are period ordering + load receipts, never liveness. .contexture/scripts/session.sh board streams active entries with complete bodies in one shot, then the open threads with their targets and the open task slugs with their nudge; no per-entry Read tool loops, no range spanning.
    command:
      .contexture/scripts/session.sh board <unit>
  thread tail: session.sh audit prints open THREAD entries beside the audit; the frequent stray check; receipts never enter it.
  knowledge: loads fully (small; every line a decision); supersession via SUPERSEDES (successor).
  queries: the named looks over the record; never an improvised grep: .contexture/scripts/session.sh query <kind> ... (the kinds and forms in .contexture/scripts/session.sh help; --help and -h are the same table); a miss is rc=1 with a named error, never an empty success.
  cross-repo: .contexture/scripts/session.sh query units <repo>: units touching a repo; objective is human-facing only.
  cross-session: .contexture/scripts/session.sh query refs-to <session>: units referencing a session.
  group: .contexture/scripts/session.sh query group <unit> <token> = the agent's topic thread across anchors, open or closed; resume runs through next_action's ref, never through the group alone.
  artifact-grounding: a report or recipe claimed to ground work needs a REF in the loaded record; ls shows what exists, the record says what grounds the work

@boot
  1. read AGENTS.workspace.md (the shared overlay) then AGENTS.local.md (tiny personal amendments) if present; then run .contexture/scripts/session.sh help (--help and -h are the same table: the command contracts); may amend this order; an overlay address names a base section: replaced or appended; where workspace and local conflict, the workspace wins
  2. boot is unconditional at a fresh context: the first message is the move signal whatever its shape: a boot request, a task dump, a question; nothing loads and nothing works before the boot reads it
  3. get the field: .contexture/scripts/session.sh active; read the message against the candidates: a close match proposes continuing that unit, no match proposes bootstrapping a new one
  4. propose the move and wait for the answer before anything works: the message naming its unit explicitly still gets the proposal stated as a confirmation; the human's reply settles the unit: an active unit continues at 5, a new unit bootstraps at 10
  5. run .contexture/scripts/session.sh load <unit>; keep calling until a page reads complete; read every page the map reports (state, backlog, knowledge, the live journal, ref sessions read-only)
  6. read the rhythm index: .contexture/scripts/session.sh index
  7. ground check: git status -sb; the working tree and the upstream delta are facts the record must carry: uncommitted changes and unpushed commits reconcile before work continues; git wins over the record; a mismatch journals as work, never as a note
  8. stamp the load receipt: .contexture/scripts/session.sh stamp <unit> "<the loaded set + ref_sessions + the git state>" (a boot is a fresh context load, never a turn boundary; turns inside one working context journal under the standing anchor)
  9. continue from next_action, following the invoked rhythm, the matching rhythm on its trigger, or the default (@rhythms)
  10. new work: run .contexture/scripts/session.sh bootstrap <slug> "<objective>" [<repos>]; declare the first task; continue at 6

@interact
  :: ask -> restate -> confirm -> act -> surface -> ask
  ask:      grounded question, one at a time; answer opens next; until intent, constraints, and approach are settled
  restate:  goal + intended approach, your words; where approaches diverge, name the tradeoff
  confirm:  human: go | ask; may interrupt anytime; never skipped, however small
  act:      work the chosen rhythm's steps (default: the design loop, @rhythms); mid-act message: finish the act first, then address; halt ONLY on stop, hold, redirect, or a discovery that outgrew the confirmed intent (stop, say so, back to confirm)
  surface:  durable output, named by what it is
  surface -> ask
  artifacts: stay current in the same breath as the work: journal at the event (see @journal), backlog as work is declared and tasks move (see @backlog), state as position changes (see @record), knowledge verdicts flagged as they settle (see @refresh); nothing waits for the period end; shapes live in @record and .contexture/templates/

@rhythms
  contract :: names order + outcomes; references artifacts by name, never re-specifies grammars, never prescribes content; artifact dialect; one line per step `N. GATE: outcome`; human-invoked or agent-selected on its trigger; never in state, its presence stamped on the advancing entries, never maintained; replaces task progression only: artifact invariants (@record, @laws) hold across every rhythm. a gate closes by its artifact: DECIDE by the backlog, VERIFY/LAND by the completion receipt carrying its evidence, REFRESH by the harvest; a gate closed by memory is debt.
  trigger :: a rhythm opens with `use when: <the situations it serves>`: triggers only, never a workflow summary: a summary becomes the shortcut agents follow instead of the steps
  activation :: `activation: propose | auto`; propose is the default: the agent proposes the matching rhythm before applying it and the human confirms; auto is the team's explicit opt-in: the agent applies the rhythm on trigger without a separate ask; the acts still pass the @interact gates
  placement :: the per-turn surfaces carry interaction rules only; work patterns are rhythm material: extracted from the instruction stack at onboarding, proposed as they emerge
  default :: the design loop, when no rhythm is invoked; human rhythm replaces progression
  1. DISCUSS: explore problem space; grounded questions resolve intent
  2. DECIDE: human verdict settles; triggers harvest candidate
  3. BACKLOG: intent updates the backlog (session.sh append); the pointer moves via session.sh next
  4. EXECUTE: work active task; drift updates backlog in same breath
  5. VERIFY: task acceptance criteria proven; journal records completion, next_action advances
  6. REFRESH: run @refresh

@subagents
  dispatch: a step that names a subagent runs as a dispatched subagent: its own context, its own folder, its own report
  every dispatch:
  - brief = recipe.md in lanes/<slug>/; slices parent context (exact refs: journal#entry, knowledge#finding, file#symbol/lines; FACTS one per line); broad folder dumps forbidden; names the active branch/worktree
  - subagent boot, read-only, before any work: the overlays, state.md, backlog.md, knowledge.md, the recipe, and every REF it names; session surfaces are never subagent-written
  - the subagent's first journal entry is the load receipt: refs loaded, one per line; an unresolved REF is a brief defect: pause-ask for steering where the harness supports it, else stop and report it, never work around the gap
  - subagent journals at action granularity in journal.md as things happen, never batched to the end: every state-changing action (a file written, a command run with a non-obvious result), claim formed, decision point taken, and drift notice lands as a WHAT carrying action + result + why-next; only task receipts batch, at task completion; an entry awaiting an act outside the subagent (the dispatcher's read, the human, another subagent) carries THREAD: <what it awaits>; the journal is the audit trail and the resumption surface
  - report -> report.md; return = summary ONLY
  - the dispatcher reads the report, never the subagent journal: the report is the only window and must be self-sufficient; a thin report triggers re-dispatch, never journal-mining
  - background: the turn ends at launch; never block the conversation on a subagent; parallel subagents only for independent domains: shared state or ordering means sequential
  - drift: a decision within the brief is the subagent's; it decides and journals it; a wall or a decision beyond the brief is drift, never improvised past; pause and ask for steering where the harness supports it, else stop, report found | standing | drifted, abort gracefully
  - report and journal land NO MATTER the outcome: the action trace is the exact stopping point, so a steer continues live and a re-dispatch resumes from the folder, never rebuilds
  - a subagent that cannot write its report returns the artifact verbatim; dispatcher persists byte-clean
  - a subagent's "passed" is NEVER the gate; dispatcher re-verifies load-bearing claims
  - read the report WHOLE, no exception; an unread part wears the look of review
  - journal every dispatch: the subagent's folder path

@refresh
  the artifact sweep, shared by rhythm boundaries, @close, and @handoff: the board read (its open-thread and open-task lists are the status checklist), the events journaled, backlog statuses advanced, next_action refreshed (one terse pointer, overwritten never prepended; the WHY rebuilds from open items + GROUNDED IN + live findings), the harvest run: every open flag, one candidate each; confirmed candidates land in knowledge via session.sh append (REF to the full version, or the whole story carried) and the entry closes by reference; "not landed" drops; session.sh audit run, what it flags fixed; beyond the harvest, nothing closes here

@close
  period end (turn ends; unit continues):
    1. refresh (@refresh): the harvest runs inside it; then close the period's done events by reference
    2. stray audit: the thread tail printed by session.sh audit is the checklist: every open THREAD that resolved this period closes now, same breath, verdict word + resolution in the WHAT; receipts never close here: they fold only at a human-called chapter turn or at unit close
    3. session audit: .contexture/scripts/session.sh audit <unit> must exit 0; it flags the broken entries (dangling or slugless closers, dateless slugs, inline markers, unharvested KNOWLEDGE flags, STATUS: DONE tasks without their backlog/<slug>: DONE event, STATUS: IN_PROGRESS tasks absent from the state) with line numbers; the audit is a repair instrument: fix what it flags and fill what is missing before the period ends, never a note
    4. folder stays ACTIVE
  unit close (backlog completes, or the human ends the unit):
    1. append closing events + next-move decision
    2. re-read; confirm consistency (@laws#verify-before-close)
    3. promote durable knowledge at the human's direction
    4. mark CLOSED

@handoff
  compaction or clearing near (any moment, mid-period):
    1. run the period-end writes (@close 1-3) if not done
    2. verify with the bounded cold read: run .contexture/scripts/session.sh load <unit> and read the map and the state page, the backlog section with its open tasks whole, the journal's tail (this period's entries), and the knowledge tail when this period landed findings; then .contexture/scripts/session.sh audit <unit> exits 0; the full-body pass belongs to the next boot, a fresh context, never the edge; while the context is still full, improve the quality and fix what was missed; the gaps close now, never after compaction; a dangling closer = handoff failure; the sweep reads the whole open list: every open entry confirmed thread or receipt, a resolved thread hiding unmarked closes here: the net for a forgotten stamp
  the handoff writes the record, not working memory.

@git
  the gitignore strategy is decided per topology and team choice at onboarding; parent workspaces deny by default and whitelist shared files explicitly (AGENTS.md, AGENTS.workspace.md, README.md, .contexture/).

@update
  the base evolves upstream: fetch https://github.com/ahmetegesel/contexture.git and follow its README's update guidance
