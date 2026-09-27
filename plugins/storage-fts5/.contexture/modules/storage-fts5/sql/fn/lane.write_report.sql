-- lane.write_report <unit> <lane> | the report raw: {unit, lane, bytes}: the report stored byte
-- for byte (R19: the lane must exist)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/laneneed.sql
.read lib/stop.sql
UPDATE lanes SET report = coalesce(CAST(readfile((SELECT v FROM temp.arg WHERE k = 'doc')) AS TEXT), '')
  WHERE unit = (SELECT unit FROM temp.a) AND lane = (SELECT a1 FROM temp.a);
INSERT INTO temp.tart SELECT unit, 'lane:' || (SELECT a1 FROM temp.a) FROM temp.a;
.read lib/touch.sql
SELECT json_object('unit', a.unit, 'lane', a.a1, 'bytes', (SELECT CAST(v AS INTEGER) FROM temp.arg WHERE k = 'docsize')) FROM temp.a a;
COMMIT;
