# storage-fts5 module: internals

The storage-fts5 plugin ships this module; adoption copies the directory to
`<workspace>/.contexture/modules/storage-fts5/`. The engine discovers no verb here: the
module file carries the summary, and the driver answers the storage contract. The plugin
README at `plugins/storage-fts5/README.md` is the adoption guide and reference; this page
is the off-path maintainer map.

## Layout

| piece | what it is |
|---|---|
| `module` | the module summary line: the driver name, its contract, and no verbs |
| `schema.sql` | the schema version 4 DDL: the typed record tables, the canonical renderer views, the derived `lines` and `search_documents` tables with the dual FTS5 tables and their triggers, the legacy docs tables, and the generic module store's `store` and `store_changes` tables |
| `db-init.sh` | the open path, sourced by the driver: the sqlite3 3.44 minimum, the fresh schema in a new or empty file, the version 4 open that adds the module store's tables to a store created before them, and the refusal of any other version |
| `drivers/fts5` | the contract 2 entry point: the record functions' argv and payload checks, the one sqlite3 run per call over `sql/`, the descriptor, and `storage.health` |
| `sql/fn/` | one SQL script per record function; each reads the call's payload and returns the function's answer or refusal |
| `sql/lib/` | the shared pieces: the payload decoded in SQL, the refusal order, the derived fields, the answer builders (`json_object` in the contract key order), the append and find helpers, the anchor and slug rules, and the stop line |
| `sql/derive.sql` | the per-part derive of the exact `lines` and the ranked `search_documents` a write rebuilds in its transaction |
| `sql/split.sql` | the text splitter the derive uses, linear in the text |

## The record

The module answers the 38 record functions of contract 2 natively in SQL: one sqlite3 run
per call, the payload decoded in SQL, the refusal checks in the posix driver's order, and
the answer built with `json_object` in the contract key order. Every write is one
`BEGIN IMMEDIATE` transaction under the unit write lock, whole or nothing; the answer prints
only after the commit. The tables hold the typed fields the functions write, never stored
markdown: every read renders an item in the one canonical layout, so the views
(`v_state_text`, `v_task_span`, `v_finding_span`, `v_closer_line`, `v_journal_span`) are
the renderer, and liveness is positional over the closers table.

Search answers the shared result shape. `exact` reads the derived `lines` table (the one
exact rule, one row per entity and section, score 0); `hybrid` fuses the two FTS5 tables
(Porter prose and Trigram code) by reciprocal rank; `trigram` reads the Trigram table alone.
The descriptor declares `exact`, `hybrid`, and `trigram`, and every search names its mode.

## The store

The generic module store serves module data only: `store` holds a namespace and key with
the value as opaque bytes, and `store_changes` holds the optional generic change log (seq,
at, namespace, key, op, head, prior). The five functions answer natively over those tables:
`store.list` is bytewise and pattern-filtered, `store.get` returns the raw bytes, `store.put`
and `store.delete` are one transaction with their change-log row, and `store.changes` answers
the rows of the heads it is given oldest first. A refused write logs nothing. The key rule is
the posix driver's; the docs corpus reaches this store through the docs module, and this
module never parses a doc.

## Schema and open path

The store is at schema version 4 (`PRAGMA user_version`). A new or empty database gets the
whole schema on its first write. A version 4 store opens with one read, and a version 4
store created before the generic module store gains its two tables on open by idempotent
`CREATE TABLE IF NOT EXISTS` (the version stays 4). A store at any other version refuses
every function rc 2 `ERR_STORAGE_SCHEMA` naming its version and the way forward, is never
written, and gets no backup: the plugin carries no upgrade path, so an older store is moved
aside and its record re-entered into a fresh one through the ctx verbs. The legacy docs and
doc_changes tables stay untouched and unread.

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
