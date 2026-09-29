-- finding.update <unit> <NAME> | summary and or refs (a present key replaces): {unit, finding:
-- Finding}. The finding takes the given summary (normalized by lib/prelude.sql) and or refs
-- and keeps the rest; it renders canonically from them (a first REF before SUMMARY).
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/ffind.sql
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'summary holds a carriage return' FROM temp.pay WHERE k = 'summary' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'refs';
INSERT INTO temp.err SELECT 43 + i * 0.001, 1, 'ERR_INVALID_ARGUMENT', 'refs element takes one line' FROM temp.plv WHERE base = 'refs' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 43 + i * 0.001 + 0.0005, 1, 'ERR_INVALID_ARGUMENT', 'refs element holds a carriage return' FROM temp.plv WHERE base = 'refs' AND instr(v, char(13)) > 0;
.read lib/stop.sql
UPDATE findings SET summary = CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'summary') THEN (SELECT v FROM temp.pay WHERE k = 'summary') ELSE summary END
  WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.fk);
DELETE FROM finding_refs WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.fk) AND EXISTS (SELECT 1 FROM temp.pl WHERE base = 'refs');
INSERT INTO finding_refs (unit, pos, rpos, ref) SELECT (SELECT unit FROM temp.a), (SELECT pos FROM temp.fk), i, v FROM temp.plv WHERE base = 'refs';
INSERT INTO temp.tart SELECT unit, 'knowledge' FROM temp.a;
.read lib/touch.sql
.read lib/fanswer.sql
SELECT json_object('unit', a.unit, 'finding', json(f.j)) FROM temp.a a, temp.jfind f WHERE f.unit = a.unit AND f.pos = (SELECT pos FROM temp.fk);
COMMIT;
