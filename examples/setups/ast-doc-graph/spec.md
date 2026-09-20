# AST and Documentation Graph Specification

## 1. Overview and Architecture

The `ast-doc-graph` setup bridges code structure and architectural documentation. It connects code symbols, syntactic call graphs, and documentation rules into a unified SQLite database with Full-Text Search (FTS5) and recursive Common Table Expressions (CTEs).

### 1.1 Invariants
* Zero dependency in Contexture core: Setup files live strictly under `examples/setups/ast-doc-graph/`. No dependencies or node modules are installed in Contexture root.
* Decoupled pipeline: Extractors emit intermediate line-delimited JSON (JSONL). The ingestion loader consumes standard JSONL streams regardless of source programming language.
* Instant retrieval: Retrieval queries execute directly against `/usr/bin/sqlite3` with zero runtime startup overhead.
* Cycle safety: Recursive call graph traversals enforce depth boundaries and path tracking to guarantee termination across mutually recursive calls.

### 1.2 Pipeline Components
1. AST Extractor: Parses repository source files (TypeScript, Python, Go, Rust, etc.) into `symbols.jsonl` and `edges.jsonl`.
2. Docs Extractor: Parses documentation files into `docs.jsonl`, `doc_rules.jsonl`, and `doc_pitfalls.jsonl`.
3. Ingestion Loader: Populates SQLite relational tables, compiles FTS5 indexes, and resolves `GOVERNS`, `WARNS`, and `COVERS` edges.
4. Query CLI: Executes symbol searches, call graph traversals, and governance lookups via SQLite.

```
+---------------------+     +----------------------+
| Source Code (.ts)   |     | Documentation (.md)  |
+---------------------+     +----------------------+
           |                            |
           v                            v
   [AST Extractor]              [Docs Extractor]
           |                            |
           +-------------+--------------+
                         |
                         v
              Intermediate JSONL Files
            * symbols.jsonl   * docs.jsonl
            * edges.jsonl     * doc_rules.jsonl
                              * doc_pitfalls.jsonl
                         |
                         v
                [Ingestion Loader]
                         |
                         v
              SQLite Database (.db)
            * Relational tables (symbols, edges, docs, rules, pitfalls)
            * Virtual tables (fts_symbols trigram, fts_docs unicode61)
            * Inferred edges (GOVERNS, WARNS, COVERS)
                         |
                         v
              [CLI Retrieval Tool]
```

---

## 2. Intermediate JSONL Data Contracts

Each line of an intermediate JSONL file represents a single valid JSON object. All string values are UTF-8 encoded.

### 2.1 `symbols.jsonl`
Captures code symbols declared in the codebase.

* `id` (string, required): Unique identifier for the symbol (format: `sym:<file_path>:<qname>` or UUID).
* `name` (string, required): Bare identifier name (example: `startSession`).
* `qname` (string, required): Qualified identifier name including namespace or enclosing object/class (example: `CascadeCore.startSession`).
* `kind` (string, required): Symbol kind (`function`, `method`, `class`, `interface`, `variable`, `constant`, `type_alias`).
* `file` (string, required): Relative file path from repository root (example: `backend/core/cascadeCore.ts`).
* `line_start` (integer, required): 1-indexed start line number.
* `line_end` (integer, required): 1-indexed end line number.
* `signature` (string, optional/nullable): Parameter and return type signature (example: `(config: SessionConfig) => SessionResult`).
* `docstring` (string, optional/nullable): Extracted JSDoc or docstring comment.

Sample line:
```json
{"id":"sym:backend/core/cascadeCore.ts:CascadeCore.startSession","name":"startSession","qname":"CascadeCore.startSession","kind":"method","file":"backend/core/cascadeCore.ts","line_start":35,"line_end":78,"signature":"(config: SessionConfig) => SessionResult","docstring":"Initializes cascade session state and validates participant status."}
```

### 2.2 `edges.jsonl`
Captures structural relationships between entities.

* `source` (string, required): Identifier or qname of the source entity.
* `target` (string, required): Identifier or qname of the target entity.
* `kind` (string, required): Relationship type (`CALLS`, `DEFINES`, `REFERENCES`, `IMPORTS`).

