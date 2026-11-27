# storage-sqlite: the SQLite storage driver plugin

The storage-sqlite plugin packages the SQLite storage driver for Contexture: a twin of the posix driver held in one SQLite database. It answers the store-only driver card of contract 4 exactly as posix does: keys and values in one table, the storage core's key and value rule, the same refusals, the shared namespace lock, all or none batches, and `exact` search alone. The store is at schema version 6, the storage format version the package manifest declares (`# format: 6`). The plugin operates directly on the system `sqlite3` CLI (3.44 or later) with zero runtime dependencies. The record's 35 operations live in the unit module's data script over this store; the driver answers `capability`, `storage.health`, the six store functions, and the exact store search. It carries no verb of its own: installing the package moves the record into it from posix and uninstalling it moves the record back (the driver package lifecycle, `docs/the-engine.md`, Moving a record between backends), and a store at any other schema version is refused, never upgraded in place, since a format change moves the record out through posix and back in.

## Adoption

Assess the repository, propose the installation to the maintainer, and execute the copy.
The plugin is adoption-gated: nothing is copied before the maintainer's verdict.

## What it is

The storage-sqlite plugin serves as a single file storage backend: the single store of the record and the module data when it is the configured driver.

1. The schema (version 6, `schema.sql`) is one table, `store` (namespace, key, value), keyed by (namespace, key) with the value as opaque bytes; the default BINARY collation makes the primary key's order bytewise, the contract's list order. Nothing else lives in the database: no change log, no derived documents, no full text index, no write time column. The record's typed tables left with contract 3; the unit module keeps the record as one value per artifact, and its data script parses and renders the canonical record text.
2. The store functions (contract 4, the six native over SQL): `store.list`, `store.get`, `store.put`, `store.delete`, `store.batch`, `store.scan`, plus the exact `store.search` entry. Each is one transaction where it writes; the batch is all or none; every connection waits up to ten seconds on a busy writer. `capability` and `storage.health` answer from the sh (the store-only card, no record family). `store.promote`, `storage.leftovers`, and `storage.sweep` are posix's alone: this driver answers its unknown function line rc 2 `ERR_CAPABILITY_UNSUPPORTED`, since one database holds no key file tree and no legacy root.
3. `store.list` answers the keys the module's data-file pattern admits in bytewise order, narrowed by an optional key prefix, filtered in one pass through the core rule file; `store.get` returns a key's raw bytes (absent rc 1 `ERR_ENTITY_NOT_FOUND`), and for two or more keys the one batched line the storage core's codec packs (an item per asked key in the asked order, an absent key marked missing), every present value written in one `sqlite3` call; `store.put` takes the raw bytes on stdin and echoes `{"namespace","key"}`; `store.delete` removes and echoes the same shape; each takes the namespace and the key alone, an extra argument refusing rc 1 as posix refuses it; `store.batch` takes an ordered action list on stdin (a `head=` line refusing as an unknown payload line) and runs it in one `BEGIN IMMEDIATE` transaction (the first failure prints `store.batch: error: action <n> (<op> '<key>'): <message> (<CODE>)` and leaves nothing written), answering `{"namespace","actions":N}`; `store.scan` answers every admitted key bytewise as `{"namespace","items":[{"key","value_b64"}]}`, every value read in one `sqlite3` call and encoded in one pass, so no read spawns a process per key.
4. The key rule is the storage core's (`store-key.awk`, read for the argument checks and the list and scan filter): exact keys, no two keys whose leading runs of segments fold onto each other under ASCII case (a put or a batch put refuses rc 1 `ERR_ENTITY_EXISTS`, checked in one pass per call under the namespace lock), the pattern filtering list and scan.
5. Search: `store.search` answers the one result shape `{namespace, query, mode, total_matches, results: [{key, entity_type, entity_id, section, snippet, score}]}`. `exact` is the storage core's shared rule over the raw stored values, the one mode the descriptor registers; any other mode refuses rc 1 `ERR_CAPABILITY_UNSUPPORTED` with posix's line, `mode '<m>' is not registered; registered modes: exact`.
6. The schema version: the whole schema 6 is laid in one transaction (`db-init.sh`) at the first open of a new or empty database file: an absent file is made by its first write (a read of an absent file makes nothing), and an existing empty file gets the schema on its first open, read or write; a store at version 6 opens with one read; a store at any other version refuses every function rc 2 `ERR_STORAGE_SCHEMA` (`the storage layer's database is at schema <v>; this driver reads 6`) and is never written, no backup made; `storage.health` reports it `error` naming both versions. A database file the driver cannot read refuses rc 2 `ERR_STORAGE_READ` (`cannot read the storage layer's database`), and an empty one it cannot lay the schema in `ERR_STORAGE_WRITE` (`cannot create the storage layer's database`), naming no folder.
7. The storage format version: the manifest's `# format: 6`, the driver's `DB_SCHEMA_VERSION`, and a fresh store's `user_version` are one number, held together by this plugin's schema test, since the manifest is package metadata the install never copies. A change of the stored format bumps all three together. The format starts at 6 so a database an earlier SQLite driver laid at schema 1 to 5 in the same default file reads as another version and refuses loudly instead of reading as current.
8. The docs corpus over the generic storage layer: the agent-facing docs live in the store table under the docs namespace, one value per doc keyed by `<repo>/<slug>` with its bytes verbatim, and the docs module reads and writes them through the store functions; it keeps its own parser and renders every view. The docs module's check and gate read git's delta here as under posix: no corpus file lives in git, so every claimant reads untracked and the reconciliation is the docs-drift flow's.
9. Moving a record: the plugin carries no migrate verb. The package install moves every namespace from posix into the database under the storage moving freeze and its uninstall moves it back, and the driver part's three hooks keep the database: `hooks/prepare` refuses a database or side file already at the location and a folder that is absent or not writable, writing nothing; `hooks/cleanup` removes the database and its `-wal` and `-shm` files a failed move made; `hooks/finish` out moves them into the run's backup or deletes them as the human answered, and in does nothing. Each reads the location through `location.sh`, the driver's own reader.

