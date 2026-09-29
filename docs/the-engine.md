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

The runtime ships as one POSIX sh file at `.contexture/ctx`: discovery, help assembly, dispatch, the run engine, and the hook runner. Around it, modules declare their surface and the engine does the rest. The record engine is the session module, its verbs as extension-less scripts under `.contexture/modules/session/scripts/`, one file per verb, each carrying its `# summary:` and its `# usage:` lines; each verb is a thin POSIX sh script over the shared library in `.contexture/modules/session/lib/` (the verb shell `verb.sh`, the answer flattener `json.awk`, the one renderer `render.awk`) that makes one storage call and renders its answer, and the posix driver under `drivers/posix/` is POSIX sh and awk too, which means no dependencies, no model tokens, and the same answer every time. A module directory holds a `module` file (its `# summary:`) and a `scripts/` folder whose files are its verbs; the engine assembles `ctx help`, `ctx <module> help`, and `ctx <module> help <verb>` from those declarations, so help is engine-owned and no module ships a help script. Dispatch validates the verb engine-side, anchors every command at the workspace root, and passes arguments, streams, and exit codes through. `ctx session` fronts the record engine's verbs; `help` (or `--help`, or `-h`) prints the full contract table, so no one reads a script to learn one. After a verb, `--help` or `-h` alone prints that verb's own table: a shell verb answers it itself, and for an awk verb the engine prints the table `ctx <module> help <verb>` prints, since an awk interpreter would read a leading dash argument as its own option and the verb would never see it. Nothing needs installing.

Alongside the session engine, `ctx run` provides zero-parameter discoverable stream compaction and command execution. It operates both as a direct runner prefix (`ctx run <cmd>`, full path `.contexture/ctx run <cmd>`) preserving exact exit codes, and as a standard Unix pipe (`cmd | ctx run`). Runner mode selects the filter by the wrapped command's identity, read from the `# command: <regex>` header, and falls back to the signature scan when no command claims the line; stdin mode selects by the stream signature (`# match: <regex>`), sampled from the first 40 lines. The directive text reaches awk through the environment, so backslash escapes in a signature survive verbatim. ANSI escape sequences are stripped before selection and filtering, while the raw bytes stay untouched for the fail-safe comparison. Capture files for runner mode prefer the workspace's gitignored `.contexture/tmp/` when it is writable, and fall back to the caller's TMPDIR only when the drawer cannot hold them.

Filters live in the run module's `.contexture/modules/run/filters/*.awk` and in any module's `filters/` directory; the scan takes the run module first, then the other modules by name. Their headers are the contract: `# match:` for the stream signature, `# command:` for the command identity, `# default` for the fallback, `# stream: merged` for filters that need the command's stderr inside the filtered stream, and `# format-only:` for filters whose marker-less reductions are layout rather than lost content. Core Contexture ships low-risk filters for Git unified diffs (`diff.awk`), directory listings (`list.awk`), and generic log deduplication (`log.awk`). The guards are strict: empty or grown output falls back to raw, a shrinking filter without a notice line falls back to raw unless it declares `# format-only`, a notice-only output passes through so a false-green signal is never hidden, and command stderr stays visible, whole on failure or empty stdout and tail-capped with its own notice otherwise. `COMPACT_DISABLE=1` bypasses compaction entirely; `COMPACT_DEBUG=1` reports the selection on stderr.

Building your own verb, hook, or filter? The module contract is in [Modules](modules.md).

### The storage contract (contract 2)

The session engine is decoupled from how any backend stores the record. Base maps every session and lane command to one storage function, sends it the command's parameters, and renders the data the function returns; each backend owns how it interprets, processes, and stores that data, and each implements the record rules itself. The posix driver keeps the record as markdown files under `.contexture/sessions/<unit>/` and is the only code that touches them; the fts5 driver answers from its database with SQL; the service driver forwards each call to the storage service and never sees how the service stores it. No backend materializes a unit or delegates to another backend, and no markdown crosses the interface: the record travels as typed data. The configured backend is the single store, so a verb never opens a session artifact itself.

This section is the text every backend is held to, and `tests/storage-compliance.sh` is its executable form: the same suite runs against posix, fts5, and the service through `--driver-exec`, and a backend is compliant when every case passes. The v0.54.0 drivers spoke contract 1, whose verb layer fetched whole artifacts and rendered the files itself; against a contract 1 driver every record case fails and only the corpus cases pass, and the contract 2 handshake refuses it at dispatch.

#### The wire

A call is the driver executable run with the function name and its bounded identifiers as argv (a unit, a slug or NAME, a lane, an artifact word, filter tokens such as `--limit=N`), and every free-text field on stdin as payload lines `key=value`. The value is escaped: backslash as `\\`, newline as `\n`, tab as `\t`, carriage return as `\r`, so a value of any size or content survives exactly and never meets the platform argument limit. A list travels as `<key>.count=N` followed by `<key>.1` to `<key>.N`; `<key>.count=0` is the empty list, and an absent key is an absent field. A list of records travels as `<key>.count=N` and `<key>.<n>.<field>`, and a list inside a record nests the same way (`closers.1.targets.count=2`, `closers.1.targets.1=...`). A single document (a recipe, a report) is the raw stdin itself and the function takes no other payload. A function without payload keys never needs stdin.

The answer is rc 0 and exactly one line on stdout: one compact JSON object (no whitespace between tokens) with its keys in the order this section lists them and every listed field present, `null` when absent. Strings are UTF-8 in one JSON form, the form `JSON.stringify` writes: `\"` and `\\`, the short escapes `\b`, `\f`, `\n`, `\r`, `\t`, `\u00XX` (lower-case hex) for the other characters below 0x20, and every other character raw, `/` and non-ASCII included. Integers are plain decimals; a score is a JSON number. Because the form is fixed, the same record answers the same bytes from every backend, and `--json` on a verb prints the function's answer unchanged.

A refusal is rc 1 (the caller's input or the record's rules) or rc 2 (storage or driver failure), nothing on stdout, and exactly one stderr line `<function>: error: <message> (<CODE>)`. The message is fixed per code, so every backend prints the same line:

| code | tier | message |
|---|---|---|
| `ERR_INVALID_ARGUMENT` | 1 | the detail of the shape at fault (a missing or malformed identifier, a malformed payload line, an empty search query) |
| `ERR_ENTITY_NOT_FOUND` | 1 | `<kind> '<x>' not found in unit '<u>'` (kind `task`, `entry`, `finding`, `lane`, and `artifact` for `session.board` and `session.audit` of a unit whose journal is absent: `artifact 'journal' not found in unit '<u>'`); `unit '<u>' not found` |
| `ERR_ENTITY_EXISTS` | 1 | `<kind> '<x>' already exists in unit '<u>'` (a lane entry reads `lane entry '<lane>/<slug>'`); `unit '<u>' already exists` |
| `ERR_UNIT_CLOSED` | 1 | `unit '<u>' is CLOSED; a closed unit takes no writes` |
| `ERR_INVALID_TRANSITION` | 1 | `<kind> '<x>' is <STATUS>; <function> moves only from <allowed>`, allowed `TODO` (task.start), `TODO or IN_PROGRESS` (task.complete), `IN_PROGRESS or DONE` (task.reopen), `TODO, DONE, or an IN_PROGRESS task next_action does not name` (task.drop), `ACTIVE` (session.close), `CLOSED` (session.reopen) |
| `ERR_POINTER_INCOMPLETE` | 1 | `next_action would not name IN_PROGRESS task(s): <slugs>`, the omitted slugs in backlog order joined by `, ` |
| `ERR_CAPABILITY_UNSUPPORTED` | 1 | `mode '<m>' is not supported; declared modes: <modes joined by , >` |
| `ERR_CAPABILITY_UNSUPPORTED` | 2 | `unknown function '<f>'` (the function name at dispatch) |
| `ERR_STORAGE_READ`, `ERR_STORAGE_WRITE`, `ERR_STORAGE_LOCKED`, `ERR_STORAGE_CORRUPT` | 2 | the backend's detail |
| `ERR_STORAGE_SCHEMA` | 2 | `the store is at schema <v>; this driver reads <w> and has no upgrade path: move the store aside and re-enter the record into a fresh one through the ctx verbs` (fts5) |
| `ERR_STORAGE_UNAVAILABLE` | 2 | `the storage service at <url> did not answer` (the service) |
| `ERR_AUTH` | 2 | `the storage service refused the key from <source>`, or `no service key: set storage.service.keychain or CTX_STORAGE_SERVICE_KEY` |
| `ERR_DRIVER_NOT_FOUND`, `ERR_DRIVER_PROTOCOL` | 2 | the resolver's |

