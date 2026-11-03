# storage-fts5 module: internals

The storage-fts5 plugin ships this driver tree; adoption installs it at the package's
declared driver part. The engine discovers no verb here: the package manifest declares
the driver, the module file retired so the engine never lists a driver as a module, and
the driver answers the storage contract. The plugin
README at `plugins/storage-fts5/README.md` is the adoption guide and reference; this page
is the off-path maintainer map.

## Layout

| piece | what it is |
|---|---|
| `schema.sql` | the schema version 5 store-only DDL: `store`, `store_changes`, `store_docs`, `store_docs_schema`, and the dual store FTS5 tables with their triggers |
| `db-init.sh` | the open path, sourced by the driver: the sqlite3 3.44 minimum, the whole schema 5 in a new or empty file, the version 5 open, and the refusal of any other version with no upgrade path |
| `drivers/fts5` | the contract 3 store-only entry point: the seven store functions, the store search, `capability`, and `storage.health` |

## The record

The unit module owns the record: its data script stores one value per artifact under the
namespace `unit`, parses and renders the canonical record text, and reaches this driver
only through the generic store. The driver never parses markdown; it keeps the bytes
opaque and derives the search documents from the module's declared search schema at write
time. The record's 35 operations, its rules, and its canonical layout are the unit
module's, not this driver's.

## The store

The generic module store serves module data only: `store` holds a namespace and key with
the value as opaque bytes, `store_changes` holds the optional generic change log (seq,
at, namespace, key, op, head, prior), and `store_docs` holds the documents the search
schema derives at write time (`store_docs_schema` stores each namespace's schema
signature). The seven data functions answer natively over those tables: `store.list` is
bytewise and pattern-filtered, `store.get` returns the raw bytes, `store.put` and
`store.delete` are one transaction with their change-log row, `store.changes` answers the
rows of the heads it is given oldest first, `store.batch` runs its whole action list in
one `BEGIN IMMEDIATE` transaction with one change row per action (all or none; the first
failure names the 1-based action and key and leaves nothing written), and `store.scan`
answers every admitted key bytewise with its raw value in base64. A refused write logs
nothing. The key rule is the posix driver's; the docs corpus reaches this store through
the docs module, and this module never parses a doc.

`store.search` answers the module search schema. `exact` is the record rule over the raw
values, computed by the storage core's shared engine on every driver. A ranked mode reads
`store_fts_prose` (Porter prose) and `store_fts_code` (Trigram code) over `store_docs`:
`hybrid` fuses them by reciprocal rank, `trigram` reads the Trigram table alone. A flat
schema writes one document per key in section `body` (the raw value for text, the declared
JSON fields for JSON); a document-set schema writes one document per entity at write time,
from the data file's document rules. A namespace whose stored schema signature differs is
re-derived whole before a ranked search, and a module with no schema ranks the generic raw
value. A mode the module does not declare or the driver does not serve refuses rc 1
`ERR_CAPABILITY_UNSUPPORTED` naming the declared modes.

## Schema and open path

The store is at schema version 5 (`PRAGMA user_version`). A new or empty database gets the
whole schema on its first write. A version 5 store opens with one read. A store at any
other version refuses every function rc 2 `ERR_STORAGE_SCHEMA` naming its version and the
way forward, is never written, and gets no backup: the plugin carries no upgrade path, so
an older store is moved aside and its record re-entered into a fresh one through the ctx
verbs.

## Tests

`plugins/storage-fts5/tests/run.sh` runs the plugin's own suite beside this module, never
the adopted copy: `test-driver.sh` runs the shared storage compliance suite through
`--driver-exec`, `test-store-compliance.sh` runs the shared store compliance suite, and
`test-store.sh` adds the store's change rows, the atomic put's rollback, the schema open
path, and the legacy tables staying untouched. `test-schema.sh` pins the version 4 lay and
the refusal of every other version, `test-version.sh` the sqlite3 3.44 guard,
`test-derive.sh` the narrowed derive against a whole rebuild, and `test-verbs.sh` one verb
sequence on posix and this driver with every view equal. Each skips 77 without sqlite3.

The upstream gate runs the whole session suite a second time on this driver
(`core:session-tests.sh:fts5`), and the docs suite runs on it when the plugin is present;
the base contract these cases hold is in `docs/the-engine.md` (The storage contract), and
the plugin's adoption and needs are in `plugins/storage-fts5/README.md`.
