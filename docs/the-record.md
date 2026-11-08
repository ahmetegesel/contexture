# The record

The conversation is a scratchpad; the record is the memory. When a context window fills, the harness compacts the session into a summary, and everything behind the next step (what was decided and why, what was ruled out, what was corrected, what was verified, what is still open) dies with it. The record is the layer that does not die: structured domain entities, maintained by the agent as the work happens, next to the code.

## Storage abstraction and entity domains

Under @laws#source-of-truth the record is the only source of truth, and the configured storage backend holds it: one authoritative store. The engine completely decouples the record machinery from physical disk layouts and file formats. Every verb reaches the record through the configured driver and nothing else, so the record is one store whichever driver holds it. Base maps every command to one storage function and renders the typed data it returns, and each backend stores the record its own way and enforces the record rules itself. The data model is one for every backend: every item answers typed fields and reads in one canonical layout (field order, spacing, and quoting are layout, never data), and an item stored in an older shape keeps every value in named fields (a legacy status, extra fields, head text, extra lines), so every backend returns the same data and prints the same text for the same record, and an older record reads back with nothing lost. In the default POSIX driver each artifact is a markdown file in its unit folder under the record root, written in the record grammar below (a unit an older release wrote under the deprecated root still reads from there, each such read warning once, and moves whole at its next write; `ctx unit migrate --all` moves the units nobody writes, the closed ones among them; the move that empties the deprecated root removes it, and the sweep removes an empty one even when it moves nothing, while a store holding no unit keeps its empty root); a store backend such as the storage-fts5 plugin keeps the record in its store, described in its module README. No command moves a record between backends: a record reaches another backend through the agent re-entering it with the ordinary verbs, so a store other than posix holds only what the verbs write and older record shapes live in posix files alone.

For agents, under @laws#cli-doorway, the record is an abstract structured domain surface, never raw files on disk: agents reach it strictly through its ctx verbs (`ctx unit`, `ctx lane`, `ctx rhythm current`), never reading, editing, or grepping storage files or database tables directly.

The record comprises five distinct entity domains:

| domain | role | how it changes |
|---|---|---|
| unit state | where the unit stands: its status, anchor, objective, repos, and mounts | overwritten freely; updated via stamp, refs, close, reopen; the next move is derived from the backlog at presentation |
| backlog tasks | the declaration: the work declared ahead | mutated atomically via typed task commands; living queue |
| journal events | the memory: what happened, as it happened | immutable append-only event stream; closed by later reference |
| durable findings | the mind: settled architectural truths and decisions | full lifecycle CRUD; updated or superseded forward |
| subagent lanes | delegation sandboxes: isolated recipe, trace, and report | managed directly via top-level lane commands |

In the POSIX baseline driver, these domains map to four files and the lanes folder:

| file | physical role in POSIX driver |
|---|---|
| `state.md` | state card: status, current anchor, objective, repos, ref_sessions |
| `backlog.md` | task queue: multiline containers for description, criteria, details |
| `journal.md` | event log: chronological entries stamped with anchor and thread |
| `knowledge.md` | findings store: settled findings with references and summaries |
| `lanes/<lane>/` | subagent directories holding recipe.md, journal.md, and report.md |

## Unit state

The unit state is the map, not the content: detail lives behind references, never inside the state itself.

```text
status: ACTIVE
current_anchor: A12
objective: "what the unit is for"
repos: [app, docs]
ref_sessions: [design-notes]
```

- `status:` is `ACTIVE` or `CLOSED`.
- `current_anchor:` is the current value of the anchor counter, `A<N>`. A fresh unit starts at `A1`, the bootstrap's folded first anchor, and each stamp adds one.
- `objective:` is what the unit is for: one quoted line, an embedded double or single quote is text, an embedded newline refuses.
- the next move is not a state field: it is derived at presentation from the backlog, the first `IN_PROGRESS` task, else the first open task, open being the board's rule of every status but `DONE` (`ctx unit list` prints it); a unit with no open task has none.
- `repos:` lists affected repositories.
- `ref_sessions:` lists optional read-only reference units mounted at boot; boot loads their knowledge and active journal.

