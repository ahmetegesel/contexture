# The Workspace Convention

A guideline for teams: how to use this workspace, and why it works.

---

## TL;DR

Multi-session agent work dies when the conversation dies, unless it is
written down. This workspace is the write-down, and it buys three things:
continuity (a unit of work survives every conversation that touches it),
cheap attention (the agent loads only what the work touches), and freedom
from vendors (bash + grep are the whole engine; any harness, any agent).

The workspace in one map:

- `AGENTS.md`: laws + navigation, auto-delivered every turn
- `templates/`: six grammars pinning the shape of every artifact
- `sessions/<unit>/`: one folder per unit of work: `state.md` (the
  pointer), `plan.md` (the intent), `journal.md` (the memory),
  `knowledge.md` (the mind)
- `AGENTS.local.md`: your amendments; amend, never contradict
- `rhythms/`: workflow patterns, invoked never imposed

**Adopt in five minutes:**

1. Copy `AGENTS.md` and `templates/` into your repo.
2. Add `sessions/`, `rhythms/`, `AGENTS.local.md` to `.gitignore`.
3. Write `AGENTS.local.md` with your amendments; amend, never contradict.
4. Tell the agent what the first unit is; it bootstraps
   `sessions/<unit>/` itself. The best first unit is this convention:
   adopting and tweaking it is the richest test it can get.
5. Let the first boot run. The agent stamps the anchor, reads the plan,
   loads what's live, and continues. The same ritual runs every period
   from then on.

**Then it runs itself:**

- **Boot:** read your amendments, name the move from the message,
  verify against the folder, stamp an anchor, run the query:
  open items fully, superseded as one-liners, born-closed never (Part II §2)
- **Work:** events append to the journal, findings land in knowledge
  with a REF, plans edit surgically at re-plan only (§2, §3)
- **Close:** period end refreshes the pointer; unit end marks CLOSED
  and journals the next move (§2)
- **Handoff:** before context death, run the writes, verify the boot
  greps resolve (§2)

Five premises carry the whole design: files over conversation, govern
output not process, mitigate don't solve, compose from the record, no
machinery. Part I explains the approach; Part II shows it in execution.

---

## The problem

Agent-assisted work spans conversations. A unit of real work, like a
feature, a migration, or a decision, runs through many conversations,
compactions, tool changes, and breaks. The conversation dies at each
seam, and everything not in a file dies with it.

Teams compensate badly, in three recurring ways:

- **Re-grounding from scratch.** Every new session re-explains the context,
  re-derives the state, re-lives the decisions. The tax is paid on every
  single session, and the re-telling drifts.
- **Loading everything.** The agent is told to read everything, every time.
  Attention is a budget, and spending it on irrelevant material means the
  relevant material doesn't get read.
- **Harness machinery.** Hooks, plugins, skills, custom commands: features
  that pin the workflow to one vendor, add machinery the work doesn't need,
  and bring convenience rather than capability. The power is the model's
  judgment, and the harness cannot guarantee execution of anything.

The result is the same in all three: what the agent remembers diverges from
what happened, rules contradict themselves across surfaces, and continuity
depends on luck.

This workspace answers with a small set of plain files and two tools every
agent has: grep and read. Memory survives because it lives on disk.
Attention stays cheap because the agent loads only what the work touches.
And the whole convention runs on any vendor, any harness, any agent.

## The philosophy behind it

Five premises carry the entire design. Everything else follows.

1. **Files are the source of truth, never the conversation.** The
   conversation is a scratchpad; the files are the memory. Every rule,
   every finding, every piece of state that matters is written down at the
   moment it happens.
2. **Govern the output, not the process.** Human teams run on shared
   structure: SDLC, Agile, conventions, standards. It is legitimate;
   it solves human collaboration flaws, coordination and communication.
   Agent flaws are entirely different: memory dies, attention is finite,
   rules are followed literally, cross-checks get skipped. Human-shaped
   routines solve none of those. Forcing them on an agent throttles it,
   and putting agent governance in shared files makes every team
   member's agent run identically, dictating how each person uses their
   own agent. The separation: a thin shared layer that guarantees the
   quality of the output, and a personal layer where process stays
   free.
