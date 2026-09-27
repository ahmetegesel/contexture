-- dump.load.sql: reads a dump file into temp.dl (n the line number from 1, line the text
-- without its newline, j the line when it is one JSON value, kind its kind) and temp.dfacts
-- (size in bytes, eoflf 1 when the file ends with a newline or is empty, lines). Needs
-- split.sql read first and temp.arg (k, v) holding k 'dump' = the dump file path.
DELETE FROM temp.split_in WHERE id = 0;
INSERT INTO temp.split_in (id, body) SELECT 0, coalesce(CAST(readfile(v) AS TEXT), '') FROM temp.arg WHERE k = 'dump';
DROP TABLE IF EXISTS temp.dl;
CREATE TEMP TABLE dl (n INTEGER PRIMARY KEY, line TEXT NOT NULL, j TEXT, kind TEXT);
INSERT INTO temp.dl (n, line) SELECT n, line FROM temp.split_lines WHERE id = 0;
DROP TABLE IF EXISTS temp.dfacts;
CREATE TEMP TABLE dfacts AS
  SELECT length(CAST(body AS BLOB)) AS size,
    CASE WHEN body = '' OR substr(body, -1) = char(10) THEN 1 ELSE 0 END AS eoflf,
    (SELECT count(*) FROM temp.dl) AS lines
  FROM temp.split_in WHERE id = 0;
DELETE FROM temp.split_in WHERE id = 0;
UPDATE temp.dl SET j = line WHERE json_valid(line);
UPDATE temp.dl SET kind = json_extract(j, '$.kind') WHERE j IS NOT NULL AND json_type(j) = 'object' AND json_type(j, '$.kind') = 'text';
