-- fanswer.sql: the knowledge model of the unit, for a finding answer
INSERT OR IGNORE INTO temp.du SELECT unit FROM temp.a;
INSERT OR IGNORE INTO temp.dp VALUES ('knowledge');
.read lib/model.sql
