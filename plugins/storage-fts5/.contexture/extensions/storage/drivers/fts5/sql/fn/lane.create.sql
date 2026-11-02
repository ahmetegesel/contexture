-- lane.create <unit> <lane> | the recipe raw: {unit, lane}: the recipe stored byte for byte and
-- an empty journal (preamble ''), no report (R19, D5, D44: an existing lane refuses)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_EXISTS', 'lane ''' || a.a1 || ''' already exists in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM lanes l WHERE l.unit = a.unit AND l.lane = a.a1);
.read lib/stop.sql
INSERT INTO lanes (unit, lane, recipe, report, journal_preamble)
  SELECT a.unit, a.a1, coalesce(CAST(readfile((SELECT v FROM temp.arg WHERE k = 'doc')) AS TEXT), ''), NULL, '' FROM temp.a a;
INSERT INTO temp.tart SELECT unit, 'lane:' || (SELECT a1 FROM temp.a) FROM temp.a;
.read lib/touch.sql
SELECT json_object('unit', a.unit, 'lane', a.a1) FROM temp.a a;
COMMIT;
