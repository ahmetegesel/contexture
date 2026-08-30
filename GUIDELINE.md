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

1. Copy `AGENTS.md` and `templates/` into your repo. This guideline is
   for the humans; read it, don't copy it.
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
  open items fully, superseded as one-liners, born-closed never
- **Work:** events append to the journal, findings land in knowledge
  with a REF, plans edit surgically at re-plan only
- **Close:** period end refreshes the pointer; unit end marks CLOSED
  and journals the next move
- **Handoff:** before context death, run the writes, verify the boot
  greps resolve

Five premises carry the whole design: files over conversation, govern
output not process, mitigate don't solve, compose from the record, no
machinery. The rest of this guide walks the workspace itself, file by
file, then a session running through it.

---

## The problem

Agent-assisted work spans conversations. A unit of real work, like a
feature, a migration, or a decision, runs through many conversations,
compactions, tool changes, and breaks. The conversation dies at each
seam, and everything not in a file dies with it. The death is built in:
when a conversation outgrows the context window, it gets compacted, and
compaction is a summarization task, one of the hardest an LLM faces.
The longer the context grows, the lossier the summary becomes, and what
the summary drops is gone for good.

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
3. **Mitigate, don't solve.** Agent failures are permanent; they cannot
   be eliminated, only caught and corrected. Expect them, and make every
   correction as light as it can be.
4. **Compose from the record.** The agent never reconstructs from memory of
   the conversation. Rewrites and plans ground in the journal and the
   knowledge base, the only sources that survive compaction.
5. **No machinery.** bash, grep, and read exist everywhere. Prose is the
   query language; the shell is the retrieval tool. Nothing harness-specific
   ever enters the convention.

These five premises produce everything that follows: first the workspace
itself, file by file, each with its reason; then a session running
through it; then how to take it home.

---

## The workspace, artifact by artifact

### The two layers

Every workspace has two layers, and the line between them is
contractual.

**The shared layer is the convention itself**: `AGENTS.md`, the laws and
navigation, and `templates/`, the grammars. These are copied between
teams and committed. This guideline is the human's companion; read it
once, keep it out of the repo.

**The private layer is the working state**: `sessions/`, one folder per
unit of work; `rhythms/`, personal workflow patterns, invoked not
imposed; and `AGENTS.local.md`, personal amendments. All gitignored,
per-user, never committed. Nothing in `sessions/` is ever committed.

| File | Layer | Role | Read when |
|---|---|---|---|
| `AGENTS.md` | shared | laws + navigation | every turn (auto-delivered) |
| `templates/` | shared | the grammars, one per artifact | write-time reference |
| `AGENTS.local.md` | private | your amendments | at boot |
| `sessions/` | private | one folder per unit of work | the active unit's files |
| `rhythms/` | private | workflow patterns | when a rhythm is called |

The split is the whole of "govern output, not process", made concrete.
Human teams run on shared structure (SDLC, Agile, conventions) because
that structure solves human collaboration flaws. Agent flaws are
entirely different, and two traps follow when you mix the two: importing
human-shaped process into agent governance throttles the agent, and
putting agent governance in shared files dictates how each person
interacts with their own agent. So the shared layer governs exactly one
thing: the output, meaning the artifacts, their shapes, and their
evidence. Everything about how each human drives their agent stays
personal: rhythms are offered, never imposed; amendments are personal.
The boundary rule: *a step belongs to the shared layer only if it
produces something checkable.*

**`AGENTS.md`** has exactly two jobs: govern and navigate. Its blocks are
a tour of the convention:

- `@laws`: the six laws that bind everything
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

**`AGENTS.local.md`** is the one governance file the human owns: personal
rules, preferences, rhythm defaults. It is read at boot and kept tiny.
Its one hard rule: **amend, never contradict: the laws stand.** A local
"skip verification" is a contradiction, not an amendment.

**`templates/`** pins six grammars, one per artifact, each written to be
read *from*, never copied wholesale. The four record files get their own
sections below; the dispatch pair follows them.

### The unit

`sessions/<unit>/` is one folder per piece of work. It outlives every
conversation that works on it, and it dies when the work is done, not
when a chat ends. Inside: the four record files (state, plan, journal,
knowledge) plus `recipes/` (dispatch briefs) and `reports/` (dispatch
evidence). The folder itself is the context boundary: when the agent
works on this unit, it reads this unit's files and nothing else. The
layout does the bounding, so no rule has to say "don't read the rest."

### state.md: the status card

The tiniest file, and the only one edited freely. It says where the
unit stands: `status` (ACTIVE or CLOSED), `current_anchor`, one terse
`next_action`, the unit's `objective`, and the repos it touches. Nothing
else; detail lives behind refs, never inside.

Why it stays tiny is the whole attention game. An agent's attention is
finite: every irrelevant line it reads is a relevant line it doesn't.
So each working period starts by reading exactly this one small file,
whole, and derives everything else from it. A file that outgrows one
read has outgrown its purpose; split it, and keep a small index where
the boot looks. The card also stays honest because it is a pointer, not
a log: it gets overwritten, never appended to, so it can never become
history in disguise.

### plan.md: the intent

What the unit aims to do, written as GOAL, STEPS with exit criteria,
and the sources the plan was composed from (GROUNDED IN).

The intent is a snapshot, and it is allowed to go stale. Progress never
touches it; when a step completes, the journal gains one line saying so.
The plan changes only when the human deliberately changes the intent,
and then surgically: touch only what changed, replace it in place, and
journal the change in the same breath. Unchanged steps stay
byte-identical, because a whole rewrite recomposes everything in
whatever model's voice touched it last. A completed plan is replaced in
place; its traces, completion and the next move, land in the journal.

### journal.md: the memory

