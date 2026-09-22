#!/bin/sh
# record-audit-tests.sh: the session audit's planted-defect matrix, staged
# from the shipped core (base/.contexture/ctx and the base session module).
# Bootstraps a clean unit, proves the audit rc0, then plants each defect class
# the audit owns (per ctx session help audit) one at a time, proves rc1 with
# the named finding, repairs, and proves rc0 again:
#   1. dangling closer          (the seed case, from the review-harden probe)
#   2. slugless closer
#   3. dateless entry slug
#   4. inline marker on an @entry line
#   5. bracketed field line
#   6. unharvested KNOWLEDGE flag
#   7. DONE task without its backlog/<slug>: DONE event
#   8. IN_PROGRESS task absent from state.md
#   9. entry dated at or after ENF_FROM missing THREAD
#
# Usage: tests/record-audit-tests.sh
# Exit 0 when every case passes; 1 otherwise.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG

if [ ! -f "$CTX_SRC" ]; then
  echo "record-audit-tests.sh: ctx not found at $CTX_SRC" >&2
  exit 1
fi

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SANDBOX=$(mktemp -d "$tmp_root/record-audit-tests.XXXXXX") || exit 1
cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

mkdir -p "$SANDBOX/.contexture/modules"
cp "$CTX_SRC" "$SANDBOX/.contexture/ctx"
chmod +x "$SANDBOX/.contexture/ctx"
cp -R "$SESSION_MOD" "$SANDBOX/.contexture/modules/session"

