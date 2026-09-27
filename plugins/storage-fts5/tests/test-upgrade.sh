#!/bin/sh
# test-upgrade.sh: the in-place upgrade to schema version 4 (D30) on the plugin's own module
# copy. A version 3 store is built from the fixtures: every fixture unit of
# tests/fixtures/dumps is imported by the shipped base's posix driver into a posix sandbox,
# and each file lands verbatim as its version 3 artifact (the v0.54.0 artifacts table, laid
# by upgrade/schema-v3.sql), with a lanes row for every lane folder and one lanes row
# without any artifact. Then:
#   1. the first open upgrades the store: every unit's fts5 export equals the posix export
#      of the same text, byte for byte
#   2. the backup <db>.v3.bak equals the pre-upgrade copy (cmp); user_version reads 4
#   3. a second open leaves the database sha256 unchanged
#   4. the lines table holds every line of every artifact in order, attributed as the
#      exact rule's head rule reads the posix files
#   5. a store at user_version 5 refuses rc 2 ERR_STORAGE_SCHEMA with nothing on stdout; a
#      fresh store opens at version 4
# Exit: 0 all pass, 1 a failure, 77 without sqlite3.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
MOD="$SCRIPT_DIR/../.contexture/modules/storage-fts5"
DRV="$MOD/drivers/fts5"
POSIX="$ROOT/base/.contexture/modules/session/drivers/posix/driver"
FX="$ROOT/tests/fixtures/dumps"

if ! command -v sqlite3 >/dev/null 2>&1; then
  printf 'SKIP: sqlite3 not found on PATH\n'
  exit 77
fi

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-upgrade-test.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
mkdir -p "$SB/ws/.contexture/tmp" "$SB/px/.contexture/tmp" "$SB/fx" "$SB/ref" "$SB/got"
SESS="$SB/px/.contexture/sessions"
DB="$SB/v3.db"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
f() { (cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$DB" "$DRV" "$@" > "$SB/out" 2> "$SB/err"); RC=$?; }
q() { printf '%s' "$1" | sed "s/'/''/g"; }

# the posix side: every fixture unit as files
for fx in "$FX"/*.dump; do
  awk -v d="$SB/fx" '/^\{"kind":"unit"/ { u = $0; sub(/^.*"unit":"/, "", u); sub(/".*$/, "", u); f = d "/" u ".dump" } { print > f }' "$fx"
done
for fd in "$SB"/fx/*.dump; do
  u=$(basename "$fd" .dump)
  (cd "$SB/px" && "$POSIX" unit.import "$u" < "$fd" > /dev/null 2> "$SB/perr") || { bad "posix import of $u: $(cat "$SB/perr")"; }
done
# one lane folder without any artifact, as v0.54.0 kept a lanes row with none
mkdir -p "$SESS/legacy-u/lanes/zz-empty"

# the version 3 store: the v3 schema, a sessions row per unit, an artifacts row per file
{
  cat "$MOD/upgrade/schema-v3.sql"
  printf 'BEGIN;\n'
  for d in "$SESS"/*; do
    u=${d##*/}
    printf "INSERT INTO sessions (unit, status, current_anchor, objective, next_action, repos, ref_sessions, created_at) VALUES ('%s', 'ACTIVE', 'A1', '', 'plan the next move', '[]', '[]', 'now');\n" "$(q "$u")"
    for a in state backlog knowledge journal; do
      [ -f "$d/$a.md" ] && printf "INSERT INTO artifacts (unit, lane_slug, name, body, updated_at) VALUES ('%s', '', '%s', CAST(readfile('%s') AS TEXT), 'now');\n" "$(q "$u")" "$a" "$(q "$d/$a.md")"
    done
    for ld in "$d"/lanes/*; do
      [ -d "$ld" ] || continue
      l=${ld##*/}
      printf "INSERT INTO lanes (unit, lane_slug, goal, recipe, report, created_at, updated_at) VALUES ('%s', '%s', '', '', '', 'now', 'now');\n" "$(q "$u")" "$(q "$l")"
      for a in recipe journal report; do
        [ -f "$ld/$a.md" ] && printf "INSERT INTO artifacts (unit, lane_slug, name, body, updated_at) VALUES ('%s', '%s', '%s', CAST(readfile('%s') AS TEXT), 'now');\n" "$(q "$u")" "$(q "$l")" "$a" "$(q "$ld/$a.md")"
      done
    done
  done
  printf 'COMMIT;\nPRAGMA user_version = 3;\n'
} > "$SB/v3.sql"
sqlite3 -bail "$DB" < "$SB/v3.sql" > /dev/null || { bad "the version 3 store could not be built"; }
cp "$DB" "$SB/pre.db"
units=$(ls "$SESS")
nu=$(printf '%s\n' "$units" | wc -l | tr -d ' ')