3. **Mitigate, don't solve.** Agent failure cannot be solved; it can be
   nudged down. A nudge is the default. A mechanic earns its place only
   when the failure is costly and frequent, a cheap check exists, and
   nudges prove unreliable.
4. **Compose from the record.** The agent never reconstructs from memory of
   the conversation. Rewrites and plans ground in the journal and the
   knowledge base, the only sources that survive compaction.
5. **No machinery.** bash, grep, and read exist everywhere. Prose is the
   query language; the shell is the retrieval tool. Nothing harness-specific
   ever enters the convention.

These five premises produce the two parts that follow. Part I explains
the approach in simple terms, why it works; Part II shows what it looks
like in execution. Read Part I to understand, Part II to operate.

---

---

---

## Part I: The approach

Six mechanisms answer the three failure modes from the problem. Files
that survive answer re-grounding; a deliberate attention budget answers
loading everything; machine-free plain tools answer harness machinery;
and around those three, output governance, a journal for memory, and a
verification loop keep the whole thing honest. Each section below
states its mechanism in simple terms; Part II shows how each one looks
when it runs.

### 1. Files survive, conversation doesn't
Every mechanism in the workspace exists because of this single fact: the
conversation is the least durable thing in the system. The session folder
exists so the unit of work outlives every conversation that works on it.
The journal is append-only because memory must never be revised in place;
what happened is closed by reference from a fresh entry, so the record is
never rewritten. Anchors exist because time itself must be recorded: each
working period stamps a one-liner, and the map of stamps is what makes
"what's live now" answerable with one grep. Knowledge findings carry a
born state, open or closed at creation, never edited, because a fact's
status at its discovery moment is itself a fact.

The design also respects the different mutation profiles of the files
rather than fighting them: state mutates freely because it's a pointer;
the journal only appends because it's a record; knowledge only grows
because it's a mind. Each file gets the mutation it can sustain. A
maintained field is a drift point, while a stamp at creation is free.
Nothing valuable is ever allowed to exist only in the conversation; the
moment it appears, it's written down.

*In practice:* a conversation compacts mid-decision. The unit's journal
still holds yesterday's entries and their anchors; the knowledge file
still holds the finding with its REF. The next boot reads the map and
reconstructs the position; the decision survives because it never lived
in the chat. And "live" is concrete: entries stamped A1-A2 load; entries
stamped A0 or A3 don't.

### 2. Govern output, not process

Human teams run on shared structure: SDLC, Agile, conventions,
standards. The structure is real and legitimate; it solves the flaws
humans actually have, coordination and communication at scale. Agent
flaws are entirely different: memory dies, attention is a budget, rules
are followed literally, cross-checks get skipped. Human-shaped routines
solve none of these, and two traps follow. Importing human-shaped
process into agent governance throttles the agent: it walks routines
that solve problems it does not have, while its real flaws stay
ungoverned; a gate that says "HALT if a step was skipped" is the sound
of that trap. And putting agent governance in shared files makes every
team member's agent run identically, which quietly dictates how each
person interacts with their own agent. The workspace answers with a
separation: one thin shared layer that guarantees the quality of the
output, and a personal layer where process stays free.

The boundary rule that makes it operational: *a step belongs to the
governed layer iff it produces a checkable artifact.* Everything else is
rhythm: free, human-chosen, offered in a folder, invoked like a skill,
never imposed, never recorded in state. Interaction rhythms (how to
handle a queued message) and work rhythms (how to progress through a
task) are both offers, not laws.

And when something does graduate to the governed layer, it earns the
place: the failure is costly and frequent, a cheap check exists, and
nudges have proven unreliable. Nudge is the default; machinery is the
exception. One distinction draws the line: the careless majority is
instrumented (born-state status, closure by reference, derived lookups),
while the deliberate minority is not fought; mechanics earn their place
only where instrumented nudges fail. The balance, neither rigid workflow
nor full freedom, falls out of construction: process open, output
closed.

*In practice:* a rhythm says "discuss, then decide, then capture." A
contract says "the recipe names the report's PATH, SHAPE, and RETURN."
The first is an offer; a team takes it or leaves it. The second is
enforced; a report with no named shape comes back. That difference is
the whole boundary, and it is why the workspace feels light while
staying safe.

