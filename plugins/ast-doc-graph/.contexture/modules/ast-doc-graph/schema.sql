/* AST and Documentation Graph Database Schema and DDL */

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

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

CREATE TABLE IF NOT EXISTS indexed_files (
    file TEXT PRIMARY KEY,
    mtime REAL NOT NULL,
    hash TEXT NOT NULL,
    indexed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_indexed_files_mtime ON indexed_files(mtime);

/* ========================================================================= */
/* 2. Full-Text Search (FTS5) Virtual Tables                                 */
/* ========================================================================= */

CREATE VIRTUAL TABLE IF NOT EXISTS fts_symbols USING fts5(
    symbol_id UNINDEXED,
    name,
    qname,
    file,
    docstring,
    tokenize = 'trigram'
);

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

/* ========================================================================= */
/* 4. Cascading Edge Deletion Triggers                                      */
/* ========================================================================= */

CREATE TRIGGER IF NOT EXISTS trg_symbols_del_edges AFTER DELETE ON symbols BEGIN
    DELETE FROM edges WHERE source = old.id OR target = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_docs_del_edges AFTER DELETE ON docs BEGIN
    DELETE FROM edges WHERE source = old.id OR target = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_rules_del_edges AFTER DELETE ON rules BEGIN
    DELETE FROM edges WHERE source = old.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_pitfalls_del_edges AFTER DELETE ON pitfalls BEGIN
    DELETE FROM edges WHERE source = old.id;
END;
