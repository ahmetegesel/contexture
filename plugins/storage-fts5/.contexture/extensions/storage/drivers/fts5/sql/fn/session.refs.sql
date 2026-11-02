-- session.refs <unit> <ref>...: {unit, ref_sessions}; every named unit held (R13)
BEGIN IMMEDIATE;
.read lib/held.sql
INSERT INTO temp.err SELECT 15, 1, 'ERR_INVALID_ARGUMENT', 'malformed unit ''' || v || '''' FROM temp.arg WHERE k = 'badref';
.read lib/closed.sql
INSERT INTO temp.err SELECT 40 + CAST(substr(k, 2) AS INTEGER) * 0.001, 1, 'ERR_ENTITY_NOT_FOUND', 'unit ''' || v || ''' not found'
  FROM temp.arg WHERE k GLOB 'a[0-9]*' AND NOT EXISTS (SELECT 1 FROM units u WHERE u.unit = temp.arg.v);
.read lib/stop.sql
CREATE TEMP TABLE rfs AS SELECT CAST(substr(k, 2) AS INTEGER) AS i, v FROM temp.arg WHERE k GLOB 'a[0-9]*';
UPDATE units SET ref_sessions = (SELECT json_group_array(v ORDER BY i) FROM temp.rfs) WHERE unit = (SELECT unit FROM temp.a);
INSERT INTO temp.tart SELECT unit, 'state' FROM temp.a;
.read lib/touch.sql
SELECT json_object('unit', u.unit, 'ref_sessions', json((SELECT json_group_array(e.value ORDER BY e.key) FROM json_each(u.ref_sessions) e)))
  FROM units u WHERE u.unit = (SELECT unit FROM temp.a);
COMMIT;
