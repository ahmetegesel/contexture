-- task.complete <unit> <slug> | evidence, date: {unit, task: TaskItem, receipt: Entry}: TODO or
-- IN_PROGRESS to DONE (R9) and the receipt 'backlog/<slug>: DONE (<evidence>)' in one write
-- (R10); a malformed stored anchor refuses rc 2 before the receipt could take it
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/tfind.sql
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_TRANSITION', 'task ''' || a.a1 || ''' is ' || k.status || '; task.complete moves only from TODO or IN_PROGRESS'
  FROM temp.tk k, temp.a a WHERE k.status NOT IN ('TODO', 'IN_PROGRESS');
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key evidence' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'evidence');
INSERT INTO temp.err SELECT 43, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key date' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'date');
INSERT INTO temp.err SELECT 44, 1, 'ERR_INVALID_ARGUMENT', 'evidence takes one line' FROM temp.pay WHERE k = 'evidence' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', 'evidence holds a carriage return' FROM temp.pay WHERE k = 'evidence' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 46, 1, 'ERR_INVALID_ARGUMENT', 'date takes YYYY-MM-DD' FROM temp.pay WHERE k = 'date'
  AND NOT (length(v) = 10 AND v GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
.read lib/anchor.sql
.read lib/stop.sql
INSERT INTO temp.tst SELECT pos, 'DONE' FROM temp.tk;
.read lib/tstatus.sql
CREATE TEMP TABLE rcp AS SELECT (SELECT v FROM temp.pay WHERE k = 'date') || '-' || a.a1 || '-completed' AS base,
  'backlog/' || a.a1 || ': DONE (' || (SELECT v FROM temp.pay WHERE k = 'evidence') || ')' AS what FROM temp.a a;
.read lib/receipt.sql
INSERT INTO temp.tart SELECT unit, 'backlog' FROM temp.a;
INSERT INTO temp.tart SELECT unit, 'journal' FROM temp.a;
.read lib/touch.sql
INSERT OR IGNORE INTO temp.dp VALUES ('journal');
.read lib/tanswer.sql
SELECT json_object('unit', a.unit, 'task', json(t.ji),
  'receipt', json((SELECT e.j FROM temp.jent e WHERE e.unit = a.unit AND e.lane = '' AND e.pos = (SELECT pos FROM temp.jnpos))))
  FROM temp.a a, temp.jtask t WHERE t.unit = a.unit AND t.pos = (SELECT pos FROM temp.tk);
COMMIT;
