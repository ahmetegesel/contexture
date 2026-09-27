#!/bin/sh
# test-session-migrate.sh: ctx session migrate between posix and fts5 on the plugin's own
# module copy (the base verb over unit.export, unit.import, and the corpus methods; the
# plugin carries no migrate verb of its own). A workspace is staged from the shipped core
# (base/.contexture/ctx, the session and lane modules) and this plugin's module copy, with
# no storage.driver configured: migrate names both drivers, and the fts5 reads name fts5
# through CTX_STORAGE_DRIVER. Units with the shapes the retired plugin verb was proven on:
#   1. posix to fts5 for one unit (--unit): the echo counts the dump's records; the unit
#      held refuses without --replace and --replace swaps it whole; the fts5 export equals
#      the posix export; the ranked documents match the tasks after the replace
#   2. the views read the same on both drivers (board, task, entry, finding lists, lane
#      shows, exact search): liveness through several closer lines and several targets on
#      one line, the verdicts kept (entry closure), supersession derived from SUPERSEDES,
#      a lane closer; exact and hybrid search find the imported text
#   3. the typed fields carry no trailing newline from a block's blank separator
#   4. legacy repeated slugs import whole: every occurrence listed in order, positional
#      liveness, entry show reading the last occurrence open; a repeated legacy task slug
#      reads back and a new repeat is refused
#   5. fts5 to posix for every unit (the bare form): the exported files equal the
#      originals byte for byte (a planted byte reads as a difference)
#   6. a multi-target closer recorded through the verb on fts5 closes both targets
#   7. the refusals: --prune without --corpus, a missing --from, an unknown option, an
#      unknown driver, a unit the source lacks; the warning for files outside the record
#   8. --corpus both ways: 3 docs byte for byte, the guide at docs/<name>.md never a doc,
#      the extra doc refused without --prune and removed with it, an empty source leaving
#      the target as is, a tracked corpus with uncommitted changes refused (git present)
#   9. the configuration is never written; ctx storage-fts5 migrate is an unknown verb
# Exit: 0 all pass, 1 a failure, 77 without sqlite3 FTS5.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
# the plugin's own module copy, never the workspace's adopted one: the two drift
MOD="$SCRIPT_DIR/../.contexture/modules/storage-fts5"
BASE="$ROOT/base/.contexture"

if ! command -v sqlite3 >/dev/null 2>&1 || ! sqlite3 :memory: "CREATE VIRTUAL TABLE t USING fts5(x);" >/dev/null 2>&1; then
  printf 'SKIP: sqlite3 with FTS5 not found on PATH\n'
  exit 77
fi
if [ ! -f "$BASE/ctx" ] || [ ! -d "$BASE/modules/session" ]; then
  printf 'SKIP: the shipped core (base/.contexture) not found under %s\n' "$ROOT"
  exit 77
fi

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-session-migrate.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
# the sandbox answers for itself: nothing of the calling workspace reaches it
unset CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH
export LC_ALL=C

