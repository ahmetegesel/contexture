-- idrop.sql: the drop rule (docs/the-engine.md, The record data model) for one backlog or
-- knowledge item (temp.idp: tbl task or finding, pos): its span leaves the artifact, the
-- previous item keeping its bytes, then the artifact's trailing empty lines go (the new last
-- item's stored text, or the preamble when no item stays), the artifact keeping its final
-- newline state
CREATE TEMP TABLE IF NOT EXISTS idp (tbl TEXT, pos INTEGER);
DROP TABLE IF EXISTS temp.idx;
CREATE TEMP TABLE idx AS SELECT d.tbl AS tbl, d.pos AS pos,
  CASE d.tbl WHEN 'task' THEN (SELECT max(pos) FROM tasks WHERE unit = (SELECT unit FROM temp.a))
    ELSE (SELECT max(pos) FROM findings WHERE unit = (SELECT unit FROM temp.a)) END AS last,
  CAST(NULL AS TEXT) AS lastspan
  FROM temp.idp d;
UPDATE temp.idx SET lastspan = CASE tbl WHEN 'task' THEN (SELECT span FROM v_task_span WHERE unit = (SELECT unit FROM temp.a) AND pos = idx.last)
  ELSE (SELECT span FROM v_finding_span WHERE unit = (SELECT unit FROM temp.a) AND pos = idx.last) END;
DELETE FROM item_refs WHERE unit = (SELECT unit FROM temp.a) AND lane = '' AND artifact = 'backlog' AND pos IN (SELECT pos FROM temp.idx WHERE tbl = 'task');
DELETE FROM tasks WHERE unit = (SELECT unit FROM temp.a) AND pos IN (SELECT pos FROM temp.idx WHERE tbl = 'task');
DELETE FROM finding_refs WHERE unit = (SELECT unit FROM temp.a) AND pos IN (SELECT pos FROM temp.idx WHERE tbl = 'finding');
DELETE FROM findings WHERE unit = (SELECT unit FROM temp.a) AND pos IN (SELECT pos FROM temp.idx WHERE tbl = 'finding');
UPDATE temp.idx SET last = CASE tbl WHEN 'task' THEN (SELECT max(pos) FROM tasks WHERE unit = (SELECT unit FROM temp.a))
  ELSE (SELECT max(pos) FROM findings WHERE unit = (SELECT unit FROM temp.a)) END;
DELETE FROM temp.trm;
INSERT INTO temp.trm (id, s0, mode, eof0)
  SELECT 1, CASE x.tbl WHEN 'task' THEN (SELECT span FROM v_task_span WHERE unit = (SELECT unit FROM temp.a) AND pos = x.last)
      ELSE (SELECT span FROM v_finding_span WHERE unit = (SELECT unit FROM temp.a) AND pos = x.last) END,
    'keep', CASE WHEN substr(x.lastspan, -1) = char(10) THEN 0 ELSE 1 END
  FROM temp.idx x WHERE x.last IS NOT NULL;
INSERT INTO temp.trm (id, s0, mode, eof0)
  SELECT 2, coalesce((SELECT preamble FROM preambles WHERE unit = (SELECT unit FROM temp.a) AND artifact = CASE x.tbl WHEN 'task' THEN 'backlog' ELSE 'knowledge' END), ''),
    'keep', CASE WHEN substr(x.lastspan, -1) = char(10) THEN 0 ELSE 1 END
  FROM temp.idx x WHERE x.last IS NULL;
.read lib/trim.sql
UPDATE preambles SET preamble = (SELECT s FROM temp.trm WHERE id = 2)
  WHERE unit = (SELECT unit FROM temp.a) AND EXISTS (SELECT 1 FROM temp.trm WHERE id = 2)
    AND artifact = (SELECT CASE tbl WHEN 'task' THEN 'backlog' ELSE 'knowledge' END FROM temp.idx);
INSERT INTO temp.stl (tbl, pos, cand) SELECT x.tbl, x.last, t.s FROM temp.trm t, temp.idx x WHERE t.id = 1;
.read lib/settle.sql
DELETE FROM temp.idp;
