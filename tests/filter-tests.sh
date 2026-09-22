#!/bin/sh
# filter-tests.sh: static fixture harness for the stream filters
# Zero-install: POSIX /bin/sh, awk, and core OS utilities (cmp, mktemp)
#
# Usage:
#   tests/filter-tests.sh
#
# The tests live upstream, never in an adopting workspace. Core pairs live in
# this folder; setup pairs live under the setup, one pair per case, named
# <filter>-<case>.in and <filter>-<case>.expected:
#   tests/                                 the core filters
#   examples/setups/tool-filters/tests/    the setup filters
# Read tests/README.md before maintaining the filters or the pairs.
# A pair is piped through the runner (ctx run --filter=<filter>) and
# byte-compared against the expected file. Core fixtures run through the
# base runtime in place; setup fixtures run through a staged sandbox (a copy
# of the runtime plus the real module layout: modules/run/filters for the
# core filters and a staged tool-filters module for the setup filters).
#
# The presence check enumerates every top-level *.awk per filter directory
# and fails when one carries no fixture pair; the counts are derived from
# the directories, never hardcoded.
#
# Mechanics cases live in this folder as compact-*.in
# pairs and are driven here: the ANSI strip (an ANSI-bearing input through
# the compiler filter), command identity (a git shim selecting diff.awk in
# runner mode), the notice-only false-green output, and the recovery
# fallback to raw.
#
# Exit 0 when every fixture matches and every filter is covered.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX="$ROOT/.contexture/ctx"
CORE_FILTERS="$ROOT/.contexture/modules/run/filters"
CORE_FIXTURES="$ROOT/tests"
SETUP_FILTERS="$ROOT/examples/setups/tool-filters/filters"
SETUP_FIXTURES="$ROOT/examples/setups/tool-filters/tests"

export LC_ALL=C

# A caller's bypass or debug env must never disarm the fixtures
unset COMPACT_DISABLE COMPACT_DEBUG

if [ ! -f "$CTX" ]; then
  echo "filter-tests.sh: ctx not found at $CTX" >&2
  exit 1
fi
if [ ! -d "$CORE_FIXTURES" ]; then
  echo "filter-tests.sh: core fixtures not found at $CORE_FIXTURES" >&2
  exit 1
fi

# Prefer the workspace scratch drawer when present; else TMPDIR, else /tmp
tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SANDBOX=$(mktemp -d "$tmp_root/filter-tests.XXXXXX") || exit 1
cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

