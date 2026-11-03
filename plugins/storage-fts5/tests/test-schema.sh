#!/bin/sh
# test-schema.sh: the store's schema on the plugin's own module copy. The driver reads schema
# version 5 and carries no upgrade path and no backup (D30 reversed by the human at the end
# review): a new or empty file gets the whole schema 5 on its first write; a file at any
# other version refuses rc 2 ERR_STORAGE_SCHEMA naming its version and the way forward (a
# fresh store the record re-enters through the ctx verbs), stays byte for byte as it was,
# and gains no backup beside it; storage.health reports such a store as an error. The
# schema is store-only: the generic store tables and the derived store documents with their
# FTS5 indexes, no record typed table.
#   1. an absent store: a store.put lays schema 5 (user_version 5), no backup file; the
#      schema carries no record table (units, tasks, findings, journal_items, lane_items,
#      lanes, preambles, search_documents, lines)
#   2. an empty file: a store.put lays schema 5, no backup file
#   3. a version 4 file (a table and user_version 4, the header of a record-era store):
#      store.list and store.put refuse naming 4, nothing on stdout; the file equals its
#      copy (cmp); no backup file; storage.health answers health error naming 4
#   4. a version 0 file holding a table and a version 6 file refuse the same way, naming 0
#      and 6
# Exit: 0 all pass, 1 a failure, 77 without sqlite3.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
MOD="$SCRIPT_DIR/../.contexture/extensions/storage/drivers/fts5"
DRV="$MOD/driver"
STORAGE_CORE="$ROOT/base/.contexture/storage"
DOCS_DATA="$ROOT/plugins/docs-discipline/.contexture/extensions/modules/docs/data"

