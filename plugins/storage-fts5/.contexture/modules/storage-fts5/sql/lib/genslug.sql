-- genslug.sql: R6, a generated slug: the base of temp.gs (lane '' the main journal), suffixed
-- -1 while the journal holds it (so -1-1 can occur, as the posix driver writes it)
UPDATE temp.gs SET slug = (WITH RECURSIVE g(s) AS (
    SELECT gs.base
    UNION ALL
    SELECT g.s || '-1' FROM g WHERE CASE WHEN gs.lane = ''
      THEN EXISTS (SELECT 1 FROM journal_items j WHERE j.unit = (SELECT unit FROM temp.a) AND j.kind = 'entry' AND j.slug = g.s)
      ELSE EXISTS (SELECT 1 FROM lane_items j WHERE j.unit = (SELECT unit FROM temp.a) AND j.lane = gs.lane AND j.kind = 'entry' AND j.slug = g.s) END)
  SELECT s FROM g ORDER BY length(s) DESC LIMIT 1);
