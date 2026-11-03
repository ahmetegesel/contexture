-- schema.sql: the fts5 store at schema version 5 (PRAGMA user_version 5), the contract 3
-- store-only card (docs/the-engine.md, The descriptor and the handshake). The store holds
-- module data only: the generic store keyed by (namespace, key), its optional change log,
-- and the derived store documents the module's search schema declares, indexed by the two
-- FTS5 tables. The record's typed tables, views, and search deriver left the driver with
-- contract 3; the record is the unit module's data over the store. A fresh store runs this
-- file whole; db-init.sh sets user_version 5 after it, and a store at any other version is
-- refused with no upgrade path (the record re-enters a fresh store through the ctx verbs).
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- The generic module store: module-owned data keyed by (namespace, key), the value opaque
-- bytes, updated_at the write time. The default BINARY text collation makes the primary
-- key's order bytewise, the contract's list order.
CREATE TABLE IF NOT EXISTS store (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
);

-- The optional generic change log: one row per put and delete, never edited or pruned;
-- head is the workspace git HEAD the verb passed (or none), prior the key's state before
-- the change (absent or present), so a window of rows yields each key's net status.
CREATE TABLE IF NOT EXISTS store_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  op TEXT NOT NULL,
  head TEXT NOT NULL,
  prior TEXT NOT NULL CHECK(prior IN ('absent', 'present'))
);
CREATE INDEX IF NOT EXISTS idx_store_changes_ns ON store_changes(namespace, seq);
CREATE INDEX IF NOT EXISTS idx_store_changes_head ON store_changes(head);

-- The derived store documents (the search schema): one row per entity the module's data
-- file declares, rebuilt for a key in the transaction of every put and delete. The sig is
-- the search schema's signature; a namespace whose stored signature differs is re-derived
-- whole before a ranked search. The FTS5 tables index the documents through the triggers;
-- the exact rule is computed over the raw values, never here.
CREATE TABLE IF NOT EXISTS store_docs (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  section TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  ord INTEGER NOT NULL,
  sig TEXT NOT NULL,
  PRIMARY KEY (namespace, key, ord)
);
CREATE INDEX IF NOT EXISTS idx_store_docs_ns ON store_docs(namespace, key);

CREATE TABLE IF NOT EXISTS store_docs_schema (
  namespace TEXT PRIMARY KEY,
  sig TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS store_fts_prose USING fts5(
  title,
  body,
  content='store_docs',
  content_rowid='rowid',
  tokenize='porter unicode61 remove_diacritics 0'
);

CREATE VIRTUAL TABLE IF NOT EXISTS store_fts_code USING fts5(
  title,
  body,
  content='store_docs',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS trg_store_docs_ai AFTER INSERT ON store_docs BEGIN
  INSERT INTO store_fts_prose(rowid, title, body) VALUES (new.rowid, new.title, new.body);
  INSERT INTO store_fts_code(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS trg_store_docs_ad AFTER DELETE ON store_docs BEGIN
  INSERT INTO store_fts_prose(store_fts_prose, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO store_fts_code(store_fts_code, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS trg_store_docs_au AFTER UPDATE ON store_docs BEGIN
  INSERT INTO store_fts_prose(store_fts_prose, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO store_fts_prose(rowid, title, body) VALUES (new.rowid, new.title, new.body);
  INSERT INTO store_fts_code(store_fts_code, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO store_fts_code(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
