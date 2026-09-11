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
from vendors (bash, awk, and grep are the whole engine; any harness, any agent).

The workspace in one map:

- `AGENTS.md`: laws + navigation, auto-delivered every turn
- `.contexture/ONBOARDING.md`: agentic adoption guideline; instructions for agents installing contexture into a repository
- `.contexture/templates/`: seven grammars: six artifacts plus the workspace overlay
- `.contexture/scripts/`: cross-platform awk queries (active entry extraction, closure audit)
- `.contexture/sessions/<unit>/`: one folder per unit of work: `state.md` (the
  pointer), `backlog.md` (the intent), `journal.md` (the memory),
  `knowledge.md` (the mind), and `lanes/` (dispatch units)
- `AGENTS.workspace.md`: the workspace's shared overlay, replace or append per section; wins over local
- `AGENTS.local.md`: your amendments; amend, never contradict
- `.contexture/rhythms/`: workflow patterns, invoked never imposed

**Adopt in five minutes:**

1. For an agent adopting contexture, point it to `.contexture/ONBOARDING.md`. It executes branch isolation, topology assessment, safe gitignore setup, instruction migration, and harness symlinking.
2. For manual adoption: start on a dedicated branch; copy what the tag tracks - `git archive <tag> AGENTS.md .contexture/ | tar -x -C <your-repo>` - and set script permissions (`chmod +x .contexture/scripts/*.awk`).
3. Configure `.gitignore` for your topology: in standalone repos, ignore personal amendments (`AGENTS.local.md`) and choose whether to track or ignore `.contexture/sessions/` and `.contexture/rhythms/`; in parent workspaces, whitelist as appropriate.
4. Write `AGENTS.workspace.md` (shared overlay) and `AGENTS.local.md` (your amendments); both amend, never contradict. Wire harness symlinks (`CLAUDE.md`, `GEMINI.md`) to `AGENTS.md`.
5. Tell the agent what the first unit is; it bootstraps `.contexture/sessions/<unit>/` itself. Let the first boot run.

**Then it runs itself:**

- **Boot:** read the overlay and your amendments, name the move from the
  message, verify against the folder, run the query: entries minus
  closure targets load fully, all anchors; the anchor stamp receipts
  the loaded set
- **Work:** events append to the journal, findings land in knowledge
  with a REF, backlogs evolve non-destructively as work moves
- **Refresh:** the artifact sweep at rhythm boundaries and close -
  pointer, statuses, and the harvest: flagged entries land in
  knowledge or drop
- **Close:** period end refreshes (the harvest inside), closes the done
  events; unit end marks CLOSED and journals the next move
- **Handoff:** before context death, run the writes, cold-read the
  active stream as a fresh boot would, and verify
  `awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md` exits 0

The seven laws carry the whole design: files over conversation, load
only what the work touches, the schema holds the shape and the writer
holds the volume, govern output not process, compose from the record,
verify before close, harvest the human. The rest of this guide walks
the workspace itself, file by file, then a session running through it.

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

This workspace answers with a small set of plain files and tools every
agent has: bash, awk, grep, and read. Memory survives because it lives on disk.
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
   the conversation. Rewrites and task definitions ground in the journal and the
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
navigation; `.contexture/ONBOARDING.md`, the adoption guideline; `.contexture/templates/`, the
grammars; `.contexture/scripts/`, the query tools; and `AGENTS.workspace.md`, the
shared overlay. These are copied between teams and committed. This
guideline is the human's companion; read it once, keep it out of the repo.

**The private layer is the working state**: `.contexture/sessions/`, one folder per
unit of work; `.contexture/rhythms/`, personal workflow patterns, invoked not
imposed; and `AGENTS.local.md`, personal amendments.

| File | Layer | Role | Read when |
|---|---|---|---|
| `AGENTS.md` | shared | laws + navigation | every turn (auto-delivered) |
| `.contexture/ONBOARDING.md` | shared | agentic adoption guideline | during onboarding |
| `AGENTS.workspace.md` | shared | the workspace overlay, replace or append per section | at boot, before local |
| `.contexture/templates/` | shared | the grammars, one per artifact, each with its filled sample | write-time reference |
| `.contexture/scripts/` | shared | cross-platform awk queries (journal extraction, audit, rhythm index) | at boot, close, handoff |
| `AGENTS.local.md` | private | your amendments | at boot |
| `.contexture/sessions/` | private | one folder per unit of work | the active unit's files |
| `.contexture/rhythms/` | private | workflow patterns | when a rhythm is called |

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