The order of refusals: the argv shape first (`ERR_INVALID_ARGUMENT`), then the unit (`ERR_ENTITY_NOT_FOUND`), then a write to a `CLOSED` unit (`ERR_UNIT_CLOSED`, before any other record rule), then the function's own rules. A write refused at any point writes nothing.

#### The functions

Thirty-eight record functions, each called by the verb in the last column; the corpus methods follow unchanged below. Schemas are in the data model. No function moves a record between backends: `unit.export`, `unit.import`, and the dump format left the contract with `ctx session migrate` (below, Moving a record between backends).

| function | argv | payload | answer | called by |
|---|---|---|---|---|
| `capability` | none | none | the Descriptor | the resolver's handshake, `session diagnose` |
| `storage.health` | none | none | `{driver, health, detail, store, active_units}`; health `ok`, `degraded`, `locked`, or `error`; store `present` or `absent`; active_units the ACTIVE units | `session diagnose` |
| `session.create` | unit | objective, repos (list), attention | `{unit, state: State}`: status ACTIVE, current_anchor A1, next_action `backlog the first task`, ref_sessions null; backlog and knowledge present and empty (preamble `""`), the journal (preamble `""`) holding the anchor A1 continuing A0 with the attention; under posix a unit folder already present refuses `ERR_ENTITY_EXISTS` even without a state, so a leftover folder is never written over | `session bootstrap` |
| `session.list` | none | none | `{store, units: [UnitSummary]}` bytewise by unit; store `absent` while the store holds nothing | `session active` |
| `session.load` | unit | none | Load | `session load` |
| `session.refload` | unit... | none | `{refs: [RefLoad]}` in argv order | `session load` (the refs form) |
| `session.board` | unit | none | Board | `session board`, `session refresh` |
| `session.audit` | unit | none | Audit | `session audit`, `session refresh` |
| `session.stamp` | unit | attention | `{unit, previous_anchor, current_anchor, receipt: Anchor}` | `session stamp` |
| `session.next` | unit | pointer | `{unit, next_action}` | `session next` |
| `session.refs` | unit, ref... | none | `{unit, ref_sessions: [unit]}` (no ref: `[]`) | `session refs` |
| `session.close` | unit | none | `{unit, status: "CLOSED", open_tasks: [slug], audit: Audit}` | `session close` |
| `session.reopen` | unit | none | `{unit, status: "ACTIVE"}` | `session reopen` |
| `session.units` | repo | none | `{repo, units: [UnitSummary], known_repos: [repo]}`: the units (ACTIVE and CLOSED) whose repos hold the repo, bytewise; every repo any unit names, bytewise and unique; no unit is `units: []`, rc 0 | `session units` |
| `session.refs_to` | unit | none | `{unit, referrers: [unit]}`: the units whose ref_sessions name it, bytewise; the named unit need not be held (a reference to a unit the store lacks is still answered) | `session refs-to` |
| `task.add` | unit, slug | objective, desc, criteria, details, refs (list) | `{unit, task: Task}` | `session task add` |
| `task.update` | unit, slug | any of objective, desc, criteria, details, refs (a present key replaces the field; `refs.count=0` clears) | `{unit, task: Task}` | `session task update` |
| `task.start` | unit, slug | pointer (default `work active task: <slug>`) | `{unit, task: TaskItem, next_action}` | `session task start` |
| `task.complete` | unit, slug | evidence, date | `{unit, task: TaskItem, receipt: Entry}` | `session task complete` |
| `task.reopen` | unit, slug | none | `{unit, task: TaskItem}` | `session task reopen` |
| `task.drop` | unit, slug | reason, date | `{unit, slug, receipt: Entry}` | `session task drop` |
| `task.list` | unit, status (`TODO`, `IN_PROGRESS`, `DONE`, `all`) | none | `{unit, tasks: [TaskItem]}` in backlog order | `session task list` |
| `task.get` | unit, slug | none | `{unit, task: Task}` | `session task show`, `session resolve task#` |
| `entry.record` | unit | what, group, thread, rhythm, knowledge (`true` or `false`), refs (list), closers (list of kind, targets, verdict, reason), slug (optional), date, epoch | `{unit, entry: Entry}` | `session record` |
| `entry.get` | unit, slug | none | `{unit, entry: Entry}`, the last occurrence, with closed, closed_by, close_reason | `session entry show`, `session resolve entry#` |
| `entry.list` | unit, `--anchor=A<N>`, `--group=<token>` | none | `{unit, entries: [EntryItem]}` in journal order, every occurrence | `session entry list` |
| `entry.closure` | unit, slug | none | Closure | `session entry closure` |
| `finding.add` | unit, NAME | summary, refs (list), supersedes, supersedes_reason (default `superseded`) | `{unit, finding: Finding}` | `session finding add` |
| `finding.update` | unit, NAME | summary and or refs (a present key replaces) | `{unit, finding: Finding}` | `session finding update` |
| `finding.supersede` | unit, OLD, NEW | summary, refs (list), reason (default `superseded`) | `{unit, superseded: OLD, finding: Finding}` | `session finding supersede` |
| `finding.drop` | unit, NAME | none | `{unit, name}` | `session finding drop` |
| `finding.get` | unit, NAME | none | `{unit, finding: Finding}` | `session finding show`, `session resolve finding#` |
| `finding.list` | unit, `active` or `all` | none | `{unit, findings: [FindingItem]}` in knowledge order | `session finding list` |
| `lane.create` | unit, lane | the recipe, raw | `{unit, lane}`; the recipe stored byte for byte and an empty journal (preamble `""`) | `lane create` |
| `lane.record` | unit, lane | what, thread, refs (list), slug (optional), date, epoch | `{unit, lane, entry: LaneEntry}` | `lane record` |
| `lane.write_report` | unit, lane | the report, raw | `{unit, lane, bytes}` | `lane report` (a write) |
| `lane.get` | unit, lane, `recipe`, `journal`, or `report` | none | LaneDoc for recipe and report, LaneJournal for journal | `lane show`, `lane report` (a read), `session resolve lane#` |
| `search.query` | unit, `--limit=N`, `--entity=T`, `--mode=M` | query | Search | `session search` |