### 3. The journal is the memory

The journal is where reality lives: append-only events, stamped with
anchors, closed by reference. The plan is only a snapshot of intent. It
is allowed to stale, because progress never touches it; step completion
is a journal event, and the plan is refreshed only when intent changes
in conversation. When a plan completes, it's replaced in place and its
traces, completion and the next move, land in the journal. Surgical
edits protect the stable spine: touching only what a re-plan changes
keeps unchanged steps byte-identical, where a whole rewrite recomposes
everything under model variance.

The knowledge base is the mind: findings arrive at decision and discovery
moments, in a shape meant to be composed from, never plan-shaped. A claim
earns trust only through fresh evidence; no REF means hypothesis, and
nobody plans on a hypothesis. Compose from the record, never from the
conversation; that law is enforceable precisely because the record is
complete.

*In practice:* step 3 of the plan finishes. The plan file does not
change; the journal gains one line, "slug/step-3: DONE." A week later
the plan still reads exactly as composed, intent, while the journal
holds what actually happened. And a finding about agents reads "agents
skip cross-checks": a hypothesis, good for questions, never for plans;
the same finding with a REF pointing at the correction that produced it
is a fact.

### 4. Attention is the budget

An agent's attention is finite; every irrelevant line it reads is a
relevant line it doesn't. The workspace spends attention deliberately:

- **Load what the work touches.** The boot reads one tiny file whole,
  `state.md`, and derives everything else: the anchor map decides which
  journal ranges are live, and three classes decide what loads, open
  items fully, superseded items as one-liners, born-closed items never.
  Open items outside the live ranges are dead weight and are skipped. A
  file that outgrows one read has outgrown the law it serves: decompose
  it, index at boot, bodies on relevance.
- **The layout itself is the context mechanism.** One folder per unit
  bounds the boot load structurally: the agent reads the active unit's
  files, and nothing else. The layout does the bounding; no rule has to
  spend a token on it.
- **Derive, don't maintain.** Any artifact kept in sync with another goes
  stale silently. The active session is located by grep, not maintained in
  a pointer.
- **Relevance over taxonomy.** Findings are classified at creation (open
  or closed), never by category. Ref pointers relocate bloat rather than
  kill it; the discipline is the ref itself: the live surface carries one
  terse line, and detail lives behind the ref, never inside it.

*In practice:* a boot for a unit with sixty journal entries reads one
small state.md, the anchor map, and the class greps. Superseded entries
surface as one-liners, born-closed entries stay unread, open ones load
fully. Thousands of lines of reports sit in the folder; the boot touches
none of them. The attention went to the work, not the archive.

### 5. The machine-free method

The convention runs on bash, grep, and read, tools every harness
provides. Prose is the query language; the shell is the retrieval tool.
Scripts are traps wearing convenience. Harness features like hooks,
plugins, and skills bring convenience, not capability: the power is the
model's judgment, and what happens after a skill loads is the model's
decision. The prose never names tools the agent doesn't hold; naming a
missing tool manufactures the affordance it denies.

Only one surface gets guaranteed per-turn delivery: `AGENTS.md`, a
convention every harness honors, not a feature. Everything else is
deliberately nudge-grade, and the design knows it: the boot reads it, and
the handoff verifies it.

The grammars earn their density. Typed blocks, reserved symbols, and
indentation as syntax carry the same meaning in fewer tokens, so context
windows are spent on substance. Newlines and indents are load-bearing:
blocks start at column 0 because line-anchored greps (`^@anchor`,
`^@entry`) are the retrieval mechanism; an indented block start is a
silent miss. Contract strings (`status:`, `STATUS:`, `@anchor`, `REF`)
have exactly one home each and one spelling, because a miss is a law
unenforced.

*In practice:* the same plain text searches answer on any harness, any operating
system, any agent. Nothing calls a hook, a plugin, or a custom command.
A team moves from one harness to another by re-pointing the tool, and
the convention does not notice.

### 6. The loop that verifies

