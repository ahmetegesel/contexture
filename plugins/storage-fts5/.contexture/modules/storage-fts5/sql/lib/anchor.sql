-- anchor.sql: R7 and D43: the unit's current_anchor must read A<N> (and the state must hold
-- its line) before any write stamps it, else the store is corrupt, rc 2
INSERT INTO temp.err SELECT 50, 2, 'ERR_STORAGE_CORRUPT', 'the state''s current_anchor ''' || u.current_anchor || ''' is not A<N>'
  FROM units u, temp.a a WHERE u.unit = a.unit
    AND NOT (u.current_anchor GLOB 'A[0-9]*' AND substr(u.current_anchor, 2) NOT GLOB '*[^0-9]*'
      AND (u.verbatim IS NULL OR instr(char(10) || u.verbatim, char(10) || 'current_anchor:') > 0));
