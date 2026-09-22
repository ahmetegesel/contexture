#!/usr/bin/env bash
# AST and Documentation Graph Pilot Verification Script
# Validates end-to-end extraction, indexing, and retrieval against bilingo-mvp.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_DRIVER="$SCRIPT_DIR/../.contexture/modules/ast-doc-graph/bin/ast-doc-index"
GRAPH_QUERY="$SCRIPT_DIR/../.contexture/modules/ast-doc-graph/bin/graph-query"

# needs: the pilot repository, sqlite3, and a Node/tsx runner
if [[ ! -x /usr/bin/sqlite3 ]] && ! command -v sqlite3 >/dev/null 2>&1; then
  echo "SKIP: sqlite3 not found"
  exit 77
fi
if ! command -v node >/dev/null 2>&1 && ! command -v tsx >/dev/null 2>&1; then
  echo "SKIP: neither node nor tsx found (the extractors need a TypeScript runner)"
  exit 77
fi

REPO_ROOT="${1:-${AST_DOC_GRAPH_PILOT:-}}"
if [[ -z "$REPO_ROOT" ]]; then
  echo "SKIP: pilot repository not provided (pass it as the first argument or set AST_DOC_GRAPH_PILOT)"
  exit 77
fi

# scratch: the workspace's .contexture/tmp/ when writable, the system temp otherwise
TMP_BASE="${AST_DOC_GRAPH_TMP:-}"
WS_ROOT="$SCRIPT_DIR/../../.."
if [[ -z "$TMP_BASE" ]] && [[ -d "$WS_ROOT/.contexture" ]] && mkdir -p "$WS_ROOT/.contexture/tmp" 2>/dev/null && [[ -w "$WS_ROOT/.contexture/tmp" ]]; then
  TMP_BASE="$WS_ROOT/.contexture/tmp"
fi
[[ -n "$TMP_BASE" ]] || TMP_BASE="${TMPDIR:-/tmp}"

TEST_DB="${2:-$TMP_BASE/bilingo-pilot-verify.db}"

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

# Step 10: Setup sandbox environment for delta and JIT verification
echo ""
echo "--- STEP 10: Preparing isolated pilot sandbox for delta and JIT tests ---"
PILOT_SANDBOX="$(mktemp -d "$TMP_BASE/bilingo-pilot-delta-XXXXXX")"
trap 'rm -rf "$PILOT_SANDBOX"' EXIT INT TERM

if [[ -f "$REPO_ROOT/package.json" ]]; then
  cp "$REPO_ROOT/package.json" "$PILOT_SANDBOX/package.json"
fi

if [[ -d "$REPO_ROOT/node_modules" ]]; then
  ln -s "$REPO_ROOT/node_modules" "$PILOT_SANDBOX/node_modules"
fi

cp -R "$REPO_ROOT/backend" "$PILOT_SANDBOX/backend"
cp -R "$REPO_ROOT/docs" "$PILOT_SANDBOX/docs"

SANDBOX_DB="$PILOT_SANDBOX/graph.db"
cp "$TEST_DB" "$SANDBOX_DB"
sleep 1
touch "$SANDBOX_DB"
echo "[PASS] Sandbox prepared at $PILOT_SANDBOX with database cloned."

# Step 11: Test 8 (ast-doc-index --delta on a single modified file)
echo ""
echo "--- TEST 8: ast-doc-index --delta on single modified file ---"
sleep 1
cat << 'EOF' >> "$PILOT_SANDBOX/backend/core/cascadeCore.ts"

export const PilotDeltaVerification = {
  verifyDeltaSync: (code: string): boolean => {
    return code.length > 0;
  },
};
EOF

"$INDEX_DRIVER" \
  --repo-root "$PILOT_SANDBOX" \
  --src-dir backend \
  --db "$SANDBOX_DB" \
  --delta "$PILOT_SANDBOX/backend/core/cascadeCore.ts"

T8_OUTPUT="$("$GRAPH_QUERY" symbol PilotDeltaVerification.verifyDeltaSync --db "$SANDBOX_DB")"
echo "$T8_OUTPUT"

if ! echo "$T8_OUTPUT" | grep -q "LOCATION: backend/core/cascadeCore.ts"; then
  echo "[FAIL] Test 8: missing definition location in delta index" >&2
  exit 1
