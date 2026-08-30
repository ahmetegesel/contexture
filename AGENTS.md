@laws
  1. session files = ONLY source of truth; never conversation. files survive compaction, tool change, or break; conversation doesn't.
  2. load only what you need: the active session's live surfaces; closed sessions untouched unless the task needs them.
  3. process is free: rhythms human-chosen, never imposed; govern OUTPUT, not process.
  4. compose from the record, never from conversation: rewrites grounded in journal/knowledge, the only sources that survive compaction.
  5. verify before close: no done without evidence; re-read the files, confirm consistency at close.

@layout
  AGENTS.md  = laws + navigation (this file)
  AGENTS.local.md = your amendments: user-specific rules, preferences, personal rhythm defaults (private, gitignored); amend, never contradict: the laws stand
  templates/ = the artifact grammars: reference to write from, never copy
  sessions/  = one folder per unit of work (private, gitignored)
  rhythms/   = workflow patterns (private, gitignored); the human invokes one or the agent proposes one as it sees fit, like skills; never recorded in state; a rhythm names the order and the outcomes and references the workspace's artifacts by name, never re-specifying their grammars; written in the artifact dialect; token-efficient and structural, never prose

@record
  a session folder is a unit of work; it outlives working periods and dies with the unit. shapes live in templates/; match them exactly; this section carries semantics only, never a second copy of a shape.
  dialect: every grammar and rhythm shares one pseudo-language: typed blocks at column 0, bodies indent 2; :: opens a block scalar; | means alternation only; [ ] wraps optional parts; -> means flow; # starts a comment; status: lowercase on state.md, STATUS: uppercase on entries; spellings are contractual
  note: state.md keys are lowercase (status: ACTIVE); entry fields are UPPERCASE (STATUS: open | closed). spellings are contractual.
  folder status = the unit's lifecycle; entry status = an item's relevance class. two statuses, one word, distinct meanings.
  state.md     = the live pointer: the only file edited freely; refreshed at period ends; read WHOLE at boot; kept tiny (detail lives behind refs, never inside).
  plan.md      = the current declaration: goal + steps + exit criteria. progress NEVER touches it; step completion is a journal event "slug/step-N: DONE". edited ONLY at re-plan (conversational): touch only what changed, replace in place; REPLAN journal entry in the same breath; grounded in the record. a completed plan is replaced in place; completion + next-move land in the journal.
  journal.md   = append-only events + @anchor declarations; entries stamped ANCHOR: A<N>, born open (attention items) or closed (events), never edited; closure by reference.
  knowledge.md = findings written at decision/discovery moments, born open (live claims) or closed (settled); linked to events via REF; no REF = hypothesis, never plan on it.
  recipes/     = dispatch briefs (one per subagent dispatch; names the report path).
  reports/     = lane evidence reports; the dispatch's persistence is the audit trail.

@query
  surfaces: journal.md + knowledge.md (both carry the status system).
  journal:   map = grep "^@anchor" (a one-liner per working period; "continues A<N-1>" = joint, "(done, disjoint)" = dead); the map decides which ranges are live; dead anchors' items never load. cluster = grep "ANCHOR: A<N>" (the live ranges).
  knowledge: load open findings + findings referenced by live-range REFs; a finding resolves via journal CLOSES (no successor) or via SUPERSEDES (a successor finding).
  three classes decide loading within the loaded set; the class is derived by subtraction, never by trusting one grep:
    open minus closure targets -> load fully (the attention set); an item with STATUS: open that a CLOSES:/SUPERSEDES: stamp targets is superseded, not open
    closure targets -> one-liner only (one-liner = WHAT line / first SUMMARY line; the reason travels in the fresh entry)
    born-closed -> never load
  cross-repo: grep -l "repos:.*<name>" sessions/*/state.md: which units touched a repo; objective has no query (human-facing only)

@boot
  1. read AGENTS.local.md if present (your amendments, kept tiny); the local file may amend the boot order itself
  2. read the opening message and name the move: continuing a unit, or new work; the message is the primary signal; nothing else loads before the move is named
  3. verify the move against the folder: grep -l "status: ACTIVE" sessions/<unit>/state.md; agreement proceeds; disagreement (unit absent or not ACTIVE, new work colliding with a live unit) asks the human before anything else loads
  4. >1 ACTIVE candidate for the move? the message may name one; otherwise grep -rl "status: ACTIVE" sessions/*/state.md, list, ask (default: last-touched)
  5. read state.md WHOLE; append @anchor A<N> ("one-liner") to journal.md (A<N> = next value after current_anchor); refresh current_anchor in state.md to the new value
  6. read plan.md; run @query over journal.md + knowledge.md in this order: anchor map, cluster, closure stamps, open items; then derive the classes by subtraction: open items minus closure targets load fully, closure targets load as one-liners, born-closed never
  7. continue from next_action, following the human-invoked rhythm
  8. new work: the agent bootstraps the unit: sessions/<slug>/state.md with status: ACTIVE, current_anchor: A0, next_action: "plan the first move"; then continues at step 5

@interact
  - one design question per turn; ground BEFORE asking: what it is, what it looks like now, why ask
  - discuss before significant decisions; the human may interrupt anytime
  - never claim verification you did not perform
  - name artifacts by what they are, never by session shorthand
  - queued message mid-act: COMPLETE the act first, then address; halt ONLY on an explicit stop, hold, or redirect

@subagents
  every dispatch:
  - brief = a file in recipes/, names the report path; report -> reports/; return = summary ONLY
  - dispatches run in the background: the turn ends at the launch; the conversation never blocks on a lane; act on the result when it arrives, never hold the turn open waiting for it
  - drift: a lane NEVER improvises; stop, report found, standing, drifted; pause-ask where possible, abort gracefully where not
  - report lands NO MATTER HOW the lane ended -> a re-dispatch resumes from the report, never rebuilds from nothing
  - a lane that cannot write its report returns the artifact verbatim: nothing before, nothing after; the dispatcher persists byte-clean
  - a lane's "passed" is NEVER the gate; the dispatching agent re-verifies load-bearing claims itself
  - read the lane's report WHOLE, no exception; an unread part wears the look of review
  - journal every dispatch: an entry carrying brief path + report path

@close
  period end (a turn ends; the unit continues):
    1. append events to journal.md; refresh next_action in state.md: one terse pointer, overwritten never prepended; the WHY rebuilds from journal open items + plan GROUNDED IN + live findings, never pre-serialized into state
    2. add findings to knowledge.md as they crystallize
    3. the folder stays ACTIVE
  unit close (the plan completes, or the human ends the unit):
    1. append closing events + the next-move decision to journal.md
    2. re-read the files; confirm consistency (law 5)
    3. promote durable knowledge at the human's direction
    4. mark CLOSED; stays private; nothing is committed

@handoff
  when compaction or clearing is near (any moment, mid-period):
    1. run the period-end writes if not already done
    2. verify the boot greps resolve: a fresh boot must reconstruct the position from files alone
  the handoff writes the record, not working memory.

@git
  git tracks the convention ONLY: this file, templates/, and other tracked material. session work is private, never committed.
  never push without explicit instruction.
