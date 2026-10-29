#!/bin/sh
# base-only-tests.sh: the shipped base alone, with no plugin. It stages base/ only and
# proves the payload a bare adoption carries: the no-plugin help surface, the record,
# lane, and store surfaces over a synthetic data module, the absent-rhythms index, the
# posix descriptor, the store refusals, the no-base-to-docs census, and the posix core
# suites. It excludes every plugin suite (the fts5 session run, the docs suite, and every
# plugins/<name> suite): those are plugin gates, not base gates. A base-only regression
# (the absent rhythms index, a missing record or store function, a help drift, a
# base-to-docs reference) passes the upstream gate, so this suite is that gate's base
# half.
#
# The gate reads red on BG1 before the index fix and green after; a missing record
# function, a missing store function, and a base-to-docs reference each read red through
# the instruments below (the 43-function descriptor check and the census, both
# null-checked by a planted difference).
#
# Usage: tests/base-only-tests.sh [--keep] [--skip-core]
#   --keep       preserve the sandbox
#   --skip-core  skip B6's seven nested posix suites and their launches, running B1 to B5
#                alone (pass=145); the full run stays pass=152
# Exit 0 when every case passes; 1 otherwise; 2 a staging failure.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"
STORAGE_MOD="$ROOT/base/.contexture/modules/storage"
LANE_MOD="$ROOT/base/.contexture/modules/lane"
RUN_MOD="$ROOT/base/.contexture/modules/run"

KEEP=0
SKIP_CORE=0
for a in "$@"; do
  case "$a" in
    --keep) KEEP=1 ;;
    --skip-core) SKIP_CORE=1 ;;
    *) echo "base-only-tests.sh: unknown argument: $a" >&2; exit 1 ;;
  esac
done

for f in "$CTX_SRC" "$SESSION_MOD/scripts/driver-resolver" "$STORAGE_MOD/scripts/store-data" "$LANE_MOD/scripts/record" "$RUN_MOD"; do
  [ -e "$f" ] || { echo "base-only-tests.sh: missing $f" >&2; exit 2; }
done

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH CTX_STORAGE_SERVICE_URL CTX_STORAGE_SERVICE_KEY

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SB=$(mktemp -d "$tmp_root/base-only.XXXXXX") || { echo "base-only-tests.sh: cannot create the sandbox" >&2; exit 2; }
cleanup() {
  if [ "$KEEP" -eq 1 ]; then
    printf 'base-only-tests: sandbox preserved at %s\n' "$SB"
  else
    rm -rf "$SB"
  fi
}
trap cleanup EXIT INT TERM