# stage <dir>: a workspace from the shipped copies
stage() {
  mkdir -p "$1/.contexture/modules" "$1/.contexture/tmp" "$1/.contexture/sessions"
  cp -p "$BASE/ctx" "$1/.contexture/ctx"
  cp -Rp "$BASE/modules/session" "$1/.contexture/modules/session"
  cp -Rp "$BASE/modules/lane" "$1/.contexture/modules/lane"
  cp -Rp "$MOD" "$1/.contexture/modules/storage-fts5"
}
WS="$SB/ws"
stage "$WS"
S="$WS/.contexture/sessions"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
# x <args>: ctx in the workspace (posix, the default); xf: the same reading fts5; answers
# in $SB/out and $SB/err, the exit code in RC
x() { (cd "$WS" && ./.contexture/ctx "$@" > "$SB/out" 2> "$SB/err"); RC=$?; }
xf() { (cd "$WS" && CTX_STORAGE_DRIVER=fts5 ./.contexture/ctx "$@" > "$SB/out" 2> "$SB/err"); RC=$?; }
# same <label> <args>: the view on posix and on fts5, byte for byte, both rc 0
same() {
  _l=$1; shift
  x "$@"; _prc=$RC; cp "$SB/out" "$SB/p.out"
  xf "$@"; _frc=$RC; cp "$SB/out" "$SB/f.out"
  if [ "$_prc" -eq 0 ] && [ "$_frc" -eq 0 ] && [ -s "$SB/p.out" ] && cmp -s "$SB/p.out" "$SB/f.out"; then ok "$_l reads the same on posix and fts5"
  else bad "$_l: posix rc $_prc, fts5 rc $_frc, $(cmp "$SB/p.out" "$SB/f.out" 2>&1 | head -n 1) [$(head -c 200 "$SB/err")]"; fi
}
# refused <rc> <line>: nothing on stdout, the stderr line exactly
refused() {
  if [ "$RC" -eq "$1" ] && [ ! -s "$SB/out" ] && [ "$(cat "$SB/err")" = "$2" ]; then return 0; fi
  printf '  got rc %s stdout [%s] stderr [%s]\n' "$RC" "$(head -c 200 "$SB/out")" "$(head -c 300 "$SB/err")"
  return 1
}
# records <unit>: the record count of the posix dump of the unit
records() { (cd "$WS" && ./.contexture/modules/session/drivers/posix/driver unit.export "$1" < /dev/null) | tail -n 1 | sed 's/^.*"records"://; s/}$//'; }
q() { sqlite3 "$WS/.contexture/sessions.db" "$1"; }

# ------------------------------------------------------------------------------
# the units: the fixture shapes of the retired plugin verb's suite
mkdir -p "$S/mig-unit/lanes/worker"
cat <<'EOF' > "$S/mig-unit/state.md"
# state grammar

status: ACTIVE
current_anchor: A2
next_action: "work active task: task-alpha"
objective: "Verify migration fidelity"
repos: []
ref_sessions: []
EOF
cat <<'EOF' > "$S/mig-unit/backlog.md"
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
cat <<'EOF' > "$S/mig-unit/journal.md"
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
cat <<'EOF' > "$S/mig-unit/knowledge.md"
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
printf '# recipe: worker\nGOAL: "Subagent test goal"\n' > "$S/mig-unit/lanes/worker/recipe.md"
printf '# report: worker\nReport findings evidence.\n' > "$S/mig-unit/lanes/worker/report.md"
cat <<'EOF' > "$S/mig-unit/lanes/worker/journal.md"
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

# the blank separator after a block never folds into its last block scalar
mkdir -p "$S/r7-unit/lanes/r7-lane"
printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "plan the next move"\nobjective: "Derived rows"\nrepos: []\n' > "$S/r7-unit/state.md"
cat <<'EOF' > "$S/r7-unit/backlog.md"
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

@task r7-legacy
  STATUS: TODO
  OBJECTIVE: "A legacy bare REFS line, read back through its verbatim"
  REFS: journal#2026-09-25-r7-a

@task r7-tail
  STATUS: TODO
  OBJECTIVE: "The last block of the file"
EOF
cat <<'EOF' > "$S/r7-unit/knowledge.md"
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
cat <<'EOF' > "$S/r7-unit/journal.md"
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
cat <<'EOF' > "$S/r7-unit/lanes/r7-lane/journal.md"
# journal grammar

@entry 2026-09-25-r7-la
  THREAD: none
  WHAT: "A lane WHAT written last"

@entry 2026-09-25-r7-lb
  WHAT: "A lane WHAT followed by a field"
  THREAD: none
EOF
printf '# recipe: r7-lane\nGOAL: "r7 lane"\n' > "$S/r7-unit/lanes/r7-lane/recipe.md"

# a legacy journal repeating a slug, main and lane
mkdir -p "$S/dup-unit/lanes/twin"
cat <<'EOF' > "$S/dup-unit/state.md"
status: ACTIVE
current_anchor: A1
next_action: "plan the next move"
objective: "Legacy duplicate slugs"
repos: []
EOF
cat <<'EOF' > "$S/dup-unit/journal.md"
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
printf '# recipe: twin\n' > "$S/dup-unit/lanes/twin/recipe.md"
cat <<'EOF' > "$S/dup-unit/lanes/twin/journal.md"
@entry 2026-09-25-self-check
  WHAT: "first self check"
  THREAD: none

