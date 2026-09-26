#!/bin/sh
# governance-tests.sh: the governance suite over the tracked upstream tree.
# Owns three families of checks:
#   1. the main-surface forbid grep: no invocable raw tool path (session.sh,
#      compact.sh, session-*.awk, .contexture/scripts/) on any main surface
#      (base AGENTS, base ONBOARDING, base templates, the overlays, the top
#      README, the docs pages, the plugin READMEs, tests/README.md) or in any
#      ctx help output;
#   2. the payload path tables re-derived against git ls-files: the declaration
#      in docs/adoption.md and docs/the-engine.md is one string, and every
#      tracked path under base/ sits under a declared root, every declared root
#      carries a tracked path, and the payload modules are exactly session and
#      run;
#   3. presence: every shipped session verb, hook point, and filter has a case
#      in the committed suites (a new surface without one fails), and the ship
#      gate lines live on the three declared surfaces.
#
# Usage: tests/governance-tests.sh
# Exit 0 when every case passes; 1 otherwise. The payload-table family skips
# cleanly (with the need named) when git is unavailable.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG

if [ ! -f "$CTX_SRC" ]; then
  echo "governance-tests.sh: ctx not found at $CTX_SRC" >&2
  exit 1
fi

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SANDBOX=$(mktemp -d "$tmp_root/governance-tests.XXXXXX") || exit 1
cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

pass=0
fail=0
ok() { pass=$((pass + 1)); echo "PASS: $1"; }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }

FORBID='session\.sh|compact\.sh|session-[a-z]+\.awk|\.contexture/scripts/'

echo "== G1 main-surface forbid grep =="
SURFACES="base/AGENTS.md base/.contexture/ONBOARDING.md AGENTS.workspace.md README.md docs/the-engine.md docs/units-and-lanes.md docs/the-record.md docs/adoption.md docs/rhythms.md docs/overlays.md docs/modules.md docs/plugins.md plugins/starter-rhythms/README.md plugins/toolchain-filters/README.md plugins/toolchain-filters/tests/README.md plugins/lane-isolation/README.md plugins/docs-discipline/README.md plugins/ast-doc-graph/README.md tests/README.md"
for f in "$ROOT"/base/.contexture/templates/*.md; do
  [ -f "$f" ] || continue
  rel=${f#"$ROOT"/}
  SURFACES="$SURFACES $rel"
done
for rel in $SURFACES; do
  [ -f "$ROOT/$rel" ] || continue
  hits=$(grep -nE "$FORBID" "$ROOT/$rel" 2>/dev/null)
  if [ -z "$hits" ]; then
    ok "forbid clean: $rel"
  else
    bad "forbid hit in $rel: $hits"
  fi
done

# help outputs teach only ctx forms
mkdir -p "$SANDBOX/.contexture/modules"
cp "$CTX_SRC" "$SANDBOX/.contexture/ctx"
chmod +x "$SANDBOX/.contexture/ctx"
cp -R "$SESSION_MOD" "$SANDBOX/.contexture/modules/session"
chmod +x "$SANDBOX/.contexture/modules/session/scripts/"*
for form in help all session-help session-help-load; do
  case "$form" in
    help) out=$(cd "$SANDBOX" && ./.contexture/ctx help 2>&1);;
    all) out=$(cd "$SANDBOX" && ./.contexture/ctx help --all 2>&1);;
    session-help) out=$(cd "$SANDBOX" && ./.contexture/ctx session help 2>&1);;
    session-help-load) out=$(cd "$SANDBOX" && ./.contexture/ctx session help load 2>&1);;
  esac
  hits=$(printf '%s\n' "$out" | grep -nE "$FORBID")
  if [ -z "$hits" ]; then
    ok "forbid clean: ctx help form $form"
  else
    bad "forbid hit in help form $form: $hits"
  fi
done

echo "== G2 payload path tables vs git ls-files =="
decl_adoption=$(grep -oE 'base/\.contexture/\{[^}]*\}' "$ROOT/docs/adoption.md" | head -n 1)
decl_engine=$(grep -oE 'base/\.contexture/\{[^}]*\}' "$ROOT/docs/the-engine.md" | head -n 1)
a_eq "$decl_engine" "$decl_adoption" "payload declaration identical in adoption.md and the-engine.md"
a_eq "$decl_adoption" 'base/.contexture/{ctx,modules/session,modules/run,modules/lane,templates,ONBOARDING.md}' "payload declaration reads the shipped set"
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  prefix=${decl_adoption%%\{*}
  inner=${decl_adoption#*\{}
  inner=${inner%\}}
  roots=""
  old_ifs=$IFS
  IFS=,
  for r in $inner; do
    roots="$roots $prefix$r"
  done
  IFS=$old_ifs
  roots=${roots# }
  tracked=$(git -C "$ROOT" ls-files base/)
  if [ -n "$tracked" ]; then
    ok "payload: git ls-files base/ returns the tracked set"
  else
    bad "payload: git ls-files base/ is empty"
  fi
  stray=""
  for p in $tracked; do
    [ "$p" = "base/AGENTS.md" ] && continue
    keep=0
    for r in $roots; do
      case "$p" in
        "$r"|"$r"/*) keep=1 ;;
      esac
    done
    [ "$keep" -eq 1 ] || stray="$stray $p"
  done
  if [ -z "$stray" ]; then
    ok "payload: every tracked base/ path sits under a declared root"
  else
    bad "payload: tracked paths outside the declared roots:$stray"
  fi
  for r in $roots; do
    if printf '%s\n' "$tracked" | awk -v r="$r" 'index($0, r) == 1 { found = 1 } END { exit !found }'; then
      ok "payload root carries tracked files: $r"
    else
      bad "payload root empty or absent: $r"
    fi
  done
  mods=$(printf '%s\n' "$tracked" | awk -F/ '$1 == "base" && $2 == ".contexture" && $3 == "modules" && NF > 4 { print $4 }' | LC_ALL=C sort -u | tr '\n' ' ')
  a_eq "$mods" "lane run session " "payload modules are exactly lane, run, and session"
else
  echo "SKIP governance payload table: git unavailable (need: git in the upstream checkout)"
fi

echo "== G3 presence: verbs, hook points, filters =="
disk_verbs=$(for f in "$ROOT"/base/.contexture/modules/session/scripts/*; do
  [ -f "$f" ] || continue
  b=${f##*/}
  printf '%s\n' "$b" | grep -q '^\.' && continue
  grep -q '^# summary: ' "$f" || continue
  printf '%s\n' "$b"
done | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
suite_verbs=$(sed -n 's/^DECLARED="\(.*\)"$/\1/p' "$SCRIPT_DIR/session-tests.sh" | head -n 1)
a_eq "$suite_verbs" "$disk_verbs" "presence: every shipped session verb is declared in the session suite"
for v in $disk_verbs; do
  grep -q "$v" "$SCRIPT_DIR/session-tests.sh" || bad "presence: verb $v has no suite reference"
done
ok "presence: each verb name appears in the session suite"

disk_points=$( { grep -ho 'fire_hooks("[a-z-]*"' "$ROOT"/base/.contexture/modules/session/scripts/*; grep -ho '_hooks [a-z-]*' "$ROOT"/base/.contexture/modules/session/scripts/refresh; } | sed 's/fire_hooks("//; s/_hooks //; s/"//' | LC_ALL=C sort -u | tr '\n' ' ' | sed 's/ $//')
a_eq "$disk_points" "close load-post load-pre refresh stamp task-landing" "presence: the derived hook points are the shipped six"
for p in $disk_points; do
  grep -q "$p" "$SCRIPT_DIR/hook-tests.sh" || bad "presence: hook point $p has no case in the hook suite"
  grep -rq "# ctx-hook: $p" "$SCRIPT_DIR/fixtures/hooks/modules" || bad "presence: hook point $p has no fixture hook"
done
ok "presence: every hook point has a suite case and a fixture hook"

check_filter_pairs() {
  cf_dir=$1
  cf_fixtures=$2
  cf_label=$3
  cf_n=0
  for f in "$cf_dir"/*.awk; do
    [ -f "$f" ] || continue
    cf_n=$((cf_n + 1))
    cf_name=${f##*/}
    cf_name=${cf_name%.awk}
    if ls "$cf_fixtures/$cf_name-"*.in >/dev/null 2>&1 && ls "$cf_fixtures/$cf_name-"*.expected >/dev/null 2>&1; then
      ok "presence: filter $cf_name has a fixture pair ($cf_label)"
    else
      bad "presence: filter $cf_name has no fixture pair ($cf_label)"
    fi
  done
  if [ "$cf_n" -eq 0 ]; then
    bad "presence: no filters found in $cf_dir"
  fi
}
check_filter_pairs "$ROOT/base/.contexture/modules/run/filters" "$SCRIPT_DIR" "core"
check_filter_pairs "$ROOT/plugins/toolchain-filters/.contexture/modules/toolchain-filters/filters" "$ROOT/plugins/toolchain-filters/tests" "toolchain-filters"

for s in filter-tests.sh ctx-tests.sh session-tests.sh hook-tests.sh record-audit-tests.sh governance-tests.sh; do
  if [ -f "$SCRIPT_DIR/$s" ]; then ok "suite present: $s"; else bad "suite missing: $s"; fi
done

echo "== G4 ship-gate lines =="
if grep -q "ship gate" "$SCRIPT_DIR/README.md" && grep -q "tests/run.sh" "$SCRIPT_DIR/README.md"; then
  ok "gate: tests/README.md carries the run gate"
else
  bad "gate: tests/README.md lacks the run gate"
fi
if grep -q "ship gate" "$ROOT/docs/plugins.md" && grep -q "tests/run.sh" "$ROOT/docs/plugins.md"; then
  ok "gate: docs/plugins.md carries the plugin-suite gate"
else
  bad "gate: docs/plugins.md lacks the plugin-suite gate"
fi
if grep -q "the run green" "$ROOT/AGENTS.workspace.md"; then
  ok "gate: AGENTS.workspace.md ship breath names the run green"
else
  bad "gate: AGENTS.workspace.md ship breath lacks the run green"
fi
if grep -q "ship breath" "$ROOT/plugins/lane-isolation/README.md" 2>/dev/null; then
  bad "gate: lane-isolation carries a ship-breath clause that must stay consistent"
else
  ok "gate: lane-isolation carries no ship-breath clause (consistent)"
fi

echo "== summary =="
echo "governance-tests: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
