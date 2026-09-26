# The engine

## What the engine is

The engine is the part of contexture that runs and checks: AGENTS.md, the grammars, and the scripts. It is plain files and plain awk all the way down: no service, no database, no runtime.

The division of labor is deliberate. The model does the work; the machinery holds the line. A record kept by memory drifts, so the parts that must not drift are mechanical instead: the shapes are pinned in files, the searches are plain shell tools, and the checks are small scripts that run at fixed points. Quality comes from the machinery, not from the model remembering.

## AGENTS.md, delivered every turn

A coding harness reads its repository instruction file before it acts. In a contexture workspace that file is AGENTS.md, and it is the only file guaranteed to be in front of the agent every turn: everything else loads on demand. The guarantee is a convention, not a harness feature, and it shapes the file. It has to fit one read, and every line in it is paid for on every turn, so it carries only what governs and what navigates.

Its two jobs are exactly that: govern and navigate. It carries the laws and the pointers to everything else. It carries no schemas (those live in the templates), no provenance (that lives in the journal), and no rhythm names beyond the one default loop.

The sections are a tour of the convention:

| section | what it carries |
|---|---|
| `@laws` | the slug-addressed laws |
| `@layout` | where every file lives and what it is for |
| `@record` | the artifact map: what each artifact records and why |
| `@journal` | the event workflow: formation, substance, liveness, markings |
| `@backlog` | the task workflow |
| `@query` | how the agent decides what to load |
| `@boot` | the sequence that starts every working period |
| `@interact` | how the agent treats the human |
| `@rhythms` | the rhythm contract and the default design loop |
| `@subagents` | the dispatch contract |
| `@refresh` | the artifact sweep |
| `@close` | period end and unit close |
| `@handoff` | the proof before context death |
| `@git` | the gitignore strategy for the workspace |
| `@update` | how the base evolves upstream |

### The laws

The laws are the spine of the whole system, and they ride with the agent every turn. Each law reads `slug: statement`, and a reference addresses the slug, as in `@laws#verify-before-close`. Core laws include:

- `source-of-truth`: session records are the only source of truth, never the conversation.
- `load-only-needed`: load only what the work needs; closed sessions stay untouched unless the task calls for them.
- `compact-streams`: all shell commands execute through the ctx runner to preserve context window capacity.
- `writer-holds-volume`: the schema holds the shape, the writer holds the volume.
- `process-free`: process is free and human-chosen; govern the output, not the process.
- `compose-from-record`: compose from the record, never from the conversation.
- `verify-before-close`: no done without evidence, and never a claim of verification not performed.
- `harvest-the-human`: durable knowledge is surfaced by question, crystallized, and landed with approval.
- `workspace-confinement`: the workspace is the boundary; the agent never roams outside it.
- `engine-blackbox`: the engine is an execution runtime, never reading material; discover contracts via help and templates, never by inspecting script implementations.
- `storage-backend-authority`: the configured storage backend is the single authoritative source of truth; agents interact through semantic CLI verbs, never assuming physical file paths or database schemas.
- `semantic-boundary`: the record is an abstract domain surface, accessed strictly through session and lane CLI verbs.
- `abstract-references`: cross-entity references resolve through domain notation, never raw file paths.
- `multilingual-search-translation`: translate non-English intent into targeted English search terms, synthesizing responses in the user's language.

Slug addressing is what lets the set grow and the overlays extend it. A positional name would force every reference to chase every insertion; a slug is stable for life, and an overlay can append its own laws at the end without renumbering anything.

### The overlays beside it

AGENTS.workspace.md and AGENTS.local.md sit beside the base and extend it, by section, with `@append` or `@replace`. The workspace overlay is shared and tracked with the work; the local file is personal and yields to the workspace when they disagree. Both amend; neither may contradict a law. They have their own page; here it matters only that the base plus its overlays is what the agent actually reads.

## The templates

The grammars live in `.contexture/templates/`, one per artifact:

| grammar | the artifact it shapes |
|---|---|
| `state.md` | the live pointer |
| `backlog.md` | the unit's tasks |
| `journal.md` | the events |
| `knowledge.md` | the settled findings |
| `recipe.md` | a subagent's brief |
| `report.md` | a subagent's report |
| `overlay.md` | AGENTS.workspace.md and AGENTS.local.md |

Writing is filling, never inventing: an artifact is written by filling its grammar directly, with the template in hand as the complete shape. Each grammar carries every valid variation and a filled sample at its foot, written in template syntax with angle-bracket placeholders, so the shape can be read without concrete content to copy.

That last property is the drift control. Templates in a tracked folder stay exact as long as something applies them, and the fix for drift is navigation, not memory: AGENTS.md points at them, and the artifact grammar demands a match.

### The shared dialect

All grammars speak one dialect, and it is contractual. Typed blocks start at column 0; bodies indent two; `::` opens an indented block value; `|` means alternation only; `[ ]` wraps optional parts; `->` means flow; `#` starts a comment. Whitespace is load-bearing: a block that starts at the wrong column silently breaks every query written against it.

Spellings are contractual too. A pointer names its target exactly, a section and step (`@refresh`) or a path and symbol (`finding#NAME`); a vague mention is a defect. The reason is mechanical: the workspace queries with plain search, and a vocabulary word with two spellings is a search that silently misses.

