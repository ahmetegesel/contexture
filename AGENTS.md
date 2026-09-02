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
  AGENTS.local.md = your amendments, private, gitignored; amend, never contradict: the laws stand
  templates/      = artifact grammars: reference to write from, never copy
  sessions/       = one folder per unit of work (private, gitignored)
  rhythms/        = workflow patterns (private, gitignored); human-invoked or agent-proposed, like skills; never in state; name order + outcomes; reference artifacts by name, never re-specify grammars, never prescribe content; dialect; one line per step `N. GATE: outcome`, no sub-blocks

@record
  unit of work = session folder; outlives working periods, dies with the unit. shapes live in templates/; match exactly; this section: semantics only, never a second copy.
  dialect: typed blocks at column 0, bodies indent 2; :: opens a block scalar; | means alternation only; [ ] wraps optional parts; -> means flow; # starts a comment. lowercase keys on state.md (status: ACTIVE), UPPERCASE fields on findings (STATUS: open | closed); spellings are contractual.
  folder status = unit lifecycle; finding status = claim liveness. two statuses, one word, distinct meanings; journal entries carry no status: closure by reference only.
  state.md     = live pointer: only file edited freely; refreshed at period ends; read WHOLE at boot; kept tiny, detail behind refs.
  plan.md      = current declaration: goal + steps + exit criteria. progress NEVER touches it; step DONE = journal event "slug/step-N: DONE". edited ONLY at re-plan: touch what changed, replace in place; REPLAN entry same breath; grounded in the record. completed plan replaced in place; completion + next-move in the journal.
  journal.md   = the single recording surface: append-only events + @anchor declarations; entries stamped ANCHOR: A<N>, never edited; closed only when a later entry's CLOSES/SUPERSEDES targets them. [GROUP: <token>] = the agent's topic thread, chosen in the conversation, stable within the unit. [KNOWLEDGE: true] = knowledge-worthy; the harvest's input.
  knowledge.md = findings at decision/discovery moments, born open (live claims) or closed (settled); linked to events via REF; no REF = hypothesis, never plan on it. claims outlive their anchors, unlike journal entries. every finding lands via the harvest of a KNOWLEDGE: true entry, confirmed or reshaped; developing ideas stay journal events.
  recipes/     = dispatch briefs, one per dispatch; names the report path.
  reports/     = lane evidence reports; the dispatch's audit trail.

@query
  surfaces: journal.md + knowledge.md.
  journal:   map = grep "^@anchor" (one-liner per period; "continues A<N-1>" = joint, "(done, disjoint)" = dead); map decides live ranges; dead anchors' items never load. cluster = grep "ANCHOR: A<N>" (live ranges).
  knowledge: loads fully (small; every line a decision): open findings + findings referenced by live-range REFs; resolved via journal CLOSES (no successor) or SUPERSEDES (successor).
  classes by subtraction, never one grep:
    live-range entries minus closure targets -> load fully (the attention set); a CLOSES:/SUPERSEDES: target is closed, not open
    closure targets -> one-liner (WHAT; the reason travels in the fresh entry)
  cross-repo: grep -l "repos:.*<name>" sessions/*/state.md: units touching a repo; objective is human-facing only.
  group: grep "GROUP: <token>" journal.md = the agent's topic thread across anchors, open or closed.

@boot
  1. read AGENTS.local.md if present (tiny amendments); may amend this order
  2. opening message names the move: continuing a unit, or new work; primary signal; nothing loads before
  3. verify: grep -l "status: ACTIVE" sessions/<unit>/state.md; agree -> proceed; disagree -> ask before anything loads
  4. >1 ACTIVE candidate? message may name one; else grep -rl "status: ACTIVE" sessions/*/state.md, list, ask (default: last-touched)
  5. read state.md WHOLE; stamp journal @anchor A<N> (N = current_anchor + 1, one-liner); refresh current_anchor
  6. read plan.md; run @query over journal + knowledge: anchor map, cluster, closures, open; derive classes by subtraction
  7. continue from next_action, following the human-invoked rhythm
  8. new work: bootstrap sessions/<slug>/state.md: ACTIVE, current_anchor: A0, next_action "plan the first move"; continue at 5

@interact
  :: ask -> restate -> confirm -> act -> surface -> land -> ask
  ask:      grounded question, one at a time; answer opens next; until resolved
  restate:  goal, your words
  confirm:  human: go | ask; may interrupt anytime
  act:      work; mid-act message: finish the act first, then address; halt ONLY on stop, hold, redirect
  surface:  durable output, named by what it is
  land:     human verdict | decision | rule -> propose KNOWLEDGE: true on the journal entry; confirm | reshape; "not landed" drops; no re-ask
  land ->   ask

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
    2. harvest: grep the period's KNOWLEDGE: true entries; propose one candidate per entry; confirmed -> lands in knowledge.md, the entry closes by reference; "not landed" drops
    3. folder stays ACTIVE
  unit close (plan completes, or the human ends the unit):
    1. append closing events + next-move decision
    2. re-read; confirm consistency (law 6)
    3. promote durable knowledge at the human's direction
    4. mark CLOSED; stays private; nothing committed

@handoff
  compaction or clearing near (any moment, mid-period):
    1. run the period-end writes if not done
    2. verify boot greps resolve: a fresh boot reconstructs the position from files alone
  the handoff writes the record, not working memory.

@git
  git tracks the convention ONLY: this file, templates/, tracked material. session work is private, never committed.
  never push without explicit instruction.
