#!/usr/bin/env bash
# AST and Documentation Graph Pilot Verification Script
# Validates end-to-end extraction, indexing, and retrieval against bilingo-mvp.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_DRIVER="$SCRIPT_DIR/bin/ast-doc-index"
GRAPH_QUERY="$SCRIPT_DIR/bin/graph-query"

REPO_ROOT="${1:-/Users/ahmetegesel/Projects/bilingo-mvp}"
TEST_DB="${2:-/tmp/bilingo-pilot-verify.db}"

echo "================================================================="
echo "AST-DOC-GRAPH PILOT VERIFICATION SUITE"
echo "Target Repository: $REPO_ROOT"
echo "Database Path:     $TEST_DB"
echo "================================================================="

if [[ ! -d "$REPO_ROOT" ]]; then
  echo "[FAIL] Target repository root not found: $REPO_ROOT" >&2
  exit 1
fi

if [[ ! -x "$INDEX_DRIVER" ]]; then
  echo "[FAIL] Index driver not executable: $INDEX_DRIVER" >&2
  exit 1
fi

if [[ ! -x "$GRAPH_QUERY" ]]; then
  echo "[FAIL] Query CLI not executable: $GRAPH_QUERY" >&2
  exit 1
fi

# Step 1: Run full indexing pipeline on pilot repository
echo ""
echo "--- STEP 1: Running full repository indexing ---"
"$INDEX_DRIVER" \
  --repo-root "$REPO_ROOT" \
  --src-dir backend \
  --db "$TEST_DB" \
  --clean

if [[ ! -f "$TEST_DB" ]]; then
  echo "[FAIL] Target database file was not created: $TEST_DB" >&2
  exit 1
fi
echo "[PASS] Indexing pipeline completed and database created."

# Step 2: Verify entity counts directly from database
echo ""
echo "--- STEP 2: Verifying entity counts ---"
SQLITE_BIN="/usr/bin/sqlite3"
if [[ ! -x "$SQLITE_BIN" ]]; then
  SQLITE_BIN="$(command -v sqlite3 || true)"
fi
if [[ -z "$SQLITE_BIN" ]]; then
  echo "[FAIL] sqlite3 binary not found." >&2
  exit 1
fi

SYMBOLS_COUNT="$("$SQLITE_BIN" "$TEST_DB" "SELECT COUNT(*) FROM symbols;")"
EDGES_COUNT="$("$SQLITE_BIN" "$TEST_DB" "SELECT COUNT(*) FROM edges;")"
DOCS_COUNT="$("$SQLITE_BIN" "$TEST_DB" "SELECT COUNT(*) FROM docs;")"
RULES_COUNT="$("$SQLITE_BIN" "$TEST_DB" "SELECT COUNT(*) FROM rules;")"
PITFALLS_COUNT="$("$SQLITE_BIN" "$TEST_DB" "SELECT COUNT(*) FROM pitfalls;")"

echo "Discovered entities: symbols=$SYMBOLS_COUNT, edges=$EDGES_COUNT, docs=$DOCS_COUNT, rules=$RULES_COUNT, pitfalls=$PITFALLS_COUNT"

if [[ "$SYMBOLS_COUNT" -ne 156 ]]; then
  echo "[FAIL] Expected 156 symbols, got $SYMBOLS_COUNT" >&2
  exit 1
fi
if [[ "$EDGES_COUNT" -ne 798 ]]; then
  echo "[FAIL] Expected 798 edges, got $EDGES_COUNT" >&2
  exit 1
fi
if [[ "$DOCS_COUNT" -ne 17 ]]; then
  echo "[FAIL] Expected 17 docs, got $DOCS_COUNT" >&2
  exit 1
fi
if [[ "$RULES_COUNT" -ne 213 ]]; then
  echo "[FAIL] Expected 213 rules, got $RULES_COUNT" >&2
  exit 1
fi
if [[ "$PITFALLS_COUNT" -ne 69 ]]; then
  echo "[FAIL] Expected 69 pitfalls, got $PITFALLS_COUNT" >&2
  exit 1
fi
echo "[PASS] All database entity counts match expected pilot baseline."

# Step 3: Test 1 (symbol CascadeCore.startSession)
echo ""
echo "--- TEST 1: graph-query symbol CascadeCore.startSession ---"
T1_OUTPUT="$("$GRAPH_QUERY" symbol CascadeCore.startSession --db "$TEST_DB")"
echo "$T1_OUTPUT"

if ! echo "$T1_OUTPUT" | grep -q "LOCATION: backend/core/cascadeCore.ts:38-77"; then
  echo "[FAIL] Test 1: missing definition location" >&2
  exit 1
fi
if ! echo "$T1_OUTPUT" | grep -q "SessionService.startSession"; then
  echo "[FAIL] Test 1: missing caller SessionService.startSession" >&2
  exit 1
fi
if ! echo "$T1_OUTPUT" | grep -q "doc:toisto:cascade-protocol"; then
  echo "[FAIL] Test 1: missing governing doc doc:toisto:cascade-protocol" >&2
  exit 1
fi
if ! echo "$T1_OUTPUT" | grep -q "startsession-rejects-gym-sessions-with-l"; then
  echo "[FAIL] Test 1: missing locked fog rule" >&2
  exit 1
fi
echo "[PASS] Test 1 passed: definition, caller, doc, and locked fog rule verified."

