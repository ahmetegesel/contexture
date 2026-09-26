#!/bin/sh
# test-migration.sh: verify bidirectional migration between POSIX and SQLite FTS5.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
# the plugin's own module copy, never the workspace's adopted one: the two drift
PLUGIN_MODULE="$SCRIPT_DIR/../.contexture/modules/storage-fts5"
MIGRATE="$PLUGIN_MODULE/scripts/migrate"
DRIVER="$PLUGIN_MODULE/drivers/fts5"
# the record grammar the driver renders through: the shipped core's posix driver
CTX_REFERENCE_DRIVER="$ROOT/base/.contexture/modules/session/drivers/posix/driver"
export CTX_REFERENCE_DRIVER

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

@entry 2026-09-25-event-3
  ANCHOR: A1
  WHAT: "Awaits the human"
  THREAD: the human's verdict

@entry 2026-09-25-event-4
  ANCHOR: A1
  WHAT: "Folded later"
  THREAD: none

@entry 2026-09-25-event-5
  ANCHOR: A2
  WHAT: "Dropped later"
  THREAD: none

@entry 2026-09-25-event-6
  ANCHOR: A2
  WHAT: "Digest closing three by two lines"
  THREAD: none
  CLOSES: 2026-09-25-event-3 2026-09-25-event-4 (folded: two targets on one line)
  CLOSES: 2026-09-25-event-5 (dropped: a second closer line)

@entry 2026-09-25-event-7
  ANCHOR: A2
  WHAT: "Still live"
  THREAD: none
EOF

cat <<'EOF' > "$SANDBOX/.contexture/sessions/mig-unit/knowledge.md"
# knowledge grammar

@finding MIGRATION_FIDELITY
  REF: "journal#2026-09-25-event-1"
  SUMMARY ::
    Migration preserves all relational entities and block formatting.

@finding MIGRATION_FIDELITY_V2
  SUPERSEDES: MIGRATION_FIDELITY (the status column is derived from this reference)
  REF: "journal#2026-09-25-event-1"
  SUMMARY ::
    Migration preserves relational entities, block formatting, and supersession.
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

@entry 2026-09-25-lane-a
  WHAT: "Lane claim"
  THREAD: the dispatcher's read

@entry 2026-09-25-lane-b
  WHAT: "Lane claim read"
  THREAD: none
  CLOSES: 2026-09-25-lane-a (done: read by the dispatcher)
EOF

closer_lines() { grep -E '^[[:space:]]+(CLOSES|SUPERSEDES):' "$1"; }
# the originals, kept for the byte for byte round trip of step 5b
cp -R "$SANDBOX/.contexture/sessions/mig-unit" "$SANDBOX/orig-mig-unit"
orig_closers=$(closer_lines "$SANDBOX/.contexture/sessions/mig-unit/journal.md")
orig_lane_closers=$(closer_lines "$SANDBOX/.contexture/sessions/mig-unit/lanes/worker/journal.md")

DB_FILE="$SANDBOX/mig-test.db"

# 1. Migrate POSIX -> SQLite FTS5
cd "$SANDBOX" || exit 1
out_ingest=$("$MIGRATE" --from=posix --to=fts5 --unit=mig-unit --db="$DB_FILE" 2>&1)
rc_ingest=$?
if [ "$rc_ingest" -ne 0 ]; then
  printf 'FAIL: posix -> fts5 migration failed (rc=%d, out=%s)\n' "$rc_ingest" "$out_ingest" >&2
  exit 1
fi

# 1b. Re-run the same import: it must replace, not collide, and leave the search index without orphans
out_reingest=$("$MIGRATE" --from=posix --to=fts5 --unit=mig-unit --db="$DB_FILE" 2>&1)
rc_reingest=$?
if [ "$rc_reingest" -ne 0 ]; then
  printf 'FAIL: posix -> fts5 re-import failed, the import is not re-runnable (rc=%d, out=%s)\n' "$rc_reingest" "$out_reingest" >&2
  exit 1
