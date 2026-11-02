-- session.next <unit> | pointer: {unit, next_action}; the pointer names every IN_PROGRESS
-- task (R12)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key pointer' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'pointer');
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'pointer takes one line' FROM temp.pay WHERE k = 'pointer' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'pointer holds a carriage return' FROM temp.pay WHERE k = 'pointer' AND instr(v, char(13)) > 0;
CREATE TEMP TABLE ptr AS SELECT (SELECT v FROM temp.pay WHERE k = 'pointer') AS p, NULL AS extra;
.read lib/pointer.sql
.read lib/stop.sql
UPDATE units SET next_action = (SELECT p FROM temp.ptr) WHERE unit = (SELECT unit FROM temp.a);
INSERT INTO temp.tart SELECT unit, 'state' FROM temp.a;
.read lib/touch.sql
SELECT json_object('unit', u.unit, 'next_action', u.next_action) FROM units u WHERE u.unit = (SELECT unit FROM temp.a);
COMMIT;
