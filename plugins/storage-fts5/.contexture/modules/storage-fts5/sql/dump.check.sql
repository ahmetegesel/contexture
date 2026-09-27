-- dump.check.sql: the validation of a dump before any write (docs/the-engine.md, The dump;
-- the checks of tests/dump-check.sh): every line one compact JSON object of a known kind
-- carrying exactly its fields in the contract key order with values of the allowed types, a
-- \u escape only below 0x80, the unit line first naming the argv unit, the state line, the
-- three artifact lines each followed by its own items, the lanes in bytewise order each
-- followed by its own lane items, the end line counting the lines between, one unit per
-- dump, the file ending with a newline. Needs dump.load.sql run first and temp.arg holding
-- k 'unit' (the argv unit). Leaves temp.dverr holding the first defect as one row (n, msg,
-- msg "dump line <n>: <detail>") or no row, and temp.dok the record count of a valid dump.
DROP TABLE IF EXISTS temp.dc;
CREATE TEMP TABLE dc AS
WITH w AS (
  SELECT d.n, d.line, d.j, d.kind,
    max(CASE WHEN d.kind IN ('unit', 'state', 'artifact', 'lane', 'end') THEN d.n END)
      OVER (ORDER BY d.n ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS ps,
    max(CASE WHEN d.kind = 'lane' THEN d.n END)
      OVER (ORDER BY d.n ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS pl,
    max(CASE WHEN d.kind = 'unit' THEN d.n END)
      OVER (ORDER BY d.n ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS pu
  FROM temp.dl d
)
SELECT w.n AS n, w.line AS line, w.j AS j, w.kind AS kind,
  w.ps AS ps,
  CASE WHEN p.kind = 'artifact' THEN json_extract(p.j, '$.name') ELSE p.kind END AS phase,
  CASE WHEN p.kind = 'artifact' THEN json_type(p.j, '$.preamble') = 'null'
       WHEN p.kind = 'lane' THEN json_type(p.j, '$.journal_preamble') = 'null' ELSE 0 END AS nullpre,
  json_extract(l.j, '$.lane') AS lastlane,
  u.n AS start,
  json_extract(u.j, '$.unit') AS dunit,
  (SELECT group_concat(e.key, ',') FROM json_each(w.j) e) AS keys,
  -- whitespace outside the strings: with the escaped backslashes and quotes taken out, the
  -- quotes left delimit the strings, and the pieces between them alternate outside, inside
  CASE WHEN w.j IS NULL THEN 0 ELSE EXISTS (
    SELECT 1 FROM json_each('["' || replace(replace(replace(replace(replace(replace(w.line, '\\', ''), '\"', ''), '\', '\\'), char(9), '\t'), char(13), '\r'), '"', '","') || '"]') s
    WHERE s.key % 2 = 0 AND (instr(s.value, ' ') > 0 OR instr(s.value, char(9)) > 0 OR instr(s.value, char(13)) > 0)) END AS spaced,
  -- a \u escape reads only from 0x01 to 0x7f (every other character is written raw)
  CASE WHEN instr(replace(w.line, '\\', ''), '\u') = 0 THEN 0 ELSE (
    WITH RECURSIVE ue(rest, bad) AS (
      SELECT replace(w.line, '\\', ''), 0
      UNION ALL
      SELECT substr(rest, instr(rest, '\u') + 2),
        CASE WHEN upper(substr(rest, instr(rest, '\u') + 2, 4)) GLOB '00[0-7][0-9A-F]' AND upper(substr(rest, instr(rest, '\u') + 2, 4)) <> '0000' THEN 0 ELSE 1 END
      FROM ue WHERE instr(rest, '\u') > 0)
    SELECT max(bad) FROM ue) END AS badu
FROM w
LEFT JOIN temp.dl p ON p.n = w.ps
LEFT JOIN temp.dl l ON l.n = w.pl
LEFT JOIN temp.dl u ON u.n = w.pu;

DROP TABLE IF EXISTS temp.dverr;
CREATE TEMP TABLE dverr AS
WITH
t(n, m) AS (
  SELECT c.n,
  CASE
    WHEN c.line = '' THEN 'an empty line'
    WHEN c.j IS NULL THEN 'not one JSON value'
    WHEN c.spaced THEN 'whitespace between tokens (a dump line is compact JSON)'
    WHEN json_type(c.j) <> 'object' THEN 'not a JSON object'
    WHEN c.kind IS NULL THEN 'no kind'
    WHEN c.badu THEN 'an unsupported \u escape (the contract writes every character from 0x20 raw)'
    WHEN c.ps IS NULL AND c.kind <> 'unit' THEN 'a unit line expected, found kind ' || c.kind
    WHEN c.phase = 'end' THEN 'a line after the end line: unit.import takes one unit'
    WHEN c.ps IS NOT NULL AND c.kind = 'unit' THEN 'a unit line before the end line of unit ' || coalesce(c.dunit, '')
    -- the unit line
    WHEN c.kind = 'unit' AND c.keys IS NOT 'kind,format,version,unit,extras' THEN 'the line must carry exactly the keys {kind,format,version,unit,extras} in that order'
    WHEN c.kind = 'unit' AND (json_type(c.j, '$.format') <> 'text' OR json_extract(c.j, '$.format') <> 'contexture-dump') THEN 'format must be contexture-dump'
    WHEN c.kind = 'unit' AND (json_type(c.j, '$.version') <> 'integer' OR json_extract(c.j, '$.version') <> 1) THEN 'version must be 1'
    WHEN c.kind = 'unit' AND json_type(c.j, '$.unit') <> 'text' THEN 'field unit has the wrong type'
    WHEN c.kind = 'unit' AND (json_extract(c.j, '$.unit') NOT GLOB '[A-Za-z0-9]*' OR json_extract(c.j, '$.unit') GLOB '*[^A-Za-z0-9_-]*') THEN 'unit is not a slug'
    WHEN c.kind = 'unit' AND json_extract(c.j, '$.unit') IS NOT (SELECT v FROM temp.arg WHERE k = 'unit') THEN 'the dump is for unit ''' || json_extract(c.j, '$.unit') || ''', not ''' || (SELECT v FROM temp.arg WHERE k = 'unit') || ''''
    WHEN c.kind = 'unit' AND json_type(c.j, '$.extras') <> 'integer' THEN 'field extras has the wrong type'
    WHEN c.kind = 'unit' THEN NULL
    -- the end line
    WHEN c.kind = 'end' AND c.keys IS NOT 'kind,unit,records' THEN 'the line must carry exactly the keys {kind,unit,records} in that order'
    WHEN c.kind = 'end' AND json_extract(c.j, '$.unit') IS NOT c.dunit THEN 'the end line names another unit than the unit line'
    WHEN c.kind = 'end' AND json_type(c.j, '$.records') <> 'integer' THEN 'field records has the wrong type'
    WHEN c.kind = 'end' AND json_extract(c.j, '$.records') <> c.n - c.start - 1 THEN 'records says ' || json_extract(c.j, '$.records') || ', the unit dump holds ' || (c.n - c.start - 1) || ' lines between its unit and end lines'
    WHEN c.kind = 'end' AND c.phase NOT IN ('journal', 'lane') THEN 'the unit dump lacks an artifact line'
    WHEN c.kind = 'end' THEN NULL
    -- the state line
    WHEN c.kind = 'state' AND c.phase IS NOT 'unit' THEN 'the state line must follow the unit line'
    WHEN c.kind = 'state' AND c.keys IS NOT 'kind,status,current_anchor,next_action,objective,repos,ref_sessions,verbatim' THEN 'the line must carry exactly the keys {kind,status,current_anchor,next_action,objective,repos,ref_sessions,verbatim} in that order'
    WHEN c.kind = 'state' AND (json_type(c.j, '$.status') <> 'text' OR json_type(c.j, '$.current_anchor') <> 'text' OR json_type(c.j, '$.next_action') <> 'text' OR json_type(c.j, '$.objective') <> 'text') THEN 'a state field has the wrong type'
    WHEN c.kind = 'state' AND (json_type(c.j, '$.repos') <> 'array' OR EXISTS (SELECT 1 FROM json_each(c.j, '$.repos') x WHERE x.type <> 'text')) THEN 'field repos must be a list of strings'
    WHEN c.kind = 'state' AND json_type(c.j, '$.ref_sessions') <> 'null' AND (json_type(c.j, '$.ref_sessions') <> 'array' OR EXISTS (SELECT 1 FROM json_each(c.j, '$.ref_sessions') x WHERE x.type <> 'text')) THEN 'field ref_sessions must be null or a list of strings'
    WHEN c.kind = 'state' AND json_type(c.j, '$.verbatim') NOT IN ('text', 'null') THEN 'field verbatim has the wrong type'
    WHEN c.kind = 'state' THEN NULL
    -- the artifact lines
    WHEN c.kind = 'artifact' AND c.keys IS NOT 'kind,name,preamble' THEN 'the line must carry exactly the keys {kind,name,preamble} in that order'
    WHEN c.kind = 'artifact' AND json_type(c.j, '$.preamble') NOT IN ('text', 'null') THEN 'field preamble has the wrong type'
    WHEN c.kind = 'artifact' AND json_type(c.j, '$.name') <> 'text' THEN 'field name has the wrong type'
    WHEN c.kind = 'artifact' AND json_extract(c.j, '$.name') = 'backlog' AND c.phase IS NOT 'state' THEN 'the backlog artifact line must follow the state line'
    WHEN c.kind = 'artifact' AND json_extract(c.j, '$.name') = 'knowledge' AND c.phase IS NOT 'backlog' THEN 'the knowledge artifact line must follow the backlog'
    WHEN c.kind = 'artifact' AND json_extract(c.j, '$.name') = 'journal' AND c.phase IS NOT 'knowledge' THEN 'the journal artifact line must follow the knowledge'
    WHEN c.kind = 'artifact' AND json_extract(c.j, '$.name') NOT IN ('backlog', 'knowledge', 'journal') THEN 'unknown artifact ' || json_extract(c.j, '$.name')
    WHEN c.kind = 'artifact' THEN NULL
    -- the items
    WHEN c.kind = 'task' AND c.phase IS NOT 'backlog' THEN 'a task outside the backlog'
    WHEN c.kind = 'finding' AND c.phase IS NOT 'knowledge' THEN 'a finding outside the knowledge'
    WHEN c.kind IN ('entry', 'anchor') AND c.phase IS NOT 'journal' THEN 'a ' || c.kind || ' outside the journal'
    WHEN c.kind = 'opaque' AND c.phase NOT IN ('backlog', 'knowledge') THEN 'an opaque item outside the backlog and the knowledge'
    WHEN c.kind IN ('task', 'finding', 'entry', 'anchor', 'opaque') AND c.nullpre THEN 'an item under an absent artifact (preamble null)'
    WHEN c.kind = 'task' AND c.keys IS NOT 'kind,slug,status,objective,refs,description,criteria,details,verbatim' THEN 'the line must carry exactly the keys {kind,slug,status,objective,refs,description,criteria,details,verbatim} in that order'
    WHEN c.kind = 'task' AND (json_type(c.j, '$.slug') <> 'text' OR json_type(c.j, '$.status') <> 'text' OR json_type(c.j, '$.objective') <> 'text') THEN 'a task field has the wrong type'
    WHEN c.kind = 'task' AND (json_type(c.j, '$.refs') <> 'array' OR EXISTS (SELECT 1 FROM json_each(c.j, '$.refs') x WHERE x.type <> 'text')) THEN 'field refs must be a list of strings'
    WHEN c.kind = 'task' AND (json_type(c.j, '$.description') NOT IN ('text', 'null') OR json_type(c.j, '$.criteria') NOT IN ('text', 'null') OR json_type(c.j, '$.details') NOT IN ('text', 'null') OR json_type(c.j, '$.verbatim') NOT IN ('text', 'null')) THEN 'a task field has the wrong type'
    WHEN c.kind = 'task' THEN NULL
    WHEN c.kind = 'finding' AND c.keys IS NOT 'kind,name,supersedes,refs,summary,verbatim' THEN 'the line must carry exactly the keys {kind,name,supersedes,refs,summary,verbatim} in that order'
    WHEN c.kind = 'finding' AND json_type(c.j, '$.name') <> 'text' THEN 'field name has the wrong type'
    WHEN c.kind = 'finding' AND json_type(c.j, '$.supersedes') NOT IN ('object', 'null') THEN 'field supersedes has the wrong type'
    WHEN c.kind = 'finding' AND json_type(c.j, '$.supersedes') = 'object' AND ((SELECT group_concat(e.key, ',') FROM json_each(c.j, '$.supersedes') e) IS NOT 'name,reason' OR json_type(c.j, '$.supersedes.name') <> 'text' OR json_type(c.j, '$.supersedes.reason') <> 'text') THEN 'supersedes must carry exactly the keys {name,reason} as strings'
    WHEN c.kind = 'finding' AND (json_type(c.j, '$.refs') <> 'array' OR EXISTS (SELECT 1 FROM json_each(c.j, '$.refs') x WHERE x.type <> 'text')) THEN 'field refs must be a list of strings'
    WHEN c.kind = 'finding' AND (json_type(c.j, '$.summary') <> 'text' OR json_type(c.j, '$.verbatim') NOT IN ('text', 'null')) THEN 'a finding field has the wrong type'
    WHEN c.kind = 'finding' THEN NULL
    WHEN c.kind = 'opaque' AND c.keys IS NOT 'kind,verbatim' THEN 'the line must carry exactly the keys {kind,verbatim} in that order'
    WHEN c.kind = 'opaque' AND json_type(c.j, '$.verbatim') <> 'text' THEN 'field verbatim has the wrong type'
    WHEN c.kind = 'opaque' THEN NULL
    WHEN c.kind = 'anchor' AND c.keys IS NOT 'kind,anchor,continues,attention,verbatim' THEN 'the line must carry exactly the keys {kind,anchor,continues,attention,verbatim} in that order'
    -- the lane lines
    WHEN c.kind = 'lane' AND c.phase NOT IN ('journal', 'lane') THEN 'a lane line before the journal'
    WHEN c.kind = 'lane' AND c.keys IS NOT 'kind,lane,recipe,report,journal_preamble' THEN 'the line must carry exactly the keys {kind,lane,recipe,report,journal_preamble} in that order'
    WHEN c.kind = 'lane' AND (json_type(c.j, '$.lane') <> 'text' OR json_type(c.j, '$.recipe') NOT IN ('text', 'null') OR json_type(c.j, '$.report') NOT IN ('text', 'null') OR json_type(c.j, '$.journal_preamble') NOT IN ('text', 'null')) THEN 'a lane field has the wrong type'
    WHEN c.kind = 'lane' AND (json_extract(c.j, '$.lane') NOT GLOB '[A-Za-z0-9]*' OR json_extract(c.j, '$.lane') GLOB '*[^A-Za-z0-9_-]*') THEN 'lane is not a slug'
    WHEN c.kind = 'lane' AND c.lastlane IS NOT NULL AND NOT (c.lastlane < json_extract(c.j, '$.lane')) THEN 'lane ' || json_extract(c.j, '$.lane') || ' out of bytewise order after ' || c.lastlane
    WHEN c.kind = 'lane' THEN NULL
    WHEN c.kind = 'lane_item' AND c.phase IS NOT 'lane' THEN 'a lane item outside a lane'
    WHEN c.kind = 'lane_item' AND json_extract(c.j, '$.lane') IS NOT c.lastlane THEN 'a lane item of another lane under lane ' || coalesce(c.lastlane, '')
    WHEN c.kind = 'lane_item' AND c.nullpre THEN 'a lane item under an absent lane journal (journal_preamble null)'
    WHEN c.kind = 'lane_item' AND json_extract(c.j, '$.item') IS NOT 'entry' AND json_extract(c.j, '$.item') IS NOT 'anchor' THEN 'lane item must be entry or anchor'
    WHEN c.kind = 'lane_item' AND json_extract(c.j, '$.item') = 'entry' AND c.keys IS NOT 'kind,lane,item,slug,anchor,what,group,rhythm,knowledge,thread,legacy_status,refs,closers,extra_fields,verbatim' THEN 'the line must carry exactly the keys {kind,lane,item,slug,anchor,what,group,rhythm,knowledge,thread,legacy_status,refs,closers,extra_fields,verbatim} in that order'
    WHEN c.kind = 'lane_item' AND json_extract(c.j, '$.item') = 'anchor' AND c.keys IS NOT 'kind,lane,item,anchor,continues,attention,verbatim' THEN 'the line must carry exactly the keys {kind,lane,item,anchor,continues,attention,verbatim} in that order'
    WHEN c.kind = 'entry' AND c.keys IS NOT 'kind,slug,anchor,what,group,rhythm,knowledge,thread,legacy_status,refs,closers,extra_fields,verbatim' THEN 'the line must carry exactly the keys {kind,slug,anchor,what,group,rhythm,knowledge,thread,legacy_status,refs,closers,extra_fields,verbatim} in that order'
    -- an anchor (main or lane)
    WHEN (c.kind = 'anchor' OR (c.kind = 'lane_item' AND json_extract(c.j, '$.item') = 'anchor'))
      AND (json_type(c.j, '$.anchor') <> 'text' OR json_type(c.j, '$.continues') NOT IN ('text', 'null') OR json_type(c.j, '$.attention') NOT IN ('text', 'null') OR json_type(c.j, '$.verbatim') NOT IN ('text', 'null')) THEN 'an anchor field has the wrong type'
    WHEN c.kind = 'anchor' OR c.kind = 'lane_item' AND json_extract(c.j, '$.item') = 'anchor' THEN NULL
    -- an entry (main or lane)
    WHEN c.kind IN ('entry', 'lane_item') AND (json_type(c.j, '$.slug') <> 'text' OR json_type(c.j, '$.anchor') NOT IN ('text', 'null') OR json_type(c.j, '$.what') NOT IN ('text', 'null') OR json_type(c.j, '$.group') NOT IN ('text', 'null') OR json_type(c.j, '$.rhythm') NOT IN ('text', 'null') OR json_type(c.j, '$.knowledge') NOT IN ('true', 'false') OR json_type(c.j, '$.thread') NOT IN ('text', 'null') OR json_type(c.j, '$.legacy_status') NOT IN ('text', 'null') OR json_type(c.j, '$.verbatim') NOT IN ('text', 'null')) THEN 'an entry field has the wrong type'
    WHEN c.kind IN ('entry', 'lane_item') AND (json_type(c.j, '$.refs') <> 'array' OR EXISTS (SELECT 1 FROM json_each(c.j, '$.refs') x WHERE x.type <> 'text')) THEN 'field refs must be a list of strings'
    WHEN c.kind IN ('entry', 'lane_item') AND json_type(c.j, '$.closers') <> 'array' THEN 'field closers must be a list'
    WHEN c.kind IN ('entry', 'lane_item') AND EXISTS (SELECT 1 FROM json_each(c.j, '$.closers') x WHERE NOT (
        x.type = 'object'
        AND (SELECT group_concat(e.key, ',') FROM json_each(x.value) e) IS 'kind,targets,verdict,reason,verbatim'
        AND json_type(x.value, '$.kind') = 'text' AND json_extract(x.value, '$.kind') IN ('CLOSES', 'SUPERSEDES')
        AND json_type(x.value, '$.targets') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(x.value, '$.targets') y WHERE y.type <> 'text')
        AND (json_type(x.value, '$.verdict') = 'null' OR (json_type(x.value, '$.verdict') = 'text' AND json_extract(x.value, '$.verdict') IN ('done', 'superseded', 'dropped', 'folded')))
        AND json_type(x.value, '$.reason') IN ('text', 'null') AND json_type(x.value, '$.verbatim') IN ('text', 'null')))
      THEN 'a closer must carry exactly {kind,targets,verdict,reason,verbatim}: kind CLOSES or SUPERSEDES, targets a list of strings, verdict done, superseded, dropped, folded, or null'
    WHEN c.kind IN ('entry', 'lane_item') AND json_type(c.j, '$.extra_fields') <> 'array' THEN 'field extra_fields must be a list'
    WHEN c.kind IN ('entry', 'lane_item') AND EXISTS (SELECT 1 FROM json_each(c.j, '$.extra_fields') x WHERE NOT (
        x.type = 'object' AND (SELECT group_concat(e.key, ',') FROM json_each(x.value) e) IS 'key,value'
        AND json_type(x.value, '$.key') = 'text' AND json_type(x.value, '$.value') = 'text'))
      THEN 'an extra field must carry exactly {key,value} as strings'
    WHEN c.kind IN ('entry', 'lane_item') AND json_type(c.j, '$.verbatim') = 'null' AND (json_type(c.j, '$.legacy_status') <> 'null' OR json_array_length(c.j, '$.extra_fields') > 0) THEN 'an entry carries a field its canonical lines cannot hold, and no verbatim'
    WHEN c.kind IN ('entry', 'lane_item') THEN NULL
    ELSE 'unknown kind ' || c.kind
  END
  FROM temp.dc c
),
f AS (
  SELECT n, m FROM t WHERE m IS NOT NULL
  UNION ALL
  -- the whole file: an empty dump, a last line without its newline, no end line
  SELECT 1, 'an empty dump (a unit line expected)' FROM temp.dfacts WHERE size = 0
  UNION ALL
  SELECT lines + 1000000000, 'the last line does not end with LF' FROM temp.dfacts WHERE size > 0 AND eoflf = 0
  UNION ALL
  SELECT lines + 2000000000, 'the dump ends inside unit ' || coalesce((SELECT json_extract(j, '$.unit') FROM temp.dl WHERE kind = 'unit' ORDER BY n LIMIT 1), '') || ' (no end line)'
    FROM temp.dfacts WHERE size > 0 AND coalesce((SELECT kind FROM temp.dl WHERE kind IN ('unit', 'state', 'artifact', 'lane', 'end') ORDER BY n DESC LIMIT 1), '') <> 'end'
)
SELECT CASE WHEN n > 2000000000 THEN n - 2000000000 WHEN n > 1000000000 THEN n - 1000000000 ELSE n END AS n,
  'dump line ' || (CASE WHEN n > 2000000000 THEN n - 2000000000 WHEN n > 1000000000 THEN n - 1000000000 ELSE n END) || ': ' || m AS msg
FROM f ORDER BY f.n LIMIT 1;

DROP TABLE IF EXISTS temp.dok;
CREATE TEMP TABLE dok AS
  SELECT json_extract(j, '$.records') AS records FROM temp.dl WHERE kind = 'end' AND NOT EXISTS (SELECT 1 FROM temp.dverr);
