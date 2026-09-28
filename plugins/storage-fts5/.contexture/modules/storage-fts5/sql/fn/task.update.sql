-- task.update <unit> <slug> | any of objective, desc, criteria, details, refs (list; a present
-- key replaces the field, refs.count=0 clears): {unit, task: Task}. A canonical task takes the
-- new fields and renders canonically again; a task holding a verbatim takes the edit rules
-- (docs/the-engine.md, The record data model), so every byte they do not touch stays: the
-- OBJECTIVE and REFS lines replaced in place or inserted after STATUS (REFS after OBJECTIVE),
-- each block section replaced in place or inserted at its template position. Either way the
-- task reads back as the parse rules read it and carries a verbatim exactly when its text
-- differs from its canonical span.
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
-- the new REFS list when the payload carries one
CREATE TEMP TABLE tur AS SELECT i, v FROM temp.plv WHERE base = 'refs';
CREATE TEMP TABLE turh AS SELECT EXISTS (SELECT 1 FROM temp.pl WHERE base = 'refs') AS has;

-- a task holding a verbatim: the edit rules on its stored text
DELETE FROM temp.edt;
INSERT INTO temp.edt SELECT verbatim FROM temp.tk WHERE verbatim IS NOT NULL;
-- OBJECTIVE: replaced in place, else inserted after STATUS, else after the head
.read lib/ed.sql
.read lib/scan.sql
INSERT INTO temp.sp (a, b, s)
SELECT coalesce(f.fline, coalesce(st.fend, 1) + 1), coalesce(f.fend, coalesce(st.fend, 1)), '  OBJECTIVE: "' || p.v || '"' || char(10)
FROM temp.pay p
  LEFT JOIN (SELECT fline, fend FROM temp.fld WHERE lab = 'OBJECTIVE' AND blk = 0 ORDER BY fno LIMIT 1) f ON 1
  LEFT JOIN (SELECT fend FROM temp.fld WHERE lab = 'STATUS' AND blk = 0 ORDER BY fno LIMIT 1) st ON 1
WHERE p.k = 'objective' AND EXISTS (SELECT 1 FROM temp.edt);
.read lib/splice.sql
-- REFS: replaced in place (an empty list removes the line), else inserted after OBJECTIVE,
-- else after STATUS, else after the head
.read lib/ed.sql
.read lib/scan.sql
INSERT INTO temp.sp (a, b, s)
SELECT coalesce(f.fline, coalesce(ob.fend, st.fend, 1) + 1), coalesce(f.fend, coalesce(ob.fend, st.fend, 1)),
  CASE WHEN (SELECT count(*) FROM temp.tur) > 0 THEN '  REFS: [' || (SELECT group_concat(v, ', ' ORDER BY i) FROM temp.tur) || ']' || char(10) ELSE '' END
FROM temp.turh h
  LEFT JOIN (SELECT fline, fend FROM temp.fld WHERE lab = 'REFS' AND blk = 0 ORDER BY fno LIMIT 1) f ON 1
  LEFT JOIN (SELECT fend FROM temp.fld WHERE lab = 'OBJECTIVE' AND blk = 0 ORDER BY fno LIMIT 1) ob ON 1
  LEFT JOIN (SELECT fend FROM temp.fld WHERE lab = 'STATUS' AND blk = 0 ORDER BY fno LIMIT 1) st ON 1
WHERE h.has = 1 AND EXISTS (SELECT 1 FROM temp.edt) AND (f.fline IS NOT NULL OR (SELECT count(*) FROM temp.tur) > 0);
.read lib/splice.sql
-- the DESCRIPTION section: replaced in place, else inserted before the first later section of
-- the template order, else after the last content line
.read lib/ed.sql
.read lib/scan.sql
INSERT INTO temp.sp (a, b, s)
SELECT coalesce(f.fline, l.later, c.cend + 1), coalesce(f.fend, l.later - 1, c.cend), CASE WHEN p.v = '' THEN '  DESCRIPTION ::' || char(10) ELSE replace(replace('  DESCRIPTION ::' || char(10) || '    ' || replace(p.v, char(10), char(10) || '    ') || char(10), char(10) || '    ' || char(10), char(10) || char(10)), char(10) || '    ' || char(10), char(10) || char(10)) END
FROM temp.pay p, temp.edc c
  LEFT JOIN (SELECT fline, fend FROM temp.fld WHERE lab = 'DESCRIPTION' AND blk = 1 ORDER BY fno LIMIT 1) f ON 1
  LEFT JOIN (SELECT coalesce((SELECT fline FROM temp.fld WHERE lab = 'ACCEPTANCE CRITERIA' AND blk = 1 ORDER BY fno LIMIT 1), (SELECT fline FROM temp.fld WHERE lab = 'IMPLEMENTATION DETAILS' AND blk = 1 ORDER BY fno LIMIT 1)) AS later) l ON 1
