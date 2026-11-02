-- finding.drop <unit> <NAME>: {unit, name}: the finding leaves the knowledge (R14)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/ffind.sql
.read lib/stop.sql
DELETE FROM finding_refs WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.fk);
DELETE FROM findings WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.fk);
INSERT INTO temp.tart SELECT unit, 'knowledge' FROM temp.a;
.read lib/touch.sql
SELECT json_object('unit', a.unit, 'name', a.a1) FROM temp.a a;
COMMIT;