The state is refreshed as the work moves, via `ctx unit stamp`, `ctx unit refs`, `ctx unit close`, and `ctx unit reopen`. A legacy `next_action` line already stored is ignored by the record reads (the load, `list`, and the exact search) and erased by the next state write; a new state never carries one. On an indexed backend the ranked search reads the store's document derived from the raw value at write time, so an unwritten legacy line may still match there until a state write rewrites it.

The state carries no date. Recency is journal-derived: a unit's `last_event` is the date its last main-journal item carries, so the field stays current without a state write and `session.list` answers it. A unit whose last item carries no date answers null, and lane journals never enter the derivation. `ctx unit list` reads no journal, so it prints no date and orders its units bytewise by name.

## Backlog tasks, the declaration

The backlog holds actionable tasks as a living queue: the current declaration of work, written to be executed from no matter when the agent looks. Tasks advance, update, and drop as the work teaches; the journal holds the history; the unit objective lives in the unit state.

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

Three fields carry the task's identity: `STATUS` (`TODO`, `IN_PROGRESS`, `DONE`), `OBJECTIVE`, and, when present, `REFS`. The typed verbs write only those three; a legacy record may carry another status, and it stays open: the board lists every task whose status is not `DONE`, the derived next reads it after any `IN_PROGRESS`, and `ctx unit list` prints it as stored. Three block containers carry technical substance:

- `DESCRIPTION` carries context, problem statement, and scope.
- `ACCEPTANCE CRITERIA` carries checkable done conditions.
- `IMPLEMENTATION DETAILS` carries specifications, architectural constraints, and execution blueprints.

### Semantic task operations

Agents mutate the backlog through typed CLI verbs, the only write inputs (no markdown block crosses the command interface):

