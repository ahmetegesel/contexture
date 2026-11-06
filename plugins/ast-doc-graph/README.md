# ast-doc-graph: the AST and documentation graph plugin

The ast-doc-graph plugin packages an architectural setup connecting code syntax and documentation:
an automated pipeline extracting abstract syntax tree (AST) symbols and call graphs
from TypeScript source code, parsing normative rules and pitfalls from docs-discipline
corpora, and compiling both into a high-performance SQLite database. Retrieval runs
directly on system `/usr/bin/sqlite3` with zero runtime overhead, serving sub-millisecond
symbol lookups, recursive call hierarchies, contract governance checks, and full-text
search across code and prose.

## Adoption

Assess the repository, propose the install to its maintainer, then execute the copy,
the gitignore rules, and the initial indexing; the Execute section below is the walk.
The plugin is adoption-gated: nothing is copied before the maintainer's verdict.

## What it is

The mechanism bridges two worlds that are usually disconnected: the syntactic call
graph of source code and the behavioral rules declared in documentation. In typical
codebases, agents search code with raw grep and discover documentation by chance. With
`ast-doc-graph`, the AST extractor parses functions, methods, classes, and callsites into
structured symbols and call edges; the docs extractor parses documentation units,
contract rules, and documented pitfalls; the ingestion loader links code symbols to the
rules that govern them and the pitfalls that warn about them; and the retrieval CLI
serves instant, token-efficient context directly to agents and developers.

Two ctx verbs drive it: `ctx ast-doc-graph index` runs the pipeline, and
`ctx ast-doc-graph query` retrieves from the compiled graph.

| piece | what it is | lands as |
|---|---|---|
| `.contexture/extensions/modules/ast-doc-graph/module` | the module summary line | copy |
| `.contexture/extensions/modules/ast-doc-graph/scripts/index` | the indexing verb: a thin wrapper over `bin/ast-doc-index` | copy |
| `.contexture/extensions/modules/ast-doc-graph/scripts/query` | the retrieval verb: a thin wrapper over `bin/graph-query`, the seven subcommands ride as arguments | copy |
| `.contexture/extensions/modules/ast-doc-graph/bin/ast-doc-index` | the unified pipeline driver: multi-directory discovery, full and --delta incremental indexing, SQLite compilation | copy |
| `.contexture/extensions/modules/ast-doc-graph/bin/graph-query` | the retrieval CLI: zero-daemon JIT micro-sync, symbols, callers, callees, dual FTS5 search, rules, pitfalls, stats | copy |
| `.contexture/extensions/modules/ast-doc-graph/extractors/ts/extract-ts.sh` | the TypeScript AST extractor launcher: dynamically locates `tsx` or `node`, executes parser | copy |
| `.contexture/extensions/modules/ast-doc-graph/extractors/ts/extract-ts.ts` | the TypeScript Compiler API parser: extracts symbols, object methods, call expressions, definitions | copy |
| `.contexture/extensions/modules/ast-doc-graph/extractors/docs/extract-docs.sh` | the docs extractor launcher: locates runner, executes markdown corpus parser | copy |
| `.contexture/extensions/modules/ast-doc-graph/extractors/docs/extract-docs.ts` | the docs-discipline corpus parser: extracts units, sources globs, contract rules, pitfalls | copy |
| `.contexture/extensions/modules/ast-doc-graph/loader/index-graph.sh` | the graph database loader launcher: executes SQLite ingestion engine | copy |
| `.contexture/extensions/modules/ast-doc-graph/loader/index-graph.ts` | the ingestion loader: populates tables, resolves GOVERNS, WARNS, COVERS edges, compiles FTS5 | copy |
| `.contexture/extensions/modules/ast-doc-graph/schema.sql` | the SQLite relational DDL: table definitions, foreign keys, triggers, FTS5 virtual tables | copy |
| `.contexture/extensions/modules/ast-doc-graph/spec.md` | the comprehensive data contract specification: JSONL schemas, edge linking rules, CTE patterns | reference |
| `.contexture/extensions/modules/ast-doc-graph/README.md` | the off-path module map | reference |
| `tests/` | the plugin's vitest project `ast-doc-graph`: the schema, the query CLI, the extractors and the loader in process, and the full and delta index of `tests/fixtures/mini-repo`; needs sqlite3 with FTS5 and the TypeScript compiler API | reference |
| `README.md` | this onboarding guide and reference manual | reference |

