-- search.query <unit> [--limit=N] [--entity=T] [--mode=M] | query: Search (docs/the-engine.md,
-- Search). Exact (the default on every backend, R24): the lines table in the order of the exact
-- rule, a line matching when the query is a substring of it after ASCII case folding (lower()
-- folds A to Z alone), a line starting with # never matching, one result per entity type, id,
-- and section (the first matching line in text order), its snippet that line trimmed, a
-- leading upper case label with its colon and spaces removed, then one leading and one
-- trailing double quote with their blanks; total_matches counts the pairs, results stop at
-- the limit, every score 0. Hybrid and trigram (the v0.54.0 ranked modes): the Reciprocal
-- Rank Fusion of the porter and the trigram FTS5 tables over the search documents, and the
-- trigram table alone, in the same result shape, the score the fused rank. An undeclared
-- mode refuses naming the declared ones.
BEGIN;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_INVALID_ARGUMENT', 'the search query is empty'
  WHERE trim(coalesce((SELECT v FROM temp.pay WHERE k = 'query'), ''), ' ' || char(9) || char(10) || char(13)) = '';
INSERT INTO temp.err SELECT 41, 1, 'ERR_CAPABILITY_UNSUPPORTED', 'mode ''' || v || ''' is not supported; declared modes: exact, hybrid, trigram'
  FROM temp.arg WHERE k = 'mode' AND v NOT IN ('exact', 'hybrid', 'trigram');
.read lib/stop.sql
CREATE TEMP TABLE sqa AS SELECT (SELECT unit FROM temp.a) AS unit, (SELECT v FROM temp.pay WHERE k = 'query') AS q,
  (SELECT v FROM temp.arg WHERE k = 'mode') AS mode, (SELECT CAST(v AS INTEGER) FROM temp.arg WHERE k = 'limit') AS lim,
  (SELECT v FROM temp.arg WHERE k = 'entity') AS entity;

-- the exact rule
CREATE TEMP TABLE sqx AS
SELECT m.entity_type AS entity_type, m.entity_id AS entity_id, m.section AS section, m.line AS line,
  row_number() OVER (ORDER BY m.lane COLLATE BINARY, m.aord, m.lno) AS rk
FROM (
  SELECT l.*, row_number() OVER (PARTITION BY l.entity_type, l.entity_id, l.section ORDER BY l.lane COLLATE BINARY, l.aord, l.lno) AS rn
  FROM lines l, temp.sqa s
  WHERE s.mode = 'exact' AND l.unit = s.unit AND instr(lower(l.line), lower(s.q)) > 0 AND substr(l.line, 1, 1) <> '#'
    AND (s.entity = 'all' OR l.entity_type = s.entity)
) m WHERE m.rn = 1;
-- the snippet: trimmed, a leading label and colon with its spaces, then one leading quote with
-- its blanks and one trailing quote with its blanks
CREATE TEMP TABLE sqs AS SELECT rk, entity_type, entity_id, section,
  trim(line, ' ' || char(9) || char(13) || char(10)) AS s0 FROM temp.sqx, temp.sqa WHERE rk <= temp.sqa.lim;
ALTER TABLE temp.sqs ADD COLUMN s1 TEXT;
UPDATE temp.sqs SET s1 = CASE WHEN instr(s0, ':') > 1 AND substr(s0, 1, instr(s0, ':') - 1) NOT GLOB '*[^A-Z_]*'
  THEN ltrim(substr(s0, instr(s0, ':') + 1), ' ') ELSE s0 END;
UPDATE temp.sqs SET s1 = ltrim(substr(s1, 2), ' ' || char(9)) WHERE substr(s1, 1, 1) = '"';
UPDATE temp.sqs SET s1 = rtrim(substr(s1, 1, length(s1) - 1), ' ' || char(9)) WHERE substr(s1, -1) = '"';

SELECT json_object('unit', s.unit, 'query', s.q, 'mode', s.mode, 'total_matches', (SELECT count(*) FROM temp.sqx),
  'results', json((SELECT json_group_array(json(json_object('entity_type', entity_type, 'entity_id', entity_id, 'section', section,
    'snippet', s1, 'score', 0)) ORDER BY rk) FROM temp.sqs)))
FROM temp.sqa s;
COMMIT;
