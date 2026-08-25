@law State_Is_Truth
  session files = ONLY source of truth; never conversation
  files survive compaction | tool change | break; conversation doesn't

@law Load_Only_Needed
  read active session's live surfaces; closed sessions untouched unless task needs

@law Process_Free
  rhythms human-chosen, NEVER imposed; govern OUTPUT not process

@law Mitigate_Not_Solve
  nudge default; mechanic earns place only if: failure costly/frequent + check cheap + nudge unreliable

@law Compose_From_Record
  rewrites grounded in journal/knowledge — only sources surviving compaction

@law Verify_Before_Close
  no done without evidence; re-read files, confirm consistency at close

@layout
  AGENTS.md   = interaction defaults + navigation
  templates/  = artifact grammars (reference to write from; never copy)
  sessions/   = one folder per unit of work (private, gitignored)
  rhythms/    = your workflow patterns (private, gitignored)
  archive/    = retired material

@anatomy
  session folder = unit of work; outlives working periods; dies with unit
  state.md     = live pointer: status | current anchor | next_action | objective | repos
                 refreshed at period ends; read WHOLE at boot; kept tiny — detail lives behind refs
  plan.md      = current declaration: goal + steps + exit criteria
                 progress NEVER touches it; step completion = journal event "slug/step-N: DONE"
                 edit ONLY at re-plan (conversational): touch only what changed, replace in place
                 re-plan = REPLAN journal entry + edit, same breath; grounded in record
                 completed plan replaced in place; completion + next-move -> journal
                 between plans: planning phase legal (next_action = "plan the next move")
  journal.md   = append-only events + @anchor declarations
                 entries BORN STATUS open|closed, NEVER edited
                 closure by reference: fresh entry carries SUPERSEDES/CLOSES: <ref> — reason
  knowledge.md = findings BORN open|closed, carry REF + SUMMARY; closure by reference
                 written at decision/discovery moments; REF = evidence marker (no REF = hypothesis, never plan on it)
  recipes/     = dispatch briefs, one per subagent dispatch; names report path
  reports/     = lane evidence reports; dispatch's persistence = audit trail

@anchors
  @anchor A<N> — "one-liner" appended at boot; stamped on entries
  one-liner = semantic fuel: after compaction, map says which anchors join (continues) / skip (done)
  map query: grep "^@anchor"

@status
  open       = attention set — include fully
  closed     = born-closed history — excluded
  superseded = DERIVED: target of a SUPERSEDES stamp -> one-liner only (reason travels in fresh entry)
  queries: grep "STATUS: open" | grep "SUPERSEDES:" | grep "CLOSES:"

@boot
  1. locate: grep -rl "status: ACTIVE" sessions/
  2. >1 active? list, ask (default last-touched)
  3. read state.md WHOLE; append @anchor A<N> — "one-liner" to journal.md
  4. read plan.md; grep journal: ^@anchor | STATUS: open
  5. continue from next_action per human-chosen rhythm
  6. none active? ask which unit to start

@interact
  - one design question per turn; ground BEFORE asking: what it is | what it looks like now | why ask
  - discuss before significant decisions; human may interrupt anytime
  - never claim verification not performed
  - name artifacts by what they are
  - queued message mid-act: COMPLETE act first, then address; halt ONLY on explicit stop|hold|redirect

@subagents
  every dispatch:
  - brief = file in recipes/, names report path; report -> reports/; return = summary ONLY
  - drift: lane NEVER improvises — stop, report found | standing | drifted;
    pause-ask where possible, abort gracefully where not
  - report lands NO MATTER HOW lane ended -> re-dispatch resumes from report, never rebuilds
  - lane's "passed" NEVER the gate; dispatcher re-verifies load-bearing claims

@close
  period end (turn ends; unit continues):
    1. append events to journal; refresh next_action in state
    2. add findings as they crystallize
    3. stays ACTIVE
  unit close (plan complete OR human ends):
    1. append closing events + next-move decision to journal
    2. promote durable knowledge at human's direction
    3. mark CLOSED; stays private — never committed

@git
  git tracks the convention ONLY; session work private, never committed
  never push without explicit instruction