## Architecture and invariants

The architecture is built around six non-negotiable invariants:

* Zero dependency in Contexture core: plugin files live strictly under `plugins/ast-doc-graph/.contexture/extensions/modules/ast-doc-graph/`. No dependencies or node modules are installed in the Contexture root repository.
* Decoupled intermediate streams: Extractors emit standard line-delimited JSON (JSONL). The ingestion loader consumes intermediate JSONL streams without knowing or caring what language extractor produced them.
* Instant retrieval: Retrieval queries execute directly against system `/usr/bin/sqlite3` using prepared queries and Common Table Expressions (CTEs), eliminating Node.js or Python process startup latency.
* Cycle safety: Recursive call graph traversals enforce depth boundaries and string path tracking (`INSTR(d.path, e.target) > 0`) to guarantee termination across recursive or mutually recursive functions.
* Dual full-text search: Documentation rules and summaries are indexed with the `unicode61` tokenizer for natural language matching, while code symbols and signatures are indexed with the `trigram` tokenizer for substring and token matching.
* Zero-daemon Just-In-Time (JIT) freshness: Automatic lazy micro-sync detects edited files in 1 to 5ms via system `find -newer`, triggering inline delta updates for 1 to 2 dirty files in ~300ms without background watcher daemons or memory overhead.

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

### Concurrency and Transactional Integrity

The SQLite database operates in Write-Ahead Logging (WAL) mode (`PRAGMA journal_mode = WAL;`) and enforces a 5000ms busy timeout (`PRAGMA busy_timeout = 5000;`) on all connections. This permits concurrent reader queries while inline delta syncs write to the database, preventing `SQLITE_BUSY` locking errors across parallel agent subprocesses.

## Assess

Before adopting `ast-doc-graph` in a repository, answer these questions:

* Language and toolchain: Does the repository contain TypeScript (`.ts`, `.tsx`) files; is a TypeScript 5 or 6 package reachable (its own `node_modules`, or one `AST_DOC_GRAPH_TYPESCRIPT` can name, since TypeScript 7 offers no compiler API); and is a runner on the PATH (`tsx`, or Node 22.6+)?
* Documentation discipline: Does the repository follow the Contexture docs-discipline format (typed `@doc` blocks with `@contract` rules and `@pitfalls` in `docs/`)?
* Source directory layout: Where do primary business logic, services, and core models live (`src/`, `backend/`, `packages/`, etc.)?
* System SQLite: Is `/usr/bin/sqlite3` available with FTS5 support (standard on macOS and modern Linux distributions)?
* Exclusion boundaries: Which directories should be skipped during source discovery (`node_modules`, `dist`, `build`, `archive`, test directories)?

## Propose

When proposing `ast-doc-graph` adoption to the repository maintainer:

* Present the proposed destination: the package installs its module at `.contexture/extensions/modules/ast-doc-graph/`, and the verbs run through the workspace's `ctx`.
* Name the target source directories to index (for example, `backend/` or `src/`).
* Explain the database storage strategy: `graph.db` generated locally or in CI, added to `.gitignore` to avoid repository bloat.
* Highlight the agent retrieval gains: sub-millisecond call hierarchy navigation and automatic rule surfacing without speculative grep sweeps.

## Execute

### Step 1: Install the Package into the Target Repository

Install the package into the extension root, on the maintainer's go at the act:

```sh
sh plugins/ast-doc-graph/install
```

The installer overlays the module part at `.contexture/extensions/modules/ast-doc-graph/`,
preserving the executable bits of `bin/ast-doc-index`, `bin/graph-query`,
`scripts/index`, and `scripts/query`, and records every installed path under
`.contexture/extensions/.state/ast-doc-graph.files`.

The verbs run through the workspace's `ctx` (the base runtime ships at
`.contexture/ctx`): `ctx ast-doc-graph index` and `ctx ast-doc-graph query`
dispatch to the module, and `ctx help` lists it.