@entry 2026-09-25-self-check
  WHAT: "second self check"
  THREAD: none
EOF

# a legacy backlog repeating a task slug, under a legacy state without next_action
mkdir -p "$S/dup-task"
printf 'status: ACTIVE\ncurrent_anchor: A1\nobjective: "dup task"\n' > "$S/dup-task/state.md"
printf '@task t1\n  STATUS: TODO\n  OBJECTIVE: "a"\n\n@task t1\n  STATUS: TODO\n  OBJECTIVE: "b"\n' > "$S/dup-task/backlog.md"

# the originals, kept for the byte for byte round trip of 5
cp -Rp "$S" "$SB/orig"

# ------------------------------------------------------------------------------
# 1. posix to fts5, one unit
want=$(records mig-unit)
x session migrate --from=posix --to=fts5 --unit=mig-unit
if [ "$RC" -eq 0 ] && [ -n "$want" ] && [ "$(cat "$SB/out")" = "$(printf 'migrated mig-unit: %s records (posix to fts5)\nmigrate posix to fts5: 1 units, %s records' "$want" "$want")" ] && [ ! -s "$SB/err" ]; then
  ok "1: --unit migrates one unit posix to fts5, its $want dump records echoed"
else bad "1: posix to fts5: rc $RC [$(cat "$SB/out")] want $want records [$(head -c 300 "$SB/err")]"; fi
(cd "$WS" && ./.contexture/modules/session/drivers/posix/driver unit.export mig-unit < /dev/null > "$SB/p.dump")
(cd "$WS" && ./.contexture/modules/storage-fts5/drivers/fts5 unit.export mig-unit < /dev/null > "$SB/f.dump")
if [ -s "$SB/p.dump" ] && cmp -s "$SB/p.dump" "$SB/f.dump"; then ok "1: the fts5 export equals the posix export byte for byte"
else bad "1: the fts5 export differs from the posix export: $(cmp "$SB/p.dump" "$SB/f.dump" 2>&1 | head -n 1)"; fi
x session migrate --from=posix --to=fts5 --unit=mig-unit
if refused 1 "unit.import: error: unit 'mig-unit' already exists (ERR_ENTITY_EXISTS)"; then ok "1: a unit the target holds refuses without --replace"; else bad "1: a held unit without --replace"; fi
(cd "$WS" && ./.contexture/modules/storage-fts5/drivers/fts5 unit.export mig-unit < /dev/null > "$SB/f2.dump")
if cmp -s "$SB/f.dump" "$SB/f2.dump"; then ok "1: the refused import left the fts5 unit unchanged"; else bad "1: the refused import changed the fts5 unit"; fi
x session migrate --from=posix --to=fts5 --unit=mig-unit --replace
if [ "$RC" -eq 0 ] && [ "$(head -n 1 "$SB/out")" = "migrated mig-unit: $want records (posix to fts5)" ]; then ok "1: --replace re-imports the held unit with the same records"
else bad "1: --replace: rc $RC [$(cat "$SB/out")] [$(head -c 300 "$SB/err")]"; fi
(cd "$WS" && ./.contexture/modules/storage-fts5/drivers/fts5 unit.export mig-unit < /dev/null > "$SB/f3.dump")
if cmp -s "$SB/f.dump" "$SB/f3.dump"; then ok "1: the replaced unit exports the same dump"; else bad "1: the replaced unit exports another dump"; fi
docs_rows=$(q "SELECT (SELECT count(*) FROM tasks WHERE unit='mig-unit' AND kind='task') || '|' || (SELECT count(*) FROM search_documents WHERE unit='mig-unit' AND entity_type='task');")
if [ "$docs_rows" = "2|2" ]; then ok "1: after the replace the ranked documents match the tasks (2|2, no orphan)"; else bad "1: tasks|task documents after the replace: $docs_rows, want 2|2"; fi

