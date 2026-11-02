#!/bin/sh
# module-tests.sh: the package overlay installer suite, staged from the shipped
# base. Covers the extension-root-only overlay and the state record; every
# collision class (a path outside the extension root, a core path, an existing
# non-recorded file, another package's file, a module name against a builtin, a
# workspace module, or a reserved name, a driver name against core posix, a
# duplicate namespace); the re-install and upgrade cases; the uninstall with its
# record and the changed-file preservation; the executable-bit modes; the part
# hooks' order and their failure; the read-only refusal that writes nothing; the
# installed driver resolving from the extension root; the engine's _reserved
# reader; and a real package wrapper's refusal of the old package shape.
# Every case stages its package under the sandbox catalog; nothing touches the
# live drawer, the real catalog, or the record.
#
# Usage: tests/module-tests.sh
# Exit 0 when every case passes; 1 otherwise; 2 a staging failure.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"
RUN_MOD="$ROOT/base/.contexture/modules/run"
STORAGE_CORE="$ROOT/base/.contexture/storage"
LANE_MOD="$ROOT/base/.contexture/extensions/modules/lane"
INSTALL_CORE="$ROOT/base/.contexture/package-install"
UNINSTALL_CORE="$ROOT/base/.contexture/package-uninstall"

for f in "$CTX_SRC" "$INSTALL_CORE" "$UNINSTALL_CORE" "$STORAGE_CORE/drivers/posix/driver" "$LANE_MOD/module"; do
  [ -e "$f" ] || { echo "module-tests.sh: missing $f" >&2; exit 2; }
done

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH CTX_STORAGE_SERVICE_URL CTX_STORAGE_SERVICE_KEY

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SB=$(mktemp -d "$tmp_root/module-tests.XXXXXX") || { echo "module-tests.sh: cannot create the sandbox" >&2; exit 2; }
cleanup() { rm -rf "$SB"; }
trap cleanup EXIT INT TERM

mkdir -p "$SB/.contexture/modules" "$SB/.contexture/extensions/modules" "$SB/catalog"
cp -p "$CTX_SRC" "$SB/.contexture/ctx"
cp -p "$INSTALL_CORE" "$SB/.contexture/package-install"
cp -p "$UNINSTALL_CORE" "$SB/.contexture/package-uninstall"
cp -R "$SESSION_MOD" "$SB/.contexture/modules/session"
cp -R "$RUN_MOD" "$SB/.contexture/modules/run"
cp -R "$STORAGE_CORE" "$SB/.contexture/storage"
cp -R "$LANE_MOD" "$SB/.contexture/extensions/modules/lane"
chmod +x "$SB/.contexture/ctx" "$SB/.contexture/package-install" "$SB/.contexture/package-uninstall" \
  "$SB/.contexture/modules/session/scripts/"* "$SB/.contexture/storage/scripts/"* \
  "$SB/.contexture/storage/drivers/posix/driver" "$SB/.contexture/extensions/modules/lane/scripts/"* 2>/dev/null || true
cd "$SB" || exit 2
SB_REAL=$(pwd)

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_rc() { if [ "$1" -eq "$2" ]; then ok "$3"; else bad "$3 (rc $1 want $2)"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }
a_not() { if printf '%s\n' "$1" | grep -q "$2"; then bad "$3 (unwanted: $2)"; else ok "$3"; fi; }
a_file() { if [ -f "$1" ]; then ok "$2"; else bad "$2 (missing $1)"; fi; }
a_no_file() { if [ -e "$1" ]; then bad "$2 (unwanted $1)"; else ok "$2"; fi; }
a_exec() { if [ -x "$1" ]; then ok "$2"; else bad "$2 (not executable: $1)"; fi; }
a_noexec() { if [ -x "$1" ]; then bad "$2 (unexpectedly executable: $1)"; else ok "$2"; fi; }
a_contains() { if grep -Fq "$2" "$1" 2>/dev/null; then ok "$3"; else bad "$3 (no [$2] in $(basename "$1"))"; fi; }