- `@laws`: the slug-addressed laws that bind everything
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

It carries no schemas (those live in `.contexture/templates/`), no provenance (that
lives in the journal), and exactly one rhythm: the default design
loop, which any personal rhythm replaces.

**`AGENTS.workspace.md`** is the workspace's shared overlay, tracked with
the repo: @replace or @append per section, grammar in
`.contexture/templates/overlay.md`. It survives every sync untouched and wins over
personal amendments.

**`AGENTS.local.md`** is the one governance file the human owns: personal
rules, preferences, rhythm defaults. It is read at boot and kept tiny.
Its one hard rule: **amend, never contradict: the laws stand.** A local
"skip verification" is a contradiction, not an amendment.

**`.contexture/templates/`** pins seven grammars: six artifacts, each written to be
read *from*, never copied wholesale, and the overlay grammar for
`AGENTS.workspace.md`. Every grammar carries a filled sample in template
syntax at its foot. The four record files - state, backlog, journal,
knowledge - get their own sections below; the dispatch unit follows them.

### The unit

`.contexture/sessions/<unit>/` is one folder per piece of work. It outlives every
conversation that works on it, and it dies when the work is done, not
when a chat ends. Inside: the four record files (state, backlog, journal,
knowledge) plus `lanes/` (dispatch units, one folder per lane). The
folder itself is the context boundary: when the agent works on this
unit, it reads this unit's files and nothing else. The layout does the
bounding, so no rule has to say "don't read the rest."

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

### backlog.md: the intent

The unit's actionable tasks, structured as a living queue of `@task <slug>`
blocks with STATUS (`TODO | IN_PROGRESS | DONE`), OBJECTIVE, REFS, and
dedicated containers for substantive technical detail: DESCRIPTION,
ACCEPTANCE CRITERIA, and IMPLEMENTATION DETAILS. The unit's overarching
objective lives in `state.md`; `backlog.md` carries the actionable work.

The schema holds the shape, the writer holds the volume: DESCRIPTION
carries the problem statement, user intent, and scope; ACCEPTANCE
CRITERIA sets the verifiable gates; IMPLEMENTATION DETAILS holds the
specification and the execution blueprint - the requirements and decisions
the change must honor, and how it lands. Dedicated
containers give technical substance a natural home without resorting to
unnatural exit criteria multiplication.

REFS references the persisted surfaces only: journal items
(`journal.md#slug`), lane reports (`lanes/x/report.md#claim`), and
knowledge findings (`knowledge.md#NAME`) - never a volatile file. It
is the same rule the knowledge REF obeys: a persisted fact, not a
drifting pointer, so each task reads with the full picture no matter
when the agent looks. Tasks compose from the record (Law 5): material
living only in the conversation lands in the record first, then the
task cites it.

Unlike a rigid sequential waterfall, the backlog evolves non-destructively:
mid-stride pivots, ad-hoc bug fixes, or new tasks simply insert or append
as fresh `@task` blocks without destroying or rewriting uncompleted tasks.
Active work transitions to `STATUS: IN_PROGRESS`; when a task completes, its
status flips to `DONE` and the journal gains one line ("backlog/<slug>: DONE").
When all tasks reach `STATUS: DONE` and the unit exit criteria are met, the
unit is ready to close or move to the next chapter.

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
stable within the unit), a REF pointing to an artifact symbol
(`path#symbol`) for grounding, and a KNOWLEDGE: true flag when they are
knowledge-worthy. An entry that awaits something (a verdict, an
execution, a report, the harvest) stamps THREAD: true at birth and
closes the moment the awaited thing arrives; unmarked entries are
receipts, the final word on a completed fact: they take no closer and
stay open as the boot's context trail, folding only when the human
calls a chapter turn or the unit closes.

