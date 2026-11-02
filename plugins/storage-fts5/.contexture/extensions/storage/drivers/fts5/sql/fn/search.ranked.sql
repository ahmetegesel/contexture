-- search.query (the ranked modes, drivers/fts5 reads this script for --mode=hybrid and
-- --mode=trigram; sql/fn/search.query.sql for every other mode) <unit> [--limit=N] [--entity=T] [--mode=M] | query: Search (docs/the-engine.md,
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

-- the ranked modes: every token of the query quoted, so punctuation never reads as FTS5 syntax
CREATE TEMP TABLE sqt AS SELECT group_concat('"' || replace(t.value, '"', '""') || '"', ' ' ORDER BY t.key) AS m
  FROM temp.sqa s, json_each('["' || replace(replace(replace(replace(replace(replace(s.q, '\', '\\'), '"', '\"'), char(9), ' '), char(10), ' '), char(13), ' '), ' ', '","') || '"]') t
  WHERE t.value <> '';
CREATE TEMP TABLE sqr (doc_id INTEGER, entity_type TEXT, entity_id TEXT, section TEXT, score REAL, snippet TEXT);
INSERT INTO temp.sqr
WITH
  raw_prose AS (SELECT rowid AS doc_id, rank, snippet(fts_prose, -1, '<b>', '</b>', '...', 12) AS snip
    FROM fts_prose WHERE (SELECT mode FROM temp.sqa) = 'hybrid' AND fts_prose MATCH (SELECT m FROM temp.sqt)),
  ranked_prose AS (SELECT doc_id, row_number() OVER (ORDER BY rank) AS rnk, snip FROM raw_prose),
  raw_code AS (SELECT rowid AS doc_id, rank, snippet(fts_code, -1, '<b>', '</b>', '...', 12) AS snip
    FROM fts_code WHERE (SELECT mode FROM temp.sqa) IN ('hybrid', 'trigram') AND fts_code MATCH (SELECT m FROM temp.sqt)),
  ranked_code AS (SELECT doc_id, row_number() OVER (ORDER BY rank) AS rnk, snip FROM raw_code),
  combined AS (SELECT doc_id, 1.0 / (60.0 + rnk) AS score, snip FROM ranked_prose
    UNION ALL SELECT doc_id, 1.0 / (60.0 + rnk) AS score, snip FROM ranked_code),
  fused AS (SELECT doc_id, round(sum(score), 6) AS score, max(snip) AS snippet FROM combined GROUP BY doc_id)
SELECT f.doc_id, d.entity_type, d.entity_id, d.section, f.score, f.snippet
FROM fused f JOIN search_documents d ON d.doc_id = f.doc_id, temp.sqa s
WHERE (SELECT m FROM temp.sqt) IS NOT NULL AND d.unit = s.unit AND (s.entity = 'all' OR d.entity_type = s.entity);

SELECT json_object('unit', s.unit, 'query', s.q, 'mode', s.mode, 'total_matches', (SELECT count(*) FROM temp.sqr),
  'results', json((SELECT json_group_array(json(json_object('entity_type', entity_type, 'entity_id', entity_id, 'section', section,
    'snippet', snippet, 'score', score)) ORDER BY score DESC, doc_id) FROM (SELECT * FROM temp.sqr ORDER BY score DESC, doc_id LIMIT (SELECT lim FROM temp.sqa)))))
FROM temp.sqa s;
COMMIT;
