#!/bin/sh
# session-tests.sh: the session module suite, staged from the shipped core
# (base/.contexture/ctx and the base session module). Covers the verb surface
# (every shipped verb has a case and its no-arg rc contract), refusals, paging
# (load pages to completion), the refs form, the refresh rc semantics (audit rc
# wins over hook rc), the standalone helper fallbacks (no CTX_MODULE_DIR, no
# CTX_BIN), and the parallel-write probe (distinct-target writes both land;
# same-target writes exit clean with no temp residue and no torn journal).
#
# Usage: tests/session-tests.sh
# Exit 0 when every case passes; 1 otherwise.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG
TODAY=$(date +%Y-%m-%d)

if [ ! -f "$CTX_SRC" ]; then
  echo "session-tests.sh: ctx not found at $CTX_SRC" >&2
  exit 1
fi

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SANDBOX=$(mktemp -d "$tmp_root/session-tests.XXXXXX") || exit 1
cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

mkdir -p "$SANDBOX/.contexture/modules" "$SANDBOX/.contexture/rhythms"
cp "$CTX_SRC" "$SANDBOX/.contexture/ctx"
chmod +x "$SANDBOX/.contexture/ctx"
cp -R "$SESSION_MOD" "$SANDBOX/.contexture/modules/session"
[ -d "$ROOT/base/.contexture/modules/lane" ] && cp -R "$ROOT/base/.contexture/modules/lane" "$SANDBOX/.contexture/modules/lane"
[ -d "$ROOT/.contexture/modules/lane" ] && cp -R "$ROOT/.contexture/modules/lane" "$SANDBOX/.contexture/modules/lane"
cat > "$SANDBOX/.contexture/rhythms/probe.md" <<'EOF'
@rhythm probe
  use when: the suite needs an index line
  activation: propose
EOF

cd "$SANDBOX" || exit 1
CTX=./.contexture/ctx
chmod +x .contexture/modules/*/scripts/* 2>/dev/null || true

pass=0
fail=0
ok() { pass=$((pass + 1)); echo "PASS: $1"; }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }
a_not() { if printf '%s\n' "$1" | grep -q "$2"; then bad "$3 (unwanted: $2)"; else ok "$3"; fi; }

echo "== V verb surface and no-arg rc contract =="
DECLARED="active amend append audit board bootstrap close diagnose drop entry finding flip index load next query record refresh refs resolve search stamp task"
disk=$(for f in .contexture/modules/session/scripts/*; do
  [ -f "$f" ] || continue
  b=${f##*/}
  printf '%s\n' "$b" | grep -q '^\.' && continue
  grep -q '^# summary: ' "$f" || continue
  printf '%s\n' "$b"
done | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
a_eq "$disk" "$DECLARED" "verb surface: scripts on disk match the declared suite list"
$CTX session help >/dev/null 2>&1
a_eq "$?" "0" "verb:help rc0"
for v in $DECLARED; do
  $CTX session "$v" >/dev/null 2>&1
  rc=$?
  case "$v" in
    active|diagnose|index) want=0 ;;
    *) want=1 ;;
  esac
  a_eq "$rc" "$want" "verb:$v no-arg rc $want"
done
out=$($CTX session index)
a_match "$out" "probe (.*probe.md) | use when: the suite needs an index line | activation: propose" "index renders the rhythm line"
out=$($CTX session active)
a_match "$out" "no sessions yet" "active on an empty drawer rc0"

