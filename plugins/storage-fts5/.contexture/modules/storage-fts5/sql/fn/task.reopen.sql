-- task.reopen <unit> <slug>: {unit, task: TaskItem}: IN_PROGRESS or DONE to TODO (R9)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/tfind.sql
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_TRANSITION', 'task ''' || a.a1 || ''' is ' || k.status || '; task.reopen moves only from IN_PROGRESS or DONE'
  FROM temp.tk k, temp.a a WHERE k.status NOT IN ('IN_PROGRESS', 'DONE');
.read lib/stop.sql
UPDATE tasks SET status = 'TODO' WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.tk);
INSERT INTO temp.tart SELECT unit, 'backlog' FROM temp.a;
.read lib/touch.sql
.read lib/tanswer.sql
SELECT json_object('unit', a.unit, 'task', json(t.ji)) FROM temp.a a, temp.jtask t WHERE t.unit = a.unit AND t.pos = (SELECT pos FROM temp.tk);
COMMIT;
