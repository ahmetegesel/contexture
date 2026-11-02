-- entry.get <unit> <slug>: {unit, entry: Entry}, the last occurrence, with its closure
BEGIN;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'entry ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE NOT EXISTS (SELECT 1 FROM journal_items j WHERE j.unit = a.unit AND j.kind = 'entry' AND j.slug = a.a1);
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('journal');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'entry', json((SELECT e.jc FROM temp.jent e WHERE e.unit = a.unit AND e.lane = '' AND e.kind = 'entry'
  AND e.slug = a.a1 ORDER BY e.pos DESC LIMIT 1))) FROM temp.a a;
COMMIT;
