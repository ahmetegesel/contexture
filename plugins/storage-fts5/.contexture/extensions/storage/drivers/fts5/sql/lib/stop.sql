-- stop.sql: the refusal point of a function script: the first check that failed (the lowest
-- ord, then the first row of that ord) prints as one ERR|<rc>|<code>|<message> line, and the
-- guard insert fails its CHECK, so sqlite3 -bail stops the script there: nothing after it
-- runs and an open write transaction rolls back when the connection closes.
SELECT 'ERR|' || rc || '|' || code || '|' || msg FROM temp.err ORDER BY ord, rowid LIMIT 1;
INSERT INTO temp.guard SELECT count(*) FROM temp.err;
