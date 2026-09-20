# ast-doc-graph: AST and documentation graph setup

This folder holds an architectural setup connecting code syntax and documentation:
an automated pipeline extracting abstract syntax tree (AST) symbols and call graphs
from TypeScript source code, parsing normative rules and pitfalls from docs-discipline
corpora, and compiling both into a high-performance SQLite database. Retrieval runs
directly on system `/usr/bin/sqlite3` with zero runtime overhead, serving sub-millisecond
symbol lookups, recursive call hierarchies, contract governance checks, and full-text
search across code and prose.

## What it is

The mechanism bridges two worlds that are usually disconnected: the syntactic call
graph of source code and the behavioral rules declared in documentation. In typical
codebases, agents search code with raw grep and discover documentation by chance. With
`ast-doc-graph`, the AST extractor parses functions, methods, classes, and callsites into
structured symbols and call edges; the docs extractor parses documentation units,
contract rules, and documented pitfalls; the ingestion loader links code symbols to the
rules that govern them and the pitfalls that warn about them; and the query CLI serves
instant, token-efficient context directly to agents and developers.

| piece | what it is | lands as |
|---|---|---|
| `bin/ast-doc-index` | the unified pipeline driver: discovers sources and docs, runs extractors, compiles SQLite database | copy or run in place |
| `bin/graph-query` | the retrieval CLI: symbol definitions, callers, callees, dual FTS5 search, rules, pitfalls, stats | copy to `.contexture/scripts/` or `bin/` |
| `extractors/ts/extract-ts.sh` | the TypeScript AST extractor launcher: dynamically locates `tsx` or `node`, executes parser | copy |
| `extractors/ts/extract-ts.ts` | the TypeScript Compiler API parser: extracts symbols, object methods, call expressions, definitions | copy |
| `extractors/docs/extract-docs.sh` | the docs extractor launcher: locates runner, executes markdown corpus parser | copy |
| `extractors/docs/extract-docs.ts` | the docs-discipline corpus parser: extracts units, sources globs, contract rules, pitfalls | copy |
| `loader/index-graph.sh` | the graph database loader launcher: executes SQLite ingestion engine | copy |
| `loader/index-graph.ts` | the ingestion loader: populates tables, resolves GOVERNS, WARNS, COVERS edges, compiles FTS5 | copy |
| `schema.sql` | the SQLite relational DDL: table definitions, foreign keys, triggers, FTS5 virtual tables | copy |
| `spec.md` | the comprehensive data contract specification: JSONL schemas, edge linking rules, CTE patterns | reference |
| `verify-pilot.sh` | the automated verification test suite: validates indexing and queries against live pilot | reference |
| `README.md` | this onboarding guide and reference manual | reference |

## Architecture and invariants

The architecture is built around five non-negotiable invariants:

* Zero dependency in Contexture core: Setup files live strictly under `examples/setups/ast-doc-graph/`. No dependencies or node modules are installed in the Contexture root repository.
* Decoupled intermediate streams: Extractors emit standard line-delimited JSON (JSONL). The ingestion loader consumes intermediate JSONL streams without knowing or caring what language extractor produced them.
* Instant retrieval: Retrieval queries execute directly against system `/usr/bin/sqlite3` using prepared queries and Common Table Expressions (CTEs), eliminating Node.js or Python process startup latency.
* Cycle safety: Recursive call graph traversals enforce depth boundaries and string path tracking (`INSTR(d.path, e.target) > 0`) to guarantee termination across recursive or mutually recursive functions.
* Dual full-text search: Documentation rules and summaries are indexed with the `unicode61` tokenizer for natural language matching, while code symbols and signatures are indexed with the `trigram` tokenizer for substring and token matching.

```
+---------------------------+     +----------------------------+
| TypeScript Code (.ts/.tsx)|     | Docs-Discipline (.md)      |
+---------------------------+     +----------------------------+
              |                                  |
              v                                  v
     [extract-ts.sh]                    [extract-docs.sh]
              |                                  |
              +----------------+-----------------+
                               |
                               v
                    Intermediate JSONL Streams
                  * symbols.jsonl   * docs.jsonl
                  * edges.jsonl     * rules.jsonl
                                    * pitfalls.jsonl
                               |
                               v
                     [index-graph.sh]
                               |
                               v
                     SQLite Database (graph.db)
                  * Relational tables (symbols, edges, docs, rules, pitfalls)
                  * Dual FTS5 virtual tables (fts_symbols, fts_docs)
                  * Inferred edges (GOVERNS, WARNS, COVERS)
                               |
                               v
                      [graph-query CLI]
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
         AI Coding Agents            Human Developers
```

