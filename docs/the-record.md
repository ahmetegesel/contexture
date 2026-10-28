# The record

The conversation is a scratchpad; the record is the memory. When a context window fills, the harness compacts the session into a summary, and everything behind the next step (what was decided and why, what was ruled out, what was corrected, what was verified, what is still open) dies with it. The record is the layer that does not die: structured domain entities, maintained by the agent as the work happens, next to the code.

## Storage abstraction and entity domains

Under @laws#source-of-truth the record is the only source of truth, and the configured storage backend holds it: one authoritative store. The engine completely decouples session machinery from physical disk layouts and file formats. Every verb reaches the record through the configured driver and nothing else, so the record is one store whichever driver holds it. Base maps every command to one storage function and renders the typed data it returns, and each backend stores the record its own way and enforces the record rules itself. The data model is one for every backend: every item answers typed fields and reads in one canonical layout (field order, spacing, and quoting are layout, never data), and an item stored in an older shape keeps every value in named fields (a legacy status, extra fields, head text, extra lines), so every backend returns the same data and prints the same text for the same record, and an older record reads back with nothing lost. In the default POSIX driver each artifact is a markdown file in its unit folder, written in the record grammar below; a store backend such as the storage-fts5 plugin keeps the record in its store, described in its module README. No command moves a record between backends: a record reaches another backend through the agent re-entering it with the ordinary verbs, so a store other than posix holds only what the verbs write and older record shapes live in posix files alone.

For agents, under @laws#cli-doorway, the record is an abstract structured domain surface, never raw files on disk: agents reach it strictly through the `ctx session` and `ctx lane` verbs, never reading, editing, or grepping storage files or database tables directly.

The record comprises five distinct entity domains:

| domain | role | how it changes |
|---|---|---|
| session state | the pointer: where the unit stands and what happens next | overwritten freely; updated via stamp, next, refs, close, reopen, task start |
| backlog tasks | the declaration: the work declared ahead | mutated atomically via typed task commands; living queue |
| journal events | the memory: what happened, as it happened | immutable append-only event stream; closed by later reference |
| durable findings | the mind: settled architectural truths and decisions | full lifecycle CRUD; updated or superseded forward |
| subagent lanes | delegation sandboxes: isolated recipe, trace, and report | managed directly via top-level lane commands |

In the POSIX baseline driver, these domains map to four files and the lanes folder:

| file | physical role in POSIX driver |
|---|---|
| `state.md` | state card: status, current anchor, next action, objective, repos, refs |
| `backlog.md` | task queue: multiline containers for description, criteria, details |
| `journal.md` | event log: chronological entries stamped with anchor and thread |
| `knowledge.md` | findings store: settled findings with references and summaries |
| `lanes/<lane>/` | subagent directories holding recipe.md, journal.md, and report.md |

## Session state, the pointer

The session state is the map, not the content: detail lives behind references, never inside the state itself.

```text
status: ACTIVE
current_anchor: A12
next_action: "one terse pointer: what to do next"
objective: "what the unit is for"
repos: [app, docs]
ref_sessions: [design-notes]
```

- `status:` is `ACTIVE` or `CLOSED`.
- `current_anchor:` is the current value of the anchor counter, `A<N>`. A fresh unit starts at `A1`, the bootstrap's folded first anchor, and each stamp adds one.
- `next_action:` is one terse pointer, overwritten never prepended. The why behind it rebuilds from the record; when the unit sits between plans, it reads "plan the next move".
- `objective:` is what the unit is for. Both it and `next_action` are one quoted line: an embedded double or single quote is text, an embedded newline refuses.
- `repos:` lists affected repositories.
- `ref_sessions:` lists optional read-only reference sessions mounted at boot; boot loads their knowledge and active journal.

The pointer mutates often: it is refreshed as the work moves, at every backlog update, task landing, and period end. It is updated via `ctx session stamp`, `ctx session next`, `ctx session refs`, `ctx session close`, `ctx session reopen`, and `ctx session task start` (which writes the pointer with the start); after `next` or a start, `next_action` must name every `IN_PROGRESS` task, else the write refuses.

