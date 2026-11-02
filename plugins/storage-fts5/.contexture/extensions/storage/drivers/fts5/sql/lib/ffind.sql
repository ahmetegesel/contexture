-- ffind.sql: the finding a1 names (the not found refusal)
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'finding ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM units u WHERE u.unit = a.unit)
    AND NOT EXISTS (SELECT 1 FROM findings f WHERE f.unit = a.unit AND f.name = a.a1);
CREATE TEMP TABLE fk AS SELECT f.pos AS pos FROM findings f, temp.a a
  WHERE f.unit = a.unit AND f.name = a.a1 ORDER BY f.pos LIMIT 1;
