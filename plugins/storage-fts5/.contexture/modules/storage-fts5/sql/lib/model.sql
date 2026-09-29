-- model.sql: the derived fields of the record data model (docs/the-engine.md, The record data
-- model) over the typed tables, for the units in temp.du (unit) and the parts in temp.dp
-- (part: backlog, knowledge, journal, lanes), and the JSON of every schema as temp views,
-- each object in the contract key order through json_object. The store holds only what the
-- functions write, so the legacy fields of the data model answer constants: an entry's
-- legacy_status null and extra_fields [], every item's head_text null and extra_lines [], a
-- closer's extra_text null, the state's extra_fields and extra_lines []. The derived fields:
-- ordinal (the item's place among its artifact's items), seq (the place among
-- the journal's items, anchors included), occurrence (the slug's occurrences up to this one),
-- next (the following item's kind), the positional closure (the first later entry whose
-- closer names the slug, and the first such closer of it), superseded_by (the first finding
-- whose supersedes names this one).
CREATE TEMP TABLE IF NOT EXISTS du (unit TEXT PRIMARY KEY);
CREATE TEMP TABLE IF NOT EXISTS dp (part TEXT PRIMARY KEY);

DROP TABLE IF EXISTS temp.xt;
CREATE TEMP TABLE xt AS
SELECT t.unit AS unit, t.pos AS pos, t.slug AS slug, t.status AS status, t.objective AS objective,
  t.description AS description, t.criteria AS criteria, t.details AS details,
  row_number() OVER (PARTITION BY t.unit ORDER BY t.pos) AS ordinal,
  CASE WHEN lead(t.pos) OVER (PARTITION BY t.unit ORDER BY t.pos) IS NULL THEN NULL ELSE 'task' END AS nextk,
  (SELECT json_group_array(r.ref ORDER BY r.rpos) FROM item_refs r
    WHERE r.unit = t.unit AND r.lane = '' AND r.artifact = 'backlog' AND r.pos = t.pos) AS refs
FROM tasks t WHERE t.unit IN (SELECT unit FROM temp.du) AND EXISTS (SELECT 1 FROM temp.dp WHERE part = 'backlog');

DROP TABLE IF EXISTS temp.xf;
CREATE TEMP TABLE xf AS
SELECT f.unit AS unit, f.pos AS pos, f.name AS name, f.supersedes_name AS supersedes_name,
  f.supersedes_reason AS supersedes_reason, f.summary AS summary,
  row_number() OVER (PARTITION BY f.unit ORDER BY f.pos) AS ordinal,
  CASE WHEN lead(f.pos) OVER (PARTITION BY f.unit ORDER BY f.pos) IS NULL THEN NULL ELSE 'finding' END AS nextk,
  (SELECT json_group_array(r.ref ORDER BY r.rpos) FROM finding_refs r WHERE r.unit = f.unit AND r.pos = f.pos) AS refs,
  (SELECT s.name FROM findings s WHERE s.unit = f.unit AND s.supersedes_name = f.name ORDER BY s.pos LIMIT 1) AS superseded_by
FROM findings f WHERE f.unit IN (SELECT unit FROM temp.du) AND EXISTS (SELECT 1 FROM temp.dp WHERE part = 'knowledge');

DROP TABLE IF EXISTS temp.xj;
CREATE TEMP TABLE xj AS
SELECT j.unit AS unit, j.lane AS lane, j.pos AS pos, j.kind AS kind, j.slug AS slug, j.anchor AS anchor, j.what AS what,
  j.grp AS grp, j.rhythm AS rhythm, j.knowledge AS knowledge, j.thread AS thread,
  j.continues AS continues, j.attention AS attention,
  row_number() OVER (PARTITION BY j.unit, j.lane ORDER BY j.pos) AS seq,
  lead(j.kind) OVER (PARTITION BY j.unit, j.lane ORDER BY j.pos) AS nextk,
  CASE WHEN j.kind = 'entry' THEN row_number() OVER (PARTITION BY j.unit, j.lane, j.kind, j.slug ORDER BY j.pos) END AS occ,
  CAST(NULL AS INTEGER) AS cb_pos, CAST(NULL AS INTEGER) AS cb_cpos
