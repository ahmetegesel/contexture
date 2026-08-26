# The Workspace Convention

A guideline for teams: how to use this workspace, and why it works.

---

## The problem

Agent-assisted work spans conversations. A unit of real work — a feature, a
migration, a decision — runs through many conversations, compactions, tool
changes, and breaks. The conversation dies at each seam, and everything not
in a file dies with it.

Teams compensate badly, in three recurring ways:

- **Re-grounding from scratch.** Every new session re-explains the context,
  re-derives the state, re-lives the decisions. The tax is paid on every
  single session, and the re-telling drifts.
- **Loading everything.** The agent is told to read everything, every time.
  Attention is a budget, and spending it on irrelevant material means the
  relevant material doesn't get read.
- **Harness machinery.** Hooks, plugins, skills, custom commands — features
  that pin the workflow to one vendor, add machinery the work doesn't need,
  and bring convenience rather than capability: the power is the model's
  judgment, and the harness cannot guarantee execution of anything.

The result is the same in all three: what the agent remembers diverges from
what happened, rules contradict themselves across surfaces, and continuity
depends on luck.

This workspace answers with a small set of plain files and two tools every
agent has — grep and read. Memory survives because it lives on disk. Attention
stays cheap because the agent loads only what the work touches. And the whole
convention runs on any vendor, any harness, any agent.

## The philosophy behind it

Five premises carry the entire design. Everything else follows.

1. **Files are the source of truth — never the conversation.** The
   conversation is a scratchpad; the files are the memory. Every rule, every
   finding, every piece of state that matters is written down at the moment
   it happens.
2. **Govern the output, not the process.** With human teams, nobody ever
   dictated how people worked — only what the work must produce: reviews,
   CI, docs, tests. Agents follow instructions literally, which tempts us to
   dictate process. Resist it. Govern artifacts; leave process free, and
   offer rhythms as choices humans can invoke.
3. **Mitigate, don't solve.** Agent failure cannot be solved; it can be
   nudged down. A nudge is the default. A mechanic (a hard rule, a gate)
   earns its place only when the failure is costly and frequent, a cheap
   check exists, and nudges prove unreliable.
4. **Compose from the record.** The agent never reconstructs from memory of
   the conversation. Rewrites and plans ground in the journal and the
   knowledge base — the only sources that survive compaction.
5. **No machinery.** bash, grep, and read exist everywhere. Prose is the
   query language; the shell is the retrieval tool. Nothing harness-specific
   ever enters the convention.

---

## Part I — Use the workspace

### 1. The workspace in one read

The workspace has two layers:

**Shared — tracked, copied between teams:**
- `AGENTS.md` — the laws and the navigation. It governs and it points. It
  carries no schemas (those live in templates), no provenance (that lives in
  the journal), no rhythm names. Read it whole; it fits one read.
- `templates/` — the grammars. Each file pins the shape of one artifact:
  state, plan, journal, knowledge, recipe, report. Write *from* them, never
  copy them wholesale.

**Private — gitignored, per-user:**
- `sessions/` — one folder per unit of work. A unit outlives chat sessions
  and dies when the work is done.
- `rhythms/` — workflow patterns, invoked like skills: the human calls one,
  or the agent proposes one. Never recorded in state, never imposed.
- `AGENTS.local.md` — your amendments: user-specific rules, preferences,
  personal rhythm defaults. Amend, never contradict — the laws stand.

The division is contractual: the convention is shared, the working state is
private. Nothing in `sessions/` is ever committed.

### 2. The life of a session

A session folder is a unit of work. Its life:

**Boot** — the first thing the agent does each working period:
1. Locate the active unit: `grep -rl "status: ACTIVE" sessions/*/state.md`.
2. Read `AGENTS.local.md` if present — your amendments, kept tiny.
3. Read `state.md` whole — it's deliberately small — and append an
   `@anchor A<N>` one-liner to the journal (the next number after
   `current_anchor`). The anchor map is the seam between working periods.
