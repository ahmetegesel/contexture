-- dump.import.sql: loads one validated unit dump (temp.dl, dump.load.sql and dump.check.sql
-- run first, temp.dverr empty) into the typed tables as the unit temp.arg k 'unit' names,
-- replacing whatever the store held for it; runs inside the caller's transaction and never
-- opens or closes one. Positions follow the dump's line order: each item takes pos 1, 2, ...
-- inside its artifact (a lane journal counts on its own); every derived field is left to
-- the reads, and derive.sql rebuilds the search tables after.
DROP TABLE IF EXISTS temp.di;
CREATE TEMP TABLE di AS
WITH w AS (
  SELECT n, j, kind,
    max(CASE WHEN kind IN ('unit', 'state', 'artifact', 'lane', 'end') THEN n END) OVER (ORDER BY n ROWS UNBOUNDED PRECEDING) AS sn
  FROM temp.dl
)
SELECT w.n AS n, w.j AS j, w.kind AS kind,
  CASE s.kind WHEN 'artifact' THEN json_extract(s.j, '$.name') WHEN 'lane' THEN 'lane' ELSE s.kind END AS art,
  CASE WHEN s.kind = 'lane' THEN json_extract(s.j, '$.lane') ELSE '' END AS lane,
  row_number() OVER (PARTITION BY w.sn ORDER BY w.n) - 1 AS pos,
  CASE WHEN w.kind = 'lane_item' THEN json_extract(w.j, '$.item') ELSE w.kind END AS item
FROM w JOIN temp.dl s ON s.n = w.sn;

-- the unit leaves every table first (a replace swaps it whole; a new unit finds nothing)
DELETE FROM lines WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM search_documents WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM closer_targets WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM closers WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM item_refs WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM extra_fields WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM finding_refs WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM lane_items WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM lanes WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM journal_items WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM findings WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM tasks WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM preambles WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');
DELETE FROM units WHERE unit = (SELECT v FROM temp.arg WHERE k = 'unit');

INSERT INTO units (unit, status, current_anchor, next_action, objective, repos, ref_sessions, verbatim)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'),
  json_extract(j, '$.status'), json_extract(j, '$.current_anchor'), json_extract(j, '$.next_action'),
  json_extract(j, '$.objective'), json_extract(j, '$.repos'),
  CASE WHEN json_type(j, '$.ref_sessions') = 'null' THEN NULL ELSE json_extract(j, '$.ref_sessions') END,
  json_extract(j, '$.verbatim')
FROM temp.di WHERE kind = 'state';

INSERT INTO preambles (unit, artifact, preamble)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), json_extract(j, '$.name'), json_extract(j, '$.preamble')
FROM temp.di WHERE kind = 'artifact';

INSERT INTO tasks (unit, pos, kind, slug, status, objective, description, criteria, details, verbatim)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), pos, kind,
  json_extract(j, '$.slug'), json_extract(j, '$.status'), json_extract(j, '$.objective'),
  json_extract(j, '$.description'), json_extract(j, '$.criteria'), json_extract(j, '$.details'),
  json_extract(j, '$.verbatim')
FROM temp.di WHERE art = 'backlog' AND kind IN ('task', 'opaque');

INSERT INTO findings (unit, pos, kind, name, supersedes_name, supersedes_reason, summary, verbatim)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), pos, kind,
  json_extract(j, '$.name'), json_extract(j, '$.supersedes.name'), json_extract(j, '$.supersedes.reason'),
  json_extract(j, '$.summary'), json_extract(j, '$.verbatim')
FROM temp.di WHERE art = 'knowledge' AND kind IN ('finding', 'opaque');

INSERT INTO journal_items (unit, pos, kind, slug, anchor, what, grp, rhythm, knowledge, thread, legacy_status, continues, attention, verbatim)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), pos, kind,
  json_extract(j, '$.slug'), json_extract(j, '$.anchor'), json_extract(j, '$.what'), json_extract(j, '$.group'),
  json_extract(j, '$.rhythm'), coalesce(json_extract(j, '$.knowledge'), 0), json_extract(j, '$.thread'),
  json_extract(j, '$.legacy_status'), json_extract(j, '$.continues'), json_extract(j, '$.attention'),
  json_extract(j, '$.verbatim')
FROM temp.di WHERE art = 'journal' AND kind IN ('entry', 'anchor');

INSERT INTO lanes (unit, lane, recipe, report, journal_preamble)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), json_extract(j, '$.lane'), json_extract(j, '$.recipe'),
  json_extract(j, '$.report'), json_extract(j, '$.journal_preamble')
FROM temp.di WHERE kind = 'lane';

INSERT INTO lane_items (unit, lane, pos, kind, slug, anchor, what, grp, rhythm, knowledge, thread, legacy_status, continues, attention, verbatim)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), lane, pos, item,
  json_extract(j, '$.slug'), json_extract(j, '$.anchor'), json_extract(j, '$.what'), json_extract(j, '$.group'),
  json_extract(j, '$.rhythm'), coalesce(json_extract(j, '$.knowledge'), 0), json_extract(j, '$.thread'),
  json_extract(j, '$.legacy_status'), json_extract(j, '$.continues'), json_extract(j, '$.attention'),
  json_extract(j, '$.verbatim')
FROM temp.di WHERE kind = 'lane_item';

-- the list fields: a task's REFS, an entry's REF lines, closers with their targets, extra
-- fields, a finding's REF lines, each in its stored order
INSERT INTO item_refs (unit, lane, artifact, pos, rpos, ref)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), d.lane, CASE WHEN d.kind = 'task' THEN 'backlog' ELSE 'journal' END,
  d.pos, r.key + 1, r.value
FROM temp.di d, json_each(d.j, '$.refs') r
WHERE d.kind = 'task' OR d.item = 'entry';

INSERT INTO finding_refs (unit, pos, rpos, ref)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), d.pos, r.key + 1, r.value
FROM temp.di d, json_each(d.j, '$.refs') r
WHERE d.kind = 'finding';

INSERT INTO closers (unit, lane, pos, cpos, kind, verdict, reason, verbatim)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), d.lane, d.pos, c.key + 1,
  json_extract(c.value, '$.kind'), json_extract(c.value, '$.verdict'), json_extract(c.value, '$.reason'),
  json_extract(c.value, '$.verbatim')
FROM temp.di d, json_each(d.j, '$.closers') c
WHERE d.item = 'entry';

INSERT INTO closer_targets (unit, lane, pos, cpos, tpos, target)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), d.lane, d.pos, c.key + 1, t.key + 1, t.value
FROM temp.di d, json_each(d.j, '$.closers') c, json_each(c.value, '$.targets') t
WHERE d.item = 'entry';

INSERT INTO extra_fields (unit, lane, pos, fpos, key, value)
SELECT (SELECT v FROM temp.arg WHERE k = 'unit'), d.lane, d.pos, x.key + 1,
  json_extract(x.value, '$.key'), json_extract(x.value, '$.value')
FROM temp.di d, json_each(d.j, '$.extra_fields') x
WHERE d.item = 'entry';

DROP TABLE IF EXISTS temp.di;