Why the journal exists: it rebuilds the working context from scratch. A
fresh boot loads the active entries - what no closure names - and
nothing else, and holds the position without the conversation.
Understanding that reader is understanding what to record: whatever the
reconstruction needs. No list substitutes for that understanding, and a
list would only confine the record to the list. So events land at
formation, never batched at period end: the interaction beats journal
as they happen, and the work beats never wait for them. An entry
carries its substance - what happened, the result, why the next step
follows - and the dialect exists to make that cheap: the token-efficient
form preserves the context window while minimizing info loss. Record
fully, without worry; the compression serves the pour, never caps it.

Why it works this way: the conversation is the least durable thing in
the system, and compaction, a lossy summarization, is where it dies. A
record that gets revised is no longer a record; a record that only grows
survives every compaction intact. The period stamps are how time itself
is recorded: one line per working period, naming the period and
receipting the loaded set. The stamps order the periods; liveness lives
in the closures alone - what no closure names is live.

### knowledge.md: the mind

Findings, written at the moment of a decision or a discovery. Each
finding is a NAME, a SUMMARY, an optional SUPERSEDES ref (naming an
earlier finding and reason when superseded), and an optional REF.
Findings are statusless: developing ideas stay in the journal, so every
finding that lands is an established decision or discovery. The REF
points at the full version in an append-only artifact, as a path and
a symbol: `journal.md#entry` or `lanes/x/report.md#claim`. A dynamic file
may never be the reference of record. Where no stable full version exists,
the finding carries the whole story itself; a claim with no REF and no
story is a hypothesis: useful for questions, never a base for tasks.
A finding lands only via the harvest of a KNOWLEDGE: true entry: the
agent proposes one compact candidate, the human confirms or reshapes,
and the entry closes by reference. Until it lands, a developing idea
stays in the journal as events. Knowledge carries no timeline; the
journal owns time, and the REFs are the seam between the two.

*In practice:* a finding that reads "agents skip cross-checks" is a
hypothesis. The same finding with a REF pointing at the journal entry
that produced it is a fact.

### lanes: the dispatch unit

When the agent hands work to a second agent, a subagent, the dispatch
is encapsulated in its own unit folder: `lanes/<slug>/`. Inside:
`recipe.md` (the brief), `journal.md` (the incremental execution trace),
and `report.md` (the evidence).

The recipe is the brief: it slices the parent's attention into exact
symbols, entry slugs, line ranges, and isolated FACTS (one per line);
broad folder dumps are forbidden. It specifies sequenced TASKS with
exit conditions and fences writes to `WRITE_SCOPE`. The lane writes
its execution trace incrementally to `journal.md` before taking actions.
The report is the evidence: an `@orientation` block that directly
mirrors recipe TASKS with proven exit conditions and flags LOAD_BEARING
claims for parent re-verification; followed by `@claim` blocks with
mandatory epistemic MARK (VERIFIED, INFERRED, or ABSENT),
verbatim EVIDENCE, and structural DETAILS (what the dispatcher needs
to re-verify and decide; omit ornament, never substance); ending with
typed `@risks` (UNVERIFIED and THIN).

The dispatch unit exists because nothing is believed on trust and
agents can terminate at any moment. The brief lives on disk, not in
conversation, because a message-brief dies at compaction. If a lane
crashes or terminates mid-flight, `journal.md` preserves the exact
resume point: re-dispatch resumes directly from the lane folder,
continuing from the last uncompleted task rather than rebuilding from
scratch. And the dispatcher reads `report.md` whole and re-checks
load-bearing claims itself: a helper's "passed" is never the gate.
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
comment. The dialect governs form, never volume: it compresses how
things are written, never how much gets written - the schema holds the
shape, the writer holds the volume. The grammars name the elements an
artifact must carry; the rest is freestyle, nudged by one generic rule:
record comprehensively. `status:` on the status card (`status: ACTIVE | CLOSED`)
is the only status field in the convention; journal entries and
findings are statusless. Spellings are contractual, not stylistic:
a pointer names its target exactly - the section and step (`@refresh`)
or `path#symbol` - and a vague prose mention is a defect. Rhythms are
written in this same dialect; "Adopting it" explains the
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
2. **Boot unconditionally.** The first message of a fresh context is a
   boot by definition, whatever its shape: a boot request, a dumped
   task, a question. The message is the move signal, and nothing loads
   and nothing works before the boot reads it.
