-- session.units <repo>: {repo, units: [UnitSummary] whose repos hold the repo, bytewise,
-- known_repos: every repo any unit names, bytewise and unique}
BEGIN;
.read lib/model.sql
SELECT json_object('repo', a.unit,
  'units', json((SELECT json_group_array(json(s.j) ORDER BY s.unit) FROM temp.jstate s JOIN units u ON u.unit = s.unit
    WHERE EXISTS (SELECT 1 FROM json_each(u.repos) e WHERE e.value = a.unit))),
  'known_repos', json((SELECT json_group_array(r ORDER BY r) FROM (SELECT DISTINCT e.value AS r FROM units u, json_each(u.repos) e))))
FROM temp.a a;
COMMIT;