The dialect governs form, never volume. It compresses how things are written, never how much: the schema holds the shape, the writer holds the volume. The grammars name the elements an artifact must carry; the rest is freestyle. The artifacts themselves, and the fields they carry, are the record page's material.

## The scripts

The runtime ships as one POSIX sh file at `.contexture/ctx`: discovery, help assembly, dispatch, the run engine, and the hook runner. Around it, modules declare their surface and the engine does the rest. The record engine is the session module, its verbs as extension-less scripts under `.contexture/modules/session/scripts/`, one file per verb, each carrying its `# summary:` and its `# usage:` lines; the workhorses are POSIX awk, which means no dependencies, no model tokens, and the same answer every time. A module directory holds a `module` file (its `# summary:`) and a `scripts/` folder whose files are its verbs; the engine assembles `ctx help`, `ctx <module> help`, and `ctx <module> help <verb>` from those declarations, so help is engine-owned and no module ships a help script. Dispatch validates the verb engine-side, anchors every command at the workspace root, and passes arguments, streams, and exit codes through. `ctx session` fronts the record engine's verbs; `help` (or `--help`, or `-h`) prints the full contract table, so no one reads a script to learn one. After a verb, `--help` or `-h` alone prints that verb's own table: a shell verb answers it itself, and for an awk verb the engine prints the table `ctx <module> help <verb>` prints, since an awk interpreter would read a leading dash argument as its own option and the verb would never see it. Nothing needs installing.

Alongside the session engine, `ctx run` provides zero-parameter discoverable stream compaction and command execution. It operates both as a direct runner prefix (`ctx run <cmd>`, full path `.contexture/ctx run <cmd>`) preserving exact exit codes, and as a standard Unix pipe (`cmd | ctx run`). Runner mode selects the filter by the wrapped command's identity, read from the `# command: <regex>` header, and falls back to the signature scan when no command claims the line; stdin mode selects by the stream signature (`# match: <regex>`), sampled from the first 40 lines. The directive text reaches awk through the environment, so backslash escapes in a signature survive verbatim. ANSI escape sequences are stripped before selection and filtering, while the raw bytes stay untouched for the fail-safe comparison. Capture files for runner mode prefer the workspace's gitignored `.contexture/tmp/` when it is writable, and fall back to the caller's TMPDIR only when the drawer cannot hold them.

Filters live in the run module's `.contexture/modules/run/filters/*.awk` and in any module's `filters/` directory; the scan takes the run module first, then the other modules by name. Their headers are the contract: `# match:` for the stream signature, `# command:` for the command identity, `# default` for the fallback, `# stream: merged` for filters that need the command's stderr inside the filtered stream, and `# format-only:` for filters whose marker-less reductions are layout rather than lost content. Core Contexture ships low-risk filters for Git unified diffs (`diff.awk`), directory listings (`list.awk`), and generic log deduplication (`log.awk`). The guards are strict: empty or grown output falls back to raw, a shrinking filter without a notice line falls back to raw unless it declares `# format-only`, a notice-only output passes through so a false-green signal is never hidden, and command stderr stays visible, whole on failure or empty stdout and tail-capped with its own notice otherwise. `COMPACT_DISABLE=1` bypasses compaction entirely; `COMPACT_DEBUG=1` reports the selection on stderr.

Building your own verb, hook, or filter? The module contract is in [Modules](modules.md).

### Storage Provider Interface (SPI) and driver architecture

The session engine is decoupled from physical storage formats through the Storage Provider Interface (SPI). Every session and lane verb reaches the record only through driver methods, so the configured backend is the single store: nothing outside a driver opens a session artifact. The methods, by subsystem:

