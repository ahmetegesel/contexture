# storage-fts5: the SQLite FTS5 storage driver plugin

The storage-fts5 plugin packages a relational SQLite storage driver and full-text search engine for Contexture:
a normalized relational schema for sessions, tasks, entries, findings, and lanes, coupled with dual SQLite FTS5 virtual tables and pure SQL Reciprocal Rank Fusion (RRF) search. The plugin operates directly on the system `sqlite3` CLI with zero runtime dependencies, providing sub-millisecond retrieval, token-compact snippet extraction, complete finding lifecycle CRUD, and bidirectional migration between POSIX markdown records and SQLite databases.

## Adoption

Assess the repository, propose the installation to the maintainer, and execute the copy.
The plugin is adoption-gated: nothing is copied before the maintainer's verdict.

## What it is

The storage-fts5 plugin serves as an indexed storage backend replacing flat file scans with relational queries and indexed search:

1. Relational schema: sessions, tasks, entries, findings, lanes, and lane_entries are stored in dedicated normalized tables with foreign keys and cascading integrity.
2. Dual FTS5 indexing: natural language prose is indexed with `porter unicode61 remove_diacritics 0` to preserve Turkish characters and diacritics, while exact code identifiers and symbols are indexed with `trigram` tokenization.
3. Automated synchronization triggers: database triggers synchronize all entity mutations into `search_documents`, which automatically updates `fts_prose` and `fts_code` without manual indexing logic.
4. Pure SQL RRF search: a two-stage Common Table Expression (CTE) executes Reciprocal Rank Fusion (`1.0 / (60.0 + rank)`) natively in SQLite, extracting token-dense contextual snippets with match highlights rather than dumping full records into prompts.
5. Finding lifecycle CRUD: full lifecycle verbs (`add`, `show`, `update`, `supersede`, `drop`, `list`) maintain durable knowledge states directly in the database.
6. Subagent lane persistence: subagent recipes, action traces, and reports are persisted directly in native SQLite tables.
7. Bidirectional migration: `ctx storage-fts5 migrate` provides atomic, lossless conversion between POSIX flat files and SQLite databases.

| piece | what it is | lands as |
|---|---|---|
| `.contexture/modules/storage-fts5/module` | the module summary line | copy |
| `.contexture/modules/storage-fts5/schema.sql` | relational SQLite DDL, triggers, and dual FTS5 virtual tables | copy |
| `.contexture/modules/storage-fts5/drivers/fts5` | the Storage Provider Interface (SPI) driver executable | copy |
| `.contexture/modules/storage-fts5/scripts/migrate` | bidirectional migration CLI verb | copy |
| `tests/test-driver.sh` | SPI compliance test runner against fts5 driver | reference |
| `tests/test-migration.sh` | bidirectional round-trip migration verification suite | reference |
| `tests/run.sh` | plugin test suite runner | reference |
| `README.md` | this onboarding guide and reference manual | reference |

## Architecture and invariants

The storage architecture honors these non-negotiable invariants:

* Zero runtime dependencies: all operations execute through host `/usr/bin/sqlite3` with zero compilation, zero C/C++ build steps, and zero Node.js or Python runtime requirements.
* Turkish character preservation: the unicode61 tokenizer is explicitly configured with `remove_diacritics 0`, guaranteeing proper distinction and matching for Turkish characters (`ç`, `ğ`, `ı`, `ö`, `ş`, `ü`, `İ`).
* Pure SQL RRF ranking: combines natural language stem matching and trigram substring matching using Reciprocal Rank Fusion (`1.0 / (60.0 + rank)`).
* Two-stage CTE execution: separates raw cursor snippet evaluation from outer rank window computation, preventing FTS5 cursor stepping errors.
* Contextual snippet extraction: returns token-dense excerpts (default 12 tokens) with bold highlight delimiters, slashing prompt token consumption by over 90 percent.
* Concurrency and WAL mode: connections run with `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;`, enabling concurrent readers alongside serialized writes without database locking errors.
* Zero em-dash and zero spaced hyphen compliance: all documentation, scripts, and error diagnostics strictly avoid em-dashes and spaced hyphens.

```
+-------------------------------------------------------------+
|                     Contexture Runtime                      |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|         Storage Provider Interface (SPI Dispatcher)         |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|            SQLite FTS5 Driver (drivers/fts5)                |
+-------------------------------------------------------------+
          |                                        |
          v                                        v
+------------------------+             +------------------------+
|    Relational Model    |             |  Dual FTS5 Indexing    |
|  * sessions            |             |  * fts_prose (porter)  |
|  * tasks               |--triggers-->|  * fts_code (trigram)  |
|  * entries             |             |  * search_documents    |
|  * findings            |             +------------------------+
|  * lanes               |                         |
|  * lane_entries        |                         v
+------------------------+             +------------------------+
                                       |  Pure SQL RRF Engine   |
                                       |  * 1.0 / (60.0 + rank) |
                                       |  * contextual snippets |
                                       +------------------------+
```

### Pure SQL RRF Query Architecture

To resolve the SQLite FTS5 cursor stepping conflict where window functions and auxiliary snippet functions clash within the same SELECT block, the driver executes a two-stage Common Table Expression:

