# db-init.sh: the open path of the fts5 store (sourced; needs DB_PATH, MODULE_DIR, and a
# scratch folder DB_TMP; CMD names the calling function in a refusal). The store is at
# schema version 4 (PRAGMA user_version 4, schema.sql): a new or empty database gets the
# whole schema at once; a store at version 4 opens with one read, and a version 4 store
# created before the generic module store gains its two tables on open by an idempotent
# CREATE TABLE IF NOT EXISTS (the version stays 4); a store at any other version refuses
# rc 2 ERR_STORAGE_SCHEMA naming its version and the way forward, and is never written:
# the plugin carries no upgrade path and no backup (D30 reversed at the end review), so an
# older store is moved aside and its record re-entered into a fresh one through the ctx
# verbs.

DB_SCHEMA_VERSION=4

# the generic module store's tables: the idempotent twin of schema.sql's block, run on open
# only when a version 4 store lacks them, so the version stays 4 and a fresh store still
# lays the whole schema from schema.sql
store_ddl() {
  cat <<'DDL'
CREATE TABLE IF NOT EXISTS store (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value BLOB NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE TABLE IF NOT EXISTS store_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  op TEXT NOT NULL,
  head TEXT NOT NULL,
  prior TEXT NOT NULL CHECK(prior IN ('absent', 'present'))
);
CREATE INDEX IF NOT EXISTS idx_store_changes_ns ON store_changes(namespace, seq);
CREATE INDEX IF NOT EXISTS idx_store_changes_head ON store_changes(head);
DDL
}

# every connection waits for a busy writer instead of failing at once: busy_timeout is
# per connection, so each sqlite3 call sets it (the schema's PRAGMA covers only its own)
sq() {
  sqlite3 -cmd ".timeout 10000" "$@"
}

# the SQL needs SQLite 3.44 or later (ORDER BY inside an aggregate, strict json_valid): an older
# sqlite3 refuses here, rc 2, before any script could fail on a parse error
DB_SQLITE_MIN=3044000

db_init() {
  mkdir -p "$(dirname "$DB_PATH")"
  # one read answers the fast path: the schema version, whether any table exists, whether
  # the generic store tables exist (both), the SQLite version number
  db_probe=$(sq "$DB_PATH" "SELECT (SELECT user_version FROM pragma_user_version) || '|' || (SELECT count(*) FROM sqlite_master WHERE type = 'table') || '|' || (SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN ('store', 'store_changes')) || '|' || sqlite_version();" 2>/dev/null) || {
    printf '%s: error: cannot read the store at %s (ERR_STORAGE_READ)\n' "${CMD:-storage-fts5}" "$DB_PATH" >&2
    exit 2
  }
  db_version=${db_probe%%|*}
  db_rest=${db_probe#*|}
  db_tables=${db_rest%%|*}
  db_rest=${db_rest#*|}
  db_store=${db_rest%%|*}
  db_sqlite=${db_rest#*|}
  db_sqlite_n=$(printf '%s\n' "$db_sqlite" | awk -F. '{ printf "%d", ($1 * 1000000) + ($2 * 1000) + $3 }')
  if [ "${db_sqlite_n:-0}" -lt "$DB_SQLITE_MIN" ]; then
    printf '%s: error: the fts5 driver needs sqlite3 3.44 or later, this one is %s (ERR_DRIVER_NOT_FOUND)\n' "${CMD:-storage-fts5}" "$db_sqlite" >&2
    exit 2
  fi
  case "$db_version" in ""|*[!0-9]*) db_version=0 ;; esac
  if [ "$db_version" -eq "$DB_SCHEMA_VERSION" ]; then
    # a version 4 store created before the generic module store gains its two tables here,
    # idempotent and inside one transaction; a store that already holds them is untouched
    if [ "$db_store" != "2" ]; then
      { printf 'BEGIN IMMEDIATE;\n'; store_ddl; printf 'COMMIT;\n'; } | sq -bail "$DB_PATH" >/dev/null 2>&1 || {
        printf '%s: error: cannot add the module store tables to the store at %s (ERR_STORAGE_WRITE)\n' "${CMD:-storage-fts5}" "$DB_PATH" >&2
        exit 2
      }
    fi
    return 0
  fi
  if [ "$db_tables" = "0" ] && [ "$db_version" -eq 0 ]; then
    # a fresh database: the whole schema at the current version, one transaction
    { grep '^PRAGMA' "$MODULE_DIR/schema.sql"; printf 'BEGIN IMMEDIATE;\n'; grep -v '^PRAGMA' "$MODULE_DIR/schema.sql"; printf 'PRAGMA user_version = %s;\nCOMMIT;\n' "$DB_SCHEMA_VERSION"; } \
      | sq -bail "$DB_PATH" >/dev/null 2>&1 || {
      # a second opener may have made it first
      [ "$(sq "$DB_PATH" "PRAGMA user_version;" 2>/dev/null)" = "$DB_SCHEMA_VERSION" ] && return 0
      printf '%s: error: cannot create the store at %s (ERR_STORAGE_WRITE)\n' "${CMD:-storage-fts5}" "$DB_PATH" >&2
      exit 2
    }
    return 0
  fi
  printf '%s: error: the store is at schema %s; this driver reads %s and has no upgrade path: move the store aside and re-enter the record into a fresh one through the ctx verbs (ERR_STORAGE_SCHEMA)\n' "${CMD:-storage-fts5}" "$db_version" "$DB_SCHEMA_VERSION" >&2
  exit 2
}