new_pkg() { # <path>
  np=$1
  mkdir -p "$np/.contexture/extensions" "$np/tests" "$np/docs/workspace"
  printf '# fixture package\n' > "$np/README.md"
  printf '#!/bin/sh\nexit 0\n' > "$np/tests/run.sh"
  printf '@append @laws\n  fixture-law: a fixture law\n' > "$np/AGENTS.workspace.md"
  printf '# seed\n' > "$np/docs/workspace/conventions.md"
}
add_module() { # <pkg> <module> [<namespace>]
  am_p=$1
  am_m=$2
  am_ns=${3:-}
  mkdir -p "$am_p/.contexture/extensions/modules/$am_m/scripts"
  {
    printf '# summary: the %s fixture module\n' "$am_m"
    printf '# version: 1.0.0\n'
    printf '# description:\n'
    printf '# A fixture module for the package overlay suite.\n'
  } > "$am_p/.contexture/extensions/modules/$am_m/module"
  {
    printf '#!/bin/sh\n'
    printf '# summary: say hello from %s\n' "$am_m"
    printf 'echo "hello from %s"\n' "$am_m"
  } > "$am_p/.contexture/extensions/modules/$am_m/scripts/hello"
  chmod +x "$am_p/.contexture/extensions/modules/$am_m/scripts/hello"
  printf '@append @laws\n  %s-law: a fixture law\n' "$am_m" > "$am_p/.contexture/extensions/modules/$am_m/laws"
  if [ -n "$am_ns" ]; then
    printf 'namespace: %s\nkey: <a>/<b>\n' "$am_ns" > "$am_p/.contexture/extensions/modules/$am_m/data"
  fi
}
add_file() { # <pkg> <relative extension path> <text>
  af_p=$1
  af_rel=$2
  af_text=$3
  mkdir -p "$af_p/.contexture/extensions/$(dirname "$af_rel")"
  printf '%s\n' "$af_text" > "$af_p/.contexture/extensions/$af_rel"
}

install_pkg() { # <package root>
  ( cd "$SB" && ./.contexture/package-install "$1" ) > "$SB/.out" 2> "$SB/.err"
  RC=$?
  OUT=$(cat "$SB/.out")
  ERR=$(cat "$SB/.err")
}
uninstall_pkg() { # <package root or name>
  ( cd "$SB" && ./.contexture/package-uninstall "$1" ) > "$SB/.out" 2> "$SB/.err"
  RC=$?
  OUT=$(cat "$SB/.out")
  ERR=$(cat "$SB/.err")
}
STATE="$SB/.contexture/extensions/.state"

echo "== RO the read-only refusal =="
RO=$SB/catalog/pkgro
new_pkg "$RO"
add_module "$RO" ro
chmod 555 "$SB/.contexture/extensions"
( cd "$SB" && find .contexture/extensions -print | LC_ALL=C sort ) > "$SB/before.snap"
install_pkg "$RO"
a_rc "$RC" 2 "RO: a read-only extension root refuses rc2"
a_match "$ERR" "not writable" "RO: the refusal names the root"
( cd "$SB" && find .contexture/extensions -print | LC_ALL=C sort ) > "$SB/after.snap"
a_eq "$(cat "$SB/after.snap")" "$(cat "$SB/before.snap")" "RO: the refusal writes nothing"
a_no_file "$SB/.contexture/extensions/modules/ro/module" "RO: no module landed"
chmod 755 "$SB/.contexture/extensions"
install_pkg "$RO"
a_rc "$RC" 0 "RO null check: a writable root installs rc0"
a_file "$SB/.contexture/extensions/modules/ro/module" "RO null check: the module landed"
uninstall_pkg "$RO"
a_rc "$RC" 0 "RO: cleanup uninstall rc0"