echo "== R refusals =="
$CTX session bootstrap >/dev/null 2>&1; a_eq "$?" "1" "bootstrap no args rc1"
$CTX session bootstrap u1 "refusal unit" >/dev/null 2>&1; a_eq "$?" "0" "bootstrap u1 rc0"
$CTX session bootstrap u1 "again" >/dev/null 2>&1; a_eq "$?" "1" "bootstrap existing slug rc1"
$CTX session bootstrap "bad slug" "x" >/dev/null 2>&1; a_eq "$?" "1" "bootstrap malformed slug rc1"
$CTX session load nosuch >/dev/null 2>&1; a_eq "$?" "1" "load missing unit rc1"
err=$($CTX session load nosuch 2>&1 >/dev/null)
a_match "$err" "ERROR: missing state: .contexture/sessions/nosuch/state.md" "load missing unit names the state"
$CTX session load u1 99 >/dev/null 2>&1; a_eq "$?" "1" "load page out of range rc1"
err=$($CTX session load u1 99 2>&1 >/dev/null)
a_match "$err" "page out of range" "load page refusal names the range"
$CTX session stamp u1 >/dev/null 2>&1; a_eq "$?" "1" "stamp without a message rc1"
$CTX session audit nosuch >/dev/null 2>&1; a_eq "$?" "1" "audit missing unit rc1"
$CTX session query nosuchkind u1 >/dev/null 2>&1; a_eq "$?" "1" "query unknown kind rc1"
$CTX session query entry u1 no-such-slug >/dev/null 2>&1; a_eq "$?" "1" "query entry miss rc1"
$CTX session active extra >/dev/null 2>&1; a_eq "$?" "1" "active with an argument rc1"
$CTX session index extra >/dev/null 2>&1; a_eq "$?" "1" "index with an argument rc1"
$CTX session refs u1 u1 >/dev/null 2>&1; a_eq "$?" "1" "refs naming the unit itself rc1"
$CTX session refs u1 nosuch >/dev/null 2>&1; a_eq "$?" "1" "refs naming a missing session rc1"
$CTX session next u1 >/dev/null 2>&1; a_eq "$?" "1" "next without a pointer rc1"
$CTX session flip u1 bogus some-task >/dev/null 2>&1; a_eq "$?" "1" "flip with a bogus status rc1"

echo "== P paging =="
$CTX session bootstrap page-unit "paging unit" >/dev/null 2>&1
awk -v today="$TODAY" 'BEGIN {
  printf "@entry %s-page-one\n  WHAT: \"", today;
  for (i = 0; i < 3000; i++) printf "first-page-word-%d ", i;
  print "\"\n  THREAD: none"
}' | $CTX session append page-unit >/dev/null 2>&1
a_eq "$?" "0" "paging: first big entry appended"
awk -v today="$TODAY" 'BEGIN {
  printf "@entry %s-page-two\n  WHAT: \"", today;
  for (i = 0; i < 3000; i++) printf "second-page-word-%d ", i;
  print "\"\n  THREAD: none"
}' | $CTX session append page-unit >/dev/null 2>&1
a_eq "$?" "0" "paging: second big entry appended"
out=$($CTX session load page-unit 1)
rc=$?
a_eq "$rc" "0" "load page 1 rc0"
a_match "$out" "LOAD INCOMPLETE (page 1 of " "page 1 names itself incomplete"
npages=$(printf '%s\n' "$out" | sed -n 's/^LOAD INCOMPLETE (page 1 of \([0-9][0-9]*\)).*$/\1/p' | head -n 1)
npages=${npages:-0}
if [ "$npages" -ge 2 ]; then ok "paging: parsed page count $npages (>= 2)"; else bad "paging: parsed page count [$npages] (want >= 2)"; fi
out=$($CTX session load page-unit "$npages")
rc=$?
a_eq "$rc" "0" "load last page rc0"
a_match "$out" "LOAD COMPLETE: pages $npages/$npages" "last page reads complete"
map=$($CTX session load page-unit "$npages" | grep -m1 '^  journal:')
a_match "$map" "pages [0-9][0-9]*-$npages$" "map reports the journal span through the last page"
$CTX session load page-unit $((npages + 1)) >/dev/null 2>&1
a_eq "$?" "1" "load one page past the end rc1"

