# storage-fts5: the SQLite FTS5 storage driver plugin

The storage-fts5 plugin packages an SQLite storage driver and full-text search engine for Contexture: the store-only driver card of contract 3 (schema version 5), the generic module store with its derived store documents and dual SQLite FTS5 virtual tables, and pure SQL Reciprocal Rank Fusion (RRF) search. The plugin operates directly on the system `sqlite3` CLI (3.44 or later) with zero runtime dependencies. The record's 35 operations live in the unit module's data script over this store; the driver answers `capability`, `storage.health`, the seven store functions, and the store search. It carries no verb of its own, and no command moves a record between it and another driver: the store holds only what the ordinary verbs write, and a store of any other schema version is refused, never upgraded.

## Adoption

Assess the repository, propose the installation to the maintainer, and execute the copy.
The plugin is adoption-gated: nothing is copied before the maintainer's verdict.

## What it is

The storage-fts5 plugin serves as an indexed storage backend: the single store of the record and the module data when it is the configured driver.

1. The schema (version 5, `schema.sql`) is store-only: the generic `store` table keyed by (namespace, key) with opaque bytes, the optional `store_changes` log, and the derived `store_docs` the two FTS5 tables index. The record's typed tables, views, and search deriver left with contract 3; the unit module keeps the record as one value per artifact, and its data script parses and renders the canonical record text.
2. The derived store documents: every put, delete, and batch action re-derives the documents of the key it touches from the module's data-file search schema (flat: one document per key in section `body`; documents: one per declared entity; no schema: the generic raw value), inside the same transaction.
3. Dual FTS5 indexing: natural language prose is indexed with `porter unicode61 remove_diacritics 0` to preserve Turkish characters and diacritics, while exact code identifiers and symbols are indexed with `trigram` tokenization; triggers keep `store_docs` and both tables in step.
4. Search: `store.search` answers the one result shape `{namespace, query, mode, total_matches, results: [{key, entity_type, entity_id, section, snippet, score}]}`. `exact` is the storage core's shared rule over the raw stored values (the record's exact search runs in the unit module over its canonical render); `hybrid` (RRF over both FTS5 tables) and `trigram` (the trigram table alone) read `store_docs`; a namespace whose stored schema signature differs is re-derived whole before a ranked search; an undeclared mode refuses rc 1 `ERR_CAPABILITY_UNSUPPORTED` naming `exact, hybrid, trigram` (posix declares exact alone).
5. The store functions (contract 3, the seven native over SQL): `store.list`, `store.get`, `store.put`, `store.delete`, `store.changes`, `store.batch`, `store.scan`, plus the `store.search` entry. Each is one transaction where it writes; the batch is all or none; every connection waits up to ten seconds on a busy writer. `capability` and `storage.health` answer from the sh (the store-only card, no record family).
6. Moving a record: no command moves a record between backends (a move can need judgment a verb would hide), and the plugin carries no migrate verb. A record reaches this store through the agent re-entering it with the ordinary verbs under this driver, so the store holds only what the verbs write: the legacy shapes a hand-written posix file can hold (a repeated slug, a CRLF line, a file outside the record) are the agent's to judge as it re-enters the record, never carried by a command. The corpus goes in through the `ctx docs` write verbs.
7. The schema version: the whole schema 5 is laid in one transaction (`db-init.sh`) at the first open of a new or empty database file: an absent file is made by its first write (a read of an absent file makes nothing), and an existing empty file gets the schema on its first open, read or write; a store at version 5 opens with one read; a store at any other version refuses every function rc 2 `ERR_STORAGE_SCHEMA` (`the store is at schema <v>; this driver reads 5 and has no upgrade path: move the store aside and re-enter the record into a fresh one through the ctx verbs`) and is never written, no backup made; `storage.health` reports it `error` naming the version. A database file the driver cannot read refuses rc 2 `ERR_STORAGE_READ` (`cannot read the store`), and an empty one it cannot lay the schema in `ERR_STORAGE_WRITE` (`cannot create the store`), naming no folder, so a record function's re-frame of either names none.
8. The docs corpus over the generic module store (`store` and `store.changelog`): the agent-facing docs live in the store table under the docs namespace, one value per doc keyed by `<repo>/<slug>` with its bytes verbatim, and the docs module reads them with `store.list` and `store.get` and writes them with `store.put` and `store.delete`; it keeps its own parser and renders every view. Its data file declares no search schema, so each put derives one generic raw-value document into `store_docs`, which the docs verbs never query. Keys are exact and a case twin refuses, as the posix driver answers it. Schema 5 holds no corpus table and no legacy docs table, so that namespace is the corpus's one home. Every store put and delete lands its generic change-log row in `store_changes` inside the same transaction (`BEGIN IMMEDIATE` and `COMMIT`): the op and the git HEAD the verb passed, and `prior`, the key's state before the change (`absent` or `present`). `store.changes` answers the rows of the heads it is given on stdin, oldest first, as one JSON object with `seq`, `at`, `key`, `op`, `head`, and `prior`.
9. The generic module store (`store`, `store.changelog`, `search.schema`): module-owned data only, the record among it (the unit module's values under the namespace `unit`, one per artifact, searched through its declared document-set schema), keyed by (namespace, key) with the value held as opaque bytes, and the seven data functions `store.list`, `store.get`, `store.put`, `store.delete`, `store.changes`, `store.batch`, `store.scan` (plus the `store.search` entry) answered natively over the store tables. `store.list` answers the keys the module's data-file pattern admits in bytewise order, narrowed by an optional literal key prefix; `store.get` returns a key's raw bytes (absent rc 1 `ERR_ENTITY_NOT_FOUND`); `store.put` takes the raw bytes on stdin and echoes `{"namespace","key","op"}`; `store.delete` removes and echoes the same shape; `store.changes` answers `{"namespace","changes":[{"seq","at","key","op","head","prior"}]}` oldest first for the heads on stdin; `store.batch` takes an ordered action list on stdin and runs it in one `BEGIN IMMEDIATE` transaction with one change row per action (all or none; the first failure prints `store.batch: error: action <n> (<op> '<key>'): <message> (<CODE>)` and leaves nothing written), answering `{"namespace","actions":N}`; `store.scan` answers every admitted key bytewise as `{"namespace","items":[{"key","value_b64"}]}`. The key rule is the posix driver's: exact keys, an ASCII case-fold twin refuses, the pattern filters list and scan, no blank, control character, leading slash, backslash, or `.`/`..` segment, and a put is one transaction under one namespace scope lock shared with delete and batch. Each put and delete lands its `store_changes` row (seq, at, namespace, key, op, head, prior; prior the key's state before the write) inside the same transaction, so a refused write logs nothing and an aborted write rolls its row back; a namespace declaring `changes: false` refuses `store.changes` rc 1 `ERR_CAPABILITY_UNSUPPORTED`. `store.search` answers the one result shape `{key, entity_type, entity_id, section, snippet, score}`: `exact` is the record rule over the raw values (the storage core's shared engine, identical to posix), the walk collects every match before the limit applies (0 answers every result), and the ranked modes read `store_docs`, which every put, delete, and batch action re-derives in its transaction (flat: one document per key in section `body`; document set: one per declared entity; no schema: the generic raw value), through `store_fts_prose` (Porter) and `store_fts_code` (Trigram), fused by reciprocal rank for `hybrid` or read alone for `trigram`; a namespace whose stored schema signature differs is re-derived whole before a ranked search. Schema 5 has no record, corpus, or legacy docs tables beside these: the record and the docs corpus are namespaces of this one store, reached only through the unit module and the docs module.

| piece | what it is | lands as |
|---|---|---|
| `manifest` | the package manifest at the plugin root: summary, version, kind driver, driver fts5, and the driver part | reference (the module file retired; a driver is not a module) |
| `.contexture/extensions/storage/drivers/fts5/schema.sql` | the schema version 5 DDL: the generic store, its change log, and the derived store documents with the dual FTS5 virtual tables and their triggers | install (driver part) |
| `.contexture/extensions/storage/drivers/fts5/driver` | the driver executable: the contract 3 store-only entry point (capability, storage.health, the seven store functions, the store search) | install (driver part) |
| `.contexture/extensions/storage/drivers/fts5/db-init.sh` | the database open path: the sqlite3 3.44 minimum, the fresh schema 5 in a new or empty file, the version 5 open, the refusal of any other version, the unreadable and the unwritable open refusals naming no folder, the per-connection busy timeout | install (driver part) |
| `tests/fts5-schema.test.ts` | the schema (vitest project `storage-fts5`): schema 5 laid in an absent or empty file with no backup, a read leaving a version 5 store byte for byte, a version 4, 0, or 6 file refusing get, list, and put naming its version with the file untouched and no backup, `storage.health <namespace>` reporting error at version 4, its other database branches (a file holding no table reads `degraded` with the store absent; a database holding no key of the namespace, its last key deleted or only another namespace's keys stored, reads `ok` with the store absent; a held lock of the namespace reads `locked` with the store absent over a store holding only another namespace's keys; a file that is not a database reads `error` with the store absent; a database file the driver cannot write reads `error` with the namespace's true presence, ahead of a held lock; a failed integrity check reads `error`), every detail free of a folder, the open refusals naming no folder (a database file the driver cannot read refusing get and list `cannot read the store`, an empty one it cannot write refusing the first put `cannot create the store`), and the `storage.database` key in `.contexture/config` placing the store at a workspace-relative and an absolute path, never the default file, a relative value resolved against the workspace root even for a call from a folder under it | reference |
| `tests/fts5-version.test.ts` | the sqlite3 3.44 guard under a fake sqlite3 (itself null-checked): below it a store function refuses rc 2 naming the version and `storage.health` reports `error` naming it; at 3.44 both serve | reference |
| `tests/fts5-store.test.ts` | the store on this driver beyond the shared contract: planted rows never listed or scanned, the zero-length blob, a get whose value read fails printing its one refusal line without the reader's own line (a planted `cat`), the ranked modes (hybrid and trigram over the derived documents, the flat, generic, and JSON forms, quoted queries), the re-derive of a namespace whose search schema changed, the change log's rows, head window, and refusals, a refused write logging nothing, one change row per batch action, and the put and the batch rolled back whole by a planted trigger | reference |
| `README.md` | this onboarding guide and reference manual | reference |

## Architecture and invariants

The storage architecture honors these non-negotiable invariants:

* Zero runtime dependencies: all operations execute through host `/usr/bin/sqlite3` with zero compilation, zero C/C++ build steps, and zero Node.js or Python runtime requirements.
* Turkish character preservation: the unicode61 tokenizer is explicitly configured with `remove_diacritics 0`, guaranteeing proper distinction and matching for Turkish characters (`ç`, `ğ`, `ı`, `ö`, `ş`, `ü`, `İ`).
* Pure SQL RRF ranking: combines natural language stem matching and trigram substring matching using Reciprocal Rank Fusion (`1.0 / (60.0 + rank)`).
* Two-stage CTE execution: separates raw cursor snippet evaluation from outer rank window computation, preventing FTS5 cursor stepping errors.
* Contextual snippet extraction: the ranked modes return token-dense excerpts (12 tokens) with `<b>` highlight delimiters, and `exact` the first matching line, instead of whole records (the saving against whole records is unmeasured here; backlog#driver-benchmark measures it).
* Concurrency and WAL mode: the database runs in `PRAGMA journal_mode = WAL;` and every connection waits up to ten seconds for a busy writer (`sqlite3 -cmd ".timeout 10000"`), enabling concurrent readers alongside serialized writes without database locking errors; every write also holds one namespace store lock (`.contexture/tmp/locks/store-<namespace>.lock` while the drawer's scratch folder is writable, else under the per-user `contexture-<user>` folder in the system temp, the posix driver's rule, so both drivers meet one lock) around its one transaction; an interrupted function (HUP, INT, TERM) removes its scratch and releases the lock it holds through its exit cleanup (an open transaction rolls back with its connection; a function interrupted while it still waits removes nothing, so the live holder keeps its lock), a SIGKILL cannot, but the lock folder carries its holder pid, so a waiter removes a lock whose pid is gone and proceeds while a live holder still refuses `ERR_STORAGE_LOCKED` after 600 polls 0.1 s apart (60 s of sleep), the unit lock's wait (a journal write on a 1 MB unit holds this lock up to 4.2 s under load, since its transaction re-derives the journal's entry documents); while a writer holds the named namespace's lock, `storage.health <namespace>` reports `locked` in place of `ok`, and another namespace's lock leaves it unlocked; a killed verb's per-verb scratch root is swept by the next dispatch.
* No markdown in the store: the store holds module-owned bytes opaquely and never parses them; the record's canonical render is the unit module data script's, never SQL; no function reads markdown or calls another driver (no unit is written out to files for another driver to read), and no function moves a record in or out: the store holds only what the verbs write. The module's grammar stays in the module.
* Zero em-dash and zero spaced hyphen compliance: all documentation, scripts, and error diagnostics strictly avoid em-dashes and spaced hyphens.

```
+-------------------------------------------------------------+
|                     Contexture Runtime                      |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|         Storage Provider Interface (SPI Dispatcher)         |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|            SQLite FTS5 Driver (driver)                      |
+-------------------------------------------------------------+
          |                                        |
          v                                        v
+------------------------+             +------------------------+
|     Generic Store      |             |  Dual FTS5 Indexing    |
|  * store (namespace,   |             |  * store_fts_prose     |
|    key, opaque bytes)  |--triggers-->|    (porter)            |
|  * store_changes       |             |  * store_fts_code      |
|  * store_docs          |             |    (trigram)           |
|  * store_docs_schema   |             +------------------------+
+------------------------+                         |
                                                   v
                                       +------------------------+
                                       |  Pure SQL RRF Engine   |
                                       |  * 1.0 / (60.0 + rank) |
                                       |  * contextual snippets |
                                       +------------------------+
```

### Pure SQL RRF Query Architecture

To resolve the SQLite FTS5 cursor stepping conflict where window functions and auxiliary snippet functions clash within the same SELECT block, the driver executes a two-stage Common Table Expression: `raw_prose` and `raw_code` take the rank and the snippet from each FTS5 table, `ranked_prose` and `ranked_code` number the rows in a separate SELECT, `combined` scores each rank `1.0 / (60.0 + rnk)`, `fused` sums the scores per document (rounded to six places, with one snippet), and the fused rows join the search documents under the unit and entity filter (`store_search_ranked` over `store_docs`); the answer counts every joined row as `total_matches` and returns the first `--limit` of them by score, then document id, each with its `score`.

## Assess

Before adopting `storage-fts5` in a repository, verify:

* SQLite CLI availability: verify that `/usr/bin/sqlite3` or `sqlite3` is on PATH with FTS5 support, version 3.44 or later (below it every function refuses rc 2 `ERR_DRIVER_NOT_FOUND` naming the version found, and `storage.health`, which `ctx unit diagnose` prints, reports `error` naming it).
* An older store: a database written by an earlier release of this plugin is refused naming its schema version (item 7); move it aside, since the driver lays a fresh store in its place only once the path holds no file or an empty one.
* Workspace storage configuration: determine whether the database lives at default `.contexture/sessions.db` or a custom path configured in `.contexture/config` (`storage.database`) or `.contexture/storage.conf`.
* The cutover: once `storage.driver: fts5` is configured, every verb reads and writes the database alone, so a unit or a doc left in files is invisible to it; the units carried forward and the corpus are re-entered through the verbs (Step 3). A corpus tracked in git moves only from a committed state, and fts5 is a single-machine store: a team sharing its corpus through git keeps the posix driver.

## Propose

When proposing `storage-fts5` adoption to the repository maintainer:

* Present the destination: the package installs its driver at `.contexture/extensions/storage/drivers/fts5/`.
* Explain concurrency and indexing benefits: dual FTS5 tables with automatic trigger synchronization and WAL mode concurrency.
* Highlight the ranked modes: 12-token snippets with highlight markers instead of whole unit files in context (`exact`, the default on every driver, answers the first matching line).
* Confirm the cutover plan: no command moves the record; the agent re-enters the units worth carrying through the ordinary verbs and the corpus through `ctx docs write`, and the posix files stay where they are until the maintainer removes them, so switching `storage.driver` back to posix reads them again.

## Execute

### Step 1: Install the Package

Install the driver into the extension root, on the maintainer's go at the act:

```sh
.contexture/ctx package install storage-fts5
```

The installer overlays the package's driver part at
`.contexture/extensions/storage/drivers/fts5/` (the executable named `driver`
with `schema.sql`, `db-init.sh`, and its `README.md` beside it), records every installed
path under `.contexture/extensions/.state/storage-fts5.files`, and refuses the
collision classes before writing. A re-install is an update: files the new
source drops are removed when unchanged and preserved when changed. A
workspace that adopted the earlier module-tree copy removes that copy
(`.contexture/modules/storage-fts5/`) at the same act, after the extension-root
install proves the driver resolves.

### Step 2: Configure Git Ignore

Add the database files to `.gitignore`:

```text
# the SQLite store (the record and the corpus)
.contexture/sessions.db
.contexture/sessions.db-wal
.contexture/sessions.db-shm
```

### Step 3: Re-enter the Record

The maintainer sets the driver; then the agent re-enters each unit worth carrying forward through the ordinary verbs under fts5, reading it under posix (`CTX_STORAGE_DRIVER=posix ctx unit load <unit>`) and judging each legacy shape as it goes, and writes each doc of the corpus through the docs write verb:

```sh
printf 'storage.driver: fts5\n' >> <repo-root>/.contexture/config
ctx unit bootstrap <unit> "<objective>"          # then task add, finding add, record, lane create, ...
ctx docs write <repo> <slug> < docs/<repo>/<slug>.md
```

## Verify

The plugin's tests check the plugin's own copy, never the adopted one: the vitest harness stages this folder's driver into every fts5 sandbox, so an edit to either copy never passes on the other's behalf.

Verify the generic module store with the shared store contract tests, which hold this plugin's own copy and the posix driver to the same set, and with this plugin's own project (from `tests/`, the bun scripts):

```sh
bun run test:drivers
bun run test:storage-fts5
```

The shared set (`tests/drivers/store-contract.test.ts` and its siblings) proves the store seven, the batch, the scan, the locks, and the faults on both drivers; `plugins/storage-fts5/tests` adds what only this driver keeps: the schema, the sqlite3 guard, the change log, the ranked modes and their re-derive, and the trigger rollbacks.

Verify the re-entered record with the read verbs (`ctx unit board`, `load`, `task list`, `entry list`, `finding list`, `lane show`) against the same reads under posix, and each doc with `ctx docs write <repo> <slug> --replace --dry-run < docs/<repo>/<slug>.md`, which answers `unchanged (nothing written)` exactly when the store holds the doc byte for byte.

The docs-discipline project tests the docs logic once, on posix, and keeps its store mode cases on this driver (it declares `store` and `store.changelog`): the store round trip, the change log and its changes window, the gate's store half, the check's store mode, and a parity smoke of eight captures (`plugins/docs-discipline/tests/store/`); the record's verbs run once, on posix, in the vitest `unit-verbs` project, and this driver is held to the shared store contract (`tests/drivers`) instead.

## Needs

- System `sqlite3` with FTS5, JSON, and trigram support (standard on macOS and Linux).
- No external node, python, or compiler toolchains required.

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `manifest` | authored fresh: the package summary, version, kind driver, driver fts5, and the driver part; the module file retired |
| `.contexture/extensions/storage/drivers/fts5/schema.sql` | authored fresh: the schema version 5 store-only tables, the derived store documents, and the two FTS5 tables |
| `tests/fts5-schema.test.ts`, `tests/fts5-version.test.ts`, `tests/fts5-store.test.ts` | authored fresh: the vitest project `storage-fts5` (it replaces the shell sub-suites and their runner; the shared store contract runs over this driver's own copy in `tests/drivers`) |
| `.contexture/extensions/storage/drivers/fts5/driver` | authored fresh: the contract 3 store-only entry point (the seven store functions, the store search, pure SQL RRF ranking) |
| `.contexture/extensions/storage/drivers/fts5/db-init.sh` | authored fresh: the open path at version 5 (fresh schema, version 5 open, every other version refused with no upgrade path) |
| `README.md` | authored fresh: onboarding guide and technical reference |