# stage base alone: no docs/, no plugins/, no config, no rhythms directory
cp -R "$ROOT/base/." "$SB/" || { echo "base-only-tests.sh: cannot stage base" >&2; exit 2; }
mkdir -p "$SB/.contexture/tmp"
chmod +x "$SB/.contexture/ctx" "$SB/.contexture/modules/"*/scripts/* 2>/dev/null || true
cd "$SB" || exit 2

CTX=./.contexture/ctx
RESOLVER=.contexture/modules/storage/scripts/driver-resolver
STORE_DATA=.contexture/modules/storage/scripts/store-data
O="$SB/.out"; E="$SB/.err"
: > "$O"; : > "$E"
RC=0
FN=""

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }
a_not() { if printf '%s\n' "$1" | grep -q "$2"; then bad "$3 (unwanted: $2)"; else ok "$3"; fi; }
a_rc() { if [ "$1" -eq "$2" ]; then ok "$3"; else bad "$3 (rc $1 want $2)"; fi; }

# run <fn label> <args...>: one driver call; the answer in O, the refusal in E
run() { FN=$1; shift; "$@" > "$O" 2> "$E"; RC=$?; }
refused() { # <rc> <message...>: one line on stderr, nothing on stdout, the exact line
  _r_rc=$1; shift
  _r_want=$*
  a_rc "$RC" "$_r_rc" "$FN: rc $_r_rc"
  [ -s "$O" ] && bad "$FN: printed stdout on a refusal [$(head -c 120 "$O")]"
  _r_got=$(cat "$E")
  a_eq "$_r_got" "$_r_want" "$FN: the fixed refusal line"
}

# ==============================================================================
# B6 launch: the seven nested posix suites run while B1 to B5 execute
# ==============================================================================
# --skip-core skips the launches and the B6 section, leaving B1 to B5 alone
if [ "$SKIP_CORE" -eq 0 ]; then
# the nested suites are docs-shaped; the synthetic data file supplies that contract
printf 'namespace: docs\nroot: docs\nsuffix: .md\nkey: <repo>/<slug>\nchanges: true\n' > "$SB/base-only-data"
NESTED="$SB/nested"
mkdir -p "$NESTED"
NESTED_JOBS=3
NESTED_PID=""

run_core_cmd() { # <index>: the original seven commands and arguments, in order
  case "$1" in
    1) sh "$ROOT/tests/filter-tests.sh" ;;
    2) sh "$ROOT/tests/ctx-tests.sh" ;;
    3) sh "$ROOT/tests/session-tests.sh" --driver=posix ;;
    4) sh "$ROOT/tests/hook-tests.sh" ;;
    5) sh "$ROOT/tests/record-audit-tests.sh" ;;
    6) sh "$ROOT/tests/storage-compliance.sh" "--driver-exec=$ROOT/base/.contexture/modules/session/drivers/posix/driver" ;;
    7) sh "$ROOT/tests/store-compliance.sh" "--data-file=$SB/base-only-data" ;;
  esac
}

launch_core() { # <index>: one output and rc file per suite, the rc atomically renamed
  _lc_idx=$1
  ( run_core_cmd "$_lc_idx" > "$NESTED/$_lc_idx.out" 2>&1; printf '%s\n' "$?" > "$NESTED/$_lc_idx.rc.part"; mv "$NESTED/$_lc_idx.rc.part" "$NESTED/$_lc_idx.rc" ) &
  printf '%s\n' "$!" > "$NESTED/$_lc_idx.pid"
}

run_nested() { # the gate's rc-file poll idiom (tests/run.sh lines 128-180), cap 3
  nq="1 2 3 4 5 6 7"
  nr=""
  while :; do
    still=""
    for j in $nr; do
      [ -f "$NESTED/$j.rc" ] || still="$still $j"
    done
    nr=$still
    while [ -n "$nq" ]; do
      set -- $nr
      [ $# -ge "$NESTED_JOBS" ] && break
      set -- $nq
      launch_core "$1"
      nr="$nr $1"
      shift
      nq="$*"
    done
    [ -z "$nr" ] && [ -z "$nq" ] && break
    sleep 1
  done
}

run_nested &
NESTED_PID=$!
fi

# ==============================================================================
# B1: the no-plugin boot and help surface
# ==============================================================================
printf '== B1: the no-plugin boot and help surface ==\n'
[ ! -d .contexture/rhythms ] && ok "stage: the base carries no rhythms directory" || bad "stage: the base carries a rhythms directory"
[ ! -d docs ] && ok "stage: the base carries no docs folder" || bad "stage: the base carries a docs folder"
[ ! -d plugins ] && ok "stage: the base carries no plugins folder" || bad "stage: the base carries a plugins folder"
out=$($CTX help 2>&1); a_rc "$?" "0" "boot: ctx help rc0"
out=$($CTX help --all 2>&1); rc=$?
a_rc "$rc" "0" "boot: ctx help --all rc0"
a_match "$out" "module storage:" "help: the storage module is listed"
a_match "$out" "the generic module store" "help: the storage module carries its summary"
a_match "$out" "module session:" "help: the session module is listed"
a_match "$out" "module lane:" "help: the lane module is listed"
out=$($CTX run --help 2>&1); a_rc "$?" "0" "help: ctx run answers its help rc0"
err=$($CTX docs help 2>&1 >/dev/null); rc=$?
a_rc "$rc" "1" "help: ctx docs is unknown without the plugin"
a_eq "$err" "ctx: unknown command: docs" "help: ctx docs names the unknown command"
err=$($CTX storage-fts5 help 2>&1 >/dev/null); rc=$?
a_rc "$rc" "1" "help: ctx storage-fts5 is unknown without the plugin"
a_eq "$err" "ctx: unknown command: storage-fts5" "help: ctx storage-fts5 names the unknown command"
out=$($CTX session active 2>&1); rc=$?
a_rc "$rc" "0" "boot: ctx session active rc0 on an empty drawer"
a_match "$out" "no sessions yet" "boot: an empty drawer reads no sessions yet"

# ==============================================================================
# B2: the absent-rhythms index (BG1)
# ==============================================================================
printf '\n== B2: the absent-rhythms index (BG1) ==\n'
out=$($CTX session index 2> "$E"); RC=$?
a_rc "$RC" "0" "BG1: the absent rhythms directory answers rc0"
a_eq "$out" "" "BG1: the absent rhythms directory answers an empty index"
a_eq "$(cat "$E")" "" "BG1: the absent rhythms directory writes no stderr"
mkdir -p .contexture/rhythms
out=$($CTX session index 2> "$E"); RC=$?
a_rc "$RC" "0" "BG1: an empty rhythms directory answers rc0"
a_eq "$out" "" "BG1: an empty rhythms directory answers an empty index"
a_eq "$(cat "$E")" "" "BG1: an empty rhythms directory writes no stderr"
rmdir .contexture/rhythms
err=$($CTX session index extra 2>&1 >/dev/null); rc=$?
a_rc "$rc" "1" "BG1: an argument still refuses rc1"
a_match "$err" "^Usage: ctx session index$" "BG1: the argument refusal prints the usage"

# ==============================================================================
# B3: the base-only record smoke and the posix descriptor
# ==============================================================================
printf '\n== B3: the record smoke and the descriptor ==\n'
out=$($CTX session bootstrap baseonly "the base-only probe unit" 2>&1); rc=$?
a_rc "$rc" "0" "record: bootstrap rc0"
TODAY=$(date +%F)
$CTX session task add baseonly base-t1 --objective="the base-only task" --desc="one line" --criteria="the gate is green" --details="staged base alone" --refs="./AGENTS.md" >/dev/null 2>&1
a_rc "$?" "0" "record: task add with every field rc0"
$CTX session task add baseonly base-t2 --objective="a task to drop" >/dev/null 2>&1
a_rc "$?" "0" "record: the second task add rc0"
out=$($CTX session task list baseonly --status=all 2>&1)
a_match "$out" "base-t1" "record: task list reads the added task"
out=$($CTX session task show baseonly base-t1 2>&1)
a_match "$out" 'OBJECTIVE: "the base-only task"' "record: task show reads the objective"
$CTX session task start baseonly base-t1 --pointer="base-t1 IN_PROGRESS: run the base-only smoke" >/dev/null 2>&1
a_rc "$?" "0" "record: task start with a pointer rc0"
out=$($CTX session task show baseonly base-t1 2>&1)
a_match "$out" "STATUS: IN_PROGRESS" "record: task start moves the status"
$CTX session task update baseonly base-t1 --desc="two words" >/dev/null 2>&1
a_rc "$?" "0" "record: task update rc0"
$CTX session task complete baseonly base-t1 --evidence="the smoke passed" >/dev/null 2>&1
a_rc "$?" "0" "record: task complete with evidence rc0"
$CTX session task drop baseonly base-t2 --reason="not needed" >/dev/null 2>&1
a_rc "$?" "0" "record: task drop with a reason rc0"
S1="$TODAY-base-probe-1"
$CTX session record baseonly --slug="$S1" --what="the first probe entry" --group=base-only >/dev/null 2>&1
a_rc "$?" "0" "record: a given entry slug rc0"
$CTX session record baseonly --what="the second probe entry" --group=base-only --closes="$S1 (done: closed by the smoke)" >/dev/null 2>&1
a_rc "$?" "0" "record: a closer in the explicit form rc0"
$CTX session finding add baseonly BASE_OLD --summary="the old finding" --ref="journal#$S1" >/dev/null 2>&1
a_rc "$?" "0" "record: finding add with a ref rc0"
$CTX session finding supersede baseonly BASE_OLD BASE_NEW --summary="the new finding" >/dev/null 2>&1
a_rc "$?" "0" "record: finding supersede rc0"
out=$($CTX session finding list baseonly --active-only 2>&1)
a_match "$out" "BASE_NEW" "record: the active finding list reads the successor"
a_not "$out" "BASE_OLD" "record: the active finding list hides the predecessor"
printf '# probe lane\n\n@claim probe-claim\n  VERDICT: "the lane claim"\n' | $CTX lane create baseonly base-lane >/dev/null 2>&1
a_rc "$?" "0" "record: lane create with the recipe on stdin rc0"
$CTX lane record baseonly base-lane --what="a lane event" --ref="journal#$S1" >/dev/null 2>&1
a_rc "$?" "0" "record: lane record rc0"
printf '# probe report\n\n@claim probe-claim\n  VERDICT: "the lane claim"\n' | $CTX lane report baseonly base-lane >/dev/null 2>&1
a_rc "$?" "0" "record: lane report on stdin rc0"
out=$($CTX lane show baseonly base-lane journal 2>&1)
a_match "$out" "a lane event" "record: lane show reads the journal"
out=$($CTX lane show baseonly base-lane report 2>&1)
a_match "$out" "@claim probe-claim" "record: lane show reads the report"
out=$($CTX session board baseonly 2>&1); a_rc "$?" "0" "record: board rc0"
out=""; p=1
while [ "$p" -le 40 ]; do
  page=$($CTX session load baseonly "$p" 2>&1)
  out="$out
$page"
  printf '%s\n' "$page" | grep -qi 'load complete' && break
  p=$((p + 1))
done
a_match "$out" "load complete" "record: load reaches its complete page"
$CTX session audit baseonly >/dev/null 2>&1; a_rc "$?" "0" "record: audit rc0"
err=$($CTX session search baseonly "probe" 2>&1 >/dev/null); rc=$?
a_rc "$rc" "1" "record: search without --mode refuses rc1"
a_match "$err" "exact" "record: the mode refusal names exact"
out=$($CTX session search baseonly "base-only task" --mode=exact 2>&1)
a_rc "$?" "0" "record: search --mode=exact rc0"
a_match "$out" "base-t1" "record: the exact search finds the task"
# BG2: a snippet strips the double quotes only as a pair, so a lowercase field line keeps
# its closing quote (the state's next_action is the pre-fix case)
$CTX session next baseonly 'task#probe-task' >/dev/null 2>&1
a_rc "$?" "0" "BG2: next with a paired state line rc0"
out=$($CTX session search baseonly "task#probe-task" --mode=exact --json 2>&1)
a_match "$out" '"snippet":"next_action: \\"task#probe-task\\""' "BG2: the exact snippet keeps the quote pair on a lowercase field line"
a_not "$out" 'task#probe-task","score"' "BG2: the snippet no longer ends at the stripped trailing quote"
out=$($CTX session resolve baseonly task#base-t1 2>&1); rc=$?
a_rc "$rc" "0" "record: resolve task# rc0"
a_match "$out" "^@task base-t1" "record: resolve prints the task block"
out=$($CTX session resolve baseonly "entry#$S1" 2>&1); rc=$?
a_rc "$rc" "0" "record: resolve entry# rc0"
a_match "$out" "the first probe entry" "record: resolve prints the entry block"
out=$($CTX session resolve baseonly finding#BASE_NEW 2>&1); rc=$?
a_rc "$rc" "0" "record: resolve finding# rc0"
a_match "$out" "^@finding BASE_NEW" "record: resolve prints the finding block"
out=$($CTX session resolve baseonly lane#base-lane/report#probe-claim 2>&1); rc=$?
a_rc "$rc" "0" "record: resolve lane#/report# rc0"
a_match "$out" "^@claim probe-claim" "record: resolve prints the claim block"
out=$($CTX session entry closure baseonly "$S1" 2>&1); rc=$?
a_rc "$rc" "0" "record: entry closure rc0"
out=$($CTX session fold baseonly 2>&1); rc=$?
a_rc "$rc" "0" "record: the fold plan rc0"
$CTX session stamp baseonly >/dev/null 2>&1; a_rc "$?" "0" "record: stamp rc0"
$CTX session refresh baseonly >/dev/null 2>&1; a_rc "$?" "0" "record: refresh rc0"
$CTX session close baseonly >/dev/null 2>&1; a_rc "$?" "0" "record: close rc0"
$CTX session record baseonly --what="a write into a closed unit" >/dev/null 2>&1
a_rc "$?" "1" "record: a write into a CLOSED unit refuses rc1"
$CTX session reopen baseonly >/dev/null 2>&1; a_rc "$?" "0" "record: reopen rc0"
$CTX session record baseonly --what="the unit writes again" >/dev/null 2>&1
a_rc "$?" "0" "record: a write after reopen rc0"
# the descriptor: 38 record plus 5 store functions, exact and store, no store log on posix
out=$($CTX session diagnose --json 2>&1); rc=$?
a_rc "$rc" "0" "descriptor: diagnose rc0"
a_match "$out" '"name":"posix"' "descriptor: the driver is posix"
a_match "$out" '"contract":"2"' "descriptor: contract 2"
a_match "$out" '"search_modes":\["exact"\]' "descriptor: search modes exact"
a_match "$out" '"optional":\["store"\]' "descriptor: the optional set is store alone on posix"
a_match "$out" '"health":"ok"' "descriptor: the health is ok after bootstrap"
fn_list() { printf '%s' "$1" | sed -n 's/.*"functions":\[\([^]]*\)\].*/\1/p'; }
fn_count() { fn_list "$1" | tr ',' '\n' | grep -c .; }
fns=$(fn_list "$out" | tr -d '"')
a_eq "$(printf '%s\n' "$fns" | tr ',' '\n' | grep -c .)" "43" "descriptor: 43 functions (38 record plus 5 store)"
for f in task.add entry.record finding.get lane.create search.query store.list store.get store.put store.delete store.changes; do
  case ",$fns," in
    *",$f,"*) ok "descriptor: carries $f" ;;
    *) bad "descriptor: lacks $f" ;;
  esac
