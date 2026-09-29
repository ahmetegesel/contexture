-- task.start <unit> <slug> | pointer: {unit, task: TaskItem, next_action}: TODO to IN_PROGRESS
-- (R9) with next_action the pointer (default 'work active task: <slug>'), which names every
-- IN_PROGRESS task, this one included (R12), in one write
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/tfind.sql
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_TRANSITION', 'task ''' || a.a1 || ''' is ' || k.status || '; task.start moves only from TODO'
  FROM temp.tk k, temp.a a WHERE k.status <> 'TODO';
CREATE TEMP TABLE ptr AS SELECT coalesce((SELECT v FROM temp.pay WHERE k = 'pointer'), 'work active task: ' || a.a1) AS p, a.a1 AS extra FROM temp.a a;
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'pointer takes one line' FROM temp.ptr WHERE instr(p, char(10)) > 0;
INSERT INTO temp.err SELECT 43, 1, 'ERR_INVALID_ARGUMENT', 'pointer holds a carriage return' FROM temp.ptr WHERE instr(p, char(13)) > 0;
.read lib/pointer.sql
.read lib/stop.sql
UPDATE tasks SET status = 'IN_PROGRESS' WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.tk);
UPDATE units SET next_action = (SELECT p FROM temp.ptr) WHERE unit = (SELECT unit FROM temp.a);
INSERT INTO temp.tart SELECT unit, 'backlog' FROM temp.a;
INSERT INTO temp.tart SELECT unit, 'state' FROM temp.a;
.read lib/touch.sql
.read lib/tanswer.sql
SELECT json_object('unit', a.unit, 'task', json(t.ji), 'next_action', (SELECT next_action FROM units WHERE unit = a.unit))
  FROM temp.a a, temp.jtask t WHERE t.unit = a.unit AND t.pos = (SELECT pos FROM temp.tk);
COMMIT;
