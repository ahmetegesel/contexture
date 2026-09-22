# session: off-path module map

Low-level maintainer notes for the base-shipped session module. Main workflow
surfaces teach `ctx session` only; nothing here is linked from boot, laws,
`ctx help`, or the top README.

## Module contract

`module` carries the discovery line exactly:

```text
# summary: the session record engine: state, backlog, journal, knowledge, and their write acts
```

The engine (`.contexture/ctx`) discovers `.contexture/modules/<name>/`,
reads that summary for `ctx help`, and builds the verb table from
`scripts/*`: an extension-less file with a `# summary:` header is a verb
named by file name; `# usage:` and `# help:` lines repeat for its detail.
The engine validates the verb, chdirs to the workspace root, exports
`CTX_ROOT`, `CTX_MODULE_DIR`, `CTX_BIN`, and `LC_ALL=C`, and execs
`scripts/<verb>` with the remaining argv; streams and rc pass through.
Help is engine-owned: `ctx session help [<verb>]`, and bare `ctx session`
prints the module table rc0. There is no entry script and no shim.

## Scripts (POSIX awk, verb name = file name)

| script | serves |
| --- | --- |
| `scripts/active` | `active` |
| `scripts/bootstrap` | `bootstrap` |
| `scripts/load` | `load` (both forms; composes the board via the sibling helper) |
| `scripts/stamp` | `stamp` |
| `scripts/board` | `board` (also the load's journal-section helper) |
| `scripts/audit` | `audit` (also the record's close-path helper) |
| `scripts/index` | `index` |
| `scripts/query` | `query` |
| `scripts/refresh` | `refresh` (sandbox: board then audit then `_hooks refresh`) |
| `scripts/record` | the private engine for the seven write acts |

`scripts/record` carries no `# summary:` header, so discovery ignores it:
it is private, and the seven `sh` wrappers below exec it with the act name
as `$1`, preserving argv and rc.

| wrapper | acts |
| --- | --- |
| `scripts/append` | `append` |
| `scripts/amend` | `amend` |
| `scripts/flip` | `flip` |
| `scripts/drop` | `drop` |
| `scripts/next` | `next` |
| `scripts/refs` | `refs` |
| `scripts/close` | `close` |

`refresh` is a real script (not a wrapper): it runs `scripts/board` then
`scripts/audit` (its rc is the verb's rc), then fires the refresh hooks
through `$CTX_BIN _hooks refresh`; a failing block hook fails the verb when
the audit was clean.

## Hooks (implicit points)

The engine runs hook files declared under `modules/*/hooks/` (see the
engine header). The session module itself ships no hook files; its call
sites invoke the runner through `CTX_BIN` at:

| point | fired from | context |
| --- | --- | --- |
| `stamp` | `scripts/stamp`, after the journal append, before the transition print | `CTX_UNIT`, `CTX_ANCHOR` (the new anchor) |
| `task-landing` | `scripts/record` act gate (acts `append`, `flip`, `drop`, `next`), after the act; refusals never fire | `CTX_UNIT`, `CTX_ACT`, `CTX_SLUGS` (comma-space list) |
| `close` | `scripts/record` `do_close` end, after `CLOSED:` (the audit is separate; no refresh hooks here) | `CTX_UNIT` |
| `load-pre` | `scripts/load` main form, after paging, before the `LOAD ...` banner (hook output prepends above everything) | `CTX_UNIT`, `CTX_LOAD_FORM=main`, `CTX_LOAD_PAGE` |
| `load-post` | `scripts/load` main form, after the `LOAD ...` banner line | `CTX_UNIT`, `CTX_LOAD_FORM=main`, `CTX_LOAD_PAGE` |
| `refresh` | `scripts/refresh`, after board + audit | `CTX_UNIT` |

The refs form of `load` fires no load hooks, and no boot point ships. When
`CTX_BIN` is unset or not executable the workers skip hooks silently and
stay usable standalone.

Failure policy: a non-zero hook warns on stderr and the remaining hooks
still run; the point's rc is unaffected. A hook file carrying
`# ctx-hook-mode: block` stops the point at its first failure and fails
rc=1.

## Invariants

- cwd: workers resolve `.contexture/sessions/<slug>/...` from the workspace
  root; the engine chdirs there before dispatch.
- helper resolution: `scripts/load` (board helper) and `scripts/record`
  (audit helper) build the sibling path from `CTX_MODULE_DIR` when the
  engine exported it, with the `.contexture/modules/session` literal as
  fallback for direct invocation.
- byte semantics: the engine exports `LC_ALL=C` on dispatch, so `load`'s
  `length()` stays byte-oriented on every awk (the page byte budget).
- write safety: `record`, `bootstrap`, and `stamp` write through a
  `mktemp` same-directory temp (`<path>.XXXXXX`) plus `mv`, with cleanup
  on mv failure; concurrent writers never share a temp name.
- reserved names: the engine derives the session verb set from this
  module's `scripts/` and refuses a module shadowing one at discovery.