### Step 2: Update Git Ignore Rules

Add the compiled database to `.gitignore`:

```text
# AST and documentation graph artifacts
graph.db
graph.db-journal
graph.db-wal
graph.db-shm
```

The intermediate streams need no rule: each run stages them in its own folder
inside the verb's scratch (the drawer's `.contexture/tmp`) and removes it at exit.
A caller who passes `--cache-dir <path>` owns that folder; the index keeps the
streams there and only `--clean` empties it.

### Step 3: Run Initial Indexing

Execute the indexing verb to index the codebase in one pass:

```sh
ctx ast-doc-graph index --repo-root . --clean
```

The driver discovers TypeScript files and documentation units, runs the extractors,
and compiles `graph.db` in the repository root. A repository without TypeScript
never runs the TypeScript extractor, and a docs walk (the `docs/` folder, else the
repository root) that finds no markdown yields an empty docs side, so a docs-only
or a code-only repository indexes rc 0.

The index runs only inside a contexture drawer: under `ctx` the drawer is the
workspace (`CTX_ROOT`), so `--repo-root` may name any repository; run directly,
`bin/ast-doc-index` needs a repository root that holds its own `.contexture`
folder. Outside a drawer it refuses rc 1 before any write, naming the need.

#### Multi-Directory Repository Root Discovery
When `--src-dir` is omitted, `ast-doc-index` automatically scans the entire repository root, discovering TypeScript source code across `components/`, `pages/`, `services/`, `backend/`, and any other source directories in the project. The scanner enforces standard exclusion directories (`node_modules`, `dist`, `build`, `archive`, `.git`, `.contexture`, `.work`, `.idea`, `tests`, `__tests__`, `.worktrees`) so generated bundles and test fixtures never contaminate the graph. The exclusions match paths inside the scanned root only: a repository that itself sits under such a folder (a checkout under `.worktrees/`, a fixture under `tests/`) still indexes.

#### Incremental Delta Indexing (--delta)
To update the database after code or documentation edits without running a full rebuild:

```sh
# Automatically detect and re-index only modified files
ctx ast-doc-graph index --repo-root . --delta

# Explicitly target specific modified files
ctx ast-doc-graph index --repo-root . --delta backend/core/cascadeCore.ts docs/protocol.md
```

Delta mode detects modified files by comparing file mtimes against `graph.db`, purges previous records for edited files via cascading triggers, extracts fresh symbols and rules, re-links governance edges, and updates `indexed_files`.

A deleted or renamed file is not an edited one, and its rows survive every run but `--clean`: the delta's mtime scan never sees a path that is gone and skips a named one that is not found (with a warning), and a full run without `--clean` clears only the edges before it loads. The old path's symbols, doc unit, rules, and pitfalls stay in the graph, still answering the symbol, search, and stats queries, until `ctx ast-doc-graph index --repo-root . --clean` rebuilds it.

## Verify

Verify the generated database through the query verb:

```sh
# 1. Verify entity counts and database integrity
ctx ast-doc-graph query stats --db ./graph.db

# 2. Inspect a known symbol definition and its governing rules
ctx ast-doc-graph query symbol MyService.myMethod --db ./graph.db

# 3. Traverse upstream callers
ctx ast-doc-graph query callers MyService.myMethod --depth 3 --db ./graph.db

# 4. Search documentation and symbols via FTS5
ctx ast-doc-graph query search "session timeout" --db ./graph.db
```

Expected output: `stats` displays non-zero counts for symbols, edges, docs, and rules;
`symbol` outputs definition locations, callers, callees, and governing rules; `search`
ranks matching doc rules and symbols with highlighted match snippets.

## Daily use

### Zero-Daemon Just-In-Time (JIT) Workflow

`ctx ast-doc-graph query` operates without background daemons, persistent file watchers, or background memory overhead. Freshness is verified automatically at query invocation:

* Sub-millisecond clean baseline: If no files have been modified since the last index (`0` dirty files), the query evaluates prepared SQLite queries with 0ms sync overhead.
* Automatic inline micro-sync: If `1` or `2` files have been modified, the query triggers `ctx ast-doc-graph index --delta` inline before running. The updated symbols and rules are returned in ~300ms without manual intervention.
* Non-blocking advisory notice: If `3` or more files are modified (for instance after pulling a branch or executing a large refactor), the query prints an advisory notice to stderr (`[ast-doc-graph: N files modified since last index. Run ast-doc-index --delta to refresh]`; the engine names its private driver, the ctx form is `ctx ast-doc-graph index --delta`) and immediately executes the query against the current database without blocking.
* Fast bypass flag (`--no-sync`): Pass `--no-sync` in tight loops or automated test pipelines to skip the filesystem freshness scan entirely.
* Concurrency protection: All queries execute with `PRAGMA busy_timeout = 5000` via `sqlite_exec`, ensuring multiple concurrent agents and editors can query the database safely even while an inline delta sync writes to SQLite WAL.

`ctx ast-doc-graph query` provides seven primary subcommands designed for compact agent inspection; a word that names none (a mistyped `symbols`) refuses rc 1 naming the known ones, and `help` or no word at all prints the usage rc 0:

### 1. Symbol Inspection (`symbol`)

Displays symbol definition coordinates, callers, callees, governing documentation units,
contract rules, and associated pitfalls:

```sh
ctx ast-doc-graph query symbol CascadeCore.startSession
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
ctx ast-doc-graph query callers CascadeCore.startSession --depth 3
```

```text
@callers CascadeCore.startSession (depth: 3)
  [1] SessionService.startSession (backend/services/sessionService.ts:53)
```

### 3. Downstream Callees (`callees`)

Recursively traverses functions and methods invoked by the target symbol:

```sh
ctx ast-doc-graph query callees CascadeCore.calculateLevenshtein --depth 2
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
ctx ast-doc-graph query search "locked fog"
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
ctx ast-doc-graph query rules CascadeCore.getNextPhase
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
ctx ast-doc-graph query pitfalls CascadeCore.calculateLevenshtein
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
ctx ast-doc-graph query stats
```

