#!/bin/sh
# module-tests.sh: the package overlay installer suite, staged from the shipped
# base. Covers the extension-root-only overlay and the state record; every
# collision class (a path outside the extension root, a core path, an existing
# non-recorded file, another package's file, a module name against a builtin, a
# workspace module, or a reserved name, a driver name against core posix, a
# duplicate namespace); the re-install and upgrade cases; the uninstall with its
# record and the changed-file preservation; the executable-bit modes; the part
# hooks' order and their failure; the read-only refusal that writes nothing; the
# rhythm index over the extension root and the law-fragment record; the
# store-data owner scan and the docs store read under the extension root; the
# installed driver resolving from the extension root; the engine's _reserved
# reader; a real package wrapper's refusal of the old package shape; and the
# worked example package's own test (tests/fixtures/worked-package/tests/run.sh).
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

FIXTURE_VERSION=1.0.0

new_pkg() { # <path>
  np=$1
  mkdir -p "$np/.contexture/extensions" "$np/tests" "$np/docs/workspace"
  printf '# fixture package\n' > "$np/README.md"
  printf '#!/bin/sh\nexit 0\n' > "$np/tests/run.sh"
  printf '@append @laws\n  fixture-law: a fixture law\n' > "$np/AGENTS.workspace.md"
  printf '# seed\n' > "$np/docs/workspace/conventions.md"
}
manifest_pkg() { # <path>: write the package manifest from the fixture payload
  mp=$1
  mp_ext=$mp/.contexture/extensions
  mp_kind=feature
  mp_driver=""
  : > "$mp/.parts"
  if [ -d "$mp_ext/storage/drivers" ]; then
    for mp_d in "$mp_ext/storage/drivers"/*; do
      [ -e "$mp_d" ] || continue
      mp_n=${mp_d##*/}
      mp_kind=driver
      mp_driver=$mp_n
      printf 'driver storage/drivers/%s\n' "$mp_n" >> "$mp/.parts"
      break
    done
  fi
  if [ -d "$mp_ext/modules" ]; then
    for mp_d in "$mp_ext/modules"/*; do
      [ -d "$mp_d" ] || continue
      mp_n=${mp_d##*/}
      if [ -f "$mp_d/module" ] || [ -d "$mp_d/scripts" ]; then
        printf 'module modules/%s\n' "$mp_n" >> "$mp/.parts"
      else
        [ -d "$mp_d/filters" ] && printf 'filters modules/%s/filters\n' "$mp_n" >> "$mp/.parts"
        [ -d "$mp_d/hooks" ] && printf 'hooks modules/%s/hooks\n' "$mp_n" >> "$mp/.parts"
        [ -f "$mp_d/laws" ] && printf 'laws modules/%s/laws\n' "$mp_n" >> "$mp/.parts"
      fi
    done
  fi
  for mp_t in rhythms templates; do
    [ -e "$mp_ext/$mp_t" ] && printf '%s %s\n' "$mp_t" "$mp_t" >> "$mp/.parts"
  done
  if [ -d "$mp_ext/laws" ] && find "$mp_ext/laws" -type f 2>/dev/null | grep -q .; then
    printf 'laws laws\n' >> "$mp/.parts"
  fi
  [ -s "$mp/.parts" ] || printf 'templates templates\n' >> "$mp/.parts"
  {
    printf '# summary: fixture package %s\n' "${mp##*/}"
    printf '# version: %s\n' "$FIXTURE_VERSION"
    printf '# kind: %s\n' "$mp_kind"
    [ -n "$mp_driver" ] && printf '# driver: %s\n' "$mp_driver"
    while IFS=' ' read -r mp_pt mp_pp; do
      printf '# part: %s %s\n' "$mp_pt" "$mp_pp"
    done < "$mp/.parts"
  } > "$mp/manifest"
  rm -f "$mp/.parts"
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

