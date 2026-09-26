# storage-fts5: the SQLite FTS5 storage driver plugin

The storage-fts5 plugin packages an SQLite storage driver and full-text search engine for Contexture: every record artifact kept verbatim in one database, a relational index rebuilt from that text, dual SQLite FTS5 virtual tables, and pure SQL Reciprocal Rank Fusion (RRF) search. The plugin operates directly on the system `sqlite3` CLI with zero runtime dependencies, providing token-compact snippet extraction and byte-exact bidirectional migration between POSIX markdown records and the database.

## Adoption

Assess the repository, propose the installation to the maintainer, and execute the copy.
The plugin is adoption-gated: nothing is copied before the maintainer's verdict.

## What it is

The storage-fts5 plugin serves as an indexed storage backend: the single store of the record when it is the configured driver.

1. The canonical text: the `artifacts` table keeps every artifact of a unit (state, backlog, knowledge, journal, and each lane's recipe, journal, report) byte for byte. It is the source of truth: `artifact.read` returns it, an export writes it back, and every write lands a new text. The record grammar lives in one place, the reference serialization (the posix driver, found through `CTX_REFERENCE_DRIVER`, which the resolver exports, or the session module beside this one): every record method (`session.*`, `task.*`, `entry.*`, `finding.*`, `lane.*`, `resolve.ref`) runs through it over the unit materialized from the store into a scratch workspace under `.contexture/tmp`, and every artifact the method changed is stored back with its reindex in one transaction, under a unit write lock. So the fts5 driver answers every method exactly as the posix driver does, and a write the grammar refuses never reaches the store. Native methods: `capability`, `storage.health`, `artifact.read`, `artifact.write`, `artifact.list`, `session.create`, `session.list`, `search.query`.
2. The derived index: sessions, tasks, entries, findings, lanes, lane_entries, and closures are rebuilt from the text of the artifact that changed (`index.sh`, shared by the driver and the migration). The closures table holds one row per target of every `CLOSES` and `SUPERSEDES` line (main journal and lane journals), with its verdict, reason, and the line verbatim. A legacy journal that repeats an entry slug keeps one row per occurrence keyed by (slug, ordinal), in file order, never renamed. A finding's `SUPERSEDED` status is derived from its successor's `SUPERSEDES` line; a task's `REFS` is indexed as a JSON array. A block scalar (a task section, a finding `SUMMARY`, a `WHAT`) is indexed without the blank separator line that follows its block, so no derived row ends in a newline; interior newlines stay.
3. Dual FTS5 indexing: natural language prose is indexed with `porter unicode61 remove_diacritics 0` to preserve Turkish characters and diacritics, while exact code identifiers and symbols are indexed with `trigram` tokenization; triggers keep `search_documents` and both tables in step with the index. Each document carries its section, the artifact it came from: `state`, `backlog`, `knowledge`, `journal`, `lane_recipe`, `lane_report`, `lane_journal`.
4. Search: `search.query` returns the shape every driver shares (`entity_type`, `entity_id`, `section`, `snippet` per result, `total_matches` before the cap, the `mode` it ran) plus `rrf_score` and `sources`. Modes: `hybrid` (the default: RRF over both tables, `1.0 / (60.0 + rank)`, in a two-stage CTE), `trigram` (the trigram table alone), `exact` (a case-insensitive substring, as posix searches); `--limit` (default 20) and `--entity` apply in SQL; an empty query refuses rc 1.
5. Contract fidelity: every write checks the backend's status and fails with `ERR_STORAGE_WRITE` (rc 2) instead of printing a success payload; every connection waits up to ten seconds on a busy writer (`.timeout`, set per connection because `busy_timeout` never persists); a read never creates the database, and `storage.health` reports `degraded` until a unit is stored.
6. Bidirectional migration: `ctx storage-fts5 migrate` stores each POSIX file verbatim as its artifact and rebuilds its rows (one transaction per unit; a re-import replaces the unit whole, the cascade sweeping its rows and search documents), and exports the stored text back byte for byte, a lane folder with no artifact kept. A repeated task slug or finding name is refused by name before any SQL (those are mutable surfaces, not history). The migration reads the database path from `.contexture/config` (`storage.database`) as the driver does.
7. In-place upgrades: a database created before the ordinal key is rebuilt on its next open, every row and id kept; a database created before the artifacts table (schema version 1) gains it on its next open, its search documents re-derived under the uniform sections, and every unit's artifacts seeded from its rows by the legacy serialization, so an older database keeps every record it had.

| piece | what it is | lands as |
|---|---|---|
| `.contexture/modules/storage-fts5/module` | the module summary line | copy |
| `.contexture/modules/storage-fts5/schema.sql` | relational SQLite DDL, triggers, and dual FTS5 virtual tables | copy |
| `.contexture/modules/storage-fts5/drivers/fts5` | the Storage Provider Interface (SPI) driver executable | copy |
| `.contexture/modules/storage-fts5/scripts/migrate` | bidirectional migration CLI verb | copy |
| `.contexture/modules/storage-fts5/closer.awk` | the closer line parse shared by the migration and the driver | copy |
| `.contexture/modules/storage-fts5/db-init.sh` | the database open path shared by the driver and the migration: fresh schema, in-place upgrades, the per-connection busy timeout | copy |
| `.contexture/modules/storage-fts5/index.sh` | the derived index rebuilt from an artifact's text, shared by the driver and the migration | copy |
| `tests/test-driver.sh` | SPI compliance test runner against fts5 driver | reference |
| `tests/test-migration.sh` | bidirectional round-trip migration verification suite | reference |
| `tests/run.sh` | plugin test suite runner | reference |
| `README.md` | this onboarding guide and reference manual | reference |

## Architecture and invariants

The storage architecture honors these non-negotiable invariants:

* Zero runtime dependencies: all operations execute through host `/usr/bin/sqlite3` with zero compilation, zero C/C++ build steps, and zero Node.js or Python runtime requirements.
* Turkish character preservation: the unicode61 tokenizer is explicitly configured with `remove_diacritics 0`, guaranteeing proper distinction and matching for Turkish characters (`ç`, `ğ`, `ı`, `ö`, `ş`, `ü`, `İ`).
* Pure SQL RRF ranking: combines natural language stem matching and trigram substring matching using Reciprocal Rank Fusion (`1.0 / (60.0 + rank)`).
* Two-stage CTE execution: separates raw cursor snippet evaluation from outer rank window computation, preventing FTS5 cursor stepping errors.
* Contextual snippet extraction: returns token-dense excerpts (default 12 tokens) with bold highlight delimiters, slashing prompt token consumption by over 90 percent.
* Concurrency and WAL mode: the database runs in `PRAGMA journal_mode = WAL;` and every connection waits up to ten seconds for a busy writer (`sqlite3 -cmd ".timeout 10000"`), enabling concurrent readers alongside serialized writes without database locking errors; the record methods also hold a unit write lock across materialize, render, and store; an interrupted method (HUP, INT, TERM) removes its scratch unit and releases the lock through its exit cleanup, a SIGKILL cannot, and the lock it leaves stalls later writers of that unit until it is removed.
* One grammar: the record grammar is rendered only by the reference serialization; the driver never re-implements a grammar check.
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
|  * sessions            |             |  * fts_prose (porter)  |
|  * tasks               |--triggers-->|  * fts_code (trigram)  |
|  * entries             |             |  * search_documents    |
|  * findings            |             +------------------------+
|  * lanes               |                         |
|  * lane_entries        |                         v
+------------------------+             +------------------------+
                                       |  Pure SQL RRF Engine   |
                                       |  * 1.0 / (60.0 + rank) |
                                       |  * contextual snippets |
                                       +------------------------+
```

### Pure SQL RRF Query Architecture

To resolve the SQLite FTS5 cursor stepping conflict where window functions and auxiliary snippet functions clash within the same SELECT block, the driver executes a two-stage Common Table Expression: `raw_prose` and `raw_code` take the rank and the snippet from each FTS5 table, `ranked_prose` and `ranked_code` number the rows in a separate SELECT, `combined` scores each rank `1.0 / (60.0 + rnk)`, `fused` sums the scores per document (`rrf_score`, `sources`, the best snippet), and `hits` joins the search documents under the unit and entity filter; the payload counts `hits` as `total_matches` and returns the first `--limit` of them by score.

## Assess

Before adopting `storage-fts5` in a repository, verify:

* SQLite CLI availability: verify that `/usr/bin/sqlite3` or `sqlite3` is on PATH with FTS5 support.
* Workspace storage configuration: determine whether the database lives at default `.contexture/sessions.db` or a custom path configured in `.contexture/config` (`storage.database`) or `.contexture/storage.conf`.
* The cutover: once `storage.driver: fts5` is configured, every verb reads and writes the database alone; import the units first (Step 3), since a unit left in files is invisible to the fts5 store.

## Propose

When proposing `storage-fts5` adoption to the repository maintainer:

* Present the destination: the plugin module copies to `.contexture/modules/storage-fts5/`.
* Explain concurrency and indexing benefits: dual FTS5 tables with automatic trigger synchronization and WAL mode concurrency.
* Highlight prompt token savings: 5-to-12 token snippets with highlight markers instead of dumping entire session files into context.
* Confirm that migration is bidirectional and lossless via `ctx storage-fts5 migrate`.

## Execute

### Step 1: Copy Module Tree

Copy the module tree into the workspace:

```sh
mkdir -p <repo-root>/.contexture/modules
cp -R plugins/storage-fts5/.contexture/modules/storage-fts5 <repo-root>/.contexture/modules/
chmod +x <repo-root>/.contexture/modules/storage-fts5/drivers/fts5 <repo-root>/.contexture/modules/storage-fts5/scripts/migrate
```

### Step 2: Configure Git Ignore

Add the database files to `.gitignore`:

```text
# SQLite session database
.contexture/sessions.db
.contexture/sessions.db-wal
.contexture/sessions.db-shm
```

### Step 3: Run Initial Migration

Import existing POSIX session records into SQLite:

```sh
ctx storage-fts5 migrate --from=posix --to=fts5
```

## Verify

Verify the installation against the Storage SPI compliance harness:

```sh
tests/storage-compliance.sh --driver=fts5
```

This resolves the driver through the workspace drawer, so it checks the adopted copy (run it with `CTX_REFERENCE_DRIVER` set to the workspace's posix driver when the harness sandbox lacks the session module). The plugin suite (`plugins/storage-fts5/tests/run.sh`) checks the plugin's own copy instead: its scripts resolve the module from their own location and hand the driver to the harness by path (`--driver-exec=<path>`), so an edit to either copy never passes on the other's behalf.

Verify bidirectional migration:

```sh
# Export records back to POSIX files
ctx storage-fts5 migrate --from=fts5 --to=posix --unit=<unit>

# Ingest records back into SQLite
ctx storage-fts5 migrate --from=posix --to=fts5 --unit=<unit>
```

## Needs

- System `sqlite3` with FTS5, JSON, and trigram support (standard on macOS and Linux).
- No external node, python, or compiler toolchains required.

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `.contexture/modules/storage-fts5/module` | authored fresh: module summary line |
| `.contexture/modules/storage-fts5/schema.sql` | authored fresh: relational SQLite schema, triggers, and FTS5 tables |
| `.contexture/modules/storage-fts5/drivers/fts5` | authored fresh: the SPI driver: the verbatim store, the reference-serialization delegation, pure SQL RRF ranking |
| `.contexture/modules/storage-fts5/scripts/migrate` | authored fresh: bidirectional migration CLI verb |
| `.contexture/modules/storage-fts5/closer.awk` | authored fresh: the closer line parse, one home for migrate and the driver |
| `.contexture/modules/storage-fts5/db-init.sh` | authored fresh: the open path, the ordinal and version 2 upgrades, one home for migrate and the driver |
| `.contexture/modules/storage-fts5/index.sh` | authored fresh: the derived index, the migrate parsers moved to one home for migrate and the driver |
| `tests/test-driver.sh` | authored fresh: SPI compliance test runner |
| `tests/test-migration.sh` | authored fresh: round-trip bidirectional migration verification |
| `tests/run.sh` | authored fresh: named test runner over plugin test suites |
| `README.md` | authored fresh: onboarding guide and technical reference |
