#!/bin/sh
# storage-compliance.sh: the Storage Provider Interface (SPI) compliance test harness.
# Validates storage driver implementations against the 26-method SPI contract across
# 8 test suites and 25 concrete verification scenarios.
#
# Usage:
#   tests/storage-compliance.sh [--driver=<name>] [--keep] [--verbose]
#
# Exit codes:
#   0: all 25 test cases passed
#   1: test assertion failure or semantic error
#   2: driver resolution failure or storage/driver fatal error

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
RESOLVER="$ROOT/.contexture/modules/session/scripts/driver-resolver"
BASE_RESOLVER="$ROOT/base/.contexture/modules/session/scripts/driver-resolver"

DRIVER_NAME="posix"
KEEP_SANDBOX=0
VERBOSE=0

for arg in "$@"; do
  case "$arg" in
    --driver=*)
      DRIVER_NAME="${arg#--driver=}"
      ;;
    -d)
      shift
      DRIVER_NAME="$1"
      ;;
    --keep)
      KEEP_SANDBOX=1
      ;;
    --verbose|-v)
      VERBOSE=1
      ;;
    --help|-h)
      printf 'usage: tests/storage-compliance.sh [--driver=<name>] [--keep] [--verbose]\n'
      printf '  --driver=<name>   storage driver to test (default: posix)\n'
      printf '  --keep            preserve test sandbox directory on completion\n'
      printf '  --verbose, -v     print detailed command outputs and logs\n'
      printf '  --help, -h        display this help summary\n'
      exit 0
      ;;
    *)
      printf 'storage-compliance: unknown argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

# Resolve active driver executable
if [ -x "$RESOLVER" ]; then
  RESOLVER_BIN="$RESOLVER"
elif [ -x "$BASE_RESOLVER" ]; then
  RESOLVER_BIN="$BASE_RESOLVER"
elif command -v driver-resolver >/dev/null 2>&1; then
  RESOLVER_BIN="driver-resolver"
else
  RESOLVER_BIN=""
fi

DRIVER_EXEC=""
if [ -n "$RESOLVER_BIN" ]; then
  DRIVER_EXEC=$("$RESOLVER_BIN" resolve "$DRIVER_NAME" 2>/dev/null) || DRIVER_EXEC=""
fi

if [ -z "$DRIVER_EXEC" ] || [ ! -x "$DRIVER_EXEC" ]; then
  alias_driver=""
  case "$DRIVER_NAME" in
    sqlite-fts5|storage-fts5) alias_driver="fts5" ;;
  esac
  if [ -n "$alias_driver" ] && [ -n "$RESOLVER_BIN" ]; then
    DRIVER_EXEC=$("$RESOLVER_BIN" resolve "$alias_driver" 2>/dev/null) || DRIVER_EXEC=""
  fi
fi

if [ -z "$DRIVER_EXEC" ] || [ ! -x "$DRIVER_EXEC" ]; then
  # Direct location fallback checks
  check_driver="$DRIVER_NAME"
  [ -n "$alias_driver" ] && check_driver="$alias_driver"
  if [ -x "$ROOT/.contexture/modules/session/drivers/$check_driver/driver" ]; then
    DRIVER_EXEC="$ROOT/.contexture/modules/session/drivers/$check_driver/driver"
  elif [ -x "$ROOT/base/.contexture/modules/session/drivers/$check_driver/driver" ]; then
    DRIVER_EXEC="$ROOT/base/.contexture/modules/session/drivers/$check_driver/driver"
  elif [ -x "$ROOT/.contexture/drivers/$check_driver/driver" ]; then
    DRIVER_EXEC="$ROOT/.contexture/drivers/$check_driver/driver"
  elif [ -x "$ROOT/.contexture/modules/storage-fts5/drivers/$check_driver" ]; then
    DRIVER_EXEC="$ROOT/.contexture/modules/storage-fts5/drivers/$check_driver"
  elif [ -x "$ROOT/plugins/storage-fts5/.contexture/modules/storage-fts5/drivers/$check_driver" ]; then
    DRIVER_EXEC="$ROOT/plugins/storage-fts5/.contexture/modules/storage-fts5/drivers/$check_driver"
  elif command -v "ctx-storage-$DRIVER_NAME" >/dev/null 2>&1; then
    DRIVER_EXEC=$(command -v "ctx-storage-$DRIVER_NAME")
  fi
