#!/usr/bin/env sh
# storage-fts5 plugin suite: the named runner for tests/.
# Suites: test-driver, test-schema, test-verbs, test-version, test-derive, test-store,
# test-store-compliance (each needs sqlite3).
# A suite missing a need prints "SKIP: <need>" and exits 77.
# The seven sub-suites are hermetic, so they run concurrently with a cap of 3; each
# capture is printed in the fixed sub-suite order, keeping every verdict and counter.
# Exit: 0 when no suite failed, 1 otherwise.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)"
PASS=0
FAIL=0
SKIP=0
CAP=3

printf 'storage-fts5 plugin suite: test-driver, test-schema, test-verbs, test-version, test-derive, test-store, test-store-compliance\n'
printf 'needs: sqlite3\n\n'

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SB=$(mktemp -d "$tmp_root/storage-fts5-suite.XXXXXX") || exit 1
running=""
queue="test-driver test-schema test-verbs test-version test-derive test-store test-store-compliance"
pids=""

stop_all() { [ -n "$pids" ] && kill $pids 2>/dev/null; }
trap 'rm -rf "$SB"' EXIT
trap 'stop_all; exit 130' INT
trap 'stop_all; exit 143' TERM HUP

# launch <name>: the sub-suite as a background job; its rc lands in rc (atomic rename)
launch() {
  name=$1
  d="$SB/$name"
  mkdir -p "$d"
  ( sh "$SCRIPT_DIR/$name.sh" > "$d/out" 2>&1 < /dev/null; printf '%s\n' "$?" > "$d/rc.part"; mv "$d/rc.part" "$d/rc" ) &
  p=$!
  pids="$pids $p"
  printf '%s\n' "$p" > "$d/pid"
  running="$running $name"
}

while :; do
  still=""
  for j in $running; do
    [ -f "$SB/$j/rc" ] || still="$still $j"
  done
  running=$still
  # start queued suites while a slot is free
  while [ -n "$queue" ]; do
    set -- $running
    [ $# -ge "$CAP" ] && break
    set -- $queue
    launch "$1"
    shift
    queue="$*"
  done
  [ -z "$running" ] && [ -z "$queue" ] && break
  sleep 1
done
wait

run_suite() {
  name="$1"
  cat "$SB/$name/out"
  rc=$(cat "$SB/$name/rc")
  if [ "$rc" -eq 0 ]; then
    printf '[%s] PASS\n' "$name"
    PASS=$((PASS + 1))
  elif [ "$rc" -eq 77 ]; then
    printf '[%s] SKIP (need absent)\n' "$name"
    SKIP=$((SKIP + 1))
  else
    printf '[%s] FAIL (rc=%d)\n' "$name" "$rc"
    FAIL=$((FAIL + 1))
  fi
  printf '\n'
}

run_suite test-driver
run_suite test-schema
run_suite test-verbs
run_suite test-version
run_suite test-derive
run_suite test-store
run_suite test-store-compliance

printf 'storage-fts5 suite: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
