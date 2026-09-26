# The record

The conversation is a scratchpad; the record is the memory. When a context window fills, the harness compacts the session into a summary, and everything behind the next step (what was decided and why, what was ruled out, what was corrected, what was verified, what is still open) dies with it. The record is the layer that does not die: structured domain entities, maintained by the agent as the work happens, next to the code.

## Storage abstraction and entity domains

Under @laws#storage-backend-authority, the configured storage backend is the authoritative single source of truth. The engine completely decouples session machinery from physical disk layouts and file formats. Every verb reaches the record through the configured driver and nothing else, so the record is one store whichever driver holds it. The record grammar is the canonical text: in the default POSIX driver each artifact is a markdown file in its unit folder, and in the SQLite FTS5 backend (the storage-fts5 plugin) each artifact is kept verbatim in the database with a relational index and full-text documents rebuilt from its text, so an export writes the same bytes back.

For agents, under @laws#semantic-boundary, the record is an abstract structured domain surface, never raw files on disk. Agents interact exclusively through semantic CLI verbs, never reading, editing, or grepping storage files or database tables directly.

The record comprises five distinct entity domains:

| domain | role | how it changes |
|---|---|---|
| session state | the pointer: where the unit stands and what happens next | overwritten freely; updated via stamp, pointer, refs, close, reopen |
| backlog tasks | the declaration: the work declared ahead | mutated atomically via typed task commands; living queue |
| journal events | the memory: what happened, as it happened | immutable append-only event stream; closed by later reference |
| durable findings | the mind: settled architectural truths and decisions | full lifecycle CRUD; updated or superseded forward |
| subagent lanes | delegation sandboxes: isolated recipe, trace, and report | managed directly via top-level lane commands |

In the POSIX baseline driver, these domains map to four files and the lanes folder:

| file | physical role in POSIX driver |
|---|---|
| `state.md` | state card: status, current anchor, next action, attention, refs |
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
- `current_anchor:` is the current value of the anchor counter, `A<N>`. A fresh unit starts at `A0`, and its first boot stamps `A1`.
- `next_action:` is one terse pointer, overwritten never prepended. The why behind it rebuilds from the record; when the unit sits between plans, it reads "plan the next move".
- `objective:` is what the unit is for.
- `repos:` lists affected repositories.
- `ref_sessions:` lists optional read-only reference sessions mounted at boot; boot loads their knowledge and active journal.

The pointer mutates often: it is refreshed as the work moves, at every backlog update, task landing, and period end. It is updated via `ctx session stamp`, `ctx session next`, `ctx session refs`, `ctx session close`, and `ctx session reopen`.

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

Agents mutate the backlog through typed CLI verbs, avoiding fragile stdin piping:

- `ctx session task add <unit> <slug> --objective="..." [--desc="..."] [--criteria="..."] [--details="..."] [--refs="..."]`: creates a task in `TODO` status.
- `ctx session task update <unit> <slug> [--objective="..."] [--desc="..."] [--criteria="..."] [--details="..."] [--add-refs="..."]`: updates fields in place.
- `ctx session task start <unit> <slug> [--pointer="..."]`: atomically transitions task status to `IN_PROGRESS` and updates `next_action` in state.
- `ctx session task complete <unit> <slug> --evidence="..."`: atomically transitions task status to `DONE` and records a completion receipt event (`backlog/<slug>: DONE <evidence>`) in the journal.
- `ctx session task reopen <unit> <slug>`: transitions task status back to `TODO`.
- `ctx session task drop <unit> <slug> --reason="..."`: removes the task and logs a drop receipt in the journal.
- `ctx session task list <unit> [--status=todo|progress|done|all]`: lists tasks matching the filter.
- `ctx session task show <unit> <slug>`: renders the full task block.

Legacy block piping (`ctx session append`, `amend`, `flip`, `drop`) is preserved as a fallback for bulk migrations and backwards compatibility.

A task marked `IN_PROGRESS` is executable as written: every needed decision lives in the task or behind an abstract reference. Placeholders (`TBD`, "similar to <task>", "as appropriate") mean the task is not ready.

## Journal events, the memory

The journal is the unit's chronological event trace and recording surface: events land as they happen, and the record only gains entries. It exists to rebuild the working context from scratch. A fresh session loads the live entries and nothing else.

```text
@anchor A12 ("continues A11", attention: <the loaded set>)

@entry 2026-09-12-auth-cookie-sessions
  ANCHOR: A12
  WHAT: "backlog/auth-cookie-sessions: DONE. Token cache retired; suite green (42/42)"
  GROUP: auth
  RHYTHM: work 6 EXECUTE
  KNOWLEDGE: true
  THREAD: none
  CLOSES: 2026-09-05-token-cache-introduced (done: replaced by cookie sessions)
  REF: "lane#auth-refresh/report#claim"
```

