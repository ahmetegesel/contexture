#!/usr/bin/env sh
# storage-fts5 plugin suite: the named runner for tests/.
# Suites: test-driver (needs sqlite3) and test-migration (needs sqlite3).
# A suite missing a need prints "SKIP: <need>" and exits 77.
# Exit: 0 when all suites pass, 1 otherwise.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
SKIP=0

printf 'storage-fts5 plugin suite: test-driver, test-migration\n'
printf 'needs: sqlite3\n\n'

run_suite() {
  name="$1"
  shift
  "$@"
  rc=$?
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

run_suite test-driver "$SCRIPT_DIR/test-driver.sh"
run_suite test-migration "$SCRIPT_DIR/test-migration.sh"

printf 'storage-fts5 suite: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
