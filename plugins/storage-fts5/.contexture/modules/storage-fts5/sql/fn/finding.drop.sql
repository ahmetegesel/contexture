-- finding.drop <unit> <NAME>: {unit, name}: the finding leaves the knowledge (R14; the drop
-- rule of lib/idrop.sql)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/ffind.sql
.read lib/stop.sql
INSERT INTO temp.idp SELECT 'finding', pos FROM temp.fk;
.read lib/idrop.sql
INSERT INTO temp.tart SELECT unit, 'knowledge' FROM temp.a;
.read lib/touch.sql
SELECT json_object('unit', a.unit, 'name', a.a1) FROM temp.a a;
COMMIT;
