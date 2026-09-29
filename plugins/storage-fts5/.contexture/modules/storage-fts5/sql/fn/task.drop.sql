-- task.drop <unit> <slug> | reason, date: {unit, slug, receipt: Entry}: the task leaves the
-- backlog (from any status unless IN_PROGRESS and named by next_action, R9) and the receipt
-- 'backlog/<slug>: DROPPED (<reason>)' lands in one write (R11); the slug may be added again
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/tfind.sql
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_TRANSITION', 'task ''' || a.a1 || ''' is IN_PROGRESS; task.drop moves only from TODO, DONE, or an IN_PROGRESS task next_action does not name'
  FROM temp.tk k, temp.a a, units u WHERE u.unit = a.unit AND k.status = 'IN_PROGRESS' AND instr(u.next_action, a.a1) > 0;
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key date' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'date');
INSERT INTO temp.err SELECT 43, 1, 'ERR_INVALID_ARGUMENT', 'date takes YYYY-MM-DD' FROM temp.pay WHERE k = 'date'
  AND NOT (length(v) = 10 AND v GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
INSERT INTO temp.err SELECT 44, 1, 'ERR_INVALID_ARGUMENT', 'reason takes one line' FROM temp.pay WHERE k = 'reason' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', 'reason holds a carriage return' FROM temp.pay WHERE k = 'reason' AND instr(v, char(13)) > 0;
.read lib/anchor.sql
.read lib/stop.sql
DELETE FROM item_refs WHERE unit = (SELECT unit FROM temp.a) AND lane = '' AND artifact = 'backlog' AND pos = (SELECT pos FROM temp.tk);
DELETE FROM tasks WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.tk);
CREATE TEMP TABLE rcp AS SELECT (SELECT v FROM temp.pay WHERE k = 'date') || '-' || a.a1 || '-dropped' AS base,
  'backlog/' || a.a1 || ': DROPPED (' || coalesce((SELECT v FROM temp.pay WHERE k = 'reason'), 'task dropped') || ')' AS what FROM temp.a a;
.read lib/receipt.sql
INSERT INTO temp.tart SELECT unit, 'backlog' FROM temp.a;
INSERT INTO temp.tart SELECT unit, 'journal' FROM temp.a;
.read lib/touch.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('journal');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'slug', a.a1,
  'receipt', json((SELECT e.j FROM temp.jent e WHERE e.unit = a.unit AND e.lane = '' AND e.pos = (SELECT pos FROM temp.jnpos))))
  FROM temp.a a;
COMMIT;
