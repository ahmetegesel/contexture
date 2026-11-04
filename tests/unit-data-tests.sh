#!/bin/sh
# unit-data-tests.sh: the unit module's data script cases. Two parts:
#
# 1. the record compliance through the unit module: tests/storage-compliance.sh
#    --data=unit --driver=posix and --driver=fts5 (the same 66 posix and 60 other-backend
#    cases the driver contract pins, run through the data script over the store);
# 2. the module's own cases on both drivers: the canonical refs and the write refusal
#    before anything lands, the file-pointer and legacy-ref exemptions, a claim-shaped
#    unit ref refused, data_get's envelope, the cross-unit read, the active listing, the
#    exact search, the ranked search (fts5 answers with the record identity mapped,
#    posix refuses by name), and the lane artifact ref.
#
# --driver=posix|fts5|both selects the halves (default both); the gate runs the two
# halves as separate concurrent jobs. --smoke runs the module's short representative
# sequence (create, task, entry, finding, lane, searches, one refusal) instead of the
# compliance: the fast inner-loop proof; the full 66/60 stays for the gate and pre-land.
#
# The suites are hermetic: each stages the storage core and the unit module (and the
# fts5 plugin's own driver for the fts5 run) from base/ into its own sandbox under
# .contexture/tmp. No live drawer, no record.
#
# Usage: tests/unit-data-tests.sh [--driver=posix|fts5|both] [--smoke] [--keep]
# Exit codes: 0 every case passed; 1 a case failed; 2 the staging failed.

set -u
SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
KEEP=0
DRIVERS=both
SMOKE=0
for arg in "$@"; do
  case "$arg" in
    --driver=posix|--driver=fts5|--driver=both) DRIVERS=${arg#--driver=} ;;
    --smoke) SMOKE=1 ;;
    --keep) KEEP=1 ;;
    --help|-h) printf 'usage: tests/unit-data-tests.sh [--driver=posix|fts5|both] [--smoke] [--keep]\n'; exit 0 ;;
    *) printf 'unit-data-tests: unknown argument: %s\n' "$arg" >&2; exit 1 ;;
  esac
done
has_driver() { case "$DRIVERS" in both|"$1") return 0 ;; *) return 1 ;; esac; }

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
T=$(mktemp -d "$tmp_root/unit-data.XXXXXX") || { echo "unit-data-tests: cannot create the scratch folder" >&2; exit 2; }
cleanup() { [ "$KEEP" -eq 1 ] && printf 'unit-data-tests: scratch preserved at %s\n' "$T" || rm -rf "$T"; }
trap cleanup EXIT INT TERM

pass=0
fail=0
_tc=""
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
tc() { if [ -z "$_tc" ]; then ok "$1"; else bad "$1 ($_tc)"; fi; _tc=""; }
miss() { _tc="$_tc; $1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_rc() { if [ "$2" -eq "$3" ]; then ok "$1"; else bad "$1 (rc $2 want $3)"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q -- "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }

# ==============================================================================
# Part 1: the record compliance through the unit module, the selected drivers
# ==============================================================================
if [ "$SMOKE" -eq 0 ]; then
printf '== record compliance through the unit module ==\n'
if has_driver posix; then
  sh "$SCRIPT_DIR/storage-compliance.sh" --data=unit --driver=posix > "$T/compliance-posix.out" 2>&1
  _rc=$?
  a_eq "$(tail -n 2 "$T/compliance-posix.out" | head -n 1)" "storage-compliance: 66 passed, 0 failed" "posix: the 66 record cases pass through the data script"
  [ "$_rc" -eq 0 ] || {
    printf '%s\n' "$(grep '^FAIL:' "$T/compliance-posix.out" | tail -n 5)"
    printf '%s\n' "$(tail -n 5 "$T/compliance-posix.out")"
    bad "posix: the compliance suite rc $_rc"
  }
fi
if has_driver fts5; then
  sh "$SCRIPT_DIR/storage-compliance.sh" --data=unit --driver=fts5 > "$T/compliance-fts5.out" 2>&1
  _rc=$?
  a_eq "$(tail -n 2 "$T/compliance-fts5.out" | head -n 1)" "storage-compliance: 60 passed, 0 failed" "fts5: the 60 record cases pass through the data script"
  [ "$_rc" -eq 0 ] || {
    printf '%s\n' "$(grep '^FAIL:' "$T/compliance-fts5.out" | tail -n 5)"
    printf '%s\n' "$(tail -n 5 "$T/compliance-fts5.out")"
    bad "fts5: the compliance suite rc $_rc"
  }
fi
fi