- `artifact`: `artifact.read`, `artifact.write`, `artifact.list` (the store: an artifact's canonical text by key)
- `session`: `session.create`, `session.list`, `session.init`, `session.load`, `session.board`, `session.stamp`, `session.pointer`, `session.refs`, `session.close`, `session.audit`
- `task`: `task.add`, `task.update`, `task.start`, `task.complete`, `task.reopen`, `task.drop`, `task.list`, `task.show`
- `entry`: `entry.record`, `entry.show`, `entry.list`, `entry.anchors`
- `finding`: `finding.add`, `finding.show`, `finding.update`, `finding.supersede`, `finding.drop`, `finding.list`
- `resolve`: `resolve.ref`
- `lane`: `lane.create`, `lane.record`, `lane.report`, `lane.show`, `lane.status`, `lane.close`
- `search`: `search.query`
- `storage`: `storage.health`

#### The store methods and the verb layer

The record grammar is the canonical text, and the posix files are its reference serialization. An artifact key names one artifact of a unit: `state`, `backlog`, `knowledge`, `journal`, `lane/<lane>/recipe`, `lane/<lane>/journal`, `lane/<lane>/report`.

| method | argv | stdin | answer |
|---|---|---|---|
| `artifact.read` | `<unit> <key>` | none | the stored text byte for byte; rc 1 `ERR_ENTITY_NOT_FOUND` when absent |
| `artifact.write` | `<unit> <key>` | the whole new text, raw | an atomic replace; a lane key creates its lane; rc 1 for an absent unit |
| `artifact.list` | `<unit>` | none | the keys the unit holds, one per line: the main four in order, then `lane/<lane>` and its artifacts |
| `session.create` | `<unit>` | none | an empty unit; rc 1 `ERR_ENTITY_EXISTS` for a unit the store holds |
| `session.list` | none | none | `{"sessions":[{"unit","status"}]}`, bytewise by unit; a unit without a state carries an empty status |
| `storage.health` | none | none | `{"driver","health","detail"}`; health `degraded` while the store holds nothing yet |

The grammar verbs (`record`, `append`, `amend`, `flip`, `drop`, `next`, `refs`, `close`, `reopen`, `stamp`, `bootstrap`) and the read verbs (`board`, `load`, `audit`, `refresh`, `active`, every `query` kind) keep their validation and their rendering in the verb layer, unchanged: they fetch the artifacts they read through `artifact.read` into a scratch folder under `.contexture/tmp` (removed at exit), and they land every write through `artifact.write`, so validation runs before any driver call and both drivers feed the same renderer. `bootstrap` creates the unit with `session.create`; `active`, `query units`, and `query refs-to` walk `session.list`; `query lane` and `query search` list a unit's lanes with `artifact.list`; `diagnose` reads `storage.health` and counts the `ACTIVE` units of `session.list`. The typed verbs (`task`, `finding`, `entry`, `resolve`, `search`, `lane record`, `lane report`, `lane show`) call their domain methods. Every typed write refuses a `CLOSED` unit (rc 1) before any driver write, as the grammar verbs always have. The dialect is LF: a carriage return in a typed field value (the `task`, `finding`, and `lane record` fields, every `record` flag, the `next` pointer, the `stamp` attention, the `bootstrap` objective and repos) refuses rc 1 before any write, since the grammar verbs refuse an artifact carrying a carriage return on read. A one-line field (every `record` flag, the `task` objective, refs, pointer, evidence, and reason, the `finding` ref and supersedes, the `lane record` what, thread, and slug, the `next` pointer, the `stamp` attention, the `bootstrap` objective and repos) lands as one line of its block, so an embedded newline refuses rc 1 before any write too: a column-0 continuation would break the block grammar. The block scalars keep their newlines. The refusal is forward only: an entry already written with a continuation line still loads and audits as before. An embedded double quote is text: the typed verbs store it, and `append` accepts a `WHAT` that is one quoted line whatever quotes it carries.

#### The payload transport

argv carries only the method and its bounded identifiers (the unit, a slug or NAME, a lane, an artifact key, a page, a filter token such as `--status`, `--anchor`, `--group`, `--limit`, `--entity`, `--mode`). Every free-text field travels on stdin as payload lines `key=value`, the value escaped (backslash as `\\`, newline as `\n`, tab as `\t`, carriage return as `\r`), so a field of any size or content never meets the platform argument limit and survives exactly, a trailing newline included. A single-document write (`artifact.write`, `lane.report <unit> <lane> --write`) is the raw stdin itself. The decoded value reaches the rendered block verbatim: a newline in a block scalar (`DESCRIPTION`, `ACCEPTANCE CRITERIA`, `IMPLEMENTATION DETAILS`, `SUMMARY`) is a second body line and a backslash sequence stays literal; the posix driver hands free text to its awk renderers through the environment, never through `awk -v`, which interprets backslash escapes and refuses a newline, and a render that fails refuses rc 2 with nothing written. The payload keys: `session.init` objective; `session.stamp` attention; `session.pointer` pointer; `task.add` objective, desc, criteria, details, refs; `task.update` objective, desc, criteria, details; `task.start` pointer; `task.complete` evidence; `task.drop` reason; `entry.record` what, group, thread, closes; `finding.add` summary, ref, supersedes; `finding.update` summary, ref; `finding.supersede` summary, ref (argv `<unit> <predecessor> <successor>`); `lane.create` goal, recipe; `lane.record` what, thread (argv `<unit> <lane> <slug>`); `lane.close` resolution; `search.query` query. A method without payload keys never reads stdin.

#### Driver discovery hierarchy

The driver resolver discovers storage drivers through a strict 3-tier hierarchy:
1. Workspace custom drivers: `.contexture/drivers/<name>/driver`
2. Module-owned drivers: `.contexture/modules/<module>/drivers/<driver-name>/driver` or `.contexture/modules/session/drivers/<driver-name>/driver`
3. PATH executables: system binaries named `ctx-storage-<name>`

The resolver passes stdin through to the driver untouched and exports `CTX_REFERENCE_DRIVER`, the posix driver beside it, the reference serialization an indexed driver renders the grammar through.

#### Configuration precedence

Driver selection follows deterministic precedence:
1. `CTX_STORAGE_DRIVER` environment variable
2. Workspace configuration file (`.contexture/config` or `.contexture/storage.conf`, key `session.storage.driver` or `storage.driver`)
3. Default baseline: `posix`

#### Capability handshake and error codes

Before a driver serves a method, the resolver invokes `$DRIVER_EXEC capability` (stdin from `/dev/null`, never the payload) to retrieve a JSON capability descriptor and validates the mandatory capabilities: `session.lifecycle`, `task.crud`, `task.atomic_completion`, `entry.journal`, `resolve.symbolic`, `search.keyword`, `artifact.store`, a finding capability (`finding.knowledge` or `finding.crud`), and a lane capability (`lane.lifecycle` or `lane.artifacts`). A driver missing one halts the call rc 2 `ERR_CAPABILITY_UNSUPPORTED`, naming what is missing, before the method runs; so a verb on such a driver (`bootstrap` first of all) refuses and writes nothing. The handshake runs at dispatch for every driver except the bundled posix driver (the reference serialization shipped beside the resolver), in both dispatch forms (`exec <method>` and `<subsystem>.<method>`). The verdict is cached in the scratch drawer (`.contexture/tmp/driver-verdicts/`, one file per driver path) and stays valid while it is strictly newer than the driver executable, so the handshake runs once per driver change, never once per call; a driver changed within the second of its verdict is verified again until a later verdict stands, and an unwritable drawer caches nothing and verifies on every call. `driver-resolver capability` and `check` (and `ctx session diagnose`) run the handshake afresh.

All drivers adhere to a standardized 3-tier exit code hierarchy:
- `0`: success
- `1`: semantic or validation error (entity exists, missing entity, invalid arguments, schema violation, a mode the driver lacks: `ERR_CAPABILITY_UNSUPPORTED`)
- `2`: storage or driver fatal error (driver not found, capability failure, IO error, lock contention, a write the backend refused: `ERR_STORAGE_WRITE`)

A driver never prints a success payload for a write that did not land: a replace the drawer refuses (a read-only folder, a full disk) removes its temp and exits 2 `ERR_STORAGE_WRITE`. An interrupted method (HUP, INT, TERM) exits through its cleanup on every sh, dash included: the staged payload and the materialized scratch unit are removed and a held unit lock is released; a SIGKILL cannot be trapped, so a lock left by a killed writer stays until it is removed, and later writers of that unit time out on it (`ERR_STORAGE_LOCKED`). A repeated key refuses rc 1 `ERR_ENTITY_EXISTS` on every driver: a task slug, a finding NAME, a journal entry slug, a lane entry slug. The compliance harness (`tests/storage-compliance.sh`, 38 cases in 11 suites) proves each driver against the contract by the data it returns, not by exit codes alone: closure filtering on the board and in `entry.show`, task status after each task verb, a dropped task gone from every read, `finding.list` with and without the active filter, lane artifacts round-tripping, repeated keys refused, the exact bytes of an artifact round trip, a 2 MB report over stdin, the canonical status filter, the refs array, typed resolve blocks, the entry filters, and the search shape. The ship gate runs it against base's posix driver; the storage-fts5 plugin suite runs it against the plugin's own driver.

#### Split-brain prevention

If a non-posix driver is configured (such as `fts5` or `sqlite`) and its executable cannot be resolved or fails handshake validation, the engine halts immediately with exit code 2 (`ERR_DRIVER_NOT_FOUND`, `ERR_DRIVER_PROTOCOL` when the capability call itself fails, or `ERR_CAPABILITY_UNSUPPORTED` when a mandatory capability is missing). The engine never falls back silently to `posix` when a custom driver was configured, and no verb opens an artifact outside the driver, so records never diverge between storage engines. The ship gate runs the whole session suite twice, once per driver, and a verb re-pointed at the files turns the fts5 run red.

#### Available drivers

- Baseline POSIX driver (`posix`): zero-dependency POSIX sh and awk driver keeping each artifact as a markdown file under `.contexture/sessions/<unit>/`; it is also the reference serialization of the record grammar.
- SQLite FTS5 driver (`storage-fts5` plugin): keeps every artifact's canonical text verbatim in one SQLite database, with a relational index rebuilt from the text of the artifact that changed, dual FTS5 virtual tables (Porter English stemming plus Trigram tokenization), unicode61 with `remove_diacritics 0` for Turkish and diacritics, pure SQL Reciprocal Rank Fusion (RRF) search ranking, and bidirectional migration (`ctx storage-fts5 migrate`). Its record methods render through the reference serialization over the unit materialized from the store, so both drivers answer every method alike; see the plugin README.

### Semantic CLI verbs

Primary agent interactions operate through typed CLI commands with structured arguments and atomic transitions:

#### Task operations: ctx session task
- `ctx session task add <unit> <slug> --objective="..." [--desc="..."] [--criteria="..."] [--details="..."] [--refs="..."]`: creates a new task in `TODO` status.
- `ctx session task update <unit> <slug> [--objective="..."] [--desc="..."] [--criteria="..."] [--details="..."]`: updates task fields in place; a section the block lacks lands at its template position.
- `ctx session task start <unit> <slug> [--pointer="..."]`: atomically marks task `IN_PROGRESS` and updates `next_action` in state.
- `ctx session task complete <unit> <slug> --evidence="..."`: atomically marks task `DONE` and records completion receipt (`backlog/<slug>: DONE <evidence>`) in the journal.
- `ctx session task reopen <unit> <slug>`: returns task to `TODO`.
- `ctx session task drop <unit> <slug> --reason="..."`: removes task and logs the drop receipt (`backlog/<slug>: DROPPED (<reason>)`).
- `ctx session task list <unit> [--status=todo|progress|done|all]`: lists tasks filtered by status; the verb maps the words to `TODO`, `IN_PROGRESS`, `DONE`, and every status (one home for every driver) and refuses another word rc 1.
- `ctx session task show <unit> <slug>`: prints full task block; `--json` carries `refs` as an array.

Every task write refuses a malformed slug (letters, digits, underscore, dash; starts alphanumeric) and a `CLOSED` unit with rc 1.

#### Journal event recording: ctx session record
- `ctx session record <unit> --what="..." [--group=...] [--thread=...] [--ref=...] [--closes=...] [--supersedes=...] [--knowledge]`: appends an immutable event with auto-injected local date (`YYYY-MM-DD`), active anchor from state, and default `THREAD: none`.
- `ctx session entry show <unit> <slug> [--json]`: displays a single journal entry: the text view prints the block's `@entry`, `ANCHOR`, `WHAT`, `GROUP`, and `THREAD` lines; `--json` carries `slug`, `anchor`, `what`, `group`, `thread`, and `ref` (the entry's `REF` value, an empty string when it has none) plus the closure (`is_closed`, `closed_by`, `close_reason`).
- `ctx session entry list <unit> [--anchor=A<N>] [--group=...] [--json]`: lists journal entries; the driver filters by the exact ANCHOR and GROUP, so the text and the JSON agree.
- `ctx session record --slug=<slug>` refuses a slug the journal already carries (rc 1).