The unit's running record. It only ever gains lines. An entry is born
with its period stamp (ANCHOR), its STATUS (open or closed), and its
WHAT line, and it is never edited afterward. What is over is closed by
a fresh entry that points at the old one and carries the reason; the old
line stays exactly as it was.

Why it works this way: the conversation is the least durable thing in
the system, and compaction, a lossy summarization, is where it dies. A
record that gets revised is no longer a record; a record that only grows
survives every compaction intact. The period stamps are how time itself
is recorded: one line per working period, and the map of those lines
decides which stretch of the journal is live right now.

### knowledge.md: the mind

Findings, written at the moment of a decision or a discovery. Each
finding is a NAME, a STATUS, a SUMMARY, and a REF: a link to where it
came from. A claim without a REF is a hypothesis; useful for questions,
never a base for plans. Findings are born open or closed and never
edited, because the state of a fact at its discovery moment is itself a
fact. Knowledge carries no timeline; the journal owns time, and the
REFs are the seam between the two.

*In practice:* a finding that reads "agents skip cross-checks" is a
hypothesis. The same finding with a REF pointing at the correction that
produced it is a fact.

### recipes and reports: the dispatch pair

When the agent hands work to a second agent, a subagent, two artifacts
frame the handoff. The recipe is the brief: what to check, and the
report's PATH, SHAPE, and RETURN. The report is the evidence: verdicts
per claim, each marked VERIFIED (checked), INFERRED (reasoned, not
checked), or ABSENT (the thing appears nowhere; the highest burden),
plus an honest risks section.

The pair exists because nothing is believed on trust. The brief lives
on disk, not in the conversation, because a message-brief dies at
compaction and a file survives. The report lands no matter how the
handed work ended; a stopped or drifted helper still writes what it
found, so the next try resumes from the report, never from nothing. And
the agent that handed out the work reads the report whole and re-checks
the load-bearing claims itself: a helper's "passed" is never the gate.
The full dispatch contract is in "Working with the agent" below.

*In practice:* a helper reports "nothing calls this field." The giver
re-runs the search itself, case-insensitively, with every separator
spelling, and finds "status : ACTIVE" in one file. The absence claim
dies; the false absence is caught. The helper's word was never the
gate; the fresh search was.

### How the files are written

The grammars share one strict pseudo-language, written to spend tokens
on substance: blocks start at column 0 (`@entry`, `@finding`), bodies
indent two, `::` opens an indented block value, `|` means alternation
only, `[ ]` wraps optional parts, `->` means flow, `#` starts a
comment. `status:` is lowercase on the status card; `STATUS:` is
uppercase on entries. Spellings are contractual, not stylistic.
Rhythms are written in this same dialect; "Adopting it" explains the
reason.

The spellings matter because they are the query language. The workspace
runs on plain search and plain reading, tools every harness provides,
and every coding harness works the same way underneath: the model
drives, the tools serve, the judgment stays with the model. Harness
extras mostly package convenience that plain prose already reaches; the
workspace builds on the common denominator and nothing else. A
vocabulary word with two spellings is a search that silently misses,
and a search that can't be relied on is a rule that can't be enforced.
When in doubt, the templates are the authority.

---

## A session's life

A unit of work lives through four phases: boot, work, close, handoff.

### Boot

The first thing the agent does each working period, mechanically:

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

### Work

Three movements, each with one home:

- **Events** land in the journal as they happen, appended, never revised.
  An entry is born with its `ANCHOR`, `STATUS: open|closed`, and `WHAT`;
  it dies by reference, never by edit.
- **Findings** land in the knowledge base at decision and discovery
  moments. A `REF` turns a claim into a fact; no REF means hypothesis,
  and nobody plans on a hypothesis.
- **Re-plans** touch only what changed. The plan is edited surgically at
  re-plan moments; unchanged steps stay byte-identical; and the change
  is journaled in the same breath.

### Close

Two distinct ends:

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

### Handoff

The proof before context death. When a context is about to die
(compaction, tool change, long break): run the period-end writes, then
verify the boot greps resolve. A fresh boot must reconstruct the entire
position from files alone. A folder that contradicts the move, an anchor
map that doesn't resolve the live range, a `next_action` that points at
finished work: each is a handoff failure, and catching one before
context death is exactly what the ritual is for.

---

## Working with the agent

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

---

## Adopting it

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

- **Rhythms: the skill replacement, in the artifact dialect.** A rhythm
  is a workflow pattern that replaces what skills and other machinery
  used to do: when invoked, it tells the agent the shape of a piece of
  work. It names the order and the outcomes, and it references the
  workspace's artifacts by name; it never re-specifies their grammars.
  The recipe's fields, the journal's entries, the status card's keys:
  those belong to their owners. And it is written in the same dialect
  as the artifacts: typed blocks, column 0, indent 2, contract words
  spelled once. One line per step, the form `N. GATE: outcome`, no
  per-step sub-blocks. Token-efficient, not short: a rhythm may carry as
  much as a skill would, but structured and denser than prose. That is the
  whole point of the dialect: structure is what LLMs parse best, typed
  blocks carry meaning per token, and prose is where misreadings live.
  An example:

  ```
  @rhythm ship-pack
    1. CODE: the change lands with its own tests
    2. GUARDS: suite + lint + typecheck, always, mechanical, before any review
    3. REVIEW: dispatch a review recipe, fresh context, independent;
       its findings are the hardening checklist
    4. HARDEN: dispatch a hardening recipe driven by those findings;
       the docs delta rides inside it
    5. MERGE: one merge after all phases, gate green, human sign-off first
    ground: the standards live in knowledge.md, banked before the first pack
  ```

  Predefined workflow patterns ship to teams separately, as their own
  folder, never inside the workspace itself. The workspace offers the
  mechanism; teams choose their own process.
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