# the posix exports of the same text: the reference
for u in $units; do
  (cd "$SB/px" && "$POSIX" unit.export "$u" < /dev/null > "$SB/ref/$u.dump" 2> "$SB/perr") || bad "posix export of $u: $(cat "$SB/perr")"
done

# 1. the first open upgrades; every export equals the posix export
same=0
for u in $units; do
  f unit.export "$u"
  if [ "$RC" -eq 0 ] && [ ! -s "$SB/err" ] && cmp -s "$SB/out" "$SB/ref/$u.dump"; then same=$((same + 1))
  else bad "upgrade export of $u: rc $RC $(cmp "$SB/out" "$SB/ref/$u.dump" 2>&1 | head -n 1) [$(head -c 300 "$SB/err")]"; fi
done
if [ "$same" -eq "$nu" ] && [ "$nu" -ge 15 ]; then ok "the upgraded store exports all $nu units byte for byte as posix exports the same text"; else bad "$same of $nu units equal after the upgrade"; fi
if grep -q '"lane":"zz-empty","recipe":null,"report":null,"journal_preamble":null' "$SB/ref/legacy-u.dump"; then ok "the lanes row without an artifact survives as a lane with null documents"; else bad "the empty lane is missing from the reference"; fi

# 2. the backup and the version
if [ -f "$DB.v3.bak" ] && cmp -s "$DB.v3.bak" "$SB/pre.db"; then ok "the backup v3.db.v3.bak equals the pre-upgrade copy"; else bad "the backup is missing or differs"; fi
[ "$(sqlite3 "$DB" 'PRAGMA user_version;')" = 4 ] && ok "the store reads user_version 4" || bad "user_version is not 4"
[ "$(sqlite3 "$DB" "SELECT count(*) FROM sqlite_master WHERE name IN ('artifacts', 'sessions', 'entries', 'closures', 'lane_entries');")" = 0 ] && ok "the version 3 tables are gone" || bad "a version 3 table survived"

# 3. a second open changes nothing
h1=$(cat "$DB" "$DB-wal" 2>/dev/null | shasum -a 256 | cut -d ' ' -f 1)
f unit.export legacy-u
h2=$(cat "$DB" "$DB-wal" 2>/dev/null | shasum -a 256 | cut -d ' ' -f 1)
if [ "$h1" = "$h2" ] && cmp -s "$SB/out" "$SB/ref/legacy-u.dump"; then ok "a second open leaves the sha256 unchanged"; else bad "a second open changed the store or its export"; fi
[ ! -e "$DB.v4.bak" ] && [ ! -e "$DB.v3.bak.1" ] && ok "a second open writes no second backup" || bad "a second open wrote a backup"

