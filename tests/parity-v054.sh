#!/bin/sh
# parity-v054.sh: the kept-view parity harness (lanes/storage-interface-design/report
# @rendering KEPT BYTE TARGET PROOF). Two sandboxes over copies of the same units: side A
# runs one base (the v0.54.0 base by default), side B another (the branch base), both on the
# posix driver, whose store the copied unit folders are; per unit it captures every kept
# text view on both sides and compares their content, stdout and exit code together:
#   board, the load (every page of each side, joined), audit, refresh, active (once), task
#   list --status=all, entry list, finding list, search --mode=exact over a fixed query set of
#   12, resolve of every task, finding, and entry (task#, finding#, entry#), lane show of every
#   lane artifact (recipe, journal, report)
# Every item reads in the one canonical layout (backlog end-review-fixes item 4), so a side
# printing an item as stored and a side printing it canonical hold the same content in
# different layouts: two captures compare by their content signatures (tests/lib/content.awk),
# which drop what is layout (carriage returns, blank lines, trailing blanks, the load's page
# scaffolding, the order of an item's fields across labels, a block or a line for one value,
# the quoting of WHAT, OBJECTIVE, REF, the spelling of a REFS list, a closer, an anchor, a
# state key's continuation lines, a search result's snippet, the WRITE SCOPE line each load
# page repeats) and keep every value and every line no field holds; --bytes compares the
# bytes instead.
# A difference is allowed only by a named class; every other difference is the remainder:
#   quote-layout  the query " (a double quote), whose matches are the quoting of the lines
#   write-scope   with --bytes, a load whose only difference is the WRITE SCOPE line (D28)
# Stderr is captured and compared too and reported as information, never as the verdict.
#
# Usage: sh tests/parity-v054.sh --old=<base dir> --new=<base dir> --units=<sessions dir>
#          --out=<dir> [--unit=<u>]... [--jobs=N] [--views=<v,v,...>] [--bytes]
#   a base dir holds .contexture/ctx and .contexture/modules (session, lane, run); the
#   units dir holds one folder per unit (the sessions folder of a workspace, read only,
#   copied); --views limits the views (board, load, audit, refresh, active, tasks,
#   entries, findings, search, resolve, lanes)
# The driver options of v0.55.0's build (--old-driver, --new-driver, --plugins: a store
# driver on one side) retired with unit.export, unit.import, and ctx session migrate: a
# store side held the copied units only once migrate had filled it, and no command moves a
# record between backends now (knowledge#MIGRATION_IS_AGENT_JUDGMENT); posix against a store
# driver is proven by one verb sequence on each (tests/storage-compliance.sh TC76,
# plugins/storage-fts5/tests/test-verbs.sh).
# Exit 0 when the remainder is 0; 1 otherwise; 2 on a harness error.
# The out dir holds cap/<unit>/<view>.{a,b,ea,eb} and the summary in summary.txt.

set -u
export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG CTX_STORAGE_DRIVER CTX_ROOT CTX_DIR CTX_MODULE_DIR CTX_BIN

OLD=""; NEW=""; UNITS=""; OUT=""; JOBS=4; VIEWS=""; BYTES=0
SEL=""
for a in "$@"; do
  case "$a" in
    --old=*) OLD=${a#--old=} ;;
    --new=*) NEW=${a#--new=} ;;
    --units=*) UNITS=${a#--units=} ;;
    --out=*) OUT=${a#--out=} ;;
    --unit=*) SEL="$SEL ${a#--unit=}" ;;
    --jobs=*) JOBS=${a#--jobs=} ;;
    --views=*) VIEWS=",${a#--views=}," ;;
    --bytes) BYTES=1 ;;
    *) echo "parity-v054.sh: unknown argument: $a" >&2; exit 2 ;;
  esac
done
[ -n "$OLD" ] && [ -n "$NEW" ] && [ -n "$UNITS" ] && [ -n "$OUT" ] || { echo "parity-v054.sh: --old, --new, --units, --out required" >&2; exit 2; }
for d in "$OLD" "$NEW"; do
  [ -f "$d/.contexture/ctx" ] && [ -d "$d/.contexture/modules/session" ] || { echo "parity-v054.sh: no base at $d" >&2; exit 2; }
done
[ -d "$UNITS" ] || { echo "parity-v054.sh: no units at $UNITS" >&2; exit 2; }

want() { [ -z "$VIEWS" ] && return 0; case "$VIEWS" in *",$1,"*) return 0 ;; esac; return 1; }

mkdir -p "$OUT" || exit 2
OUT=$(CDPATH="" cd "$OUT" && pwd)
rm -rf "$OUT/a" "$OUT/b" "$OUT/cap" "$OUT/res"
mkdir -p "$OUT/cap" "$OUT/res"