3. **Get the field and match.** One grep lists the candidates:
   `grep -rl "status: ACTIVE" .contexture/sessions/*/state.md`. Read the message
   against them: a close match proposes continuing that unit; no match
   proposes bootstrapping a new one.
4. **Propose the move and wait.** The proposal goes to the human before
   anything works - even a message naming its unit explicitly gets the
   proposal stated as a confirmation. The reply settles the unit:
   an active unit continues at step 5; a new unit bootstraps at step 10.
5. **Read state, refresh the anchor counter.** Read `state.md` whole. It
   is small by law, and detail lives behind refs, never inside it.
   Refresh `current_anchor` to the next value (`N = previous + 1`).
6. **Read the backlog, run the query, and load.** Read `backlog.md`, then the
   rhythm index - `awk -f .contexture/scripts/rhythms-index.awk .contexture/rhythms/*.md` prints one
   line per rhythm (name, path, `use when:`, activation); bodies load only
   on selection. Then the load rule, one subtraction: **live = not closed.** The load list is
   every journal entry whose slug no `CLOSES:` or `SUPERSEDES:` names,
   whole file, all anchors. Anchors are period ordering and load
   receipts, never liveness; no entry loads or skips by its anchor.
   `.contexture/scripts/journal-active.awk` extracts and streams each active entry's
   full body directly bounded by the next entry or anchor line in one
   shot, with zero `Read` tool loops and no spanning reads:

   ```bash
   awk -f .contexture/scripts/journal-active.awk .contexture/sessions/<unit>/journal.md .contexture/sessions/<unit>/journal.md
   ```

   The closure extraction parses the target field only - a slug
   mentioned in the reason prose must never close anything.

   The output is the set; no hand-picking. A settled entry still in it
   is a missing closer - visible debt the period end settles. Knowledge
   loads fully (small, every line a settled decision); supersession
   operates via a successor finding's `SUPERSEDES:` line.
7. **Ground check.** Run `git status -sb`. The working tree and the
   upstream delta are facts the record must carry: uncommitted changes
   and unpushed commits reconcile against the bookkeeping before work
   continues, and git wins over the record - the session files are
   claims, the tree is evidence. A mismatch journals as work (receipts
   for the unrecorded changes), never as a note.
8. **Stamp the load receipt.** Append to `journal.md`:
   ```
   @anchor A<N> ("continues A<N-1>", attention: <the loaded set>)
   ```
   The stamp names what was loaded, so `grep "^@anchor"` reconstructs
   both the map and the receipts. Receipts inform; they never feed the
   next boot's load - the subtraction does.
9. **Continue.** From `next_action`, following the human-invoked rhythm,
   or the default design loop. If `next_action` says "backlog the next
   task", the backlog phase starts.
10. **New work bootstraps a unit.** The agent creates
   `.contexture/sessions/<slug>/state.md` with `status: ACTIVE`,
   `current_anchor: A0`, and `next_action: "backlog the first task"`, then
   continues at step 5, and the first boot stamps A1.

A boot, concretely. The nine active steps, overlay and amendments first (the
unit here is any unit):

