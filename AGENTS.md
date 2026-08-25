@laws
  1. session files = ONLY source of truth; never conversation.
     files survive compaction, tool change, or break; conversation doesn't.
  2. load only what you need: the active session's live surfaces;
     closed sessions untouched unless the task needs them.
  3. process is free: rhythms human-chosen, never imposed;
     govern OUTPUT, not process.
  4. mitigate, don't solve: nudge is the default; a mechanic earns its
     place only if costly/frequent + cheap check + nudge-unreliable.
  5. compose from the record, never from conversation: rewrites grounded
     in journal/knowledge — the only sources that survive compaction.
  6. verify before close: no done without evidence;
     re-read the files, confirm consistency at close.

@layout
  AGENTS.md  = laws + navigation (this file); blocks at column 0, bodies
               indent 2, one blank line between blocks
  templates/ = the artifact grammars — reference to write from; never copy
  sessions/  = one folder per unit of work (private, gitignored)
  rhythms/   = your workflow patterns (private, gitignored)
  archive/   = retired material

@record
  a session folder is a unit of work; it outlives working periods and
  dies with the unit. shapes live in templates/ — match them exactly;
  this section carries semantics only, never a second copy of a shape.
  note: state.md keys are lowercase (status: ACTIVE); entry fields are
  UPPERCASE (STATUS: open | closed). spellings are contractual.
  state.md     = the live pointer — the only file edited freely;
                 refreshed at period ends; read WHOLE at boot; kept tiny
                 (detail lives behind refs, never inside).
  plan.md      = the current declaration: goal + steps + exit criteria.
                 progress NEVER touches it — step completion is a journal
                 event "slug/step-N: DONE".
                 edited ONLY at re-plan (conversational): touch only what
                 changed, replace in place; REPLAN journal entry in the
                 same breath; grounded in the record.
                 a completed plan is replaced in place; completion +
                 next-move land in the journal.
  journal.md   = append-only events + @anchor declarations; entries
                 stamped ANCHOR: A<N>; closure by reference, never edited.
  knowledge.md = findings written at decision/discovery moments; linked to
                 events via REF; no REF = hypothesis, never plan on it.
  recipes/     = dispatch briefs (one per subagent dispatch; names the
                 report path).
  reports/     = lane evidence reports; the dispatch's persistence is the
                 audit trail.

@query
  surfaces: journal.md + knowledge.md — both carry the status system.
  journal:   map = grep "^@anchor" (a one-liner per working period;
             "continues A<N-1>" = joint, "(done, disjoint)" = dead);
             the map decides which ranges are live — dead anchors' items
             never load. cluster = grep "ANCHOR: A<N>" (the live ranges).
  knowledge: load open findings + findings referenced by live-range REFs.
  three classes decide loading within the loaded set:
    open        -> load fully      (the attention set)
    superseded  -> one-liner only  (grep -E "SUPERSEDES:|CLOSES:" targets;
                   one-liner = WHAT line / first SUMMARY line; the reason
                   travels in the fresh entry)
    born-closed -> never load

@boot
  1. locate: grep -rl "status: ACTIVE" sessions/
  2. >1 active? list, ask (default: last-touched)
  3. read state.md WHOLE; append @anchor A<N> — "one-liner" to journal.md
     (A<N> = next value after current_anchor)
  4. read plan.md; run @query over journal.md + knowledge.md:
     anchor map -> live range -> open items
  5. continue from next_action per the selected rhythm (state.md rhythm)
  6. none active? ask which unit to start

@interact
  - one design question per turn; ground BEFORE asking:
    what it is, what it looks like now, why ask
  - discuss before significant decisions; the human may interrupt anytime
  - never claim verification you did not perform
  - name artifacts by what they are, never by session shorthand
  - queued message mid-act: COMPLETE the act first, then address;
    halt ONLY on an explicit stop, hold, or redirect

@subagents
  every dispatch:
  - brief = a file in recipes/, names the report path;
    report -> reports/; return = summary ONLY
  - drift: a lane NEVER improvises — stop, report found, standing, drifted;
    pause-ask where possible, abort gracefully where not
  - report lands NO MATTER HOW the lane ended -> a re-dispatch resumes
    from the report, never rebuilds from nothing
  - a lane's "passed" is NEVER the gate; the dispatching agent re-verifies
    load-bearing claims itself
  - journal every dispatch: an entry carrying brief path + report path

@close
  period end (a turn ends; the unit continues):
    1. append events to journal.md; refresh next_action in state.md
    2. add findings to knowledge.md as they crystallize
    3. the folder stays ACTIVE
  unit close (the plan completes, or the human ends the unit):
    1. append closing events + the next-move decision to journal.md
    2. re-read the files; confirm consistency (law 6)
    3. promote durable knowledge at the human's direction
    4. mark CLOSED; stays private — nothing is committed

@git
  git tracks the convention ONLY — this file, templates/, and other
  tracked material. session work is private, never committed.
  never push without explicit instruction.
