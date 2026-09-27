#!/usr/bin/env sh
# storage-fts5 plugin suite: the named runner for tests/.
# Suites: test-driver, test-upgrade, test-dump, test-session-migrate (each needs sqlite3).
# A suite missing a need prints "SKIP: <need>" and exits 77.
# Exit: 0 when all suites pass, 1 otherwise.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
SKIP=0

printf 'storage-fts5 plugin suite: test-driver, test-upgrade, test-dump, test-session-migrate\n'
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
run_suite test-upgrade "$SCRIPT_DIR/test-upgrade.sh"
run_suite test-dump "$SCRIPT_DIR/test-dump.sh"
run_suite test-session-migrate "$SCRIPT_DIR/test-session-migrate.sh"

printf 'storage-fts5 suite: %d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
