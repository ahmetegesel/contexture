#!/bin/sh
# session-tests.sh: the session module suite, staged from the shipped core
# (base/.contexture/ctx and the base session module). Covers the verb surface
# (every shipped verb has a case and its no-arg rc contract), refusals, paging
# (load pages to completion), the refs form, the refresh rc semantics (audit rc
# wins over hook rc), the standalone helper fallbacks (no CTX_MODULE_DIR, no
# CTX_BIN), and the parallel-write probe (distinct-target writes both land;
# same-target writes exit clean with no temp residue and no torn journal).
#
# The suite runs on either storage driver and reads and writes the record only through
# the verbs and the driver's artifact methods (rcat, rput, rappend), so the same
# assertions hold on both: --driver=posix (the default) or --driver=fts5 (the plugin's
# own module copy staged into the sandbox, storage.driver: fts5 in its config; skip 77
# when sqlite3 lacks FTS5).
#
# The sections fall into three groups that share no unit (a unit a section creates is
# named only by sections of its own group): by default the three groups run at once,
# each in a sandbox of its own, their output printed in group order under one summary;
# --group=1|2|3 runs one group, --group=all runs every section in one sandbox, in order.
#
# Usage: tests/session-tests.sh [--driver=posix|fts5] [--group=1|2|3|all]
# Exit 0 when every case passes; 1 otherwise; 77 when the fts5 need is absent.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"
FTS5_MOD="$ROOT/plugins/storage-fts5/.contexture/modules/storage-fts5"
DRIVER=posix
GROUP=""
for a in "$@"; do
  case "$a" in
    --driver=posix|--driver=fts5) DRIVER=${a#--driver=} ;;
    --group=1|--group=2|--group=3|--group=all) GROUP=${a#--group=} ;;
    *) echo "session-tests.sh: unknown argument: $a" >&2; exit 1 ;;
  esac
done
if [ "$DRIVER" = fts5 ]; then
  if ! command -v sqlite3 >/dev/null 2>&1 || ! sqlite3 :memory: "CREATE VIRTUAL TABLE t USING fts5(x);" >/dev/null 2>&1; then
    echo "SKIP: sqlite3 with FTS5 (need: the fts5 driver run of the session suite)"
    exit 77
  fi
fi

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

# no --group: the three groups at once, each a run of this suite in its own sandbox; the
# exit code of each group is read from the group itself, its counts from its summary line
if [ -z "$GROUP" ]; then
  GROUPS_DIR=$(mktemp -d "$tmp_root/session-groups.XXXXXX") || exit 1
  group_pids=""
  trap 'rm -rf "$GROUPS_DIR"' EXIT
  trap '[ -n "$group_pids" ] && kill $group_pids 2>/dev/null; exit 130' INT
  trap '[ -n "$group_pids" ] && kill $group_pids 2>/dev/null; exit 143' TERM
  for g in 1 2 3; do
    ( sh "$SCRIPT_DIR/session-tests.sh" "--driver=$DRIVER" "--group=$g" > "$GROUPS_DIR/$g.out" 2>&1 < /dev/null
      printf '%s\n' "$?" > "$GROUPS_DIR/$g.rc" ) &
    group_pids="$group_pids $!"
  done
  wait
  pass=0
  fail=0
  broken=""
  for g in 1 2 3; do
    g_sum="session-tests ($DRIVER, group $g): pass="
    grep -v -F "$g_sum" "$GROUPS_DIR/$g.out"
    g_line=$(grep "^session-tests ($DRIVER, group $g): pass=[0-9][0-9]* fail=[0-9][0-9]*\$" "$GROUPS_DIR/$g.out")
    g_rc=$(cat "$GROUPS_DIR/$g.rc" 2>/dev/null)
    if [ -z "$g_line" ]; then
      broken="$broken group $g (no summary, rc=${g_rc:-none})"
      continue
    fi
    g_pass=${g_line##*pass=}
    g_pass=${g_pass%% *}
    g_fail=${g_line##*fail=}
    pass=$((pass + g_pass))
    fail=$((fail + g_fail))
    case "${g_rc:-none}" in
      0) [ "$g_fail" -eq 0 ] || broken="$broken group $g (rc=0 with $g_fail failed)" ;;
      1) [ "$g_fail" -gt 0 ] || broken="$broken group $g (rc=1 with no failed case)" ;;
      *) broken="$broken group $g (rc=${g_rc:-none})" ;;
    esac
  done
  if [ -n "$broken" ]; then
    echo "FAIL: session groups ended abnormally:$broken"
    fail=$((fail + 1))
  fi
  echo "== summary =="
  echo "session-tests ($DRIVER): pass=$pass fail=$fail"
  [ "$fail" -eq 0 ] || exit 1
  exit 0
fi
in_group() { [ "$GROUP" = all ] || [ "$GROUP" = "$1" ]; }

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
if [ "$DRIVER" = fts5 ]; then
  cp -R "$FTS5_MOD" "$SANDBOX/.contexture/modules/storage-fts5"
  printf 'storage.driver: fts5\n' > "$SANDBOX/.contexture/config"
fi
cat > "$SANDBOX/.contexture/rhythms/probe.md" <<'EOF'
@rhythm probe
  use when: the suite needs an index line
  activation: propose
EOF