echo "== F refs form =="
load_all() {
  la_form=$1
  la_slug=$2
  la_p=1
  while :; do
    if [ "$la_form" = refs ]; then
      la_out=$($CTX session load refs "$la_slug" "$la_p" 2>/dev/null) || return 1
    else
      la_out=$($CTX session load "$la_slug" "$la_p" 2>/dev/null) || return 1
    fi
    printf '%s\n' "$la_out"
    la_n=$(printf '%s\n' "$la_out" | sed -n 's/^\[load [^|]* | [^|]* | page [0-9][0-9]*\/\([0-9][0-9]*\) | .*$/\1/p' | head -n 1)
    [ -n "$la_n" ] || return 1
    [ "$la_p" -ge "$la_n" ] && return 0
    la_p=$((la_p + 1))
  done
}
$CTX session bootstrap ref-src "reference source unit" >/dev/null 2>&1
$CTX session bootstrap ref-unit "reference reader unit" >/dev/null 2>&1
$CTX session refs ref-unit ref-src >/dev/null 2>&1
a_eq "$?" "0" "refs set rc0"
out=$(load_all main ref-unit)
a_match "$out" "REF SESSION: ref-src (READ-ONLY)" "main load renders the ref session read-only"
a_match "$out" "WRITE SCOPE: .contexture/sessions/ref-unit/ .*ref sessions READ-ONLY" "main load scopes writes to the unit"
out=$(load_all refs ref-src)
rc=$?
a_eq "$rc" "0" "refs form load rc0"
a_match "$out" "REF LOAD COMPLETE" "refs form reads complete"
a_match "$out" "READ-ONLY" "refs form names the read-only constraint"
$CTX session load refs nosuch >/dev/null 2>&1
a_eq "$?" "1" "refs form on a missing session rc1"
$CTX session refs ref-unit >/dev/null 2>&1
a_eq "$?" "0" "refs clear rc0"
out=$(load_all main ref-unit)
a_not "$out" "REF SESSION:" "cleared refs render no ref section"

echo "== H refresh rc semantics and hook policy =="
$CTX session bootstrap refresh-unit "refresh semantics unit" >/dev/null 2>&1
$CTX session refresh refresh-unit >/dev/null 2>&1
a_eq "$?" "0" "refresh on a clean unit rc0"
mkdir -p .contexture/modules/warnmod/hooks
printf '# summary: warn hooks\n' > .contexture/modules/warnmod/module
printf '#!/bin/sh\n# ctx-hook: refresh\nexit 3\n' > .contexture/modules/warnmod/hooks/w
chmod +x .contexture/modules/warnmod/hooks/w
err=$($CTX session refresh refresh-unit 2>&1 >/dev/null)
a_eq "$?" "0" "warn hook keeps a clean refresh rc0"
a_match "$err" "hook failed at refresh: warnmod: w (rc=3); continuing" "warn hook warns on stderr"
mkdir -p .contexture/modules/blockmod/hooks
printf '# summary: block hooks\n' > .contexture/modules/blockmod/module
printf '#!/bin/sh\n# ctx-hook: refresh\n# ctx-hook-mode: block\nexit 4\n' > .contexture/modules/blockmod/hooks/b
chmod +x .contexture/modules/blockmod/hooks/b
$CTX session refresh refresh-unit >/dev/null 2>&1
a_eq "$?" "1" "block hook fails a clean refresh rc1"
cp .contexture/sessions/refresh-unit/journal.md journal.bak
cat >> .contexture/sessions/refresh-unit/journal.md <<'EOF'

@entry 2026-09-22-broken
  ANCHOR: A2
  WHAT: "sandbox broken entry"
  THREAD: none
  CLOSES: 2026-01-01-nonexistent (done: nothing)
EOF
$CTX session audit refresh-unit >/dev/null 2>&1
a_eq "$?" "1" "dirty audit rc1"
$CTX session refresh refresh-unit >/dev/null 2>&1
a_eq "$?" "1" "refresh rc stays 1 while dirty"
rm -rf .contexture/modules/blockmod
$CTX session refresh refresh-unit >/dev/null 2>&1
a_eq "$?" "1" "refresh rc = dirty audit rc without the block hook"
cp journal.bak .contexture/sessions/refresh-unit/journal.md
$CTX session audit refresh-unit >/dev/null 2>&1
a_eq "$?" "0" "repaired audit rc0"
$CTX session refresh refresh-unit >/dev/null 2>&1
a_eq "$?" "0" "refresh rc0 after repair"

echo "== S standalone helper fallbacks =="
out=$(env -u CTX_MODULE_DIR awk -f .contexture/modules/session/scripts/load ref-unit 1 2>load.err)
rc=$?
a_eq "$rc" "0" "standalone load (board helper fallback) rc0"
a_match "$out" "LOAD" "standalone load prints a page"
a_eq "$(cat load.err)" "" "standalone load silent stderr"
$CTX session bootstrap u2 "standalone close unit" >/dev/null 2>&1
out=$(env -u CTX_MODULE_DIR awk -f .contexture/modules/session/scripts/record close u2 2>close.err)
rc=$?
a_eq "$rc" "0" "standalone record close (audit helper fallback) rc0"
a_match "$out" "CLOSED: u2" "standalone close prints CLOSED"
$CTX session bootstrap u3 "standalone stamp unit" >/dev/null 2>&1
env -u CTX_BIN awk -f .contexture/modules/session/scripts/stamp u3 "standalone stamp" >stamp.out 2>stamp.err
rc=$?
a_eq "$rc" "0" "standalone stamp without CTX_BIN rc0"
a_match "$(cat stamp.out)" "transition: A1 -> A2" "standalone stamp prints the transition"
a_eq "$(cat stamp.err)" "" "standalone stamp silent stderr"
out=$(env -u CTX_MODULE_DIR awk -f .contexture/modules/session/scripts/board ref-unit 2>board.err)
rc=$?
a_eq "$rc" "0" "standalone board (load helper) rc0"
a_eq "$(cat board.err)" "" "standalone board silent stderr"

