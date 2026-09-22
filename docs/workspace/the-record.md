@doc structural the-record
  repo: workspace
  description: "The session record: state, backlog, journal, knowledge, lanes, anchors, and closure semantics"
  sources: [base/AGENTS.md, base/.contexture/templates/**]
  keywords: [record, state, backlog, journal, knowledge, anchors, closure, lanes, liveness]

@responsibilities
  - "Own the unit of work grammar: state.md the pointer, backlog.md the declaration, journal.md the memory, knowledge.md the settled findings, and lanes/ the delegated work"
  - "Define liveness as a subtraction: live means not closed, and closures are later entries naming their targets"
  - "Live by nature: units and their artifacts are untracked workspace state under .contexture/sessions/; the grammar templates they fill ship in the tracked payload at base/.contexture/templates/"

@contract
  - rule: "state.md is the live pointer: status ACTIVE or CLOSED, current_anchor A<N>, one terse next_action, the objective, optional repos, and optional ref_sessions mounts."
    evidence: "current_anchor"
  - rule: "Liveness is derived, never flipped: an entry loads unless a later CLOSES or SUPERSEDES names its slug; anchors order periods and receipt loads, never liveness."
    evidence: "CLOSES"
  - rule: "A closer is a later entry naming its target, carrying a verdict word (done, superseded, dropped, folded) and the resolution in its WHAT; the target itself is never touched."
    evidence: "SUPERSEDES"
  - rule: "Every entry carries a THREAD line at birth: what it awaits, or none for a receipt; the resolving entry closes it in the same breath."
    evidence: "THREAD"
  - rule: "A task completes by moving STATUS to DONE and landing one journal line, backlog/<slug>: DONE, carrying the command run and its observed evidence."
    evidence: "STATUS: DONE"
  - rule: "Write acts validate all inputs before any write: a refusal is loud, rc1, with zero partial writes; the save sites write a unique mktemp sibling plus mv so concurrent writers never share a temp name."
    evidence: "mktemp"
  - rule: "The lane folder makes a dispatch resumable: recipe.md the brief, journal.md the action trace, report.md the evidence, all under the live .contexture/sessions/<unit>/lanes/<lane>/."
    evidence: "recipe.md"

@dependencies
  - target: "session module"
    nature: internal
    why: "Carries every write act (append, amend, flip, drop, next, refs, close), the load paging, the board, the audit, and the refresh verb"
  - target: "docs module"
    nature: internal
    why: "The close gate (ctx docs gate) chains the corpus audit and the change-delta check before a unit closes"
  - target: "git"
    nature: external
    why: "The drift check reads the status-prefixed delta from the working tree; the record itself is plain live files, untracked working state in this repository"

@pitfalls
  - id: the-record-p1
    summary: "A dangling CLOSES target silently keeps the entry live in every future boot load"
    class: bug
    severity: medium
    trigger: "A typo or an unexisting slug in a closure target"
    consequence: "The load pays tokens for a settled entry forever, and the audit flags the dangling closer"
    evidence: "CLOSES"
  - id: the-record-p2
    summary: "A slug named in a closer's reason prose closes nothing: the parse reads the target field only"
    class: gotcha
    severity: medium
    trigger: "Writing a resolution that mentions other slugs beside the actual target"
    consequence: "Entries the prose names stay live, and the closure reads as if it resolved them"
    evidence: "THREAD"
  - id: the-record-p3
    summary: "Concurrent write acts on one unit are last-writer-wins; serialization is the caller's discipline"
    class: drift-risk
    severity: low
    trigger: "Two parallel append or amend acts against the same unit"
    consequence: "One act's content can be clobbered by the other's rename"
    evidence: "mktemp"
  - id: the-record-p4
    summary: "A post-era entry without its THREAD line fails the audit"
    class: gotcha
    severity: low
    trigger: "Appending an entry whose THREAD line was dropped in editing"
    consequence: "ctx session audit flags MISSING THREAD and the period cannot close cleanly"
    evidence: "THREAD"

@see_also
  - ref: the-engine
    why: "The engine hosts the session module's verbs and the hook points the record fires"
  - ref: conventions
    why: "The workspace rules the record enforces, including docs-are-code and the close gate"