- `ctx unit task add <unit> <slug> --objective="..." [--desc="..."] [--criteria="..."] [--details="..."] [--refs="..."]`: creates a task in `TODO` status.
- `ctx unit task update <unit> <slug> [--objective="..."] [--desc="..."] [--criteria="..."] [--details="..."] [--refs="..."]`: updates the given fields in place; `--refs` replaces the list and `--refs=""` clears it; an update carrying no field refuses rc 1.
- `ctx unit task start <unit> <slug>`: moves a `TODO` task to `IN_PROGRESS`; the state is not written.
- `ctx unit list [--active|--all] [--repo=<repo>]`: the pre-boot field: with no flag or `--active` each ACTIVE unit bytewise by name, with its anchor, the derived next line (`next: <slug> (<status>)`, or an explicit none form), and its objective, then the closed count; `--all` one line per unit with its status as stored and its anchor; `--repo` the units touching the repo, a repo no unit touches refusing rc 1 naming the known repos. It replaces the retired `active` and `units` verbs.
- `ctx unit task complete <unit> <slug> --evidence="..."`: atomically moves a `TODO` or `IN_PROGRESS` task to `DONE` and records its completion receipt (`<date>-<slug>-completed`, `WHAT: "backlog/<slug>: DONE (<evidence>)"`) in the journal.
- `ctx unit task reopen <unit> <slug>`: moves an `IN_PROGRESS` or `DONE` task back to `TODO`.
- `ctx unit task drop <unit> <slug> [--reason="..."]`: removes the task and records its drop receipt (`backlog/<slug>: DROPPED (<reason>)`) in the journal; an `IN_PROGRESS` task refuses (reopen it first).
- `ctx unit task list <unit> [--status=todo|progress|done|all]`: lists tasks matching the filter.
- `ctx unit task show <unit> <slug>`: prints the task's canonical block, its `REFS` included (a legacy task too, every value kept).

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
- `RHYTHM: <name> <N> <GATE>` records process milestones: the stamp of a step and gate of the named rhythm, checked through the rhythm module (`ctx rhythm show <name>` prints the rhythm; `ctx rhythm current <unit>` reads the unit's last stamp back as the rhythm in force).
- `THREAD: <what it awaits>` names external acts awaiting completion, or `none` for receipts.
- `REF: "target#symbol"` grounds the event in an artifact; an entry may carry several. A reference takes one of two shapes, `<target>#<symbol>` (a lane artifact as `lane#<lane>/<recipe|journal|report>[#<claim>]`) or a whole target path holding a `/` and ending in a name (a repository file path; a root-level file as `./README.md`, or `README.md#<section>`; a lone `/`, a trailing `/` as in `lanes/`, and `./` name no target), one token without blanks, control characters, or double quotes (an ASCII control byte such as a form feed or a vertical tab counts as a blank, and so does a Unicode blank such as a no-break space or U+2028); the verbs refuse any other value on a new write, naming both shapes, and a legacy value reads as stored, the legacy lane form `lanes/<lane>/<recipe|journal|report>[#<claim>]` among them, which the verbs still accept and resolve.
- `CLOSES:` or `SUPERSEDES:` closes an earlier entry by reference with a verdict word and reason. One line may name several targets (`CLOSES: <slug> <slug> (folded: reason)`) and an entry may carry several closer lines; every date-slug before the first spaced paren or spaced hyphen is a target.
- `KNOWLEDGE: true` flags entries for durable knowledge harvesting.

### Semantic event recording

Agents record events via `ctx unit record`:

```bash
.contexture/ctx unit record <unit> --what="..." [--group=...] [--thread=...] [--rhythm="<name> <N> <GATE>"] [--ref=...]... [--closes=...]... [--supersedes=...]... [--knowledge] [--slug=...]
```

The command sends the current local date and time, the unit module takes the active anchor from the state and composes the slug (`<date>-event-<epoch>`, a held slug taking `-1`), and `THREAD` defaults to `none` if omitted. `--rhythm` takes `<name> <N> <GATE>`, a step and gate of the named rhythm as the rhythm module resolves it (the workspace copy first, then the installed one), and the rhythm's `@rhythm` line must name its file: a mismatch refuses rc 1 (`ERROR: RHYTHM <name> declares @rhythm <declared>; a rhythm's file name and its @rhythm line must agree`), as do a missing rhythm (`ERROR: no such rhythm: <name> (ctx rhythm list names them)`), a missing step (`ERROR: RHYTHM step <N> not in <name>`), and a gate the step does not read, nothing written. A stamped write prints the next gate after its receipt, `rhythm: <name> at <N> <GATE>; next gate: <N+1> <GATE>: <outcome>`, or `rhythm: <name> at <N> <GATE>, its last gate` at the rhythm's last step; a write without `--rhythm` prints `recorded entry: <slug>` alone. `--ref`, `--closes`, and `--supersedes` repeat, one line each. `--closes` and `--supersedes` take only the explicit form `<slug> (<verdict>: <reason>)` (one or more target slugs before the parenthesis, each naming an entry the journal already holds, as in `--closes="<slug> <slug> (dropped: reason)"`), the verdict one of `done`, `superseded`, `dropped`, `folded` and the reason non-empty; a bare target list refuses rc 1 naming the form, since the closer carries the resolution itself, and a reason holding a parenthesis refuses naming the rule. Every flag value lands as one line of the entry block, so a value carrying a newline (or a carriage return) is refused rc 1 before any write; the same holds for every one-line field of the typed verbs (`task` objective, refs, evidence, reason; `finding` ref and supersedes; `lane record` what, thread, slug), while the block scalars (`--desc`, `--criteria`, `--details`, `--summary`) keep their newlines as body lines. An entry already in the journal reads in the canonical layout, every value kept, and its file bytes stay as they are. One quote rule holds for every one-line quoted field (`WHAT`, a task `OBJECTIVE`, the state `objective`) on every write path: an embedded double quote is text (the typed verbs and `bootstrap` store it), and every reader returns it verbatim.

To inspect entries:
- `ctx unit entry show <unit> <slug> [--json]`: prints the entry's canonical block (every field it carries); `--json` prints the typed entry: its fields, `refs` as a list, its closers, and the closure derived by position (`closed`, `closed_by`, `close_reason`).
- `ctx unit entry list <unit> [--anchor=A<N>] [--group=...] [--json]`: one line per entry occurrence, open or closed; `--json` carries each entry's slug, occurrence, anchor, what, group, and rhythm (its stamp, null when unstamped), which `ctx rhythm current` reads.
- `ctx unit entry closure <unit> <slug> [--json]`: whether the entry is closed, and every later closer naming it with its line.

## Durable findings, the mind

Findings hold what the unit settled: validated truths, architectural decisions, and rejected hypotheses. Developing ideas stay in the journal; actionable intents take task form in the backlog.

Unlike immutable journal events, findings support full lifecycle CRUD:

- `ctx unit finding add <unit> <NAME> --summary="..." [--ref=...]... [--supersedes=...]`: adds a new finding, active until a later finding supersedes it.
- `ctx unit finding show <unit> <NAME>`: prints the finding's canonical block, with `SUPERSEDED_BY: <successor>` after its head when a later finding supersedes it.
- `ctx unit finding update <unit> <NAME> [--summary="..."] [--ref=...]...`: updates the summary, the references, or both in place when concepts are refined (either flag alone works); `--ref` repeats and replaces the whole list; an update carrying no field refuses rc 1.
- `ctx unit finding supersede <unit> <old-name> <new-name> --summary="..." [--ref=...]...`: adds the successor finding carrying `SUPERSEDES: <old-name>`, maintaining audit lineage; a missing predecessor refuses rc 1.
- `ctx unit finding drop <unit> <NAME>`: removes an invalidated finding.
- `ctx unit finding list <unit> [--active-only]`: lists all findings, optionally leaving out the superseded ones.

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
- Subagent lane artifacts and claims: `lane#<lane-slug>/<recipe|journal|report>[#<claim>]` (a journal claim names a lane journal entry slug and prints that entry as `ctx lane show` prints it; a recipe or report claim names a section: an `@<claim>` head runs to the next column-0 `@` line, a column-0 `<claim> ::` head, its text on that line or its body below, to the next non-blank column-0 line, blank lines inside either span kept, and the last head naming the claim, in either form, wins)
- Canonical module refs: `unit#<unit>/task/<slug>`, `unit#<unit>/entry/<slug>`, `unit#<unit>/finding/<NAME>`, `unit#<unit>/lane/<lane>/<recipe|journal|report>` (the ref carries its target unit)

The resolution verb resolves references directly:

```bash
.contexture/ctx unit resolve <unit> <ref>
```

When given the legacy forms an older record holds (the file-based paths such as `knowledge.md#NAME`, `journal.md#slug`, `backlog.md#slug`, and the legacy lane form `lanes/<lane>/<recipe|journal|report>[#<claim>]`), the CLI normalizes them transparently to entity lookups. Agents author the entity syntax natively, `lane#` for a lane; a canonical ref minted by a write resolves directly.

## Universal search and snippet consumption

Universal search operates across all entity domains; every search names its mode (`--mode` is required, with no default: `exact` on every driver, or a mode the configured driver declares, which `ctx unit diagnose` lists):

```bash
.contexture/ctx unit search <unit> "<query>" --mode=MODE [--limit=N] [--entity=TYPE] [--json]
```

Every driver returns the same keys per result (`entity_type`, `entity_id`, `section`, `snippet`, `score`), so a caller never branches on the backend; `--limit` caps the results, `--entity` keeps one entity type, and a mode the driver does not declare refuses rc 1 naming the declared ones (posix declares `exact` alone; fts5 adds the ranked `hybrid` and `trigram` modes, asked for by name). An empty query refuses rc 1, and so does a search without `--mode`, naming the modes the configured driver declares. `exact`, the one mode every driver implements, means one thing on every driver: a line matches when it carries the query as a substring, ASCII letters compared without case and a column-0 comment never matching; the answer is one row per matching entity and section, in record order, its snippet the first matching line, its score 0, and `total_matches` counts those rows, so every driver returns the same rows and totals for the same record.

A backend may declare ranked modes of its own beside `exact`; the storage-fts5 plugin declares `hybrid` and `trigram`, and its [driver README](plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5/README.md) describes the indexing and the relevance ranking behind them.

On an indexed backend, a ranked mode returns high-density contextual snippets ordered by their score. This cuts token consumption by more than 90 percent compared to dumping entire entity bodies.

Agents follow a snippet-first consumption protocol:
1. Run `ctx unit search <unit> "<query>" --mode=<mode>` to locate candidates.
2. Review the compact snippets (and, on a ranked backend, the scores).
3. Fetch full entity blocks on demand using targeted commands (`ctx unit task show`, `entry show`, `finding show`, or `resolve`).

When human users prompt in non-English languages (such as Turkish), agents translate conceptual terms into English search keywords before querying the record, synthesize findings from the English record, and respond to the user in their language.

## Subagent lanes

Subagents execute in isolated sandboxes. Operations are governed through the dedicated top-level `ctx lane` module:

- `ctx lane create <unit> <lane-slug> --goal=... --branch=... --writes=... --scope=... --report=...` (with the optional `--ref`, `--task`, `--decision`, `--rhythm`, `--fact`, and `--substrate`): the dispatcher's act: composes the recipe from the brief flags, its boundary, boot, journal, and report blocks written by the verb, creates the lane with it and an empty lane journal, and prints the dispatch prompt; stdin is never read, and a missing required flag refuses naming each with its purpose; an existing lane refuses rc 1 (`ERR_ENTITY_EXISTS`).
- `ctx lane show <unit> <lane-slug> [recipe|journal|report] [--json]`: prints one lane artifact (the report by default); the text view is the stored artifact, its trailing newlines collapsed to one, and `--json` carries a document in the `content` field.
- `ctx lane record <unit> <lane-slug> --what="..." [--slug=...] [--thread=...] [--ref=...]...`: appends action traces to the lane journal; a slug the lane journal carries refuses rc 1 (`ERR_ENTITY_EXISTS`), and an absent lane refuses rc 1.
- `ctx lane report <unit> <lane-slug> [--body="..." | stdin] [--json]`: writes the lane report from `--body` or stdin, printing one line with the stored size, or reads it back when neither is given, printing the report as stored. The report reaches the driver on stdin, so a report of any size lands. With no `--body`, `report` reads stdin whenever stdin is not a terminal, so under an open pipe it waits for the writer to close; a script reads a report with `ctx lane show <unit> <lane-slug> report`, which never reads stdin.

A lane holds three artifacts: the recipe, the lane journal, and the report (under the posix driver the files `recipe.md`, `journal.md`, `report.md` in the lane folder). There are no fictitious lane-level status or close mechanics: lifecycle is tracked by the parent dispatch thread.

## Liveness and closure

What loads is decided by one subtraction: live = not closed. The load list comprises every journal entry whose slug no later `CLOSES` or `SUPERSEDES` names. A closer closes the entries standing before it: a legacy journal that repeats a slug (the storage driver refuses a new repeat at the write) resolves by position, so a closer closes every earlier occurrence and never one written after it; `ctx unit audit` reports such a repeat as a `LEGACY DUPLICATE SLUG` warning without failing, and `ctx unit entry show` reads the last occurrence.

Closure is a later entry naming its target. The target is never touched. The closer carries a verdict word (`done`, `superseded`, `dropped`, or `folded`), then the reason; the closer `WHAT` carries the resolution.

Two kinds of open entries:
- An entry whose `THREAD` names an outside act awaits completion and closes the moment it arrives.
- A `THREAD: none` entry is a receipt: the final word on a completed fact. It stays open as the boot trail and folds only at chapter turns or unit close.

Closers must resolve: every `CLOSES` or `SUPERSEDES` slug must name a real entry. A dangling closer is flagged as an error by `ctx unit audit`.

## Chapter folding

Long-running units accumulate live receipts and open threads, and the boot load carries every live entry. A chapter fold consolidates the live record of a unit into ordinary journal entries, each entry a batch of constituents, written for a reader with no prior context, and closes the folded constituents by reference. It is infrequent record maintenance, triggered and confirmed by the human; the receipt records the result; it is not a rhythm. A fold compacts history, never obligations: an open thread (`THREAD` other than none) stays live, the batch `REF`s it as context and never closes it, and the finish counts it as carried.

The command is one stateless verb; the record is the state. The consolidated entry is an ordinary entry written with `ctx unit record`: its `WHAT` is the batch's synthesis, its `REF` lines name every constituent of the batch (the carried open threads included) plus any external report, and its `CLOSES` lines fold the same constituents except the open threads; the group, thread, and supersession are ordinary. There is no digest, no checkpoint, no class manifest, and no marker.

1. **Plan.** `ctx unit fold <unit>` computes the live scope (every live entry at that call), partitions it once into chunks in journal order, records the fold start (the plan JSON, the carried threads, and the batch rule), and prints the plan with the carried open threads listed, the one line `ctx lane create` command for the first lane, the first lane's manual, and the first act. The open threads stay in the scope and in the chunks. A chunk ends at the next milestone (`TASK_DONE`, `RELEASE`, `DECIDE`); the live entries after the last milestone are one `TAIL` chunk; an anchor with no milestone is one `ANCHOR` chunk. Every anchor has one deterministic lane (`fold-<epoch>-<n>`); the orchestrator creates each lane with the command the plan prints (its goal, branch, write scope, four scope steps, and two report sections filled for that unit and lane; the write scope grants the lane its consolidated and superseding entries over the general rule that a subagent never writes the unit's record, so the override lives in the fold lane's own recipe and the general law carries no exception), and the progress view prints the same command for the next lane while it is absent. The command never creates a lane itself.
2. **Fetch.** A lane fetches with `ctx unit fold <unit> --lane=<lane>`: the next unclosed chunk, its entries, the lane's remaining chunks (never another chunk's entries), and the next act. The fetch never advances. A `--merge` fetch adds the immediately following chunk's entries only, the one permitted merge partner. At the anchor end it returns the lane boundary and the next lane's `ctx lane create` command; the orchestrator creates the lane with it and dispatches it.
3. **Write.** The lane reads the batch's entries and writes one ordinary entry with `ctx unit record`: the one-line synthesis in the `WHAT`, one `REF` per constituent plus any external report, one `folded` closer per non-thread constituent, `THREAD: none`, and the optional group. A carried open thread gets a `REF` only, never a closer: it stays live. The plan divides the live scope into batches at the mechanical seams (task receipts, releases, decisions, part and lane series, group switches), coalescing the mechanical series; the cap is the last resort: a chunk still over 12 constituents after coalescing splits at the last seam in its first 12, or at the last entry at or under 12 with `(cap split: no seam)` recorded. A lane merges only the immediately following chunk when it continues the same topic, recording the reason in the `WHAT` as `(merged: <reason>)`; the check refuses a whole-anchor batch. The command does not write the consolidated entry.
4. **Check.** `ctx unit fold <unit> --check` reads the fold start's plan and the live post-plan entries. A consolidated entry is a live entry whose `CLOSES` target scoped slugs; its closer set is the claimed batch. A scoped live entry carrying `THREAD` other than none is carried, never `SCOPED_LIVE`; a planned carried thread still live is carried too. Every target is in the scope and has a `journal#<slug>` REF, every closer is `folded` with a reason, the batches are pairwise disjoint, each batch is a union of whole consecutive chunks in one lane, every batch `REF`s the carried open threads in its chunks, the closed receipts are the scope minus the carried threads, and no non-thread scoped entry remains live. The check writes nothing, runs the audit, and prints its open-thread tail. It names its defects: `SCOPED_LIVE`, `UNREFERENCED_CLOSER`, `TARGET_OUTSIDE_SCOPE`, `CLOSER_NOT_FOLDED`, `DOUBLE_CONSOLIDATION`, `BATCH_OVERLAP`, `BATCH_GAP`, `BATCH_NOT_CONSECUTIVE`, `BATCH_CROSS_LANE`, `BATCH_PARTIAL_CHUNK`, `THREAD_CLOSED`, `CARRIED_UNREFERENCED`, `CONSOLIDATION_NOT_LIVE`, `CONSTITUENT_CAP`, `WHOLE_ANCHOR_BATCH`, `MERGE_BEYOND_NEXT`, `MERGE_REASON_MISSING`, `PLAN_DRIFT`, `V3_START_LIVE`, and `AUDIT_RED`. A live v3 fold start (`FOLD START v1`) refuses with `V3_START_LIVE`: close it with an ordinary entry, then replan.
5. **Finish.** When every chunk is consolidated, run `--check` then `--finish`. The finish re-runs the check and, when clean, writes the receipt `FOLD FINISH v4 <fold-start> batches=<b> covered=<n> carried=<m> open threads :: coverage zero; audit clean` and closes the fold start `done`; the carried threads stay live and the audit tail keeps them. If red, it names the defects and writes nothing; the repair is the ordinary supersession, a new entry with the same batch refs and closers and `--supersedes` naming the prior entry. The prior entry closes; the new live entry is the batch. A live receipt refuses a second one.