# ==============================================================================
# Part 2: the module's own cases, both drivers
# ==============================================================================
# stage <driver>: the sandbox for one driver
stage() {
  ST="$T/$1"
  mkdir -p "$ST/.contexture/modules"
  cp -R "$ROOT/base/.contexture/storage" "$ST/.contexture/storage" || exit 2
  cp -R "$ROOT/base/.contexture/modules/unit" "$ST/.contexture/modules/unit" || exit 2
  chmod +x "$ST/.contexture/modules/unit/scripts/data" "$ST/.contexture/storage/scripts/"* "$ST/.contexture/storage/drivers/posix/driver" 2>/dev/null || true
  if [ "$1" = "fts5" ]; then
    mkdir -p "$ST/.contexture/extensions/storage/drivers"
    cp -R "$ROOT/plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5" \
      "$ST/.contexture/extensions/storage/drivers/fts5" || exit 2
    chmod +x "$ST/.contexture/extensions/storage/drivers/fts5/driver" 2>/dev/null || true
    printf 'storage.driver: fts5\n' > "$ST/.contexture/config"
  fi
  CTX_STORE_ROOT="$ST"
  CTX_STORE_RESOLVER="$ST/.contexture/storage/scripts/driver-resolver"
  export CTX_STORE_ROOT CTX_STORE_RESOLVER
  DS="$ST/.contexture/modules/unit/scripts/data"
}

# ds <args>: the data script in the staged sandbox; free-text payloads go on stdin
ds() { ( cd "$ST" && "$DS" "$@" ); }
# dg <ref>: the storage core's data_get over the staged sandbox
dg() { ( cd "$ST" && . ./.contexture/storage/scripts/library && data_get "$1" ); }

# dmk <unit>: a fresh unit
dmk() { printf 'objective=unit %s needle\nattention=t\nrepos.count=0\n' "$1" | ds session.create "$1"; }