```
1. read AGENTS.workspace.md        # absent: nothing to overlay, proceed
   read AGENTS.local.md            # absent: nothing to amend, proceed

2. boot unconditionally - the first message is the move signal whatever
   its shape:
   > "let's continue the example unit"

3. get the field and match:
   $ grep -rl "status: ACTIVE" .contexture/sessions/*/state.md
   .contexture/sessions/example-unit/state.md  # one active unit; the message
                                   # matches it closely

4. propose the move and wait:
   "this reads as continuing the example unit - proceeding"  # a clear
   message gets a stated confirmation; a dumped task gets the proposal
   and the question

5. read state.md WHOLE; refresh current_anchor to A2

6. the query: live = not closed, one subtraction.

   closure stamp in the journal (what pass 1 collects):
   .contexture/sessions/example-unit/journal.md:19:  CLOSES: <date>-migration-dispatches (done: migration completed)

   the load dump (active bodies streamed directly; the closure side
   parses targets only, never reason prose):
   $ awk -f .contexture/scripts/journal-active.awk \
     .contexture/sessions/example-unit/journal.md .contexture/sessions/example-unit/journal.md
   # streams each active entry and body in full; zero Read tool calls

   line 19's target is closed: it does not dump, and its resolution
   travels in the closer's WHAT. Everything else dumps in full, then
   stamped at step 8. A settled entry still in the dump is a missing
   closer: visible debt, closed at period end.

7. ground check:
   $ git status -sb
   ## main...origin/main  # synchronized, tree clean; the record's
                          # claims match the evidence

8. stamp:
   @anchor A2 ("continues A1", attention: <the loaded set + the git state>)

9. continue from next_action, following the invoked rhythm, the
   matching rhythm on its trigger, or the default
```

### Work

Three movements, each with one home:

- **Events** land in the journal as they happen, appended, never revised.
  An entry carries its substance - what happened, the result, why the
  next step follows - with its `ANCHOR` and `WHAT`, an agent-chosen
  `GROUP` thread, and a `KNOWLEDGE: true` flag when it is
  knowledge-worthy; it dies by reference, never by edit, has no status
  of its own, and the closer lands the moment it resolves. The
  interaction beats journal as they happen; the work beats never wait
  for an interaction beat.
- **Findings** land in the knowledge base at decision and discovery
  moments. A `REF` points at the full version in the journal or a
  report as a path and symbol, `journal.md#entry` or `lanes/x/report.md#claim`,
  never at a file that changes; with no stable full version, the finding
  carries the whole story itself; a claim with neither is a hypothesis,
  and nobody tasks on a hypothesis.
- **Backlog evolution** is non-destructive. Newly discovered work inserts
  or appends as a fresh @task; existing tasks keep their status; and the
  update is journaled in the same breath.

### Close

Two distinct ends:

- **Period end** (a turn ends; the unit continues): first run `@refresh` -
  the events journaled, the backlog statuses advanced, `next_action`
  refreshed in `state.md` (one terse pointer, overwritten never prepended;
  the WHY rebuilds from journal open items, the backlog's active tasks,
  and live findings, never pre-serialized into state), the harvest run
  (every open flag: one candidate each; confirmed candidates land in
  `knowledge.md` while their entries close by reference; unconfirmed
  candidates drop), the journal audit run; then close the period's done
  events by reference; run the stray audit (the thread tail printed by
  the journal audit is the checklist, and every open THREAD that resolved
  this period closes now, verdict word and resolution in the WHAT;
  receipts never close at period end, they fold only at a human-called
  chapter turn or at unit close); run the journal audit
  (`awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md` must
  exit 0; it flags the broken entries - dangling or slugless closers,
  dateless slugs, inline markers - with line numbers; the audit is a
  repair instrument: fix what it flags and fill what is missing before
  the period ends, never noted). The folder stays ACTIVE.
