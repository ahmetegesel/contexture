-- finding.add <unit> <NAME> | summary, refs (list), supersedes (a NAME), supersedes_reason
-- (default superseded): {unit, finding: Finding}, appended to the knowledge (R5: a repeated
-- NAME refuses; R14: a supersedes predecessor exists)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_EXISTS', 'finding ''' || a.a1 || ''' already exists in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM findings f WHERE f.unit = a.unit AND f.kind = 'finding' AND f.name = a.a1);
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'supersedes takes one line' FROM temp.pay WHERE k = 'supersedes' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 41.5, 1, 'ERR_INVALID_ARGUMENT', 'supersedes holds a carriage return' FROM temp.pay WHERE k = 'supersedes' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'supersedes takes a finding NAME: ''' || v || ''''
  FROM temp.pay WHERE k = 'supersedes' AND NOT (v <> '' AND substr(v, 1, 1) GLOB '[A-Za-z0-9_]' AND v NOT GLOB '*[^A-Za-z0-9_.-]*');
INSERT INTO temp.err SELECT 43, 1, 'ERR_ENTITY_NOT_FOUND', 'finding ''' || p.v || ''' not found in unit ''' || a.unit || ''''
  FROM temp.pay p, temp.a a WHERE p.k = 'supersedes'
    AND NOT EXISTS (SELECT 1 FROM findings f WHERE f.unit = a.unit AND f.kind = 'finding' AND f.name = p.v);
INSERT INTO temp.err SELECT 44, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key summary' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'summary');
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', 'summary holds a carriage return' FROM temp.pay WHERE k = 'summary' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 46, 1, 'ERR_INVALID_ARGUMENT', 'supersedes_reason takes one line' FROM temp.pay WHERE k = 'supersedes_reason' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 46.5, 1, 'ERR_INVALID_ARGUMENT', 'supersedes_reason holds a carriage return' FROM temp.pay WHERE k = 'supersedes_reason' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 47, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'refs';
INSERT INTO temp.err SELECT 48 + i * 0.001, 1, 'ERR_INVALID_ARGUMENT', 'refs element takes one line' FROM temp.plv WHERE base = 'refs' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 48 + i * 0.001 + 0.0005, 1, 'ERR_INVALID_ARGUMENT', 'refs element holds a carriage return' FROM temp.plv WHERE base = 'refs' AND instr(v, char(13)) > 0;
.read lib/stop.sql
INSERT INTO temp.fnw SELECT a.a1, (SELECT v FROM temp.pay WHERE k = 'supersedes'),
  CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'supersedes') THEN coalesce((SELECT v FROM temp.pay WHERE k = 'supersedes_reason'), 'superseded') END,
  (SELECT v FROM temp.pay WHERE k = 'summary') FROM temp.a a;
INSERT INTO temp.fnr SELECT i, v FROM temp.plv WHERE base = 'refs';
.read lib/fappend.sql
INSERT INTO temp.tart SELECT unit, 'knowledge' FROM temp.a;
.read lib/touch.sql
.read lib/fanswer.sql
SELECT json_object('unit', a.unit, 'finding', json(f.j)) FROM temp.a a, temp.jfind f WHERE f.unit = a.unit AND f.pos = (SELECT pos FROM temp.fpos);
COMMIT;
