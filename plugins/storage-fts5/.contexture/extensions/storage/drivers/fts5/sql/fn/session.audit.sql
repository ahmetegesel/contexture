-- session.audit <unit>: Audit (the record checks of every backend); a unit whose journal is
-- absent refuses not found
BEGIN;
.read lib/held.sql
INSERT INTO temp.err SELECT 40, 1, 'ERR_ENTITY_NOT_FOUND', 'artifact ''journal'' not found in unit ''' || a.unit || ''''
  FROM temp.a a WHERE EXISTS (SELECT 1 FROM units WHERE unit = a.unit)
    AND (SELECT preamble FROM preambles WHERE unit = a.unit AND artifact = 'journal') IS NULL;
.read lib/stop.sql
INSERT INTO temp.du SELECT unit FROM temp.a;
INSERT INTO temp.dp VALUES ('backlog'), ('journal');
.read lib/model.sql
.read lib/audit.sql
SELECT j FROM temp.audj;
COMMIT;
