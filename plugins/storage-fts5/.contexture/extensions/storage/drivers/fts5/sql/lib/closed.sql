-- closed.sql: R2, every write to a CLOSED unit refuses rc 1 before any other record rule
INSERT INTO temp.err SELECT 30, 1, 'ERR_UNIT_CLOSED', 'unit ''' || u.unit || ''' is CLOSED; a closed unit takes no writes'
  FROM units u, temp.a a WHERE u.unit = a.unit AND u.status = 'CLOSED';
