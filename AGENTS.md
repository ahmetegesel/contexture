# contexture v0.29.3: the shared base; workspaces overlay it via AGENTS.workspace.md, never edit this file
@laws
  source-of-truth: session files = ONLY source of truth; never conversation. files survive compaction, tool change, break; conversation does not.
  load-only-needed: load only what you need: the active session's live surfaces; closed sessions untouched unless the task needs them.
  writer-holds-volume: the schema holds the shape, the writer holds the volume: guidance names what deserves the record, never how much; token efficiency is the dialect, never a cap on content; omit ornament, never substance.
  process-free: process is free: rhythms human-chosen, never imposed; govern OUTPUT, not process.
  compose-from-record: compose from the record, never from conversation: rewrites grounded in journal/knowledge.
  verify-before-close: verify before close: no done without evidence; never claim verification you did not perform; re-read the files, confirm consistency.
  harvest-the-human: harvest the human: question to surface durable knowledge; crystallize into compact candidates; land with approval; land when deserved, never just to record; developing ideas stay in the journal.
  workspace-confinement: the current workspace (the repo/worktree the agent was started in) is the boundary; never read, write, search, or otherwise reach outside it unless the human specifically asks for that act; an apparent outside need stops and asks: the agent never roams.

@layout
  AGENTS.md       = laws + navigation (this file)
  AGENTS.workspace.md = the workspace's shared overlay, tracked: @replace | @append per section; survives every sync untouched; wins over local
  AGENTS.local.md = your amendments; amend, never contradict: the laws stand; survives every sync untouched
  .contexture/ONBOARDING.md   = agentic adoption guideline: instructions for agents onboarding contexture into a repository; deleted when the adoption closes
  .contexture/templates/      = artifact grammars: the shapes to fill at write time
  .contexture/scripts/        = cross-platform awk queries (journal extraction, journal audit)
  .contexture/sessions/       = one folder per unit of work
  .contexture/rhythms/        = workflow patterns; the contract and the default live in @rhythms

@record
  unit of work = session folder; outlives working periods, dies with the unit. shapes live in .contexture/templates/; every artifact is written by filling its grammar directly, the template in hand is the complete shape; this section: the map: what each artifact records and why; the workflows live in their sections.
  dialect: typed blocks at column 0, bodies indent 2; :: opens a block scalar; | means alternation only; [ ] wraps optional parts in value examples, never around field names; -> means flow; # starts a comment. lowercase keys on state.md (status: ACTIVE); spellings are contractual; laws are slug-addressed: `slug: statement`, referenced @laws#<slug>; slugs are unique across the merged base + overlays.
  references: a pointer names its target exactly: the section and step (@refresh), or path#symbol (journal.md#slug); a vague prose mention is a defect
  folder status = unit lifecycle (status: ACTIVE | CLOSED); journal entries and findings carry no status: closure and supersession by reference only.
  state.md     = live pointer: where the unit stands and what happens next; the only file edited freely; read WHOLE at boot; terse by design, the map, not the content: detail lives behind refs; refreshed as the work moves (every backlog update, task landing, period end).
  backlog.md   = the current declaration: actionable tasks (objective + status + description + acceptance criteria + implementation details + refs); the workflow in @backlog.
  journal.md   = the single recording surface: append-only events + @anchor declarations; the workflow in @journal.
  knowledge.md = settled findings at decision/discovery moments, statusless; REF -> the full version in append-only artifacts: relative path#symbol (journal.md#entry, lanes/x/report.md#claim), never a dynamic file; no REF, no story = hypothesis, never base a task on it; claims outlive their anchors, unlike journal entries; every finding lands via the harvest (@refresh); developing ideas stay journal events.
  lanes/       = dispatch units, one folder per lane: recipe.md (brief) + journal.md (incremental trace) + report.md (evidence); re-dispatch resumes from the folder; the contract in @subagents.