cd "$SANDBOX" || exit 1
CTX=./.contexture/ctx
chmod +x .contexture/modules/*/scripts/* 2>/dev/null || true

# the record through the driver, never a path: rcat prints an artifact, rput replaces
# it from stdin, rappend adds stdin after its last byte
RESOLVER=./.contexture/modules/session/scripts/driver-resolver
rcat() { "$RESOLVER" artifact.read "$1" "$2" 2>/dev/null; }
rput() { "$RESOLVER" artifact.write "$1" "$2"; }
rappend() { { rcat "$1" "$2"; cat; } > rappend.tmp && rput "$1" "$2" < rappend.tmp; rm -f rappend.tmp; }
echo "== driver: $DRIVER =="

pass=0
fail=0
ok() { pass=$((pass + 1)); echo "PASS: $1"; }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }
a_not() { if printf '%s\n' "$1" | grep -q "$2"; then bad "$3 (unwanted: $2)"; else ok "$3"; fi; }

if in_group 1; then
echo "== V verb surface and no-arg rc contract =="
DECLARED="active amend append audit board bootstrap close diagnose drop entry finding flip index load next query record refresh refs reopen resolve search stamp task"
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
a_match "$err" "^ERROR: missing state: unit nosuch$" "load missing unit names the state and the unit"
a_not "$err" "sessions" "load missing unit names no storage path"
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

echo "== S state rewrite safety and reopen =="
$CTX session bootstrap rw-unit "rewrite unit" >/dev/null 2>&1
$CTX session next rw-unit "slash / and amp & pointer" >/dev/null 2>&1; a_eq "$?" "0" "next with sed metacharacters rc0"
out=$($CTX session load rw-unit 1 2>/dev/null)
a_match "$out" 'next_action: "slash / and amp & pointer"' "next with sed metacharacters lands verbatim"
a_match "$out" "^status: ACTIVE" "next with sed metacharacters keeps the state whole"
$CTX session task add rw-unit rw-task --objective="rewrite task" >/dev/null 2>&1
$CTX session task start rw-unit rw-task --pointer="start / with & metachars" >/dev/null 2>&1; a_eq "$?" "0" "task start pointer with sed metacharacters rc0"
out=$($CTX session load rw-unit 1 2>/dev/null)
a_match "$out" 'next_action: "start / with & metachars"' "task start pointer lands verbatim"
a_match "$out" "^objective: " "task start with metacharacters keeps the state whole"
$CTX session reopen rw-unit >/dev/null 2>&1; a_eq "$?" "1" "reopen an ACTIVE unit rc1"
$CTX session reopen nosuch >/dev/null 2>&1; a_eq "$?" "1" "reopen a missing unit rc1"
$CTX session close rw-unit >/dev/null 2>&1; a_eq "$?" "0" "close before reopen rc0"
out=$($CTX session reopen rw-unit 2>/dev/null); a_eq "$?" "0" "reopen a CLOSED unit rc0"
a_match "$out" "REOPENED: rw-unit" "reopen prints the receipt"
out=$($CTX session load rw-unit 1 2>/dev/null)
a_match "$out" "^status: ACTIVE" "reopen flips status back to ACTIVE"
out=$($CTX session active 2>/dev/null)
a_match "$out" "^rw-unit" "reopened unit lists as active again"
$CTX session bootstrap dup-audit "duplicate slug unit" >/dev/null 2>&1
printf '@entry %s-twice\n  WHAT: "first"\n  THREAD: none\n' "$TODAY" | $CTX session append dup-audit >/dev/null 2>&1
a_eq "$?" "0" "duplicate fixture: first entry appends"
printf '@entry %s-twice\n  WHAT: "second"\n  THREAD: none\n' "$TODAY" | $CTX session append dup-audit >/dev/null 2>&1
a_eq "$?" "1" "duplicate fixture: the engine refuses the second append"
printf '\n@entry %s-twice\n  ANCHOR: A1\n  WHAT: "second, landed by another path"\n  THREAD: none\n' "$TODAY" | rappend dup-audit journal
$CTX session audit dup-audit >/dev/null 2>&1; a_eq "$?" "0" "audit keeps rc0 on a legacy duplicated entry slug"
out=$($CTX session audit dup-audit 2>/dev/null)
a_match "$out" "LEGACY DUPLICATE SLUG at line [0-9]*: $TODAY-twice (first at line [0-9]*; warning" "audit warns on the duplicated slug with both lines"
printf '\n@entry %s-fold-twice\n  ANCHOR: A1\n  WHAT: "folds both"\n  THREAD: none\n  CLOSES: %s-twice (folded: both precede)\n' "$TODAY" "$TODAY" | rappend dup-audit journal
printf '\n@entry %s-twice\n  ANCHOR: A1\n  WHAT: "third, after the closer"\n  THREAD: none\n' "$TODAY" | rappend dup-audit journal
out=$($CTX session board dup-audit 2>/dev/null)
a_eq "$(printf '%s\n' "$out" | grep -c "^@entry $TODAY-twice")" "1" "board: a closer closes the occurrences before it, never one after it"
a_match "$out" 'third, after the closer' "board keeps the occurrence written after the closer"
out=$($CTX session entry show dup-audit "$TODAY-twice" --json 2>/dev/null)
a_match "$out" '"is_closed":false' "entry show reads the last occurrence, open after the closer"
a_match "$out" 'third, after the closer' "entry show reports the last occurrence"

echo "== C multi-target closers =="
$CTX session bootstrap cl-unit "closer unit" >/dev/null 2>&1
for x in a b c; do $CTX session record cl-unit --what="closer target $x" --slug="$TODAY-cl-$x" >/dev/null 2>&1; done
$CTX session record cl-unit --what="closes two" --slug="$TODAY-cl-d" --closes="$TODAY-cl-a $TODAY-cl-b (folded: two at once)" >/dev/null 2>&1
a_eq "$?" "0" "record with two targets and its own verdict rc0"
out=$(rcat cl-unit journal | grep '^  CLOSES: ')
a_match "$out" "^  CLOSES: $TODAY-cl-a $TODAY-cl-b (folded: two at once)\$" "record keeps a caller verdict verbatim, never doubled"
$CTX session record cl-unit --what="closes one" --slug="$TODAY-cl-e" --closes="$TODAY-cl-c" >/dev/null 2>&1
out=$(rcat cl-unit journal | grep '^  CLOSES: ')
a_match "$out" "^  CLOSES: $TODAY-cl-c (done: closes one)\$" "record gives a bare target the done verdict"
$CTX session record cl-unit --what="bad" --closes="$TODAY-cl-d $TODAY-cl-nosuch (done: x)" >/dev/null 2>&1
a_eq "$?" "1" "record refuses a closer whose second target is missing"
out=$($CTX session board cl-unit 2>/dev/null)
a_not "$out" "@entry $TODAY-cl-b" "board drops the second target of a multi-target closer"
a_match "$out" "@entry $TODAY-cl-d" "board keeps the closer itself live"
out=$($CTX session entry show cl-unit "$TODAY-cl-b" --json 2>/dev/null)
a_match "$out" '"is_closed":true' "entry show reads a second target as closed"
a_match "$out" "\"closed_by\":\"$TODAY-cl-d\"" "entry show names the closer of a second target"
a_match "$out" '"close_reason":"folded: two at once"' "entry show carries the closer verdict"

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
rcat refresh-unit journal > journal.bak
rappend refresh-unit journal <<'EOF'

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
rput refresh-unit journal < journal.bak
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
a_match "$(rcat sem-unit state)" "next_action: \"work on task-1\"" "semantic: task start atomically updates next_action"

# 5. task complete (atomic status and receipt event)
$CTX session task complete sem-unit task-1 --evidence="test verified cleanly" >/dev/null 2>&1
a_eq "$?" "0" "semantic: task complete rc0"
out=$($CTX session task show sem-unit task-1)
a_match "$out" "STATUS: DONE" "semantic: task complete updates status to DONE"
a_match "$(rcat sem-unit journal)" "backlog/task-1: DONE (test verified cleanly)" "semantic: task complete appends receipt event"

# 6. task reopen
$CTX session task reopen sem-unit task-1 >/dev/null 2>&1
a_eq "$?" "0" "semantic: task reopen rc0"
out=$($CTX session task show sem-unit task-1)
a_match "$out" "STATUS: TODO" "semantic: task reopen restores TODO"

# 7. task drop
$CTX session task drop sem-unit task-2 --reason="task deprecated" >/dev/null 2>&1
a_eq "$?" "0" "semantic: task drop rc0"
a_not "$(rcat sem-unit backlog)" "task-2" "semantic: task drop removes task block"

# 8. task list
out=$($CTX session task list sem-unit)
a_match "$out" "task-1" "semantic: task list contains task-1"
out_json=$($CTX session task list sem-unit --json)
a_match "$out_json" "\"slug\":\"task-1\"" "semantic: task list --json outputs valid JSON"

# 9. record with typed flags and auto-injected date/anchor
$CTX session record sem-unit --what="event recorded via flags" --group="dev" --thread="review" >/dev/null 2>&1
a_eq "$?" "0" "semantic: record typed flags rc0"
j_content=$(rcat sem-unit journal)
a_match "$j_content" "WHAT: \"event recorded via flags\"" "semantic: record event content verified"
a_match "$j_content" "GROUP: dev" "semantic: record group verified"
a_match "$j_content" "THREAD: review" "semantic: record thread verified"
a_match "$j_content" "@entry $TODAY" "semantic: record auto-injects date prefix"
a_match "$j_content" "ANCHOR: A1" "semantic: record auto-injects active anchor"

# 10. record raw stdin block fallback
printf '@entry %s-piped-event\n  WHAT: "piped event content"\n  THREAD: none\n' "$TODAY" | $CTX session record sem-unit >/dev/null 2>&1
a_eq "$?" "0" "semantic: record raw stdin fallback rc0"
a_match "$(rcat sem-unit journal)" "piped event content" "semantic: record piped block lands in journal"

# 11. finding CRUD (add, show, update, supersede, drop, list)
$CTX session finding add sem-unit ARCH_DECISION --summary="Architecture decision 1" --ref="journal.md#event" >/dev/null 2>&1
a_eq "$?" "0" "semantic: finding add rc0"
out=$($CTX session finding show sem-unit ARCH_DECISION)
a_match "$out" "SUMMARY ::" "semantic: finding show renders summary"
out_json=$($CTX session finding show sem-unit ARCH_DECISION --json)
a_match "$out_json" "\"name\":\"ARCH_DECISION\"" "semantic: finding show --json outputs valid JSON"
$CTX session finding add sem-unit QUOTED_SUMMARY --summary='the index ends with "index complete: N entries" and a path like C:\tmp' --ref="journal.md#event" >/dev/null 2>&1
a_eq "$?" "0" "semantic: finding add with a quoted summary rc0"
out=$($CTX session finding list sem-unit 2>/dev/null)
a_match "$out" "^  ARCH_DECISION: " "semantic: finding list keeps the plain finding"
a_match "$out" "^  QUOTED_SUMMARY: " "semantic: finding list keeps a finding whose summary carries a quote"
a_match "$out" 'ends with "index complete: N entries"' "semantic: finding list renders the quote verbatim"
a_eq "$(printf '%s\n' "$out" | grep -c '^  [A-Za-z0-9_-]*: ')" "2" "semantic: finding list count equals the findings added"
out=$($CTX session finding list --help 2>&1); a_eq "$?" "0" "semantic: finding list --help rc0"
a_match "$out" "^  list <unit>" "semantic: finding list --help prints the list usage"
a_not "$out" "not found" "semantic: finding list --help is not taken for a unit"
out=$($CTX session finding add -h 2>&1); a_eq "$?" "0" "semantic: finding add -h rc0"
a_match "$out" "^  add <unit>" "semantic: finding add -h prints the add usage"
out=$($CTX session task start --help 2>&1); a_eq "$?" "0" "semantic: task start --help rc0"
a_match "$out" "^  start <unit>" "semantic: task start --help prints the start usage"
out=$($CTX session entry show --help 2>&1); a_eq "$?" "0" "semantic: entry show --help rc0"
a_match "$out" "^  show <unit>" "semantic: entry show --help prints the show usage"

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
a_not "$(rcat sem-unit knowledge)" "@finding ARCH_DECISION" "semantic: finding drop removes finding"

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
rput sem-unit lane/sub-lane/recipe <<'EOF'
# recipe grammar
blocks at column 0; fields indent 2;
MISSION
  GOAL: "lane test subagent"
EOF
rput sem-unit lane/sub-lane/journal <<'EOF'
# journal grammar
blocks at column 0; fields indent 2;
EOF

out=$($CTX lane show sem-unit sub-lane recipe)
a_match "$out" "lane test subagent" "lane: show recipe matches"

$CTX lane record sem-unit sub-lane --what="lane event 1" >/dev/null 2>&1
a_eq "$?" "0" "lane: record event rc0"
a_match "$(rcat sem-unit lane/sub-lane/journal)" "lane event 1" "lane: record appends to lane journal"
a_not "$(rcat sem-unit journal)" "lane event 1" "lane: record does not contaminate main session journal"

$CTX lane report sem-unit sub-lane --body="lane report summary" >/dev/null 2>&1
a_eq "$?" "0" "lane: report write rc0"
out=$($CTX lane show sem-unit sub-lane report)
a_match "$out" "lane report summary" "lane: show report reads written content"

# the text views print the stored artifact byte for byte: a literal backslash-n, a tab,
# a quote-comma, embedded quotes, and a line ending in a backslash all survive
printf '# fidelity\n\nA1 :: printf %s | ctx x\ncols\tsplit by a tab\n"a", "b" quote-comma\nends in a backslash \\\nlast line\n' "'@task x\\n  STATUS: TODO\\n'" > lane-fixture.md
$CTX lane report sem-unit sub-lane < lane-fixture.md > lane-write.out 2>&1
a_eq "$?" "0" "lane: stdin report with escapes rc0"
$CTX lane report sem-unit sub-lane < /dev/null > lane-report.out 2>&1
cmp -s lane-fixture.md lane-report.out; a_eq "$?" "0" "lane: report text view is byte-identical to the stored report"
$CTX lane show sem-unit sub-lane report > lane-show.out 2>&1
cmp -s lane-fixture.md lane-show.out; a_eq "$?" "0" "lane: show text view is byte-identical to the stored report"
cmp -s lane-fixture.md lane-write.out; a_eq "$?" "0" "lane: report write echo is byte-identical to the input"
rcat sem-unit lane/sub-lane/report > lane-stored.out
cmp -s lane-fixture.md lane-stored.out; a_eq "$?" "0" "lane: stored report is byte-identical to the input"
rm -f lane-fixture.md lane-write.out lane-report.out lane-show.out lane-stored.out
fi # group 1

if in_group 2; then
echo "== X dual-driver defects (lanes/driver-test-compare/report ids) =="
$CTX session bootstrap x-unit "defect regression unit" >/dev/null 2>&1
# F1, S3: the status filter vocabulary maps in the task verb, identical for every driver
$CTX session task add x-unit x-todo --objective="Open task" >/dev/null 2>&1
$CTX session task add x-unit x-prog --objective="Running task" >/dev/null 2>&1
$CTX session task add x-unit x-done --objective="Finished task" >/dev/null 2>&1
$CTX session task start x-unit x-prog --pointer="x-prog IN_PROGRESS" >/dev/null 2>&1
$CTX session task complete x-unit x-done --evidence="closed by the suite" >/dev/null 2>&1
out=$($CTX session task list x-unit --status=todo 2>&1)
a_match "$out" "\[TODO\] x-todo: Open task" "F1: status todo lists the TODO task"
a_not "$out" "x-done" "F1: status todo leaves the DONE task out"
out=$($CTX session task list x-unit --status=done --json 2>&1)
a_match "$out" '"slug":"x-done","status":"DONE"' "F1: status done --json lists the DONE task"
out=$($CTX session task list x-unit --status=all 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -c '^  \[')" "3" "F1: status all lists every task"
out=$($CTX session task list x-unit --status=progress 2>&1)
a_match "$out" "\[IN_PROGRESS\] x-prog: Running task" "S3: status progress matches IN_PROGRESS"
# F2, P5: task add --refs lands in the JSON refs array, and every JSON view parses
$CTX session task add x-unit x-refs --objective="Refs task" --refs="backlog#one knowledge#TWO" >/dev/null 2>x-refs.err
a_eq "$(cat x-refs.err)" "" "F2: task add with refs writes no error"
out=$($CTX session task show x-unit x-refs --json 2>&1)
a_match "$out" '"refs":\["backlog#one","knowledge#TWO"\]' "F2 P5: task show --json carries the refs array"
# F3, P2: a repeated finding NAME and a repeated lane entry slug refuse rc1 ERR_ENTITY_EXISTS
$CTX session finding add x-unit X_FINDING --summary="First" >/dev/null 2>&1
err=$($CTX session finding add x-unit X_FINDING --summary="Repeated" 2>&1 >/dev/null); rc=$?
a_eq "$rc" "1" "F3 P2: a repeated finding NAME refuses rc1"
a_match "$err" "ERR_ENTITY_EXISTS" "F3 P2: the finding refusal names ERR_ENTITY_EXISTS"
out=$($CTX session finding show x-unit X_FINDING --json 2>&1)
a_match "$out" '"summary":"First"' "F3 P2: the first finding stays intact"
printf '# recipe grammar\nMISSION\n  GOAL: "x lane"\n' | rput x-unit lane/x-lane/recipe
printf '# journal grammar\nblocks at column 0; fields indent 2;\n' | rput x-unit lane/x-lane/journal
$CTX lane record x-unit x-lane --what="First lane event" --slug="$TODAY-x-l1" >/dev/null 2>&1
err=$($CTX lane record x-unit x-lane --what="Repeated lane slug" --slug="$TODAY-x-l1" 2>&1 >/dev/null); rc=$?
a_eq "$rc" "1" "F3 P2: a repeated lane entry slug refuses rc1"
a_match "$err" "ERR_ENTITY_EXISTS" "F3 P2: the lane refusal names ERR_ENTITY_EXISTS"
# F5: the lane journal reads back as stored, entry headers and THREAD lines kept
$CTX lane record x-unit x-lane --what="Second lane event" --slug="$TODAY-x-l2" --thread="the dispatcher" >/dev/null 2>&1
out=$($CTX lane show x-unit x-lane journal 2>&1)
a_match "$out" "^@entry $TODAY-x-l2\$" "F5: lane show journal keeps the entry header"
a_match "$out" "^  THREAD: the dispatcher\$" "F5: lane show journal keeps the THREAD line"
a_eq "$(printf '%s\n' "$out" | grep -c "^@entry $TODAY-x-l1\$")" "1" "F5: the refused repeat never landed a second block"
# F6: a report written by --body reads back, and the stdin echo carries no JSON tail
$CTX lane report x-unit x-lane --body="report by the body flag" >/dev/null 2>&1
out=$($CTX lane report x-unit x-lane < /dev/null 2>&1)
a_eq "$out" "report by the body flag" "F6: a --body report reads back"
out=$(printf '# x report\n\n@claim x1\n  VERDICT: "from stdin"\n' | $CTX lane report x-unit x-lane 2>&1)
a_not "$out" '"}' "F6: the stdin write echo carries no JSON tail"
# F4, P3, P4: typed refs resolve to the entity block; the legacy file forms still resolve
out=$($CTX session resolve x-unit task#x-todo 2>&1); rc=$?
a_eq "$rc" "0" "F4 P3: resolve task# rc0"
a_match "$out" "^@task x-todo" "F4 P3: resolve task# prints the task block"
out=$($CTX session resolve x-unit finding#X_FINDING 2>&1); rc=$?
a_eq "$rc" "0" "F4 P3: resolve finding# rc0"
a_match "$out" "^@finding X_FINDING" "F4 P3: resolve finding# prints the finding block"
$CTX session record x-unit --what="Resolvable entry" --slug="$TODAY-x-e1" >/dev/null 2>&1
out=$($CTX session resolve x-unit "entry#$TODAY-x-e1" 2>&1); rc=$?
a_eq "$rc" "0" "F4 P3: resolve entry# rc0"
a_match "$out" "WHAT: \"Resolvable entry\"" "F4 P3: resolve entry# prints the entry block"
out=$($CTX session resolve x-unit "lane#x-lane/report#x1" 2>&1); rc=$?
a_eq "$rc" "0" "F4 P3: resolve lane#/report# rc0"
a_match "$out" "^@claim x1" "F4 P3: resolve lane#/report# prints the claim block"
out=$($CTX session resolve x-unit "lanes/x-lane/report.md#x1" 2>&1); rc=$?
a_eq "$rc" "0" "P4: resolve lanes/<lane>/report.md#claim rc0"
a_match "$out" "VERDICT: \"from stdin\"" "P4: the lanes/ form prints the claim block"
out=$($CTX session resolve x-unit "knowledge.md#X_FINDING" 2>&1); rc=$?
a_eq "$rc" "0" "F4: the legacy knowledge.md# form still resolves"
$CTX session resolve x-unit task#x-missing >/dev/null 2>&1; a_eq "$?" "1" "F4: a missing typed ref refuses rc1"
# F7: diagnose reports the store that holds the units, never a missing database
out=$($CTX session diagnose --json 2>&1)
a_not "$out" "not created yet" "F7: diagnose never reports the store missing while it holds units"
# P1: task update adds a DESCRIPTION, criteria, and details the block lacked
$CTX session task add x-unit x-upd --objective="Update target" >/dev/null 2>&1
$CTX session task update x-unit x-upd --desc="Added description" --criteria="Added criteria" --details="Added details" >/dev/null 2>&1
out=$($CTX session task show x-unit x-upd --json 2>&1)
a_match "$out" '"description":"Added description","criteria":"Added criteria","details":"Added details"' "P1: task update adds the sections the block lacked"
# S1: --help and -h print the usage rc0 on record and reopen
out=$($CTX session record --help 2>&1); rc=$?
a_eq "$rc" "0" "S1: record --help rc0"
a_match "$out" "ctx session record <unit> --what=" "S1: record --help prints the usage"
$CTX session record -h >/dev/null 2>&1; a_eq "$?" "0" "S1: record -h rc0"
out=$($CTX session reopen --help 2>&1); rc=$?
a_eq "$rc" "0" "S1: reopen --help rc0"
a_match "$out" "^usage: ctx session reopen" "S1: reopen --help prints the usage"
# S2: record --slug naming an entry the journal carries refuses
$CTX session record x-unit --what="Repeated slug" --slug="$TODAY-x-e1" >/dev/null 2>&1; a_eq "$?" "1" "S2: record --slug of an existing entry refuses rc1"
out=$($CTX session entry show x-unit "$TODAY-x-e1" --json 2>&1)
a_match "$out" '"what":"Resolvable entry"' "S2: the first entry stays the only one"
# S4: a raw @finding block on finding add stdin lands
out=$(printf '@finding X_RAW\n  REF: "journal#%s-x-e1"\n  SUMMARY ::\n    Raw block finding.\n' "$TODAY" | $CTX session finding add x-unit 2>&1); rc=$?
a_eq "$rc" "0" "S4: a raw @finding block on stdin rc0"
a_not "$out" "command not found" "S4: the block text is never evaluated by the shell"
out=$($CTX session finding show x-unit X_RAW --json 2>&1)
a_match "$out" '"summary":"Raw block finding."' "S4: the raw finding reads back"
# S6: a malformed task slug refuses
$CTX session task add x-unit "Bad Slug" --objective="Malformed slug" >/dev/null 2>&1; a_eq "$?" "1" "S6: a malformed task slug refuses rc1"
a_not "$($CTX session task list x-unit 2>&1)" "Bad" "S6: the malformed slug never landed"
# S7: an objective carrying quotes renders whole in the text view
$CTX session task add x-unit x-quote --objective="Text with a/slash & an ampersand and \"quotes\"" >/dev/null 2>&1
out=$($CTX session task show x-unit x-quote 2>&1)
a_match "$out" 'ampersand and "quotes"' "S7: task show text keeps the quoted words"
# S8: finding supersede of a missing predecessor refuses
$CTX session finding supersede x-unit X_MISSING X_SUCC --summary="Successor" >/dev/null 2>&1; a_eq "$?" "1" "S8: supersede of a missing predecessor refuses rc1"
$CTX session finding show x-unit X_SUCC >/dev/null 2>&1; a_eq "$?" "1" "S8: no successor lands for a missing predecessor"
# a slug that prefixes another task never reads as taken
$CTX session task add x-unit x-pre-long --objective="Long slug" >/dev/null 2>&1
$CTX session task add x-unit x-pre --objective="Prefix slug" >/dev/null 2>&1; a_eq "$?" "0" "a slug prefixing another task's slug adds rc0"
# the canonical drop receipt
$CTX session task drop x-unit x-pre --reason="suite drop" >/dev/null 2>&1
a_match "$(rcat x-unit journal)" "WHAT: \"backlog/x-pre: DROPPED (suite drop)\"" "task drop writes the canonical backlog/<slug>: DROPPED (<reason>) receipt"
# the search contract: one shape, the flags honored, an empty query refused
out=$($CTX session search x-unit "task" --json --limit=1 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -o '"entity_type":' | wc -l | tr -d ' ')" "1" "search --limit=1 caps the results at one"
out=$($CTX session search x-unit "task" --json --limit=50 2>&1)
a_match "$out" '"entity_type":"[a-z_]*","entity_id":"[^"]*","section":"[a-z_]*","snippet":' "search results carry entity_type, entity_id, section, snippet"
a_not "$out" '"file":' "search results carry no physical file key"
$CTX session task add x-unit x-shared --objective="zzshared term in a task" >/dev/null 2>&1
$CTX session finding add x-unit X_SHARED --summary="zzshared term in a finding" >/dev/null 2>&1
out=$($CTX session search x-unit "zzshared" --json --limit=50 2>&1)
a_match "$out" '"entity_type":"task"' "search without --entity finds the task"
out=$($CTX session search x-unit "zzshared" --json --entity=finding --limit=50 2>&1)
a_match "$out" '"entity_type":"finding"' "search --entity=finding finds the finding"
a_not "$out" '"entity_type":"task"' "search --entity=finding leaves the task out"
out=$($CTX session search x-unit "Open task" --json --mode=exact 2>&1); rc=$?
a_eq "$rc" "0" "search --mode=exact is honored rc0"
a_match "$out" '"entity_id":"x-todo"' "search --mode=exact finds the exact phrase"
a_match "$out" '"mode":"exact"' "search --mode=exact reports the mode it ran"
txt=$($CTX session search x-unit "Open task" --mode=exact 2>&1)
a_match "$txt" "^search x-unit \"Open task\": [0-9]* matches" "search text view is its own format"
a_not "$txt" '^{"unit"' "search text view is not the JSON"
$CTX session search x-unit "" >/dev/null 2>&1; a_eq "$?" "1" "search with an empty query refuses rc1"
err=$($CTX session search x-unit "" 2>&1 >/dev/null)
a_match "$err" "ERR_INVALID_ARGUMENT" "search empty query names ERR_INVALID_ARGUMENT"
if [ "$DRIVER" = posix ]; then
  err=$($CTX session search x-unit "task" --mode=hybrid 2>&1 >/dev/null); rc=$?
  a_eq "$rc" "1" "search --mode=hybrid refuses rc1 on a driver without it"
  a_match "$err" "ERR_CAPABILITY_UNSUPPORTED" "search --mode=hybrid names the missing capability"
else
  $CTX session search x-unit "task" --mode=hybrid >/dev/null 2>&1; a_eq "$?" "0" "search --mode=hybrid is honored by the ranked driver"
fi
# entry list --group and --anchor filter on every driver
$CTX session record x-unit --what="Grouped entry" --group=x-grp --slug="$TODAY-x-g1" >/dev/null 2>&1
out=$($CTX session entry list x-unit --group=x-grp 2>&1)
a_match "$out" "$TODAY-x-g1: Grouped entry" "entry list --group keeps the group's entry"
a_not "$out" "$TODAY-x-e1" "entry list --group leaves other entries out"
out=$($CTX session entry list x-unit --group=x-grp --json 2>&1)
a_not "$out" "$TODAY-x-e1" "entry list --group --json filters too"
$CTX session stamp x-unit "defect suite stamp" >/dev/null 2>&1
$CTX session record x-unit --what="After the stamp" --slug="$TODAY-x-a2" >/dev/null 2>&1
out=$($CTX session entry list x-unit --anchor=A2 2>&1)
a_match "$out" "$TODAY-x-a2: After the stamp" "entry list --anchor keeps the anchor's entry"
a_not "$out" "$TODAY-x-g1" "entry list --anchor leaves earlier anchors out"
# S5: a CLOSED unit takes no typed write
$CTX session bootstrap x-closed "closed unit" >/dev/null 2>&1
printf '# recipe grammar\n' | rput x-closed lane/x-cl/recipe
printf '# journal grammar\n' | rput x-closed lane/x-cl/journal
$CTX session close x-closed >/dev/null 2>&1
$CTX session task add x-closed x-late --objective="Added while closed" >/dev/null 2>&1; a_eq "$?" "1" "S5: task add on a CLOSED unit refuses rc1"
$CTX session task show x-closed x-late >/dev/null 2>&1; a_eq "$?" "1" "S5: the task never landed"
$CTX session finding add x-closed X_LATE --summary="Added while closed" >/dev/null 2>&1; a_eq "$?" "1" "S5: finding add on a CLOSED unit refuses rc1"
$CTX lane record x-closed x-cl --what="Lane event while closed" --slug="$TODAY-x-late" >/dev/null 2>&1; a_eq "$?" "1" "S5: lane record on a CLOSED unit refuses rc1"
a_not "$($CTX lane show x-closed x-cl journal 2>&1)" "while closed" "S5: the lane event never landed"
# the argv limit: a 2 MB report lands and reads back byte for byte
awk 'BEGIN { for (i = 1; i <= 26000; i++) printf "line %06d of the big report, eighty bytes wide, padded to width ....\n", i }' > big-report.md
$CTX lane report x-unit x-lane < big-report.md >/dev/null 2>&1; a_eq "$?" "0" "a 2 MB lane report writes rc0"
$CTX lane report x-unit x-lane < /dev/null > big-report.out 2>&1
cmp -s big-report.md big-report.out; a_eq "$?" "0" "a 2 MB lane report reads back byte for byte"
rm -f big-report.md big-report.out x-refs.err
# diagnose counts the ACTIVE units exactly (x-closed is CLOSED)
nact=$($CTX session active 2>/dev/null | grep -c '^[a-z0-9][a-z0-9_-]*$')
out=$($CTX session diagnose 2>&1)
a_match "$out" "active units:    $nact\$" "diagnose text counts the ACTIVE units exactly"
out=$($CTX session diagnose --json 2>&1)
a_match "$out" "\"active_units\": $nact\$" "diagnose --json counts the ACTIVE units exactly"
# diagnose on a workspace whose active list is empty (one unit, CLOSED) counts zero
mkdir -p diag-empty/.contexture
cp -R .contexture/ctx .contexture/modules diag-empty/.contexture/
[ -f .contexture/config ] && cp .contexture/config diag-empty/.contexture/config
(cd diag-empty && ./.contexture/ctx session bootstrap d-only "only unit" >/dev/null 2>&1 && ./.contexture/ctx session close d-only >/dev/null 2>&1)
out=$(cd diag-empty && ./.contexture/ctx session diagnose --json 2>&1)
a_match "$out" '"active_units": 0$' "diagnose --json counts zero ACTIVE units when every unit is CLOSED"
out=$(cd diag-empty && ./.contexture/ctx session diagnose 2>&1)
a_match "$out" "active units:    0\$" "diagnose text counts zero ACTIVE units when every unit is CLOSED"
rm -rf diag-empty

echo "== Y payload fidelity (lanes/routing-review/report findings R1, R2) =="
# R1: a field value reaches the rendered block verbatim: a real newline in a block scalar
# is a second body line, a literal backslash sequence stays a backslash sequence; the
# driver never answers success over a block it failed to render
$CTX session bootstrap y-unit "payload fidelity unit" >/dev/null 2>&1
$CTX session task add y-unit y-keep --objective="Kept task" >/dev/null 2>&1
y_nl=$(printf 'first body line\nsecond body line')
out=$($CTX session task add y-unit y-multi --objective="Multi-line task" --desc="$y_nl" 2>&1); rc=$?
a_eq "$rc" "0" "R1: task add with a two-line --desc rc0"
a_not "$out" "newline in string" "R1: task add with a two-line --desc renders without an awk error"
a_eq "$(rcat y-unit backlog | grep -c -e '^    first body line$' -e '^    second body line$')" "2" "R1: both --desc lines land as indented body lines"
$CTX session task show y-unit y-multi >/dev/null 2>&1
a_eq "$?" "0" "R1: the two-line task shows rc0"
$CTX session task add y-unit y-bs --objective='path C:\new\table' --desc='literal \n and \t stay' >/dev/null 2>&1
a_eq "$(rcat y-unit backlog | grep -cF '  OBJECTIVE: "path C:\new\table"')" "1" "R1: a literal backslash sequence in --objective stays verbatim"
a_eq "$(rcat y-unit backlog | grep -cF '    literal \n and \t stay')" "1" "R1: a literal backslash sequence in --desc stays verbatim"
out=$($CTX session task show y-unit y-bs --json 2>&1)
a_match "$out" '"objective":"path C:\\\\new\\\\table"' "R1: task show --json carries the backslashes escaped"
out=$($CTX session task update y-unit y-keep --desc="$y_nl" 2>&1); rc=$?
a_eq "$rc" "0" "R1: task update with a two-line --desc rc0"
a_eq "$(rcat y-unit backlog | grep -c '^@task ')" "3" "R1: task update with a two-line --desc keeps every task block"
a_eq "$(rcat y-unit backlog | grep -c '^    first body line$')" "2" "R1: the updated --desc lands as body lines"
$CTX session task start y-unit y-bs --pointer='y-bs IN_PROGRESS: see C:\new' >/dev/null 2>&1
a_eq "$(rcat y-unit state | grep -cF 'next_action: "y-bs IN_PROGRESS: see C:\new"')" "1" "R1: a literal backslash sequence in --pointer stays verbatim"
out=$($CTX session finding add y-unit Y_MULTI --summary="$y_nl" 2>&1); rc=$?
a_eq "$rc" "0" "R1: finding add with a two-line --summary rc0"
$CTX session finding show y-unit Y_MULTI >/dev/null 2>&1
a_eq "$?" "0" "R1: the two-line finding shows rc0"
$CTX session finding add y-unit Y_BS --summary='literal \n here' >/dev/null 2>&1
a_eq "$(rcat y-unit knowledge | grep -cF '    literal \n here')" "1" "R1: a literal backslash sequence in --summary stays verbatim"
$CTX session finding update y-unit Y_BS --summary="$y_nl" >/dev/null 2>&1
a_eq "$?" "0" "R1: finding update with a two-line --summary rc0"
a_eq "$(rcat y-unit knowledge | grep -c '^@finding ')" "2" "R1: finding update with a two-line --summary keeps every finding"
out=$($CTX session search y-unit 'C:\new' --mode=exact --json 2>&1)
a_not "$out" '"total_matches":0' "R1: search finds a literal backslash sequence"
# R9: an exact-mode snippet carries no edge padding (the document body's trailing blanks)
out=$($CTX session search y-unit 'Kept task' --mode=exact --json 2>&1)
a_match "$out" '"snippet":"[^"]*Kept task' "R9: the exact search finds the task"
a_not "$out" '\\n"}' "R9: an exact search snippet ends without a trailing newline"
# R2: the dialect is LF: a carriage return in a typed field refuses rc1 before any write,
# so no verb poisons the record for the grammar verbs that refuse CR on read
y_cr=$(printf 'carriage\rreturn')
y_before=$(rcat y-unit backlog | cksum)
$CTX session task add y-unit y-cr --objective="CR task" --desc="$y_cr" >/dev/null 2>&1
a_eq "$?" "1" "R2: task add with a carriage return refuses rc1"
a_eq "$(rcat y-unit backlog | cksum)" "$y_before" "R2: the refused task add leaves the backlog unchanged"
$CTX session finding add y-unit Y_CR --summary="$y_cr" >/dev/null 2>&1
a_eq "$?" "1" "R2: finding add with a carriage return refuses rc1"
y_jbefore=$(rcat y-unit journal | cksum)
$CTX session record y-unit --what="$y_cr" >/dev/null 2>&1
a_eq "$?" "1" "R2: record with a carriage return refuses rc1"
a_eq "$(rcat y-unit journal | cksum)" "$y_jbefore" "R2: the refused record leaves the journal unchanged"
printf '# recipe grammar\nMISSION\n  GOAL: "y lane"\n' | rput y-unit lane/y-lane/recipe
$CTX lane record y-unit y-lane --what="$y_cr" >/dev/null 2>&1
a_eq "$?" "1" "R2: lane record with a carriage return refuses rc1"
$CTX session flip y-unit todo y-bs >/dev/null 2>&1
a_eq "$?" "0" "R2: the grammar verbs still write the unit after the refusals"

echo "== B backslash payloads on every awk (backlog awk-escape-portability) =="
# a backslash, a doubled backslash, a literal backslash n, and a trailing backslash travel
# through every typed write and read back byte for byte: the encoders double a backslash
# by concatenation, since a gsub replacement of four backslashes yields one backslash
# under busybox awk and gawk --posix and two under BWK awk, mawk, and gawk
$CTX session bootstrap b-unit "backslash payload unit" >/dev/null 2>&1
b_obj='B a\b c\\d \n e\'
b_json='B a\\b c\\\\d \\n e\\'
b_l1='body a\b c\\d'
b_l2='body \n lit \t lit end\'
b_desc="$b_l1
$b_l2"
$CTX session task add b-unit b-task --objective="$b_obj" --desc="$b_desc" >/dev/null 2>&1
a_eq "$?" "0" "B: task add with backslash payloads rc0"
a_eq "$(rcat b-unit backlog | grep -cxF "  OBJECTIVE: \"$b_obj\"")" "1" "B: the OBJECTIVE lands byte for byte"
a_eq "$(rcat b-unit backlog | grep -cxF -e "    $b_l1" -e "    $b_l2")" "2" "B: both DESCRIPTION lines land byte for byte, the trailing backslash kept"
out=$($CTX session task show b-unit b-task 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -cxF -e "    $b_l1" -e "    $b_l2")" "2" "B: task show text reads the DESCRIPTION back byte for byte"
out=$($CTX session task show b-unit b-task --json 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -cF "\"objective\":\"$b_json\"")" "1" "B: task show --json doubles every backslash of the OBJECTIVE"
out=$($CTX session task list b-unit --json 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -cF "\"objective\":\"$b_json\"")" "1" "B: task list --json doubles every backslash of the OBJECTIVE"
b_sum='S a\b c\\d \n e\'
$CTX session finding add b-unit B_BS --summary="$b_sum" >/dev/null 2>&1
a_eq "$?" "0" "B: finding add with backslash payloads rc0"
a_eq "$(rcat b-unit knowledge | grep -cxF "    $b_sum")" "1" "B: the SUMMARY lands byte for byte"
out=$($CTX session finding show b-unit B_BS 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -cxF "    $b_sum")" "1" "B: finding show text reads the SUMMARY back byte for byte"
out=$($CTX session finding list b-unit --json 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -cF 'S a\\b c\\\\d \\n e\\')" "1" "B: finding list --json doubles every backslash of the SUMMARY"
b_what='W a\b c\\d \n e\'
$CTX session record b-unit --what="$b_what" --slug="$TODAY-b-bs" >/dev/null 2>&1
a_eq "$?" "0" "B: record with backslash payloads rc0"
a_eq "$(rcat b-unit journal | grep -cxF "  WHAT: \"$b_what\"")" "1" "B: the WHAT lands byte for byte"
out=$($CTX session board b-unit 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -cxF "  WHAT: \"$b_what\"")" "1" "B: board reads the WHAT back byte for byte"
out=$($CTX session entry show b-unit "$TODAY-b-bs" --json 2>&1)
a_eq "$(printf '%s\n' "$out" | grep -cF 'W a\\b c\\\\d \\n e\\')" "1" "B: entry show --json doubles every backslash of the WHAT"
out=$($CTX session search b-unit 'c\\d' --mode=exact --json 2>&1)
a_not "$out" '"total_matches":0' "B: search finds a doubled backslash sequence"
printf '# recipe grammar\nMISSION\n  GOAL: "b lane"\n' | rput b-unit lane/b-lane/recipe
b_lw='L a\b c\\d \n e\'
$CTX lane record b-unit b-lane --what="$b_lw" >/dev/null 2>&1
a_eq "$?" "0" "B: lane record with backslash payloads rc0"
a_eq "$($CTX lane show b-unit b-lane journal 2>&1 | grep -cF "$b_lw")" "1" "B: lane show reads the lane WHAT back byte for byte"
printf 'r1 a\\b\nr2 c\\\\d\nr3 \\n lit\n\\\nr5 trailing\\\n' > b-report.md
$CTX lane report b-unit b-lane < b-report.md > b-echo.out 2>&1
a_eq "$?" "0" "B: lane report with backslash lines rc0"
cmp -s b-report.md b-echo.out; a_eq "$?" "0" "B: the lane report write echo is byte-identical to the input"
$CTX lane show b-unit b-lane report > b-show.out 2>&1
cmp -s b-report.md b-show.out; a_eq "$?" "0" "B: lane show report is byte-identical to the input"
rcat b-unit lane/b-lane/report > b-stored.out
cmp -s b-report.md b-stored.out; a_eq "$?" "0" "B: the stored report is byte-identical to the input"
rm -f b-report.md b-echo.out b-show.out b-stored.out

echo "== W a failed storage write is rc2 (lanes/routing-review/report finding R4) =="
# a store that refuses writes (read-only files and folders, a read-only database): every
# typed write exits 2 and leaves the record and the scratch drawer as they were
$CTX session bootstrap w-unit "storage failure unit" >/dev/null 2>&1
$CTX session task add w-unit w-a --objective="Task A" >/dev/null 2>&1
$CTX session task add w-unit w-b --objective="Task B" >/dev/null 2>&1
$CTX session finding add w-unit W_ONE --summary="One" >/dev/null 2>&1
printf '# recipe grammar\nMISSION\n  GOAL: "w lane"\n' | rput w-unit lane/w-lane/recipe
printf '# journal grammar\n' | rput w-unit lane/w-lane/journal
w_sum() { for k in state backlog knowledge journal lane/w-lane/journal; do rcat w-unit "$k"; done | cksum; }
w_residue() { ls .contexture/tmp 2>/dev/null | grep -c -e '^backlog\.' -e '^knowledge\.' -e '^state\.' -e '^journal\.' -e '^payload\.' -e '^rec\.' -e '^fts5-ws\.'; }
w_before=$(w_sum)
w_res0=$(w_residue)
if [ "$DRIVER" = fts5 ]; then
  chmod 444 .contexture/sessions.db
else
  chmod 444 .contexture/sessions/w-unit/*.md .contexture/sessions/w-unit/lanes/w-lane/*.md
  chmod 555 .contexture/sessions/w-unit .contexture/sessions/w-unit/lanes/w-lane
fi
$CTX session task add w-unit w-c --objective="Task C" >/dev/null 2>&1
a_eq "$?" "2" "R4: task add on a read-only store exits 2"
$CTX session task start w-unit w-a --pointer="w-a IN_PROGRESS" >/dev/null 2>&1
a_eq "$?" "2" "R4: task start on a read-only store exits 2"
$CTX session task complete w-unit w-b --evidence="never lands" >/dev/null 2>&1
a_eq "$?" "2" "R4: task complete on a read-only store exits 2"
$CTX session finding add w-unit W_TWO --summary="Two" >/dev/null 2>&1
a_eq "$?" "2" "R4: finding add on a read-only store exits 2"
$CTX lane record w-unit w-lane --what="never lands" >/dev/null 2>&1
a_eq "$?" "2" "R4: lane record on a read-only store exits 2"
if [ "$DRIVER" = fts5 ]; then
  # the store comes back whole: SQLite gives the WAL and shared-memory files a refused
  # connection creates the database file's mode, and on Linux a read-only WAL keeps
  # every later write refused
  chmod 644 .contexture/sessions.db .contexture/sessions.db-wal .contexture/sessions.db-shm 2>/dev/null
else
  chmod 755 .contexture/sessions/w-unit .contexture/sessions/w-unit/lanes/w-lane
  chmod 644 .contexture/sessions/w-unit/*.md .contexture/sessions/w-unit/lanes/w-lane/*.md
fi
a_eq "$(w_sum)" "$w_before" "R4: the refused writes left every artifact unchanged"
a_eq "$(w_residue)" "$w_res0" "R4: the refused writes left no temp in the scratch drawer"
$CTX session task start w-unit w-a --pointer="w-a IN_PROGRESS" >/dev/null 2>&1
a_eq "$?" "0" "R4: the unit lock was released: a later task start lands"

echo "== K an interrupted driver method leaves no scratch (lanes/routing-review/report finding R8) =="
# the method stages its scratch (the posix payload, the fts5 materialized unit), then
# waits on a held unit lock; a TERM there exits through the cleanup on every sh
$CTX session bootstrap k-unit "interrupt unit" >/dev/null 2>&1
$CTX session task add k-unit k-a --objective="Task A" >/dev/null 2>&1
if [ "$DRIVER" = fts5 ]; then k_lock=.contexture/tmp/locks/fts5-k-unit.lock; k_pat='^fts5-ws\.'; else k_lock=.contexture/tmp/locks/k-unit.lock; k_pat='^payload\.'; fi
mkdir -p "$k_lock"
printf 'pointer=k-a IN_PROGRESS\n' | "$RESOLVER" task.start k-unit k-a >/dev/null 2>&1 &
k_pid=$!
k_n=0
while [ "$k_n" -lt 50 ] && ! ls .contexture/tmp | grep -q "$k_pat"; do sleep 0.1; k_n=$((k_n + 1)); done
k_seen=$(ls .contexture/tmp | grep -c "$k_pat")
kill -TERM "$k_pid" 2>/dev/null
wait "$k_pid" 2>/dev/null
rmdir "$k_lock" 2>/dev/null
a_eq "$k_seen" "1" "R8: the waiting method had staged its scratch when interrupted"
a_eq "$(ls .contexture/tmp | grep -c "$k_pat")" "0" "R8: TERM on a waiting driver method leaves no scratch"

echo "== Q one-line typed fields and the append quote rule (lanes/routing-review/report finding R3) =="
# a typed single-line field is written as one line of its block; an embedded newline would
# start a column-0 continuation that breaks the block grammar, so it refuses rc1 before any
# write; the block scalars (desc, criteria, details, summary) keep their newlines (section Y)
$CTX session bootstrap q-unit "one-line field unit" >/dev/null 2>&1
$CTX session task add q-unit q-a --objective="Task A" >/dev/null 2>&1
$CTX session finding add q-unit Q_ONE --summary="One" >/dev/null 2>&1
printf '# recipe grammar\nMISSION\n  GOAL: "q lane"\n' | rput q-unit lane/q-lane/recipe
printf '# journal grammar\n' | rput q-unit lane/q-lane/journal
q_nl=$(printf 'first line\nsecond line')
q_sum() { for k in state backlog knowledge journal lane/q-lane/journal; do rcat q-unit "$k"; done | cksum; }
q_before=$(q_sum)
q_refuse() {
  q_label=$1; shift
  q_out=$("$@" 2>&1 </dev/null); q_rc=$?
  a_eq "$q_rc" "1" "R3: $q_label with an embedded newline refuses rc1"
  a_match "$q_out" "newline" "R3: $q_label names the embedded newline"
}
q_refuse "record --what" $CTX session record q-unit --what="$q_nl"
q_refuse "record --thread" $CTX session record q-unit --what="one line" --thread="$q_nl"
q_refuse "record --group" $CTX session record q-unit --what="one line" --group="$q_nl"
q_refuse "record --ref" $CTX session record q-unit --what="one line" --ref="$q_nl"
q_refuse "task add --objective" $CTX session task add q-unit q-b --objective="$q_nl"
q_refuse "task add --refs" $CTX session task add q-unit q-c --objective="Task C" --refs="$q_nl"
q_refuse "task update --objective" $CTX session task update q-unit q-a --objective="$q_nl"
q_refuse "task start --pointer" $CTX session task start q-unit q-a --pointer="$q_nl"
q_refuse "task complete --evidence" $CTX session task complete q-unit q-a --evidence="$q_nl"
q_refuse "task drop --reason" $CTX session task drop q-unit q-a --reason="$q_nl"
q_refuse "finding add --ref" $CTX session finding add q-unit Q_TWO --summary="Two" --ref="$q_nl"
q_refuse "finding update --ref" $CTX session finding update q-unit Q_ONE --ref="$q_nl"
q_refuse "finding supersede --ref" $CTX session finding supersede q-unit Q_ONE Q_THREE --summary="Three" --ref="$q_nl"
q_refuse "lane record --what" $CTX lane record q-unit q-lane --what="$q_nl"
q_refuse "lane record --thread" $CTX lane record q-unit q-lane --what="one line" --thread="$q_nl"
q_refuse "stamp attention" $CTX session stamp q-unit "$q_nl"
q_refuse "next pointer" $CTX session next q-unit "$q_nl"
a_eq "$(q_sum)" "$q_before" "R3: the refused one-line writes left every artifact unchanged"
out=$($CTX session task add q-unit q-d --objective="Task D" --desc="$q_nl" 2>&1); rc=$?
a_eq "$rc" "0" "R3: a block scalar keeps its newline (task add --desc rc0)"
# embedded double quotes: the typed writes store them and every reader tolerates them, so
# append accepts the same WHAT (one quoted line) and the readers return it verbatim
out=$($CTX session record q-unit --what='the typed "quoted" what' --slug=q-typed-quote 2>&1); rc=$?
a_eq "$rc" "0" "R3: record --what with embedded double quotes rc0"
printf '@entry %s-q-appended-quote\n  WHAT: "an appended "quoted" what"\n  THREAD: none\n' "$TODAY" | $CTX session append q-unit >/dev/null 2>&1
a_eq "$?" "0" "R3: append accepts a WHAT with embedded double quotes"
a_eq "$(rcat q-unit journal | grep -cF '  WHAT: "an appended "quoted" what"')" "1" "R3: the appended quoted WHAT lands verbatim"
out=$($CTX session board q-unit 2>&1)
a_match "$out" 'WHAT: "an appended "quoted" what"' "R3: board reads the appended quoted WHAT verbatim"
a_match "$out" 'WHAT: "the typed "quoted" what"' "R3: board reads the typed quoted WHAT verbatim"
out=$($CTX session entry show q-unit "$TODAY-q-appended-quote" 2>&1)
a_match "$out" 'WHAT: "an appended "quoted" what"' "R3: entry show reads the appended quoted WHAT verbatim"
out=""
q_p=1
while [ "$q_p" -le 20 ]; do
  q_page=$($CTX session load q-unit "$q_p" 2>&1)
  out="$out
$q_page"
  printf '%s\n' "$q_page" | grep -qi 'load complete' && break
  q_p=$((q_p + 1))
done
a_match "$out" 'WHAT: "an appended "quoted" what"' "R3: load (every page) reads the appended quoted WHAT verbatim"
$CTX session audit q-unit >/dev/null 2>&1
a_eq "$?" "0" "R3: audit rc0 over the quoted WHATs"
out=$($CTX session search q-unit 'appended "quoted" what' --mode=exact --json 2>&1)
a_match "$out" "\"entity_id\":\"$TODAY-q-appended-quote\"" "R3: search --mode=exact finds the quoted WHAT"
printf '@entry %s-q-bad-quote\n  WHAT: unquoted "what"\n  THREAD: none\n' "$TODAY" | $CTX session append q-unit >/dev/null 2>&1
a_eq "$?" "1" "R3: append still refuses a WHAT that is not one quoted line"
# legacy records stay readable: an entry written before the refusal with a two-line WHAT
# still loads and audits as before (knowledge#BACKWARD_COMPATIBLE_READS)
printf '\n@entry %s-q-legacy-two-line\n  ANCHOR: A1\n  WHAT: "legacy first line\nlegacy second line"\n  THREAD: none\n' "$TODAY" | rappend q-unit journal
$CTX session audit q-unit >/dev/null 2>&1
a_eq "$?" "0" "R3: a legacy two-line WHAT still audits rc0"
out=$($CTX session board q-unit 2>&1)
a_match "$out" "@entry $TODAY-q-legacy-two-line" "R3: a legacy two-line WHAT still loads on the board"
fi # group 2

if in_group 3; then
echo "== Z the capability handshake at dispatch (lanes/routing-review/report finding R5) =="
# a configured driver other than the bundled posix one proves its mandatory capabilities
# before it serves a method: a planted driver lacking artifact.store is refused rc2 with
# the capability named; a complete one is verified once and served from the cached verdict
# until the driver changes. Both plants delegate every method to this sandbox's posix driver.
z_posix="$PWD/.contexture/modules/session/drivers/posix/driver"
z_log="$PWD/z-handshakes.log"
: > "$z_log"
z_plant() {
  mkdir -p ".contexture/modules/zz-plant/drivers/$1"
  {
    printf '#!/bin/sh\n'
    printf 'if [ "${1:-}" = capability ]; then\n'
    printf '  printf "%%s\\n" "%s" >> "%s"\n' "$1" "$z_log"
    printf '  printf "{\\"driver\\":\\"%s\\",\\"capabilities\\":[%s]}\\n"\n' "$1" "$2"
    printf '  exit 0\n'
    printf 'fi\n'
    printf 'exec "%s" "$@"\n' "$z_posix"
  } > ".contexture/modules/zz-plant/drivers/$1/driver"
  chmod +x ".contexture/modules/zz-plant/drivers/$1/driver"
  touch -t 202001010000 ".contexture/modules/zz-plant/drivers/$1/driver"
}
z_caps='\"session.lifecycle\",\"task.crud\",\"task.atomic_completion\",\"entry.journal\",\"finding.knowledge\",\"lane.lifecycle\",\"resolve.symbolic\",\"search.keyword\"'
z_plant z-bad "$z_caps"
z_plant z-good "$z_caps,\\\"artifact.store\\\""
out=$(CTX_STORAGE_DRIVER=z-bad $CTX session bootstrap z-unit "handshake unit" 2>&1 </dev/null); rc=$?
a_eq "$rc" "2" "R5: bootstrap on a driver lacking artifact.store refuses rc2"
a_match "$out" "missing mandatory capability: artifact.store" "R5: the refusal names the missing capability"
CTX_STORAGE_DRIVER=posix "$RESOLVER" artifact.read z-unit state >/dev/null 2>&1
a_eq "$?" "1" "R5: the refused bootstrap created nothing in the planted driver's store"
z_nb=$(grep -c '^z-bad$' "$z_log")
if [ "$z_nb" -ge 1 ] && [ "$z_nb" = "$(grep -c '' "$z_log")" ]; then ok "R5: the refused driver was asked for its capabilities, no other driver"; else bad "R5: the refused driver was asked for its capabilities, no other driver (z-bad: $z_nb, all: $(grep -c '' "$z_log"))"; fi
out=$(CTX_STORAGE_DRIVER=z-bad "$RESOLVER" exec session.list 2>&1 </dev/null); rc=$?
a_eq "$rc" "2" "R5: the exec form refuses the incomplete driver rc2 too"
: > "$z_log"
CTX_STORAGE_DRIVER=z-good $CTX session bootstrap z-unit "handshake unit" >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "R5: bootstrap on a complete planted driver rc0"
CTX_STORAGE_DRIVER=z-good $CTX session task add z-unit z-a --objective="Task A" >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "R5: a typed write on the complete planted driver rc0"
CTX_STORAGE_DRIVER=z-good $CTX session board z-unit >/dev/null 2>&1 </dev/null
a_eq "$(grep -c '^z-good$' "$z_log")" "1" "R5: three verbs on one unchanged driver ran the handshake once (the cached verdict)"
touch ".contexture/modules/zz-plant/drivers/z-good/driver"
CTX_STORAGE_DRIVER=z-good $CTX session task show z-unit z-a >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "R5: the changed driver still serves after its new handshake"
z_n=$(grep -c '^z-good$' "$z_log")
if [ "$z_n" -gt 1 ]; then ok "R5: a changed driver is verified again ($z_n handshakes)"; else bad "R5: a changed driver is verified again (handshakes: $z_n)"; fi
rm -rf .contexture/modules/zz-plant "$z_log"

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
  if rcat "$slug" journal | grep -q "@entry $today-probe-journal-$i" \
    && rcat "$slug" state | grep -q "next_action: \"pointer $i\""; then
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
  # no temp residue beside the posix files, no scratch left by a verb or the fts5 store
  if ls .contexture/sessions/p2/.tmp* .contexture/sessions/p2/*.XXXXXX .contexture/tmp/rec.* .contexture/tmp/fts5-ws.* >/dev/null 2>&1; then
    p2_residue=$((p2_residue + 1))
  fi
  rcat p2 journal | awk '
    /^@entry / { if (pending) bad = 1; pending = 1; next }
    /^  THREAD: / { pending = 0 }
    END { exit (pending ? 1 : bad ? 1 : 0) }
  ' || p2_incomplete=$((p2_incomplete + 1))
  if rcat p2 journal | grep -q "@entry $today-probe-x-$i" \
    && rcat p2 journal | grep -q "@entry $today-probe-y-$i"; then
    p2_both=$((p2_both + 1))
  fi
  i=$((i + 1))
done
a_eq "$p2_rc_bad" "0" "P2 same-target concurrency: every write act rc0"
a_eq "$p2_residue" "0" "P2 same-target concurrency: no temp residue"
a_eq "$p2_incomplete" "0" "P2 same-target concurrency: no torn journal block"
echo "note: P2 same-target both-landed $p2_both/$p2_iters (last-writer-wins is the documented design)"

echo "== RF shared ref fixes =="
# finding update --ref stores the ref (a REF line added when the finding had none, the
# existing one replaced otherwise); entry show --json carries the entry's REF; the load
# warning for an absent ref session names the unit, never a storage path
$CTX session bootstrap f-unit "shared ref fixes" >/dev/null 2>&1 </dev/null
$CTX session finding add f-unit F_NOREF --summary="first summary" >/dev/null 2>&1 </dev/null
$CTX session finding add f-unit F_REF --summary="ref summary" --ref="journal#f-old" >/dev/null 2>&1 </dev/null
$CTX session finding add f-unit F_LAST --summary="last summary" >/dev/null 2>&1 </dev/null
$CTX session finding update f-unit F_NOREF --summary="updated summary" --ref="journal#f-target" >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "RF1: finding update --ref on a finding without a REF rc0"
out=$($CTX session finding show f-unit F_NOREF --json 2>&1 </dev/null)
a_match "$out" '"ref":"journal#f-target"' "RF1: finding show --json reads the ref finding update stored"
a_match "$out" '"summary":"updated summary"' "RF1: finding update --ref still updates the summary"
out=$($CTX session finding show f-unit F_NOREF 2>&1 </dev/null)
a_match "$out" '^  REF: "journal#f-target"$' "RF1: finding show text reads the ref finding update stored"
f_block=$(rcat f-unit knowledge | awk '/^@finding F_NOREF$/ { on = 1; print; next } on && /^@/ { on = 0 } on { print ($0 == "" ? "<>" : $0) }')
a_eq "$(printf '%s\n' "$f_block" | grep -c '^  REF: ')" "1" "RF1: the updated finding carries exactly one REF line"
a_eq "$(printf '%s\n' "$f_block" | sed -n '2p;$p' | tr '\n' '|')" '  SUMMARY ::|<>|' "RF1: the block keeps SUMMARY first and its blank separator last"
a_eq "$(printf '%s\n' "$f_block" | grep -n '' | sed -n '/REF: /s/:.*//p')" "4" "RF1: the REF line follows the summary body, the serializer order"
$CTX session finding update f-unit F_LAST --ref="journal#f-last" >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "RF1: finding update --ref alone on the last finding rc0"
out=$($CTX session finding show f-unit F_LAST --json 2>&1 </dev/null)
a_match "$out" '"ref":"journal#f-last"' "RF1: finding update --ref lands on the last finding of the knowledge"
a_match "$out" '"summary":"last summary"' "RF1: finding update --ref alone keeps the summary"
$CTX session finding update f-unit F_REF --ref="journal#f-new" >/dev/null 2>&1 </dev/null
out=$($CTX session finding show f-unit F_REF --json 2>&1 </dev/null)
a_match "$out" '"ref":"journal#f-new"' "RF1: finding update --ref replaces an existing REF"
a_eq "$(rcat f-unit knowledge | grep -c '^  REF: ')" "3" "RF1: every finding carries one REF line after the updates"
a_eq "$($CTX session finding list f-unit 2>/dev/null </dev/null | grep -c '^  F_')" "3" "RF1: finding list still sees every finding"

