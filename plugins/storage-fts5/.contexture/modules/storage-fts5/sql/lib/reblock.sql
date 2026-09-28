-- reblock.sql: the block scalar values of the item text in temp.edt (its head on line 1) as the
-- parse rules read them back (docs/the-engine.md, The record data model; the posix scan): a
-- block runs to its last line indented four spaces that stands before the next field line or
-- the item's content end (its last line that is not blank), so a trailing line of blanks or
-- tabs after the item's last block falls outside it; a body line indented four spaces loses
-- them and any other body line reads as empty; the first block of a label wins. temp.rb holds
-- (lab, v). A write stores its block fields from here, so a value it was given reads back
-- exactly as the posix driver reads the same text (written as given, read back as parsed).
.read lib/ed.sql
.read lib/scan.sql
DROP TABLE IF EXISTS temp.rb;
CREATE TEMP TABLE rb AS
SELECT f.lab AS lab,
  coalesce((SELECT group_concat(CASE WHEN substr(e.ln, 1, 4) = '    ' THEN substr(e.ln, 5) ELSE '' END, char(10) ORDER BY e.n)
    FROM temp.ed e WHERE e.n > f.fline AND e.n <= f.fend), '') AS v
FROM temp.fld f
WHERE f.blk = 1 AND f.fno = (SELECT min(g.fno) FROM temp.fld g WHERE g.blk = 1 AND g.lab = f.lab);
