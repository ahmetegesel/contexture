-- SQLite relational DDL and FTS5 indexing schema for contexture storage
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS sessions (
  unit TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'CLOSED')) DEFAULT 'ACTIVE',
  current_anchor TEXT NOT NULL DEFAULT 'A1',
  objective TEXT NOT NULL,
  next_action TEXT NOT NULL DEFAULT 'plan the next move',
  repos TEXT NOT NULL DEFAULT '[]',
  ref_sessions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('TODO', 'IN_PROGRESS', 'DONE', 'DROPPED')) DEFAULT 'TODO',
  objective TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria TEXT NOT NULL DEFAULT '',
  implementation_details TEXT NOT NULL DEFAULT '',
  refs TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  dropped_at TEXT,
  drop_reason TEXT,
  UNIQUE(unit, slug),
  FOREIGN KEY (unit) REFERENCES sessions(unit) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit TEXT NOT NULL,
  slug TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('ENTRY', 'ANCHOR')) DEFAULT 'ENTRY',
  anchor TEXT NOT NULL,
  what TEXT NOT NULL,
  entry_group TEXT,
  thread TEXT NOT NULL DEFAULT 'none',
  ref TEXT,
  rhythm TEXT,
  is_knowledge INTEGER NOT NULL DEFAULT 0 CHECK(is_knowledge IN (0, 1)),
  closes TEXT,
  supersedes TEXT,
  verdict TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(unit, slug),
  FOREIGN KEY (unit) REFERENCES sessions(unit) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'SUPERSEDED', 'DROPPED')) DEFAULT 'ACTIVE',
  summary TEXT NOT NULL,
  ref TEXT,
  supersedes TEXT,
  superseded_by TEXT,
  supersede_reason TEXT,
  drop_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(unit, name),
  FOREIGN KEY (unit) REFERENCES sessions(unit) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lanes (
  unit TEXT NOT NULL,
  lane_slug TEXT NOT NULL,
  goal TEXT NOT NULL,
  recipe TEXT NOT NULL,
  report TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (unit, lane_slug),
  FOREIGN KEY (unit) REFERENCES sessions(unit) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lane_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit TEXT NOT NULL,
  lane_slug TEXT NOT NULL,
  slug TEXT NOT NULL,
  what TEXT NOT NULL,
  thread TEXT NOT NULL DEFAULT 'none',
  ref TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(unit, lane_slug, slug),
  FOREIGN KEY (unit, lane_slug) REFERENCES lanes(unit, lane_slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS search_documents (
  doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_prose USING fts5(
  title,
  body,
  content='search_documents',
  content_rowid='doc_id',
  tokenize='porter unicode61 remove_diacritics 0'
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_code USING fts5(
  title,
  body,
  content='search_documents',
  content_rowid='doc_id',
  tokenize='trigram'
);

-- Search document synchronization triggers for FTS tables
CREATE TRIGGER IF NOT EXISTS trg_search_docs_ai AFTER INSERT ON search_documents BEGIN
  INSERT INTO fts_prose(rowid, title, body) VALUES (new.doc_id, new.title, new.body);
  INSERT INTO fts_code(rowid, title, body) VALUES (new.doc_id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_docs_ad AFTER DELETE ON search_documents BEGIN
  INSERT INTO fts_prose(fts_prose, rowid, title, body) VALUES ('delete', old.doc_id, old.title, old.body);
  INSERT INTO fts_code(fts_code, rowid, title, body) VALUES ('delete', old.doc_id, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS trg_search_docs_au AFTER UPDATE ON search_documents BEGIN
  INSERT INTO fts_prose(fts_prose, rowid, title, body) VALUES ('delete', old.doc_id, old.title, old.body);
  INSERT INTO fts_prose(rowid, title, body) VALUES (new.doc_id, new.title, new.body);
  INSERT INTO fts_code(fts_code, rowid, title, body) VALUES ('delete', old.doc_id, old.title, old.body);
  INSERT INTO fts_code(rowid, title, body) VALUES (new.doc_id, new.title, new.body);
END;

-- Entity synchronization triggers for search_documents
-- Sessions
CREATE TRIGGER IF NOT EXISTS trg_sessions_ai AFTER INSERT ON sessions BEGIN
  INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body)
  VALUES (new.unit, 'session', new.unit, 'objective', new.unit, new.objective);
END;
CREATE TRIGGER IF NOT EXISTS trg_sessions_au AFTER UPDATE ON sessions BEGIN
  UPDATE search_documents
  SET title = new.unit, body = new.objective
  WHERE unit = new.unit AND entity_type = 'session' AND entity_id = new.unit AND section = 'objective';
END;
CREATE TRIGGER IF NOT EXISTS trg_sessions_ad AFTER DELETE ON sessions BEGIN
  DELETE FROM search_documents WHERE unit = old.unit AND entity_type = 'session' AND entity_id = old.unit;
END;

-- Tasks
CREATE TRIGGER IF NOT EXISTS trg_tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body)
  VALUES (new.unit, 'task', new.slug, 'task', new.slug || ': ' || new.objective,
          new.objective || char(10) || new.description || char(10) || new.acceptance_criteria || char(10) || new.implementation_details);
END;
CREATE TRIGGER IF NOT EXISTS trg_tasks_au AFTER UPDATE ON tasks BEGIN
  UPDATE search_documents
  SET title = new.slug || ': ' || new.objective,
      body = new.objective || char(10) || new.description || char(10) || new.acceptance_criteria || char(10) || new.implementation_details
  WHERE unit = new.unit AND entity_type = 'task' AND entity_id = new.slug;
END;
CREATE TRIGGER IF NOT EXISTS trg_tasks_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM search_documents WHERE unit = old.unit AND entity_type = 'task' AND entity_id = old.slug;
END;

-- Entries
CREATE TRIGGER IF NOT EXISTS trg_entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body)
  VALUES (new.unit, 'entry', new.slug, 'journal', new.slug, new.what);
END;
CREATE TRIGGER IF NOT EXISTS trg_entries_au AFTER UPDATE ON entries BEGIN
  UPDATE search_documents
  SET title = new.slug, body = new.what
  WHERE unit = new.unit AND entity_type = 'entry' AND entity_id = new.slug;
END;
CREATE TRIGGER IF NOT EXISTS trg_entries_ad AFTER DELETE ON entries BEGIN
  DELETE FROM search_documents WHERE unit = old.unit AND entity_type = 'entry' AND entity_id = old.slug;
END;

-- Findings
CREATE TRIGGER IF NOT EXISTS trg_findings_ai AFTER INSERT ON findings BEGIN
  INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body)
  VALUES (new.unit, 'finding', new.name, 'knowledge', new.name, new.summary);
END;
CREATE TRIGGER IF NOT EXISTS trg_findings_au AFTER UPDATE ON findings BEGIN
  UPDATE search_documents
  SET title = new.name, body = new.summary
  WHERE unit = new.unit AND entity_type = 'finding' AND entity_id = new.name;
END;
CREATE TRIGGER IF NOT EXISTS trg_findings_ad AFTER DELETE ON findings BEGIN
  DELETE FROM search_documents WHERE unit = old.unit AND entity_type = 'finding' AND entity_id = old.name;
END;

-- Lanes
CREATE TRIGGER IF NOT EXISTS trg_lanes_ai AFTER INSERT ON lanes BEGIN
  INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body)
  VALUES (new.unit, 'lane', new.lane_slug, 'recipe', new.lane_slug || ': ' || new.goal, new.recipe || char(10) || new.report);
END;
CREATE TRIGGER IF NOT EXISTS trg_lanes_au AFTER UPDATE ON lanes BEGIN
  UPDATE search_documents
  SET title = new.lane_slug || ': ' || new.goal, body = new.recipe || char(10) || new.report
  WHERE unit = new.unit AND entity_type = 'lane' AND entity_id = new.lane_slug;
END;
CREATE TRIGGER IF NOT EXISTS trg_lanes_ad AFTER DELETE ON lanes BEGIN
  DELETE FROM search_documents WHERE unit = old.unit AND entity_type = 'lane' AND entity_id = old.lane_slug;
END;

-- Lane Entries
CREATE TRIGGER IF NOT EXISTS trg_lane_entries_ai AFTER INSERT ON lane_entries BEGIN
  INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body)
  VALUES (new.unit, 'lane_entry', new.lane_slug || '/' || new.slug, 'lane_journal', new.lane_slug || '/' || new.slug, new.what);
END;
CREATE TRIGGER IF NOT EXISTS trg_lane_entries_au AFTER UPDATE ON lane_entries BEGIN
  UPDATE search_documents
  SET title = new.lane_slug || '/' || new.slug, body = new.what
  WHERE unit = new.unit AND entity_type = 'lane_entry' AND entity_id = new.lane_slug || '/' || new.slug;
END;
CREATE TRIGGER IF NOT EXISTS trg_lane_entries_ad AFTER DELETE ON lane_entries BEGIN
  DELETE FROM search_documents WHERE unit = old.unit AND entity_type = 'lane_entry' AND entity_id = old.lane_slug || '/' || old.slug;
END;