The state carries no date. Recency is journal-derived: a unit's `last_event` is the date its last main-journal item carries, so the field stays current without a state write and `ctx session active` orders it newest first. A unit whose last item carries no date answers null, and lane journals never enter the derivation.

## Backlog tasks, the declaration

The backlog holds actionable tasks as a living queue: the current declaration of work, written to be executed from no matter when the agent looks. Tasks advance, update, and drop as the work teaches; the journal holds the history; the unit objective lives in the session state.

```text
@task auth-cookie-sessions
  STATUS: IN_PROGRESS
  OBJECTIVE: "Replace the token cache with cookie sessions"
  REFS: [entry#2026-09-12-auth-cookie-decision, finding#SESSION_TOKEN_SHAPE, file#src/auth/middleware.ts]
  DESCRIPTION ::
    context, the problem statement, and the scope
  ACCEPTANCE CRITERIA ::
    checkable conditions that say when the task is done
  IMPLEMENTATION DETAILS ::
    the specification and the execution blueprint:
    requirements to honor, decisions made, how it lands
```

Three fields carry the task's identity: `STATUS` (`TODO`, `IN_PROGRESS`, `DONE`), `OBJECTIVE`, and, when present, `REFS`. Three block containers carry technical substance:

- `DESCRIPTION` carries context, problem statement, and scope.
- `ACCEPTANCE CRITERIA` carries checkable done conditions.
- `IMPLEMENTATION DETAILS` carries specifications, architectural constraints, and execution blueprints.

### Semantic task operations

Agents mutate the backlog through typed CLI verbs, the only write inputs (no markdown block crosses the command interface):

- `ctx session task add <unit> <slug> --objective="..." [--desc="..."] [--criteria="..."] [--details="..."] [--refs="..."]`: creates a task in `TODO` status.
- `ctx session task update <unit> <slug> [--objective="..."] [--desc="..."] [--criteria="..."] [--details="..."] [--refs="..."]`: updates the given fields in place; `--refs` replaces the list and `--refs=""` clears it; an update carrying no field refuses rc 1.
- `ctx session task start <unit> <slug> [--pointer="..."]`: atomically moves a `TODO` task to `IN_PROGRESS` and writes `next_action`.
- `ctx session task complete <unit> <slug> --evidence="..."`: atomically moves a `TODO` or `IN_PROGRESS` task to `DONE` and records its completion receipt (`<date>-<slug>-completed`, `WHAT: "backlog/<slug>: DONE (<evidence>)"`) in the journal.
- `ctx session task reopen <unit> <slug>`: moves an `IN_PROGRESS` or `DONE` task back to `TODO`.
- `ctx session task drop <unit> <slug> [--reason="..."]`: removes the task and records its drop receipt (`backlog/<slug>: DROPPED (<reason>)`) in the journal; an `IN_PROGRESS` task the pointer names refuses.
- `ctx session task list <unit> [--status=todo|progress|done|all]`: lists tasks matching the filter.
- `ctx session task show <unit> <slug>`: prints the task's canonical block, its `REFS` included (a legacy task too, every value kept).

The storage driver enforces the status moves: any other move refuses with the task unchanged. The raw block verbs of earlier releases (`append`, `amend`, `flip`, `drop`) retired in v0.55.0; each name prints its replacement.

A task marked `IN_PROGRESS` is executable as written: every needed decision lives in the task or behind an abstract reference. Placeholders (`TBD`, "similar to <task>", "as appropriate") mean the task is not ready.

## Journal events, the memory

The journal is the unit's chronological event trace and recording surface: events land as they happen, and the record only gains entries. It exists to rebuild the working context from scratch. A fresh session loads the live entries and nothing else.