WHERE p.k = 'desc' AND EXISTS (SELECT 1 FROM temp.edt);
.read lib/splice.sql
-- the ACCEPTANCE CRITERIA section: replaced in place, else inserted before the first later section of
-- the template order, else after the last content line
.read lib/ed.sql
.read lib/scan.sql
INSERT INTO temp.sp (a, b, s)
SELECT coalesce(f.fline, l.later, c.cend + 1), coalesce(f.fend, l.later - 1, c.cend), CASE WHEN p.v = '' THEN '  ACCEPTANCE CRITERIA ::' || char(10) ELSE replace(replace('  ACCEPTANCE CRITERIA ::' || char(10) || '    ' || replace(p.v, char(10), char(10) || '    ') || char(10), char(10) || '    ' || char(10), char(10) || char(10)), char(10) || '    ' || char(10), char(10) || char(10)) END
FROM temp.pay p, temp.edc c
  LEFT JOIN (SELECT fline, fend FROM temp.fld WHERE lab = 'ACCEPTANCE CRITERIA' AND blk = 1 ORDER BY fno LIMIT 1) f ON 1
  LEFT JOIN (SELECT (SELECT fline FROM temp.fld WHERE lab = 'IMPLEMENTATION DETAILS' AND blk = 1 ORDER BY fno LIMIT 1) AS later) l ON 1
WHERE p.k = 'criteria' AND EXISTS (SELECT 1 FROM temp.edt);
.read lib/splice.sql
-- the IMPLEMENTATION DETAILS section: replaced in place, else inserted before the first later section of
-- the template order, else after the last content line
.read lib/ed.sql
.read lib/scan.sql
INSERT INTO temp.sp (a, b, s)
SELECT coalesce(f.fline, l.later, c.cend + 1), coalesce(f.fend, l.later - 1, c.cend), CASE WHEN p.v = '' THEN '  IMPLEMENTATION DETAILS ::' || char(10) ELSE replace(replace('  IMPLEMENTATION DETAILS ::' || char(10) || '    ' || replace(p.v, char(10), char(10) || '    ') || char(10), char(10) || '    ' || char(10), char(10) || char(10)), char(10) || '    ' || char(10), char(10) || char(10)) END
FROM temp.pay p, temp.edc c
  LEFT JOIN (SELECT fline, fend FROM temp.fld WHERE lab = 'IMPLEMENTATION DETAILS' AND blk = 1 ORDER BY fno LIMIT 1) f ON 1
  LEFT JOIN (SELECT NULL AS later) l ON 1
WHERE p.k = 'details' AND EXISTS (SELECT 1 FROM temp.edt);
.read lib/splice.sql

-- the typed fields: the new values as given, then read back (a block scalar loses its
-- trailing empty lines); a canonical task's candidate text is its span rendered from the
-- values as given
UPDATE tasks SET objective = coalesce((SELECT v FROM temp.pay WHERE k = 'objective'), objective),
    description = CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'desc') THEN (SELECT v FROM temp.pay WHERE k = 'desc') ELSE description END,
    criteria = CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'criteria') THEN (SELECT v FROM temp.pay WHERE k = 'criteria') ELSE criteria END,
    details = CASE WHEN EXISTS (SELECT 1 FROM temp.pay WHERE k = 'details') THEN (SELECT v FROM temp.pay WHERE k = 'details') ELSE details END
  WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.tk);
DELETE FROM item_refs WHERE unit = (SELECT unit FROM temp.a) AND lane = '' AND artifact = 'backlog' AND pos = (SELECT pos FROM temp.tk)
  AND (SELECT has FROM temp.turh) = 1;
INSERT INTO item_refs (unit, lane, artifact, pos, rpos, ref)
  SELECT (SELECT unit FROM temp.a), '', 'backlog', (SELECT pos FROM temp.tk), i, v FROM temp.tur;
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'task', k.pos, v.span FROM temp.tk k, v_task_span v
  WHERE k.verbatim IS NULL AND v.unit = (SELECT unit FROM temp.a) AND v.pos = k.pos;
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'task', k.pos, e.t FROM temp.tk k, temp.edt e WHERE k.verbatim IS NOT NULL;
-- the block fields read back from the text the task now stores (lib/reblock.sql), a block the
-- text lacks reading null: a canonical task's span or a verbatim task's edited text alike
DELETE FROM temp.edt;
INSERT INTO temp.edt SELECT cand FROM temp.stl WHERE tbl = 'task' AND pos = (SELECT pos FROM temp.tk);
.read lib/reblock.sql
UPDATE tasks SET description = (SELECT v FROM temp.rb WHERE lab = 'DESCRIPTION'), criteria = (SELECT v FROM temp.rb WHERE lab = 'ACCEPTANCE CRITERIA'),
    details = (SELECT v FROM temp.rb WHERE lab = 'IMPLEMENTATION DETAILS')
  WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.tk);
.read lib/settle.sql
INSERT INTO temp.tart SELECT unit, 'backlog' FROM temp.a;
.read lib/touch.sql
.read lib/tanswer.sql
SELECT json_object('unit', a.unit, 'task', json(t.j)) FROM temp.a a, temp.jtask t WHERE t.unit = a.unit AND t.pos = (SELECT pos FROM temp.tk);
COMMIT;
