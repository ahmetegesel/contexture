# contexture v0.3.1 - the shared base; workspaces overlay it via AGENTS.workspace.md, never edit this file
@laws
  1. session files = ONLY source of truth; never conversation. files survive compaction, tool change, break; conversation does not.
  2. load only what you need: the active session's live surfaces; closed sessions untouched unless the task needs them.
  3. write token-efficient: dense, structural; one statement per line; typed blocks over prose.
  4. process is free: rhythms human-chosen, never imposed; govern OUTPUT, not process.
  5. compose from the record, never from conversation: rewrites grounded in journal/knowledge.
  6. verify before close: no done without evidence; never claim verification you did not perform; re-read the files, confirm consistency.
  7. harvest the human: question to surface durable knowledge; crystallize into compact candidates; land with approval; land when deserved, never just to record; developing ideas stay in the journal.

@layout
  AGENTS.md       = laws + navigation (this file)
  AGENTS.workspace.md = the workspace's shared overlay, tracked: @replace | @append per section; survives every sync untouched; wins over local
  AGENTS.local.md = your amendments; amend, never contradict: the laws stand; survives every sync untouched
  templates/      = artifact grammars: the shapes to fill at write time
  scripts/        = cross-platform awk queries (journal extraction, dangling audit)
  sessions/       = one folder per unit of work
  rhythms/        = workflow patterns; the contract and the default live in @rhythms

@record
  unit of work = session folder; outlives working periods, dies with the unit. shapes live in templates/; every artifact is written by filling its grammar directly, the template in hand is the complete shape; this section: semantics only, never a second copy.
  dialect: typed blocks at column 0, bodies indent 2; :: opens a block scalar; | means alternation only; [ ] wraps optional parts; -> means flow; # starts a comment. lowercase keys on state.md (status: ACTIVE), UPPERCASE fields on findings (STATUS: open | closed); spellings are contractual.
  folder status = unit lifecycle; finding status = claim liveness. two statuses, one word, distinct meanings; journal entries carry no status: closure by reference only.
  state.md     = live pointer: only file edited freely; refreshed as the work moves: every plan update and step landing moves next_action, also at period ends; read WHOLE at boot; kept tiny, detail behind refs.
  plan.md      = current declaration: goal + steps + exit criteria. progress NEVER touches it; step DONE = journal event "slug/step-N: DONE". edited ONLY at re-plan: touch what changed, replace in place; REPLAN entry same breath; grounded in the record. completed plan replaced in place; completion + next-move in the journal.
  journal.md   = the single recording surface: append-only events + @anchor declarations; entries stamped ANCHOR: A<N>, never edited; closed only when a later entry's CLOSES/SUPERSEDES targets them; the agent chases every closer: an entry that awaits a verdict, resolution, or finalization closes in the same breath it resolves. every CLOSES/SUPERSEDES carries a verdict word - done | superseded | dropped | folded - then the reason; the closer's WHAT carries the resolution: a close without a statement is a lie. @anchor lines are period ordering + load receipts, never liveness: no entry loads or skips by its anchor. a thread paused stays open - an open tail in the boot load is the reminder; resume = fresh entries + a next_action ref, never a fake close. [GROUP: <token>] = the agent's topic thread, chosen in the conversation, stable within the unit. [KNOWLEDGE: true] = knowledge-worthy; the harvest's input.
  knowledge.md = findings at decision/discovery moments, born open (live claims) or closed (settled); linked to events via REF. REF -> the full version in append-only artifacts: relative path#symbol (journal.md#entry, reports/x.md#claim), never a dynamic file; no stable full version -> the finding carries the whole story. no REF, no story = hypothesis, never plan on it. claims outlive their anchors, unlike journal entries. every finding lands via the harvest of a KNOWLEDGE: true entry, confirmed or reshaped; developing ideas stay journal events.
  recipes/     = dispatch briefs, one per dispatch; names the report path.
  reports/     = lane evidence reports; the dispatch's audit trail.