```text
@anchor A12 2026-09-29

@entry 2026-09-12-auth-cookie-sessions
  ANCHOR: A12
  WHAT: "backlog/auth-cookie-sessions: DONE. Token cache retired; suite green (42/42)"
  GROUP: auth
  RHYTHM: work 6 EXECUTE
  THREAD: none
  REF: "lane#auth-refresh/report#claim"
  CLOSES: 2026-09-05-token-cache-introduced (done: replaced by cookie sessions)
  KNOWLEDGE: true
```

Fields on journal entries, in the canonical order every read prints and the record verbs write (an older entry stored in another order reads in this order, every value kept):

- `@entry <date>-<slug>` opens an entry block. Slugs end alphanumeric.
- `ANCHOR:` identifies the working period.
- `WHAT:` carries the event substance: what happened, the result, why the next step follows. It is one quoted line; an embedded double quote is part of the text (`record` writes it), while an embedded newline is refused on every write.
- `GROUP:` topic thread identifier, stable within the unit.
- `RHYTHM: <name> <N> <GATE>` records process milestones.
- `THREAD: <what it awaits>` names external acts awaiting completion, or `none` for receipts.
- `REF: "target#symbol"` grounds the event in an artifact; an entry may carry several. A reference takes one of two shapes, `<target>#<symbol>` or a whole target path holding a `/` and ending in a name (`lanes/<lane>/recipe`; a root-level file as `./README.md`, or `README.md#<section>`; a lone `/`, a trailing `/` as in `lanes/`, and `./` name no target), one token without blanks, control characters, or double quotes (an ASCII control byte such as a form feed or a vertical tab counts as a blank, and so does a Unicode blank such as a no-break space or U+2028); the verbs refuse any other value on a new write, naming both shapes, and a legacy value reads as stored.
- `CLOSES:` or `SUPERSEDES:` closes an earlier entry by reference with a verdict word and reason. One line may name several targets (`CLOSES: <slug> <slug> (folded: reason)`) and an entry may carry several closer lines; every date-slug before the first spaced paren or spaced hyphen is a target.
- `KNOWLEDGE: true` flags entries for durable knowledge harvesting.

### Semantic event recording

Agents record events via `ctx session record`:

```bash
.contexture/ctx session record <unit> --what="..." [--group=...] [--thread=...] [--rhythm="<name> <N> <GATE>"] [--ref=...]... [--closes=...]... [--supersedes=...]... [--knowledge] [--slug=...]
```

The command sends the current local date and time, the storage driver takes the active anchor from the state and composes the slug (`<date>-event-<epoch>`, a held slug taking `-1`), and `THREAD` defaults to `none` if omitted. `--ref`, `--closes`, and `--supersedes` repeat, one line each. `--closes` and `--supersedes` take only the explicit form `<slug> (<verdict>: <reason>)` (one or more target slugs before the parenthesis, each naming an entry the journal already holds, as in `--closes="<slug> <slug> (dropped: reason)"`), the verdict one of `done`, `superseded`, `dropped`, `folded` and the reason non-empty; a bare target list refuses rc 1 naming the form, since the closer carries the resolution itself, and a reason holding a parenthesis refuses naming the rule. Every flag value lands as one line of the entry block, so a value carrying a newline (or a carriage return) is refused rc 1 before any write; the same holds for every one-line field of the typed verbs (`task` objective, refs, pointer, evidence, reason; `finding` ref and supersedes; `lane record` what, thread, slug), while the block scalars (`--desc`, `--criteria`, `--details`, `--summary`) keep their newlines as body lines. An entry already in the journal reads in the canonical layout, every value kept, and its file bytes stay as they are. One quote rule holds for every one-line quoted field (`WHAT`, a task `OBJECTIVE`, the `next_action` pointer, the state `objective`) on every write path: an embedded double quote is text (the typed verbs, `next`, and `bootstrap` store it), and every reader returns it verbatim.