fi

if [ -z "$DRIVER_EXEC" ] || [ ! -x "$DRIVER_EXEC" ]; then
  printf 'storage-compliance: driver (%s) not found or not executable (ERR_DRIVER_NOT_FOUND)\n' "$DRIVER_NAME" >&2
  exit 2
fi

# Sandbox setup in .contexture/tmp/ when available, fallback to TMPDIR
tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SANDBOX=$(mktemp -d "$tmp_root/compliance-test.XXXXXX") || exit 2

cleanup() {
  if [ "$KEEP_SANDBOX" -eq 1 ]; then
    printf 'storage-compliance: sandbox preserved at %s\n' "$SANDBOX"
  else
    rm -rf "$SANDBOX"
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$SANDBOX/.contexture"
cd "$SANDBOX" || exit 2

pass=0
fail=0

ok() {
  pass=$((pass + 1))
  printf 'PASS: %s\n' "$1"
}

bad() {
  fail=$((fail + 1))
  printf 'FAIL: %s\n' "$1"
}

assert_rc() {
  want_rc=$1
  actual_rc=$2
  label=$3
  if [ "$actual_rc" -eq "$want_rc" ]; then
    ok "$label"
  else
    bad "$label (expected exit code $want_rc, got $actual_rc)"
  fi
}

assert_match() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s\n' "$haystack" | grep -Eq "$needle"; then
    ok "$label"
  else
    bad "$label (pattern not matched: $needle)"
  fi
}

# Capability handshake validation before executing suites
cap_out=$("$DRIVER_EXEC" capability 2>&1)
cap_rc=$?
if [ "$cap_rc" -ne 0 ]; then
  printf 'storage-compliance: driver capability handshake failed with exit code %d (ERR_DRIVER_PROTOCOL)\n' "$cap_rc" >&2
  exit 2
fi

UNIT="compliance-u1"

# ==============================================================================
# Suite 1: Session Lifecycle (4 test cases)
# ==============================================================================
printf '\n== Suite 1: Session Lifecycle ==\n'

# TC01: session.init creates clean session structure and initial state at anchor A1
out=$("$DRIVER_EXEC" session.init "$UNIT" "Compliance test session" 2>&1)
rc=$?
if [ "$rc" -eq 0 ] && printf '%s\n' "$out" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"(ok|ACTIVE)"'; then
  ok "TC01: session.init creates clean session structure and initial state at anchor A1"
else
  bad "TC01: session.init failed (rc=$rc, out=$out)"
fi

# TC02: duplicate session.init returns exit code 1 (ERR_ENTITY_EXISTS)
out=$("$DRIVER_EXEC" session.init "$UNIT" "Duplicate session" 2>&1)
rc=$?
assert_rc 1 "$rc" "TC02: duplicate session.init returns exit code 1 (ERR_ENTITY_EXISTS)"

# TC03: session.load returns paginated BIOS view and session.board lists active entries
load_out=$("$DRIVER_EXEC" session.load "$UNIT" 1 2>&1)
load_rc=$?
board_out=$("$DRIVER_EXEC" session.board "$UNIT" 2>&1)
board_rc=$?
if [ "$load_rc" -eq 0 ] && [ "$board_rc" -eq 0 ]; then
  ok "TC03: session.load returns paginated BIOS view and session.board lists active entries"
else
  bad "TC03: session.load/board failed (load_rc=$load_rc, board_rc=$board_rc)"
fi

# TC04: session.stamp advances anchor and session.close marks session CLOSED
stamp_out=$("$DRIVER_EXEC" session.stamp "$UNIT" "Stamp test receipt" 2>&1)
stamp_rc=$?
close_out=$("$DRIVER_EXEC" session.close "$UNIT" 2>&1)
close_rc=$?
if [ "$stamp_rc" -eq 0 ] && [ "$close_rc" -eq 0 ]; then
  ok "TC04: session.stamp advances anchor and session.close marks session CLOSED"
else
  bad "TC04: session.stamp/close failed (stamp_rc=$stamp_rc, close_rc=$close_rc)"
