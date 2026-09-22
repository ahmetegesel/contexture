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
# A pair is piped through compact.sh --filter=<filter> and byte-compared
# against the expected file. Core fixtures run through the base compact.sh
# in place; setup fixtures run through a staged sandbox (a copy of
# compact.sh plus every filter under test) because the base discovery
# cannot resolve the setup filters.
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
COMPACT="$ROOT/.contexture/scripts/compact.sh"
CTX="$ROOT/.contexture/scripts/ctx"
CORE_FILTERS="$ROOT/.contexture/filters"
CORE_FIXTURES="$ROOT/tests"
SETUP_FILTERS="$ROOT/examples/setups/tool-filters/filters"
SETUP_FIXTURES="$ROOT/examples/setups/tool-filters/tests"

export LC_ALL=C

# A caller's bypass or debug env must never disarm the fixtures
unset COMPACT_DISABLE COMPACT_DEBUG

if [ ! -f "$COMPACT" ]; then
  echo "filter-tests.sh: compact.sh not found at $COMPACT" >&2
  exit 1
fi
# compact.sh shims into ctx run, so the sandbox stages ctx beside it
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

mkdir -p "$SANDBOX/scripts" "$SANDBOX/filters" "$SANDBOX/bin"
cp "$COMPACT" "$SANDBOX/scripts/compact.sh"
cp "$CTX" "$SANDBOX/scripts/ctx"
for f in "$CORE_FILTERS"/*.awk; do
  [ -f "$f" ] || continue
  cp "$f" "$SANDBOX/filters/"
done
if [ -d "$SETUP_FILTERS" ]; then
  for f in "$SETUP_FILTERS"/*.awk; do
    [ -f "$f" ] || continue
    cp "$f" "$SANDBOX/filters/"
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
        compact="$SANDBOX/scripts/compact.sh"
      else
        compact="$COMPACT"
      fi
      if "$compact" --filter="$name" < "$in_file" > "$actual" 2> "$SANDBOX/$case_name.stderr"; then
        compare "$case_name" "$actual" "$expected"
      else
        bad "$case_name" "compact.sh exited nonzero"
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
  if "$SANDBOX/scripts/compact.sh" --filter=compiler-errors < "$in_file" > "$actual" 2> "$SANDBOX/mechanics-ansi.stderr" \
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
  if FILTER_TESTS_IN="$in_file" PATH="$SANDBOX/bin:$PATH" COMPACT_DEBUG=1 "$SANDBOX/scripts/compact.sh" --stats git show HEAD > "$actual" 2> "$stats" \
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
  FILTER_TESTS_IN="$in_file" PATH="$SANDBOX/bin:$PATH" "$SANDBOX/scripts/compact.sh" --stats tsc --noEmit > "$actual" 2> "$stats" || rc=$?
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
  cp "$probe" "$SANDBOX/filters/compact-recovery.awk"
  if "$SANDBOX/scripts/compact.sh" --stats --filter=compact-recovery < "$in_file" > "$actual" 2> "$stats" \
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
