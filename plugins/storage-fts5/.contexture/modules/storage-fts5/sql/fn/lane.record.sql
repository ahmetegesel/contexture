-- lane.record <unit> <lane> | what, thread, refs (list), slug, date, epoch: {unit, lane, entry:
-- LaneEntry}, appended to the lane journal in the lane canonical lines (R19: the lane must
-- exist; R5: a given slug the lane journal holds refuses; R6: a generated slug takes -1 while
-- held)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/laneneed.sql
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'slug takes one line' FROM temp.pay WHERE k = 'slug' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 41.5, 1, 'ERR_INVALID_ARGUMENT', 'slug holds a carriage return' FROM temp.pay WHERE k = 'slug' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 42, 1, 'ERR_INVALID_ARGUMENT', 'malformed slug ''' || v || ''''
  FROM temp.pay WHERE k = 'slug' AND NOT (v <> '' AND substr(v, 1, 1) GLOB '[A-Za-z0-9]' AND v NOT GLOB '*[^A-Za-z0-9_-]*');
INSERT INTO temp.err SELECT 43, 1, 'ERR_ENTITY_EXISTS', 'lane entry ''' || a.a1 || '/' || p.v || ''' already exists in unit ''' || a.unit || ''''
  FROM temp.pay p, temp.a a WHERE p.k = 'slug'
    AND EXISTS (SELECT 1 FROM lane_items j WHERE j.unit = a.unit AND j.lane = a.a1 AND j.kind = 'entry' AND j.slug = p.v);
INSERT INTO temp.err SELECT 44, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key what' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'what');
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', 'what takes one line' FROM temp.pay WHERE k = 'what' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 45.5, 1, 'ERR_INVALID_ARGUMENT', 'what holds a carriage return' FROM temp.pay WHERE k = 'what' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 46, 1, 'ERR_INVALID_ARGUMENT', 'thread takes one line' FROM temp.pay WHERE k = 'thread' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 46.5, 1, 'ERR_INVALID_ARGUMENT', 'thread holds a carriage return' FROM temp.pay WHERE k = 'thread' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 47, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'refs';
INSERT INTO temp.err SELECT 48 + i * 0.001, 1, 'ERR_INVALID_ARGUMENT', 'refs element takes one line' FROM temp.plv WHERE base = 'refs' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 48 + i * 0.001 + 0.0005, 1, 'ERR_INVALID_ARGUMENT', 'refs element holds a carriage return' FROM temp.plv WHERE base = 'refs' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 900, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key date'
  WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug') AND NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'date');
INSERT INTO temp.err SELECT 901, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key epoch'
  WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug') AND NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'epoch');
INSERT INTO temp.err SELECT 902, 1, 'ERR_INVALID_ARGUMENT', 'date takes YYYY-MM-DD' FROM temp.pay
  WHERE k = 'date' AND NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug') AND NOT (length(v) = 10 AND v GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
INSERT INTO temp.err SELECT 903, 1, 'ERR_INVALID_ARGUMENT', 'epoch takes digits' FROM temp.pay
  WHERE k = 'epoch' AND NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug') AND (v = '' OR v GLOB '*[^0-9]*');
.read lib/stop.sql
INSERT INTO temp.gs (lane, base) SELECT (SELECT a1 FROM temp.a), (SELECT v FROM temp.pay WHERE k = 'date') || '-event-' || (SELECT v FROM temp.pay WHERE k = 'epoch')
  WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug');
.read lib/genslug.sql
INSERT INTO temp.jn (lane, kind, slug, what, knowledge, thread)
  SELECT a.a1, 'entry', coalesce((SELECT v FROM temp.pay WHERE k = 'slug'), (SELECT slug FROM temp.gs)), (SELECT v FROM temp.pay WHERE k = 'what'), 0,
    (SELECT v FROM temp.pay WHERE k = 'thread') FROM temp.a a;
DELETE FROM temp.gs;
INSERT INTO temp.jnr SELECT i, v FROM temp.plv WHERE base = 'refs';
.read lib/jappend.sql
INSERT INTO temp.tart SELECT unit, 'lane:' || (SELECT a1 FROM temp.a) FROM temp.a;
.read lib/touch.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('lanes');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'lane', a.a1, 'entry', json((SELECT e.jl FROM temp.jent e WHERE e.unit = a.unit AND e.lane = a.a1 AND e.pos = (SELECT pos FROM temp.jnpos))))
  FROM temp.a a;
COMMIT;