stage() {
  st_side=$1; st_base=$2
  mkdir -p "$OUT/$st_side/.contexture/modules" "$OUT/$st_side/.contexture/sessions"
  cp "$st_base/.contexture/ctx" "$OUT/$st_side/.contexture/ctx"
  chmod 755 "$OUT/$st_side/.contexture/ctx"
  for m in session lane run; do
    [ -d "$st_base/.contexture/modules/$m" ] && cp -R "$st_base/.contexture/modules/$m" "$OUT/$st_side/.contexture/modules/$m"
  done
  for u in "$UNITS"/*; do
    [ -d "$u" ] || continue
    cp -R "$u" "$OUT/$st_side/.contexture/sessions/"
  done
}
stage a "$OLD"
stage b "$NEW"

if [ -n "$SEL" ]; then
  LIST=$SEL
else
  LIST=$(for u in "$UNITS"/*; do [ -d "$u" ] && printf '%s\n' "${u##*/}"; done | sort)
fi

# cap <unit> <view name> <ctx args...>: the view on both sides
cap() {
  cp_u=$1; cp_v=$2
  shift 2
  mkdir -p "$OUT/cap/$cp_u"
  for s in a b; do
    ( cd "$OUT/$s" && ./.contexture/ctx "$@" > "$OUT/cap/$cp_u/$cp_v.$s" 2> "$OUT/cap/$cp_u/$cp_v.e$s" < /dev/null
      printf 'rc=%s\n' "$?" >> "$OUT/cap/$cp_u/$cp_v.$s" )
  done
  printf '%s\t%s\n' "$cp_u" "$cp_v" >> "$OUT/res/$JOB.list"
}

# cap_load <unit>: every load page of each side, in order, joined into one capture per side
# (a side's own page count: a canonical layout can page the same content differently)
cap_load() {
  cl_u=$1
  mkdir -p "$OUT/cap/$cl_u"
  for s in a b; do
    ( cd "$OUT/$s" || exit
      n=$(./.contexture/ctx session load "$cl_u" 1 2>/dev/null < /dev/null | sed -n 's/^LOAD INCOMPLETE (page 1 of \([0-9][0-9]*\)).*/\1/p; s/^LOAD COMPLETE: pages \([0-9][0-9]*\)\/.*/\1/p' | head -n 1)
      n=${n:-1}
      : > "$OUT/cap/$cl_u/load.$s"; : > "$OUT/cap/$cl_u/load.e$s"
      p=1; rcs=0
      while [ "$p" -le "$n" ]; do
        ./.contexture/ctx session load "$cl_u" "$p" >> "$OUT/cap/$cl_u/load.$s" 2>> "$OUT/cap/$cl_u/load.e$s" < /dev/null
        r=$?; [ "$r" -gt "$rcs" ] && rcs=$r
        p=$((p + 1))
      done
      printf 'rc=%s\n' "$rcs" >> "$OUT/cap/$cl_u/load.$s" )
  done
  printf '%s\t%s\n' "$cl_u" load >> "$OUT/res/$JOB.list"
}

# the fixed exact query set (12): common words, record labels, closer and ref shapes, a
# quote, a backslash-free punctuation run, a non-ASCII word, a miss
QUERIES='the
done
THREAD
backlog/
knowledge#
lane
(done:
"
A1
CLOSES
çalışma
zz-no-such-token-zz'

run_unit() {
  u=$1
  want board && cap "$u" board session board "$u"
  want load && cap_load "$u"
  want audit && cap "$u" audit session audit "$u"
  want refresh && cap "$u" refresh session refresh "$u"
  want tasks && cap "$u" tasks session task list "$u" --status=all
  want entries && cap "$u" entries session entry list "$u"
  want findings && cap "$u" findings session finding list "$u"
  if want search; then
    i=0
    printf '%s\n' "$QUERIES" | while IFS= read -r q; do
      i=$((i + 1))
      cap "$u" "search.$i" session search "$u" "$q" --mode=exact
    done
  fi
  if want resolve; then
    ( cd "$OUT/b" && ./.contexture/ctx session task list "$u" --status=all --json 2>/dev/null ) | tr '{' '\n' | sed -n 's/^"slug":"\([^"]*\)".*/\1/p' > "$OUT/cap/$u.tasks.ids" 2>/dev/null || :
    ( cd "$OUT/b" && ./.contexture/ctx session finding list "$u" --json 2>/dev/null ) | tr '{' '\n' | sed -n 's/^"name":"\([^"]*\)".*/\1/p' > "$OUT/cap/$u.findings.ids" 2>/dev/null || :
    ( cd "$OUT/b" && ./.contexture/ctx session entry list "$u" --json 2>/dev/null ) | tr '{' '\n' | sed -n 's/^"slug":"\([^"]*\)".*/\1/p' | awk '!seen[$0]++' > "$OUT/cap/$u.entries.ids" 2>/dev/null || :
    while IFS= read -r t; do [ -n "$t" ] && cap "$u" "resolve.task.$t" session resolve "$u" "task#$t"; done < "$OUT/cap/$u.tasks.ids"
    while IFS= read -r f; do [ -n "$f" ] && cap "$u" "resolve.finding.$f" session resolve "$u" "finding#$f"; done < "$OUT/cap/$u.findings.ids"
    while IFS= read -r e; do [ -n "$e" ] && cap "$u" "resolve.entry.$e" session resolve "$u" "entry#$e"; done < "$OUT/cap/$u.entries.ids"
  fi
  if want lanes && [ -d "$UNITS/$u/lanes" ]; then
    for l in "$UNITS/$u"/lanes/*; do
      [ -d "$l" ] || continue
      ln=${l##*/}
      for art in recipe journal report; do cap "$u" "lane.$ln.$art" lane show "$u" "$ln" "$art"; done
    done
  fi
}

