#!/usr/bin/env sh
# write-verbs.sh <sandbox> <fixtures>: the write verbs' assertions, run by tests/run.sh inside
# its staged sandbox on the configured driver (posix, or fts5 with the docs folder gone).
#
# Every success case: rc 0, the stored doc (read back through corpus.read) equal to its
# fixture under tests/write/ byte for byte (so every untouched line is proven too), and on a
# driver with a change log (corpus.changelog) exactly the expected new rows, the last one
# carrying the verb's op and the workspace git HEAD. Every refusal case: its rc, its message,
# the stored doc byte-identical to before (or still absent), and no new change-log row.
# Covered: ctx docs new, write (a doc without a final newline kept so; a --replace of the
# stored bytes writes nothing and logs no row), header (a list emptied by its last removal
# drops the field), rule,
# pitfall, entry (an id-keyed add, a legacy #N update, a natural and a composite key, a block
# scalar, --stdin, --first, --after, --remove), section, replace, remove, ids (a run, a
# rerun keying 0, a dry run), query --entry, a dry run; the refusals: an unknown field, an
# enum value outside its set, a missing required field, a duplicate key, a duplicate id, a
# missing address (entry, rule, doc), a stale replace count, audit failures (an id taken by
# another doc of the repo, an unknown block), a newline in a one-line field, a carriage
# return (a flag value, a whole doc, a replace text), an unknown flag, an id set by hand, an existing doc
# for new and write, --replace of an absent doc, a slug mismatch, a required field unset or
# emptied by the removal of its last item,
# a line-number evidence, a section header mismatch, an empty value, a block the kind lacks.
# Each case reseeds repo wtest through the driver (stamped with a head no window holds).
# Exit 0 when every case passes, 1 otherwise.

set -u
SB=$1
FX=$2
cd "$SB" || exit 1
C="$SB/.contexture/ctx"
R="$SB/.contexture/modules/session/scripts/driver-resolver"
W="$SB/write-verbs.scratch"
rm -rf "$W"
mkdir -p "$W" || exit 1
PASS=0
FAIL=0
LOG=0
"$R" has corpus.changelog && LOG=1
HEAD=$(git -C "$SB" rev-parse --verify -q HEAD 2>/dev/null) || HEAD=""
[ -n "$HEAD" ] || HEAD=none
SEEDHEAD=0000000