The five mechanisms before this one all assume their own operator fails.
The agent forgets, the helper overstates, the check passes vacuously. This
workspace does not try to make that impossible; it makes it caught. The
single principle: no claim is believed on trust; every claim earns trust
through fresh evidence. From that principle the whole loop follows.

- **Write it, then read it.** Handed work begins as a written brief and
  ends as a written report, no matter how it ended. A stopped or drifted
  helper still writes what it found, so the next try resumes from the
  report, never from nothing. Part II §4 carries the mechanics; here is
  the why: the artifact is the only thing that survives to be checked.
- **The giver re-checks.** A helper's "passed" is never the gate; the
  agent that handed out the work checks the load-bearing claims itself.
  Trust is earned with fresh evidence, never borrowed from a
  subordinate's word.
- **Evidence has grades.** A check that returns the same answer whether
  or not the thing it sought existed proves nothing; its result is not
  a finding. And absence is the highest burden: "nothing calls X" is the
  most dangerous claim, because false presence dies the moment someone
  opens the file while false absence lives forever. An ABSENT verdict
  earns the harder search: every flag, case-insensitive, every separator
  spelling, in every place the thing would live.
- **The loop feeds itself.** After any build, sweep the design decisions
  against the surfaces, because a missed connection means more are
  missed. Then live with it and see what breaks; the design ends when use
  teaches more than refinement. And before a context dies, the handoff
  runs the writes and verifies the boot greps: boot is the reader,
  handoff is the writer-side proof.

This is the same loop the teams adopt: use it, break it, journal the
break, and let the next boot be smarter. The three failures from the
opening (re-grounding from scratch, loading everything, harness
machinery) are exactly what the loop catches, one period at a time.

*In practice:* a helper reports "nothing calls this field." The giver
re-runs the search itself, case-insensitively, with every separator
spelling, and finds "status : ACTIVE" in one file. The absence claim
dies; the false absence is caught. The helper's word was never the
gate; the fresh search was.

---

## Part II: In execution

What the approach looks like when it runs: the files, the boot, the
grammars, the day to day.

### 1. The workspace in one read
The workspace has two layers. The line between them is contractual:

| File | Tracked? | Role | Read when |
|---|---|---|---|
| `AGENTS.md` | shared | laws + navigation | every turn (auto-delivered) |
| `templates/` | shared | the grammars, one per artifact | write-time reference |
| `AGENTS.local.md` | private | your amendments | at boot |
| `sessions/` | private | one folder per unit of work | the active unit's files |
| `rhythms/` | private | workflow patterns, invoked not imposed | when a rhythm is called |

The division is contractual: **the convention is shared, the working state
is private.** `AGENTS.md` and `templates/` are copied between teams and
committed. This guideline is the human's companion; read it once, keep
it out of the repo. Everything in `sessions/` and `rhythms/` is
gitignored and stays with its owner. Nothing in `sessions/` is ever
committed.

**`AGENTS.md`** has exactly two jobs: govern and navigate. Its blocks are a
tour of the convention:

- `@laws`: the five laws that bind everything
- `@layout`: where every file lives and what it's for
- `@record`: the four session files and their semantics
- `@query`: how the agent decides what to load
- `@boot`: the boot sequence that starts every working period
- `@interact`: how the agent treats the human
- `@subagents`: how dispatches run
- `@close`: period end and unit close
- `@handoff`: the proof before context death
- `@git`: what's committed and what never is

It carries no schemas (those live in `templates/`), no provenance (that
lives in the journal), and no rhythm names (those live in `rhythms/`).

**`templates/`** pins six grammars, one per artifact: `state.md`,
`plan.md`, `journal.md`, `knowledge.md`, `recipe.md`, `report.md`. Each is
written to be read *from*, never copied wholesale. Section 3 tours them.

**`sessions/`** holds one folder per unit of work. A unit outlives every
conversation that works on it and dies when the work is done, not when a
chat ends. Each folder carries the four record files (state, plan, journal,
knowledge) plus `recipes/` (dispatch briefs) and `reports/` (lane
evidence).

