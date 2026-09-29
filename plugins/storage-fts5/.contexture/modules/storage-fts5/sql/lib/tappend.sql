-- tappend.sql: one new task of the backlog (temp.tn, its REFS elements in temp.tnr) at the next
-- position, in TODO, its block values as lib/prelude.sql normalized them (the block value
-- rule). temp.tpos holds the new position.
DROP TABLE IF EXISTS temp.tpos;
CREATE TEMP TABLE tpos AS SELECT coalesce((SELECT max(pos) FROM tasks WHERE unit = (SELECT unit FROM temp.a)), 0) + 1 AS pos;
INSERT INTO tasks (unit, pos, slug, status, objective, description, criteria, details)
  SELECT (SELECT unit FROM temp.a), p.pos, n.slug, 'TODO', n.objective, n.description, n.criteria, n.details FROM temp.tn n, temp.tpos p;
INSERT INTO item_refs (unit, lane, artifact, pos, rpos, ref) SELECT (SELECT unit FROM temp.a), '', 'backlog', p.pos, r.rpos, r.ref FROM temp.tnr r, temp.tpos p;
DELETE FROM temp.tn;
DELETE FROM temp.tnr;
