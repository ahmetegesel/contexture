#!/bin/sh
# law-tests.sh: the law merger's suite. It proves the core law source, the compose, the
# block-keyword merge, the @module preambles, the append-only fragments, the checks, the
# synthetic fixture, and the base-only golden (unit plus lane, no docs). The loader,
# boot, docs laws, and the gate wiring belong to the law-tests stage; this suite proves
# the merger alone.
#
# Usage: tests/law-tests.sh [--keep]
# Exit 0 when every case passes; 1 otherwise; 2 a staging failure.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
FIX="$ROOT/tests/fixtures/law-compose"
CORE_SRC="$ROOT/base/.contexture/laws/core.md"
COMPOSE_SRC="$ROOT/base/.contexture/laws/compose"
CTX_SRC="$ROOT/base/.contexture/ctx"
GOLDEN="$FIX/base-only.golden"

KEEP=0
for a in "$@"; do
  case "$a" in
    --keep) KEEP=1 ;;
    *) echo "law-tests.sh: unknown argument: $a" >&2; exit 1 ;;
  esac
done

for f in "$CORE_SRC" "$COMPOSE_SRC" "$CTX_SRC" "$GOLDEN" "$FIX/synthetic/core.md" "$FIX/synthetic/modules/alpha/laws"; do
  [ -e "$f" ] || { echo "law-tests.sh: missing $f" >&2; exit 2; }
done

export LC_ALL=C
unset CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH CTX_STORAGE_SERVICE_URL CTX_STORAGE_SERVICE_KEY

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SB=$(mktemp -d "$tmp_root/law-tests.XXXXXX") || { echo "law-tests.sh: cannot create the sandbox" >&2; exit 2; }
cleanup() {
  if [ "$KEEP" -eq 1 ]; then
    printf 'law-tests: sandbox preserved at %s\n' "$SB"
  else
    rm -rf "$SB"
  fi
}
trap cleanup EXIT INT TERM

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }
a_contains() { if printf '%s\n' "$1" | grep -qF "$2"; then ok "$3"; else bad "$3 (no fixed match: $2)"; fi; }
a_not() { if printf '%s\n' "$1" | grep -q "$2"; then bad "$3 (unwanted: $2)"; else ok "$3"; fi; }
a_rc() { if [ "$1" -eq "$2" ]; then ok "$3"; else bad "$3 (rc $1 want $2)"; fi; }
a_file() { if [ -f "$1" ]; then ok "$2"; else bad "$2 (no file: $1)"; fi; }
a_no_file() { if [ -f "$1" ]; then bad "$2 (file exists: $1)"; else ok "$2"; fi; }
a_lt() { if [ "$1" -lt "$2" ]; then ok "$3"; else bad "$3 ($1 not < $2)"; fi; }

line_of() { awk -v pat="$2" '$0 ~ pat { print NR; exit }' "$1"; }
block_clauses() { # <file> <block>
  awk -v b="$2" '
    $0 == "@" b { on = 1; next }
    /^@/ { on = 0; next }
    on && /^  / { line = $0; sub(/^  /, "", line); sub(/:.*/, "", line); print line }
  ' "$1" | tr '\n' ' '
}
module_block() { # <file> <name>
  awk -v n="$2" '
    $0 == "@module " n { on = 1 }
    on { print }
    on && /^  help: / { exit }
  ' "$1"
}

stage_ctx() { # <sandbox>
  mkdir -p "$1/.contexture/laws" "$1/.contexture/tmp" || return 2
  cp "$CTX_SRC" "$1/.contexture/ctx" || return 2
  cp "$COMPOSE_SRC" "$1/.contexture/laws/compose" || return 2
  chmod +x "$1/.contexture/ctx" "$1/.contexture/laws/compose" || return 2
}