FROM (
  SELECT unit, '' AS lane, pos, kind, slug, anchor, what, grp, rhythm, knowledge, thread, continues, attention
  FROM journal_items WHERE unit IN (SELECT unit FROM temp.du) AND EXISTS (SELECT 1 FROM temp.dp WHERE part = 'journal')
  UNION ALL
  SELECT unit, lane, pos, kind, slug, anchor, what, grp, rhythm, knowledge, thread, continues, attention
  FROM lane_items WHERE unit IN (SELECT unit FROM temp.du) AND EXISTS (SELECT 1 FROM temp.dp WHERE part = 'lanes')
) j;
CREATE INDEX IF NOT EXISTS temp.xj_key ON xj (unit, lane, pos);
CREATE INDEX IF NOT EXISTS temp.xj_slug ON xj (unit, lane, slug);
-- the positional closure: the first entry standing after this occurrence whose closer names
-- its slug, and the first closer of that entry naming it
UPDATE temp.xj SET cb_pos = (SELECT min(c.pos) FROM closer_targets c
  WHERE c.unit = xj.unit AND c.lane = xj.lane AND c.target = xj.slug AND c.pos > xj.pos) WHERE kind = 'entry';
UPDATE temp.xj SET cb_cpos = (SELECT min(c.cpos) FROM closer_targets c
  WHERE c.unit = xj.unit AND c.lane = xj.lane AND c.pos = xj.cb_pos AND c.target = xj.slug) WHERE cb_pos IS NOT NULL;

-- ---- the JSON of the schemas ----
CREATE TEMP VIEW IF NOT EXISTS jstate AS
SELECT u.unit AS unit, json_object('unit', u.unit, 'status', u.status, 'current_anchor', u.current_anchor,
  'next_action', u.next_action, 'objective', u.objective,
  'repos', json((SELECT json_group_array(e.value ORDER BY e.key) FROM json_each(u.repos) e)),
  'ref_sessions', json(CASE WHEN u.ref_sessions IS NULL THEN NULL ELSE
    (SELECT json_group_array(e.value ORDER BY e.key) FROM json_each(u.ref_sessions) e) END),
  'extra_fields', json('[]'), 'extra_lines', json('[]')) AS j
FROM units u;

CREATE TEMP VIEW IF NOT EXISTS jtask AS
SELECT unit, pos, slug, status, ordinal,
  json_object('slug', slug, 'ordinal', ordinal, 'status', status, 'objective', objective,
    'refs', json(refs), 'description', description, 'criteria', criteria, 'details', details,
    'extra_fields', json('[]'), 'head_text', NULL, 'extra_lines', json('[]'), 'next', nextk) AS j,
  json_object('slug', slug, 'status', status, 'objective', objective) AS ji
FROM temp.xt;

CREATE TEMP VIEW IF NOT EXISTS jfind AS
SELECT unit, pos, name, superseded_by, ordinal,
  json_object('name', name, 'ordinal', ordinal,
    'supersedes', json(CASE WHEN supersedes_name IS NULL THEN NULL ELSE json_object('name', supersedes_name, 'reason', coalesce(supersedes_reason, '')) END),
    'refs', json(refs), 'summary', coalesce(summary, ''),
    'extra_fields', json('[]'), 'head_text', NULL, 'extra_lines', json('[]'), 'superseded_by', superseded_by,
    'active', json(CASE WHEN superseded_by IS NULL THEN 'true' ELSE 'false' END), 'next', nextk) AS j,
  json_object('name', name, 'summary', coalesce(summary, ''), 'refs', json(refs), 'supersedes', supersedes_name,
    'active', json(CASE WHEN superseded_by IS NULL THEN 'true' ELSE 'false' END)) AS ji
