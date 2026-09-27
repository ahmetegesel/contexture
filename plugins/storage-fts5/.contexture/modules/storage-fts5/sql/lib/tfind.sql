-- tfind.sql: the task a1 names (the first task of the slug; R1 and the not found refusal)
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'task ''' || a.a1 || ''' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM units u WHERE u.unit = a.unit)
    AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.unit = a.unit AND t.kind = 'task' AND t.slug = a.a1);
CREATE TEMP TABLE tk AS SELECT t.pos AS pos, t.status AS status, t.verbatim AS verbatim FROM tasks t, temp.a a
  WHERE t.unit = a.unit AND t.kind = 'task' AND t.slug = a.a1 ORDER BY t.pos LIMIT 1;
