-- finding.update <unit> <NAME> | summary and or refs (a present key replaces): {unit, finding:
-- Finding}. A canonical finding takes the new fields and renders canonically again (a first
-- REF lands before SUMMARY, as the canonical lines order it); a finding holding a verbatim
-- takes the edit rules: the SUMMARY body replaced in place (inserted after the last content
-- line when absent), then every REF line removed and the new list placed at the first one's
-- line (after the SUMMARY body when there was none). Either way the finding reads back as the
-- parse rules read it and carries a verbatim exactly when its text differs from its
-- canonical span.
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/ffind.sql
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'summary holds a carriage return' FROM temp.pay WHERE k = 'summary' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'refs';
INSERT INTO temp.err SELECT 43 + i * 0.001, 1, 'ERR_INVALID_ARGUMENT', 'refs element takes one line' FROM temp.plv WHERE base = 'refs' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 43 + i * 0.001 + 0.0005, 1, 'ERR_INVALID_ARGUMENT', 'refs element holds a carriage return' FROM temp.plv WHERE base = 'refs' AND instr(v, char(13)) > 0;
.read lib/stop.sql
CREATE TEMP TABLE fur AS SELECT i, v FROM temp.plv WHERE base = 'refs';
CREATE TEMP TABLE furh AS SELECT EXISTS (SELECT 1 FROM temp.pl WHERE base = 'refs') AS has;
DELETE FROM temp.edt;
INSERT INTO temp.edt SELECT verbatim FROM temp.fk WHERE verbatim IS NOT NULL;

-- SUMMARY: the block replaced in place, else inserted after the last content line
.read lib/ed.sql
.read lib/scan.sql
INSERT INTO temp.sp (a, b, s)
SELECT coalesce(f.fline, c.cend + 1), coalesce(f.fend, c.cend),
  CASE WHEN p.v = '' THEN '  SUMMARY ::' || char(10) ELSE replace(replace('  SUMMARY ::' || char(10) || '    ' || replace(p.v, char(10), char(10) || '    ') || char(10),
    char(10) || '    ' || char(10), char(10) || char(10)), char(10) || '    ' || char(10), char(10) || char(10)) END
FROM temp.pay p, temp.edc c
  LEFT JOIN (SELECT fline, fend FROM temp.fld WHERE lab = 'SUMMARY' AND blk = 1 ORDER BY fno LIMIT 1) f ON 1
WHERE p.k = 'summary' AND EXISTS (SELECT 1 FROM temp.edt);
.read lib/splice.sql

-- REF: every REF line removed, the new list placed at the first one's line, else after the
-- SUMMARY body, else after the last content line
.read lib/ed.sql
.read lib/scan.sql
DROP TABLE IF EXISTS temp.frp;
CREATE TEMP TABLE frp AS SELECT coalesce((SELECT min(fline) FROM temp.fld WHERE lab = 'REF' AND blk = 0),
    coalesce((SELECT fend FROM temp.fld WHERE lab = 'SUMMARY' AND blk = 1 ORDER BY fno LIMIT 1), (SELECT cend FROM temp.edc)) + 1) AS p
  WHERE (SELECT has FROM temp.furh) = 1 AND EXISTS (SELECT 1 FROM temp.edt);
DROP TABLE IF EXISTS temp.ed3;
CREATE TEMP TABLE ed3 AS SELECT row_number() OVER (ORDER BY e.n) AS n, e.line AS line, e.ln AS ln FROM temp.ed e
  WHERE NOT (EXISTS (SELECT 1 FROM temp.frp)
    AND EXISTS (SELECT 1 FROM temp.fld f WHERE f.lab = 'REF' AND f.blk = 0 AND e.n BETWEEN f.fline AND f.fend));
DROP TABLE temp.ed;
CREATE TEMP TABLE ed AS SELECT n, line, ln FROM temp.ed3 ORDER BY n;
DROP TABLE temp.ed3;
INSERT INTO temp.sp (a, b, s)
SELECT r.p, r.p - 1, coalesce((SELECT group_concat('  REF: "' || v || '"' || char(10), '' ORDER BY i) FROM temp.fur), '') FROM temp.frp r;
.read lib/splice.sql

-- the typed fields, the candidate text, the verbatim rule
UPDATE findings SET summary = CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'summary') THEN (SELECT v FROM temp.pay WHERE k = 'summary') ELSE summary END
  WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.fk);
DELETE FROM finding_refs WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.fk) AND (SELECT has FROM temp.furh) = 1;
INSERT INTO finding_refs (unit, pos, rpos, ref) SELECT (SELECT unit FROM temp.a), (SELECT pos FROM temp.fk), i, v FROM temp.fur;
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'finding', k.pos, v.span FROM temp.fk k, v_finding_span v
  WHERE k.verbatim IS NULL AND v.unit = (SELECT unit FROM temp.a) AND v.pos = k.pos;
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'finding', k.pos, e.t FROM temp.fk k, temp.edt e WHERE k.verbatim IS NOT NULL;
UPDATE findings SET summary = rtrim(summary, char(10)) WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.fk);
.read lib/settle.sql
INSERT INTO temp.tart SELECT unit, 'knowledge' FROM temp.a;
.read lib/touch.sql
.read lib/fanswer.sql
SELECT json_object('unit', a.unit, 'finding', json(f.j)) FROM temp.a a, temp.jfind f WHERE f.unit = a.unit AND f.pos = (SELECT pos FROM temp.fk);
COMMIT;