FROM temp.xf;

-- a closer of an entry (unit, lane, pos, cpos)
CREATE TEMP VIEW IF NOT EXISTS jcloser AS
SELECT c.unit AS unit, c.lane AS lane, c.pos AS pos, c.cpos AS cpos,
  json_object('kind', c.kind, 'targets', json((SELECT json_group_array(t.target ORDER BY t.tpos) FROM closer_targets t
    WHERE t.unit = c.unit AND t.lane = c.lane AND t.pos = c.pos AND t.cpos = c.cpos)),
    'verdict', c.verdict, 'reason', c.reason, 'extra_text', NULL) AS j
FROM closers c;

-- the journal items with their list fields as JSON (refs, closers)
CREATE TEMP VIEW IF NOT EXISTS jparts AS
SELECT x.*,
  (SELECT json_group_array(r.ref ORDER BY r.rpos) FROM item_refs r
    WHERE r.unit = x.unit AND r.lane = x.lane AND r.artifact = 'journal' AND r.pos = x.pos) AS refs_j,
  (SELECT json_group_array(json(c.j) ORDER BY c.cpos) FROM temp.jcloser c
    WHERE c.unit = x.unit AND c.lane = x.lane AND c.pos = x.pos) AS closers_j,
  json(CASE WHEN x.knowledge = 1 THEN 'true' ELSE 'false' END) AS know_j
FROM temp.xj x;

-- the journal items: j the Entry (or the Anchor) without the closure fields, jc the Entry of
-- entry.get with them (between extra_fields and next), jl the LaneEntry (lane right after
-- kind) or the Anchor of a lane journal, ji the EntryItem
CREATE TEMP VIEW IF NOT EXISTS jent AS
SELECT x.unit AS unit, x.lane AS lane, x.pos AS pos, x.kind AS kind, x.slug AS slug, x.seq AS seq, x.occ AS occ,
  x.cb_pos AS cb_pos, x.cb_cpos AS cb_cpos, x.thread AS thread, x.anchor AS anchor, x.what AS what, x.grp AS grp,
  x.knowledge AS knowledge, x.nextk AS nextk,
  CASE x.kind WHEN 'anchor' THEN json_object('kind', 'anchor', 'seq', x.seq, 'anchor', x.anchor, 'continues', x.continues,
      'attention', x.attention, 'head_text', NULL, 'extra_lines', json('[]'), 'next', x.nextk)
    ELSE json_object('kind', 'entry', 'slug', x.slug, 'occurrence', x.occ, 'seq', x.seq, 'anchor', x.anchor, 'what', x.what,
      'group', x.grp, 'rhythm', x.rhythm, 'knowledge', json(x.know_j), 'thread', x.thread, 'legacy_status', NULL,
      'refs', json(x.refs_j), 'closers', json(x.closers_j), 'extra_fields', json('[]'), 'head_text', NULL, 'extra_lines', json('[]'),
      'next', x.nextk) END AS j,
  CASE x.kind WHEN 'entry' THEN json_object('kind', 'entry', 'slug', x.slug, 'occurrence', x.occ, 'seq', x.seq, 'anchor', x.anchor,
      'what', x.what, 'group', x.grp, 'rhythm', x.rhythm, 'knowledge', json(x.know_j), 'thread', x.thread, 'legacy_status', NULL,
      'refs', json(x.refs_j), 'closers', json(x.closers_j), 'extra_fields', json('[]'), 'head_text', NULL, 'extra_lines', json('[]'),
      'closed', json(CASE WHEN x.cb_pos IS NULL THEN 'false' ELSE 'true' END),
      'closed_by', (SELECT b.slug FROM temp.xj b WHERE b.unit = x.unit AND b.lane = x.lane AND b.pos = x.cb_pos),
      'close_reason', (SELECT CASE WHEN c.verdict IS NOT NULL THEN c.verdict || ': ' || coalesce(c.reason, '') ELSE c.reason END
        FROM closers c WHERE c.unit = x.unit AND c.lane = x.lane AND c.pos = x.cb_pos AND c.cpos = x.cb_cpos),
      'next', x.nextk) END AS jc,
  CASE x.kind WHEN 'anchor' THEN json_object('kind', 'anchor', 'seq', x.seq, 'anchor', x.anchor, 'continues', x.continues,
      'attention', x.attention, 'head_text', NULL, 'extra_lines', json('[]'), 'next', x.nextk)
    ELSE json_object('kind', 'entry', 'lane', x.lane, 'slug', x.slug, 'occurrence', x.occ, 'seq', x.seq, 'anchor', x.anchor,
      'what', x.what, 'group', x.grp, 'rhythm', x.rhythm, 'knowledge', json(x.know_j), 'thread', x.thread, 'legacy_status', NULL,
      'refs', json(x.refs_j), 'closers', json(x.closers_j), 'extra_fields', json('[]'), 'head_text', NULL, 'extra_lines', json('[]'),
      'next', x.nextk) END AS jl,
  json_object('slug', x.slug, 'occurrence', x.occ, 'anchor', x.anchor, 'what', x.what, 'group', x.grp) AS ji