install_pkg_raw() { # <package root>: install exactly the manifest it carries
  ( cd "$SB" && ./.contexture/package-install "$1" ) > "$SB/.out" 2> "$SB/.err"
  RC=$?
  OUT=$(cat "$SB/.out")
  ERR=$(cat "$SB/.err")
}
install_pkg() { # <package root>: write the fixture manifest, then install
  manifest_pkg "$1"
  install_pkg_raw "$1"
}
uninstall_pkg() { # <package root or name>
  ( cd "$SB" && ./.contexture/package-uninstall "$1" ) > "$SB/.out" 2> "$SB/.err"
  RC=$?
  OUT=$(cat "$SB/.out")
  ERR=$(cat "$SB/.err")
}
STATE="$SB/.contexture/extensions/.state"
pkgv() { ./.contexture/ctx _package "$@"; }

echo "== PM the package manifest grammar =="
mkdir -p "$SB/pkgmf"
{
  printf '# summary: a feature fixture package\n'
  printf '# version: 1.2.3\n'
  printf '# kind: feature\n'
  printf '# part: module modules/alpha\n'
  printf '# part: laws modules/alpha/laws\n'
  printf '# part: rhythms rhythms\n'
} > "$SB/pkgmf/feature"
pkgv "$SB/pkgmf/feature" validate >/dev/null 2>&1
a_rc "$?" 0 "PM: a feature manifest validates rc0"
a_eq "$(pkgv "$SB/pkgmf/feature" summary)" "a feature fixture package" "PM: the summary reads"
a_eq "$(pkgv "$SB/pkgmf/feature" version)" "1.2.3" "PM: the package version reads"
a_eq "$(pkgv "$SB/pkgmf/feature" kind)" "feature" "PM: the feature kind reads"
a_eq "$(pkgv "$SB/pkgmf/feature" driver)" "" "PM: a feature package names no driver"
a_eq "$(pkgv "$SB/pkgmf/feature" parts)" "module modules/alpha
laws modules/alpha/laws
rhythms rhythms" "PM: the parts read type and path"
{
  printf '# summary: a driver fixture package\n'
  printf '# version: 2.0.0\n'
  printf '# kind: driver\n'
  printf '# driver: fakedrv\n'
  printf '# part: driver storage/drivers/fakedrv\n'
} > "$SB/pkgmf/driver"
pkgv "$SB/pkgmf/driver" validate >/dev/null 2>&1
a_rc "$?" 0 "PM: a driver manifest validates rc0"
a_eq "$(pkgv "$SB/pkgmf/driver" kind)" "driver" "PM: the driver kind reads"
a_eq "$(pkgv "$SB/pkgmf/driver" driver)" "fakedrv" "PM: the driver name reads"
badm() { # <file> <label>
  pkgv "$1" validate >/dev/null 2>&1
  a_rc "$?" 1 "PM: $2 refuses rc1"
}
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: module modules/x\n# requires: base>=1\n' > "$SB/pkgmf/requires"
badm "$SB/pkgmf/requires" "a requires line"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: module modules/x\n# unknown: y\n' > "$SB/pkgmf/unknown"
badm "$SB/pkgmf/unknown" "an unknown field"
printf '# version: 1.0.0\n# kind: feature\n# part: module modules/x\n' > "$SB/pkgmf/nosummary"
badm "$SB/pkgmf/nosummary" "a missing summary"
printf '# summary: x\n# kind: feature\n# part: module modules/x\n' > "$SB/pkgmf/noversion"
badm "$SB/pkgmf/noversion" "a missing version"
printf '# summary: x\n# version: 1.0.0\n# part: module modules/x\n' > "$SB/pkgmf/nokind"
badm "$SB/pkgmf/nokind" "a missing kind"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n' > "$SB/pkgmf/nopart"
badm "$SB/pkgmf/nopart" "a manifest with no part"
printf '# summary: x\n# version: 1.0.0\n# kind: other\n# part: module modules/x\n' > "$SB/pkgmf/badkind"
badm "$SB/pkgmf/badkind" "an unknown kind"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# driver: fakedrv\n# part: module modules/x\n' > "$SB/pkgmf/featuredriver"
badm "$SB/pkgmf/featuredriver" "a feature package with a driver line"
printf '# summary: x\n# version: 1.0.0\n# kind: driver\n# part: driver storage/drivers/fakedrv\n' > "$SB/pkgmf/nodriver"
badm "$SB/pkgmf/nodriver" "a driver package without a driver line"
printf '# summary: x\n# version: 1.0.0\n# kind: driver\n# driver: fakedrv\n# part: driver storage/drivers/other\n' > "$SB/pkgmf/drivermismatch"
badm "$SB/pkgmf/drivermismatch" "a driver part that does not match the name"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: other modules/x\n' > "$SB/pkgmf/badpart"
badm "$SB/pkgmf/badpart" "an unknown part type"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: module modules/x\n# part: module modules/x\n' > "$SB/pkgmf/duppart"
badm "$SB/pkgmf/duppart" "a duplicate part path"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: module modules/../x\n' > "$SB/pkgmf/dotdot"
badm "$SB/pkgmf/dotdot" "a part path with .."
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: module /modules/x\n' > "$SB/pkgmf/abs"
badm "$SB/pkgmf/abs" "an absolute part path"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: rhythms rhythms/\n' > "$SB/pkgmf/trailslash"
badm "$SB/pkgmf/trailslash" "a trailing-slash part path"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: templates templates//x\n' > "$SB/pkgmf/doubleslash"
badm "$SB/pkgmf/doubleslash" "a doubled-slash part path"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: module modules/x/y\n' > "$SB/pkgmf/deepmodule"
badm "$SB/pkgmf/deepmodule" "a module part deeper than one folder"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: rhythms other/x\n' > "$SB/pkgmf/badrhythm"
badm "$SB/pkgmf/badrhythm" "a rhythms part outside rhythms/"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: templates other/x\n' > "$SB/pkgmf/badtemplate"
badm "$SB/pkgmf/badtemplate" "a templates part outside templates/"
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: module modules/x\n# requires:\n' > "$SB/pkgmf/bare-requires"
badm "$SB/pkgmf/bare-requires" "a bare requires line"

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