```sql
WITH
  raw_prose AS (
    SELECT rowid AS doc_id, rank, snippet(fts_prose, -1, '<b>', '</b>', '...', 12) AS snip
    FROM fts_prose WHERE fts_prose MATCH ?
  ),
  ranked_prose AS (
    SELECT doc_id, row_number() OVER (ORDER BY rank) AS rnk, snip
    FROM raw_prose
  ),
  raw_code AS (
    SELECT rowid AS doc_id, rank, snippet(fts_code, -1, '<b>', '</b>', '...', 12) AS snip
    FROM fts_code WHERE fts_code MATCH ?
  ),
  ranked_code AS (
    SELECT doc_id, row_number() OVER (ORDER BY rank) AS rnk, snip
    FROM raw_code
  ),
  combined AS (
    SELECT doc_id, 1.0 / (60.0 + rnk) AS score, snip FROM ranked_prose
    UNION ALL
    SELECT doc_id, 1.0 / (60.0 + rnk) AS score, snip FROM ranked_code
  ),
  fused AS (
    SELECT c.doc_id, round(sum(c.score), 6) AS rrf_score, count(c.doc_id) AS sources, max(c.snip) AS snippet
    FROM combined c GROUP BY c.doc_id
  ),
  ordered_docs AS (
    SELECT f.doc_id, s.unit, s.entity_type, s.entity_id, s.section, s.title, f.rrf_score, f.sources, f.snippet
    FROM fused f
    JOIN search_documents s ON s.doc_id = f.doc_id
    WHERE s.unit = ? AND (? IS NULL OR s.entity_type = ?)
    ORDER BY f.rrf_score DESC
    LIMIT ?
  )
SELECT json_object(
  'unit', ?,
  'query', ?,
  'total_matches', (SELECT count(*) FROM ordered_docs),
  'results', coalesce((
    SELECT json_group_array(
      json_object(
        'entity_type', entity_type,
        'entity_id', entity_id,
        'section', section,
        'title', title,
        'rrf_score', rrf_score,
        'sources', sources,
        'snippet', snippet
      )
    ) FROM ordered_docs
  ), json_array())
);
```

## Assess

Before adopting `storage-fts5` in a repository, verify:

* SQLite CLI availability: verify that `/usr/bin/sqlite3` or `sqlite3` is on PATH with FTS5 support.
* Workspace storage configuration: determine whether the database lives at default `.contexture/sessions.db` or a custom path configured in `.contexture/storage.conf`.

## Propose

When proposing `storage-fts5` adoption to the repository maintainer:

* Present the destination: the plugin module copies to `.contexture/modules/storage-fts5/`.
* Explain concurrency and indexing benefits: dual FTS5 tables with automatic trigger synchronization and WAL mode concurrency.
* Highlight prompt token savings: 5-to-12 token snippets with highlight markers instead of dumping entire session files into context.
* Confirm that migration is bidirectional and lossless via `ctx storage-fts5 migrate`.

## Execute

### Step 1: Copy Module Tree

Copy the module tree into the workspace:

```sh
mkdir -p <repo-root>/.contexture/modules
cp -R plugins/storage-fts5/.contexture/modules/storage-fts5 <repo-root>/.contexture/modules/
chmod +x <repo-root>/.contexture/modules/storage-fts5/drivers/fts5 <repo-root>/.contexture/modules/storage-fts5/scripts/migrate
```

### Step 2: Configure Git Ignore

Add the database files to `.gitignore`:

```text
# SQLite session database
.contexture/sessions.db
.contexture/sessions.db-wal
.contexture/sessions.db-shm
```

### Step 3: Run Initial Migration

Import existing POSIX session records into SQLite:

```sh
ctx storage-fts5 migrate --from=posix --to=fts5
```

## Verify

Verify the installation against the Storage SPI compliance harness:

```sh
tests/storage-compliance.sh --driver=fts5
```

Verify bidirectional migration:

```sh
# Export records back to POSIX files
ctx storage-fts5 migrate --from=fts5 --to=posix --unit=<unit>

# Ingest records back into SQLite
ctx storage-fts5 migrate --from=posix --to=fts5 --unit=<unit>
```

## Needs

- System `sqlite3` with FTS5, JSON, and trigram support (standard on macOS and Linux).
- No external node, python, or compiler toolchains required.

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `.contexture/modules/storage-fts5/module` | authored fresh: module summary line |
| `.contexture/modules/storage-fts5/schema.sql` | authored fresh: relational SQLite schema, triggers, and FTS5 tables |
| `.contexture/modules/storage-fts5/drivers/fts5` | authored fresh: 26-method SPI driver with pure SQL RRF ranking |
| `.contexture/modules/storage-fts5/scripts/migrate` | authored fresh: bidirectional migration CLI verb |
| `tests/test-driver.sh` | authored fresh: SPI compliance test runner |
| `tests/test-migration.sh` | authored fresh: round-trip bidirectional migration verification |
| `tests/run.sh` | authored fresh: named test runner over plugin test suites |
| `README.md` | authored fresh: onboarding guide and technical reference |