fi
if ! echo "$T8_OUTPUT" | grep -q "PilotDeltaVerification.verifyDeltaSync"; then
  echo "[FAIL] Test 8: missing symbol name in delta index" >&2
  exit 1
fi

# Confirm unrelated symbols remain present
T8_UNRELATED="$("$GRAPH_QUERY" symbol SessionService.startSession --db "$SANDBOX_DB")"
if ! echo "$T8_UNRELATED" | grep -q "LOCATION: backend/services/sessionService.ts"; then
  echo "[FAIL] Test 8: delta update pruned unrelated symbol SessionService.startSession" >&2
  exit 1
fi

T8_INDEXED="$("$SQLITE_BIN" "$SANDBOX_DB" "SELECT count(*) FROM indexed_files WHERE file = 'backend/core/cascadeCore.ts';")"
if [[ "$T8_INDEXED" -ne 1 ]]; then
  echo "[FAIL] Test 8: indexed_files record missing for backend/core/cascadeCore.ts" >&2
  exit 1
fi
echo "[PASS] Test 8 passed: delta indexing updated single modified file and preserved database integrity."

# Step 12: Test 9 (JIT micro-sync in graph-query on single modified file)
echo ""
echo "--- TEST 9: graph-query JIT micro-sync on single modified file ---"
sleep 1
cat << 'EOF' >> "$PILOT_SANDBOX/backend/services/sessionService.ts"

export const PilotJitVerification = {
  verifyJitFreshness: (id: string, active: boolean): string => {
    return active ? id : "inactive";
  },
};
EOF

T9_BEFORE="$("$SQLITE_BIN" "$SANDBOX_DB" "SELECT count(*) FROM symbols WHERE qname = 'PilotJitVerification.verifyJitFreshness';")"
if [[ "$T9_BEFORE" -ne 0 ]]; then
  echo "[FAIL] Test 9: symbol unexpectedly existed prior to JIT sync" >&2
  exit 1
fi

T9_OUTPUT="$("$GRAPH_QUERY" symbol PilotJitVerification.verifyJitFreshness --db "$SANDBOX_DB")"
echo "$T9_OUTPUT"

if ! echo "$T9_OUTPUT" | grep -q "LOCATION: backend/services/sessionService.ts"; then
  echo "[FAIL] Test 9: JIT sync did not index PilotJitVerification.verifyJitFreshness" >&2
  exit 1
fi
echo "[PASS] Test 9 passed: graph-query performed inline JIT micro-sync on dirty file."

# Step 13: Test 10 (JIT non-blocking advisory notice when 3+ files are dirty)
echo ""
echo "--- TEST 10: graph-query JIT advisory notice on 3+ dirty files ---"
sleep 1
echo "// dirty marker 1" >> "$PILOT_SANDBOX/backend/core/cascadeCore.ts"
echo "// dirty marker 2" >> "$PILOT_SANDBOX/backend/services/sessionService.ts"
echo "// dirty marker 3" >> "$PILOT_SANDBOX/docs/toisto/cascade-protocol.md"

T10_STDERR="$PILOT_SANDBOX/jit_advisory_stderr.log"
T10_OUTPUT="$("$GRAPH_QUERY" symbol CascadeCore.startSession --db "$SANDBOX_DB" 2> "$T10_STDERR")"

if ! echo "$T10_OUTPUT" | grep -q "CascadeCore.startSession"; then
  echo "[FAIL] Test 10: query failed while evaluating advisory condition" >&2
  exit 1
fi

T10_STDERR_CONTENT="$(cat "$T10_STDERR")"
echo "Observed stderr: $T10_STDERR_CONTENT"

if ! echo "$T10_STDERR_CONTENT" | grep -q "3 files modified since last index. Run ast-doc-index --delta to refresh"; then
  echo "[FAIL] Test 10: advisory notice missing or malformed: $T10_STDERR_CONTENT" >&2
  exit 1
fi
echo "[PASS] Test 10 passed: graph-query emitted non-blocking advisory notice for 3 dirty files."

echo ""
echo "================================================================="
echo "VERDICT: ALL 10 VERIFICATION TESTS PASSED (exit code 0)"
echo "================================================================="
exit 0
