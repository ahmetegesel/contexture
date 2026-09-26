#!/usr/bin/env sh
# docs-discipline plugin suite: the named runner for tests/.
# Drives the staging check, the audit, the close-gate matrix over tests/sample/, and the
# grammar agreement check (tests/grammar-agreement.awk, with its two plants) in a staged
# scratch workspace built from the shipped copies only: the runtime and the
# session and lane modules from base/ (the repository that carries this plugin),
# the docs module and the grammar template (.contexture/templates/doc.md) from
# this plugin, never a workspace's adopted drawer, so the suite proves what ships
# (the gate pins the shipped copies). Needs: POSIX awk/sh, base/.contexture/ctx
# beside plugins/ (the plugin ships the module, not the engine), and git for the
# matrix's tracked-claimant fixture.
#
# The suite runs on either storage driver: --driver=posix (the default) or
# --driver=fts5 (the storage-fts5 plugin's own module copy staged into the
# sandbox, storage.driver: fts5 in its config; skip 77 when sqlite3 lacks FTS5).
# Scratch stages under the workspace's .contexture/tmp/ (created when the tree is
# writable, as the core suites do), the system temp only when it cannot be made.
# Exit: 0 when every check passes, 1 on a failure, 77 when a need is absent.
#
# usage: tests/run.sh [--driver=posix|fts5]

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PASS=0
FAIL=0

DRIVER=posix
for a in "$@"; do
    case "$a" in
        --driver=posix|--driver=fts5) DRIVER=${a#--driver=} ;;
        *) echo "docs-discipline suite: unknown argument: $a" >&2; exit 1 ;;
    esac
done

# need: the shipped core beside plugins/ (the plugin ships the module, not the engine)
WS_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
BASE_CTX="$WS_ROOT/base/.contexture/ctx"
BASE_MODULES="$WS_ROOT/base/.contexture/modules"
FTS5_MOD="$WS_ROOT/plugins/storage-fts5/.contexture/modules/storage-fts5"
if [ ! -f "$BASE_CTX" ] || [ ! -d "$BASE_MODULES/session" ]; then
    echo "SKIP: the shipped core (base/.contexture/ctx and its session module) not found under $WS_ROOT"
    echo "docs-discipline suite: 0 passed, 0 failed, 1 skipped"
    exit 77
fi
if [ "$DRIVER" = fts5 ]; then
    if [ ! -d "$FTS5_MOD" ]; then
        echo "SKIP: the storage-fts5 plugin copy (need: the fts5 driver run) not found at $FTS5_MOD"
        echo "docs-discipline suite: 0 passed, 0 failed, 1 skipped"
        exit 77
    fi
    if ! command -v sqlite3 >/dev/null 2>&1 || ! sqlite3 :memory: "CREATE VIRTUAL TABLE t USING fts5(x);" >/dev/null 2>&1; then
        echo "SKIP: sqlite3 with FTS5 (need: the fts5 driver run of the docs suite)"
        echo "docs-discipline suite: 0 passed, 0 failed, 1 skipped"
        exit 77
    fi
fi

# scratch: the workspace's .contexture/tmp/ (made on demand), the system temp only when it cannot be
TMP_BASE="${TMPDIR:-/tmp}"
if mkdir -p "$WS_ROOT/.contexture/tmp" 2>/dev/null && [ -d "$WS_ROOT/.contexture/tmp" ] && [ -w "$WS_ROOT/.contexture/tmp" ]; then
    TMP_BASE="$WS_ROOT/.contexture/tmp"
fi
# a sandbox of its own per run (never a fixed name), removed on exit, so concurrent
# runs of the gate never share or clear one another's staging
SANDBOX=$(mktemp -d "$TMP_BASE/docs-plugin-tests.XXXXXX") || exit 1
trap 'rm -rf "$SANDBOX"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$SANDBOX/.contexture/modules" "$SANDBOX/.contexture/templates" "$SANDBOX/docs"
cp "$BASE_CTX" "$SANDBOX/.contexture/ctx"
chmod +x "$SANDBOX/.contexture/ctx"
cp -R "$BASE_MODULES/session" "$SANDBOX/.contexture/modules/session"
[ -d "$BASE_MODULES/lane" ] && cp -R "$BASE_MODULES/lane" "$SANDBOX/.contexture/modules/lane"
cp -R "$PLUGIN_ROOT/.contexture/modules/docs" "$SANDBOX/.contexture/modules/docs"
cp "$PLUGIN_ROOT/.contexture/templates/doc.md" "$SANDBOX/.contexture/templates/doc.md"
if [ "$DRIVER" = fts5 ]; then
    cp -R "$FTS5_MOD" "$SANDBOX/.contexture/modules/storage-fts5"
    printf 'storage.driver: fts5\n' > "$SANDBOX/.contexture/config"
