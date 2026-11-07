# The storage core

The storage core sits beside the engine at `.contexture/storage/`. It is not a module:
the engine does not discover it, `ctx help` does not list it, and a package never writes
it. It owns the driver resolver, the generic module store contract, the module-facing
library, and the posix driver.

```text
storage/
  scripts/driver-resolver   the resolver: selection, the capability handshake, dispatch
  scripts/store-data        the private reader and validator of a module's data file, and its listing
  scripts/store-search      the private exact and document-derivation search engine
  scripts/store-search.awk  the engine's parser, extractor, matcher, and SQL deriver
  scripts/store-b64         the private base64 encoder of a stored value
  scripts/library           the module-facing interface, sourced by a module's scripts
  drivers/posix/            the zero-dependency baseline driver (sh and awk)
  README.md                 this contract
```

## The store contract

The store-only driver card is contract 3: the driver answers `capability` and
`storage.health <namespace>` as its own methods and the seven data functions plus the
search entry, and the record's 35 operations live in the unit module's data script over
the store. The health probes the named namespace's store, validated through `store-data`
like any store function (a missing, extra, or malformed argument refuses rc 1
`ERR_INVALID_ARGUMENT`, an undeclared namespace rc 1 `ERR_ENTITY_NOT_FOUND`, a
declaration the core cannot read rc 2 `ERR_STORAGE_READ`), by one table on both drivers:
the store not made (posix: the declared root and the declared fallback root both absent;
fts5: no database file, or a file holding no table) reads `degraded`, absent; made but
unreadable (posix: either existing root) reads `error`, absent; presence is then counted
(posix: the first key the namespace's pattern admits under its root or its fallback root,
never a stray file; fts5: the namespace's rows alone); unwritable (posix: either existing
root) reads `error` with that presence, as do the fts5 checks (another schema reads
present, a failed integrity check, an sqlite3 older than 3.44 with the store by the
file's existence); `locked` replaces `ok` whatever the presence; the detail names no
folder, and the probe prints no fallback notice.
Seven data functions and the optional promotion, called through the resolver:

| function | argv | stdin | answer |
|---|---|---|---|
| `store.list` | `<namespace> [<prefix>]` | none | `{"namespace","keys"}`: every key the module pattern admits, bytewise; the optional literal key prefix narrows it |
| `store.get` | `<namespace> <key>` | none | the raw bytes of the key, no JSON; absent rc 1 `ERR_ENTITY_NOT_FOUND` |
| `store.put` | `<namespace> <key> [--op=<op>] [--head=<sha\|none>]` | the raw bytes | `{"namespace","key","op"}`; atomic per key |
| `store.delete` | `<namespace> <key> [--op=<op>] [--head=<sha\|none>]` | none | `{"namespace","key","op"}` |
| `store.changes` | `<namespace>` | `head=<sha\|none>` lines | `{"namespace","changes":[...]}` oldest first |
| `store.batch` | `<namespace>` | the action lines (`action=put\|delete`, `key=<escaped>`, `head=<sha\|none>`, `value_b64=<base64>` for a put) | `{"namespace","actions":N}`; all or none |
| `store.scan` | `<namespace>` | none | `{"namespace","items":[{"key","value_b64"}]}`: every admitted key, bytewise, its raw value in base64 |
| `store.search` | `<namespace> <mode> [<limit>]` | `query=<escaped>` | `{"namespace","query","mode","total_matches","results":[{key,entity_type,entity_id,section,snippet,score}]}`; limit 0 answers every result |
| `store.promote` | `<namespace> <prefix>` | none | `{"namespace","prefix","state"}`: optional (the `store.promote` token); moves the prefix (whole key segments ending in a slash) from the fallback root to the root; `moved`, or `none` when the fallback holds nothing for it or none is declared; the root already holding it refuses rc 1 `ERR_ENTITY_EXISTS` |

Keys are exact: a key that ASCII-case-folds onto another in the namespace refuses, a
read or delete acts on the exact key alone, list is bytewise, and no key holds a blank, a
control character, a leading slash, a backslash, or a `.` or `..` segment. The module
pattern filters list and scan and refuses a key outside it; `store.list` takes an optional
literal bytewise key prefix (possibly ending on a slash) so a module reads its own keys
without walking the namespace. The posix mapping is
`<root>/<key><suffix>` under the workspace root, written by a same-directory temp moved
over the key under one namespace scope lock, so a put lands whole or not at all. A
namespace that declares a `fallback_root` is read from its root first, then from the
fallback: `store.get`, `store.list` (the union, each key once, the root's copy
shadowing), `store.scan`, `store.search`, and the key probe; `store.put` and
`store.batch` write the root alone, and a delete (alone or as a batch action) removes the
key from both roots, so an old value never resurfaces. A call that served a key from the
fallback and answers rc 0 prints one stderr line, `<function>: notice: namespace '<ns>'
was read from its deprecated fallback root`, naming no folder; a refusal keeps its one
line. The optional `store.promote <namespace> <prefix>` moves the prefix's folder from the
fallback to the root in one `mv` under the namespace lock (the root's parent folders made
first, a killed writer's residue moving with the folder), the card declaring the
`store.promote` token; fts5 keeps namespace and key with no root, never reads a fallback,
and does not declare it. The batch holds that lock once, validates the whole action list against the live keys, stages
a value per put, and commits every key under one store-scope undo log; its first failure
prints `store.batch: error: action <n> (<op> '<key>'): <message> (<CODE>)`, 1-based, and
nothing is written. The namespace lock (`.contexture/tmp/locks/store-<namespace>.lock`
while the drawer's scratch folder is writable, else under the per-user
`contexture-<user>` folder in the system temp, one rule for a writer and the health probe
on both drivers; the unit module's unit locks keep their own folder,
`locks/unit/`, so no unit name meets a namespace lock) carries its holder's pid: a waiter polls every 0.1 s, removes
a lock whose pid is gone at once, gives a pid-less lock ten polls of grace, and refuses a
live holder rc 2 `ERR_STORAGE_LOCKED` after 600 polls (60 s of sleep), the unit lock's
wait (the unit module's README names why and how it was sized); where `sleep` refuses a
fraction, a poll sleeps 1 s and counts as ten. A write interrupted (HUP, INT, TERM) while
it holds the lock releases it; a writer interrupted while it still waits removes nothing,
so the live holder keeps its lock and no third writer enters beside it. While a writer
holds the named namespace's lock (`store-<namespace>.lock`), `storage.health <namespace>`
reports `locked` in place of `ok` on either driver, and another namespace's lock leaves it
unlocked; a pid-less lock counts as held, a lock whose holder pid
is gone does not, since the next writer removes it. The scan answers the namespace's admitted keys with the raw value in
base64, no limit; the module decodes and stops after the keys it needs. The change log is
optional per namespace; a namespace declaring `changes: false`, or a driver without the
log, refuses `store.changes` rc 1 `ERR_CAPABILITY_UNSUPPORTED`.

Search answers one shape on every driver: `{"namespace","query","mode","total_matches",
"results":[{"key","entity_type","entity_id","section","snippet","score"}]}`. `exact` is
the record rule over the raw stored value: a line matches when the query is a substring of
it after ASCII case folding, a column-0 comment never matches, one row per entity and
section, the snippet the first matching line with its label and quote pair trimmed, every
score 0. The answer carries the entity identity the document rules derive; the flat and
generic fallbacks answer the one document with its key as the id. The exact walk collects
every match before printing, so `total_matches` counts every pair and the limit applies
after the walk, in bytewise key then line order; a limit of 0 answers every result, the
unlimited read a module uses to sort into its own text order and cap there. The searched
text is the stored value: the canonical source is the module's canonical render, which the
module writes through the store, and the core never re-renders a module's grammar (a
legacy value is searched as stored). The document set comes from the search schema: the
flat form indexes one document per key (section `body`), the document-set form derives one
document per entity at write time and ranks those documents in the fts5 store index; a
module with no schema falls back to the generic raw value. A ranked mode answers only
where the configured driver declares it (fts5: `hybrid` and `trigram`); posix declares
exact alone and refuses a ranked mode by name. The driver declares the optional
`search.schema` token when it consumes a declared schema. Posix declares the optional
tokens `store` and `store.promote`; the resolver refuses any optional token outside
`store`, `store.changelog`, `search.schema`, and `store.promote`.

## Errors

Every store function answers one compact JSON line on success. A refusal is rc 1 (the
caller's input or the module's rules) or rc 2 (storage or driver failure), nothing on
stdout, and exactly one stderr line `<function>: error: <message> (<CODE>)` over the
existing core codes. The batch names its 1-based failing action:
`store.batch: error: action <n> (<op> '<key>'): <message> (<CODE>)`; only the first failure
prints, and nothing is written. The scan uses the store's codes (a malformed namespace or
data declaration is `ERR_INVALID_ARGUMENT`, an undeclared namespace
`ERR_ENTITY_NOT_FOUND`, an unreadable key or store `ERR_STORAGE_READ`) and stages its
answer, so a read failure midway prints no partial line. The library's ref interface
re-frames a target refusal as `data_get: error: ref '<ref>': <message> (<CODE>)`; a chain
over 8 hops or a cycle refuses `ERR_INVALID_ARGUMENT`; the source write's re-frame and its
refusal before writing are the unit module's. A module may mint its own tier 1 code
(the docs module's `ERR_SCHEMA_VIOLATION` is the precedent); core codes are never
redefined. The resolver's `driver-resolver: ERROR: ...` line is the one shape exception,
and the library passes it through unchanged.

The interrupt rule: rc 0 means the write landed; after an interrupt any other exit means
check with a read before writing again.

A module declares its data in a `data` file beside its `module` file, one `field: value`
line per field and a line starting with `#` a comment. Only `namespace` and `key` are
required; `root`, `fallback_root`, `suffix`, `changes`, and the search keys are optional:

```text
namespace: <name>
key: <segment>/<segment>            # or a final <segment...> for a variable-depth key
root: <workspace-relative folder>   # optional; default: the namespace
fallback_root: <folder>             # optional; a deprecated root read after the root
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
defaults to the namespace; the fallback root, when declared, is such a folder too, neither
equal to the root nor nested with it (one inside the other), and a file store reads it
after the root and never writes it; the suffix defaults to empty; `changes` is `true` or `false`
and defaults to `false`. The search form is `flat` (one document per key, section `body`;
`format`, `fields`, and `title` shape the ranked document) or `documents` (the repeated
`document` rule names the key pattern, the section, the entity type, and the optional
column-0 head marker that starts an entity; a key no rule covers stays searchable as one
generic document). The reader refuses an unknown field. The module directory beside the
data file is the owner, and a second data file declaring the same namespace refuses.
`store-data <namespace>` answers one namespace on twelve fixed lines, then the document
rules, and never the fallback root, so a parser reading by position ignores the field;
`store-data <namespace> --with-fallback` answers the fallback root as line 13 (an empty
line when none is declared) and the rules from line 14, the form the posix driver reads;
any other second argument refuses rc 1. `store-data --list` answers every valid
declaration of both module roots, one `<namespace><TAB><root>` line each (the root the
namespace when none is declared, then `<TAB><fallback root>` when one is declared), sorted
by namespace, and leaves out a malformed declaration, a data file with no namespace, and a
doubly declared namespace, one stderr line each, rc 0 (rc 2 with no module drawer).

## Discovery and selection

`storage.driver` in `.contexture/config` selects the driver; `CTX_STORAGE_DRIVER`
overrides it, and the baseline is `posix`. The legacy `.contexture/storage.conf` and the
`session.storage.driver` key stay readable as transitional compatibility. The resolver
searches, in order:

1. the workspace custom drivers, `.contexture/drivers/<name>/driver` (transitional);
2. the storage core's drivers, `.contexture/storage/drivers/<name>/driver`;
3. the extension root's package drivers,
   `.contexture/extensions/storage/drivers/<name>/driver` (the settled home; the fts5
   driver is installed there);
4. the module-owned drivers, `.contexture/modules/*/drivers/<name>/driver` (transitional);
5. the base mirror's core, extension, and module drivers (transitional);
6. PATH executables named `ctx-storage-<name>` (transitional).

The adoption retires the transitional tiers.

## The library

A module's script sources `.contexture/storage/scripts/library` and calls the store
through it; the module never names the driver. The library exports:

- `store_list`, `store_get`, `store_put`, `store_delete`, `store_changes`, `store_batch`,
  `store_scan`, `store_search`;
- `store_promote <namespace> <prefix>`, the optional promotion (ask `store_has
  store.promote` first);
- `store_require <capability>...` and `store_has <capability>`;
- `store_roots`, the declared roots read through `store-data --list` (found beside the
  resolver the library calls, then under the drawer, then in the base mirror), never the
  driver: one `<namespace><TAB><root>` line per declared root, a fallback root on its own
  line after its root; rc 2 with one `store.roots: error:` line when no data reader
  answers;
- `data_get <ref>` and `data_emit <ref> <data>`.

`data_get` resolves a module reference `<module>#<symbol>`: it finds the target module's
data script in the workspace modules, the workspace extensions, or the base mirror of
either (`modules/<module>/scripts/data` and `extensions/modules/<module>/scripts/data`),
runs it with `data_get <ref>`, and prints the envelope the script emits through
`data_emit`. A ref chain is bounded at 8 hops; a
repeated ref in the chain refuses as a cycle. The target data script calls
`data_emit <ref> <data>` to print one compact JSON envelope
`{"ref":"<ref>","data":<data>}`. The source write's validation of a new ref is the unit
module's; the library is the mechanism it calls.

## Errors

A store call passes the driver's answer and refusal through unchanged; the resolver's own
`driver-resolver: ERROR: ...` line is the one shape exception. The library's ref calls
use the one-line shape `data_get: error: ref '<ref>': <message> (<CODE>)` and
`data_emit: error: ...`; the public write that calls them re-frames with its own function
name and the ref, and writes nothing.

## The retirements

The session module's `scripts/driver-resolver` compatibility wrapper retired with the
unit module: the unit and lane verbs and the docs module reach this resolver directly. The storage module's `module` file and its `ctx help` listing retired
with the core move; the core is not a module.
