# docs module: internals

The docs module ships with the docs-discipline plugin. Adoption copies this
directory to `<workspace>/.contexture/modules/docs/`; the engine discovers its
five verbs. This page is the off-path maintainer map: it is not linked from
the workspace's boot, laws, or help.

## Layout

| verb | engine |
|---|---|
| `audit` | `scripts/docs-audit.awk` |
| `check` | `scripts/docs-check.awk` |
| `query` | `scripts/docs-query.awk` |
| `nudge` | `scripts/docs-nudge.awk` |
| `gate` | self-contained; uses `scripts/docs-audit.awk` and `scripts/docs-check.awk` |
| (every verb) | `scripts/docs-io.sh`, sourced: the one door to the corpus |

- The `.awk` engines and `docs-io.sh` carry no `# summary:` line: discovery
  ignores them, they are private files, and they never appear in help.
- `gate` carries the whole close-gate logic (git aggregation, drift warnings,
  and the self-planted eight-scenario matrix); the other four verbs are thin
  wrappers over their engine: audit, check, and nudge hand it the corpus paths
  `docs-io.sh` resolved from their arguments, and query drives it with parsed
  options over the helper's paths.
- `docs-io.sh` is the only file of the module that calls a corpus method or
  composes a doc's path (the census in `tests/census.sh` holds it there). It
  asks `driver-resolver require corpus.store`, mounts the corpus with
  `corpus.mount` (the files driver answers in place with the workspace root;
  a store driver fills the scratch folder it is handed), lists it with
  `corpus.list`, and applies the display-path rule: every doc path a verb
  prints is the path the files driver prints for the same call (an explicit
  path read in place passes as the caller's own string, a repo name or a bare
  call reads `docs/<repo>/<slug>.md` inside the mount, any other doc from a
  filled mount is mapped back by exact substitution). Driver calls run from
  the workspace root with stdin from `/dev/null`; scratch lives under
  `.contexture/tmp` and is removed on exit.
- The nudge's unit form reads the active task through `ctx session task list
  <unit> --status=progress` and `ctx session resolve <unit> task#<slug>` (the
  text view of task show drops REFS, which the engine scores); the
  backlog-file form refuses a path inside the sessions drawer.
- The verb scripts carry the `# summary:`/`# usage:`/`# help:` declarations;
  `ctx docs help` and `ctx docs help <verb>` render them. Help is
  engine-owned: a sole `help` argument refuses with a pointer, never prints
  help text.
- A bare `check` or `nudge` refuses loudly instead of reading standard input
  as an empty corpus; a bare `audit` reads the whole corpus through the
  driver.

## Workspace root

The instruments resolve the workspace root in this order:

1. `DOCS_WORKSPACE_ROOT` (explicit override);
2. `CTX_ROOT` (exported by the engine at dispatch);
3. standalone: walk up from the script to the `.contexture` drawer's parent.

`docs-io.sh` resolves it once for every verb and hands the same root to the
storage driver (as its cwd and `CTX_ROOT`), so the corpus the driver serves
and the root the verb reports agree. The gate's git aggregation reads from
that root; the corpus reads go through the driver (under the files driver the
corpus is `<root>/docs/<repo>/<slug>.md`). `DOCS_PRODUCT_REPOS_DIR` (default
`projects/`) selects the multi-repo product directory.

## Grammar and sample

- The corpus grammar: `.contexture/templates/doc.md` (adopted beside the
  module).
- The seed conventions: `docs/workspace/conventions.md` (copied by adoption).
- The plugin's `tests/sample/` corpus is reference data only: five fictional
  docs plus a demo backlog used by the nudge walk and the tests. It is never
  copied into a workspace.

## Tests

`tests/run.sh [--driver=posix|fts5]` at the plugin root stages a scratch
workspace under the workspace's `.contexture/tmp/` (made on demand; the system
temp only when it cannot be), copies the shipped core's runtime and its session
and lane modules from `base/`, this module, and the grammar template (with
`--driver=fts5`, the storage-fts5 plugin's module and `storage.driver: fts5`),
seeds `tests/sample/docs/` plus `docs/`, and drives the staging check; the
corpus reads keyed on the declared `corpus.store` (declared: the audit and the
unit-form nudge, the sample backlog seeded into a unit and compared with the
backlog-file form; not declared: every read verb's rc 2 refusal); the
single-door census (`tests/census.sh` over `tests/census-allow.txt`, with two
planted bypasses); the gate matrix; and the grammar agreement check
(`tests/grammar-agreement.awk`). `tests/captures.sh` is the capture set of the
read verbs (plan, run, compare) for the byte-identity and driver-parity
proofs. Needs: POSIX awk/sh, `base/` beside
`plugins/`, git (the gate matrix plants a local repository for the claimant
trackedness probe), and for the fts5 run sqlite3 with FTS5 (skip 77 without).

## The gate's matrix

`ctx docs gate --test-matrix` builds its fixtures with `mktemp`, plants a
local repository inside them for the claimant trackedness probe, writes
nothing outside them, and exercises the check over eight self-planted
scenarios. The default gate run aggregates the live git delta (workspace root
plus every child repository); `--drift` evaluates the incoming remote delta;
`--stdin` takes a piped name-status list.