echo "== SH the six package shapes =="
S1=$SB/catalog/shape-module
new_pkg "$S1"
add_module "$S1" shaped
install_pkg "$S1"
a_rc "$RC" 0 "SH: a module-only feature package installs rc0"
a_match "$(./.contexture/ctx help 2>/dev/null)" "the shaped fixture module" "SH: the module-only package lists its module"
a_contains "$STATE/shape-module.files" "kind feature" "SH: the module-only package records its kind"
S2=$SB/catalog/shape-docs
new_pkg "$S2"
add_module "$S2" shapedocs
add_file "$S2" rhythms/shapedocs.md "a shaped rhythm"
add_file "$S2" templates/shapedocs.md "a shaped template"
install_pkg "$S2"
a_rc "$RC" 0 "SH: a module + laws + rhythms + templates package installs rc0"
a_file "$SB/.contexture/extensions/modules/shapedocs/module" "SH: the docs-shape module lands"
a_file "$SB/.contexture/extensions/rhythms/shapedocs.md" "SH: the docs-shape rhythm lands"
a_file "$SB/.contexture/extensions/templates/shapedocs.md" "SH: the docs-shape template lands"
S3=$SB/catalog/shape-driver
new_pkg "$S3"
mkdir -p "$S3/.contexture/extensions/storage/drivers/shapedrv"
printf '#!/bin/sh\nexit 0\n' > "$S3/.contexture/extensions/storage/drivers/shapedrv/driver"
chmod +x "$S3/.contexture/extensions/storage/drivers/shapedrv/driver"
install_pkg "$S3"
a_rc "$RC" 0 "SH: a driver package installs rc0"
a_contains "$STATE/shape-driver.files" "kind driver" "SH: the driver package records its kind"
a_contains "$STATE/shape-driver.files" "driver shapedrv" "SH: the driver package records its driver name"
a_exec "$SB/.contexture/extensions/storage/drivers/shapedrv/driver" "SH: the driver part lands executable"
SHGOT=$(cd "$SB" && CTX_STORAGE_DRIVER=shapedrv ./.contexture/storage/scripts/driver-resolver resolve 2>&1)
a_eq "$SHGOT" "$SB/.contexture/extensions/storage/drivers/shapedrv/driver" "SH: storage.driver maps the driver name to the package driver"
a_not "$(./.contexture/ctx help --all 2>/dev/null)" "shapedrv" "SH: the engine does not list the driver as a module"
S4=$SB/catalog/shape-filters
new_pkg "$S4"
mkdir -p "$S4/.contexture/extensions/modules/shapefilters/filters"
printf '#!/usr/bin/awk -f\n# command: ^shapefilters$\n# format-only: shape\n{ print "SHAPED" }\n' > "$S4/.contexture/extensions/modules/shapefilters/filters/shape.awk"
chmod +x "$S4/.contexture/extensions/modules/shapefilters/filters/shape.awk"
install_pkg "$S4"
a_rc "$RC" 0 "SH: a filters-only package installs rc0"
a_file "$SB/.contexture/extensions/modules/shapefilters/filters/shape.awk" "SH: the filter part lands"
a_eq "SHAPED" "$(printf 'shapefilters fixture\n' | ./.contexture/ctx run --filter=shape 2>/dev/null)" "SH: the installed filter resolves from the extension root"
a_not "$(./.contexture/ctx help 2>/dev/null)" "shapefilters" "SH: a filter-only folder stays unlisted (no module file)"
S5=$SB/catalog/shape-rhythms
new_pkg "$S5"
add_file "$S5" rhythms/shaped-ritual.md "a shaped-only rhythm"
install_pkg "$S5"
a_rc "$RC" 0 "SH: a rhythms-only package installs rc0"
a_file "$SB/.contexture/extensions/rhythms/shaped-ritual.md" "SH: the rhythm part lands"
S6=$SB/catalog/shape-laws
new_pkg "$S6"
mkdir -p "$S6/.contexture/extensions/laws"
printf '@append @laws\n  shaped-law: a shaped-only law\n' > "$S6/.contexture/extensions/laws/shaped.law"
install_pkg "$S6"
a_rc "$RC" 0 "SH: a laws-only package installs rc0"
a_file "$SB/.contexture/extensions/laws/shaped.law" "SH: the law part lands"
a_contains "$STATE/shape-laws.files" "law .contexture/extensions/laws/shaped.law" "SH: the laws-only package records its law fragment"