| piece | what it is | lands as |
|---|---|---|
| `manifest` | the package manifest at the plugin root: summary, version, kind driver, driver sqlite, format 6, and the driver part | reference (a driver is not a module) |
| `.contexture/extensions/storage/drivers/sqlite/schema.sql` | the schema version 6 DDL: the one `store` table of keys and values | install (driver part) |
| `.contexture/extensions/storage/drivers/sqlite/driver` | the driver executable: the contract 4 store-only entry point (capability, storage.health, the six store functions, the exact store search); reads `storage.database` and legacy `session.storage.database` via the shared `config-lib` reader | install (driver part) |
| `.contexture/extensions/storage/drivers/sqlite/config` | the driver configuration schema (`database: optional path`, omitting the default database path so schema views stay path-free) | install (driver part) |
| `.contexture/extensions/storage/drivers/sqlite/db-init.sh` | the database open path: the sqlite3 3.44 minimum, the fresh schema 6 in a new or empty file, the version 6 open, the refusal of any other version, the unreadable and the unwritable open refusals naming no folder, the per-connection busy timeout | install (driver part) |
| `.contexture/extensions/storage/drivers/sqlite/location.sh` | the database location reader the driver and its hooks share: `storage.database` (and its legacy reads), else the drawer default; no environment variable places the database | install (driver part) |
| `.contexture/extensions/storage/drivers/sqlite/hooks/{prepare,finish,cleanup}` | the driver hooks the package installer runs around a move: prepare refuses an existing database or an unusable folder, finish out backs the database up or deletes it, cleanup removes what a failed move made | install (driver part) |
| `hooks/probe` | the readiness probe: rc 0 when `sqlite3` 3.44 or later is on PATH, rc 1 naming the missing binary or the version found | reference (run by `ctx package catalog` and `info`) |
| `tests/sqlite-schema.test.ts` | the schema (vitest project `storage-sqlite`): the one table and its three columns laid at version 6 in an absent or empty file with no backup, the manifest's format, the driver's schema version, and a fresh store's version one number, a read leaving a version 6 store byte for byte, a version 5, 0, or 7 file refusing get, list, and put naming both versions with the file untouched and no backup, the health over every database state with no detail naming a folder, the open refusals naming no folder, and the location settings (`storage.database` relative or absolute, the legacy reads, the retired location variable set to another file changing nothing (every read and write keeps to the configured database), a read of an absent database making nothing) | reference |
| `tests/sqlite-version.test.ts` | the sqlite3 3.44 guard and the readiness probe's three answers under a fake sqlite3 (itself null-checked) | reference |
| `tests/sqlite-store.test.ts` | the store on this driver beyond the shared contract: planted rows never listed, scanned, or searched, the zero-length blob, every byte value and padding length scanned as the core encoder writes them, a value of 2 MiB and one byte scanned in time linear in its size, a get whose value read fails printing its one refusal line, a ranked mode and the retired stamps refused with posix's lines, the posix-only functions answering the unknown function line, the process count of list, scan, and search the same over 3 and 40 keys, and the put and the batch rolled back whole by a planted trigger | reference |
| `README.md` | this onboarding guide and reference manual | reference |

