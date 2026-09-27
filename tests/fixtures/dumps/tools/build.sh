#!/bin/sh
# build.sh: fixture tool (never run by the compliance suite). Regenerates the dump
# fixtures of tests/fixtures/dumps from the markdown sources under tools/src, proves
# each one round-trips (dump2md of the dump reproduces its source byte for byte), writes
# the TC60 goldens of the legacy fixture, the TC69 exact answers, and the TC64 plants.
# usage: sh tests/fixtures/dumps/tools/build.sh   (TMPDIR should point into the workspace drawer)
set -u
TOOLS=$(CDPATH="" cd "$(dirname "$0")" && pwd)
DUMPS=$(CDPATH="" cd "$TOOLS/.." && pwd)
TESTS=$(CDPATH="" cd "$DUMPS/../.." && pwd)
ROOT=$(CDPATH="" cd "$TESTS/.." && pwd)
JF="$TESTS/lib/jflat.awk"
SRC="$TOOLS/src"
SCR=$(mktemp -d "${TMPDIR:-/tmp}/dump-build.XXXXXX") || exit 2
trap 'rm -rf "$SCR"' EXIT
fail=0

# unit <source folder> <unit> <dump file>: convert and prove the round trip
unit() {
  sh "$TOOLS/md2dump.sh" "$SRC/$1" "$2" > "$3" || { echo "build: md2dump failed for $1"; fail=1; return; }
  rm -rf "$SCR/rt"
  awk -v lineno=1 -f "$JF" "$3" | awk -v out="$SCR/rt" -f "$TOOLS/dump2md.awk"
  if diff -r "$SRC/$1" "$SCR/rt" > "$SCR/diff" 2>&1; then
    echo "build: $1 -> $(basename "$3") (round trip exact)"
  else
    echo "build: $1 round trip DIFFERS"; cat "$SCR/diff"; fail=1
  fi
}

unit legacy-u legacy-u "$DUMPS/legacy.dump"
unit tc57-u tc57-u "$DUMPS/tc57-repeat.dump"
for c in dangling unharvested done inprogress thread clean; do
  unit "tc63-$c" "tc63-$c" "$DUMPS/tc63-$c.dump"
done
: > "$DUMPS/tc67-three.dump"
for u in tc67-a tc67-b tc67-c; do
  unit "$u" "$u" "$SCR/$u.dump"
  cat "$SCR/$u.dump" >> "$DUMPS/tc67-three.dump"
done
unit tc61-u tc61-u "$DUMPS/tc61-before.dump"
unit tc61-expected tc61-u "$DUMPS/tc61-expected.dump"
cp "$SRC/tc61-expected/journal.md" "$DUMPS/tc61-expected-journal.md"
unit tc73-u tc73-u "$DUMPS/tc73-anchor.dump"
unit compliance-exact compliance-exact "$DUMPS/tc39-exact.dump"
unit tc64-u tc64-u "$DUMPS/tc64-plants.dump"
rm -rf "$DUMPS/plants/tc64-u"
mkdir -p "$DUMPS/plants/tc64-u"
cp "$SRC/tc64-u/"*.md "$DUMPS/plants/tc64-u/"

# the TC60 goldens: the answers every backend returns for the imported legacy fixture
rm -rf "$DUMPS/golden/legacy-u"
mkdir -p "$DUMPS/golden/legacy-u"
awk -v lineno=1 -f "$JF" "$DUMPS/legacy.dump" | awk -v out="$DUMPS/golden/legacy-u" -f "$TOOLS/goldens.awk"
echo "build: goldens $(ls "$DUMPS/golden/legacy-u" | wc -l | tr -d ' ') answers"

# answers <unit> <dump> <queries> <out>: the exact answers of search.awk (the exact rule
# posix keeps, docs/the-engine.md) over the unit's rendered text in the rule's file
# order (state, backlog, knowledge, journal, then each lane bytewise: recipe, journal,
# report), each result scoring 0; one "query|limit|entity|answer" line per query. The
# driver's search.awk runs after canon.awk and model.awk and reads the query from a payload
# file (the contract 2 driver's own invocation)
PD="$ROOT/base/.contexture/modules/session/drivers/posix"
answers() {
  rm -rf "$SCR/sa"
  awk -v lineno=1 -f "$JF" "$2" | awk -v out="$SCR/sa/$1" -f "$TOOLS/dump2md.awk"
  L="$SCR/sa/$1"
  files=""
  for a in state backlog knowledge journal; do [ -f "$L/$a.md" ] && files="$files $L/$a.md"; done
  if [ -d "$L/lanes" ]; then
    for l in $(ls "$L/lanes" | LC_ALL=C sort); do
      for a in recipe journal report; do [ -f "$L/lanes/$l/$a.md" ] && files="$files $L/lanes/$l/$a.md"; done
    done
  fi
  : > "$4"
  while IFS='|' read -r q lim ent; do
    [ -n "$q" ] || continue
    printf 'query=%s\n' "$(printf '%s' "$q" | sed 's/\\/\\\\/g')" > "$SCR/pay"
    # shellcheck disable=SC2086
    LC_ALL=C PX_PAY="$SCR/pay" PX_ERR="$SCR/err" SQ_UNIT="$1" SQ_LIMIT="${lim:-20}" SQ_ENTITY="${ent:-all}" SQ_MODE=exact \
      awk -f "$PD/canon.awk" -f "$PD/model.awk" -f "$PD/search.awk" $files > "$SCR/ans"
    printf '%s|%s|%s|%s\n' "$q" "$lim" "$ent" "$(cat "$SCR/ans")" >> "$4"
  done < "$3"
  echo "build: $(basename "$4") $(wc -l < "$4" | tr -d ' ') exact answers"
}
answers legacy-u "$DUMPS/legacy.dump" "$DUMPS/tc69-queries.txt" "$DUMPS/tc69-exact.answers"
answers compliance-exact "$DUMPS/tc39-exact.dump" "$DUMPS/tc39-queries.txt" "$DUMPS/tc39-exact.answers"
exit "$fail"