To inspect entries:
- `ctx session entry show <unit> <slug> [--json]`: prints the entry's canonical block (every field it carries); `--json` prints the typed entry: its fields, `refs` as a list, its closers, and the closure derived by position (`closed`, `closed_by`, `close_reason`).
- `ctx session entry list <unit> [--anchor=A<N>] [--group=...] [--json]`: one line per entry occurrence, open or closed.
- `ctx session entry closure <unit> <slug> [--json]`: whether the entry is closed, and every later closer naming it with its line.

## Durable findings, the mind

Findings hold what the unit settled: validated truths, architectural decisions, and rejected hypotheses. Developing ideas stay in the journal; actionable intents take task form in the backlog.

Unlike immutable journal events, findings support full lifecycle CRUD:

- `ctx session finding add <unit> <NAME> --summary="..." [--ref=...]... [--supersedes=...]`: adds a new finding, active until a later finding supersedes it.
- `ctx session finding show <unit> <NAME>`: prints the finding's canonical block, with `SUPERSEDED_BY: <successor>` after its head when a later finding supersedes it.
- `ctx session finding update <unit> <NAME> [--summary="..."] [--ref=...]...`: updates the summary, the references, or both in place when concepts are refined (either flag alone works); `--ref` repeats and replaces the whole list; an update carrying no field refuses rc 1.
- `ctx session finding supersede <unit> <old-name> <new-name> --summary="..." [--ref=...]...`: adds the successor finding carrying `SUPERSEDES: <old-name>`, maintaining audit lineage; a missing predecessor refuses rc 1.
- `ctx session finding drop <unit> <NAME>`: removes an invalidated finding.
- `ctx session finding list <unit> [--active-only]`: lists all findings, optionally leaving out the superseded ones.

```text
@finding SESSION_TOKEN_SHAPE
  SUPERSEDES: TOKEN_REFRESH_REUSE (cookie sessions replaced token refresh, 2026-09-12)
  REF: "entry#2026-09-12-auth-cookie-decision"
  SUMMARY ::
    Sessions are carried in cookies; refresh-token reuse is rejected and
    must not return.
```

- `@finding NAME` opens the block with uppercase alphanumeric naming.
- `SUPERSEDES: <NAME> (reason)` records forward-only supersession.

The fields stand in the canonical order every read prints and the finding verbs write (`SUPERSEDES`, `REF`, `SUMMARY`); an older finding stored with `SUMMARY` first reads in this order.
- `REF: "target#symbol"` grounds the finding in append-only artifacts (`entry#slug` or `lane#slug/report#claim`).
- `SUMMARY ::` carries the settled claim.

Findings land through the harvest of `KNOWLEDGE: true` entries: the agent forms a compact candidate, lands it when it meets the bar, and the entry closes by reference; a candidate that does not drops.

## Abstract entity references and resolution

A REF names its target exactly in one of the two pointer shapes of the laws' references rule (@record references; the REF line above). The resolve verb reads an entity reference in domain notation:

- Tasks: `task#<slug>`
- Journal entries: `entry#<slug>`
- Findings: `finding#<NAME>`
- Subagent claims: `lane#<lane-slug>/report#<claim-slug>`

The resolution verb resolves references directly:

```bash
.contexture/ctx session resolve <unit> <ref>
```

When given legacy file-based paths (such as `knowledge.md#NAME`, `journal.md#slug`, `backlog.md#slug`), the CLI normalizes them transparently to entity lookups. Agents author pure entity syntax natively.

## Universal search and snippet consumption

Universal search operates across all entity domains; every search names its mode (`--mode` is required, with no default: `exact` on every driver, or a mode the configured driver declares, which `ctx session diagnose` lists):

```bash
.contexture/ctx session search <unit> "<query>" --mode=MODE [--limit=N] [--entity=TYPE] [--json]
```

