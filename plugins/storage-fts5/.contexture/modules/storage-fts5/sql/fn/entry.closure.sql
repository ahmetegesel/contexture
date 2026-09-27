-- entry.closure <unit> <slug>: Closure: the last occurrence, whether it is closed, and every
-- closer standing after it that names it, in journal order, with its entry and anchor
BEGIN;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'entry ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE NOT EXISTS (SELECT 1 FROM journal_items j WHERE j.unit = a.unit AND j.kind = 'entry' AND j.slug = a.a1);
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('journal');
.read lib/model.sql
CREATE TEMP TABLE ecl AS SELECT x.pos AS pos, x.occ AS occ, x.cb_pos AS cb_pos FROM temp.xj x, temp.a a
  WHERE x.unit = a.unit AND x.lane = '' AND x.kind = 'entry' AND x.slug = a.a1 ORDER BY x.pos DESC LIMIT 1;
SELECT json_object('unit', a.unit, 'slug', a.a1, 'occurrence', l.occ, 'closed', json(CASE WHEN l.cb_pos IS NULL THEN 'false' ELSE 'true' END),
  'closers', json((SELECT json_group_array(json(json_object('by', b.slug, 'by_anchor', coalesce(b.anchor, ''), 'closer', json(c.j))) ORDER BY c.pos, c.cpos)
    FROM temp.jcloser c JOIN temp.xj b ON b.unit = c.unit AND b.lane = c.lane AND b.pos = c.pos
    WHERE c.unit = a.unit AND c.lane = '' AND c.pos > l.pos
      AND EXISTS (SELECT 1 FROM closer_targets t WHERE t.unit = c.unit AND t.lane = c.lane AND t.pos = c.pos AND t.cpos = c.cpos AND t.target = a.a1))))
FROM temp.a a, temp.ecl l;
COMMIT;
