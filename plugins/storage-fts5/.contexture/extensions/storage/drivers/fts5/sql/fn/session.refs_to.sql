-- session.refs_to <unit>: {unit, referrers: the units whose ref_sessions name it, bytewise};
-- the named unit need not be held
BEGIN;
SELECT json_object('unit', a.unit, 'referrers', json((SELECT json_group_array(u.unit ORDER BY u.unit) FROM units u
  WHERE EXISTS (SELECT 1 FROM json_each(u.ref_sessions) e WHERE e.value = a.unit)))) FROM temp.a a;
COMMIT;