#### Finding lifecycle CRUD: ctx session finding
- `ctx session finding add <unit> <NAME> --summary="..." [--ref=...] [--supersedes=...]`: adds a new finding with status `ACTIVE`.
- `ctx session finding show <unit> <NAME>`: displays finding and supersession lineage.
- `ctx session finding update <unit> <NAME> --summary="..." [--ref=...]`: updates the summary, the reference, or both in place; a `--ref` replaces the finding's `REF` line, or adds one after the summary when the finding had none.
- `ctx session finding supersede <unit> <old-name> <new-name> --summary="..." [--ref=...]`: records forward-only supersession preserving audit lineage; a missing predecessor refuses rc 1.
- `ctx session finding drop <unit> <NAME>`: removes an invalidated finding.

A NAME the knowledge already carries refuses rc 1 (`ERR_ENTITY_EXISTS`); a raw `@finding` block on stdin is parsed, never evaluated by the shell; every finding write refuses a `CLOSED` unit.
- `ctx session finding list <unit> [--active-only]`: lists findings, optionally omitting superseded items.

#### Universal search: ctx session search
- `ctx session search <unit> "<query>" [--limit=N] [--entity=TYPE] [--mode=MODE] [--json]`: searches across all entity domains. Every driver returns one shape: `{"unit","query","mode","total_matches","results":[...]}`, each result carrying `entity_type` (session, task, entry, finding, lane, lane_entry), `entity_id`, `section` (the artifact the hit came from: state, backlog, knowledge, journal, lane_recipe, lane_journal, lane_report), and `snippet`; a ranked driver adds `rrf_score` and `sources` to each result. `total_matches` counts every match, `--limit` caps the results (default 20), `--entity` keeps one entity type (`all` for every one), `--mode` is `exact` (a case-insensitive substring, every driver), `hybrid` (the fts5 RRF fusion, its default), or `trigram` (the fts5 trigram table); a driver without a mode refuses it rc 1 `ERR_CAPABILITY_UNSUPPORTED` (posix searches exact substrings only). An empty query refuses rc 1 `ERR_INVALID_ARGUMENT`. The text view prints a count line and one line per result; `--json` passes the payload through.

