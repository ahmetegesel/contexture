-- split.sql: the line splitter every script shares (read with .read before use). A text put
-- into temp.split_in (id, body) reads back from temp.split_lines as its lines in order (id,
-- n from 1, line without its newline), empty lines kept, the last line counted even without
-- a final newline, an empty text holding no line. The text is escaped into one JSON array of
-- strings (backslash, quote, and every control character but the newline escaped, each
-- newline closing one string and opening the next) and read with json_each, so a text of any
-- size splits in one linear pass. The escape runs in stages (a deeper nesting of replace
-- overflows the SQL parser).
CREATE TEMP TABLE IF NOT EXISTS split_in (id INTEGER PRIMARY KEY, body TEXT NOT NULL, keep INTEGER, esc TEXT);
-- keep: how many array elements are lines (the newline count, one more when the text does
-- not end with a newline, none for an empty text)
CREATE TEMP TRIGGER IF NOT EXISTS split_in_prep AFTER INSERT ON split_in BEGIN
  UPDATE split_in SET keep =
    CASE WHEN new.body = '' THEN 0
         WHEN substr(new.body, -1) = char(10) THEN length(new.body) - length(replace(new.body, char(10), ''))
         ELSE length(new.body) - length(replace(new.body, char(10), '')) + 1 END,
    esc = replace(replace(replace(replace(replace(replace(new.body, '\', '\\'), '"', '\"'), char(8), '\b'), char(9), '\t'), char(12), '\f'), char(13), '\r')
  WHERE id = new.id;
  UPDATE split_in SET esc = replace(replace(replace(replace(replace(replace(replace(replace(replace(esc, char(1), '\u0001'), char(2), '\u0002'), char(3), '\u0003'), char(4), '\u0004'), char(5), '\u0005'), char(6), '\u0006'), char(7), '\u0007'), char(11), '\u000b'), char(14), '\u000e') WHERE id = new.id;
  UPDATE split_in SET esc = replace(replace(replace(replace(replace(replace(replace(replace(replace(esc, char(15), '\u000f'), char(16), '\u0010'), char(17), '\u0011'), char(18), '\u0012'), char(19), '\u0013'), char(20), '\u0014'), char(21), '\u0015'), char(22), '\u0016'), char(23), '\u0017') WHERE id = new.id;
  UPDATE split_in SET esc = replace(replace(replace(replace(replace(replace(replace(replace(esc, char(24), '\u0018'), char(25), '\u0019'), char(26), '\u001a'), char(27), '\u001b'), char(28), '\u001c'), char(29), '\u001d'), char(30), '\u001e'), char(31), '\u001f') WHERE id = new.id;
  UPDATE split_in SET esc = '["' || replace(esc, char(10), '","') || '"]' WHERE id = new.id;
END;
CREATE TEMP VIEW IF NOT EXISTS split_lines AS
SELECT s.id AS id, j.key + 1 AS n, j.value AS line
FROM split_in s, json_each(s.esc) j
WHERE j.key < s.keep;