echo "== RI the rhythm index and the law record =="
RI=$SB/catalog/pkgri
new_pkg "$RI"
add_module "$RI" rifixture
add_file "$RI" rhythms/fixture-ritual.md '@rhythm fixture-ritual
  use when: a fixture needs the rhythm index
  activation: propose'
install_pkg "$RI"
a_rc "$RC" 0 "RI: a package carrying a ritual rhythm installs rc0"
IDX=$(./.contexture/ctx session index 2>/dev/null)
a_eq "$IDX" "fixture-ritual (.contexture/extensions/rhythms/fixture-ritual.md) | use when: a fixture needs the rhythm index | activation: propose" "RI: the rhythm index reads the extension root"
a_contains "$STATE/pkgri.files" "law .contexture/extensions/modules/rifixture/laws" "RI: the record carries the module law fragment"
LAWFILE=$(sed -n 's/^law //p' "$STATE/pkgri.files" | head -n 1)
a_file "$SB/$LAWFILE" "RI: the recorded law fragment path exists"
a_contains "$SB/$LAWFILE" "rifixture-law" "RI: the recorded law fragment carries its clause"
mkdir -p .contexture/rhythms
printf '@rhythm workspace-ritual\n  use when: the workspace half is proven\n' > .contexture/rhythms/workspace-ritual.md
IDX=$(./.contexture/ctx session index 2>/dev/null)
a_eq "$(printf '%s\n' "$IDX" | head -n 1)" "workspace-ritual (.contexture/rhythms/workspace-ritual.md) | use when: the workspace half is proven | activation: propose" "RI: the workspace rhythm lists before the extension rhythm"
a_eq "$(printf '%s\n' "$IDX" | tail -n 1)" "fixture-ritual (.contexture/extensions/rhythms/fixture-ritual.md) | use when: a fixture needs the rhythm index | activation: propose" "RI: the extension rhythm lists after the workspace rhythm"
rm -rf .contexture/rhythms
uninstall_pkg "$RI"
a_rc "$RC" 0 "RI: the rhythm package uninstalls rc0"
IDX=$(./.contexture/ctx session index 2>/dev/null)
a_not "$IDX" "fixture-ritual" "RI: the uninstalled extension rhythm leaves the index"

