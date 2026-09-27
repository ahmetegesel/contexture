-- finding.list <unit> <active|all>: {unit, findings: [FindingItem]} in knowledge order;
-- active leaves out every finding a SUPERSEDES names
BEGIN;
.read lib/held.sql
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('knowledge');
.read lib/model.sql
SELECT json_object('unit', a.unit, 'findings', json((SELECT json_group_array(json(f.ji) ORDER BY f.pos) FROM temp.jfind f
  WHERE f.unit = a.unit AND f.kind = 'finding' AND (a.a1 = 'all' OR f.superseded_by IS NULL)))) FROM temp.a a;
COMMIT;
