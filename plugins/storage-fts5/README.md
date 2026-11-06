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
7. The schema version: a new or empty database file gets the whole schema 5 on its first write (`db-init.sh`, one transaction); a store at version 5 opens with one read; a store at any other version refuses every function rc 2 `ERR_STORAGE_SCHEMA` (`the store is at schema <v>; this driver reads 5 and has no upgrade path: move the store aside and re-enter the record into a fresh one through the ctx verbs`) and is never written, no backup made; `storage.health` reports it `error` naming the version.
8. The docs corpus over the generic module store (`store` and `store.changelog`): the agent-facing docs live in the store table under the docs namespace, one value per doc keyed by `<repo>/<slug>` with its bytes verbatim, and the docs module reads them with `store.list` and `store.get` and writes them with `store.put` and `store.delete`; it keeps its own parser and renders every view, and no doc is indexed for search. Keys are exact and a case twin refuses, as the posix driver answers it. The legacy docs tables stay untouched and unread. Every store put and delete lands its generic change-log row in `store_changes` inside the same transaction (`BEGIN IMMEDIATE` and `COMMIT`): the op and the git HEAD the verb passed, and `prior`, the key's state before the change (`absent` or `present`). `store.changes` answers the rows of the heads it is given on stdin, oldest first, as one JSON object with `seq`, `at`, `key`, `op`, `head`, and `prior`.
9. The generic module store (`store`, `store.changelog`, `search.schema`): module-owned data only, beside the record, keyed by (namespace, key) with the value held as opaque bytes, and the seven data functions `store.list`, `store.get`, `store.put`, `store.delete`, `store.changes`, `store.batch`, `store.scan` (plus the `store.search` entry) answered natively over the store tables. `store.list` answers the keys the module's data-file pattern admits in bytewise order, narrowed by an optional literal key prefix; `store.get` returns a key's raw bytes (absent rc 1 `ERR_ENTITY_NOT_FOUND`); `store.put` takes the raw bytes on stdin and echoes `{"namespace","key","op"}`; `store.delete` removes and echoes the same shape; `store.changes` answers `{"namespace","changes":[{"seq","at","key","op","head","prior"}]}` oldest first for the heads on stdin; `store.batch` takes an ordered action list on stdin and runs it in one `BEGIN IMMEDIATE` transaction with one change row per action (all or none; the first failure prints `store.batch: error: action <n> (<op> '<key>'): <message> (<CODE>)` and leaves nothing written), answering `{"namespace","actions":N}`; `store.scan` answers every admitted key bytewise as `{"namespace","items":[{"key","value_b64"}]}`. The key rule is the posix driver's: exact keys, an ASCII case-fold twin refuses, the pattern filters list and scan, no blank, control character, leading slash, backslash, or `.`/`..` segment, and a put is one transaction under one namespace scope lock shared with delete and batch. Each put and delete lands its `store_changes` row (seq, at, namespace, key, op, head, prior; prior the key's state before the write) inside the same transaction, so a refused write logs nothing and an aborted write rolls its row back; a namespace declaring `changes: false` refuses `store.changes` rc 1 `ERR_CAPABILITY_UNSUPPORTED`. `store.search` answers the one result shape `{key, entity_type, entity_id, section, snippet, score}`: `exact` is the record rule over the raw values (the storage core's shared engine, identical to posix), the walk collects every match before the limit applies (0 answers every result), and the ranked modes read `store_docs`, which every put, delete, and batch action re-derives in its transaction (flat: one document per key in section `body`; document set: one per declared entity; no schema: the generic raw value), through `store_fts_prose` (Porter) and `store_fts_code` (Trigram), fused by reciprocal rank for `hybrid` or read alone for `trigram`; a namespace whose stored schema signature differs is re-derived whole before a ranked search. The corpus tables are never read or written by the store: the docs corpus reaches it only through the docs port.

| piece | what it is | lands as |
|---|---|---|
| `manifest` | the package manifest at the plugin root: summary, version, kind driver, driver fts5, and the driver part | reference (the module file retired; a driver is not a module) |
| `.contexture/extensions/storage/drivers/fts5/schema.sql` | the schema version 5 DDL: the generic store, its change log, and the derived store documents with the dual FTS5 virtual tables and their triggers | install (driver part) |
| `.contexture/extensions/storage/drivers/fts5/driver` | the driver executable: the contract 3 store-only entry point (capability, storage.health, the seven store functions, the store search) | install (driver part) |
| `.contexture/extensions/storage/drivers/fts5/db-init.sh` | the database open path: the sqlite3 3.44 minimum, the fresh schema 5 in a new or empty file, the version 5 open, the refusal of any other version, the per-connection busy timeout | install (driver part) |
| `tests/test-schema.sh` | schema 5 laid in an absent or empty file with no backup, a read leaving a version 5 store byte for byte, and a version 4, 0, or 6 file refused naming its version, the file untouched, no backup, `storage.health` reporting error | reference |
| `tests/test-version.sh` | the sqlite3 3.44 guard under a fake sqlite3: below it a store function refuses rc 2 naming the version and `storage.health` reports `error` naming it; at 3.44 both serve | reference |
| `tests/test-store.sh` | the generic module store on this driver: the five single-key functions, the byte round-trip, the change log's row order and head window, a refused write logging nothing, the atomic put's rollback under a planted trigger, a store at another schema refused with no upgrade path, the store-only schema, and the contract 3 descriptor (version 3.0.0, the seven store data names, the optional tokens, no record family) | reference |
| `tests/test-store-compliance.sh` | the shared store compliance suite (`tests/store-compliance.sh --driver=fts5`) against the plugin's own driver | reference |
| `tests/run.sh` | plugin test suite runner | reference |
| `README.md` | this onboarding guide and reference manual | reference |

## Architecture and invariants

The storage architecture honors these non-negotiable invariants:

* Zero runtime dependencies: all operations execute through host `/usr/bin/sqlite3` with zero compilation, zero C/C++ build steps, and zero Node.js or Python runtime requirements.
* Turkish character preservation: the unicode61 tokenizer is explicitly configured with `remove_diacritics 0`, guaranteeing proper distinction and matching for Turkish characters (`ç`, `ğ`, `ı`, `ö`, `ş`, `ü`, `İ`).
* Pure SQL RRF ranking: combines natural language stem matching and trigram substring matching using Reciprocal Rank Fusion (`1.0 / (60.0 + rank)`).
* Two-stage CTE execution: separates raw cursor snippet evaluation from outer rank window computation, preventing FTS5 cursor stepping errors.
* Contextual snippet extraction: the ranked modes return token-dense excerpts (12 tokens) with `<b>` highlight delimiters, and `exact` the first matching line, instead of whole records (the saving against whole records is unmeasured here; backlog#driver-benchmark measures it).
* Concurrency and WAL mode: the database runs in `PRAGMA journal_mode = WAL;` and every connection waits up to ten seconds for a busy writer (`sqlite3 -cmd ".timeout 10000"`), enabling concurrent readers alongside serialized writes without database locking errors; every write also holds one namespace store lock (`.contexture/tmp/locks/store-<namespace>.lock`) around its one transaction; an interrupted function (HUP, INT, TERM) removes its scratch and releases the lock through its exit cleanup (an open transaction rolls back with its connection), a SIGKILL cannot, but the lock folder carries its holder pid, so a waiter removes a lock whose pid is gone and proceeds while a live holder still refuses `ERR_STORAGE_LOCKED` after 600 polls 0.1 s apart (60 s of sleep), the unit lock's wait (a journal write on a 1 MB unit holds this lock up to 4.2 s under load, since its transaction re-derives the journal's entry documents); a killed verb's per-verb scratch root is swept by the next dispatch.
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
* Highlight the ranked modes: 12-token snippets with highlight markers instead of whole session files in context (`exact`, the default on every driver, answers the first matching line).
* Confirm the cutover plan: no command moves the record; the agent re-enters the units worth carrying through the ordinary verbs and the corpus through `ctx docs write`, and the posix files stay where they are until the maintainer removes them, so switching `storage.driver` back to posix reads them again.

## Execute

### Step 1: Install the Package

Install the driver into the extension root, on the maintainer's go at the act:

```sh
sh plugins/storage-fts5/install
```

The installer overlays the package's driver part at
`.contexture/extensions/storage/drivers/fts5/` (the executable named `driver`
with `schema.sql`, `sql/`, and `db-init.sh` beside it), records every installed
path under `.contexture/extensions/.state/storage-fts5.files`, and refuses the
collision classes before writing. A re-install is an update: files the new
source drops are removed when unchanged and preserved when changed. A
workspace that adopted the earlier module-tree copy removes that copy
(`.contexture/modules/storage-fts5/`) at the same act, after the extension-root
install proves the driver resolves.

### Step 2: Configure Git Ignore

Add the database files to `.gitignore`:

```text
# SQLite session database
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

Verify the installation against the Storage SPI compliance harness:

```sh
tests/storage-compliance.sh --driver=fts5
```

This resolves the driver through the workspace drawer, so it checks the adopted copy. The plugin suite (`plugins/storage-fts5/tests/run.sh`) checks the plugin's own copy instead: its scripts resolve the module from their own location and hand the driver to the harness by path (`--driver-exec=<path>`), so an edit to either copy never passes on the other's behalf.

Verify the generic module store with the shared store compliance suite, which takes the driver by name:

```sh
tests/store-compliance.sh --driver=fts5
```

The plugin suite runs the same suite against its own copy (`tests/test-store-compliance.sh`) and adds `tests/test-store.sh`: the five single-key functions, the change log's row order and head window, a refused write logging nothing, the atomic put's rollback, a store at another schema refused with no upgrade path, and the store-only schema; the batch and the scan are proven by the store-compliance suite on both drivers.

Verify the re-entered record with the read verbs (`ctx unit board`, `load`, `task list`, `entry list`, `finding list`, `lane show`) against the same reads under posix, and each doc with `ctx docs write <repo> <slug> --replace --dry-run < docs/<repo>/<slug>.md`, which answers `unchanged (nothing written)` exactly when the store holds the doc byte for byte.

The docs plugin suite runs in full against this driver (it declares `store` and `store.changelog`), the capture parity and the change-log cases included; the record's cross-driver verb parity runs in the unit suite (posix and fts5) through the unit module.

## Needs

- System `sqlite3` with FTS5, JSON, and trigram support (standard on macOS and Linux).
- No external node, python, or compiler toolchains required.

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `manifest` | authored fresh: the package summary, version, kind driver, driver fts5, and the driver part; the module file retired |
| `.contexture/extensions/storage/drivers/fts5/schema.sql` | authored fresh: the schema version 5 store-only tables, the derived store documents, and the two FTS5 tables |
| `tests/test-schema.sh` | authored fresh: the schema version suite (it replaces the upgrade suite, whose live checks it carries) |
| `tests/test-version.sh` | authored fresh: the sqlite3 version guard suite |
| `.contexture/extensions/storage/drivers/fts5/driver` | authored fresh: the contract 3 store-only entry point (the seven store functions, the store search, pure SQL RRF ranking) |
| `.contexture/extensions/storage/drivers/fts5/db-init.sh` | authored fresh: the open path at version 5 (fresh schema, version 5 open, every other version refused with no upgrade path) |
| `tests/test-store.sh` | authored fresh: the generic module store suite (change log, atomicity, a store at another schema refused, the store-only schema, the contract 3 descriptor) |
| `tests/test-store-compliance.sh` | authored fresh: the shared store compliance harness against the plugin's own driver |
| `tests/run.sh` | authored fresh: named test runner over plugin test suites |
| `README.md` | authored fresh: onboarding guide and technical reference |
