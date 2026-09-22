#!/bin/sh
# hook-tests.sh: the implicit hook engine suite (promoted from the r1 hook
# fixture). Runs in a hermetic sandbox under the workspace scratch drawer,
# staged from the shipped core (base/.contexture/ctx and its session and run
# modules) plus the committed hook fixture modules under fixtures/hooks/.
#
# It proves the six shipped points end to end: stamp (order, context, stdout
# position), warn-continue at stamp, load-pre/load-post on the main form only,
# the refs form firing none, refresh (board + audit + hooks), the refresh rc
# semantics, task-landing from the append/next/flip gates, close (with no
# refresh hooks), block mode stopping a point rc1, and the help surface hiding
# the internal runner and the boot point.
#
# Usage: tests/hook-tests.sh
# Exit 0 when every case passes; 1 otherwise.
#
# The hook points covered (for the governance presence check): stamp,
# task-landing, close, load-pre, load-post, refresh.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX="$ROOT/base/.contexture/ctx"
FIXTURE_MODULES="$SCRIPT_DIR/fixtures/hooks/modules"

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG

if [ ! -f "$CTX" ]; then
  echo "hook-tests.sh: ctx not found at $CTX" >&2
  exit 1
fi
if [ ! -d "$FIXTURE_MODULES" ]; then
  echo "hook-tests.sh: hook fixture modules not found at $FIXTURE_MODULES" >&2
  exit 1
fi

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SANDBOX=$(mktemp -d "$tmp_root/hook-tests.XXXXXX") || exit 1
cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

mkdir -p "$SANDBOX/.contexture/modules"
cp "$CTX" "$SANDBOX/.contexture/ctx"
cp -R "$ROOT/base/.contexture/modules/session" "$SANDBOX/.contexture/modules/session"
cp -R "$ROOT/base/.contexture/modules/run" "$SANDBOX/.contexture/modules/run"
cp -R "$FIXTURE_MODULES"/. "$SANDBOX/.contexture/modules/"

