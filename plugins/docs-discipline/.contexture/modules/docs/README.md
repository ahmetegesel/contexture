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

- The `.awk` engines carry no `# summary:` line: discovery ignores them, they
  are private files, and they never appear in help.
- `gate` carries the whole close-gate logic (git aggregation, drift warnings,
  and the self-planted eight-scenario matrix); the other four verbs are thin
  wrappers over their engine: audit, check, and nudge exec it with the
  arguments untouched, and query drives it with parsed options.
- The verb scripts carry the `# summary:`/`# usage:`/`# help:` declarations;
  `ctx docs help` and `ctx docs help <verb>` render them. Help is
  engine-owned: a sole `help` argument refuses with a pointer, never prints
  help text.
- A bare verb invocation refuses loudly instead of reading standard input as
  an empty corpus (the corpus files are the invocation).

## Workspace root

The instruments resolve the workspace root in this order:

1. `DOCS_WORKSPACE_ROOT` (explicit override);
2. `CTX_ROOT` (exported by the engine at dispatch);
3. standalone: walk up from the script to the `.contexture` drawer's parent.

The corpus glob is `<root>/docs/*/*.md`. The gate's git aggregation, the
check's corpus read, and the query and nudge file selection all read from that
root. `DOCS_PRODUCT_REPOS_DIR` (default `projects/`) selects the multi-repo
product directory.

## Grammar and sample

- The corpus grammar: `.contexture/templates/doc.md` (adopted beside the
  module).
- The seed conventions: `docs/workspace/conventions.md` (copied by adoption).
- The plugin's `tests/sample/` corpus is reference data only: five fictional
  docs plus a demo backlog used by the nudge walk and the tests. It is never
  copied into a workspace.

## Tests

`tests/run.sh` at the plugin root stages a scratch workspace under the
workspace's `.contexture/tmp/` when it is writable (the system temp
otherwise), copies this module and the base `.contexture/ctx`, seeds
`tests/sample/docs/` plus `docs/`, and drives the audit and the gate matrix.
Needs: POSIX awk/sh and git (the gate matrix plants a local repository for
the claimant trackedness probe).

## The gate's matrix

`ctx docs gate --test-matrix` builds its fixtures with `mktemp`, plants a
local repository inside them for the claimant trackedness probe, writes
nothing outside them, and exercises the check over eight self-planted
scenarios. The default gate run aggregates the live git delta (workspace root
plus every child repository); `--drift` evaluates the incoming remote delta;
`--stdin` takes a piped name-status list.