$CTX session record f-unit --what="entry with a ref" --slug="$TODAY-f-e1" --ref="knowledge#F_NOREF" >/dev/null 2>&1 </dev/null
$CTX session record f-unit --what="entry without a ref" --slug="$TODAY-f-e2" >/dev/null 2>&1 </dev/null
out=$($CTX session entry show f-unit "$TODAY-f-e1" --json 2>&1 </dev/null)
a_match "$out" '"ref":"knowledge#F_NOREF"' "RF2: entry show --json carries the entry's REF"
a_match "$out" '"thread":"none","ref":"knowledge#F_NOREF"}' "RF2: the ref field follows thread inside the entry object"
out=$($CTX session entry show f-unit "$TODAY-f-e2" --json 2>&1 </dev/null)
a_match "$out" '"ref":""' "RF2: entry show --json carries an empty ref when the entry has none"
out=$($CTX session entry show f-unit "$TODAY-f-e1" 2>&1 </dev/null)
a_eq "$(printf '%s\n' "$out" | sed -n '1p;3p;4p' | tr '\n' '|')" "@entry $TODAY-f-e1|  WHAT: \"entry with a ref\"|  THREAD: none|" "RF2: entry show text keeps its lines"
a_not "$out" "REF" "RF2: entry show text view unchanged (no REF line)"

