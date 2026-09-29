#!/bin/sh
# test-version.sh: the sqlite3 version guard on the plugin's own module copy. The driver's SQL
# needs SQLite 3.44 or later (ORDER BY inside an aggregate, strict json_valid): below it every
# record function refuses rc 2 ERR_DRIVER_NOT_FOUND naming the version, and storage.health
# (what ctx session diagnose prints) reports health error naming it too, never ok while no
# function can serve (lanes/si-f5-fts5-review/report F3). A fake sqlite3 on PATH reports the
# version under test for sqlite_version() and runs the real one for everything else.
#   1. 3.43.2: session.board refuses rc 2 with the one fixed line, nothing on stdout;
#      storage.health answers health error and the version in its detail
#   2. 3.44.0: session.board answers rc 0; storage.health answers ok
# Exit: 0 all pass, 1 a failure, 77 without sqlite3.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
MOD="$SCRIPT_DIR/../.contexture/modules/storage-fts5"
DRV="$MOD/drivers/fts5"

REAL=$(command -v sqlite3 2>/dev/null) || { printf 'SKIP: sqlite3 not found on PATH\n'; exit 77; }

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-version-test.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
mkdir -p "$SB/ws/.contexture/tmp" "$SB/bin"
DB="$SB/store.db"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }

# the fake: sqlite_version() reads FAKE_VER, every other call is the real sqlite3's
cat > "$SB/bin/sqlite3" <<EOF
#!/bin/sh
for a in "\$@"; do case "\$a" in *"sqlite_version()"*) "$REAL" "\$@" | sed "s/3\\.[0-9]*\\.[0-9]*\\\$/\$FAKE_VER/"; exit \$? ;; esac; done
exec "$REAL" "\$@"
EOF
chmod 755 "$SB/bin/sqlite3"
f() { fv=$1; shift; (cd "$SB/ws" && PATH="$SB/bin:$PATH" FAKE_VER="$fv" CTX_STORAGE_SQLITE_PATH="$DB" "$DRV" "$@" > "$SB/out" 2> "$SB/err" < /dev/null); RC=$?; }

# the unit the reads address, written through the function (the store holds what the functions write)
printf 'objective=the version probe\nrepos.count=0\nattention=version fixture\n' | (cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$DB" "$DRV" session.create tc63-clean > /dev/null) || { bad "the fixture unit"; }

# the fake itself answers the version it was given (null check of the instrument)
v=$(PATH="$SB/bin:$PATH" FAKE_VER=3.43.2 sqlite3 :memory: "SELECT sqlite_version();")
[ "$v" = 3.43.2 ] && ok "the fake sqlite3 reports the version under test" || bad "the fake sqlite3 reports the version under test (got $v)"

f 3.43.2 session.board tc63-clean
[ "$RC" = 2 ] && [ ! -s "$SB/out" ] && [ "$(cat "$SB/err")" = "session.board: error: the fts5 driver needs sqlite3 3.44 or later, this one is 3.43.2 (ERR_DRIVER_NOT_FOUND)" ] \
  && ok "3.43.2: a record function refuses rc 2 naming the version" || bad "3.43.2: a record function refuses rc 2 naming the version (rc $RC, out [$(cat "$SB/out")], err [$(cat "$SB/err")])"
f 3.43.2 storage.health
case "$(cat "$SB/out")" in
  '{"driver":"fts5","health":"error","detail":"sqlite3 3.43.2 is older than the 3.44 the driver needs",'*) ok "3.43.2: storage.health reports error naming the version" ;;
  *) bad "3.43.2: storage.health reports error naming the version (rc $RC, got [$(cat "$SB/out")])" ;;
esac
f 3.44.0 session.board tc63-clean
[ "$RC" = 0 ] && ok "3.44.0: a record function answers" || bad "3.44.0: a record function answers (rc $RC, err [$(cat "$SB/err")])"
f 3.44.0 storage.health
case "$(cat "$SB/out")" in
  '{"driver":"fts5","health":"ok",'*) ok "3.44.0: storage.health reports ok" ;;
  *) bad "3.44.0: storage.health reports ok (got [$(cat "$SB/out")])" ;;
esac

printf 'test-version: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