# the jobs: the units dealt round robin, each job its own list file
j=0
for u in $LIST; do
  j=$((j % JOBS + 1))
  printf '%s\n' "$u" >> "$OUT/res/units.$j"
done
pids=""
k=1
while [ "$k" -le "$JOBS" ]; do
  if [ -f "$OUT/res/units.$k" ]; then
    ( JOB=$k; : > "$OUT/res/$JOB.list"; while IFS= read -r u; do run_unit "$u"; done < "$OUT/res/units.$k" ) &
    pids="$pids $!"
  fi
  k=$((k + 1))
done
JOB=0
: > "$OUT/res/0.list"
want active && cap _all active session active
wait

# the verdict per capture pair: the content signatures (tests/lib/content.awk) equal, or the
# bytes with --bytes
CONTENT="$(CDPATH="" cd "$(dirname "$0")" && pwd)/lib/content.awk"
QUOTE_I=$(printf '%s\n' "$QUERIES" | grep -n -x '"' | cut -d: -f1)
sig() { VIEW=$2 awk -f "$CONTENT" "$1"; }
: > "$OUT/summary.txt"
total=0; same=0; allowed=0; remainder=0; errdiff=0
cat "$OUT"/res/*.list | while IFS="$(printf '\t')" read -r u v; do
  fa="$OUT/cap/$u/$v.a"; fb="$OUT/cap/$u/$v.b"
  vw=${v%%.*}
  if [ "$BYTES" -eq 1 ]; then
    cp "$fa" "$fa.sig"; cp "$fb" "$fb.sig"
  else
    sig "$fa" "$vw" > "$fa.sig"; sig "$fb" "$vw" > "$fb.sig"
  fi
  if cmp -s "$fa.sig" "$fb.sig"; then
    cls=same
  else
    cls=remainder
    case "$v" in
      load)
        # with --bytes, the WRITE SCOPE line (D28: v0.54.0 named a path, the branch names the unit)
        if grep -v 'WRITE SCOPE: ' "$fa.sig" > "$fa.nows" && grep -v 'WRITE SCOPE: ' "$fb.sig" > "$fb.nows" && cmp -s "$fa.nows" "$fb.nows"; then cls=write-scope; fi
        rm -f "$fa.nows" "$fb.nows"
        ;;
      "search.$QUOTE_I") cls=quote-layout ;;
    esac
  fi
  if cmp -s "$OUT/cap/$u/$v.ea" "$OUT/cap/$u/$v.eb"; then e=stderr-same; else e=stderr-diff; fi
  printf '%s\t%s\t%s\t%s\n' "$cls" "$e" "$u" "$v"
done > "$OUT/verdicts.tsv"

awk -F '\t' '
  { total++; c[$1]++; if ($2 == "stderr-diff") ed++; v = $4; sub(/\..*$/, "", v); per[v]++; if ($1 == "same") ps[v]++; else if ($1 == "remainder") pr[v]++; else pa[v]++ }
  $1 == "remainder" { rem[++nr] = $3 "/" $4 }
  $2 == "stderr-diff" { erl[++ne] = $3 "/" $4 }
  END {
    printf "parity: %d comparisons, %d identical, %d allowed, %d remainder, %d stderr differences\n", total, c["same"], total - c["same"] - c["remainder"], c["remainder"] + 0, ed + 0
    for (k in c) if (k != "same" && k != "remainder") printf "  allowed %s: %d\n", k, c[k]
    for (k in per) printf "  view %s: %d compared, %d identical, %d allowed, %d remainder\n", k, per[k], ps[k] + 0, pa[k] + 0, pr[k] + 0
    for (i = 1; i <= nr; i++) printf "  REMAINDER %s\n", rem[i]
    for (i = 1; i <= ne && i <= 200; i++) printf "  stderr %s\n", erl[i]
    exit (c["remainder"] > 0) ? 1 : 0
  }' "$OUT/verdicts.tsv" > "$OUT/summary.txt"
rc=$?
cat "$OUT/summary.txt"
exit "$rc"