{ rcat f-unit state | grep -v '^ref_sessions:'; printf 'ref_sessions: [f-ghost]\n'; } > f-state.tmp
rput f-unit state < f-state.tmp; rm -f f-state.tmp
a_match "$(rcat f-unit state)" '^ref_sessions: \[f-ghost\]$' "RF3: the fixture names a ref session absent from the store"
err=$($CTX session load f-unit 2>&1 >/dev/null </dev/null); rc=$?
a_eq "$rc" "0" "RF3: load with an absent ref session rc0"
a_match "$err" '^WARNING: missing knowledge: unit f-ghost$' "RF3: the missing ref knowledge warning names the unit and the artifact"
a_match "$err" '^WARNING: missing journal: unit f-ghost$' "RF3: the missing ref journal warning names the unit and the artifact"
a_not "$err" 'sessions/' "RF3: the missing ref warning names no storage path"
a_not "$err" '\.md' "RF3: the missing ref warning names no file"

echo "== U one quote rule for every one-line quoted field (backlog quote-rule-uniform) =="
# every one-line quoted field (WHAT, a task OBJECTIVE, the next_action pointer, the state
# objective) follows one rule on every write path: an embedded double quote is text, an
# embedded newline refuses; the readers return the stored value verbatim
$CTX session bootstrap u-unit "quote rule unit" >/dev/null 2>&1 </dev/null
u_obj='the "quoted" objective of the human'"'"'s unit'
out=$($CTX session bootstrap u-obj "$u_obj" 2>&1 </dev/null); rc=$?
a_eq "$rc" "0" "QU: bootstrap accepts an objective with embedded double and single quotes"
a_eq "$(rcat u-obj state | grep -cF "objective: \"$u_obj\"")" "1" "QU: the state objective lands verbatim"
a_match "$($CTX session active 2>/dev/null </dev/null)" 'objective: "the "quoted" objective of the human' "QU: active reads the quoted state objective verbatim"
out=$($CTX session load u-obj 2>&1 </dev/null)
a_match "$out" "objective: \"the \"quoted\" objective of the human's unit\"" "QU: load reads the quoted state objective verbatim"
$CTX session audit u-obj >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "QU: audit rc0 over the quoted state objective"
$CTX session task add u-unit u-a --objective='Task "A" typed' >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "QU: task add --objective with embedded quotes rc0 (unchanged)"
$CTX session task start u-unit u-a --pointer='u-a IN_PROGRESS: the "typed" pointer' >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "QU: task start --pointer with embedded quotes rc0 (unchanged)"
out=$($CTX session next u-unit 'u-a IN_PROGRESS: the "next" pointer' 2>&1 </dev/null); rc=$?
a_eq "$rc" "0" "QU: next accepts a pointer with embedded double quotes"
a_eq "$(rcat u-unit state | grep -cF 'next_action: "u-a IN_PROGRESS: the "next" pointer"')" "1" "QU: the next pointer lands verbatim"
printf '@task u-b\n  STATUS: TODO\n  OBJECTIVE: "an "appended" objective"\n' | $CTX session append u-unit >/dev/null 2>&1
a_eq "$?" "0" "QU: append accepts a task OBJECTIVE with embedded double quotes"
a_eq "$(rcat u-unit backlog | grep -cF '  OBJECTIVE: "an "appended" objective"')" "1" "QU: the appended OBJECTIVE lands verbatim"
printf '@task u-c\n  STATUS: TODO\n  OBJECTIVE: "to be amended"\n' | $CTX session append u-unit >/dev/null 2>&1
printf '  OBJECTIVE: "an "amended" objective"\n' | $CTX session amend u-unit u-c >/dev/null 2>&1
a_eq "$?" "0" "QU: amend accepts an OBJECTIVE with embedded double quotes"
a_eq "$(rcat u-unit backlog | grep -cF '  OBJECTIVE: "an "amended" objective"')" "1" "QU: the amended OBJECTIVE lands verbatim"
out=$($CTX session task show u-unit u-b 2>&1 </dev/null)
a_match "$out" 'OBJECTIVE: "an "appended" objective"' "QU: task show text reads the appended OBJECTIVE verbatim"
out=$($CTX session task show u-unit u-c --json 2>&1 </dev/null)
a_match "$out" '"objective":"an \\"amended\\" objective"' "QU: task show --json carries the amended OBJECTIVE"
out=""
u_p=1
while [ "$u_p" -le 20 ]; do
  u_page=$($CTX session load u-unit "$u_p" 2>&1 </dev/null)
  out="$out
