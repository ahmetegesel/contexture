-- entry.list <unit> [--anchor=A<N>] [--group=<token>]: {unit, entries: [EntryItem]} in
-- journal order, every occurrence; the last of each filter flag stands
BEGIN;
.read lib/held.sql
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('journal');
.read lib/model.sql
CREATE TEMP TABLE elf AS SELECT
  (SELECT substr(v, 10) FROM temp.arg WHERE k GLOB 'a[0-9]*' AND substr(v, 1, 9) = '--anchor=' ORDER BY CAST(substr(k, 2) AS INTEGER) DESC LIMIT 1) AS anc,
  (SELECT substr(v, 9) FROM temp.arg WHERE k GLOB 'a[0-9]*' AND substr(v, 1, 8) = '--group=' ORDER BY CAST(substr(k, 2) AS INTEGER) DESC LIMIT 1) AS grp;
SELECT json_object('unit', a.unit, 'entries', json((SELECT json_group_array(json(e.ji) ORDER BY e.pos) FROM temp.jent e, temp.elf f
  WHERE e.unit = a.unit AND e.lane = '' AND e.kind = 'entry'
    AND (f.anc IS NULL OR coalesce(e.anchor = f.anc, 0)) AND (f.grp IS NULL OR coalesce(e.grp = f.grp, 0))))) FROM temp.a a;
COMMIT;
