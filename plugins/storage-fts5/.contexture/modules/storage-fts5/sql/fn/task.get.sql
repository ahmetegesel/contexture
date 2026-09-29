-- task.get <unit> <slug>: {unit, task: Task} (the first task of the slug)
BEGIN;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'task ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE NOT EXISTS (SELECT 1 FROM tasks t WHERE t.unit = a.unit AND t.slug = a.a1);
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('backlog');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'task', json((SELECT t.j FROM temp.jtask t WHERE t.unit = a.unit AND t.slug = a.a1 ORDER BY t.pos LIMIT 1)))
FROM temp.a a;
COMMIT;