# 4. the lines table against the posix files: the text of each artifact in order, and the
# head rule's attribution (the exact rule of docs/the-engine.md, Search, read from the files)
for u in $units; do
  d="$SESS/$u"
  {
    for a in state backlog knowledge journal; do [ -f "$d/$a.md" ] && printf '%s\t%s\t%s\n' "" "$a" "$d/$a.md"; done
    for ld in "$d"/lanes/*; do
      [ -d "$ld" ] || continue
      for a in recipe journal report; do [ -f "$ld/$a.md" ] && printf '%s\t%s\t%s\n' "${ld##*/}" "lane_$a" "$ld/$a.md"; done
    done
  } > "$SB/files-$u"
  U=$u LC_ALL=C awk -F '\t' '
    function out(line) { printf "%s\t%s\t%s\t%s\t%s\n", sec, ++n, line, et, eid }
    {
      lane = $1; sec = $2; path = $3; n = 0
      if (lane == "") { et = "session"; eid = ENVIRON["U"] } else { et = "lane"; eid = lane }
      while ((getline line < path) > 0) {
        if (line ~ /^@[a-zA-Z0-9_-]+/) {
          h = substr(line, 2); sub(/\r$/, "", h)
          split(h, P, /[ \t]+/); t = P[1]; id = P[2]; sub(/\(.*$/, "", id)
          if (t == "task") { et = "task"; eid = id }
          else if (t == "finding") { et = "finding"; eid = id }
          else if (t == "entry" && lane != "") { et = "lane_entry"; eid = lane "/" id }
          else if (t == "entry") { et = "entry"; eid = id }
          else if (t == "anchor" && lane == "") { et = "session"; eid = ENVIRON["U"] }
        }
        out(line)
      }
      close(path)
    }' "$SB/files-$u" > "$SB/want-$u.lines"
  sqlite3 -separator '	' "$DB" "SELECT section, lno, line, entity_type, entity_id FROM lines WHERE unit = '$(q "$u")' ORDER BY lane COLLATE BINARY, aord, lno;" > "$SB/got-$u.lines"
done
lsame=0
for u in $units; do
  if cmp -s "$SB/want-$u.lines" "$SB/got-$u.lines"; then lsame=$((lsame + 1)); else bad "lines of $u: $(cmp "$SB/want-$u.lines" "$SB/got-$u.lines" 2>&1 | head -n 1)"; fi
done
[ "$lsame" -eq "$nu" ] && ok "the lines table of all $nu units equals every file line with the head rule's attribution" || bad "$lsame of $nu units carry the lines of their files"
[ "$(sqlite3 "$DB" "SELECT count(*) FROM search_documents;")" = "$(sqlite3 "$DB" "SELECT count(*) FROM fts_prose;")" ] && [ "$(sqlite3 "$DB" "SELECT count(*) FROM search_documents;")" -gt 0 ] \
  && ok "the ranked search documents are indexed by the FTS5 tables" || bad "the FTS5 tables do not follow the search documents"

# 5. a store above version 4 refuses; a fresh store opens at version 4
cp "$DB" "$SB/v5.db"
sqlite3 "$SB/v5.db" "PRAGMA user_version = 5;"
h5=$(shasum -a 256 "$SB/v5.db" | cut -d ' ' -f 1)
(cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$SB/v5.db" "$DRV" unit.export legacy-u > "$SB/out" 2> "$SB/err"); RC=$?
if [ "$RC" -eq 2 ] && [ ! -s "$SB/out" ] && [ "$(cat "$SB/err")" = "unit.export: error: the store is at schema 5; this driver reads 4 (ERR_STORAGE_SCHEMA)" ] \
  && [ "$(shasum -a 256 "$SB/v5.db" | cut -d ' ' -f 1)" = "$h5" ]; then ok "a store at schema 5 refuses rc 2 ERR_STORAGE_SCHEMA and stays untouched"
else bad "schema 5: rc $RC [$(cat "$SB/out")] [$(cat "$SB/err")]"; fi
(cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$SB/fresh.db" "$DRV" unit.import tc73-u < "$SB/fx/tc73-u.dump" > "$SB/out" 2> "$SB/err"); RC=$?
if [ "$RC" -eq 0 ] && [ "$(sqlite3 "$SB/fresh.db" 'PRAGMA user_version;')" = 4 ] && [ ! -e "$SB/fresh.db.v0.bak" ]; then ok "a fresh store opens at version 4 with no backup"; else bad "a fresh store: rc $RC [$(cat "$SB/err")]"; fi

printf 'test-upgrade: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
