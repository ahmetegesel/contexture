# contexture

The workspace convention for people who treat context as the asset. This
document is the guideline for teams: how to use the workspace, and why it
works.

---

## TL;DR

Multi-session agent work dies when the conversation dies, unless it is
written down. This workspace is the write-down, and it buys three things:
continuity (a unit of work survives every conversation that touches it),
cheap attention (the agent loads only what the work touches), and freedom
from vendors (bash + grep are the whole engine; any harness, any agent).

The workspace in one map:

- `AGENTS.md`: laws + navigation, auto-delivered every turn
- `ONBOARDING.md`: agentic adoption guideline; instructions for agents installing contexture into a repository
- `templates/`: seven grammars: six artifacts plus the workspace overlay
- `scripts/`: cross-platform awk queries (active entry extraction, closure audit)
- `sessions/<unit>/`: one folder per unit of work: `state.md` (the
  pointer), `plan.md` (the intent), `journal.md` (the memory),
  `knowledge.md` (the mind)
- `AGENTS.workspace.md`: the workspace's shared overlay, replace or append per section; wins over local
- `AGENTS.local.md`: your amendments; amend, never contradict
- `rhythms/`: workflow patterns, invoked never imposed

**Adopt in five minutes:**

1. For an agent adopting contexture, point it to `ONBOARDING.md`. It executes branch isolation, topology assessment, safe gitignore setup, instruction migration, and harness symlinking.
2. For manual adoption: start on a dedicated branch; copy `AGENTS.md`, `templates/`, and `scripts/` into your repo.
3. Configure `.gitignore` for your topology: in standalone repos, append private paths (`sessions/`, `rhythms/`, `AGENTS.local.md`); in parent workspaces, whitelist as appropriate.
4. Write `AGENTS.workspace.md` (shared overlay) and `AGENTS.local.md` (your amendments); both amend, never contradict. Wire harness symlinks (`CLAUDE.md`, `GEMINI.md`) to `AGENTS.md`.
5. Tell the agent what the first unit is; it bootstraps `sessions/<unit>/` itself. Let the first boot run.

**Then it runs itself:**

- **Boot:** read the overlay and your amendments, name the move from the
  message, verify against the folder, run the query: entries minus
  closure targets load fully, all anchors; the anchor stamp receipts
  the loaded set
- **Work:** events append to the journal, findings land in knowledge
  with a REF, plans edit surgically at re-plan only
- **Close:** period end refreshes the pointer and harvests the flagged
  entries; unit end marks CLOSED and journals the next move
- **Handoff:** before context death, run the writes, verify the boot
  greps resolve

The seven laws carry the whole design: files over conversation, load
only what the work touches, dense structural writing, govern output not
process, compose from the record, verify before close, harvest the
human. The rest of this guide walks the workspace itself, file by
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
- **Harness machinery.** Hooks, plugins, custom commands, and script-carrying skills: features that pin the workflow to one vendor and add machinery the work doesn't need. Instruction-only skills, plain files that describe how to do a task, are not this; they are portable the same way this workspace is.

The result is the same in all three: what the agent remembers diverges from
what happened, rules contradict themselves across surfaces, and continuity
depends on luck.

This workspace answers with a small set of plain files and two tools every
agent has: grep and read. Memory survives because it lives on disk.
Attention stays cheap because the agent loads only what the work touches.
And the whole convention runs on any vendor, any harness, any agent.

## The philosophy behind it

The seven laws carry the entire design. Everything else follows.

1. **Files are the source of truth, never the conversation.** The
   conversation is a scratchpad; the files are the memory. Every rule,
   every finding, every piece of state that matters is written down at
   the moment it happens.
2. **Load only what the work touches.** Attention is a budget. The agent
   loads the active session's live surfaces and nothing else; closed
   sessions stay untouched unless the task needs them.
3. **Dense and structural.** One statement per line, typed blocks over
   prose, tokens spent on substance. Structure is what LLMs parse best;
   prose is where misreadings live.
4. **Govern the output, not the process.** Human teams run on shared
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
5. **Compose from the record.** The agent never reconstructs from memory of
   the conversation. Rewrites and plans ground in the journal and the
   knowledge base, the only sources that survive compaction.
6. **Verify before close.** Nothing is done without evidence; no claim of
   verification the agent did not perform; the files are re-read and
   confirmed consistent before anything closes.