```text
@graph_stats
  DATABASE: <pilot-root>/graph.db
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
* TypeScript Compiler API resolution: The extractor parses through a TypeScript 5 or 6 compiler API whatever the target uses, found through its own Node resolution, then the target repository's `node_modules` and its ancestors, or named alone by `AST_DOC_GRAPH_TYPESCRIPT`. TypeScript 7 offers no `createSourceFile`, so a repository whose only reachable typescript is 7 indexes once the variable names a 5 or 6 package, and refuses rc 1 until then: the refusal stops the whole index, docs included, so no partial graph reads as complete. The runner (`tsx`, or Node with `--experimental-strip-types`) runs the extractor and supplies no compiler API.
* Documentation grammar compliance: The docs extractor parses documents adhering to the docs-discipline corpus grammar (the docs module's private grammar). A file with no `@doc <kind> <id>` line and no rule or pitfall block adds nothing to the graph. A rule or pitfall met at column 0 before any `@doc` line (a `@contract`, `@dependency_rules`, `@rule`, or `@pitfalls` block, or a `! [severity/type] id:` pitfall line, as a guide page quoting the grammar holds) has no unit to hold it: the extractor skips those entries with one warning on stderr naming the file and the count (`Warning: skipping 2 rule or pitfall entries before any @doc line in docs/guide.md`), and the rest of the corpus indexes. The id line a migrated contract rule or responsibility carries on its second line (`id: <slug>-r<N>`, `id: <slug>-o<N>`) is skipped as an unknown field, so the extracted rules and pitfalls stay the same.
* Files-only corpus reader: The docs extractor reads the corpus as files under `docs/` (the pipeline driver scans the folder, the parser reads each file), never through `ctx docs`. Under the docs-discipline files driver that folder is the corpus; under a store driver (the storage-fts5 plugin, or any driver whose corpus lives outside the files) the folder holds no corpus, so the graph indexes no docs, rules, or pitfalls while code indexing works unchanged. Routing the extraction through `ctx docs` is a later change; until then, index docs only in a workspace on the files driver.
* Incremental delta lifecycle: Single-file and partial-batch delta updates are fully supported via `ctx ast-doc-graph index --delta` and lazy JIT micro-sync in the query verb. Re-parsing is scoped strictly to modified files with automatic cascading edge purging and dynamic governance re-linking. Removal is the exception: a deleted or renamed file's rows survive every run but `--clean` (a full run clears only the edges, a delta never sees a deleted file and skips a named one), so index with `--clean` after removing or renaming a source file or a corpus doc.
* Zero em-dash and zero spaced hyphen compliance: In accordance with Contexture repository typography laws, all authored tools, scripts, and documentation strictly avoid em-dashes and spaced hyphens.

## Needs

- A runner for the TypeScript entry points: a project-local `tsx`, else `tsx` or Node 22.6+ (`--experimental-strip-types`) from the caller's PATH; the launchers never edit PATH. A runner runs the extractor; it supplies no compiler API.
- A TypeScript 5 or 6 compiler API (a `typescript` package carrying `createSourceFile`) when the repository holds TypeScript, whatever TypeScript the repository itself uses: TypeScript 7, the native compiler, exposes none, and a 6.x parser reads its code. The extractor takes the first one reachable, its own Node resolution from the module, then the target repository and its ancestors; `AST_DOC_GRAPH_TYPESCRIPT` names one (its package folder or its entry file) and, when set, is the only candidate. The plugin installs none: the adopter provides it. With none reachable the whole index refuses rc 1 and writes nothing, naming each typescript it found with its version and path, and the variable; a variable naming a package without the compiler API refuses naming the variable and that version. A docs-only repository needs no compiler API.
- System `sqlite3` with FTS5 (standard on macOS and modern Linux distributions).
- A contexture drawer: `ctx ast-doc-graph index` runs inside the workspace; a direct run of `bin/ast-doc-index` needs a repository root holding its `.contexture` folder. The intermediate streams live in a per-run folder inside `CTX_SCRATCH_ROOT`, else the drawer's `.contexture/tmp`; a folder it cannot make refuses rc 2. The query verb needs no drawer: it reads any database it is given.
- The docs-discipline corpus grammar (private to the docs module) when documentation is extracted; code-only indexing needs TypeScript alone.
- The plugin's tests live with the plugin (`tests/`) as its vitest project, are never copied into a workspace, and run from the repository's `tests/` folder (`bun run test:ast-doc-graph`): they need sqlite3 with FTS5, and the pipeline tests the TypeScript compiler API (the test tooling's own TypeScript, linked into each sandbox); the TypeScript 7 cases run over a committed stub package (`tests/fixtures/typescript-7-stub`), never an install; a test whose need is absent skips, naming it.

## Contributing

The extractors keep their JSONL contract (see `spec.md`), so a new language extractor lands without touching the loader. Changes land upstream with the plugin's tests run (`bun run test:ast-doc-graph`) and the Try it walk re-derived. Packaging, naming, and the test convention are in `docs/plugins.md`.

## Try it

Against a pilot repository (the walk uses the pilot's paths as placeholders; substitute your own):

```sh
# 1. Run the pipeline driver on the target repository
ctx ast-doc-graph index \
  --repo-root <pilot-root> \
  --src-dir backend \
  --db <scratch>/pilot-test.db \
  --clean

# 2. Query symbol definition, caller, and governing rules
ctx ast-doc-graph query symbol CascadeCore.startSession --db <scratch>/pilot-test.db

# 3. Query upstream callers with depth bounding
ctx ast-doc-graph query callers CascadeCore.startSession --depth 3 --db <scratch>/pilot-test.db

# 4. Search the documentation corpus via FTS5
ctx ast-doc-graph query search "locked fog" --db <scratch>/pilot-test.db

# 5. Display aggregate statistics
ctx ast-doc-graph query stats --db <scratch>/pilot-test.db
```

Output from step 1:
```text
@graph_loaded
  DATABASE: <scratch>/pilot-test.db
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