### Relational Schema and Edge Resolution

The SQLite database schema (`schema.sql`) defines five primary relational tables:
`symbols`, `edges`, `docs`, `rules`, and `pitfalls`.

During database ingestion, the loader reads the raw syntactic edges emitted by the
AST extractor (`CALLS`, `DEFINES`) and computes three categories of semantic governance
edges:

1. `GOVERNS`: Established between a contract rule and a code symbol when the rule evidence references the symbol's qualified name (`qname`), or bare name disambiguated by the parent document's `sources` globs.
2. `WARNS`: Established between a documented pitfall and a code symbol when the pitfall evidence references the symbol, alerting agents to known failure modes during edits.
3. `COVERS`: Established between a documentation unit and both the source files and the code symbols matching the unit's `sources` globs.

## Assess

Before adopting `ast-doc-graph` in a repository, answer these questions:

* Language and toolchain: Does the repository contain TypeScript (`.ts`, `.tsx`) files, and is `typescript` installed in `node_modules` or available via `tsx` or Node 22+?
* Documentation discipline: Does the repository follow the Contexture docs-discipline format (typed `@doc` blocks with `@contract` rules and `@pitfalls` in `docs/`)?
* Source directory layout: Where do primary business logic, services, and core models live (`src/`, `backend/`, `packages/`, etc.)?
* System SQLite: Is `/usr/bin/sqlite3` available with FTS5 support (standard on macOS and modern Linux distributions)?
* Exclusion boundaries: Which directories should be skipped during source discovery (`node_modules`, `dist`, `build`, `archive`, test directories)?

## Propose

When proposing `ast-doc-graph` adoption to the repository maintainer:

* Present the proposed destination for the setup tools (for example, `.contexture/scripts/` or `tools/ast-doc-graph/`).
* Name the target source directories to index (for example, `backend/` or `src/`).
* Explain the database storage strategy: `graph.db` generated locally or in CI, added to `.gitignore` to avoid repository bloat.
* Highlight the agent retrieval gains: sub-millisecond call hierarchy navigation and automatic rule surfacing without speculative grep sweeps.

## Execute

### Step 1: Copy Tools into Target Repository

Copy the `ast-doc-graph` setup bundle into the repository:

```sh
mkdir -p <repo-root>/.contexture/setups/ast-doc-graph
cp -R examples/setups/ast-doc-graph/* <repo-root>/.contexture/setups/ast-doc-graph/
```

Optionally symlink or copy `ast-doc-index` and `graph-query` into your binary path or `.contexture/scripts/`:

```sh
mkdir -p <repo-root>/.contexture/scripts
cp examples/setups/ast-doc-graph/bin/graph-query <repo-root>/.contexture/scripts/
cp examples/setups/ast-doc-graph/bin/ast-doc-index <repo-root>/.contexture/scripts/
chmod +x <repo-root>/.contexture/scripts/graph-query <repo-root>/.contexture/scripts/ast-doc-index
```

### Step 2: Update Git Ignore Rules

Add the compiled database and intermediate cache directories to `.gitignore`:

```text
# AST and documentation graph artifacts
graph.db
graph.db-journal
graph.db-wal
graph.db-shm
.contexture/cache/ast-doc-graph/
```

### Step 3: Run Initial Indexing

Execute the unified driver to index the codebase in one pass:

```sh
<repo-root>/.contexture/scripts/ast-doc-index --repo-root . --clean
```

The driver discovers TypeScript files and documentation units, runs the extractors,
and compiles `graph.db` in the repository root.

## Verify

Verify the generated database using `graph-query`:

```sh
# 1. Verify entity counts and database integrity
.contexture/scripts/graph-query stats --db ./graph.db

# 2. Inspect a known symbol definition and its governing rules
.contexture/scripts/graph-query symbol MyService.myMethod --db ./graph.db

# 3. Traverse upstream callers
.contexture/scripts/graph-query callers MyService.myMethod --depth 3 --db ./graph.db

# 4. Search documentation and symbols via FTS5
.contexture/scripts/graph-query search "session timeout" --db ./graph.db
```

