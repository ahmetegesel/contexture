#!/bin/sh
# storage-compliance.sh: the storage contract compliance suite (contract 2).
#
# The text every backend passes (posix, fts5, the storage service): docs/the-engine.md,
# The storage contract. The suite reaches a backend only through the driver executable
# (argv identifiers, the escaped key=value payload on stdin with indexed list keys, one
# compact JSON answer in the contract key order, one stderr line per refusal in the
# fixed "<function>: error: <message> (<CODE>)" form). A fixture a backend can hold is
# built through the functions themselves, the same call sequence on every backend, and its
# read answers (board, load, get, list, closure, search) are what every backend is held
# to; no function moves a record between backends (knowledge#MIGRATION_IS_AGENT_JUDGMENT).
# The legacy shapes only a hand-written posix file can hold (tests/fixtures/compliance/units,
# tests/fixtures/compliance/legacy.notes) are planted as files and run on posix alone: TC57,
# TC60, TC64, TC69, TC77, TC78; those cases, and the posix journal bytes of TC61, are the
# only places the suite touches a store directly. Every case asserts the exact data
# returned (a key and its JSON value, a whole answer, a stderr line, the bytes of a
# document), never an exit code alone; the census (--census) lists any case that would.
#
# Suites and cases (72 on posix, 66 on every other backend, whose store holds no legacy
# text; a driver without corpus.store runs 8 corpus cases fewer):
#    0 the fresh store: TC74
#    1 session lifecycle: TC01 to TC04
#    2 tasks: TC05 to TC09
#    3 journal entries: TC10 to TC12
#    4 findings: TC13 to TC15
#    5 lanes: TC16, TC17
#    6 search: TC20
#    7 atomicity and concurrency: TC21, TC22
#    8 refusals and tiers: TC23 to TC25
#    9 journal integrity: TC26, TC27
#   10 the store and the transport: TC28, TC31 to TC33
#   11 uniform answers: TC34, TC35, TC37 to TC39
#   12 the corpus store (unchanged from v0.54.0): TC40 to TC46, TC50, TC51 (TC40 alone
#      without corpus.store)
#   13 the resolver: TC47 to TC49
#   14 record rules: TC52 to TC59
#   15 the data model: TC60 (posix), TC61, TC76
#   16 the audit: TC63, TC64 (posix), TC77 (posix)
#   17 units and references: TC65 to TC68
#   18 the contract surface: TC69 (posix), TC70 to TC73, TC75, TC78 (posix)
# Retired with contract 1: TC18 (lane.close), TC19 and TC36 (resolve.ref: resolve is
# base's, proven by the session suite), TC29 and TC30 (the artifact methods). Retired with
# unit.export, unit.import, and the dump: TC62 (the export and import round trip).
#
# The TC76 goldens (tests/fixtures/compliance/golden/verb-u) are the read answers of one
# call sequence; COMPLIANCE_WRITE_GOLDENS=<dir> writes the answers of the backend under
# test into <dir> instead of comparing them (how they were made: from posix, then proven
# equal on fts5, then read by hand); a changed golden is a contract change.
#
# Usage:
#   tests/storage-compliance.sh [--driver=<name>] [--driver-exec=<path>] [--keep] [--verbose]
#   tests/storage-compliance.sh --census[=<file>]
#   --driver-exec names the exact driver executable (a plugin suite passes its own
#   copy), skipping resolution; --driver alone resolves through the workspace drawer.
#   --census reads this suite (or <file>) and lists every case whose assertions check an
#   exit code alone; it exits 1 when it lists one.
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
JF="$SCRIPT_DIR/lib/jflat.awk"
FX="$SCRIPT_DIR/fixtures/compliance"

DRIVER_NAME="posix"
DRIVER_EXEC_ARG=""
KEEP_SANDBOX=0
VERBOSE=0
CENSUS=""

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
    --census)
      CENSUS="$SCRIPT_DIR/storage-compliance.sh"
      ;;
    --census=*)
      CENSUS="${arg#--census=}"
      ;;
    --help|-h)
      printf 'usage: tests/storage-compliance.sh [--driver=<name>] [--driver-exec=<path>] [--keep] [--verbose]\n'
      printf '       tests/storage-compliance.sh --census[=<file>]\n'
      printf '  --driver=<name>   storage driver to test (default: posix)\n'
      printf '  --driver-exec=<path>  the exact driver executable to test, no resolution\n'
      printf '  --keep            preserve test sandbox directory on completion\n'
      printf '  --verbose, -v     print every driver call with its exit code\n'
      printf '  --census[=<file>] list the cases whose assertions check an exit code alone\n'
      printf '  --help, -h        display this help summary\n'
      exit 0
      ;;
    *)
      printf 'storage-compliance: unknown argument: %s\n' "$arg" >&2
      exit 1
      ;;
  esac
done

# The census: a case is the text from its "# TCnn" comment (or the previous case's end)
# to its tc "TCnn: ..." report; it checks data when it calls a want or refused helper
# other than wantrc, or feeds a comparison into tc_fail or miss directly on a line that
# never names an exit code (a line naming $rc or $RC never counts, so the census can
# only over-report). A case with no data check is listed.
if [ -n "$CENSUS" ]; then
  [ -r "$CENSUS" ] || { printf 'storage-compliance: cannot read %s\n' "$CENSUS" >&2; exit 2; }
  awk '
    /^[ \t]*# TC[0-9]+/ { data = 0; next }
    /^[ \t]*#/ { next }
    {
      s = $0
      while (match(s, /(^|[^A-Za-z_])(want[a-z_]*|refused[a-z_]*)[ (]/)) {
        w = substr(s, RSTART, RLENGTH)
        gsub(/[^A-Za-z_]/, "", w)
        if (w != "wantrc") data++
        s = substr(s, RSTART + RLENGTH)
      }
      if ($0 ~ /(\|\||then) *(tc_fail=|miss )/ && $0 !~ /\$rc|\$RC/) data++
    }
    /(^|[ \t;])tc "TC[0-9]+/ {
      name = $0
      sub(/^.*tc "/, "", name)
      sub(/:.*$/, "", name)
      cases++
      if (data == 0) { printf "rc-only: %s\n", name; rconly++ }
      data = 0
    }
    END { printf "census: %d cases, %d checking an exit code alone\n", cases, rconly; exit (rconly > 0) }
  ' "$CENSUS"
  exit $?
fi

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

alias_driver=""
if [ -z "$DRIVER_EXEC" ] || [ ! -x "$DRIVER_EXEC" ]; then
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
if [ ! -r "$JF" ] || [ ! -d "$FX" ]; then
  printf 'storage-compliance: the suite needs %s and %s\n' "$JF" "$FX" >&2
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

# Capability handshake validation before executing suites
cap_out=$("$DRIVER_EXEC" capability 2>&1 < /dev/null)
cap_rc=$?
if [ "$cap_rc" -ne 0 ]; then
  printf 'storage-compliance: driver capability handshake failed with exit code %d (ERR_DRIVER_PROTOCOL)\n' "$cap_rc" >&2
  exit 2
fi

# tc accumulates every missed fact of one case, so a FAIL names all of them
tc_fail=""
miss() { tc_fail="$tc_fail; $1"; }
tc() {
  if [ -z "$tc_fail" ]; then ok "$1"; else bad "$1 ($tc_fail)"; fi
  tc_fail=""
}
# the corpus suite's helpers (suite 12 is unchanged from v0.54.0)
want() { printf '%s' "$1" | grep -qF -- "$2" || tc_fail="$tc_fail; missing $2"; }
wantnot() { if printf '%s' "$1" | grep -qF -- "$2"; then tc_fail="$tc_fail; unwanted $2"; fi; }
wantrc() { [ "$1" -eq "$2" ] || tc_fail="$tc_fail; rc $1 want $2"; }
drv() { "$DRIVER_EXEC" "$@" < /dev/null; }

# ==============================================================================
# The wire (docs/the-engine.md, The storage contract)
# ==============================================================================
# kv appends one payload line key=value (backslash, newline, tab, carriage return
# escaped); kl appends a list as <key>.count=N then <key>.1 to <key>.N; kcl appends one
# closer record as closers.<n>.<field>; doc makes a document the whole stdin. call runs
# one function with the pending payload on stdin, then flattens its answer (jflat.awk),
# so jv <path> reads one JSON value exactly as the driver wrote it.
P="$SANDBOX/.payload"
O="$SANDBOX/.stdout"
E="$SANDBOX/.stderr"
F="$SANDBOX/.flat"
: > "$P"
FN=""
RC=0
esc() {
  printf '%sx' "$1" | awk '
    function bs_double(s,    n, p, i, o) { n = split(s, p, /\\/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "\\" p[i]; return o }
    BEGIN { ORS = "" }
    { $0 = bs_double($0); gsub(/\t/, "\\t"); gsub(/\r/, "\\r"); out = out (NR > 1 ? "\\n" : "") $0 }
    END { sub(/x$/, "", out); print out }'
}
kv() { printf '%s=%s\n' "$1" "$(esc "$2")" >> "$P"; }
kl() {
  _kl_k=$1
  shift
  printf '%s.count=%s\n' "$_kl_k" "$#" >> "$P"
  _kl_i=0
  for _kl_v in "$@"; do
    _kl_i=$((_kl_i + 1))
    kv "$_kl_k.$_kl_i" "$_kl_v"
  done
}
kcl() {
  _kc_n=$1
  kv "closers.$_kc_n.kind" "$2"
  _kc_v=$3
  _kc_r=$4
  shift 4
  kl "closers.$_kc_n.targets" "$@"
  kv "closers.$_kc_n.verdict" "$_kc_v"
  kv "closers.$_kc_n.reason" "$_kc_r"
}
doc() { cat "$1" > "$P"; }
call() {
  FN=$1
  "$DRIVER_EXEC" "$@" < "$P" > "$O" 2> "$E"
  RC=$?
  : > "$P"
  awk -f "$JF" "$O" > "$F" 2>/dev/null
  if [ "$VERBOSE" -eq 1 ]; then printf '  call %s: rc %s\n' "$*" "$RC"; fi
  return 0
}
jv() { awk -v p="$1" 'index($0, p "=") == 1 { print substr($0, length(p) + 2); exit }' "$F"; }
# vals <array path> [<field>]: the values of <path>.<n> (or <path>.<n>.<field>) in order
vals() {
  awk -v p="$1." -v f="${2-}" '
    index($0, p) == 1 {
      r = substr($0, length(p) + 1)
      k = r; sub(/=.*$/, "", k)
      v = substr(r, length(k) + 2)
      if (f == "" && k ~ /^[0-9]+$/ && v !~ /^[[{]/) printf "%s%s", (n++ ? " " : ""), v
      if (f != "" && k ~ /^[0-9]+\./ && substr(k, index(k, ".") + 1) == f) printf "%s%s", (n++ ? " " : ""), v
    }
    END { printf "\n" }' "$F"
}
# subobj <path>: the flattened lines under <path>, the prefix removed
subobj() { awk -v p="$1." 'index($0, p) == 1 { print substr($0, length(p) + 1) }' "$F"; }
# firstdiff <a> <b>: the first differing position of two texts with some context
firstdiff() {
  A_TXT=$1 B_TXT=$2 awk 'BEGIN {
    a = ENVIRON["A_TXT"]; b = ENVIRON["B_TXT"]
    n = (length(a) < length(b)) ? length(a) : length(b)
    for (i = 1; i <= n; i++) if (substr(a, i, 1) != substr(b, i, 1)) break
    s = (i > 60) ? i - 60 : 1
    printf "at byte %d: got [...%s...] want [...%s...]", i, substr(a, s, 140), substr(b, s, 140)
  }'
}
# answer: rc 0, nothing on stderr, exactly one line holding one compact JSON object
answer() {
  [ "$RC" -eq 0 ] || miss "$FN rc $RC want 0 [$(head -c 300 "$E")]"
  if [ -s "$E" ]; then miss "$FN wrote stderr [$(head -c 200 "$E")]"; fi
  _an=$(wc -l < "$O" | tr -d ' ')
  [ "$_an" = 1 ] || miss "$FN answered $_an lines, want one JSON line"
  if grep -q '^!' "$F"; then miss "$FN answer is not compact JSON [$(grep '^!' "$F" | head -1)]"; fi
  case "$(jv @)" in "{"*) ;; *) miss "$FN answer is not a JSON object" ;; esac
}
wantv() { _wv=$(jv "$1"); [ "$_wv" = "$2" ] || miss "$FN $1=[$_wv] want [$2]"; }
wantkeys() { wantv "$1" "{$2}"; }
wantvals() { _wv=$(vals "$1" "${2-}"); [ "$_wv" = "$3" ] || miss "$FN $1.*.${2-} [$_wv] want [$3]"; }
wantout() { _wv=$(cat "$O"); [ "$_wv" = "$1" ] || miss "$FN answer $(firstdiff "$_wv" "$1")"; }
wantfile() { cmp -s "$1" "$O" || miss "$FN answer differs from $(basename "$1") $(firstdiff "$(cat "$O")" "$(cat "$1")")"; }
wantline() { grep -qxF -- "$1" "$O" || miss "$FN answer lacks the line [$1]"; }
wantno() { if grep -qF -- "$1" "$O"; then miss "$FN answer carries [$1]"; fi; }
# refused <rc> <CODE> <message>: nothing on stdout, exactly the one fixed stderr line
refused() {
  [ "$RC" -eq "$1" ] || miss "$FN rc $RC want $1"
  if [ -s "$O" ]; then miss "$FN printed stdout on a refusal [$(head -c 200 "$O")]"; fi
  _rn=$(wc -l < "$E" | tr -d ' ')
  [ "$_rn" = 1 ] || miss "$FN wrote $_rn stderr lines, want one"
  _rg=$(cat "$E")
  _rw="$FN: error: $3 ($2)"
  [ "$_rg" = "$_rw" ] || miss "$FN stderr [$_rg] want [$_rw]"
}
# refused_like <rc> <CODE> [<message prefix>]: the same for a message the contract
# leaves free (ERR_INVALID_ARGUMENT details, ERR_STORAGE_CORRUPT)
refused_like() {
  [ "$RC" -eq "$1" ] || miss "$FN rc $RC want $1"
  if [ -s "$O" ]; then miss "$FN printed stdout on a refusal [$(head -c 200 "$O")]"; fi
  _rn=$(wc -l < "$E" | tr -d ' ')
  [ "$_rn" = 1 ] || miss "$FN wrote $_rn stderr lines, want one"
  _rg=$(cat "$E")
  case "$_rg" in
    "$FN: error: ${3-}"*" ($2)") ;;
    *) miss "$FN stderr [$_rg] want [$FN: error: ${3-}... ($2)]" ;;
  esac
}
# plant <unit>: a legacy fixture's markdown files planted in the posix store of the
# sandbox (the posix-alone cases only: no other backend holds legacy text)
plant() { rm -rf "$SANDBOX/.contexture/sessions/$1"; mkdir -p "$SANDBOX/.contexture/sessions"; cp -R "$FX/units/$1" "$SANDBOX/.contexture/sessions/$1"; }
# reads <unit> <file>: the unit's read answers in one file (load, board, the task, entry,
# and finding lists), the backend-neutral picture of a unit a refused write must leave
reads() {
  _rd_u=$1; _rd_f=$2
  : > "$_rd_f"
  for _rd in "session.load $_rd_u" "session.board $_rd_u" "task.list $_rd_u all" "entry.list $_rd_u" "finding.list $_rd_u all"; do
    set -- $_rd
    call "$@"
    { printf '%s: rc %s\n' "$_rd" "$RC"; cat "$O"; } >> "$_rd_f"
  done
}
# mk <unit> [<objective>]: a fresh unit
mk() { kv objective "${2:-compliance unit $1}"; kv attention "compliance fixture"; call session.create "$1"; }
DATE=2026-09-27
# rec <unit> <epoch> <what> [<thread>]: entry.record with any payload lines already added
rec() { kv what "$3"; kv thread "${4:-none}"; kv date "$DATE"; kv epoch "$2"; call entry.record "$1"; }
# the JSON of a simple entry, a task, a task item (values are JSON tokens where noted)
# entry_json <slug> <occ> <seq> <anchor tok> <what> <group tok> <thread tok> <refs> <closers> <next tok> [<closed> <closed_by tok> <close_reason tok>]
entry_json() {
  _ej=""
  if [ $# -ge 13 ]; then _ej=",\"closed\":${11},\"closed_by\":${12},\"close_reason\":${13}"; fi
  printf '{"kind":"entry","slug":"%s","occurrence":%s,"seq":%s,"anchor":%s,"what":"%s","group":%s,"rhythm":null,"knowledge":false,"thread":%s,"legacy_status":null,"refs":%s,"closers":%s,"extra_fields":[],"head_text":null,"extra_lines":[]%s,"next":%s}' "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9" "$_ej" "${10}"
}
# receipt_json <slug> <seq> <what>: a task receipt entry, the last item of its journal
receipt_json() { entry_json "$1" 1 "$2" '"A1"' "$3" null '"none"' '[]' '[]' null; }
# posix_line <n>: the line number posix answers for an audit finding; null elsewhere
IS_POSIX=0
if printf '%s' "$cap_out" | grep -q '"driver": *"posix"'; then IS_POSIX=1; fi
posix_line() { if [ "$IS_POSIX" -eq 1 ]; then printf '%s' "$1"; else printf 'null'; fi; }
# the declared search modes, from the descriptor
MODES=$(printf '%s\n' "$cap_out" | awk -f "$JF" | awk 'index($0, "search_modes.") == 1 { v = $0; sub(/^[^=]*=/, "", v); gsub(/"/, "", v); printf "%s%s", (n++ ? ", " : ""), v }')
# the 38 record functions of contract 2 (unit.export and unit.import left it)
FUNCS38="capability storage.health session.create session.list session.load session.refload session.board session.audit session.stamp session.next session.refs session.close session.reopen session.units session.refs_to task.add task.update task.start task.complete task.reopen task.drop task.list task.get entry.record entry.get entry.list entry.closure finding.add finding.update finding.supersede finding.drop finding.get finding.list lane.create lane.record lane.write_report lane.get search.query"
CORPUS6="corpus.list corpus.read corpus.write corpus.remove corpus.mount corpus.changes"

# ==============================================================================
# Suite 0: The Fresh Store (1 test case)
# ==============================================================================
printf '\n== Suite 0: The Fresh Store ==\n'

# TC74: before any write the store is absent: session.list answers store absent and no
# unit, storage.health store absent with no active unit, naming the descriptor's driver
call session.list
answer; wantout '{"store":"absent","units":[]}'
call storage.health
answer; wantkeys @ "driver,health,detail,store,active_units"; wantv store '"absent"'; wantv active_units 0
case "$(jv health)" in '"ok"'|'"degraded"'|'"locked"'|'"error"') ;; *) miss "storage.health health [$(jv health)]" ;; esac
_drv_name=$(printf '%s\n' "$cap_out" | awk -f "$JF" | awk 'index($0, "driver=") == 1 { print substr($0, 8); exit }')
wantv driver "$_drv_name"
tc "TC74: a fresh store: session.list and storage.health answer store absent, no unit"