# ------------------------------------------------------------------------------
# 2. the views on both drivers
same "2: board mig-unit" session board mig-unit
same "2: task list mig-unit" session task list mig-unit --status=all
same "2: entry list mig-unit" session entry list mig-unit
same "2: finding list mig-unit" session finding list mig-unit
same "2: finding list --active-only mig-unit" session finding list mig-unit --active-only
same "2: lane show worker journal" lane show mig-unit worker journal
same "2: lane show worker recipe" lane show mig-unit worker recipe
same "2: lane show worker report" lane show mig-unit worker report
same "2: exact search fidelity" session search mig-unit fidelity
xf session board mig-unit
live=$(grep '^@entry ' "$SB/out" | sed 's/^@entry //' | tr '\n' ' ')
if [ "$live" = "2026-09-25-event-2 2026-09-25-event-6 2026-09-25-event-7 " ]; then ok "2: liveness follows every closer line and target (live: event-2 event-6 event-7)"
else bad "2: the fts5 live set: [$live]"; fi
xf session entry closure mig-unit 2026-09-25-event-3
c3=$(head -n 1 "$SB/out")
xf session entry closure mig-unit 2026-09-25-event-5
c5=$(head -n 1 "$SB/out")
if [ "$c3" = "closure mig-unit 2026-09-25-event-3: closed (folded)" ] && [ "$c5" = "closure mig-unit 2026-09-25-event-5: closed (dropped)" ]; then ok "2: the verdicts of both closer lines are kept (folded, dropped)"
else bad "2: closure verdicts: [$c3] [$c5]"; fi
xf session finding show mig-unit MIGRATION_FIDELITY
fs=$(cat "$SB/out")
xf session finding list mig-unit --active-only
fl=$(cat "$SB/out")
if printf '%s\n' "$fs" | grep -qx '  SUPERSEDED_BY: MIGRATION_FIDELITY_V2' && ! printf '%s\n' "$fl" | grep -q '^  MIGRATION_FIDELITY:' && printf '%s\n' "$fl" | grep -q '^  MIGRATION_FIDELITY_V2:'; then
  ok "2: supersession derived from SUPERSEDES (SUPERSEDED_BY shown, the active list without the predecessor)"
else bad "2: supersession: show [$fs] active list [$fl]"; fi
xf lane show mig-unit worker journal
if grep -qx '  CLOSES: 2026-09-25-lane-a (done: read by the dispatcher)' "$SB/out"; then ok "2: the lane closer landed on fts5"; else bad "2: the lane closer on fts5: [$(cat "$SB/out")]"; fi
xf session search mig-unit fidelity
n_exact=$(sed -n '1s/^search mig-unit "fidelity": \([0-9]*\) matches.*/\1/p' "$SB/out")
xf session search mig-unit fidelity --mode=hybrid
n_hyb=$(sed -n '1s/^search mig-unit "fidelity": \([0-9]*\) matches.*/\1/p' "$SB/out")
if [ "${n_exact:-0}" -ge 1 ] && [ "${n_hyb:-0}" -ge 1 ]; then ok "2: exact ($n_exact) and hybrid ($n_hyb) search find the imported text on fts5"
else bad "2: search on fts5: exact [${n_exact:-}] hybrid [${n_hyb:-}] rc $RC [$(head -c 200 "$SB/err")]"; fi

