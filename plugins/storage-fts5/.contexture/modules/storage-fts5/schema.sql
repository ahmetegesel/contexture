-- schema.sql: the fts5 store at schema version 4 (PRAGMA user_version 4), the typed tables
-- of the contract 2 record data model (docs/the-engine.md, The record data model). The
-- store holds the record as typed rows, never as markdown and never as stored text: an item
-- keeps exactly the fields the functions write, and every read renders it in the canonical
-- layout. No function writes legacy text, so the legacy fields of the data model (an
-- entry's legacy status and extra fields, an item's head text and extra lines, a closer's
-- extra text, an opaque item) have no column here and always answer null or empty. An item
-- is keyed by (unit, lane, pos): lane '' is the main journal,
-- pos the 1 based position the writer assigns in its artifact; ordinal, seq, occurrence,
-- next, and liveness are derived by the reads, never stored. Two derived tables serve the
-- search and are rebuilt per unit in the transaction of every write (derive.sql): lines
-- (the exact rule) and search_documents (the ranked modes, through fts_prose and fts_code).
-- The corpus tables (docs, doc_changes) are carried unchanged from version 3.
-- A fresh store runs this file whole; db-init.sh sets user_version 4 after it.
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- The state of each unit: a held unit is a row here. repos and ref_sessions are JSON arrays
-- of strings in stored order; ref_sessions NULL means the state carries no ref_sessions line.
CREATE TABLE IF NOT EXISTS units (
  unit TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  current_anchor TEXT NOT NULL,
  next_action TEXT NOT NULL,
  objective TEXT NOT NULL,
  repos TEXT NOT NULL DEFAULT '[]',
  ref_sessions TEXT
);

-- The preamble of each main block artifact: the exact bytes before its first item; NULL
-- means the artifact is absent, '' present with nothing before the first item. A lane
-- journal's preamble lives on its lanes row.
CREATE TABLE IF NOT EXISTS preambles (
  unit TEXT NOT NULL,
  artifact TEXT NOT NULL CHECK (artifact IN ('backlog', 'knowledge', 'journal')),
  preamble TEXT,
  PRIMARY KEY (unit, artifact),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);

-- The backlog's tasks: description, criteria, details are the block bodies (NULL when the
-- section is absent); REFS elements live in item_refs (artifact 'backlog').
CREATE TABLE IF NOT EXISTS tasks (
  unit TEXT NOT NULL,
  pos INTEGER NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL,
  objective TEXT NOT NULL,
  description TEXT,
  criteria TEXT,
  details TEXT,
  PRIMARY KEY (unit, pos),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tasks_slug ON tasks(unit, slug);

-- The knowledge's findings: supersedes_name NULL when the finding supersedes none
-- (supersedes_reason then NULL too); REF lines live in finding_refs.
CREATE TABLE IF NOT EXISTS findings (
  unit TEXT NOT NULL,
  pos INTEGER NOT NULL,
  name TEXT NOT NULL,
  supersedes_name TEXT,
  supersedes_reason TEXT,
  summary TEXT NOT NULL,
  PRIMARY KEY (unit, pos),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_findings_name ON findings(unit, name);

-- The main journal items: an entry (slug, the one line fields, knowledge 0 or 1) or an
-- anchor (anchor, continues, attention). REF lines and closers live in item_refs (artifact
-- 'journal') and closers with closer_targets, with lane ''.
CREATE TABLE IF NOT EXISTS journal_items (
  unit TEXT NOT NULL,
  pos INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('entry', 'anchor')),
  slug TEXT,
  anchor TEXT,
  what TEXT,
  grp TEXT,
  rhythm TEXT,
  knowledge INTEGER NOT NULL DEFAULT 0 CHECK (knowledge IN (0, 1)),
  thread TEXT,
  continues TEXT,
  attention TEXT,
  PRIMARY KEY (unit, pos),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_journal_items_slug ON journal_items(unit, slug);

-- The lanes of a unit: the recipe and the report as stored (NULL when absent), and the
-- lane journal's preamble (NULL when the lane holds no journal).
CREATE TABLE IF NOT EXISTS lanes (
  unit TEXT NOT NULL,
  lane TEXT NOT NULL,
  recipe TEXT,
  report TEXT,
  journal_preamble TEXT,
  PRIMARY KEY (unit, lane),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);

-- The lane journal items: the journal item shape keyed by the lane.
CREATE TABLE IF NOT EXISTS lane_items (
  unit TEXT NOT NULL,
  lane TEXT NOT NULL,
  pos INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('entry', 'anchor')),
  slug TEXT,
  anchor TEXT,
  what TEXT,
  grp TEXT,
  rhythm TEXT,
  knowledge INTEGER NOT NULL DEFAULT 0 CHECK (knowledge IN (0, 1)),
  thread TEXT,
  continues TEXT,
  attention TEXT,
  PRIMARY KEY (unit, lane, pos),
  FOREIGN KEY (unit, lane) REFERENCES lanes(unit, lane) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lane_items_slug ON lane_items(unit, lane, slug);

-- The closer lines of an entry (lane '' the main journal, else a lane journal), cpos their
-- line order.
CREATE TABLE IF NOT EXISTS closers (
  unit TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT '',
  pos INTEGER NOT NULL,
  cpos INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('CLOSES', 'SUPERSEDES')),
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('done', 'superseded', 'dropped', 'folded')),
  reason TEXT,
  PRIMARY KEY (unit, lane, pos, cpos),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);

