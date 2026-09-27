-- nextline.sql: a state without a next_action line is corrupt for a write that sets it, rc 2
INSERT INTO temp.err SELECT 55, 2, 'ERR_STORAGE_CORRUPT', 'the state holds no next_action line'
  FROM units u, temp.a a WHERE u.unit = a.unit AND u.verbatim IS NOT NULL
    AND instr(char(10) || u.verbatim, char(10) || 'next_action:') = 0;