Every driver returns the same keys per result (`entity_type`, `entity_id`, `section`, `snippet`, `score`), so a caller never branches on the backend; `--limit` caps the results, `--entity` keeps one entity type, and a mode the driver does not declare refuses rc 1 naming the declared ones (posix declares `exact` alone; fts5 adds the ranked `hybrid` and `trigram` modes, asked for by name). An empty query refuses rc 1, and so does a search without `--mode`, naming the modes the configured driver declares. `exact`, the one mode every driver implements, means one thing on every driver: a line matches when it carries the query as a substring, ASCII letters compared without case and a column-0 comment never matching; the answer is one row per matching entity and section, in record order, its snippet the first matching line, its score 0, and `total_matches` counts those rows, so every driver returns the same rows and totals for the same record.

A backend may declare ranked modes of its own beside `exact`; the storage-fts5 plugin declares `hybrid` and `trigram`, and its [module README](plugins/storage-fts5/.contexture/modules/storage-fts5/README.md) describes the indexing and the relevance ranking behind them.

On an indexed backend, a ranked mode returns high-density contextual snippets ordered by their score. This cuts token consumption by more than 90 percent compared to dumping entire entity bodies.

Agents follow a snippet-first consumption protocol:
1. Run `ctx session search <unit> "<query>" --mode=<mode>` to locate candidates.
2. Review the compact snippets (and, on a ranked backend, the scores).
3. Fetch full entity blocks on demand using targeted commands (`ctx session task show`, `entry show`, `finding show`, or `resolve`).

When human users prompt in non-English languages (such as Turkish), agents translate conceptual terms into English search keywords before querying the record, synthesize findings from the English record, and respond to the user in their language.

## Subagent lanes

Subagents execute in isolated sandboxes. Operations are governed through the dedicated top-level `ctx lane` module:

- `ctx lane create <unit> <lane-slug>` (the recipe on stdin): the dispatcher's act: creates the lane with its recipe stored byte for byte and an empty lane journal; an existing lane refuses rc 1 (`ERR_ENTITY_EXISTS`).
- `ctx lane show <unit> <lane-slug> [recipe|journal|report] [--json]`: prints one lane artifact (the report by default); the text view is the stored artifact, its trailing newlines collapsed to one, and `--json` carries a document in the `content` field.
- `ctx lane record <unit> <lane-slug> --what="..." [--slug=...] [--thread=...] [--ref=...]...`: appends action traces to the lane journal; a slug the lane journal carries refuses rc 1 (`ERR_ENTITY_EXISTS`), and an absent lane refuses rc 1.
- `ctx lane report <unit> <lane-slug> [--body="..." | stdin] [--json]`: writes the lane report from `--body` or stdin, printing one line with the stored size, or reads it back when neither is given, printing the report as stored. The report reaches the driver on stdin, so a report of any size lands. With no `--body`, `report` reads stdin whenever stdin is not a terminal, so under an open pipe it waits for the writer to close; a script reads a report with `ctx lane show <unit> <lane-slug> report`, which never reads stdin.

A lane holds three artifacts: the recipe, the lane journal, and the report (under the posix driver the files `recipe.md`, `journal.md`, `report.md` in the lane folder). There are no fictitious lane-level status or close mechanics: lifecycle is tracked by the parent dispatch thread.

## Liveness and closure

What loads is decided by one subtraction: live = not closed. The load list comprises every journal entry whose slug no later `CLOSES` or `SUPERSEDES` names. A closer closes the entries standing before it: a legacy journal that repeats a slug (the storage driver refuses a new repeat at the write) resolves by position, so a closer closes every earlier occurrence and never one written after it; `ctx session audit` reports such a repeat as a `LEGACY DUPLICATE SLUG` warning without failing, and `ctx session entry show` reads the last occurrence.

Closure is a later entry naming its target. The target is never touched. The closer carries a verdict word (`done`, `superseded`, `dropped`, or `folded`), then the reason; the closer `WHAT` carries the resolution.

Two kinds of open entries:
- An entry whose `THREAD` names an outside act awaits completion and closes the moment it arrives.
- A `THREAD: none` entry is a receipt: the final word on a completed fact. It stays open as the boot trail and folds only at chapter turns or unit close.

Closers must resolve: every `CLOSES` or `SUPERSEDES` slug must name a real entry. A dangling closer is flagged as an error by `ctx session audit`.

