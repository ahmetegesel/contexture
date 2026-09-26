#!/usr/bin/env sh
# docs-discipline plugin suite: the named runner for tests/.
# Drives the audit and the close-gate matrix over tests/sample/ in a staged
# scratch workspace. Needs: POSIX awk/sh, the base .contexture/ctx runtime
# (the plugin ships the module, not the engine), and git for the matrix's
# tracked-claimant fixture.
# Scratch stages under the workspace's .contexture/tmp/ when that drawer is
# writable, the system temp otherwise. Exit: 0 when both checks pass, 1 on a
# failure, 77 when a need is absent.
#
# usage: tests/run.sh

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PASS=0
FAIL=0

# need: the base ctx runtime (the plugin ships the module, not the engine)
WS_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
CTX_BIN="$WS_ROOT/.contexture/ctx"
if [ ! -x "$CTX_BIN" ]; then
    echo "SKIP: base ctx runtime not found at $CTX_BIN"
    echo "docs-discipline suite: 0 passed, 0 failed, 1 skipped"
    exit 77
fi

# scratch: the workspace's .contexture/tmp/ when writable, the system temp otherwise
TMP_BASE=""
if [ -d "$WS_ROOT/.contexture" ] && mkdir -p "$WS_ROOT/.contexture/tmp" 2>/dev/null && [ -w "$WS_ROOT/.contexture/tmp" ]; then
    TMP_BASE="$WS_ROOT/.contexture/tmp"
else
    TMP_BASE="${TMPDIR:-/tmp}"
fi
# a sandbox of its own per run (never a fixed name), removed on exit, so concurrent
# runs of the gate never share or clear one another's staging
SANDBOX=$(mktemp -d "$TMP_BASE/docs-plugin-tests.XXXXXX") || exit 1
trap 'rm -rf "$SANDBOX"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$SANDBOX/.contexture/modules" "$SANDBOX/docs"
cp "$CTX_BIN" "$SANDBOX/.contexture/ctx"
cp -R "$PLUGIN_ROOT/.contexture/modules/docs" "$SANDBOX/.contexture/modules/"
cp -R "$PLUGIN_ROOT/docs/." "$SANDBOX/docs/"
cp -R "$PLUGIN_ROOT/tests/sample/docs/." "$SANDBOX/docs/"
cp "$PLUGIN_ROOT/tests/sample/backlog.md" "$SANDBOX/backlog.md"

cd "$SANDBOX" || exit 1

echo "docs-discipline plugin suite: audit, gate matrix (staged at $SANDBOX)"
echo ""

AUDIT_OUT="$("$SANDBOX/.contexture/ctx" docs audit docs/*/*.md 2>&1)"
AUDIT_RC=$?
if [ "$AUDIT_RC" -eq 0 ] && [ -z "$AUDIT_OUT" ]; then
    echo "[audit] PASS (silent, rc0)"
    PASS=$((PASS + 1))
else
    echo "[audit] FAIL (rc=$AUDIT_RC)"
    [ -n "$AUDIT_OUT" ] && printf '%s\n' "$AUDIT_OUT"
    FAIL=$((FAIL + 1))
fi
echo ""

MATRIX_OUT="$("$SANDBOX/.contexture/ctx" docs gate --test-matrix 2>&1)"
MATRIX_RC=$?
if [ "$MATRIX_RC" -eq 0 ] && printf '%s' "$MATRIX_OUT" | grep -q "TEST MATRIX VERDICT: ALL 8 SCENARIOS PASSED"; then
    echo "[gate-matrix] PASS (ALL 8 SCENARIOS PASSED)"
    PASS=$((PASS + 1))
else
    echo "[gate-matrix] FAIL (rc=$MATRIX_RC)"
    printf '%s\n' "$MATRIX_OUT" | tail -20
    FAIL=$((FAIL + 1))
fi
echo ""

echo "docs-discipline suite: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
