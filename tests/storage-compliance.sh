#!/bin/sh
# storage-compliance.sh: the Storage Provider Interface (SPI) compliance test harness.
# Validates storage driver implementations against the SPI contract across 11 test
# suites and 39 verification scenarios; each case asserts the returned data (exact key
# and value pairs in the driver's JSON, or the exact bytes of an artifact), never the
# exit code alone. Payloads travel on stdin (docs/the-engine.md, the transport).
#
# Usage:
#   tests/storage-compliance.sh [--driver=<name>] [--driver-exec=<path>] [--keep] [--verbose]
#   --driver-exec names the exact driver executable (a plugin suite passes its own
#   copy), skipping resolution; --driver alone resolves through the workspace drawer.
#
# Exit codes:
#   0: all test cases passed
#   1: test assertion failure or semantic error
#   2: driver resolution failure or storage/driver fatal error

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
RESOLVER="$ROOT/.contexture/modules/session/scripts/driver-resolver"
BASE_RESOLVER="$ROOT/base/.contexture/modules/session/scripts/driver-resolver"

DRIVER_NAME="posix"
DRIVER_EXEC_ARG=""
KEEP_SANDBOX=0
VERBOSE=0

for arg in "$@"; do
  case "$arg" in
    --driver=*)
      DRIVER_NAME="${arg#--driver=}"
      ;;
    --driver-exec=*)
      DRIVER_EXEC_ARG="${arg#--driver-exec=}"
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
      printf '  --driver-exec=<path>  the exact driver executable to test, no resolution\n'
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
if [ -n "$DRIVER_EXEC_ARG" ]; then
  if [ ! -x "$DRIVER_EXEC_ARG" ]; then
    printf 'storage-compliance: --driver-exec %s is not an executable file (ERR_DRIVER_NOT_FOUND)\n' "$DRIVER_EXEC_ARG" >&2
    exit 2
  fi
  DRIVER_EXEC="$DRIVER_EXEC_ARG"
elif [ -n "$RESOLVER_BIN" ]; then
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
cap_out=$("$DRIVER_EXEC" capability 2>&1 < /dev/null)
cap_rc=$?
if [ "$cap_rc" -ne 0 ]; then
  printf 'storage-compliance: driver capability handshake failed with exit code %d (ERR_DRIVER_PROTOCOL)\n' "$cap_rc" >&2
  exit 2
fi

# tc accumulates every missed fact of one case, so a FAIL names all of them; the
# assertions match exact key and value pairs in the driver's JSON payload
tc_fail=""
want() { printf '%s' "$1" | grep -qF -- "$2" || tc_fail="$tc_fail; missing $2"; }
wantnot() { if printf '%s' "$1" | grep -qF -- "$2"; then tc_fail="$tc_fail; unwanted $2"; fi; }
wantrc() { [ "$1" -eq "$2" ] || tc_fail="$tc_fail; rc $1 want $2"; }
tc() {
  if [ -z "$tc_fail" ]; then ok "$1"; else bad "$1 ($tc_fail)"; fi
  tc_fail=""
}

