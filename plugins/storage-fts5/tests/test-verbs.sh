#!/bin/sh
# test-verbs.sh: the verb path on posix and on the plugin's own fts5 module copy. No verb or
# function moves a record between backends (knowledge#MIGRATION_IS_AGENT_JUDGMENT): a record
# reaches a store through the ordinary verbs, so this case writes one unit through the same
# verb sequence on both drivers and holds fts5 to posix's answers. A workspace is staged
# from the shipped core (base/.contexture/ctx, the session and lane modules) and this
# plugin's module copy, with no storage.driver configured: the posix calls run as
# configured, the fts5 calls name fts5 through CTX_STORAGE_DRIVER. It carries the live
# checks of the retired test-session-migrate:
#   1. the views read the same on both drivers (board, task list, entry list, finding list
#      and its active list, entry closure, lane recipe, journal, report, exact search, and
#      every show --json), for a unit with sections, refs, a supersession, two closer lines
#      on one entry (one of two targets), a stamped anchor, and a lane; the comparator
#      reads a planted difference
#   2. liveness follows every closer line and target, the verdicts kept; supersession
#      derived; exact and hybrid search find the written text on fts5
#   3. the typed fields of the fts5 store carry no trailing newline and keep their interior
#      newlines
#   4. ctx storage-fts5 migrate and ctx session migrate answer unknown verbs
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
SB=$(mktemp -d "$tmp_root/fts5-verbs.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
# the sandbox answers for itself: nothing of the calling workspace reaches it
unset CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH
export LC_ALL=C

WS="$SB/ws"
mkdir -p "$WS/.contexture/modules" "$WS/.contexture/tmp"
cp -p "$BASE/ctx" "$WS/.contexture/ctx"
cp -Rp "$BASE/modules/session" "$WS/.contexture/modules/session"
cp -Rp "$BASE/modules/lane" "$WS/.contexture/modules/lane"
cp -Rp "$MOD" "$WS/.contexture/modules/storage-fts5"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
# x <args>: ctx in the workspace (posix, the default); xf: the same on fts5; answers in
# $SB/out and $SB/err, the exit code in RC
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
q() { sqlite3 "$WS/.contexture/sessions.db" "$1"; }

# build <x|xf>: the one verb sequence, every call rc 0 (a failure lands in $SB/fails)
: > "$SB/fails"
# w <x|xf> <args>: one call with stdin from /dev/null; wi <file> <x|xf> <args>: with <file> on stdin
w() { "$@" < /dev/null; [ "$RC" -eq 0 ] || printf '%s: rc %s [%s]\n' "$*" "$RC" "$(head -c 200 "$SB/err")" >> "$SB/fails"; }
wi() { wi_f=$1; shift; "$@" < "$wi_f"; [ "$RC" -eq 0 ] || printf '%s: rc %s [%s]\n' "$*" "$RC" "$(head -c 200 "$SB/err")" >> "$SB/fails"; }
build() {
  d=$1
  w $d session bootstrap verb-unit "Verify the verb path"
  w $d session task add verb-unit task-alpha --objective="Implement the verb path" --refs="journal#2026-09-25-event-1" \
    --desc="$(printf 'Multiline description line 1.\nMultiline description line 2.')" \
    --criteria="Passes every view on both drivers." --details="Use the ordinary verbs."
  w $d session task add verb-unit task-beta --objective="A second task"
  w $d session task add verb-unit task-desc --objective="Only a description" --desc="Only a description."
  w $d session task start verb-unit task-alpha --pointer="task-alpha IN_PROGRESS: the verb path"
  w $d session finding add verb-unit VERB_FIDELITY --summary="$(printf 'First summary line.\nSecond summary line.')" --ref="journal#2026-09-25-event-1"
  w $d session finding supersede verb-unit VERB_FIDELITY VERB_FIDELITY_V2 --summary="The second reading, fidelity kept."
  n=1
  while [ "$n" -le 5 ]; do
    case "$n" in 3) th="the human" ;; *) th=none ;; esac
    w $d session record verb-unit --what="Event $n on the fidelity walk" --slug="2026-09-25-event-$n" --thread="$th" --group=walk
    n=$((n + 1))
  done
  w $d session stamp verb-unit "the verb stamp"
  w $d session record verb-unit --what="Folds two and drops one" --slug=2026-09-25-event-6 \
    --closes="2026-09-25-event-3 2026-09-25-event-4 (folded: two at once)" --closes="2026-09-25-event-5 (dropped: not needed)"
  w $d session record verb-unit --what="A KNOWLEDGE flag harvested below" --slug=2026-09-25-event-7 --knowledge --ref="knowledge#VERB_FIDELITY_V2"
  w $d session record verb-unit --what="Harvests the flag" --slug=2026-09-25-event-8 --closes="2026-09-25-event-7 (done: harvested into VERB_FIDELITY_V2)"
  printf '# recipe grammar\nMISSION\n  GOAL: "walk the lane on both drivers"\n' > "$SB/recipe.md"
  wi "$SB/recipe.md" $d lane create verb-unit worker
  w $d lane record verb-unit worker --what="A lane step, written last" --slug=2026-09-25-lane-a --thread="the dispatcher"
  w $d lane report verb-unit worker --body="@claim one
  the lane landed with a fidelity claim"
}
build x
build xf
if [ -s "$SB/fails" ]; then bad "the verb sequence lands on both drivers: $(cat "$SB/fails")"; else ok "the verb sequence lands on both drivers"; fi