@journal
  why :: the journal rebuilds the working context from scratch: a fresh boot loads the active entries (live = not closed) and nothing else; what that reconstruction needs is what deserves an entry; the importance bar is the reader who comes back with only the files
  dialect :: the token-efficient form preserves the context window while minimizing info loss; the compression makes completeness cheap; record fully, without worry; the dialect serves the pour, never caps it
  formation :: an event lands when it happens, never batched at period end; interaction beats journal as they happen (@interact); work beats never wait for an interaction beat
  substance :: an entry carries what happened, the result, and why the next step follows
  liveness :: entries are append-only, never edited; an entry closes only when a later CLOSES/SUPERSEDES names it; every closer carries a verdict word: done | superseded | dropped | folded, then the reason; the closer's WHAT carries the resolution: a close without a statement is a lie; chase every closer in the same breath it resolves
  markings :: THREAD: true awaits resolution: a verdict, an execution, a dispatch report, the harvest (@refresh); stamped at birth, never flipped; closes same-breath at resolution. unmarked = receipt: the final word on a completed fact, no closer obligation, folded only at a human-called chapter turn or at unit close. KNOWLEDGE: true = the harvest's input. GROUP: <token> = the agent's topic thread, chosen in the conversation, stable within the unit. REF: "path#symbol" = grounding. an entry uses the fields it needs; unused fields are omitted, never bracketed.
  anchors :: @anchor lines are period ordering + load receipts, never liveness: no entry loads or skips by its anchor; a thread paused stays open: an open tail in the boot load is the reminder; resume = fresh entries + a next_action ref, never a fake close

