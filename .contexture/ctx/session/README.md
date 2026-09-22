# session: off-path family map

Low-level maintainer notes for the base-shipped session family (S2 move).
Main workflow surfaces teach `ctx session` only; nothing here is linked from
boot, laws, `ctx help`, or the top README.

## Entry contract

`entry` carries the discovery header exactly:

```text
# ctx-family: session
# summary: <one line>
# ctx-subcommands: <space-separated verb list>
```

The binder (`../ctx`) discovers directories under `.contexture/ctx/`, checks
the header, and execs `entry` with the remaining argv; `session` is the
reserved-name exception the binder allows. The entry chdirs to the workspace
root, exports `CTX_SESSION_DIR` (its own absolute directory), and dispatches
one verb per call. `help`, `--help`, and `-h` print the legacy help table in
`ctx session <verb>` forms; any dash-leading argument in any position refuses
before dispatch.

## Workers (POSIX awk, beside `entry`)

| worker | serves |
| --- | --- |
| `session-active.awk` | `active` |
| `session-bootstrap.awk` | `bootstrap` |
| `session-load.awk` | `load` (both forms; composes the board via the sibling helper) |
| `session-stamp.awk` | `stamp` |
| `session-board.awk` | `board` (also the load's journal-section helper) |
| `session-audit.awk` | `audit` (also the record's close-path helper) |
| `rhythms-index.awk` | `index` |
| `session-query.awk` | `query` |
| `session-record.awk` | `append`, `amend`, `flip`, `drop`, `next`, `refs`, `close` |

`refresh` is entry-inline (no worker): it runs `session-board.awk` then
`session-audit.awk`, fires the refresh hooks, and exits with the audit rc.

## Hooks (implicit points)

Families declare hooks in their own entry header; the engine discovers and
runs them without agent invocation:

```text
# ctx-hooks: <point> <command>
# ctx-hook-mode: block
```

`<command>` is relative to the family dir (e.g. `hooks/stamp.sh`), repeatable
once per point, and may carry arguments. `# ctx-hook-mode: block` is
per-family; without it the mode is warn-continue.

The runner is the hidden, unlisted internal `ctx _hooks <point>
[<ENVNAME> <value>]...` (not in `ctx help`, not a family, not reserved).
Discovery reads family entries in name-sorted (`LC_ALL=C`) order and
declarations in file order; zero matching hooks is a silent rc=0. CWD is the
workspace root; every hook gets `CTX_HOOK_POINT` and the passed context
exported as environment.

Shipped points and their context:

| point | fired from | context |
| --- | --- | --- |
| `stamp` | `session-stamp.awk` after the journal append, before the transition print | `CTX_UNIT`, `CTX_ANCHOR` (the new anchor) |
| `task-landing` | `session-record.awk` act gate (acts `append`, `flip`, `drop`, `next`), after the act, refusals never fire | `CTX_UNIT`, `CTX_ACT`, `CTX_SLUGS` (comma-space list) |
| `close` | `session-record.awk` `do_close` end, after `CLOSED:` (the audit is separate; no refresh hooks here) | `CTX_UNIT` |
| `load-pre` | `session-load.awk` main form, after paging, before the `LOAD ...` banner (hook output prepends above everything) | `CTX_UNIT`, `CTX_LOAD_FORM=main`, `CTX_LOAD_PAGE` |
| `load-post` | `session-load.awk` main form, after the `LOAD ...` banner line | `CTX_UNIT`, `CTX_LOAD_FORM=main`, `CTX_LOAD_PAGE` |
| `refresh` | entry `refresh` verb, after board + audit | `CTX_UNIT` |

The refs form of `load` fires no load hooks, and no boot point ships. Call
sites invoke the runner one line each through `CTX_BIN` (exported by the
entry); when `CTX_BIN` is unset or not executable the workers skip hooks
silently and stay usable standalone.

Failure policy: a non-zero hook warns on stderr and the remaining hooks
still run; the point's rc is unaffected. Under `# ctx-hook-mode: block` the
first failing (or missing) hook stops the point and fails rc=1.

## Invariants

- cwd: workers resolve `.contexture/sessions/<slug>/...` from the workspace
  root; the binder chdirs there, and the entry anchors there again.
- helper resolution: `session-load.awk` (board helper) and
  `session-record.awk` (audit helper) build the sibling path from
  `CTX_SESSION_DIR` when the entry exported it, with the
  `.contexture/ctx/session` literal as fallback for direct invocation.
- byte semantics: `load` execs with `LC_ALL=C` so `length()` is
  byte-oriented on every awk (the page byte budget).
- shim: `.contexture/scripts/session.sh` is a compatibility shim
  (`exec "$dir/ctx" session "$@"`), argv and rc preserved for legacy
  callers. It is never a teaching surface; retire it only with a breaking
  change.
- reserved names: the binder reads the session verb set from this entry's
  `# ctx-subcommands` header (literal fallback when the family is absent);
  the interim `session.sh` shell-out retired with the move.