# ------------------------------------------------------------------------------
# 1. the views on both drivers
same "1: board" session board verb-unit
same "1: task list" session task list verb-unit --status=all
same "1: entry list" session entry list verb-unit
same "1: finding list" session finding list verb-unit
same "1: finding list --active-only" session finding list verb-unit --active-only
same "1: entry closure of event-3" session entry closure verb-unit 2026-09-25-event-3
same "1: entry closure of event-5" session entry closure verb-unit 2026-09-25-event-5
same "1: lane show worker journal" lane show verb-unit worker journal
same "1: lane show worker recipe" lane show verb-unit worker recipe
same "1: lane show worker report" lane show verb-unit worker report
same "1: exact search fidelity" session search verb-unit fidelity --mode=exact
for t in task-alpha task-beta task-desc; do same "1: task show --json $t" session task show verb-unit "$t" --json; done
for f in VERB_FIDELITY VERB_FIDELITY_V2; do same "1: finding show --json $f" session finding show verb-unit "$f" --json; done
for e in 1 3 4 5 6 7 8; do same "1: entry show --json event-$e" session entry show verb-unit "2026-09-25-event-$e" --json; done
same "1: load page 1" session load verb-unit 1
# the comparator reads a planted difference: two different views never read the same
x session board verb-unit; cp "$SB/out" "$SB/p.out"
xf session task list verb-unit --status=all; cp "$SB/out" "$SB/f.out"
if cmp -s "$SB/p.out" "$SB/f.out"; then bad "1: the comparator reads a planted difference"; else ok "1: the comparator reads a planted difference"; fi

# ------------------------------------------------------------------------------
# 2. liveness, verdicts, supersession, search on fts5
xf session board verb-unit
live=$(grep '^@entry ' "$SB/out" | sed 's/^@entry //' | tr '\n' ' ')
if [ "$live" = "2026-09-25-event-1 2026-09-25-event-2 2026-09-25-event-6 2026-09-25-event-8 " ]; then ok "2: liveness follows every closer line and target (live: event-1 event-2 event-6 event-8)"
else bad "2: the fts5 live set: [$live]"; fi
xf session entry closure verb-unit 2026-09-25-event-4
c4=$(head -n 1 "$SB/out")
xf session entry closure verb-unit 2026-09-25-event-5
c5=$(head -n 1 "$SB/out")
if [ "$c4" = "closure verb-unit 2026-09-25-event-4: closed (folded)" ] && [ "$c5" = "closure verb-unit 2026-09-25-event-5: closed (dropped)" ]; then ok "2: the verdicts of both closer lines are kept (folded, dropped)"
else bad "2: closure verdicts: [$c4] [$c5]"; fi
xf session finding show verb-unit VERB_FIDELITY
fs=$(cat "$SB/out")
xf session finding list verb-unit --active-only
fl=$(cat "$SB/out")
if printf '%s\n' "$fs" | grep -qx '  SUPERSEDED_BY: VERB_FIDELITY_V2' && ! printf '%s\n' "$fl" | grep -q '^  VERB_FIDELITY:' && printf '%s\n' "$fl" | grep -q '^  VERB_FIDELITY_V2:'; then
  ok "2: supersession derived (SUPERSEDED_BY shown, the active list without the predecessor)"
