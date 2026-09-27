#!/usr/bin/env sh
# store-cases.sh <sandbox>: the delta-source cases, run by tests/run.sh inside its staged sandbox
# on the configured driver; every branch keys on the declared corpus.changelog, never on the
# driver's name.
#
# check: the check's two modes over planted deltas on the sample corpus. With a change log
#   (the store mode, delta_source=log) a workspace doc riding freshens nothing its own sources
#   do not claim (STALE, no FRESH (BLANKET), no ARCH-COVERED) and a claimed file whose claimant
#   is untracked reads STALE (no UNTRACKED CLAIMANT); the claiming doc riding reads FRESH.
#   Without one (the files driver, the git mode) the blanket and the untracked-claimant
#   verdict stay as they were.
# changes and gate: a workspace of its own made from the sandbox (its drawer copied, so the
#   same driver and, on a store, the same store), its own git repository, and a unit doc
#   gw-unit whose sources claim src/gw.sh. With a change log: ctx docs changes prints A for
#   the doc created under the current HEAD, nothing once a commit moves HEAD, A again through
#   --since=<the earlier HEAD>, M after a write, D after a remove of a doc older than the
#   window, and refuses a bad flag and an unknown revision; the gate composes the two halves:
#   clean, STALE on a code change alone, FRESH once the doc is written under the same HEAD,
#   clean again after a commit, and STALE when a lingering docs/workspace/gw-unit.md file (not
#   the corpus) sits beside a new code change. Without one: ctx docs changes refuses rc 1
#   naming git, and the gate reads the corpus from git: STALE on a code change alone once the
#   doc is committed, FRESH once the write modifies the doc file.
# Exit 0 when every case passes, 1 otherwise.

set -u
SB=$1
cd "$SB" || exit 1
R="$SB/.contexture/modules/session/scripts/driver-resolver"
PASS=0
FAIL=0
LOG=0
"$R" has corpus.changelog && LOG=1
O="$SB/store-cases.scratch"
rm -rf "$O"
mkdir -p "$O" || exit 1