# Step 4: Test 2 (symbol CascadeCore.getNextPhase)
echo ""
echo "--- TEST 2: graph-query symbol CascadeCore.getNextPhase ---"
T2_OUTPUT="$("$GRAPH_QUERY" symbol CascadeCore.getNextPhase --db "$TEST_DB")"
echo "$T2_OUTPUT"

if ! echo "$T2_OUTPUT" | grep -q "LOCATION: backend/core/cascadeCore.ts:107-139"; then
  echo "[FAIL] Test 2: missing definition location" >&2
  exit 1
fi
if ! echo "$T2_OUTPUT" | grep -q "getnextphase-is-deterministic"; then
  echo "[FAIL] Test 2: missing deterministic phase machine rule" >&2
  exit 1
fi
echo "[PASS] Test 2 passed: definition and deterministic phase machine rule verified."

# Step 5: Test 3 (symbol CascadeCore.calculateLevenshtein)
echo ""
echo "--- TEST 3: graph-query symbol CascadeCore.calculateLevenshtein ---"
T3_OUTPUT="$("$GRAPH_QUERY" symbol CascadeCore.calculateLevenshtein --db "$TEST_DB")"
echo "$T3_OUTPUT"

if ! echo "$T3_OUTPUT" | grep -q "LOCATION: backend/core/cascadeCore.ts:153-174"; then
  echo "[FAIL] Test 3: missing definition location" >&2
  exit 1
fi
if ! echo "$T3_OUTPUT" | grep -q "CascadeCore.checkTextAnswer"; then
  echo "[FAIL] Test 3: missing caller CascadeCore.checkTextAnswer" >&2
  exit 1
fi
if ! echo "$T3_OUTPUT" | grep -q "pitfall:cascade-protocol:p1"; then
  echo "[FAIL] Test 3: missing normalization/Levenshtein drift pitfall" >&2
  exit 1
fi
echo "[PASS] Test 3 passed: definition, callers, and normalization drift pitfall verified."

# Step 6: Test 4 (callers CascadeCore.startSession --depth 3)
echo ""
echo "--- TEST 4: graph-query callers CascadeCore.startSession --depth 3 ---"
T4_OUTPUT="$("$GRAPH_QUERY" callers CascadeCore.startSession --depth 3 --db "$TEST_DB")"
echo "$T4_OUTPUT"

if ! echo "$T4_OUTPUT" | grep -q "SessionService.startSession"; then
  echo "[FAIL] Test 4: missing upstream caller SessionService.startSession" >&2
  exit 1
fi
echo "[PASS] Test 4 passed: recursive call hierarchy verified."

# Step 7: Test 5 (search "locked fog")
echo ""
echo "--- TEST 5: graph-query search 'locked fog' ---"
T5_OUTPUT="$("$GRAPH_QUERY" search "locked fog" --db "$TEST_DB")"
echo "$T5_OUTPUT"

if ! echo "$T5_OUTPUT" | grep -q "startsession-rejects-gym-sessions-with-l"; then
  echo "[FAIL] Test 5: missing locked fog rule match" >&2
  exit 1
fi
if ! echo "$T5_OUTPUT" | grep -q "LINKED_SYMBOLS: CascadeCore.startSession"; then
  echo "[FAIL] Test 5: missing linked symbol CascadeCore.startSession" >&2
  exit 1
fi
echo "[PASS] Test 5 passed: FTS5 search ranking and linked symbols verified."

# Step 8: Test 6 (search "auto-stabilizer")
echo ""
echo "--- TEST 6: graph-query search 'auto-stabilizer' ---"
T6_OUTPUT="$("$GRAPH_QUERY" search "auto-stabilizer" --db "$TEST_DB")"
echo "$T6_OUTPUT"

if ! echo "$T6_OUTPUT" | grep -q "reality-error-gate"; then
  echo "[FAIL] Test 6: missing reality error gate rule" >&2
  exit 1
fi
echo "[PASS] Test 6 passed: reality error gate rule verified via FTS5 search."

# Step 9: Test 7 (stats aggregate statistics)
echo ""
echo "--- TEST 7: graph-query stats ---"
T7_OUTPUT="$("$GRAPH_QUERY" stats --db "$TEST_DB")"
echo "$T7_OUTPUT"

if ! echo "$T7_OUTPUT" | grep -q "SYMBOLS: 156"; then
  echo "[FAIL] Test 7: expected SYMBOLS: 156" >&2
  exit 1
fi
if ! echo "$T7_OUTPUT" | grep -q "EDGES: 798"; then
  echo "[FAIL] Test 7: expected EDGES: 798" >&2
  exit 1
fi
if ! echo "$T7_OUTPUT" | grep -q "DOCS: 17"; then
  echo "[FAIL] Test 7: expected DOCS: 17" >&2
  exit 1
fi
if ! echo "$T7_OUTPUT" | grep -q "RULES: 213"; then
  echo "[FAIL] Test 7: expected RULES: 213" >&2
  exit 1
fi
if ! echo "$T7_OUTPUT" | grep -q "PITFALLS: 69"; then
  echo "[FAIL] Test 7: expected PITFALLS: 69" >&2
  exit 1
fi
echo "[PASS] Test 7 passed: aggregate statistics verified."

echo ""
echo "================================================================="
echo "VERDICT: ALL 7 VERIFICATION TESTS PASSED (exit code 0)"
echo "================================================================="
exit 0
