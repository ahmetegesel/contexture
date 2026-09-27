-- trim.sql: the trailing empty lines of a text removed, the line rule of the append and drop
-- rules (docs/the-engine.md, The record data model): temp.trm holds each text (id, s0) with
-- its mode; a line counts as empty when nothing but a carriage return stands on it (a
-- legacy CRLF line). Mode append: the artifact then ends with a newline (the text gains one
-- when it lacks it); mode keep: the artifact keeps its final newline state, eof0 1 meaning
-- the artifact ended without one, so the trimmed text's last line loses its newline too.
-- The result lands in s.
CREATE TEMP TABLE IF NOT EXISTS trm (id INTEGER PRIMARY KEY, s0 TEXT NOT NULL, mode TEXT NOT NULL, eof0 INTEGER NOT NULL DEFAULT 0, s TEXT);
WITH RECURSIVE tr(id, s) AS (
  SELECT id, s0 FROM temp.trm WHERE s IS NULL
  UNION ALL
  SELECT id, CASE
      WHEN s = char(10) OR s = char(13) || char(10) OR s = char(13) THEN ''
      WHEN substr(s, -2) = char(10) || char(10) THEN substr(s, 1, length(s) - 1)
      WHEN substr(s, -3) = char(10) || char(13) || char(10) THEN substr(s, 1, length(s) - 2)
      ELSE substr(s, 1, length(s) - 1) END
  FROM tr WHERE s = char(10) OR s = char(13) || char(10) OR s = char(13)
    OR substr(s, -2) = char(10) || char(10) OR substr(s, -3) = char(10) || char(13) || char(10)
    OR substr(s, -2) = char(10) || char(13)
)
UPDATE temp.trm SET s = (SELECT t.s FROM tr t WHERE t.id = trm.id ORDER BY length(t.s) LIMIT 1) WHERE s IS NULL;
UPDATE temp.trm SET s = s || char(10) WHERE mode = 'append' AND s <> '' AND substr(s, -1) <> char(10);
UPDATE temp.trm SET s = substr(s, 1, length(s) - 1) WHERE mode = 'keep' AND eof0 = 1 AND substr(s, -1) = char(10);
