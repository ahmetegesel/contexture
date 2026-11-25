# fts5 driver: internals

The storage-fts5 plugin ships this driver tree; adoption installs it at the package's
declared driver part. The engine discovers no verb here: the package manifest declares
the driver, the module file retired so the engine never lists a driver as a module, and
the driver answers the storage contract. The plugin
README at `plugins/storage-fts5/README.md` is the adoption guide and reference; this page
is the off-path maintainer map.

## Layout

| piece | what it is |
|---|---|
| `schema.sql` | the schema version 5 store-only DDL: `store`, `store_changes` (written by nothing since contract 4), `store_docs`, `store_docs_schema`, and the dual store FTS5 tables with their triggers, all kept until the sqlite rebuild |
| `db-init.sh` | the open path, sourced by the driver: the sqlite3 3.44 minimum, the whole schema 5 in a new or empty file, the version 5 open, and the refusal of any other version with no upgrade path |
| `driver` | the contract 4 store-only entry point: the six store functions, the exact store search, `capability`, and `storage.health` |

## The record

The unit module owns the record: its data script stores one value per artifact under the
namespace `unit`, parses and renders the canonical record text, and reaches this driver
only through the generic store. The driver never parses markdown; it keeps the bytes
opaque. The record's 35 operations, its rules, and its canonical layout are the unit
module's, not this driver's.

## The store

The generic module store serves module data only: `store` holds a namespace and key with
the value as opaque bytes, and `store_docs` holds the documents the search schema derives
at write time (`store_docs_schema` stores each namespace's schema signature), read by no
search since contract 4 and kept with `store_changes`, which nothing writes, for the
sqlite rebuild. The six data functions answer natively over those tables: `store.list` is
bytewise and pattern-filtered, `store.get` returns the raw bytes of one key, and for two
or more keys writes every present value in one `sqlite3` call and answers the one batched
line the storage core's codec packs (an absent key marked missing), `store.put` and
`store.delete` are one transaction each and take the namespace and the key alone (an
extra argument refuses rc 1, as posix refuses it), `store.batch` runs its whole action list
in one `BEGIN IMMEDIATE` transaction (all or none; the first failure names the 1-based
action and key and leaves nothing written; a `head=` line refuses as an unknown payload
line), and `store.scan` answers every admitted key bytewise with its raw value in base64.
The key rule is the posix driver's; the docs corpus reaches this store through
the docs module, and this driver never parses a doc.

`store.search` answers `exact` alone: the record rule over the raw values, computed by the
storage core's shared engine on every driver. The descriptor registers `exact` alone as a
`{name, description}` object; any other mode refuses rc 1 `ERR_CAPABILITY_UNSUPPORTED`
with posix's line, `mode '<m>' is not registered; registered modes: exact`. The writes
still derive the documents (a flat schema one per key in section `body`, a document-set
schema one per entity, a namespace with no schema the generic raw value) and re-derive a
namespace whose stored schema signature differs, until the sqlite rebuild retires the
derivation with its tables.

## Schema and open path

The store is at schema version 5 (`PRAGMA user_version`). An absent database file is made
with the whole schema by its first write (a read of an absent file makes nothing), and an
existing empty file gets the whole schema on its first open, read or write. A version 5
store opens with one read. A store at any
other version refuses every function rc 2 `ERR_STORAGE_SCHEMA` naming its version and the
way forward, is never written, and gets no backup: the plugin carries no upgrade path, so
an older store is moved aside and its record re-entered into a fresh one through the ctx
verbs.

## Tests

The plugin's vitest project `storage-fts5` (`plugins/storage-fts5/tests`) runs on this
driver's own copy, never the adopted one: `fts5-schema.test.ts` pins schema 5 and the
refusal of every other version, `fts5-version.test.ts` the sqlite3 3.44 guard, and
`fts5-store.test.ts` the contract 4 trim (a ranked mode refused with posix's line, the
retired stamps refused, no change row written) and the trigger rollbacks. The shared store contract (`tests/drivers`) holds this copy and the posix driver
to the same set. Each skips without sqlite3 FTS5, naming the need, except in the
pre-release set (`bun run test:prerelease`), where the missing need fails the run.

The unit and lane verbs run once, on posix, in the vitest `unit-verbs` project (this
driver holds no record logic, so the store contract is its proof), and the docs-discipline
project keeps its git path cases on this driver (`plugins/docs-discipline/tests/store/`);
the base contract these cases hold is in `docs/the-engine.md` (The storage contract), and
the plugin's adoption and needs are in `plugins/storage-fts5/README.md`.