echo "== IN the install overlay, the record, and the modes =="
PA=$SB/catalog/pkga
new_pkg "$PA"
add_module "$PA" alpha docs
add_file "$PA" rhythms/alpha.md "the alpha rhythm"
add_file "$PA" templates/alpha.md "the alpha template"
install_pkg "$PA"
a_rc "$RC" 0 "IN: install rc0"
a_match "$OUT" "installed pkga" "IN: the summary names the package"
a_file "$SB/.contexture/extensions/modules/alpha/module" "IN: the module manifest landed"
a_file "$SB/.contexture/extensions/modules/alpha/laws" "IN: the laws file landed"
a_file "$SB/.contexture/extensions/modules/alpha/data" "IN: the data file landed"
a_exec "$SB/.contexture/extensions/modules/alpha/scripts/hello" "IN: the verb keeps its executable bit"
a_no_file "$SB/AGENTS.workspace.md" "IN: the root overlay fragment never installs"
a_no_file "$SB/README.md" "IN: the README never installs"
a_no_file "$SB/docs/workspace/conventions.md" "IN: the seed stays reference, never installed"
a_no_file "$SB/tests/run.sh" "IN: the tests never install"
a_file "$STATE/pkga.files" "IN: the install record landed"
a_contains "$STATE/pkga.files" "package pkga" "IN: the record names the package"
a_contains "$STATE/pkga.files" "version 1.0.0" "IN: the record names the version"
a_contains "$STATE/pkga.files" "file rwxr-xr-x " "IN: the record carries the executable mode"
a_contains "$STATE/pkga.files" "file rw-r--r-- " "IN: the record carries a plain mode"
a_contains "$STATE/pkga.files" "law .contexture/extensions/modules/alpha/laws" "IN: the record carries the law fragment"
HELP=$(./.contexture/ctx help 2>/dev/null)
a_match "$HELP" "the alpha fixture module" "IN: the installed module lists"
a_match "$HELP" "subagent lane management" "IN: the base lane module still lists"
OUTV=$(./.contexture/ctx alpha hello 2>/dev/null)
a_eq "$OUTV" "hello from alpha" "IN: the installed verb dispatches"
a_noexec "$SB/.contexture/extensions/modules/alpha/module" "IN: the manifest is not executable"

echo "== UP the re-install and upgrade =="
{
  printf '# summary: the alpha fixture module, updated\n'
  printf '# version: 1.1.0\n'
  printf '# description:\n'
  printf '# The updated fixture module.\n'
} > "$PA/.contexture/extensions/modules/alpha/module"
{
  printf '#!/bin/sh\n'
  printf '# summary: say bye from alpha\n'
  printf 'echo "bye from alpha"\n'
} > "$PA/.contexture/extensions/modules/alpha/scripts/bye"
chmod +x "$PA/.contexture/extensions/modules/alpha/scripts/bye"
rm -f "$PA/.contexture/extensions/rhythms/alpha.md"
add_file "$PA" rhythms/beta.md "the beta rhythm"
install_pkg "$PA"
a_rc "$RC" 0 "UP: re-install over the recorded files rc0"
a_match "$(./.contexture/ctx help 2>/dev/null)" "the alpha fixture module, updated" "UP: the updated summary lists"
OUTV=$(./.contexture/ctx alpha bye 2>/dev/null)
a_eq "$OUTV" "bye from alpha" "UP: the new verb dispatches"
a_no_file "$SB/.contexture/extensions/rhythms/alpha.md" "UP: a stale unchanged file is removed"
a_file "$SB/.contexture/extensions/rhythms/beta.md" "UP: the new file lands"
a_contains "$STATE/pkga.files" "version 1.1.0" "UP: the record carries the new version"
a_not "$(cat "$STATE/pkga.files")" "rhythms/alpha.md" "UP: the record drops the removed file"
add_file "$PA" rhythms/keep.md "the kept rhythm"
install_pkg "$PA"
a_rc "$RC" 0 "UP: a second re-install rc0"
printf 'locally edited\n' > "$SB/.contexture/extensions/rhythms/keep.md"
rm -f "$PA/.contexture/extensions/rhythms/keep.md"
install_pkg "$PA"
a_rc "$RC" 0 "UP: a re-install that drops a changed file rc0"
a_match "$OUT" "preserved .contexture/extensions/rhythms/keep.md" "UP: the changed stale file is reported preserved"
a_eq "$(cat "$SB/.contexture/extensions/rhythms/keep.md")" "locally edited" "UP: the changed stale file keeps its bytes"
a_contains "$STATE/pkga.files" "rhythms/keep.md" "UP: the preserved stale file stays recorded"