7. **Harvest the human.** Questions surface durable knowledge, which
   crystallizes into compact candidates and lands with approval. Land
   when a verdict deserves it, never just to record; developing ideas
   stay in the journal.

These seven laws produce everything that follows: first the workspace
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
imposed; and `AGENTS.local.md`, personal amendments.

| File | Layer | Role | Read when |
|---|---|---|---|
| `AGENTS.md` | shared | laws + navigation | every turn (auto-delivered) |
| `AGENTS.workspace.md` | shared | the workspace overlay, replace or append per section | at boot, before local |
| `templates/` | shared | the grammars, one per artifact, each with its filled sample | write-time reference |
| `scripts/` | shared | cross-platform awk queries (journal extraction, audit) | at boot, close, handoff |
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

- `@laws`: the seven laws that bind everything
- `@layout`: where every file lives and what it's for
- `@record`: the four session files and their semantics
- `@query`: how the agent decides what to load
- `@boot`: the boot sequence that starts every working period
- `@interact`: how the agent treats the human
- `@rhythms`: the rhythm contract and the default design loop
- `@subagents`: how dispatches run
- `@close`: period end and unit close
- `@handoff`: the proof before context death
- `@git`: what's committed and what never is

It carries no schemas (those live in `templates/`), no provenance (that
lives in the journal), and exactly one rhythm: the default design
loop, which any personal rhythm replaces.

**`AGENTS.workspace.md`** is the workspace's shared overlay, tracked with
the repo: @replace or @append per section, grammar in
`templates/overlay.md`. It survives every sync untouched and wins over
personal amendments.

**`AGENTS.local.md`** is the one governance file the human owns: personal
rules, preferences, rhythm defaults. It is read at boot and kept tiny.
Its one hard rule: **amend, never contradict: the laws stand.** A local
"skip verification" is a contradiction, not an amendment.

**`templates/`** pins seven grammars: six artifacts, each written to be
read *from*, never copied wholesale, and the overlay grammar for
`AGENTS.workspace.md`. Every grammar carries a filled sample in template
syntax at its foot. The four record files get their own sections below;
the dispatch pair follows them.

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
with its period stamp (ANCHOR) and its WHAT line, and it is never edited
afterward. It has no status of its own: it is closed only when a later
entry's CLOSES or SUPERSEDES targets it, and the closer lands in the
same breath the entry resolves. A closure carries a verdict word -
done, superseded, dropped, or folded - and the closer's WHAT carries
the resolution; a close without a statement is a lie. A thread that
pauses simply stays open: the open tail in the boot load is the
reminder it exists, and a resume is fresh entries plus a `next_action`
ref, never a fake close. Entries may carry a GROUP thread (one word,
stable within the unit) and a KNOWLEDGE: true flag when they are
knowledge-worthy.

Why it works this way: the conversation is the least durable thing in
the system, and compaction, a lossy summarization, is where it dies. A
record that gets revised is no longer a record; a record that only grows
survives every compaction intact. The period stamps are how time itself
is recorded: one line per working period, naming the period and
receipting the loaded set. The stamps order the periods; liveness lives
in the closures alone - what no closure names is live.

### knowledge.md: the mind

Findings, written at the moment of a decision or a discovery. Each
finding is a NAME, a STATUS (open or closed, born and never edited),
a SUMMARY, and a REF. The REF points at the full version in an
append-only artifact, as a path and a symbol: `journal.md#entry` or
`reports/x.md#claim`. A dynamic file, the BIOS included, may never be
the reference of record. Where no stable full version exists, the
finding carries the whole story itself; a claim with no REF and no
story is a hypothesis: useful for questions, never a base for plans.
A finding lands only via the harvest of a KNOWLEDGE: true entry: the
agent proposes one compact candidate, the human confirms or reshapes,
and the entry closes by reference. Until it lands, a developing idea
stays in the journal as events. Knowledge carries no timeline; the
journal owns time, and the REFs are the seam between the two.

*In practice:* a finding that reads "agents skip cross-checks" is a
hypothesis. The same finding with a REF pointing at the journal entry
that produced it is a fact.

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
uppercase on findings. Spellings are contractual, not stylistic.
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

