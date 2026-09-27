-- tstatus.sql: a task status move (temp.tst: pos, status) by the edit rule: the first STATUS
-- field line of a verbatim task takes the new value (a span without one gains the line right
-- after its head); a canonical task takes the typed status and renders canonically again
DELETE FROM temp.edt;
INSERT INTO temp.edt SELECT t.verbatim FROM tasks t, temp.tst s WHERE t.unit = (SELECT unit FROM temp.a) AND t.pos = s.pos AND t.verbatim IS NOT NULL;
.read lib/ed.sql
.read lib/scan.sql
INSERT INTO temp.sp (a, b, s) SELECT coalesce(f.fline, 2), coalesce(f.fend, 1), '  STATUS: ' || s.status || char(10)
  FROM temp.tst s LEFT JOIN (SELECT fline, fend FROM temp.fld WHERE lab = 'STATUS' AND blk = 0 ORDER BY fno LIMIT 1) f ON 1
  WHERE EXISTS (SELECT 1 FROM temp.edt);
.read lib/splice.sql
UPDATE tasks SET status = (SELECT status FROM temp.tst) WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.tst);
INSERT INTO temp.stl (tbl, pos, cand) SELECT 'task', s.pos, e.t FROM temp.edt e, temp.tst s;
.read lib/settle.sql
DELETE FROM temp.tst;
