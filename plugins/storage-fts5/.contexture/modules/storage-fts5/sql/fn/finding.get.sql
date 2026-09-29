-- finding.get <unit> <NAME>: {unit, finding: Finding}
BEGIN;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'finding ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE NOT EXISTS (SELECT 1 FROM findings f WHERE f.unit = a.unit AND f.name = a.a1);
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('knowledge');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'finding', json((SELECT f.j FROM temp.jfind f WHERE f.unit = a.unit AND f.name = a.a1 ORDER BY f.pos LIMIT 1)))
FROM temp.a a;
COMMIT;