Sample line:
```json
{"source":"sym:backend/services/sessionService.ts:SessionService.startSession","target":"sym:backend/core/cascadeCore.ts:CascadeCore.startSession","kind":"CALLS"}
```

### 2.3 `docs.jsonl`
Captures documentation unit metadata.

* `id` (string, required): Unique identifier for the documentation unit (format: `doc:<path_slug>`).
* `repo` (string, required): Repository or module identifier (example: `bilingo-mvp`).
* `kind` (string, required): Document kind (`protocol`, `guide`, `reference`, `architecture`).
* `summary` (string, required): One-line summary describing the document purpose.
* `sources` (array of strings, required): Glob patterns or relative paths of source files governed by this document.
* `keywords` (array of strings, required): Topics and conceptual keywords.

Sample line:
```json
{"id":"doc:toisto:cascade-protocol","repo":"bilingo-mvp","kind":"protocol","summary":"Cascade protocol execution lifecycle and state transitions","sources":["backend/core/cascadeCore.ts","backend/services/sessionService.ts"],"keywords":["cascade","session","lifecycle","transitions"]}
```

### 2.4 `doc_rules.jsonl`
Captures normative contract rules declared within documentation units.

* `id` (string, required): Unique identifier for the rule (format: `rule:<doc_slug>:<rule_slug>`).
* `doc_id` (string, required): Foreign reference to `docs.id`.
* `statement` (string, required): Normative rule statement.
* `evidence_symbols` (array of strings, required): Array of code identifiers or qnames extracted from evidence declaration.
* `evidence_raw` (string, optional/nullable): Raw evidence string from documentation markdown.
* `detail` (string, optional/nullable): Detailed explanation of rule enforcement and rationale.
* `anti` (string, optional/nullable): Anti-pattern description (what to avoid).
* `good` (string, optional/nullable): Recommended pattern description (what to do).

Sample line:
```json
{"id":"rule:cascade-protocol:peek-tracking","doc_id":"doc:toisto:cascade-protocol","statement":"Record peek counts on learner interaction lines","evidence_symbols":["recordPeek","setTotalUserLines","isUserLine","LEARNER_SPEAKERS"],"evidence_raw":"recordPeek; setTotalUserLines; isUserLine; LEARNER_SPEAKERS","detail":"Learner interaction lines must persist peek counts across session restarts to ensure accurate spaced repetition intervals.","anti":"Incrementing peek count without checking learner line ownership.","good":"Invoking recordPeek exclusively when isUserLine returns true."}
```

### 2.5 `doc_pitfalls.jsonl`
Captures documented gotchas, anti-patterns, and hazards.

* `id` (string, required): Unique identifier for the pitfall (format: `pitfall:<doc_slug>:<pitfall_slug>`).
* `doc_id` (string, required): Foreign reference to `docs.id`.
* `severity` (string, required): Severity level (`critical`, `high`, `medium`, `low`).
* `type` (string, required): Pitfall categorization (`gotcha`, `anti-pattern`, `edge-case`, `performance`).
* `statement` (string, required): Description of the pitfall.
* `trigger` (string, optional/nullable): Conditions that trigger the hazard.
* `evidence_symbols` (array of strings, required): Array of code identifiers or qnames linked to the pitfall.
* `evidence_raw` (string, optional/nullable): Raw evidence string from documentation markdown.

Sample line:
```json
{"id":"pitfall:cascade-protocol:levenshtein-threshold","doc_id":"doc:toisto:cascade-protocol","severity":"high","type":"gotcha","statement":"Levenshtein distance calculation diverges on unnormalized unicode strings","trigger":"Input strings containing combining diacritics or non-breaking spaces","evidence_symbols":["calculateLevenshtein","normalizeText"],"evidence_raw":"calculateLevenshtein; normalizeText"}
```

---

## 3. SQLite DDL and Schema Definition

The SQLite database uses normalized relational tables, secondary lookup indexes, and FTS5 virtual tables.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

/* ========================================================================= */
/* 1. Relational Tables                                                      */
/* ========================================================================= */