## Architecture and invariants

* Zero runtime dependencies: all operations execute through host `sqlite3` with zero compilation and zero Node.js or Python runtime requirements.
* A posix twin: the storage core's differential behavior test reads this driver the same as posix on every step, and its health answers keep the contract's shape.
* Concurrency and WAL mode: the database runs in `PRAGMA journal_mode = WAL;` and every connection waits up to ten seconds for a busy writer (`sqlite3 -cmd ".timeout 10000"`); every write also holds the namespace store lock posix takes (`.contexture/tmp/locks/store-<namespace>.lock` while the drawer's scratch folder is writable, else under the per-user `contexture-<user>` folder in the system temp), so both drivers meet one lock, and `storage.health <namespace>` reports `locked` in place of `ok` while a writer holds it. An interrupted function (HUP, INT, TERM) removes its scratch and releases the lock it holds through its exit cleanup (an open transaction rolls back with its connection); the copy of a put's, a batch's, or a search's stdin runs in the background under the wait builtin, so a signal ends the call at once even while the caller still holds stdin open. A SIGKILL leaves the lock folder, but it carries its holder pid, so a waiter removes a lock whose pid is gone and proceeds while a live holder still refuses `ERR_STORAGE_LOCKED` after 600 polls 0.1 s apart (60 s of sleep).
* No markdown in the store: the store holds module-owned bytes opaquely and never parses them; no function reads markdown or calls another driver, and no driver function moves a record in or out: the move is the core's, through the store functions.
* Zero em-dash and zero spaced hyphen compliance: all documentation, scripts, and error diagnostics avoid em-dashes and spaced hyphens.

## Assess

Before adopting `storage-sqlite` in a repository, verify:

* SQLite CLI availability: `sqlite3` on PATH at version 3.44 or later (below it every function refuses rc 2 `ERR_DRIVER_NOT_FOUND` naming the version found, and `storage.health`, which `ctx unit diagnose` prints, reports `error` naming it); `ctx package info storage-sqlite` runs the probe.
* An older store: a database an earlier SQLite driver wrote at the same place is refused naming its schema version; move it aside, since the driver lays a fresh store in its place only once the path holds no file or an empty one.
* Workspace storage configuration: the database lives at the drawer default `.contexture/sessions.db`, or at the `storage.database` setting, the one way to place it (a relative value resolved against the workspace root; set it at install with `--driver-config=database=<path>`; inspect declared keys via `ctx store config schema` and current values via `ctx store config get database`; `ctx store config set database` and `unset database` refuse a change while the database holds a record, so a relocation is an uninstall, then an install with the new setting; with a transitional read-only fallback for `session.storage.database` and `.contexture/storage.conf`).
* The move: the install copies every namespace from posix into the database and verifies it before it switches `storage.driver`, every write refusing meanwhile, and leaves the old posix copy backed up or deleted on the human's answer (`--backup-old` or `--delete-old`; with neither and no terminal it refuses naming both, so the agent relays the question); a fresh workspace whose posix lists nothing needs no answer. A corpus tracked in git moves only from a committed state, and the store is a single-machine store: a team sharing its corpus through git keeps the posix driver.

## Propose

* Present the destination: the package installs its driver at `.contexture/extensions/storage/drivers/sqlite/`.
* Explain the concurrency: WAL mode with every connection waiting on a busy writer; the search is `exact` alone, as on posix.
* Confirm the move: the record moves in at the install and back into posix at the uninstall, and the old copy's backup or delete is the human's answer, relayed, never defaulted.

## Execute

### Step 1: Install the Package

Install the driver into the extension root, on the maintainer's go at the act, with the human's answer for the old posix copy:

```sh
.contexture/ctx package install storage-sqlite --backup-old   # or --delete-old; --driver-config=database=<path> names another location
```

The installer overlays the package's driver part at `.contexture/extensions/storage/drivers/sqlite/` (the executable named `driver` with `schema.sql`, `db-init.sh`, `location.sh`, `config`, `hooks/`, and its `README.md` beside it), records every installed path and the storage format under `.contexture/extensions/.state/storage-sqlite.files`, and refuses the collision classes before writing. It then runs the storage core's behavior test on the driver, writes any `--driver-config` setting, runs `hooks/prepare`, freezes every write, copies every namespace from posix into the database, switches `storage.driver: sqlite`, checks the copy through the configured driver, and backs up or deletes the old posix copy as answered, the backup named by its stamp alone (`docs/the-engine.md`, Moving a record between backends); any failure before the check passes undoes the whole install. A re-install at the same format is a guarded update: the files land only when every namespace reads the same through the new version. Every write refuses while the move runs, so install while no agent writes: measured over a record of 3428 records (37.9 MB) on one development machine, the install froze writes for about 3.3 minutes (197.1 s, about 57 ms a record) and the uninstall for about 2.4 minutes (143.5 s, about 42 ms a record); the window grows with the record.

### Step 2: Configure Git Ignore

Add the database files to `.gitignore`:

```text
# the SQLite store (the record and the corpus)
.contexture/sessions.db
.contexture/sessions.db-wal
.contexture/sessions.db-shm
```

### Step 3: The Way Back

Uninstalling the package, on the maintainer's go, moves the record back into posix and then backs up or deletes the database as the human answers:

```sh
.contexture/ctx package uninstall storage-sqlite --backup-old   # or --delete-old
```

The uninstall freezes every write, copies every namespace from the database into posix (which must list no key), unsets `storage.driver`, checks the copy through posix, and only then runs `hooks/finish`, which moves the database and its `-wal` and `-shm` files into the run's backup or deletes them, and unsets `storage.database`; a failure before the check leaves the driver installed and configured with nothing removed.

## Verify

The plugin's tests check the plugin's own copy, never the adopted one: the vitest harness stages this folder's driver into every sqlite sandbox, so an edit to either copy never passes on the other's behalf.

Verify the generic storage layer with the shared store contract tests, which hold this plugin's own copy and the posix driver to the same set, and with this plugin's own project (from `tests/`, the bun scripts):

```sh
bun run test:drivers
bun run test:storage-sqlite
```

The shared set (`tests/drivers/store-contract.test.ts` and its siblings) proves the store six, the batch, the scan, the locks, the faults, and the differential fuzzer on both drivers, and the storage core's behavior test reads this driver the same as posix; `plugins/storage-sqlite/tests` adds what only this driver keeps: the schema and its version, the sqlite3 guard and the probe, the scan encoding, the process count, and the trigger rollbacks.

The install's copy and check already compared every namespace's dump byte for byte; read the moved record back with the read verbs (`ctx unit board`, `load`, `task list`, `entry list`, `finding list`, `lane show`) and the corpus with `ctx docs query --index`. The packages project proves the lifecycle on this driver (`tests/packages/driver-sqlite.test.ts`: an install over a seeded record and its uninstall reading the same dumps, and the three hooks).

## Needs

- System `sqlite3` 3.44 or later (standard on macOS and Linux).
- No external node, python, or compiler toolchains required.

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `manifest` | the package summary, version, kind driver, driver sqlite, the storage format, and the driver part |
| `.contexture/extensions/storage/drivers/sqlite/schema.sql` | the schema version 6 store: one table of keys and values |
| `.contexture/extensions/storage/drivers/sqlite/driver` | the store-only entry point at contract 4, rebuilt from the earlier SQLite driver by removing its change log, its derived documents and full text tables, and its ranked search |
| `.contexture/extensions/storage/drivers/sqlite/db-init.sh` | the open path at version 6 (fresh schema, version 6 open, every other version refused) |
| `hooks/probe` | the readiness probe: sqlite3 on PATH at the 3.44 floor |
| `tests/sqlite-schema.test.ts`, `tests/sqlite-version.test.ts`, `tests/sqlite-store.test.ts` | the vitest project `storage-sqlite` (the shared store contract runs over this driver's own copy in `tests/drivers`) |
| `README.md` | onboarding guide and technical reference |
