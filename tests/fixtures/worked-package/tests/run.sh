#!/bin/sh
# worked-package tests: stage the shipped base in a sandbox, install the worked
# example package there, and prove the package manifest, the module manifest, the
# laws and data files, the install part hook, the store verbs, and the uninstall
# end to end. Hermetic: its own sandbox under the workspace's .contexture/tmp,
# removed on exit, never the live drawer and never the real catalog.
#
# Usage: tests/fixtures/worked-package/tests/run.sh
# Exit 0 when every case passes; 1 otherwise; 2 a staging failure.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
PKG=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
ROOT=$(CDPATH="" cd "$PKG/../../.." && pwd)
BASE="$ROOT/base"
MOD="$PKG/.contexture/extensions/modules/notes"
MANIFEST="$PKG/manifest"

for f in "$BASE/.contexture/ctx" "$BASE/.contexture/package-install" \
         "$BASE/.contexture/package-uninstall" "$BASE/.contexture/storage/drivers/posix/driver" \
         "$MOD/module" "$MANIFEST"; do
  [ -e "$f" ] || { echo "worked-package: missing $f" >&2; exit 2; }
done

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SB=$(mktemp -d "$tmp_root/worked-package.XXXXXX") || { echo "worked-package: cannot create the sandbox" >&2; exit 2; }
cleanup() { rm -rf "$SB"; }
trap cleanup EXIT INT TERM

mkdir -p "$SB/.contexture"
cp -R "$BASE/.contexture/." "$SB/.contexture/"
chmod +x "$SB/.contexture/ctx" "$SB/.contexture/package-install" "$SB/.contexture/package-uninstall" \
  "$SB/.contexture/modules/unit/scripts/"* "$SB/.contexture/storage/scripts/"* \
  "$SB/.contexture/storage/drivers/posix/driver" "$SB/.contexture/extensions/modules/lane/scripts/"* 2>/dev/null || true
cd "$SB" || exit 2
CTX_ROOT=$SB
export CTX_ROOT

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_rc() { if [ "$1" -eq "$2" ]; then ok "$3"; else bad "$3 (rc $1 want $2)"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }
a_file() { if [ -f "$1" ]; then ok "$2"; else bad "$2 (missing $1)"; fi; }
a_no_file() { if [ -e "$1" ]; then bad "$2 (unwanted $1)"; else ok "$2"; fi; }

echo "== MF the manifests =="
./.contexture/ctx _module "$MOD/module" validate >/dev/null 2>&1
a_rc "$?" 0 "MF: the module manifest validates rc0"
a_eq "$(./.contexture/ctx _module "$MOD/module" summary)" \
  "the worked example notes module: put, show, and keys over the module store" \
  "MF: the summary reads"
a_match "$(./.contexture/ctx _module "$MOD/module" description)" "worked example" \
  "MF: the description block reads"
./.contexture/ctx _package "$MANIFEST" validate >/dev/null 2>&1
a_rc "$?" 0 "MF: the package manifest validates rc0"
a_eq "$(./.contexture/ctx _package "$MANIFEST" kind)" "feature" \
  "MF: the package is a feature package"
a_eq "$(./.contexture/ctx _package "$MANIFEST" parts)" "module modules/notes" \
  "MF: the package declares one module part"

echo "== IN the install and the part hook =="
sh "$PKG/install" > "$SB/.out" 2> "$SB/.err"
RC=$?
OUT=$(cat "$SB/.out")
ERR=$(cat "$SB/.err")
a_rc "$RC" 0 "IN: the package installs rc0"
a_match "$OUT" "installed worked-package" "IN: the installer names the package"
a_file "$SB/.contexture/extensions/modules/notes/module" "IN: the module manifest lands"
a_file "$SB/.contexture/extensions/modules/notes/laws" "IN: the laws fragment lands"
a_file "$SB/.contexture/extensions/modules/notes/data" "IN: the data declaration lands"
a_file "$SB/.contexture/extensions/modules/notes/install" "IN: the module install part hook lands"
a_match "$(./.contexture/ctx help 2>/dev/null)" "the worked example notes module" \
  "IN: the installed module lists"
a_match "$OUT" "seeded the welcome note" "IN: the install hook seeded through the module verb"
a_match "$(./.contexture/ctx notes show welcome/readme 2>/dev/null)" \
  "A note reaches the module store through the notes verbs" \
  "IN: the seeded note reads back through the verb"

echo "== VR the verbs over the store =="
printf 'the first test note\n' | ./.contexture/ctx notes put demo/first > "$SB/.out" 2> "$SB/.err"
RC=$?
a_rc "$RC" 0 "VR: put rc0"
a_eq "$(cat "$SB/.out")" "saved demo/first" "VR: put confirms the key"
a_eq "$(./.contexture/ctx notes show demo/first)" "the first test note" \
  "VR: show returns the stored bytes"
a_match "$(./.contexture/ctx notes keys)" '"demo/first"' "VR: keys lists the stored key"
a_match "$(./.contexture/ctx notes keys)" '"welcome/readme"' "VR: keys lists the seeded key"
a_file "$SB/notes/demo/first" "VR: the posix store keeps the note at its key path"
a_eq "$(cat "$SB/notes/demo/first")" "the first test note" "VR: the stored file carries the bytes"
printf 'x\n' | ./.contexture/ctx notes put demo > "$SB/.out" 2> "$SB/.err"
a_rc "$?" 1 "VR: a malformed key refuses rc1"
a_match "$(cat "$SB/.err")" "ERR_INVALID_ARGUMENT" "VR: the malformed key names its code"

echo "== UP the re-install never overwrites a note =="
printf 'an edited welcome\n' | ./.contexture/ctx notes put welcome/readme >/dev/null 2>&1
sh "$PKG/install" > "$SB/.out" 2> "$SB/.err"
RC=$?
a_rc "$RC" 0 "UP: the re-install rc0"
a_match "$(cat "$SB/.out")" "already present; left unchanged" "UP: the hook leaves a present note alone"
a_eq "$(./.contexture/ctx notes show welcome/readme)" "an edited welcome" \
  "UP: the edited note keeps its bytes across the re-install"

echo "== UN the uninstall leaves the module data =="
sh "$PKG/uninstall" > "$SB/.out" 2> "$SB/.err"
RC=$?
a_rc "$RC" 0 "UN: the uninstall rc0"
a_no_file "$SB/.contexture/extensions/modules/notes/module" "UN: the module folder is removed"
a_no_file "$SB/.contexture/extensions/.state/worked-package.files" "UN: the install record is removed"
a_file "$SB/notes/demo/first" "UN: the note stays, the store data is user data"
a_eq "$(cat "$SB/notes/demo/first")" "the first test note" "UN: the kept note carries its bytes"
./.contexture/ctx notes show demo/first >/dev/null 2>&1
a_rc "$?" 1 "UN: the removed module no longer dispatches"

printf '\n== summary ==\n'
printf 'worked-package: pass=%d fail=%d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
