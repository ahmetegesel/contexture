-- session.close <unit>: {unit, status: CLOSED, open_tasks, audit: Audit}; only from ACTIVE (R3)
BEGIN IMMEDIATE;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_INVALID_TRANSITION', 'unit ''' || u.unit || ''' is ' || u.status || '; session.close moves only from ACTIVE'
  FROM units u, temp.a a WHERE u.unit = a.unit AND u.status <> 'ACTIVE';
.read lib/stop.sql
UPDATE units SET status = 'CLOSED' WHERE unit = (SELECT unit FROM temp.a);
INSERT INTO temp.tart SELECT unit, 'state' FROM temp.a;
.read lib/touch.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('backlog'), ('journal');
.read lib/model.sql
.read lib/audit.sql
SELECT json_object('unit', a.unit, 'status', 'CLOSED',
  'open_tasks', json((SELECT json_group_array(t.slug ORDER BY t.pos) FROM temp.xt t WHERE t.unit = a.unit AND t.status <> 'DONE')),
  'audit', json((SELECT j FROM temp.audj))) FROM temp.a a;
COMMIT;