- **Unit close** (the backlog completes, or the human ends the unit): append
  the closing events *and the next-move decision* to the journal, re-read
  the files and confirm consistency (@laws#verify-before-close), promote durable knowledge at
  the human's direction, then mark the unit CLOSED.

### Handoff

The proof before context death. When a context is about to die
(compaction, tool change, long break): run the period-end writes if
they are not done, then verify with the cold read: run
`awk -f .contexture/scripts/journal-active.awk .contexture/sessions/<unit>/journal.md .contexture/sessions/<unit>/journal.md`
and read the stream as a fresh boot would - the record must reconstruct
the position without the conversation. While the context is still full,
improve the quality and fix what was missed; the gaps close now, never
after compaction. And `awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md`
exits 0. The handoff check also sweeps the whole open list: every open
entry is confirmed as a live thread or a legitimate receipt, and a
resolved thread hiding without its marker closes here, the net that
catches a forgotten stamp. A folder that contradicts the move, a
dangling closer (failing `journal-audit.awk`), a `next_action` that
points at finished work: each is a handoff failure, and catching one
before context death is exactly what the ritual is for.

---

## Working with the agent

- **Compose from the record.** Every rewrite, task, and summary grounds in
  the journal and knowledge, never in the conversation. A task definition
  reads its REFS first; the refs name the persisted surfaces
  only - journal items, lane reports, knowledge findings, never a
  volatile file.
- **Understand before acting.** The agent asks one grounded question at a
  time: what the decision is, how things look now, why it's asked. Each
  answer opens the next question, until the agent restates the goal in
  its own words and the human confirms it. Only then does work start.
- **Knowledge lands with approval.** A human verdict, decision, or rule
  is the signal to propose one compact candidate and ask confirm or
  reshape; "not landed" drops it; never re-ask an answered question.
  Journal entries carry a GROUP thread and a KNOWLEDGE flag; the flagged
  entries feed the refresh harvest.
- **The human may interrupt; a queued message doesn't kill the act.**
  Complete the act in flight, then address the message. Halt only on an
  explicit stop, hold, or redirect.
- **Dispatch is a contract.** Every subagent dispatch:
  1. gets its own unit folder (`lanes/<slug>/`) with a brief on disk
     (`recipe.md`) that slices parent context (exact refs, FACTS one per
     line; broad dumps forbidden), sequences TASKS with exit conditions,
     and fences writes (`WRITE_SCOPE`). A message-brief dies at compaction;
     a file survives.
  2. writes its execution trace incrementally to `journal.md` as tasks
     progress. If a lane is interrupted or terminates, the journal preserves
     the exact resume point.
  3. runs in the background; the turn ends at launch; the conversation
     never blocks on a lane.
  4. runs against the recipe, never improvising. On drift, the lane stops
     and reports what it found, where it stands, and where it drifted;
     pause-and-ask where possible, abort gracefully where not.
  5. lands both `journal.md` and `report.md` no matter how the lane ends.
     A re-dispatch resumes directly from the lane folder, continuing from
     the last uncompleted task, never rebuilding from scratch.
  6. returns the artifact verbatim if it cannot write the file itself:
     nothing before, nothing after. The dispatcher persists it byte-clean.
  7. is read WHOLE by the dispatcher, no exception; an unread part wears
     the look of review.
  8. is never believed on its own word. The lane's "passed" is never the
     gate; the dispatching agent re-verifies the load-bearing claims
     itself.
  And every dispatch is journaled in the session journal: an entry
  carrying the lane folder path.

---

## Adopting it

For agents adopting contexture into a repository, see `.contexture/ONBOARDING.md`.

For manual adoption:

1. Start on a dedicated branch (e.g. `adopt-contexture`). Copy `AGENTS.md` and
   `.contexture/` into your repository, and set script permissions
   (`chmod +x .contexture/scripts/*.awk`). That's the convention.
   This guideline stays out of it; it's the human's read.
   The copy carries a semantic version. MAJOR = breaking for existing
   artifacts (fields removed, shapes changed), MINOR = new sections and
   features, PATCH = fixes and wording.

   **Updating.** This base evolves upstream, and updates are judgment,
   not a script: its changes are semantic - grammars, laws, boot,
   dispatch - and every workspace differs. The installed version is the
   header line of the base's AGENTS.md. The path: fetch the upstream
   tags (`git fetch https://github.com/ahmetegesel/contexture.git --tags`),
   read the CHANGELOG from your installed version to the target - what
   changed and why; read your own workspace - the overlay's @replace
   blocks, live sessions, in-flight artifacts; then decide: adopt now,
   migrate first, or wait. When adopting, the synced set is derived, never
   listed: copy what the tag tracks -
   `git archive <tag> AGENTS.md .contexture/ | tar -x -C <target>` - and
   verify with `git ls-tree -r --name-only <tag> -- AGENTS.md .contexture/`
   plus a cmp per file; the drawer holds what the convention uses - the
   synced set plus the workspace's sessions and rhythms - and nothing else;
   overlays are never in that path; `git diff` shows the human the changed
   base;
   the workspace's instruments verify the result (boot query, dangling
   audit, ground check); MAJOR tags demand the overlay's review. This
   guidance is kept current in the README at every tag - follow it fresh
   each time; the decision is always the agent's, weighed against the
   workspace's situation.
