-- session.refload <unit>...: {refs: [RefLoad]} in argv order (the driver checked every unit)
BEGIN;
INSERT OR IGNORE INTO temp.du SELECT v FROM temp.arg WHERE k = 'unit' OR k GLOB 'a[0-9]*';
INSERT INTO temp.dp VALUES ('knowledge'), ('journal'), ('backlog');
.read lib/model.sql
SELECT json_object('refs', json((SELECT json_group_array(json(r.j) ORDER BY o.i) FROM
  (SELECT 0 AS i, v FROM temp.arg WHERE k = 'unit' UNION ALL SELECT CAST(substr(k, 2) AS INTEGER), v FROM temp.arg WHERE k GLOB 'a[0-9]*') o
  JOIN temp.jrefload r ON r.unit = o.v)));
COMMIT;
