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
prints the module table rc0. There is no entry script and no shim. The
names retired in v0.55.0 (`append`, `amend`, `query`, `flip`, `drop`) are
a static list in the engine: a call prints its replacement rc 1.

## Layout

```text
scripts/          the 22 verbs (sh; index alone is awk) and the private driver-resolver
lib/verb.sh       the shared verb shell: input shape checks, the payload, one storage call, the scratch folder, hooks
lib/json.awk      the one flattener: a function's JSON answer to path=value lines
lib/render.awk    the one renderer: every text view from the flattened lines
drivers/posix/    the posix storage driver (contract 2): the only code that touches the record's files
```

## Verbs and the functions they call (contract 2, docs/the-engine.md)

Every verb checks its input shape, calls exactly one storage function per
record act through `scripts/driver-resolver`, and renders the answer through
`lib/json.awk` and `lib/render.awk` (`--json` prints the answer unchanged).
No verb opens a session artifact itself.

| script | functions |
| --- | --- |
| `scripts/active` | `session.list` |
| `scripts/audit` | `session.audit` |
| `scripts/board` | `session.board` |
| `scripts/bootstrap` | `session.create` (base composes the A1 attention with its git read) |
| `scripts/close` | `session.close` (the returned audit and open tasks print as warnings) |
| `scripts/diagnose` | `capability` (the resolver's handshake read) and `storage.health` |
| `scripts/entry` | `entry.get`, `entry.list`, `entry.closure` |
| `scripts/finding` | `finding.add`, `get`, `update`, `supersede`, `drop`, `list` |
| `scripts/index` | none: reads `.contexture/rhythms/` |
| `scripts/load` | `session.load`, or `session.refload` for the refs form; base pages the rendered text |
| `scripts/migrate` | the source's `session.list` and `unit.export`, the target's `unit.import`; with `--corpus` the corpus methods of both |
| `scripts/next` | `session.next`, then `task.list` for the hook's slugs |
| `scripts/record` | `entry.record` |
| `scripts/refresh` | the board and audit verbs, then the refresh hooks (the one composite verb) |
| `scripts/refs` | `session.refs` |
| `scripts/refs-to` | `session.refs_to` |
| `scripts/reopen` | `session.reopen` |
| `scripts/resolve` | exactly one of `task.get`, `finding.get`, `entry.get`, `lane.get` by the reference's kind; base cuts a report claim |
| `scripts/search` | `search.query` |
| `scripts/stamp` | `session.stamp` |
| `scripts/task` | `task.add`, `update`, `start`, `complete`, `reopen`, `drop`, `list`, `get` |
| `scripts/units` | `session.units` |

The lane verbs (`.contexture/modules/lane/scripts/`: `create`, `record`,
`report`, `show`) source the same `lib/verb.sh` and call `lane.create`,
`lane.record`, `lane.write_report`, and `lane.get`.

`scripts/driver-resolver` carries no `# summary:` header, so discovery
ignores it: it resolves the configured driver (`CTX_STORAGE_DRIVER`, then
`.contexture/config`, then posix), runs the contract 2 handshake at dispatch
for every driver but the bundled posix one (the verdict cached under
`.contexture/tmp/driver-verdicts/`), and answers `require` and `has` for the
optional capabilities and the search modes.

## Hooks (implicit points)

The engine runs hook files declared under `modules/*/hooks/` (see the
engine header). The session module itself ships no hook files; its call
sites invoke the runner through `CTX_BIN` (`vb_hook` in `lib/verb.sh`, and
the load's own call) at:

| point | fired from | context |
| --- | --- | --- |
| `stamp` | `scripts/stamp`, after the stamp lands, before the transition print | `CTX_UNIT`, `CTX_ANCHOR` (the new anchor) |
| `task-landing` | `scripts/task` after `add`, `start`, `complete`, `reopen`, `drop` land (`update` fires none), and `scripts/next` after the pointer lands; refusals never fire | `CTX_UNIT`, `CTX_ACT` (the act), `CTX_SLUGS` (the task; for `next`, the IN_PROGRESS tasks as a comma-space list) |
| `close` | `scripts/close`, after the `CLOSED:` line (the audit is the driver's answer; no refresh hooks here) | `CTX_UNIT` |
| `load-pre` | `scripts/load` main form, after paging, before the `LOAD ...` banner (hook output prepends above everything) | `CTX_UNIT`, `CTX_LOAD_FORM=main`, `CTX_LOAD_PAGE` |
| `load-post` | `scripts/load` main form, after the `LOAD ...` banner line | `CTX_UNIT`, `CTX_LOAD_FORM=main`, `CTX_LOAD_PAGE` |
| `refresh` | `scripts/refresh`, after board + audit | `CTX_UNIT` |

The refs form of `load` fires no load hooks, and no boot point ships. When
`CTX_BIN` is unset or not executable the verbs skip hooks silently and
stay usable standalone (`sh scripts/<verb>`).

Failure policy: a non-zero hook warns on stderr and the remaining hooks
still run; the point's rc is unaffected. A hook file carrying
`# ctx-hook-mode: block` stops the point at its first failure and fails
rc=1.

## Invariants

- cwd: the verbs run from the workspace root (the engine chdirs there before
  dispatch); the posix driver finds its workspace by walking up from its
  working folder, never from `CTX_ROOT`.
- scratch: each verb makes one folder `.contexture/tmp/rec.<random>` on first
  use and removes it at exit and on HUP, INT, TERM.
- free text: every value reaches awk through the environment or a file,
  never through `awk -v`; payload values are escaped on the wire.
- byte semantics: the engine exports `LC_ALL=C` on dispatch, so `load`'s
  `length()` stays byte-oriented on every awk (the page byte budget).
- write safety (posix driver): every changed file is staged in a dot folder
  inside the sessions folder (the same filesystem) and renamed into place under the unit lock
  (`.contexture/tmp/locks/<unit>.lock`); every file a rename replaces is
  hard-linked into the stage first, so a failed rename or an interrupt
  (HUP, INT, TERM) among the renames rolls the earlier ones back and a
  failed write leaves the record whole.
- reserved names: the engine derives the session verb set from this
  module's `scripts/`, adds the retired names, and refuses a module
  shadowing one at discovery.