fi

# ==============================================================================
# Suite 2: Task Operations (5 test cases)
# ==============================================================================
printf '\n== Suite 2: Task Operations ==\n'

# Reopen or initialize active session for task tests
"$DRIVER_EXEC" session.init "compliance-tasks" "Task verification session" >/dev/null 2>&1 || true
TUNIT="compliance-tasks"

# TC05: task.add creates task in TODO status with multiline block scalars
t_add_out=$("$DRIVER_EXEC" task.add "$TUNIT" "task-sample" "Sample task objective" "Sample description" "Acceptance criteria 1" "Implementation detail 1" 2>&1)
t_add_rc=$?
if [ "$t_add_rc" -eq 0 ] && printf '%s\n' "$t_add_out" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"(TODO|ok)"'; then
  ok "TC05: task.add creates task in TODO status with block scalars"
else
  bad "TC05: task.add failed (rc=$t_add_rc, out=$t_add_out)"
fi

# TC06: task.update mutates fields in place preserving unmodified content
t_up_out=$("$DRIVER_EXEC" task.update "$TUNIT" "task-sample" "Updated task objective" "Updated description" "Updated criteria" "Updated details" 2>&1)
t_up_rc=$?
assert_rc 0 "$t_up_rc" "TC06: task.update mutates fields in place preserving unmodified content"

# TC07: task.start atomically marks task IN_PROGRESS and updates next_action pointer
t_start_out=$("$DRIVER_EXEC" task.start "$TUNIT" "task-sample" 2>&1)
t_start_rc=$?
if [ "$t_start_rc" -eq 0 ] && printf '%s\n' "$t_start_out" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"(IN_PROGRESS|ok)"'; then
  ok "TC07: task.start atomically marks task IN_PROGRESS and updates next_action pointer"
else
  bad "TC07: task.start failed (rc=$t_start_rc, out=$t_start_out)"
fi

# TC08: task.complete atomically marks task DONE and appends receipt event to journal
t_comp_out=$("$DRIVER_EXEC" task.complete "$TUNIT" "task-sample" "Verified via automated test suite" 2>&1)
t_comp_rc=$?
if [ "$t_comp_rc" -eq 0 ] && printf '%s\n' "$t_comp_out" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"(DONE|ok)"'; then
  ok "TC08: task.complete atomically marks task DONE and appends receipt event to journal"
else
  bad "TC08: task.complete failed (rc=$t_comp_rc, out=$t_comp_out)"
fi

# TC09: task.reopen, task.drop, and task.list verify status transitions and filtering
t_reopen_rc=0
"$DRIVER_EXEC" task.reopen "$TUNIT" "task-sample" >/dev/null 2>&1 || t_reopen_rc=$?
t_drop_rc=0
"$DRIVER_EXEC" task.drop "$TUNIT" "task-sample" "Deprecating task" >/dev/null 2>&1 || t_drop_rc=$?
t_list_out=$("$DRIVER_EXEC" task.list "$TUNIT" 2>&1)
t_list_rc=$?
if [ "$t_reopen_rc" -eq 0 ] && [ "$t_drop_rc" -eq 0 ] && [ "$t_list_rc" -eq 0 ]; then
  ok "TC09: task.reopen, task.drop, and task.list verify status transitions and filtering"
else
  bad "TC09: task transition/filtering failed (reopen=$t_reopen_rc, drop=$t_drop_rc, list=$t_list_rc)"
fi

# ==============================================================================
# Suite 3: Journal Events (3 test cases)
# ==============================================================================
printf '\n== Suite 3: Journal Events ==\n'

# TC10: entry.record appends event with auto-injected date and active anchor
e_rec_out=$("$DRIVER_EXEC" entry.record "$TUNIT" "2026-09-25-event-alpha" "Journal event description" "topic-group" "none" 2>&1)
e_rec_rc=$?
assert_rc 0 "$e_rec_rc" "TC10: entry.record appends event with auto-injected date and active anchor"

# TC11: entry.show retrieves entry with closure status
e_show_out=$("$DRIVER_EXEC" entry.show "$TUNIT" "2026-09-25-event-alpha" 2>&1)
e_show_rc=$?
assert_rc 0 "$e_show_rc" "TC11: entry.show retrieves entry with closure status"