CREATE TABLE IF NOT EXISTS symbols (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    qname TEXT NOT NULL,
    kind TEXT NOT NULL,
    file TEXT NOT NULL,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    signature TEXT,
    docstring TEXT
);

CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_qname ON symbols(qname);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);

CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
CREATE INDEX IF NOT EXISTS idx_edges_source_kind ON edges(source, kind);
CREATE INDEX IF NOT EXISTS idx_edges_target_kind ON edges(target, kind);

CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    repo TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    sources TEXT NOT NULL,
    keywords TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_docs_repo ON docs(repo);
CREATE INDEX IF NOT EXISTS idx_docs_kind ON docs(kind);

CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    evidence_symbols TEXT NOT NULL,
    evidence_raw TEXT,
    detail TEXT,
    anti TEXT,
    good TEXT
);

CREATE INDEX IF NOT EXISTS idx_rules_doc_id ON rules(doc_id);

CREATE TABLE IF NOT EXISTS pitfalls (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    severity TEXT NOT NULL,
    type TEXT NOT NULL,
    statement TEXT NOT NULL,
    trigger TEXT,
    evidence_symbols TEXT NOT NULL,
    evidence_raw TEXT
);

CREATE INDEX IF NOT EXISTS idx_pitfalls_doc_id ON pitfalls(doc_id);
CREATE INDEX IF NOT EXISTS idx_pitfalls_severity ON pitfalls(severity);

/* ========================================================================= */
/* 2. Full-Text Search (FTS5) Virtual Tables                                 */
/* ========================================================================= */

/* Trigram tokenization enables code substring matching and CamelCase lookup */
CREATE VIRTUAL TABLE IF NOT EXISTS fts_symbols USING fts5(
    symbol_id UNINDEXED,
    name,
    qname,
    file,
    docstring,
    tokenize = 'trigram'
);

/* Unicode61 tokenization enables standard BM25 ranking for prose docs       */
CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(
    doc_id UNINDEXED,
    entity_id UNINDEXED,
    entity_type UNINDEXED,
    title,
    content,
    keywords,
    tokenize = 'unicode61'
);

/* ========================================================================= */
/* 3. Automatic Synchronization Triggers for FTS5                            */
/* ========================================================================= */