4. Read `plan.md`, then run the query: the anchor map decides which ranges
   are live, and three classes decide what loads — open items fully,
   superseded items as one-liners, born-closed items never.
5. Continue from `next_action`, following the rhythm the human invoked.

**Work** — events land in the journal as they happen; findings land in the
knowledge base at decision and discovery moments; the plan is edited only at
re-plan, surgically.

**Period end** — the conversation ends but the unit continues: append events
to the journal, refresh `next_action` in state. The folder stays ACTIVE.

**Unit close** — the plan completes: append the closing events and the
next-move decision to the journal, promote durable knowledge, mark the unit
CLOSED. It stays private forever.

**Handoff** — when a context is about to die: run the period-end writes,
then verify the boot greps resolve. A fresh boot must reconstruct the entire
position from files alone.

### 3. The grammars

What lives where — and what never goes where:

| Artifact | It is | It holds | Never in it |
|---|---|---|---|
| `state.md` | the live pointer | status, anchor, next_action, objective, repos | detail, decisions, history |
| `plan.md` | the current declaration | goal + steps + exit criteria | progress — completion is a journal event |
| `journal.md` | the memory | append-only events, @anchor declarations | edits — closure is by reference, never by revision |
| `knowledge.md` | the mind | findings: name, STATUS, SUMMARY, REF | anchors — knowledge is a-temporal; the journal owns time |
| `recipe.md` | the dispatch brief | what to check, PATH, SHAPE, RETURN | improvisation — lanes never drift from the brief |
| `report.md` | the lane's evidence | verdicts per claim, evidence, risks | commentary — the artifact is returned verbatim, nothing before or after |

Spellings are contractual: `status: ACTIVE` in state, `STATUS: open` on
entries, `REF` on findings, `@anchor` declarations in the journal. Every
surface writes the same tokens or greps silently miss.

### 4. Working with the agent

- **Compose from the record.** Every rewrite, plan, and summary grounds in
  the journal and knowledge — never in the conversation.
- **One design question per turn, grounded before asking.** State what the
  decision is, what it looks like now, and why it's being asked.
- **Dispatch with a brief on disk.** Every subagent dispatch gets a recipe
  file that names the report's path, shape, and return. The report lands no
  matter how the lane ends — a re-dispatch resumes from the report, never
  rebuilds from nothing. The lane's "passed" is never the gate: the
  dispatching agent re-verifies the load-bearing claims itself.
- **The artifact is the lane's whole return.** A lane that cannot write its
  report returns it verbatim — nothing before, nothing after. Persistence is
  byte-clean.
- **The human may interrupt anytime.** A queued message mid-act does not
  kill the act: complete it, then address the message. Halt only on an
  explicit stop.

### 5. Adopting it

1. Copy `AGENTS.md` and `templates/` into your repository. That's the
   convention.
2. Add `sessions/`, `rhythms/`, and `AGENTS.local.md` to `.gitignore`.
3. Carve `AGENTS.local.md` with your amendments — preferences, personal
   rules. Amend, never contradict: the laws stand.
4. Create `sessions/` and start the first unit. The best first unit is the
   convention itself: adopting, tweaking, and living with it is the richest
   possible workload for testing it.
5. Let the first boot run. The agent locates the active unit, reads the
   state, stamps the anchor, and continues.

---

## Part II — Why it works

### 1. Files survive, conversation doesn't

Every mechanism in the workspace exists because of this single fact: the
conversation is the least durable thing in the system. The session folder
exists so the unit of work outlives every conversation that works on it. The
journal is append-only because memory must never be revised in place — what
happened is closed by reference from a fresh entry, so the record is never
rewritten. Anchors exist because time itself must be recorded: each working
period stamps a one-liner, and the map of stamps is what makes "what's live
now" answerable with one grep. Knowledge findings carry a born state — open
or closed at creation, never edited — because a fact's status at its
discovery moment is itself a fact. Nothing valuable is ever allowed to exist
only in the conversation; the moment it appears, it's written down.