**`AGENTS.local.md`** is the one governance file the human owns: personal
rules, preferences, rhythm defaults. It is read at boot and kept tiny.
Its one hard rule: **amend, never contradict: the laws stand.** A local
"skip verification" is a contradiction, not an amendment.

### 2. The life of a session

A session folder is a unit of work. Its life has four phases: boot, work,
close, handoff.

**Boot** is the first thing the agent does each working period,
mechanically:

1. **Read amendments.** Read `AGENTS.local.md` if present. It's tiny, and
   it may amend the boot order itself.
2. **Name the move.** Read the human's opening message and decide what it
   is: continuing a unit, or new work. The message is the primary signal;
   nothing else loads before the move is named.
3. **Verify the move against the folder.** One targeted grep:
   `grep -l "status: ACTIVE" sessions/<unit>/state.md`. Agreement
   proceeds. Disagreement (the named unit is absent or not ACTIVE, or new
   work collides with a live unit) is asked about before anything else
   loads.
4. **More than one candidate?** The message may name one; otherwise list
   the ACTIVE units (`grep -rl "status: ACTIVE" sessions/*/state.md`)
   and ask (default: the last-touched).
5. **Read state, stamp the anchor.** Read `state.md` whole. It is small by
   law, and detail lives behind refs, never inside it. Append to
   `journal.md`:
   ```
   @anchor A<N> ("one-liner: what this working period is")
   ```
   `<N>` is `current_anchor` + 1, and the map of these one-liners is the
   seam between working periods: it decides which ranges of the journal are
   live. Then refresh `current_anchor` in `state.md` to the new value.
6. **Read the plan, run the query.** Read `plan.md`. Then decide what to
   load from the journal and knowledge. Four greps, in this order, and
   one subtraction at the end:
   - the anchor map: `grep "^@anchor" journal.md` (labels each period)
   - the live ranges: `grep "ANCHOR: A<N>" journal.md` (labels every
     entry by its period)
   - the closure stamps: `grep -E "SUPERSEDES:|CLOSES:" journal.md
     knowledge.md` (what they target)
   - the open items: `grep "STATUS: open" journal.md knowledge.md`
   - then subtract: an open item targeted by a closure stamp is
     superseded, not open; it loads as a one-liner (its WHAT line), and
     the reason travels in the fresh entry. Open items outside the live
     ranges are dead weight; skip them. Born-closed items never load.
   - knowledge loads open findings **plus findings referenced by live-range
     REFs**; a finding resolves via a journal `CLOSES:` (no successor) or
     via a `SUPERSEDES:` (a successor finding)
7. **Continue.** From `next_action`, following the rhythm the human invoked
   (or propose one). If `next_action` says "plan the next move", the
   planning phase starts.
8. **New work bootstraps a unit.** The agent creates
   `sessions/<slug>/state.md` with `status: ACTIVE`,
   `current_anchor: A0`, and `next_action: "plan the first move"`, then
   continues at step 5, and the first boot stamps A1.

A boot, concretely. All eight steps, amendments first (the unit here is
any unit):

```
1. read AGENTS.local.md            # absent: nothing to amend, proceed

2. the message names the move:
   > "let's continue the example unit"

3. verify against the folder:
   $ grep -l "status: ACTIVE" sessions/example-unit/state.md
   sessions/example-unit/state.md  # the named unit is live

4. one candidate: no ask needed

5. read state.md WHOLE, then stamp:
   @anchor A2 ("second period on the example unit")
   refresh current_anchor to A2

6. the query: four greps in order, then the subtraction.

   map first (labels each period):
   $ grep "^@anchor" sessions/example-unit/journal.md
   @anchor A1 ("inventory and design")              # the map: A1..A2 live
   @anchor A2 ("second period on the example unit")

   cluster (labels every entry by its period):
   $ grep "ANCHOR: A2" sessions/example-unit/journal.md
   # every entry stamped A2: the live range, concretely

   closure stamps (what they target):
   $ grep -E "SUPERSEDES:|CLOSES:" sessions/example-unit/journal.md
   sessions/example-unit/journal.md:19:  CLOSES: <date>-migration-dispatches

   open items:
   $ grep "STATUS: open" sessions/example-unit/journal.md sessions/example-unit/knowledge.md
   sessions/example-unit/journal.md:14:  STATUS: open

   the subtraction: line 19's CLOSES targets the entry that line 14
   shows open. That entry loads as a one-liner, not fully; the reason
   travels in the fresh entry. The attention set is empty today.

7. continue from next_action, following the human-invoked rhythm
```