## Chapter folding

Long-running units accumulate live receipts and open threads, and the boot load carries every live entry. A chapter fold consolidates the live record of a unit into ordinary journal entries, each entry a batch of constituents, written for a reader with no prior context, and closes the folded constituents by reference. It is infrequent record maintenance, triggered and confirmed by the human; the receipt records the result; it is not a rhythm. A fold compacts history, never obligations: an open thread (`THREAD` other than none) stays live, the batch `REF`s it as context and never closes it, and the finish counts it as carried.

The command is one stateless verb; the record is the state. The consolidated entry is an ordinary entry written with `ctx session record`: its `WHAT` is the batch's synthesis, its `REF` lines name every constituent of the batch (the carried open threads included) plus any external report, and its `CLOSES` lines fold the same constituents except the open threads; the group, thread, and supersession are ordinary. There is no digest, no checkpoint, no class manifest, and no marker.

1. **Plan.** `ctx session fold <unit>` computes the live scope (every live entry at that call), partitions it once into chunks in journal order, records the fold start (the plan JSON, the carried threads, and the batch rule), and prints the plan with the carried open threads listed, the first lane's manual, and the first act. The open threads stay in the scope and in the chunks. A chunk ends at the next milestone (`TASK_DONE`, `RELEASE`, `DECIDE`); the live entries after the last milestone are one `TAIL` chunk; an anchor with no milestone is one `ANCHOR` chunk. Every anchor has one deterministic lane (`fold-<epoch>-<n>`); the orchestrator creates each lane from its manual.
2. **Fetch.** A lane fetches with `ctx session fold <unit> --lane=<lane>`: the next unclosed chunk, its entries, the lane's remaining chunks (never another chunk's entries), and the next act. The fetch never advances. A `--merge` fetch adds the immediately following chunk's entries only, the one permitted merge partner. At the anchor end it returns the lane boundary and the next lane's instruction; the orchestrator creates and dispatches that lane.
3. **Write.** The lane reads the batch's entries and writes one ordinary entry with `ctx session record`: the one-line synthesis in the `WHAT`, one `REF` per constituent plus any external report, one `folded` closer per non-thread constituent, `THREAD: none`, and the optional group. A carried open thread gets a `REF` only, never a closer: it stays live. The plan divides the live scope into batches at the mechanical seams (task receipts, releases, decisions, part and lane series, group switches), coalescing the mechanical series; the cap is the last resort: a chunk still over 12 constituents after coalescing splits at the last seam in its first 12, or at the last entry at or under 12 with `(cap split: no seam)` recorded. A lane merges only the immediately following chunk when it continues the same topic, recording the reason in the `WHAT` as `(merged: <reason>)`; the check refuses a whole-anchor batch. The command does not write the consolidated entry.
4. **Check.** `ctx session fold <unit> --check` reads the fold start's plan and the live post-plan entries. A consolidated entry is a live entry whose `CLOSES` target scoped slugs; its closer set is the claimed batch. A scoped live entry carrying `THREAD` other than none is carried, never `SCOPED_LIVE`; a planned carried thread still live is carried too. Every target is in the scope and has a `journal#<slug>` REF, every closer is `folded` with a reason, the batches are pairwise disjoint, each batch is a union of whole consecutive chunks in one lane, every batch `REF`s the carried open threads in its chunks, the closed receipts are the scope minus the carried threads, and no non-thread scoped entry remains live. The check writes nothing, runs the audit, and prints its open-thread tail. It names its defects: `SCOPED_LIVE`, `UNREFERENCED_CLOSER`, `TARGET_OUTSIDE_SCOPE`, `CLOSER_NOT_FOLDED`, `DOUBLE_CONSOLIDATION`, `BATCH_OVERLAP`, `BATCH_GAP`, `BATCH_NOT_CONSECUTIVE`, `BATCH_CROSS_LANE`, `BATCH_PARTIAL_CHUNK`, `THREAD_CLOSED`, `CARRIED_UNREFERENCED`, `CONSOLIDATION_NOT_LIVE`, `CONSTITUENT_CAP`, `WHOLE_ANCHOR_BATCH`, `MERGE_BEYOND_NEXT`, `MERGE_REASON_MISSING`, `PLAN_DRIFT`, `V3_START_LIVE`, and `AUDIT_RED`. A live v3 fold start (`FOLD START v1`) refuses with `V3_START_LIVE`: close it with an ordinary entry, then replan.
5. **Finish.** When every chunk is consolidated, run `--check` then `--finish`. The finish re-runs the check and, when clean, writes the receipt `FOLD FINISH v4 <fold-start> batches=<b> covered=<n> carried=<m> open threads :: coverage zero; audit clean` and closes the fold start `done`; the carried threads stay live and the audit tail keeps them. If red, it names the defects and writes nothing; the repair is the ordinary supersession, a new entry with the same batch refs and closers and `--supersedes` naming the prior entry. The prior entry closes; the new live entry is the batch. A live receipt refuses a second one.