# ==============================================================================
# Suite 1: Session Lifecycle (4 test cases)
# ==============================================================================
printf '\n== Suite 1: Session Lifecycle ==\n'
UNIT="compliance-u1"
U1STATE='{"unit":"compliance-u1","status":"ACTIVE","current_anchor":"A1","next_action":"backlog the first task","objective":"Compliance test session","repos":["alpha","beta"],"ref_sessions":null,"extra_fields":[],"extra_lines":[]}'

# TC01: session.create answers the new unit's canonical state at A1
kv objective "Compliance test session"; kl repos alpha beta; kv attention "compliance fixture"
call session.create "$UNIT"
answer; wantout "{\"unit\":\"compliance-u1\",\"state\":$U1STATE}"
tc "TC01: session.create answers the unit's state at A1 with the default next_action"

# TC02: a second session.create refuses rc1 ERR_ENTITY_EXISTS and leaves the state whole
kv objective "Duplicate session"; kv attention "again"
call session.create "$UNIT"
refused 1 ERR_ENTITY_EXISTS "unit 'compliance-u1' already exists"
call session.load "$UNIT"
answer; wantv state.objective '"Compliance test session"'
tc "TC02: a repeated session.create refuses rc1 ERR_ENTITY_EXISTS; the state untouched"

# TC03: session.load and session.board answer the empty unit; the journal holds the A1 anchor
call session.load "$UNIT"
answer; wantkeys @ "unit,state,backlog,knowledge,board,refs"
wantout "{\"unit\":\"compliance-u1\",\"state\":$U1STATE,\"backlog\":{\"preamble\":\"\",\"tasks\":[]},\"knowledge\":{\"preamble\":\"\",\"findings\":[]},\"board\":{\"unit\":\"compliance-u1\",\"backlog_present\":true,\"live\":[],\"open_tasks\":[],\"open_threads\":[]},\"refs\":[]}"
call session.board "$UNIT"
answer; wantout '{"unit":"compliance-u1","backlog_present":true,"live":[],"open_tasks":[],"open_threads":[]}'
kv query "continues A0"
call search.query "$UNIT" --mode=exact
answer; wantout '{"unit":"compliance-u1","query":"continues A0","mode":"exact","total_matches":1,"results":[{"entity_type":"session","entity_id":"compliance-u1","section":"journal","snippet":"@anchor A1 (\"continues A0\", attention: compliance fixture)","score":0}]}'
call entry.list "$UNIT"
answer; wantout '{"unit":"compliance-u1","entries":[]}'
tc "TC03: session.load and session.board answer the empty unit; its journal holds the A1 anchor alone"

# TC04: session.stamp advances the anchor and answers its receipt; session.close closes
kv attention "Stamp test receipt"
call session.stamp "$UNIT"
answer; wantout '{"unit":"compliance-u1","previous_anchor":"A1","current_anchor":"A2","receipt":{"kind":"anchor","seq":2,"anchor":"A2","continues":"A1","attention":"Stamp test receipt","head_text":null,"extra_lines":[],"next":null}}'
call session.load "$UNIT"
answer; wantv state.current_anchor '"A2"'
call session.close "$UNIT"
answer; wantout '{"unit":"compliance-u1","status":"CLOSED","open_tasks":[],"audit":{"unit":"compliance-u1","clean":true,"findings":[],"open_threads":[]}}'
call session.load "$UNIT"
answer; wantv state.status '"CLOSED"'
tc "TC04: session.stamp answers A1 to A2 with its receipt; session.close marks the unit CLOSED"

# ==============================================================================
# Suite 2: Task Operations (5 test cases)
# ==============================================================================
printf '\n== Suite 2: Task Operations ==\n'
TUNIT="compliance-tasks"
mk "$TUNIT" "Task verification session"
answer

# TC05: task.add answers the task in TODO with its block scalars; task.get the same; a
# repeated slug refuses rc1 ERR_ENTITY_EXISTS with the task unchanged
kv objective "Sample task objective"; kv desc "$(printf 'Sample description\nwith a second line')"; kv criteria "Acceptance criteria 1"; kv details "Implementation detail 1"
call task.add "$TUNIT" task-sample
T5='{"slug":"task-sample","ordinal":1,"status":"TODO","objective":"Sample task objective","refs":[],"description":"Sample description\nwith a second line","criteria":"Acceptance criteria 1","details":"Implementation detail 1","extra_fields":[],"head_text":null,"extra_lines":[],"next":null}'
answer; wantout "{\"unit\":\"compliance-tasks\",\"task\":$T5}"
call task.get "$TUNIT" task-sample
answer; wantout "{\"unit\":\"compliance-tasks\",\"task\":$T5}"
kv objective "Again"
call task.add "$TUNIT" task-sample
refused 1 ERR_ENTITY_EXISTS "task 'task-sample' already exists in unit 'compliance-tasks'"
call task.get "$TUNIT" task-sample
answer; wantout "{\"unit\":\"compliance-tasks\",\"task\":$T5}"
tc "TC05: task.add answers the TODO task with its block scalars; a repeated slug refuses rc1"

# TC06: task.update replaces the fields it is given and keeps the others
kv objective "Updated task objective"; kv desc "Updated description"
call task.update "$TUNIT" task-sample
T6='{"slug":"task-sample","ordinal":1,"status":"TODO","objective":"Updated task objective","refs":[],"description":"Updated description","criteria":"Acceptance criteria 1","details":"Implementation detail 1","extra_fields":[],"head_text":null,"extra_lines":[],"next":null}'
answer; wantout "{\"unit\":\"compliance-tasks\",\"task\":$T6}"
call task.get "$TUNIT" task-sample
answer; wantout "{\"unit\":\"compliance-tasks\",\"task\":$T6}"
tc "TC06: task.update replaces the given fields and keeps the rest"

# TC07: task.start moves TODO to IN_PROGRESS and sets the default pointer
call task.start "$TUNIT" task-sample
answer; wantout '{"unit":"compliance-tasks","task":{"slug":"task-sample","status":"IN_PROGRESS","objective":"Updated task objective"},"next_action":"work active task: task-sample"}'
call task.get "$TUNIT" task-sample
answer; wantv task.status '"IN_PROGRESS"'
call session.load "$TUNIT"
answer; wantv state.next_action '"work active task: task-sample"'
tc "TC07: task.start answers IN_PROGRESS and next_action names the task"

# TC08: task.complete answers DONE and its receipt entry, which the journal lists
kv evidence "Verified via automated test suite"; kv date "$DATE"
call task.complete "$TUNIT" task-sample
R8=$(receipt_json 2026-09-27-task-sample-completed 2 "backlog/task-sample: DONE (Verified via automated test suite)")
answer; wantout "{\"unit\":\"compliance-tasks\",\"task\":{\"slug\":\"task-sample\",\"status\":\"DONE\",\"objective\":\"Updated task objective\"},\"receipt\":$R8}"
call task.get "$TUNIT" task-sample
answer; wantv task.status '"DONE"'
call entry.list "$TUNIT"
answer; wantout '{"unit":"compliance-tasks","entries":[{"slug":"2026-09-27-task-sample-completed","occurrence":1,"anchor":"A1","what":"backlog/task-sample: DONE (Verified via automated test suite)","group":null}]}'
tc "TC08: task.complete answers DONE with its receipt entry in the journal"

# TC09: task.reopen, task.list by status, task.drop with its receipt, a dropped slug
# gone from every read and addable again
kv objective "Keeper objective"
call task.add "$TUNIT" task-keeper
answer
call task.reopen "$TUNIT" task-sample
answer; wantout '{"unit":"compliance-tasks","task":{"slug":"task-sample","status":"TODO","objective":"Updated task objective"}}'
call task.list "$TUNIT" TODO
answer; wantout '{"unit":"compliance-tasks","tasks":[{"slug":"task-sample","status":"TODO","objective":"Updated task objective"},{"slug":"task-keeper","status":"TODO","objective":"Keeper objective"}]}'
kv reason "Deprecating task"; kv date "$DATE"
call task.drop "$TUNIT" task-sample
R9=$(receipt_json 2026-09-27-task-sample-dropped 3 "backlog/task-sample: DROPPED (Deprecating task)")
answer; wantout "{\"unit\":\"compliance-tasks\",\"slug\":\"task-sample\",\"receipt\":$R9}"
call task.list "$TUNIT" all
answer; wantout '{"unit":"compliance-tasks","tasks":[{"slug":"task-keeper","status":"TODO","objective":"Keeper objective"}]}'
call task.get "$TUNIT" task-sample
refused 1 ERR_ENTITY_NOT_FOUND "task 'task-sample' not found in unit 'compliance-tasks'"
kv objective "Re-declared objective"
call task.add "$TUNIT" task-sample
answer; wantv task.objective '"Re-declared objective"'; wantv task.ordinal 2; wantv task.status '"TODO"'
tc "TC09: task.reopen, task.list, task.drop with its receipt; a dropped slug is gone and addable again"

# ==============================================================================
# Suite 3: Journal Entries (3 test cases)
# ==============================================================================
printf '\n== Suite 3: Journal Entries ==\n'
ALPHA=2026-09-27-event-1790000010
BETA=2026-09-27-event-1790000011

# TC10: entry.record composes the slug from date and epoch and takes the current anchor
kv group topic-group
rec "$TUNIT" 1790000010 "Journal event description"
answer; wantout "{\"unit\":\"compliance-tasks\",\"entry\":$(entry_json "$ALPHA" 1 4 '"A1"' "Journal event description" '"topic-group"' '"none"' '[]' '[]' null)}"
tc "TC10: entry.record answers the entry with the composed slug and the current anchor"

# TC11: entry.get answers the entry with its closure; an absent slug refuses rc1
call entry.get "$TUNIT" "$ALPHA"
answer; wantout "{\"unit\":\"compliance-tasks\",\"entry\":$(entry_json "$ALPHA" 1 4 '"A1"' "Journal event description" '"topic-group"' '"none"' '[]' '[]' null false null null)}"
call entry.get "$TUNIT" 2026-09-25-event-missing
refused 1 ERR_ENTITY_NOT_FOUND "entry '2026-09-25-event-missing' not found in unit 'compliance-tasks'"
tc "TC11: entry.get answers the entry open; an absent slug refuses rc1 ERR_ENTITY_NOT_FOUND"

# TC12: a closer closes its target: entry.get says so, the board leaves it out, the
# journal list keeps both
kv group topic-group; kv closers.count 1; kcl 1 CLOSES done "Closer event" "$ALPHA"
rec "$TUNIT" 1790000011 "Closer event"
# the closer list is assigned first: bash 3.2 (the macOS sh) brace-expands a double-quoted
# "[{a,b}]" argument inside a command substitution that itself sits in double quotes
C12="[{\"kind\":\"CLOSES\",\"targets\":[\"$ALPHA\"],\"verdict\":\"done\",\"reason\":\"Closer event\",\"extra_text\":null}]"
answer; wantout "{\"unit\":\"compliance-tasks\",\"entry\":$(entry_json "$BETA" 1 5 '"A1"' "Closer event" '"topic-group"' '"none"' '[]' "$C12" null)}"
call entry.get "$TUNIT" "$ALPHA"
answer; wantv entry.closed true; wantv entry.closed_by "\"$BETA\""; wantv entry.close_reason '"done: Closer event"'; wantv entry.next '"entry"'
call session.board "$TUNIT"
answer; wantvals live slug "\"2026-09-27-task-sample-completed\" \"2026-09-27-task-sample-dropped\" \"$BETA\""
wantv open_tasks '[2]'; wantvals open_tasks "" '"task-keeper" "task-sample"'; wantv open_threads '[0]'
call entry.list "$TUNIT"
answer; wantvals entries slug "\"2026-09-27-task-sample-completed\" \"2026-09-27-task-sample-dropped\" \"$ALPHA\" \"$BETA\""
tc "TC12: a closer closes its target on entry.get and the board; entry.list keeps both"

# ==============================================================================
# Suite 4: Knowledge Findings (3 test cases)
# ==============================================================================
printf '\n== Suite 4: Knowledge Findings ==\n'
FA='{"name":"FINDING_ALPHA","ordinal":1,"supersedes":null,"refs":["journal#2026-09-27-event-1790000010"],"summary":"Alpha architectural decision summary","extra_fields":[],"head_text":null,"extra_lines":[],"superseded_by":null,"active":true,"next":null}'

# TC13: finding.add answers the finding with its summary and refs
kv summary "Alpha architectural decision summary"; kl refs "journal#$ALPHA"
call finding.add "$TUNIT" FINDING_ALPHA
answer; wantout "{\"unit\":\"compliance-tasks\",\"finding\":$FA}"
tc "TC13: finding.add answers the finding with its summary and refs"

