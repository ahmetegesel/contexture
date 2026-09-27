# upgrade.sh: the in-place upgrade of an older fts5 store to schema version 4 (D30),
# sourced by db-init.sh on the first open of a store below version 4 (needs DB_PATH,
# DB_TMP, MODULE_DIR, and sq from db-init.sh). The steps:
#   the backup: the database file is copied to <db>.v<old>.bak beside it (its -wal file to
#     <db>.v<old>.bak-wal when it holds pages) before the first step; an existing backup
#     is never overwritten, the next free name <db>.v<old>.bak.<n> is taken instead
#   0 to 3, as v0.54.0 shipped them, each in one transaction over the version 3 schema
#     (upgrade/schema-v3.sql): ordinal (journal tables that predate the ordinal key are
#     rebuilt), version 2 (the artifacts table, the canonical text, and a unit whose text
#     the store never held synthesized from its rows), version 3 (the corpus tables)
#   3 to 4, one transaction: every held unit's version 3 artifacts text (a unit is held
#     when it holds a state artifact; its lanes are the lanes rows and the lanes its
#     artifacts name) is written to files and read by the one-time upgrade parser
#     (upgrade/parse.awk) into the neutral dump, every dump is validated (sql/dump.check.sql),
#     then the version 3 tables go, the version 4 schema is made, every dump loads through
#     the import (sql/dump.import.sql), the search tables are derived (sql/derive.sql), and
#     user_version becomes 4; a failure anywhere rolls the step back, the store stays at
#     version 3 and the call exits 2
# One writer upgrades at a time: a lock folder beside the database is taken first and the
# version is read again under it, so a second opener finds the store upgraded.

V3_SCHEMA_SQL="$MODULE_DIR/upgrade/schema-v3.sql"
UPGRADE_PARSER="$MODULE_DIR/upgrade/parse.awk"
SQL_DIR="$MODULE_DIR/sql"

up_fail() {
  printf '%s: error: %s (%s)\n' "${CMD:-storage-fts5}" "$2" "$1" >&2
  up_release
  exit 2
}

UP_LOCK=""
UP_WORK=""
up_release() {
  [ -n "$UP_WORK" ] && rm -rf "$UP_WORK"
  UP_WORK=""
  [ -n "$UP_LOCK" ] && rmdir "$UP_LOCK" 2>/dev/null
  UP_LOCK=""
  return 0
}

up_lock() {
  ul_n=0
  while ! mkdir "$DB_PATH.upgrade.lock" 2>/dev/null; do
    ul_n=$((ul_n + 1))
    if [ "$ul_n" -ge 300 ]; then
      printf '%s: error: the store at %s is being upgraded by another call (the lock %s.upgrade.lock stayed 30s) (ERR_STORAGE_LOCKED)\n' "${CMD:-storage-fts5}" "$DB_PATH" "$DB_PATH" >&2
      exit 2
    fi
    sleep 0.1 2>/dev/null || sleep 1
  done
  UP_LOCK="$DB_PATH.upgrade.lock"
}

# up_backup <old version>: the pre-upgrade copy beside the database
up_backup() {
  ub_b="$DB_PATH.v$1.bak"
  ub_i=0
  while [ -e "$ub_b" ]; do
    ub_i=$((ub_i + 1))
    ub_b="$DB_PATH.v$1.bak.$ub_i"
  done
  cp -p "$DB_PATH" "$ub_b" || up_fail ERR_STORAGE_WRITE "cannot write the backup $ub_b before the upgrade"
  if [ -s "$DB_PATH-wal" ]; then
    cp -p "$DB_PATH-wal" "$ub_b-wal" || up_fail ERR_STORAGE_WRITE "cannot write the backup $ub_b-wal before the upgrade"
  fi
  UP_BACKUP=$ub_b
}

