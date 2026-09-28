# storage-fts5: the SQLite FTS5 storage driver plugin

The storage-fts5 plugin packages an SQLite storage driver and full-text search engine for Contexture: the record held in one database as the typed tables of the contract 2 data model (schema version 4), dual SQLite FTS5 virtual tables, and pure SQL Reciprocal Rank Fusion (RRF) search. The plugin operates directly on the system `sqlite3` CLI (3.44 or later) with zero runtime dependencies and answers every function of the storage contract (contract 2) natively in SQL. It carries no verb of its own: a record moves between this store and any other driver through the base verb `ctx session migrate`, byte for byte, and a store written by an older release reaches schema version 4 by an in-place upgrade with a backup.

## Adoption

Assess the repository, propose the installation to the maintainer, and execute the copy.
The plugin is adoption-gated: nothing is copied before the maintainer's verdict.

## What it is

The storage-fts5 plugin serves as an indexed storage backend: the single store of the record when it is the configured driver.

1. The typed record (schema version 4, `schema.sql`): the store holds the contract 2 data model as typed rows, never as markdown: `units` (the state fields, repos and ref_sessions as JSON arrays), `preambles` (the exact bytes before the first item of the backlog, the knowledge, the journal; NULL for an absent artifact), `tasks` and `findings` (each backlog or knowledge item, an opaque item among them), `journal_items` and `lane_items` (entries and anchors), `lanes` (the recipe and the report as stored, the lane journal's preamble), and the list fields in their own tables (`closers` with `closer_targets`, `item_refs`, `extra_fields`, `finding_refs`). An item is keyed by (unit, lane, pos), pos its position in its artifact; every item keeps its verbatim, the stored span exactly when it differs from the canonical span its fields render, so the store returns the same data as every other backend. Ordinal, seq, occurrence, next, and liveness are derived by the reads, never stored. The canonical renderer is SQL views over the tables (`v_state_text`, `v_task_span`, `v_finding_span`, `v_closer_line`, `v_journal_span`).
2. The dump and the derived tables: `unit.export` answers the unit's dump from the typed tables in one query (`sql/unit.export.sql`); `unit.import` validates the whole dump first (`sql/dump.check.sql`: every check of `tests/dump-check.sh`, the first defect refused rc 1 `ERR_DUMP_FORMAT` naming its line, the line the posix import names), refuses a held unit rc 1 `ERR_ENTITY_EXISTS` without `--replace`, and loads the unit whole in one transaction (`sql/dump.import.sql`), deriving in the same transaction the `lines` table (every line of the unit's searched text in the exact rule's order with the entity the head rule attributes it to) and the `search_documents` the FTS5 tables index (`sql/derive.sql`). Texts split into lines in SQL through one JSON array (`sql/split.sql`), linear in the text.
3. Dual FTS5 indexing: natural language prose is indexed with `porter unicode61 remove_diacritics 0` to preserve Turkish characters and diacritics, while exact code identifiers and symbols are indexed with `trigram` tokenization; triggers keep `search_documents` and both tables in step with the index. Each document carries its section, the artifact it came from: `state`, `backlog`, `knowledge`, `journal`, `lane_recipe`, `lane_report`, `lane_journal`.
4. Search: `search.query` returns the shape every driver shares (`{unit, query, mode, total_matches, results: [{entity_type, entity_id, section, snippet, score}]}`). Modes: `exact` (the default on every driver, `sql/fn/search.query.sql`: the `lines` table read in the exact rule's order, a line matching when it holds the query after ASCII case folding, a column-0 comment never matching, one result per entity and section with the first matching line as its snippet, every score 0, so the rows and totals equal the posix driver's), `hybrid` (RRF over both FTS5 tables, `1.0 / (60.0 + rank)`, in a two-stage CTE, `sql/fn/search.ranked.sql`) and `trigram` (the trigram table alone), their score the fused rank; `--limit` (default 20) and `--entity` apply in SQL; an empty query refuses rc 1 `ERR_INVALID_ARGUMENT`, an undeclared mode rc 1 `ERR_CAPABILITY_UNSUPPORTED` naming `exact, hybrid, trigram`.
5. The record functions (contract 2, all 40 native in SQL): one sh entry point (`drivers/fts5`) checks the argv shape with the posix driver's messages, stages the payload lines in a per-call scratch folder under the workspace's `.contexture/tmp`, and runs one sqlite3 process over the call header, `sql/lib/prelude.sql` (the payload decoded in SQL: the wire escapes are a subset of the JSON string escapes), and the function's script `sql/fn/<function>.sql`; `capability` and `storage.health` answer from the sh. Every answer is built with `json_object` in the contract key order (`sql/lib/model.sql`: the derived fields ordinal, seq, occurrence, next, the positional closure, superseded_by, and the JSON of every schema); every refusal is a row the script checks in the posix refusal order and `sql/lib/stop.sql` prints as the one stderr line. Every write runs in one transaction (`BEGIN IMMEDIATE` to `COMMIT`, whole or nothing) under the unit write lock, applies the append rule and the edit rules to the stored verbatims (`sql/lib/jappend.sql`, `tappend.sql`, `fappend.sql`, `tstatus.sql`, `idrop.sql`, `stedit.sql`, the verbatim branches of `task.update` and `finding.update` over the line toolkit `ed.sql`, `scan.sql`, `splice.sql`), reads every block field back from the text it stored as the parse rules read it (`reblock.sql`), settles each touched item's verbatim against its canonical span (`settle.sql`: the verbatim stays exactly when the stored text differs), and rebuilds the unit's derived search rows (`derive.sql`) before it commits; its answer prints only after the commit. Every connection waits up to ten seconds on a busy writer (`.timeout`, set per connection because `busy_timeout` never persists); a read never creates the database, and `storage.health` reports `degraded` until a unit is stored.
6. Moving a record: the plugin carries no migrate verb (the v0.54.0 `ctx storage-fts5 migrate` retired with its `scripts/migrate`, `index.sh`, and `closer.awk`); the base verb `ctx session migrate --from=<driver> --to=<driver> [--unit=<unit>] [--replace] [--corpus] [--prune]` moves a record between this store and any other driver through the neutral dump: per unit the source's `unit.export` and this driver's `unit.import` (or the reverse), each unit atomic, so no backend reads another's format. A unit the target holds refuses rc 1 `ERR_ENTITY_EXISTS` unless `--replace`, which swaps it whole (on this store in one transaction); a dump carries the record only, so files a posix unit folder holds beside its artifacts never travel (the verb warns with their count) and an import into posix with `--replace` leaves them untouched. The fts5 export of an imported unit equals the posix export of the same unit, and posix to fts5 to posix reproduces every artifact byte for byte, legacy shapes included (a repeated legacy slug imports as its occurrences, never renamed; strictness applies to new writes only). `--corpus` also moves every doc through the corpus methods of both drivers (the bare form moves the units alone): each doc is read and checked before any write (a doc whose `@doc` slug differs from its name refuses), then written with `corpus.write`, so on this store each doc lands with a change-log row stamped with the head `none` (never inside a window `ctx docs changes` reads, which is keyed on the git HEAD); a target holding docs the source lacks refuses unless `--prune` removes them, in either direction; an empty source leaves the target corpus as is and says so; a files corpus tracked in git refuses while any of its repo folders carries uncommitted changes, and after a clean move into the store the git steps print (remove the folders from the index, ignore them, delete the working files, set the driver), never run; only docs at `docs/<repo>/<slug>.md` count, never a guide at `docs/<name>.md`. The configured `storage.driver` is never read for the pair and never edited. A store written by an older release is not migrated but upgraded in place (item 7).
7. In-place upgrades (`db-init.sh`, `upgrade/`): a fresh database starts at version 4; a store below version 4 upgrades on its first open, under a lock folder beside it (`<db>.upgrade.lock`, the version read again once held, so a second opener finds it done). First the file is copied to `<db>.v<old>.bak` (its `-wal` file to `<db>.v<old>.bak-wal` when it holds pages), never over an existing backup (the next free `<db>.v<old>.bak.<n>` is taken). Then the steps v0.54.0 shipped climb it to version 3, each in one transaction over the version 3 schema (`upgrade/schema-v3.sql`): a database created before the ordinal key is rebuilt, every row and id kept; one created before the artifacts table gains it, every unit's artifacts seeded from its rows by the legacy serialization; one below version 3 gains the corpus tables. Then one transaction reaches version 4: every held unit's version 3 text (a unit holding a state artifact; its lanes the lanes rows and the lanes its artifacts name, a lane without any artifact kept as a lane with null documents) is read by the one-time upgrade parser (`upgrade/parse.awk`, the only reader of markdown in the plugin, following the parse rules of docs/the-engine.md) into the neutral dump, every dump is validated, the version 3 tables go, and every dump loads through the import; a failure anywhere leaves the store at version 3 and the call exits 2 with one stderr line. A store above version 4 refuses rc 2 `ERR_STORAGE_SCHEMA` (`the store is at schema <v>; this driver reads 4`) and stays untouched. Proven on a copy of a version 0 dogfood database and on a version 3 store built by v0.54.0 from 38 real units: every unit's export equals the posix export of the version 3 text, the backup equals the pre-upgrade file, and a second open changes nothing.
8. The corpus store (`corpus.store` and `corpus.changelog`): the agent-facing docs beside the record, one `docs` row per doc keyed by (repo, slug) with its text verbatim; the corpus is no unit, so no cascade reaches it, and no doc is indexed for search (the docs verbs keep their own corpus search). `corpus.list` orders by the canonical address `docs/<repo>/<slug>.md` bytewise, as a C-locale glob of files would; `corpus.mount` fills the empty folder it is handed (an empty store mounts an empty docs folder) and prints it; `corpus.read`, `corpus.write`, `corpus.remove` keep the posix driver's keys, flags, messages, and exit tiers, the case rule included: a write whose key folds onto another doc's key under ASCII case (a slug of the same repo, or the repo itself) refuses rc 1 `ERR_ENTITY_EXISTS` with nothing stored, although the table could hold both, since a mount onto a case-insensitive filesystem would fold them into one file; every lookup is by the exact key, so a case twin of a stored key reads, removes, lists, and mounts as absent (rc 1 `ERR_ENTITY_NOT_FOUND`), as the posix driver answers it on any filesystem. Every write and remove lands its change-log row in `doc_changes` inside the same transaction as the doc row (`BEGIN IMMEDIATE` and `COMMIT`): the op and the git HEAD the verb passed, and `prior`, the doc's state before the change (`absent` or `present`), so a window of rows yields each doc's net status. `corpus.changes` returns the rows of the heads it is given on stdin, oldest first, one line each: `<seq> TAB <time> TAB <op> TAB <repo>/<slug> TAB <head> TAB <prior>`.

| piece | what it is | lands as |
|---|---|---|
| `.contexture/modules/storage-fts5/module` | the module summary line | copy |
| `.contexture/modules/storage-fts5/schema.sql` | the schema version 4 DDL: the typed tables, the canonical renderer views, the derived search tables with the dual FTS5 virtual tables and their triggers, and the corpus tables | copy |
| `.contexture/modules/storage-fts5/sql/` | the SQL beside the driver: `fn/` one script per record function, `lib/` the pieces they share, `unit.export.sql`, the import (`dump.load.sql`, `dump.check.sql`, `dump.import.sql`), `derive.sql`, `split.sql` | copy |
| `.contexture/modules/storage-fts5/upgrade/` | the in-place upgrade: `upgrade.sh` (the backup, the v0.54.0 steps to version 3, the step to version 4), `schema-v3.sql`, the one-time parser `parse.awk` | copy |
| `.contexture/modules/storage-fts5/drivers/fts5` | the driver executable: the contract 2 entry point over `sql/`, the corpus store among its methods | copy |
| `.contexture/modules/storage-fts5/db-init.sh` | the database open path: the sqlite3 3.44 minimum, the fresh schema, the upgrade on first open, the refusal above version 4, the per-connection busy timeout | copy |
| `tests/test-driver.sh` | the contract 2 compliance suite against the plugin's own driver | reference |
| `tests/test-upgrade.sh` | the upgrade from a version 3 store built from the dump fixtures: exports equal to posix, the backup, the second open, the lines table, the schema refusal | reference |
| `tests/test-dump.sh` | unit.export and unit.import over the dump fixtures, TC62's refusals, malformed dumps refused at the posix import's line | reference |
| `tests/test-session-migrate.sh` | `ctx session migrate` between posix and this driver in a workspace staged from the shipped core: one unit and every unit, `--replace`, the views equal on both drivers, legacy repeated slugs, the byte for byte round trip, `--corpus` and `--prune`, the refusals, and `ctx storage-fts5 migrate` answering an unknown verb | reference |
| `tests/test-version.sh` | the sqlite3 3.44 guard under a fake sqlite3: below it a record function refuses rc 2 naming the version and `storage.health` reports `error` naming it; at 3.44 both serve | reference |
| `tests/test-derive.sh` | the narrowed derive: a write sequence over every part of two fixture units leaves the same lines and search documents as a whole rebuild, a planted stale row read as a difference | reference |
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
* No markdown in the store: the store holds typed rows and the canonical renderer is SQL; no function reads markdown or calls another driver (no unit is written out to files for another driver to read); the one reader of markdown is the one-time upgrade parser, run only inside the upgrade of a version 3 store. Moving a record in or out goes through the neutral dump alone (`unit.export`, `unit.import`, called by `ctx session migrate`).
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
* An older store: a database written by an earlier release of this plugin upgrades in place on its first open by the new driver, copied first to `<db>.v<old>.bak` beside it (item 7); keep that backup until the upgraded store has been read back.
* Workspace storage configuration: determine whether the database lives at default `.contexture/sessions.db` or a custom path configured in `.contexture/config` (`storage.database`) or `.contexture/storage.conf`.
* The cutover: once `storage.driver: fts5` is configured, every verb reads and writes the database alone; import the units and the corpus first (Step 3), since a unit or a doc left in files is invisible to the fts5 store. A corpus tracked in git moves only from a committed state, and fts5 is a single-machine store: a team sharing its corpus through git keeps the posix driver.

## Propose

When proposing `storage-fts5` adoption to the repository maintainer:

* Present the destination: the plugin module copies to `.contexture/modules/storage-fts5/`.
* Explain concurrency and indexing benefits: dual FTS5 tables with automatic trigger synchronization and WAL mode concurrency.
* Highlight the ranked modes: 12-token snippets with highlight markers instead of whole session files in context (`exact`, the default on every driver, answers the first matching line).
* Confirm that the move is reversible and lossless: `ctx session migrate` moves the record in and back out byte for byte, and the posix files stay where they are until the maintainer removes them.

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
rm -f <repo-root>/.contexture/modules/storage-fts5/scripts/migrate <repo-root>/.contexture/modules/storage-fts5/index.sh <repo-root>/.contexture/modules/storage-fts5/closer.awk
rmdir <repo-root>/.contexture/modules/storage-fts5/scripts
```

### Step 2: Configure Git Ignore

Add the database files to `.gitignore`:

```text
# SQLite session database
.contexture/sessions.db
.contexture/sessions.db-wal
.contexture/sessions.db-shm
```

### Step 3: Move the Record

Import the existing POSIX session records and the doc corpus into the store (the bare form moves every unit, `--unit=<unit>` one unit, `--corpus` adds the corpus), then set the driver, the maintainer's act the verb never takes:

```sh
ctx session migrate --from=posix --to=fts5 --corpus
printf 'storage.driver: fts5\n' >> <repo-root>/.contexture/config
```

## Verify

Verify the installation against the Storage SPI compliance harness:

```sh
tests/storage-compliance.sh --driver=fts5
```

This resolves the driver through the workspace drawer, so it checks the adopted copy. The plugin suite (`plugins/storage-fts5/tests/run.sh`) checks the plugin's own copy instead: its scripts resolve the module from their own location and hand the driver to the harness by path (`--driver-exec=<path>`), so an edit to either copy never passes on the other's behalf.

Verify the move both ways (a unit the target holds refuses without `--replace`; `--replace` rewrites that unit's artifacts on the target and leaves any other file of a posix unit folder as it is):

```sh
# Export a unit back to POSIX files
ctx session migrate --from=fts5 --to=posix --unit=<unit> --replace

# Import it into the store again
ctx session migrate --from=posix --to=fts5 --unit=<unit> --replace

# The corpus: export the stored docs to files (--prune removes files the store lacks), import them back
ctx session migrate --from=fts5 --to=posix --corpus
ctx session migrate --from=posix --to=fts5 --corpus
```

The harness's corpus suite runs in full against this driver (it declares `corpus.store` and `corpus.changelog`), its changes case included; the plugin suite's `test-session-migrate` moves units and a corpus through both directions and compares every file byte for byte.

## Needs

- System `sqlite3` with FTS5, JSON, and trigram support (standard on macOS and Linux).
- No external node, python, or compiler toolchains required.

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `.contexture/modules/storage-fts5/module` | authored fresh: module summary line |
| `.contexture/modules/storage-fts5/schema.sql` | authored fresh: the schema version 4 typed tables, views, search tables, and FTS5 tables |
| `.contexture/modules/storage-fts5/sql/` | authored fresh: the export, the import, the derived tables, the line splitter |
| `.contexture/modules/storage-fts5/upgrade/upgrade.sh` | the v0.54.0 steps moved from `db-init.sh`, plus the step to version 4 authored fresh |
| `.contexture/modules/storage-fts5/upgrade/schema-v3.sql` | the v0.54.0 `schema.sql`, byte for byte |
| `.contexture/modules/storage-fts5/upgrade/parse.awk` | authored fresh: the one-time upgrade parser, grown from the v0.54.0 readings (the retired `index.sh` and `closer.awk`) to the parse rules of docs/the-engine.md |
| `tests/test-upgrade.sh` | authored fresh: the upgrade verification suite |
| `tests/test-dump.sh` | authored fresh: the export and import verification suite |
| `tests/test-session-migrate.sh` | authored fresh: the `ctx session migrate` suite, carrying every check of the retired v0.54.0 migration suite that still guards a live behavior |
| `tests/test-version.sh` | authored fresh: the sqlite3 version guard suite |
| `tests/test-derive.sh` | authored fresh: the narrowed derive against a whole rebuild |
| `.contexture/modules/storage-fts5/drivers/fts5` | authored fresh: the contract 2 entry point (the record functions native in SQL under `sql/fn/` and `sql/lib/`, pure SQL RRF ranking, the corpus store) |
| `.contexture/modules/storage-fts5/db-init.sh` | authored fresh: the open path at version 4 (its v0.54.0 upgrade steps moved to `upgrade/upgrade.sh`) |
| `tests/test-driver.sh` | authored fresh: SPI compliance test runner |
| `tests/run.sh` | authored fresh: named test runner over plugin test suites |
| `README.md` | authored fresh: onboarding guide and technical reference |