# The sandbox mirrors the real layout: the runtime at .contexture/ctx, the
# core filters in the run module, the setup filters as a staged workspace
# module beside it
mkdir -p "$SANDBOX/.contexture/modules/run/filters" "$SANDBOX/.contexture/modules/tool-filters/filters" "$SANDBOX/bin"
cp "$CTX" "$SANDBOX/.contexture/ctx"
chmod +x "$SANDBOX/.contexture/ctx"
for f in "$CORE_FILTERS"/*.awk; do
  [ -f "$f" ] || continue
  cp "$f" "$SANDBOX/.contexture/modules/run/filters/"
done
if [ -d "$SETUP_FILTERS" ]; then
  printf '# summary: staged tool-filters module\n' > "$SANDBOX/.contexture/modules/tool-filters/module"
  for f in "$SETUP_FILTERS"/*.awk; do
    [ -f "$f" ] || continue
    cp "$f" "$SANDBOX/.contexture/modules/tool-filters/filters/"
  done
fi

passed=0
failed=0

ok() {
  passed=$((passed + 1))
  printf "PASS %s\n" "$1"
}

bad() {
  failed=$((failed + 1))
  printf "FAIL %s: %s\n" "$1" "$2"
}

compare() {
  if cmp -s "$2" "$3"; then
    ok "$1"
  else
    bad "$1" "$(cmp "$2" "$3" 2>&1 | head -n 1)"
  fi
}

# A fixture belongs to the filter whose name is the longest prefix of its
# case name, so a filter named foo never claims the cases of foo-bar
fixture_owner() {
  fo_case=$1
  fo_dir=$2
  fo_owner=""
  fo_len=0
  for fo_candidate in "$fo_dir"/*.awk; do
    [ -f "$fo_candidate" ] || continue
    fo_name=$(basename "$fo_candidate" .awk)
    case "$fo_case" in
      "$fo_name"-*)
        fo_name_len=${#fo_name}
        if [ "$fo_name_len" -gt "$fo_len" ]; then
          fo_owner="$fo_name"
          fo_len=$fo_name_len
        fi
        ;;
    esac
  done
  printf "%s" "$fo_owner"
}

run_fixtures() {
  filters_dir=$1
  fixtures_dir=$2
  mode=$3
  label=$4
  filters=0
  cases=0
  for f in "$filters_dir"/*.awk; do
    [ -f "$f" ] || continue
    name=$(basename "$f" .awk)
    filters=$((filters + 1))
    found=0
    for in_file in "$fixtures_dir/$name-"*.in; do
      [ -f "$in_file" ] || continue
      case_name=$(basename "$in_file" .in)
      if [ "$(fixture_owner "$case_name" "$filters_dir")" != "$name" ]; then
        continue
      fi
      found=$((found + 1))
      expected="$fixtures_dir/$case_name.expected"
      if [ ! -f "$expected" ]; then
        bad "$case_name" "missing $case_name.expected"
        continue
      fi
      actual="$SANDBOX/$case_name.actual"
      if [ "$mode" = sandbox ]; then
        runner="$SANDBOX/.contexture/ctx"
      else
        runner="$CTX"
      fi
      if "$runner" run --filter="$name" < "$in_file" > "$actual" 2> "$SANDBOX/$case_name.stderr"; then
        compare "$case_name" "$actual" "$expected"
      else
        bad "$case_name" "ctx run exited nonzero"
      fi
      cases=$((cases + 1))
    done
    if [ "$found" -eq 0 ]; then
      bad "presence:$name" "no fixture pair in $fixtures_dir"
    fi
  done
  printf "%s: %d filters, %d cases\n" "$label" "$filters" "$cases"
}

run_ansi_case() {
  in_file="$SETUP_FIXTURES/compiler-errors-pretty.in"
  expected="$SETUP_FIXTURES/compiler-errors-pretty.expected"
  actual="$SANDBOX/mechanics-ansi.actual"
  if [ ! -d "$SETUP_FILTERS" ] || [ ! -d "$SETUP_FIXTURES" ]; then
    printf "SKIP mechanics:ansi-strip (setup filters or fixtures not present)\n"
    return
  fi
  if [ ! -f "$in_file" ] || [ ! -f "$expected" ] || [ ! -f "$SETUP_FILTERS/compiler-errors.awk" ]; then
    bad "mechanics:ansi-strip" "fixture pair or compiler filter missing"
    return
  fi
  if "$SANDBOX/.contexture/ctx" run --filter=compiler-errors < "$in_file" > "$actual" 2> "$SANDBOX/mechanics-ansi.stderr" \
    && ! grep -q "$(printf '\033')" "$actual"; then
    compare "mechanics:ansi-strip" "$actual" "$expected"
  else
    bad "mechanics:ansi-strip" "run failed or the output still carries ESC"
  fi
}

run_identity_case() {
  in_file="$CORE_FIXTURES/diff-show-trimmed.in"
  expected="$CORE_FIXTURES/diff-show-trimmed.expected"
  actual="$SANDBOX/mechanics-identity.actual"
  stats="$SANDBOX/mechanics-identity.stats"
  if [ ! -f "$in_file" ] || [ ! -f "$expected" ]; then
    bad "mechanics:command-identity" "fixture pair missing"
    return
  fi
  cat > "$SANDBOX/bin/git" <<'SHIM'
#!/bin/sh
cat "$FILTER_TESTS_IN"
SHIM
  chmod +x "$SANDBOX/bin/git"
  if FILTER_TESTS_IN="$in_file" PATH="$SANDBOX/bin:$PATH" COMPACT_DEBUG=1 "$SANDBOX/.contexture/ctx" run --stats git show HEAD > "$actual" 2> "$stats" \
    && grep -q "selected diff.awk (command match: git show HEAD)" "$stats"; then
    compare "mechanics:command-identity" "$actual" "$expected"
  else
    bad "mechanics:command-identity" "identity selection did not fire"
  fi
}

run_false_green_case() {
  in_file="$CORE_FIXTURES/compact-false-green.in"
  expected="$CORE_FIXTURES/compact-false-green.expected"
  actual="$SANDBOX/mechanics-false-green.actual"
  stats="$SANDBOX/mechanics-false-green.stats"
  if [ ! -d "$SETUP_FILTERS" ]; then
    printf "SKIP mechanics:notice-only-false-green (setup filters not present)\n"
    return
  fi
  if [ ! -f "$in_file" ] || [ ! -f "$expected" ] || [ ! -f "$SETUP_FILTERS/compiler-errors.awk" ]; then
    bad "mechanics:notice-only-false-green" "fixture pair or compiler filter missing"
    return
  fi
  cat > "$SANDBOX/bin/tsc" <<'SHIM'
#!/bin/sh
cat "$FILTER_TESTS_IN" >&2
exit 2
SHIM
  chmod +x "$SANDBOX/bin/tsc"
  rc=0
  FILTER_TESTS_IN="$in_file" PATH="$SANDBOX/bin:$PATH" "$SANDBOX/.contexture/ctx" run --stats tsc --noEmit > "$actual" 2> "$stats" || rc=$?
  if [ "$rc" -ne 2 ]; then
    bad "mechanics:notice-only-false-green" "exit code $rc, expected 2"
    return
  fi
  if ! grep -q "notice-only output passed through" "$stats"; then
    bad "mechanics:notice-only-false-green" "notice-only rule did not fire"
    return
  fi
  compare "mechanics:notice-only-false-green" "$actual" "$expected"
}

run_recovery_case() {
  in_file="$CORE_FIXTURES/compact-recovery.in"
  expected="$CORE_FIXTURES/compact-recovery.expected"
  probe="$CORE_FIXTURES/compact-recovery.awk"
  actual="$SANDBOX/mechanics-recovery.actual"
  stats="$SANDBOX/mechanics-recovery.stats"
  if [ ! -f "$in_file" ] || [ ! -f "$expected" ] || [ ! -f "$probe" ]; then
    bad "mechanics:recovery-fallback" "fixture pair or probe missing"
    return
  fi
  cp "$probe" "$SANDBOX/.contexture/modules/run/filters/compact-recovery.awk"
  if "$SANDBOX/.contexture/ctx" run --stats --filter=compact-recovery < "$in_file" > "$actual" 2> "$stats" \
    && grep -q "recovery fallback" "$stats"; then
    compare "mechanics:recovery-fallback" "$actual" "$expected"
  else
    bad "mechanics:recovery-fallback" "recovery fallback did not fire"
  fi
}

printf "filter-tests: fixture harness at %s\n" "$ROOT"
run_fixtures "$CORE_FILTERS" "$CORE_FIXTURES" inplace "core filters"
if [ -d "$SETUP_FILTERS" ] && [ -d "$SETUP_FIXTURES" ]; then
  run_fixtures "$SETUP_FILTERS" "$SETUP_FIXTURES" sandbox "setup filters"
else
  printf "setup filters: skipped (examples/setups/tool-filters not present)\n"
fi
run_ansi_case
run_identity_case
run_false_green_case
run_recovery_case

printf "\nfilter-tests: %d passed, %d failed\n" "$passed" "$failed"
if [ "$failed" -gt 0 ]; then
  exit 1
fi
exit 0