done
plant_record=$(printf '%s' "$out" | sed 's/,"task.add"//')
if [ "$(fn_count "$plant_record")" -ne 43 ]; then ok "descriptor null check: a planted missing record function fails the 43-function check"; else bad "descriptor null check: a planted missing record function passed"; fi
plant_store=$(printf '%s' "$out" | sed 's/,"store.put"//')
if [ "$(fn_count "$plant_store")" -ne 43 ]; then ok "descriptor null check: a planted missing store function fails the 43-function check"; else bad "descriptor null check: a planted missing store function passed"; fi

# ==============================================================================
# B4: the store smoke over a synthetic data module
# ==============================================================================
printf '\n== B4: the store smoke over a synthetic data module ==\n'
mkdir -p .contexture/modules/probe probe-data/x
printf 'namespace: probe\nroot: probe-data\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > .contexture/modules/probe/data
out=$($STORE_DATA probe 2> "$E"); RC=$?
a_rc "$RC" "0" "store: store-data answers rc0"
a_eq "$out" "$(printf 'probe\nprobe-data\n.txt\n<a>/<b>\nfalse')" "store: store-data prints the five validated fields"
a_eq "$(cat "$E")" "" "store: store-data writes no stderr"
run "store-data nosuch" "$STORE_DATA" nosuch
refused 3 "store-data: namespace 'nosuch' is declared by no module data file"
run "store-data Bad!" "$STORE_DATA" 'Bad!'
refused 1 "store-data: malformed namespace 'Bad!'"
mkdir -p .contexture/modules/probe2
printf 'namespace: probe\nroot: probe2-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: true\n' > .contexture/modules/probe2/data
run "store-data duplicate" "$STORE_DATA" probe
refused 1 "store-data: namespace 'probe' is declared by more than one module: probe probe2"
rm -rf .contexture/modules/probe2
mkdir -p .contexture/modules/badfield
printf 'namespace: badfield\nroot: r\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nbogus: x\n' > .contexture/modules/badfield/data
run "store-data unknown field" "$STORE_DATA" badfield
refused 1 "store-data: unknown field 'bogus' in the data file"
rm -rf .contexture/modules/badfield
mkdir -p .contexture/modules/badroot
printf 'namespace: badroot\nroot: ../out\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > .contexture/modules/badroot/data
run "store-data root escape" "$STORE_DATA" badroot
refused 1 "store-data: malformed root '../out' (a workspace-relative folder inside the workspace)"
rm -rf .contexture/modules/badroot
printf 'namespace: probe\nroot: probe-data\nsuffix: .txt\nkey: <a>/<b>\nchanges: maybe\n' > .contexture/modules/probe/data
run "store-data bad changes" "$STORE_DATA" probe
refused 1 "store-data: malformed changes flag 'maybe' (true or false)"
printf 'namespace: probe\nroot: probe-data\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > .contexture/modules/probe/data
DRIVER=$($RESOLVER resolve 2> "$E"); RC=$?
a_rc "$RC" "0" "store: the resolver resolves the posix driver"
a_match "$DRIVER" "/drivers/posix/driver$" "store: the resolved driver is the posix driver"
$RESOLVER require store >/dev/null 2>&1; a_rc "$?" "0" "store: require store rc0"
$RESOLVER has store.changelog >/dev/null 2>&1; a_rc "$?" "1" "store: has store.changelog answers 1 on posix"
err=$($RESOLVER require store.changelog 2>&1 >/dev/null); rc=$?
a_rc "$rc" "2" "store: require store.changelog refuses rc2 on posix"
a_match "$err" "lacks capability: store.changelog" "store: the missing capability is named"
run "store.list empty" "$DRIVER" store.list probe
a_rc "$RC" "0" "store: list of an empty namespace rc0"
a_eq "$(cat "$O")" '{"namespace":"probe","keys":[]}' "store: the empty list answer"
printf 'one\n' > "$SB/pay-one"
printf 'two\n' > "$SB/pay-two"
printf 'three\n' > "$SB/pay-three"
run "store.put x/one" "$DRIVER" store.put probe x/one < "$SB/pay-one"
a_rc "$RC" "0" "store: put x/one rc0"
a_eq "$(cat "$O")" '{"namespace":"probe","key":"x/one","op":"write"}' "store: the put answer"
run "store.put x/two" "$DRIVER" store.put probe x/two < "$SB/pay-two"
a_rc "$RC" "0" "store: put x/two rc0"
run "store.put y/three" "$DRIVER" store.put probe y/three < "$SB/pay-three"
a_rc "$RC" "0" "store: put y/three rc0"
run "store.list" "$DRIVER" store.list probe
a_rc "$RC" "0" "store: list rc0"
a_eq "$(cat "$O")" '{"namespace":"probe","keys":["x/one","x/two","y/three"]}' "store: list is bytewise"
run "store.get x/one" "$DRIVER" store.get probe x/one
a_rc "$RC" "0" "store: get rc0"
a_eq "$(cat "$O")" "one" "store: get returns the raw bytes"
run "store.delete x/two" "$DRIVER" store.delete probe x/two
a_rc "$RC" "0" "store: delete rc0"
a_eq "$(cat "$O")" '{"namespace":"probe","key":"x/two","op":"remove"}' "store: the delete answer"
run "store.get absent" "$DRIVER" store.get probe x/absent
refused 1 "store.get: error: key 'x/absent' not found in namespace 'probe' (ERR_ENTITY_NOT_FOUND)"
run "store.delete absent" "$DRIVER" store.delete probe x/absent
refused 1 "store.delete: error: key 'x/absent' not found in namespace 'probe' (ERR_ENTITY_NOT_FOUND)"
printf 'ONE\n' > "$SB/pay-ONE"
run "store.put case twin" "$DRIVER" store.put probe x/ONE < "$SB/pay-ONE"
refused 1 "store.put: error: key 'x/ONE' folds onto 'x/one' under ASCII case; keys differing only by case never coexist in namespace 'probe' (ERR_ENTITY_EXISTS)"
run "store.get exact key" "$DRIVER" store.get probe x/one
a_rc "$RC" "0" "store: the exact key survives the twin refusal"
a_eq "$(cat "$O")" "one" "store: the stored bytes survive the twin refusal"
run "store.put malformed key" "$DRIVER" store.put probe x/.. < "$SB/pay-one"
refused 1 "store.put: error: malformed key 'x/..' (ERR_INVALID_ARGUMENT)"
run "store.put off pattern" "$DRIVER" store.put probe x < "$SB/pay-one"
refused 1 "store.put: error: key 'x' does not match the namespace pattern '<a>/<b>' (ERR_INVALID_ARGUMENT)"
run "store.put blank key" "$DRIVER" store.put probe 'x/a b' < "$SB/pay-one"
refused 1 "store.put: error: malformed key 'x/a b' (ERR_INVALID_ARGUMENT)"
run "store.list unknown namespace" "$DRIVER" store.list nosuch
refused 1 "store.list: error: namespace 'nosuch' is declared by no module data file (ERR_ENTITY_NOT_FOUND)"
run "store.changes on posix" "$DRIVER" store.changes probe
refused 1 "store.changes: error: the posix store keeps no change log; namespace 'probe' reports its delta through its module (changes: false) (ERR_CAPABILITY_UNSUPPORTED)"
left=$(find probe-data -type f -name '*.txt.??????' 2>/dev/null | wc -l | tr -d ' ')
a_eq "$left" "0" "store: no put temp remains under the root"
left=$(find .contexture/tmp/locks -path '*store-probe*' 2>/dev/null | wc -l | tr -d ' ')
a_eq "$left" "0" "store: no per-key lock remains after the calls"

