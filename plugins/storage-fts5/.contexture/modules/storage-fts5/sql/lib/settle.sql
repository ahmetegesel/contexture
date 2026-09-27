-- settle.sql: the verbatim rule after a write (D7, D24): each row of temp.stl names an item
-- (tbl task, finding, journal (lane '' the main journal, else a lane journal), or state)
-- and the text it now stores (cand); the item's canonical span is rendered from its typed
-- fields by the views of schema.sql with its verbatim set aside, and the verbatim becomes
-- the candidate exactly when the two differ (an opaque item, which has no canonical span,
-- keeps its candidate). Every row of the unit temp.a names.
CREATE TEMP TABLE IF NOT EXISTS stl (tbl TEXT NOT NULL, lane TEXT NOT NULL DEFAULT '', pos INTEGER NOT NULL DEFAULT 0, cand TEXT NOT NULL);
UPDATE tasks SET verbatim = NULL WHERE unit = (SELECT unit FROM temp.a) AND kind = 'task'
  AND pos IN (SELECT pos FROM temp.stl WHERE tbl = 'task');
UPDATE findings SET verbatim = NULL WHERE unit = (SELECT unit FROM temp.a) AND kind = 'finding'
  AND pos IN (SELECT pos FROM temp.stl WHERE tbl = 'finding');
UPDATE journal_items SET verbatim = NULL WHERE unit = (SELECT unit FROM temp.a)
  AND pos IN (SELECT pos FROM temp.stl WHERE tbl = 'journal' AND lane = '');
UPDATE lane_items SET verbatim = NULL WHERE unit = (SELECT unit FROM temp.a)
  AND EXISTS (SELECT 1 FROM temp.stl s WHERE s.tbl = 'journal' AND s.lane = lane_items.lane AND s.pos = lane_items.pos);
UPDATE units SET verbatim = NULL WHERE unit = (SELECT unit FROM temp.a) AND EXISTS (SELECT 1 FROM temp.stl WHERE tbl = 'state');
DROP TABLE IF EXISTS temp.stc;
CREATE TEMP TABLE stc AS
SELECT s.tbl AS tbl, s.lane AS lane, s.pos AS pos, s.cand AS cand,
  CASE s.tbl
    WHEN 'task' THEN (SELECT v.span FROM v_task_span v WHERE v.unit = (SELECT unit FROM temp.a) AND v.pos = s.pos AND v.kind = 'task')
    WHEN 'finding' THEN (SELECT v.span FROM v_finding_span v WHERE v.unit = (SELECT unit FROM temp.a) AND v.pos = s.pos AND v.kind = 'finding')
    -- a lane entry carrying a field only a main entry holds (ANCHOR, GROUP, RHYTHM, a closer,
    -- KNOWLEDGE) has no canonical lane lines, so it always keeps its verbatim
    WHEN 'journal' THEN CASE WHEN s.lane <> '' AND EXISTS (SELECT 1 FROM lane_items i WHERE i.unit = (SELECT unit FROM temp.a) AND i.lane = s.lane
        AND i.pos = s.pos AND i.kind = 'entry' AND (i.anchor IS NOT NULL OR i.grp IS NOT NULL OR i.rhythm IS NOT NULL OR i.knowledge = 1
          OR EXISTS (SELECT 1 FROM closers c WHERE c.unit = i.unit AND c.lane = i.lane AND c.pos = i.pos)))
      THEN NULL ELSE (SELECT v.span FROM v_journal_span v WHERE v.unit = (SELECT unit FROM temp.a) AND v.lane = s.lane AND v.pos = s.pos) END
    WHEN 'state' THEN (SELECT v.body FROM v_state_text v WHERE v.unit = (SELECT unit FROM temp.a)) END AS canon
FROM temp.stl s;
UPDATE tasks SET verbatim = (SELECT CASE WHEN c.cand IS c.canon THEN NULL ELSE c.cand END FROM temp.stc c WHERE c.tbl = 'task' AND c.pos = tasks.pos)
  WHERE unit = (SELECT unit FROM temp.a) AND pos IN (SELECT pos FROM temp.stc WHERE tbl = 'task');
UPDATE findings SET verbatim = (SELECT CASE WHEN c.cand IS c.canon THEN NULL ELSE c.cand END FROM temp.stc c WHERE c.tbl = 'finding' AND c.pos = findings.pos)
  WHERE unit = (SELECT unit FROM temp.a) AND pos IN (SELECT pos FROM temp.stc WHERE tbl = 'finding');
UPDATE journal_items SET verbatim = (SELECT CASE WHEN c.cand IS c.canon THEN NULL ELSE c.cand END FROM temp.stc c
    WHERE c.tbl = 'journal' AND c.lane = '' AND c.pos = journal_items.pos)
  WHERE unit = (SELECT unit FROM temp.a) AND pos IN (SELECT pos FROM temp.stc WHERE tbl = 'journal' AND lane = '');
UPDATE lane_items SET verbatim = (SELECT CASE WHEN c.cand IS c.canon THEN NULL ELSE c.cand END FROM temp.stc c
    WHERE c.tbl = 'journal' AND c.lane = lane_items.lane AND c.pos = lane_items.pos)
  WHERE unit = (SELECT unit FROM temp.a) AND EXISTS (SELECT 1 FROM temp.stc s WHERE s.tbl = 'journal' AND s.lane = lane_items.lane AND s.pos = lane_items.pos);
UPDATE units SET verbatim = (SELECT CASE WHEN c.cand IS c.canon THEN NULL ELSE c.cand END FROM temp.stc c WHERE c.tbl = 'state')
  WHERE unit = (SELECT unit FROM temp.a) AND EXISTS (SELECT 1 FROM temp.stc WHERE tbl = 'state');
DELETE FROM temp.stl;