-- The targets of each closer line in order: the liveness source (an occurrence is closed by
-- a later closer naming its slug), indexed by the target.
CREATE TABLE IF NOT EXISTS closer_targets (
  unit TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT '',
  pos INTEGER NOT NULL,
  cpos INTEGER NOT NULL,
  tpos INTEGER NOT NULL,
  target TEXT NOT NULL,
  PRIMARY KEY (unit, lane, pos, cpos, tpos),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_closer_targets_target ON closer_targets(unit, lane, target);

-- The list fields of backlog and journal items in order: a task's REFS elements (artifact
-- 'backlog', lane ''), an entry's or lane entry's REF lines (artifact 'journal').
CREATE TABLE IF NOT EXISTS item_refs (
  unit TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT '',
  artifact TEXT NOT NULL CHECK (artifact IN ('backlog', 'journal')),
  pos INTEGER NOT NULL,
  rpos INTEGER NOT NULL,
  ref TEXT NOT NULL,
  PRIMARY KEY (unit, lane, artifact, pos, rpos),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);

-- The REF lines of a finding in order.
CREATE TABLE IF NOT EXISTS finding_refs (
  unit TEXT NOT NULL,
  pos INTEGER NOT NULL,
  rpos INTEGER NOT NULL,
  ref TEXT NOT NULL,
  PRIMARY KEY (unit, pos, rpos),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);

-- The exact search lines (derived): every line of the unit's searched text in the order of
-- the exact rule (the state, the backlog, the knowledge, the journal, then each lane in
-- bytewise order with its recipe, journal, report; aord orders a unit's or a lane's
-- artifacts), line without its newline (a legacy carriage return kept), and the entity the
-- line belongs to by the head rule of docs/the-engine.md, Search.
CREATE TABLE IF NOT EXISTS lines (
  unit TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT '',
  aord INTEGER NOT NULL,
  lno INTEGER NOT NULL,
  section TEXT NOT NULL,
  line TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY (unit, lane, aord, lno),
  FOREIGN KEY (unit) REFERENCES units(unit) ON DELETE CASCADE
);