# ---- 0 to 3, as v0.54.0 shipped them (the schema file is the version 3 schema) ----
db_upgrade_ordinal() {
  {
    printf 'PRAGMA foreign_keys = OFF;\nBEGIN IMMEDIATE;\n'
    printf 'DROP TRIGGER IF EXISTS trg_entries_ai;\nDROP TRIGGER IF EXISTS trg_entries_au;\nDROP TRIGGER IF EXISTS trg_entries_ad;\n'
    printf 'DROP TRIGGER IF EXISTS trg_lane_entries_ai;\nDROP TRIGGER IF EXISTS trg_lane_entries_au;\nDROP TRIGGER IF EXISTS trg_lane_entries_ad;\n'
    printf "DELETE FROM search_documents WHERE entity_type IN ('entry', 'lane_entry');\n"
    printf 'ALTER TABLE entries RENAME TO entries_v1;\nALTER TABLE lane_entries RENAME TO lane_entries_v1;\n'
    grep -v '^PRAGMA' "$V3_SCHEMA_SQL"
    printf 'INSERT INTO entries (id, unit, slug, ordinal, entry_type, anchor, what, entry_group, thread, ref, rhythm, is_knowledge, closes, supersedes, verdict, created_at)\n'
    printf '  SELECT id, unit, slug, 1, entry_type, anchor, what, entry_group, thread, ref, rhythm, is_knowledge, closes, supersedes, verdict, created_at FROM entries_v1 ORDER BY id;\n'
    printf 'INSERT INTO lane_entries (id, unit, lane_slug, slug, ordinal, what, thread, ref, created_at)\n'
    printf '  SELECT id, unit, lane_slug, slug, 1, what, thread, ref, created_at FROM lane_entries_v1 ORDER BY id;\n'
    printf 'DROP TABLE entries_v1;\nDROP TABLE lane_entries_v1;\nCOMMIT;\n'
  } | sq -bail "$DB_PATH" >/dev/null
}

db_upgrade_v2() {
  {
    printf 'PRAGMA foreign_keys = OFF;\nBEGIN IMMEDIATE;\n'
    for t in trg_sessions_ai trg_sessions_au trg_tasks_ai trg_tasks_au trg_lanes_ai trg_lanes_au; do
      printf 'DROP TRIGGER IF EXISTS %s;\n' "$t"
    done
    grep -v '^PRAGMA' "$V3_SCHEMA_SQL"
    printf 'DELETE FROM search_documents;\n'
    printf "INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body) SELECT unit, 'session', unit, 'state', unit, objective || char(10) || next_action FROM sessions;\n"
    printf "INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body) SELECT unit, 'task', slug, 'backlog', slug || ': ' || objective, objective || char(10) || description || char(10) || acceptance_criteria || char(10) || implementation_details FROM tasks ORDER BY id;\n"
    printf "INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body) SELECT unit, 'entry', slug, 'journal', slug, what FROM entries ORDER BY id;\n"
    printf "INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body) SELECT unit, 'finding', name, 'knowledge', name, summary FROM findings ORDER BY id;\n"
    printf "INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body) SELECT unit, 'lane', lane_slug, 'lane_recipe', lane_slug || ': ' || goal, recipe FROM lanes;\n"
    printf "INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body) SELECT unit, 'lane', lane_slug, 'lane_report', lane_slug || ': ' || goal, report FROM lanes;\n"
    printf "INSERT INTO search_documents (unit, entity_type, entity_id, section, title, body) SELECT unit, 'lane_entry', lane_slug || '/' || slug, 'lane_journal', lane_slug || '/' || slug, what FROM lane_entries ORDER BY id;\n"
    printf 'PRAGMA user_version = 2;\nCOMMIT;\n'
  } | sq -bail "$DB_PATH" >/dev/null
}