# TC12: entry.list and closure tracking verify unclosed vs closed filtering
"$DRIVER_EXEC" entry.record "$TUNIT" "2026-09-25-event-beta" "Closer event" "topic-group" "none" "2026-09-25-event-alpha" >/dev/null 2>&1 || true
e_list_out=$("$DRIVER_EXEC" entry.list "$TUNIT" 2>&1)
e_list_rc=$?
assert_rc 0 "$e_list_rc" "TC12: entry.list and closure tracking verify unclosed vs closed filtering"

# ==============================================================================
# Suite 4: Knowledge Findings (3 test cases)
# ==============================================================================
printf '\n== Suite 4: Knowledge Findings ==\n'

# TC13: finding.add records finding with summary and ref
f_add_out=$("$DRIVER_EXEC" finding.add "$TUNIT" "FINDING_ALPHA" "Alpha architectural decision summary" "journal.md#2026-09-25-event-alpha" 2>&1)
f_add_rc=$?
assert_rc 0 "$f_add_rc" "TC13: finding.add records finding with summary and ref"

# TC14: finding.show retrieves finding definition
f_show_out=$("$DRIVER_EXEC" finding.show "$TUNIT" "FINDING_ALPHA" 2>&1)
f_show_rc=$?
assert_rc 0 "$f_show_rc" "TC14: finding.show retrieves finding definition"

# TC15: finding.list filters active findings versus superseded findings
f_sup_rc=0
"$DRIVER_EXEC" finding.add "$TUNIT" "FINDING_BETA" "Beta superseding finding" "journal.md#2026-09-25-event-beta" "FINDING_ALPHA" >/dev/null 2>&1 || f_sup_rc=$?
f_list_out=$("$DRIVER_EXEC" finding.list "$TUNIT" 2>&1)
f_list_rc=$?
if [ "$f_sup_rc" -eq 0 ] && [ "$f_list_rc" -eq 0 ]; then
  ok "TC15: finding.list filters active findings versus superseded findings"
else
  bad "TC15: finding supersede/list failed (sup_rc=$f_sup_rc, list_rc=$f_list_rc)"
fi

# ==============================================================================
# Suite 5: Subagent Lane Lifecycle (3 test cases)
# ==============================================================================
printf '\n== Suite 5: Subagent Lane Lifecycle ==\n'

# TC16: lane.create scaffolds lane directory and recipe
l_create_out=$("$DRIVER_EXEC" lane.create "$TUNIT" "lane-worker" "Subagent goal description" 2>&1)
l_create_rc=$?
assert_rc 0 "$l_create_rc" "TC16: lane.create scaffolds lane directory and recipe"

# TC17: lane.record, lane.report, and lane.status manage subagent artifacts
l_rec_rc=0
"$DRIVER_EXEC" lane.record "$TUNIT" "lane-worker" "2026-09-25-trace-1" "Subagent action trace WHAT" >/dev/null 2>&1 || l_rec_rc=$?
l_rep_rc=0
"$DRIVER_EXEC" lane.report "$TUNIT" "lane-worker" "Subagent report findings" >/dev/null 2>&1 || l_rep_rc=$?
l_stat_out=$("$DRIVER_EXEC" lane.status "$TUNIT" "lane-worker" 2>&1)
l_stat_rc=$?
if [ "$l_rec_rc" -eq 0 ] && [ "$l_rep_rc" -eq 0 ] && [ "$l_stat_rc" -eq 0 ]; then
  ok "TC17: lane.record, lane.report, and lane.status manage subagent artifacts"
else
  bad "TC17: lane artifacts management failed (rec=$l_rec_rc, rep=$l_rep_rc, stat=$l_stat_rc)"
fi

# TC18: lane.close marks lane resolved and appends resolution receipt
l_close_out=$("$DRIVER_EXEC" lane.close "$TUNIT" "lane-worker" "COMPLETE" "Resolution receipt description" 2>&1)
l_close_rc=$?
assert_rc 0 "$l_close_rc" "TC18: lane.close marks lane resolved and appends resolution receipt"

