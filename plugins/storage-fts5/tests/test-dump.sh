#!/bin/sh
# test-dump.sh: unit.export and unit.import of the fts5 driver (contract 2, docs/the-engine.md,
# The dump) on the plugin's own module copy, against the fixtures of tests/fixtures/dumps:
#   1. every fixture unit imports into a fresh store, answers its record count, and exports
#      byte for byte as the fixture; tests/dump-check.sh accepts every export
#   2. TC62's refusals: a held unit without --replace (ERR_ENTITY_EXISTS), --replace swapping
#      it whole, a malformed line 7 and another unit's dump named by their lines
#      (ERR_DUMP_FORMAT) with no unit made
#   3. malformed dumps refuse at the same line as the posix driver's import names
# Exit: 0 all pass, 1 a failure, 77 without sqlite3.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
# the plugin's own module copy, never the workspace's adopted one: the two drift
DRV="$SCRIPT_DIR/../.contexture/modules/storage-fts5/drivers/fts5"
POSIX="$ROOT/base/.contexture/modules/session/drivers/posix/driver"
FX="$ROOT/tests/fixtures/dumps"
CHECK="$ROOT/tests/dump-check.sh"

if ! command -v sqlite3 >/dev/null 2>&1; then
  printf 'SKIP: sqlite3 not found on PATH\n'
  exit 77
fi

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-dump-test.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
mkdir -p "$SB/ws/.contexture/tmp" "$SB/px/.contexture/tmp" "$SB/fx"
DB="$SB/store.db"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }

# f <function> <args...> < stdin: the fts5 driver run from its sandbox workspace; the answer
# in $SB/out, stderr in $SB/err, the exit code in RC
f() { (cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$DB" "$DRV" "$@" > "$SB/out" 2> "$SB/err"); RC=$?; }
# p: the same through the posix driver of the shipped base (the reference reading)
p() { (cd "$SB/px" && "$POSIX" "$@" > "$SB/pout" 2> "$SB/perr"); PRC=$?; }

# the fixture units, one file per unit (the three unit fixture split at its unit lines)
for fx in "$FX"/*.dump; do
  awk -v d="$SB/fx" '/^\{"kind":"unit"/ { u = $0; sub(/^.*"unit":"/, "", u); sub(/".*$/, "", u); f = d "/" u ".dump" } { print > f }' "$fx"
done
n=0
for fd in "$SB"/fx/*.dump; do
  u=$(basename "$fd" .dump)
  n=$((n + 1))
  recs=$(tail -n 1 "$fd" | sed 's/^.*"records"://; s/}$//')
  f unit.import "$u" < "$fd"
  want="{\"unit\":\"$u\",\"records\":$recs,\"replaced\":false}"
  if [ "$RC" -ne 0 ] || [ "$(cat "$SB/out")" != "$want" ] || [ -s "$SB/err" ]; then bad "import $u: rc $RC [$(cat "$SB/out")] want [$want] [$(head -c 300 "$SB/err")]"; continue; fi
  f unit.export "$u" < /dev/null
  if [ "$RC" -ne 0 ] || [ -s "$SB/err" ] || ! cmp -s "$SB/out" "$fd"; then bad "export $u: rc $RC, $(cmp "$SB/out" "$fd" 2>&1 | head -n 1) [$(head -c 300 "$SB/err")]"; continue; fi
  if ! sh "$CHECK" "$SB/out" > /dev/null 2> "$SB/cerr"; then bad "dump-check refuses the export of $u: $(cat "$SB/cerr")"; continue; fi
  ok "round trip $u: import answers $recs records, export byte for byte, dump-check accepts it"
done
[ "$n" -ge 15 ] || bad "only $n fixture units found, want 15 or more"

# refused <rc> <line>: nothing on stdout, exactly the one stderr line
refused() {
  _got=$(cat "$SB/err")
  if [ "$RC" -eq "$1" ] && [ ! -s "$SB/out" ] && [ "$(wc -l < "$SB/err" | tr -d ' ')" = 1 ] && [ "$_got" = "$2" ]; then return 0; fi
  printf '  got rc %s stdout [%s] stderr [%s]\n' "$RC" "$(head -c 200 "$SB/out")" "$_got"
  return 1
}

f unit.import legacy-u < "$FX/legacy.dump"
if refused 1 "unit.import: error: unit 'legacy-u' already exists (ERR_ENTITY_EXISTS)"; then ok "TC62: a held unit refuses without --replace"; else bad "TC62: a held unit refuses without --replace"; fi
f unit.import legacy-u --replace < "$FX/legacy.dump"
if [ "$RC" -eq 0 ] && [ "$(cat "$SB/out")" = '{"unit":"legacy-u","records":31,"replaced":true}' ]; then ok "TC62: --replace answers replaced true"; else bad "TC62: --replace answered rc $RC [$(cat "$SB/out")] [$(cat "$SB/err")]"; fi
f unit.export legacy-u < /dev/null
if [ "$RC" -eq 0 ] && cmp -s "$SB/out" "$FX/legacy.dump"; then ok "TC62: the replaced unit exports the fixture byte for byte"; else bad "TC62: the replaced unit export differs"; fi
awk 'NR == 7 { print "{\"kind\":\"entry\""; next } { gsub(/"unit":"tc63-clean"/, "\"unit\":\"tc62-u\""); print }' "$FX/tc63-clean.dump" > "$SB/tc62-bad.dump"
f unit.import tc62-u < "$SB/tc62-bad.dump"
case "$(cat "$SB/err")" in
  "unit.import: error: dump line 7: "*" (ERR_DUMP_FORMAT)") if [ "$RC" -eq 1 ] && [ ! -s "$SB/out" ]; then ok "TC62: a malformed line 7 refuses naming it"; else bad "TC62: line 7 rc $RC"; fi ;;
  *) bad "TC62: line 7 refused [$(cat "$SB/err")]" ;;
esac
f unit.export tc62-u < /dev/null
if refused 1 "unit.export: error: unit 'tc62-u' not found (ERR_ENTITY_NOT_FOUND)"; then ok "TC62: the refused import made no unit"; else bad "TC62: the refused import made a unit"; fi
f unit.import other-u < "$FX/legacy.dump"
case "$(cat "$SB/err")" in
  "unit.import: error: dump line 1: "*" (ERR_DUMP_FORMAT)") ok "TC62: another unit's dump refuses at line 1" ;;
  *) bad "TC62: another unit's dump refused [$(cat "$SB/err")]" ;;
esac

# malformed dumps: each refuses rc 1 ERR_DUMP_FORMAT at the line the posix import names,
# with nothing written
B="$FX/tc63-clean.dump"
mk() { printf '%s' "$2" > "$SB/m-$1.dump"; }
mk empty ''
awk '{ gsub(/"unit":"tc63-clean"/, "\"unit\":\"m\""); print }' "$B" > "$SB/m-ok.dump"
head -c $(($(wc -c < "$SB/m-ok.dump") - 1)) "$SB/m-ok.dump" > "$SB/m-nolf.dump"
awk 'NR == 3 { sub(/,"preamble"/, ", \"preamble\"") } { print }' "$SB/m-ok.dump" > "$SB/m-spaced.dump"
awk 'NR == 2 { sub(/"status":"ACTIVE"/, "\"status\":\"ACTIV\\u0080\"") } { print }' "$SB/m-ok.dump" > "$SB/m-u80.dump"
awk 'NR == 2 { sub(/"status":"ACTIVE"/, "\"status\":\"\\u0041CTIVE\"") } { print }' "$SB/m-ok.dump" > "$SB/m-u41.dump"
awk 'NR == 4 { print ""; } { print }' "$SB/m-ok.dump" > "$SB/m-blank.dump"
awk '{ print } END { print "{\"kind\":\"unit\",\"format\":\"contexture-dump\",\"version\":1,\"unit\":\"m\",\"extras\":0}" }' "$SB/m-ok.dump" > "$SB/m-second.dump"
sed '$d' "$SB/m-ok.dump" > "$SB/m-noend.dump"
awk '/"kind":"end"/ { sub(/"records":[0-9]+/, "\"records\":1") } { print }' "$SB/m-ok.dump" > "$SB/m-count.dump"
awk '/"kind":"entry"/ && !done { sub(/"extra_fields":\[\]/, "\"extra_fields\":[{\"key\":\"NOTE\",\"value\":\"x\"}]"); done = 1 } { print }' "$SB/m-ok.dump" > "$SB/m-extra.dump"
awk 'NR == 2 { sub(/"repos":\[/, "\"repos\":[1,") } { print }' "$SB/m-ok.dump" > "$SB/m-repos.dump"
awk 'NR == 3 { sub(/"name":"backlog"/, "\"name\":\"knowledge\"") } { print }' "$SB/m-ok.dump" > "$SB/m-order.dump"
awk 'NR == 1 { sub(/"version":1/, "\"version\":2") } { print }' "$SB/m-ok.dump" > "$SB/m-version.dump"
for m in empty nolf spaced u80 blank second noend count extra repos order version; do
  f unit.import m < "$SB/m-$m.dump"
  p unit.import m < "$SB/m-$m.dump"
  fl=$(sed -n 's/^unit\.import: error: dump line \([0-9]*\): .* (ERR_DUMP_FORMAT)$/\1/p' "$SB/err")
  pl=$(sed -n 's/^unit\.import: error: dump line \([0-9]*\): .* (ERR_DUMP_FORMAT)$/\1/p' "$SB/perr")
  if [ "$RC" -eq 1 ] && [ ! -s "$SB/out" ] && [ -n "$fl" ] && [ "$fl" = "$pl" ]; then ok "malformed ($m): refused at dump line $fl, the line the posix import names"
  else bad "malformed ($m): fts5 rc $RC [$(cat "$SB/err")], posix rc $PRC [$(cat "$SB/perr")]"; fi
done
f unit.export m < /dev/null
if refused 1 "unit.export: error: unit 'm' not found (ERR_ENTITY_NOT_FOUND)"; then ok "the refused imports made no unit"; else bad "a refused import made a unit"; fi
# the escape rule's other side: a \u escape below 0x80 reads as its character, as posix reads it
f unit.import m < "$SB/m-u41.dump"
p unit.import m < "$SB/m-u41.dump"
f unit.export m < /dev/null
cp "$SB/out" "$SB/f-u41.out"
p unit.export m < /dev/null
if [ "$RC" -eq 0 ] && cmp -s "$SB/f-u41.out" "$SB/pout" && cmp -s "$SB/f-u41.out" "$SB/m-ok.dump"; then ok "a \\u0041 escape imports as A on both drivers and exports raw"; else bad "the \\u0041 escape: fts5 and posix exports differ or keep the escape"; fi

printf 'test-dump: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