# version 3: the schema (docs and doc_changes among its IF NOT EXISTS tables) and the version,
# one transaction; no earlier row is touched
db_upgrade_v3() {
  {
    printf 'BEGIN IMMEDIATE;\n'
    grep -v '^PRAGMA' "$V3_SCHEMA_SQL"
    printf 'PRAGMA user_version = 3;\nCOMMIT;\n'
  } | sq -bail "$DB_PATH" >/dev/null
}

# the legacy serialization of a unit's rows (the export an older migration wrote), used
# only to seed the artifacts of a unit whose text the database never held
db_legacy_text() {
  lt_u=$(printf '%s' "$1" | sed "s/'/''/g")
  lt_dir=$2
  mkdir -p "$lt_dir/lanes"
  sq "$DB_PATH" "SELECT writefile('$lt_dir/state', 'status: ' || status || char(10) || 'current_anchor: ' || current_anchor || char(10) || 'next_action: \"' || next_action || '\"' || char(10) || 'objective: \"' || objective || '\"' || char(10) || 'repos: ' || repos || char(10) || 'ref_sessions: ' || ref_sessions || char(10)) FROM sessions WHERE unit = '$lt_u';" >/dev/null
  sq "$DB_PATH" > "$lt_dir/backlog" <<EOF
SELECT
  '@task ' || slug || char(10) ||
  '  STATUS: ' || status || char(10) ||
  '  OBJECTIVE: "' || objective || '"' ||
  CASE WHEN refs IS NOT NULL AND refs != '' AND refs != '[]' THEN char(10) || '  REFS: ' || refs ELSE '' END ||
  CASE WHEN description IS NOT NULL AND description != '' THEN char(10) || '  DESCRIPTION ::' || char(10) || '    ' || replace(description, char(10), char(10) || '    ') ELSE '' END ||
  CASE WHEN acceptance_criteria IS NOT NULL AND acceptance_criteria != '' THEN char(10) || '  ACCEPTANCE CRITERIA ::' || char(10) || '    ' || replace(acceptance_criteria, char(10), char(10) || '    ') ELSE '' END ||
  CASE WHEN implementation_details IS NOT NULL AND implementation_details != '' THEN char(10) || '  IMPLEMENTATION DETAILS ::' || char(10) || '    ' || replace(implementation_details, char(10), char(10) || '    ') ELSE '' END ||
  char(10)
FROM tasks WHERE unit = '$lt_u' AND status != 'DROPPED' ORDER BY sort_order ASC, id ASC;
EOF
  sq "$DB_PATH" > "$lt_dir/journal" <<EOF
SELECT
  CASE WHEN entry_type = 'ANCHOR' THEN
    what || char(10)
  ELSE
    '@entry ' || slug || char(10) ||
    '  ANCHOR: ' || anchor || char(10) ||
    '  WHAT: "' || what || '"' ||
    CASE WHEN entry_group IS NOT NULL AND entry_group != '' AND entry_group != 'general' THEN char(10) || '  GROUP: ' || entry_group ELSE '' END ||
    CASE WHEN rhythm IS NOT NULL AND rhythm != '' THEN char(10) || '  RHYTHM: ' || rhythm ELSE '' END ||
    CASE WHEN is_knowledge = 1 THEN char(10) || '  KNOWLEDGE: true' ELSE '' END ||
    CASE WHEN thread IS NOT NULL AND thread != '' THEN char(10) || '  THREAD: ' || thread ELSE char(10) || '  THREAD: none' END ||
    coalesce((SELECT group_concat(char(10) || raw, '') FROM (
      SELECT raw FROM closures c WHERE c.unit = entries.unit AND c.lane_slug = '' AND c.entry_slug = entries.slug AND c.entry_ordinal = entries.ordinal
      GROUP BY c.line_no ORDER BY c.line_no)), '') ||
    CASE WHEN ref IS NOT NULL AND ref != '' THEN char(10) || '  REF: "' || ref || '"' ELSE '' END ||
    char(10)
  END
FROM entries WHERE unit = '$lt_u' ORDER BY id ASC;
EOF
  sq "$DB_PATH" > "$lt_dir/knowledge" <<EOF
SELECT
  '@finding ' || name || char(10) ||
  CASE WHEN supersedes IS NOT NULL AND supersedes != '' THEN '  SUPERSEDES: ' || supersedes || char(10) ELSE '' END ||
  CASE WHEN ref IS NOT NULL AND ref != '' THEN '  REF: "' || ref || '"' || char(10) ELSE '' END ||
  '  SUMMARY ::' || char(10) ||
  '    ' || replace(summary, char(10), char(10) || '    ') || char(10)
FROM findings WHERE unit = '$lt_u' AND status != 'DROPPED' ORDER BY id ASC;
EOF
}