verdict() {
  if [ -z "$2" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL $1: $2"
  fi
}
# has <file> <text>: the file carries the text as a fixed string
has() { grep -qF -- "$2" "$1"; }

# ---- check: the two modes over planted deltas (the sample's order-flow claims src/order/**)
ck() { printf "$1" | "$SB/.contexture/ctx" docs check demo-orders demo-web workspace > "$O/ck.out" 2>&1; }
D_BLANKET='M\tprojects/demo-orders/src/order/validate.ts\nM\tdocs/workspace/system-map.md\n'
D_ALONE='M\tprojects/demo-orders/src/order/validate.ts\n'
D_RIDES='M\tprojects/demo-orders/src/order/validate.ts\nM\tdocs/demo-orders/order-flow.md\n'
if [ "$LOG" -eq 1 ]; then
  ck "$D_BLANKET"; rc=$?; why=""
  [ "$rc" -eq 1 ] || why="rc=$rc (want 1)"
  has "$O/ck.out" 'STALE DOC: demo-orders/order-flow' || why="$why; no STALE DOC"
  has "$O/ck.out" 'BLANKET' && why="$why; the blanket printed"
  has "$O/ck.out" 'ARCH-COVERED' && why="$why; ARCH-COVERED printed"
  verdict "check log: a workspace doc riding freshens nothing its sources do not claim" "$why"
  ck "$D_ALONE"; rc=$?; why=""
  [ "$rc" -eq 1 ] || why="rc=$rc (want 1)"
  has "$O/ck.out" 'STALE DOC: demo-orders/order-flow' || why="$why; no STALE DOC"
  has "$O/ck.out" 'UNTRACKED CLAIMANT' && why="$why; UNTRACKED CLAIMANT printed"
  verdict "check log: an untracked claimant reads STALE" "$why"
else
  ck "$D_BLANKET"; rc=$?; why=""
  [ "$rc" -eq 0 ] || why="rc=$rc (want 0)"
  has "$O/ck.out" 'FRESH (BLANKET): demo-orders > order-flow' || why="$why; no FRESH (BLANKET)"
  has "$O/ck.out" 'ARCH-COVERED: 1 file(s)' || why="$why; no ARCH-COVERED"
  verdict "check git: the blanket stays reported" "$why"
  ck "$D_ALONE"; rc=$?; why=""
  [ "$rc" -eq 0 ] || why="rc=$rc (want 0)"
  has "$O/ck.out" 'UNTRACKED CLAIMANT: demo-orders/order-flow' || why="$why; no UNTRACKED CLAIMANT"
  verdict "check git: an untracked claimant stays process-owned" "$why"
fi
ck "$D_RIDES"; rc=$?; why=""
[ "$rc" -eq 0 ] || why="rc=$rc (want 0)"
has "$O/ck.out" 'FRESH: demo-orders > order-flow (doc updated in change delta)' || why="$why; no FRESH"
verdict "check: the claiming doc riding reads FRESH" "$why"

# ---- changes and gate: a workspace of its own with its own git repository
GW="$O/gw"
mkdir -p "$GW/src"
cp -R "$SB/.contexture" "$GW/.contexture"
rm -rf "$GW/.contexture/tmp"
X="$GW/.contexture/ctx"
g() { git -C "$GW" -c user.name=suite -c user.email=suite@example.invalid "$@"; }
gate() { (cd "$GW" && "$X" docs gate) > "$O/gate.out" 2>&1; }
chg() { (cd "$GW" && "$X" docs changes "$@") > "$O/chg.out" 2> "$O/chg.err"; }
printf 'echo gw\n' > "$GW/src/gw.sh"
printf '.contexture/\n' > "$GW/.gitignore"
g init -q && g add -A && g commit -qm h0
H0=$(git -C "$GW" rev-parse HEAD)
(cd "$GW" && "$X" docs new workspace gw-unit --kind=capability --description="the suite's own unit" --sources=src/gw.sh --keywords=gw) > "$O/new.out" 2>&1
rc=$?
verdict "gw: docs new" "$( [ "$rc" -eq 0 ] || echo "rc=$rc: $(head -c 300 "$O/new.out")")"

if [ "$LOG" -eq 1 ]; then
  chg; rc=$?
  verdict "changes: A for the doc created under the current HEAD" "$( [ "$rc" -eq 0 ] && [ "$(cat "$O/chg.out")" = "$(printf 'A\tdocs/workspace/gw-unit.md')" ] || echo "rc=$rc out=[$(cat "$O/chg.out")]")"
  g commit -q --allow-empty -m h1
  chg; rc=$?
  verdict "changes: a commit empties the window" "$( [ "$rc" -eq 0 ] && [ ! -s "$O/chg.out" ] || echo "rc=$rc out=[$(cat "$O/chg.out")]")"
  chg --since="$H0"; rc=$?
  verdict "changes: --since brings the earlier HEAD back" "$( [ "$rc" -eq 0 ] && [ "$(cat "$O/chg.out")" = "$(printf 'A\tdocs/workspace/gw-unit.md')" ] || echo "rc=$rc out=[$(cat "$O/chg.out")]")"
  gate; rc=$?
  verdict "gate store: clean" "$( [ "$rc" -eq 0 ] || echo "rc=$rc: $(tail -3 "$O/gate.out")")"
  printf 'echo gw2\n' > "$GW/src/gw.sh"
  gate; rc=$?; why=""
  [ "$rc" -eq 1 ] || why="rc=$rc (want 1)"
  has "$O/gate.out" 'STALE DOC: workspace/gw-unit' || why="$why; no STALE DOC"
  verdict "gate store: a code change alone reads STALE" "$why"
  (cd "$GW" && "$X" docs header workspace gw-unit --add-keyword=fresh) > /dev/null 2>&1
  chg; rc=$?
  verdict "changes: M after a write" "$( [ "$rc" -eq 0 ] && [ "$(cat "$O/chg.out")" = "$(printf 'M\tdocs/workspace/gw-unit.md')" ] || echo "rc=$rc out=[$(cat "$O/chg.out")]")"
  gate; rc=$?; why=""
  [ "$rc" -eq 0 ] || why="rc=$rc (want 0)"
  has "$O/gate.out" 'FRESH: workspace > gw-unit' || why="$why; no FRESH"
  verdict "gate store: the doc written under the same HEAD reads FRESH" "$why"
  (cd "$GW" && "$X" docs remove demo-web cart-ui) > /dev/null 2>&1
  chg; rc=$?
  verdict "changes: D after a remove of an older doc" "$( [ "$rc" -eq 0 ] && grep -qx "$(printf 'D\tdocs/demo-web/cart-ui.md')" "$O/chg.out" || echo "rc=$rc out=[$(cat "$O/chg.out")]")"
  g commit -qam h2
  gate; rc=$?; why=""
  [ "$rc" -eq 0 ] || why="rc=$rc (want 0)"
  has "$O/gate.out" '0 modified files' || why="$why; the halves not empty: $(head -3 "$O/gate.out")"
  verdict "gate store: a commit empties both halves" "$why"
  printf 'echo gw3\n' > "$GW/src/gw.sh"
  mkdir -p "$GW/docs/workspace"
  printf '@doc capability gw-unit\n  repo: workspace\n  description: "a lingering file"\n  sources: [src/gw.sh]\n  keywords: [gw]\n' > "$GW/docs/workspace/gw-unit.md"
  gate; rc=$?; why=""
  [ "$rc" -eq 1 ] || why="rc=$rc (want 1)"
  has "$O/gate.out" 'STALE DOC: workspace/gw-unit' || why="$why; no STALE DOC"
  verdict "gate store: a lingering corpus file is not the corpus" "$why"
  chg --bogus; rc1=$?
  chg --since=nosuchrev; rc2=$?
  verdict "changes: a bad flag and an unknown revision refuse rc 1" "$( [ "$rc1" -eq 1 ] && [ "$rc2" -eq 1 ] || echo "rc=$rc1 and $rc2")"
else
  chg; rc=$?
  verdict "changes: the files driver refuses, naming git" "$( [ "$rc" -eq 1 ] && has "$O/chg.err" 'the corpus delta comes from git' || echo "rc=$rc err=[$(head -c 200 "$O/chg.err")]")"
  g add -A && g commit -qm h1
  printf 'echo gw2\n' > "$GW/src/gw.sh"
  gate; rc=$?; why=""
  [ "$rc" -eq 1 ] || why="rc=$rc (want 1)"
  has "$O/gate.out" 'STALE DOC: workspace/gw-unit' || why="$why; no STALE DOC"
  verdict "gate git: a code change alone reads STALE once the doc is committed" "$why"
  (cd "$GW" && "$X" docs header workspace gw-unit --add-keyword=fresh) > /dev/null 2>&1
  gate; rc=$?; why=""
  [ "$rc" -eq 0 ] || why="rc=$rc (want 0)"
  has "$O/gate.out" 'FRESH: workspace > gw-unit' || why="$why; no FRESH"
  verdict "gate git: the doc file modified by the write rides git" "$why"
fi

rm -rf "$O"
echo "store-cases: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