-- The ranked search documents (derived): one per session state, task, finding, entry,
-- lane recipe, lane report, and lane entry, the body its rendered text; the FTS5 tables
-- index them through the triggers below.
CREATE TABLE IF NOT EXISTS search_documents (
  doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_documents_unit ON search_documents(unit);

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

-- a unit leaving the store takes its search documents along (the FTS rows follow through
-- the delete trigger); every other table cascades from units
CREATE TRIGGER IF NOT EXISTS trg_units_ad AFTER DELETE ON units BEGIN
  DELETE FROM search_documents WHERE unit = old.unit;
END;

-- ==============================================================================
-- The canonical renderer (docs/the-engine.md, The canonical lines), as views: each item's
-- span is its canonical lines followed by one empty line when a next item exists and is not
-- an anchor, the text every backend prints for the same data. derive.sql builds the
-- searched text from them; they read the typed tables only.
-- ==============================================================================

-- the state text of each unit
CREATE VIEW IF NOT EXISTS v_state_text AS
SELECT u.unit AS unit,
  'status: ' || u.status || char(10) ||
  'current_anchor: ' || u.current_anchor || char(10) ||
  'next_action: "' || u.next_action || '"' || char(10) ||
  'objective: "' || u.objective || '"' || char(10) ||
  'repos: [' || coalesce((SELECT group_concat(j.value, ', ' ORDER BY j.key) FROM json_each(u.repos) j), '') || ']' || char(10) ||
  CASE WHEN u.ref_sessions IS NULL THEN '' ELSE
    'ref_sessions: [' || coalesce((SELECT group_concat(j.value, ', ' ORDER BY j.key) FROM json_each(u.ref_sessions) j), '') || ']' || char(10) END
  AS body
FROM units u;

-- the backlog's tasks with their spans
CREATE VIEW IF NOT EXISTS v_task_span AS
SELECT t.unit AS unit, t.pos AS pos, t.slug AS slug,
  '@task ' || t.slug || char(10) ||
  '  STATUS: ' || t.status || char(10) ||
  '  OBJECTIVE: "' || t.objective || '"' || char(10) ||
  coalesce((SELECT '  REFS: [' || group_concat(r.ref, ', ' ORDER BY r.rpos) || ']' || char(10)
    FROM item_refs r WHERE r.unit = t.unit AND r.lane = '' AND r.artifact = 'backlog' AND r.pos = t.pos), '') ||
  CASE WHEN t.description IS NULL THEN '' WHEN t.description = '' THEN '  DESCRIPTION ::' || char(10) ELSE
    replace(replace('  DESCRIPTION ::' || char(10) || '    ' || replace(t.description, char(10), char(10) || '    ') || char(10),
      char(10) || '    ' || char(10), char(10) || char(10)), char(10) || '    ' || char(10), char(10) || char(10)) END ||
  CASE WHEN t.criteria IS NULL THEN '' WHEN t.criteria = '' THEN '  ACCEPTANCE CRITERIA ::' || char(10) ELSE
    replace(replace('  ACCEPTANCE CRITERIA ::' || char(10) || '    ' || replace(t.criteria, char(10), char(10) || '    ') || char(10),
      char(10) || '    ' || char(10), char(10) || char(10)), char(10) || '    ' || char(10), char(10) || char(10)) END ||
  CASE WHEN t.details IS NULL THEN '' WHEN t.details = '' THEN '  IMPLEMENTATION DETAILS ::' || char(10) ELSE
    replace(replace('  IMPLEMENTATION DETAILS ::' || char(10) || '    ' || replace(t.details, char(10), char(10) || '    ') || char(10),
      char(10) || '    ' || char(10), char(10) || char(10)), char(10) || '    ' || char(10), char(10) || char(10)) END ||
  CASE WHEN EXISTS (SELECT 1 FROM tasks n WHERE n.unit = t.unit AND n.pos > t.pos) THEN char(10) ELSE '' END
  AS span
FROM tasks t;

-- the knowledge's findings with their spans
CREATE VIEW IF NOT EXISTS v_finding_span AS
SELECT f.unit AS unit, f.pos AS pos, f.name AS name,
  '@finding ' || f.name || char(10) ||
  CASE WHEN f.supersedes_name IS NULL THEN '' ELSE '  SUPERSEDES: ' || f.supersedes_name || ' (' || coalesce(f.supersedes_reason, '') || ')' || char(10) END ||
  coalesce((SELECT group_concat('  REF: "' || r.ref || '"' || char(10), '' ORDER BY r.rpos)
    FROM finding_refs r WHERE r.unit = f.unit AND r.pos = f.pos), '') ||
  CASE WHEN f.summary = '' THEN '  SUMMARY ::' || char(10) ELSE
    replace(replace('  SUMMARY ::' || char(10) || '    ' || replace(f.summary, char(10), char(10) || '    ') || char(10),
      char(10) || '    ' || char(10), char(10) || char(10)), char(10) || '    ' || char(10), char(10) || char(10)) END ||
  CASE WHEN EXISTS (SELECT 1 FROM findings n WHERE n.unit = f.unit AND n.pos > f.pos) THEN char(10) ELSE '' END
  AS span
FROM findings f;

-- every closer line, newline terminated
CREATE VIEW IF NOT EXISTS v_closer_line AS
SELECT c.unit AS unit, c.lane AS lane, c.pos AS pos, c.cpos AS cpos,
  '  ' || c.kind || ': ' ||
  coalesce((SELECT group_concat(t.target, ' ' ORDER BY t.tpos) FROM closer_targets t
    WHERE t.unit = c.unit AND t.lane = c.lane AND t.pos = c.pos AND t.cpos = c.cpos), '') ||
  CASE WHEN c.verdict IS NOT NULL THEN ' (' || c.verdict || ': ' || coalesce(c.reason, '') || ')'
       WHEN c.reason IS NOT NULL THEN ' (' || c.reason || ')' ELSE '' END || char(10) AS line
FROM closers c;

-- the journal items of the main journal (lane '') and of every lane journal with their
-- spans: an anchor in the stamp form, an entry in the entry lines (ANCHOR, WHAT, GROUP,
-- RHYTHM, THREAD, REF, the closers, KNOWLEDGE, each when set), in a main and a lane journal
-- alike
CREATE VIEW IF NOT EXISTS v_journal_span AS
SELECT j.unit AS unit, j.lane AS lane, j.pos AS pos, j.kind AS kind, j.slug AS slug,
  CASE WHEN j.kind = 'anchor' THEN
    '@anchor ' || j.anchor ||
    CASE WHEN j.continues IS NOT NULL AND j.attention IS NOT NULL THEN ' ("continues ' || j.continues || '", attention: ' || j.attention || ')' ELSE '' END || char(10)
  ELSE
    '@entry ' || j.slug || char(10) ||
    CASE WHEN j.anchor IS NULL THEN '' ELSE '  ANCHOR: ' || j.anchor || char(10) END ||
    CASE WHEN j.what IS NULL THEN '' ELSE '  WHAT: "' || j.what || '"' || char(10) END ||
    CASE WHEN j.grp IS NULL THEN '' ELSE '  GROUP: ' || j.grp || char(10) END ||
    CASE WHEN j.rhythm IS NULL THEN '' ELSE '  RHYTHM: ' || j.rhythm || char(10) END ||
    CASE WHEN j.thread IS NULL THEN '' ELSE '  THREAD: ' || j.thread || char(10) END ||
    coalesce((SELECT group_concat('  REF: "' || r.ref || '"' || char(10), '' ORDER BY r.rpos)
      FROM item_refs r WHERE r.unit = j.unit AND r.lane = j.lane AND r.artifact = 'journal' AND r.pos = j.pos), '') ||
    coalesce((SELECT group_concat(cl.line, '' ORDER BY cl.cpos)
      FROM v_closer_line cl WHERE cl.unit = j.unit AND cl.lane = j.lane AND cl.pos = j.pos), '') ||
    CASE WHEN j.knowledge = 1 THEN '  KNOWLEDGE: true' || char(10) ELSE '' END
  END ||
  CASE WHEN j.nextk IS NULL OR j.nextk = 'anchor' THEN '' ELSE char(10) END
  AS span
FROM (
  SELECT '' AS lane, i.unit AS unit, i.pos AS pos, i.kind AS kind, i.slug AS slug, i.anchor AS anchor, i.what AS what,
    i.grp AS grp, i.rhythm AS rhythm, i.knowledge AS knowledge, i.thread AS thread, i.continues AS continues,
    i.attention AS attention,
    (SELECT n.kind FROM journal_items n WHERE n.unit = i.unit AND n.pos > i.pos ORDER BY n.pos LIMIT 1) AS nextk
  FROM journal_items i
  UNION ALL
  SELECT i.lane, i.unit, i.pos, i.kind, i.slug, i.anchor, i.what, i.grp, i.rhythm, i.knowledge, i.thread, i.continues,
    i.attention,
    (SELECT n.kind FROM lane_items n WHERE n.unit = i.unit AND n.lane = i.lane AND n.pos > i.pos ORDER BY n.pos LIMIT 1)
  FROM lane_items i
) j;


-- The corpus (unchanged from schema version 3): the agent-facing docs beside the record, one
-- row per doc keyed by (repo, slug), the text verbatim; its canonical address is
-- docs/<repo>/<slug>.md. The corpus is not a unit: no row references units, so no cascade
-- ever reaches it, and no doc is indexed for search (the corpus search stays the docs
-- verbs' own pass).
CREATE TABLE IF NOT EXISTS docs (
  repo TEXT NOT NULL,
  slug TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repo, slug)
);

-- The corpus change log: one row per corpus.write and corpus.remove, never edited or pruned;
-- head is the workspace git HEAD the verb passed (or none), prior the doc's state before
-- the change (absent or present), so a window of rows yields each doc's net status
CREATE TABLE IF NOT EXISTS doc_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  op TEXT NOT NULL,
  repo TEXT NOT NULL,
  slug TEXT NOT NULL,
  head TEXT NOT NULL,
  prior TEXT NOT NULL CHECK(prior IN ('absent', 'present'))
);
CREATE INDEX IF NOT EXISTS idx_doc_changes_head ON doc_changes(head);