fi
cp -R "$PLUGIN_ROOT/docs/." "$SANDBOX/docs/"
cp -R "$PLUGIN_ROOT/tests/sample/docs/." "$SANDBOX/docs/"
cp "$PLUGIN_ROOT/tests/sample/backlog.md" "$SANDBOX/backlog.md"

cd "$SANDBOX" || exit 1
# the sandbox answers for itself: an inherited root, driver choice, or store path
# from the calling workspace never reaches it
unset CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH CTX_REFERENCE_DRIVER
export LC_ALL=C

echo "docs-discipline plugin suite: staging, audit, gate matrix, grammar agreement (driver: $DRIVER; staged at $SANDBOX)"
echo ""

# staging: the runtime is base's copy byte for byte and the resolver answers the
# configured driver with the staged copy (posix: the session module's, fts5: the plugin's)
case "$DRIVER" in
    posix) WANT_DRIVER="$SANDBOX/.contexture/modules/session/drivers/posix/driver" ;;
    fts5) WANT_DRIVER="$SANDBOX/.contexture/modules/storage-fts5/drivers/fts5" ;;
esac
GOT_DRIVER=$(./.contexture/modules/session/scripts/driver-resolver resolve 2>&1)
if cmp -s "$BASE_CTX" "$SANDBOX/.contexture/ctx" && [ "$GOT_DRIVER" = "$WANT_DRIVER" ]; then
    echo "[staging] PASS (base runtime; the $DRIVER driver resolves to the staged copy)"
    PASS=$((PASS + 1))
else
    echo "[staging] FAIL (driver resolved: $GOT_DRIVER; want $WANT_DRIVER)"
    FAIL=$((FAIL + 1))
fi
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

# grammar agreement: the #% schema of doc.md, its prose shapes, and the audit's kind and
# block lists agree (tests/grammar-agreement.awk); two plants prove the check can fail: an
# extra field in the prose and an extra enum value in the schema each read DISAGREE
AGREE_AWK="$SCRIPT_DIR/grammar-agreement.awk"
S_DOC="$SANDBOX/.contexture/templates/doc.md"
S_AUD="$SANDBOX/.contexture/modules/docs/scripts/docs-audit.awk"
AGREE_OUT=$(awk -f "$AGREE_AWK" "$S_DOC" "$S_AUD" 2>&1)
AGREE_RC=$?
awk '{ print } $0 == "    nature: internal | external" { print "    planted_field: \"x\"" }' "$S_DOC" > "$SANDBOX/plant-prose.md"
PLANT_A=$(awk -f "$AGREE_AWK" "$SANDBOX/plant-prose.md" "$S_AUD" 2>&1)
PLANT_A_RC=$?
awk '{ if ($0 == "#% field dependencies nature enum required internal external") print $0 " planted"; else print }' "$S_DOC" > "$SANDBOX/plant-schema.md"
PLANT_B=$(awk -f "$AGREE_AWK" "$SANDBOX/plant-schema.md" "$S_AUD" 2>&1)
PLANT_B_RC=$?
if [ "$AGREE_RC" -eq 0 ] && printf '%s' "$AGREE_OUT" | grep -q '^AGREE: ' \
    && [ "$PLANT_A_RC" -eq 1 ] && printf '%s' "$PLANT_A" | grep -q '^DISAGREE: field dependencies.planted_field' \
    && [ "$PLANT_B_RC" -eq 1 ] && printf '%s' "$PLANT_B" | grep -q '^DISAGREE: enum dependencies.nature'; then
    echo "[grammar-agreement] PASS (${AGREE_OUT#AGREE: }; both plants read DISAGREE)"
    PASS=$((PASS + 1))
else
    echo "[grammar-agreement] FAIL (rc=$AGREE_RC, prose plant rc=$PLANT_A_RC, schema plant rc=$PLANT_B_RC)"
    printf '%s\n%s\n%s\n' "$AGREE_OUT" "$PLANT_A" "$PLANT_B" | head -20
    FAIL=$((FAIL + 1))
fi
echo ""

echo "docs-discipline suite ($DRIVER): $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