db_backfill_artifacts() {
  bf_units=$(sq "$DB_PATH" "SELECT unit FROM sessions WHERE NOT EXISTS (SELECT 1 FROM artifacts a WHERE a.unit = sessions.unit) ORDER BY unit;")
  [ -n "$bf_units" ] || return 0
  bf_dir=$(mktemp -d "${DB_TMP:-${TMPDIR:-/tmp}}/fts5-backfill.XXXXXX") || return 1
  bf_now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  bf_sql="$bf_dir/backfill.sql"
  printf 'BEGIN IMMEDIATE;\n' > "$bf_sql"
  for bf_u in $bf_units; do
    bf_ud="$bf_dir/u-$bf_u"
    db_legacy_text "$bf_u" "$bf_ud"
    bf_q=$(printf '%s' "$bf_u" | sed "s/'/''/g")
    for bf_a in state backlog knowledge journal; do
      printf "INSERT OR IGNORE INTO artifacts (unit, lane_slug, name, body, updated_at) VALUES ('%s', '', '%s', CAST(readfile('%s') AS TEXT), '%s');\n" "$bf_q" "$bf_a" "$bf_ud/$bf_a" "$bf_now" >> "$bf_sql"
    done
    # the lanes: recipe and report as stored, the journal from its entry rows
    for bf_l in $(sq "$DB_PATH" "SELECT lane_slug FROM lanes WHERE unit = '$bf_q' ORDER BY lane_slug;"); do
      bf_lq=$(printf '%s' "$bf_l" | sed "s/'/''/g")
      printf "INSERT OR IGNORE INTO artifacts (unit, lane_slug, name, body, updated_at) SELECT unit, lane_slug, 'recipe', recipe, '%s' FROM lanes WHERE unit = '%s' AND lane_slug = '%s' AND recipe != '';\n" "$bf_now" "$bf_q" "$bf_lq" >> "$bf_sql"
      printf "INSERT OR IGNORE INTO artifacts (unit, lane_slug, name, body, updated_at) SELECT unit, lane_slug, 'report', report, '%s' FROM lanes WHERE unit = '%s' AND lane_slug = '%s' AND report != '';\n" "$bf_now" "$bf_q" "$bf_lq" >> "$bf_sql"
      sq "$DB_PATH" > "$bf_ud/lane-$bf_l" <<EOF
SELECT '# journal grammar' || char(10);
SELECT char(10) || '@entry ' || slug || char(10) || '  WHAT: "' || what || '"' || char(10) || '  THREAD: ' || thread FROM lane_entries WHERE unit = '$bf_q' AND lane_slug = '$bf_lq' ORDER BY id ASC;
EOF
      printf "INSERT OR IGNORE INTO artifacts (unit, lane_slug, name, body, updated_at) VALUES ('%s', '%s', 'journal', CAST(readfile('%s') AS TEXT), '%s');\n" "$bf_q" "$bf_lq" "$bf_ud/lane-$bf_l" "$bf_now" >> "$bf_sql"
    done
  done
  printf 'COMMIT;\n' >> "$bf_sql"
  sq -bail "$DB_PATH" < "$bf_sql" >/dev/null
  bf_rc=$?
  rm -rf "$bf_dir"
  return $bf_rc
}