**Work** is three movements, each with one home:

- **Events** land in the journal as they happen, appended, never revised.
  An entry is born with its `ANCHOR`, `STATUS: open|closed`, and `WHAT`;
  it dies by reference, never by edit.
- **Findings** land in the knowledge base at decision and discovery
  moments. A `REF` (the evidence source) turns a claim into a fact;
  no REF means hypothesis, and nobody plans on a hypothesis.
- **Re-plans** touch only what changed. The plan is edited surgically at
  re-plan moments; unchanged steps stay byte-identical; and the change
  is journaled in the same breath.

**Close** has two distinct ends:

- **Period end** (a turn ends; the unit continues): append events to the
  journal, refresh `next_action` in `state.md` (one terse pointer,
  overwritten never prepended; the WHY rebuilds from journal open items,
  the plan's GROUNDED IN refs, and live findings, never pre-serialized
  into state), and add findings as they crystallize. The folder stays
  ACTIVE.
- **Unit close** (the plan completes, or the human ends the unit): append
  the closing events *and the next-move decision* to the journal, promote
  durable knowledge at the human's direction, re-read the files and
  confirm consistency, then mark the unit CLOSED. It stays private
  forever.

**Handoff** is the proof before context death. When a context is about to
die (compaction, tool change, long break): run the period-end writes, then
verify the boot greps resolve. A fresh boot must reconstruct the entire
position from files alone. A folder that contradicts the move, an anchor
map that doesn't resolve the live range, a `next_action` that points at
finished work: each is a handoff failure, and catching one before context
death is exactly what the ritual is for.

### 3. The grammars

Six artifacts, six grammars in `templates/`. What lives where, and what
never goes where:

| Artifact | It is | It holds | Never in it |
|---|---|---|---|
| `state.md` | the live pointer | `status`, `current_anchor`, `next_action`, `objective`, `repos` | detail, decisions, history |
| `plan.md` | the current declaration | GOAL, STEPS with exit criteria, GROUNDED IN | progress; completion is a journal event |
| `journal.md` | the memory | append-only `@entry` events, `@anchor` declarations | edits; closure is by reference, never revision |
| `knowledge.md` | the mind | `@finding` blocks: NAME, STATUS, REF, SUMMARY | anchors; knowledge is a-temporal, the journal owns time |
| `recipe.md` | the dispatch brief | `@context`, MISSION, REPORT: PATH + SHAPE + RETURN | improvisation; lanes never drift from the brief |
| `report.md` | the lane's evidence | `@orientation`, per-claim verdicts + evidence + marks, `@risks` | commentary; the artifact is returned verbatim |

The semantics that make each artifact work, the rules beyond the shape:

- **`state.md` is edited freely; the plan is edited surgically.** State is
  a pointer, tiny, refreshed at period ends. The plan is a snapshot of
  intent: composed at re-plan moments, replaced in place when complete.
  Progress never touches it.
- **`journal.md` is append-only.** What happened is never rewritten. An
  entry closes by a fresh entry stamping `CLOSES:` (or `SUPERSEDES:`) with
  the reason; relevance is derived, not maintained.
- **`knowledge.md` is a-temporal.** Findings are born open or closed at
  creation and never edited. The journal owns the timeline; findings own
  the ideas, and REFs are the seam between them.
- **The recipe names the shape.** A grammar not named in the brief is a
  grammar not followed: the recipe's REPORT names PATH (where the report
  lands), SHAPE (which grammar it follows), RETURN (what comes back to the
  dispatcher, a summary only).
- **Evidence carries a mark.** A report's claims are marked `VERIFIED`
  (checked), `INFERRED` (reasoned, not checked), or `ABSENT` (the thing
  is nowhere; the highest burden). Never claim verification that was not
  performed.

**The dialect.** The grammars share a strict pseudo-language, written to
spend tokens on substance:

- blocks start at column 0 (`@entry`, `@finding`), bodies indent two
- `::` opens a block scalar, an indented value that continues
- `|` means alternation only; `[ ]` wraps optional parts; `->` means flow;
  `#` starts a comment
- `status:` is lowercase on `state.md`; `STATUS:` is uppercase on entries;
  spellings are contractual, not stylistic

Spellings are contractual everywhere: `status: ACTIVE`, `STATUS: open`,
`REF`, `@anchor`, `CLOSES:`. Every surface writes the same tokens, or greps
silently miss. And a grep that can't be relied on is a law that can't be
enforced. When in doubt, the templates are the authority; write from them,
never copy them.

### 4. Working with the agent

- **Compose from the record.** Every rewrite, plan, and summary grounds in
  the journal and knowledge, never in the conversation. A plan rewrite
  reads its GROUNDED IN refs first.
- **One design question per turn, grounded before asking.** State what the
  decision is, what it looks like now, and why it's being asked. Discuss
  before significant decisions; the human may interrupt anytime.
- **The human may interrupt; a queued message doesn't kill the act.**
  Complete the act in flight, then address the message. Halt only on an
  explicit stop, hold, or redirect.
- **Dispatch is a contract.** Every subagent dispatch:
  1. gets a brief on disk, a recipe naming what to check, and the report's
     PATH, SHAPE, and RETURN. A message-brief dies at compaction; a recipe
     on disk survives.
  2. runs in the background; the turn ends at the launch; the conversation
     never blocks on a lane.
  3. runs against the recipe, never improvising. On drift, the lane stops
     and reports what it found, where it stands, and where it drifted;
     pause-and-ask where possible, abort gracefully where not.
  4. lands its report no matter how the lane ends, even stopped or
     failed. A re-dispatch resumes from the report, never rebuilds from
     nothing.
  5. returns the artifact verbatim if it cannot write the file itself:
     nothing before, nothing after. The dispatcher persists it byte-clean.
  6. is read WHOLE by the dispatcher, no exception; an unread part wears
     the look of review.
  7. is never believed on its own word. The lane's "passed" is never the
     gate; the dispatching agent re-verifies the load-bearing claims
     itself.
  And every dispatch is journaled: an entry carrying the brief's path and
  the report's path.

### 5. Adopting it

1. Copy `AGENTS.md` and `templates/` into your repository. That's the
   convention. This guideline stays out of it; it's the human's read.
2. Add `sessions/`, `rhythms/`, and `AGENTS.local.md` to `.gitignore`.
3. Carve `AGENTS.local.md` with your amendments: preferences, personal
   rules, rhythm defaults. Amend, never contradict: the laws stand.
4. Create `sessions/`, then tell the agent the first unit's name and
   goal; the agent bootstraps the folder itself. The best first unit is
   the convention itself: adopting, tweaking, and living with it is the
   richest possible workload for testing it. Journal every break; harvest
   the lessons into findings; let the design end when use teaches more
   than refinement.
5. Let the first boot run. The agent reads your amendments, names the
   move from your message, verifies it against the folder, stamps the
   anchor, reads the plan, and continues from `next_action`.

Extending it, without breaking it:

- **Rhythms are shared with teams separately.** Predefined workflow
  patterns ship as their own folder to teams that want them, never inside
  the workspace itself. The workspace offers the mechanism; teams choose
  their own process.
- **Product-specific laws stay out.** The governance file carries generic
  workflow laws only; a product's own rules belong in that product's own
  governance. Mixing them confuses both audiences.
- **A field earns its place only when a query consumes it.** Every field
  must have a grep that reads it. Extend a grammar when a new query earns
  a new field, never before.
- **Keep the law readable.** `AGENTS.md` must fit one read; a file the
  agent cannot read at boot is a file the law cannot enforce. Detail lives
  behind refs, never inside.
- **The bar is vanishing weight.** The lightest ruleset that still prevents
  the known breaks, always lighter, never heavier.

And keep two habits: after any change to a surface, run the boot greps to
confirm they still resolve; after any build, sweep the design decisions
against the surfaces, because a missed connection means more are missed.

---