# ------------------------------------------------------------------------------
# 3. the typed fields carry no trailing newline
x session migrate --from=posix --to=fts5 --unit=r7-unit
[ "$RC" -eq 0 ] || bad "3: r7-unit posix to fts5: rc $RC [$(head -c 300 "$SB/err")]"
r7_rows=$(q "SELECT (SELECT count(*) FROM tasks WHERE unit='r7-unit' AND (description LIKE '%'||char(10) OR criteria LIKE '%'||char(10) OR details LIKE '%'||char(10))) || '|' || (SELECT count(*) FROM findings WHERE unit='r7-unit' AND summary LIKE '%'||char(10)) || '|' || (SELECT count(*) FROM journal_items WHERE unit='r7-unit' AND what LIKE '%'||char(10)) || '|' || (SELECT count(*) FROM lane_items WHERE unit='r7-unit' AND what LIKE '%'||char(10));")
if [ "$r7_rows" = "0|0|0|0" ]; then ok "3: no task block, finding summary, entry or lane entry WHAT ends with a newline"
else bad "3: fields ending with a newline (tasks|findings|entries|lane entries): $r7_rows"; fi
r7_vals=$(q "SELECT (SELECT description FROM tasks WHERE unit='r7-unit' AND slug='r7-full') || '|' || (SELECT details FROM tasks WHERE unit='r7-unit' AND slug='r7-full') || '|' || (SELECT description FROM tasks WHERE unit='r7-unit' AND slug='r7-desc') || '|' || (SELECT summary FROM findings WHERE unit='r7-unit' AND name='R7_FIRST') || '|' || (SELECT what FROM journal_items WHERE unit='r7-unit' AND slug='2026-09-25-r7-a') || '|' || (SELECT what FROM lane_items WHERE unit='r7-unit' AND slug='2026-09-25-r7-la') || '|' || (SELECT count(*) FROM tasks WHERE unit='r7-unit') || '|' || (SELECT count(*) FROM findings WHERE unit='r7-unit');")
r7_want=$(printf 'Description line 1.\nDescription line 2.|Details line.|Only a description.|First summary line.\nSecond summary line.|A WHAT written last|A lane WHAT written last|4|3')
if [ "$r7_vals" = "$r7_want" ]; then ok "3: the field values keep their interior newlines and nothing after"
else bad "3: field values [$r7_vals] want [$r7_want]"; fi
for t in r7-full r7-desc r7-legacy r7-tail; do same "3: task show --json $t" session task show r7-unit "$t" --json; done
xf session task show r7-unit r7-legacy --json
if grep -q '"refs":\["journal#2026-09-25-r7-a"\]' "$SB/out" && grep -q '"verbatim":"@task r7-legacy' "$SB/out"; then ok "3: the legacy task reads its refs list and keeps its stored bytes as verbatim"
else bad "3: the legacy task on fts5: [$(cat "$SB/out")]"; fi
for n in R7_FIRST R7_SECOND R7_TAIL; do same "3: finding show --json $n" session finding show r7-unit "$n" --json; done
same "3: entry show --json 2026-09-25-r7-a" session entry show r7-unit 2026-09-25-r7-a --json

# ------------------------------------------------------------------------------
# 4. legacy repeated slugs
x session migrate --from=posix --to=fts5 --unit=dup-unit
if [ "$RC" -eq 0 ]; then ok "4: a legacy journal repeating a slug (main and lane) imports whole"; else bad "4: dup-unit: rc $RC [$(head -c 300 "$SB/err")]"; fi
xf session entry list dup-unit
occ=$(sed 's/^  \[[^]]*\] \([^:]*\):.*/\1/' "$SB/out" | tr '\n' ' ')
if [ "$occ" = "2026-09-25-twice 2026-09-25-twice 2026-09-25-fold 2026-09-25-mid 2026-09-25-drop-mid 2026-09-25-mid " ]; then ok "4: every occurrence listed in journal order, never renamed"
else bad "4: the occurrences on fts5: [$occ]"; fi
same "4: entry list dup-unit" session entry list dup-unit
same "4: board dup-unit" session board dup-unit
same "4: lane show twin journal" lane show dup-unit twin journal
xf session board dup-unit
dl=$(grep '^  WHAT: ' "$SB/out" | tr '\n' '|')
if [ "$dl" = '  WHAT: "folds both occurrences"|  WHAT: "drops the earlier mid"|  WHAT: "after the closer, stays live"|' ] && grep -q '^  2026-09-25-mid (A1): the human' "$SB/out"; then
  ok "4: positional liveness: a closer closes the occurrences before it, the later mid live with its open thread"
else bad "4: dup-unit board on fts5: [$dl] [$(cat "$SB/out")]"; fi
xf session entry show dup-unit 2026-09-25-mid --json
if grep -q '"what":"after the closer, stays live"' "$SB/out" && grep -q '"closed":false' "$SB/out"; then ok "4: entry show reads the last occurrence, open"
else bad "4: entry show of the repeated slug: [$(cat "$SB/out")]"; fi
x session migrate --from=posix --to=fts5 --unit=dup-task
if [ "$RC" -eq 0 ]; then ok "4: a legacy backlog repeating a task slug imports (strictness applies to new writes only)"; else bad "4: dup-task: rc $RC [$(head -c 300 "$SB/err")]"; fi
same "4: task list dup-task" session task list dup-task --status=all
xf session task add dup-task t1 --objective="c"
if refused 1 "task.add: error: task 't1' already exists in unit 'dup-task' (ERR_ENTITY_EXISTS)"; then ok "4: a new repeat of the legacy task slug is refused on fts5"; else bad "4: task add of the repeated slug"; fi