stage_base() {
  rm -rf "$SB/base"
  mkdir -p "$SB/base" || return 2
  cp -R "$ROOT/base/." "$SB/base/" || return 2
  mkdir -p "$SB/base/.contexture/tmp" || return 2
  chmod +x "$SB/base/.contexture/ctx" "$SB/base/.contexture/laws/compose" 2>/dev/null || true
  chmod +x "$SB/base/.contexture/modules/"*/scripts/* "$SB/base/.contexture/extensions/modules/"*/scripts/* 2>/dev/null || true
}

stage_synth() { # [overlay file name]
  rm -rf "$SB/synth"
  mkdir -p "$SB/synth" || return 2
  stage_ctx "$SB/synth" || return 2
  cp "$FIX/synthetic/core.md" "$SB/synth/.contexture/laws/core.md" || return 2
  cp -R "$FIX/synthetic/modules" "$SB/synth/.contexture/modules" || return 2
  cp -R "$FIX/synthetic/extensions" "$SB/synth/.contexture/extensions" || return 2
  if [ $# -ge 1 ] && [ -n "$1" ]; then
    cp "$FIX/synthetic/$1" "$SB/synth/AGENTS.workspace.md" || return 2
  fi
}

run_compose() { # <sandbox> [args...]
  _rc_sb=$1
  shift
  ( cd "$_rc_sb" && sh .contexture/laws/compose "$@" ) > "$SB/compose.out" 2> "$SB/compose.err"
  RC=$?
}

echo "== L1: the core source and the compose =="
a_file "$CORE_SRC" "core: the core law source is tracked"
a_file "$COMPOSE_SRC" "compose: the composer is tracked"
[ -x "$COMPOSE_SRC" ] && ok "compose: the composer is executable" || bad "compose: the composer is not executable"
sh -n "$COMPOSE_SRC" 2>/dev/null; a_rc "$?" "0" "compose: sh -n is silent rc0"
core_blocks=$(awk '/^@[A-Za-z0-9._-]+$/ { sub(/^@/, ""); print }' "$CORE_SRC" | tr '\n' ' ')
a_eq "$core_blocks" "laws layout record journal backlog query boot interact rhythms subagents refresh close handoff git update " "core: the 15-block skeleton is in the current order"
a_match "$(sed -n '1p' "$CORE_SRC")" '^# contexture v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*:' "core: the first line carries the version"
a_match "$(sed -n '1,25p' "$CORE_SRC")" '^  \.contexture/storage/: the storage core' "core: the storage layout line lives in the core source"
a_eq "$(awk '/^@record$/ { on = 1; next } /^@/ { on = 0 } on && /^  / { print }' "$CORE_SRC")" "" "core: the record skeleton carries no body (the unit laws own it)"

stage_synth
ctx_sb=$SB/synth/.contexture/ctx
out=$(cd "$SB/synth" && ./.contexture/ctx _module .contexture/modules/alpha/module summary 2>&1); a_eq "$out" "alpha the first fixture module" "reader: the summary"
out=$(cd "$SB/synth" && ./.contexture/ctx _module .contexture/modules/alpha/module version 2>&1); a_eq "$out" "1.2.3" "reader: the version"
out=$(cd "$SB/synth" && ./.contexture/ctx _module .contexture/modules/alpha/module description 2>&1)
a_contains "$out" "Alpha's preamble: what it is." "reader: the description block"
out=$(cd "$SB/synth" && ./.contexture/ctx _module .contexture/modules/beta/module description 2>&1); a_rc "$?" "0" "reader: a summary-only module's description answers rc0"
a_eq "$out" "" "reader: a summary-only module has an empty description"
printf '# requires: x\n' >> "$SB/synth/.contexture/modules/beta/module"
err=$(cd "$SB/synth" && ./.contexture/ctx _module .contexture/modules/beta/module validate 2>&1 >/dev/null); rc=$?
a_rc "$rc" "1" "reader: a requires line refuses rc1"
a_match "$err" "requires is reserved" "reader: the requires refusal names the rule"

echo "== L2: the base-only golden (unit plus lane) =="
stage_base
run_compose "$SB/base"
a_rc "$RC" "0" "base-only: the compose rc0"
GB="$SB/base/.contexture/laws/AGENTS.generated.md"
a_file "$GB" "base-only: the generated layer is written"
if cmp -s "$GB" "$GOLDEN"; then ok "base-only: the generated layer matches the golden"; else bad "base-only: the generated layer differs from the golden"; fi
hdr=$(sed -n '1p' "$GB")
printf '%s\n' "$hdr" | grep -Eq '^# contexture v0\.61\.1: generated law layer; core cksum [0-9]+-[0-9]+; sources [0-9]+-[0-9]+; never edit$'
a_rc "$?" "0" "base-only: the header carries the core version and both checksums"
a_not "$(cat "$GB")" "docs-first" "base-only: no docs law is composed"
a_eq "$(grep -c '^@module ' "$GB")" "2" "base-only: exactly the unit and lane preambles"
a_match "$(cat "$GB")" "^@module unit$" "base-only: the unit preamble"
a_match "$(cat "$GB")" "^  help: ctx unit help$" "base-only: the unit help pointer"
a_match "$(cat "$GB")" "^@module lane$" "base-only: the lane preamble"
a_match "$(module_block "$GB" lane)" "The lane module is the subagent dispatch surface" "base-only: the lane description"
a_match "$(cat "$GB")" "^  unit of work = session unit" "base-only: the unit record clause"
a_match "$(cat "$GB")" "^  branch/worktree: the recipe names" "base-only: the lane subagent clause"
a_match "$(cat "$GB")" "^  branch/worktree on demand" "base-only: the lane git clause"
a_not "$(grep '^@' "$GB")" "^@custom$" "base-only: no custom section without a module keyword"
lay=$(line_of "$GB" '^@layout$'); mod=$(line_of "$GB" '^@module unit$'); rec=$(line_of "$GB" '^@record$')
a_lt "$lay" "$mod" "base-only: the preambles sit after @layout"
a_lt "$mod" "$rec" "base-only: the preambles sit before @record"
cp "$GB" "$SB/base-g1"
rm -f "$GB"
run_compose "$SB/base"
a_rc "$RC" "0" "determinism: a second fresh composition rc0"
if cmp -s "$GB" "$SB/base-g1"; then ok "determinism: two fresh compositions are byte-identical"; else bad "determinism: two fresh compositions differ"; fi
run_compose "$SB/base" --check
a_rc "$RC" "0" "check: a current generated layer verifies rc0"

stage_base
run_compose "$SB/base"
cp "$SB/base/.contexture/laws/AGENTS.generated.md" "$SB/base-before"
printf '\n@append @record\n  unit-extra: a later unit clause\n' >> "$SB/base/.contexture/modules/unit/laws"
run_compose "$SB/base" --check
a_rc "$RC" "1" "stale: a changed law makes --check refuse rc1"
if cmp -s "$SB/base/.contexture/laws/AGENTS.generated.md" "$SB/base-before"; then ok "stale: --check writes nothing"; else bad "stale: --check rewrote the generated layer"; fi
run_compose "$SB/base"
a_rc "$RC" "0" "stale: the compose recomposes rc0"
a_match "$(cat "$SB/base/.contexture/laws/AGENTS.generated.md")" "^  unit-extra: a later unit clause$" "stale: the recomposed layer carries the new clause"
if cmp -s "$SB/base/.contexture/laws/AGENTS.generated.md" "$SB/base-before"; then bad "stale: the recomposed layer did not change"; else ok "stale: the recomposed layer changed"; fi

echo "== L3: the synthetic merge =="
stage_synth
run_compose "$SB/synth"
a_rc "$RC" "0" "synthetic: the compose rc0"
GS="$SB/synth/.contexture/laws/AGENTS.generated.md"
hdr=$(sed -n '1p' "$GS")
printf '%s\n' "$hdr" | grep -Eq '^# contexture v9\.9\.9: generated law layer; core cksum [0-9]+-[0-9]+; sources [0-9]+-[0-9]+; never edit$'
a_rc "$?" "0" "synthetic: the header carries the fixture version and both checksums"
a_eq "$(block_clauses "$GS" laws)" "core-law shared-law alpha-law alpha-extra-law beta-extra-law " "merge: the laws append in core, module, then standalone order"
a_eq "$(block_clauses "$GS" record)" "beta-record " "merge: a module clause appends under an existing block"
a_eq "$(block_clauses "$GS" journal)" "delta-journal " "merge: an extension module clause appends under an existing block"
a_eq "$(block_clauses "$GS" custom)" "alpha-custom beta-custom delta-custom " "merge: a new keyword creates one custom section in first-occurrence order"
a_eq "$(block_clauses "$GS" notes)" "beta-notes " "merge: a second custom keyword follows the first"
a_eq "$(grep -c '^@module ' "$GS")" "4" "preambles: every fixture module has one preamble"
a_eq "$(grep -c '^@module alpha$' "$GS")" "1" "each module once: alpha's preamble appears once"
a_eq "$(grep -c 'alpha-law: alpha contributes a law' "$GS")" "1" "each module once: alpha's law appears once despite the state record"
a_eq "$(grep -c '^@module alpha-extra$' "$GS")" "0" "standalone: a standalone law part has no module preamble"
a_eq "$(grep -c 'alpha-extra-law: a standalone law part' "$GS")" "1" "standalone: the standalone law part merges once"
a_match "$(module_block "$GS" beta)" "^  summary: beta the summary-only fixture module$" "preambles: a summary-only module carries its summary"
a_not "$(module_block "$GS" beta)" "preamble" "preambles: a summary-only module has no description line"
a_match "$(module_block "$GS" beta)" "^  help: ctx beta help$" "preambles: a summary-only module carries its help pointer"
a_match "$(module_block "$GS" gamma)" "^  Gamma has no laws, only a preamble.$" "preambles: a module with no laws still carries its description"
a_not "$(cat "$GS")" "gamma-law" "merge: a module with no laws contributes no clause"
a_match "$(module_block "$GS" alpha)" "^  Alpha's preamble: what it is.$" "preambles: the description lines are indented under the module"
lay=$(line_of "$GS" '^@layout$'); mod=$(line_of "$GS" '^@module alpha$'); rec=$(line_of "$GS" '^@record$')
a_lt "$lay" "$mod" "preambles: the first preamble sits after @layout"
a_lt "$mod" "$rec" "preambles: the preambles sit before @record"
moda=$(line_of "$GS" '^@module alpha$'); modb=$(line_of "$GS" '^@module beta$'); modg=$(line_of "$GS" '^@module gamma$'); modd=$(line_of "$GS" '^@module delta$')
a_lt "$moda" "$modb" "preambles: the workspace modules keep byte order (alpha before beta)"
a_lt "$modb" "$modg" "preambles: the workspace modules keep byte order (beta before gamma)"
a_lt "$modg" "$modd" "preambles: the extension modules follow the workspace modules"
upd=$(line_of "$GS" '^@update$'); cus=$(line_of "$GS" '^@custom$'); not=$(line_of "$GS" '^@notes$')
a_lt "$upd" "$cus" "custom: the first custom section follows the last core block"
a_lt "$cus" "$not" "custom: the custom sections keep first-occurrence order"

stage_synth overlay-clean.md
run_compose "$SB/synth"
a_rc "$RC" "0" "overlay: a unique workspace law passes the slug check"
a_not "$(cat "$SB/synth/.contexture/laws/AGENTS.generated.md")" "workspace-law" "overlay: the overlay is not an input to the generated body"

stage_synth
run_compose "$SB/synth"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"
cp "$FIX/synthetic/overlay-duplicate.md" "$SB/synth/AGENTS.workspace.md"
run_compose "$SB/synth"
a_rc "$RC" "1" "slug: a duplicate across the generated and the workspace overlay refuses rc1"
a_contains "$(cat "$SB/compose.err")" "duplicate law slug 'alpha-law'" "slug: the refusal names the duplicate slug"
a_contains "$(cat "$SB/compose.err")" "AGENTS.workspace.md" "slug: the refusal names the overlay"
if cmp -s "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"; then ok "slug: the refusal writes nothing"; else bad "slug: the refusal rewrote the generated layer"; fi

stage_synth
run_compose "$SB/synth"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"
printf '@replace @laws\n  x-law: x\n' > "$SB/synth/.contexture/modules/beta/laws"
run_compose "$SB/synth"
a_rc "$RC" "1" "fragment: a @replace refuses rc1"
a_contains "$(cat "$SB/compose.err")" "@replace" "fragment: the refusal names @replace"
if cmp -s "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"; then ok "fragment: the refusal writes nothing"; else bad "fragment: the refusal rewrote the generated layer"; fi

stage_synth
run_compose "$SB/synth"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"
printf '# requires: x\n' >> "$SB/synth/.contexture/modules/beta/module"
run_compose "$SB/synth"
a_rc "$RC" "1" "requires: a module with a requires line refuses rc1"
a_contains "$(cat "$SB/compose.err")" "module 'beta'" "requires: the refusal names the module"
a_contains "$(cat "$SB/compose.err")" "requires is reserved" "requires: the refusal names the rule"
if cmp -s "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"; then ok "requires: the refusal writes nothing"; else bad "requires: the refusal rewrote the generated layer"; fi

stage_synth
run_compose "$SB/synth"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"
rm -f "$SB/synth/.contexture/extensions/laws/alpha-extra"
run_compose "$SB/synth"
a_rc "$RC" "2" "fragment: a recorded but missing standalone law refuses rc2"
a_contains "$(cat "$SB/compose.err")" "missing or unreadable standalone law fragment" "fragment: the refusal names the missing fragment"
if cmp -s "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"; then ok "fragment: the missing-fragment refusal writes nothing"; else bad "fragment: the missing-fragment refusal rewrote the generated layer"; fi

stage_synth
run_compose "$SB/synth"
chmod 000 "$SB/synth/.contexture/modules/beta/laws"
if [ -r "$SB/synth/.contexture/modules/beta/laws" ]; then
  ok "fragment: the unreadable case skipped (the file stayed readable)"
else
  run_compose "$SB/synth"
  a_rc "$RC" "2" "fragment: an unreadable module law refuses rc2"
  a_contains "$(cat "$SB/compose.err")" "unreadable laws fragment" "fragment: the refusal names the unreadable law"
fi
chmod 644 "$SB/synth/.contexture/modules/beta/laws"

stage_synth
run_compose "$SB/synth"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"
awk 'BEGIN { skip = 0 } /^@record$/ { skip = 1; next } skip && /^@/ { skip = 0 } !skip { print }' "$SB/synth/.contexture/laws/core.md" > "$SB/synth/core.edited"
mv "$SB/synth/core.edited" "$SB/synth/.contexture/laws/core.md"
run_compose "$SB/synth"
a_rc "$RC" "1" "core: an edited core refuses rc1"
a_contains "$(cat "$SB/compose.err")" "core law source" "core: the refusal names the core source"
a_contains "$(cat "$SB/compose.err")" "block skeleton" "core: the refusal names the skeleton"
if cmp -s "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"; then ok "core: the edited-core refusal writes nothing"; else bad "core: the edited-core refusal rewrote the generated layer"; fi

stage_synth
run_compose "$SB/synth"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"
rm -f "$SB/synth/.contexture/laws/core.md"
run_compose "$SB/synth"
a_rc "$RC" "2" "core: a missing core source refuses rc2"
a_contains "$(cat "$SB/compose.err")" "missing core law source" "core: the refusal names the missing core"
if cmp -s "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"; then ok "core: the missing-core refusal writes nothing"; else bad "core: the missing-core refusal rewrote the generated layer"; fi

stage_synth
run_compose "$SB/synth"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"
sed 's/^version 1\.0\.0$/version 1.0.1/' "$FIX/synthetic/extensions/.state/alpha.files" > "$SB/synth/.contexture/extensions/.state/alpha.files"
run_compose "$SB/synth" --check
a_rc "$RC" "1" "hash: a package version change makes --check refuse rc1"
run_compose "$SB/synth"
a_rc "$RC" "0" "hash: the compose recomposes after the package version change"
if cmp -s "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"; then bad "hash: the generated layer did not change with the package version"; else ok "hash: the generated layer changed with the package version"; fi
h1=$(sed -n '1p' "$SB/synth-before")
h2=$(sed -n '1p' "$SB/synth/.contexture/laws/AGENTS.generated.md")
[ "$h1" != "$h2" ] && ok "hash: the header sources hash changed" || bad "hash: the header did not change"

stage_synth
run_compose "$SB/synth"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-before"
printf '@append @record\n  clock-law: %s\n' "$(date +%s)" > "$SB/synth/.contexture/extensions/laws/clock-extra"
run_compose "$SB/synth"
a_rc "$RC" "0" "determinism: the clocked law composes rc0"
cp "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-clock1"
sleep 1
printf '@append @record\n  clock-law: %s\n' "$(date +%s)" > "$SB/synth/.contexture/extensions/laws/clock-extra"
run_compose "$SB/synth"
a_rc "$RC" "0" "determinism: the second clocked composition rc0"
if cmp -s "$SB/synth/.contexture/laws/AGENTS.generated.md" "$SB/synth-clock1"; then bad "determinism: a changing input still compared equal (the comparator is blind)"; else ok "determinism: a changing input reads DIFF (the comparator discriminates)"; fi

stage_synth
run_compose "$SB/synth" --bogus
a_rc "$RC" "1" "usage: an unknown argument refuses rc1"

echo "== summary =="
echo "law-tests: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
