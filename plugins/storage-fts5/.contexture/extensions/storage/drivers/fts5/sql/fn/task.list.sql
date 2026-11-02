-- task.list <unit> <TODO|IN_PROGRESS|DONE|all>: {unit, tasks: [TaskItem]} in backlog order
BEGIN;
.read lib/held.sql
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('backlog');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'tasks', json((SELECT json_group_array(json(t.ji) ORDER BY t.pos) FROM temp.jtask t
  WHERE t.unit = a.unit AND (a.a1 = 'all' OR t.status = a.a1)))) FROM temp.a a;
COMMIT;
