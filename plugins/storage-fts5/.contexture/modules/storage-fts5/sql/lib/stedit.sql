-- stedit.sql: the state edit rule on a verbatim state (docs/the-engine.md, The record data
-- model): temp.sts (key, line) names the state key and its new line; the first line of the
-- key (a line reading <key>: at column 0) and its continuation lines (the lines after it
-- starting with a blank or a tab) become that one line; a ref_sessions line the state lacks
-- goes right after the repos group, any other missing key at the end (the text then ends
-- with a newline). A canonical state (no verbatim) takes the typed change alone, which
-- renders canonically again. The caller sets the typed field first; the edited text goes to
-- lib/settle.sql as the state's candidate.
DELETE FROM temp.edt;
INSERT INTO temp.edt SELECT u.verbatim FROM units u WHERE u.unit = (SELECT unit FROM temp.a) AND u.verbatim IS NOT NULL;
.read lib/ed.sql
DROP TABLE IF EXISTS temp.stk;
CREATE TEMP TABLE stk AS SELECT n, ln,
  CASE WHEN instr(ln, ':') > 1 AND substr(ln, 1, instr(ln, ':') - 1) NOT GLOB '*[^a-z_]*' THEN substr(ln, 1, instr(ln, ':') - 1) END AS key
  FROM temp.ed;
DROP TABLE IF EXISTS temp.stg;
CREATE TEMP TABLE stg AS SELECT s.key AS key, s.line AS line,
  (SELECT min(k.n) FROM temp.stk k WHERE k.key = s.key) AS sline,
  (SELECT min(k.n) FROM temp.stk k WHERE k.key = 'repos') AS rline,
  (SELECT max(n) FROM temp.ed) AS maxn
  FROM temp.sts s WHERE EXISTS (SELECT 1 FROM temp.edt);
ALTER TABLE temp.stg ADD COLUMN send INTEGER;
ALTER TABLE temp.stg ADD COLUMN rend INTEGER;
UPDATE temp.stg SET send = coalesce((SELECT min(e.n) FROM temp.ed e WHERE e.n > stg.sline AND substr(e.ln, 1, 1) NOT IN (' ', char(9))) - 1, maxn)
  WHERE sline IS NOT NULL;
UPDATE temp.stg SET rend = coalesce((SELECT min(e.n) FROM temp.ed e WHERE e.n > stg.rline AND substr(e.ln, 1, 1) NOT IN (' ', char(9))) - 1, maxn)
  WHERE rline IS NOT NULL;
UPDATE temp.edeof SET e = 1 WHERE EXISTS (SELECT 1 FROM temp.stg WHERE sline IS NULL AND NOT (key = 'ref_sessions' AND rline IS NOT NULL));
INSERT INTO temp.sp (a, b, s) SELECT
  CASE WHEN sline IS NOT NULL THEN sline WHEN key = 'ref_sessions' AND rline IS NOT NULL THEN rend + 1 ELSE coalesce(maxn, 0) + 1 END,
  CASE WHEN sline IS NOT NULL THEN send WHEN key = 'ref_sessions' AND rline IS NOT NULL THEN rend ELSE coalesce(maxn, 0) END,
  line || char(10) FROM temp.stg;
.read lib/splice.sql
INSERT INTO temp.stl (tbl, cand) SELECT 'state', t FROM temp.edt WHERE EXISTS (SELECT 1 FROM temp.stg);
DELETE FROM temp.sts;