FROM temp.jparts x;

-- the Board of a unit whose journal is present
CREATE TEMP VIEW IF NOT EXISTS jboard AS
SELECT u.unit AS unit, json_object('unit', u.unit,
  'backlog_present', json(CASE WHEN (SELECT preamble FROM preambles p WHERE p.unit = u.unit AND p.artifact = 'backlog') IS NULL THEN 'false' ELSE 'true' END),
  'live', json((SELECT json_group_array(json(e.j) ORDER BY e.pos) FROM temp.jent e
    WHERE e.unit = u.unit AND e.lane = '' AND e.kind = 'entry' AND e.cb_pos IS NULL)),
  'open_tasks', json((SELECT json_group_array(t.slug ORDER BY t.pos) FROM temp.xt t
    WHERE t.unit = u.unit AND t.status <> 'DONE')),
  'open_threads', json((SELECT json_group_array(json_object('slug', e.slug, 'anchor', coalesce(e.anchor, ''), 'thread', e.thread) ORDER BY e.pos)
    FROM temp.jent e WHERE e.unit = u.unit AND e.lane = '' AND e.kind = 'entry' AND e.cb_pos IS NULL
      AND e.thread IS NOT NULL AND e.thread <> 'none'))) AS j
FROM temp.du u;

-- the backlog and the knowledge of a load: {preamble, tasks | findings}
CREATE TEMP VIEW IF NOT EXISTS jbacklog AS
SELECT u.unit AS unit, json_object('preamble', (SELECT preamble FROM preambles p WHERE p.unit = u.unit AND p.artifact = 'backlog'),
  'tasks', json((SELECT json_group_array(json(t.j) ORDER BY t.pos) FROM temp.jtask t WHERE t.unit = u.unit))) AS j
FROM temp.du u;
CREATE TEMP VIEW IF NOT EXISTS jknowledge AS
SELECT u.unit AS unit, json_object('preamble', (SELECT preamble FROM preambles p WHERE p.unit = u.unit AND p.artifact = 'knowledge'),
  'findings', json((SELECT json_group_array(json(f.j) ORDER BY f.pos) FROM temp.jfind f WHERE f.unit = u.unit))) AS j
FROM temp.du u;

-- the RefLoad of a held unit
CREATE TEMP VIEW IF NOT EXISTS jrefload AS
SELECT u.unit AS unit, json_object('unit', u.unit, 'present', json('true'),
  'knowledge', json((SELECT k.j FROM temp.jknowledge k WHERE k.unit = u.unit)),
  'board', json(CASE WHEN (SELECT preamble FROM preambles p WHERE p.unit = u.unit AND p.artifact = 'journal') IS NULL THEN NULL
    ELSE (SELECT b.j FROM temp.jboard b WHERE b.unit = u.unit) END)) AS j
FROM temp.du u;
