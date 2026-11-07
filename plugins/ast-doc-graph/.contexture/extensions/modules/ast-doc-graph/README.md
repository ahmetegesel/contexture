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
A full load rebuilds the graph inside one transaction: it clears every table,
the search indexes first so the delete triggers find them empty, then loads
the streams, keeping the last incoming row per id, so each symbol and unit
keeps one search row and a failed load leaves the graph as it was (under
`--clean`, which removes the database first, an empty graph); the `sqlite3`
command fallback runs the same statements and stops at its first error
(`-bail`). The loader records each unit under the markdown file holding it, a
`DEFINES` edge from the file, so a delta removes a gone file's units whatever
their ids. A delta on the fallback applies the schema as well, reads the
graph whole however large, and re-links against the edges its own deletes
leave, so both branches write the same graph and print the same summary.

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
micro-sync discards the index's output on success, and on a failure (outside
a drawer, say) prints one stderr line naming the failure and the delta to
run, then answers from the graph as it stands.

Discovery (the full index, the delta scan, and the query's freshness check)
runs `find` from inside the scanned root, so the exclusion folders
(`node_modules`, `.contexture`, `tests`, `.worktrees`, and the rest) match
paths within the repository and never the folders the repository itself sits
in: a repository under a `tests/` or `.worktrees/` folder indexes like any
other. A full index hands the loader both discovery lists (`--file-list`), so
`indexed_files` holds every file it discovered, and its repository and scan
roots (`--project-root`, `--src-root`), which the loader writes as the one
row of `graph_meta`; every delta first asks the loader, read only
(`--reconcile`), which refuses rc 1 naming both roots when the delta's
repository root, or a `--src-dir` it was given, differs from the record,
hands back the recorded source root (an `S` line) for the delta's newer-than
scan, and lists the indexed files the disk lacks and the discovered files
the graph lacks inside a folder it already covers for their kind; the
driver removes the first and indexes the second with the dirty ones, skips
a named TypeScript file outside the recorded source root with a warning,
and the reconcile refuses rc 1 when every indexed file is absent under its
root. The query's freshness check reads `graph_meta` first and scans its
roots, never guessing for a graph that holds the record, and counts an
indexed file the disk lacks as dirty. A graph without the record (an
earlier release loaded it) gets the guess, counts no gone file, and has its
inline delta run with `--no-reconcile`, which keeps the reconcile's refusals
but removes and adds nothing, so only its newer files sync; the query prints
one stderr notice naming the guess and the full index that records the root.

The docs extractor reads the corpus as files: `bin/ast-doc-index` lists the
regular markdown files of the workspace's `docs/` folder (else the
repository root outside the exclusion folders) and `extractors/docs/extract-docs.ts` parses each listed
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
`integration/docs-walk`, `rebuild`, and `removed-files` prove a rule or
pitfall before any `@doc` line skipped with its one warning, a code-only
repository indexing rc 0, a repository with no docs folder walking its root
outside the exclusion folders, the full load's rebuild and its rollback, and a
removed, renamed, or moved file leaving the graph after a full run, a bare
delta, a named delta, and the query's inline delta (a unit whose id comes
from its header, a unit two files hold, thousands of removed files among
them), an old file outside a `--src-dir` graph's folders kept out;
`recorded-root` proves the recorded roots: the row a full index writes, a
database kept outside its repository answering for it, a delta against
another root refusing (on both loader branches), one given another
`--src-dir` refusing, a moved repository's notice, a `--src-dir` graph
staying inside through a bare, a named, and an inline delta, a delta given
`--no-reconcile` removing and adding nothing, and a graph without the record
keeping the guess with its one notice, its refresh never removing a path the
guessed root lacks nor counting one; `delta-jit` also proves a failed inline delta's one stderr line and the
fallback delta over a graph past 1 MB, `pipeline` one search row for a name
declared more than once. The `sqlite3` command fallback cases run with
`NODE_OPTIONS=--no-experimental-sqlite` and skip, naming the need, where the
host's node does not read it.
`static/` holds the census of the module tree: no PATH edit, no
sibling-project glob, no pre-extension-root path, and no absolute system
temp path, each with a planted null check. The tests skip, naming the
need, without sqlite3 FTS5 or without a TypeScript compiler API.