### The synthesis and the batch

A consolidated entry is not a lossy summary. The `WHAT` follows the little-less-than-raw standard: preserve architectural rationale, the alternatives evaluated and ruled out, unexpected hurdles, exact error signatures, root causes, open threads and their state, and checkable evidence; compress only mechanical repetition. The batch's refs carry the detail, and every constituent stays resolvable through `ctx unit entry show <unit> <slug>`. The `WHAT` is one line; the refs and the originals hold the depth. An open thread is referenced, never closed: it stays live, and the boot load and the audit keep the reminder.

The batch granularity belongs to the lane within the plan: the plan's chunks are atomic, and the lane merges consecutive chunks inside its anchor when the material wants a thematic unit. The batch count is not a target; the check proves the partition.

The lane manual is the loop each fold lane follows, printed below the `ctx lane create` command whose recipe sends the lane to it; `ctx unit fold --help` prints the same loop as the command manual. The command reads and writes only through the existing record functions (`session.board`, `entry.get`, `entry.record`, `session.audit`, and `lane.get` for the lane names); the storage contract is unchanged. The command's own entries are the fold start and the finish receipt; the consolidated entries are the lanes' ordinary writing. A repaired entry closes superseded, never edited.


## Anchors

Time is recorded by anchors. An `@anchor` line stamps one working period, a fresh context load, with its number and date alone (`ctx unit stamp <unit>`, no receipt text):

