# db-init.sh: the database open path shared by the driver and the migration (sourced;
# needs DB_PATH and SCHEMA_SQL; the backfill needs a scratch folder, DB_TMP). The schema
# is idempotent (IF NOT EXISTS throughout, a guarded backfill): it runs on a fresh
# database and again on one that predates a later table. Two in-place upgrades, each in
# one transaction:
#   ordinal: journal tables that predate the ordinal key (slugs unique per unit) are
#     rebuilt, every row kept, its id and file order kept, ordinal 1, the search documents
#     of journal rows re-derived by the triggers;
#   version 2 (PRAGMA user_version): the artifacts table (the canonical text) and the
#     search documents re-derived under the uniform sections; a unit whose text the
#     database never held gets its artifacts synthesized from its rows (the legacy
#     serialization), so an older dogfood database keeps every record it had.

# every connection waits for a busy writer instead of failing at once: busy_timeout is
# per connection, so each sqlite3 call sets it (the schema's PRAGMA covers only its own)
sq() {
  sqlite3 -cmd ".timeout 10000" "$@"
}

db_upgrade_ordinal() {
  {
    printf 'PRAGMA foreign_keys = OFF;\nBEGIN IMMEDIATE;\n'
    printf 'DROP TRIGGER IF EXISTS trg_entries_ai;\nDROP TRIGGER IF EXISTS trg_entries_au;\nDROP TRIGGER IF EXISTS trg_entries_ad;\n'
    printf 'DROP TRIGGER IF EXISTS trg_lane_entries_ai;\nDROP TRIGGER IF EXISTS trg_lane_entries_au;\nDROP TRIGGER IF EXISTS trg_lane_entries_ad;\n'
    printf "DELETE FROM search_documents WHERE entity_type IN ('entry', 'lane_entry');\n"
    printf 'ALTER TABLE entries RENAME TO entries_v1;\nALTER TABLE lane_entries RENAME TO lane_entries_v1;\n'
    grep -v '^PRAGMA' "$SCHEMA_SQL"
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
    grep -v '^PRAGMA' "$SCHEMA_SQL"
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

db_init() {
  upgraded=0
  mkdir -p "$(dirname "$DB_PATH")"
  # one read answers the fast path: the entries table, its ordinal column, the core
  # tables, and the schema version
  db_probe=$(sq "$DB_PATH" "SELECT (SELECT count(*) FROM sqlite_master WHERE type='table' AND name='entries') || '|' || (SELECT count(*) FROM pragma_table_info('entries') WHERE name='ordinal') || '|' || (SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('sessions', 'closures', 'artifacts')) || '|' || (SELECT user_version FROM pragma_user_version);" 2>/dev/null) || db_probe="0|0|0|0"
  has_entries=${db_probe%%|*}
  db_rest=${db_probe#*|}
  has_ordinal=${db_rest%%|*}
  db_rest=${db_rest#*|}
  has_tables=${db_rest%%|*}
  db_version=${db_rest#*|}
  if [ "$has_entries" = "1" ] && [ "$has_ordinal" != "1" ]; then
    if ! db_upgrade_ordinal; then
      printf 'storage-fts5: error: the ordinal upgrade of %s failed and rolled back (ERR_STORAGE_CORRUPT)\n' "$DB_PATH" >&2
      exit 2
    fi
    upgraded=1
  fi
  if [ "$has_entries" != "1" ]; then
    # a fresh database: the whole schema at the current version
    if [ -f "$SCHEMA_SQL" ]; then
      sq "$DB_PATH" < "$SCHEMA_SQL" >/dev/null 2>&1
      sq "$DB_PATH" "PRAGMA user_version = 2;" >/dev/null 2>&1
    fi
    return 0
  fi
  if [ "${db_version:-0}" -lt 2 ] 2>/dev/null; then
    if ! db_upgrade_v2; then
      printf 'storage-fts5: error: the version 2 upgrade of %s failed and rolled back (ERR_STORAGE_CORRUPT)\n' "$DB_PATH" >&2
      exit 2
    fi
    if ! db_backfill_artifacts; then
      printf 'storage-fts5: error: seeding the artifacts of %s failed and rolled back (ERR_STORAGE_CORRUPT)\n' "$DB_PATH" >&2
      exit 2
    fi
    return 0
  fi
  if [ "$has_tables" != "3" ] || [ "${upgraded:-0}" = "1" ]; then
    if [ -f "$SCHEMA_SQL" ]; then
      sq "$DB_PATH" < "$SCHEMA_SQL" >/dev/null 2>&1
    fi
  fi
}
