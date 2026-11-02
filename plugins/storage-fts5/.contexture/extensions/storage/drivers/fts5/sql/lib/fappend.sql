-- fappend.sql: one new finding of the knowledge (temp.fnw, its REF values in temp.fnr) at the
-- next position, its SUMMARY as lib/prelude.sql normalized it (the block value rule); a
-- SUPERSEDES reason reads back whole (the parse reads it to its last closing parenthesis).
-- temp.fpos holds the new position.
DROP TABLE IF EXISTS temp.fpos;
CREATE TEMP TABLE fpos AS SELECT coalesce((SELECT max(pos) FROM findings WHERE unit = (SELECT unit FROM temp.a)), 0) + 1 AS pos;
INSERT INTO findings (unit, pos, name, supersedes_name, supersedes_reason, summary)
  SELECT (SELECT unit FROM temp.a), p.pos, n.name, n.supersedes_name, n.supersedes_reason, n.summary FROM temp.fnw n, temp.fpos p;
INSERT INTO finding_refs (unit, pos, rpos, ref) SELECT (SELECT unit FROM temp.a), p.pos, r.rpos, r.ref FROM temp.fnr r, temp.fpos p;
DELETE FROM temp.fnw;
DELETE FROM temp.fnr;
