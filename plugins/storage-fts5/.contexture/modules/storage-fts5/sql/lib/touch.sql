-- touch.sql: the unit temp.a names leaves its derived search rows rebuilt (derive.sql) in the
-- transaction of the write that changed it: the parts the write names in temp.tart (state,
-- backlog, knowledge, journal, lane:<lane>), or the whole unit when it names none
INSERT OR IGNORE INTO temp.touched SELECT unit FROM temp.a;
.read derive.sql