1. **Read the overlay and amendments.** Read `AGENTS.workspace.md` (the
   shared overlay) then `AGENTS.local.md` (personal amendments) if
   present. Both are tiny, and the local file may amend the boot order
   itself; where workspace and local conflict, the workspace wins.
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
5. **Read state, refresh the anchor counter.** Read `state.md` whole. It
   is small by law, and detail lives behind refs, never inside it.
   Refresh `current_anchor` to the next value (`N = previous + 1`).
6. **Read the plan, run the query, and load.** Read `plan.md`. Then the
   load rule, one subtraction: **live = not closed.** The load list is
   every journal entry whose slug no `CLOSES:` or `SUPERSEDES:` names,
   whole file, all anchors. Anchors are period ordering and load
   receipts, never liveness; no entry loads or skips by its anchor.
   `scripts/journal-active.awk` extracts and streams each active entry's
   full body directly bounded by the next entry or anchor line in one
   shot, with zero `Read` tool loops and no spanning reads:

   ```bash
   awk -f scripts/journal-active.awk sessions/<unit>/journal.md sessions/<unit>/journal.md
   ```

   The closure extraction parses the target field only - a slug
   mentioned in the reason prose must never close anything.

   The output is the set; no hand-picking. A settled entry still in it
   is a missing closer - visible debt the period end settles. Knowledge
   loads fully (small, every line a decision): open findings plus
   findings referenced by the loaded entries; a finding resolves via a
   journal `CLOSES:` (no successor) or via a `SUPERSEDES:` (a successor
   finding).
7. **Stamp the load receipt.** Append to `journal.md`:
   ```
   @anchor A<N> ("continues A<N-1>", attention: <the loaded set>)
   ```
   The stamp names what was loaded, so `grep "^@anchor"` reconstructs
   both the map and the receipts. Receipts inform; they never feed the
   next boot's load - the subtraction does.
8. **Continue.** From `next_action`, following the human-invoked rhythm,
   or the default design loop. If `next_action` says "plan the next
   move", the planning phase starts.
9. **New work bootstraps a unit.** The agent creates
   `sessions/<slug>/state.md` with `status: ACTIVE`,
   `current_anchor: A0`, and `next_action: "plan the first move"`, then
   continues at step 5, and the first boot stamps A1.

A boot, concretely. All nine steps, overlay and amendments first (the
unit here is any unit):

```
1. read AGENTS.workspace.md        # absent: nothing to overlay, proceed
   read AGENTS.local.md            # absent: nothing to amend, proceed

2. the message names the move:
   > "let's continue the example unit"

3. verify against the folder:
   $ grep -l "status: ACTIVE" sessions/example-unit/state.md
   sessions/example-unit/state.md  # the named unit is live

4. one candidate: no ask needed

5. read state.md WHOLE; refresh current_anchor to A2

6. the query: live = not closed, one subtraction.

   closure stamps (what they target):
   $ grep -E "SUPERSEDES:|CLOSES:" sessions/example-unit/journal.md
   sessions/example-unit/journal.md:19:  CLOSES: <date>-migration-dispatches

   the load dump (active bodies streamed directly; the closure side
   parses targets only, never reason prose):
   $ awk -f scripts/journal-active.awk \
     sessions/example-unit/journal.md sessions/example-unit/journal.md
   # streams each active entry and body in full; zero Read tool calls

   line 19's target is closed: it does not dump, and its resolution
   travels in the closer's WHAT. Everything else dumps in full, then
   stamped at step 7. A settled entry still in the dump is a missing
   closer: visible debt, closed at period end.

7. stamp:
   @anchor A2 ("continues A1", attention: <the loaded set>)

8. continue from next_action, following the invoked rhythm or the
   default design loop
```

### Work

Three movements, each with one home:

- **Events** land in the journal as they happen, appended, never revised.
  An entry carries its `ANCHOR` and `WHAT`, an agent-chosen `GROUP` thread,
  and a `KNOWLEDGE: true` flag when it is knowledge-worthy; it dies by
  reference, never by edit, has no status of its own, and the closer
  lands the moment it resolves.
- **Findings** land in the knowledge base at decision and discovery
  moments. A `REF` points at the full version in the journal or a
  report as a path and symbol, `journal.md#entry` or `reports/x.md#claim`,
  never at a file that changes; with no stable full version, the finding
  carries the whole story itself; a claim with neither is a hypothesis,
  and nobody plans on a hypothesis.