### The synthesis and the batch

A consolidated entry is not a lossy summary. The `WHAT` follows the little-less-than-raw standard: preserve architectural rationale, the alternatives evaluated and ruled out, unexpected hurdles, exact error signatures, root causes, open threads and their state, and checkable evidence; compress only mechanical repetition. The batch's refs carry the detail, and every constituent stays resolvable through `ctx session entry show <unit> <slug>`. The `WHAT` is one line; the refs and the originals hold the depth. An open thread is referenced, never closed: it stays live, and the boot load and the audit keep the reminder.

The batch granularity belongs to the lane within the plan: the plan's chunks are atomic, and the lane merges consecutive chunks inside its anchor when the material wants a thematic unit. The batch count is not a target; the check proves the partition.

The lane manual is the plan's per-lane recipe; `ctx session fold --help` prints the same loop as the command manual. The command reads and writes only through the existing contract 2 functions (`session.board`, `entry.get`, `entry.record`, `session.audit`, and `lane.get` for the lane names); the storage contract is unchanged. The command's own entries are the fold start and the finish receipt; the consolidated entries are the lanes' ordinary writing. A repaired entry closes superseded, never edited.


## Anchors

Time is recorded by anchors. An `@anchor` line stamps one working period, a fresh context load, with its number and date alone (`ctx session stamp <unit>`, no receipt text):

```text
@anchor A12 2026-09-29
```

A fresh unit starts at `A1`, the bootstrap's folded first anchor; each later stamp is the previous plus one. Anchors provide period ordering: `ctx session entry list <unit> --anchor=A<N>` lists one period, and an entry's `ANCHOR` names the period it was written in. A legacy anchor that carries receipt text (`("continues A11", attention: ...)`) keeps it as content and reads back as stored. No entry loads or skips by its anchor, and age never closes anything: an entry stays live until a closure names it.

The stamped date is also a recency source: when an anchor is the last main-journal item, its date is the unit's `last_event`, the date `session.list` answers and `ctx session active` renders and orders by. A dated entry slug supplies the date otherwise; an anchor holding no date stamp, or a dateless last item, answers null.

## The schema as the memory boundary

Structure is what makes information survive. The agent fills information into schemas, so the schema is the boundary of what the record can remember.

The grammars share strict dialect rules:
- Typed blocks start at column 0; bodies indent two spaces.
- `::` opens a block scalar; `|` means alternation only; `[ ]` wraps optional parts; `->` means flow; `#` starts a comment.
- Whitespace is syntax: queries anchor on block starts, so misplaced indents break parsing.
- Lines end in LF: a carriage return in any field value is refused at the write (rc 1) before any storage call; a legacy line already stored with one reads without it, and the file keeps that byte until a write touches its item, which is then stored canonical.
- Spellings are contractual across tools and queries.

The schema holds the shape, the writer holds the volume. Token efficiency is the dialect, never a cap on content. Omit ornament, never substance.
