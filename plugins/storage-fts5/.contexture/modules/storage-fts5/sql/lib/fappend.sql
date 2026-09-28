-- fappend.sql: the append rule for one new finding of the knowledge (temp.fnw, its REF values
-- in temp.fnr), as lib/tappend.sql for a task: it reads back as the parse rules read it (the
-- SUMMARY read from the written text by lib/reblock.sql, so it loses its trailing blank lines;
-- a SUPERSEDES reason ends at its first closing parenthesis). temp.fpos holds the new position.
DROP TABLE IF EXISTS temp.fpos;
CREATE TEMP TABLE fpos AS SELECT coalesce((SELECT max(pos) FROM findings WHERE unit = (SELECT unit FROM temp.a)), 0) + 1 AS pos,
  (SELECT max(pos) FROM findings WHERE unit = (SELECT unit FROM temp.a)) AS last;
DELETE FROM temp.trm;
INSERT INTO temp.trm (id, s0, mode) SELECT 1, v.span, 'append' FROM v_finding_span v, temp.fpos p
  WHERE v.unit = (SELECT unit FROM temp.a) AND v.pos = p.last;
INSERT INTO temp.trm (id, s0, mode) SELECT 2, coalesce((SELECT preamble FROM preambles WHERE unit = (SELECT unit FROM temp.a) AND artifact = 'knowledge'), ''), 'append'
  FROM temp.fpos p WHERE p.last IS NULL;
.read lib/trim.sql
UPDATE preambles SET preamble = (SELECT CASE WHEN s <> '' THEN s || char(10) ELSE s END FROM temp.trm WHERE id = 2)
  WHERE unit = (SELECT unit FROM temp.a) AND artifact = 'knowledge' AND (SELECT last FROM temp.fpos) IS NULL;
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'finding', p.last, t.s || char(10) FROM temp.trm t, temp.fpos p WHERE t.id = 1;
INSERT INTO findings (unit, pos, kind, name, supersedes_name, supersedes_reason, summary, verbatim)
  SELECT (SELECT unit FROM temp.a), p.pos, 'finding', n.name, n.supersedes_name, n.supersedes_reason, n.summary, NULL FROM temp.fnw n, temp.fpos p;
INSERT INTO finding_refs (unit, pos, rpos, ref) SELECT (SELECT unit FROM temp.a), p.pos, r.rpos, r.ref FROM temp.fnr r, temp.fpos p;
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'finding', p.pos, v.span FROM v_finding_span v, temp.fpos p WHERE v.unit = (SELECT unit FROM temp.a) AND v.pos = p.pos;
-- the SUMMARY read back from the written text (lib/reblock.sql)
DELETE FROM temp.edt;
INSERT INTO temp.edt SELECT cand FROM temp.stl WHERE tbl = 'finding' AND pos = (SELECT pos FROM temp.fpos);
.read lib/reblock.sql
UPDATE findings SET summary = coalesce((SELECT v FROM temp.rb WHERE lab = 'SUMMARY'), ''),
    supersedes_reason = CASE WHEN instr(supersedes_reason, ')') > 0 THEN substr(supersedes_reason, 1, instr(supersedes_reason, ')') - 1) ELSE supersedes_reason END
  WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.fpos);
.read lib/settle.sql
DELETE FROM temp.fnw;
DELETE FROM temp.fnr;