# ------------------------------------------------------------------------------
# 5. fts5 to posix, every unit, byte for byte
rm -rf "$S/mig-unit" "$S/r7-unit" "$S/dup-unit" "$S/dup-task"
x session migrate --from=fts5 --to=posix
last=$(tail -n 1 "$SB/out")
units=$(grep '^migrated ' "$SB/out" | sed 's/^migrated \([^:]*\):.*/\1/' | tr '\n' ' ')
sum=$(sed -n 's/^migrated [^:]*: \([0-9]*\) records.*/\1/p' "$SB/out" | awk '{ s += $1 } END { print s + 0 }')
if [ "$RC" -eq 0 ] && [ "$units" = "dup-task dup-unit mig-unit r7-unit " ] && [ "$last" = "migrate fts5 to posix: 4 units, $sum records" ]; then
  ok "5: the bare form exports every unit fts5 to posix ($last)"
else bad "5: fts5 to posix: rc $RC [$(cat "$SB/out")] [$(head -c 300 "$SB/err")]"; fi
if diff -r "$SB/orig" "$S" > "$SB/rt.diff" 2>&1; then ok "5: every exported file equals its original byte for byte (state, backlog, knowledge, journal, lane recipe, journal, report)"
else bad "5: the round trip differs: $(head -n 5 "$SB/rt.diff")"; fi
cp -Rp "$S" "$SB/plant"
printf 'x' >> "$SB/plant/mig-unit/lanes/worker/journal.md"
if diff -r "$SB/orig" "$SB/plant" > /dev/null 2>&1; then bad "5: a planted byte reads as no difference (the comparison cannot fail)"; else ok "5: a planted byte reads as a difference"; fi

# ------------------------------------------------------------------------------
# 6. a multi-target closer through the verb on fts5
# (the posix side holds the same unit after 5, so the same record lands on both)
xf session record mig-unit --what="Closes two via the verb" --closes="2026-09-25-event-6 2026-09-25-event-7 (done: via the verb)" --slug=2026-09-25-event-8
frc=$RC
x session record mig-unit --what="Closes two via the verb" --closes="2026-09-25-event-6 2026-09-25-event-7 (done: via the verb)" --slug=2026-09-25-event-8
if [ "$frc" -eq 0 ] && [ "$RC" -eq 0 ]; then
  xf session entry show mig-unit 2026-09-25-event-7 --json
  if grep -q '"closed":true,"closed_by":"2026-09-25-event-8","close_reason":"done: via the verb"' "$SB/out"; then ok "6: the second target of a recorded closer reads closed, by the closer, with its verdict and reason"
  else bad "6: entry show of the second target: [$(cat "$SB/out")]"; fi
  same "6: entry show --json of the second target" session entry show mig-unit 2026-09-25-event-7 --json
  same "6: board mig-unit after the record" session board mig-unit
else bad "6: record with a two-target closer: fts5 rc $frc, posix rc $RC [$(head -c 300 "$SB/err")]"; fi