fi
if [ "$out_reingest" != "$out_ingest" ]; then
  printf 'FAIL: posix -> fts5 re-import changed the counts (first=%s second=%s)\n' "$out_ingest" "$out_reingest" >&2
  exit 1
fi
cnt_tasks=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM tasks WHERE unit='mig-unit';")
cnt_task_docs=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM search_documents WHERE unit='mig-unit' AND entity_type='task';")
if [ "$cnt_tasks" != "$cnt_task_docs" ]; then
  printf 'FAIL: re-import left orphaned search documents (tasks=%s task_docs=%s)\n' "$cnt_tasks" "$cnt_task_docs" >&2
  exit 1
fi

# 1c. Supersession is derived from the SUPERSEDES reference, not left ACTIVE
sup_row=$(sqlite3 "$DB_FILE" "SELECT status || '|' || coalesce(superseded_by,'') FROM findings WHERE unit='mig-unit' AND name='MIGRATION_FIDELITY';")
if [ "$sup_row" != "SUPERSEDED|MIGRATION_FIDELITY_V2" ]; then
  printf 'FAIL: superseded finding not derived on import (want SUPERSEDED|MIGRATION_FIDELITY_V2 got %s)\n' "$sup_row" >&2
  exit 1
fi
succ_row=$(sqlite3 "$DB_FILE" "SELECT status || '|' || coalesce(supersedes,'') FROM findings WHERE unit='mig-unit' AND name='MIGRATION_FIDELITY_V2';")
if [ "$succ_row" != "ACTIVE|MIGRATION_FIDELITY" ]; then
  printf 'FAIL: successor finding wrong on import (want ACTIVE|MIGRATION_FIDELITY got %s)\n' "$succ_row" >&2
  exit 1
fi

# 1e. Every closer target lands, one closures row each, verdicts kept; liveness follows them all
live=$(sqlite3 "$DB_FILE" "SELECT group_concat(slug, ' ') FROM (SELECT slug FROM entries WHERE unit='mig-unit' AND entry_type='ENTRY' AND slug NOT IN (SELECT target_slug FROM closures WHERE unit='mig-unit' AND lane_slug='' AND target_slug!='') ORDER BY id);")
if [ "$live" != "2026-09-25-event-2 2026-09-25-event-6 2026-09-25-event-7" ]; then
  printf 'FAIL: live set after multi-target closers (want event-2 event-6 event-7 got %s)\n' "$live" >&2
  exit 1
