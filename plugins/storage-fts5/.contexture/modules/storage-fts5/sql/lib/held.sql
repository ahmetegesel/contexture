-- held.sql: R1, a unit-scoped function on a unit the store lacks refuses rc 1
INSERT INTO temp.err SELECT 10, 1, 'ERR_ENTITY_NOT_FOUND', 'unit ''' || a.unit || ''' not found'
  FROM temp.a a WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.unit = a.unit);
