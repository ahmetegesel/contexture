-- ed.sql: the line toolkit of the edit rules over one stored text (an item's verbatim span or
-- a verbatim state), run as three pieces the function scripts read in turn:
--   lib/ed.sql        loads temp.edt (t) into temp.ed (n, line, ln): the lines of the text in
--                     order (line as stored, a legacy carriage return kept; ln without it,
--                     the line the rules read) and edeof (the text ends with a newline)
--   lib/scan.sql      the field lines of the item whose head is line 1 (temp.fld)
--   lib/splice.sql    lines a..b of temp.sp become the lines of s (a line an edit writes
--                     carries no carriage return), and temp.edt takes the new text
-- The line model is the posix driver's: every line is newline terminated but the text's
-- last, which keeps the text's final newline state (an edit never adds or drops it).
CREATE TEMP TABLE IF NOT EXISTS edt (t TEXT);
CREATE TEMP TABLE IF NOT EXISTS sp (a INTEGER, b INTEGER, s TEXT);
DROP TABLE IF EXISTS temp.ed;
DELETE FROM temp.split_in WHERE id = -3;
INSERT INTO temp.split_in (id, body) SELECT -3, t FROM temp.edt;
CREATE TEMP TABLE ed AS SELECT n, line,
  CASE WHEN substr(line, -1) = char(13) THEN substr(line, 1, length(line) - 1) ELSE line END AS ln
  FROM temp.split_lines WHERE id = -3;
DELETE FROM temp.split_in WHERE id = -3;
DROP TABLE IF EXISTS temp.edeof;
CREATE TEMP TABLE edeof AS SELECT CASE WHEN t = '' OR substr(t, -1) = char(10) THEN 1 ELSE 0 END AS e FROM temp.edt;
