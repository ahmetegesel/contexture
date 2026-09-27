-- splice.sql: temp.sp (a, b, s): lines a..b of the loaded text become the lines of s (s is
-- newline terminated, "" removes the lines, b = a - 1 inserts before line a); the lines
-- after b move up or down, a line an edit writes carries no carriage return, and temp.edt
-- takes the new text in the text's final newline state (lib/ed.sql); an empty temp.sp leaves
-- the text as it is.
DELETE FROM temp.split_in WHERE id = -4;
INSERT INTO temp.split_in (id, body) SELECT -4, s FROM temp.sp;
DROP TABLE IF EXISTS temp.spl;
CREATE TEMP TABLE spl AS SELECT n, line FROM temp.split_lines WHERE id = -4;
DELETE FROM temp.split_in WHERE id = -4;
DROP TABLE IF EXISTS temp.ed2;
CREATE TEMP TABLE ed2 AS
SELECT e.n AS n, e.line AS line, e.ln AS ln FROM temp.ed e WHERE NOT EXISTS (SELECT 1 FROM temp.sp)
UNION ALL
SELECT e.n, e.line, e.ln FROM temp.ed e, temp.sp p WHERE e.n < p.a
UNION ALL
SELECT p.a + l.n - 1, l.line, l.line FROM temp.spl l, temp.sp p
UNION ALL
SELECT e.n - (p.b - p.a + 1) + (SELECT count(*) FROM temp.spl), e.line, e.ln FROM temp.ed e, temp.sp p WHERE e.n > p.b;
DROP TABLE temp.ed;
CREATE TEMP TABLE ed AS SELECT n, line, ln FROM temp.ed2 ORDER BY n;
DROP TABLE temp.ed2;
UPDATE temp.edt SET t = coalesce((SELECT group_concat(line, char(10) ORDER BY n) FROM temp.ed), '')
  || CASE WHEN (SELECT e FROM temp.edeof) = 1 AND EXISTS (SELECT 1 FROM temp.ed) THEN char(10) ELSE '' END
  WHERE EXISTS (SELECT 1 FROM temp.sp);
DELETE FROM temp.sp;
