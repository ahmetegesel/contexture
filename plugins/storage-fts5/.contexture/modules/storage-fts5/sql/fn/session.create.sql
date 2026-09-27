-- session.create <unit> | objective, repos (list), attention: {unit, state: State}: the state
-- canonical at A1 (next_action 'backlog the first task', ref_sessions null), the backlog and
-- the knowledge present and empty, the journal holding the anchor A1 continuing A0 with the
-- attention (R4: a unit the store holds refuses)
BEGIN IMMEDIATE;
INSERT INTO temp.err SELECT 15, 1, 'ERR_ENTITY_EXISTS', 'unit ''' || a.unit || ''' already exists'
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM units u WHERE u.unit = a.unit);
INSERT INTO temp.err SELECT 40, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key objective' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'objective');
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key attention' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'attention');
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'objective takes one line' FROM temp.pay WHERE k = 'objective' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 43, 1, 'ERR_INVALID_ARGUMENT', 'objective holds a carriage return' FROM temp.pay WHERE k = 'objective' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 44, 1, 'ERR_INVALID_ARGUMENT', 'attention takes one line' FROM temp.pay WHERE k = 'attention' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', 'attention holds a carriage return' FROM temp.pay WHERE k = 'attention' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 46, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'repos';
INSERT INTO temp.err SELECT 47, 1, 'ERR_INVALID_ARGUMENT', 'repos element takes one line' FROM temp.plv WHERE base = 'repos' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 47, 1, 'ERR_INVALID_ARGUMENT', 'repos element holds a carriage return' FROM temp.plv WHERE base = 'repos' AND instr(v, char(13)) > 0 AND instr(v, char(10)) = 0;
.read lib/stop.sql
INSERT INTO units (unit, status, current_anchor, next_action, objective, repos, ref_sessions, verbatim)
  SELECT a.unit, 'ACTIVE', 'A1', 'backlog the first task', (SELECT v FROM temp.pay WHERE k = 'objective'),
    (SELECT json_group_array(v ORDER BY i) FROM temp.plv WHERE base = 'repos'), NULL, NULL FROM temp.a a;
INSERT INTO preambles (unit, artifact, preamble) SELECT a.unit, x.column1, '' FROM temp.a a, (VALUES ('backlog'), ('knowledge'), ('journal')) x;
INSERT INTO temp.jn (lane, kind, anchor, continues, attention) SELECT '', 'anchor', 'A1', 'A0', v FROM temp.pay WHERE k = 'attention';
.read lib/jappend.sql
.read lib/touch.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
.read lib/model.sql
SELECT json_object('unit', a.unit, 'state', json(s.j)) FROM temp.a a JOIN temp.jstate s ON s.unit = a.unit;
COMMIT;
