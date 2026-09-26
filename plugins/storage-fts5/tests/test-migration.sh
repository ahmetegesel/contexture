#!/bin/sh
# test-migration.sh: verify bidirectional migration between POSIX and SQLite FTS5.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
MIGRATE="$ROOT/.contexture/modules/storage-fts5/scripts/migrate"
DRIVER="$ROOT/.contexture/modules/storage-fts5/drivers/fts5"

if ! command -v sqlite3 >/dev/null 2>&1; then
  printf 'SKIP: sqlite3 not found on PATH\n'
  exit 77
fi

tmp_root="${TMPDIR:-/tmp}"
if [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SANDBOX=$(mktemp -d "$tmp_root/test-migration.XXXXXX") || exit 1

cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT INT TERM

mkdir -p "$SANDBOX/.contexture/sessions/mig-unit/lanes/worker"

cat <<'EOF' > "$SANDBOX/.contexture/sessions/mig-unit/state.md"
# state grammar

status: ACTIVE
current_anchor: A2
next_action: "work active task: task-alpha"
objective: "Verify migration fidelity"
repos: []
ref_sessions: []
EOF

cat <<'EOF' > "$SANDBOX/.contexture/sessions/mig-unit/backlog.md"
# backlog grammar

@task task-alpha
  STATUS: IN_PROGRESS
  OBJECTIVE: "Implement migration test"
  REFS: [journal#2026-09-25-event-1]
  DESCRIPTION ::
    Multiline description line 1.
    Multiline description line 2.
  ACCEPTANCE CRITERIA ::
    Passes all round-trip checks.
  IMPLEMENTATION DETAILS ::
    Use pure SQL block formatting.

@task task-beta
  STATUS: DONE
  OBJECTIVE: "Complete previous verification"
  DESCRIPTION ::
    Verified initial state.
EOF

cat <<'EOF' > "$SANDBOX/.contexture/sessions/mig-unit/journal.md"
# journal grammar

@anchor A1 ("continues A0")

@entry 2026-09-25-event-1
  ANCHOR: A1
  WHAT: "Initial architectural setup completed"
  GROUP: storage
  THREAD: none

@entry 2026-09-25-event-2
  ANCHOR: A1
  WHAT: "Second event resolving first"
  GROUP: storage
  THREAD: none
  CLOSES: 2026-09-25-event-1
EOF

cat <<'EOF' > "$SANDBOX/.contexture/sessions/mig-unit/knowledge.md"
# knowledge grammar

@finding MIGRATION_FIDELITY
  REF: "journal#2026-09-25-event-1"
  SUMMARY ::
    Migration preserves all relational entities and block formatting.
EOF

cat <<'EOF' > "$SANDBOX/.contexture/sessions/mig-unit/lanes/worker/recipe.md"
# recipe: worker
GOAL: "Subagent test goal"
EOF

cat <<'EOF' > "$SANDBOX/.contexture/sessions/mig-unit/lanes/worker/report.md"
# report: worker
Report findings evidence.
EOF

cat <<'EOF' > "$SANDBOX/.contexture/sessions/mig-unit/lanes/worker/journal.md"
# journal grammar

@entry trace-1
  WHAT: "Action trace step 1"
  THREAD: none
EOF

DB_FILE="$SANDBOX/mig-test.db"

# 1. Migrate POSIX -> SQLite FTS5
cd "$SANDBOX" || exit 1
out_ingest=$("$MIGRATE" --from=posix --to=fts5 --unit=mig-unit --db="$DB_FILE" 2>&1)
rc_ingest=$?
if [ "$rc_ingest" -ne 0 ]; then
  printf 'FAIL: posix -> fts5 migration failed (rc=%d, out=%s)\n' "$rc_ingest" "$out_ingest" >&2
  exit 1
fi

# 2. Query FTS5 search
out_search=$(CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" search.query mig-unit "fidelity" 2>&1)
rc_search=$?
if [ "$rc_search" -ne 0 ] || ! printf '%s\n' "$out_search" | grep -Eq '"total_matches"[[:space:]]*:[[:space:]]*[1-9]'; then
  printf 'FAIL: FTS5 search verification failed (rc=%d, out=%s)\n' "$rc_search" "$out_search" >&2
  exit 1
fi

# 3. Remove POSIX files and Export SQLite FTS5 -> POSIX
rm -rf "$SANDBOX/.contexture/sessions/mig-unit"
out_export=$("$MIGRATE" --from=fts5 --to=posix --unit=mig-unit --db="$DB_FILE" 2>&1)
rc_export=$?
if [ "$rc_export" -ne 0 ]; then
  printf 'FAIL: fts5 -> posix migration failed (rc=%d, out=%s)\n' "$rc_export" "$out_export" >&2
  exit 1
fi

# 4. Assert reconstructed files exist and contain expected sections
exp_dir="$SANDBOX/.contexture/sessions/mig-unit"
for f in state.md backlog.md journal.md knowledge.md lanes/worker/recipe.md lanes/worker/journal.md lanes/worker/report.md; do
  if [ ! -f "$exp_dir/$f" ]; then
    printf 'FAIL: exported file missing: %s\n' "$f" >&2
    exit 1
  fi
done

if ! grep -q "task-alpha" "$exp_dir/backlog.md" || ! grep -q "MIGRATION_FIDELITY" "$exp_dir/knowledge.md"; then
  printf 'FAIL: exported content verification failed\n' >&2
  exit 1
fi

printf 'PASS: bidirectional migration verified cleanly\n'
exit 0
