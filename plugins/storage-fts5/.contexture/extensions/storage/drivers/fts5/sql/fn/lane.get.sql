-- lane.get <unit> <lane> <recipe|journal|report>: LaneDoc (the document as stored, null when
-- absent) or LaneJournal (the preamble, every item)
BEGIN;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'lane ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM units WHERE unit = a.unit) AND NOT EXISTS (SELECT 1 FROM lanes l WHERE l.unit = a.unit AND l.lane = a.a1);
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp SELECT 'lanes' FROM temp.a WHERE a2 = 'journal';
.read lib/model.sql
SELECT CASE a.a2 WHEN 'journal' THEN json_object('unit', a.unit, 'lane', a.a1, 'artifact', 'journal', 'preamble', l.journal_preamble,
    'items', json((SELECT json_group_array(json(e.jl) ORDER BY e.pos) FROM temp.jent e WHERE e.unit = a.unit AND e.lane = a.a1)))
  ELSE json_object('unit', a.unit, 'lane', a.a1, 'artifact', a.a2, 'content', CASE a.a2 WHEN 'recipe' THEN l.recipe ELSE l.report END) END
FROM temp.a a JOIN lanes l ON l.unit = a.unit AND l.lane = a.a1;
COMMIT;
