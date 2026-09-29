-- session.reopen <unit>: {unit, status: ACTIVE}; only from CLOSED (R3)
BEGIN IMMEDIATE;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_INVALID_TRANSITION', 'unit ''' || u.unit || ''' is ' || u.status || '; session.reopen moves only from CLOSED'
  FROM units u, temp.a a WHERE u.unit = a.unit AND u.status <> 'CLOSED';
.read lib/stop.sql
UPDATE units SET status = 'ACTIVE' WHERE unit = (SELECT unit FROM temp.a);
INSERT INTO temp.tart SELECT unit, 'state' FROM temp.a;
.read lib/touch.sql
SELECT json_object('unit', a.unit, 'status', 'ACTIVE') FROM temp.a a;
COMMIT;
