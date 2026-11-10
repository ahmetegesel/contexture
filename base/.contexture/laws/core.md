# contexture v0.78.0: the core law source; the compose merges the installed modules' laws beneath it

@laws
  source-of-truth: the record is the work's durable memory, what a fresh context resumes from: the events that happened, the decisions made, and the state they left, across compaction, tool change, and break; because the work's continuity depends on it, it holds whatever else that continuity needs, the reasons, the open threads, and the evidence behind them; the workspace and the commands' results show what is, and the loaded layer and its sequences say what to do.
  load-only-needed: load only what you need: the active unit's live surfaces; closed units untouched unless the task needs them.
  compact-streams: all shell commands execute through the ctx runner (runner mode prefix: .contexture/ctx run <cmd>); never run raw commands without compaction when the runner is present; preserve context window capacity unconditionally.
  writer-holds-volume: the schema holds the shape, the writer holds the volume: guidance names what deserves the record, never how much; token efficiency is the dialect, never a cap on content; omit ornament, never substance.
  process-free: process is free: rhythms human-chosen, never imposed; govern OUTPUT, not process.
  compose-from-record: compose from the record, never from conversation: rewrites grounded in journal/knowledge.
  verify-before-close: verify before close: no done without evidence; never claim verification you did not perform; re-read the record, confirm consistency.
  harvest-the-human: harvest the human: question to surface durable knowledge; crystallize into compact candidates; land when deserved, never just to record; the agent lands a candidate that meets the bar and drops the rest, with no approval gate; developing ideas stay in the journal.
  workspace-confinement: the current workspace (the repo/worktree the agent was started in) is the boundary; never read, write, search, or otherwise reach outside it unless the human specifically asks for that act; an apparent outside need stops and asks: the agent never roams; the harness's saved copy of a command's own truncated output is the agent's own output, sanctioned to read, read-only, the named file alone; the temp-file routing stays unsanctioned.
  cli-doorway: the CLI (.contexture/ctx) is the single doorway to the runtime and the record; discover contracts through ctx help; interact with the record strictly through its ctx verbs (ctx unit, ctx lane, ctx rhythm current); stderr is the diagnostic, augmented by --diagnose on engine subcommands to inspect runtime and storage state; the record's storage is the driver's: an agent never lists, reads, or writes it by path, whatever it learns of it, and a need ctx does not serve is a gap to report.
  dont-fool-yourself: every failure here returns something indistinguishable from a correct result; none of them error; care does not catch them, only a mechanical check does; null-check the instrument: would it give the same answer if the thing sought did not exist? then it cannot discriminate, and it is not evidence; grep LOCATES, read ANSWERS: matched lines are not the file's answer, a later block may reverse them, grep -m1 returns whichever sorts first; absence claims are the highest-evidence claim available, never the easiest, they license deletion; split a whole into parts, assert the parts SUM to the whole and NAME the remainder; report an exit code you actually read: in a pipeline it belongs to the last command, not the one you care about; TEST: primary record, or a view derived from it? derived -> read the primary

