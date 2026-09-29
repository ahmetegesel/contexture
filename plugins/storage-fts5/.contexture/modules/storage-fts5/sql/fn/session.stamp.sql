-- session.stamp <unit> | date: {unit, previous_anchor, current_anchor, receipt: Anchor}:
-- current_anchor A<N> becomes A<N+1> and the canonical anchor @anchor A<N+1> <date> is
-- appended, one transaction (R18); the anchor carries no receipt text (end review item 7)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key date' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'date');
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'date takes YYYY-MM-DD' FROM temp.pay WHERE k = 'date'
  AND NOT (v GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
.read lib/anchor.sql
.read lib/stop.sql
CREATE TEMP TABLE stp AS SELECT u.current_anchor AS prev, 'A' || (CAST(substr(u.current_anchor, 2) AS INTEGER) + 1) AS cur
  FROM units u WHERE u.unit = (SELECT unit FROM temp.a);
UPDATE units SET current_anchor = (SELECT cur FROM temp.stp) WHERE unit = (SELECT unit FROM temp.a);
INSERT INTO temp.jn (lane, kind, anchor, stamp_date) SELECT '', 'anchor', s.cur, (SELECT v FROM temp.pay WHERE k = 'date') FROM temp.stp s;
.read lib/jappend.sql
INSERT INTO temp.tart SELECT unit, 'state' FROM temp.a;
INSERT INTO temp.tart SELECT unit, 'journal' FROM temp.a;
.read lib/touch.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('journal');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'previous_anchor', s.prev, 'current_anchor', s.cur,
  'receipt', json((SELECT e.j FROM temp.jent e WHERE e.unit = a.unit AND e.lane = '' ORDER BY e.pos DESC LIMIT 1)))
FROM temp.a a, temp.stp s;
COMMIT;