echo "== E agent semantic interface and lane module =="
$CTX session bootstrap sem-unit "semantic interface test" >/dev/null 2>&1
a_eq "$?" "0" "semantic: bootstrap sem-unit rc0"

# 1. task add with typed flags
$CTX session task add sem-unit task-1 --objective="First objective" --desc="Task 1 description" --criteria="Criteria 1" --details="Details 1" >/dev/null 2>&1
a_eq "$?" "0" "semantic: task add typed flags rc0"
out=$($CTX session task show sem-unit task-1)
a_match "$out" "OBJECTIVE: \"First objective\"" "semantic: task show matches objective"
a_match "$out" "STATUS: TODO" "semantic: task show status TODO"

# 2. task add raw stdin block fallback
printf '@task task-2\n  STATUS: TODO\n  OBJECTIVE: "Second objective"\n  DESCRIPTION ::\n    Piped task description\n' | $CTX session task add sem-unit >/dev/null 2>&1
a_eq "$?" "0" "semantic: task add raw stdin fallback rc0"
out=$($CTX session task show sem-unit task-2)
a_match "$out" "OBJECTIVE: \"Second objective\"" "semantic: task show piped task objective"

# 3. task update
$CTX session task update sem-unit task-1 --objective="Updated objective 1" >/dev/null 2>&1
a_eq "$?" "0" "semantic: task update rc0"
out=$($CTX session task show sem-unit task-1)
a_match "$out" "OBJECTIVE: \"Updated objective 1\"" "semantic: task update verified"

# 4. task start (atomic status and state pointer update)
$CTX session task start sem-unit task-1 --pointer="work on task-1" >/dev/null 2>&1
a_eq "$?" "0" "semantic: task start rc0"
out=$($CTX session task show sem-unit task-1)
a_match "$out" "STATUS: IN_PROGRESS" "semantic: task start updates status to IN_PROGRESS"
a_match "$(cat .contexture/sessions/sem-unit/state.md)" "next_action: \"work on task-1\"" "semantic: task start atomically updates next_action"

# 5. task complete (atomic status and receipt event)
$CTX session task complete sem-unit task-1 --evidence="test verified cleanly" >/dev/null 2>&1
a_eq "$?" "0" "semantic: task complete rc0"
out=$($CTX session task show sem-unit task-1)
a_match "$out" "STATUS: DONE" "semantic: task complete updates status to DONE"
a_match "$(cat .contexture/sessions/sem-unit/journal.md)" "backlog/task-1: DONE (test verified cleanly)" "semantic: task complete appends receipt event"

# 6. task reopen
$CTX session task reopen sem-unit task-1 >/dev/null 2>&1
a_eq "$?" "0" "semantic: task reopen rc0"
out=$($CTX session task show sem-unit task-1)
a_match "$out" "STATUS: TODO" "semantic: task reopen restores TODO"

# 7. task drop
$CTX session task drop sem-unit task-2 --reason="task deprecated" >/dev/null 2>&1
a_eq "$?" "0" "semantic: task drop rc0"
a_not "$(cat .contexture/sessions/sem-unit/backlog.md)" "task-2" "semantic: task drop removes task block"

# 8. task list
out=$($CTX session task list sem-unit)
a_match "$out" "task-1" "semantic: task list contains task-1"
out_json=$($CTX session task list sem-unit --json)
a_match "$out_json" "\"slug\":\"task-1\"" "semantic: task list --json outputs valid JSON"