command -v sqlite3 >/dev/null 2>&1 || { printf 'SKIP: sqlite3 not found on PATH\n'; exit 77; }

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-schema-test.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
mkdir -p "$SB/ws/.contexture/tmp" "$SB/ws/.contexture/modules" "$SB/db" "$SB/ws/.contexture/extensions/modules/docs"
cp -R "$STORAGE_CORE" "$SB/ws/.contexture/storage"
cp "$DOCS_DATA" "$SB/ws/.contexture/extensions/modules/docs/data"
chmod +x "$SB/ws/.contexture/storage/scripts/"* "$SB/ws/.contexture/storage/drivers/posix/driver"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
# f <db> <function> <argv...>: one driver call on the store <db>, the payload on stdin
f() { fdb=$1; shift; (cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$fdb" "$DRV" "$@" > "$SB/out" 2> "$SB/err"); RC=$?; }
# nobak <db>: no file beside the store but the store and its sqlite3 companions
nobak() { [ -z "$(cd "$SB/db" && ls | grep -v -x -e "${1##*/}" -e "${1##*/}-wal" -e "${1##*/}-shm" -e "${1##*/}-journal")" ]; }
ver() { sqlite3 "$1" "PRAGMA user_version;" 2>/dev/null; }
# put <db> <key>: one store.put (the value on stdin)
put() { f "$1" store.put docs "$2" < "$SB/value"; }
printf 'schema probe\n' > "$SB/value"

# 1. an absent store, 2. an empty file: the first write lays schema 5
rm -f "$SB/db/"*
put "$SB/db/new.db" workspace/new
[ "$RC" = 0 ] && [ "$(ver "$SB/db/new.db")" = 5 ] && nobak "$SB/db/new.db" \
  && ok "an absent store: the first write lays schema 5, no backup" \
  || bad "an absent store: the first write lays schema 5, no backup (rc $RC, version $(ver "$SB/db/new.db"), err [$(cat "$SB/err")], files [$(ls "$SB/db" | tr '\n' ' ')])"
_tables=$(sqlite3 "$SB/db/new.db" "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('units','tasks','findings','journal_items','lane_items','lanes','preambles','search_documents','lines');" 2>/dev/null)
[ -z "$_tables" ] && ok "schema 5 is store-only: no record typed table exists" || bad "schema 5 carries record tables [$_tables]"
for _t in store store_changes store_docs store_docs_schema; do
  case "$(sqlite3 "$SB/db/new.db" "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '$_t';" 2>/dev/null)" in
    "$_t") ;;
    *) bad "schema 5 lacks the store table $_t" ;;
  esac
done
# a store at version 5 opens with one read: a read leaves its bytes as they were
sqlite3 "$SB/db/new.db" "PRAGMA wal_checkpoint(TRUNCATE);" > /dev/null 2>&1
h1=$(cat "$SB/db/new.db" "$SB/db/new.db-wal" 2>/dev/null | shasum -a 256 | cut -d ' ' -f 1)
f "$SB/db/new.db" store.get docs workspace/new < /dev/null
h2=$(cat "$SB/db/new.db" "$SB/db/new.db-wal" 2>/dev/null | shasum -a 256 | cut -d ' ' -f 1)
[ "$RC" = 0 ] && [ "$h1" = "$h2" ] && nobak "$SB/db/new.db" \
  && ok "a store at version 5: a read leaves the file byte for byte, no backup" \
  || bad "a store at version 5: a read leaves the file byte for byte, no backup (rc $RC, sha before $h1 after $h2)"
rm -f "$SB/db/"*
: > "$SB/db/empty.db"
put "$SB/db/empty.db" workspace/new
[ "$RC" = 0 ] && [ "$(ver "$SB/db/empty.db")" = 5 ] && nobak "$SB/db/empty.db" \
  && ok "an empty file: the first write lays schema 5, no backup" \
  || bad "an empty file: the first write lays schema 5, no backup (rc $RC, version $(ver "$SB/db/empty.db"), err [$(cat "$SB/err")])"

# 3, 4. a store at another version refuses, naming it and the way forward, untouched
refusal() { printf '%s: error: the store is at schema %s; this driver reads 5 and has no upgrade path: move the store aside and re-enter the record into a fresh one through the ctx verbs (ERR_STORAGE_SCHEMA)' "$1" "$2"; }
for v in 4 0 6; do
  rm -f "$SB/db/"*
  DB="$SB/db/v$v.db"
  sqlite3 "$DB" "CREATE TABLE sessions (unit TEXT PRIMARY KEY); INSERT INTO sessions VALUES ('old-unit'); PRAGMA user_version = $v;" || bad "the version $v file could not be built"
  cp "$DB" "$SB/pre.db"
  [ "$(ver "$DB")" = "$v" ] || bad "the version $v file reads version $(ver "$DB")"
  for fn in store.list store.put; do
    if [ "$fn" = store.put ]; then put "$DB" workspace/new; else f "$DB" store.list docs < /dev/null; fi
    [ "$RC" = 2 ] && [ ! -s "$SB/out" ] && [ "$(cat "$SB/err")" = "$(refusal "$fn" "$v")" ] \
      && ok "version $v: $fn refuses rc 2 naming the version and the way forward" \
      || bad "version $v: $fn refuses rc 2 naming the version and the way forward (rc $RC, out [$(head -c 200 "$SB/out")], err [$(cat "$SB/err")])"
  done
  cmp -s "$DB" "$SB/pre.db" && ok "version $v: the file stays byte for byte" || bad "version $v: the file stays byte for byte (version now $(ver "$DB"))"
  nobak "$DB" && ok "version $v: no backup beside the store" || bad "version $v: no backup beside the store (files [$(ls "$SB/db" | tr '\n' ' ')])"
  if [ "$v" = 4 ]; then
    f "$DB" storage.health < /dev/null
    [ "$(cat "$SB/out")" = '{"driver":"fts5","health":"error","detail":"database at schema 4; this driver reads 5 and has no upgrade path","store":"present"}' ] \
      && ok "version 4: storage.health reports error naming the version" \
      || bad "version 4: storage.health reports error naming the version (got [$(cat "$SB/out")])"
  fi
done

printf 'test-schema: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
