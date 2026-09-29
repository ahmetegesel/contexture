-- prelude.sql: the per call prelude of every contract 2 function (drivers/fts5 reads it right
-- after the call header, which holds temp.arg: k 'fn', 'unit', 'a1'..'aN' the other argv
-- tokens, 'pay' the payload file, 'doc' a raw document file, 'docsize' its bytes, 'date' and
-- 'epoch' where a function needs them). It reads split.sql, the refusal tables, and the
-- payload: the escaped key=value lines of the wire decoded into temp.pay (the last line of a
-- key wins). The wire escapes (\\ \n \t \r) are a subset of the JSON string escapes, so a
-- value decodes as the JSON string json_quote makes of it once its doubled backslashes are
-- undone; a value that is not a well formed wire value refuses.
-- A refusal is a row of temp.err (ord orders the checks as the function runs them, rc the
-- tier, code, the fixed message); lib/stop.sql prints the first one and stops the script.
.read split.sql
CREATE TEMP TABLE IF NOT EXISTS err (ord REAL NOT NULL, rc INTEGER NOT NULL, code TEXT NOT NULL, msg TEXT NOT NULL);
CREATE TEMP TABLE IF NOT EXISTS guard (x INTEGER CHECK (x = 0));
CREATE TEMP TABLE IF NOT EXISTS pay (k TEXT PRIMARY KEY, v TEXT);
-- the units and parts the model derives (lib/model.sql), the units a write touched (derive.sql)
CREATE TEMP TABLE IF NOT EXISTS du (unit TEXT PRIMARY KEY);
CREATE TEMP TABLE IF NOT EXISTS dp (part TEXT PRIMARY KEY);
CREATE TEMP TABLE IF NOT EXISTS touched (unit TEXT PRIMARY KEY);
CREATE TEMP TABLE IF NOT EXISTS tart (unit TEXT NOT NULL, part TEXT NOT NULL);
-- the working tables of the write pieces: a new journal item with its lists (lib/jappend.sql)
CREATE TEMP TABLE IF NOT EXISTS jn (lane TEXT NOT NULL, kind TEXT NOT NULL, slug TEXT, anchor TEXT, what TEXT, grp TEXT, rhythm TEXT,
  knowledge INTEGER, thread TEXT, continues TEXT, attention TEXT);
CREATE TEMP TABLE IF NOT EXISTS jnr (rpos INTEGER, ref TEXT);
CREATE TEMP TABLE IF NOT EXISTS jnc (cpos INTEGER, kind TEXT, verdict TEXT, reason TEXT);
CREATE TEMP TABLE IF NOT EXISTS jnt (cpos INTEGER, tpos INTEGER, target TEXT);
-- a new task or finding with its lists (lib/tappend.sql, lib/fappend.sql), a generated slug
-- (lib/genslug.sql)
CREATE TEMP TABLE IF NOT EXISTS tn (slug TEXT, objective TEXT, description TEXT, criteria TEXT, details TEXT);
CREATE TEMP TABLE IF NOT EXISTS tnr (rpos INTEGER, ref TEXT);
CREATE TEMP TABLE IF NOT EXISTS fnw (name TEXT, supersedes_name TEXT, supersedes_reason TEXT, summary TEXT);
CREATE TEMP TABLE IF NOT EXISTS fnr (rpos INTEGER, ref TEXT);
CREATE TEMP TABLE IF NOT EXISTS gs (lane TEXT, base TEXT, slug TEXT);

INSERT INTO temp.split_in (id, body) SELECT -1, coalesce(CAST(readfile(v) AS TEXT), '') FROM temp.arg WHERE k = 'pay';
CREATE TEMP TABLE payl AS SELECT n, line FROM temp.split_lines WHERE id = -1;
DELETE FROM temp.split_in WHERE id = -1;
INSERT INTO temp.err SELECT 20, 1, 'ERR_INVALID_ARGUMENT', 'malformed payload line (want key=value)'
  FROM temp.payl WHERE instr(line, '=') < 2 LIMIT 1;
INSERT INTO temp.err SELECT 21, 1, 'ERR_INVALID_ARGUMENT', 'malformed payload value of ' || substr(line, 1, instr(line, '=') - 1) || ' (a backslash outside \\ \n \t \r)'
  FROM temp.payl WHERE instr(line, '=') >= 2
    AND NOT json_valid(replace(json_quote(substr(line, instr(line, '=') + 1)), '\\', '\')) LIMIT 1;
INSERT OR REPLACE INTO temp.pay (k, v)
  SELECT substr(line, 1, instr(line, '=') - 1),
    json_extract(replace(json_quote(substr(line, instr(line, '=') + 1)), '\\', '\'), '$')
  FROM temp.payl WHERE instr(line, '=') >= 2
    AND json_valid(replace(json_quote(substr(line, instr(line, '=') + 1)), '\\', '\'))
  ORDER BY n;
-- the block value rule (docs/the-engine.md, The record data model): a block value (desc,
-- criteria, details, summary) drops its trailing whitespace-only lines, a value of blanks
-- alone reading "", so every write stores what the canonical lines read back as
UPDATE temp.pay SET v = CASE WHEN rtrim(v, char(32, 9, 10)) = '' THEN ''
    ELSE rtrim(v, char(32, 9, 10)) || substr(substr(v, length(rtrim(v, char(32, 9, 10))) + 1), 1,
      instr(substr(v, length(rtrim(v, char(32, 9, 10))) + 1) || char(10), char(10)) - 1) END
  WHERE k IN ('desc', 'criteria', 'details', 'summary');

-- the lists of the payload: <key>.count=N then <key>.1 .. <key>.N; pl their counts, plv their
-- elements, plbad the first defect of a list (a count that is not digits, a missing element)
CREATE TEMP TABLE pl AS SELECT substr(k, 1, length(k) - 6) AS base, v AS cnt,
  CASE WHEN v <> '' AND v NOT GLOB '*[^0-9]*' THEN CAST(v AS INTEGER) END AS n
  FROM temp.pay WHERE length(k) > 6 AND substr(k, -6) = '.count';
CREATE TEMP TABLE nums AS WITH RECURSIVE s(i) AS (SELECT 1 WHERE (SELECT max(n) FROM temp.pl) >= 1
  UNION ALL SELECT i + 1 FROM s WHERE i < (SELECT max(n) FROM temp.pl)) SELECT i FROM s;
CREATE TEMP TABLE plv AS SELECT p.base AS base, s.i AS i, (SELECT v FROM temp.pay WHERE k = p.base || '.' || s.i) AS v
  FROM temp.pl p JOIN temp.nums s ON s.i <= p.n;
CREATE TEMP TABLE plbad AS
  SELECT base, 'malformed list count ' || base || '.count' AS msg FROM temp.pl WHERE n IS NULL
  UNION ALL
  SELECT base, 'the list ' || base || ' lacks element ' || min(i) FROM temp.plv
    WHERE NOT EXISTS (SELECT 1 FROM temp.pay WHERE k = base || '.' || i) GROUP BY base;

-- the argv values by name
CREATE TEMP VIEW a AS SELECT
  (SELECT v FROM temp.arg WHERE k = 'unit') AS unit,
  (SELECT v FROM temp.arg WHERE k = 'a1') AS a1,
  (SELECT v FROM temp.arg WHERE k = 'a2') AS a2;