# 9. record with typed flags and auto-injected date/anchor
$CTX session record sem-unit --what="event recorded via flags" --group="dev" --thread="review" >/dev/null 2>&1
a_eq "$?" "0" "semantic: record typed flags rc0"
j_content=$(cat .contexture/sessions/sem-unit/journal.md)
a_match "$j_content" "WHAT: \"event recorded via flags\"" "semantic: record event content verified"
a_match "$j_content" "GROUP: dev" "semantic: record group verified"
a_match "$j_content" "THREAD: review" "semantic: record thread verified"
a_match "$j_content" "@entry $TODAY" "semantic: record auto-injects date prefix"
a_match "$j_content" "ANCHOR: A1" "semantic: record auto-injects active anchor"

# 10. record raw stdin block fallback
printf '@entry %s-piped-event\n  WHAT: "piped event content"\n  THREAD: none\n' "$TODAY" | $CTX session record sem-unit >/dev/null 2>&1
a_eq "$?" "0" "semantic: record raw stdin fallback rc0"
a_match "$(cat .contexture/sessions/sem-unit/journal.md)" "piped event content" "semantic: record piped block lands in journal"

# 11. finding CRUD (add, show, update, supersede, drop, list)
$CTX session finding add sem-unit ARCH_DECISION --summary="Architecture decision 1" --ref="journal.md#event" >/dev/null 2>&1
a_eq "$?" "0" "semantic: finding add rc0"
out=$($CTX session finding show sem-unit ARCH_DECISION)
a_match "$out" "SUMMARY ::" "semantic: finding show renders summary"
out_json=$($CTX session finding show sem-unit ARCH_DECISION --json)
a_match "$out_json" "\"name\":\"ARCH_DECISION\"" "semantic: finding show --json outputs valid JSON"

$CTX session finding update sem-unit ARCH_DECISION --summary="Updated architecture decision" >/dev/null 2>&1
a_eq "$?" "0" "semantic: finding update rc0"
out=$($CTX session finding show sem-unit ARCH_DECISION)
a_match "$out" "Updated architecture decision" "semantic: finding update persists"

$CTX session finding supersede sem-unit ARCH_DECISION ARCH_V2 --summary="Architecture decision version 2" >/dev/null 2>&1
a_eq "$?" "0" "semantic: finding supersede rc0"
out=$($CTX session finding list sem-unit)
a_match "$out" "ARCH_V2" "semantic: finding list displays ARCH_V2"

$CTX session finding drop sem-unit ARCH_DECISION >/dev/null 2>&1
a_eq "$?" "0" "semantic: finding drop rc0"
a_not "$(cat .contexture/sessions/sem-unit/knowledge.md)" "@finding ARCH_DECISION" "semantic: finding drop removes finding"

# 12. search
out=$($CTX session search sem-unit "Architecture decision")
a_match "$out" "ARCH_V2" "semantic: search locates finding query"

# 13. entry show and list
out=$($CTX session entry list sem-unit)
a_match "$out" "piped event content" "semantic: entry list contains events"
out=$($CTX session entry show sem-unit "$TODAY-piped-event")
a_match "$out" "@entry $TODAY-piped-event" "semantic: entry show renders entry"

# 13b. resolve
out=$($CTX session resolve sem-unit "knowledge.md#ARCH_V2")
a_match "$out" "@finding ARCH_V2" "semantic: resolve renders entity block"
out_json=$($CTX session resolve sem-unit "knowledge.md#ARCH_V2" --json)
a_match "$out_json" '"entity_type":"finding"' "semantic: resolve outputs json"

# 14. ctx lane operations
mkdir -p .contexture/sessions/sem-unit/lanes/sub-lane
cat > .contexture/sessions/sem-unit/lanes/sub-lane/recipe.md <<'EOF'
# recipe grammar
blocks at column 0; fields indent 2;
MISSION
  GOAL: "lane test subagent"
EOF
cat > .contexture/sessions/sem-unit/lanes/sub-lane/journal.md <<'EOF'
# journal grammar
blocks at column 0; fields indent 2;
EOF

out=$($CTX lane show sem-unit sub-lane recipe)
a_match "$out" "lane test subagent" "lane: show recipe matches"

$CTX lane record sem-unit sub-lane --what="lane event 1" >/dev/null 2>&1
a_eq "$?" "0" "lane: record event rc0"
a_match "$(cat .contexture/sessions/sem-unit/lanes/sub-lane/journal.md)" "lane event 1" "lane: record appends to lane journal"
a_not "$(cat .contexture/sessions/sem-unit/journal.md)" "lane event 1" "lane: record does not contaminate main session journal"