run_driver() {
  _drv=$1
  stage "$_drv"
  printf '\n== module cases: %s ==\n' "$_drv"
  out=$(dmk u1); a_match "$out" '"status":"ACTIVE"' "$_drv: session.create answers the ACTIVE state"
  out=$(dmk u2); a_match "$out" '"unit":"u2"' "$_drv: a second unit lands"
  printf 'objective=a needle in the first task\nrefs.count=0\n' | ds task.add u1 t1 > "$T/t1.out"
  a_match "$(cat "$T/t1.out")" '"slug":"t1"' "$_drv: task.add answers the task"

  out=$(dg 'unit#u1/task/t1'); a_match "$out" '"ref":"unit#u1/task/t1"' "$_drv: data_get answers the canonical task ref"
  a_match "$out" '"data":{"unit":"u1","task":{"slug":"t1"' "$_drv: data_get carries the task entity"

  dg 'unit#u1/task/missing' > "$T/dg.out" 2> "$T/dg.err"
  a_rc "$_drv: data_get of a missing task refuses rc1" "$?" 1
  a_match "$(cat "$T/dg.err")" "data_get: error: ref 'unit#u1/task/missing': task 'missing' not found in unit 'u1' (ERR_ENTITY_NOT_FOUND)" "$_drv: data_get names the missing target"

  printf 'objective=bad ref task\nrefs.count=1\nrefs.1=unit#u1/task/missing\n' | ds task.add u1 t-bad > "$T/bad.out" 2> "$T/bad.err"
  a_rc "$_drv: a write with a missing canonical ref refuses rc1" "$?" 1
  a_match "$(cat "$T/bad.err")" "task.add: error: ref 'unit#u1/task/missing': task 'missing' not found in unit 'u1' (ERR_ENTITY_NOT_FOUND)" "$_drv: the write re-frames the ref refusal"
  out=$(ds task.list u1 all); case "$out" in *'"slug":"t-bad"'*) miss "the refused write landed" ;; esac; tc "$_drv: the refused write landed nothing"

  printf 'objective=a canonical ref task\nrefs.count=1\nrefs.1=unit#u1/task/t1\n' | ds task.add u1 t-ok > "$T/ok.out"
  a_match "$(cat "$T/ok.out")" '"refs":\["unit#u1/task/t1"\]' "$_drv: a write with a held canonical ref lands"
  printf 'objective=a file pointer task\nrefs.count=1\nrefs.1=docs/the-engine.md#the-unit-module\n' | ds task.add u1 t-file > /dev/null
  a_rc "$_drv: a file pointer ref is exempt" "$?" 0
  printf 'objective=a legacy ref task\nrefs.count=1\nrefs.1=journal#2026-01-01-absent\n' | ds task.add u1 t-legacy > /dev/null
  a_rc "$_drv: a legacy record ref is exempt (forward-only)" "$?" 0

  out=$(ds session.list)
  a_match "$out" '"units":\[{"unit":"u1"' "$_drv: session.list answers the units"
  _act=$(printf '%s' "$out" | awk '{ n += gsub(/"status":"ACTIVE"/, ""); } END { print n + 0 }')
  a_eq "$_act" "2" "$_drv: the active listing counts both ACTIVE units"

  printf 'query=needle\n' | ds search.query u1 --mode=exact > "$T/search.out"
  a_match "$(cat "$T/search.out")" '"entity_type":"session","entity_id":"u1","section":"state"' "$_drv: the exact search answers the session in record order"
  a_match "$(cat "$T/search.out")" '"entity_type":"task","entity_id":"t1","section":"backlog"' "$_drv: the exact search answers the task in record order"
  printf 'query=needle\n' | ds search.query u1 --mode=exact --entity=finding > "$T/search-e.out"
  a_match "$(cat "$T/search-e.out")" '"total_matches":0,"results":\[\]' "$_drv: --entity filters the exact search"

  printf 'objective=a finding\nsummary=a finding summary\nrefs.count=0\n' | ds finding.add u1 F1 > /dev/null
  out=$(dg 'unit#u1/finding/F1'); a_match "$out" '"data":{"unit":"u1","finding":{"name":"F1"' "$_drv: data_get answers the canonical finding ref"

  printf '# a needle lane recipe\n' | ds lane.create u1 l1 > /dev/null
  out=$(dg 'unit#u1/lane/l1/recipe'); a_match "$out" '"artifact":"recipe"' "$_drv: data_get answers the canonical lane artifact ref"
  printf 'what=a needle lane entry\nthread=none\nslug=lane-needle\nrefs.count=0\n' | ds lane.record u1 l1 > /dev/null
  printf 'a needle lane report\n' | ds lane.write_report u1 l1 > /dev/null
  printf 'objective=a lane ref task\nrefs.count=1\nrefs.1=unit#u1/lane/l1/report\n' | ds task.add u1 t-lane > /dev/null
  a_rc "$_drv: a write with a held canonical lane ref lands" "$?" 0
  printf 'objective=a claim ref task\nrefs.count=1\nrefs.1=unit#u1/lane/l1/report#claim\n' | ds task.add u1 t-claim > "$T/claim.out" 2> "$T/claim.err"
  a_rc "$_drv: a claim-shaped unit ref refuses rc1" "$?" 1
  a_match "$(cat "$T/claim.err")" "task.add: error: ref 'unit#u1/lane/l1/report#claim':" "$_drv: the claim-shaped refusal names the ref"
  out=$(ds task.list u1 all); case "$out" in *'"slug":"t-claim"'*) miss "the refused claim ref write landed" ;; esac; tc "$_drv: the refused claim ref landed nothing"

  printf 'what=an entry\nthread=none\ndate=2026-11-03\nepoch=1793687300\nrefs.count=0\n' | ds entry.record u1 > "$T/entry.out"
  _slug=$(sed -n 's/.*"slug":"\([^"]*\)".*/\1/p' "$T/entry.out" | head -n 1)
  out=$(dg "unit#u1/entry/$_slug"); a_match "$out" '"data":{"unit":"u1","entry":{"kind":"entry"' "$_drv: data_get answers the canonical entry ref"

  printf 'objective=ref target task\nrefs.count=0\n' | ds task.add u2 t2 > /dev/null
  ds session.refs u1 u2 > /dev/null
  out=$(ds session.load u1)
  a_match "$out" '"ref_sessions":\["u2"\]' "$_drv: session.refs sets the read-only session"
  a_match "$out" '"refs":\[{"unit":"u2"' "$_drv: session.load reads the referenced unit"
  out=$(ds session.load u2)
  case "$out" in *'"unit":"u1"'*) miss "the cross-unit read leaked u1 into u2" ;; esac
  tc "$_drv: the per-unit read stays inside its unit"

  printf 'query=needle\n' | ds search.query u1 --mode=hybrid > "$T/hyb.out" 2> "$T/hyb.err"
  if [ "$_drv" = "fts5" ]; then
    a_rc "$_drv: the ranked search answers rc0" "$?" 0
    a_match "$(cat "$T/hyb.out")" '"mode":"hybrid"' "$_drv: the ranked search keeps the mode"
    a_match "$(cat "$T/hyb.out")" '"entity_type":"session","entity_id":"u1","section":"state"' "$_drv: the ranked search maps the session default document to the unit"
    a_match "$(cat "$T/hyb.out")" '"entity_type":"task","entity_id":"t1"' "$_drv: the ranked search carries the task identity"
    a_match "$(cat "$T/hyb.out")" '"entity_type":"lane","entity_id":"l1","section":"lane_recipe"' "$_drv: the ranked search maps a lane document to the lane"
    a_match "$(cat "$T/hyb.out")" '"entity_type":"lane","entity_id":"l1","section":"lane_report"' "$_drv: the ranked search maps a lane report to the lane"
    a_match "$(cat "$T/hyb.out")" '"entity_type":"lane_entry","entity_id":"l1/lane-needle"' "$_drv: the ranked search prefixes a lane entry with its lane"
  else
    a_rc "$_drv: the ranked search refuses rc1" "$?" 1
    a_match "$(cat "$T/hyb.err")" "search.query: error: mode 'hybrid' is not supported; declared modes: exact (ERR_CAPABILITY_UNSUPPORTED)" "$_drv: the ranked refusal names the driver's modes"
  fi
}