@backlog
  the backlog is the current declaration of work, written to be executed from no matter when the agent looks; living task queue
  the schema guides the task shape: @task <slug> with STATUS (TODO | IN_PROGRESS | DONE), OBJECTIVE, REFS, DESCRIPTION ::, ACCEPTANCE CRITERIA ::, IMPLEMENTATION DETAILS ::; the writer holds the volume
  non-destructive evolution: tasks can be added, updated, or reordered; mid-stride pivots insert a new task without destroying existing tasks
  dedicated containers: DESCRIPTION carries context and scope, ACCEPTANCE CRITERIA carries checkable done-conditions, IMPLEMENTATION DETAILS carries the specification and the execution blueprint: the requirements and decisions the change must honor, and how it lands; omit ornament, never substance
  REFS names its targets exactly (path#symbol): journal items (journal.md#slug), lane reports (lanes/x/report.md#claim), knowledge findings (knowledge.md#NAME), or an artifact (file#symbol); the spec stands alone: a ref navigates, it never substitutes for the meaning
  compose from the record (@laws#compose-from-record): material living only in the conversation lands in the record first, then the task references it
  readiness: a task marked IN_PROGRESS is executable as written; every needed decision lives in the task or behind a REF
  activation: before IN_PROGRESS, the executor scans the task: placeholders, checkable criteria, resolving REFs; a failing task returns, never execute around a gap
  no placeholders: TBD, "similar to <task>", "as appropriate" mean the task is not ready
  task progress: active work marks STATUS: IN_PROGRESS; completion marks STATUS: DONE and lands a journal event "backlog/<slug>: DONE" carrying its evidence: the command run and its observed result; the backlog updates in place as tasks move; newly discovered work appends or inserts as a fresh @task
  unit completion: all tasks reach STATUS: DONE and unit exit criteria are met; completion + the next move land in the journal

@query
  surfaces: journal.md + knowledge.md.
  journal:   live = not closed: the load list = every entry whose slug no CLOSES/SUPERSEDES names, whole file, all anchors. anchors are period ordering + load receipts, never liveness. .contexture/scripts/journal-active.awk streams active entries with complete bodies in one shot; no per-entry Read tool loops, no range spanning.
    command:
      awk -f .contexture/scripts/journal-active.awk .contexture/sessions/<unit>/journal.md .contexture/sessions/<unit>/journal.md
  thread tail: journal-audit.awk prints open THREAD entries beside the audit; the frequent stray check; receipts never enter it.
  knowledge: loads fully (small; every line a decision); supersession via SUPERSEDES (successor).
  cross-repo: grep -l "repos:.*<name>" .contexture/sessions/*/state.md: units touching a repo; objective is human-facing only.
  group: grep "GROUP: <token>" journal.md = the agent's topic thread across anchors, open or closed; resume runs through next_action's ref, never through the group alone.
  artifact-grounding: a report or recipe claimed to ground work needs a REF in the loaded record; ls shows what exists, the record says what grounds the work

@boot
  1. read AGENTS.workspace.md (the shared overlay) then AGENTS.local.md (tiny personal amendments) if present; may amend this order; an overlay address names a base section: replaced or appended; where workspace and local conflict, the workspace wins
  2. boot is unconditional at a fresh context: the first message is the move signal whatever its shape: a boot request, a task dump, a question; nothing loads and nothing works before the boot reads it
  3. get the field: grep -rl "status: ACTIVE" .contexture/sessions/*/state.md; read the message against the candidates: a close match proposes continuing that unit, no match proposes bootstrapping a new one
  4. propose the move and wait for the answer before anything works: the message naming its unit explicitly still gets the proposal stated as a confirmation; the human's reply settles the unit: an active unit continues at 5, a new unit bootstraps at 10
  5. read state.md WHOLE; refresh current_anchor in state.md (N = previous + 1; a boot is a fresh context load (compaction, session restart), never a turn boundary; turns inside one working context journal under the standing anchor)
  6. read backlog.md; read the rhythm index: awk -f .contexture/scripts/rhythms-index.awk .contexture/rhythms/*.md: one line per rhythm (name, path, use when, activation); run @query: awk -f .contexture/scripts/journal-active.awk .contexture/sessions/<unit>/journal.md .contexture/sessions/<unit>/journal.md streams all active entry bodies directly: stdout is the live attention set; knowledge loads fully
  7. ground check: git status -sb; the working tree and the upstream delta are facts the record must carry: uncommitted changes and unpushed commits reconcile before work continues; git wins over the record; a mismatch journals as work, never as a note
  8. stamp journal @anchor A<N> ("continues A<N-1>", attention: <the loaded set + the git state>); the stamp is the load receipt: grep "^@anchor" reconstructs map + receipts; receipts inform, never feed the next boot's load
  9. continue from next_action, following the invoked rhythm, the matching rhythm on its trigger, or the default (@rhythms)
  10. new work: bootstrap .contexture/sessions/<slug>/state.md: ACTIVE, current_anchor: A0, next_action "backlog the first task"; continue at 5

@interact
  :: ask -> restate -> confirm -> act -> surface -> ask
  ask:      grounded question, one at a time; answer opens next; until intent, constraints, and approach are settled
  restate:  goal + intended approach, your words; where approaches diverge, name the tradeoff
  confirm:  human: go | ask; may interrupt anytime; never skipped, however small
  act:      work the chosen rhythm's steps (default: the design loop, @rhythms); mid-act message: finish the act first, then address; halt ONLY on stop, hold, redirect, or a discovery that outgrew the confirmed intent (stop, say so, back to confirm)
  surface:  durable output, named by what it is
  surface -> ask
  artifacts: stay current in the same breath as the work: journal at the event (see @journal), backlog as tasks move (see @backlog), state as position changes (see @record), knowledge verdicts flagged as they settle (see @refresh); nothing waits for the period end; shapes live in @record and .contexture/templates/

@rhythms
  contract :: names order + outcomes; references artifacts by name, never re-specifies grammars, never prescribes content; artifact dialect; one line per step `N. GATE: outcome`; human-invoked or agent-selected on its trigger; never in state; replaces task progression only: artifact invariants (@record, @laws) hold across every rhythm. a gate closes by its artifact: DECIDE by the backlog, VERIFY/LAND by the completion receipt carrying its evidence, REFRESH by the harvest; a gate closed by memory is debt.
  trigger :: a rhythm opens with `use when: <the situations it serves>`: triggers only, never a workflow summary: a summary becomes the shortcut agents follow instead of the steps
  activation :: `activation: propose | auto`; propose is the default: the agent proposes the matching rhythm before applying it and the human confirms; auto is the team's explicit opt-in: the agent applies the rhythm on trigger without a separate ask; the acts still pass the @interact gates
  placement :: the per-turn surfaces carry interaction rules only; work patterns are rhythm material: extracted from the instruction stack at onboarding, proposed as they emerge
  default :: the design loop, when no rhythm is invoked; human rhythm replaces progression
  1. DISCUSS: explore problem space; grounded questions resolve intent
  2. DECIDE: human verdict settles; triggers harvest candidate
  3. BACKLOG: intent updates backlog.md; next_action points to active task
  4. EXECUTE: work active task; drift updates backlog in same breath
  5. VERIFY: task acceptance criteria proven; journal records completion, next_action advances
  6. REFRESH: run @refresh

@subagents
  every dispatch:
  - brief = recipe.md in lanes/<slug>/; slices parent context (exact refs: journal#entry, knowledge#finding, file#symbol/lines; FACTS one per line); broad folder dumps forbidden
  - lane boot, read-only, before any work: the overlays, state.md, backlog.md, knowledge.md, the recipe, and every REF it names; session surfaces are never lane-written
  - the lane's first journal entry is the load receipt: refs loaded, one per line; an unresolved REF is a brief defect: pause-ask for steering where the harness supports it, else stop and report it, never work around the gap
  - lane journals at action granularity in journal.md as things happen, never batched to the end: every state-changing action (a file written, a command run with a non-obvious result), claim formed, decision point taken, and drift notice lands as a WHAT carrying action + result + why-next; only task receipts batch, at task completion; the journal is the audit trail and the resumption surface
  - report -> report.md; return = summary ONLY
  - the dispatcher reads the report, never the lane journal: the report is the only window and must be self-sufficient; a thin report triggers re-dispatch, never journal-mining
  - background: the turn ends at launch; never block the conversation on a lane; parallel lanes only for independent domains: shared state or ordering means sequential
  - drift: a decision within the brief is the lane's; it decides and journals it; a wall or a decision beyond the brief is drift, never improvised past; pause and ask for steering where the harness supports it, else stop, report found | standing | drifted, abort gracefully
  - report and journal land NO MATTER the outcome: the action trace is the exact stopping point, so a steer continues live and a re-dispatch resumes from the folder, never rebuilds
  - a lane that cannot write its report returns the artifact verbatim; dispatcher persists byte-clean
  - a lane's "passed" is NEVER the gate; dispatcher re-verifies load-bearing claims
  - read the report WHOLE, no exception; an unread part wears the look of review
  - journal every dispatch: lane folder path

@refresh
  the artifact sweep, shared by rhythm boundaries, @close, and @handoff: the events journaled, backlog statuses advanced, next_action refreshed (one terse pointer, overwritten never prepended; the WHY rebuilds from open items + GROUNDED IN + live findings), the harvest run: every open flag, one candidate each; confirmed candidates land in knowledge.md (REF to the full version, or the whole story carried) and the entry closes by reference; "not landed" drops; journal-audit run, what it flags fixed; beyond the harvest, nothing closes here

@close
  period end (turn ends; unit continues):
    1. refresh (@refresh): the harvest runs inside it; then close the period's done events by reference
    2. stray audit: the thread tail printed by journal-audit.awk is the checklist: every open THREAD that resolved this period closes now, same breath, verdict word + resolution in the WHAT; receipts never close here: they fold only at a human-called chapter turn or at unit close
    3. journal audit: awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md must exit 0; it flags the broken entries (dangling or slugless closers, dateless slugs, inline markers, unharvested KNOWLEDGE flags, STATUS: DONE tasks without their backlog/<slug>: DONE event, STATUS: IN_PROGRESS tasks absent from state.md) with line numbers; the audit is a repair instrument: fix what it flags and fill what is missing before the period ends, never a note
    4. folder stays ACTIVE
  unit close (backlog completes, or the human ends the unit):
    1. append closing events + next-move decision
    2. re-read; confirm consistency (@laws#verify-before-close)
    3. promote durable knowledge at the human's direction
    4. mark CLOSED

@handoff
  compaction or clearing near (any moment, mid-period):
    1. run the period-end writes (@close 1-3) if not done
    2. verify with the cold read: run awk -f .contexture/scripts/journal-active.awk .contexture/sessions/<unit>/journal.md .contexture/sessions/<unit>/journal.md and read the stream as a fresh boot would: the record reconstructs the position without the conversation; while the context is still full, improve the quality and fix what was missed; the gaps close now, never after compaction; AND awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md exits 0; a dangling closer = handoff failure; the sweep reads the whole open list: every open entry confirmed thread or receipt, a resolved thread hiding unmarked closes here: the net for a forgotten stamp
  the handoff writes the record, not working memory.

@git
  the gitignore strategy is decided per topology and team choice at onboarding; parent workspaces deny by default and whitelist shared files explicitly (AGENTS.md, AGENTS.workspace.md, README.md, .contexture/).

@update
  the base evolves upstream: fetch https://github.com/ahmetegesel/contexture.git and follow its README's update guidance
