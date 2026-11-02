# The storage core

The storage core sits beside the engine at `.contexture/storage/`. It is not a module:
the engine does not discover it, `ctx help` does not list it, and a package never writes
it. It owns the driver resolver, the generic module store contract, the module-facing
library, and the posix driver.

```text
storage/
  scripts/driver-resolver   the resolver: selection, the capability handshake, dispatch
  scripts/store-data        the private reader and validator of a module's data file
  scripts/store-search      the private exact and document-derivation search engine
  scripts/store-search.awk  the engine's parser, extractor, matcher, and SQL deriver
  scripts/store-b64         the private base64 encoder of a stored value
  scripts/library           the module-facing interface, sourced by a module's scripts
  drivers/posix/            the zero-dependency baseline driver (sh and awk)
  README.md                 this contract
```

## The store contract

The store serves module data only; the record keeps its 38 typed driver functions in
this stage. Seven data functions, plus the search entry, called through the resolver:

| function | argv | stdin | answer |
|---|---|---|---|
| `store.list` | `<namespace>` | none | `{"namespace","keys"}`: every key the module pattern admits, bytewise |
| `store.get` | `<namespace> <key>` | none | the raw bytes of the key, no JSON; absent rc 1 `ERR_ENTITY_NOT_FOUND` |
| `store.put` | `<namespace> <key> [--op=<op>] [--head=<sha\|none>]` | the raw bytes | `{"namespace","key","op"}`; atomic per key |
| `store.delete` | `<namespace> <key> [--op=<op>] [--head=<sha\|none>]` | none | `{"namespace","key","op"}` |
| `store.changes` | `<namespace>` | `head=<sha\|none>` lines | `{"namespace","changes":[...]}` oldest first |
| `store.batch` | `<namespace>` | the action lines (`action=put\|delete`, `key=<escaped>`, `head=<sha\|none>`, `value_b64=<base64>` for a put) | `{"namespace","actions":N}`; all or none |
| `store.scan` | `<namespace>` | none | `{"namespace","items":[{"key","value_b64"}]}`: every admitted key, bytewise, its raw value in base64 |
| `store.search` | `<namespace> <mode> [<limit>]` | `query=<escaped>` | `{"namespace","query","mode","total_matches","results":[{key,section,snippet,score}]}` |

Keys are exact: a key that ASCII-case-folds onto another in the namespace refuses, a
read or delete acts on the exact key alone, list is bytewise, and no key holds a blank, a
control character, a leading slash, a backslash, or a `.` or `..` segment. The module
pattern filters list and scan and refuses a key outside it. The posix mapping is
`<root>/<key><suffix>` under the workspace root, written by a same-directory temp moved
over the key under one namespace scope lock, so a put lands whole or not at all. The
batch holds that lock once, validates the whole action list against the live keys, stages
a value per put, and commits every key under one store-scope undo log; its first failure
prints `store.batch: error: action <n> (<op> '<key>'): <message> (<CODE>)`, 1-based, and
nothing is written. The scan answers the namespace's admitted keys with the raw value in
base64, no limit; the module decodes and stops after the keys it needs. The change log is
optional per namespace; a namespace declaring `changes: false`, or a driver without the
log, refuses `store.changes` rc 1 `ERR_CAPABILITY_UNSUPPORTED`.

Search answers one shape on every driver: `{"namespace","query","mode","total_matches",
"results":[{"key","section","snippet","score"}]}`. `exact` is the record rule over the raw
stored value: a line matches when the query is a substring of it after ASCII case folding,
a column-0 comment never matches, one row per entity and section, the snippet the first
matching line with its label and quote pair trimmed, every score 0. The document set comes
from the search schema: the flat form indexes one document per key (section `body`), the
document-set form derives one document per entity at write time and ranks those documents
in the fts5 store index; a module with no schema falls back to the generic raw value. A
ranked mode answers only where the configured driver declares it (fts5: `hybrid` and
`trigram`); posix declares exact alone and refuses a ranked mode by name. The driver
declares the optional `search.schema` token when it consumes a declared schema.