```text
@anchor A12 2026-09-29
```

A fresh unit starts at `A1`, the bootstrap's folded first anchor; each later stamp is the previous plus one. Anchors provide period ordering: `ctx unit entry list <unit> --anchor=A<N>` lists one period, and an entry's `ANCHOR` names the period it was written in. A legacy anchor that carries receipt text (`("continues A11", attention: ...)`) keeps it as content and reads back as stored. No entry loads or skips by its anchor, and age never closes anything: an entry stays live until a closure names it.

The stamped date is also a recency source: when an anchor is the last main-journal item, its date is the unit's `last_event`, the date `session.list` answers. A dated entry slug supplies the date otherwise; an anchor holding no date stamp, or a dateless last item, answers null.

## The schema as the memory boundary

Structure is what makes information survive. The agent fills information into schemas, so the schema is the boundary of what the record can remember.

The grammars share strict dialect rules:
- Typed blocks start at column 0; bodies indent two spaces.
- `::` opens a block scalar; `|` means alternation only; `[ ]` wraps optional parts; `->` means flow; `#` starts a comment.
- Whitespace is syntax: queries anchor on block starts, so misplaced indents break parsing.
- Lines end in LF: a carriage return in any field value is refused at the write (rc 1) before any storage call; a legacy line already stored with one reads without it, and the file keeps that byte until a write touches its item, which is then stored canonical.
- Spellings are contractual across tools and queries.

The schema holds the shape, the writer holds the volume. Token efficiency is the dialect, never a cap on content. Omit ornament, never substance.