$u_page"
  printf '%s\n' "$u_page" | grep -qi 'load complete' && break
  u_p=$((u_p + 1))
done
a_match "$out" 'next_action: "u-a IN_PROGRESS: the "next" pointer"' "QU: load reads the quoted next pointer verbatim"
a_match "$out" 'OBJECTIVE: "an "appended" objective"' "QU: load reads the appended OBJECTIVE verbatim"
a_match "$out" 'OBJECTIVE: "an "amended" objective"' "QU: load reads the amended OBJECTIVE verbatim"
out=$($CTX session board u-unit 2>&1 </dev/null)
a_match "$out" 'u-b' "QU: board lists the task with the quoted OBJECTIVE"
$CTX session audit u-unit >/dev/null 2>&1 </dev/null
a_eq "$?" "0" "QU: audit rc0 over the quoted fields"
# the default mode reads the search index of an indexed driver (hybrid on fts5)
out=$($CTX session search u-unit 'amended' --json 2>&1 </dev/null)
a_match "$out" '"entity_id":"u-c"' "QU: search in the default mode finds the task with the quoted OBJECTIVE"
if [ "$DRIVER" = fts5 ]; then u_snip='\\"<b>amended</b>\\"'; else u_snip='an \\"amended\\" objective'; fi
a_match "$out" "$u_snip" "QU: the default mode search snippet carries the quoted OBJECTIVE text"
# the newline refusal stays on every one of these paths
u_nl=$(printf 'first\nsecond')
$CTX session bootstrap u-nl "$u_nl" >/dev/null 2>&1 </dev/null
a_eq "$?" "1" "QU: bootstrap still refuses an objective with an embedded newline"
$CTX session next u-unit "u-a $u_nl" >/dev/null 2>&1 </dev/null
a_eq "$?" "1" "QU: next still refuses a pointer with an embedded newline"
printf '@task u-d\n  STATUS: TODO\n  OBJECTIVE: bare objective\n' | $CTX session append u-unit >/dev/null 2>&1
a_eq "$?" "1" "QU: append still refuses an OBJECTIVE that is not one quoted line"
printf '  OBJECTIVE: bare objective\n' | $CTX session amend u-unit u-c >/dev/null 2>&1
a_eq "$?" "1" "QU: amend still refuses an OBJECTIVE that is not one quoted line"