Base composes `date` (the client's local date, `YYYY-MM-DD`) and `epoch` for every function that generates a slug; the backend composes and suffixes the slug and takes the anchor from the unit's current_anchor, so a remote backend composes the same slug the caller's clock implies.

#### The record data model

Every block artifact (the journal, the backlog, the knowledge, a lane journal) is a preamble followed by items in order. The preamble is the exact bytes before the first item head; `null` means the artifact is absent, `""` present with nothing before the first item. In a journal and a lane journal only a column-0 `@entry ` or `@anchor ` line starts an item, so any other column-0 text (a comment, a continuation line, an unknown `@` word) belongs to the preceding item's span; in a backlog and a knowledge artifact every column-0 `^@[A-Za-z]` line starts an item, a head other than `@task` (in the backlog) or `@finding` (in the knowledge) making an opaque item. An item's span is its exact bytes from its head line to the next head line or the end of the artifact, trailing separator lines included.

The canonical span of an item is its canonical lines (per kind, below), each newline terminated, followed by one empty line when a next item exists and is not an anchor, and by nothing when the next item is an anchor or the item is the last. Every item carries `verbatim`: the stored span exactly when it differs from the canonical span its typed fields render, else `null`; the rule is a function of the bytes, never of the backend, so the same record returns the same data everywhere. Every item a view renders as a span carries `next`, the kind of the following item (`entry`, `anchor`, `task`, `finding`, `opaque`, or `null`), so base computes the separator without seeing the neighbor. Rendering an item is its verbatim when present, else its canonical span.

The append rule, for every write that adds an item: remove the artifact's trailing empty lines, write one empty line unless the new item is an anchor or the artifact holds nothing, then the new item's canonical lines. A backend holding a verbatim on the previous last item strips that verbatim's trailing empty lines the same way and drops the verbatim when it now equals the canonical span. So a journal never ends with an empty line, an anchor follows its predecessor directly, and an entry follows one empty line.

The edit rules keep every untouched byte of a legacy item untouched on every backend: a task status move replaces the first `  STATUS: ` line of the span (a span without one gains `  STATUS: <s>` after its head); `task.update` replaces the OBJECTIVE and REFS lines in place (inserting them after STATUS, respectively OBJECTIVE, when absent) and replaces a block scalar section in place with its body, inserting a missing one at its template position before the first later section, else after the last content line; `finding.update` replaces the SUMMARY body in place and replaces the REF lines at the position of the first one (after the body when there is none); a state edit replaces the `next_action` line and its continuation lines with one line, replaces the `ref_sessions` line (inserting it after `repos` when absent), and replaces the `current_anchor` and `status` lines; a drop removes the item's span, the previous item keeping its bytes, then the artifact's trailing empty lines go. These rules act on an item holding a verbatim; an item without one (canonical) takes the new typed fields and renders its canonical span again, so a `task.update` or `finding.update` of a canonical item stays canonical (a finding gaining its first REF lists it before SUMMARY, as the canonical lines order it, where the text rule would place it after the body). After any edit a verbatim that equals the canonical span becomes `null`.

The schemas, each field in answer order (`T|null` optional, `[T]` a list):

| schema | fields |
|---|---|
| State | unit, status (`ACTIVE`, `CLOSED`, or a legacy value as stored), current_anchor, next_action, objective, repos [string], ref_sessions [unit]\|null (null: no ref_sessions line), verbatim |
| UnitSummary | the State fields (unit through verbatim) |
| Task | slug, ordinal, status, objective, refs [string], description, criteria, details (string\|null each), next, verbatim |
| TaskItem | slug, status, objective |
| Entry | kind (`entry`), slug, occurrence, seq, anchor, what, group, rhythm, knowledge (bool), thread, legacy_status, refs [string], closers [Closer], extra_fields [{key, value}], then closed, closed_by, close_reason on `entry.get` alone, then next, verbatim |
| Closer | kind (`CLOSES` or `SUPERSEDES`), targets [string], verdict (`done`, `superseded`, `dropped`, `folded`, or null), reason, verbatim (the exact line when the canonical closer line does not reproduce it) |
| EntryItem | slug, occurrence, anchor, what, group |
| Anchor | kind (`anchor`), seq, anchor, continues, attention, next, verbatim |
| Opaque | kind (`opaque`), seq, next, verbatim (always present) |
| Finding | name, ordinal, supersedes {name, reason}\|null, refs [string], summary, superseded_by, active (bool), next, verbatim |
| FindingItem | name, summary, refs, supersedes (the NAME or null), active |
| LaneEntry | kind (`entry`), lane, then the Entry fields from slug on (without the closure fields) |
| LaneDoc | unit, lane, artifact (`recipe` or `report`), content (the bytes as stored, null when absent) |
| LaneJournal | unit, lane, artifact (`journal`), preamble, items [LaneEntry\|Anchor] |
| Board | unit, backlog_present (bool), live [Entry], open_tasks [slug], open_threads [{slug, anchor, thread}] |
| Load | unit, state: State, backlog {preamble, tasks: [Task\|Opaque]}, knowledge {preamble, findings: [Finding\|Opaque]}, board: Board\|null (null when the journal is absent), refs [RefLoad] in ref_sessions order |
| RefLoad | unit, present (bool), knowledge {preamble, findings}\|null, board: Board\|null |
| Audit | unit, clean (bool), findings [{code, severity, slug, line, detail, first_line, occurrence}], open_threads [{slug, thread, line}] |
| Closure | unit, slug, occurrence (the last), closed (bool), closers [{by, by_anchor, closer: Closer}] (by_anchor the closing entry's ANCHOR, `""` without one, as the board's open threads carry it) |
| Search | unit, query, mode, total_matches, results [{entity_type, entity_id, section, snippet, score}] |

The derived fields: `ordinal` and an opaque item's `seq` count every item of the backlog or the knowledge from 1, opaque items included; `seq` counts every journal (or lane journal) item from 1, anchors included; `occurrence` counts the occurrences of a slug up to this one from 1, so a legacy repeat reads 2 and up. Liveness is positional: an entry occurrence is closed exactly when a closer standing after it names its slug; `closed_by` is the slug of the first such closing entry and `close_reason` its parenthesis, `<verdict>: <reason>` with a verdict, the reason alone without one, null when both are absent. `superseded_by` is the NAME of a finding whose supersedes names this one, and `active` is true when there is none. The board's `live` holds every entry occurrence no later closer names, in journal order; `open_tasks` every task whose status is not DONE, in backlog order; `open_threads` every live entry whose thread is set and not `none`, its anchor the entry's ANCHOR or `""`. An Audit finding's `slug` names the entry or task it is about (for DANGLING_CLOSER the closing entry, with the absent target in `detail`; for BRACKETED_FIELD the owning entry, with the field text in `detail`); `line` and `first_line` are posix's alone (the line of the store's file, null on every other backend), and `occurrence` is set for LEGACY_DUPLICATE_SLUG on every backend.

The canonical lines, what every new write stores:

- state: `status: <s>`, `current_anchor: <a>`, `next_action: "<p>"`, `objective: "<o>"`, `repos: [<a, b>]`, then `ref_sessions: [<c, d>]` when not null.
- task: `@task <slug>`, `  STATUS: <s>`, `  OBJECTIVE: "<o>"`, `  REFS: [<a, b>]` when refs is not empty, then `  DESCRIPTION ::`, `  ACCEPTANCE CRITERIA ::`, `  IMPLEMENTATION DETAILS ::` for each non-null section, each followed by its body lines prefixed by four spaces, an empty body line written empty.
- entry: `@entry <slug>`, then, each when set, `  ANCHOR: <a>`, `  WHAT: "<w>"`, `  GROUP: <g>`, `  RHYTHM: <r>`, `  THREAD: <t>`, one `  REF: "<r>"` per ref, one closer line per closer (its verbatim when present, else `  <KIND>: <targets joined by one space>` followed by ` (<verdict>: <reason>)`, or ` (<reason>)` without a verdict, or nothing without either), and `  KNOWLEDGE: true` when set. A legacy STATUS field and extra fields have no canonical line, so an entry carrying one keeps a verbatim.
- anchor: `@anchor <A> ("continues <P>", attention: <text>)`, or `@anchor <A>` alone when continues or attention is null.
- finding: `@finding <NAME>`, `  SUPERSEDES: <old> (<reason>)` when set, one `  REF: "<r>"` per ref, `  SUMMARY ::` and its body lines as a task's.
- lane entry: `@entry <slug>`, `  WHAT: "<w>"`, `  THREAD: <t>`, one `  REF: "<r>"` per ref; a lane entry carrying an ANCHOR, GROUP, RHYTHM, closer, or KNOWLEDGE keeps a verbatim.

The parse rules, how a backend holding text (posix) reads every legacy shape the convention once accepted into these fields (a legacy unit stays readable without repair; strictness applies to new writes only):

- The content of a span is its lines after the head up to its trailing blank lines. A field line is `  <LABEL>: <value>` (label upper case with underscores); a block scalar opens with `  <LABEL> ::` and its body is the following lines indented four spaces or more, blank lines inside it kept as empty lines, four spaces removed from each. Every other line (a continuation, a comment) carries no field and lives in the verbatim.
- A line ending in a carriage return (a legacy CRLF line) parses without it, so every typed string stays LF only; the carriage return stays in the stored bytes, so the item carries a verbatim, and an edit elsewhere in the artifact keeps it.
- A quoted value that opens with `"` on a WHAT or OBJECTIVE line and does not close on it continues over the following content lines until one ends with `"`; the value is those lines joined by newlines as stored.
- Unquoting removes a leading and a trailing double quote (a value that only opens a quote loses its leading one); a REF loses a surrounding pair.
- Entries: for each one-line schema field (ANCHOR, WHAT, GROUP, RHYTHM, THREAD, KNOWLEDGE, STATUS) the last occurrence is the typed value (STATUS reads into legacy_status, KNOWLEDGE is true when its value is `true`); every earlier occurrence and every unknown label go to extra_fields in line order with their raw value; REF, CLOSES, and SUPERSEDES are lists in line order. A `WHAT ::` block is the what when no one-line WHAT exists.
- A closer's targets are its value cut at the first ` - ` or ` (`, every blank-separated date-slug token of the part before the cut. After the cut, a parenthesis whose text (up to the first `)`) reads `<verdict>: <reason>` with a known verdict gives both; other parenthesis text is the reason with a null verdict; ` - <text>` is the reason with a null verdict.
- Tasks: the first STATUS (a statusless task reads `TODO`), the first OBJECTIVE unquoted, the first REFS as a list (`[a, b]` split on commas, or blank-separated bare refs), the first of each block section.
- Findings: SUPERSEDES `<old> (<reason>)` gives the name (its first token) and the reason (the parenthesis text, `""` without one); every REF unquoted; the SUMMARY body (`""` when absent). The two block orders both read; SUPERSEDES, REF, SUMMARY is canonical.
- Anchors: `("continues <P>", attention: <text>)` after the anchor gives continues and attention, the attention losing a surrounding pair of quotes; any other spelling reads continues and attention null.
- State: each `<key>: <value>` line at column 0 (the first of each key); next_action and objective unquoted as above; repos and ref_sessions as lists, ref_sessions null without its line; continuation lines stay in the verbatim.

