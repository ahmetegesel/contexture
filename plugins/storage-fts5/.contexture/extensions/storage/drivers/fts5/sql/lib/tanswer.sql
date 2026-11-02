-- tanswer.sql: the backlog model of the unit, for a task answer
INSERT OR IGNORE INTO temp.du SELECT unit FROM temp.a;
INSERT OR IGNORE INTO temp.dp VALUES ('backlog');
.read lib/model.sql
