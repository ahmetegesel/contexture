#!/usr/bin/env sh
# ast-doc-graph plugin suite: the named runner for tests/.
# Suites: test-ddl (needs sqlite3) and verify-pilot (needs the pilot
# repository, sqlite3, and node/tsx). A suite missing a need prints
# "SKIP: <need>" and exits 77; this runner counts it as skipped, never
# failed. Exit: 0 when no suite failed, 1 otherwise.
#
# usage: tests/run.sh [<pilot-repo>]   (the argument forwards to verify-pilot)

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0
FAIL=0
SKIP=0

echo "ast-doc-graph plugin suite: test-ddl, verify-pilot"
echo "needs: sqlite3; verify-pilot additionally needs the pilot repository and node/tsx"
echo ""

run_suite() {
    name="$1"
    shift
    "$@"
    rc=$?
    if [ "$rc" -eq 0 ]; then
        echo "[$name] PASS"
        PASS=$((PASS + 1))
    elif [ "$rc" -eq 77 ]; then
        echo "[$name] SKIP (need absent)"
        SKIP=$((SKIP + 1))
    else
        echo "[$name] FAIL (rc=$rc)"
        FAIL=$((FAIL + 1))
    fi
    echo ""
}

run_suite test-ddl "$SCRIPT_DIR/test-ddl.sh"
run_suite verify-pilot "$SCRIPT_DIR/verify-pilot.sh" "$@"

echo "ast-doc-graph suite: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
