-- pointer.sql: R12, the pointer rule: the pointer temp.ptr (p, extra) must name every
-- IN_PROGRESS task (and the task being started, extra), each by substring, else rc 1 with the
-- omitted slugs in backlog order
INSERT INTO temp.err SELECT 60, 1, 'ERR_POINTER_INCOMPLETE', 'next_action would not name IN_PROGRESS task(s): ' || m
  FROM (SELECT group_concat(t.slug, ', ' ORDER BY t.pos) AS m FROM tasks t, temp.ptr p
    WHERE t.unit = (SELECT unit FROM temp.a) AND (t.status = 'IN_PROGRESS' OR t.slug = p.extra)
      AND instr(p.p, t.slug) = 0) WHERE m IS NOT NULL;