# db_climb_v3 <version>: the v0.54.0 open path for a store below version 3 (every step runs
# whenever the version is below it, so a version 0 store climbs the whole chain)
db_climb_v3() {
  cv_probe=$(sq "$DB_PATH" "SELECT (SELECT count(*) FROM sqlite_master WHERE type='table' AND name='entries') || '|' || (SELECT count(*) FROM pragma_table_info('entries') WHERE name='ordinal');" 2>/dev/null) || cv_probe="0|0"
  cv_entries=${cv_probe%%|*}
  cv_ordinal=${cv_probe#*|}
  cv_v=$1
  if [ "$cv_entries" != "1" ]; then
    # no record tables at all: the version 3 schema, as the v0.54.0 fresh path made it
    sq "$DB_PATH" < "$V3_SCHEMA_SQL" >/dev/null 2>&1 || up_fail ERR_STORAGE_CORRUPT "the version 3 schema could not be laid over $DB_PATH"
    sq "$DB_PATH" "PRAGMA user_version = 3;" >/dev/null 2>&1 || up_fail ERR_STORAGE_WRITE "cannot set the version of $DB_PATH"
    return 0
  fi
  if [ "$cv_ordinal" != "1" ]; then
    db_upgrade_ordinal || up_fail ERR_STORAGE_CORRUPT "the ordinal upgrade of $DB_PATH failed and rolled back"
  fi
  if [ "$cv_v" -lt 2 ]; then
    db_upgrade_v2 || up_fail ERR_STORAGE_CORRUPT "the version 2 upgrade of $DB_PATH failed and rolled back"
    db_backfill_artifacts || up_fail ERR_STORAGE_CORRUPT "seeding the artifacts of $DB_PATH failed and rolled back"
  fi
  db_upgrade_v3 || up_fail ERR_STORAGE_CORRUPT "the version 3 upgrade of $DB_PATH failed and rolled back"
  # a store missing a later table gets it (the schema is idempotent)
  sq "$DB_PATH" < "$V3_SCHEMA_SQL" >/dev/null 2>&1
  return 0
}

up_q() {
  printf '%s' "$1" | sed "s/'/''/g"
}

# ---- 3 to 4 ----
db_upgrade_v4() {
  UP_WORK="$DB_TMP/fts5-upgrade.$$"
  rm -rf "$UP_WORK"
  mkdir -m 700 "$UP_WORK" || up_fail ERR_STORAGE_WRITE "cannot create the upgrade scratch $UP_WORK"
  mkdir "$UP_WORK/u" "$UP_WORK/d" || up_fail ERR_STORAGE_WRITE "cannot create the upgrade scratch $UP_WORK"
  uw=$(up_q "$UP_WORK")
  # the held units (a state artifact, a slug name) and their lanes (the lanes rows and the
  # lanes the artifacts name, slug names), bytewise
  sq -bail "$DB_PATH" > "$UP_WORK/units" 2> "$UP_WORK/err" <<EOF || up_fail ERR_STORAGE_READ "cannot read the version 3 store $DB_PATH"
SELECT unit FROM artifacts WHERE lane_slug = '' AND name = 'state'
  AND unit GLOB '[A-Za-z0-9]*' AND unit NOT GLOB '*[^A-Za-z0-9_-]*' ORDER BY unit COLLATE BINARY;
EOF
  sq -bail "$DB_PATH" > "$UP_WORK/lanes" 2> "$UP_WORK/err" <<EOF || up_fail ERR_STORAGE_READ "cannot read the version 3 store $DB_PATH"
SELECT DISTINCT x.unit || char(9) || x.lane FROM (
  SELECT unit, lane_slug AS lane FROM artifacts WHERE lane_slug <> ''
  UNION SELECT unit, lane_slug FROM lanes
) x
WHERE x.unit IN (SELECT unit FROM artifacts WHERE lane_slug = '' AND name = 'state')
  AND x.lane GLOB '[A-Za-z0-9]*' AND x.lane NOT GLOB '*[^A-Za-z0-9_-]*'
ORDER BY x.unit COLLATE BINARY, x.lane COLLATE BINARY;
EOF
  while IFS= read -r uu; do
    mkdir -p "$UP_WORK/u/$uu" || up_fail ERR_STORAGE_WRITE "cannot write the upgrade scratch"
  done < "$UP_WORK/units"
  while IFS='	' read -r uu ul; do
    [ -d "$UP_WORK/u/$uu" ] && mkdir -p "$UP_WORK/u/$uu/lanes/$ul"
  done < "$UP_WORK/lanes"
  # every artifact text of a held unit as a file, and the manifest lines the parser reads:
  # F key eofnl path (an empty text writes no bytes, so it is made empty after)
  sq -bail "$DB_PATH" > "$UP_WORK/files" 2> "$UP_WORK/err" <<EOF || up_fail ERR_STORAGE_READ "cannot read the artifacts of $DB_PATH"
SELECT unit || char(9) || CASE lane_slug WHEN '' THEN name ELSE 'lane/' || lane_slug || '/' || name END || char(9) ||
  CASE WHEN body = '' OR substr(body, -1) = char(10) THEN 1 ELSE 0 END || char(9) ||
  '$uw/u/' || unit || CASE lane_slug WHEN '' THEN '' ELSE '/lanes/' || lane_slug END || '/' || name || '.md' || char(9) ||
  length(CAST(body AS BLOB)) || char(9) ||
  CASE WHEN writefile('$uw/u/' || unit || CASE lane_slug WHEN '' THEN '' ELSE '/lanes/' || lane_slug END || '/' || name || '.md', body) IS NULL THEN 'x' ELSE 'w' END
FROM artifacts
WHERE unit IN (SELECT unit FROM artifacts WHERE lane_slug = '' AND name = 'state'
    AND unit GLOB '[A-Za-z0-9]*' AND unit NOT GLOB '*[^A-Za-z0-9_-]*')
  AND (lane_slug = '' AND name IN ('state', 'backlog', 'knowledge', 'journal')
    OR lane_slug GLOB '[A-Za-z0-9]*' AND lane_slug NOT GLOB '*[^A-Za-z0-9_-]*' AND name IN ('recipe', 'journal', 'report'))
ORDER BY unit COLLATE BINARY, lane_slug COLLATE BINARY, name;
EOF
  while IFS='	' read -r uu uk ue up us uwr; do
    [ -f "$up" ] || : > "$up"
    printf 'F\t%s\t%s\t%s\n' "$uk" "$ue" "$up" >> "$UP_WORK/u/$uu.man"
  done < "$UP_WORK/files"
  while IFS='	' read -r uu ul; do
    printf 'L\t%s\n' "$ul" >> "$UP_WORK/u/$uu.man"
  done < "$UP_WORK/lanes"
  # the parse and the validation of every dump, before any write
  printf ".read '%s'\nCREATE TEMP TABLE arg (k TEXT PRIMARY KEY, v TEXT);\n" "$SQL_DIR/split.sql" > "$UP_WORK/check.sql"
  : > "$UP_WORK/load.sql"
  while IFS= read -r uu; do
    [ -f "$UP_WORK/u/$uu.man" ] || : > "$UP_WORK/u/$uu.man"
    UP_UNIT=$uu UP_MAN="$UP_WORK/u/$uu.man" LC_ALL=C awk -f "$UPGRADE_PARSER" > "$UP_WORK/d/$uu.dump" \
      || up_fail ERR_STORAGE_CORRUPT "the upgrade parser failed on unit '$uu'; the store stays at version 3"
    uq=$(up_q "$uu")
    {
      printf "DELETE FROM temp.arg;\nINSERT INTO temp.arg VALUES ('unit', '%s'), ('dump', '%s');\n" "$uq" "$(up_q "$UP_WORK/d/$uu.dump")"
      printf ".read '%s'\n.read '%s'\n" "$SQL_DIR/dump.load.sql" "$SQL_DIR/dump.check.sql"
      printf "SELECT 'unit ''%s'': ' || msg FROM temp.dverr;\n" "$uq"
    } >> "$UP_WORK/check.sql"
    {
      printf "DELETE FROM temp.arg;\nINSERT INTO temp.arg VALUES ('unit', '%s'), ('dump', '%s');\n" "$uq" "$(up_q "$UP_WORK/d/$uu.dump")"
      printf ".read '%s'\n.read '%s'\n" "$SQL_DIR/dump.load.sql" "$SQL_DIR/dump.import.sql"
      printf "INSERT INTO temp.touched VALUES ('%s');\n" "$uq"
    } >> "$UP_WORK/load.sql"
  done < "$UP_WORK/units"
  uc_out=$(sq -bail :memory: < "$UP_WORK/check.sql" 2>&1) || up_fail ERR_STORAGE_CORRUPT "the upgrade could not check its dumps: $(printf '%s' "$uc_out" | head -n 1)"
  if [ -n "$uc_out" ]; then
    up_fail ERR_STORAGE_CORRUPT "the upgrade parser wrote a malformed dump, $(printf '%s' "$uc_out" | head -n 1); the store stays at version 3"
  fi
  # the step: one transaction
  {
    printf "PRAGMA foreign_keys = OFF;\n.read '%s'\nCREATE TEMP TABLE arg (k TEXT PRIMARY KEY, v TEXT);\nCREATE TEMP TABLE touched (unit TEXT PRIMARY KEY);\n" "$SQL_DIR/split.sql"
    printf 'BEGIN IMMEDIATE;\n'
    sq "$DB_PATH" "SELECT 'DROP TRIGGER IF EXISTS ' || name || ';' FROM sqlite_master WHERE type = 'trigger' AND name GLOB 'trg_*';" 2> /dev/null
    for ut in fts_prose fts_code search_documents lane_entries entries closures tasks findings lanes sessions artifacts; do
      printf 'DROP TABLE IF EXISTS %s;\n' "$ut"
    done
    grep -v '^PRAGMA' "$MODULE_DIR/schema.sql"
    cat "$UP_WORK/load.sql"
    printf ".read '%s'\n" "$SQL_DIR/derive.sql"
    printf 'PRAGMA user_version = 4;\nCOMMIT;\n'
  } > "$UP_WORK/step.sql"
  sq -bail "$DB_PATH" < "$UP_WORK/step.sql" > "$UP_WORK/step.out" 2>&1 \
    || up_fail ERR_STORAGE_CORRUPT "the version 4 upgrade of $DB_PATH failed and rolled back: $(head -n 1 "$UP_WORK/step.out"); the store stays at version 3"
  return 0
}

# db_upgrade <version>: the whole climb to version 4 under the upgrade lock
db_upgrade() {
  up_lock
  du_v=$(sq "$DB_PATH" "PRAGMA user_version;" 2>/dev/null) || up_fail ERR_STORAGE_READ "cannot read the store at $DB_PATH"
  case "$du_v" in ""|*[!0-9]*) du_v=0 ;; esac
  if [ "$du_v" -eq 4 ]; then up_release; return 0; fi
  if [ "$du_v" -gt 4 ]; then
    up_release
    printf '%s: error: the store is at schema %s; this driver reads 4 (ERR_STORAGE_SCHEMA)\n' "${CMD:-storage-fts5}" "$du_v" >&2
    exit 2
  fi
  up_backup "$du_v"
  if [ "$du_v" -lt 3 ]; then db_climb_v3 "$du_v"; fi
  db_upgrade_v4
  up_release
  return 0
}