cd "$SANDBOX" || exit 1
CTX=./.contexture/ctx
chmod +x .contexture/modules/session/scripts/*
UNIT=aud-unit
JOURNAL=".contexture/sessions/$UNIT/journal.md"
BACKLOG=".contexture/sessions/$UNIT/backlog.md"

pass=0
fail=0
ok() { pass=$((pass + 1)); echo "PASS: $1"; }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }

run_audit() {
  audit_out=$($CTX session audit "$UNIT" 2>&1)
  audit_rc=$?
}

echo "== baseline =="
$CTX session bootstrap "$UNIT" "audit matrix unit" >/dev/null 2>&1
a_eq "$?" "0" "bootstrap rc0"
run_audit
a_eq "$audit_rc" "0" "clean audit rc0"
a_match "$audit_out" "open threads:" "clean audit prints the thread tail"

echo "== 1 dangling closer (the seed case) =="
cp "$JOURNAL" journal.bak
cat >> "$JOURNAL" <<'EOF'

@entry 2026-09-19-plant-dangling
  ANCHOR: A2
  WHAT: "planted dangling closer"
  THREAD: none
  CLOSES: 2026-01-01-nonexistent (done: nothing)
EOF
run_audit
a_eq "$audit_rc" "1" "dangling closer rc1"
a_match "$audit_out" "DANGLING CLOSER at line .*: 2026-01-01-nonexistent" "dangling closer named with its line"
cp journal.bak "$JOURNAL"
run_audit
a_eq "$audit_rc" "0" "dangling repair rc0"

echo "== 2 slugless closer =="
cp "$JOURNAL" journal.bak
cat >> "$JOURNAL" <<'EOF'

@entry 2026-09-19-plant-slugless
  ANCHOR: A2
  WHAT: "planted slugless closer"
  THREAD: none
  CLOSES: nothing (done: nothing)
EOF
run_audit
a_eq "$audit_rc" "1" "slugless closer rc1"
a_match "$audit_out" "SLUGLESS CLOSER at line .*: no valid date-slug target" "slugless closer named"
cp journal.bak "$JOURNAL"
run_audit
a_eq "$audit_rc" "0" "slugless repair rc0"

echo "== 3 dateless entry slug =="
cp "$JOURNAL" journal.bak
cat >> "$JOURNAL" <<'EOF'

@entry plant-dateless
  ANCHOR: A2
  WHAT: "planted dateless slug"
  THREAD: none
EOF
run_audit
a_eq "$audit_rc" "1" "dateless slug rc1"
a_match "$audit_out" "DATELESS SLUG at line .*: plant-dateless" "dateless slug named"
cp journal.bak "$JOURNAL"
run_audit
a_eq "$audit_rc" "0" "dateless repair rc0"

echo "== 4 inline marker on the @entry line =="
cp "$JOURNAL" journal.bak
cat >> "$JOURNAL" <<'EOF'

@entry 2026-09-19-plant-inline [THREAD: x]
  ANCHOR: A2
  WHAT: "planted inline marker"
  THREAD: none
EOF
run_audit
a_eq "$audit_rc" "1" "inline marker rc1"
a_match "$audit_out" "INLINE MARKER at line .*: 2026-09-19-plant-inline" "inline marker named"
cp journal.bak "$JOURNAL"
run_audit
a_eq "$audit_rc" "0" "inline repair rc0"

echo "== 5 bracketed field line =="
cp "$JOURNAL" journal.bak
cat >> "$JOURNAL" <<'EOF'

@entry 2026-09-19-plant-bracket
  ANCHOR: A2
  WHAT: "planted bracketed field"
  [THREAD: x]
  THREAD: none
EOF
run_audit
a_eq "$audit_rc" "1" "bracketed field rc1"
a_match "$audit_out" "BRACKETED FIELD at line .*: \[THREAD: x\]" "bracketed field named"
cp journal.bak "$JOURNAL"
run_audit
a_eq "$audit_rc" "0" "bracketed repair rc0"

echo "== 6 unharvested KNOWLEDGE flag =="
cp "$JOURNAL" journal.bak
cat >> "$JOURNAL" <<'EOF'

@entry 2026-09-19-plant-knowledge
  ANCHOR: A2
  WHAT: "planted unharvested knowledge"
  KNOWLEDGE: true
  THREAD: none
EOF
run_audit
a_eq "$audit_rc" "1" "unharvested knowledge rc1"
a_match "$audit_out" "UNHARVESTED KNOWLEDGE at line .*: 2026-09-19-plant-knowledge" "unharvested knowledge named"
cp journal.bak "$JOURNAL"
run_audit
a_eq "$audit_rc" "0" "knowledge repair rc0"

echo "== 7 DONE task without its event =="
cp "$BACKLOG" backlog.bak
cat >> "$BACKLOG" <<'EOF'

@task zz-plant-done
  STATUS: DONE
  OBJECTIVE: "planted done without event"
EOF
run_audit
a_eq "$audit_rc" "1" "done without event rc1"
a_match "$audit_out" "DONE WITHOUT EVENT (backlog/zz-plant-done: DONE): zz-plant-done" "done without event named"
cp backlog.bak "$BACKLOG"
run_audit
a_eq "$audit_rc" "0" "done repair rc0"

echo "== 8 IN_PROGRESS task absent from state =="
cp "$BACKLOG" backlog.bak
cat >> "$BACKLOG" <<'EOF'

@task zz-plant-inp
  STATUS: IN_PROGRESS
  OBJECTIVE: "planted in progress absent from state"
EOF
run_audit
a_eq "$audit_rc" "1" "in-progress absent rc1"
a_match "$audit_out" "IN_PROGRESS ABSENT FROM STATE: zz-plant-inp" "in-progress absence named"
cp backlog.bak "$BACKLOG"
run_audit
a_eq "$audit_rc" "0" "in-progress repair rc0"

echo "== 9 missing THREAD on a dated entry =="
cp "$JOURNAL" journal.bak
cat >> "$JOURNAL" <<'EOF'

@entry 2026-09-19-plant-nothread
  ANCHOR: A2
  WHAT: "planted missing thread"
EOF
run_audit
a_eq "$audit_rc" "1" "missing thread rc1"
a_match "$audit_out" "MISSING THREAD at line .*: 2026-09-19-plant-nothread" "missing thread named"
cp journal.bak "$JOURNAL"
run_audit
a_eq "$audit_rc" "0" "thread repair rc0"

echo "== summary =="
echo "record-audit-tests: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