A docs-only sandbox exercises the same verbs without the TypeScript need (no
`.ts` files: the pipeline indexes the corpus and `query` reads it back). The
index runs only inside a contexture drawer, so the staging builds a scratch
workspace carrying the base runtime, this plugin's module, and the
docs-discipline sample corpus, and runs the verbs through that workspace's
`ctx`; the outputs below are verbatim from that run:

```sh
scratch="../../.contexture/tmp/ast-doc-graph-walk"
rm -rf "$scratch"
mkdir -p "$scratch/.contexture/extensions/modules" "$scratch/docs"
cp ../../.contexture/ctx "$scratch/.contexture/ctx"
cp -R .contexture/extensions/modules/ast-doc-graph "$scratch/.contexture/extensions/modules/"
cp -R ../docs-discipline/tests/sample/docs/. "$scratch/docs/"
cd "$scratch"

./.contexture/ctx ast-doc-graph index --repo-root . --clean
./.contexture/ctx ast-doc-graph query stats --db ./graph.db
```

```text
@graph_loaded
  DATABASE: <scratch>/graph.db
  SYMBOLS: 0
  EDGES: 0
  DOCS: 4
  RULES: 5
  PITFALLS: 3

@graph_stats
  DATABASE: ./graph.db
  SYMBOLS: 0
  EDGES: 0
  DOCS: 4
  RULES: 5
  PITFALLS: 3
```

`ctx ast-doc-graph query search "<term>"` then answers from the corpus (the
search view lists matching docs, rules, and pitfalls), so a docs-only target
gets retrieval without the TypeScript toolchain.

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `.contexture/extensions/modules/ast-doc-graph/module` | authored fresh: the module summary line |
| `.contexture/extensions/modules/ast-doc-graph/scripts/index` | authored fresh: the indexing verb, a pass-through wrapper over `bin/ast-doc-index` |
| `.contexture/extensions/modules/ast-doc-graph/scripts/query` | authored fresh: the retrieval verb, a pass-through wrapper over `bin/graph-query` |
| `.contexture/extensions/modules/ast-doc-graph/README.md` | authored fresh: the off-path module map (layout, pipeline, tests) |
| `.contexture/extensions/modules/ast-doc-graph/bin/ast-doc-index` | authored fresh: unified bash pipeline driver coordinating discovery, AST extraction, doc extraction, and SQLite compilation |
| `.contexture/extensions/modules/ast-doc-graph/bin/graph-query` | authored fresh: zero-dependency bash retrieval CLI wrapping system `/usr/bin/sqlite3` with CTEs and FTS5 search |
| `.contexture/extensions/modules/ast-doc-graph/extractors/ts/extract-ts.sh` | authored fresh: launcher resolving project-local `tsx` or Node with fallback search paths |
| `.contexture/extensions/modules/ast-doc-graph/extractors/ts/extract-ts.ts` | authored fresh: TypeScript Compiler API parser extracting symbols, object methods, call expressions, and signatures |
| `.contexture/extensions/modules/ast-doc-graph/extractors/docs/extract-docs.sh` | authored fresh: launcher resolving runner for docs extractor |
| `.contexture/extensions/modules/ast-doc-graph/extractors/docs/extract-docs.ts` | authored fresh: docs-discipline markdown parser extracting units, sources globs, contract rules, and pitfalls |
| `.contexture/extensions/modules/ast-doc-graph/loader/index-graph.sh` | authored fresh: launcher resolving runner for database loader |
| `.contexture/extensions/modules/ast-doc-graph/loader/index-graph.ts` | authored fresh: database ingestion loader building relational tables, resolving GOVERNS/WARNS/COVERS, and compiling FTS5 |
| `.contexture/extensions/modules/ast-doc-graph/schema.sql` | authored fresh: relational SQLite schema and FTS5 virtual table definitions with foreign keys and trigram tokenizers |
| `.contexture/extensions/modules/ast-doc-graph/spec.md` | authored fresh: data contract specification for intermediate JSONL streams, recursive CTEs, and edge linking |
| `tests/` (the vitest project) | authored fresh: the schema over seeded rows, the query CLI over its cycle-safe queries, the extractors and the loader in process, and the pipeline, delta, and freshness over a committed mini repository |
| `README.md` | authored fresh: onboarding guide, architecture specification, and reference manual |
