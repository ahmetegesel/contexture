-- jappend.sql: the append rule for one new item of a journal (docs/the-engine.md, The record
-- data model): temp.jn holds the item (lane '' the main journal, else that lane's journal;
-- kind entry or anchor, its typed fields), temp.jnr its REF values, temp.jnc its closers
-- with their targets in temp.jnt. The artifact's trailing empty lines go (the last item's
-- stored verbatim, or the preamble of a journal holding no item), one empty line follows
-- unless the new item is an anchor or the artifact holds nothing, then the item's canonical
-- lines; the previous last item drops its verbatim when it now equals its canonical span.
-- The item is written from its fields as given and then read back as the parse rules read
-- it (an attention wrapped in quotes loses them), so it carries a verbatim exactly when the
-- lines written differ from the canonical lines of what it reads back as. temp.jnpos holds
-- the new position.
DROP TABLE IF EXISTS temp.jnpos;
CREATE TEMP TABLE jnpos AS SELECT coalesce(CASE WHEN (SELECT lane FROM temp.jn) = ''
    THEN (SELECT max(pos) FROM journal_items WHERE unit = (SELECT unit FROM temp.a))
    ELSE (SELECT max(pos) FROM lane_items WHERE unit = (SELECT unit FROM temp.a) AND lane = (SELECT lane FROM temp.jn)) END, 0) + 1 AS pos,
  (SELECT lane FROM temp.jn) AS lane, (SELECT kind FROM temp.jn) AS kind;

-- the previous last item, or the preamble of an empty journal
DELETE FROM temp.trm;
INSERT INTO temp.trm (id, s0, mode)
  SELECT 1, v.span, 'append' FROM v_journal_span v, temp.jnpos p
  WHERE v.unit = (SELECT unit FROM temp.a) AND v.lane = p.lane AND v.pos = p.pos - 1;
INSERT INTO temp.trm (id, s0, mode)
  SELECT 2, coalesce(CASE WHEN p.lane = '' THEN (SELECT preamble FROM preambles WHERE unit = (SELECT unit FROM temp.a) AND artifact = 'journal')
      ELSE (SELECT journal_preamble FROM lanes WHERE unit = (SELECT unit FROM temp.a) AND lane = p.lane) END, ''), 'append'
  FROM temp.jnpos p WHERE p.pos = 1;
.read lib/trim.sql
UPDATE preambles SET preamble = (SELECT CASE WHEN t.s <> '' AND p.kind <> 'anchor' THEN t.s || char(10) ELSE t.s END FROM temp.trm t, temp.jnpos p WHERE t.id = 2)
  WHERE unit = (SELECT unit FROM temp.a) AND artifact = 'journal' AND (SELECT lane FROM temp.jnpos) = '' AND (SELECT pos FROM temp.jnpos) = 1;
UPDATE lanes SET journal_preamble = (SELECT CASE WHEN t.s <> '' AND p.kind <> 'anchor' THEN t.s || char(10) ELSE t.s END FROM temp.trm t, temp.jnpos p WHERE t.id = 2)
  WHERE unit = (SELECT unit FROM temp.a) AND lane = (SELECT lane FROM temp.jnpos) AND (SELECT lane FROM temp.jnpos) <> '' AND (SELECT pos FROM temp.jnpos) = 1;
INSERT INTO temp.stl (tbl, lane, pos, cand)
  SELECT 'journal', p.lane, p.pos - 1, t.s || CASE WHEN p.kind = 'anchor' THEN '' ELSE char(10) END FROM temp.trm t, temp.jnpos p WHERE t.id = 1;

-- the item and its lists
INSERT INTO journal_items (unit, pos, kind, slug, anchor, what, grp, rhythm, knowledge, thread, legacy_status, continues, attention, verbatim)
  SELECT (SELECT unit FROM temp.a), p.pos, n.kind, n.slug, n.anchor, n.what, n.grp, n.rhythm, coalesce(n.knowledge, 0), n.thread, NULL, n.continues, n.attention, NULL
  FROM temp.jn n, temp.jnpos p WHERE p.lane = '';
INSERT INTO lane_items (unit, lane, pos, kind, slug, anchor, what, grp, rhythm, knowledge, thread, legacy_status, continues, attention, verbatim)
  SELECT (SELECT unit FROM temp.a), p.lane, p.pos, n.kind, n.slug, n.anchor, n.what, n.grp, n.rhythm, coalesce(n.knowledge, 0), n.thread, NULL, n.continues, n.attention, NULL
  FROM temp.jn n, temp.jnpos p WHERE p.lane <> '';
INSERT INTO item_refs (unit, lane, artifact, pos, rpos, ref)
  SELECT (SELECT unit FROM temp.a), p.lane, 'journal', p.pos, r.rpos, r.ref FROM temp.jnr r, temp.jnpos p;
INSERT INTO closers (unit, lane, pos, cpos, kind, verdict, reason, verbatim)
  SELECT (SELECT unit FROM temp.a), p.lane, p.pos, c.cpos, c.kind, c.verdict, c.reason, c.verbatim FROM temp.jnc c, temp.jnpos p;
INSERT INTO closer_targets (unit, lane, pos, cpos, tpos, target)
  SELECT (SELECT unit FROM temp.a), p.lane, p.pos, t.cpos, t.tpos, t.target FROM temp.jnt t, temp.jnpos p;

-- written as given, read back by the parse rules
DROP TABLE IF EXISTS temp.jnraw;
CREATE TEMP TABLE jnraw AS SELECT v.span AS span FROM v_journal_span v, temp.jnpos p
  WHERE v.unit = (SELECT unit FROM temp.a) AND v.lane = p.lane AND v.pos = p.pos;
UPDATE journal_items SET attention = substr(attention, 2, length(attention) - 2)
  WHERE unit = (SELECT unit FROM temp.a) AND pos = (SELECT pos FROM temp.jnpos) AND (SELECT lane FROM temp.jnpos) = ''
    AND kind = 'anchor' AND continues IS NOT NULL AND length(attention) >= 2 AND substr(attention, 1, 1) = '"' AND substr(attention, -1) = '"';
UPDATE lane_items SET attention = substr(attention, 2, length(attention) - 2)
  WHERE unit = (SELECT unit FROM temp.a) AND lane = (SELECT lane FROM temp.jnpos) AND pos = (SELECT pos FROM temp.jnpos)
    AND kind = 'anchor' AND continues IS NOT NULL AND length(attention) >= 2 AND substr(attention, 1, 1) = '"' AND substr(attention, -1) = '"';
INSERT INTO temp.stl (tbl, lane, pos, cand) SELECT 'journal', p.lane, p.pos, r.span FROM temp.jnraw r, temp.jnpos p;
.read lib/settle.sql
DELETE FROM temp.jn;
DELETE FROM temp.jnr;
DELETE FROM temp.jnc;
DELETE FROM temp.jnt;