CREATE TRIGGER IF NOT EXISTS trg_symbols_ai AFTER INSERT ON symbols BEGIN
    INSERT INTO fts_symbols(symbol_id, name, qname, file, docstring)
    VALUES (new.id, new.name, new.qname, new.file, coalesce(new.docstring, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_symbols_ad AFTER DELETE ON symbols BEGIN
    DELETE FROM fts_symbols WHERE symbol_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_symbols_au AFTER UPDATE ON symbols BEGIN
    DELETE FROM fts_symbols WHERE symbol_id = old.id;
    INSERT INTO fts_symbols(symbol_id, name, qname, file, docstring)
    VALUES (new.id, new.name, new.qname, new.file, coalesce(new.docstring, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_docs_ai AFTER INSERT ON docs BEGIN
    INSERT INTO fts_docs(doc_id, entity_id, entity_type, title, content, keywords)
    VALUES (new.id, new.id, 'doc', new.id, new.summary, new.keywords);
END;

CREATE TRIGGER IF NOT EXISTS trg_docs_ad AFTER DELETE ON docs BEGIN
    DELETE FROM fts_docs WHERE doc_id = old.id AND entity_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_rules_ai AFTER INSERT ON rules BEGIN
    INSERT INTO fts_docs(doc_id, entity_id, entity_type, title, content, keywords)
    VALUES (new.doc_id, new.id, 'rule', new.statement, coalesce(new.detail, ''), coalesce(new.evidence_raw, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_rules_ad AFTER DELETE ON rules BEGIN
    DELETE FROM fts_docs WHERE entity_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_pitfalls_ai AFTER INSERT ON pitfalls BEGIN
    INSERT INTO fts_docs(doc_id, entity_id, entity_type, title, content, keywords)
    VALUES (new.doc_id, new.id, 'pitfall', new.statement, coalesce(new.trigger, ''), coalesce(new.evidence_raw, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_pitfalls_ad AFTER DELETE ON pitfalls BEGIN
    DELETE FROM fts_docs WHERE entity_id = old.id;
END;
```

---

## 4. Cycle-Safe Recursive CTE Graph Queries

Graph call hierarchies may contain cycles resulting from recursion or mutual invocations. Without cycle protection, recursive CTEs enter infinite loops.

Protection mechanism:
1. Path accumulation: Maintain a string path recording all visited identifiers delimited by slashes (format: `'/node1/node2/'`).
2. Cycle check: Before expanding the next node, evaluate `INSTR(path, '/' || next_node || '/') == 0`. If `INSTR` returns a positive index, the node was previously visited and the recursive branch terminates.
3. Depth bound: Constrain traversal depth with `depth < :max_depth` (default: 5).

### 4.1 Upstream Callers Query
Discovers all callers that directly or indirectly invoke a designated target symbol.

```sql
/* Find callers invoking target symbol :target_id up to max_depth */
WITH RECURSIVE upstream_callers(id, depth, path) AS (
    /* Base case: target node */
    SELECT
        :target_id AS id,
        0 AS depth,
        '/' || :target_id || '/' AS path
    UNION ALL
    /* Recursive step: join edges where target is current node, next node is e.source */
    SELECT
        e.source AS id,
        uc.depth + 1 AS depth,
        uc.path || e.source || '/' AS path
    FROM upstream_callers uc
    JOIN edges e ON uc.id = e.target AND e.kind = 'CALLS'
    WHERE uc.depth < :max_depth
      AND INSTR(uc.path, '/' || e.source || '/') == 0
)
SELECT
    uc.depth,
    uc.id AS symbol_id,
    s.name,
    s.qname,
    s.kind,
    s.file,
    s.line_start,
    s.line_end,
    uc.path
FROM upstream_callers uc
LEFT JOIN symbols s ON uc.id = s.id OR uc.id = s.qname
WHERE uc.depth > 0
ORDER BY uc.depth ASC, uc.id ASC;
```

When path tracking is formulated from the perspective of the traversed edge:
* Upstream callers: `INSTR(cg.path, '/' || e.source || '/') == 0` guarantees the source caller being added has not already been visited. When path records target steps, checking `INSTR(cg.path, e.target) == 0` ensures edge target invariants. Both forms enforce cycle immunity.

### 4.2 Downstream Callees Query
Discovers all functions and methods directly or indirectly called by a designated root symbol.

```sql
/* Find callees invoked by root symbol :source_id up to max_depth */
WITH RECURSIVE downstream_callees(id, depth, path) AS (
    /* Base case: root node */
    SELECT
        :source_id AS id,
        0 AS depth,
        '/' || :source_id || '/' AS path
    UNION ALL
    /* Recursive step: join edges where source is current node, next node is e.target */
    SELECT
        e.target AS id,
        dc.depth + 1 AS depth,
        dc.path || e.target || '/' AS path
    FROM downstream_callees dc
    JOIN edges e ON dc.id = e.source AND e.kind = 'CALLS'
    WHERE dc.depth < :max_depth
      AND INSTR(dc.path, '/' || e.target || '/') == 0
)
SELECT
    dc.depth,
    dc.id AS symbol_id,
    s.name,
    s.qname,
    s.kind,
    s.file,
    s.line_start,
    s.line_end,
    dc.path
FROM downstream_callees dc
LEFT JOIN symbols s ON dc.id = s.id OR dc.id = s.qname
WHERE dc.depth > 0
ORDER BY dc.depth ASC, dc.id ASC;
```

When path tracking evaluates visited nodes:
* Downstream callees: `INSTR(cg.path, '/' || e.target || '/') == 0` guarantees the target callee being visited has not already appeared in the path.

---

## 5. Linking Rules and Graph Edge Resolution

The ingestion loader reads intermediate JSONL files and establishes graph relationships (`edges` table).

### 5.1 GOVERNS Edge Resolution
Links contract rules (`rules` table) to the code symbols (`symbols` table) governed by those rules.

* Edge source: `rules.id`
* Edge target: `symbols.id` (or `symbols.qname`)
* Edge kind: `GOVERNS`
* Resolution algorithm:
  1. For each token in `rules.evidence_symbols`:
     a. Exact Qualified Match: Search `symbols` where `qname = :token`. If matched, link rule to `symbol.id`.
     b. Exact Bare Name Match: If no qualified match exists, search `symbols` where `name = :token`.
  2. Disambiguation via Document Scope:
     a. If multiple symbols match bare `name`, inspect the parent document (`docs` row referenced by `rules.doc_id`).
     b. Filter candidate symbols where `symbols.file` matches any pattern in `docs.sources`.
     c. If matching symbols are found within the document sources scope, link to those symbols.
     d. If no match exists within sources, or if multiple symbols remain, link to all candidates within scope to avoid dropping valid targets.

### 5.2 WARNS Edge Resolution
Links documented pitfalls and hazards (`pitfalls` table) to the code symbols subject to those pitfalls.

* Edge source: `pitfalls.id`
* Edge target: `symbols.id` (or `symbols.qname`)
* Edge kind: `WARNS`
* Resolution algorithm:
  1. For each token in `pitfalls.evidence_symbols`:
     a. Exact Qualified Match: Search `symbols` where `qname = :token`.
     b. Exact Bare Name Match: Search `symbols` where `name = :token`.
  2. Disambiguation via Document Scope:
     a. Resolve parent document `sources` globs via `pitfalls.doc_id`.
     b. Restrict candidate matches to files satisfying `docs.sources`.
  3. Create edge with `kind = 'WARNS'`.

### 5.3 COVERS Edge Resolution
Links documentation units (`docs` table) to all code files and symbols covered by the document scope.

* Edge source: `docs.id`
* Edge target: `symbols.id`
* Edge kind: `COVERS`
* Resolution algorithm:
  1. Parse the JSON array `docs.sources` for glob patterns and paths.
  2. Match all symbols where `symbols.file` satisfies any of the source globs.
  3. For every covered symbol, create edge `(source: docs.id, target: symbol.id, kind: 'COVERS')`.

---

## 6. Unified Retrieval Queries

### 6.1 Symbol Full-Text Search (Trigram)
Searches symbol identifiers and docstrings for substrings or CamelCase fragments.

```sql
SELECT
    s.id,
    s.name,
    s.qname,
    s.kind,
    s.file,
    s.line_start,
    s.line_end,
    s.signature
FROM fts_symbols fts
JOIN symbols s ON fts.symbol_id = s.id
WHERE fts_symbols MATCH :query
ORDER BY rank
LIMIT 20;
```

### 6.2 Documentation Full-Text Search (BM25)
Searches documentation titles, summaries, rules, and pitfalls using BM25 natural language ranking.

```sql
SELECT
    fts.doc_id,
    fts.entity_id,
    fts.entity_type,
    fts.title,
    snippet(fts_docs, 4, '[', ']', '...', 12) AS snippet,
    bm25(fts_docs) AS score
FROM fts_docs
WHERE fts_docs MATCH :query
ORDER BY score ASC
LIMIT 10;
```

### 6.3 Symbol Governance and Context Lookup
Given a symbol (by id or qname), retrieves all governing rules, warning pitfalls, and covering documents.

```sql
SELECT
    e.kind AS relationship,
    e.source AS source_id,
    CASE e.kind
        WHEN 'GOVERNS' THEN r.statement
        WHEN 'WARNS' THEN p.statement
        WHEN 'COVERS' THEN d.summary
    END AS description,
    p.severity,
    CASE e.kind
        WHEN 'GOVERNS' THEN r.detail
        WHEN 'WARNS' THEN p.trigger
        WHEN 'COVERS' THEN d.sources
    END AS extra_context
FROM edges e
LEFT JOIN rules r ON e.source = r.id AND e.kind = 'GOVERNS'
LEFT JOIN pitfalls p ON e.source = p.id AND e.kind = 'WARNS'
LEFT JOIN docs d ON e.source = d.id AND e.kind = 'COVERS'
WHERE e.target = :symbol_id
  AND e.kind IN ('GOVERNS', 'WARNS', 'COVERS');
```