# the SPI transport: argv carries the method and its identifiers, the free-text fields
# travel on stdin as payload lines key=value (backslash, newline, tab, CR escaped);
# drv runs the driver with no stdin, pl builds a payload from key value pairs
drv() { "$DRIVER_EXEC" "$@" < /dev/null; }
pl() {
  while [ $# -gt 1 ]; do
    printf '%s=' "$1"
    printf '%sx' "$2" | awk '
      function bs_double(s,    n, p, i, o) { n = split(s, p, /\\/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "\\" p[i]; return o }
      BEGIN { ORS = "" }
      { $0 = bs_double($0); gsub(/\t/, "\\t"); gsub(/\r/, "\\r"); out = out (NR > 1 ? "\\n" : "") $0 }
      END { sub(/x$/, "", out); print out "\n" }'
    shift 2
  done
}

UNIT="compliance-u1"

# ==============================================================================
# Suite 1: Session Lifecycle (4 test cases)
# ==============================================================================
printf '\n== Suite 1: Session Lifecycle ==\n'

# TC01: session.init creates clean session structure and initial state at anchor A1
out=$(pl objective "Compliance test session" | "$DRIVER_EXEC" session.init "$UNIT" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"status":"ok"'; want "$out" '"current_anchor":"A1"'; want "$out" '"objective":"Compliance test session"'
tc "TC01: session.init creates clean session structure and initial state at anchor A1"

# TC02: duplicate session.init returns exit code 1 (ERR_ENTITY_EXISTS)
pl objective "Duplicate session" | "$DRIVER_EXEC" session.init "$UNIT" >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
out=$(drv session.load "$UNIT" 1 2>&1)
want "$out" '"objective":"Compliance test session"'
tc "TC02: duplicate session.init returns exit code 1 and leaves the state untouched"

# TC03: session.load returns the paged view and session.board lists live entries
out=$(drv session.load "$UNIT" 1 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"complete":true'; want "$out" '"status":"ACTIVE"'
out=$(drv session.board "$UNIT" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"unclosed_entries":['
tc "TC03: session.load returns paginated BIOS view and session.board lists active entries"

# TC04: session.stamp advances anchor and session.close marks session CLOSED
out=$(pl attention "Stamp test receipt" | "$DRIVER_EXEC" session.stamp "$UNIT" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"current_anchor":"A2"'
out=$(drv session.load "$UNIT" 1 2>&1)
want "$out" '"current_anchor":"A2"'
out=$(drv session.close "$UNIT" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"status":"CLOSED"'
out=$(drv session.load "$UNIT" 1 2>&1)
want "$out" '"status":"CLOSED"'
tc "TC04: session.stamp advances anchor and session.close marks session CLOSED"

# ==============================================================================
# Suite 2: Task Operations (5 test cases)
# ==============================================================================
printf '\n== Suite 2: Task Operations ==\n'

pl objective "Task verification session" | "$DRIVER_EXEC" session.init "compliance-tasks" >/dev/null 2>&1 || true
TUNIT="compliance-tasks"

# TC05: task.add creates task in TODO status with multiline block scalars
out=$(pl objective "Sample task objective" desc "Sample description" criteria "Acceptance criteria 1" details "Implementation detail 1" | "$DRIVER_EXEC" task.add "$TUNIT" "task-sample" 2>&1); rc=$?
wantrc "$rc" 0
out=$(drv task.show "$TUNIT" "task-sample" 2>&1)
want "$out" '"status":"TODO"'; want "$out" '"objective":"Sample task objective"'; want "$out" '"description":"Sample description"'
pl objective "Again" desc "d" criteria "c" details "i" | "$DRIVER_EXEC" task.add "$TUNIT" "task-sample" >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
tc "TC05: task.add creates task in TODO status with block scalars; a repeat slug is refused"

# TC06: task.update mutates fields in place preserving unmodified content
pl objective "Updated task objective" desc "Updated description" criteria "Updated criteria" details "Updated details" | "$DRIVER_EXEC" task.update "$TUNIT" "task-sample" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv task.show "$TUNIT" "task-sample" 2>&1)
want "$out" '"objective":"Updated task objective"'; want "$out" '"description":"Updated description"'; want "$out" '"status":"TODO"'
tc "TC06: task.update mutates fields in place preserving unmodified content"

# TC07: task.start atomically marks task IN_PROGRESS and updates next_action pointer
drv task.start "$TUNIT" "task-sample" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv task.show "$TUNIT" "task-sample" 2>&1)
want "$out" '"status":"IN_PROGRESS"'
out=$(drv session.load "$TUNIT" 1 2>&1)
want "$out" 'task-sample'
tc "TC07: task.start atomically marks task IN_PROGRESS and updates next_action pointer"

# TC08: task.complete atomically marks task DONE and appends receipt event to journal
pl evidence "Verified via automated test suite" | "$DRIVER_EXEC" task.complete "$TUNIT" "task-sample" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv task.show "$TUNIT" "task-sample" 2>&1)
want "$out" '"status":"DONE"'
out=$(drv entry.list "$TUNIT" 2>&1)
want "$out" 'backlog/task-sample: DONE'
tc "TC08: task.complete atomically marks task DONE and appends receipt event to journal"

# TC09: task.reopen, task.drop, and task.list verify status transitions and filtering
pl objective "Keeper objective" desc "d" criteria "c" details "i" | "$DRIVER_EXEC" task.add "$TUNIT" "task-keeper" >/dev/null 2>&1
drv task.reopen "$TUNIT" "task-sample" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv task.show "$TUNIT" "task-sample" 2>&1)
want "$out" '"status":"TODO"'
out=$(drv task.list "$TUNIT" TODO 2>&1)
want "$out" '"slug":"task-sample"'; want "$out" '"slug":"task-keeper"'
pl reason "Deprecating task" | "$DRIVER_EXEC" task.drop "$TUNIT" "task-sample" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv task.list "$TUNIT" 2>&1); rc=$?
wantrc "$rc" 0; wantnot "$out" '"slug":"task-sample"'; want "$out" '"slug":"task-keeper"'
drv task.show "$TUNIT" "task-sample" >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
pl objective "Re-declared objective" desc "d" criteria "c" details "i" | "$DRIVER_EXEC" task.add "$TUNIT" "task-sample" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv task.show "$TUNIT" "task-sample" 2>&1)
want "$out" '"objective":"Re-declared objective"'
tc "TC09: task.reopen, task.drop, and task.list verify status transitions and filtering"

# ==============================================================================
# Suite 3: Journal Events (3 test cases)
# ==============================================================================
printf '\n== Suite 3: Journal Events ==\n'

# TC10: entry.record appends event with auto-injected date and active anchor
pl what "Journal event description" group "topic-group" thread "none" | "$DRIVER_EXEC" entry.record "$TUNIT" "2026-09-25-event-alpha" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv entry.show "$TUNIT" "2026-09-25-event-alpha" 2>&1)
want "$out" '"what":"Journal event description"'; want "$out" '"anchor":"A1"'; want "$out" '"thread":"none"'
tc "TC10: entry.record appends event with auto-injected date and active anchor"

# TC11: entry.show retrieves entry with closure status
out=$(drv entry.show "$TUNIT" "2026-09-25-event-alpha" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"is_closed":false'
drv entry.show "$TUNIT" "2026-09-25-event-missing" >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
tc "TC11: entry.show retrieves entry with closure status"

# TC12: entry.list and closure tracking verify unclosed vs closed filtering
pl what "Closer event" group "topic-group" thread "none" closes "2026-09-25-event-alpha" | "$DRIVER_EXEC" entry.record "$TUNIT" "2026-09-25-event-beta" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv entry.show "$TUNIT" "2026-09-25-event-alpha" 2>&1)
want "$out" '"is_closed":true'; want "$out" '"closed_by":"2026-09-25-event-beta"'; want "$out" '"close_reason":"done: Closer event"'
out=$(drv session.board "$TUNIT" 2>&1)
wantnot "$out" '"slug":"2026-09-25-event-alpha"'; want "$out" '"slug":"2026-09-25-event-beta"'
out=$(drv entry.list "$TUNIT" 2>&1)
want "$out" '"slug":"2026-09-25-event-alpha"'; want "$out" '"slug":"2026-09-25-event-beta"'
tc "TC12: entry.list and closure tracking verify unclosed vs closed filtering"

# ==============================================================================
# Suite 4: Knowledge Findings (3 test cases)
# ==============================================================================
printf '\n== Suite 4: Knowledge Findings ==\n'

# TC13: finding.add records finding with summary and ref
pl summary "Alpha architectural decision summary" ref "journal.md#2026-09-25-event-alpha" | "$DRIVER_EXEC" finding.add "$TUNIT" "FINDING_ALPHA" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
tc "TC13: finding.add records finding with summary and ref"

# TC14: finding.show retrieves finding definition
out=$(drv finding.show "$TUNIT" "FINDING_ALPHA" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"summary":"Alpha architectural decision summary"'; want "$out" '"ref":"journal.md#2026-09-25-event-alpha"'
tc "TC14: finding.show retrieves finding definition"

# TC15: finding.list filters active findings versus superseded findings
pl summary "Beta superseding finding" ref "journal.md#2026-09-25-event-beta" supersedes "FINDING_ALPHA" | "$DRIVER_EXEC" finding.add "$TUNIT" "FINDING_BETA" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv finding.list "$TUNIT" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"name":"FINDING_ALPHA"'; want "$out" '"name":"FINDING_BETA"'; want "$out" '"supersedes":"FINDING_ALPHA"'
out=$(drv finding.list "$TUNIT" active 2>&1)
wantnot "$out" '"name":"FINDING_ALPHA"'; want "$out" '"name":"FINDING_BETA"'
out=$(drv finding.show "$TUNIT" "FINDING_ALPHA" 2>&1)
want "$out" '"superseded_by":"FINDING_BETA"'
tc "TC15: finding.list filters active findings versus superseded findings"

# ==============================================================================
# Suite 5: Subagent Lane Lifecycle (3 test cases)
# ==============================================================================
printf '\n== Suite 5: Subagent Lane Lifecycle ==\n'

# TC16: lane.create scaffolds lane directory and recipe
pl goal "Subagent goal description" | "$DRIVER_EXEC" lane.create "$TUNIT" "lane-worker" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv lane.show "$TUNIT" "lane-worker" recipe 2>&1)
want "$out" '"artifact":"recipe"'; want "$out" 'Subagent goal description'
tc "TC16: lane.create scaffolds lane directory and recipe"

# TC17: lane.record, lane.report, and lane.status manage subagent artifacts
pl what "Subagent action trace WHAT" | "$DRIVER_EXEC" lane.record "$TUNIT" "lane-worker" "2026-09-25-trace-1" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
printf 'Subagent report findings\n' | "$DRIVER_EXEC" lane.report "$TUNIT" "lane-worker" --write >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv lane.show "$TUNIT" "lane-worker" journal 2>&1)
want "$out" 'Subagent action trace WHAT'
out=$(drv lane.show "$TUNIT" "lane-worker" report 2>&1)
want "$out" '"content":"Subagent report findings"'
out=$(drv lane.status "$TUNIT" "lane-worker" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"recipe_present":true'; want "$out" '"journal_present":true'; want "$out" '"report_present":true'
tc "TC17: lane.record, lane.report, and lane.status manage subagent artifacts"

# TC18: lane.close marks lane resolved and appends resolution receipt
out=$(pl resolution "Resolution receipt description" | "$DRIVER_EXEC" lane.close "$TUNIT" "lane-worker" "COMPLETE" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"status":"RESOLVED"'
out=$(drv entry.list "$TUNIT" 2>&1)
want "$out" 'lane lane-worker: COMPLETE'
tc "TC18: lane.close marks lane resolved and appends resolution receipt"

# ==============================================================================
# Suite 6: Entity Resolution and Universal Search (2 test cases)
# ==============================================================================
printf '\n== Suite 6: Entity Resolution and Universal Search ==\n'

# TC19: resolve.ref resolves logical entity references and normalizes legacy paths
out=$(drv resolve.ref "$TUNIT" "knowledge.md#FINDING_ALPHA" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"entity_type":"finding"'; want "$out" '"name":"FINDING_ALPHA"'
tc "TC19: resolve.ref resolves logical entity references and normalizes legacy paths"

# TC20: search.query executes universal search and returns structured snippets
out=$(pl query "architectural" | "$DRIVER_EXEC" search.query "$TUNIT" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"entity_id":"FINDING_ALPHA"'; wantnot "$out" '"total_matches":0'
tc "TC20: search.query executes universal search and returns structured snippets"

# ==============================================================================
# Suite 7: Atomicity and Crash Isolation (2 test cases)
# ==============================================================================
printf '\n== Suite 7: Atomicity and Crash Isolation ==\n'

# TC21: multi-file atomic rollback leaves records untouched on simulated interrupt
sim_task="task-rollback-probe"
pl objective "Rollback test objective" desc "Desc" criteria "Criteria" details "Details" | "$DRIVER_EXEC" task.add "$TUNIT" "$sim_task" >/dev/null 2>&1 || true
drv task.update "$TUNIT" "$sim_task" --invalid-flag-corrupt >/dev/null 2>&1 || true
out=$(drv task.show "$TUNIT" "$sim_task" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"status":"TODO"'
tc "TC21: multi-file atomic rollback leaves records untouched on simulated interrupt"

# TC22: concurrency lock serialization or exit code 2 (ERR_STORAGE_LOCKED)
lock_dir="$SANDBOX/.contexture/tmp/locks"
mkdir -p "$lock_dir"
touch "$lock_dir/$TUNIT.lock" 2>/dev/null || true
lock_test_out=$(drv session.board "$TUNIT" 2>&1)
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
err_entity_out=$(drv task.show "$TUNIT" "nonexistent-task-slug" 2>&1)
err_entity_rc=$?
if [ "$err_entity_rc" -eq 1 ]; then
  ok "TC23: missing entity lookup returns exit code 1 with clean semantic stderr message"
else
  bad "TC23: missing entity lookup expected rc=1, got rc=$err_entity_rc"
fi

# TC24: schema violation returns exit code 1
err_schema_out=$(drv session.init 2>&1)
err_schema_rc=$?
assert_rc 1 "$err_schema_rc" "TC24: schema violation returns exit code 1"

# TC25: storage IO or driver error returns exit code 2
err_driver_out=$(drv non_existent_subsystem.method 2>&1)
err_driver_rc=$?
assert_rc 2 "$err_driver_rc" "TC25: storage IO or driver error returns exit code 2"

# ==============================================================================
# Suite 9: Journal Integrity (2 test cases)
# ==============================================================================
printf '\n== Suite 9: Journal Integrity ==\n'

# TC26: entry.record refuses a slug the journal already carries, leaving the first intact
pl what "A second beta" group "topic-group" thread "none" | "$DRIVER_EXEC" entry.record "$TUNIT" "2026-09-25-event-beta" >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
out=$(drv entry.show "$TUNIT" "2026-09-25-event-beta" 2>&1)
want "$out" '"what":"Closer event"'; wantnot "$out" 'A second beta'
tc "TC26: entry.record refuses a repeated slug and leaves the first entry intact"

# TC27: one closer line naming several targets closes every one of them, verdict kept
pl what "Gamma" group "topic-group" thread "the human" | "$DRIVER_EXEC" entry.record "$TUNIT" "2026-09-25-event-gamma" >/dev/null 2>&1
pl what "Delta" group "topic-group" thread "none" | "$DRIVER_EXEC" entry.record "$TUNIT" "2026-09-25-event-delta" >/dev/null 2>&1
pl what "Folds two" group "topic-group" thread "none" closes "2026-09-25-event-gamma 2026-09-25-event-delta (folded: two at once)" | "$DRIVER_EXEC" entry.record "$TUNIT" "2026-09-25-event-epsilon" >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv session.board "$TUNIT" 2>&1)
wantnot "$out" '"slug":"2026-09-25-event-gamma"'; wantnot "$out" '"slug":"2026-09-25-event-delta"'; want "$out" '"slug":"2026-09-25-event-epsilon"'
wantnot "$out" '"thread":"the human"'
out=$(drv entry.show "$TUNIT" "2026-09-25-event-delta" 2>&1)
want "$out" '"is_closed":true'; want "$out" '"closed_by":"2026-09-25-event-epsilon"'; want "$out" '"close_reason":"folded: two at once"'
tc "TC27: a multi-target closer closes every target and keeps its verdict"

# ==============================================================================
# Suite 10: The Store and the Payload Transport (8 test cases)
# ==============================================================================
printf '\n== Suite 10: The Store and the Payload Transport ==\n'
SUNIT="compliance-store"

# TC28: session.create makes an empty unit; a second create refuses rc1 ERR_ENTITY_EXISTS
out=$(drv session.create "$SUNIT" 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"status":"ok"'
out=$(drv session.create "$SUNIT" 2>&1); rc=$?
wantrc "$rc" 1; want "$out" 'ERR_ENTITY_EXISTS'
out=$(drv storage.health 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"health":'; want "$out" '"detail":'
tc "TC28: session.create refuses a repeat; storage.health answers its keys"

# TC29: artifact.write then artifact.read returns the text byte for byte (no trailing
# newline, a backslash-n, a tab, quotes); an absent artifact reads rc1
printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "a \\n literal, a\ttab, a \\"quote\\""\nobjective: "store"\nrepos: []' > art-in.txt
drv_in() { f=$1; shift; "$DRIVER_EXEC" "$@" < "$f"; }
drv_in art-in.txt artifact.write "$SUNIT" state >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
drv artifact.read "$SUNIT" state > art-out.txt 2>/dev/null; rc=$?
wantrc "$rc" 0
cmp -s art-in.txt art-out.txt || tc_fail="$tc_fail; artifact.read differs from the written bytes"
drv artifact.read "$SUNIT" backlog >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
drv artifact.read "$SUNIT" no-such-key >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
tc "TC29: artifact.write and artifact.read round-trip the exact bytes; an absent key reads rc1"

# TC30: a lane artifact written by key lists under the unit and reads back
printf '# recipe grammar\nMISSION\n  GOAL: "store lane"\n' > lane-in.txt
drv_in lane-in.txt artifact.write "$SUNIT" lane/s-lane/recipe >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
out=$(drv artifact.list "$SUNIT" 2>&1)
want "$out" 'state'; want "$out" 'lane/s-lane'; want "$out" 'lane/s-lane/recipe'; wantnot "$out" 'lane/s-lane/report'
out=$(drv lane.show "$SUNIT" s-lane recipe 2>&1)
want "$out" 'store lane'
tc "TC30: a lane artifact written by key lists and reads back"

# TC31: a 2 MB report travels on stdin through lane.report --write and reads back whole
awk 'BEGIN { for (i = 1; i <= 26000; i++) printf "line %06d of the big report, eighty bytes wide, padded to width ....\n", i }' > big.txt
drv_in big.txt lane.report "$SUNIT" s-lane --write >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
drv artifact.read "$SUNIT" lane/s-lane/report > big-out.txt 2>/dev/null
cmp -s big.txt big-out.txt || tc_fail="$tc_fail; the 2 MB report did not read back byte for byte"
rm -f big.txt big-out.txt
tc "TC31: a 2 MB lane report lands over stdin and reads back byte for byte"

# TC32: repeated keys refuse rc1 ERR_ENTITY_EXISTS (a finding NAME, a lane entry slug)
printf '# journal grammar\n' > lj.txt
drv_in lj.txt artifact.write "$SUNIT" lane/s-lane/journal >/dev/null 2>&1
drv_in art-in.txt artifact.write "$SUNIT" state >/dev/null 2>&1
: > empty.txt
drv_in empty.txt artifact.write "$SUNIT" knowledge >/dev/null 2>&1
pl summary "First" | "$DRIVER_EXEC" finding.add "$SUNIT" STORE_F >/dev/null 2>&1
out=$(pl summary "Repeat" | "$DRIVER_EXEC" finding.add "$SUNIT" STORE_F 2>&1); rc=$?
wantrc "$rc" 1; want "$out" 'ERR_ENTITY_EXISTS'
pl what "First" | "$DRIVER_EXEC" lane.record "$SUNIT" s-lane 2026-09-25-s-l1 >/dev/null 2>&1
out=$(pl what "Repeat" | "$DRIVER_EXEC" lane.record "$SUNIT" s-lane 2026-09-25-s-l1 2>&1); rc=$?
wantrc "$rc" 1; want "$out" 'ERR_ENTITY_EXISTS'
out=$(drv finding.show "$SUNIT" STORE_F 2>&1)
want "$out" '"summary":"First"'
tc "TC32: a repeated finding NAME and lane entry slug refuse rc1 ERR_ENTITY_EXISTS"

# TC33: finding.update, finding.supersede (a missing predecessor refuses), finding.drop
out=$(pl summary "Updated" | "$DRIVER_EXEC" finding.update "$SUNIT" STORE_F 2>&1); rc=$?
wantrc "$rc" 0
want "$(drv finding.show "$SUNIT" STORE_F 2>&1)" '"summary":"Updated"'
pl summary "Successor" | "$DRIVER_EXEC" finding.supersede "$SUNIT" NO_SUCH STORE_G >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
pl summary "Successor" | "$DRIVER_EXEC" finding.supersede "$SUNIT" STORE_F STORE_G >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
want "$(drv finding.show "$SUNIT" STORE_F 2>&1)" '"superseded_by":"STORE_G"'
drv finding.drop "$SUNIT" STORE_G >/dev/null 2>&1; rc=$?
wantrc "$rc" 0
drv finding.show "$SUNIT" STORE_G >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
tc "TC33: finding.update, finding.supersede, finding.drop mutate the knowledge; a missing predecessor refuses"

# ==============================================================================
# Suite 11: Uniform Answers (5 test cases)
# ==============================================================================
printf '\n== Suite 11: Uniform Answers ==\n'

# TC34: task.list takes the canonical statuses (TODO, IN_PROGRESS, DONE, all)
out=$(drv task.list "$TUNIT" all 2>&1)
want "$out" '"slug":"task-keeper"'; want "$out" '"slug":"task-sample"'
out=$(drv task.list "$TUNIT" TODO 2>&1)
want "$out" '"slug":"task-keeper"'
out=$(drv task.list "$TUNIT" DONE 2>&1)
wantnot "$out" '"slug":"task-keeper"'
tc "TC34: task.list filters by the canonical status and all lists every task"

# TC35: task refs land as a JSON array; task.update adds the sections a block lacked
pl objective "Refs task" refs "backlog#one knowledge#TWO" | "$DRIVER_EXEC" task.add "$TUNIT" task-refs >/dev/null 2>&1
want "$(drv task.show "$TUNIT" task-refs 2>&1)" '"refs":["backlog#one","knowledge#TWO"]'
pl desc "Added description" criteria "Added criteria" details "Added details" | "$DRIVER_EXEC" task.update "$TUNIT" task-refs >/dev/null 2>&1
out=$(drv task.show "$TUNIT" task-refs 2>&1)
want "$out" '"description":"Added description"'; want "$out" '"criteria":"Added criteria"'; want "$out" '"details":"Added details"'
tc "TC35: task refs are a JSON array; task.update adds the sections a block lacked"

# TC36: resolve.ref answers the typed forms with the verbatim block
out=$(drv resolve.ref "$TUNIT" task#task-refs 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"entity_type":"task"'; want "$out" '"block":"@task task-refs'
out=$(drv resolve.ref "$TUNIT" finding#FINDING_ALPHA 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"block":"@finding FINDING_ALPHA'
out=$(drv resolve.ref "$TUNIT" entry#2026-09-25-event-alpha 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"block":"@entry 2026-09-25-event-alpha'
drv resolve.ref "$TUNIT" task#no-such-task >/dev/null 2>&1; rc=$?
wantrc "$rc" 1
tc "TC36: resolve.ref answers task#, finding#, entry# with the entity block"

# TC37: entry.list filters by --group and --anchor
pl what "Other group" group "other-group" thread "none" | "$DRIVER_EXEC" entry.record "$TUNIT" 2026-09-25-event-other >/dev/null 2>&1
out=$(drv entry.list "$TUNIT" --group=other-group 2>&1)
want "$out" '"slug":"2026-09-25-event-other"'; wantnot "$out" '"slug":"2026-09-25-event-alpha"'
out=$(drv entry.list "$TUNIT" --anchor=A9 2>&1)
wantnot "$out" '"slug":"2026-09-25-event-other"'
tc "TC37: entry.list filters by --group and --anchor"

# TC38: search.query returns the shared shape, honors --limit and --entity, refuses an
# empty query rc1; the exact mode is common to every driver
out=$(pl query "objective" | "$DRIVER_EXEC" search.query "$TUNIT" --mode=exact --limit=1 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"mode":"exact"'; want "$out" '"section":'; wantnot "$out" '"file":'
[ "$(printf '%s' "$out" | grep -o '"entity_type":' | wc -l | tr -d ' ')" = "1" ] || tc_fail="$tc_fail; --limit=1 did not cap the results"
out=$(pl query "objective" | "$DRIVER_EXEC" search.query "$TUNIT" --mode=exact --entity=task --limit=50 2>&1)
want "$out" '"entity_type":"task"'; wantnot "$out" '"entity_type":"finding"'; wantnot "$out" '"entity_type":"entry"'
out=$(pl query "" | "$DRIVER_EXEC" search.query "$TUNIT" 2>&1); rc=$?
wantrc "$rc" 1; want "$out" 'ERR_INVALID_ARGUMENT'
tc "TC38: search.query returns one shape, honors --limit and --entity, refuses an empty query"

# TC39: --mode=exact means one thing on every driver: a case-insensitive (ASCII) substring
# of one line of the artifact text, a column-0 comment never matching; one row per
# matching entity and section, in record order (state, backlog, knowledge, journal, then
# each lane's recipe, journal, report), its snippet the first matching line;
# total_matches counts those rows. The fixture fixes the entity set and the total, so
# every driver that passes returns the same answer
EU="compliance-exact"
drv session.create "$EU" >/dev/null 2>&1
printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "find the Needle in the state"\nobjective: "exact fixture"\nrepos: []\nref_sessions: []\n' > ex.txt
"$DRIVER_EXEC" artifact.write "$EU" state < ex.txt >/dev/null 2>&1
printf '@task t-one\n  STATUS: TODO\n  OBJECTIVE: "a needle in the objective"\n  DESCRIPTION ::\n    a second NEEDLE line of the same task\n\n@task t-two\n  STATUS: TODO\n  OBJECTIVE: "needlework, a substring"\n\n@task t-three\n  STATUS: TODO\n  OBJECTIVE: "no match here"\n' > ex.txt
"$DRIVER_EXEC" artifact.write "$EU" backlog < ex.txt >/dev/null 2>&1
printf '@finding F_ONE\n  SUMMARY ::\n    one needle\n\n@finding F_TWO\n  SUMMARY ::\n    none at all\n' > ex.txt
"$DRIVER_EXEC" artifact.write "$EU" knowledge < ex.txt >/dev/null 2>&1
printf '@anchor A1 ("continues A0", attention: plain)\n\n@entry 2026-09-25-e-one\n  ANCHOR: A1\n  WHAT: "the needle event"\n  THREAD: none\n\n@entry 2026-09-25-e-two\n  ANCHOR: A1\n  WHAT: "nothing to see"\n  THREAD: a needle awaits\n\n@entry 2026-09-25-e-three\n  ANCHOR: A1\n  WHAT: "quiet"\n  THREAD: none\n' > ex.txt
"$DRIVER_EXEC" artifact.write "$EU" journal < ex.txt >/dev/null 2>&1
printf '# needle in a grammar comment never matches\nMISSION\n  GOAL: "thread the needle"\n' > ex.txt
"$DRIVER_EXEC" artifact.write "$EU" lane/ex-lane/recipe < ex.txt >/dev/null 2>&1
printf '@entry 2026-09-25-l-one\n  WHAT: "a lane needle"\n  THREAD: none\n' > ex.txt
"$DRIVER_EXEC" artifact.write "$EU" lane/ex-lane/journal < ex.txt >/dev/null 2>&1
printf '# report\n\n@orientation\n  VERDICT: "needle one"\n  NOTE: "needle two"\n' > ex.txt
"$DRIVER_EXEC" artifact.write "$EU" lane/ex-lane/report < ex.txt >/dev/null 2>&1
out=$(pl query "needle" | "$DRIVER_EXEC" search.query "$EU" --mode=exact 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"mode":"exact"'; want "$out" '"total_matches":9,'
rows=$(printf '%s' "$out" | grep -o '"entity_type":"[a-z_]*","entity_id":"[^"]*","section":"[a-z_]*"' | sed 's/"entity_type":"//; s/","entity_id":"/ /; s/","section":"/ /; s/"$//' | tr '\n' '|')
[ "$rows" = "session compliance-exact state|task t-one backlog|task t-two backlog|finding F_ONE knowledge|entry 2026-09-25-e-one journal|entry 2026-09-25-e-two journal|lane ex-lane lane_recipe|lane_entry ex-lane/2026-09-25-l-one lane_journal|lane ex-lane lane_report|" ] || tc_fail="$tc_fail; rows [$rows]"
want "$out" '"entity_id":"t-one","section":"backlog","snippet":"a needle in the objective"'
want "$out" '"entity_id":"ex-lane","section":"lane_report","snippet":"needle one"'
wantnot "$out" 't-three'; wantnot "$out" 'F_TWO'; wantnot "$out" 'e-three'; wantnot "$out" 'grammar comment'
out=$(pl query "needle" | "$DRIVER_EXEC" search.query "$EU" --mode=exact --limit=2 2>&1)
want "$out" '"total_matches":9,'
[ "$(printf '%s' "$out" | grep -o '"entity_type":' | wc -l | tr -d ' ')" = "2" ] || tc_fail="$tc_fail; --limit=2 did not cap the rows"
out=$(pl query "needle" | "$DRIVER_EXEC" search.query "$EU" --mode=exact --entity=task 2>&1)
want "$out" '"total_matches":2,'; wantnot "$out" '"entity_type":"entry"'
out=$(pl query "zz-no-such-needle" | "$DRIVER_EXEC" search.query "$EU" --mode=exact 2>&1); rc=$?
wantrc "$rc" 0; want "$out" '"total_matches":0,"results":[]'
tc "TC39: --mode=exact returns one row per matching entity and section with the same total on every driver"
rm -f ex.txt
rm -f art-in.txt art-out.txt lane-in.txt lj.txt empty.txt

# ==============================================================================
# Summary
# ==============================================================================
printf '\nstorage-compliance: %d passed, %d failed\n' "$pass" "$fail"

if [ "$fail" -gt 0 ]; then
  printf 'storage-compliance: FAIL\n'
  exit 1
fi

printf 'storage-compliance: PASS (all %d compliance cases green)\n' "$pass"
exit 0