# TC14: finding.get answers the same finding; an absent NAME refuses rc1
call finding.get "$TUNIT" FINDING_ALPHA
answer; wantout "{\"unit\":\"compliance-tasks\",\"finding\":$FA}"
call finding.get "$TUNIT" NO_SUCH_FINDING
refused 1 ERR_ENTITY_NOT_FOUND "finding 'NO_SUCH_FINDING' not found in unit 'compliance-tasks'"
tc "TC14: finding.get answers the finding; an absent NAME refuses rc1"

# TC15: a successor carries its supersedes; finding.list all and active; the
# predecessor answers superseded_by and inactive
kv summary "Beta superseding finding"; kl refs "journal#$BETA"; kv supersedes FINDING_ALPHA
call finding.add "$TUNIT" FINDING_BETA
answer; wantout '{"unit":"compliance-tasks","finding":{"name":"FINDING_BETA","ordinal":2,"supersedes":{"name":"FINDING_ALPHA","reason":"superseded"},"refs":["journal#2026-09-27-event-1790000011"],"summary":"Beta superseding finding","extra_fields":[],"head_text":null,"extra_lines":[],"superseded_by":null,"active":true,"next":null}}'
call finding.list "$TUNIT" all
answer; wantout '{"unit":"compliance-tasks","findings":[{"name":"FINDING_ALPHA","summary":"Alpha architectural decision summary","refs":["journal#2026-09-27-event-1790000010"],"supersedes":null,"active":false},{"name":"FINDING_BETA","summary":"Beta superseding finding","refs":["journal#2026-09-27-event-1790000011"],"supersedes":"FINDING_ALPHA","active":true}]}'
call finding.list "$TUNIT" active
answer; wantout '{"unit":"compliance-tasks","findings":[{"name":"FINDING_BETA","summary":"Beta superseding finding","refs":["journal#2026-09-27-event-1790000011"],"supersedes":"FINDING_ALPHA","active":true}]}'
call finding.get "$TUNIT" FINDING_ALPHA
answer; wantv finding.superseded_by '"FINDING_BETA"'; wantv finding.active false; wantv finding.next '"finding"'
tc "TC15: finding.list filters the superseded finding; the predecessor names its successor"

# ==============================================================================
# Suite 5: Subagent Lanes (2 test cases)
# ==============================================================================
printf '\n== Suite 5: Subagent Lanes ==\n'
printf '# recipe grammar\nMISSION\n  GOAL: "Subagent goal description"\n' > "$SANDBOX/recipe.txt"
LE="{\"kind\":\"entry\",\"lane\":\"lane-worker\",\"slug\":\"2026-09-27-event-1790000020\",\"occurrence\":1,\"seq\":1,\"anchor\":null,\"what\":\"Subagent action trace WHAT\",\"group\":null,\"rhythm\":null,\"knowledge\":false,\"thread\":\"none\",\"legacy_status\":null,\"refs\":[\"journal#$ALPHA\"],\"closers\":[],\"extra_fields\":[],\"head_text\":null,\"extra_lines\":[],\"next\":null}"

# TC16: lane.create stores the recipe byte for byte and an empty journal; no report yet
doc "$SANDBOX/recipe.txt"
call lane.create "$TUNIT" lane-worker
answer; wantout '{"unit":"compliance-tasks","lane":"lane-worker"}'
call lane.get "$TUNIT" lane-worker recipe
answer; wantout '{"unit":"compliance-tasks","lane":"lane-worker","artifact":"recipe","content":"# recipe grammar\nMISSION\n  GOAL: \"Subagent goal description\"\n"}'
jv content | awk -v mode=dec -f "$JF" > "$SANDBOX/recipe.out"
cmp -s "$SANDBOX/recipe.txt" "$SANDBOX/recipe.out" || miss "the recipe did not read back byte for byte"
call lane.get "$TUNIT" lane-worker journal
answer; wantout '{"unit":"compliance-tasks","lane":"lane-worker","artifact":"journal","preamble":"","items":[]}'
call lane.get "$TUNIT" lane-worker report
answer; wantout '{"unit":"compliance-tasks","lane":"lane-worker","artifact":"report","content":null}'
tc "TC16: lane.create stores the recipe byte for byte with an empty journal and no report"

# TC17: lane.record answers the lane entry; lane.write_report answers the bytes stored;
# lane.get reads both back
kl refs "journal#$ALPHA"
kv what "Subagent action trace WHAT"; kv thread none; kv date "$DATE"; kv epoch 1790000020
call lane.record "$TUNIT" lane-worker
answer; wantout "{\"unit\":\"compliance-tasks\",\"lane\":\"lane-worker\",\"entry\":$LE}"
printf 'Subagent report findings\n' > "$SANDBOX/report.txt"
doc "$SANDBOX/report.txt"
call lane.write_report "$TUNIT" lane-worker
answer; wantout '{"unit":"compliance-tasks","lane":"lane-worker","bytes":25}'
call lane.get "$TUNIT" lane-worker journal
answer; wantout "{\"unit\":\"compliance-tasks\",\"lane\":\"lane-worker\",\"artifact\":\"journal\",\"preamble\":\"\",\"items\":[$LE]}"
call lane.get "$TUNIT" lane-worker report
answer; wantout '{"unit":"compliance-tasks","lane":"lane-worker","artifact":"report","content":"Subagent report findings\n"}'
tc "TC17: lane.record and lane.write_report land; lane.get reads the journal and the report back"

# ==============================================================================
# Suite 6: Search (1 test case)
# ==============================================================================
printf '\n== Suite 6: Search ==\n'

# TC20: search.query with no mode answers the exact mode in the shared shape
kv query architectural
call search.query "$TUNIT"
answer; wantout '{"unit":"compliance-tasks","query":"architectural","mode":"exact","total_matches":1,"results":[{"entity_type":"finding","entity_id":"FINDING_ALPHA","section":"knowledge","snippet":"Alpha architectural decision summary","score":0}]}'
tc "TC20: search.query without a mode answers exact results in the shared shape"

# ==============================================================================
# Suite 7: Atomicity and Concurrency (2 test cases)
# ==============================================================================
printf '\n== Suite 7: Atomicity and Concurrency ==\n'

# TC21: every refused write leaves the unit whole: after a closer list whose second
# target is absent, a supersede onto an existing NAME, and a repeated task, the unit's
# read answers (load, board, the task, entry, and finding lists) are byte-identical to
# before
reads "$TUNIT" "$SANDBOX/tc21-before.reads"
grep -q '"slug":"task-keeper"' "$SANDBOX/tc21-before.reads" || miss "the read picture holds no task-keeper"
kv closers.count 2; kcl 1 CLOSES done "valid" "$BETA"; kcl 2 CLOSES done "absent" 2026-01-01-absent
rec "$TUNIT" 1790000021 "two closers, the second absent"
refused 1 ERR_ENTITY_NOT_FOUND "entry '2026-01-01-absent' not found in unit 'compliance-tasks'"
kv summary "never lands"
call finding.supersede "$TUNIT" FINDING_BETA FINDING_ALPHA
refused 1 ERR_ENTITY_EXISTS "finding 'FINDING_ALPHA' already exists in unit 'compliance-tasks'"
kv objective "never lands"
call task.add "$TUNIT" task-keeper
refused 1 ERR_ENTITY_EXISTS "task 'task-keeper' already exists in unit 'compliance-tasks'"
reads "$TUNIT" "$SANDBOX/tc21-after.reads"
cmp -s "$SANDBOX/tc21-before.reads" "$SANDBOX/tc21-after.reads" || miss "the read answers changed $(firstdiff "$(cat "$SANDBOX/tc21-after.reads")" "$(cat "$SANDBOX/tc21-before.reads")")"
tc "TC21: every refused write leaves the unit's read answers byte-identical"

# TC22: concurrent writers serialize: five entry.record calls at once with one date and
# epoch land five entries under the slug suffixed -1 while the journal holds it (R6: X, X-1, X-1-1, and on), each exactly once
X22=2026-09-27-event-1790000030
_t22_i=1
while [ "$_t22_i" -le 5 ]; do
  printf 'what=concurrent writer\nthread=none\ndate=%s\nepoch=1790000030\n' "$DATE" > "$SANDBOX/tc22-$_t22_i.in"
  ( "$DRIVER_EXEC" entry.record "$TUNIT" < "$SANDBOX/tc22-$_t22_i.in" > "$SANDBOX/tc22-$_t22_i.out" 2>&1; echo "$?" > "$SANDBOX/tc22-$_t22_i.rc" ) &
  _t22_i=$((_t22_i + 1))
done
wait
_t22_got=""
_t22_i=1
while [ "$_t22_i" -le 5 ]; do
  [ "$(cat "$SANDBOX/tc22-$_t22_i.rc")" = 0 ] || miss "writer $_t22_i rc $(cat "$SANDBOX/tc22-$_t22_i.rc") [$(head -c 200 "$SANDBOX/tc22-$_t22_i.out")]"
  _t22_got="$_t22_got $(awk -f "$JF" "$SANDBOX/tc22-$_t22_i.out" | awk 'index($0, "entry.slug=") == 1 { print substr($0, 12) }')"
  _t22_i=$((_t22_i + 1))
done
_t22_sorted=$(printf '%s\n' $_t22_got | LC_ALL=C sort | tr '\n' ' ')
[ "$_t22_sorted" = "\"$X22\" \"$X22-1\" \"$X22-1-1\" \"$X22-1-1-1\" \"$X22-1-1-1-1\" " ] || miss "concurrent slugs [$_t22_sorted]"
call entry.list "$TUNIT"
answer
_t22_list=$(vals entries slug | tr ' ' '\n' | grep -c "\"$X22")
[ "$_t22_list" = 5 ] || miss "entry.list holds $_t22_list concurrent entries, want 5"
tc "TC22: five concurrent entry.record calls land five entries with distinct suffixed slugs"

# ==============================================================================
# Suite 8: Refusals and Tiers (3 test cases)
# ==============================================================================
printf '\n== Suite 8: Refusals and Tiers ==\n'

# TC23: a missing entity refuses rc1 with the fixed not-found line and nothing on stdout
call task.get "$TUNIT" nonexistent-task-slug
refused 1 ERR_ENTITY_NOT_FOUND "task 'nonexistent-task-slug' not found in unit 'compliance-tasks'"
tc "TC23: a missing task refuses rc1 with the fixed ERR_ENTITY_NOT_FOUND line"

# TC24: a missing or malformed identifier refuses rc1 ERR_INVALID_ARGUMENT
call session.create
refused_like 1 ERR_INVALID_ARGUMENT
call task.get "$TUNIT" 'bad slug!'
refused_like 1 ERR_INVALID_ARGUMENT
call session.load '../escape'
refused_like 1 ERR_INVALID_ARGUMENT
tc "TC24: a missing or malformed identifier refuses rc1 ERR_INVALID_ARGUMENT"

# TC25: an unknown function refuses rc2 ERR_CAPABILITY_UNSUPPORTED; unit.export and
# unit.import left the contract (knowledge#MIGRATION_IS_AGENT_JUDGMENT) and answer the same
call non_existent_subsystem.method
refused 2 ERR_CAPABILITY_UNSUPPORTED "unknown function 'non_existent_subsystem.method'"
call unit.export "$TUNIT"
refused 2 ERR_CAPABILITY_UNSUPPORTED "unknown function 'unit.export'"
printf '{"kind":"unit","format":"contexture-dump","version":1,"unit":"tc25-u","extras":0}\n' > "$SANDBOX/tc25.in"
doc "$SANDBOX/tc25.in"
call unit.import tc25-u
refused 2 ERR_CAPABILITY_UNSUPPORTED "unknown function 'unit.import'"
call session.list
answer; wantno '"unit":"tc25-u"'
tc "TC25: an unknown function refuses rc2 ERR_CAPABILITY_UNSUPPORTED, unit.export and unit.import among them"

# ==============================================================================
# Suite 9: Journal Integrity (2 test cases)
# ==============================================================================
printf '\n== Suite 9: Journal Integrity ==\n'
GAMMA=2026-09-27-event-1790000040
DELTA=2026-09-27-event-1790000041
EPS=2026-09-27-event-1790000042

# TC26: a given slug the journal holds refuses rc1 ERR_ENTITY_EXISTS; the first stays
kv slug "$BETA"
rec "$TUNIT" 1790000026 "A second beta"
refused 1 ERR_ENTITY_EXISTS "entry '$BETA' already exists in unit 'compliance-tasks'"
call entry.get "$TUNIT" "$BETA"
answer; wantv entry.what '"Closer event"'
tc "TC26: entry.record refuses a repeated given slug; the first entry intact"

# TC27: one closer naming several targets closes every one of them, the verdict kept
kv group topic-group
rec "$TUNIT" 1790000040 "Gamma" "the human"
answer
rec "$TUNIT" 1790000041 "Delta"
answer
kv closers.count 1; kcl 1 CLOSES folded "two at once" "$GAMMA" "$DELTA"
rec "$TUNIT" 1790000042 "Folds two"
answer; wantv entry.closers.1.targets '[2]'; wantv entry.closers.1.verdict '"folded"'
call session.board "$TUNIT"
answer; wantno "\"slug\":\"$GAMMA\""; wantno "\"slug\":\"$DELTA\""; wantno '"thread":"the human"'; wantv open_threads '[0]'
call entry.get "$TUNIT" "$DELTA"
answer; wantv entry.closed true; wantv entry.closed_by "\"$EPS\""; wantv entry.close_reason '"folded: two at once"'
call entry.get "$TUNIT" "$GAMMA"
answer; wantv entry.closed true; wantv entry.closed_by "\"$EPS\""
tc "TC27: a multi-target closer closes every target and keeps its verdict"

# ==============================================================================
# Suite 10: The Store and the Transport (4 test cases)
# ==============================================================================
printf '\n== Suite 10: The Store and the Transport ==\n'
SUNIT="compliance-store"

