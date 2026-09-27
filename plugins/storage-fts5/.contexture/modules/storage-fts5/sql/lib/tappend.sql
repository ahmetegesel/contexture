-- tappend.sql: the append rule for one new task of the backlog (temp.tn, its REFS elements in
-- temp.tnr): the backlog's trailing empty lines go (the last item's stored text, or the
-- preamble of a backlog holding no item), one empty line when the backlog holds something,
-- then the task's canonical lines written from its fields as given; it reads back as the
-- parse rules read it (a block scalar loses its trailing empty lines), so it carries a
-- verbatim exactly when those lines differ from its canonical lines. temp.tpos holds the
-- new position.
DROP TABLE IF EXISTS temp.tpos;
CREATE TEMP TABLE tpos AS SELECT coalesce((SELECT max(pos) FROM tasks WHERE unit = (SELECT unit FROM temp.a)), 0) + 1 AS pos,
  (SELECT max(pos) FROM tasks WHERE unit = (SELECT unit FROM temp.a)) AS last;
DELETE FROM temp.trm;
INSERT INTO temp.trm (id, s0, mode) SELECT 1, v.span, 'append' FROM v_task_span v, temp.tpos p
  WHERE v.unit = (SELECT unit FROM temp.a) AND v.pos = p.last;
INSERT INTO temp.trm (id, s0, mode) SELECT 2, coalesce((SELECT preamble FROM preambles WHERE unit = (SELECT unit FROM temp.a) AND artifact = 'backlog'), ''), 'append'
  FROM temp.tpos p WHERE p.last IS NULL;
.read lib/trim.sql
UPDATE preambles SET preamble = (SELECT CASE WHEN s <> '' THEN s || char(10) ELSE s END FROM temp.trm WHERE id = 2)
  WHERE unit = (SELECT unit FROM temp.a) AND artifact = 'backlog' AND (SELECT last FROM temp.tpos) IS NULL;
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'task', p.last, t.s || char(10) FROM temp.trm t, temp.tpos p WHERE t.id = 1;
INSERT INTO tasks (unit, pos, kind, slug, status, objective, description, criteria, details, verbatim)
  SELECT (SELECT unit FROM temp.a), p.pos, 'task', n.slug, 'TODO', n.objective, n.description, n.criteria, n.details, NULL FROM temp.tn n, temp.tpos p;
INSERT INTO item_refs (unit, lane, artifact, pos, rpos, ref) SELECT (SELECT unit FROM temp.a), '', 'backlog', p.pos, r.rpos, r.ref FROM temp.tnr r, temp.tpos p;
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'task', p.pos, v.span FROM v_task_span v, temp.tpos p WHERE v.unit = (SELECT unit FROM temp.a) AND v.pos = p.pos;
UPDATE tasks SET description = rtrim(description, char(10)), criteria = rtrim(criteria, char(10)), details = rtrim(details, char(10))
  WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.tpos);
.read lib/settle.sql
DELETE FROM temp.tn;
DELETE FROM temp.tnr;