# run_smoke <driver>: the fast representative sequence for the inner loop (the same data
# script and store path as the full cases, a fraction of the calls)
run_smoke() {
  _drv=$1
  stage "$_drv"
  printf '\n== smoke cases: %s ==\n' "$_drv"
  out=$(dmk s1); a_match "$out" '"status":"ACTIVE"' "$_drv: session.create answers the ACTIVE state"
  printf 'objective=a smoke task\nrefs.count=0\n' | ds task.add s1 s-t1 > "$T/s-t1.out"
  a_match "$(cat "$T/s-t1.out")" '"slug":"s-t1"' "$_drv: task.add answers the task"
  out=$(ds task.list s1 all); a_match "$out" '"slug":"s-t1"' "$_drv: task.list answers the task"
  out=$(dg 'unit#s1/task/s-t1'); a_match "$out" '"ref":"unit#s1/task/s-t1"' "$_drv: data_get answers the canonical task ref"
  dg 'unit#s1/task/missing' > /dev/null 2> "$T/s-miss.err"
  a_rc "$_drv: data_get of a missing task refuses rc1" "$?" 1
  a_match "$(cat "$T/s-miss.err")" "data_get: error: ref 'unit#s1/task/missing': task 'missing' not found in unit 's1' (ERR_ENTITY_NOT_FOUND)" "$_drv: data_get names the missing target"
  printf 'what=a smoke entry\nthread=none\ndate=2026-11-03\nepoch=1793687300\nrefs.count=0\n' | ds entry.record s1 > "$T/s-entry.out"
  _slug=$(sed -n 's/.*"slug":"\([^"]*\)".*/\1/p' "$T/s-entry.out" | head -n 1)
  out=$(dg "unit#s1/entry/$_slug"); a_match "$out" '"data":{"unit":"s1","entry":{"kind":"entry"' "$_drv: data_get answers the canonical entry ref"
  printf 'objective=a smoke finding\nsummary=a smoke summary\nrefs.count=0\n' | ds finding.add s1 SF1 > /dev/null
  a_rc "$_drv: finding.add lands" "$?" 0
  printf '# a smoke recipe\nMISSION\n  GOAL: "walk the smoke"\n' | ds lane.create s1 sl1 > /dev/null
  a_rc "$_drv: lane.create lands" "$?" 0
  printf 'what=a smoke lane entry\nthread=none\nslug=smoke-lane\nrefs.count=0\n' | ds lane.record s1 sl1 > /dev/null
  a_rc "$_drv: lane.record lands" "$?" 0
  printf 'a smoke lane report needle\n' | ds lane.write_report s1 sl1 > /dev/null
  a_rc "$_drv: lane.write_report lands" "$?" 0
  out=$(ds lane.get s1 sl1 report); a_match "$out" 'a smoke lane report needle' "$_drv: lane.get answers the report"
  printf 'query=smoke\n' | ds search.query s1 --mode=exact > "$T/s-search.out"
  a_match "$(cat "$T/s-search.out")" '"entity_type":"task","entity_id":"s-t1","section":"backlog"' "$_drv: the exact search answers the task in record order"
  printf 'query=smoke\n' | ds search.query s1 --mode=hybrid > "$T/s-hyb.out" 2> "$T/s-hyb.err"
  if [ "$_drv" = "fts5" ]; then
    a_rc "$_drv: the ranked search answers rc0" "$?" 0
    a_match "$(cat "$T/s-hyb.out")" '"mode":"hybrid"' "$_drv: the ranked search keeps the mode"
  else
    a_rc "$_drv: the ranked search refuses rc1" "$?" 1
    a_match "$(cat "$T/s-hyb.err")" "search.query: error: mode 'hybrid' is not supported; declared modes: exact (ERR_CAPABILITY_UNSUPPORTED)" "$_drv: the ranked refusal names the driver's modes"
  fi
}

if [ "$SMOKE" -eq 1 ]; then
  for _d in posix fts5; do has_driver "$_d" && run_smoke "$_d"; done
else
  for _d in posix fts5; do has_driver "$_d" && run_driver "$_d"; done
fi

printf '\n== summary ==\n'
printf 'unit-data-tests: pass=%s fail=%s\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