# ------------------------------------------------------------------------------
# 7. the refusals and the warning
x session migrate --from=posix --to=fts5 --prune
if refused 1 "session migrate: error: --prune applies to --corpus only (ERR_INVALID_ARGUMENT)"; then ok "7: --prune without --corpus refuses"; else bad "7: --prune without --corpus"; fi
x session migrate --to=fts5
if [ "$RC" -eq 1 ] && [ ! -s "$SB/out" ] && head -n 1 "$SB/err" | grep -q '^Usage: ctx session migrate --from=<driver> --to=<driver>'; then ok "7: a missing --from refuses with the usage"; else bad "7: a missing --from: rc $RC [$(cat "$SB/err")]"; fi
x session migrate --from=posix --to=fts5 --bogus
if refused 1 "session migrate: error: unknown option '--bogus' (ERR_INVALID_ARGUMENT)"; then ok "7: an unknown option refuses"; else bad "7: an unknown option"; fi
x session migrate --from=posix --to=nosuch --unit=mig-unit
if [ "$RC" -eq 2 ] && [ ! -s "$SB/out" ] && grep -q "storage driver 'nosuch' not found.*(ERR_DRIVER_NOT_FOUND)" "$SB/err"; then ok "7: an unknown driver refuses rc 2"; else bad "7: an unknown driver: rc $RC [$(cat "$SB/err")]"; fi
x session migrate --from=posix --to=fts5 --unit=absent-u
if refused 1 "unit.export: error: unit 'absent-u' not found (ERR_ENTITY_NOT_FOUND)"; then ok "7: a unit the source lacks refuses"; else bad "7: a unit the source lacks"; fi
mkdir -p "$S/xu"
printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "x"\nobjective: "x"\nrepos: []\n' > "$S/xu/state.md"
printf 'a note\n' > "$S/xu/notes.txt"
x session migrate --from=posix --to=fts5 --unit=xu
if [ "$RC" -eq 0 ] && [ "$(cat "$SB/err")" = "WARNING: unit xu holds 1 items outside the record in the posix store; they do not travel" ]; then ok "7: a file outside the record warns and does not travel"
else bad "7: the extras warning: rc $RC [$(cat "$SB/err")]"; fi
x session migrate --from=fts5 --to=posix --unit=xu --replace
if [ "$RC" -eq 0 ] && [ "$(cat "$S/xu/notes.txt" 2>/dev/null)" = "a note" ] && [ ! -s "$SB/err" ]; then ok "7: --replace into posix swaps the record and leaves the file outside it untouched"
else bad "7: --replace into posix: rc $RC notes [$(cat "$S/xu/notes.txt" 2>&1)] [$(cat "$SB/err")]"; fi

