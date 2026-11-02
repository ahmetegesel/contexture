-- receipt.sql: a task receipt entry (R10, R11): temp.rcp (base, what) appended to the main
-- journal with the slug the base takes (suffixed -1 while held), the current anchor, thread
-- none; temp.jnpos holds its position
INSERT INTO temp.gs (lane, base) SELECT '', base FROM temp.rcp;
.read lib/genslug.sql
INSERT INTO temp.jn (lane, kind, slug, anchor, what, thread)
  SELECT '', 'entry', (SELECT slug FROM temp.gs), (SELECT current_anchor FROM units WHERE unit = (SELECT unit FROM temp.a)), r.what, 'none' FROM temp.rcp r;
DELETE FROM temp.gs;
.read lib/jappend.sql