2. Configure `.gitignore` for your repository topology: in standalone
   repositories containing application code, never deny by default across
   an existing codebase; append personal amendments (`AGENTS.local.md`) and
   decide with the team whether to track or ignore `.contexture/sessions/` and `.contexture/rhythms/`.
   In parent meta-workspaces, whitelist explicitly if tracking convention
   configuration alone.
3. Carve `AGENTS.workspace.md` (shared overlay) and `AGENTS.local.md`
   (personal amendments). Wire active harness entry points (`CLAUDE.md`,
   `GEMINI.md`) as symlinks to `AGENTS.md`.
4. Create `.contexture/sessions/`, then tell the agent the first unit's name and
   goal; the agent bootstraps the folder itself. The best first unit is
   the convention itself: adopting, tweaking, and living with it is the
   richest possible workload for testing it. Journal every break; harvest
   the lessons into findings; let the design end when use teaches more
   than refinement.
5. Let the first boot run. The agent reads your amendments, names the
   move from your message, verifies it against the folder, stamps the
   anchor, reads the backlog, and continues from `next_action`.

Extending it, without breaking it:

- **Workspace overlay: shared adaptation, not fork.** `AGENTS.workspace.md`
  is the workspace's tracked overlay: @replace or @append per section,
  grammar in `.contexture/templates/overlay.md`. It survives every sync untouched,
  and it wins over personal amendments.
  @replace is a last resort: the replaced base text still loads, so the
  agent holds two versions of one section and may follow either;
  performance degrades. Prefer @append; re-check replaced sections after
  each sync.

- **Rhythms: workflow patterns, in the artifact dialect.** A rhythm
  tells the agent the shape of a piece of work when invoked. It names
  the order and the outcomes, and it references the workspace's
  artifacts by name; it never re-specifies their grammars or prescribes
  their content. A rhythm replaces task progression only; artifact
  invariants (`@record`, `@laws`: journaling transitions, advancing
  `next_action`, harvesting verdicts) hold across every rhythm. Work
  patterns never live in the per-turn surfaces: interaction rules need
  every-turn delivery, work patterns need per-boot delivery in
  .contexture/rhythms/ (their trigger index loads at boot; the bodies load on selection) - a workflow written into an AGENTS.md taxes every single
  turn forever. That delivery split is also the onboarding move: the
  step-by-step workflows found in a workspace's instruction stack are
  the first rhythm candidates, proposed for extraction when the
  installation plan is presented.

  When no rhythm is invoked, the agent runs the default design loop:
  1. `DISCUSS`: explore problem space; grounded questions resolve intent
  2. `DECIDE`: human verdict settles; triggers harvest candidate
  3. `BACKLOG`: intent updates `backlog.md`; `next_action` points to active task
  4. `EXECUTE`: work active task; drift updates `backlog.md` in same breath
  5. `VERIFY`: task acceptance criteria proven; journal records completion, `next_action` advances
  6. `REFRESH`: run `@refresh`

  A human rhythm replaces progression. A rhythm declares its match and
  its ask up front: `use when:` carries triggers only - never a workflow
  summary, which becomes the shortcut an agent follows instead of the
  steps; `activation: propose | auto` decides whether the agent proposes
  the rhythm before applying it (the default) or applies it on trigger
  after the team opts in.

  Custom rhythms are written in
  the same dialect as the artifacts: typed blocks, column 0, indent 2,
  contract words spelled once. One line per step, the form `N. GATE: outcome`,
  no per-step sub-blocks. Token-efficient, not short: a rhythm may carry as
  much as a skill would, but structured and denser than prose. That is the
  whole point of the dialect: structure is what LLMs parse best, typed
  blocks carry meaning per token, and prose is where misreadings live.
  An example:

  ```
  @rhythm ship-pack
    use when: a change is tested and ready to land through review
    activation: propose
    1. CODE: the change lands with its own tests
    2. GUARDS: suite + lint + typecheck, always, mechanical, before any review
    3. REVIEW: dispatch a review lane, fresh context, independent;
       its findings are the hardening checklist
    4. HARDEN: dispatch a hardening lane driven by those findings;
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