Expected output: `stats` displays non-zero counts for symbols, edges, docs, and rules;
`symbol` outputs definition locations, callers, callees, and governing rules; `search`
ranks matching doc rules and symbols with highlighted match snippets.

## Daily use

`graph-query` provides seven primary subcommands designed for compact agent inspection:

### 1. Symbol Inspection (`symbol`)

Displays symbol definition coordinates, callers, callees, governing documentation units,
contract rules, and associated pitfalls:

```sh
graph-query symbol CascadeCore.startSession
```

```text
@symbol CascadeCore.startSession
  ID: sym:backend/core/cascadeCore.ts:CascadeCore.startSession
  KIND: method
  LOCATION: backend/core/cascadeCore.ts:38-77
  SIGNATURE: (userFog: number, episodeId: string, episode: Episode | undefined) => { success: boolean; sessionState?: SessionState; error?: string }

@callers (depth: 5)
  [1] SessionService.startSession (backend/services/sessionService.ts:53)

@callees (depth: 5)
  [1] Date.now

@governing_docs
  doc: doc:toisto:cascade-protocol (capability, repo: toisto)
    SUMMARY: The learning-loop phase machine and its phase UIs...

@governing_rules
  rule: rule:cascade-protocol:startsession-rejects-gym-sessions-with-l (doc: doc:toisto:cascade-protocol)
    STATEMENT: startSession rejects gym sessions with LOCKED_FOG when userFog >= 100; tuning sessions bypass the lock.

@associated_pitfalls
  none
```

### 2. Upstream Callers (`callers`)

Executes a cycle-safe recursive CTE query returning all upstream callers up to depth N:

```sh
graph-query callers CascadeCore.startSession --depth 3
```

```text
@callers CascadeCore.startSession (depth: 3)
  [1] SessionService.startSession (backend/services/sessionService.ts:53)
```

### 3. Downstream Callees (`callees`)

Recursively traverses functions and methods invoked by the target symbol:

```sh
graph-query callees CascadeCore.calculateLevenshtein --depth 2
```

```text
@callees CascadeCore.calculateLevenshtein (depth: 2)
  [1] Math.min
  [1] a.charAt
  [1] b.charAt
```

### 4. Dual Full-Text Search (`search`)

Searches documentation units, contract rules, pitfalls, and code symbols simultaneously.
Documentation matches use BM25 ranking; symbol matches use trigram fuzzy matching:

```sh
graph-query search "locked fog"
```

```text
@search_results (query: "locked fog")

@doc_matches
  [rule] rule:cascade-protocol:missing-lessonid-or-a-load-error-redirec (doc: doc:toisto:cascade-protocol, score: -9.364)
    TITLE: Missing lessonId or a load error redirects home with a state error key...
    SNIPPET: ...no id -> invalidEpisode, <<LOCKED>>_<<FOG>> -> <<lockedFog>>...
  [rule] rule:cascade-protocol:startsession-rejects-gym-sessions-with-l (doc: doc:toisto:cascade-protocol, score: -7.522)
    TITLE: startSession rejects gym sessions with LOCKED_FOG when userFog >= 100...
    SNIPPET: startSession rejects gym sessions with <<LOCKED>>_<<FOG>>...
    LINKED_SYMBOLS: CascadeCore.startSession

@symbol_matches
  none
```

### 5. Contract Rules Inspection (`rules`)

Surfaces all normative contract rules linked to the symbol:

```sh
graph-query rules CascadeCore.getNextPhase
```

```text
@rules CascadeCore.getNextPhase
  rule: rule:cascade-protocol:getnextphase-is-deterministic (doc: doc:toisto:cascade-protocol)
    STATEMENT: getNextPhase is deterministic: imprint->constructor->verification...
    DETAIL: The function is pure and exported from the core; the store drives it per phase completion.
```

### 6. Pitfalls Inspection (`pitfalls`)

Surfaces documented hazards, anti-patterns, and drift risks associated with the symbol:

```sh
graph-query pitfalls CascadeCore.calculateLevenshtein
```

```text
@pitfalls CascadeCore.calculateLevenshtein
  pitfall: pitfall:cascade-protocol:p1 [severity: medium, type: drift-risk] (doc: doc:toisto:cascade-protocol)
    STATEMENT: Text normalization and Levenshtein distance exist twice: once in CascadeCore and once in useAnswerValidation
    TRIGGER: Changing the normalization rules or typo tolerance in only one of the two implementations
```

### 7. Database Statistics (`stats`)

