#!/bin/sh
# fast.sh: the fast inner loop, the smallest set that proves the kind of change at hand.
# It runs the unit-like suites or one area selector, POSIX sh and awk only, no dependency,
# no fixed scratch name, 77 a skip, and any failure a nonzero exit. It NEVER replaces the
# full pre-land gate (tests/run.sh), which stays mandatory before any commit, tag, or push.
#
# Usage: tests/fast.sh <area> [<arg>]
#   unit             the one unit-like suite, ast-doc-graph's test-ddl.sh (the engine, filter,
#                    hook, law, governance, package, store driver, record, and verb tests run
#                    in vitest: bun run test from tests/, or bun run test:<project>)
#   docs             the docs-discipline suite on the files driver
#   docs-fts5        the docs-discipline suite on fts5
#   plugin <name>    plugins/<name>/tests/run.sh
#   base             the shipped base alone (base-only-tests.sh)
# Exit 0 when every suite passes or skips; 1 on any failure or an unknown area.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)

usage() {
  cat <<'USAGE'
usage: tests/fast.sh <area> [<arg>]
  unit             the one unit-like suite, ast-doc-graph's test-ddl.sh (the engine, filter,
                   hook, law, governance, package, store driver, record, and verb tests run
                   in vitest: bun run test from tests/, or bun run test:<project>)
  docs             the docs-discipline suite on the files driver
  docs-fts5        the docs-discipline suite on fts5
  plugin <name>    plugins/<name>/tests/run.sh
  base             the shipped base alone (base-only-tests.sh)
USAGE
}

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
FAST_DIR=$(mktemp -d "$tmp_root/fast.XXXXXX") || { echo "fast.sh: cannot create the scratch folder" >&2; exit 1; }
trap 'rm -rf "$FAST_DIR"' EXIT
trap 'rm -rf "$FAST_DIR"; exit 130' INT
trap 'rm -rf "$FAST_DIR"; exit 143' TERM

SUITES=0
ASSERTS=0
FAILED=0
SKIPPED=0
VERDICT=0

count_assertions() { # <file>: the suite's own summary count, plus a bare verdict
  _ca_passed=$(sed -n 's/.*: \([0-9][0-9]*\) passed, [0-9][0-9]* failed.*/\1/p' "$1" | tail -n 1)
  _ca_pass=$(sed -n 's/.*: pass=\([0-9][0-9]*\) fail=.*/\1/p' "$1" | tail -n 1)
  _ca_verdict=$(grep -c '^VERIFICATION PASSED' "$1" 2>/dev/null)
  [ -n "$_ca_passed" ] || _ca_passed=0
  [ -n "$_ca_pass" ] || _ca_pass=0
  [ -n "$_ca_verdict" ] || _ca_verdict=0
  ASSERTS=$((ASSERTS + _ca_passed + _ca_pass + _ca_verdict))
}

run_suite() { # <label> <command...>
  _rs_label=$1
  shift
  SUITES=$((SUITES + 1))
  _rs_out="$FAST_DIR/$SUITES.out"
  "$@" > "$_rs_out" 2>&1 < /dev/null
  _rs_rc=$?
  cat "$_rs_out"
  case "$_rs_rc" in
    0)
      count_assertions "$_rs_out"
      printf 'fast: %s: PASS (rc 0)\n' "$_rs_label"
      ;;
    77)
      SKIPPED=$((SKIPPED + 1))
      printf 'fast: %s: SKIP (rc 77)\n' "$_rs_label"
      ;;
    *)
      FAILED=$((FAILED + 1))
      VERDICT=1
      printf 'fast: %s: FAIL (rc %s)\n' "$_rs_label" "$_rs_rc"
      ;;
  esac
}

unit_suites() {
  run_suite "ast-doc-graph test-ddl.sh" sh "$ROOT/plugins/ast-doc-graph/tests/test-ddl.sh"
}

case "${1:-}" in
  unit)
    AREA="unit"
    unit_suites
    ;;
  docs)
    AREA="docs"
    run_suite "docs-discipline (posix)" sh "$ROOT/plugins/docs-discipline/tests/run.sh"
    ;;
  docs-fts5)
    AREA="docs-fts5"
    run_suite "docs-discipline (fts5)" sh "$ROOT/plugins/docs-discipline/tests/run.sh" --driver=fts5
    ;;
  plugin)
    case "${2:-}" in
      ""|*/*|.|..) echo "fast.sh: plugin needs a plugin name (plugins/<name>/tests/run.sh)" >&2; exit 1 ;;
    esac
    [ -f "$ROOT/plugins/$2/tests/run.sh" ] || { echo "fast.sh: no suite at plugins/$2/tests/run.sh" >&2; exit 1; }
    AREA="plugin $2"
    run_suite "plugins/$2/tests/run.sh" sh "$ROOT/plugins/$2/tests/run.sh"
    ;;
  base)
    AREA="base"
    run_suite "base-only-tests.sh" sh "$ROOT/tests/base-only-tests.sh"
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  "")
    echo "fast.sh: an area is required" >&2
    usage >&2
    exit 1
    ;;
  *)
    echo "fast.sh: unknown area: $1" >&2
    usage >&2
    exit 1
    ;;
esac

printf '\nfast: %s: %d suite(s), %d assertion(s), %d failed, %d skipped\n' "$AREA" "$SUITES" "$ASSERTS" "$FAILED" "$SKIPPED"
[ "$VERDICT" -eq 0 ] || exit 1
exit 0