fi
board=$(CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" session.board mig-unit 2>&1)
for gone in 2026-09-25-event-3 2026-09-25-event-4 2026-09-25-event-5; do
  if printf '%s\n' "$board" | grep -q "\"$gone\""; then
    printf 'FAIL: driver board still shows closed entry %s\n' "$gone" >&2
    exit 1
  fi
done
if ! printf '%s\n' "$board" | grep -q '"2026-09-25-event-7"'; then
  printf 'FAIL: driver board lost the live entry (out=%s)\n' "$board" >&2
  exit 1
fi
verdicts=$(sqlite3 "$DB_FILE" "SELECT group_concat(target_slug || '=' || verdict || ':' || reason, '|') FROM (SELECT * FROM closures WHERE unit='mig-unit' AND entry_slug='2026-09-25-event-6' ORDER BY id);")
if [ "$verdicts" != "2026-09-25-event-3=folded:two targets on one line|2026-09-25-event-4=folded:two targets on one line|2026-09-25-event-5=dropped:a second closer line" ]; then
  printf 'FAIL: closure verdicts not kept (got %s)\n' "$verdicts" >&2
  exit 1
fi
lane_row=$(sqlite3 "$DB_FILE" "SELECT lane_slug || '/' || entry_slug || '>' || target_slug FROM closures WHERE unit='mig-unit' AND lane_slug!='';")
if [ "$lane_row" != "worker/2026-09-25-lane-b>2026-09-25-lane-a" ]; then
  printf 'FAIL: lane closer not imported (got %s)\n' "$lane_row" >&2
  exit 1
fi

# 1g. The derived rows carry no trailing newline (lanes/routing-review/report finding R7):
# the blank separator after a block folds into its last block scalar (a task's last
# section, a finding's SUMMARY, a WHAT written last) on the import and on every reindex;
# interior newlines stay; the search documents follow the rows
mkdir -p "$SANDBOX/.contexture/sessions/r7-unit/lanes/r7-lane"
printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "plan the next move"\nobjective: "Derived rows"\nrepos: []\n' > "$SANDBOX/.contexture/sessions/r7-unit/state.md"
cat <<'EOF' > "$SANDBOX/.contexture/sessions/r7-unit/backlog.md"
# backlog grammar

@task r7-full
  STATUS: TODO
  OBJECTIVE: "Every section filled"
  DESCRIPTION ::
    Description line 1.
    Description line 2.
  ACCEPTANCE CRITERIA ::
    Criteria line.
  IMPLEMENTATION DETAILS ::
    Details line.

@task r7-desc
  STATUS: TODO
  OBJECTIVE: "Description last"
  DESCRIPTION ::
    Only a description.

@task r7-tail
  STATUS: TODO
  OBJECTIVE: "The last block of the file"
EOF
cat <<'EOF' > "$SANDBOX/.contexture/sessions/r7-unit/knowledge.md"
# knowledge grammar

@finding R7_FIRST
  REF: "journal#2026-09-25-r7-a"
  SUMMARY ::
    First summary line.
    Second summary line.

@finding R7_SECOND
  SUMMARY ::
    A summary written last in its block.

@finding R7_TAIL
  REF: "journal#2026-09-25-r7-a"
  SUMMARY ::
    The last block of the file.
EOF
cat <<'EOF' > "$SANDBOX/.contexture/sessions/r7-unit/journal.md"
# journal grammar

@entry 2026-09-25-r7-a
  ANCHOR: A1
  THREAD: none
  WHAT: "A WHAT written last"

@entry 2026-09-25-r7-b
  ANCHOR: A1
  WHAT: "A WHAT followed by a field"
  THREAD: none
EOF
cat <<'EOF' > "$SANDBOX/.contexture/sessions/r7-unit/lanes/r7-lane/journal.md"
# journal grammar

@entry 2026-09-25-r7-la
  THREAD: none
  WHAT: "A lane WHAT written last"

@entry 2026-09-25-r7-lb
  WHAT: "A lane WHAT followed by a field"
  THREAD: none
EOF
printf '# recipe: r7-lane\nGOAL: "r7 lane"\n' > "$SANDBOX/.contexture/sessions/r7-unit/lanes/r7-lane/recipe.md"
r7_check() {
  r7_rows=$(sqlite3 "$DB_FILE" "SELECT (SELECT count(*) FROM tasks WHERE unit='r7-unit' AND (description LIKE '%'||char(10) OR acceptance_criteria LIKE '%'||char(10) OR implementation_details LIKE '%'||char(10))) || '|' || (SELECT count(*) FROM findings WHERE unit='r7-unit' AND summary LIKE '%'||char(10)) || '|' || (SELECT count(*) FROM entries WHERE unit='r7-unit' AND what LIKE '%'||char(10)) || '|' || (SELECT count(*) FROM lane_entries WHERE unit='r7-unit' AND what LIKE '%'||char(10)) || '|' || (SELECT count(*) FROM search_documents WHERE unit='r7-unit' AND entity_type IN ('finding', 'entry', 'lane_entry') AND body LIKE '%'||char(10)) || '|' || (SELECT count(*) FROM search_documents WHERE unit='r7-unit' AND entity_type='task' AND entity_id='r7-full' AND body LIKE '%'||char(10));")
  if [ "$r7_rows" != "0|0|0|0|0|0" ]; then
    printf 'FAIL: %s: derived rows carry a trailing newline (tasks|findings|entries|lane entries|search docs|full task doc: want 0|0|0|0|0|0 got %s)\n' "$1" "$r7_rows" >&2
    exit 1
  fi
  r7_vals=$(sqlite3 "$DB_FILE" "SELECT (SELECT description FROM tasks WHERE unit='r7-unit' AND slug='r7-full') || '|' || (SELECT implementation_details FROM tasks WHERE unit='r7-unit' AND slug='r7-full') || '|' || (SELECT description FROM tasks WHERE unit='r7-unit' AND slug='r7-desc') || '|' || (SELECT summary FROM findings WHERE unit='r7-unit' AND name='R7_FIRST') || '|' || (SELECT what FROM entries WHERE unit='r7-unit' AND slug='2026-09-25-r7-a') || '|' || (SELECT what FROM lane_entries WHERE unit='r7-unit' AND slug='2026-09-25-r7-la') || '|' || (SELECT count(*) FROM tasks WHERE unit='r7-unit') || '|' || (SELECT count(*) FROM findings WHERE unit='r7-unit');")
  r7_want=$(printf 'Description line 1.\nDescription line 2.|Details line.|Only a description.|First summary line.\nSecond summary line.|A WHAT written last|A lane WHAT written last|3|3')
  if [ "$r7_vals" != "$r7_want" ]; then
    printf 'FAIL: %s: derived row values (want [%s] got [%s])\n' "$1" "$r7_want" "$r7_vals" >&2
    exit 1
  fi
}
out_r7=$("$MIGRATE" --from=posix --to=fts5 --unit=r7-unit --db="$DB_FILE" 2>&1) || { printf 'FAIL: r7-unit import (out=%s)\n' "$out_r7" >&2; exit 1; }
r7_check "the import"
# the reindex path: the driver's artifact.write rebuilds the rows from the stored text
for r7_key in backlog knowledge journal; do
  CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" artifact.write r7-unit "$r7_key" < "$SANDBOX/.contexture/sessions/r7-unit/$r7_key.md" >/dev/null 2>&1 || { printf 'FAIL: r7-unit reindex of %s\n' "$r7_key" >&2; exit 1; }
done
CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" artifact.write r7-unit lane/r7-lane/journal < "$SANDBOX/.contexture/sessions/r7-unit/lanes/r7-lane/journal.md" >/dev/null 2>&1 || { printf 'FAIL: r7-unit reindex of the lane journal\n' >&2; exit 1; }
r7_check "the reindex"

# 1d. A legacy journal repeating a slug imports whole: one row per occurrence keyed by
# ordinal, never renamed; a closer closes the occurrences before it, never one after it;
# a lane journal repeat imports the same way; export pairs each occurrence with its closers
mkdir -p "$SANDBOX/.contexture/sessions/dup-unit/lanes/twin"
cat <<'EOF' > "$SANDBOX/.contexture/sessions/dup-unit/state.md"
status: ACTIVE
current_anchor: A1
next_action: "plan the next move"
objective: "Legacy duplicate slugs"
repos: []
EOF
cat <<'EOF' > "$SANDBOX/.contexture/sessions/dup-unit/journal.md"
@anchor A1 2026-09-25 "born"

@entry 2026-09-25-twice
  ANCHOR: A1
  WHAT: "first"
  THREAD: none

@entry 2026-09-25-twice
  ANCHOR: A1
  WHAT: "second"
  THREAD: none

@entry 2026-09-25-fold
  ANCHOR: A1
  WHAT: "folds both occurrences"
  THREAD: none
  CLOSES: 2026-09-25-twice (folded: both occurrences precede)

@entry 2026-09-25-mid
  ANCHOR: A1
  WHAT: "before the closer"
  THREAD: none

@entry 2026-09-25-drop-mid
  ANCHOR: A1
  WHAT: "drops the earlier mid"
  THREAD: none
  CLOSES: 2026-09-25-mid (dropped: the earlier occurrence only)

@entry 2026-09-25-mid
  ANCHOR: A1
  WHAT: "after the closer, stays live"
  THREAD: the human's read
EOF
cat <<'EOF' > "$SANDBOX/.contexture/sessions/dup-unit/lanes/twin/recipe.md"
# recipe: twin
EOF
cat <<'EOF' > "$SANDBOX/.contexture/sessions/dup-unit/lanes/twin/journal.md"
@entry 2026-09-25-self-check
  WHAT: "first self check"
  THREAD: none

@entry 2026-09-25-self-check
  WHAT: "second self check"
  THREAD: none
EOF
dup_sig_orig=$(grep -E '^@entry |^[[:space:]]+(CLOSES|SUPERSEDES):' "$SANDBOX/.contexture/sessions/dup-unit/journal.md")
lane_sig_orig=$(grep -E '^@entry |^[[:space:]]+(CLOSES|SUPERSEDES):' "$SANDBOX/.contexture/sessions/dup-unit/lanes/twin/journal.md")
out_dup=$("$MIGRATE" --from=posix --to=fts5 --unit=dup-unit --db="$DB_FILE" 2>&1)
rc_dup=$?
if [ "$rc_dup" -ne 0 ]; then
  printf 'FAIL: a legacy duplicate slug was refused (rc=%d, out=%s)\n' "$rc_dup" "$out_dup" >&2
  exit 1
fi
ords=$(sqlite3 "$DB_FILE" "SELECT group_concat(slug || '#' || ordinal, ' ') FROM (SELECT slug, ordinal FROM entries WHERE unit='dup-unit' AND entry_type='ENTRY' ORDER BY id);")
if [ "$ords" != "2026-09-25-twice#1 2026-09-25-twice#2 2026-09-25-fold#1 2026-09-25-mid#1 2026-09-25-drop-mid#1 2026-09-25-mid#2" ]; then
  printf 'FAIL: duplicate occurrences not keyed by ordinal in file order (got %s)\n' "$ords" >&2
  exit 1
fi
lane_ords=$(sqlite3 "$DB_FILE" "SELECT group_concat(slug || '#' || ordinal, ' ') FROM (SELECT slug, ordinal FROM lane_entries WHERE unit='dup-unit' ORDER BY id);")
if [ "$lane_ords" != "2026-09-25-self-check#1 2026-09-25-self-check#2" ]; then
  printf 'FAIL: lane duplicate not keyed by ordinal (got %s)\n' "$lane_ords" >&2
  exit 1
fi
dup_board=$(CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" session.board dup-unit 2>&1)
dup_live=$(printf '%s\n' "$dup_board" | sed 's/.*"unclosed_entries":\[\(.*\)\],"open_tasks".*/\1/' | grep -o '"what":"[^"]*"' | tr '\n' ' ')
if [ "$dup_live" != '"what":"folds both occurrences" "what":"drops the earlier mid" "what":"after the closer, stays live" ' ]; then
  printf 'FAIL: positional liveness on duplicated slugs (got %s)\n' "$dup_live" >&2
  exit 1
fi
if ! printf '%s\n' "$dup_board" | grep -q '"open_threads":\[{"slug":"2026-09-25-mid"'; then
  printf 'FAIL: the live later occurrence lost its open thread (out=%s)\n' "$dup_board" >&2
  exit 1
fi
mid_show=$(CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" entry.show dup-unit 2026-09-25-mid 2>&1)
if ! printf '%s\n' "$mid_show" | grep -q '"what":"after the closer, stays live"' || ! printf '%s\n' "$mid_show" | grep -q '"is_closed":false'; then
  printf 'FAIL: entry.show on a duplicated slug must read the last occurrence, open (out=%s)\n' "$mid_show" >&2
  exit 1
fi
rm -rf "$SANDBOX/.contexture/sessions/dup-unit"
"$MIGRATE" --from=fts5 --to=posix --unit=dup-unit --db="$DB_FILE" >/dev/null 2>&1 || {
  printf 'FAIL: export of the duplicate unit failed\n' >&2
  exit 1
}
if [ "$(grep -E '^@entry |^[[:space:]]+(CLOSES|SUPERSEDES):' "$SANDBOX/.contexture/sessions/dup-unit/journal.md")" != "$dup_sig_orig" ]; then
  printf 'FAIL: duplicate unit journal did not round-trip its entries and closers\n' >&2
  exit 1
fi
if [ "$(grep -E '^@entry |^[[:space:]]+(CLOSES|SUPERSEDES):' "$SANDBOX/.contexture/sessions/dup-unit/lanes/twin/journal.md")" != "$lane_sig_orig" ]; then
  printf 'FAIL: duplicate lane journal did not round-trip\n' >&2
  exit 1
fi

# 1f. The task and finding keys stay refused: they are mutable surfaces, not history
mkdir -p "$SANDBOX/.contexture/sessions/dup-task"
printf 'status: ACTIVE\ncurrent_anchor: A1\nobjective: "dup task"\n' > "$SANDBOX/.contexture/sessions/dup-task/state.md"
printf '@task t1\n  STATUS: TODO\n  OBJECTIVE: "a"\n\n@task t1\n  STATUS: TODO\n  OBJECTIVE: "b"\n' > "$SANDBOX/.contexture/sessions/dup-task/backlog.md"
out_dt=$("$MIGRATE" --from=posix --to=fts5 --unit=dup-task --db="$DB_FILE" 2>&1)
if [ $? -ne 1 ] || ! printf '%s\n' "$out_dt" | grep -q "repeats task t1"; then
  printf 'FAIL: a repeated task slug was not refused by name (out=%s)\n' "$out_dt" >&2
  exit 1
fi

# 2. Query FTS5 search
out_search=$(printf 'query=fidelity\n' | CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" search.query mig-unit 2>&1)
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

# 5. Closer lines round-trip byte-identical, main journal and lane journal
if [ "$(closer_lines "$exp_dir/journal.md")" != "$orig_closers" ]; then
  printf 'FAIL: exported journal closer lines differ from the original\n' >&2
  exit 1
fi
if [ "$(closer_lines "$exp_dir/lanes/worker/journal.md")" != "$orig_lane_closers" ]; then
  printf 'FAIL: exported lane journal closer lines differ from the original\n' >&2
  exit 1
fi

# 5b. The store keeps the text verbatim: every exported file equals its original byte for
# byte, lane journals included (anchor, headers, REF and THREAD lines, blank lines)
for f in state.md backlog.md journal.md knowledge.md lanes/worker/recipe.md lanes/worker/journal.md lanes/worker/report.md; do
  if ! cmp -s "$SANDBOX/orig-mig-unit/$f" "$exp_dir/$f"; then
    printf 'FAIL: exported %s differs from the imported original\n' "$f" >&2
    exit 1
  fi
done

# 6. The driver's entry.record lands every target of a multi-target closer, and entry.show reads it
printf 'what=Closes two via the driver\ngroup=storage\nthread=none\ncloses=2026-09-25-event-6 2026-09-25-event-7 (done: via the driver)\n' | CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" entry.record mig-unit 2026-09-25-event-8 >/dev/null 2>&1 || {
  printf 'FAIL: driver entry.record with a multi-target closer failed\n' >&2
  exit 1
}
show7=$(CTX_STORAGE_SQLITE_PATH="$DB_FILE" "$DRIVER" entry.show mig-unit 2026-09-25-event-7 2>&1)
if ! printf '%s\n' "$show7" | grep -q '"is_closed":true' || ! printf '%s\n' "$show7" | grep -q '"closed_by":"2026-09-25-event-8"' || ! printf '%s\n' "$show7" | grep -q '"close_reason":"done: via the driver"'; then
  printf 'FAIL: entry.show misses the second target of a driver closer (out=%s)\n' "$show7" >&2
  exit 1
fi

printf 'PASS: bidirectional migration verified cleanly\n'
exit 0