### 2. Govern output, not process

Human software collaboration never dictated process — nobody told engineers
to discuss before designing, or design before coding. What was governed was
always the output: reviews, CI, docs, tests, style. Agents follow
instructions literally, which tempts us to dictate process — and that is the
category error this convention refuses. The boundary rule: *a step belongs
to the governed layer iff it produces a checkable artifact.* Everything else
is rhythm — free, human-chosen, offered in a folder, invoked like a skill,
never imposed, never recorded in state. Interaction rhythms (how to handle a
queued message) and work rhythms (how to progress through a task) are both
offers, not laws. The balance — neither rigid workflow nor full freedom —
falls out of construction: process open, output closed.

### 3. The journal is the memory

The journal is where reality lives: append-only events, stamped with anchors,
closed by reference. The plan is only a snapshot of intent — it's allowed to
stale, because progress never touches it; step completion is a journal event.
When a plan completes, it's replaced in place and its traces — completion and
the next move — land in the journal. The knowledge base is the mind:
findings arrive at decision and discovery moments, in a shape meant to be
composed from, never plan-shaped. And a claim earns trust only through fresh
evidence: a finding without a REF is a hypothesis, and nobody plans on a
hypothesis. Compose from the record, never from the conversation — that law
is enforceable precisely because the record is complete.

### 4. Attention is the budget

An agent's attention is finite; every irrelevant line it reads is a relevant
line it doesn't. The workspace spends attention deliberately:

- **Load what the work touches.** The boot reads one tiny file whole —
  `state.md` — and derives everything else: the anchor map decides which
  journal ranges are live, and three classes decide what loads — open items
  fully, superseded items as one-liners, born-closed items never. A file
  that outgrows one read has outgrown the law it serves: decompose it —
  index at boot, bodies on relevance.
- **Derive, don't maintain.** Any artifact kept in sync with another goes
  stale silently. The active session is located by grep, not maintained in a
  pointer. Every field must have a query that consumes it — a vocabulary
  grows only when a query earns it.
- **Relevance over taxonomy.** Findings are classified at creation (open or
  closed), never by category. Ref pointers relocate bloat rather than kill
  it — so refs point to bodies that stay small.

### 5. The machine-free method

The convention runs on bash, grep, and read — tools every harness provides.
Prose is the query language; the shell is the retrieval tool. Scripts are
traps wearing convenience. Only one surface gets guaranteed per-turn
delivery: `AGENTS.md` — a convention every harness honors, not a feature.
Everything else is deliberately nudge-grade, and the design knows it. The
grammars earn their density: typed blocks, reserved symbols, and indentation
as syntax carry the same meaning in fewer tokens, so context windows are
spent on substance. Contract strings — `status:`, `STATUS:`, `@anchor`,
`REF` — have exactly one home each and one spelling, because a grep that
can't be relied on is a law that can't be enforced.

### 6. The loop that verifies

Nothing is believed because someone said so. Every claim earns trust through
fresh evidence:

- **Dispatch is a contract.** The brief lives on disk and names the report's
  path, shape, and return. The report lands no matter how the lane ends.
- **The dispatcher re-verifies.** A lane's "passed" is never the gate.
  Load-bearing claims are checked by the dispatching agent itself.
- **Absence is the highest burden.** "Nothing calls X" is the most dangerous
  claim, because false presence dies the moment someone opens the file while
  false absence lives forever. An ABSENT verdict requires the harder search:
  every flag, case-insensitive, every separator spelling, in every place the
  thing would live.
- **The convention audits itself.** After any build, sweep every design
  decision against the surfaces — a missed connection means more are missed.
  And the last word belongs to use, not design: live with it and see what
  breaks. The design ends when use teaches more than refinement.

This is the whole loop: a workspace built from observed failure, written
down in files that survive, verified by independent lanes, and corrected
until no drift remains. That's what it asks of the teams that adopt it too —
use it, break it, journal the break, and let the next boot be smarter.
