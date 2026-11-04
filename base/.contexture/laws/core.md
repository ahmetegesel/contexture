# contexture v0.62.0: the core law source; the compose merges the installed modules' laws beneath it

@laws
  source-of-truth: the record = ONLY source of truth; never conversation. the record survives compaction, tool change, break; conversation does not.
  load-only-needed: load only what you need: the active session's live surfaces; closed sessions untouched unless the task needs them.
  compact-streams: all shell commands execute through the ctx runner (runner mode prefix: .contexture/ctx run <cmd>); never run raw commands without compaction when the runner is present; preserve context window capacity unconditionally.
  writer-holds-volume: the schema holds the shape, the writer holds the volume: guidance names what deserves the record, never how much; token efficiency is the dialect, never a cap on content; omit ornament, never substance.
  process-free: process is free: rhythms human-chosen, never imposed; govern OUTPUT, not process.
  compose-from-record: compose from the record, never from conversation: rewrites grounded in journal/knowledge.
  verify-before-close: verify before close: no done without evidence; never claim verification you did not perform; re-read the record, confirm consistency.
  harvest-the-human: harvest the human: question to surface durable knowledge; crystallize into compact candidates; land when deserved, never just to record; the agent lands a candidate that meets the bar and drops the rest, with no approval gate; developing ideas stay in the journal.
  workspace-confinement: the current workspace (the repo/worktree the agent was started in) is the boundary; never read, write, search, or otherwise reach outside it unless the human specifically asks for that act; an apparent outside need stops and asks: the agent never roams; the harness's saved copy of a command's own truncated output is the agent's own output, sanctioned to read, read-only, the named file alone; the temp-file routing stays unsanctioned.
  cli-doorway: the CLI (.contexture/ctx) is the single doorway to the runtime and the record; discover contracts through ctx help; interact with the record strictly through ctx unit and ctx lane; stderr is the diagnostic, augmented by --diagnose on engine subcommands to inspect runtime and storage state.

@layout
  AGENTS.md       = the loader: the harness's every-turn file; its first instruction composes or verifies the generated layer, then loads it whole
  AGENTS.workspace.md = the workspace's shared overlay, tracked: @replace | @append per section; survives every sync untouched; wins over local
  AGENTS.local.md = your amendments; amend, never contradict: the laws stand; survives every sync untouched
  .contexture/laws/ = the law layer: core.md the core law source, compose the composer, AGENTS.generated.md the generated whole (composed at install and boot, gitignored; never edit)
  .contexture/config = workspace configuration: module-scoped key: value declarations, loaded alongside overlays at boot
  .contexture/ctx             = the runtime (run .contexture/ctx help; --help and -h are the same table): ctx unit <verb>, ctx run <cmd>, ctx <module>
  .contexture/rhythms/        = workflow patterns; the contract and the default live in @rhythms
  .contexture/storage/: the storage core, not a module: the driver resolver, the store-data reader, the module-facing library (the store seven and the data_get/data_emit refs), the store contract, and the posix driver; the store-only driver card (contract 3) with the record's 35 operations in the unit module at .contexture/modules/unit

@record

@journal

@backlog

@query