echo "== CO the collision classes =="
PC=$SB/catalog/pkgcore
new_pkg "$PC"
mkdir -p "$PC/.contexture/modules/x"
printf '# summary: x\n' > "$PC/.contexture/modules/x/module"
install_pkg "$PC"
a_rc "$RC" 1 "CO: a core path refuses rc1"
a_match "$ERR" "core path refused" "CO: the core path names its class"
a_no_file "$SB/.contexture/modules/x" "CO: the core path writes nothing"
PO=$SB/catalog/pkgout
new_pkg "$PO"
mkdir -p "$PO/.contexture/other"
printf 'x\n' > "$PO/.contexture/other/x"
install_pkg "$PO"
a_rc "$RC" 1 "CO: a path outside the extension root refuses rc1"
a_match "$ERR" "outside the extension root" "CO: the outside path names its class"
PEX=$SB/catalog/pkgex
new_pkg "$PEX"
add_file "$PEX" rhythms/taken.md "the package rhythm"
mkdir -p "$SB/.contexture/extensions/rhythms"
printf 'the workspace rhythm\n' > "$SB/.contexture/extensions/rhythms/taken.md"
install_pkg "$PEX"
a_rc "$RC" 1 "CO: an existing non-recorded file refuses rc1"
a_match "$ERR" "existing non-recorded file" "CO: the existing file names its class"
a_eq "$(cat "$SB/.contexture/extensions/rhythms/taken.md")" "the workspace rhythm" "CO: the existing file keeps its bytes"
PS1=$SB/catalog/pkgshared1
new_pkg "$PS1"
add_file "$PS1" rhythms/shared.md "from package one"
install_pkg "$PS1"
a_rc "$RC" 0 "CO: the first package with the shared path installs"
PS2=$SB/catalog/pkgshared2
new_pkg "$PS2"
add_file "$PS2" rhythms/shared.md "from package two"
install_pkg "$PS2"
a_rc "$RC" 1 "CO: another package's file refuses rc1"
a_match "$ERR" "another package's file" "CO: the recorded owner names its class"
a_match "$ERR" "pkgshared1" "CO: the refusal names the recording package"
a_eq "$(cat "$SB/.contexture/extensions/rhythms/shared.md")" "from package one" "CO: another package's file keeps its bytes"
PB=$SB/catalog/pkgbuiltin
new_pkg "$PB"
add_module "$PB" session
install_pkg "$PB"
a_rc "$RC" 1 "CO: a builtin module name refuses rc1"
a_match "$ERR" "collides with a builtin" "CO: the builtin names its class"
PL=$SB/catalog/pkgbuiltinlane
new_pkg "$PL"
add_module "$PL" lane
install_pkg "$PL"
a_rc "$RC" 1 "CO: the lane builtin refuses rc1"
a_match "$ERR" "collides with a builtin" "CO: the lane builtin names its class"
mkdir -p "$SB/.contexture/modules/wsmod"
printf '# summary: a workspace fixture module\n' > "$SB/.contexture/modules/wsmod/module"
PW=$SB/catalog/pkgws
new_pkg "$PW"
add_module "$PW" wsmod
install_pkg "$PW"
a_rc "$RC" 1 "CO: a workspace module name refuses rc1"
a_match "$ERR" "collides with a workspace module" "CO: the workspace module names its class"
PR=$SB/catalog/pkgreserved
new_pkg "$PR"
add_module "$PR" refresh
install_pkg "$PR"
a_rc "$RC" 1 "CO: a reserved module name refuses rc1"
a_match "$ERR" "reserved name" "CO: the reserved name names its class"
PD=$SB/catalog/pkgdriver
new_pkg "$PD"
mkdir -p "$PD/.contexture/extensions/storage/drivers/posix"
printf '#!/bin/sh\nexit 0\n' > "$PD/.contexture/extensions/storage/drivers/posix/driver"
chmod +x "$PD/.contexture/extensions/storage/drivers/posix/driver"
install_pkg "$PD"
a_rc "$RC" 1 "CO: a driver named posix refuses rc1"
a_match "$ERR" "core posix driver" "CO: the posix driver name names its class"
PN=$SB/catalog/pkgdupns
new_pkg "$PN"
add_module "$PN" one dupns
add_module "$PN" two dupns
install_pkg "$PN"
a_rc "$RC" 1 "CO: a duplicate namespace in one package refuses rc1"
a_match "$ERR" "more than one module" "CO: the duplicate namespace names its class"
mkdir -p "$SB/.contexture/modules/wsns"
printf '# summary: a workspace namespace fixture\n' > "$SB/.contexture/modules/wsns/module"
printf 'namespace: taken\nkey: <a>/<b>\n' > "$SB/.contexture/modules/wsns/data"
PW2=$SB/catalog/pkgtaken
new_pkg "$PW2"
add_module "$PW2" takenmod taken
install_pkg "$PW2"
a_rc "$RC" 1 "CO: a namespace a workspace module declares refuses rc1"
a_match "$ERR" "declared by module 'wsns'" "CO: the namespace owner is named"
PM=$SB/catalog/pkgmalformed
new_pkg "$PM"
mkdir -p "$PM/.contexture/extensions/modules/bad/scripts"
printf '# summary: a malformed manifest\n# requires: base>=1.0.0\n' > "$PM/.contexture/extensions/modules/bad/module"
printf '#!/bin/sh\n# summary: x\necho x\n' > "$PM/.contexture/extensions/modules/bad/scripts/x"
install_pkg "$PM"
a_rc "$RC" 1 "CO: a malformed module manifest refuses rc1"
a_match "$ERR" "malformed module 'bad'" "CO: the malformed manifest names the module"