#### Reference resolution: ctx session resolve
- `ctx session resolve <unit> <ref>`: resolves abstract domain references (`task#slug`, `entry#slug`, `finding#NAME`, `lane#slug/report#claim`) and the legacy file forms (`backlog.md#slug`, `journal.md#slug`, `knowledge.md#NAME`, `lanes/<lane>/report.md#claim`) on every driver; the text view prints the entity block verbatim, `--json` carries the target fields and the `block`.

### Subagent lane management: ctx lane

Subagent operations are governed through the dedicated top-level `ctx lane` module:

```bash
.contexture/ctx lane show <unit> <lane-slug> [recipe|journal|report] [--json]
.contexture/ctx lane record <unit> <lane-slug> --what="..." [--slug=...] [--thread=...]
.contexture/ctx lane report <unit> <lane-slug> [--body="..." | stdin] [--json]
```

- `show`: prints one of `recipe.md`, `journal.md`, `report.md` (the report by default).
- `record`: logs action traces into the subagent's lane journal; a slug the lane journal carries refuses rc 1, a generated slug takes a suffix instead.
- `report`: writes the lane report from `--body` or stdin, or reads it back when neither is given; the body reaches the driver raw on stdin, so a report of any size lands (a 2 MB report is a gate case). With no `--body`, it reads stdin whenever stdin is not a terminal, and no POSIX sh tells an idle open pipe from a slow writer, so under an open pipe it waits until the writer closes. The scripted read path is `ctx lane show <unit> <lane-slug> report`, which never reads stdin; `report`'s read mode is for a terminal (or a call fed `</dev/null`).

`record` and a `report` write refuse a `CLOSED` unit with rc 1.