$CTX lane report sem-unit sub-lane --body="lane report summary" >/dev/null 2>&1
a_eq "$?" "0" "lane: report write rc0"
out=$($CTX lane show sem-unit sub-lane report)
a_match "$out" "lane report summary" "lane: show report reads written content"

echo "== L parallel-write probe =="
today=$(date +%Y-%m-%d)
p1_pass=0
p1_fail=0
i=1
while [ "$i" -le 10 ]; do
  slug="p1-$i"
  $CTX session bootstrap "$slug" "parallel probe unit $i" >/dev/null 2>&1 || { p1_fail=$((p1_fail + 1)); i=$((i + 1)); continue; }
  printf '@entry %s-probe-journal-%d\n  WHAT: "journal write %d"\n  THREAD: none\n' "$today" "$i" "$i" | $CTX session append "$slug" >/dev/null 2>&1 &
  a=$!
  $CTX session next "$slug" "pointer $i" >/dev/null 2>&1 &
  b=$!
  wait "$a" || true
  wait "$b" || true
  if grep -q "@entry $today-probe-journal-$i" ".contexture/sessions/$slug/journal.md" \
    && grep -q "next_action: \"pointer $i\"" ".contexture/sessions/$slug/state.md"; then
    p1_pass=$((p1_pass + 1))
  else
    p1_fail=$((p1_fail + 1))
  fi
  i=$((i + 1))
done
a_eq "$p1_pass" "10" "P1 distinct-target concurrency: both effects landed every iteration"
$CTX session bootstrap p2 "parallel probe same-target" >/dev/null 2>&1
p2_rc_bad=0
p2_residue=0
p2_incomplete=0
p2_both=0
p2_iters=5
i=1
while [ "$i" -le "$p2_iters" ]; do
  printf '@entry %s-probe-x-%d\n  WHAT: "x %d"\n  THREAD: none\n' "$today" "$i" "$i" | $CTX session append p2 >/dev/null 2>&1 &
  a=$!
  printf '@entry %s-probe-y-%d\n  WHAT: "y %d"\n  THREAD: none\n' "$today" "$i" "$i" | $CTX session append p2 >/dev/null 2>&1 &
  b=$!
  ra=0; rb=0
  wait "$a" || ra=$?
  wait "$b" || rb=$?
  [ "$ra" -ne 0 ] && p2_rc_bad=$((p2_rc_bad + 1))
  [ "$rb" -ne 0 ] && p2_rc_bad=$((p2_rc_bad + 1))
  if ls .contexture/sessions/p2/.tmp* .contexture/sessions/p2/*.XXXXXX >/dev/null 2>&1; then
    p2_residue=$((p2_residue + 1))
  fi
  awk '
    /^@entry / { if (pending) bad = 1; pending = 1; next }
    /^  THREAD: / { pending = 0 }
    END { exit (pending ? 1 : bad ? 1 : 0) }
  ' ".contexture/sessions/p2/journal.md" || p2_incomplete=$((p2_incomplete + 1))
  if grep -q "@entry $today-probe-x-$i" ".contexture/sessions/p2/journal.md" \
    && grep -q "@entry $today-probe-y-$i" ".contexture/sessions/p2/journal.md"; then
    p2_both=$((p2_both + 1))
  fi
  i=$((i + 1))
done
a_eq "$p2_rc_bad" "0" "P2 same-target concurrency: every write act rc0"
a_eq "$p2_residue" "0" "P2 same-target concurrency: no temp residue"
a_eq "$p2_incomplete" "0" "P2 same-target concurrency: no torn journal block"
echo "note: P2 same-target both-landed $p2_both/$p2_iters (last-writer-wins is the documented design)"

echo "== D session diagnostics =="
$CTX session diagnose >/dev/null 2>&1
a_eq "$?" "0" "session diagnose rc0"
diag_json=$($CTX session diagnose --json 2>/dev/null)
a_match "$diag_json" '"workspace_root"' "session diagnose --json carries workspace_root"
a_match "$diag_json" '"capabilities"' "session diagnose --json carries capabilities"
$CTX session --diagnose >/dev/null 2>&1
a_eq "$?" "0" "session --diagnose flag rc0"

echo "== summary =="
echo "session-tests: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