# TC28: session.create refuses a unit the store holds; storage.health answers its keys
# and the active count session.list shows; a function on an absent unit refuses rc1
mk "$SUNIT" store
answer; wantv state.unit '"compliance-store"'
mk "$SUNIT" store
refused 1 ERR_ENTITY_EXISTS "unit 'compliance-store' already exists"
call session.list
answer
_t28_act=$(vals units status | tr ' ' '\n' | grep -c '"ACTIVE"')
wantv store '"present"'
call storage.health
answer; wantkeys @ "driver,health,detail,store,active_units"; wantv store '"present"'; wantv active_units "$_t28_act"
[ "$_t28_act" = 2 ] || miss "session.list shows $_t28_act ACTIVE units, want 2"
for _t28_f in "session.load" "session.board" "session.audit" "task.list no-such-unit all" "entry.list" "finding.list no-such-unit all" "task.get no-such-unit t1"; do
  set -- $_t28_f
  if [ $# -eq 1 ]; then call "$1" no-such-unit; else call "$@"; fi
  refused 1 ERR_ENTITY_NOT_FOUND "unit 'no-such-unit' not found"
done
kv objective "never lands"
call task.add no-such-unit t1
refused 1 ERR_ENTITY_NOT_FOUND "unit 'no-such-unit' not found"
tc "TC28: session.create refuses a held unit; storage.health counts the active units; an absent unit refuses rc1"

# TC31: a 2 MB report travels on stdin through lane.write_report and reads back whole
printf '# recipe grammar\nMISSION\n  GOAL: "store lane"\n' > "$SANDBOX/lane-in.txt"
doc "$SANDBOX/lane-in.txt"
call lane.create "$SUNIT" s-lane
answer
awk 'BEGIN { for (i = 1; i <= 26000; i++) printf "line %06d of the big report, a \\ backslash, a \"quote\", a\ttab ....\n", i }' > "$SANDBOX/big.txt"
_t31_b=$(wc -c < "$SANDBOX/big.txt" | tr -d ' ')
doc "$SANDBOX/big.txt"
call lane.write_report "$SUNIT" s-lane
answer; wantout "{\"unit\":\"compliance-store\",\"lane\":\"s-lane\",\"bytes\":$_t31_b}"
call lane.get "$SUNIT" s-lane report
answer; wantv artifact '"report"'
jv content | awk -v mode=dec -f "$JF" > "$SANDBOX/big-out.txt"
cmp -s "$SANDBOX/big.txt" "$SANDBOX/big-out.txt" || miss "the 2 MB report did not read back byte for byte"
rm -f "$SANDBOX/big.txt" "$SANDBOX/big-out.txt"
tc "TC31: a 2 MB lane report lands over stdin and reads back byte for byte"

# TC32: a repeated finding NAME and a repeated given lane entry slug refuse rc1
kv summary First
call finding.add "$SUNIT" STORE_F
answer
kv summary Repeat
call finding.add "$SUNIT" STORE_F
refused 1 ERR_ENTITY_EXISTS "finding 'STORE_F' already exists in unit 'compliance-store'"
kv what First; kv thread none; kv slug 2026-09-25-s-l1; kv date "$DATE"; kv epoch 1790000032
call lane.record "$SUNIT" s-lane
answer; wantv entry.slug '"2026-09-25-s-l1"'
kv what Repeat; kv thread none; kv slug 2026-09-25-s-l1; kv date "$DATE"; kv epoch 1790000033
call lane.record "$SUNIT" s-lane
refused 1 ERR_ENTITY_EXISTS "lane entry 's-lane/2026-09-25-s-l1' already exists in unit 'compliance-store'"
call finding.get "$SUNIT" STORE_F
answer; wantv finding.summary '"First"'
call lane.get "$SUNIT" s-lane journal
answer; wantv items '[1]'; wantv items.1.what '"First"'
tc "TC32: a repeated finding NAME and lane entry slug refuse rc1 ERR_ENTITY_EXISTS"

# TC33: finding.update, finding.supersede (a missing predecessor refuses), finding.drop
kv summary Updated; kl refs "journal#2026-09-25-s-l1"
call finding.update "$SUNIT" STORE_F
answer; wantout '{"unit":"compliance-store","finding":{"name":"STORE_F","ordinal":1,"supersedes":null,"refs":["journal#2026-09-25-s-l1"],"summary":"Updated","extra_fields":[],"head_text":null,"extra_lines":[],"superseded_by":null,"active":true,"next":null}}'
kv summary Successor
call finding.supersede "$SUNIT" NO_SUCH STORE_G
refused 1 ERR_ENTITY_NOT_FOUND "finding 'NO_SUCH' not found in unit 'compliance-store'"
kv summary Successor
call finding.supersede "$SUNIT" STORE_F STORE_G
answer; wantout '{"unit":"compliance-store","superseded":"STORE_F","finding":{"name":"STORE_G","ordinal":2,"supersedes":{"name":"STORE_F","reason":"superseded"},"refs":[],"summary":"Successor","extra_fields":[],"head_text":null,"extra_lines":[],"superseded_by":null,"active":true,"next":null}}'
call finding.get "$SUNIT" STORE_F
answer; wantv finding.superseded_by '"STORE_G"'; wantv finding.active false
call finding.drop "$SUNIT" STORE_G
answer; wantout '{"unit":"compliance-store","name":"STORE_G"}'
call finding.get "$SUNIT" STORE_G
refused 1 ERR_ENTITY_NOT_FOUND "finding 'STORE_G' not found in unit 'compliance-store'"
call finding.get "$SUNIT" STORE_F
answer; wantv finding.superseded_by null; wantv finding.active true
tc "TC33: finding.update, finding.supersede, finding.drop answer and mutate the knowledge"

# ==============================================================================
# Suite 11: Uniform Answers (5 test cases)
# ==============================================================================
printf '\n== Suite 11: Uniform Answers ==\n'

# TC34: task.list filters by TODO, IN_PROGRESS, DONE, and all
call task.list "$TUNIT" all
answer; wantout '{"unit":"compliance-tasks","tasks":[{"slug":"task-keeper","status":"TODO","objective":"Keeper objective"},{"slug":"task-sample","status":"TODO","objective":"Re-declared objective"}]}'
kv pointer "work on task-keeper"
call task.start "$TUNIT" task-keeper
answer; wantv next_action '"work on task-keeper"'
call task.list "$TUNIT" IN_PROGRESS
answer; wantout '{"unit":"compliance-tasks","tasks":[{"slug":"task-keeper","status":"IN_PROGRESS","objective":"Keeper objective"}]}'
call task.list "$TUNIT" TODO
answer; wantout '{"unit":"compliance-tasks","tasks":[{"slug":"task-sample","status":"TODO","objective":"Re-declared objective"}]}'
call task.list "$TUNIT" DONE
answer; wantout '{"unit":"compliance-tasks","tasks":[]}'
kv evidence "keeper landed"; kv date "$DATE"
call task.complete "$TUNIT" task-keeper
answer
call task.list "$TUNIT" DONE
answer; wantout '{"unit":"compliance-tasks","tasks":[{"slug":"task-keeper","status":"DONE","objective":"Keeper objective"}]}'
tc "TC34: task.list filters by the canonical status and all lists every task"

# TC35: refs travel as an indexed list and answer as a JSON array; task.update adds the
# sections a task lacked and refs.count=0 clears the list
kv objective "Refs task"; kl refs "backlog#one" "knowledge#TWO"
call task.add "$TUNIT" task-refs
answer; wantv task.refs '[2]'; wantv task.refs.1 '"backlog#one"'; wantv task.refs.2 '"knowledge#TWO"'; wantv task.description null
kv desc "Added description"; kv criteria "Added criteria"; kv details "Added details"
call task.update "$TUNIT" task-refs
answer; wantv task.description '"Added description"'; wantv task.criteria '"Added criteria"'; wantv task.details '"Added details"'; wantv task.refs '[2]'
kl refs
call task.update "$TUNIT" task-refs
answer; wantv task.refs '[0]'; wantv task.description '"Added description"'
tc "TC35: task refs are a JSON array; task.update adds sections and clears refs"

# TC37: entry.list filters by --group and --anchor
OTHER=2026-09-27-event-1790000050
kv group other-group
rec "$TUNIT" 1790000050 "Other group"
answer
call entry.list "$TUNIT" --group=other-group
answer; wantout "{\"unit\":\"compliance-tasks\",\"entries\":[{\"slug\":\"$OTHER\",\"occurrence\":1,\"anchor\":\"A1\",\"what\":\"Other group\",\"group\":\"other-group\"}]}"
call entry.list "$TUNIT" --group=topic-group
answer; wantvals entries slug "\"$ALPHA\" \"$BETA\" \"$GAMMA\""
call entry.list "$TUNIT" --anchor=A9
answer; wantout '{"unit":"compliance-tasks","entries":[]}'
tc "TC37: entry.list filters by --group and --anchor"

# TC38: search.query answers the shared shape, honors --limit and --entity, and refuses
# an empty query rc1
kv query objective
call search.query "$TUNIT" --mode=exact --limit=1
answer; wantkeys @ "unit,query,mode,total_matches,results"; wantv mode '"exact"'; wantv total_matches 4; wantv results '[1]'
wantkeys results.1 "entity_type,entity_id,section,snippet,score"
wantv results.1.entity_type '"session"'; wantv results.1.snippet '"objective: \"Task verification session"'; wantv results.1.score 0
kv query objective
call search.query "$TUNIT" --mode=exact --entity=task --limit=50
answer; wantv total_matches 3; wantvals results entity_id '"task-keeper" "task-sample" "task-refs"'; wantvals results snippet '"Keeper objective" "Re-declared objective" "Refs task"'
kv query ""
call search.query "$TUNIT"
refused_like 1 ERR_INVALID_ARGUMENT
tc "TC38: search.query answers one shape, honors --limit and --entity, refuses an empty query"

# TC39: the exact rule on the exact fixture, built through the functions on every backend
# (the state, three tasks, two findings, an anchor and three entries, a lane with its
# recipe, journal, and report): one row per matching entity and section in text order, its
# snippet the first matching line, total_matches counting the rows; no mode is exact; an
# undeclared mode refuses naming the declared modes
EX=compliance-exact
kv objective "exact fixture"; kl repos; kv attention plain; call session.create "$EX"; answer
call session.refs "$EX"; answer
kv pointer "find the Needle in the state"; call session.next "$EX"; answer
kv objective "a needle in the objective"; kv desc "a second NEEDLE line of the same task"; call task.add "$EX" t-one; answer
kv objective "needlework, a substring"; call task.add "$EX" t-two; answer
kv objective "no match here"; call task.add "$EX" t-three; answer
kv summary "one needle"; call finding.add "$EX" F_ONE; answer
kv summary "none at all"; call finding.add "$EX" F_TWO; answer
kv slug 2026-09-25-e-one; rec "$EX" 1790000391 "the needle event"; answer
kv slug 2026-09-25-e-two; rec "$EX" 1790000392 "nothing to see" "a needle awaits"; answer
kv slug 2026-09-25-e-three; rec "$EX" 1790000393 "quiet"; answer
printf '# needle in a grammar comment never matches\nMISSION\n  GOAL: "thread the needle"\n' > "$SANDBOX/tc39-recipe.txt"
doc "$SANDBOX/tc39-recipe.txt"; call lane.create "$EX" ex-lane; answer
kv what "a lane needle"; kv thread none; kv slug 2026-09-25-l-one; kv date "$DATE"; kv epoch 1790000394; call lane.record "$EX" ex-lane; answer
printf '# report\n\n@orientation\n  VERDICT: "needle one"\n  NOTE: "needle two"\n' > "$SANDBOX/tc39-report.txt"
doc "$SANDBOX/tc39-report.txt"; call lane.write_report "$EX" ex-lane; answer
while IFS='|' read -r _q _lim _ent _want; do
  kv query "$_q"
  set -- --mode=exact
  [ -n "$_lim" ] && set -- "$@" "--limit=$_lim"
  [ -n "$_ent" ] && set -- "$@" "--entity=$_ent"
  call search.query compliance-exact "$@"
  answer; wantout "$_want"
done < "$FX/tc39-exact.answers"
kv query needle
call search.query "$EX"
answer; wantout "$(sed -n '1s/^needle|||//p' "$FX/tc39-exact.answers")"
kv query needle
call search.query "$EX" --mode=nosuchmode
refused 1 ERR_CAPABILITY_UNSUPPORTED "mode 'nosuchmode' is not supported; declared modes: $MODES"
tc "TC39: --mode=exact answers one row per matching entity and section, the same on every backend; no mode is exact; an undeclared mode refuses"

# ==============================================================================
# Suite 12: The Corpus Store (9 test cases with corpus.store, 1 without)
# ==============================================================================
# corpus.store is optional (outside the handshake's mandatory set): a driver declaring
# it runs the nine cases; a driver without it proves it refuses every corpus method. The
# changes case keys on the declared corpus.changelog, never on the driver's name.
printf '\n== Suite 12: The Corpus Store ==\n'
CORPUS_STORE=0
CORPUS_LOG=0
printf '%s\n' "$cap_out" | grep -qF '"corpus.store"' && CORPUS_STORE=1
printf '%s\n' "$cap_out" | grep -qF '"corpus.changelog"' && CORPUS_LOG=1
# a guide at depth one beside the corpus is never a doc
mkdir -p "$SANDBOX/docs"
printf '# a guide, not a corpus doc\n' > "$SANDBOX/docs/guide.md"
cw() { f=$1; shift; "$DRIVER_EXEC" corpus.write "$@" < "$f"; }

if [ "$CORPUS_STORE" -eq 1 ]; then
  # TC40: corpus.write then corpus.read returns the exact bytes (no trailing newline, a
  # literal backslash-n, a tab, quotes, non-ASCII); a replace wins; a 1 MB doc round-trips;
  # the success line names repo, slug, and op
  out=$(drv corpus.list 2>&1); rc=$?
  wantrc "$rc" 0; [ -z "$out" ] || tc_fail="$tc_fail; an empty corpus listed [$out]"
  printf '@doc capability one\n  repo: alpha\n  description: "a \\n literal, a\ttab, a \\"quote\\", çalışma"\n\n@responsibilities\n  - "owns one"' > c-in.txt
  out=$(cw c-in.txt alpha one 2>&1); rc=$?
  wantrc "$rc" 0; want "$out" '{"status":"ok","repo":"alpha","slug":"one","op":"write"}'
  drv corpus.read alpha one > c-out.txt 2>/dev/null; rc=$?
  wantrc "$rc" 0
  cmp -s c-in.txt c-out.txt || tc_fail="$tc_fail; corpus.read differs from the written bytes"
  printf '@doc capability one\n  repo: alpha\n  description: "replaced"\n' > c-in2.txt
  out=$(cw c-in2.txt alpha one --op=entry --head=0123abcdef 2>&1); rc=$?
  wantrc "$rc" 0; want "$out" '"op":"entry"'
  drv corpus.read alpha one > c-out.txt 2>/dev/null
  cmp -s c-in2.txt c-out.txt || tc_fail="$tc_fail; a replace did not win"
  awk 'BEGIN { for (i = 1; i <= 13000; i++) printf "    line %06d of a big doc, eighty bytes wide, padded out to its width ...\n", i }' > c-big.txt
  cw c-big.txt alpha big >/dev/null 2>&1; rc=$?
  wantrc "$rc" 0
  drv corpus.read alpha big > c-out.txt 2>/dev/null
  cmp -s c-big.txt c-out.txt || tc_fail="$tc_fail; the 1 MB doc did not read back byte for byte"
  drv corpus.read alpha no-such >/dev/null 2>&1; rc=$?
  wantrc "$rc" 1
  out=$(drv corpus.read alpha no-such 2>&1)
  want "$out" 'ERR_ENTITY_NOT_FOUND'
  tc "TC40: corpus.write and corpus.read round-trip the exact bytes; a replace wins; an absent doc reads rc1"

  # TC41: corpus.list prints <repo>/<slug> in bytewise order, a repo filter keeps one repo,
  # an absent repo refuses rc1, a malformed repo rc1, the depth-one guide never listed
  printf '@doc overview zeta\n' > c-z.txt
  for c_k in "beta zeta" "alpha Two" "alpha a.b" "alpha one-two"; do
    set -- $c_k
    cw c-z.txt "$1" "$2" >/dev/null 2>&1 || tc_fail="$tc_fail; write $1/$2 failed"
  done
  out=$(drv corpus.list 2>&1); rc=$?
  wantrc "$rc" 0
  [ "$out" = "$(printf 'alpha/Two\nalpha/a.b\nalpha/big\nalpha/one-two\nalpha/one\nbeta/zeta')" ] || tc_fail="$tc_fail; list [$out]"
  out=$(drv corpus.list alpha 2>&1); rc=$?
  wantrc "$rc" 0
  [ "$out" = "$(printf 'alpha/Two\nalpha/a.b\nalpha/big\nalpha/one-two\nalpha/one')" ] || tc_fail="$tc_fail; list alpha [$out]"
  out=$(drv corpus.list gamma 2>&1); rc=$?
  wantrc "$rc" 1; want "$out" 'ERR_ENTITY_NOT_FOUND'
  out=$(drv corpus.list ../alpha 2>&1); rc=$?
  wantrc "$rc" 1; want "$out" 'ERR_INVALID_ARGUMENT'
  wantnot "$(drv corpus.list 2>&1)" 'guide'
  tc "TC41: corpus.list orders bytewise, filters by repo, refuses an absent or malformed repo"

  # TC42: --create refuses an existing doc rc1 and leaves it whole; --create lands a new
  # doc; malformed keys, an unknown flag, and an unknown op refuse rc1 with nothing written
  out=$(cw c-in.txt alpha one --create 2>&1); rc=$?
  wantrc "$rc" 1; want "$out" 'ERR_ENTITY_EXISTS'
  drv corpus.read alpha one > c-out.txt 2>/dev/null
  cmp -s c-in2.txt c-out.txt || tc_fail="$tc_fail; a refused --create changed the doc"
  out=$(cw c-in.txt alpha fresh --create --op=new 2>&1); rc=$?
  wantrc "$rc" 0; want "$out" '"slug":"fresh","op":"new"'
  c_before=$(drv corpus.list 2>&1)
  for c_bad in ".hidden" "a/b" ""; do
    cw c-in.txt alpha "$c_bad" >/dev/null 2>&1; rc=$?
    wantrc "$rc" 1
  done
  cw c-in.txt alpha other --force >/dev/null 2>&1; rc=$?
  wantrc "$rc" 1
  out=$(cw c-in.txt alpha other --op=bogus 2>&1); rc=$?
  wantrc "$rc" 1; want "$out" 'ERR_INVALID_ARGUMENT'
  [ "$(drv corpus.list 2>&1)" = "$c_before" ] || tc_fail="$tc_fail; a refused write changed the corpus"
  tc "TC42: --create refuses an existing doc and lands a new one; malformed calls refuse rc1 writing nothing"

  # TC43: corpus.remove then corpus.read rc1; a second remove rc1; the last doc of a repo
  # removed leaves the repo absent from the corpus
  out=$(drv corpus.remove alpha fresh 2>&1); rc=$?
  wantrc "$rc" 0; want "$out" '"slug":"fresh","op":"remove"'
  drv corpus.read alpha fresh >/dev/null 2>&1; rc=$?
  wantrc "$rc" 1
  drv corpus.remove alpha fresh >/dev/null 2>&1; rc=$?
  wantrc "$rc" 1
  wantnot "$(drv corpus.list alpha 2>&1)" 'alpha/fresh'
  drv corpus.remove beta zeta >/dev/null 2>&1; rc=$?
  wantrc "$rc" 0
  drv corpus.list beta >/dev/null 2>&1; rc=$?
  wantrc "$rc" 1
  [ "$(drv corpus.list 2>&1)" = "$(printf 'alpha/Two\nalpha/a.b\nalpha/big\nalpha/one-two\nalpha/one')" ] || tc_fail="$tc_fail; list after removes"
  tc "TC43: corpus.remove then corpus.read rc1; an emptied repo leaves the corpus"

  # TC44: corpus.mount prints the root every listed doc reads under at docs/<repo>/<slug>.md,
  # byte for byte; a repo mount carries that repo's docs; a missing or non-empty folder
  # and an absent repo refuse rc1; a driver answering elsewhere writes nothing into it
  mkdir -p c-mnt
  root=$(drv corpus.mount "$SANDBOX/c-mnt" 2>&1); rc=$?
  wantrc "$rc" 0
  c_n=0
  for c_d in $(drv corpus.list 2>/dev/null); do
    c_n=$((c_n + 1))
    drv corpus.read "${c_d%%/*}" "${c_d#*/}" > c-out.txt 2>/dev/null
    cmp -s c-out.txt "$root/docs/$c_d.md" || tc_fail="$tc_fail; mount copy of $c_d differs"
  done
  [ "$c_n" -eq 5 ] || tc_fail="$tc_fail; mount compared $c_n docs, want 5"
  c_files=$(for c_f in "$root"/docs/*/*.md; do [ -f "$c_f" ] && printf '%s\n' "$c_f"; done | wc -l | tr -d ' ')
  [ "$c_files" -eq 5 ] || tc_fail="$tc_fail; the mount holds $c_files docs at depth two, want 5"
  if [ "$root" != "$SANDBOX/c-mnt" ] && [ -n "$(ls -A c-mnt)" ]; then tc_fail="$tc_fail; a driver answering elsewhere wrote into the folder"; fi
  mkdir -p c-mnt2
  root2=$(drv corpus.mount "$SANDBOX/c-mnt2" alpha 2>&1); rc=$?
  wantrc "$rc" 0
  cmp -s c-in2.txt "$root2/docs/alpha/one.md" || tc_fail="$tc_fail; a repo mount lacks alpha/one"
  drv corpus.mount "$SANDBOX/no-such-folder" >/dev/null 2>&1; rc=$?
  wantrc "$rc" 1
  mkdir -p c-full && : > c-full/x
  drv corpus.mount "$SANDBOX/c-full" >/dev/null 2>&1; rc=$?
  wantrc "$rc" 1
  mkdir -p c-mnt3
  drv corpus.mount "$SANDBOX/c-mnt3" gamma >/dev/null 2>&1; rc=$?
  wantrc "$rc" 1
  rm -rf c-mnt c-mnt2 c-mnt3 c-full
  tc "TC44: corpus.mount prints the root its docs read under byte for byte; bad folders and absent repos refuse rc1"

  # TC45: corpus.changes follows the declared corpus.changelog: absent, it refuses rc1
  # ERR_CAPABILITY_UNSUPPORTED printing nothing; present, it returns the rows of the given
  # heads only, oldest first: <seq> TAB <time> TAB <op> TAB <repo>/<slug> TAB <head> TAB
  # <prior>, prior the doc's state before the change (absent or present)
  if [ "$CORPUS_LOG" -eq 1 ]; then
    cw c-z.txt logr one --op=new --head=aaa1 >/dev/null 2>&1
    cw c-z.txt logr one --op=entry --head=bbb2 >/dev/null 2>&1
    drv corpus.remove logr one --op=remove --head=aaa1 >/dev/null 2>&1
    out=$(printf 'head=aaa1\n' | "$DRIVER_EXEC" corpus.changes 2>&1); rc=$?
    wantrc "$rc" 0
    c_rows=$(printf '%s\n' "$out" | awk -F '\t' 'NF == 6 && $4 == "logr/one" { printf "%s %s %s|", $3, $5, $6 }')
    [ "$c_rows" = "new aaa1 absent|remove aaa1 present|" ] || tc_fail="$tc_fail; changes rows [$c_rows]"
    wantnot "$out" 'bbb2'
  else
    out=$(printf 'head=aaa1\n' | "$DRIVER_EXEC" corpus.changes 2>/dev/null); rc=$?
    wantrc "$rc" 1; [ -z "$out" ] || tc_fail="$tc_fail; a refused changes printed [$out]"
    want "$(printf 'head=aaa1\n' | "$DRIVER_EXEC" corpus.changes 2>&1)" 'ERR_CAPABILITY_UNSUPPORTED'
  fi
  tc "TC45: corpus.changes answers the declared corpus.changelog (rows by head, or a refusal rc1)"

  # TC46: the corpus is the workspace's whatever the caller's folder: a call from a
  # subfolder of the sandbox lists and reads the sandbox's docs
  mkdir -p "$SANDBOX/sub/deep"
  c_top=$(drv corpus.list 2>&1)
  c_sub=$(cd "$SANDBOX/sub/deep" && "$DRIVER_EXEC" corpus.list < /dev/null 2>&1); rc=$?
  wantrc "$rc" 0
  [ -n "$c_top" ] && [ "$c_sub" = "$c_top" ] || tc_fail="$tc_fail; subfolder list [$c_sub]"
  (cd "$SANDBOX/sub/deep" && "$DRIVER_EXEC" corpus.read alpha one < /dev/null) > c-out.txt 2>/dev/null
  cmp -s c-in2.txt c-out.txt || tc_fail="$tc_fail; a subfolder read differs"
  rm -rf "$SANDBOX/sub"
  tc "TC46: a corpus call from a sandbox subfolder lists and reads the sandbox's docs"

  # TC50: keys that differ only by ASCII case never coexist: a write whose slug folds onto
  # another doc of its repo, or whose repo folds onto another repo, refuses rc1
  # ERR_ENTITY_EXISTS with nothing stored (the first doc byte for byte, the list unchanged);
  # the exact key still replaces, and a key folding onto nothing lands
  printf '@doc capability One\n  repo: alpha\n  description: "a case twin"\n' > c-twin.txt
  c_before=$(drv corpus.list 2>&1)
  for c_k in "alpha One" "alpha ONE" "alpha two" "Alpha fresh" "ALPHA one"; do
    set -- $c_k
    out=$(cw c-twin.txt "$1" "$2" 2>&1); rc=$?
    wantrc "$rc" 1; want "$out" 'ERR_ENTITY_EXISTS'; wantnot "$out" '"status":"ok"'
    out=$(cw c-twin.txt "$1" "$2" --create 2>&1); rc=$?
    wantrc "$rc" 1; want "$out" 'ERR_ENTITY_EXISTS'
  done
  drv corpus.read alpha one > c-out.txt 2>/dev/null
  cmp -s c-in2.txt c-out.txt || tc_fail="$tc_fail; a refused case twin changed alpha/one"
  [ "$(drv corpus.list 2>&1)" = "$c_before" ] || tc_fail="$tc_fail; a refused case twin changed the list [$(drv corpus.list 2>&1)]"
  out=$(cw c-in2.txt alpha one 2>&1); rc=$?
  wantrc "$rc" 0; want "$out" '"slug":"one"'
  out=$(cw c-twin.txt alpha one-too 2>&1); rc=$?
  wantrc "$rc" 0
  drv corpus.remove alpha one-too >/dev/null 2>&1
  [ "$(drv corpus.list 2>&1)" = "$c_before" ] || tc_fail="$tc_fail; list after the twin cases [$(drv corpus.list 2>&1)]"
  tc "TC50: a key that folds onto another doc or repo under ASCII case refuses rc1 ERR_ENTITY_EXISTS, nothing stored"

  # TC51: every method acts on the exact key alone, never on a case twin a case-insensitive
  # filesystem folds onto a stored doc: reading or removing a twin of a slug or a repo
  # answers as for an absent doc (rc1 ERR_ENTITY_NOT_FOUND, nothing on stdout), --create of
  # a twin keeps the TC50 refusal, and a repo twin neither lists nor mounts; the real docs
  # stay byte for byte and the list unchanged; the exact keys still read
  c_before=$(drv corpus.list 2>&1)
  for c_k in "alpha ONE" "alpha One" "ALPHA one" "Alpha one" "alpha TWO" "alpha two"; do
    set -- $c_k
    drv corpus.read "$1" "$2" > c-out.txt 2> c-err.txt; rc=$?
    wantrc "$rc" 1; want "$(cat c-err.txt)" 'ERR_ENTITY_NOT_FOUND'
    [ -s c-out.txt ] && tc_fail="$tc_fail; corpus.read $1/$2 printed a doc"
    out=$(drv corpus.remove "$1" "$2" 2>&1); rc=$?
    wantrc "$rc" 1; want "$out" 'ERR_ENTITY_NOT_FOUND'; wantnot "$out" '"status":"ok"'
    out=$(cw c-twin.txt "$1" "$2" --create 2>&1); rc=$?
    wantrc "$rc" 1; want "$out" 'ERR_ENTITY_EXISTS'; wantnot "$out" '"status":"ok"'
  done
  for c_r in ALPHA Alpha; do
    out=$(drv corpus.list "$c_r" 2>/dev/null); rc=$?
    wantrc "$rc" 1; [ -z "$out" ] || tc_fail="$tc_fail; corpus.list $c_r listed [$out]"
    want "$(drv corpus.list "$c_r" 2>&1)" 'ERR_ENTITY_NOT_FOUND'
    mkdir -p c-mnt4
    out=$(drv corpus.mount "$SANDBOX/c-mnt4" "$c_r" 2>&1); rc=$?
    wantrc "$rc" 1; want "$out" 'ERR_ENTITY_NOT_FOUND'
    rm -rf c-mnt4
  done
  drv corpus.read alpha one > c-out.txt 2>/dev/null; rc=$?
  wantrc "$rc" 0
  cmp -s c-in2.txt c-out.txt || tc_fail="$tc_fail; a twin call changed or hid alpha/one"
  drv corpus.read alpha Two > c-out.txt 2>/dev/null; rc=$?
  wantrc "$rc" 0
  cmp -s c-z.txt c-out.txt || tc_fail="$tc_fail; a twin call changed or hid alpha/Two"
  [ "$(drv corpus.list 2>&1)" = "$c_before" ] || tc_fail="$tc_fail; a twin call changed the list [$(drv corpus.list 2>&1)]"
  tc "TC51: a case twin reads, removes, lists, and mounts as absent; --create of a twin refuses; the real docs untouched"
  rm -f c-in.txt c-in2.txt c-out.txt c-err.txt c-big.txt c-z.txt c-twin.txt
else
  # TC40 (no corpus.store): every corpus method refuses, printing nothing on stdout
  mkdir -p c-mnt
  printf '@doc overview x\n' > c-in.txt
  for c_m in "corpus.list" "corpus.read alpha one" "corpus.write alpha one" "corpus.remove alpha one" "corpus.mount c-mnt" "corpus.changes"; do
    # shellcheck disable=SC2086
    out=$("$DRIVER_EXEC" $c_m < c-in.txt 2>/dev/null); rc=$?
    [ "$rc" -ne 0 ] || tc_fail="$tc_fail; $c_m answered rc0"
    [ -z "$out" ] || tc_fail="$tc_fail; $c_m printed [$out]"
  done
  rm -rf c-mnt c-in.txt
  tc "TC40: a driver without corpus.store refuses every corpus method"
  printf 'note: TC41 to TC46, TC50, and TC51 need corpus.store, which this driver does not declare\n'
fi

# ==============================================================================
# Suite 13: The Resolver (3 test cases)
# ==============================================================================
# the shipped resolver (base's, beside the drivers it names) staged into a workspace of
# its own; planted contract 2 descriptors wrap the driver under test, so every case runs
# alike on every driver: require and has answer the optional capabilities and the search
# modes (search.mode.<m>), their verdict cached per driver path and capability set apart
# from the dispatch verdict; the dispatch handshake refuses a descriptor that is not
# contract 2 or lacks one of the 38 functions (a driver without corpus.store serves the
# record)
printf '\n== Suite 13: The Resolver ==\n'
RS="$SANDBOX/rs"
mkdir -p "$RS/.contexture/modules"
cp -R "$ROOT/base/.contexture/modules/session" "$RS/.contexture/modules/session"
RSV="$RS/.contexture/modules/session/scripts/driver-resolver"
FUNCS_JSON=$(printf '"%s",' $FUNCS38 | sed 's/,$//')
FUNCS_NO_TASK_ADD=$(printf '"%s",' $FUNCS38 | sed 's/"task\.add",//; s/,$//')
# wrap <file> <optional list items> [<functions list>] [<contract>]
wrap() {
  w_desc="{\"driver\":\"planted\",\"version\":\"2.0.0\",\"contract\":\"${4:-2}\",\"functions\":[${3:-$FUNCS_JSON}],\"search_modes\":[\"exact\"],\"optional\":[$2]}"
  {
    printf '#!/bin/sh\n'
    printf 'if [ "${1:-}" = capability ]; then\n'
    printf "  echo '%s'\n" "$w_desc"
    printf '  exit 0\n'
    printf 'fi\n'
    printf 'exec "%s" "$@"\n' "$DRIVER_EXEC"
  } > "$1"
  chmod +x "$1"
  touch -t 202001010000 "$1"
}
W_NO="$RS/w-nocorpus"
W_YES="$RS/w-corpus"
W_BAD="$RS/w-broken"
W_V1="$RS/w-contract1"
wrap "$W_NO" ""
wrap "$W_YES" '"corpus.store"'
wrap "$W_BAD" "" "$FUNCS_NO_TASK_ADD"
wrap "$W_V1" "" "" 1
rsv() { (cd "$RS" && unset CTX_DIR CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH && CTX_ROOT="$RS" "$RSV" "$@"); }
# rcall <resolver args>: one resolver call with the pending payload, answer flattened
rcall() {
  FN="resolver $*"
  rsv "$@" < "$P" > "$O" 2> "$E"
  RC=$?
  : > "$P"
  awk -f "$JF" "$O" > "$F" 2>/dev/null
}
VD="$RS/.contexture/tmp/driver-verdicts"

# TC47: require refuses rc2 naming what is missing, has answers rc0 or rc1 with no message,
# for the optional capabilities and the search modes (search.mode.<m>), on the planted
# descriptors and the bundled posix driver alike; malformed calls rc1
rcall "--driver=$W_NO" require corpus.store
wantrc "$RC" 2
grep -q 'corpus.store' "$E" || miss "require names no corpus.store"; grep -q 'ERR_CAPABILITY_UNSUPPORTED' "$E" || miss "require names no ERR_CAPABILITY_UNSUPPORTED"
rcall "--driver=$W_NO" has corpus.store
wantrc "$RC" 1
if [ -s "$O" ] || [ -s "$E" ]; then miss "has printed [$(cat "$O" "$E")]"; fi
rcall "--driver=$W_YES" require corpus.store
wantrc "$RC" 0
if [ -s "$O" ] || [ -s "$E" ]; then miss "require printed [$(cat "$O" "$E")]"; fi
rcall "--driver=$W_YES" has corpus.store
wantrc "$RC" 0
if [ -s "$O" ] || [ -s "$E" ]; then miss "has printed [$(cat "$O" "$E")]"; fi
rcall "--driver=$W_YES" require corpus.store corpus.changelog
wantrc "$RC" 2
grep -q 'corpus.changelog' "$E" || miss "require names no corpus.changelog"; if grep -q 'corpus.store ' "$E"; then miss "require named corpus.store"; fi
rcall "--driver=$W_YES" has search.mode.exact
wantrc "$RC" 0
if [ -s "$O" ] || [ -s "$E" ]; then miss "has search.mode.exact printed [$(cat "$O" "$E")]"; fi
rcall "--driver=$W_YES" has search.mode.hybrid
wantrc "$RC" 1
if [ -s "$O" ] || [ -s "$E" ]; then miss "has search.mode.hybrid printed [$(cat "$O" "$E")]"; fi
rcall "--driver=$W_YES" require search.mode.hybrid
wantrc "$RC" 2
grep -q 'search.mode.hybrid' "$E" || miss "require names no search.mode.hybrid"
rcall require corpus.store
wantrc "$RC" 0
rcall has corpus.changelog
wantrc "$RC" 1
rcall has search.mode.exact
wantrc "$RC" 0
rcall require
wantrc "$RC" 1
rcall has corpus.store corpus.changelog
wantrc "$RC" 1
rcall require 'Bad!'
wantrc "$RC" 1
tc "TC47: require and has answer the declared optional capabilities and search modes on every driver"

# TC48: a passing verdict is cached per driver path and capability set, apart from the
# dispatch verdict, valid while newer than the driver: it answers for an unchanged driver,
# never for another set, and a changed driver is read afresh
rcall "--driver=$W_YES" session.list
c_disp=$(ls "$VD" 2>/dev/null | grep -v '\.require\.' | grep 'w-corpus$')
[ -n "$c_disp" ] || miss "no dispatch verdict for the wrapper"
cp "$VD/$c_disp" c-disp.txt 2>/dev/null
rcall "--driver=$W_YES" require corpus.store
rcall "--driver=$W_YES" require search.mode.exact corpus.store
rcall "--driver=$W_YES" require corpus.store search.mode.exact
c_req=$(ls "$VD" 2>/dev/null | grep 'w-corpus\.require\.' | tr '\n' ' ')
case "$c_req" in
  *"w-corpus.require.corpus.store "*"w-corpus.require.corpus.store+search.mode.exact "*) ;;
  *) miss "require verdicts [$c_req]" ;;
esac
[ "$(printf '%s' "$c_req" | wc -w | tr -d ' ')" = 2 ] || miss "want 2 require verdicts [$c_req]"
cmp -s c-disp.txt "$VD/$c_disp" || miss "the dispatch verdict changed"
rcall "--driver=$W_YES" require corpus.changelog
wantrc "$RC" 2
# the cache answers an unchanged driver: the descriptor loses corpus.store, the mtime stays old
wrap "$W_YES" ""
rcall "--driver=$W_YES" require corpus.store
wantrc "$RC" 0
# a changed driver (newer than its verdict) is read afresh
touch -t 203001010000 "$W_YES"
rcall "--driver=$W_YES" require corpus.store
wantrc "$RC" 2
rm -f c-disp.txt
tc "TC48: the require verdict is cached per driver path and capability set, apart from the dispatch verdict"

# TC49: the dispatch handshake: a contract 2 descriptor with all 38 functions and no
# corpus.store serves the record through the resolver; a descriptor lacking task.add or
# declaring contract 1 is halted rc2 ERR_DRIVER_PROTOCOL naming the gap, serving nothing
kv objective "served"; kv attention "resolver fixture"
rcall "--driver=$W_NO" session.create rs-unit
answer; wantv unit '"rs-unit"'; wantv state.status '"ACTIVE"'
rcall "--driver=$W_NO" session.list
answer; wantvals units unit '"rs-unit"'
kv objective "served"
rcall "--driver=$W_NO" task.add rs-unit rs-task
answer; wantv task.slug '"rs-task"'
rcall "--driver=$W_NO" task.list rs-unit all
answer; wantout '{"unit":"rs-unit","tasks":[{"slug":"rs-task","status":"TODO","objective":"served"}]}'
rcall "--driver=$W_BAD" session.list
wantrc "$RC" 2; grep -q 'task.add' "$E" || miss "the halt names no task.add"; grep -q 'ERR_DRIVER_PROTOCOL' "$E" || miss "the halt names no ERR_DRIVER_PROTOCOL"; wantno 'rs-unit'
rcall "--driver=$W_V1" session.list
wantrc "$RC" 2; grep -q 'contract' "$E" || miss "the halt names no contract"; grep -q 'ERR_DRIVER_PROTOCOL' "$E" || miss "the halt names no ERR_DRIVER_PROTOCOL"; wantno 'rs-unit'
tc "TC49: the handshake serves a complete contract 2 driver and halts a missing function or contract"

# ==============================================================================
# Suite 14: Record Rules (8 test cases)
# ==============================================================================
printf '\n== Suite 14: Record Rules ==\n'

# TC52: after session.close each of the 17 write functions refuses rc1 ERR_UNIT_CLOSED
# with inputs that would land on an ACTIVE unit, and nothing changes
mk tc52-u; answer
kv objective "open task"; call task.add tc52-u t52; answer
kv objective "done task"; call task.add tc52-u t52d; answer
kv evidence "landed"; kv date "$DATE"; call task.complete tc52-u t52d; answer
kv summary "a finding"; call finding.add tc52-u F52; answer
doc "$SANDBOX/recipe.txt"; call lane.create tc52-u l52; answer
rec tc52-u 1790000520 "an entry before the close"; answer
call session.close tc52-u
answer; wantv status '"CLOSED"'
call task.list tc52-u all; cp "$O" "$SANDBOX/t52-tasks"
call entry.list tc52-u; cp "$O" "$SANDBOX/t52-entries"
call finding.list tc52-u all; cp "$O" "$SANDBOX/t52-findings"
call lane.get tc52-u l52 journal; cp "$O" "$SANDBOX/t52-lane"
C52="unit 'tc52-u' is CLOSED; a closed unit takes no writes"
kv attention "closed"; call session.stamp tc52-u; refused 1 ERR_UNIT_CLOSED "$C52"
kv pointer "closed"; call session.next tc52-u; refused 1 ERR_UNIT_CLOSED "$C52"
call session.refs tc52-u; refused 1 ERR_UNIT_CLOSED "$C52"
kv objective "new"; call task.add tc52-u t52b; refused 1 ERR_UNIT_CLOSED "$C52"
kv objective "changed"; call task.update tc52-u t52; refused 1 ERR_UNIT_CLOSED "$C52"
call task.start tc52-u t52; refused 1 ERR_UNIT_CLOSED "$C52"
kv evidence "closed"; kv date "$DATE"; call task.complete tc52-u t52; refused 1 ERR_UNIT_CLOSED "$C52"
call task.reopen tc52-u t52d; refused 1 ERR_UNIT_CLOSED "$C52"
kv reason "closed"; kv date "$DATE"; call task.drop tc52-u t52; refused 1 ERR_UNIT_CLOSED "$C52"
rec tc52-u 1790000521 "after the close"; refused 1 ERR_UNIT_CLOSED "$C52"
kv summary "new"; call finding.add tc52-u F52B; refused 1 ERR_UNIT_CLOSED "$C52"
kv summary "changed"; call finding.update tc52-u F52; refused 1 ERR_UNIT_CLOSED "$C52"
kv summary "successor"; call finding.supersede tc52-u F52 F52C; refused 1 ERR_UNIT_CLOSED "$C52"
call finding.drop tc52-u F52; refused 1 ERR_UNIT_CLOSED "$C52"
doc "$SANDBOX/recipe.txt"; call lane.create tc52-u l52b; refused 1 ERR_UNIT_CLOSED "$C52"
kv what "closed"; kv thread none; kv date "$DATE"; kv epoch 1790000522; call lane.record tc52-u l52; refused 1 ERR_UNIT_CLOSED "$C52"
doc "$SANDBOX/report.txt"; call lane.write_report tc52-u l52; refused 1 ERR_UNIT_CLOSED "$C52"
call task.list tc52-u all; wantfile "$SANDBOX/t52-tasks"
call entry.list tc52-u; wantfile "$SANDBOX/t52-entries"
call finding.list tc52-u all; wantfile "$SANDBOX/t52-findings"
call lane.get tc52-u l52 journal; wantfile "$SANDBOX/t52-lane"
tc "TC52: every write function refuses a CLOSED unit rc1 ERR_UNIT_CLOSED and changes nothing"

# TC53: the status moves: start from TODO; complete from TODO or IN_PROGRESS; reopen from
# IN_PROGRESS or DONE; every other move refuses rc1 ERR_INVALID_TRANSITION, task unchanged
mk tc53-u; answer
# m53 <slug> <function> <want status after> [<from status for a refusal>]
t53() { kv objective "matrix $1"; call task.add tc53-u "$1"; }
st53() { call task.get tc53-u "$1"; wantv task.status "\"$2\""; }
done53() { kv evidence "matrix"; kv date "$DATE"; call task.complete tc53-u "$1"; }
t53 m-todo-start; call task.start tc53-u m-todo-start; answer; wantv task.status '"IN_PROGRESS"'; st53 m-todo-start IN_PROGRESS; done53 m-todo-start
t53 m-ip-start; call task.start tc53-u m-ip-start; answer
call task.start tc53-u m-ip-start; refused 1 ERR_INVALID_TRANSITION "task 'm-ip-start' is IN_PROGRESS; task.start moves only from TODO"; st53 m-ip-start IN_PROGRESS; done53 m-ip-start
t53 m-done-start; done53 m-done-start; answer
call task.start tc53-u m-done-start; refused 1 ERR_INVALID_TRANSITION "task 'm-done-start' is DONE; task.start moves only from TODO"; st53 m-done-start DONE
t53 m-todo-complete; done53 m-todo-complete; answer; wantv task.status '"DONE"'; st53 m-todo-complete DONE
t53 m-ip-complete; call task.start tc53-u m-ip-complete; answer; done53 m-ip-complete; answer; wantv task.status '"DONE"'
t53 m-done-complete; done53 m-done-complete; answer
done53 m-done-complete; refused 1 ERR_INVALID_TRANSITION "task 'm-done-complete' is DONE; task.complete moves only from TODO or IN_PROGRESS"; st53 m-done-complete DONE
t53 m-todo-reopen
call task.reopen tc53-u m-todo-reopen; refused 1 ERR_INVALID_TRANSITION "task 'm-todo-reopen' is TODO; task.reopen moves only from IN_PROGRESS or DONE"; st53 m-todo-reopen TODO
t53 m-ip-reopen; call task.start tc53-u m-ip-reopen; answer
call task.reopen tc53-u m-ip-reopen; answer; wantv task.status '"TODO"'; st53 m-ip-reopen TODO
t53 m-done-reopen; done53 m-done-reopen; answer
call task.reopen tc53-u m-done-reopen; answer; wantv task.status '"TODO"'; st53 m-done-reopen TODO
tc "TC53: the status move matrix: every allowed move lands, every other refuses ERR_INVALID_TRANSITION"

# TC54: the pointer rule: after task.start or session.next, next_action names every
# IN_PROGRESS task, else rc1 ERR_POINTER_INCOMPLETE and nothing written
mk tc54-u; answer
kv objective "first"; call task.add tc54-u tc54-first; answer
kv objective "second"; call task.add tc54-u tc54-second; answer
call task.start tc54-u tc54-first
answer; wantv next_action '"work active task: tc54-first"'
kv pointer "work on tc54-second"
call task.start tc54-u tc54-second
refused 1 ERR_POINTER_INCOMPLETE "next_action would not name IN_PROGRESS task(s): tc54-first"
call task.get tc54-u tc54-second; answer; wantv task.status '"TODO"'
call task.start tc54-u tc54-second
refused 1 ERR_POINTER_INCOMPLETE "next_action would not name IN_PROGRESS task(s): tc54-first"
kv pointer "something unrelated"
call session.next tc54-u
refused 1 ERR_POINTER_INCOMPLETE "next_action would not name IN_PROGRESS task(s): tc54-first"
call session.load tc54-u; answer; wantv state.next_action '"work active task: tc54-first"'
kv pointer "tc54-first then tc54-second"
call task.start tc54-u tc54-second
answer; wantv next_action '"tc54-first then tc54-second"'
call session.load tc54-u; answer; wantv state.next_action '"tc54-first then tc54-second"'
kv pointer "tc54-second alone"
call session.next tc54-u
refused 1 ERR_POINTER_INCOMPLETE "next_action would not name IN_PROGRESS task(s): tc54-first"
kv pointer "both: tc54-first, tc54-second"
call session.next tc54-u
answer; wantout '{"unit":"tc54-u","next_action":"both: tc54-first, tc54-second"}'
tc "TC54: task.start and session.next refuse a pointer that omits an IN_PROGRESS task"

# TC55: task.complete writes its receipt entry atomically: the receipt answers the slug,
# the WHAT, thread none, the current anchor; entry.get of the slug equals it; a second
# completion on one date takes the -1 suffix; the audit holds no DONE_WITHOUT_EVENT
mk tc55-u; answer
kv objective "receipt task"; call task.add tc55-u tc55-t; answer
kv evidence "all green"; kv date "$DATE"
call task.complete tc55-u tc55-t
answer; wantv receipt.slug '"2026-09-27-tc55-t-completed"'; wantv receipt.what '"backlog/tc55-t: DONE (all green)"'; wantv receipt.thread '"none"'; wantv receipt.anchor '"A1"'
subobj receipt > "$SANDBOX/t55-receipt"
call entry.get tc55-u 2026-09-27-tc55-t-completed
answer
subobj entry | grep -Ev '^(closed|closed_by|close_reason)=' > "$SANDBOX/t55-entry"
cmp -s "$SANDBOX/t55-receipt" "$SANDBOX/t55-entry" || miss "entry.get differs from the receipt [$(diff "$SANDBOX/t55-receipt" "$SANDBOX/t55-entry" | head -4 | tr '\n' ' ')]"
[ -s "$SANDBOX/t55-receipt" ] || miss "the receipt answered no fields"
call task.reopen tc55-u tc55-t; answer
kv evidence "green again"; kv date "$DATE"
call task.complete tc55-u tc55-t
answer; wantv receipt.slug '"2026-09-27-tc55-t-completed-1"'
call session.audit tc55-u
answer; wantout '{"unit":"tc55-u","clean":true,"findings":[],"open_threads":[]}'
tc "TC55: task.complete writes its receipt; entry.get equals it; a same-day repeat takes -1"

# TC56: task.drop answers its DROPPED receipt; the slug is gone and addable again; an
# IN_PROGRESS task next_action names refuses ERR_INVALID_TRANSITION
mk tc56-u; answer
kv objective "to drop"; call task.add tc56-u tc56-t; answer
kv reason "no longer needed"; kv date "$DATE"
call task.drop tc56-u tc56-t
answer; wantout "{\"unit\":\"tc56-u\",\"slug\":\"tc56-t\",\"receipt\":$(receipt_json 2026-09-27-tc56-t-dropped 2 "backlog/tc56-t: DROPPED (no longer needed)")}"
call task.get tc56-u tc56-t
refused 1 ERR_ENTITY_NOT_FOUND "task 'tc56-t' not found in unit 'tc56-u'"
kv objective "declared again"; call task.add tc56-u tc56-t; answer; wantv task.objective '"declared again"'
call task.start tc56-u tc56-t; answer
kv reason "in progress"; kv date "$DATE"
call task.drop tc56-u tc56-t
refused 1 ERR_INVALID_TRANSITION "task 'tc56-t' is IN_PROGRESS; task.drop moves only from TODO, DONE, or an IN_PROGRESS task next_action does not name"
call task.get tc56-u tc56-t; answer; wantv task.status '"IN_PROGRESS"'
tc "TC56: task.drop answers its receipt; a dropped slug is addable again; the active task refuses"

# TC57 (posix alone: a repeated slug is legacy text only a hand-written file holds): X at
# entries 1 and 5, a closer naming X at 3: the board holds the later occurrence, entry.get
# answers it open, entry.closure finds no later closer, the audit warns
# LEGACY_DUPLICATE_SLUG and stays clean, a new repeat refuses
if [ "$IS_POSIX" -eq 1 ]; then
plant tc57-u
X57=2026-09-20-repeat
call session.board tc57-u
answer; wantvals live slug '"2026-09-20-between" "2026-09-20-closer" "2026-09-20-after" "2026-09-20-repeat"'; wantvals live occurrence '1 1 1 2'; wantvals live seq '3 4 5 6'
wantv open_threads '[1]'; wantv open_threads.1.slug "\"$X57\""; wantv open_threads.1.anchor '"A1"'; wantv open_threads.1.thread '"awaits the second answer"'
call entry.get tc57-u "$X57"
answer; wantv entry.occurrence 2; wantv entry.seq 6; wantv entry.what '"second occurrence"'; wantv entry.closed false; wantv entry.closed_by null
call entry.closure tc57-u "$X57"
answer; wantout '{"unit":"tc57-u","slug":"2026-09-20-repeat","occurrence":2,"closed":false,"closers":[]}'
call entry.list tc57-u
answer; wantvals entries slug '"2026-09-20-repeat" "2026-09-20-between" "2026-09-20-closer" "2026-09-20-after" "2026-09-20-repeat"'; wantvals entries occurrence '1 1 1 1 2'
call session.audit tc57-u
answer; wantout "{\"unit\":\"tc57-u\",\"clean\":true,\"findings\":[{\"code\":\"LEGACY_DUPLICATE_SLUG\",\"severity\":\"warning\",\"slug\":\"$X57\",\"line\":$(posix_line 24),\"detail\":null,\"first_line\":$(posix_line 3),\"occurrence\":2}],\"open_threads\":[{\"slug\":\"$X57\",\"thread\":\"awaits the second answer\",\"line\":$(posix_line 27)}]}"
kv slug "$X57"
rec tc57-u 1790000570 "a new repeat"
refused 1 ERR_ENTITY_EXISTS "entry '$X57' already exists in unit 'tc57-u'"
tc "TC57: a legacy repeated slug reads positionally; the audit warns; a new repeat refuses"
fi

# TC58: a closer naming an absent entry refuses rc1 ERR_ENTITY_NOT_FOUND, nothing written
mk tc58-u; answer
rec tc58-u 1790000580 "a present entry"; answer
call entry.list tc58-u; cp "$O" "$SANDBOX/t58-before"
kv closers.count 1; kcl 1 CLOSES done "gone" 2026-01-01-absent
rec tc58-u 1790000581 "closes nothing"
refused 1 ERR_ENTITY_NOT_FOUND "entry '2026-01-01-absent' not found in unit 'tc58-u'"
call entry.list tc58-u; wantfile "$SANDBOX/t58-before"
tc "TC58: a closer naming an absent entry refuses rc1 ERR_ENTITY_NOT_FOUND, the journal unchanged"

# TC59: generated slugs suffix -1 while the journal holds them, for entries and lane
# entries; a given slug the journal holds refuses ERR_ENTITY_EXISTS
mk tc59-u; answer
rec tc59-u 1790000590 "one"; answer; wantv entry.slug '"2026-09-27-event-1790000590"'
rec tc59-u 1790000590 "two"; answer; wantv entry.slug '"2026-09-27-event-1790000590-1"'
doc "$SANDBOX/recipe.txt"; call lane.create tc59-u l59; answer
kv what "lane one"; kv thread none; kv date "$DATE"; kv epoch 1790000591; call lane.record tc59-u l59
answer; wantv entry.slug '"2026-09-27-event-1790000591"'
kv what "lane two"; kv thread none; kv date "$DATE"; kv epoch 1790000591; call lane.record tc59-u l59
answer; wantv entry.slug '"2026-09-27-event-1790000591-1"'
kv slug 2026-09-27-event-1790000590
rec tc59-u 1790000592 "given and held"
refused 1 ERR_ENTITY_EXISTS "entry '2026-09-27-event-1790000590' already exists in unit 'tc59-u'"
tc "TC59: generated slugs take -1 while held; a held given slug refuses"

# ==============================================================================
# Suite 15: The Data Model (3 test cases on posix, 2 elsewhere)
# ==============================================================================
printf '\n== Suite 15: The Data Model ==\n'

# TC60 (posix alone: the legacy shapes live in hand-written files, legacy.notes names each):
# every item answers its typed fields, the content no schema field holds in its extra
# fields, head text, and extra lines, never its stored bytes; task.get, finding.get,
# entry.get, session.board, session.load, lane.get answer the golden JSON byte for byte
# wantgolden <unit> <dir> <count>: every golden answer of <dir> compared with the function
# its file name calls (or, with COMPLIANCE_WRITE_GOLDENS naming <dir>, the answer written there)
wantgolden() {
  _gn=0
  for _g in "$2"/*.json; do
    _b=$(basename "$_g" .json)
    case "$_b" in
      task.get.*) call task.get "$1" "${_b#task.get.}" ;;
      finding.get.*) call finding.get "$1" "${_b#finding.get.}" ;;
      entry.get.*) call entry.get "$1" "${_b#entry.get.}" ;;
      entry.closure.*) call entry.closure "$1" "${_b#entry.closure.}" ;;
      session.board) call session.board "$1" ;;
      session.load) call session.load "$1" ;;
      entry.list) call entry.list "$1" ;;
      task.list.*) call task.list "$1" "${_b#task.list.}" ;;
      finding.list.*) call finding.list "$1" "${_b#finding.list.}" ;;
      lane.get.*) _r=${_b#lane.get.}; call lane.get "$1" "${_r%.*}" "${_r##*.}" ;;
      *) miss "unknown golden $_b"; continue ;;
    esac
    answer
    if [ "${COMPLIANCE_WRITE_GOLDENS:-}" = "$2" ]; then cp "$O" "$COMPLIANCE_WRITE_GOLDENS/$_b.json"; else wantfile "$_g"; fi
    _gn=$((_gn + 1))
  done
  [ "$_gn" = "$3" ] || miss "compared $_gn goldens of $1, want $3"
}
if [ "$IS_POSIX" -eq 1 ]; then
  plant legacy-u
  wantgolden legacy-u "$FX/golden/legacy-u" 23
  tc "TC60: the legacy fixture answers the golden JSON of every item, the board, the load, and the lanes"
fi

# TC61: the append rule: an entry after an anchor gets one empty line before it, an entry
# after an entry one, a stamped anchor none, the journal no trailing empty line: every
# backend answers each entry with the kind of the item after it (the separator the canonical
# span implies) and no stored bytes, and on posix the journal is the expected bytes
kv objective "The append rule fixture"; kv attention "append rule fixture"; call session.create tc61-u; answer
rec tc61-u 1790000100 "first, after an anchor"; answer
rec tc61-u 1790000101 "second, after an entry"; answer
kv attention "append rule stamp"; call session.stamp tc61-u
answer; wantv receipt.seq 4; wantv receipt.next null; wantno '"verbatim"'
rec tc61-u 1790000102 "third, after a stamped anchor"; answer
for _t61 in "1790000100 2 entry" "1790000101 3 anchor" "1790000102 5 null"; do
  set -- $_t61
  call entry.get tc61-u "2026-09-27-event-$1"
  answer; wantv entry.seq "$2"; wantno '"verbatim"'
  if [ "$3" = null ]; then wantv entry.next null; else wantv entry.next "\"$3\""; fi
done
call entry.list tc61-u
answer; wantvals entries anchor '"A1" "A1" "A2"'
if [ "$IS_POSIX" -eq 1 ]; then
  cmp -s "$SANDBOX/.contexture/sessions/tc61-u/journal.md" "$FX/tc61-expected-journal.md" || miss "the posix journal differs from tc61-expected-journal.md"
fi
tc "TC61: the append rule places the separators: each entry canonical with the kind after it (and the posix journal its expected bytes)"

# TC76: one call sequence builds a unit with every canonical item kind (a state with repos
# and a reference, tasks with every section, a completed and a started task, findings with
# refs and a supersession, entries with a group, a rhythm, knowledge, refs, a thread, a
# stamped anchor, a multi-target closer, lanes with and without a report), the same on
# every backend; its read answers equal the goldens of tests/fixtures/compliance/golden/verb-u
# byte for byte, so posix and fts5 are held to the same answers for the same writes
VU=verb-u
mk verb-ref; answer
kv objective "The verb fixture unit"; kl repos alpha beta; kv attention "verb fixture"; call session.create "$VU"; answer
call session.refs "$VU" verb-ref; answer
kv objective "Every section filled"; kl refs "journal#2026-09-27-verb-one" "knowledge#VERB_CANON"
kv desc "$(printf 'first description line\n\nthird line after an empty one')"; kv criteria "one criterion"; kv details "$(printf 'detail one\ndetail two')"
call task.add "$VU" canon-task; answer
kv objective "Only an objective"; call task.add "$VU" plain-task; answer
kv objective "Completed in the walk"; call task.add "$VU" done-task; answer
kv evidence "the walk verified it"; kv date "$DATE"; call task.complete "$VU" done-task; answer
kv objective "Started in the walk"; call task.add "$VU" active-task; answer
kv pointer "active-task IN_PROGRESS: the verb walk"; call task.start "$VU" active-task; answer
kv summary "$(printf 'a canonical finding\nover two lines')"; kl refs "journal#2026-09-27-verb-one"; call finding.add "$VU" VERB_CANON; answer
kv summary "the older reading"; call finding.add "$VU" VERB_OLD; answer
kv summary "the newer reading"; kv reason "replaced by the walk"; call finding.supersede "$VU" VERB_OLD VERB_NEW; answer
kv slug 2026-09-27-verb-one; kv group verb-group; kv rhythm probe; kv knowledge true; kl refs "task#canon-task" "lanes/verb-lane/report"
rec "$VU" 1790000761 "the first verb entry" "the human"; answer
kv slug 2026-09-27-verb-two; kv group verb-group; rec "$VU" 1790000762 "the second verb entry"; answer
kv slug 2026-09-27-verb-three; rec "$VU" 1790000763 "the third verb entry"; answer
kv attention "verb stamp"; call session.stamp "$VU"; answer
kv slug 2026-09-27-verb-four; kv closers.count 1; kcl 1 CLOSES folded "read together" 2026-09-27-verb-two 2026-09-27-verb-three
rec "$VU" 1790000764 "folds the second and the third"; answer
printf '# recipe grammar\nMISSION\n  GOAL: "walk the verbs"\n' > "$SANDBOX/tc76-recipe.txt"
doc "$SANDBOX/tc76-recipe.txt"; call lane.create "$VU" verb-lane; answer
kv what "a lane step"; kv thread none; kl refs "task#canon-task"; kv slug 2026-09-27-verb-lane-one; kv date "$DATE"; kv epoch 1790000765; call lane.record "$VU" verb-lane; answer
printf '@claim one\n  the walk landed, a \\ backslash and a "quote"\n' > "$SANDBOX/tc76-report.txt"
doc "$SANDBOX/tc76-report.txt"; call lane.write_report "$VU" verb-lane; answer
printf '# a quiet lane\n' > "$SANDBOX/tc76-quiet.txt"
doc "$SANDBOX/tc76-quiet.txt"; call lane.create "$VU" quiet-lane; answer
wantgolden "$VU" "$FX/golden/verb-u" 23
tc "TC76: the verb-built unit answers the golden JSON of every item, the lists, the board, the load, and the lanes, the same on every backend"

# ==============================================================================
# Suite 16: The Audit (2 test cases)
# ==============================================================================
printf '\n== Suite 16: The Audit ==\n'

# TC63: the record checks a verb-built unit can carry, on every backend: an unharvested
# KNOWLEDGE entry and an entry without THREAD (dated after the thread rule) each yield
# exactly their finding; a clean unit answers clean true with its open threads
wantaudit() {
  call session.audit "$1"
  answer; wantout "{\"unit\":\"$1\",\"clean\":false,\"findings\":[{\"code\":\"$2\",\"severity\":\"error\",\"slug\":\"$3\",\"line\":$4,\"detail\":$5,\"first_line\":null,\"occurrence\":null}],\"open_threads\":[]}"
}
# m63 <unit> <attention>: a fixture unit at A1
m63() { kv objective "the $1 fixture"; kv attention "$2"; call session.create "$1"; answer; }
m63 tc63-unharvested "unharvested knowledge fixture"
kv slug 2026-09-20-flagged; kv knowledge true; rec tc63-unharvested 1790000631 "a knowledge flag no closer names"; answer
wantaudit tc63-unharvested UNHARVESTED_KNOWLEDGE 2026-09-20-flagged "$(posix_line 3)" null
m63 tc63-thread "missing thread fixture"
printf 'what=an entry dated after the thread rule without THREAD\nslug=2026-09-20-threadless\ndate=%s\nepoch=1790000632\n' "$DATE" > "$P"
call entry.record tc63-thread; answer; wantv entry.thread null
wantaudit tc63-thread MISSING_THREAD 2026-09-20-threadless "$(posix_line 3)" null
m63 tc63-clean "clean fixture"
kv slug 2026-09-20-asked; rec tc63-clean 1790000633 "a question to the human, answered below" "the human's answer"; answer
kv slug 2026-09-20-open; rec tc63-clean 1790000634 "a dispatch still awaited" "lane review report"; answer
kv slug 2026-09-20-answered; kv closers.count 1; kcl 1 CLOSES done "the human answered" 2026-09-20-asked
rec tc63-clean 1790000635 "the human answered"; answer
call session.audit tc63-clean
answer; wantout "{\"unit\":\"tc63-clean\",\"clean\":true,\"findings\":[],\"open_threads\":[{\"slug\":\"2026-09-20-open\",\"thread\":\"lane review report\",\"line\":$(posix_line 11)}]}"
tc "TC63: each record check a verb-built unit can carry yields exactly its finding; a clean unit answers its open threads"

# TC77 (posix alone: the functions refuse to write these shapes, so only a hand-written
# file holds them): a closer naming an entry the journal lacks, a DONE task without its
# receipt, an IN_PROGRESS task the state does not name each yield exactly their finding
if [ "$IS_POSIX" -eq 1 ]; then
  plant tc63-dangling; wantaudit tc63-dangling DANGLING_CLOSER 2026-09-20-closer-a 7 '"2026-09-19-absent-target"'
  plant tc63-done; wantaudit tc63-done DONE_WITHOUT_EVENT t-done null null
  plant tc63-inprogress; wantaudit tc63-inprogress IN_PROGRESS_ABSENT_FROM_STATE t-active null null
  tc "TC77: the record checks only legacy text carries (a dangling closer, DONE without its event, IN_PROGRESS absent from the state) yield exactly their finding"
fi

# TC64 (posix alone: broken text only a hand-written file holds): the posix grammar
# checks: planted files yield DATELESS_SLUG, INLINE_MARKER, BRACKETED_FIELD,
# SLUGLESS_CLOSER with their lines
if [ "$IS_POSIX" -eq 1 ]; then
  plant tc64-u
  call session.audit tc64-u
  answer; wantout '{"unit":"tc64-u","clean":false,"findings":[{"code":"DATELESS_SLUG","severity":"error","slug":"legacy-dateless","line":3,"detail":null,"first_line":null,"occurrence":null},{"code":"INLINE_MARKER","severity":"error","slug":"2026-09-20-inline","line":7,"detail":null,"first_line":null,"occurrence":null},{"code":"BRACKETED_FIELD","severity":"error","slug":"2026-09-20-bracketed","line":14,"detail":"[THREAD: none]","first_line":null,"occurrence":null},{"code":"SLUGLESS_CLOSER","severity":"error","slug":"2026-09-20-slugless","line":19,"detail":null,"first_line":null,"occurrence":null}],"open_threads":[]}'
  tc "TC64: the posix grammar checks answer with their lines on posix"
fi

# ==============================================================================
# Suite 17: Units and References (4 test cases)
# ==============================================================================
printf '\n== Suite 17: Units and References ==\n'

# TC65: session.refs refuses an absent unit, answers a valid list exactly, and an empty
# call answers []; session.load answers ref_sessions null, then the list, then [];
# session.refload answers the named units and refuses an absent one
mk tc65-u; answer
call session.load tc65-u; answer; wantv state.ref_sessions null; wantv refs '[0]'
call session.refs tc65-u no-such-ref
refused 1 ERR_ENTITY_NOT_FOUND "unit 'no-such-ref' not found"
mk tc65-ref; answer
call session.refs tc65-u tc65-ref "$TUNIT"
answer; wantout '{"unit":"tc65-u","ref_sessions":["tc65-ref","compliance-tasks"]}'
call session.load tc65-u
answer; wantvals state.ref_sessions "" '"tc65-ref" "compliance-tasks"'; wantv refs '[2]'; wantv refs.1.unit '"tc65-ref"'; wantv refs.1.present true
wantv refs.1.knowledge '{preamble,findings}'; wantv refs.1.knowledge.preamble '""'; wantv refs.1.board.unit '"tc65-ref"'; wantv refs.2.unit '"compliance-tasks"'
call session.refload tc65-ref "$TUNIT"
answer; wantvals refs unit '"tc65-ref" "compliance-tasks"'; wantv refs.2.knowledge.findings '[2]'; wantv refs.2.knowledge.findings.1.name '"FINDING_ALPHA"'
call session.refload tc65-ref no-such-ref
refused 1 ERR_ENTITY_NOT_FOUND "unit 'no-such-ref' not found"
call session.refs tc65-u
answer; wantout '{"unit":"tc65-u","ref_sessions":[]}'
call session.load tc65-u; answer; wantv state.ref_sessions '[0]'; wantv refs '[0]'
tc "TC65: session.refs checks every named unit; load and refload answer the references"

# TC66: session.close only from ACTIVE, session.reopen only from CLOSED
mk tc66-u; answer
call session.close tc66-u; answer; wantv status '"CLOSED"'
call session.close tc66-u
refused 1 ERR_INVALID_TRANSITION "unit 'tc66-u' is CLOSED; session.close moves only from ACTIVE"
call session.reopen tc66-u
answer; wantout '{"unit":"tc66-u","status":"ACTIVE"}'
call session.reopen tc66-u
refused 1 ERR_INVALID_TRANSITION "unit 'tc66-u' is ACTIVE; session.reopen moves only from CLOSED"
call session.load tc66-u; answer; wantv state.status '"ACTIVE"'
tc "TC66: session.close and session.reopen refuse the move they cannot make"

# TC67: the three-unit fixture, built through the functions: session.units answers the
# units touching a repo (ACTIVE and CLOSED) and every known repo; session.refs_to answers
# the referrers. tc67-c lists tc67-aardvark after tc67-gamma, so the repos in unit order are
# not sorted and an unsorted known_repos fails the case (lanes/si-b5-base-review/report, B2
# @open 6)
kv objective "Unit c of three"; kl repos tc67-gamma tc67-aardvark; kv attention "tc67-c fixture"; call session.create tc67-c; answer
kv objective "Unit a of three"; kl repos tc67-alpha tc67-beta; kv attention "tc67-a fixture"; call session.create tc67-a; answer
kv objective "Unit b of three"; kl repos tc67-beta; kv attention "tc67-b fixture"; call session.create tc67-b; answer
call session.refs tc67-a tc67-c; answer
call session.refs tc67-b tc67-a tc67-c; answer
kv pointer "closed unit b"; call session.next tc67-b; answer
call session.close tc67-b; answer; wantv status '"CLOSED"'
call session.list
answer
_t67_known=$(awk 'index($0, "units.") == 1 { k = $0; sub(/=.*$/, "", k); if (k ~ /^units\.[0-9]+\.repos\.[0-9]+$/) print substr($0, length(k) + 2) }' "$F" | LC_ALL=C sort -u | tr '\n' ' ' | sed 's/ $//')
call session.units tc67-beta
answer; wantv repo '"tc67-beta"'; wantvals units unit '"tc67-a" "tc67-b"'
wantv units.1 '{unit,status,current_anchor,next_action,objective,repos,ref_sessions,extra_fields,extra_lines}'
wantvals units status '"ACTIVE" "CLOSED"'; wantvals units.1.repos "" '"tc67-alpha" "tc67-beta"'; wantvals units.2.ref_sessions "" '"tc67-a" "tc67-c"'
wantvals known_repos "" "$_t67_known"
case " $_t67_known " in *' "tc67-alpha" "tc67-beta" "tc67-gamma" '*) ;; *) miss "known repos [$_t67_known]" ;; esac
call session.units tc67-gamma
answer; wantvals units unit '"tc67-c"'; wantv units.1.ref_sessions null
call session.units tc67-nowhere
answer; wantv units '[0]'; wantvals known_repos "" "$_t67_known"
call session.refs_to tc67-c
answer; wantout '{"unit":"tc67-c","referrers":["tc67-a","tc67-b"]}'
call session.refs_to tc67-a
answer; wantout '{"unit":"tc67-a","referrers":["tc67-b"]}'
call session.refs_to tc67-b
answer; wantout '{"unit":"tc67-b","referrers":[]}'
tc "TC67: session.units and session.refs_to answer the three-unit fixture"

# TC68: entry.closure answers every later closer naming the entry, in journal order
ZETA=2026-09-27-event-1790000060
kv closers.count 1; kcl 1 SUPERSEDES superseded "a second closer" "$GAMMA"
rec "$TUNIT" 1790000060 "Supersedes gamma again"
answer
call entry.closure "$TUNIT" "$GAMMA"
answer; wantout "{\"unit\":\"compliance-tasks\",\"slug\":\"$GAMMA\",\"occurrence\":1,\"closed\":true,\"closers\":[{\"by\":\"$EPS\",\"by_anchor\":\"A1\",\"closer\":{\"kind\":\"CLOSES\",\"targets\":[\"$GAMMA\",\"$DELTA\"],\"verdict\":\"folded\",\"reason\":\"two at once\",\"extra_text\":null}},{\"by\":\"$ZETA\",\"by_anchor\":\"A1\",\"closer\":{\"kind\":\"SUPERSEDES\",\"targets\":[\"$GAMMA\"],\"verdict\":\"superseded\",\"reason\":\"a second closer\",\"extra_text\":null}}]}"
call entry.closure "$TUNIT" "$OTHER"
answer; wantout "{\"unit\":\"compliance-tasks\",\"slug\":\"$OTHER\",\"occurrence\":1,\"closed\":false,\"closers\":[]}"
call entry.closure "$TUNIT" 2026-01-01-absent
refused 1 ERR_ENTITY_NOT_FOUND "entry '2026-01-01-absent' not found in unit 'compliance-tasks'"
tc "TC68: entry.closure answers every later closer with its entry, anchor, and closer"

# ==============================================================================
# Suite 18: The Contract Surface (6 test cases)
# ==============================================================================
printf '\n== Suite 18: The Contract Surface ==\n'

# TC69 (posix alone: the legacy fixture of TC60): the exact rule over legacy text: the
# fixed query set answers its fixed results; --mode=exact answers the same as no mode
if [ "$IS_POSIX" -eq 1 ]; then
_t69_n=0
while IFS='|' read -r _q _lim _ent _want; do
  kv query "$_q"
  set --
  [ -n "$_lim" ] && set -- "--limit=$_lim"
  [ -n "$_ent" ] && set -- "$@" "--entity=$_ent"
  call search.query legacy-u "$@"
  answer; wantout "$_want"
  _t69_n=$((_t69_n + 1))
done < "$FX/tc69-exact.answers"
[ "$_t69_n" = 8 ] || miss "ran $_t69_n queries, want 8"
kv query legacy
call search.query legacy-u --mode=exact
answer; wantout "$(sed -n '1s/^legacy|||//p' "$FX/tc69-exact.answers")"
tc "TC69: the exact query set over legacy text answers its fixed results; --mode=exact answers the same"
fi

# TC70: the descriptor declares contract 2, every one of the 38 functions and nothing
# retired (unit.export and unit.import among the retired), exact among the search modes,
# and only known optional capabilities
call capability
answer; wantkeys @ "driver,version,contract,functions,search_modes,optional"; wantv contract '"2"'
case "$(jv version)" in '"'[0-9]*.[0-9]*.[0-9]*'"') ;; *) miss "version [$(jv version)]" ;; esac
case "$(jv driver)" in '""'|'') miss "the descriptor names no driver" ;; esac
_t70_fns=" $(vals functions | tr -d '"') "
for _f in $FUNCS38; do
  case "$_t70_fns" in *" $_f "*) ;; *) miss "functions lacks $_f" ;; esac
done
for _f in $_t70_fns; do
  case " $FUNCS38 $CORPUS6 " in *" $_f "*) ;; *) miss "functions declares $_f, outside contract 2" ;; esac
done
case " $(vals search_modes) " in *' "exact" '*) ;; *) miss "search_modes lacks exact [$(vals search_modes)]" ;; esac
for _f in $(vals optional | tr -d '"'); do
  case "$_f" in corpus.store|corpus.changelog) ;; *) miss "optional declares $_f" ;; esac
done
tc "TC70: the descriptor declares contract 2 with the 38 functions and exact search"

# TC71: lane.create refuses an existing lane with the recipe unchanged; a lane without a
# report answers content null and its empty journal preamble "" with no item (a journal
# preamble null is legacy text only posix holds: TC60's bare-lane golden); an absent lane
# refuses
printf '# another recipe\n' > "$SANDBOX/recipe2.txt"
doc "$SANDBOX/recipe2.txt"
call lane.create "$TUNIT" lane-worker
refused 1 ERR_ENTITY_EXISTS "lane 'lane-worker' already exists in unit 'compliance-tasks'"
call lane.get "$TUNIT" lane-worker recipe
answer; wantout '{"unit":"compliance-tasks","lane":"lane-worker","artifact":"recipe","content":"# recipe grammar\nMISSION\n  GOAL: \"Subagent goal description\"\n"}'
printf '# a bare recipe\n' > "$SANDBOX/recipe3.txt"
doc "$SANDBOX/recipe3.txt"
call lane.create "$TUNIT" bare-lane; answer
call lane.get "$TUNIT" bare-lane journal
answer; wantout '{"unit":"compliance-tasks","lane":"bare-lane","artifact":"journal","preamble":"","items":[]}'
call lane.get "$TUNIT" bare-lane report
answer; wantout '{"unit":"compliance-tasks","lane":"bare-lane","artifact":"report","content":null}'
call lane.get "$TUNIT" no-such-lane recipe
refused 1 ERR_ENTITY_NOT_FOUND "lane 'no-such-lane' not found in unit 'compliance-tasks'"
tc "TC71: lane.create refuses an existing lane; a lane without a report reads content null and an empty journal"

# TC72: a supersedes naming an absent finding refuses; a successor NAME the knowledge
# holds refuses; finding.list active leaves out the superseded finding
mk tc72-u; answer
kv summary "orphan successor"; kv supersedes NO_SUCH
call finding.add tc72-u NEW_F
refused 1 ERR_ENTITY_NOT_FOUND "finding 'NO_SUCH' not found in unit 'tc72-u'"
kv summary "old"; call finding.add tc72-u OLD_F; answer
kv summary "other"; call finding.add tc72-u OTHER_F; answer
kv summary "successor"
call finding.supersede tc72-u OLD_F OTHER_F
refused 1 ERR_ENTITY_EXISTS "finding 'OTHER_F' already exists in unit 'tc72-u'"
kv summary "successor"
call finding.supersede tc72-u OLD_F NEW_F
answer; wantv superseded '"OLD_F"'; wantv finding.name '"NEW_F"'; wantv finding.supersedes.name '"OLD_F"'
call finding.list tc72-u active
answer; wantvals findings name '"OTHER_F" "NEW_F"'
call finding.list tc72-u all
answer; wantvals findings name '"OLD_F" "OTHER_F" "NEW_F"'; wantvals findings active 'false true true'
tc "TC72: supersedes needs its predecessor and a new successor; the active list leaves the superseded out"

# TC73: session.stamp answers A<N> to A<N+1> with the canonical anchor, and the journal
# holds that anchor line
mk tc73-s; answer
kv attention "first stamp"
call session.stamp tc73-s
answer; wantout '{"unit":"tc73-s","previous_anchor":"A1","current_anchor":"A2","receipt":{"kind":"anchor","seq":2,"anchor":"A2","continues":"A1","attention":"first stamp","head_text":null,"extra_lines":[],"next":null}}'
kv query "first stamp"
call search.query tc73-s --mode=exact
answer; wantout '{"unit":"tc73-s","query":"first stamp","mode":"exact","total_matches":1,"results":[{"entity_type":"session","entity_id":"tc73-s","section":"journal","snippet":"@anchor A2 (\"continues A1\", attention: first stamp)","score":0}]}'
call session.load tc73-s; answer; wantv state.current_anchor '"A2"'
tc "TC73: session.stamp answers the canonical anchor, and the journal holds its line"

# TC78 (posix alone: a malformed current_anchor is legacy text the functions never write):
# a stored current_anchor that is not A<N> refuses session.stamp rc2 ERR_STORAGE_CORRUPT,
# the state unchanged, and every write that stamps the anchor into an entry refuses it too
# (entry.record and both receipts), the unit's read answers unchanged: a corrupt anchor
# never spreads into new entries
if [ "$IS_POSIX" -eq 1 ]; then
  plant tc73-u
  kv attention "never lands"
  call session.stamp tc73-u
  refused_like 2 ERR_STORAGE_CORRUPT
  call session.load tc73-u
  answer; wantv state.current_anchor '"Ax"'
  kv objective "anchor probe"; call task.add tc73-u t73-a; answer
  kv objective "anchor probe two"; call task.add tc73-u t73-b; answer
  reads tc73-u "$SANDBOX/t78-before.reads"
  rec tc73-u 1790000730 "never lands"
  refused_like 2 ERR_STORAGE_CORRUPT
  kv evidence "never lands"; kv date "$DATE"; call task.complete tc73-u t73-a
  refused_like 2 ERR_STORAGE_CORRUPT
  kv reason "never lands"; kv date "$DATE"; call task.drop tc73-u t73-b
  refused_like 2 ERR_STORAGE_CORRUPT
  reads tc73-u "$SANDBOX/t78-after.reads"
  cmp -s "$SANDBOX/t78-before.reads" "$SANDBOX/t78-after.reads" || miss "the read answers changed $(firstdiff "$(cat "$SANDBOX/t78-after.reads")" "$(cat "$SANDBOX/t78-before.reads")")"
  tc "TC78: a malformed stored anchor refuses rc2 on session.stamp, entry.record, and the receipts, the unit unchanged"
fi

# TC75: a refusal prints exactly one stderr line in the fixed form and nothing on stdout
call task.get "$TUNIT" no-such-task
refused 1 ERR_ENTITY_NOT_FOUND "task 'no-such-task' not found in unit 'compliance-tasks'"
mk "$TUNIT"
refused 1 ERR_ENTITY_EXISTS "unit 'compliance-tasks' already exists"
rec "$UNIT" 1790000750 "into a closed unit"
refused 1 ERR_UNIT_CLOSED "unit 'compliance-u1' is CLOSED; a closed unit takes no writes"
tc "TC75: refusals print one fixed stderr line and nothing on stdout"

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
