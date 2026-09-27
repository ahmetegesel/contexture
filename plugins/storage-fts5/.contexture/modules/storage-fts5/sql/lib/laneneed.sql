-- laneneed.sql: R19, a lane write needs its lane
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'lane ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM units WHERE unit = a.unit) AND NOT EXISTS (SELECT 1 FROM lanes l WHERE l.unit = a.unit AND l.lane = a.a1);