Fields on journal entries:

- `@entry <date>-<slug>` opens an entry block. Slugs end alphanumeric.
- `ANCHOR:` identifies the working period.
- `WHAT:` carries the event substance: what happened, the result, why the next step follows. It is one quoted line; an embedded double quote is part of the text (the typed `record` writes it and `ctx session append` accepts it), while an embedded newline is refused on every write.
- `GROUP:` topic thread identifier, stable within the unit.
- `RHYTHM: <name> <N> <GATE>` records process milestones.
- `KNOWLEDGE: true` flags entries for durable knowledge harvesting.
- `THREAD: <what it awaits>` names external acts awaiting completion, or `none` for receipts.
- `CLOSES:` or `SUPERSEDES:` closes an earlier entry by reference with a verdict word and reason. One line may name several targets (`CLOSES: <slug> <slug> (folded: reason)`) and an entry may carry several closer lines; every date-slug before the first spaced paren or spaced hyphen is a target.
- `REF: "target#symbol"` grounds the event in an artifact.

### Semantic event recording

Agents record events via `ctx session record`:

```bash
.contexture/ctx session record <unit> --what="..." [--group=...] [--thread=...] [--ref=...] [--closes=...] [--supersedes=...] [--knowledge]
```

The command automatically supplies the current local date (`YYYY-MM-DD`), resolves the active anchor from session state, and defaults `THREAD` to `none` if omitted. `--closes` takes one or more target slugs, each of which must exist; a value carrying its own parenthesized verdict (`--closes="<slug> <slug> (dropped: reason)"`) lands verbatim, and a bare target list is closed as `(done: <WHAT>)`. Every flag value lands as one line of the entry block, so a value carrying a newline (or a carriage return) is refused rc 1 before any write; the same holds for every one-line field of the typed verbs (`task` objective, refs, pointer, evidence, reason; `finding` ref and supersedes; `lane record` what, thread, slug), while the block scalars (`--desc`, `--criteria`, `--details`, `--summary`) keep their newlines as body lines. An entry already in the journal is read as it stands.