Outputs aggregate entity and relationship counts:

```sh
graph-query stats
```

```text
@graph_stats
  DATABASE: /Users/ahmetegesel/Projects/bilingo-mvp/graph.db
  SYMBOLS: 156
  EDGES: 798
    CALLS: 336
    COVERS: 211
    DEFINES: 156
    GOVERNS: 62
    WARNS: 33
  DOCS: 17
  RULES: 213
  PITFALLS: 69
```

## Limits and status

* Static call graph approximation: The AST extractor identifies direct invocations, method calls on identifiers, and property access calls. Dynamic calls (`obj[fnName]()`), indirect callback dispatches, and heavily polymorphic reflection are not statically resolvable.
* TypeScript Compiler API resolution: The extractor dynamically searches for `typescript` in target project `node_modules` or parent directories. If `typescript` is absent, the launcher attempts execution via Node 22+ with `--experimental-strip-types`.
* Documentation grammar compliance: The docs extractor parses documents adhering to `.contexture/templates/doc.md`. Documents lacking typed headers (`@doc <kind> <id>`) are skipped during rule extraction.
* Rebuild lifecycle: The setup currently operates as a full-rebuild batch indexer. Incremental single-file delta indexing is planned for future iterations.
* Zero em-dash and zero spaced hyphen compliance: In accordance with Contexture repository typography laws, all authored tools, scripts, and documentation strictly avoid em-dashes and spaced hyphens.

## Try it

Run the full pipeline against the live pilot repository:

```sh
# 1. Run pipeline driver on target repository
examples/setups/ast-doc-graph/bin/ast-doc-index \
  --repo-root /Users/ahmetegesel/Projects/bilingo-mvp \
  --src-dir backend \
  --db /tmp/pilot-test.db \
  --clean

# 2. Query symbol definition, caller, and governing rules
examples/setups/ast-doc-graph/bin/graph-query symbol CascadeCore.startSession --db /tmp/pilot-test.db

# 3. Query upstream callers with depth bounding
examples/setups/ast-doc-graph/bin/graph-query callers CascadeCore.startSession --depth 3 --db /tmp/pilot-test.db

# 4. Search documentation corpus via FTS5
examples/setups/ast-doc-graph/bin/graph-query search "locked fog" --db /tmp/pilot-test.db

# 5. Display aggregate statistics
examples/setups/ast-doc-graph/bin/graph-query stats --db /tmp/pilot-test.db
```

Output from step 1:
```text
@graph_loaded
  DATABASE: /tmp/pilot-test.db
  SYMBOLS: 156
  EDGES: 798
    CALLS: 336
    COVERS: 211
    DEFINES: 156
    GOVERNS: 62
    WARNS: 33
  DOCS: 17
  RULES: 213
  PITFALLS: 69
```

## Files in this bundle (provenance)

| file | provenance |
|---|---|
| `bin/ast-doc-index` | authored fresh: unified bash pipeline driver coordinating discovery, AST extraction, doc extraction, and SQLite compilation |
| `bin/graph-query` | authored fresh: zero-dependency bash retrieval CLI wrapping system `/usr/bin/sqlite3` with CTEs and FTS5 search |
| `extractors/ts/extract-ts.sh` | authored fresh: launcher resolving project-local `tsx` or Node with fallback search paths |
| `extractors/ts/extract-ts.ts` | authored fresh: TypeScript Compiler API parser extracting symbols, object methods, call expressions, and signatures |
| `extractors/docs/extract-docs.sh` | authored fresh: launcher resolving runner for docs extractor |
| `extractors/docs/extract-docs.ts` | authored fresh: docs-discipline markdown parser extracting units, sources globs, contract rules, and pitfalls |
| `loader/index-graph.sh` | authored fresh: launcher resolving runner for database loader |
| `loader/index-graph.ts` | authored fresh: database ingestion loader building relational tables, resolving GOVERNS/WARNS/COVERS, and compiling FTS5 |
| `schema.sql` | authored fresh: relational SQLite schema and FTS5 virtual table definitions with foreign keys and trigram tokenizers |
| `spec.md` | authored fresh: data contract specification for intermediate JSONL streams, recursive CTEs, and edge linking |
| `verify-pilot.sh` | authored fresh: automated end-to-end verification script testing pilot indexing and seven core retrieval assertions |
| `README.md` | authored fresh: onboarding guide, architecture specification, and reference manual |