#### The record rules

Base checks only the input shape before any call (slug and NAME shapes, no newline in a one-line field, no carriage return anywhere, required flags, the closer grammar with its verdict completed from the WHAT, the search flags, the ref forms, unknown flags refused) and keeps its v0.54.0 messages. Every record rule belongs to the backend and is pinned by a compliance case, so the three backends answer alike:

| rule | pinned by |
|---|---|
| a unit-scoped function on a unit the store lacks refuses `ERR_ENTITY_NOT_FOUND` | TC28, TC75 |
| every write to a CLOSED unit refuses `ERR_UNIT_CLOSED` (every write but `session.reopen`) | TC52 |
| `session.close` only from ACTIVE, `session.reopen` only from CLOSED | TC04, TC66 |
| a repeated key refuses forward only: a unit, a task slug, a finding NAME, a given entry or lane entry slug, a lane; legacy repeats already stored read back | TC02, TC05, TC26, TC32, TC57, TC71 |
| generated slugs `<date>-event-<epoch>`, `<date>-<slug>-completed`, `<date>-<slug>-dropped`, each suffixed `-1` while the journal holds it; the anchor is current_anchor | TC10, TC55, TC59 |
| every closer target names an entry the journal already holds | TC21, TC58 |
| status moves: start from TODO, complete from TODO or IN_PROGRESS, reopen from IN_PROGRESS or DONE, drop from any status unless IN_PROGRESS and named by next_action | TC53, TC56 |
| `task.complete` and `task.drop` write their receipt (`backlog/<slug>: DONE (<evidence>)` or `DROPPED (<reason>)`, thread none) in the same atomic write | TC08, TC09, TC55, TC56 |
| after `session.next` or `task.start`, next_action names every IN_PROGRESS task | TC07, TC54 |
| `session.refs` names only units the store holds | TC65 |
| a supersedes predecessor exists and a successor NAME is new; `finding.list active` leaves out every superseded finding | TC15, TC33, TC72 |
| positional liveness on the board, the load, `entry.get`, `entry.closure`, and the audit | TC12, TC27, TC57, TC68 |
| the audit's record checks (DANGLING_CLOSER, UNHARVESTED_KNOWLEDGE, DONE_WITHOUT_EVENT, IN_PROGRESS_ABSENT_FROM_STATE, MISSING_THREAD for entries dated 2026-09-18 or later, LEGACY_DUPLICATE_SLUG as a warning) on every backend; the grammar checks (DATELESS_SLUG, INLINE_MARKER, BRACKETED_FIELD, SLUGLESS_CLOSER) on posix alone, whose store alone can hold broken text | TC55, TC57, TC63, TC64 |
| `session.stamp` moves A<N> to A<N+1> and appends the canonical anchor atomically; a malformed stored anchor refuses rc 2 `ERR_STORAGE_CORRUPT`, on `entry.record` and the `task.complete` and `task.drop` receipts too, so a corrupt anchor never enters a new entry | TC04, TC73 |
| lanes: `lane.record` and `lane.write_report` need the lane; `lane.create` refuses an existing lane | TC16, TC17, TC71 |
| each write lands whole or not at all; concurrent writers serialize | TC21, TC22 |
| the verbatim rule and the append rule | TC60, TC61, TC76 |
| the exact search rule and the declared modes | TC20, TC38, TC39, TC69 |
| the descriptor | TC70, TC47 to TC49 |

The audit orders its findings deterministically: first, in journal position order, LEGACY_DUPLICATE_SLUG, DATELESS_SLUG, INLINE_MARKER, BRACKETED_FIELD, SLUGLESS_CLOSER; then DANGLING_CLOSER (one per distinct target, at the first closer naming it), UNHARVESTED_KNOWLEDGE, DONE_WITHOUT_EVENT (backlog order), IN_PROGRESS_ABSENT_FROM_STATE (backlog order), MISSING_THREAD, each by position. `clean` is true when no finding has severity error; the open thread tail holds the live threaded entries, posix giving each its THREAD line.

#### Search

`search.query` answers `{unit, query, mode, total_matches, results}` with each result `{entity_type, entity_id, section, snippet, score}`. The entity types are `session`, `task`, `entry`, `finding`, `lane`, `lane_entry` (the id `<lane>/<slug>`); the sections `state`, `backlog`, `knowledge`, `journal`, `lane_recipe`, `lane_journal`, `lane_report`. `--limit` defaults to 20, `--entity` to all. The default mode is `exact` on every backend, so a caller that names no mode gets the same answer everywhere; a ranked mode is asked for by name, and a mode the backend does not declare refuses `ERR_CAPABILITY_UNSUPPORTED` naming the declared ones.

The exact rule, one text every backend implements natively: the searched text of a unit is, in order, the state text, the backlog (preamble, then every item's span), the knowledge, the journal, then every lane in bytewise order (the recipe, the lane journal, the report); an absent artifact contributes nothing. A line matches when the query is a substring of it after ASCII case folding (A to Z fold to a to z, nothing else folds); a line starting with `#` never matches. A line belongs to the session for the state and the main preambles, to its task, finding, or entry for a span, to the session for a main journal anchor, to the lane for the recipe, the report, and the lane journal preamble, to its lane entry for a lane entry span; a lane anchor and an opaque item keep the attribution of the line before them. The attribution follows the head lines as the posix `search.awk` reads them, in every searched text alike: a column-0 `@task <id>`, `@finding <id>`, or `@entry <id>` line (the id its second token, cut at a `(`) moves the attribution to that task, finding, or entry (a lane entry inside a lane's texts), even where it stands inside a recipe, a report, or another item's span, and a column-0 `@anchor` line of a main text moves it back to the session; any other column-0 `@` word leaves it unchanged. One result per (entity_type, entity_id, section), its snippet the first matching line in text order with its blanks trimmed, then a leading upper-case label and colon (`[A-Z_]+:`) with its following blanks removed, then one leading and one trailing double quote with their adjacent blanks; `total_matches` counts those pairs, results follow text order and stop at `--limit`, and every exact result scores 0. The posix driver's `search.awk` is this rule as code.

#### The descriptor and the handshake

`capability` answers `{"driver","version","contract":"2","functions":[...],"search_modes":[...],"optional":[...]}`: functions every function the driver serves (the 38 record functions, and the corpus methods of a corpus store), search_modes its modes (`exact` always), optional its optional capabilities (`corpus.store`, `corpus.changelog`). Posix declares `["exact"]` and `["corpus.store"]`; fts5 `["exact","hybrid","trigram"]` and both corpus capabilities; the service what its capability endpoint answers. No record function is optional: a backend serves all 38 or does not load.

Before a driver serves a call the resolver runs its handshake (stdin from `/dev/null`): the descriptor must read contract `"2"` and list all 38 record functions, else the call halts rc 2 `ERR_DRIVER_PROTOCOL` naming what is missing, before the function runs. The handshake runs at dispatch for every driver except the bundled posix driver, and its verdict is cached in the scratch drawer (`.contexture/tmp/driver-verdicts/`, one file per driver path) and stays valid while strictly newer than the driver executable and than the workspace configuration (`.contexture/config`, when it exists), so a driver that reads configuration, such as the service's URL and key, is verified again after a configuration change; `driver-resolver capability` and `check` (and `ctx session diagnose`) run it afresh. A caller that needs an optional capability or a search mode asks first: `driver-resolver require <capability>...` exits 0 when the driver declares every one and 2 `ERR_CAPABILITY_UNSUPPORTED` naming the missing ones, `driver-resolver has <capability>` exits 0 or 1 and prints nothing; a search mode reads as `search.mode.<m>`. A passing `require` verdict is cached per driver path and capability set (sorted), apart from the dispatch verdict, which it never answers or overwrites; `has` reads such a verdict and writes none, so the cache names exactly the sets callers required.

#### The compliance suite

