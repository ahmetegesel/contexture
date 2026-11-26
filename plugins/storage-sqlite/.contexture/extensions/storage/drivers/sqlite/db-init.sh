# db-init.sh: the open path of the sqlite store (sourced; needs DB_PATH, MODULE_DIR, and a
# scratch folder DB_TMP; CMD names the calling function in a refusal). The store is at
# schema version 6 (PRAGMA user_version 6, schema.sql), the package manifest's storage
# format: a new or empty database gets the whole schema at once, and a store at version 6
# opens with one read. A store at any other version refuses rc 2 ERR_STORAGE_SCHEMA naming
# both versions and is never written.

DB_SCHEMA_VERSION=6

# every connection waits for a busy writer instead of failing at once: busy_timeout is
# per connection, so each sqlite3 call sets it (the schema's PRAGMA covers only its own)
sq() {
  sqlite3 -cmd ".timeout 10000" "$@"
}

# the floor the driver guards: its SQL needs the upsert, readfile and writefile, hex,
# user_version, and quick_check, and the shell's -bail, -separator, and .timeout, all older
# than 3.44, but no older sqlite3 was at hand to prove a lower floor; an older sqlite3
# refuses here, rc 2, before any script could fail on a parse error
DB_SQLITE_MIN=3044000

db_init() {
  mkdir -p "$(dirname "$DB_PATH")"
  # one read answers the fast path: the schema version, whether any table exists, the
  # SQLite version number
  db_probe=$(sq "$DB_PATH" "SELECT (SELECT user_version FROM pragma_user_version) || '|' || (SELECT count(*) FROM sqlite_master WHERE type = 'table') || '|' || sqlite_version();" 2>/dev/null) || {
    printf '%s: error: cannot read the storage layer'\''s database (ERR_STORAGE_READ)\n' "${CMD:-sqlite-driver}" >&2
    exit 2
  }
  db_version=${db_probe%%|*}
  db_rest=${db_probe#*|}
  db_tables=${db_rest%%|*}
  db_sqlite=${db_rest#*|}
  db_sqlite_n=$(printf '%s\n' "$db_sqlite" | awk -F. '{ printf "%d", ($1 * 1000000) + ($2 * 1000) + $3 }')
  if [ "${db_sqlite_n:-0}" -lt "$DB_SQLITE_MIN" ]; then
    printf '%s: error: the sqlite driver needs sqlite3 3.44 or later, this one is %s (ERR_DRIVER_NOT_FOUND)\n' "${CMD:-sqlite-driver}" "$db_sqlite" >&2
    exit 2
  fi
  case "$db_version" in ""|*[!0-9]*) db_version=0 ;; esac
  if [ "$db_version" -eq "$DB_SCHEMA_VERSION" ]; then
    return 0
  fi
  if [ "$db_tables" = "0" ] && [ "$db_version" -eq 0 ]; then
    # a fresh database: the whole schema at the current version, one transaction
    { grep '^PRAGMA' "$MODULE_DIR/schema.sql"; printf 'BEGIN IMMEDIATE;\n'; grep -v '^PRAGMA' "$MODULE_DIR/schema.sql"; printf 'PRAGMA user_version = %s;\nCOMMIT;\n' "$DB_SCHEMA_VERSION"; } \
      | sq -bail "$DB_PATH" >/dev/null 2>&1 || {
      # a second opener may have made it first
      [ "$(sq "$DB_PATH" "PRAGMA user_version;" 2>/dev/null)" = "$DB_SCHEMA_VERSION" ] && return 0
      printf '%s: error: cannot create the storage layer'\''s database (ERR_STORAGE_WRITE)\n' "${CMD:-sqlite-driver}" >&2
      exit 2
    }
    return 0
  fi
  printf '%s: error: the storage layer'\''s database is at schema %s; this driver reads %s (ERR_STORAGE_SCHEMA)\n' "${CMD:-sqlite-driver}" "$db_version" "$DB_SCHEMA_VERSION" >&2
  exit 2
}