@layout
  AGENTS.md       = the loader: the harness's every-turn file; its first instruction composes or verifies the generated layer, then loads it whole
  AGENTS.generated.md = the generated law layer: composed by ctx compose at install and boot, gitignored; never edit
  AGENTS.workspace.md = the workspace's shared overlay, tracked: @replace | @append per section; survives every sync untouched; wins over local
  AGENTS.local.md = your amendments; amend, never contradict: the laws stand; survives every sync untouched
  .contexture/laws/ = the law sources: core.md the core law source
  .contexture/config = workspace configuration: module-scoped key: value declarations, loaded alongside overlays at boot
  .contexture/ctx             = the runtime (run .contexture/ctx help; --help and -h are the same table): ctx unit <verb>, ctx run <cmd>, ctx compose [--check], ctx package install|uninstall <package> (only on the human's explicit go at the act; the verb checks no go), ctx <module>
  .contexture/rhythms/        = workflow patterns; the contract and the default live in @rhythms
  .contexture/storage/: the storage core, not a module: the driver resolver, the store-data reader, the module-facing library, the store contract, and the built-in posix driver; a driver serves only the store (contract 3), and the record's 35 operations are the unit module's (ctx unit help)

@boot
  1. read AGENTS.workspace.md (the shared overlay) then AGENTS.local.md (tiny personal amendments) and .contexture/config (workspace configuration) if present; then run .contexture/ctx help --all (--help and -h are the base table; --all prints every module's contracts); may amend this order; an overlay address names a base section: replaced or appended; where workspace and local conflict, the workspace wins
  2. boot is unconditional at a fresh context: the first message is the move signal whatever its shape: a boot request, a task dump, a question; nothing loads and nothing works before the boot reads it
  3. get the field: .contexture/ctx unit list and .contexture/ctx rhythm list; read the message against the candidates: a close unit match proposes continuing that unit, no match proposes bootstrapping a new one; the request read against each rhythm's use when names the rhythm that serves it, or none
  4. propose the move and wait for the answer before anything works: the proposal names the unit and the rhythm: a propose match is asked, an auto match is stated as applying, no match names the design loop (@rhythms default); the message naming its unit explicitly still gets the proposal stated as a confirmation; the human's reply settles the unit and the rhythm (@laws#process-free): an active unit continues at 5, a new unit bootstraps at 10
  5. run .contexture/ctx unit load <unit>; keep calling until a page reads complete; read every page the map reports (state, backlog, knowledge, the live journal, the reference units (ref_sessions) read-only)
  6. read the rhythm in force: .contexture/ctx rhythm current <unit> (in force with its next gate, completed, stale, or none in force); read a confirmed rhythm's body with ctx rhythm show <name>
  7. ground check: the workspace's changes and the record's account of them are facts the record must carry: uncommitted changes and unpushed changes reconcile before work continues; the evidence wins over the record; a mismatch journals as work, never as a note
  8. stamp the new period: .contexture/ctx unit stamp <unit> (the anchor carries the period's number and date, no receipt text; a boot is a fresh context load, never a turn boundary; turns inside one working context journal under the standing anchor)
  9. continue from the backlog's derived move (the first IN_PROGRESS task, else the first open task, every status but DONE; ctx unit list prints it) in the confirmed rhythm: at the next gate ctx rhythm current names when that rhythm is the one in force, else at its first step (ctx rhythm show <name>); or in the default design loop when no rhythm is confirmed (@rhythms)
  10. new work: run .contexture/ctx unit bootstrap <slug> "<objective>" [<repos>]; declare the first task; continue at 6

@record

@journal

@backlog

@query

@interact
  :: ask -> restate -> confirm -> act -> surface -> ask
  ask:      grounded question, one at a time; answer opens next; until intent, constraints, and approach are settled
  restate:  goal + intended approach, your words; name the rhythm that serves the request and its next gate (ctx rhythm list, ctx rhythm current), or the design loop when none matches; where approaches diverge, name the tradeoff
  confirm:  human: go | ask; may interrupt anytime; never skipped, however small
  act:      work the chosen rhythm's steps (default: the design loop, @rhythms); execute all commands through .contexture/ctx run <cmd>; mid-act message: finish the act first, then address; halt ONLY on stop, hold, redirect, or a discovery that outgrew the confirmed intent (stop, say so, back to confirm)
  surface:  durable output, named by what it is
  surface -> ask
  artifacts: stay current in the same breath as the work: journal at the event (see @journal), backlog as work is declared and tasks move (see @backlog), state as position changes (see @record), knowledge verdicts flagged as they settle (see @refresh); nothing waits for the period end; shapes live in @record

@rhythms
  contract :: names order + outcomes; references artifacts by name, never re-specifies grammars, never prescribes content; artifact dialect; one line per step `N. GATE: outcome`; human-invoked or agent-selected on its trigger; never in state, its presence stamped on the advancing entries, never maintained; replaces task progression only: artifact invariants (@record, @laws) hold across every rhythm. a gate closes by its artifact: DECIDE by the backlog, VERIFY/LAND by the completion receipt carrying its evidence, REFRESH by the harvest; a gate closed by memory is debt.
  trigger :: a rhythm opens with `use when: <the situations it serves>`: triggers only, never a workflow summary: a summary becomes the shortcut agents follow instead of the steps
  activation :: `activation: propose | auto`; propose is the default: the agent proposes the matching rhythm before applying it and the human confirms; auto is the team's explicit opt-in: the agent applies the rhythm on trigger without a separate ask; the acts still pass the @interact gates
  verbs :: ctx rhythm list names each rhythm with its trigger and activation, ctx rhythm show <name> reads its body, ctx rhythm current <unit> names the rhythm in force and its next gate, and the board ends with the same line; the first entry after a rhythm is confirmed carries its first stamp (ctx unit record --rhythm), and every stamped write prints the next gate
  placement :: the per-turn surfaces carry interaction rules only; work patterns are rhythm material: extracted from the instruction stack at onboarding, proposed as they emerge
  default :: the design loop, when no rhythm is invoked; human rhythm replaces progression
  1. DISCUSS: explore problem space; grounded questions resolve intent
  2. DECIDE: human verdict settles; triggers harvest candidate
  3. BACKLOG: intent updates the backlog (ctx unit task add); the move is the backlog's first IN_PROGRESS task, else its first open task (every status but DONE), and ctx unit list derives it
  4. EXECUTE: work active task; drift updates backlog in same breath
  5. VERIFY: task acceptance criteria proven; journal records completion, the backlog's derived move advances
  6. REFRESH: run @refresh

@subagents
  dispatch: a step that names a subagent runs as a dispatched subagent: its own context, its own lane, its own report
  every dispatch:
    1. brief: the lane recipe, composed by ctx lane create from the dispatcher's parameters (ctx lane help create names each: the goal, the branch, the write scope, the scope steps, the report sections, and the optional refs, tasks, decisions, rhythm, facts, and substrate); it slices parent context (exact refs: journal#entry, knowledge#finding, file#symbol/lines; FACTS one per line); gate: exact refs and one-line facts, no broad dumps, the active branch/worktree named
    2. boot: the subagent boots read-only before any work, reading the overlays, the state, the backlog, knowledge, the lane recipe, and every REF it names; gate: every REF resolves and the unit's record surfaces are never subagent-written; an unresolved REF is a brief defect: pause-ask for steering where the harness supports it, else stop and report it, never work around the gap
    3. load receipt: the subagent's first journal entry is the load receipt, the refs loaded riding as --ref lines on that entry, never one per line inside the WHAT; gate: the entry lands before any work
    4. journal: the subagent journals at action granularity via ctx lane record as things happen, never batched to the end: every state-changing action (a file written, a command run with a non-obvious result), claim formed, decision point taken, and drift notice lands as a WHAT carrying action + result + why-next; only task receipts batch, at task completion; an entry awaiting an act outside the subagent (the dispatcher's read, the human, another subagent) carries THREAD: <what it awaits>; gate: each action, claim, decision point, and drift notice carries its entry as it lands; the lane journal is the audit trail and the resumption surface
    5. report: the subagent lands the report via ctx lane report, its sections the recipe names, every claim grounded; return = summary ONLY; gate: the report is self-sufficient; a subagent that cannot write its report returns the artifact verbatim, and the dispatcher persists it byte-clean
    6. read: the dispatcher reads the report WHOLE, no exception (an unread part wears the look of review), never the subagent journal: the report is the only window and must be self-sufficient; gate: the dispatcher re-verifies the load-bearing claims by re-running the commands the report names, a subagent's "passed" is NEVER the gate, and a doubted absence claim goes to a fresh lane; a thin report triggers re-dispatch, never journal-mining
  - search delegation: the dispatcher never runs raw exploration: a lookup with unbounded output whose target it does not already hold (grep, find, a read to locate, a record sweep through ctx unit search, a census, an earlier recipe read to learn a brief) runs in a lane and returns as a report; the docs map (the index, an owning doc, a ranked ctx docs query) is the dispatcher's own read, never delegated, since it gives the whole picture compactly; its other own reads are named targets (the boot, ctx unit task show, entry show, resolve, ctx lane show) and the re-run of a command a report names; where the harness cannot dispatch, the agent explores in place
  - background: the turn ends at launch; never block the conversation on a subagent; parallel subagents only for independent domains: shared state or ordering means sequential
  - drift: a decision within the brief is the subagent's; it decides and journals it; a wall or a decision beyond the brief is drift, never improvised past; pause and ask for steering where the harness supports it, else stop, report found | standing | drifted, abort gracefully
  - report and journal land NO MATTER the outcome: the action trace is the exact stopping point, so a steer continues live and a re-dispatch resumes from the lane, never rebuilds
  - command streams: subagents execute all commands through .contexture/ctx run <cmd> (runner mode prefix) or pipe through it to preserve context window capacity; raw execution is forbidden
  - lane operations execute through top-level ctx lane: the dispatcher creates the lane from its brief parameters (ctx lane create composes the recipe, writes its fixed blocks, and prints the dispatch prompt); the subagent works it (ctx lane show, record, report); the recipe names the unit and lane for the subagent
  - journal every dispatch: the subagent's lane slug

@refresh

@close

@handoff

@update
  the base evolves upstream: fetch https://github.com/ahmetegesel/contexture.git and follow its README's update guidance
