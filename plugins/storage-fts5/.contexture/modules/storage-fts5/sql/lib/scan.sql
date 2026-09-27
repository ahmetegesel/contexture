-- scan.sql: the field lines of the item loaded by lib/ed.sql (its head on line 1), by the
-- parse rules of docs/the-engine.md as the posix driver reads them: the content ends at the
-- last line that is not blank (edc.cend); a block scalar head "  LABEL ::" takes the lines
-- after it indented four spaces or blank, ending at its last indented line; a field line
-- "  LABEL: value" is one line, but a WHAT or OBJECTIVE opening a quote it does not close
-- continues to the first line that ends with one; every other line is no field. temp.fld
-- lists the fields in line order: lab, blk (1 a block scalar), fline, fend.
DROP TABLE IF EXISTS temp.edc;
CREATE TEMP TABLE edc AS SELECT coalesce((SELECT max(n) FROM temp.ed WHERE n > 1 AND trim(ln, ' ' || char(9)) <> ''), 1) AS cend;
DROP TABLE IF EXISTS temp.eds;
CREATE TEMP TABLE eds AS
SELECT n, ln,
  CASE WHEN substr(ln, 1, 2) = '  ' AND length(rtrim(ln, ' ' || char(9))) >= 6 AND substr(rtrim(ln, ' ' || char(9)), -3) = ' ::'
      AND substr(ln, 3, 1) GLOB '[A-Z]'
      AND substr(rtrim(ln, ' ' || char(9)), 3, length(rtrim(ln, ' ' || char(9))) - 5) NOT GLOB '*[^A-Z_ ]*'
    THEN substr(rtrim(ln, ' ' || char(9)), 3, length(rtrim(ln, ' ' || char(9))) - 5) END AS bh,
  CASE WHEN substr(ln, 1, 2) = '  ' AND substr(ln, 3, 1) GLOB '[A-Z]' AND instr(substr(ln, 3), ': ') > 1
      AND substr(ln, 3, instr(substr(ln, 3), ': ') - 1) NOT GLOB '*[^A-Z_]*'
    THEN substr(ln, 3, instr(substr(ln, 3), ': ') - 1) END AS fl,
  CASE WHEN substr(ln, 1, 4) = '    ' THEN 1 ELSE 0 END AS ind4,
  CASE WHEN trim(ln, ' ' || char(9)) = '' THEN 1 ELSE 0 END AS blank
FROM temp.ed;
UPDATE temp.eds SET fl = NULL WHERE bh IS NOT NULL;
DROP TABLE IF EXISTS temp.edf;
CREATE TEMP TABLE edf AS
SELECT x.n AS n, x.bh AS bh, x.fl AS fl,
  CASE
    WHEN x.bh IS NOT NULL THEN coalesce((SELECT max(m.n) FROM temp.eds m WHERE m.n > x.n AND m.ind4 = 1
      AND m.n <= coalesce((SELECT min(o.n) FROM temp.eds o WHERE o.n > x.n AND o.n <= c.cend AND o.ind4 = 0 AND o.blank = 0) - 1, c.cend)), x.n)
    WHEN x.fl IN ('WHAT', 'OBJECTIVE') AND substr(substr(x.ln, length(x.fl) + 5), 1, 1) = '"'
      AND (length(substr(x.ln, length(x.fl) + 5)) = 1 OR substr(x.ln, -1) <> '"')
      THEN coalesce((SELECT min(m.n) FROM temp.eds m WHERE m.n > x.n AND m.n <= c.cend AND substr(m.ln, -1) = '"'), c.cend)
    ELSE x.n END AS fend
FROM temp.eds x, temp.edc c;
DROP TABLE IF EXISTS temp.fld;
CREATE TEMP TABLE fld AS
WITH RECURSIVE v(j) AS (
  SELECT 2 WHERE 2 <= (SELECT cend FROM temp.edc)
  UNION ALL
  SELECT (SELECT CASE WHEN f.bh IS NOT NULL OR f.fl IS NOT NULL THEN f.fend + 1 ELSE f.n + 1 END FROM temp.edf f WHERE f.n = v.j)
  FROM v WHERE (SELECT CASE WHEN f.bh IS NOT NULL OR f.fl IS NOT NULL THEN f.fend + 1 ELSE f.n + 1 END FROM temp.edf f WHERE f.n = v.j) <= (SELECT cend FROM temp.edc)
)
SELECT row_number() OVER (ORDER BY f.n) AS fno, coalesce(f.bh, f.fl) AS lab, CASE WHEN f.bh IS NOT NULL THEN 1 ELSE 0 END AS blk,
  f.n AS fline, f.fend AS fend
FROM v JOIN temp.edf f ON f.n = v.j WHERE f.bh IS NOT NULL OR f.fl IS NOT NULL;
