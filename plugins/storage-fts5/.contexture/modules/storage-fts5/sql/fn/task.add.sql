-- task.add <unit> <slug> | objective, desc, criteria, details, refs (list): {unit, task: Task}
-- in TODO, appended to the backlog (R5: a repeated slug refuses)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_EXISTS', 'task ''' || a.a1 || ''' already exists in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.unit = a.unit AND t.kind = 'task' AND t.slug = a.a1);
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key objective' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'objective');
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'objective takes one line' FROM temp.pay WHERE k = 'objective' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 43, 1, 'ERR_INVALID_ARGUMENT', 'objective holds a carriage return' FROM temp.pay WHERE k = 'objective' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 44, 1, 'ERR_INVALID_ARGUMENT', 'desc holds a carriage return' FROM temp.pay WHERE k = 'desc' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', 'criteria holds a carriage return' FROM temp.pay WHERE k = 'criteria' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 46, 1, 'ERR_INVALID_ARGUMENT', 'details holds a carriage return' FROM temp.pay WHERE k = 'details' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 47, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'refs';
INSERT INTO temp.err SELECT 48 + i * 0.001, 1, 'ERR_INVALID_ARGUMENT', 'refs element takes one line' FROM temp.plv WHERE base = 'refs' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 48 + i * 0.001 + 0.0005, 1, 'ERR_INVALID_ARGUMENT', 'refs element holds a carriage return' FROM temp.plv WHERE base = 'refs' AND instr(v, char(13)) > 0;
.read lib/stop.sql
INSERT INTO temp.tn SELECT a.a1, (SELECT v FROM temp.pay WHERE k = 'objective'), (SELECT v FROM temp.pay WHERE k = 'desc'),
  (SELECT v FROM temp.pay WHERE k = 'criteria'), (SELECT v FROM temp.pay WHERE k = 'details') FROM temp.a a;
INSERT INTO temp.tnr SELECT i, v FROM temp.plv WHERE base = 'refs';
.read lib/tappend.sql
INSERT INTO temp.tart SELECT unit, 'backlog' FROM temp.a;
.read lib/touch.sql
.read lib/tanswer.sql
SELECT json_object('unit', a.unit, 'task', json(t.j)) FROM temp.a a, temp.jtask t WHERE t.unit = a.unit AND t.pos = (SELECT pos FROM temp.tpos);
COMMIT;