Both views decode the driver's JSON string with every escape honored (`\\`, `\"`, `\n`, `\t`, `\r`), so the text output is the stored artifact byte for byte; `--json` passes the driver payload through (`show` names the field `content`, `report` names it `report`).

Isolating lane operations into `ctx lane` prevents accidental pollution of parent session journals upon argument omission.

### ctx session load: the load and the refs form

Returns the map plus one page of the load: state, backlog, knowledge, the live journal, and any declared `ref_sessions` under read-only banners. The map names each section with its line count and pages, then the write-scope trailer; pages cut at block boundaries, never mid-body: a page ends before the block that would pass about 500 lines or about 40KB, whichever binds first, and a single block larger than the budget renders whole on its own page. The backlog section renders its DONE task blocks compactly, keeping only the task line, `STATUS`, `OBJECTIVE`, and `DESCRIPTION`; open and statusless blocks render whole, and the backlog file itself is never edited, so the full body stays one `resolve` away. An incomplete call opens with `LOAD INCOMPLETE` and instructs the next call in its last line; the final page opens with `LOAD COMPLETE` and hands off to the receipt stamp.

```bash
.contexture/ctx session load <unit>
.contexture/ctx session load refs <ref_1> ... <ref_N> [<page>]
```

Read every page the map reports. A missing `state.md` is fatal; a missing backlog, knowledge, or journal is loud and nonfatal, with a placeholder standing in its section; the warning names the artifact and its unit (`WARNING: missing knowledge: unit <unit>`), never a storage location, so a ref session the configured store does not hold reads the same under every driver. The journal section composes the board (`ctx session board`), so the extraction has one home; the board's open threads and open tasks ride that section unchanged.

The cut is budgeted twice, about 500 lines or about 40KB, whichever binds first, so a page stays under the harness's output cap in practice; the one residual is a single block that exceeds the budget alone, and it renders whole on its own page. If a harness still truncates such a page, it prints a notice naming its saved copy of the command's output: that copy is the command's own output, and reading it is sanctioned by `@laws#workspace-confinement`, read-only, that named file alone. Routing the same content through temp files stays unsanctioned. The in-workspace fallbacks need nothing outside: every section is composed from the session records, so `ctx session board` or a direct read of the record recovers the same content.

The refs form is the on-demand consult: it streams the named sessions alone, each composed exactly as the unit load composes a reference, and pages them locally with its own map, banner, and tail, so a large reference never truncates. A missing ref is fatal; zero refs, or a numeric token in a ref position, prints the usage at rc 1; a session named `refs` stays reachable through the escape hatch `ctx session load refs refs`.

### ctx session stamp: the receipt

Derives the next anchor from `state.md`, rewrites `current_anchor`, and appends the anchor line with the attention verbatim, printing the transition. A malformed state file or a missing attention fails loudly, with no partial write.

```bash
.contexture/ctx session stamp <unit> "<attention>"
```

`.contexture/ctx session query anchors <unit>` reconstructs the map of periods and their receipts.

### ctx session board: the board

Returns the live board: every unclosed entry with its body whole, then the open task slugs and the open threads with their targets, each list under its nudge line; an empty list prints nothing. Live means unclosed: the set is the journal entries that no closure names. Takes one form, a session slug:

```bash
.contexture/ctx session board <unit>
```

The script collects closure targets and streams live bodies in one shot, then lists the backlog slugs whose status is not DONE under the closing nudge; the opener names the counts, and a missing backlog is loud on stderr with no tail. The closure parse reads the target field only, so a slug mentioned in a closure's reason prose can never close anything. The output is the set, whole, with no hand-picking and no per-entry reads. Any other invocation of `ctx session board` fails loudly: a path, the legacy double path, an extra argument, or a flag.

`ctx session load` composes this board for the load's journal section; run directly, `ctx session board` is the updated board: the open entries, the open threads, and the open tasks in one stream. The refs form composes the board per reference session, so a consulted session streams its live entries too.

### ctx session query: the named looks

Answers the foreseeable questions over the record in bounded form, so no one improvises a grep that over-reads. Every kind is a named form, never a flag:

```bash
.contexture/ctx session query <kind> [args]
.contexture/ctx session query units <repo>
.contexture/ctx session query anchors <unit>
.contexture/ctx session query search <unit> <term>
```

| kind | args | what it returns |
|---|---|---|
| `entry` | `<unit> <slug>` | the entry block verbatim; duplicates render every match |
| `group` | `<unit> <token>` | one short line per entry: anchor, slug, the `WHAT` opening |
| `anchors` | `<unit>` | the `@anchor` lines verbatim, with the count |
| `finding` | `<unit> <NAME>` | the finding block plus its supersession chain, cycles marked |
| `closure` | `<unit> <slug>` | open, or the closers with their verdicts and lines |
| `units` | `<repo>` | each unit touching the repo: slug, status, anchor, next action |
| `refs-to` | `<session>` | each unit referencing the session |
| `resolve` | `<unit> <ref>` | the block behind an abstract or legacy reference |
| `lane` | `<unit> <lane>` | file presence with line and byte counts, the journal's last line, the report's first |
| `search` | `<unit> <term>` | bounded match lines across state, backlog, knowledge, journal, and subagent artifacts |