`tests/storage-compliance.sh [--driver-exec=<path>]` holds every backend to this section: 72 cases in 19 suites on posix, 66 on every other backend (a driver without `corpus.store` runs 8 corpus cases fewer), every one asserting the data returned (a key and its JSON value, a whole answer, the fixed stderr line of a refusal, the bytes of a document), never an exit code alone; `--census` lists any case that would check only an exit code, and answers none. It reaches a backend only through the driver executable, and a fixture a backend can hold is built through the functions themselves: the same call sequence on every backend, held to the same read answers (the exact search fixture of TC39 with its answers, the append rule of TC61, the audit fixtures of TC63, the three units of TC67, and TC76's unit carrying every canonical item kind with its 23 golden answers under `tests/fixtures/compliance/golden/verb-u/`, written from posix and equal on fts5 without regeneration). Legacy text, which only a hand-written file holds, is planted as posix files from `tests/fixtures/compliance/units/` and runs on posix alone: TC57 (the repeated slug), TC60 (every legacy shape, `tests/fixtures/compliance/legacy.notes`, with its 23 goldens), TC64 (the grammar faults), TC69 (the exact rule over legacy text), TC77 (the audit records only legacy text carries), TC78 (a malformed stored anchor); those cases and the posix journal bytes of TC61 are the only places the suite touches a store directly. The corpus cases keep the v0.54.0 corpus contract below; the resolver cases stage the shipped resolver and wrap the driver under test in planted contract 2 descriptors. Retired with contract 1: TC18 (`lane.close`), TC19 and TC36 (`resolve.ref`; resolving a reference is base's, proven by the session suite), TC29 and TC30 (the artifact methods); retired with the dump: TC62 (the export and import round trip).

#### The corpus store

The configured driver holds the agent-facing doc corpus beside the record: one setting (`storage.driver`) serves both. A doc is keyed by `(repo, slug)`, each a key of letters, digits, dot, underscore, and dash that starts with a letter or digit; its canonical address is `docs/<repo>/<slug>.md` under every driver, the name the docs verbs print and the check keys freshness on, never a storage location. A driver stores and hands back a doc's text verbatim and never parses it: the doc grammar stays in the docs verbs, as the record grammar stays in the session verbs. The canonical address is the posix layout: under the posix driver the corpus is the files at `<root>/docs/<repo>/<slug>.md`, exactly where the docs verbs read them. The corpus methods keep this v0.54.0 contract, their answers plain text rather than contract 2 JSON, until the docs corpus moves to doc-level functions.

