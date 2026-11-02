-- session.load <unit>: Load: the state, the backlog and the knowledge with every item, the
-- board (null when the journal is absent), and a RefLoad per unit the state's ref_sessions
-- names (present false for a unit the store lacks)
BEGIN;
.read lib/held.sql
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT OR IGNORE INTO temp.du SELECT e.value FROM units u, json_each(u.ref_sessions) e
  WHERE u.unit = (SELECT unit FROM temp.a) AND EXISTS (SELECT 1 FROM units x WHERE x.unit = e.value);
INSERT INTO temp.dp VALUES ('backlog'), ('knowledge'), ('journal');
.read lib/model.sql
SELECT json_object('unit', u.unit, 'state', json(s.j),
  'backlog', json((SELECT b.j FROM temp.jbacklog b WHERE b.unit = u.unit)),
  'knowledge', json((SELECT k.j FROM temp.jknowledge k WHERE k.unit = u.unit)),
  'board', json(CASE WHEN (SELECT preamble FROM preambles WHERE unit = u.unit AND artifact = 'journal') IS NULL THEN NULL
    ELSE (SELECT b.j FROM temp.jboard b WHERE b.unit = u.unit) END),
  'refs', json((SELECT json_group_array(json(coalesce((SELECT r.j FROM temp.jrefload r WHERE r.unit = e.value),
      json_object('unit', e.value, 'present', json('false'), 'knowledge', NULL, 'board', NULL))) ORDER BY e.key)
    FROM json_each(u.ref_sessions) e)))
FROM units u JOIN temp.jstate s ON s.unit = u.unit WHERE u.unit = (SELECT unit FROM temp.a);
COMMIT;
