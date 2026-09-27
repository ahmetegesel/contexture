# db-init.sh: the open path of the fts5 store (sourced; needs DB_PATH, MODULE_DIR, and a
# scratch folder DB_TMP; CMD names the calling function in a refusal). The store is at
# schema version 4 (PRAGMA user_version 4, schema.sql): a fresh database gets the whole
# schema at once; a store below version 4 is upgraded in place on its first open
# (upgrade/upgrade.sh: the backup <db>.v<old>.bak, the shipped steps to version 3, the one
# transaction to version 4); a store above version 4 refuses rc 2 ERR_STORAGE_SCHEMA; a
# store at version 4 opens with one read.

DB_SCHEMA_VERSION=4

# every connection waits for a busy writer instead of failing at once: busy_timeout is
# per connection, so each sqlite3 call sets it (the schema's PRAGMA covers only its own)
sq() {
  sqlite3 -cmd ".timeout 10000" "$@"
}

db_init() {
  mkdir -p "$(dirname "$DB_PATH")"
  # one read answers the fast path: the schema version and whether any table exists
  db_probe=$(sq "$DB_PATH" "SELECT (SELECT user_version FROM pragma_user_version) || '|' || (SELECT count(*) FROM sqlite_master WHERE type = 'table');" 2>/dev/null) || {
    printf '%s: error: cannot read the store at %s (ERR_STORAGE_READ)\n' "${CMD:-storage-fts5}" "$DB_PATH" >&2
    exit 2
  }
  db_version=${db_probe%%|*}
  db_tables=${db_probe#*|}
  case "$db_version" in ""|*[!0-9]*) db_version=0 ;; esac
  if [ "$db_version" -eq "$DB_SCHEMA_VERSION" ]; then
    return 0
  fi
  if [ "$db_version" -gt "$DB_SCHEMA_VERSION" ]; then
    printf '%s: error: the store is at schema %s; this driver reads %s (ERR_STORAGE_SCHEMA)\n' "${CMD:-storage-fts5}" "$db_version" "$DB_SCHEMA_VERSION" >&2
    exit 2
  fi
  if [ "$db_tables" = "0" ]; then
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
  . "$MODULE_DIR/upgrade/upgrade.sh"
  db_upgrade "$db_version"
}
