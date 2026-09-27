-- unit.export.sql: the dump of the unit temp.arg k 'unit' names (docs/the-engine.md, The
-- dump): one compact JSON object per row in the dump's line order, keys in the contract
-- order, strings in the JSON.stringify form json_object writes. The caller checked that
-- the unit is held and prints the rows one per line.
WITH
u AS (SELECT v AS unit FROM temp.arg WHERE k = 'unit'),
body(s1, s2, s3, pos, line) AS (
  SELECT 1, '', 0, 0, json_object('kind', 'state', 'status', x.status, 'current_anchor', x.current_anchor,
    'next_action', x.next_action, 'objective', x.objective,
    'repos', json(coalesce((SELECT json_group_array(e.value ORDER BY e.key) FROM json_each(x.repos) e), '[]')),
    'ref_sessions', json(CASE WHEN x.ref_sessions IS NULL THEN NULL ELSE
      coalesce((SELECT json_group_array(e.value ORDER BY e.key) FROM json_each(x.ref_sessions) e), '[]') END),
    'verbatim', x.verbatim)
  FROM units x, u WHERE x.unit = u.unit
  UNION ALL
  SELECT CASE p.artifact WHEN 'backlog' THEN 2 WHEN 'knowledge' THEN 3 ELSE 4 END, '', 0, 0,
    json_object('kind', 'artifact', 'name', p.artifact, 'preamble', p.preamble)
  FROM preambles p, u WHERE p.unit = u.unit
  UNION ALL
  SELECT 2, '', 0, t.pos, CASE t.kind WHEN 'opaque' THEN json_object('kind', 'opaque', 'verbatim', t.verbatim) ELSE
    json_object('kind', 'task', 'slug', t.slug, 'status', t.status, 'objective', t.objective,
      'refs', json(coalesce((SELECT json_group_array(r.ref ORDER BY r.rpos) FROM item_refs r
        WHERE r.unit = t.unit AND r.lane = '' AND r.artifact = 'backlog' AND r.pos = t.pos), '[]')),
      'description', t.description, 'criteria', t.criteria, 'details', t.details, 'verbatim', t.verbatim) END
  FROM tasks t, u WHERE t.unit = u.unit
  UNION ALL
  SELECT 3, '', 0, f.pos, CASE f.kind WHEN 'opaque' THEN json_object('kind', 'opaque', 'verbatim', f.verbatim) ELSE
    json_object('kind', 'finding', 'name', f.name,
      'supersedes', json(CASE WHEN f.supersedes_name IS NULL THEN NULL ELSE json_object('name', f.supersedes_name, 'reason', f.supersedes_reason) END),
      'refs', json(coalesce((SELECT json_group_array(r.ref ORDER BY r.rpos) FROM finding_refs r
        WHERE r.unit = f.unit AND r.pos = f.pos), '[]')),
      'summary', f.summary, 'verbatim', f.verbatim) END
  FROM findings f, u WHERE f.unit = u.unit
  UNION ALL
  SELECT 4, '', 0, i.pos, CASE i.kind WHEN 'anchor' THEN
    json_object('kind', 'anchor', 'anchor', i.anchor, 'continues', i.continues, 'attention', i.attention, 'verbatim', i.verbatim) ELSE
    json_object('kind', 'entry', 'slug', i.slug, 'anchor', i.anchor, 'what', i.what, 'group', i.grp, 'rhythm', i.rhythm,
      'knowledge', json(CASE i.knowledge WHEN 1 THEN 'true' ELSE 'false' END), 'thread', i.thread, 'legacy_status', i.legacy_status,
      'refs', json(coalesce((SELECT json_group_array(r.ref ORDER BY r.rpos) FROM item_refs r
        WHERE r.unit = i.unit AND r.lane = '' AND r.artifact = 'journal' AND r.pos = i.pos), '[]')),
      'closers', json(coalesce((SELECT json_group_array(json_object('kind', c.kind,
          'targets', json(coalesce((SELECT json_group_array(t.target ORDER BY t.tpos) FROM closer_targets t
            WHERE t.unit = c.unit AND t.lane = c.lane AND t.pos = c.pos AND t.cpos = c.cpos), '[]')),
          'verdict', c.verdict, 'reason', c.reason, 'verbatim', c.verbatim) ORDER BY c.cpos)
        FROM closers c WHERE c.unit = i.unit AND c.lane = '' AND c.pos = i.pos), '[]')),
      'extra_fields', json(coalesce((SELECT json_group_array(json_object('key', x.key, 'value', x.value) ORDER BY x.fpos)
        FROM extra_fields x WHERE x.unit = i.unit AND x.lane = '' AND x.pos = i.pos), '[]')),
      'verbatim', i.verbatim) END
  FROM journal_items i, u WHERE i.unit = u.unit
  UNION ALL
  SELECT 5, l.lane, 0, 0, json_object('kind', 'lane', 'lane', l.lane, 'recipe', l.recipe, 'report', l.report,
    'journal_preamble', l.journal_preamble)
  FROM lanes l, u WHERE l.unit = u.unit
  UNION ALL
  SELECT 5, i.lane, 1, i.pos, CASE i.kind WHEN 'anchor' THEN
    json_object('kind', 'lane_item', 'lane', i.lane, 'item', 'anchor', 'anchor', i.anchor, 'continues', i.continues,
      'attention', i.attention, 'verbatim', i.verbatim) ELSE
    json_object('kind', 'lane_item', 'lane', i.lane, 'item', 'entry', 'slug', i.slug, 'anchor', i.anchor, 'what', i.what,
      'group', i.grp, 'rhythm', i.rhythm, 'knowledge', json(CASE i.knowledge WHEN 1 THEN 'true' ELSE 'false' END),
      'thread', i.thread, 'legacy_status', i.legacy_status,
      'refs', json(coalesce((SELECT json_group_array(r.ref ORDER BY r.rpos) FROM item_refs r
        WHERE r.unit = i.unit AND r.lane = i.lane AND r.artifact = 'journal' AND r.pos = i.pos), '[]')),
      'closers', json(coalesce((SELECT json_group_array(json_object('kind', c.kind,
          'targets', json(coalesce((SELECT json_group_array(t.target ORDER BY t.tpos) FROM closer_targets t
            WHERE t.unit = c.unit AND t.lane = c.lane AND t.pos = c.pos AND t.cpos = c.cpos), '[]')),
          'verdict', c.verdict, 'reason', c.reason, 'verbatim', c.verbatim) ORDER BY c.cpos)
        FROM closers c WHERE c.unit = i.unit AND c.lane = i.lane AND c.pos = i.pos), '[]')),
      'extra_fields', json(coalesce((SELECT json_group_array(json_object('key', x.key, 'value', x.value) ORDER BY x.fpos)
        FROM extra_fields x WHERE x.unit = i.unit AND x.lane = i.lane AND x.pos = i.pos), '[]')),
      'verbatim', i.verbatim) END
  FROM lane_items i, u WHERE i.unit = u.unit
)
SELECT line FROM (
  SELECT 0 AS s1, '' AS s2, 0 AS s3, 0 AS pos,
    json_object('kind', 'unit', 'format', 'contexture-dump', 'version', 1, 'unit', u.unit, 'extras', 0) AS line
  FROM u
  UNION ALL
  SELECT s1, s2, s3, pos, line FROM body
  UNION ALL
  SELECT 6, '', 0, 0, json_object('kind', 'end', 'unit', u.unit, 'records', (SELECT count(*) FROM body)) FROM u
) ORDER BY s1, s2 COLLATE BINARY, s3, pos;