# ------------------------------------------------------------------------------
# 8. the corpus, in a workspace of its own
C="$SB/corpus-ws"
stage "$C"
rmdir "$C/.contexture/sessions"
mkdir -p "$C/docs/alpha" "$C/docs/beta"
printf '@doc overview one\n  repo: alpha\n  description: "a \\n literal, a\ttab, \303\247al\304\261\305\237ma"' > "$C/docs/alpha/one.md"
printf '@doc overview two\n  repo: alpha\n' > "$C/docs/alpha/two.md"
printf '@doc overview three\n  repo: beta\n' > "$C/docs/beta/three.md"
printf '# a guide, never a doc\n' > "$C/docs/guide.md"
cp -Rp "$C/docs" "$C/docs.orig"
c() { (cd "$C" && ./.contexture/ctx "$@" > "$SB/out" 2> "$SB/err"); RC=$?; }
cq() { sqlite3 "$C/.contexture/sessions.db" "$1"; }
c session migrate --from=posix --to=fts5 --corpus
if [ "$RC" -eq 0 ] && [ "$(cat "$SB/out")" = "$(printf 'migrate posix to fts5: 0 units, 0 records\ncorpus: 3 docs')" ]; then ok "8: --corpus imports the 3 docs (no unit needed), the guide never a doc"
else bad "8: corpus import: rc $RC [$(cat "$SB/out")] [$(head -c 300 "$SB/err")]"; fi
c_state=$(cq "SELECT (SELECT user_version FROM pragma_user_version) || '|' || (SELECT count(*) FROM docs) || '|' || (SELECT count(*) FROM doc_changes);")
# one change-log row per doc: the verb writes each doc through corpus.write (the retired
# plugin verb's import wrote none); named for the land, pinned here so a change is seen
if [ "$c_state" = "4|3|3" ]; then ok "8: the store at schema 4 holds 3 docs and logs one change row per doc written"
else bad "8: the corpus store (version|docs|change rows): $c_state, want 4|3|3"; fi
rm -rf "$C/docs/alpha" "$C/docs/beta"
c session migrate --from=fts5 --to=posix --corpus
if [ "$RC" -eq 0 ] && [ "$(tail -n 1 "$SB/out")" = "corpus: 3 docs" ] && diff -r "$C/docs.orig" "$C/docs" > /dev/null 2>&1; then ok "8: --corpus exports every doc back byte for byte (the guide kept)"
else bad "8: corpus export: rc $RC [$(cat "$SB/out")] [$(head -c 300 "$SB/err")] $(diff -r "$C/docs.orig" "$C/docs" 2>&1 | head -n 3)"; fi
printf '@doc overview extra\n  repo: beta\n' > "$C/docs/beta/extra.md"
c session migrate --from=fts5 --to=posix --corpus
if [ "$RC" -eq 1 ] && grep -q "the posix corpus holds doc(s) the fts5 corpus lacks: beta/extra; a migrate never deletes a doc silently" "$SB/err" && [ -f "$C/docs/beta/extra.md" ]; then ok "8: a target doc the source lacks refuses without --prune, nothing removed"
else bad "8: the extra doc without --prune: rc $RC [$(cat "$SB/err")]"; fi
c session migrate --from=fts5 --to=posix --corpus --prune
if [ "$RC" -eq 0 ] && grep -qx 'corpus pruned: 1 docs' "$SB/out" && [ ! -e "$C/docs/beta/extra.md" ] && [ -f "$C/docs/guide.md" ] && diff -r "$C/docs.orig" "$C/docs" > /dev/null 2>&1; then ok "8: --prune removes the extra doc and keeps the guide"
else bad "8: --prune: rc $RC [$(cat "$SB/out")] [$(head -c 300 "$SB/err")]"; fi
rm -rf "$C/docs/alpha" "$C/docs/beta"
c session migrate --from=posix --to=fts5 --corpus
if [ "$RC" -eq 0 ] && [ "$(tail -n 1 "$SB/out")" = "corpus: 0 docs (the posix corpus holds no doc; the fts5 corpus is left as is)" ] && [ "$(cq 'SELECT count(*) FROM docs;')" = 3 ]; then ok "8: an empty source leaves the target corpus as is"
else bad "8: the empty source: rc $RC [$(cat "$SB/out")] docs $(cq 'SELECT count(*) FROM docs;')"; fi
if command -v git > /dev/null 2>&1; then
  G="$SB/git-ws"
  stage "$G"
  mkdir -p "$G/docs/alpha"
  cp -p "$C/docs.orig/alpha/two.md" "$G/docs/alpha/two.md"
  (cd "$G" && git init -q && git add docs && git -c user.name=t -c user.email=t@example.invalid commit -qm docs) > /dev/null 2>&1
  printf '  note: an uncommitted line\n' >> "$G/docs/alpha/two.md"
  (cd "$G" && ./.contexture/ctx session migrate --from=posix --to=fts5 --corpus > "$SB/out" 2> "$SB/err"); RC=$?
  if [ "$RC" -eq 1 ] && grep -q 'the tracked corpus carries uncommitted changes in repo(s) alpha' "$SB/err"; then ok "8: a tracked corpus with uncommitted changes refuses to move into the store"
  else bad "8: the dirty tracked corpus: rc $RC [$(cat "$SB/err")]"; fi
  (cd "$G" && git checkout -q -- docs && ./.contexture/ctx session migrate --from=posix --to=fts5 --corpus > "$SB/out" 2> "$SB/err"); RC=$?
  if [ "$RC" -eq 0 ] && grep -q 'is tracked in git; the fts5 store now holds it' "$SB/err" && grep -q '^  git rm -r --cached docs/alpha$' "$SB/err"; then ok "8: a clean tracked corpus moves and the git steps print, never run"
  else bad "8: the clean tracked corpus: rc $RC [$(cat "$SB/err")]"; fi
else
  printf 'NOTE: git not found; the tracked corpus cases not run\n'
fi

# ------------------------------------------------------------------------------
# 9. the configuration never written; the plugin carries no migrate verb
if [ ! -e "$WS/.contexture/config" ] && [ ! -e "$C/.contexture/config" ]; then ok "9: no migrate wrote a configuration (storage.driver is the human's act)"
else bad "9: a configuration appeared"; fi
x storage-fts5 migrate --from=posix --to=fts5
if [ "$RC" -eq 1 ] && [ ! -s "$SB/out" ] && grep -q 'unknown verb: migrate' "$SB/err"; then ok "9: ctx storage-fts5 migrate answers an unknown verb rc 1"
else bad "9: ctx storage-fts5 migrate: rc $RC [$(cat "$SB/out")] [$(cat "$SB/err")]"; fi

printf 'test-session-migrate: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