Every miss is loud: rc 1, zero stdout, a named error, never a plausible empty. Outputs are bounded by construction: group and search snippets cut at 90 bytes on word boundaries, search stops at 50 lines with a trailing count, and entry, finding, closure, and resolve render verbatim. One bound is deliberately absent: `group` renders one line per matching entry, with its count in the opener, and no cap. A large thread streams whole, because the thread itself is what the caller came to read; the per-row snippet is the part that stays capped. Target lookups miss loudly; a listing without a target carries its count, so a zero-anchor journal prints `0 anchors`. Names match exactly and shapes are validated before any output; a wrong invocation refuses with the kind's usage.

### The legacy write acts: append, amend, flip, drop, next, refs, close, reopen

The legacy block piping commands provide backward compatibility for existing pipelines and bulk data imports:

```bash
.contexture/ctx session append <unit>
.contexture/ctx session amend <unit> <slug>
.contexture/ctx session flip <unit> <verb> <slug> [<slug> ...]
.contexture/ctx session drop <unit> <slug> [<slug> ...]
.contexture/ctx session next <unit> "<pointer>"
.contexture/ctx session refs <unit> [<session> ...]
.contexture/ctx session close <unit>
.contexture/ctx session reopen <unit>
```

`append` reads one or more blocks on stdin, and each block's first line decides where it lands: `@entry` in the journal, `@finding` in knowledge, `@task` in the backlog. The shapes are the templates (`.contexture/templates/`); write by filling one, and the command derives the anchor, normalizes the form, and appends it with the standard separator. An `@entry` must carry its `THREAD` line: the act outside the unit's own flow that must resolve it, or `none`; a missing line, an empty value, a duplicate, or `true` and `false` refuse. `amend` replaces task fields in place, and the rest of the task stays byte-identical. `flip` moves a status: `progress` refuses until the state already names the slug, and `done` lands the receipt first, one entry whose `WHAT` carries each slug's `backlog/<slug>: DONE` with the evidence. `drop` removes the tasks a record entry names, and the record stays. `next` overwrites the pointer. `refs` sets the read-only mounts; zero sessions clears them. `close` marks the unit `CLOSED`, warning on open tasks and audit findings rather than refusing. `reopen` marks a `CLOSED` unit `ACTIVE` again so its work can resume; it refuses for a unit that is not `CLOSED`.

Every form validates all inputs before any write: a refusal is loud, rc 1 with zero partial writes, and a landing prints what it wrote. The acts repeat, so one call carries several blocks or several slugs.

### ctx session audit: the repair instrument

Returns the record's defects, each flagged with a line or a slug, and exits nonzero when any fires. Takes one form, a session slug:

```bash
.contexture/ctx session audit <unit>
```

The script derives `backlog.md` and `state.md` from the session folder; a sibling that cannot be read skips its check quietly. When the run is clean the script also prints the open-thread tail: the entries whose `THREAD` names an act outside the unit and that no closure names, each with its target. The tail is a display, never an enforcement: a thread that pauses stays open, and its line in the tail is the reminder it exists. The audit parses the valued form, and the presence check runs from the enforcement era: an entry dated at or after `2026-09-18` that carries no `THREAD` line flags `MISSING THREAD`; the constant (`ENF_FROM`) lives in the script's BEGIN block, so pre-era records stay quiet.

The classes, and what each one asks for:

| flag | the defect | the repair |
|---|---|---|
| dangling closer | a `CLOSES:` or `SUPERSEDES:` names a slug no entry carries | fix the slug or the closer |
| slugless closer | a closer carries no valid date-slug target | point it at real entries |
| dateless entry slug | an entry name does not match the date-slug grammar | fix the entry's slug to the date-slug grammar |
| inline marker | `THREAD:` or `KNOWLEDGE:` sits on the `@entry` line | move it to its own field line |
| missing thread | a post-era `@entry` with no `THREAD` line | declare the `THREAD` line: what it awaits, or `none` |
| unharvested knowledge | a `KNOWLEDGE: true` entry that no closer names | harvest it at the next refresh; the entry then closes by reference |
| done without event | a `STATUS: DONE` task with no `backlog/<slug>: DONE` line in the journal | record the completion event |
| in-progress absent from state | a `STATUS: IN_PROGRESS` task the state pointer does not name | refresh `next_action` in state.md |

The audit is a repair instrument: fix what it flags and fill what is missing before the period ends; a note about a flag is not a repair. It runs at refresh, close, and handoff, and close and handoff expect exit 0.

### ctx session index: the selection index

Returns one line per rhythm: the name, the path, its trigger, and its activation policy. It takes no arguments; it reads `.contexture/rhythms/`.

```bash
.contexture/ctx session index
```

The boot loads this index to discover what rhythms exist; a rhythm's body loads only when it is selected. A file with no `use when:` line prints `(missing)`, and an activation the file does not state defaults to `propose`: the agent proposes the rhythm on its trigger and the human confirms. `auto` is the explicit opt-in, where the agent applies the rhythm without a separate ask.

### One audit per grammar