echo "== HK the part hooks' order and failure =="
PH=$SB/catalog/pkgh
new_pkg "$PH"
add_module "$PH" h
{
  printf '#!/bin/sh\n'
  printf '[ -f "$CTX_ROOT/.contexture/extensions/modules/h/module" ] || exit 1\n'
  printf '[ -f "$CTX_ROOT/.contexture/extensions/.state/pkgh.files" ] || exit 1\n'
  printf '[ "$(pwd)" = "$(cd "$CTX_ROOT" && pwd)" ] || exit 2\n'
  printf 'printf "install %%s %%s\\n" "$CTX_ROOT" "$CTX_PACKAGE_ROOT" >> "$CTX_ROOT/hook.log"\n'
} > "$PH/.contexture/extensions/modules/h/install"
{
  printf '#!/bin/sh\n'
  printf '[ -f "$CTX_ROOT/.contexture/extensions/modules/h/module" ] || exit 1\n'
  printf 'printf "uninstall\\n" >> "$CTX_ROOT/hook.log"\n'
} > "$PH/.contexture/extensions/modules/h/uninstall"
chmod +x "$PH/.contexture/extensions/modules/h/install" "$PH/.contexture/extensions/modules/h/uninstall"
install_pkg "$PH"
a_rc "$RC" 0 "HK: an install with a part hook rc0"
a_file "$SB/hook.log" "HK: the install hook ran"
PH_REAL=$(cd "$PH" && pwd)
a_match "$(cat "$SB/hook.log")" "install $SB_REAL $PH_REAL" "HK: the hook saw the overlay, the record, and the exported roots"
uninstall_pkg "$PH"
a_rc "$RC" 0 "HK: the uninstall with a part hook rc0"
a_match "$(cat "$SB/hook.log")" "uninstall" "HK: the uninstall hook ran before removal"
a_no_file "$SB/.contexture/extensions/modules/h/module" "HK: the overlay is gone after the hook"
rm -f "$SB/hook.log"
PF=$SB/catalog/pkgfail
new_pkg "$PF"
add_module "$PF" f
printf '#!/bin/sh\nexit 3\n' > "$PF/.contexture/extensions/modules/f/install"
chmod +x "$PF/.contexture/extensions/modules/f/install"
install_pkg "$PF"
a_rc "$RC" 2 "HK: a failing install hook fails the install rc2"
a_match "$ERR" "install hook failed" "HK: the failing hook names itself"
a_file "$SB/.contexture/extensions/modules/f/module" "HK: the overlay stays after the hook failure"
a_file "$STATE/pkgfail.files" "HK: the record stays after the hook failure"
uninstall_pkg "$PF"
a_rc "$RC" 0 "HK: the cleanup uninstall rc0"