else bad "2: supersession: show [$fs] active list [$fl]"; fi
xf session search verb-unit fidelity --mode=exact
n_exact=$(sed -n '1s/^search verb-unit "fidelity": \([0-9]*\) matches.*/\1/p' "$SB/out")
xf session search verb-unit fidelity --mode=hybrid
n_hyb=$(sed -n '1s/^search verb-unit "fidelity": \([0-9]*\) matches.*/\1/p' "$SB/out")
if [ "${n_exact:-0}" -ge 1 ] && [ "${n_hyb:-0}" -ge 1 ]; then ok "2: exact ($n_exact) and hybrid ($n_hyb) search find the written text on fts5"
else bad "2: search on fts5: exact [${n_exact:-}] hybrid [${n_hyb:-}] rc $RC [$(head -c 200 "$SB/err")]"; fi

# ------------------------------------------------------------------------------
# 3. the typed fields of the fts5 store carry no trailing newline
rows=$(q "SELECT (SELECT count(*) FROM tasks WHERE unit='verb-unit' AND (description LIKE '%'||char(10) OR criteria LIKE '%'||char(10) OR details LIKE '%'||char(10))) || '|' || (SELECT count(*) FROM findings WHERE unit='verb-unit' AND summary LIKE '%'||char(10)) || '|' || (SELECT count(*) FROM journal_items WHERE unit='verb-unit' AND what LIKE '%'||char(10)) || '|' || (SELECT count(*) FROM lane_items WHERE unit='verb-unit' AND what LIKE '%'||char(10));")
if [ "$rows" = "0|0|0|0" ]; then ok "3: no task block, finding summary, entry or lane entry WHAT ends with a newline"
else bad "3: fields ending with a newline (tasks|findings|entries|lane entries): $rows"; fi
vals=$(q "SELECT (SELECT description FROM tasks WHERE unit='verb-unit' AND slug='task-alpha') || '|' || (SELECT details FROM tasks WHERE unit='verb-unit' AND slug='task-alpha') || '|' || (SELECT description FROM tasks WHERE unit='verb-unit' AND slug='task-desc') || '|' || (SELECT summary FROM findings WHERE unit='verb-unit' AND name='VERB_FIDELITY') || '|' || (SELECT what FROM journal_items WHERE unit='verb-unit' AND slug='2026-09-25-event-1') || '|' || (SELECT what FROM lane_items WHERE unit='verb-unit' AND slug='2026-09-25-lane-a') || '|' || (SELECT count(*) FROM tasks WHERE unit='verb-unit') || '|' || (SELECT count(*) FROM findings WHERE unit='verb-unit');")
want=$(printf 'Multiline description line 1.\nMultiline description line 2.|Use the ordinary verbs.|Only a description.|First summary line.\nSecond summary line.|Event 1 on the fidelity walk|A lane step, written last|3|2')
if [ "$vals" = "$want" ]; then ok "3: the field values keep their interior newlines and nothing after"
else bad "3: field values [$vals] want [$want]"; fi

# ------------------------------------------------------------------------------
# 4. no migrate verb anywhere
xf storage-fts5 migrate --from=posix --to=fts5
if [ "$RC" -eq 1 ] && [ ! -s "$SB/out" ] && grep -q '^ctx: unknown verb: migrate$' "$SB/err"; then ok "4: ctx storage-fts5 migrate answers an unknown verb rc 1"
else bad "4: ctx storage-fts5 migrate: rc $RC [$(cat "$SB/out")] [$(head -c 200 "$SB/err")]"; fi
xf session migrate --from=posix --to=fts5
if [ "$RC" -eq 1 ] && [ ! -s "$SB/out" ] && grep -q '^ctx: unknown verb: migrate$' "$SB/err"; then ok "4: ctx session migrate answers an unknown verb rc 1"
else bad "4: ctx session migrate: rc $RC [$(cat "$SB/out")] [$(head -c 200 "$SB/err")]"; fi

printf 'test-verbs: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