@query
  surfaces: journal.md + knowledge.md.
  journal:   live = not closed: the load list = every entry whose slug no CLOSES/SUPERSEDES names, whole file, all anchors. anchors are period ordering + load receipts, never liveness. scripts/journal-active.awk streams active entries with complete bodies in one shot; no per-entry Read tool loops, no range spanning.
    command:
      awk -f scripts/journal-active.awk sessions/<unit>/journal.md sessions/<unit>/journal.md
  knowledge: loads fully (small; every line a decision): open findings + findings referenced by loaded REFs; resolved via journal CLOSES (no successor) or SUPERSEDES (successor).
  cross-repo: grep -l "repos:.*<name>" sessions/*/state.md: units touching a repo; objective is human-facing only.
  group: grep "GROUP: <token>" journal.md = the agent's topic thread across anchors, open or closed; resume runs through next_action's ref, never through the group alone.
  artifact-grounding: a report or recipe claimed to ground work needs a REF in the loaded record; ls shows what exists, the record says what grounds the work

@boot
  1. read AGENTS.workspace.md (the shared overlay) then AGENTS.local.md (tiny personal amendments) if present; may amend this order; an overlay address names a base section: replaced or appended; where workspace and local conflict, the workspace wins
  2. opening message names the move: continuing a unit, or new work; primary signal; nothing loads before
  3. verify: grep -l "status: ACTIVE" sessions/<unit>/state.md; agree -> proceed; disagree -> ask before anything loads
  4. >1 ACTIVE candidate? message may name one; else grep -rl "status: ACTIVE" sessions/*/state.md, list, ask (default: last-touched)
  5. read state.md WHOLE; refresh current_anchor in state.md (N = previous + 1)
  6. read plan.md; run @query: awk -f scripts/journal-active.awk streams all active entry bodies directly - stdout is the live attention set; knowledge loads fully
  7. stamp journal @anchor A<N> ("continues A<N-1>", attention: <the loaded set>); the stamp is the load receipt: grep "^@anchor" reconstructs map + receipts; receipts inform, never feed the next boot's load
  8. continue from next_action, following the human-invoked rhythm, or the default
  9. new work: bootstrap sessions/<slug>/state.md: ACTIVE, current_anchor: A0, next_action "plan the first move"; continue at 5

@interact
  :: ask -> restate -> confirm -> act -> surface -> ask
  ask:      grounded question, one at a time; answer opens next; until resolved
  restate:  goal, your words
  confirm:  human: go | ask; may interrupt anytime
  act:      work the chosen rhythm's steps (default: the design loop); mid-act message: finish the act first, then address; halt ONLY on stop, hold, redirect
  surface:  durable output, named by what it is
  surface -> ask
  each transition journals as it happens; nothing waits for the period end

@rhythms
  contract :: names order + outcomes; references artifacts by name, never re-specifies grammars, never prescribes content; artifact dialect; one line per step `N. GATE: outcome`; human-invoked or agent-proposed; never in state
  default :: the design loop, when no rhythm is invoked; a human rhythm replaces it
  1. JOURNAL: the event lands as it happens, during the conversation
  2. VERDICT: a human verdict, decision, or rule settles
  3. LAND: one knowledge candidate, confirmed or reshaped -> knowledge.md; "not landed" drops; no re-ask
  4. PLAN: the confirmed direction updates the plan or inserts new steps; next_action points at the first new step; phases allowed
  5. EXECUTE: work the plan; drift during the work = REPLAN entry, same breath
  6. JOURNAL: the result lands; next_action advances to the next step; the execution's entry closes or supersedes the earlier plan-phase entries

@subagents
  every dispatch:
  - brief = recipe in recipes/, names the report path; report -> reports/; return = summary ONLY
  - background: the turn ends at launch; never block the conversation on a lane
  - drift: a lane NEVER improvises; stop, report found | standing | drifted; pause-ask where possible, abort gracefully where not
  - report lands NO MATTER the outcome -> re-dispatch resumes from it, never rebuilds
  - a lane that cannot write its report returns the artifact verbatim; dispatcher persists byte-clean
  - a lane's "passed" is NEVER the gate; dispatcher re-verifies load-bearing claims
  - read the report WHOLE, no exception; an unread part wears the look of review
  - journal every dispatch: brief path + report path

@close
  period end (turn ends; unit continues):
    1. append journal events, closing the period's done events by reference; refresh next_action: one terse pointer, overwritten never prepended; the WHY rebuilds from open items + GROUNDED IN + live findings
    2. stray audit: the load list IS the audit - every listed entry that resolved this period closes now, same breath, verdict word + resolution in the WHAT
    3. dangling check: awk -f scripts/journal-dangling.awk sessions/<unit>/journal.md must exit 0; every closer slug resolves to an @entry; a dangling or typoed closer is fixed before the period ends, never a note
    4. harvest: grep the period's KNOWLEDGE: true entries; propose one candidate per entry; confirmed -> lands in knowledge.md (REF to the full version, or the whole story carried), the entry closes by reference; "not landed" drops
    5. folder stays ACTIVE
  unit close (plan completes, or the human ends the unit):
    1. append closing events + next-move decision
    2. re-read; confirm consistency (law 6)
    3. promote durable knowledge at the human's direction
    4. mark CLOSED

@handoff
  compaction or clearing near (any moment, mid-period):
    1. run the period-end writes if not done
    2. verify: boot greps resolve (a fresh boot reconstructs the position from files alone) AND awk -f scripts/journal-dangling.awk sessions/<unit>/journal.md exits 0; a dangling closer = handoff failure
  the handoff writes the record, not working memory.

@git
  the gitignore denies by default: shared files whitelist explicitly (AGENTS.md, AGENTS.workspace.md, README.md, scripts/, templates/).