- **Re-plans** touch only what changed. The plan is edited surgically at
  re-plan moments; unchanged steps stay byte-identical; and the change
  is journaled in the same breath.

### Close

Two distinct ends:

- **Period end** (a turn ends; the unit continues): append events to the
  journal, closing the period's done events by reference; refresh
  `next_action` in `state.md` (one terse pointer, overwritten never
  prepended; the WHY rebuilds from journal open items, the plan's
  GROUNDED IN refs, and live findings, never pre-serialized into
  state); then the stray audit - the load list is the audit, and every
  listed entry that resolved this period closes now, verdict word and
  resolution in the WHAT; then the dangling check -
  `awk -f scripts/journal-dangling.awk sessions/<unit>/journal.md` must
  exit 0; every closure slug must name a real entry, a typoed closer is
  fixed before the period ends, never noted; then harvest: grep the
  period's KNOWLEDGE: true entries, propose one candidate per entry, and each confirmed candidate
  lands in knowledge.md while its entry closes by reference. The folder
  stays ACTIVE.
- **Unit close** (the plan completes, or the human ends the unit): append
  the closing events *and the next-move decision* to the journal, promote
  durable knowledge at the human's direction, re-read the files and
  confirm consistency, then mark the unit CLOSED.

### Handoff

The proof before context death. When a context is about to die
(compaction, tool change, long break): run the period-end writes, then
verify the boot greps resolve. A fresh boot must reconstruct the entire
position from files alone. A folder that contradicts the move, a load
command that will not run clean (a closure naming no entry), a
`next_action` that points at
finished work: each is a handoff failure, and catching one before
context death is exactly what the ritual is for.

---

## Working with the agent

- **Compose from the record.** Every rewrite, plan, and summary grounds in
  the journal and knowledge, never in the conversation. A plan rewrite
  reads its GROUNDED IN refs first.
- **Understand before acting.** The agent asks one grounded question at a
  time: what the decision is, how things look now, why it's asked. Each
  answer opens the next question, until the agent restates the goal in
  its own words and the human confirms it. Only then does work start.
- **Knowledge lands with approval.** A human verdict, decision, or rule
  is the signal to propose one compact candidate and ask confirm or
  reshape; "not landed" drops it; never re-ask an answered question.
  Journal entries carry a GROUP thread and a KNOWLEDGE flag; the flagged
  entries feed the close harvest.
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

For agents adopting contexture into a repository, see `ONBOARDING.md`.

For manual adoption:

1. Start on a dedicated branch (e.g. `adopt-contexture`). Copy `AGENTS.md`,
   `templates/`, and `scripts/` into your repository. That's the
   convention. This guideline stays out of it; it's the human's read.
   The copy carries a semantic version. MAJOR = breaking for existing
   artifacts (fields removed, shapes changed), MINOR = new sections and
   features, PATCH = fixes and wording. When upstream evolves, copy the
   new `AGENTS.md` and `templates/` again - your overlay and local files
   survive untouched; check MAJOR bumps against your overlay.
2. Configure `.gitignore` for your repository topology: in standalone
   repositories containing application code, append contexture private
   paths (`sessions/`, `rhythms/`, `AGENTS.local.md`); never deny by
   default across an existing codebase. In parent meta-workspaces,
   whitelist explicitly if tracking convention configuration alone.
3. Carve `AGENTS.workspace.md` (shared overlay) and `AGENTS.local.md`
   (personal amendments). Wire active harness entry points (`CLAUDE.md`,
   `GEMINI.md`) as symlinks to `AGENTS.md`.
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

- **Workspace overlay: shared adaptation, not fork.** `AGENTS.workspace.md`
  is the workspace's tracked overlay: @replace or @append per section,
  grammar in `templates/overlay.md`. It survives every sync untouched,
  and it wins over personal amendments.
  @replace is a last resort: the replaced base text still loads, so the
  agent holds two versions of one section and may follow either;
  performance degrades. Prefer @append; re-check replaced sections after
  each sync.

- **Rhythms: workflow patterns, in the artifact dialect.** A rhythm
  tells the agent the shape of a piece of work when invoked. It names
  the order and the outcomes, and it references the workspace's
  artifacts by name; it never re-specifies their grammars or prescribes
  their content.
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
