-- derive.sql: rebuilds the derived search tables (lines, search_documents with the FTS5
-- tables through their triggers) of every unit in temp.touched (unit), inside the caller's
-- transaction, from the typed tables through the canonical renderer views of schema.sql.
-- Needs split.sql read first.
--
-- lines: the searched text of a unit in the order of the exact rule (docs/the-engine.md,
-- Search): the state, the backlog, the knowledge, the journal (each present artifact as its
-- preamble then every item's span), then every lane in bytewise order with its recipe, lane
-- journal, report; each line is attributed by the head rule: a column-0 @task, @finding, or
-- @entry line (the id its second blank separated token, cut at a parenthesis) moves the
-- attribution to that task, finding, entry (a lane entry inside a lane's texts), a main
-- @anchor line moves it back to the session, any other line keeps it; each text starts at
-- its default (the session for a main text, the lane for a lane text).
DELETE FROM lines WHERE unit IN (SELECT unit FROM temp.touched);
DELETE FROM search_documents WHERE unit IN (SELECT unit FROM temp.touched);

DROP TABLE IF EXISTS temp.dt;
CREATE TEMP TABLE dt (id INTEGER PRIMARY KEY, unit TEXT NOT NULL, lane TEXT NOT NULL, aord INTEGER NOT NULL, section TEXT NOT NULL, body TEXT NOT NULL);
INSERT INTO temp.dt (unit, lane, aord, section, body)
SELECT s.unit, '', 1, 'state', s.body FROM v_state_text s WHERE s.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT p.unit, '', CASE p.artifact WHEN 'backlog' THEN 2 WHEN 'knowledge' THEN 3 ELSE 4 END, p.artifact,
  p.preamble || coalesce(CASE p.artifact
    WHEN 'backlog' THEN (SELECT group_concat(t.span, '' ORDER BY t.pos) FROM v_task_span t WHERE t.unit = p.unit)
    WHEN 'knowledge' THEN (SELECT group_concat(f.span, '' ORDER BY f.pos) FROM v_finding_span f WHERE f.unit = p.unit)
    ELSE (SELECT group_concat(j.span, '' ORDER BY j.pos) FROM v_journal_span j WHERE j.unit = p.unit AND j.lane = '') END, '')
FROM preambles p WHERE p.preamble IS NOT NULL AND p.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT l.unit, l.lane, 1, 'lane_recipe', l.recipe FROM lanes l WHERE l.recipe IS NOT NULL AND l.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT l.unit, l.lane, 2, 'lane_journal', l.journal_preamble ||
  coalesce((SELECT group_concat(j.span, '' ORDER BY j.pos) FROM v_journal_span j WHERE j.unit = l.unit AND j.lane = l.lane), '')
FROM lanes l WHERE l.journal_preamble IS NOT NULL AND l.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT l.unit, l.lane, 3, 'lane_report', l.report FROM lanes l WHERE l.report IS NOT NULL AND l.unit IN (SELECT unit FROM temp.touched);

DELETE FROM temp.split_in;
INSERT INTO temp.split_in (id, body) SELECT id, body FROM temp.dt;

INSERT INTO lines (unit, lane, aord, lno, section, line, entity_type, entity_id)
WITH
a AS (
  SELECT d.id AS id, d.unit AS unit, d.lane AS lane, d.aord AS aord, d.section AS section, s.n AS n, s.line AS line,
    -- the head word and id of a column-0 @ line (a trailing carriage return left out)
    CASE WHEN substr(s.line, 1, 1) = '@' AND substr(s.line, 2, 1) GLOB '[a-zA-Z0-9_-]'
      THEN replace(CASE WHEN substr(s.line, -1) = char(13) THEN substr(s.line, 2, length(s.line) - 2) ELSE substr(s.line, 2) END, char(9), ' ') END AS h
  FROM temp.dt d JOIN temp.split_lines s ON s.id = d.id
),
b AS (
  SELECT a.*,
    CASE WHEN h IS NULL THEN NULL WHEN instr(h, ' ') > 0 THEN substr(h, 1, instr(h, ' ') - 1) ELSE h END AS hw,
    CASE WHEN h IS NULL OR instr(h, ' ') = 0 THEN '' ELSE ltrim(substr(h, instr(h, ' ') + 1), ' ') END AS hr
  FROM a
),
c AS (
  SELECT b.*,
    CASE WHEN instr(hr, ' ') > 0 THEN substr(hr, 1, instr(hr, ' ') - 1) ELSE hr END AS hid0
  FROM b
),
e AS (
  SELECT c.id, c.unit, c.lane, c.aord, c.section, c.n, c.line,
    CASE WHEN hw = 'task' THEN 'task' WHEN hw = 'finding' THEN 'finding'
         WHEN hw = 'entry' AND c.lane <> '' THEN 'lane_entry' WHEN hw = 'entry' THEN 'entry'
         WHEN hw = 'anchor' AND c.lane = '' THEN 'session' END AS ht,
    CASE WHEN instr(hid0, '(') > 0 THEN substr(hid0, 1, instr(hid0, '(') - 1) ELSE hid0 END AS hid
  FROM c
),
g AS (
  SELECT e.*, max(CASE WHEN ht IS NOT NULL THEN n END) OVER (PARTITION BY id ORDER BY n ROWS UNBOUNDED PRECEDING) AS hn
  FROM e
)
SELECT g.unit, g.lane, g.aord, g.n, g.section, g.line,
  CASE WHEN h.ht IS NULL THEN CASE WHEN g.lane = '' THEN 'session' ELSE 'lane' END ELSE h.ht END,
  CASE WHEN h.ht IS NULL THEN CASE WHEN g.lane = '' THEN g.unit ELSE g.lane END
       WHEN h.ht = 'session' THEN g.unit
       WHEN h.ht = 'lane_entry' THEN g.lane || '/' || h.hid
       ELSE h.hid END
FROM g LEFT JOIN e h ON h.id = g.id AND h.n = g.hn;

-- the ranked search documents: the state, every task, finding, and entry by its span, every
-- lane recipe and report, every lane entry by its span
INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body)
SELECT s.unit, 'session', s.unit, 'state', s.unit, s.body FROM v_state_text s WHERE s.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT t.unit, 'task', t.slug, 'backlog', t.slug || ': ' || coalesce(x.objective, ''), t.span
FROM v_task_span t JOIN tasks x ON x.unit = t.unit AND x.pos = t.pos
WHERE t.kind = 'task' AND t.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT f.unit, 'finding', f.name, 'knowledge', f.name, f.span FROM v_finding_span f
WHERE f.kind = 'finding' AND f.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT j.unit, CASE WHEN j.lane = '' THEN 'entry' ELSE 'lane_entry' END,
  CASE WHEN j.lane = '' THEN j.slug ELSE j.lane || '/' || j.slug END,
  CASE WHEN j.lane = '' THEN 'journal' ELSE 'lane_journal' END,
  CASE WHEN j.lane = '' THEN j.slug ELSE j.lane || '/' || j.slug END, j.span
FROM v_journal_span j WHERE j.kind = 'entry' AND j.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT l.unit, 'lane', l.lane, 'lane_recipe', l.lane, l.recipe FROM lanes l WHERE l.recipe IS NOT NULL AND l.unit IN (SELECT unit FROM temp.touched)
UNION ALL
SELECT l.unit, 'lane', l.lane, 'lane_report', l.lane, l.report FROM lanes l WHERE l.report IS NOT NULL AND l.unit IN (SELECT unit FROM temp.touched);

DELETE FROM temp.split_in;
DROP TABLE IF EXISTS temp.dt;