@boot
  1. read AGENTS.workspace.md (the shared overlay) then AGENTS.local.md (tiny personal amendments) and .contexture/config (workspace configuration) if present; then run .contexture/ctx help --all (--help and -h are the base table; --all prints every module's contracts); may amend this order; an overlay address names a base section: replaced or appended; where workspace and local conflict, the workspace wins
  2. boot is unconditional at a fresh context: the first message is the move signal whatever its shape: a boot request, a task dump, a question; nothing loads and nothing works before the boot reads it
  3. get the field: .contexture/ctx unit active; read the message against the candidates: a close match proposes continuing that unit, no match proposes bootstrapping a new one
  4. propose the move and wait for the answer before anything works: the message naming its unit explicitly still gets the proposal stated as a confirmation; the human's reply settles the unit: an active unit continues at 5, a new unit bootstraps at 10
  5. run .contexture/ctx unit load <unit>; keep calling until a page reads complete; read every page the map reports (state, backlog, knowledge, the live journal, ref sessions read-only)
  6. read the rhythm index: .contexture/ctx unit index
  7. ground check: git status -sb; the working tree and the upstream delta are facts the record must carry: uncommitted changes and unpushed commits reconcile before work continues; git wins over the record; a mismatch journals as work, never as a note
  8. stamp the new period: .contexture/ctx unit stamp <unit> (the anchor carries the period's number and date, no receipt text; a boot is a fresh context load, never a turn boundary; turns inside one working context journal under the standing anchor)
  9. continue from next_action, following the invoked rhythm, the matching rhythm on its trigger, or the default (@rhythms)
  10. new work: run .contexture/ctx unit bootstrap <slug> "<objective>" [<repos>]; declare the first task; continue at 6

@interact
  :: ask -> restate -> confirm -> act -> surface -> ask
  ask:      grounded question, one at a time; answer opens next; until intent, constraints, and approach are settled
  restate:  goal + intended approach, your words; where approaches diverge, name the tradeoff
  confirm:  human: go | ask; may interrupt anytime; never skipped, however small
  act:      work the chosen rhythm's steps (default: the design loop, @rhythms); execute all commands through .contexture/ctx run <cmd>; mid-act message: finish the act first, then address; halt ONLY on stop, hold, redirect, or a discovery that outgrew the confirmed intent (stop, say so, back to confirm)
  surface:  durable output, named by what it is
  surface -> ask
  artifacts: stay current in the same breath as the work: journal at the event (see @journal), backlog as work is declared and tasks move (see @backlog), state as position changes (see @record), knowledge verdicts flagged as they settle (see @refresh); nothing waits for the period end; shapes live in @record

@rhythms
  contract :: names order + outcomes; references artifacts by name, never re-specifies grammars, never prescribes content; artifact dialect; one line per step `N. GATE: outcome`; human-invoked or agent-selected on its trigger; never in state, its presence stamped on the advancing entries, never maintained; replaces task progression only: artifact invariants (@record, @laws) hold across every rhythm. a gate closes by its artifact: DECIDE by the backlog, VERIFY/LAND by the completion receipt carrying its evidence, REFRESH by the harvest; a gate closed by memory is debt.
  trigger :: a rhythm opens with `use when: <the situations it serves>`: triggers only, never a workflow summary: a summary becomes the shortcut agents follow instead of the steps
  activation :: `activation: propose | auto`; propose is the default: the agent proposes the matching rhythm before applying it and the human confirms; auto is the team's explicit opt-in: the agent applies the rhythm on trigger without a separate ask; the acts still pass the @interact gates
  placement :: the per-turn surfaces carry interaction rules only; work patterns are rhythm material: extracted from the instruction stack at onboarding, proposed as they emerge
  default :: the design loop, when no rhythm is invoked; human rhythm replaces progression
  1. DISCUSS: explore problem space; grounded questions resolve intent
  2. DECIDE: human verdict settles; triggers harvest candidate
  3. BACKLOG: intent updates the backlog (ctx unit task add); the pointer moves via ctx unit next
  4. EXECUTE: work active task; drift updates backlog in same breath
  5. VERIFY: task acceptance criteria proven; journal records completion, next_action advances
  6. REFRESH: run @refresh

@subagents
  dispatch: a step that names a subagent runs as a dispatched subagent: its own context, its own lane, its own report
  every dispatch:
  - brief = the lane recipe; slices parent context (exact refs: journal#entry, knowledge#finding, file#symbol/lines; FACTS one per line); broad dumps forbidden; names the active branch/worktree
  - subagent boot, read-only, before any work: the overlays, the state, the backlog, knowledge, the lane recipe, and every REF it names; session surfaces are never subagent-written
  - the subagent's first journal entry is the load receipt: refs loaded, one per line; an unresolved REF is a brief defect: pause-ask for steering where the harness supports it, else stop and report it, never work around the gap
  - subagent journals at action granularity via ctx lane record as things happen, never batched to the end: every state-changing action (a file written, a command run with a non-obvious result), claim formed, decision point taken, and drift notice lands as a WHAT carrying action + result + why-next; only task receipts batch, at task completion; an entry awaiting an act outside the subagent (the dispatcher's read, the human, another subagent) carries THREAD: <what it awaits>; the lane journal is the audit trail and the resumption surface
  - report via ctx lane report; return = summary ONLY
  - the dispatcher reads the report, never the subagent journal: the report is the only window and must be self-sufficient; a thin report triggers re-dispatch, never journal-mining
  - background: the turn ends at launch; never block the conversation on a subagent; parallel subagents only for independent domains: shared state or ordering means sequential
  - drift: a decision within the brief is the subagent's; it decides and journals it; a wall or a decision beyond the brief is drift, never improvised past; pause and ask for steering where the harness supports it, else stop, report found | standing | drifted, abort gracefully
  - report and journal land NO MATTER the outcome: the action trace is the exact stopping point, so a steer continues live and a re-dispatch resumes from the lane, never rebuilds
  - a subagent that cannot write its report returns the artifact verbatim; dispatcher persists byte-clean
  - a subagent's "passed" is NEVER the gate; dispatcher re-verifies load-bearing claims
  - read the report WHOLE, no exception; an unread part wears the look of review
  - command streams: subagents execute all commands through .contexture/ctx run <cmd> (runner mode prefix) or pipe through it to preserve context window capacity; raw execution is forbidden
  - lane operations execute through top-level ctx lane: the dispatcher creates the lane with its recipe (ctx lane create, the recipe on stdin); the subagent works it (ctx lane show, record, report); the recipe specifies the unit and lane name for the subagent
  - journal every dispatch: the subagent's lane slug

@refresh

@close

@handoff

@git
  the gitignore strategy is decided per topology and team choice at onboarding; parent workspaces deny by default and whitelist shared files explicitly (AGENTS.md, AGENTS.workspace.md, README.md, .contexture/).

@update
  the base evolves upstream: fetch https://github.com/ahmetegesel/contexture.git and follow its README's update guidance