A module declares its data in a `data` file beside its `module` file, one `field: value`
line per field and a line starting with `#` a comment. Only `namespace` and `key` are
required; `root`, `suffix`, `changes`, and the search keys are optional:

```text
namespace: <name>
key: <segment>/<segment>            # or a final <segment...> for a variable-depth key
root: <workspace-relative folder>   # optional; default: the namespace
suffix: <suffix>                    # optional; default: empty
changes: true                       # optional; default: false
search: flat|documents              # optional; the search schema form
format: text|json                   # optional; flat only; default text
fields: <field>, <field>            # optional; flat only; the JSON fields to rank
title: <field>|key|head             # optional; flat default key, documents default head
snippet: line                       # optional; default line
modes: exact, hybrid, trigram       # optional; default exact; exact is required
document: <key-pattern> <section> <entity-type> <head-marker|->   # repeatable
```

The namespace is a lowercase token of letters, digits, dot, underscore, and hyphen; the
key pattern carries one `<name>` placeholder per slash-separated segment, and its final
segment may instead be `<name...>`, which admits one or more key segments (a module's main
and deeper keys share one pattern: `key: <unit>/<path...>` admits `unit/state` and
`unit/lanes/x/report`). The root is a workspace-relative folder inside the workspace and
defaults to the namespace; the suffix defaults to empty; `changes` is `true` or `false`
and defaults to `false`. The search form is `flat` (one document per key, section `body`;
`format`, `fields`, and `title` shape the ranked document) or `documents` (the repeated
`document` rule names the key pattern, the section, the entity type, and the optional
column-0 head marker that starts an entity; a key no rule covers stays searchable as one
generic document). The reader refuses an unknown field. The module directory beside the
data file is the owner, and a second data file declaring the same namespace refuses.

## Discovery and selection

`storage.driver` in `.contexture/config` selects the driver; `CTX_STORAGE_DRIVER`
overrides it, and the baseline is `posix`. The legacy `.contexture/storage.conf` and the
`session.storage.driver` key stay readable as transitional compatibility. The resolver
searches, in order:

1. the workspace custom drivers, `.contexture/drivers/<name>/driver` (transitional);
2. the storage core's drivers, `.contexture/storage/drivers/<name>/driver`;
3. the module-owned drivers, `.contexture/modules/*/drivers/<name>/driver` (transitional;
   the fts5 driver lives here until the module system moves it to the extension root);
4. the base mirror's core and module drivers (transitional);
5. PATH executables named `ctx-storage-<name>` (transitional).

The extension root's `storage/drivers` search arrives with the module system, and the
adoption retires the transitional tiers.

## The library

A module's script sources `.contexture/storage/scripts/library` and calls the store
through it; the module never names the driver. The library exports:

- `store_list`, `store_get`, `store_put`, `store_delete`, `store_changes`, `store_batch`,
  `store_scan`, `store_search`;
- `store_require <capability>...` and `store_has <capability>`;
- `data_get <ref>` and `data_emit <ref> <data>`.

`data_get` resolves a module reference `<module>#<symbol>`: it finds the target module's
data script at `modules/<module>/scripts/data`, runs it with `data_get <ref>`, and prints
the envelope the script emits through `data_emit`. A ref chain is bounded at 8 hops; a
repeated ref in the chain refuses as a cycle. The target data script calls
`data_emit <ref> <data>` to print one compact JSON envelope
`{"ref":"<ref>","data":<data>}`. The source write's validation of a new ref is the unit
module's later; the library is the mechanism it calls.

## Errors

A store call passes the driver's answer and refusal through unchanged; the resolver's own
`driver-resolver: ERROR: ...` line is the one shape exception. The library's ref calls
use the one-line shape `data_get: error: ref '<ref>': <message> (<CODE>)` and
`data_emit: error: ...`; the public write that calls them re-frames with its own function
name and the ref, and writes nothing.

## Transitional

The session module's `scripts/driver-resolver` is the compatibility wrapper that execs
this resolver, so the session and lane verbs, the docs module, and the plugin suites keep
their old path. The wrapper retires with the unit module. The storage module's `module`
file and its `ctx help` listing retired with this move; the core is not a module.
