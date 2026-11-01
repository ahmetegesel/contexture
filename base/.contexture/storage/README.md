# The storage core

The storage core sits beside the engine at `.contexture/storage/`. It is not a module:
the engine does not discover it, `ctx help` does not list it, and a package never writes
it. It owns the driver resolver, the generic module store contract, the module-facing
library, and the posix driver.

```text
storage/
  scripts/driver-resolver   the resolver: selection, the capability handshake, dispatch
  scripts/store-data        the private reader and validator of a module's data file
  scripts/library           the module-facing interface, sourced by a module's scripts
  drivers/posix/            the zero-dependency baseline driver (sh and awk)
  README.md                 this contract
```

## The store contract

The store serves module data only; the record keeps its 38 typed driver functions in
this stage. Five functions, called through the resolver:

| function | argv | stdin | answer |
|---|---|---|---|
| `store.list` | `<namespace>` | none | `{"namespace","keys"}`: every key the module pattern admits, bytewise |
| `store.get` | `<namespace> <key>` | none | the raw bytes of the key, no JSON; absent rc 1 `ERR_ENTITY_NOT_FOUND` |
| `store.put` | `<namespace> <key> [--op=<op>] [--head=<sha\|none>]` | the raw bytes | `{"namespace","key","op"}`; atomic per key |
| `store.delete` | `<namespace> <key> [--op=<op>] [--head=<sha\|none>]` | none | `{"namespace","key","op"}` |
| `store.changes` | `<namespace>` | `head=<sha\|none>` lines | `{"namespace","changes":[...]}` oldest first |

Keys are exact: a key that ASCII-case-folds onto another in the namespace refuses, a
read or delete acts on the exact key alone, list is bytewise, and no key holds a blank, a
control character, a leading slash, a backslash, or a `.` or `..` segment. The module
pattern filters list and refuses a key outside it. The posix mapping is
`<root>/<key><suffix>` under the workspace root, written by a same-directory temp moved
over the key under a per-key lock, so a put lands whole or not at all. The change log is
optional per namespace; a namespace declaring `changes: false`, or a driver without the
log, refuses `store.changes` rc 1 `ERR_CAPABILITY_UNSUPPORTED`.

A module declares its data in a `data` file beside its `module` file, one `field: value`
line per field and a line starting with `#` a comment:

```text
namespace: <name>
root: <workspace-relative folder>
suffix: <suffix>
key: <segment>/<segment>
changes: true
```

The namespace is a lowercase token of letters, digits, dot, underscore, and hyphen; the
root is a workspace-relative folder inside the workspace; the suffix is non-empty; the
key pattern carries one `<name>` placeholder per slash-separated segment; and `changes`
is `true` or `false`. The module directory beside the data file is the owner, and a
second data file declaring the same namespace refuses.

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

- `store_list`, `store_get`, `store_put`, `store_delete`, `store_changes`;
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