echo "== MF the manifest refusals at install =="
NM=$SB/catalog/pkg-nomanifest
new_pkg "$NM"
add_module "$NM" nomf
install_pkg_raw "$NM"
a_rc "$RC" 1 "MF: a package without a manifest refuses rc1"
a_match "$ERR" "no package manifest" "MF: the refusal names the missing manifest"
BMF=$SB/catalog/pkg-badmanifest
new_pkg "$BMF"
add_module "$BMF" badmf
printf '# summary: x\n# version: 1.0.0\n# kind: feature\n# part: module modules/badmf\n# requires: base>=1\n' > "$BMF/manifest"
install_pkg_raw "$BMF"
a_rc "$RC" 1 "MF: a manifest with requires refuses rc1"
a_match "$ERR" "requires is reserved and refused" "MF: the manifest refusal names the requires rule"
UC=$SB/catalog/pkg-uncovered
new_pkg "$UC"
add_module "$UC" covered
manifest_pkg "$UC"
mkdir -p "$UC/.contexture/extensions/extra"
printf 'x\n' > "$UC/.contexture/extensions/extra/x"
install_pkg_raw "$UC"
a_rc "$RC" 1 "MF: a payload path outside the declared parts refuses rc1"
a_match "$ERR" "payload path outside the declared parts" "MF: the refusal names the uncovered path"
MP=$SB/catalog/pkg-missingpart
new_pkg "$MP"
add_module "$MP" missingpart
{
  printf '# summary: missing part fixture\n'
  printf '# version: 1.0.0\n'
  printf '# kind: feature\n'
  printf '# part: module modules/missingpart\n'
  printf '# part: rhythms rhythms\n'
} > "$MP/manifest"
install_pkg_raw "$MP"
a_rc "$RC" 1 "MF: a declared part that is absent refuses rc1"
a_match "$ERR" "declared part is missing: rhythms rhythms" "MF: the refusal names the missing part"
ND=$SB/catalog/pkg-nomoduledecl
new_pkg "$ND"
add_module "$ND" undeclared
{
  printf '# summary: undeclared module fixture\n'
  printf '# version: 1.0.0\n'
  printf '# kind: feature\n'
  printf '# part: filters modules/undeclared\n'
} > "$ND/manifest"
install_pkg_raw "$ND"
a_rc "$RC" 1 "MF: a module folder not declared as a module part refuses rc1"
a_match "$ERR" "is not declared as a module part" "MF: the refusal names the undeclared module"
FD=$SB/catalog/pkg-featuredriver
new_pkg "$FD"
mkdir -p "$FD/.contexture/extensions/storage/drivers/hidden"
printf '#!/bin/sh\nexit 0\n' > "$FD/.contexture/extensions/storage/drivers/hidden/driver"
chmod +x "$FD/.contexture/extensions/storage/drivers/hidden/driver"
{
  printf '# summary: feature with a driver path\n'
  printf '# version: 1.0.0\n'
  printf '# kind: feature\n'
  printf '# part: laws storage/drivers/hidden/driver\n'
} > "$FD/manifest"
install_pkg_raw "$FD"
a_rc "$RC" 1 "MF: a feature package carrying a driver path refuses rc1"
a_match "$ERR" "a feature package carries no driver part" "MF: the refusal names the feature/driver mismatch"

