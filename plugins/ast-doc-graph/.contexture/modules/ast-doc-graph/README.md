# ast-doc-graph module: internals

The ast-doc-graph module ships with the ast-doc-graph plugin. Adoption copies
this directory to `<workspace>/.contexture/modules/ast-doc-graph/`; the engine
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
`callees`, `rules`, `pitfalls`, `stats`) ride as arguments to the query verb.

## Pipeline

Extractors emit line-delimited JSON (JSONL: symbols, edges, docs, rules,
pitfalls); the loader consumes the streams without knowing which extractor
produced them, resolves the `GOVERNS`, `WARNS`, and `COVERS` edges, and
compiles `graph.db` (relational tables plus the dual `fts_symbols` and
`fts_docs` virtual tables). Retrieval runs directly on system `sqlite3`.

Launchers resolve their runner dynamically: a project-local `tsx`, `tsx` on
PATH, or Node with type stripping (the launchers end with
`node --experimental-strip-types`). The graph database is generated, never
shipped.

## Tests

`tests/run.sh` is the named runner. It reports each suite and exits non-zero
only on a failure:

- `tests/test-ddl.sh` applies `schema.sql` to a scratch database and proves
  the DDL, FTS5 tables, triggers, and cycle-safe CTE queries. Needs: `sqlite3`.
- `tests/verify-pilot.sh` runs the full pipeline and ten retrieval assertions
  against a pilot repository. Needs: the pilot repository (passed as the
  first argument or `AST_DOC_GRAPH_PILOT`), `sqlite3`, and a Node/tsx runner.

A suite missing a need prints `SKIP: <need>` and exits 77; the runner counts
it as skipped, never failed. Scratch databases and sandboxes live under the
workspace's `.contexture/tmp/` when that drawer is writable, the system temp
otherwise.
