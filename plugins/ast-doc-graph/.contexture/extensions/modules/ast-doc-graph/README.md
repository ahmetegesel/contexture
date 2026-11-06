# ast-doc-graph module: internals

The ast-doc-graph module ships with the ast-doc-graph plugin. The package
installer overlays this directory at
`<workspace>/.contexture/extensions/modules/ast-doc-graph/`; the engine
discovers its two verbs. This page is the off-path maintainer map: it is not
linked from the workspace's boot, laws, or help.

## Layout

| verb | engine |
|---|---|
| `index` | `bin/ast-doc-index` |
| `query` | `bin/graph-query` |

Private files (never verbs, never in help, ignored by discovery because they
do not live under `scripts/`):

- `bin/` the pipeline driver and the retrieval CLI;
- `extractors/ts/` the TypeScript AST extractor launcher and parser;
- `extractors/docs/` the docs-discipline corpus extractor launcher and parser;
- `loader/` the SQLite ingestion loader launcher and engine;
- `schema.sql` the relational DDL and FTS5 tables;
- `spec.md` the JSONL data contract specification.

The two verbs are thin wrappers: they exec their engine with the arguments
untouched. `query`'s seven subcommands (`symbol`, `search`, `callers`,
`callees`, `rules`, `pitfalls`, `stats`) ride as arguments to the query verb;
words that name none (a mistyped `symbols`) refuse rc 1 naming the known ones,
while `help` or no word at all prints the usage rc 0.

## Pipeline

Extractors emit line-delimited JSON (JSONL: symbols, edges, docs, rules,
pitfalls); the loader consumes the streams without knowing which extractor
produced them, resolves the `GOVERNS`, `WARNS`, and `COVERS` edges, and
compiles `graph.db` (relational tables plus the dual `fts_symbols` and
`fts_docs` virtual tables). Retrieval runs directly on system `sqlite3`.

`bin/ast-doc-index` runs only inside a contexture drawer: `CTX_ROOT` when the
engine dispatched it (`ctx ast-doc-graph index`, or the query's micro-sync
under `ctx ast-doc-graph query`), else the repository root when it holds a
`.contexture` folder; there is no marker file and no walk up. Outside a drawer
it refuses rc 1 before any write. The intermediate streams live in one
per-run folder made by `mktemp -d` inside `CTX_SCRATCH_ROOT` when set (never
the root itself, which a micro-sync shares with its parent verb), else inside
the drawer's `.contexture/tmp`, and a trap removes it on exit, hangup,
interrupt, and termination; a folder it cannot make refuses rc 2 naming it.
`--cache-dir` names a caller-owned folder instead, emptied only by `--clean`.
`bin/graph-query` stages no scratch and reads any database it is given; its
micro-sync discards the index's exit code and output, so outside a drawer it
answers from the graph as it stands.

Discovery (the full index, the delta scan, and the query's freshness check)
runs `find` from inside the scanned root, so the exclusion folders
(`node_modules`, `.contexture`, `tests`, `.worktrees`, and the rest) match
paths within the repository and never the folders the repository itself sits
in: a repository under a `tests/` or `.worktrees/` folder indexes like any
other.

The docs extractor reads the corpus as files: `bin/ast-doc-index` scans the
workspace's `docs/` folder and `extractors/docs/extract-docs.ts` parses each
file, never through `ctx docs` or the storage driver; a walk that finds no
markdown yields empty docs streams, never a refusal. Under the docs-discipline
files driver that folder is the corpus; under a store driver it holds none, so
the graph carries no docs, rules, or pitfalls (the code side is unaffected).
This files-only limit stands until the extraction routes through `ctx docs`.

Launchers resolve their runner dynamically: a project-local `tsx`, `tsx` on
PATH, or Node with type stripping (the launchers end with
`node --experimental-strip-types`, its experimental warnings silenced). The
caller's PATH chooses the runner: no launcher edits PATH, and each extends
the caller's `NODE_OPTIONS` with `--no-deprecation` instead of replacing it.
The TypeScript extractor also needs a TypeScript 5 or 6 compiler API
(`createSourceFile`), which no runner supplies: `resolveTypeScript` takes
`AST_DOC_GRAPH_TYPESCRIPT` alone when set (a package folder or its entry
file), else the module's own Node resolution, then each search path walked
upward (the project root, every target file, the working folder). With none
it refuses rc 1, one line per typescript found (its version and path) and
the way forward, never a stack; the driver's `set -e` stops the whole index.
Each TypeScript entry point (the two extractors and the loader) runs its CLI
only when executed as the script, so its exported helpers import without
side effects; the guard compares the module file and the executed path by
their real paths, so a module reached through a symbolic link or under a
folder whose name holds a space or a non-ASCII character still runs. The
graph database is generated, never shipped.

## Tests

The plugin's tests are the vitest project `ast-doc-graph` in
`plugins/ast-doc-graph/tests/`, run from the repository's `tests/` folder
(`bun run test:ast-doc-graph`). `unit/` applies `schema.sql` to a fresh
database seeded from `fixtures/schema-seed.sql` (the tables, the two FTS5
searches, the governance links, `busy_timeout`, `indexed_files`, and the
delete triggers and cascades), drives `bin/graph-query --no-sync` over it
(the symbol view, the cycle-safe callers and callees queries over a call cycle,
search, rules, pitfalls, stats), and imports the docs extractor and the
loader's helpers in process. `integration/` copies `fixtures/mini-repo` into a
sandbox under the workspace's `.contexture/tmp/` with `node_modules/typescript`
linked to the test tooling's TypeScript, runs the full index, then the delta
index of one file, the query's micro-sync of one dirty file, and the advisory
for three (file times set directly, never slept); it also indexes through a
module reached by a symbolic link, under a spaced folder, and under a
non-ASCII folder, runs every launcher on the node first on the caller's
PATH, and proves the drawer rule and the per-run scratch (a planted `mktemp`
records each folder made: inside the drawer's `.contexture/tmp` or
`CTX_SCRATCH_ROOT`, gone after the run), the refusals outside a drawer
(rc 1) and for a folder it cannot make (rc 2), and a caller's `--cache-dir`.
`integration/compiler-api` and `unit/extract-ts` prove the compiler API
resolution over a committed TypeScript 7 stub (`fixtures/typescript-7-stub`,
version 7.0.2, no `createSourceFile`) and the test tooling's TypeScript:
the refusal, the variable by package folder and by entry file, and the
refusal of a variable without the API; a refusal case skips, naming the
need, when a TypeScript 5 or 6 is reachable from the module or the sandbox
ancestors.
`static/` holds the census of the module tree: no PATH edit, no
sibling-project glob, no pre-extension-root path, and no absolute system
temp path, each with a planted null check. The tests skip, naming the
need, without sqlite3 FTS5 or without a TypeScript compiler API.