cd "$SANDBOX" || exit 1
CTX=./.contexture/ctx
chmod +x "$CTX" .contexture/modules/session/scripts/* .contexture/modules/*/hooks/*.sh

pass=0
fail=0
ok() { pass=$((pass + 1)); echo "PASS: $1"; }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }
a_not() { if printf '%s\n' "$1" | grep -q "$2"; then bad "$3 (unwanted match: $2)"; else ok "$3"; fi; }

echo "== S0 bootstrap =="
rm -rf .contexture/sessions
$CTX session bootstrap zz-unit "hooks fixture unit"
a_eq "$?" "0" "S0 bootstrap rc0"

echo "== S1 stamp: order, context, stdout position =="
: > marker.log
out=$($CTX session stamp zz-unit "fixture stamp")
rc=$?
a_eq "$rc" "0" "S1 stamp rc0"
a_eq "$(wc -l < marker.log | tr -d ' ')" "5" "S1 five stamp hooks ran (az a, az b, zc warn, zc after, zz)"
a_eq "$(sed -n 1p marker.log)" "az-stamp-a point=stamp unit=zz-unit anchor=A2 act=none slugs=none form=none page=none" "S1 module sort az before zc/zz, file-name order first"
a_eq "$(sed -n 2p marker.log)" "az-stamp-b point=stamp unit=zz-unit anchor=A2 act=none slugs=none form=none page=none" "S1 file-name order second"
a_match "$(sed -n 3p marker.log)" "^zc-warn-fail point=stamp$" "S1 zc hook (default mode, no fail)"
a_eq "$(sed -n 4p marker.log)" "zc-after point=stamp unit=zz-unit anchor=A2 act=none slugs=none form=none page=none" "S1 zc later hook still runs"
a_eq "$(sed -n 5p marker.log)" "zz-stamp point=stamp unit=zz-unit anchor=A2 act=none slugs=none form=none page=none" "S1 zz module last, CTX_ANCHOR=A2"
a_eq "$(printf '%s\n' "$out" | sed -n 1p)" "HOOK az-stamp-a point=stamp unit=zz-unit anchor=A2 act=none slugs=none form=none page=none" "S1 hook stdout first"
a_eq "$(printf '%s\n' "$out" | tail -n 1)" "transition: A1 -> A2" "S1 transition print last (hook fires mid-verb)"

echo "== S2 stamp warn-continue =="
: > marker.log
err=$(FORCE_FAIL=1 $CTX session stamp zz-unit "fixture warn" 2>&1 >/dev/null)
rc=$?
a_eq "$rc" "0" "S2 warn-continue rc0 (point unaffected)"
a_eq "$(wc -l < marker.log | tr -d ' ')" "5" "S2 five hooks: failing zc warned, remaining ran"
a_match "$(sed -n 3p marker.log)" "^FAIL zc-warn-fail point=stamp$" "S2 failing hook recorded"
a_eq "$(sed -n 4p marker.log)" "zc-after point=stamp unit=zz-unit anchor=A3 act=none slugs=none form=none page=none" "S2 later hook still ran"
a_eq "$(sed -n 5p marker.log)" "zz-stamp point=stamp unit=zz-unit anchor=A3 act=none slugs=none form=none page=none" "S2 later module still ran"
a_match "$err" "hook failed at stamp: zc-warn-test: 10-stamp-fail.sh (rc=3); continuing" "S2 stderr warning present"

echo "== S2b standalone worker skips hooks when CTX_BIN unset/nonexec =="
: > marker.log
awk -f .contexture/modules/session/scripts/stamp zz-unit "direct invocation" >/dev/null
a_eq "$?" "0" "S2b direct awk stamp rc0"
CTX_BIN=/nonexistent-ctx awk -f .contexture/modules/session/scripts/stamp zz-unit "direct invocation 2" >/dev/null
a_eq "$?" "0" "S2b non-exec CTX_BIN skipped silently"
a_eq "$(wc -l < marker.log | tr -d ' ')" "0" "S2b zero hooks fired standalone"

echo "== S3 load main: pre before banner, post after =="
: > marker.log
out=$($CTX session load zz-unit)
rc=$?
a_eq "$rc" "0" "S3 load rc0"
a_eq "$(printf '%s\n' "$out" | sed -n 1p)" "HOOK zb-second point=load-pre unit=zz-unit anchor=none act=none slugs=none form=main page=1" "S3 first stdout line is a load-pre hook"
banner=$(printf '%s\n' "$out" | grep -n '^LOAD COMPLETE\|^LOAD INCOMPLETE' | cut -d: -f1)
pre=$(printf '%s\n' "$out" | grep -n '^HOOK zz-load-pre' | cut -d: -f1)
post=$(printf '%s\n' "$out" | grep -n '^HOOK az-load-post' | cut -d: -f1)
a_match "$banner" '^[0-9][0-9]*$' "S3 LOAD banner line present"
if [ -n "$pre" ] && [ -n "$post" ] && [ -n "$banner" ] && [ "$pre" -lt "$banner" ] && [ "$banner" -lt "$post" ]; then
  ok "S3 ordering: load-pre < LOAD banner ($banner) < load-post"
else
  bad "S3 ordering (pre=$pre banner=$banner post=$post)"
fi
a_eq "$(grep -c 'point=load-pre' marker.log)" "4" "S3 load-pre group: zb pair + zc + zz"
a_eq "$(grep -c 'point=load-post' marker.log)" "2" "S3 load-post group: az + zz"
a_eq "$(grep 'point=load-post' marker.log | sed -n 1p)" "az-load-post point=load-post unit=zz-unit anchor=none act=none slugs=none form=main page=1" "S3 load-post module order az before zz"

echo "== S4 load refs: neither hook fires =="
: > marker.log
out=$($CTX session load refs zz-unit)
rc=$?
a_eq "$rc" "0" "S4 load refs rc0"
a_eq "$(wc -l < marker.log | tr -d ' ')" "0" "S4 refs form fires zero load hooks"
a_not "$out" '^HOOK ' "S4 refs stdout has no hook lines"

echo "== S5 refresh verb: board + audit + refresh hooks =="
: > marker.log
out=$($CTX session refresh zz-unit)
rc=$?
a_eq "$rc" "0" "S5 refresh rc0 (audit rc)"
a_match "$out" "anchor" "S5 board output present"
a_eq "$(wc -l < marker.log | tr -d ' ')" "2" "S5 exactly the two refresh hooks"
a_eq "$(sed -n 1p marker.log)" "az-refresh point=refresh unit=zz-unit anchor=none act=none slugs=none form=none page=none" "S5 az refresh hook"
a_eq "$(sed -n 2p marker.log)" "zz-refresh point=refresh unit=zz-unit anchor=none act=none slugs=none form=none page=none" "S5 zz refresh hook"
a_match "$out" "^HOOK az-refresh point=refresh" "S5 refresh hook stdout flows through the verb"

echo "== S5b refresh block hook fails the verb (audit was clean) =="
: > marker.log
err=$(FORCE_FAIL=1 $CTX session refresh zz-unit 2>&1 >/dev/null)
rc=$?
a_eq "$rc" "1" "S5b refresh rc1 from the block hook"
a_eq "$(wc -l < marker.log | tr -d ' ')" "3" "S5b az + zz ran, zzz block failed"
a_match "$(sed -n 3p marker.log)" "^FAIL zzz-refresh-block-fail point=refresh$" "S5b failing block hook recorded"
a_match "$err" "hook blocked the point at refresh: zzz-block-refresh: 10-fail.sh" "S5b refresh block stderr"

echo "== S6 task-landing gate =="
: > marker.log
printf '@task fix-1\n  STATUS: TODO\n  OBJECTIVE: "fixture task"\n  REFS: []\n  DESCRIPTION ::\n    fixture body\n  ACCEPTANCE CRITERIA ::\n    fixture criterion\n  IMPLEMENTATION DETAILS ::\n    fixture detail\n' | $CTX session append zz-unit >/dev/null
a_eq "$?" "0" "S6 append rc0"
a_eq "$(wc -l < marker.log | tr -d ' ')" "2" "S6 task-landing fires two hooks"
a_eq "$(sed -n 1p marker.log)" "az-task point=task-landing unit=zz-unit anchor=none act=append slugs=fix-1 form=none page=none" "S6 append act+slugs context"
a_eq "$(sed -n 2p marker.log)" "zz-task point=task-landing unit=zz-unit anchor=none act=append slugs=fix-1 form=none page=none" "S6 append zz module"
: > marker.log
$CTX session next zz-unit "fix-1 is next" >/dev/null
a_eq "$(sed -n 1p marker.log)" "az-task point=task-landing unit=zz-unit anchor=none act=next slugs=none form=none page=none" "S6 next act fires with empty slugs"
: > marker.log
$CTX session flip zz-unit progress fix-1 >/dev/null
a_eq "$(sed -n 1p marker.log)" "az-task point=task-landing unit=zz-unit anchor=none act=flip slugs=fix-1 form=none page=none" "S6 flip act+slugs context"
: > marker.log
$CTX session refs zz-unit >/dev/null
a_eq "$(wc -l < marker.log | tr -d ' ')" "0" "S6 refs act fires no task-landing"
: > marker.log
printf 'OBJECTIVE: "fixture task amended"\n' | $CTX session amend zz-unit fix-1 >/dev/null
a_eq "$(wc -l < marker.log | tr -d ' ')" "0" "S6 amend fires no task-landing"

echo "== S7 close: close hooks only, no refresh hooks =="
: > marker.log
out=$($CTX session close zz-unit 2>/dev/null)
rc=$?
a_eq "$rc" "0" "S7 close rc0"
a_eq "$(wc -l < marker.log | tr -d ' ')" "2" "S7 two close hooks"
a_eq "$(sed -n 1p marker.log)" "az-close point=close unit=zz-unit anchor=none act=none slugs=none form=none page=none" "S7 az close hook"
a_eq "$(sed -n 2p marker.log)" "zz-close point=close unit=zz-unit anchor=none act=none slugs=none form=none page=none" "S7 zz close hook"
a_not "$(cat marker.log)" "refresh" "S7 close path fires no refresh hooks"
a_match "$out" "^CLOSED: zz-unit$" "S7 close output intact"

echo "== S8 block mode: first failing block hook stops the point =="
: > marker.log
err=$(FORCE_FAIL=1 $CTX session load zz-unit 2>&1 >out-s8.txt)
rc=$?
out=$(cat out-s8.txt)
a_eq "$rc" "1" "S8 block failure rc1"
a_not "$out" "LOAD COMPLETE" "S8 no banner on blocked point"
a_eq "$(wc -l < marker.log | tr -d ' ')" "1" "S8 only the failing hook recorded (zb second stopped)"
a_match "$(sed -n 1p marker.log)" "^FAIL zb-block-fail point=load-pre$" "S8 first block hook failure"
a_not "$(cat marker.log)" "zz-load-pre" "S8 later modules never ran"
a_match "$err" "hook blocked the point at load-pre: zb-block-test: 10-fail.sh" "S8 block stderr warning"

echo "== S9 help surface: no hooks verb, no boot point, refresh listed =="
h=$($CTX help)
a_not "$h" "_hooks" "S9 help hides the internal runner"
a_not "$h" "hooks" "S9 help names no hooks verb"
sh=$($CTX session help)
a_match "$sh" "close" "S9 session table lists close"
a_match "$sh" "refresh" "S9 session table lists refresh"
hall=$($CTX help --all)
a_not "$hall" "_hooks" "S9 help --all hides the internal runner"
a_not "$hall" "ctx-hook" "S9 help --all carries no hook declarations"
a_match "$hall" "module session:" "S9 help --all renders the session module block"
# the boot point is deferred: the word boot never stands alone in any help
boot_hits=$(printf '%s\n' "$h
$sh
$hall" | grep -Ec '(^|[^[:alnum:]_])boot([^[:alnum:]_]|$)')
a_eq "$boot_hits" "0" "S9 no help surface names a boot point"

echo "== summary =="
echo "hook-tests: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