The runtime and the built-in modules are payload instruments, shipped with the convention and identical everywhere. A session can also carry an audit of its own for a grammar the payload does not know yet; the session's bank audit is the precedent. It stays session-local until its grammar proves generic, then it can promote to the payload as a sibling. The separation is deliberate: no experimental checks inside a shipped script, and each audit derives its siblings rather than being handed their paths. Refresh and handoff run every audit in play, and the receipt carries the results.

## The completeness loop

The loop is what the machinery does with the record: it makes gaps visible at fixed points and demands repair instead of notes. Taking the stations in the order a unit meets them:

- **Boot** runs `ctx session load` and `ctx session index`. The load is the subtraction, not a judgment call, so the agent pays for what is open and nothing else.
- **Work** journals events as they happen and flags knowledge-worthy entries where they land. The flag is the harvest's input; nothing needs to be collected later.
- **Refresh** runs at every rhythm boundary and inside close. It sweeps the artifacts: events journaled, backlog statuses advanced, `next_action` refreshed. It runs the harvest: every open flag, one candidate each; a confirmed candidate lands in knowledge and its entry closes by reference, and a candidate that is not landed drops. Then it runs the audit, and what it flags is fixed.
- **Close** closes the period's done events by reference and requires the audit to exit 0.
- **Handoff** runs before context death, whether that is a compaction, a tool change, or a long break. The period-end writes run if they are not done, then the bounded cold read: run `ctx session load` and read the map and the state page, the backlog section with its open tasks whole, the journal's tail (this period's entries), and the knowledge tail when this period landed findings; the full-body pass belongs to the next boot, a fresh context. While the context is still full, improve the quality and fix what was missed; the gaps close now, never after compaction. `ctx session audit` exits 0.

Why this holds together:

- The record is append-only and schema-driven, so "missing" is a mechanical fact rather than a memory test: an absent closer, an unrecorded done event, a status the pointer does not name are all visible to a small script.
- The checks run at fixed points, and they are cheap: a few awk commands, no model tokens, the same answer every time. Frequency is the point; the open-flag sweep at each refresh is the check, not a rare batch at the end. When harvesting waited for period end, older flags slipped past every close.
- An instrument earns trust by failing on the defect it guards. A check that returns the same answer whether or not the failure is present proves nothing, so the instruments are proved against planted defects before they are trusted, and a green run means exactly the classes it checks are clean. It is never a claim that the record is complete.

## The drawer layout

Everything the convention installs or uses lives under `.contexture/`, except the files a harness must find at the repository root:

```text
AGENTS.md            the laws, delivered every turn
AGENTS.workspace.md  the shared overlay
AGENTS.local.md      your amendments
plugins/             the tracked catalog of packaged overlays: copied into a workspace when wanted
.contexture/
  ONBOARDING.md      the adoption guideline (removed when the adoption closes)
  templates/         the grammars every artifact fills
  ctx                the runtime: discovery, help assembly, dispatch, the run engine, and hooks
  modules/           session (the record engine), run (stream filters), and workspace additions
  rhythms/           your process patterns
  sessions/          the units of work
  tmp/               gitignored scratch: engines and agents prefer it over system temp (created on demand)
```

The root belongs to the harness: AGENTS.md has to sit where the harness looks for repository instructions, and the overlays sit beside it. Everything else lives in the drawer. An adopting workspace keeps its own files at the root, freely; the drawer's contents are the convention's, and the two never mix. The repository that builds the convention tracks this layout mirrored under `base/` (`base/AGENTS.md`, `base/.contexture/`); its own installation at the root is untracked working state.

### One home, three classes

Placement follows the class of the file, never convenience:

| class | paths | fate |
|---|---|---|
| update payload | `base/`: the mirrored core (`base/AGENTS.md`, `base/.contexture/{ctx,modules/session,modules/run,modules/lane,templates,ONBOARDING.md}`) | applied onto the live root from tags, byte for byte |
| catalog | `plugins/`: packaged overlays | copied into a workspace when wanted; never deleted at adoption close |
| live workspace | the untracked root: `AGENTS.md`, `.contexture/` (sessions, rhythms, tmp, workspace-added modules) | never touched by an update |

The classes exist because the files have different lives. The payload evolves with the convention and must stay identical across every workspace: it is tracked in one mirrored tree and applied onto the live root as-is, so what the tag tracks under `base/` is exactly what lands. The catalog holds the optional overlays: a workspace installs one when it wants it, and the folder is no longer deleted at adoption close. Sessions, rhythms, tmp, and workspace-added modules are the workspace's own state, and no update may touch them. `.contexture/ONBOARDING.md` rides the payload as adoption material; it is used once and removed when the adoption closes.

### The sync derives from the tag

There is no manifest. `base/` is the payload: `git archive <tag> base/` copies it, `git ls-tree` enumerates it, and a comparison per file verifies it. Whatever the tag tracks under `base/` is the set; a file cannot silently join or leave the payload without changing the tag.

### The layout bounds the load

The drawer is also the context mechanism, and the reason is structural. When the agent works a unit, it reads `.contexture/sessions/<unit>/` and the convention's files it needs, never a global blob of everything. The filesystem is the index, and the folder is the boundary: no rule has to say "do not read the rest", because the layout has already said it.

The record page covers what the artifacts hold and how liveness works; units and subagents covers the container and the dispatch; rhythms covers the process layer; overlays covers the amendment grammar; adoption covers the install.
