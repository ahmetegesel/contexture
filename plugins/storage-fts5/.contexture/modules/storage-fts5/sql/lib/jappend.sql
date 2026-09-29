-- jappend.sql: one new item of a journal (docs/the-engine.md, The record data model, the
-- append rule): temp.jn holds the item (lane '' the main journal, else that lane's journal;
-- kind entry or anchor, its typed fields), temp.jnr its REF values, temp.jnc its closers
-- with their targets in temp.jnt. The item takes the next position and renders in the
-- canonical lines after the items before it. Its fields are stored as the parse rules read
-- the canonical lines back: an attention wrapped in quotes loses them. temp.jnpos holds the
-- new position.
DROP TABLE IF EXISTS temp.jnpos;
CREATE TEMP TABLE jnpos AS SELECT coalesce(CASE WHEN (SELECT lane FROM temp.jn) = ''
    THEN (SELECT max(pos) FROM journal_items WHERE unit = (SELECT unit FROM temp.a))
    ELSE (SELECT max(pos) FROM lane_items WHERE unit = (SELECT unit FROM temp.a) AND lane = (SELECT lane FROM temp.jn)) END, 0) + 1 AS pos,
  (SELECT lane FROM temp.jn) AS lane, (SELECT kind FROM temp.jn) AS kind;
UPDATE temp.jn SET attention = substr(attention, 2, length(attention) - 2)
  WHERE kind = 'anchor' AND continues IS NOT NULL AND length(attention) >= 2 AND substr(attention, 1, 1) = '"' AND substr(attention, -1) = '"';
INSERT INTO journal_items (unit, pos, kind, slug, anchor, what, grp, rhythm, knowledge, thread, continues, attention)
  SELECT (SELECT unit FROM temp.a), p.pos, n.kind, n.slug, n.anchor, n.what, n.grp, n.rhythm, coalesce(n.knowledge, 0), n.thread, n.continues, n.attention
  FROM temp.jn n, temp.jnpos p WHERE p.lane = '';
INSERT INTO lane_items (unit, lane, pos, kind, slug, anchor, what, grp, rhythm, knowledge, thread, continues, attention)
  SELECT (SELECT unit FROM temp.a), p.lane, p.pos, n.kind, n.slug, n.anchor, n.what, n.grp, n.rhythm, coalesce(n.knowledge, 0), n.thread, n.continues, n.attention
  FROM temp.jn n, temp.jnpos p WHERE p.lane <> '';
INSERT INTO item_refs (unit, lane, artifact, pos, rpos, ref)
  SELECT (SELECT unit FROM temp.a), p.lane, 'journal', p.pos, r.rpos, r.ref FROM temp.jnr r, temp.jnpos p;
INSERT INTO closers (unit, lane, pos, cpos, kind, verdict, reason)
  SELECT (SELECT unit FROM temp.a), p.lane, p.pos, c.cpos, c.kind, c.verdict, c.reason FROM temp.jnc c, temp.jnpos p;
INSERT INTO closer_targets (unit, lane, pos, cpos, tpos, target)
  SELECT (SELECT unit FROM temp.a), p.lane, p.pos, t.cpos, t.tpos, t.target FROM temp.jnt t, temp.jnpos p;
DELETE FROM temp.jn;
DELETE FROM temp.jnr;
DELETE FROM temp.jnc;
DELETE FROM temp.jnt;
