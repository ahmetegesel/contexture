# storage-fts5: the SQLite FTS5 storage driver plugin

The storage-fts5 plugin packages an SQLite storage driver and full-text search engine for Contexture: the record held in one database as the typed tables of the contract 2 data model (schema version 4), dual SQLite FTS5 virtual tables, and pure SQL Reciprocal Rank Fusion (RRF) search. The plugin operates directly on the system `sqlite3` CLI (3.44 or later) with zero runtime dependencies and answers every function of the storage contract (contract 2) natively in SQL. It carries no verb of its own, and no command moves a record between it and another driver: the store holds only what the ordinary verbs write, and a store of any other schema version is refused, never upgraded.

## Adoption

Assess the repository, propose the installation to the maintainer, and execute the copy.
The plugin is adoption-gated: nothing is copied before the maintainer's verdict.

## What it is

The storage-fts5 plugin serves as an indexed storage backend: the single store of the record when it is the configured driver.

1. The typed record (schema version 4, `schema.sql`): the store holds the contract 2 data model as typed rows, never as markdown: `units` (the state fields, repos and ref_sessions as JSON arrays), `preambles` (the exact bytes before the first item of the backlog, the knowledge, the journal; NULL for an absent artifact), `tasks` and `findings` (each backlog or knowledge item, an opaque item among them), `journal_items` and `lane_items` (entries and anchors), `lanes` (the recipe and the report as stored, the lane journal's preamble), and the list fields in their own tables (`closers` with `closer_targets`, `item_refs`, `extra_fields`, `finding_refs`). An item is keyed by (unit, lane, pos), pos its position in its artifact; every item keeps its verbatim, the stored span exactly when it differs from the canonical span its fields render, so the store returns the same data as every other backend. Ordinal, seq, occurrence, next, and liveness are derived by the reads, never stored. The canonical renderer is SQL views over the tables (`v_state_text`, `v_task_span`, `v_finding_span`, `v_closer_line`, `v_journal_span`).
2. The derived tables: every write derives, in its own transaction, the `lines` table (every line of the unit's searched text in the exact rule's order with the entity the head rule attributes it to) and the `search_documents` the FTS5 tables index (`sql/derive.sql`), rebuilding only the parts the write names. Texts split into lines in SQL through one JSON array (`sql/split.sql`), linear in the text.
3. Dual FTS5 indexing: natural language prose is indexed with `porter unicode61 remove_diacritics 0` to preserve Turkish characters and diacritics, while exact code identifiers and symbols are indexed with `trigram` tokenization; triggers keep `search_documents` and both tables in step with the index. Each document carries its section, the artifact it came from: `state`, `backlog`, `knowledge`, `journal`, `lane_recipe`, `lane_report`, `lane_journal`.
4. Search: `search.query` returns the shape every driver shares (`{unit, query, mode, total_matches, results: [{entity_type, entity_id, section, snippet, score}]}`). Modes: `exact` (the default on every driver, `sql/fn/search.query.sql`: the `lines` table read in the exact rule's order, a line matching when it holds the query after ASCII case folding, a column-0 comment never matching, one result per entity and section with the first matching line as its snippet, every score 0, so the rows and totals equal the posix driver's), `hybrid` (RRF over both FTS5 tables, `1.0 / (60.0 + rank)`, in a two-stage CTE, `sql/fn/search.ranked.sql`) and `trigram` (the trigram table alone), their score the fused rank; `--limit` (default 20) and `--entity` apply in SQL; an empty query refuses rc 1 `ERR_INVALID_ARGUMENT`, an undeclared mode rc 1 `ERR_CAPABILITY_UNSUPPORTED` naming `exact, hybrid, trigram`.
5. The record functions (contract 2, all 38 native in SQL): one sh entry point (`drivers/fts5`) checks the argv shape with the posix driver's messages, stages the payload lines in a per-call scratch folder under the workspace's `.contexture/tmp`, and runs one sqlite3 process over the call header, `sql/lib/prelude.sql` (the payload decoded in SQL: the wire escapes are a subset of the JSON string escapes), and the function's script `sql/fn/<function>.sql`; `capability` and `storage.health` answer from the sh. Every answer is built with `json_object` in the contract key order (`sql/lib/model.sql`: the derived fields ordinal, seq, occurrence, next, the positional closure, superseded_by, and the JSON of every schema); every refusal is a row the script checks in the posix refusal order and `sql/lib/stop.sql` prints as the one stderr line. Every write runs in one transaction (`BEGIN IMMEDIATE` to `COMMIT`, whole or nothing) under the unit write lock, applies the append rule and the edit rules to the stored verbatims (`sql/lib/jappend.sql`, `tappend.sql`, `fappend.sql`, `tstatus.sql`, `idrop.sql`, `stedit.sql`, the verbatim branches of `task.update` and `finding.update` over the line toolkit `ed.sql`, `scan.sql`, `splice.sql`), reads every block field back from the text it stored as the parse rules read it (`reblock.sql`), settles each touched item's verbatim against its canonical span (`settle.sql`: the verbatim stays exactly when the stored text differs), and rebuilds the unit's derived search rows (`derive.sql`) before it commits; its answer prints only after the commit. Every connection waits up to ten seconds on a busy writer (`.timeout`, set per connection because `busy_timeout` never persists); a read never creates the database, and `storage.health` reports `degraded` until a unit is stored.
6. Moving a record: no command moves a record between backends (a move can need judgment a verb would hide), and the plugin carries no migrate verb (the v0.54.0 `ctx storage-fts5 migrate` retired with its `scripts/migrate`, `index.sh`, and `closer.awk`; the base `ctx session migrate`, `unit.export`, `unit.import`, and the dump format built for v0.55.0 left the contract before it shipped). A record reaches this store through the agent re-entering it with the ordinary verbs under this driver, so the store holds only what the verbs write: the legacy shapes a hand-written posix file can hold (a repeated slug, a CRLF line, a file outside the record) are the agent's to judge as it re-enters the record, never carried by a command. The corpus goes in through the `ctx docs` write verbs (`ctx docs write <repo> <slug> < docs/<repo>/<slug>.md`), each doc checked by the verb's grammar check and its repo's audit, each write landing its change-log row.
7. The schema version: a new or empty database file gets the whole schema 4 on its first write (`db-init.sh`, one transaction); a store at version 4 opens with one read; a store at any other version (an older release's store, or a later one) refuses every function rc 2 `ERR_STORAGE_SCHEMA` (`the store is at schema <v>; this driver reads 4 and has no upgrade path: move the store aside and re-enter the record into a fresh one through the ctx verbs`) and is never written, no backup made; `storage.health` reports it `error` naming the version. No store to keep existed when the upgrade path was dropped: the plugin had never been a workspace's configured driver.
8. The corpus store (`corpus.store` and `corpus.changelog`): the agent-facing docs beside the record, one `docs` row per doc keyed by (repo, slug) with its text verbatim; the corpus is no unit, so no cascade reaches it, and no doc is indexed for search (the docs verbs keep their own corpus search). `corpus.list` orders by the canonical address `docs/<repo>/<slug>.md` bytewise, as a C-locale glob of files would; `corpus.mount` fills the empty folder it is handed (an empty store mounts an empty docs folder) and prints it; `corpus.read`, `corpus.write`, `corpus.remove` keep the posix driver's keys, flags, messages, and exit tiers, the case rule included: a write whose key folds onto another doc's key under ASCII case (a slug of the same repo, or the repo itself) refuses rc 1 `ERR_ENTITY_EXISTS` with nothing stored, although the table could hold both, since a mount onto a case-insensitive filesystem would fold them into one file; every lookup is by the exact key, so a case twin of a stored key reads, removes, lists, and mounts as absent (rc 1 `ERR_ENTITY_NOT_FOUND`), as the posix driver answers it on any filesystem. Every write and remove lands its change-log row in `doc_changes` inside the same transaction as the doc row (`BEGIN IMMEDIATE` and `COMMIT`): the op and the git HEAD the verb passed, and `prior`, the doc's state before the change (`absent` or `present`), so a window of rows yields each doc's net status. `corpus.changes` returns the rows of the heads it is given on stdin, oldest first, one line each: `<seq> TAB <time> TAB <op> TAB <repo>/<slug> TAB <head> TAB <prior>`.

| piece | what it is | lands as |
|---|---|---|
| `.contexture/modules/storage-fts5/module` | the module summary line | copy |
| `.contexture/modules/storage-fts5/schema.sql` | the schema version 4 DDL: the typed tables, the canonical renderer views, the derived search tables with the dual FTS5 virtual tables and their triggers, and the corpus tables | copy |
| `.contexture/modules/storage-fts5/sql/` | the SQL beside the driver: `fn/` one script per record function, `lib/` the pieces they share, `derive.sql`, `split.sql` | copy |
| `.contexture/modules/storage-fts5/drivers/fts5` | the driver executable: the contract 2 entry point over `sql/`, the corpus store among its methods | copy |
| `.contexture/modules/storage-fts5/db-init.sh` | the database open path: the sqlite3 3.44 minimum, the fresh schema in a new or empty file, the refusal of any other version, the per-connection busy timeout | copy |
| `tests/test-driver.sh` | the contract 2 compliance suite against the plugin's own driver | reference |
| `tests/test-schema.sh` | schema 4 laid in an absent or empty file with no backup, a read leaving a version 4 store byte for byte, and a version 3, 0, or 5 file refused naming its version, the file untouched, no backup, `storage.health` reporting error | reference |
| `tests/test-verbs.sh` | one verb sequence on posix and on this driver in a workspace staged from the shipped core: the views equal on both drivers, liveness through two closer lines, supersession, exact and hybrid search, the typed fields without a trailing newline, and `ctx storage-fts5 migrate` and `ctx session migrate` answering unknown verbs | reference |
| `tests/test-version.sh` | the sqlite3 3.44 guard under a fake sqlite3: below it a record function refuses rc 2 naming the version and `storage.health` reports `error` naming it; at 3.44 both serve | reference |
| `tests/test-derive.sh` | the narrowed derive: a write sequence over every part of two function-built units leaves the same lines and search documents as a whole rebuild, and the lines equal the posix files the same writes leave; both comparators read a planted difference | reference |
| `tests/run.sh` | plugin test suite runner | reference |
| `README.md` | this onboarding guide and reference manual | reference |

## Architecture and invariants

The storage architecture honors these non-negotiable invariants:

* Zero runtime dependencies: all operations execute through host `/usr/bin/sqlite3` with zero compilation, zero C/C++ build steps, and zero Node.js or Python runtime requirements.
* Turkish character preservation: the unicode61 tokenizer is explicitly configured with `remove_diacritics 0`, guaranteeing proper distinction and matching for Turkish characters (`ç`, `ğ`, `ı`, `ö`, `ş`, `ü`, `İ`).
* Pure SQL RRF ranking: combines natural language stem matching and trigram substring matching using Reciprocal Rank Fusion (`1.0 / (60.0 + rank)`).
* Two-stage CTE execution: separates raw cursor snippet evaluation from outer rank window computation, preventing FTS5 cursor stepping errors.
* Contextual snippet extraction: the ranked modes return token-dense excerpts (12 tokens) with `<b>` highlight delimiters, and `exact` the first matching line, instead of whole records (the saving against whole records is unmeasured here; backlog#driver-benchmark measures it).
* Concurrency and WAL mode: the database runs in `PRAGMA journal_mode = WAL;` and every connection waits up to ten seconds for a busy writer (`sqlite3 -cmd ".timeout 10000"`), enabling concurrent readers alongside serialized writes without database locking errors; every write also holds its unit write lock (`.contexture/tmp/locks/fts5-<unit>.lock`) around its one transaction; an interrupted function (HUP, INT, TERM) removes its scratch and releases the lock through its exit cleanup (an open transaction rolls back with its connection), a SIGKILL cannot, and the lock it leaves stalls later writers of that unit until it is removed.
* No markdown in the store: the store holds typed rows and the canonical renderer is SQL; no function reads markdown or calls another driver (no unit is written out to files for another driver to read), and no function moves a record in or out: the store holds only what the verbs write.
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
|            SQLite FTS5 Driver (drivers/fts5)                |
+-------------------------------------------------------------+
          |                                        |
          v                                        v
+------------------------+             +------------------------+
|    Relational Model    |             |  Dual FTS5 Indexing    |
|  * units, preambles    |             |  * fts_prose (porter)  |
|  * tasks, findings     |--triggers-->|  * fts_code (trigram)  |
|  * journal_items       |             |  * search_documents    |
|  * lanes, lane_items   |             +------------------------+
|  * closers, refs       |                         |
|  * lines (exact)       |                         v
|  * docs, doc_changes   |             +------------------------+
+------------------------+             |  Pure SQL RRF Engine   |
                                       |  * 1.0 / (60.0 + rank) |
                                       |  * contextual snippets |
                                       +------------------------+
```

### Pure SQL RRF Query Architecture

To resolve the SQLite FTS5 cursor stepping conflict where window functions and auxiliary snippet functions clash within the same SELECT block, the driver executes a two-stage Common Table Expression: `raw_prose` and `raw_code` take the rank and the snippet from each FTS5 table, `ranked_prose` and `ranked_code` number the rows in a separate SELECT, `combined` scores each rank `1.0 / (60.0 + rnk)`, `fused` sums the scores per document (rounded to six places, with one snippet), and the fused rows join the search documents under the unit and entity filter (`sql/fn/search.ranked.sql`); the answer counts every joined row as `total_matches` and returns the first `--limit` of them by score, then document id, each with its `score`.

## Assess

Before adopting `storage-fts5` in a repository, verify:

* SQLite CLI availability: verify that `/usr/bin/sqlite3` or `sqlite3` is on PATH with FTS5 support, version 3.44 or later (below it every function refuses rc 2 `ERR_DRIVER_NOT_FOUND` naming the version found, and `storage.health`, which `ctx session diagnose` prints, reports `error` naming it).
* An older store: a database written by an earlier release of this plugin is refused naming its schema version (item 7); move it aside, since the driver lays a fresh store in its place only once the path holds no file or an empty one.
* Workspace storage configuration: determine whether the database lives at default `.contexture/sessions.db` or a custom path configured in `.contexture/config` (`storage.database`) or `.contexture/storage.conf`.
* The cutover: once `storage.driver: fts5` is configured, every verb reads and writes the database alone, so a unit or a doc left in files is invisible to it; the units carried forward and the corpus are re-entered through the verbs (Step 3). A corpus tracked in git moves only from a committed state, and fts5 is a single-machine store: a team sharing its corpus through git keeps the posix driver.

## Propose

When proposing `storage-fts5` adoption to the repository maintainer:

* Present the destination: the plugin module copies to `.contexture/modules/storage-fts5/`.
* Explain concurrency and indexing benefits: dual FTS5 tables with automatic trigger synchronization and WAL mode concurrency.
* Highlight the ranked modes: 12-token snippets with highlight markers instead of whole session files in context (`exact`, the default on every driver, answers the first matching line).
* Confirm the cutover plan: no command moves the record; the agent re-enters the units worth carrying through the ordinary verbs and the corpus through `ctx docs write`, and the posix files stay where they are until the maintainer removes them, so switching `storage.driver` back to posix reads them again.

## Execute

### Step 1: Copy Module Tree

Copy the module tree into the workspace:

```sh
mkdir -p <repo-root>/.contexture/modules
cp -R plugins/storage-fts5/.contexture/modules/storage-fts5 <repo-root>/.contexture/modules/
chmod +x <repo-root>/.contexture/modules/storage-fts5/drivers/fts5
```

A workspace that adopted an earlier release removes the files this release no longer ships (a copy never deletes one, and a stale `scripts/migrate` would still list as a verb):

```sh
M=<repo-root>/.contexture/modules/storage-fts5
rm -f "$M/scripts/migrate" "$M/index.sh" "$M/closer.awk" "$M/sql/unit.export.sql" "$M/sql/dump.load.sql" "$M/sql/dump.check.sql" "$M/sql/dump.import.sql"
rm -rf "$M/upgrade"
rmdir "$M/scripts" 2>/dev/null
```

### Step 2: Configure Git Ignore

Add the database files to `.gitignore`:

```text
# SQLite session database
.contexture/sessions.db
.contexture/sessions.db-wal
.contexture/sessions.db-shm
```

### Step 3: Re-enter the Record

The maintainer sets the driver; then the agent re-enters each unit worth carrying forward through the ordinary verbs under fts5, reading it under posix (`CTX_STORAGE_DRIVER=posix ctx session load <unit>`) and judging each legacy shape as it goes, and writes each doc of the corpus through the docs write verb:

```sh
printf 'storage.driver: fts5\n' >> <repo-root>/.contexture/config
ctx session bootstrap <unit> "<objective>"          # then task add, finding add, record, lane create, ...
ctx docs write <repo> <slug> < docs/<repo>/<slug>.md
```

## Verify

Verify the installation against the Storage SPI compliance harness:

```sh
tests/storage-compliance.sh --driver=fts5
```

This resolves the driver through the workspace drawer, so it checks the adopted copy. The plugin suite (`plugins/storage-fts5/tests/run.sh`) checks the plugin's own copy instead: its scripts resolve the module from their own location and hand the driver to the harness by path (`--driver-exec=<path>`), so an edit to either copy never passes on the other's behalf.

Verify the re-entered record with the read verbs (`ctx session board`, `load`, `task list`, `entry list`, `finding list`, `lane show`) against the same reads under posix, and each doc with `ctx docs write <repo> <slug> --replace --dry-run < docs/<repo>/<slug>.md`, which answers `unchanged (nothing written)` exactly when the store holds the doc byte for byte.

The harness's corpus suite runs in full against this driver (it declares `corpus.store` and `corpus.changelog`), its changes case included; the plugin suite's `test-verbs` writes one unit through the same verbs on posix and on this driver and compares every view.

## Needs

- System `sqlite3` with FTS5, JSON, and trigram support (standard on macOS and Linux).
- No external node, python, or compiler toolchains required.

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `.contexture/modules/storage-fts5/module` | authored fresh: module summary line |
| `.contexture/modules/storage-fts5/schema.sql` | authored fresh: the schema version 4 typed tables, views, search tables, and FTS5 tables |
| `.contexture/modules/storage-fts5/sql/` | authored fresh: the record functions, the derived tables, the line splitter |
| `tests/test-schema.sh` | authored fresh: the schema version suite (it replaces the upgrade suite, whose live checks it carries) |
| `tests/test-verbs.sh` | authored fresh: the verb path on both drivers, carrying every live check of the retired migrate suite |
| `tests/test-version.sh` | authored fresh: the sqlite3 version guard suite |
| `tests/test-derive.sh` | authored fresh: the narrowed derive against a whole rebuild |
| `.contexture/modules/storage-fts5/drivers/fts5` | authored fresh: the contract 2 entry point (the record functions native in SQL under `sql/fn/` and `sql/lib/`, pure SQL RRF ranking, the corpus store) |
| `.contexture/modules/storage-fts5/db-init.sh` | authored fresh: the open path at version 4, refusing every other version |
| `tests/test-driver.sh` | authored fresh: SPI compliance test runner |
| `tests/run.sh` | authored fresh: named test runner over plugin test suites |
| `README.md` | authored fresh: onboarding guide and technical reference |
