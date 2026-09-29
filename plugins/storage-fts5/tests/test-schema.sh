#!/bin/sh
# test-schema.sh: the store's schema on the plugin's own module copy. The driver reads schema
# version 4 and carries no upgrade path and no backup (D30 reversed by the human at the end
# review): a new or empty file gets the whole schema 4 on its first write; a file at any other
# version refuses rc 2 ERR_STORAGE_SCHEMA naming its version and the way forward (a fresh
# store the record is re-entered into through the ctx verbs), stays byte for byte as it was,
# and gains no backup beside it; storage.health reports such a store as an error.
#   1. an absent store: session.create lays schema 4 (user_version 4), no backup file
#   2. an empty file: session.create lays schema 4, no backup file
#   3. a version 3 file (a table and user_version 3, the header of a v0.54.0 store):
#      session.list and session.create refuse naming 3, nothing on stdout; the file equals
#      its copy (cmp); no backup file; storage.health answers health error naming 3
#   4. a version 0 file holding a table and a version 5 file refuse the same way, naming 0
#      and 5
# Exit: 0 all pass, 1 a failure, 77 without sqlite3.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
MOD="$SCRIPT_DIR/../.contexture/modules/storage-fts5"
DRV="$MOD/drivers/fts5"

command -v sqlite3 >/dev/null 2>&1 || { printf 'SKIP: sqlite3 not found on PATH\n'; exit 77; }

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-schema-test.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
mkdir -p "$SB/ws/.contexture/tmp" "$SB/db"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
# f <db> <function> <argv...>: one driver call on the store <db>, the payload on stdin
f() { fdb=$1; shift; (cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$fdb" "$DRV" "$@" > "$SB/out" 2> "$SB/err"); RC=$?; }
# nobak <db>: no file beside the store but the store and its sqlite3 companions
nobak() { [ -z "$(cd "$SB/db" && ls | grep -v -x -e "${1##*/}" -e "${1##*/}-wal" -e "${1##*/}-shm" -e "${1##*/}-journal")" ]; }
ver() { sqlite3 "$1" "PRAGMA user_version;" 2>/dev/null; }
# create <db>: session.create of one unit (the payload from a file: a pipe would run f in a
# subshell and lose RC)
printf 'objective=schema probe\nrepos.count=0\nattention=schema probe\n' > "$SB/create.pay"
create() { f "$1" session.create s-unit < "$SB/create.pay"; }

# 1. an absent store, 2. an empty file: the first write lays schema 4
rm -f "$SB/db/"*
create "$SB/db/new.db"
[ "$RC" = 0 ] && [ "$(ver "$SB/db/new.db")" = 4 ] && nobak "$SB/db/new.db" \
  && ok "an absent store: the first write lays schema 4, no backup" \
  || bad "an absent store: the first write lays schema 4, no backup (rc $RC, version $(ver "$SB/db/new.db"), err [$(cat "$SB/err")], files [$(ls "$SB/db" | tr '\n' ' ')])"
# a store at version 4 opens with one read: a read leaves its bytes as they were (carried
# from the retired test-upgrade's second open)
sqlite3 "$SB/db/new.db" "PRAGMA wal_checkpoint(TRUNCATE);" > /dev/null 2>&1
h1=$(cat "$SB/db/new.db" "$SB/db/new.db-wal" 2>/dev/null | shasum -a 256 | cut -d ' ' -f 1)
f "$SB/db/new.db" session.load s-unit < /dev/null
h2=$(cat "$SB/db/new.db" "$SB/db/new.db-wal" 2>/dev/null | shasum -a 256 | cut -d ' ' -f 1)
[ "$RC" = 0 ] && [ "$h1" = "$h2" ] && nobak "$SB/db/new.db" \
  && ok "a store at version 4: a read leaves the file byte for byte, no backup" \
  || bad "a store at version 4: a read leaves the file byte for byte, no backup (rc $RC, sha before $h1 after $h2)"
rm -f "$SB/db/"*
: > "$SB/db/empty.db"
create "$SB/db/empty.db"
[ "$RC" = 0 ] && [ "$(ver "$SB/db/empty.db")" = 4 ] && nobak "$SB/db/empty.db" \
  && ok "an empty file: the first write lays schema 4, no backup" \
  || bad "an empty file: the first write lays schema 4, no backup (rc $RC, version $(ver "$SB/db/empty.db"), err [$(cat "$SB/err")])"

# 3, 4. a store at another version refuses, naming it and the way forward, untouched
refusal() { printf '%s: error: the store is at schema %s; this driver reads 4 and has no upgrade path: move the store aside and re-enter the record into a fresh one through the ctx verbs (ERR_STORAGE_SCHEMA)' "$1" "$2"; }
for v in 3 0 5; do
  rm -f "$SB/db/"*
  DB="$SB/db/v$v.db"
  sqlite3 "$DB" "CREATE TABLE sessions (unit TEXT PRIMARY KEY); INSERT INTO sessions VALUES ('old-unit'); PRAGMA user_version = $v;" || bad "the version $v file could not be built"
  cp "$DB" "$SB/pre.db"
  [ "$(ver "$DB")" = "$v" ] || bad "the version $v file reads version $(ver "$DB")"
  for fn in session.list session.create; do
    if [ "$fn" = session.create ]; then create "$DB"; else f "$DB" session.list < /dev/null; fi
    [ "$RC" = 2 ] && [ ! -s "$SB/out" ] && [ "$(cat "$SB/err")" = "$(refusal "$fn" "$v")" ] \
      && ok "version $v: $fn refuses rc 2 naming the version and the way forward" \
      || bad "version $v: $fn refuses rc 2 naming the version and the way forward (rc $RC, out [$(head -c 200 "$SB/out")], err [$(cat "$SB/err")])"
  done
  cmp -s "$DB" "$SB/pre.db" && ok "version $v: the file stays byte for byte" || bad "version $v: the file stays byte for byte (version now $(ver "$DB"))"
  nobak "$DB" && ok "version $v: no backup beside the store" || bad "version $v: no backup beside the store (files [$(ls "$SB/db" | tr '\n' ' ')])"
  if [ "$v" = 3 ]; then
    f "$DB" storage.health < /dev/null
    [ "$(cat "$SB/out")" = '{"driver":"fts5","health":"error","detail":"database at schema 3; this driver reads 4 and has no upgrade path","store":"present","active_units":0}' ] \
      && ok "version 3: storage.health reports error naming the version" \
      || bad "version 3: storage.health reports error naming the version (got [$(cat "$SB/out")])"
  fi
done

printf 'test-schema: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
