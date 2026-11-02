-- entry.record <unit> | what, group, thread, rhythm, knowledge, refs (list), closers (list of
-- kind, targets, verdict, reason), slug, date, epoch: {unit, entry: Entry}, appended to the
-- journal with the current anchor (R7; a malformed one refuses rc 2 first, D43), a given slug
-- the journal holds refused (R5), a generated one <date>-event-<epoch> suffixed -1 while held
-- (R6), every closer target an entry the journal holds (R8)
BEGIN IMMEDIATE;
.read lib/held.sql
.read lib/closed.sql
.read lib/anchor.sql
UPDATE temp.err SET ord = 35 WHERE code = 'ERR_STORAGE_CORRUPT';
INSERT INTO temp.err SELECT 40, 1, 'ERR_INVALID_ARGUMENT', 'slug takes one line' FROM temp.pay WHERE k = 'slug' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 40.5, 1, 'ERR_INVALID_ARGUMENT', 'slug holds a carriage return' FROM temp.pay WHERE k = 'slug' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 41, 1, 'ERR_INVALID_ARGUMENT', 'malformed slug ''' || v || ''''
  FROM temp.pay WHERE k = 'slug' AND NOT (v <> '' AND substr(v, 1, 1) GLOB '[A-Za-z0-9]' AND v NOT GLOB '*[^A-Za-z0-9_-]*');
INSERT INTO temp.err SELECT 42, 1, 'ERR_ENTITY_EXISTS', 'entry ''' || p.v || ''' already exists in unit ''' || a.unit || ''''
  FROM temp.pay p, temp.a a WHERE p.k = 'slug'
    AND EXISTS (SELECT 1 FROM journal_items j WHERE j.unit = a.unit AND j.kind = 'entry' AND j.slug = p.v);
INSERT INTO temp.err SELECT 43, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key what' WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'what');
INSERT INTO temp.err SELECT 44, 1, 'ERR_INVALID_ARGUMENT', 'what takes one line' FROM temp.pay WHERE k = 'what' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 44.5, 1, 'ERR_INVALID_ARGUMENT', 'what holds a carriage return' FROM temp.pay WHERE k = 'what' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 45, 1, 'ERR_INVALID_ARGUMENT', 'group takes one line' FROM temp.pay WHERE k = 'group' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 45.5, 1, 'ERR_INVALID_ARGUMENT', 'group holds a carriage return' FROM temp.pay WHERE k = 'group' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 46, 1, 'ERR_INVALID_ARGUMENT', 'thread takes one line' FROM temp.pay WHERE k = 'thread' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 46.5, 1, 'ERR_INVALID_ARGUMENT', 'thread holds a carriage return' FROM temp.pay WHERE k = 'thread' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 47, 1, 'ERR_INVALID_ARGUMENT', 'rhythm takes one line' FROM temp.pay WHERE k = 'rhythm' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 47.5, 1, 'ERR_INVALID_ARGUMENT', 'rhythm holds a carriage return' FROM temp.pay WHERE k = 'rhythm' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 48, 1, 'ERR_INVALID_ARGUMENT', 'knowledge takes true or false' FROM temp.pay WHERE k = 'knowledge' AND v NOT IN ('true', 'false');
INSERT INTO temp.err SELECT 49, 1, 'ERR_INVALID_ARGUMENT', msg FROM temp.plbad WHERE base = 'refs';
INSERT INTO temp.err SELECT 50 + i * 0.001, 1, 'ERR_INVALID_ARGUMENT', 'refs element takes one line' FROM temp.plv WHERE base = 'refs' AND instr(v, char(10)) > 0;
INSERT INTO temp.err SELECT 50 + i * 0.001 + 0.0005, 1, 'ERR_INVALID_ARGUMENT', 'refs element holds a carriage return' FROM temp.plv WHERE base = 'refs' AND instr(v, char(13)) > 0;
INSERT INTO temp.err SELECT 60, 1, 'ERR_INVALID_ARGUMENT', 'malformed closers.count' FROM temp.pay WHERE k = 'closers.count' AND (v = '' OR v GLOB '*[^0-9]*');

-- the closers, each checked whole before the next (its kind, its targets list, the verdict and
-- the reason, then each target a date-slug the journal holds)
CREATE TEMP TABLE rcl AS SELECT s.i AS c,
  (SELECT v FROM temp.pay WHERE k = 'closers.' || s.i || '.kind') AS kind,
  (SELECT v FROM temp.pay WHERE k = 'closers.' || s.i || '.verdict') AS verdict,
  (SELECT v FROM temp.pay WHERE k = 'closers.' || s.i || '.reason') AS reason,
  (SELECT n FROM temp.pl WHERE base = 'closers.' || s.i || '.targets') AS nt
  FROM temp.nums s WHERE s.i <= coalesce((SELECT CAST(v AS INTEGER) FROM temp.pay WHERE k = 'closers.count' AND v <> '' AND v NOT GLOB '*[^0-9]*'), 0);
CREATE TEMP TABLE rct AS SELECT r.c AS c, v.i AS t, v.v AS target FROM temp.rcl r JOIN temp.plv v ON v.base = 'closers.' || r.c || '.targets';
INSERT INTO temp.err SELECT 100 + c + 0.01, 1, 'ERR_INVALID_ARGUMENT', 'closers.' || c || '.kind takes CLOSES or SUPERSEDES'
  FROM temp.rcl WHERE kind IS NULL OR kind NOT IN ('CLOSES', 'SUPERSEDES');
INSERT INTO temp.err SELECT 100 + r.c + 0.02, 1, 'ERR_INVALID_ARGUMENT', b.msg FROM temp.rcl r JOIN temp.plbad b ON b.base = 'closers.' || r.c || '.targets';
INSERT INTO temp.err SELECT 100 + c + 0.03, 1, 'ERR_INVALID_ARGUMENT', 'closers.' || c || ' names no target'
  FROM temp.rcl WHERE coalesce(nt, 0) < 1 AND NOT EXISTS (SELECT 1 FROM temp.plbad b WHERE b.base = 'closers.' || rcl.c || '.targets' AND b.msg LIKE 'malformed%');
INSERT INTO temp.err SELECT 100 + c + 0.04, 1, 'ERR_INVALID_ARGUMENT', 'closers.' || c || '.verdict takes done, superseded, dropped, or folded'
  FROM temp.rcl WHERE verdict IS NOT NULL AND verdict NOT IN ('done', 'superseded', 'dropped', 'folded');
INSERT INTO temp.err SELECT 100 + c + 0.05, 1, 'ERR_INVALID_ARGUMENT', 'closers.' || c || '.reason takes one line' FROM temp.rcl WHERE instr(reason, char(10)) > 0;
INSERT INTO temp.err SELECT 100 + c + 0.055, 1, 'ERR_INVALID_ARGUMENT', 'closers.' || c || '.reason holds a carriage return' FROM temp.rcl WHERE instr(reason, char(13)) > 0;
INSERT INTO temp.err SELECT 100 + c + 0.06, 1, 'ERR_INVALID_ARGUMENT', 'closers.' || c || '.reason holds a parenthesis' FROM temp.rcl
  WHERE instr(reason, '(') > 0 OR instr(reason, ')') > 0;
INSERT INTO temp.err SELECT 100 + c + 0.07, 1, 'ERR_INVALID_ARGUMENT', 'closers.' || c || ' carries a verdict without a reason' FROM temp.rcl
  WHERE verdict IS NOT NULL AND reason IS NULL;
INSERT INTO temp.err SELECT 100 + c + 0.08 + t * 0.00001, 1, 'ERR_INVALID_ARGUMENT', 'closers.' || c || ' target ''' || coalesce(target, '') || ''' is not a date-slug'
  FROM temp.rct WHERE NOT (length(target) >= 12 AND substr(target, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-'
    AND substr(target, 12) NOT GLOB '*[^a-zA-Z0-9_-]*' AND substr(target, -1) GLOB '[a-zA-Z0-9]');
INSERT INTO temp.err SELECT 100 + t.c + 0.08 + t.t * 0.00001 + 0.000005, 1, 'ERR_ENTITY_NOT_FOUND', 'entry ''' || t.target || ''' not found in unit ''' || a.unit || ''''
  FROM temp.rct t, temp.a a WHERE NOT EXISTS (SELECT 1 FROM journal_items j WHERE j.unit = a.unit AND j.kind = 'entry' AND j.slug = t.target);

-- a generated slug needs the client's date and epoch
INSERT INTO temp.err SELECT 900, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key date'
  WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug') AND NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'date');
INSERT INTO temp.err SELECT 901, 1, 'ERR_INVALID_ARGUMENT', 'missing payload key epoch'
  WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug') AND NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'epoch');
INSERT INTO temp.err SELECT 902, 1, 'ERR_INVALID_ARGUMENT', 'date takes YYYY-MM-DD' FROM temp.pay
  WHERE k = 'date' AND NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug') AND NOT (length(v) = 10 AND v GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
INSERT INTO temp.err SELECT 903, 1, 'ERR_INVALID_ARGUMENT', 'epoch takes digits' FROM temp.pay
  WHERE k = 'epoch' AND NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug') AND (v = '' OR v GLOB '*[^0-9]*');
.read lib/stop.sql

INSERT INTO temp.gs (lane, base) SELECT '', (SELECT v FROM temp.pay WHERE k = 'date') || '-event-' || (SELECT v FROM temp.pay WHERE k = 'epoch')
  WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = 'slug');
.read lib/genslug.sql
INSERT INTO temp.jn (lane, kind, slug, anchor, what, grp, rhythm, knowledge, thread)
  SELECT '', 'entry', coalesce((SELECT v FROM temp.pay WHERE k = 'slug'), (SELECT slug FROM temp.gs)),
    (SELECT current_anchor FROM units WHERE unit = (SELECT unit FROM temp.a)), (SELECT v FROM temp.pay WHERE k = 'what'),
    (SELECT v FROM temp.pay WHERE k = 'group'), (SELECT v FROM temp.pay WHERE k = 'rhythm'),
    CASE WHEN (SELECT v FROM temp.pay WHERE k = 'knowledge') = 'true' THEN 1 ELSE 0 END, (SELECT v FROM temp.pay WHERE k = 'thread');
DELETE FROM temp.gs;
INSERT INTO temp.jnr SELECT i, v FROM temp.plv WHERE base = 'refs';
-- each closer as the parse rules read its canonical line back: a reason alone that opens with a
-- verdict word and a colon reads as that verdict and the rest; an empty reason alone reads as
-- none (its empty parenthesis carries no content)
INSERT INTO temp.jnc SELECT c, kind,
  CASE WHEN verdict IS NULL AND (reason GLOB 'done: *' OR reason GLOB 'superseded: *' OR reason GLOB 'dropped: *' OR reason GLOB 'folded: *')
    THEN substr(reason, 1, instr(reason, ':') - 1) ELSE verdict END,
  CASE WHEN verdict IS NULL AND (reason GLOB 'done: *' OR reason GLOB 'superseded: *' OR reason GLOB 'dropped: *' OR reason GLOB 'folded: *')
      THEN substr(reason, instr(reason, ':') + 2)
    WHEN verdict IS NULL AND reason = '' THEN NULL ELSE reason END
FROM temp.rcl;
INSERT INTO temp.jnt SELECT c, t, target FROM temp.rct;
.read lib/jappend.sql
INSERT INTO temp.tart SELECT unit, 'journal' FROM temp.a;
.read lib/touch.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('journal');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'entry', json((SELECT e.j FROM temp.jent e WHERE e.unit = a.unit AND e.lane = '' AND e.pos = (SELECT pos FROM temp.jnpos))))
  FROM temp.a a;
COMMIT;