echo "== UP the re-install and upgrade =="
{
  printf '# summary: the alpha fixture module, updated\n'
  printf '# version: 9.9.9\n'
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
FIXTURE_VERSION=1.1.0
install_pkg "$PA"
a_rc "$RC" 0 "UP: re-install over the recorded files rc0"
a_match "$(./.contexture/ctx help 2>/dev/null)" "the alpha fixture module, updated" "UP: the updated summary lists"
OUTV=$(./.contexture/ctx alpha bye 2>/dev/null)
a_eq "$OUTV" "bye from alpha" "UP: the new verb dispatches"
a_no_file "$SB/.contexture/extensions/rhythms/alpha.md" "UP: a stale unchanged file is removed"
a_file "$SB/.contexture/extensions/rhythms/beta.md" "UP: the new file lands"
a_contains "$STATE/pkga.files" "version 1.1.0" "UP: the record carries the package manifest's version, not the module file's"
a_contains "$STATE/pkga.files" "kind feature" "UP: the record carries the package kind"
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
# a re-install that drops a whole module prunes its emptied folders, so a later
# re-add is an update, not a collision on an empty directory
add_module "$PA" gamma
manifest_pkg "$PA"
install_pkg "$PA"
a_rc "$RC" 0 "UP: a module added in an upgrade rc0"
rm -rf "$PA/.contexture/extensions/modules/gamma"
manifest_pkg "$PA"
install_pkg "$PA"
a_rc "$RC" 0 "UP: an upgrade dropping a whole module rc0"
a_no_file "$SB/.contexture/extensions/modules/gamma" "UP: the dropped module's emptied folders are pruned"
add_module "$PA" gamma
manifest_pkg "$PA"
install_pkg "$PA"
a_rc "$RC" 0 "UP: a later re-add of the dropped module rc0"
a_eq "$(./.contexture/ctx gamma hello 2>/dev/null)" "hello from gamma" "UP: the re-added module dispatches"
FIXTURE_VERSION=1.0.0

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
# the record names the overlay; a forged line outside the extension root or into the
# record area must be preserved and reported, never acted on (the core is never touched)
printf 'keep me\n' > "$SB/victim"
victim_mode=$(ls -ld "$SB/victim" | awk '{print $1}' | cut -c2-10)
victim_cksum=$(cksum < "$SB/victim" | awk '{print $1 ":" $2}')
printf 'package other\n' > "$STATE/other.files"
other_mode=$(ls -ld "$STATE/other.files" | awk '{print $1}' | cut -c2-10)
other_cksum=$(cksum < "$STATE/other.files" | awk '{print $1 ":" $2}')
printf 'file %s %s victim\n' "$victim_mode" "$victim_cksum" >> "$STATE/pkgu.files"
printf 'file %s %s .contexture/extensions/.state/other.files\n' "$other_mode" "$other_cksum" >> "$STATE/pkgu.files"
printf 'keep me too\n' > "$SB/.contexture/victim2"
victim2_mode=$(ls -ld "$SB/.contexture/victim2" | awk '{print $1}' | cut -c2-10)
victim2_cksum=$(cksum < "$SB/.contexture/victim2" | awk '{print $1 ":" $2}')
printf 'file %s %s .contexture/extensions/../victim2\n' "$victim2_mode" "$victim2_cksum" >> "$STATE/pkgu.files"
uninstall_pkg "$PU"
a_rc "$RC" 0 "UN: uninstall rc0"
a_match "$OUT" "preserved victim (outside the extension root" "UN: a forged record line outside the extension root is reported"
a_file "$SB/victim" "UN: a path outside the extension root is never removed"
a_match "$OUT" "preserved .contexture/extensions/.state/other.files (the install record area" "UN: a forged record line into the record area is reported"
a_file "$STATE/other.files" "UN: another package's record is never removed"
a_match "$OUT" "preserved .contexture/extensions/../victim2 (a path with an empty or dot segment" "UN: a forged record line with a dot segment is reported"
a_file "$SB/.contexture/victim2" "UN: a dot-segment record path never escapes the extension root"
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
a_contains "$STATE/pkgdrv.files" "kind driver" "DR: the record carries the driver kind"
a_contains "$STATE/pkgdrv.files" "driver fakedrv" "DR: the record carries the driver name"
a_not "$(./.contexture/ctx help --all 2>/dev/null)" "fakedrv" "DR: the engine does not list the driver as a module"
uninstall_pkg "$PD2"
a_rc "$RC" 0 "DR: the driver package uninstall rc0"
( cd "$SB" && CTX_ROOT="$SB" sh "$ROOT/plugins/docs-discipline/install" ) > "$SB/.out" 2> "$SB/.err"
RC=$?
ERR=$(cat "$SB/.err")
a_rc "$RC" 0 "DR: the real docs-discipline wrapper installs the extension-root package shape rc0"
a_file "$SB/.contexture/extensions/modules/docs/module" "DR: the real docs module lands under the extension root"
a_file "$SB/.contexture/extensions/templates/doc.md" "DR: the real grammar template lands under the extension root"
a_file "$SB/.contexture/extensions/rhythms/work.md" "DR: the real docs rhythm lands under the extension root"
a_file "$SB/docs/workspace/conventions.md" "DR: the install hook seeds the corpus through ctx docs write"
SD=$(cd "$SB" && ./.contexture/storage/scripts/store-data docs 2>/dev/null)
a_eq "$(printf '%s\n' "$SD" | sed -n '1,5p')" "docs
docs
.md
<repo>/<slug>
true" "DR: the store-data owner scan reads the installed docs data file under the extension root"
a_eq "$(printf '%s\n' "$SD" | sed -n '6p')" "$SB/.contexture/extensions/modules/docs/data" "DR: the docs declaration's owner is the extension-root data file"
DOCQ=$(cd "$SB" && ./.contexture/ctx docs query workspace conventions 2>/dev/null)
a_match "$DOCQ" "conventions: conventions" "DR: the installed docs module reads its corpus through the store"
( cd "$SB" && CTX_ROOT="$SB" sh "$ROOT/plugins/docs-discipline/uninstall" ) > "$SB/.out" 2> "$SB/.err"
RC=$?
a_rc "$RC" 0 "DR: the real docs-discipline wrapper uninstalls rc0"
a_no_file "$SB/.contexture/extensions/modules/docs/module" "DR: the real docs module is removed after uninstall"

echo "== RM the real package manifests =="
for p in docs-discipline ast-doc-graph storage-fts5 toolchain-filters starter-rhythms; do
  mf="$ROOT/plugins/$p/manifest"
  a_file "$mf" "RM: $p carries its package manifest"
  ./.contexture/ctx _package "$mf" validate >/dev/null 2>&1
  a_rc "$?" 0 "RM: $p's manifest validates"
done
a_eq "$(./.contexture/ctx _package "$ROOT/plugins/docs-discipline/manifest" kind)" "feature" "RM: docs-discipline is a feature package"
a_eq "$(./.contexture/ctx _package "$ROOT/plugins/ast-doc-graph/manifest" kind)" "feature" "RM: ast-doc-graph is a feature package"
a_eq "$(./.contexture/ctx _package "$ROOT/plugins/toolchain-filters/manifest" parts)" "filters modules/toolchain-filters/filters" "RM: toolchain-filters is a filters-only package"
a_eq "$(./.contexture/ctx _package "$ROOT/plugins/starter-rhythms/manifest" parts)" "rhythms rhythms" "RM: starter-rhythms is a rhythms-only package"
a_eq "$(./.contexture/ctx _package "$ROOT/plugins/storage-fts5/manifest" kind)" "driver" "RM: storage-fts5 is a driver package"
a_eq "$(./.contexture/ctx _package "$ROOT/plugins/storage-fts5/manifest" driver)" "fts5" "RM: storage-fts5 maps to the driver name fts5"
a_eq "$(./.contexture/ctx _package "$ROOT/plugins/storage-fts5/manifest" parts)" "driver storage/drivers/fts5" "RM: storage-fts5 declares its driver part"
a_no_file "$ROOT/plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5/module" "RM: the fts5 module file is retired"
a_exec "$ROOT/plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5/driver" "RM: the fts5 driver lands at the extension-relative driver path"
CAP=$(sh "$ROOT/plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5/driver" capability)
a_match "$CAP" '"driver":"fts5"' "RM: the driver descriptor names fts5"
a_match "$CAP" '"version":"3.0.0"' "RM: the driver descriptor version is 3.0.0"
a_match "$CAP" '"contract":"2"' "RM: the storage contract is 2"
a_no_file "$ROOT/plugins/lane-isolation" "RM: the lane-isolation package folder retires into the lane laws"
a_match "$(cat "$ROOT/base/.contexture/extensions/modules/lane/laws")" "branch/worktree" "RM: the lane module laws carry the lane-isolation clauses"

echo "== RC the real catalog's resolver precedence =="
( cd "$SB" && CTX_ROOT="$SB" sh "$ROOT/plugins/storage-fts5/install" ) > "$SB/.out" 2> "$SB/.err"
RC=$?
a_rc "$RC" 0 "RC: the real storage-fts5 package installs rc0"
a_exec "$SB/.contexture/extensions/storage/drivers/fts5/driver" "RC: the real fts5 driver lands in the extension root"
mkdir -p "$SB/.contexture/modules/storage-fts5/drivers"
printf '#!/bin/sh\nexit 0\n' > "$SB/.contexture/modules/storage-fts5/drivers/fts5"
chmod +x "$SB/.contexture/modules/storage-fts5/drivers/fts5"
FTS5_GOT=$(cd "$SB" && CTX_STORAGE_DRIVER=fts5 ./.contexture/storage/scripts/driver-resolver resolve 2>&1)
a_eq "$FTS5_GOT" "$SB/.contexture/extensions/storage/drivers/fts5/driver" "RC: storage.driver: fts5 resolves from the extension root, not the transitional module tier"
rm -rf "$SB/.contexture/modules/storage-fts5"
a_not "$(./.contexture/ctx help --all 2>/dev/null)" "storage-fts5" "RC: the module listing carries no fts5 driver"
( cd "$SB" && CTX_ROOT="$SB" sh "$ROOT/plugins/storage-fts5/uninstall" ) > "$SB/.out" 2> "$SB/.err"
RC=$?
a_rc "$RC" 0 "RC: the real storage-fts5 package uninstalls rc0"
a_no_file "$SB/.contexture/extensions/storage/drivers/fts5/driver" "RC: the real fts5 driver is removed after uninstall"
for p in ast-doc-graph toolchain-filters starter-rhythms; do
  ( cd "$SB" && CTX_ROOT="$SB" sh "$ROOT/plugins/$p/install" ) > "$SB/.out" 2> "$SB/.err"
  RC=$?
  a_rc "$RC" 0 "RC: the real $p package installs rc0"
  ( cd "$SB" && CTX_ROOT="$SB" sh "$ROOT/plugins/$p/uninstall" ) > "$SB/.out" 2> "$SB/.err"
  RC=$?
  a_rc "$RC" 0 "RC: the real $p package uninstalls rc0"
done
a_no_file "$SB/.contexture/extensions/modules/ast-doc-graph/module" "RC: the real ast-doc-graph module is removed after uninstall"
a_no_file "$SB/.contexture/extensions/modules/toolchain-filters/filters" "RC: the real toolchain filters are removed after uninstall"
a_no_file "$SB/.contexture/extensions/rhythms/work.md" "RC: the real starter rhythms are removed after uninstall"

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

echo "== WX the worked example package =="
WX="$ROOT/tests/fixtures/worked-package"
a_file "$WX/manifest" "WX: the worked example carries its package manifest"
a_file "$WX/tests/run.sh" "WX: the worked example carries its test"
( sh "$WX/tests/run.sh" ) > "$SB/.wx.out" 2> "$SB/.wx.err"
WXRC=$?
if [ "$WXRC" -ne 0 ]; then
  cat "$SB/.wx.out" >&2
  cat "$SB/.wx.err" >&2
fi
a_rc "$WXRC" 0 "WX: the worked example's own test passes"
a_match "$(cat "$SB/.wx.out")" "worked-package: pass=[0-9][0-9]* fail=0" "WX: the test reports its clean summary"

printf '\n== summary ==\n'
printf 'module-tests: pass=%d fail=%d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
