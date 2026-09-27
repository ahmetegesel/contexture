-- session.list: {store, units: [UnitSummary]} bytewise by unit; store absent while the store
-- holds no unit
BEGIN;
INSERT INTO temp.du SELECT unit FROM units;
.read lib/model.sql
SELECT json_object('store', CASE WHEN EXISTS (SELECT 1 FROM units) THEN 'present' ELSE 'absent' END,
  'units', json((SELECT json_group_array(json(s.j) ORDER BY s.unit) FROM temp.jstate s)));
COMMIT;