To inspect entries:
- `ctx session entry show <unit> <slug> [--json]`: prints one entry block; `--json` carries `slug`, `anchor`, `what`, `group`, `thread`, `ref` (the entry's `REF`, an empty string when absent), and the closure.
- `ctx session entry list <unit> [--anchor=A<N>] [--group=...] [--json]`: lists matching entries.

## Durable findings, the mind

Findings hold what the unit settled: validated truths, architectural decisions, and rejected hypotheses. Developing ideas stay in the journal; actionable intents take task form in the backlog.

Unlike immutable journal events, findings support full lifecycle CRUD:

- `ctx session finding add <unit> <NAME> --summary="..." [--ref=...] [--supersedes=...]`: adds a new finding with status `ACTIVE`.
- `ctx session finding show <unit> <NAME>`: displays the finding and its supersession lineage.
- `ctx session finding update <unit> <NAME> --summary="..." [--ref=...]`: updates the summary, the reference, or both in place when concepts are refined; a `--ref` replaces the `REF` line, or adds one after the summary when the finding had none.
- `ctx session finding supersede <unit> <old-name> <new-name> --summary="..." [--ref=...]`: adds the successor finding carrying `SUPERSEDES: <old-name>`, maintaining audit lineage; a missing predecessor refuses rc 1.
- `ctx session finding drop <unit> <NAME>`: removes an invalidated finding.
- `ctx session finding list <unit> [--active-only]`: lists all findings, optionally filtering out superseded or dropped findings.

```text
@finding SESSION_TOKEN_SHAPE
  SUPERSEDES: TOKEN_REFRESH_REUSE (cookie sessions replaced token refresh, 2026-09-12)
  REF: "entry#2026-09-12-auth-cookie-decision"
  SUMMARY ::
    Sessions are carried in cookies; refresh-token reuse is rejected and
    must not return.
```

- `@finding NAME` opens the block with uppercase alphanumeric naming.
- `SUPERSEDES: <ref> (reason)` records forward-only supersession.
- `REF: "target#symbol"` grounds the finding in append-only artifacts (`entry#slug` or `lane#slug/report#claim`).
- `SUMMARY ::` carries the settled claim.

Findings land through the harvest of `KNOWLEDGE: true` entries: the agent proposes a compact candidate, the human confirms or reshapes it, and the entry closes by reference.

## Abstract entity references and resolution

Under @laws#abstract-references, all cross-entity citations use domain notation rather than physical file paths:

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

Universal search operates across all entity domains without artificial mode enums:

```bash
.contexture/ctx session search <unit> "<query>" [--limit=N] [--entity=TYPE] [--mode=MODE] [--json]
```

Every driver returns the same keys per result (`entity_type`, `entity_id`, `section`, `snippet`), so a caller never branches on the backend; `--limit` caps the results, `--entity` keeps one entity type, and a mode the driver lacks refuses rc 1 (posix searches exact substrings; fts5 adds the ranked `hybrid` and `trigram` modes). An empty query refuses rc 1.

In backends with full text indexing (such as SQLite FTS5), search uses dual virtual tables combining Porter stemming for English prose with Trigram tokenization for code identifiers, symbols, and multilingual text. A pure SQL Reciprocal Rank Fusion (RRF) algorithm ranks results across both tables.

On an indexed backend, search returns high-density 5 to 12 token contextual snippets with match highlights, with the RRF score and source count per result. This cuts token consumption by more than 90 percent compared to dumping entire entity bodies.

Agents follow a snippet-first consumption protocol:
1. Run `ctx session search` to locate candidates.
2. Review the compact snippets (and, on a ranked backend, the scores).
3. Fetch full entity blocks on demand using targeted commands (`ctx session task show`, `entry show`, `finding show`, or `resolve`).

When human users prompt in non-English languages (such as Turkish), agents translate conceptual terms into English search keywords before querying the record, synthesize findings from the English record, and respond to the user in their language.

## Subagent lanes

Subagents execute in isolated sandboxes. Operations are governed through the dedicated top-level `ctx lane` module:

- `ctx lane show <unit> <lane-slug> [recipe|journal|report] [--json]`: prints one lane artifact (the report by default); the text view is the stored artifact byte for byte, and `--json` carries it in the `content` field.
- `ctx lane record <unit> <lane-slug> --what="..." [--slug=...] [--thread=...]`: appends action traces to the lane journal; a slug the lane journal carries refuses rc 1 (`ERR_ENTITY_EXISTS`).
- `ctx lane report <unit> <lane-slug> [--body="..." | stdin] [--json]`: writes the lane report from `--body` or stdin, or reads it back when neither is given; either way it prints the report byte for byte, and `--json` carries it in the `report` field. The report reaches the driver on stdin, so a report of any size lands. With no `--body`, `report` reads stdin whenever stdin is not a terminal, so under an open pipe it waits for the writer to close; a script reads a report with `ctx lane show <unit> <lane-slug> report`, which never reads stdin.

Subagents manage three concrete physical artifacts within their lane directory (`recipe.md`, `journal.md`, `report.md`). There are no fictitious lane-level status or close mechanics: lifecycle is tracked by the parent dispatch thread.

## Liveness and closure

What loads is decided by one subtraction: live = not closed. The load list comprises every journal entry whose slug no later `CLOSES` or `SUPERSEDES` names. A closer closes the entries standing before it: a legacy journal that repeats a slug (the engine refuses a new repeat at append) resolves by position, so a closer closes every earlier occurrence and never one written after it; `ctx session audit` reports such a repeat as a `LEGACY DUPLICATE SLUG` warning without failing, and `ctx session entry show` reads the last occurrence.

Closure is a later entry naming its target. The target is never touched. The closer carries a verdict word (`done`, `superseded`, `dropped`, or `folded`), then the reason; the closer `WHAT` carries the resolution.

Two kinds of open entries:
- An entry whose `THREAD` names an outside act awaits completion and closes the moment it arrives.
- A `THREAD: none` entry is a receipt: the final word on a completed fact. It stays open as the boot trail and folds only at chapter turns or unit close.

Closers must resolve: every `CLOSES` or `SUPERSEDES` slug must name a real entry. A dangling closer is flagged as an error by `ctx session audit`.

## Anchors

Time is recorded by anchors. An `@anchor` line stamps one working period, a fresh context load, and receipts what that period loaded:

```text
@anchor A12 ("continues A11", attention: <the loaded set>)
```

A fresh unit starts at `A0`; its first boot stamps `A1`; each later stamp is the previous plus one. Anchors provide period ordering and load receipts. No entry loads or skips by its anchor, and age never closes anything: an entry stays live until a closure names it.

## The schema as the memory boundary

Structure is what makes information survive. The agent fills information into schemas, so the schema is the boundary of what the record can remember.

The grammars share strict dialect rules:
- Typed blocks start at column 0; bodies indent two spaces.
- `::` opens a block scalar; `|` means alternation only; `[ ]` wraps optional parts; `->` means flow; `#` starts a comment.
- Whitespace is syntax: queries anchor on block starts, so misplaced indents break parsing.
- Lines end in LF: a carriage return in a typed field value is refused at the write (rc 1), since every grammar verb refuses an artifact that carries one.
- Spellings are contractual across tools and queries.

The schema holds the shape, the writer holds the volume. Token efficiency is the dialect, never a cap on content. Omit ornament, never substance.