echo "== UP messages name the artifact and its unit, never a storage path (backlog path-free-messages) =="
# every warning and error of the verbs reads <artifact>: unit <u>; the fixtures are units
# the store holds with an artifact missing, made through the driver alone
up_err() { "$@" 2>&1 >/dev/null </dev/null; }
up_path() { a_not "$1" 'sessions' "$2 names no storage path"; a_not "$1" '\.md' "$2 names no file"; }
out=$(up_err $CTX session stamp nosuch "attention")
a_match "$out" '^ERROR: missing state: unit nosuch$' "UP: stamp of an absent unit names the state and the unit"
up_path "$out" "UP: stamp of an absent unit"
out=$(up_err $CTX session board nosuch)
a_match "$out" '^ERROR: missing journal: unit nosuch$' "UP: board of an absent unit names the journal and the unit"
up_path "$out" "UP: board of an absent unit"
out=$(up_err $CTX session audit nosuch)
a_match "$out" '^ERROR: missing journal: unit nosuch$' "UP: audit of an absent unit names the journal and the unit"
up_path "$out" "UP: audit of an absent unit"
out=$(up_err $CTX session bootstrap u-unit "again")
a_match "$out" '^ERROR: session exists: unit u-unit$' "UP: bootstrap of an existing unit names the unit"
up_path "$out" "UP: bootstrap of an existing unit"
# up-bare: a state and a journal, no backlog, no knowledge
"$RESOLVER" session.create up-bare >/dev/null 2>&1 </dev/null
printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "plan"\nobjective: "bare unit"\nrepos: []\nref_sessions: []\n' | rput up-bare state
printf '@anchor A1 ("continues A0", attention: bare)\n' | rput up-bare journal
out=$(up_err $CTX session board up-bare)
a_match "$out" '^WARNING: missing backlog: unit up-bare$' "UP: board without a backlog warns with the artifact and the unit"
up_path "$out" "UP: the board warning"
out=$(up_err $CTX session query search up-bare plan)
a_match "$out" '^WARNING: missing backlog: unit up-bare$' "UP: query search without a backlog warns with the artifact and the unit"
a_match "$out" '^WARNING: missing knowledge: unit up-bare$' "UP: query search without a knowledge warns with the artifact and the unit"
up_path "$out" "UP: the query search warnings"
out=$(up_err $CTX session query resolve up-bare "backlog.md#some-task")
a_match "$out" '^ERROR: missing backlog: unit up-bare$' "UP: query resolve of a task without a backlog names the artifact and the unit"
up_path "$out" "UP: the query resolve error"
out=$(up_err $CTX session query resolve up-bare "lanes/no-lane/report.md#orientation")
a_match "$out" '^ERROR: no such section: orientation in lane no-lane report: unit up-bare$' "UP: query resolve of an absent lane report names the lane, the artifact, and the unit"
up_path "$out" "UP: the lane report resolve error"
out=$(up_err $CTX session next up-bare "plan")
a_match "$out" '^ERROR: missing backlog: unit up-bare$' "UP: a grammar write without a backlog names the artifact and the unit"
up_path "$out" "UP: the grammar write error"
# up-nojournal: a state alone
"$RESOLVER" session.create up-nojournal >/dev/null 2>&1 </dev/null
printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "plan"\nobjective: "no journal"\nrepos: []\nref_sessions: []\n' | rput up-nojournal state
out=$(up_err $CTX session query entry up-nojournal "$TODAY-no-entry")
a_match "$out" '^ERROR: missing journal: unit up-nojournal$' "UP: query entry without a journal names the artifact and the unit"
up_path "$out" "UP: the query entry error"
# up-odd: a state with a malformed anchor and an unknown status, then one without next_action
"$RESOLVER" session.create up-odd >/dev/null 2>&1 </dev/null
printf 'status: ACTIVE\ncurrent_anchor: X9\nnext_action: "plan"\nobjective: "odd"\nrepos: []\nref_sessions: []\n' | rput up-odd state
printf '@anchor A1 ("continues A0", attention: odd)\n' | rput up-odd journal
: | rput up-odd backlog
: | rput up-odd knowledge
out=$(up_err $CTX session record up-odd --what="an event")
a_match "$out" '^ERROR: malformed current_anchor \[X9\] in state: unit up-odd$' "UP: record under a malformed anchor names the state and the unit"
up_path "$out" "UP: the malformed anchor error"
printf 'status: ACTIVE\ncurrent_anchor: A1\nobjective: "odd"\nrepos: []\nref_sessions: []\n' | rput up-odd state
out=$(up_err $CTX session next up-odd "plan")
a_match "$out" '^ERROR: missing next_action in state: unit up-odd (fix the state by hand)$' "UP: next without a next_action names the state and the unit"
up_path "$out" "UP: the missing next_action error"
printf '@anchor A1 ("continues A0", attention: odd)\r\n' | rput up-odd journal
printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "plan"\nobjective: "odd"\nrepos: []\nref_sessions: []\n' | rput up-odd state
out=$(up_err $CTX session record up-odd --what="an event")
a_match "$out" '^ERROR: CRLF in journal: unit up-odd (the dialect is LF)$' "UP: a CRLF journal names the artifact and the unit"
up_path "$out" "UP: the CRLF error"
printf 'status: WEIRD\ncurrent_anchor: A1\nnext_action: "plan"\nobjective: "odd"\nrepos: []\nref_sessions: []\n' | rput up-odd state
out=$(up_err $CTX session active)
a_match "$out" '^WARNING: unrecognized status \[WEIRD\] in state: unit up-odd$' "UP: active names the state and the unit of an unknown status"
up_path "$out" "UP: the active warning"
printf 'status: CLOSED\ncurrent_anchor: A1\nnext_action: "plan"\nobjective: "odd"\nrepos: []\nref_sessions: []\n' | rput up-odd state
# no verb script names a sessions path in any warning or error it can print
up_static=$(grep -n 'contexture/sessions' .contexture/modules/session/scripts/* .contexture/modules/lane/scripts/* | grep -v ':[0-9]*:#' | grep -v 'WRITE SCOPE')
a_eq "$up_static" "" "UP: no verb script prints a sessions path in a message"
# the finding update usage: --summary and --ref are both optional (either alone works)
out=$($CTX session finding update --help 2>&1 </dev/null)
a_match "$out" 'update <unit> <NAME> \[--summary="\.\.\."\] \[--ref=\.\.\.\]' "UP: finding update --help shows --summary and --ref as optional"
out=$($CTX session help finding 2>&1 </dev/null)
a_match "$out" 'update <unit> <NAME> \[--summary="\.\.\."\] \[--ref=\.\.\.\]' "UP: the session help table shows the finding update flags as optional"
# entry.record carries a ref (the payload key ref, written after THREAD as record does)
# and echoes it in its success JSON, empty when absent
out=$(printf 'what=a driver entry with a ref\nthread=none\nref=knowledge#UP_REF\n' | "$RESOLVER" entry.record u-unit "$TODAY-up-er-ref" 2>&1)
a_match "$out" '"thread":"none","ref":"knowledge#UP_REF"}}' "UP: entry.record echoes the ref after thread"
u_blk=$(rcat u-unit journal | awk -v s="@entry $TODAY-up-er-ref" '$0 == s { on = 1; print; next } on && /^@/ { on = 0 } on && $0 != "" { print }')
a_eq "$(printf '%s\n' "$u_blk" | sed -n '4,5p' | tr '\n' '|')" '  THREAD: none|  REF: "knowledge#UP_REF"|' "UP: entry.record writes the REF line after THREAD"
out=$($CTX session entry show u-unit "$TODAY-up-er-ref" --json 2>&1 </dev/null)
a_match "$out" '"ref":"knowledge#UP_REF"' "UP: entry show reads the ref entry.record wrote"
out=$(printf 'what=a driver entry without a ref\nthread=none\n' | "$RESOLVER" entry.record u-unit "$TODAY-up-er-noref" 2>&1)
a_match "$out" '"thread":"none","ref":""}}' "UP: entry.record echoes an empty ref when absent"
a_eq "$(rcat u-unit journal | awk -v s="@entry $TODAY-up-er-noref" '$0 == s { on = 1; next } on && /^@/ { on = 0 } on' | grep -c 'REF:')" "0" "UP: entry.record writes no REF line when absent"

echo "== D session diagnostics =="
$CTX session diagnose >/dev/null 2>&1
a_eq "$?" "0" "session diagnose rc0"
diag_json=$($CTX session diagnose --json 2>/dev/null)
a_match "$diag_json" '"workspace_root"' "session diagnose --json carries workspace_root"
a_match "$diag_json" '"capabilities"' "session diagnose --json carries capabilities"
$CTX session --diagnose >/dev/null 2>&1
a_eq "$?" "0" "session --diagnose flag rc0"
fi # group 3

echo "== summary =="
if [ "$GROUP" = all ]; then
  echo "session-tests ($DRIVER): pass=$pass fail=$fail"
else
  echo "session-tests ($DRIVER, group $GROUP): pass=$pass fail=$fail"
fi
[ "$fail" -eq 0 ] || exit 1
exit 0