# ==============================================================================
# B5: the no-base-to-docs census
# ==============================================================================
printf '\n== B5: the no-base-to-docs census ==\n'
census_hits() {
  find "$1" -type f -exec grep -lE 'modules/docs|docs-edit\.awk|docs-model\.awk' {} + 2>/dev/null | wc -l | tr -d ' '
}
hits=$(census_hits "$SB/.contexture")
a_eq "$hits" "0" "census: base carries no docs module or docs parser reference"
plantdir=$(mktemp -d "$SB/census.XXXXXX")
cp -R "$SB/.contexture" "$plantdir/base"
printf 'modules/docs\n' > "$plantdir/base/plant"
phits=$(census_hits "$plantdir/base")
a_eq "$phits" "1" "census null check: a planted base-to-docs reference reads red"
rm -rf "$plantdir"

# ==============================================================================
# B6: the posix core suites (no plugin)
# ==============================================================================
if [ "$SKIP_CORE" -eq 0 ]; then
printf '\n== B6: the posix core suites ==\n'
# the seven suites were launched before B1; wait for the poll loop, then print in order
if [ -n "$NESTED_PID" ]; then wait "$NESTED_PID"; fi
collect_core() { # <index> <label>
  _cc_idx=$1; _cc_label=$2
  if [ -f "$NESTED/$_cc_idx.rc" ]; then
    _cc_rc=$(cat "$NESTED/$_cc_idx.rc")
  else
    _cc_rc=2
  fi
  if [ "$_cc_rc" -eq 0 ]; then
    ok "suite: $_cc_label"
  else
    bad "suite: $_cc_label (rc $_cc_rc)"
    printf '%s\n' "--- tail of $_cc_label ---"
    [ -f "$NESTED/$_cc_idx.out" ] && tail -n 25 "$NESTED/$_cc_idx.out"
    printf '%s\n' "--- end of $_cc_label ---"
  fi
}
collect_core 1 "filter-tests.sh"
collect_core 2 "ctx-tests.sh"
collect_core 3 "session-tests.sh (posix)"
collect_core 4 "hook-tests.sh"
collect_core 5 "record-audit-tests.sh"
collect_core 6 "storage-compliance.sh (base posix driver)"
collect_core 7 "store-compliance.sh (--data-file)"
fi

printf '\n== summary ==\n'
printf 'base-only-tests: pass=%d fail=%d\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
