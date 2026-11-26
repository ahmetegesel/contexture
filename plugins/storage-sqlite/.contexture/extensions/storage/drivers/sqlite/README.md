# sqlite driver: internals

The storage-sqlite plugin ships this driver tree; adoption installs it at the package's
declared driver part. The engine discovers no verb here: the package manifest declares
the driver, so the engine never lists a driver as a module, and the driver answers the
storage contract. The plugin README at `plugins/storage-sqlite/README.md` is the adoption
guide and reference; this page is the off-path maintainer map.

## Layout

| piece | what it is |
|---|---|
| `schema.sql` | the schema version 6 DDL: the one `store` table of keys and values |
| `db-init.sh` | the open path, sourced by the driver: the sqlite3 3.44 minimum, the whole schema 6 in a new or empty file, the version 6 open, and the refusal of any other version |
| `driver` | the contract 4 store-only entry point: the six store functions, the exact store search, `capability`, and `storage.health` |
| `config` | the driver configuration schema: `database: optional path` |

## The record

The unit module owns the record: its data script stores one value per artifact under the
namespace `unit`, parses and renders the canonical record text, and reaches this driver
only through the generic store. The driver never parses markdown; it keeps the bytes
opaque. The record's 35 operations, its rules, and its canonical layout are the unit
module's, not this driver's.

## The store

The generic module store serves module data only: `store` holds a namespace and key with
the value as opaque bytes, and nothing else lives in the database. The six data functions
answer natively over that table: `store.list` is bytewise and filtered by the key rule and
the module pattern in one pass, `store.get` returns the raw bytes of one key, and for two
or more keys writes every present value in one `sqlite3` call and answers the one batched
line the storage core's codec packs (an absent key marked missing), `store.put` and
`store.delete` are one transaction each under the namespace lock and take the namespace
and the key alone (an extra argument refuses rc 1, as posix refuses it), `store.batch`
runs its whole action list in one `BEGIN IMMEDIATE` transaction (all or none; the first
failure names the 1-based action and key and leaves nothing written; a `head=` line
refuses as an unknown payload line), and `store.scan` reads every key of the namespace
with its value in hex in one `sqlite3` call, then keeps the admitted keys and encodes each
value in base64 in one awk pass, so its process count never grows with the key count. The
key rule is the storage core's `store-key.awk`; the docs corpus reaches this store through
the docs module, and this driver never parses a doc.

`store.search` answers `exact` alone: one `sqlite3` call writes every value of the
namespace into the call's scratch, and the storage core's shared engine computes the
record rule over them, as on every driver. The descriptor registers `exact` alone as a
`{name, description}` object; any other mode refuses rc 1 `ERR_CAPABILITY_UNSUPPORTED`
with posix's line, `mode '<m>' is not registered; registered modes: exact`.

A put, a batch, and a search stage their stdin in the call's scratch through a background
copy the driver waits for with the wait builtin, which a trapped signal interrupts at once;
the exit cleanup kills and reaps the copy, so a hangup, interrupt, or termination ends a
direct call even while its caller still holds stdin open. Through the resolver the stdin
is the gate's finished staged file, so the copy costs one process.

## Schema and open path

The store is at schema version 6 (`PRAGMA user_version`), the storage format version the
package manifest declares (`# format: 6`). An absent database file is made with the whole
schema by its first write (a read of an absent file makes nothing), and an existing empty
file gets the whole schema on its first open, read or write. A version 6 store opens with
one read. A store at any other version refuses every function rc 2 `ERR_STORAGE_SCHEMA`
naming both versions, is never written, and gets no backup.

## Tests

The plugin's vitest project `storage-sqlite` (`plugins/storage-sqlite/tests`) runs on this
driver's own copy, never the adopted one: `sqlite-schema.test.ts` pins the one table at
schema 6, the format equality, the refusal of every other version, the health states, and
the location settings, `sqlite-version.test.ts` the sqlite3 3.44 guard and the probe, and
`sqlite-store.test.ts` the planted rows, the scan encoding, the posix refusals, the per call
process count, and the trigger rollbacks. The shared store contract (`tests/drivers`) holds
this copy and the posix driver to the same set, and the storage core's behavior test reads
it the same as posix. Each skips without sqlite3 3.44 or later, naming the need, except in
the pre-release set (`bun run test:prerelease`), where the missing need fails the run.

The unit and lane verbs run once, on posix, in the vitest `unit-verbs` project (this
driver holds no record logic, so the store contract is its proof), and the docs-discipline
project keeps its git path cases on this driver (`plugins/docs-discipline/tests/store/`);
the base contract these cases hold is in `docs/the-engine.md` (The storage contract), and
the plugin's adoption and needs are in `plugins/storage-sqlite/README.md`.