put() { "$R" corpus.write wtest "$1" "--head=$SEEDHEAD" < "$2" > /dev/null 2>&1; }
seed() {
  for k in $("$R" corpus.list wtest 2>/dev/null); do
    case "$k" in
      wtest/unit|wtest/conv|wtest/map) ;;
      *) "$R" corpus.remove wtest "${k#*/}" "--head=$SEEDHEAD" > /dev/null 2>&1 ;;
    esac
  done
  put unit "$FX/unit.md"
  put conv "$FX/conv.md"
  put map "$FX/map.md"
}
rows() { printf 'head=%s\n' "$HEAD" | "$R" corpus.changes 2>/dev/null | awk 'END { print NR }'; }
lastrow() { printf 'head=%s\n' "$HEAD" | "$R" corpus.changes 2>/dev/null | tail -n 1; }
stored() { "$R" corpus.read wtest "$1" 2>/dev/null; }
verdict() {
  if [ -z "$2" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL $1: $2"
  fi
}
run() {
  in=$1
  shift
  [ "$in" = "-" ] && in=/dev/null
  "$@" < "$in" > "$W/out" 2> "$W/err"
}

# succeed <case> <doc> <fixture|ABSENT> <op> <rows> <stdin file|-> <command...>
succeed() {
  c=$1; d=$2; exp=$3; op=$4; nrows=$5; in=$6
  shift 6
  n0=0
  [ "$LOG" -eq 1 ] && n0=$(rows)
  run "$in" "$@"
  rc=$?
  why=""
  [ "$rc" -eq 0 ] || why="rc=$rc: $(head -c 400 "$W/err")"
  if [ -z "$why" ]; then
    if [ "$exp" = ABSENT ]; then
      stored "$d" > /dev/null && why="the doc is still stored"
    else
      stored "$d" > "$W/got"
      cmp -s "$W/got" "$exp" || why="the stored doc differs from ${exp##*/}"
    fi
  fi
  if [ -z "$why" ] && [ "$LOG" -eq 1 ]; then
    n1=$(rows)
    if [ $((n1 - n0)) -ne "$nrows" ]; then
      why="change-log rows +$((n1 - n0)), want +$nrows"
    elif [ "$nrows" -gt 0 ]; then
      l=$(lastrow)
      lop=$(printf '%s\n' "$l" | awk -F '\t' '{ print $3 }')
      lhead=$(printf '%s\n' "$l" | awk -F '\t' '{ print $5 }')
      { [ "$lop" = "$op" ] && [ "$lhead" = "$HEAD" ]; } || why="last row op=$lop head=$lhead, want $op $HEAD"
    fi
  fi
  verdict "$c" "$why"
}

# refuse <case> <doc> <rc> <message part> <stdin file|-> <command...>
refuse() {
  c=$1; d=$2; wrc=$3; msg=$4; in=$5
  shift 5
  stored "$d" > "$W/before"
  b_rc=$?
  n0=0
  [ "$LOG" -eq 1 ] && n0=$(rows)
  run "$in" "$@"
  rc=$?
  why=""
  [ "$rc" -eq "$wrc" ] || why="rc=$rc, want $wrc: $(head -c 300 "$W/err")"
  if [ -z "$why" ] && ! grep -qF -- "$msg" "$W/err"; then
    why="the message lacks '$msg': $(head -c 300 "$W/err")"
  fi
  stored "$d" > "$W/after"
  a_rc=$?
  if [ -z "$why" ]; then
    { [ "$a_rc" -eq "$b_rc" ] && cmp -s "$W/before" "$W/after"; } || why="the stored doc changed"
  fi
  if [ -z "$why" ] && [ "$LOG" -eq 1 ] && [ "$(rows)" -ne "$n0" ]; then
    why="a change-log row was written"
  fi
  verdict "$c" "$why"
}

# same <case> <doc> <stdout part> <stdin file|-> <command...>: rc 0, the part on stdout, the
# stored doc byte-identical to before, no new change-log row (a dry run, an idempotent rerun)
same() {
  c=$1; d=$2; msg=$3; in=$4
  shift 4
  stored "$d" > "$W/before"
  n0=0
  [ "$LOG" -eq 1 ] && n0=$(rows)
  run "$in" "$@"
  rc=$?
  why=""
  [ "$rc" -eq 0 ] || why="rc=$rc: $(head -c 300 "$W/err")"
  if [ -z "$why" ] && ! grep -qF -- "$msg" "$W/out"; then
    why="stdout lacks '$msg': $(head -c 300 "$W/out")"
  fi
  stored "$d" > "$W/after"
  [ -z "$why" ] && ! cmp -s "$W/before" "$W/after" && why="the stored doc changed"
  if [ -z "$why" ] && [ "$LOG" -eq 1 ] && [ "$(rows)" -ne "$n0" ]; then
    why="a change-log row was written"
  fi
  verdict "$c" "$why"
}

# scratch inputs: a doc without its final newline, a second version of a doc, a doc with a
# carriage return
awk '{ sub(/^@doc structural written$/, "@doc structural nonl"); printf "%s%s", (NR > 1 ? "\n" : ""), $0 }' "$FX/written.md" > "$W/nonl.md"
sed 's/A doc written whole/A doc written twice/' "$FX/written.md" > "$W/written2.md"
awk -v cr="$(printf '\r')" '{ sub(/^@doc structural written$/, "@doc structural crdoc"); print ($0 ~ /Own the/ ? $0 cr : $0) }' "$FX/written.md" > "$W/cr.md"

# ---------------------------------------------------------------- successes
seed
succeed new fresh "$FX/exp-new.md" new 1 - "$C" docs new wtest fresh --kind=structural '--description=A fresh doc' '--sources=src/fresh/**' --keywords=fresh
succeed write written "$FX/written.md" write 1 "$FX/written.md" "$C" docs write wtest written
succeed write-replace written "$W/written2.md" write 1 "$W/written2.md" "$C" docs write wtest written --replace
same write-replace-identical written "wtest/written unchanged (nothing written)" "$W/written2.md" "$C" docs write wtest written --replace
succeed write-no-final-newline nonl "$W/nonl.md" write 1 "$W/nonl.md" "$C" docs write wtest nonl
seed
succeed header unit "$FX/exp-header.md" header 1 - "$C" docs header wtest unit '--add-source=src/more/**' --remove-keyword=unit '--upstream=An upstream note'
# a list emptied by removing its last item leaves the header with the field gone (map's
# optional children, added first, then removed: the doc back to its fixture byte for byte)
seed
run - "$C" docs header wtest map --add-child=unit
succeed header-remove-last-child map "$FX/map.md" header 1 - "$C" docs header wtest map --remove-child=unit
seed
succeed rule-add conv "$FX/exp-rule-add.md" rule 1 - "$C" docs rule wtest conv docs/third --directive=never '--statement=The third rule' --status=aspirational --prevalence=rare --layer=repo --provenance=ratified --evidence=thirdSym --after=docs/first
seed
succeed rule-update conv "$FX/exp-rule-update.md" rule 1 - "$C" docs rule wtest conv docs/second '--caution=Mind it' --status=violated
seed
succeed rule-remove conv "$FX/exp-rule-remove.md" rule 1 - "$C" docs rule wtest conv docs/first --remove
seed
succeed pitfall-add unit "$FX/exp-pitfall-add.md" pitfall 1 - "$C" docs pitfall wtest unit '--summary=The second pitfall' --class=gotcha --severity=low '--trigger=Another trigger' '--consequence=Another consequence' --evidence=pitTwo
seed
succeed pitfall-update unit "$FX/exp-pitfall-update.md" pitfall 1 - "$C" docs pitfall wtest unit unit-p1 --severity=high '--consequence=Now one line'
seed
succeed pitfall-remove unit "$FX/exp-pitfall-remove.md" pitfall 1 - "$C" docs pitfall wtest unit unit-p1 --remove
seed
succeed entry-add-after unit "$FX/exp-entry-contract-add.md" entry 1 - "$C" docs entry wtest unit contract '--rule=The middle invariant' --evidence=midSym '--after=#1'
seed
succeed entry-legacy-ordinal unit "$FX/exp-entry-legacy.md" entry 1 - "$C" docs entry wtest unit contract '#2' --evidence=secondSym2
seed
succeed entry-first unit "$FX/exp-entry-resp-first.md" entry 1 - "$C" docs entry wtest unit responsibilities '--text=Own the first thing' --first
seed
succeed entry-composite-key unit "$FX/exp-entry-edges.md" entry 1 - "$C" docs entry wtest unit edges 'exposes:GET /unit' '--detail=Serves the unit twice.'
seed
succeed entry-remove unit "$FX/exp-entry-seealso-remove.md" entry 1 - "$C" docs entry wtest unit see_also other --remove
seed
succeed entry-block-scalar map "$FX/exp-entry-dataflow.md" entry 1 - "$C" docs entry wtest map data_flow --from=beta --to=gamma --evidence=flowTwo '--detail=line one
line two'
seed
succeed entry-stdin map "$FX/exp-entry-deprule-stdin.md" entry 1 "$FX/deprule-detail.txt" "$C" docs entry wtest map dependency_rules '#1' --stdin=detail
# a --stdin body larger than the platform's argument and environment limit (about 1.1 MB)
# lands whole: the value reaches the edit engine as a file operand, never the environment
seed
awk 'BEGIN { for (i = 1; i <= 14000; i++) printf "big detail line %06d, padded out to about eighty bytes wide for the limit\n", i }' > "$W/bigdetail.txt"
run "$W/bigdetail.txt" "$C" docs entry wtest map dependency_rules '#1' --stdin=detail
rc=$?
stored map | awk '/^@dependency_rules/ { d = 1 } d && /^    detail ::$/ { f = 1; next } f && /^      / { sub(/^      /, ""); print; next } f { exit }' > "$W/bigdetail.got"
{ [ "$rc" -eq 0 ] && cmp -s "$W/bigdetail.txt" "$W/bigdetail.got"; } && verdict entry-stdin-large "" || verdict entry-stdin-large "rc=$rc: $(head -c 300 "$W/err")"
seed
succeed section-replace unit "$FX/exp-section-replace.md" section 1 "$FX/see-also.block" "$C" docs section wtest unit see_also
seed
succeed section-rule-first conv "$FX/exp-section-rule-first.md" section 1 "$FX/rule-fourth.block" "$C" docs section wtest conv rule/docs/fourth --first
seed
succeed replace unit "$FX/exp-replace.md" replace 1 - "$C" docs replace wtest '--old=invariant holds' '--new=invariant stands' --count=2
seed
put fresh "$FX/exp-new.md"
succeed remove fresh ABSENT remove 1 - "$C" docs remove wtest fresh
seed
same ids-dry-run unit "dry run: 4 in 1 docs" - "$C" docs ids wtest --dry-run
succeed ids unit "$FX/exp-ids.md" ids 1 - "$C" docs ids wtest
grep -q '4 entries keyed' "$W/out" || verdict ids-count "stdout lacks '4 entries keyed': $(cat "$W/out")"
same ids-rerun unit "0 entries keyed" - "$C" docs ids wtest
seed
run - "$C" docs query wtest unit --entry pitfalls/unit-p1
rc=$?
why=""
{ [ "$rc" -eq 0 ] && cmp -s "$W/out" "$FX/exp-entry-show.txt"; } || why="rc=$rc or the entry lines differ"
verdict query-entry "$why"
same entry-dry-run unit "dry run, nothing written" - "$C" docs entry wtest unit contract '--rule=A dry rule' --evidence=drySym --dry-run

# ---------------------------------------------------------------- refusals
seed
refuse unknown-field unit 1 "unknown field 'bogus'" - "$C" docs pitfall wtest unit unit-p1 --bogus=x
refuse enum unit 1 "severity takes one of" - "$C" docs pitfall wtest unit unit-p1 --severity=urgent
refuse enum-rule conv 1 "directive takes one of" - "$C" docs rule wtest conv docs/second --directive=maybe
refuse missing-required unit 1 "requires evidence" - "$C" docs pitfall wtest unit --summary=s --class=bug --severity=low --trigger=t --consequence=c
refuse missing-required-rule conv 1 "requires statement" - "$C" docs rule wtest conv docs/fifth --directive=must --status=followed --prevalence=rare --layer=repo --provenance=ratified --evidence=e
refuse duplicate-key unit 1 "already has an entry keyed 'other' (ERR_ENTITY_EXISTS)" - "$C" docs entry wtest unit see_also --ref=other --why=again
refuse duplicate-id unit 1 "the id unit-p1 already exists" - "$C" docs pitfall wtest unit --id=unit-p1 --summary=s --class=bug --severity=low --trigger=t --consequence=c --evidence=e
refuse missing-entry unit 1 "has no entry 'unit-r9' (ERR_ENTITY_NOT_FOUND)" - "$C" docs entry wtest unit contract unit-r9 --evidence=x
refuse missing-rule conv 1 "no rule/docs/nosuch" - "$C" docs rule wtest conv docs/nosuch --remove
refuse missing-doc nosuch 1 "no such doc: wtest/nosuch (ERR_ENTITY_NOT_FOUND)" - "$C" docs header wtest nosuch --description=x
refuse stale-count unit 1 "2 occurrences in scope, --count says 5" - "$C" docs replace wtest unit '--old=invariant holds' --new=x --count=5
put dup "$FX/dup.md"
refuse audit-duplicate-id unit 1 "fails the grammar audit" - "$C" docs pitfall wtest unit --id=unit-p5 --summary=s --class=bug --severity=low --trigger=t --consequence=c --evidence=e
grep -qF "duplicate id 'unit-p5'" "$W/err" || verdict audit-duplicate-id-line "the audit line naming unit-p5 is missing"
seed
refuse audit-unknown-block badblock 1 "unknown block header '@bogus'" "$FX/bad-block.md" "$C" docs write wtest badblock
refuse newline unit 1 "a newline in the one-line field severity" - "$C" docs pitfall wtest unit unit-p1 '--severity=low
x'
refuse carriage-return unit 1 "a carriage return in the value of summary" - "$C" docs pitfall wtest unit unit-p1 "--summary=$(printf 'a\rb')"
refuse carriage-return-doc crdoc 1 "a carriage return in the doc" "$W/cr.md" "$C" docs write wtest crdoc
refuse carriage-return-replace-new unit 1 "a carriage return in --new" - "$C" docs replace wtest unit '--old=invariant holds' "--new=$(printf 'a\rb')" --count=2
refuse carriage-return-replace-old unit 1 "a carriage return in --old" - "$C" docs replace wtest unit "--old=$(printf 'holds\r')" --new=x --count=0
refuse unknown-flag unit 1 "unknown option: --bogus" - "$C" docs entry wtest unit contract --bogus
refuse id-by-hand unit 1 "ids are stable" - "$C" docs pitfall wtest unit unit-p1 --id=unit-p3
refuse new-existing unit 1 "wtest/unit already exists (ERR_ENTITY_EXISTS)" - "$C" docs new wtest unit --kind=capability --description=d --sources=a --keywords=b
refuse write-existing unit 1 "--replace rewrites it whole" "$FX/unit.md" "$C" docs write wtest unit
refuse write-replace-absent written 1 "--replace rewrites an existing doc" "$FX/written.md" "$C" docs write wtest written --replace
refuse write-slug-mismatch other 1 "names slug 'written'" "$FX/written.md" "$C" docs write wtest other
refuse unset-required unit 1 "description is required" - "$C" docs header wtest unit --unset=description
refuse remove-last-required-item unit 1 "sources is required" - "$C" docs header wtest unit '--remove-source=src/unit/**'
refuse evidence-line-number unit 1 "never line numbers" - "$C" docs entry wtest unit contract '#1' --evidence=file.sh:12
refuse section-header unit 1 "must open with @see_also" "$FX/rule-fourth.block" "$C" docs section wtest unit see_also
refuse empty-value unit 1 "an empty value for summary" - "$C" docs pitfall wtest unit unit-p1 --summary=
refuse block-kind conv 1 "a conventions doc carries no @pitfalls block" - "$C" docs pitfall wtest conv --summary=s --class=bug --severity=low --trigger=t --consequence=c --evidence=e

# ---------------------------------------------------------------- the corpus half read back
if [ "$LOG" -eq 1 ]; then
  seed
  run - "$C" docs new wtest late --kind=structural --description=Late --sources=late --keywords=late
  run - "$C" docs header wtest conv '--add-source=more/**'
  run - "$C" docs new wtest gone --kind=structural --description=Gone --sources=gone --keywords=gone
  run - "$C" docs remove wtest gone
  run - "$C" docs changes
  rc=$?
  why=""
  [ "$rc" -eq 0 ] || why="rc=$rc"
  [ -z "$why" ] && ! grep -qx "$(printf 'A\tdocs/wtest/late.md')" "$W/out" && why="no A line for wtest/late"
  [ -z "$why" ] && ! grep -qx "$(printf 'M\tdocs/wtest/conv.md')" "$W/out" && why="no M line for wtest/conv"
  [ -z "$why" ] && grep -q 'docs/wtest/gone.md' "$W/out" && why="a line for wtest/gone, created and removed in the window"
  verdict changes-read-back "$why"
fi

rm -rf "$W"
echo "write-verbs: $PASS passed, $FAIL failed (change log: $([ "$LOG" -eq 1 ] && echo checked || echo none on this driver))"
[ "$FAIL" -eq 0 ]
