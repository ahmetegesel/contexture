-- audit.sql: the Audit of the unit temp.a names (R16; lib/model.sql run first with the
-- backlog and the journal): the record checks every backend implements, in the deterministic
-- order of docs/the-engine.md, The record rules: LEGACY_DUPLICATE_SLUG (a warning) in journal
-- position order; then DANGLING_CLOSER (one per distinct target the journal does not hold, at
-- the first closer naming it), UNHARVESTED_KNOWLEDGE (a live entry flagged KNOWLEDGE),
-- DONE_WITHOUT_EVENT (a DONE task whose "backlog/<slug>: DONE" no entry's WHAT carries, in
-- backlog order), IN_PROGRESS_ABSENT_FROM_STATE (an IN_PROGRESS task the state text does not
-- name, in backlog order), MISSING_THREAD (an entry dated 2026-09-18 or later without THREAD),
-- each by position. The grammar checks with their line numbers are posix's alone (R17): this
-- store holds typed items, so line and first_line are null. open_threads: every live entry
-- whose thread is set and not none. temp.audj holds the answer.
DROP TABLE IF EXISTS temp.af;
CREATE TEMP TABLE af (rk INTEGER, p1 INTEGER, p2 INTEGER, p3 INTEGER, code TEXT, severity TEXT, slug TEXT, detail TEXT, occ INTEGER);
INSERT INTO temp.af SELECT 1, x.pos, 0, 0, 'LEGACY_DUPLICATE_SLUG', 'warning', x.slug, NULL, x.occ
  FROM temp.xj x WHERE x.unit = (SELECT unit FROM temp.a) AND x.lane = '' AND x.kind = 'entry' AND x.occ > 1;
INSERT INTO temp.af SELECT 2, d.pos, d.cpos, d.tpos, 'DANGLING_CLOSER', 'error', d.slug, d.target, NULL FROM (
  SELECT t.pos AS pos, t.cpos AS cpos, t.tpos AS tpos, t.target AS target, x.slug AS slug,
    row_number() OVER (PARTITION BY t.target ORDER BY t.pos, t.cpos, t.tpos) AS rn
  FROM closer_targets t JOIN temp.xj x ON x.unit = t.unit AND x.lane = t.lane AND x.pos = t.pos
  WHERE t.unit = (SELECT unit FROM temp.a) AND t.lane = ''
    AND NOT EXISTS (SELECT 1 FROM journal_items j WHERE j.unit = t.unit AND j.kind = 'entry' AND j.slug = t.target)) d WHERE d.rn = 1;
INSERT INTO temp.af SELECT 3, x.pos, 0, 0, 'UNHARVESTED_KNOWLEDGE', 'error', x.slug, NULL, NULL
  FROM temp.xj x WHERE x.unit = (SELECT unit FROM temp.a) AND x.lane = '' AND x.kind = 'entry' AND x.knowledge = 1 AND x.cb_pos IS NULL;
INSERT INTO temp.af SELECT 4, t.pos, 0, 0, 'DONE_WITHOUT_EVENT', 'error', t.slug, NULL, NULL
  FROM temp.xt t WHERE t.unit = (SELECT unit FROM temp.a) AND t.kind = 'task' AND t.status = 'DONE'
    AND NOT EXISTS (SELECT 1 FROM journal_items j WHERE j.unit = t.unit AND j.kind = 'entry' AND instr(j.what, 'backlog/' || t.slug || ': DONE') > 0)
    AND NOT EXISTS (SELECT 1 FROM extra_fields e JOIN journal_items j ON j.unit = e.unit AND j.pos = e.pos AND j.kind = 'entry'
      WHERE e.unit = t.unit AND e.lane = '' AND e.key = 'WHAT' AND instr(e.value, 'backlog/' || t.slug || ': DONE') > 0);
INSERT INTO temp.af SELECT 5, t.pos, 0, 0, 'IN_PROGRESS_ABSENT_FROM_STATE', 'error', t.slug, NULL, NULL
  FROM temp.xt t WHERE t.unit = (SELECT unit FROM temp.a) AND t.kind = 'task' AND t.status = 'IN_PROGRESS'
    AND instr((SELECT s.body FROM v_state_text s WHERE s.unit = t.unit), t.slug) = 0;
INSERT INTO temp.af SELECT 6, x.pos, 0, 0, 'MISSING_THREAD', 'error', x.slug, NULL, NULL
  FROM temp.xj x WHERE x.unit = (SELECT unit FROM temp.a) AND x.lane = '' AND x.kind = 'entry' AND x.thread IS NULL
    AND length(x.slug) >= 13 AND substr(x.slug, 1, 11) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-'
    AND substr(x.slug, 12) NOT GLOB '*[^a-zA-Z0-9_-]*' AND substr(x.slug, -1) GLOB '[a-zA-Z0-9]'
    AND substr(x.slug, 1, 10) >= '2026-09-18';
DROP TABLE IF EXISTS temp.audj;
CREATE TEMP TABLE audj AS SELECT json_object('unit', a.unit,
  'clean', json(CASE WHEN EXISTS (SELECT 1 FROM temp.af WHERE severity = 'error') THEN 'false' ELSE 'true' END),
  'findings', json((SELECT json_group_array(json(json_object('code', f.code, 'severity', f.severity, 'slug', f.slug, 'line', NULL,
      'detail', f.detail, 'first_line', NULL, 'occurrence', f.occ)) ORDER BY f.rk, f.p1, f.p2, f.p3) FROM temp.af f)),
  'open_threads', json((SELECT json_group_array(json(json_object('slug', x.slug, 'thread', x.thread, 'line', NULL)) ORDER BY x.pos)
    FROM temp.xj x WHERE x.unit = a.unit AND x.lane = '' AND x.kind = 'entry' AND x.cb_pos IS NULL
      AND x.thread IS NOT NULL AND x.thread <> 'none'))) AS j
FROM temp.a a;
