-- finding.supersede <unit> <OLD> <NEW> | summary, refs (list), reason (default superseded):
-- {unit, superseded: OLD, finding: Finding}: NEW appended with its SUPERSEDES naming OLD (R14:
-- OLD exists, NEW is new)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'finding ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM units u WHERE u.unit = a.unit)
    AND NOT EXISTS (SELECT 1 FROM findings f WHERE f.unit = a.unit AND f.kind = 'finding' AND f.name = a.a1);
INSERT INTO temp.err SELECT 41, 1, 'ERR_ENTITY_EXISTS', 'finding ''' || a.a2 || ''' already exists in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM findings f WHERE f.unit = a.unit AND f.kind = 'finding' AND f.name = a.a2);
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key summary' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'summary');
INSERT INTO temp.err SELECT 43, 1, 'ERR_INVALID_ARGUMENT', 'summary holds a carriage return' FROM temp.pay WHERE k = 'summary' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 44, 1, 'ERR_INVALID_ARGUMENT', 'reason takes one line' FROM temp.pay WHERE k = 'reason' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 44.5, 1, 'ERR_INVALID_ARGUMENT', 'reason holds a carriage return' FROM temp.pay WHERE k = 'reason' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'refs';
INSERT INTO temp.err SELECT 46 + i * 0.001, 1, 'ERR_INVALID_ARGUMENT', 'refs element takes one line' FROM temp.plv WHERE base = 'refs' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 46 + i * 0.001 + 0.0005, 1, 'ERR_INVALID_ARGUMENT', 'refs element holds a carriage return' FROM temp.plv WHERE base = 'refs' AND instr(v, char(13)) > 0;
.read lib/stop.sql
INSERT INTO temp.fnw SELECT a.a2, a.a1, coalesce((SELECT v FROM temp.pay WHERE k = 'reason'), 'superseded'), (SELECT v FROM temp.pay WHERE k = 'summary') FROM temp.a a;
INSERT INTO temp.fnr SELECT i, v FROM temp.plv WHERE base = 'refs';
.read lib/fappend.sql
INSERT INTO temp.tart SELECT unit, 'knowledge' FROM temp.a;
.read lib/touch.sql
.read lib/fanswer.sql
SELECT json_object('unit', a.unit, 'superseded', a.a1, 'finding', json(f.j)) FROM temp.a a, temp.jfind f
  WHERE f.unit = a.unit AND f.pos = (SELECT pos FROM temp.fpos);
COMMIT;
