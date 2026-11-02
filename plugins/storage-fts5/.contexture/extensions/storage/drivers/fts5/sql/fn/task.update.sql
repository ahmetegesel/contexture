-- task.update <unit> <slug> | any of objective, desc, criteria, details, refs (list; a present
-- key replaces the field, refs.count=0 clears): {unit, task: Task}. The task takes the given
-- fields (its block values as lib/prelude.sql normalized them) and keeps the others; it
-- renders canonically from them.
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/tfind.sql
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'objective takes one line' FROM temp.pay WHERE k = 'objective' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'objective holds a carriage return' FROM temp.pay WHERE k = 'objective' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 43, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'refs';
INSERT INTO temp.err SELECT 44 + i * 0.001, 1, 'ERR_INVALID_ARGUMENT', 'refs element takes one line' FROM temp.plv WHERE base = 'refs' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 44 + i * 0.001 + 0.0005, 1, 'ERR_INVALID_ARGUMENT', 'refs element holds a carriage return' FROM temp.plv WHERE base = 'refs' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', 'desc holds a carriage return' FROM temp.pay WHERE k = 'desc' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 46, 1, 'ERR_INVALID_ARGUMENT', 'criteria holds a carriage return' FROM temp.pay WHERE k = 'criteria' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 47, 1, 'ERR_INVALID_ARGUMENT', 'details holds a carriage return' FROM temp.pay WHERE k = 'details' AND instr(v, char(13)) > 0;
.read lib/stop.sql
UPDATE tasks SET objective = coalesce((SELECT v FROM temp.pay WHERE k = 'objective'), objective),
    description = CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'desc') THEN (SELECT v FROM temp.pay WHERE k = 'desc') ELSE description END,
    criteria = CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'criteria') THEN (SELECT v FROM temp.pay WHERE k = 'criteria') ELSE criteria END,
    details = CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'details') THEN (SELECT v FROM temp.pay WHERE k = 'details') ELSE details END
  WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.tk);
DELETE FROM item_refs WHERE unit = (SELECT unit FROM temp.a) AND lane = '' AND artifact = 'backlog' AND pos = (SELECT pos FROM temp.tk)
  AND EXISTS (SELECT 1 FROM temp.pl WHERE base = 'refs');
INSERT INTO item_refs (unit, lane, artifact, pos, rpos, ref)
  SELECT (SELECT unit FROM temp.a), '', 'backlog', (SELECT pos FROM temp.tk), i, v FROM temp.plv WHERE base = 'refs';
INSERT INTO temp.tart SELECT unit, 'backlog' FROM temp.a;
.read lib/touch.sql
.read lib/tanswer.sql
SELECT json_object('unit', a.unit, 'task', json(t.j)) FROM temp.a a, temp.jtask t WHERE t.unit = a.unit AND t.pos = (SELECT pos FROM temp.tk);
COMMIT;