| method | argv | stdin | answer |
|---|---|---|---|
| `corpus.list` | `[<repo>]` | none | one `<repo>/<slug>` line per doc, in the bytewise order of the docs' addresses (`docs/<repo>/<slug>.md`, the order a C-locale glob of the files gives, so `one-two` lists before `one`); an empty corpus lists nothing, rc 0; a named repo the corpus lacks refuses rc 1 `ERR_ENTITY_NOT_FOUND`, a malformed key rc 1 `ERR_INVALID_ARGUMENT` |
| `corpus.read` | `<repo> <slug>` | none | the doc byte for byte; rc 1 `ERR_ENTITY_NOT_FOUND` when absent (a case twin of a stored key is absent) |
| `corpus.write` | `<repo> <slug> [--create] [--op=<op>] [--head=<sha>\|none]` | the whole doc, raw | an atomic replace (a new doc when absent, its repo made on demand), printing `{"status":"ok","repo","slug","op"}`; `--create` refuses an existing doc rc 1 `ERR_ENTITY_EXISTS`; a key that folds onto another doc's key under ASCII case (a slug of the same repo, or the repo itself, such as `r/One` beside `r/one` or `R/x` beside `r/y`) refuses rc 1 `ERR_ENTITY_EXISTS` naming it, nothing written, since keys differing only by case never coexist (a case-insensitive filesystem holds them in one file, and a store's mount would fold them into one); an unknown flag, a malformed key, or an op outside `new`, `write`, `header`, `rule`, `pitfall`, `entry`, `section`, `replace`, `remove`, `ids` refuses rc 1 with nothing written; a write the backend refuses exits 2 `ERR_STORAGE_WRITE`, the old doc whole |
| `corpus.remove` | `<repo> <slug> [--op=<op>] [--head=<sha>\|none]` | none | removes the doc (a repo whose last doc goes leaves the corpus), printing the same success line with op `remove` by default; rc 1 `ERR_ENTITY_NOT_FOUND` when absent (a case twin of a stored key is absent, the stored doc untouched) |
| `corpus.mount` | `<dest> [<repo>]` | none | one line: the root under which every doc (or the named repo's) reads at `docs/<repo>/<slug>.md`, byte for byte; `<dest>` is an existing empty folder the caller made and removes after; the posix driver prints the workspace root and writes nothing, a store driver fills `<dest>` and prints it; a missing or non-empty `<dest>` and an absent repo refuse rc 1 |
| `corpus.changes` | none | `head=<sha>` lines | the change-log rows whose head is in the set, oldest first: `<seq> TAB <time> TAB <op> TAB <repo>/<slug> TAB <head> TAB <prior>`, `prior` the doc's state before that change (`absent` or `present`); a malformed payload line or head refuses rc 1; a driver without `corpus.changelog` refuses rc 1 `ERR_CAPABILITY_UNSUPPORTED` |

Every corpus method acts on the exact key alone. A key that differs from a stored doc's key only by ASCII case (`r/ONE` or `R/one` beside `r/one`) names no doc: `corpus.read` and `corpus.remove` refuse it rc 1 `ERR_ENTITY_NOT_FOUND` with the stored doc untouched, `corpus.list` and `corpus.mount` refuse such a repo rc 1 as an absent repo, and `corpus.write` refuses it by the case rule above, `--create` included. A store's lookup is exact by construction; the posix driver matches the key against the folder entries as stored before it touches a file, since a case-insensitive filesystem (the macOS default) would otherwise open, and remove, the stored doc for its twin.

A store driver records one change-log row per `corpus.write` and `corpus.remove` from `--op` (the verb that wrote) and `--head` (the workspace git HEAD the verb computed, or `none`), with the doc's prior state, in the same transaction as the doc itself, so a window of rows yields each doc's net status (added, modified, deleted, or gone again) the way git would report it; the posix driver checks both tokens and ignores them, since its corpus delta is git, and declares `corpus.store` alone. The corpus resolves against the workspace root whatever the caller's folder: a call from a subfolder lists and reads the workspace's docs.

#### Driver discovery hierarchy

The driver resolver discovers storage drivers through a strict 3-tier hierarchy:
1. Workspace custom drivers: `.contexture/drivers/<name>/driver`
2. Module-owned drivers: `.contexture/modules/<module>/drivers/<driver-name>/driver` or `.contexture/modules/session/drivers/<driver-name>/driver`
3. PATH executables: system binaries named `ctx-storage-<name>`

The resolver passes stdin through to the driver untouched.

#### Configuration precedence

Driver selection follows deterministic precedence:
1. `CTX_STORAGE_DRIVER` environment variable
2. Workspace configuration file (`.contexture/config` or `.contexture/storage.conf`, key `session.storage.driver` or `storage.driver`)
3. Default baseline: `posix`

#### Exit tiers, atomicity, and interruption

Every function answers in three tiers: `0` success; `1` a semantic refusal (the input or a record rule); `2` a storage or driver failure (driver not found, a failed handshake, an IO error, lock contention, a write the backend refused). A backend never prints a success answer for a write that did not land: a replace the store refuses removes its temp and exits 2 `ERR_STORAGE_WRITE`. Each write function lands whole or not at all (posix: a temp file and a rename per file, the unit lock for a write touching several files, and an undo log: every file a step replaces or removes is first hard-linked into the stage, so a failed rename or removal rolls every earlier step of the write back before the call exits 2 `ERR_STORAGE_WRITE`; fts5: one transaction; the service: one transaction per request), and concurrent writers of one unit serialize. An interrupted posix call (HUP, INT, TERM) exits through its cleanup on every sh, dash included: a write interrupted among its renames is rolled back the same way, its scratch is removed, and a held unit lock is released; a SIGKILL cannot be trapped, so a writer killed among its renames can leave part of its write, and a lock left by a killed writer stays until it is removed, and later writers of that unit time out on it (`ERR_STORAGE_LOCKED`).

#### Split-brain prevention

If a non-posix driver is configured (such as `fts5` or the service) and its executable cannot be resolved or fails its handshake, the engine halts immediately with exit code 2 (`ERR_DRIVER_NOT_FOUND`, or `ERR_DRIVER_PROTOCOL` when the capability call fails or the descriptor is not a complete contract 2; a driver whose capability call refuses with its own line, such as the service's `ERR_AUTH` for a wrong key or `ERR_STORAGE_UNAVAILABLE` for a stopped service, has that line passed through the handshake's one line, its code ending it). The engine never falls back silently to `posix` when another driver was configured, and no verb opens an artifact outside the driver, so records never diverge between storage engines. The ship gate runs the whole session suite once per driver, and a verb re-pointed at the files turns the fts5 run red.

#### Available drivers

- Baseline POSIX driver (`posix`): zero-dependency POSIX sh and awk driver keeping each artifact as a markdown file under `.contexture/sessions/<unit>/` and each corpus doc as the file `docs/<repo>/<slug>.md` under the workspace root (`corpus.store`; no change log, the posix corpus delta is git). It runs on the system awk: BWK awk, mawk, gawk, and busybox awk each carry the full session suite green on both drivers, and every payload and JSON encoder doubles a backslash by concatenation, since a `gsub` replacement of four backslashes yields one backslash under busybox awk and `gawk --posix` (the authoring rule in `docs/modules.md`).
- SQLite FTS5 driver (`storage-fts5` plugin): one SQLite database with dual FTS5 virtual tables (Porter English stemming plus Trigram tokenization), unicode61 with `remove_diacritics 0` for Turkish and diacritics, and pure SQL Reciprocal Rank Fusion (RRF) search ranking behind the `hybrid` and `trigram` modes beside `exact`; it holds the corpus natively (`corpus.store` and `corpus.changelog`): each doc verbatim, a change-log row per write in the doc's own transaction, a mount that fills the folder it is handed. Its store is at schema version 4: the typed tables of the record data model (units, preambles, tasks, findings, journal items, lanes, lane items, closers with their targets, item and finding refs, extra fields), each item with its verbatim, beside two tables derived in the transaction of every write (the lines of the exact rule with their attribution, and the documents the ranked modes index), and the corpus tables. A new or empty database file gets the whole schema on its first write; a store at any other schema version refuses every function rc 2 `ERR_STORAGE_SCHEMA` naming its version and the way forward, and is never written: the plugin carries no upgrade path and no backup, so an older store is moved aside and its record re-entered into a fresh one through the ctx verbs (`storage.health` reports such a store as an error). Every one of the 38 record functions answers natively in SQL: one sh entry point checks the argv shape and stages the payload lines in a per-call scratch folder, and one sqlite3 run reads the function's own script (`sql/fn/<function>.sql`) over the shared pieces (`sql/lib/`: the payload decoded in SQL, the refusal checks in the posix refusal order, the derived fields and every answer built with `json_object` in the contract key order); every write is one transaction under the unit write lock, applies the append and edit rules to the stored verbatims, keeps a verbatim exactly when the stored text differs from the canonical span, and rebuilds the unit's derived search rows before it commits; `exact` reads the lines table. No function reads markdown or calls another driver, so the store holds only what the functions write. The driver needs sqlite3 3.44 or later (below it every function refuses rc 2 `ERR_DRIVER_NOT_FOUND`). The plugin carries no verb of its own (the v0.54.0 `ctx storage-fts5 migrate` retired); a record reaches it through the ordinary verbs (below, Moving a record between backends) and its corpus through the `ctx docs` write verbs; see the plugin README.

### Semantic CLI verbs

Every session and lane verb is a thin sh script over the shared verb library (`.contexture/modules/session/lib/verb.sh`): it checks the input shape, makes one storage call, and renders the answer through the one flattener (`lib/json.awk`) and the one renderer (`lib/render.awk`), so every backend prints the same text for the same record; `--json` prints the function's answer unchanged (compact, in the contract key order). The typed flags are the only write inputs: no verb reads a markdown block from stdin, so no markdown crosses the command interface (a document, a lane recipe or report, travels whole). Every verb refuses an unknown flag or an extra positional argument rc 1 (`<verb>: error: unknown option '<flag>'` or `unexpected argument '<arg>'`, `ERR_INVALID_ARGUMENT`), and every one-line value refuses an embedded newline or carriage return before any write. The record rules (a `CLOSED` unit, the status moves, the pointer rule, repeated keys, closer targets) are the backend's: such a refusal prints the function's one fixed line, `<function>: error: <message> (<CODE>)`, with the texts of the contract above.

#### Task operations: ctx session task
- `ctx session task add <unit> <slug> --objective="..." [--desc="..."] [--criteria="..."] [--details="..."] [--refs="..."]`: creates a `TODO` task; `--refs` takes the references blank or comma separated, brackets optional.
- `ctx session task update <unit> <slug> [--objective="..."] [--desc="..."] [--criteria="..."] [--details="..."] [--refs="..."]`: replaces the given fields (an empty value leaves its field as it is); `--refs` replaces the list and `--refs=""` clears it. The flags are its only input (stdin is not read): an update carrying no field refuses rc 1 `ERR_INVALID_ARGUMENT` before any driver call. A task in the canonical shape renders canonically again; a task stored in a legacy shape keeps every byte the update does not touch, and a section it lacks lands at its template position.
- `ctx session task start <unit> <slug> [--pointer="..."]`: moves a `TODO` task to `IN_PROGRESS` and writes `next_action` (default `work active task: <slug>`) in one write; the pointer must name every `IN_PROGRESS` task, the started one included, else `ERR_POINTER_INCOMPLETE` and nothing is written.
- `ctx session task complete <unit> <slug> --evidence="..."`: moves a `TODO` or `IN_PROGRESS` task to `DONE` and appends its receipt entry in the same write: slug `<date>-<slug>-completed` (a same-day repeat takes `-1`), `WHAT: "backlog/<slug>: DONE (<evidence>)"`, `THREAD: none`, the current anchor.
- `ctx session task reopen <unit> <slug>`: moves an `IN_PROGRESS` or `DONE` task back to `TODO`.
- `ctx session task drop <unit> <slug> [--reason="..."]`: removes the task and appends its receipt (`<date>-<slug>-dropped`, `WHAT: "backlog/<slug>: DROPPED (<reason>)"`, the reason defaulting to `task dropped`) in one write; an `IN_PROGRESS` task that `next_action` names refuses; the slug can be added again afterwards.
- `ctx session task list <unit> [--status=todo|progress|done|all]`: one `  [<status>] <slug>: <objective>` line per task in backlog order; the verb maps the words to `TODO`, `IN_PROGRESS`, `DONE`, and every status and refuses another word rc 1.
- `ctx session task show <unit> <slug> [--json]`: prints the task's stored block (its `REFS` included; a legacy task exactly as stored); `--json` prints `task.get`'s answer.

Every other move refuses `ERR_INVALID_TRANSITION` with the task unchanged. `add`, `start`, `complete`, `reopen`, and `drop` fire the task-landing hooks (`CTX_ACT` naming the act, [Modules](modules.md)); `update` fires none. A malformed slug (letters, digits, underscore, dash; starts alphanumeric) refuses rc 1 before any driver call.

#### Journal event recording: ctx session record
- `ctx session record <unit> --what="..." [--group=...] [--thread=...] [--rhythm="<name> <N> <GATE>"] [--ref=...]... [--closes=...]... [--supersedes=...]... [--knowledge] [--slug=...]`: appends an immutable event. The storage driver takes the unit's current anchor, composes the slug `<date>-event-<epoch>` from the date and time the verb sends (a slug the journal holds takes `-1`), and writes the canonical field order (`ANCHOR`, `WHAT`, `GROUP`, `RHYTHM`, `THREAD`, `REF`, `CLOSES`, `SUPERSEDES`, `KNOWLEDGE`). `--thread` defaults to `none`; `--rhythm` must name a step and gate of `.contexture/rhythms/<name>.md`; `--ref`, `--closes`, and `--supersedes` repeat, one line each. A closer names one or more date-slug targets, optionally with its own `(<verdict>: <reason>)`; a bare `--closes` target completes as `(done: <WHAT>)` and a bare `--supersedes` as `(superseded: <WHAT>)`, every parenthesis of the WHAT written as a square bracket since a closer reason holds none. Every closer target must name an entry the journal already holds, else rc 1 and nothing is written. `--slug` takes today's date as a prefix when it carries none and refuses a slug the journal holds.

#### Journal entry inspection: ctx session entry
- `ctx session entry show <unit> <slug> [--json]`: prints the entry's stored block (`REF`, `CLOSES`, `SUPERSEDES`, `RHYTHM`, and `KNOWLEDGE` included; the last occurrence of a repeated legacy slug); `--json` prints `entry.get`'s answer, the closure (`closed`, `closed_by`, `close_reason`) derived by position: the first later closer naming the occurrence.
- `ctx session entry list <unit> [--anchor=A<N>] [--group=<token>] [--json]`: one `  [<anchor>] <slug>: <what>` line per entry occurrence in journal order, open or closed; `--group` is the topic thread across anchors, `--anchor` one period; the driver filters by the exact values, so the text and the JSON agree.
- `ctx session entry closure <unit> <slug> [--json]`: `closure <unit> <slug>: open`, or `closed (<verdict>)` with the first closer's verdict, then per closer an empty line, `closer <slug> (<anchor>)`, and the closer's line; positional, so only a closer standing after the entry counts; an absent slug refuses rc 1.

#### Finding lifecycle CRUD: ctx session finding
- `ctx session finding add <unit> <NAME> --summary="..." [--ref=...]... [--supersedes=...]`: adds a finding; a new NAME is upper case letters, digits, and underscores, a NAME the knowledge carries refuses rc 1 (`ERR_ENTITY_EXISTS`), and a `--supersedes` predecessor must exist.
- `ctx session finding show <unit> <NAME> [--json]`: prints the finding's stored block, with `SUPERSEDED_BY: <successor>` after its head line when a later finding supersedes it.
- `ctx session finding update <unit> <NAME> [--summary="..."] [--ref=...]...`: replaces the summary, the references, or both (either flag alone works); `--ref` replaces the whole list; stdin is not read, and an update carrying no field (an empty `--summary` alone included) refuses rc 1 `ERR_INVALID_ARGUMENT`. A canonical finding renders canonically again (`SUPERSEDES`, `REF`, `SUMMARY`); a finding stored in a legacy shape keeps its untouched bytes, a first `REF` landing after its summary body.
- `ctx session finding supersede <unit> <old-name> <new-name> --summary="..." [--ref=...]...`: records forward-only supersession; a missing predecessor or a held successor NAME refuses rc 1.
- `ctx session finding drop <unit> <NAME>`: removes an invalidated finding.
- `ctx session finding list <unit> [--active-only] [--json]`: one `  <NAME>: <summary>` line per finding, `--active-only` leaving out every finding a `SUPERSEDES` names.

Every finding write refuses a `CLOSED` unit.

#### Universal search: ctx session search
- `ctx session search <unit> "<query>" [--limit=N] [--entity=TYPE] [--mode=MODE] [--json]`: searches across all entity domains. Every driver returns one shape: `{"unit","query","mode","total_matches","results":[...]}`, each result carrying `entity_type` (session, task, entry, finding, lane, lane_entry), `entity_id`, `section` (the artifact the hit came from: state, backlog, knowledge, journal, lane_recipe, lane_journal, lane_report), `snippet`, and `score` (0 for every exact result; a ranked mode's own number, higher is better). `total_matches` counts every result before the cap, `--limit` caps the results (default 20), `--entity` keeps one entity type (`all` for every one). `exact` is the default mode on every driver and means one thing on every driver: a line of the record text matches when it carries the query as a substring, ASCII letters compared without case (every other byte matches exactly) and a column-0 comment never matching; the result is one row per matching entity and section (a task matching on three lines is one row), in record order (state, backlog, knowledge, journal, then each lane's recipe, journal, report), its snippet the first matching line with its field label and quotes trimmed, and `total_matches` counts those rows. A ranked mode is asked for by name (`hybrid`, the fts5 RRF fusion, and `trigram`, its trigram table, where the driver declares them); a mode the driver does not declare refuses rc 1 `ERR_CAPABILITY_UNSUPPORTED` naming its declared modes (posix declares `exact` alone). An empty query refuses rc 1 `ERR_INVALID_ARGUMENT`. The text view prints a count line and one line per result; `--json` prints the answer.

#### Reference resolution: ctx session resolve
- `ctx session resolve <unit> <ref> [--json]`: resolves abstract domain references (`task#slug`, `entry#slug`, `finding#NAME`, `lane#slug/report#claim`) and the legacy file forms (`backlog.md#slug`, `journal.md#slug`, `knowledge.md#NAME`, `lanes/<lane>/report.md#claim`) on every driver. Base parses the reference and makes exactly one call (`task.get`, `entry.get`, `finding.get`, or `lane.get`); the text view prints the item's span verbatim (its trailing separator included), a report claim cut from its `@<claim>` line to the next column-0 `@` line; `--json` prints the function's answer. A miss refuses rc 1 (`resolve: error: reference '<ref>' not found in unit '<unit>' (ERR_ENTITY_NOT_FOUND)`), an unsupported form rc 1 `ERR_INVALID_ARGUMENT`.

#### The named looks: ctx session units and refs-to
- `ctx session units <repo> [--json]`: `units <repo>: <n> units`, then per unit `<unit> [ACTIVE]` or `[CLOSED]` with its `current_anchor` and `next_action` lines; no unit touching the repo refuses rc 1 naming the repos the units know.
- `ctx session refs-to <unit> [--json]`: `refs-to <unit>: <n> units`, then one `  <unit>` line per unit whose `ref_sessions` name it; none refuses rc 1.

Together with `entry show`, `entry list`, `entry closure`, `finding show`, and `resolve`, these answer the foreseeable questions over the record in bounded form, so no one improvises a grep that over-reads: every miss is loud, rc 1 with a named error, never a plausible empty.

### Subagent lane management: ctx lane

Subagent operations are governed through the dedicated top-level `ctx lane` module:

```bash
.contexture/ctx lane create <unit> <lane-slug>   # stdin: the recipe
.contexture/ctx lane show <unit> <lane-slug> [recipe|journal|report] [--json]
.contexture/ctx lane record <unit> <lane-slug> --what="..." [--slug=...] [--thread=...] [--ref=...]...
.contexture/ctx lane report <unit> <lane-slug> [--body="..." | stdin] [--json]
```

- `create`: the dispatcher's act: the lane with its recipe stored byte for byte (normalized to end with one newline) and an empty lane journal; the recipe is required on stdin; an existing lane refuses rc 1 (`ERR_ENTITY_EXISTS`) with its recipe unchanged. The recipe lands through this command, never as a file the dispatcher writes.
- `show`: prints the recipe, the journal, or the report (the report by default) as stored, its trailing newlines collapsed to one; an absent document prints one empty line rc 0.
- `record`: logs action traces into the subagent's lane journal; the driver composes the slug from the date and time the verb sends, a second event in the same second taking `-1`; a given slug the lane journal carries refuses rc 1; `--ref` repeats; an absent lane refuses rc 1.
- `report`: writes the lane report from `--body` or stdin, printing one line with the stored size (`lane report written: <lane> in <unit> (<bytes> bytes)`), or reads it back when neither is given; the body reaches the driver raw on stdin, so a report of any size lands (a 2 MB report is a gate case). With no `--body`, it reads stdin whenever stdin is not a terminal, and no POSIX sh tells an idle open pipe from a slow writer, so under an open pipe it waits until the writer closes. The scripted read path is `ctx lane show <unit> <lane-slug> report`, which never reads stdin; `report`'s read mode is for a terminal (or a call fed `</dev/null`).

Every lane write refuses a `CLOSED` unit with rc 1. `--json` prints `lane.get`'s answer for a read (`content` holds the document) and `lane.write_report`'s for a write.

Isolating lane operations into `ctx lane` prevents accidental pollution of parent session journals upon argument omission.

### ctx session load: the load and the refs form

Returns the map plus one page of the load: state, backlog, knowledge, the live journal, and any declared `ref_sessions` under read-only banners. The storage driver answers the unit whole (`session.load`, or `session.refload` for the refs form) and base renders and pages it. The map names each section with its line count and pages, then the write-scope trailer, which names the unit (`WRITE SCOPE: unit <unit> + repos: [...]`), never a storage location; pages cut at block boundaries, never mid-body: a page ends before the block that would pass about 500 lines or about 40KB, whichever binds first, and a single block larger than the budget renders whole on its own page. The backlog section renders its DONE task blocks compactly, keeping only the task line, `STATUS`, `OBJECTIVE`, and `DESCRIPTION`; open and statusless blocks render whole, and the record itself is never edited, so the full body stays one `resolve` away. An incomplete call opens with `LOAD INCOMPLETE` and instructs the next call in its last line; the final page opens with `LOAD COMPLETE` and hands off to the receipt stamp.

```bash
.contexture/ctx session load <unit>
.contexture/ctx session load refs <ref_1> ... <ref_N> [<page>]
```

Read every page the map reports. A missing state is fatal (`ERROR: missing state: unit <unit>`); a missing backlog, knowledge, or journal is loud and nonfatal, with a placeholder standing in its section; the warning names the artifact and its unit (`WARNING: missing knowledge: unit <unit>`), never a storage location, so a ref session the configured store does not hold reads the same under every driver. Every verb message follows that form: an error or warning names the artifact and its unit (`<artifact>: unit <unit>`, a lane artifact as `lane <lane> <artifact>: unit <unit>`), never a sessions path, whatever the driver. The journal section renders the board from the same answer, so the extraction has one home; the board's open threads and open tasks ride that section unchanged.

The cut is budgeted twice, about 500 lines or about 40KB, whichever binds first, so a page stays under the harness's output cap in practice; the one residual is a single block that exceeds the budget alone, and it renders whole on its own page. If a harness still truncates such a page, it prints a notice naming its saved copy of the command's output: that copy is the command's own output, and reading it is sanctioned by `@laws#workspace-confinement`, read-only, that named file alone. Routing the same content through temp files stays unsanctioned. The in-workspace fallbacks need nothing outside: `ctx session board`, `ctx session task show`, and `ctx session resolve` recover the same content through the verbs.

The refs form is the on-demand consult: it streams the named sessions alone, each composed exactly as the unit load composes a reference, and pages them locally with its own map, banner, and tail, so a large reference never truncates. A missing ref is fatal; zero refs, or a numeric token in a ref position, prints the usage at rc 1; a session named `refs` stays reachable through the escape hatch `ctx session load refs refs`.

### ctx session stamp: the receipt

The storage driver moves `current_anchor` from `A<N>` to `A<N+1>` and appends the anchor line with the attention verbatim in one atomic write (`session.stamp`); the verb prints the transition after the stamp hooks. An empty, whitespace-only, or newline-carrying attention refuses rc 1 before any write, a `CLOSED` unit rc 1, and a malformed stored anchor rc 2 (`ERR_STORAGE_CORRUPT`), with no partial write.

```bash
.contexture/ctx session stamp <unit> "<attention>"
```

`.contexture/ctx session entry list <unit> --anchor=A<N>` lists the entries written in one period; `entry list` without a filter prints every entry with its anchor, the map of periods.

### ctx session board: the board

Returns the live board: every unclosed entry with its body whole, then the open task slugs and the open threads with their targets, each list under its nudge line; an empty list prints nothing. Live means unclosed: the set is the journal entries that no later closure names. Takes one form, a session slug:

```bash
.contexture/ctx session board <unit>
```

The storage driver answers the board (`session.board`): the live entry occurrences in journal order with their spans, the backlog slugs whose status is not DONE, and the live threaded entries; base renders them under the opener that names the counts, and a missing backlog is loud on stderr with no tail. Liveness is positional: a closer closes the occurrences of each target slug that stand before it, and the closure parse reads the target field only, so a slug mentioned in a closure's reason prose can never close anything. The output is the set, whole, with no hand-picking and no per-entry reads. Any other invocation of `ctx session board` fails loudly: a path, an extra argument, or a flag.

`ctx session load` renders this board for the load's journal section; run directly, `ctx session board` is the updated board: the open entries, the open threads, and the open tasks in one stream. The refs form renders the board per reference session, so a consulted session streams its live entries too.

### The state acts: next, refs, close, reopen

```bash
.contexture/ctx session next <unit> "<pointer>"
.contexture/ctx session refs <unit> [<session> ...]
.contexture/ctx session close <unit>
.contexture/ctx session reopen <unit>
```

`next` overwrites the pointer (`session.next`); the pointer must name every `IN_PROGRESS` task, else rc 1 `ERR_POINTER_INCOMPLETE` and nothing is written; then the task-landing hooks fire with `CTX_ACT` `next`. `refs` sets the read-only mounts; every named session must exist and differ from the unit, no name twice; zero sessions clears them. `close` marks the unit `CLOSED`: the driver answers the unit's audit and its open tasks with the move, base prints them as warnings on stderr (it never refuses for them), then the close hooks fire. `reopen` marks a `CLOSED` unit `ACTIVE` again so its work can resume; each refuses a unit already in the target status (`ERR_INVALID_TRANSITION`). Every form validates its inputs before any write: a refusal is loud, rc 1 with zero partial writes, and a landing prints what it wrote.

### Retired in v0.55.0

`append`, `amend`, `query`, `flip`, and `drop` left `ctx session` with contract 2, since no markdown crosses the interface and every act has its typed verb. The names stay reserved (no module may claim them), and each call, or `ctx session help <name>`, prints its replacement with rc 1:

| retired | its replacement |
|---|---|
| `append` | `record`, `task add`, `finding add` |
| `amend` | `task update` |
| `query` | `entry show`, `entry list` (`--group`, `--anchor`), `entry closure`, `finding show`, `resolve`, `search`, `units`, `refs-to`, `lane show` |
| `flip` | `task start`, `complete`, `reopen` |
| `drop` | `task drop` |

The raw block stdin inputs of `record`, `task add` and `update`, `finding add` and `update`, and `ctx lane record` retired with them.

### Moving a record between backends

No command moves a record between storage backends, since a move can need judgment a verb would hide (legacy shapes only a posix file holds, files outside the record, a write one backend refuses and another accepts). A record reaches another backend through the agent re-entering it with the ordinary verbs under that backend (`bootstrap`, `task add` and its moves, `finding add` and `supersede`, `record`, `stamp`, `lane create`, `lane record`, `lane report`), and a docs corpus through the `ctx docs` write verbs; switching `storage.driver` stays the human's act. So an fts5 or service store holds only what the verbs write, and legacy record shapes live in posix files alone. `ctx session migrate`, `unit.export`, `unit.import`, and the dump format, added while v0.55.0 was built and never released, left the contract before it shipped; the name `migrate` answers as any unknown verb.

### ctx session diagnose: the storage view

`ctx session diagnose [--json]` prints the workspace root, the configuration, the resolved storage driver with its source and status, then the driver's descriptor as lines (`contract`, the number of functions declared, the search modes with the default, the optional capabilities), the storage health (`storage.health`), and the ACTIVE unit count. `--json` prints one compact object `{workspace_root, config {status, driver}, driver {name, source, status, descriptor}, storage {health, detail, store, active_units}}`, the descriptor being the capability answer. The descriptor is read through the resolver's handshake, afresh on every call.

### ctx session audit: the repair instrument

Returns the record's defects, each flagged with a line or a slug, and exits nonzero when any fires. Takes one form, a session slug:

```bash
.contexture/ctx session audit <unit>
```

The storage driver checks the record (`session.audit`) and answers its findings as data; base prints them in a fixed order (the line-ordered grammar group first, then each record check ordered by position), so the output never depends on an awk's hash order. Every backend implements the record checks (dangling closer, unharvested knowledge, done without event, in-progress absent from state, missing thread, the legacy duplicate warning); the grammar checks (dateless slug, inline marker, bracketed field, slugless closer) are the posix driver's alone, since only a text store can hold broken text, and only posix answers line numbers, so under another driver a finding prints without its ` at line <n>`. When the run is clean the verb also prints the open-thread tail: the entries whose `THREAD` names an act outside the unit and that no later closure names, each with its target. The tail is a display, never an enforcement: a thread that pauses stays open, and its line in the tail is the reminder it exists. The presence check runs from the enforcement era: an entry dated at or after `2026-09-18` that carries no `THREAD` line flags `MISSING THREAD` (the constant lives in the driver's audit), so pre-era records stay quiet.

The classes, and what each one asks for:

| flag | the defect | the repair |
|---|---|---|
| dangling closer | a `CLOSES:` or `SUPERSEDES:` names a slug no entry carries | fix the slug or the closer |
| slugless closer | a closer carries no valid date-slug target | point it at real entries |
| dateless entry slug | an entry name does not match the date-slug grammar | fix the entry's slug to the date-slug grammar |
| inline marker | `THREAD:` or `KNOWLEDGE:` sits on the `@entry` line | move it to its own field line |
| bracketed field | a field line wrapped in brackets, as a template's optional marker copied verbatim | write the field bare, or omit it |
| missing thread | a post-era `@entry` with no `THREAD` line | declare the `THREAD` line: what it awaits, or `none` |
| unharvested knowledge | a `KNOWLEDGE: true` entry that no closer names | harvest it at the next refresh; the entry then closes by reference |
| done without event | a `STATUS: DONE` task with no `backlog/<slug>: DONE` line in the journal | record the completion event |
| in-progress absent from state | a `STATUS: IN_PROGRESS` task the state pointer does not name | refresh `next_action` (`ctx session next`) |
| legacy duplicate slug (warning) | an older journal repeating an entry slug | nothing: it reads by position and leaves rc unchanged; a new repeat is refused at the write |

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
  modules/           session (the record engine), lane (subagent lanes), run (stream filters), and workspace additions
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