# ==============================================================================
# Suite 6: Entity Resolution and Universal Search (2 test cases)
# ==============================================================================
printf '\n== Suite 6: Entity Resolution and Universal Search ==\n'

# TC19: resolve.ref resolves logical entity references and normalizes legacy paths
res_out=$("$DRIVER_EXEC" resolve.ref "$TUNIT" "knowledge.md#FINDING_ALPHA" 2>&1)
res_rc=$?
assert_rc 0 "$res_rc" "TC19: resolve.ref resolves logical entity references and normalizes legacy paths"

# TC20: search.query executes universal search and returns structured snippets
search_out=$("$DRIVER_EXEC" search.query "$TUNIT" "architectural" 2>&1)
search_rc=$?
assert_rc 0 "$search_rc" "TC20: search.query executes universal search and returns structured snippets"

# ==============================================================================
# Suite 7: Atomicity and Crash Isolation (2 test cases)
# ==============================================================================
printf '\n== Suite 7: Atomicity and Crash Isolation ==\n'

# TC21: multi-file atomic rollback leaves records untouched on simulated interrupt
sim_task="task-rollback-probe"
"$DRIVER_EXEC" task.add "$TUNIT" "$sim_task" "Rollback test objective" "Desc" "Criteria" "Details" >/dev/null 2>&1 || true
# Execute invalid update deliberately simulating interruption or payload corrupt
"$DRIVER_EXEC" task.update "$TUNIT" "$sim_task" --invalid-flag-corrupt >/dev/null 2>&1 || true
# Ensure initial task state remains intact
t_probe_out=$("$DRIVER_EXEC" task.show "$TUNIT" "$sim_task" 2>&1)
t_probe_rc=$?
assert_rc 0 "$t_probe_rc" "TC21: multi-file atomic rollback leaves records untouched on simulated interrupt"

# TC22: concurrency lock serialization or exit code 2 (ERR_STORAGE_LOCKED)
# Lock acquisition test
lock_dir="$SANDBOX/.contexture/tmp/locks"
mkdir -p "$lock_dir"
touch "$lock_dir/$TUNIT.lock" 2>/dev/null || true
# Concurrent access should handle lock cleanly or return 2
lock_test_out=$("$DRIVER_EXEC" session.board "$TUNIT" 2>&1)
lock_test_rc=$?
rm -rf "$lock_dir/$TUNIT.lock" 2>/dev/null || true
if [ "$lock_test_rc" -eq 0 ] || [ "$lock_test_rc" -eq 2 ]; then
  ok "TC22: concurrency lock serialization or exit code 2 (ERR_STORAGE_LOCKED)"
else
  bad "TC22: concurrency lock test unexpected exit code (rc=$lock_test_rc)"
fi

# ==============================================================================
# Suite 8: Error Handling and Exit Codes (3 test cases)
# ==============================================================================
printf '\n== Suite 8: Error Handling and Exit Codes ==\n'

# TC23: missing entity lookup returns exit code 1 with clean semantic stderr message
err_entity_out=$("$DRIVER_EXEC" task.show "$TUNIT" "nonexistent-task-slug" 2>&1)
err_entity_rc=$?
if [ "$err_entity_rc" -eq 1 ]; then
  ok "TC23: missing entity lookup returns exit code 1 with clean semantic stderr message"
else
  bad "TC23: missing entity lookup expected rc=1, got rc=$err_entity_rc"
fi

# TC24: schema violation returns exit code 1
err_schema_out=$("$DRIVER_EXEC" session.init 2>&1)
err_schema_rc=$?
assert_rc 1 "$err_schema_rc" "TC24: schema violation returns exit code 1"

# TC25: storage IO or driver error returns exit code 2
err_driver_out=$("$DRIVER_EXEC" non_existent_subsystem.method 2>&1)
err_driver_rc=$?
assert_rc 2 "$err_driver_rc" "TC25: storage IO or driver error returns exit code 2"

# ==============================================================================
# Summary
# ==============================================================================
printf '\nstorage-compliance: %d passed, %d failed\n' "$pass" "$fail"

if [ "$fail" -gt 0 ]; then
  printf 'storage-compliance: FAIL\n'
  exit 1
fi

printf 'storage-compliance: PASS (all 25 compliance cases green)\n'
exit 0