echo "== UN the uninstall and the changed-file preservation =="
PU=$SB/catalog/pkgu
new_pkg "$PU"
add_module "$PU" u
add_file "$PU" rhythms/u.md "the u rhythm"
install_pkg "$PU"
a_rc "$RC" 0 "UN: install rc0"
printf 'edited after install\n' > "$SB/.contexture/extensions/rhythms/u.md"
uninstall_pkg "$PU"
a_rc "$RC" 0 "UN: uninstall rc0"
a_match "$OUT" "preserved .contexture/extensions/rhythms/u.md" "UN: the changed file is reported preserved"
a_eq "$(cat "$SB/.contexture/extensions/rhythms/u.md")" "edited after install" "UN: the changed file keeps its bytes"
a_no_file "$SB/.contexture/extensions/modules/u/module" "UN: the unchanged overlay is removed"
a_no_file "$STATE/pkgu.files" "UN: the record is removed"
a_file "$SB/.contexture/extensions/modules/lane/module" "UN: another package's overlay stays"
uninstall_pkg "$PU"
a_rc "$RC" 1 "UN: a second uninstall refuses rc1"
a_match "$ERR" "not installed" "UN: the refusal names the missing record"
uninstall_pkg "$PA"
a_rc "$RC" 0 "UN: the upgrade package uninstall rc0"
a_eq "$(cat "$SB/.contexture/extensions/rhythms/keep.md")" "locally edited" "UN: the preserved stale file survives the package uninstall"
a_no_file "$STATE/pkga.files" "UN: the upgrade record is removed"
a_no_file "$SB/.contexture/extensions/modules/alpha" "UN: the upgrade module folder is removed"

echo "== DR the installed driver and the wrapper =="
PD2=$SB/catalog/pkgdrv
new_pkg "$PD2"
mkdir -p "$PD2/.contexture/extensions/storage/drivers/fakedrv"
printf '#!/bin/sh\nexit 0\n' > "$PD2/.contexture/extensions/storage/drivers/fakedrv/driver"
chmod +x "$PD2/.contexture/extensions/storage/drivers/fakedrv/driver"
install_pkg "$PD2"
a_rc "$RC" 0 "DR: a driver package installs rc0"
a_exec "$SB/.contexture/extensions/storage/drivers/fakedrv/driver" "DR: the driver lands executable in the extension root"
GOT=$(cd "$SB" && CTX_STORAGE_DRIVER=fakedrv ./.contexture/storage/scripts/driver-resolver resolve 2>&1)
a_eq "$GOT" "$SB/.contexture/extensions/storage/drivers/fakedrv/driver" "DR: the resolver finds the installed driver in the extension root"
uninstall_pkg "$PD2"
a_rc "$RC" 0 "DR: the driver package uninstall rc0"
( cd "$SB" && CTX_ROOT="$SB" sh "$ROOT/plugins/docs-discipline/install" ) > "$SB/.out" 2> "$SB/.err"
RC=$?
ERR=$(cat "$SB/.err")
a_rc "$RC" 1 "DR: the real package wrapper reaches the installer and refuses the old shape rc1"
a_match "$ERR" "core path refused" "DR: the old-shape refusal names the core path"

echo "== RS the engine's reserved reader =="
( cd "$SB" && ./.contexture/ctx _reserved refresh ) >/dev/null 2>&1
a_rc "$?" 0 "RS: refresh is reserved"
( cd "$SB" && ./.contexture/ctx _reserved record ) >/dev/null 2>&1
a_rc "$?" 0 "RS: a session verb is reserved"
( cd "$SB" && ./.contexture/ctx _reserved session ) >/dev/null 2>&1
a_rc "$?" 1 "RS: session is a builtin, not a reserved word"
( cd "$SB" && ./.contexture/ctx _reserved zzz ) >/dev/null 2>&1
a_rc "$?" 1 "RS: a free name answers rc1"
( cd "$SB" && ./.contexture/ctx _reserved ) >/dev/null 2>&1
a_rc "$?" 1 "RS: a missing name refuses rc1"

printf '\n== summary ==\n'
printf 'module-tests: pass=%d fail=%d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
