#!/bin/sh
# md2dump.sh: fixture tool (never run by the compliance suite). Converts a posix unit
# folder (state.md, backlog.md, knowledge.md, journal.md, lanes/<lane>/recipe.md,
# journal.md, report.md) into one unit dump (@dump, version 1) on stdout, by the
# contract's parse rules (md2dump.awk).
# usage: md2dump.sh <unit-folder> <unit> [<extras>]
set -u
dir=$1
u=$2
extras=${3:-0}
T=$(CDPATH="" cd "$(dirname "$0")" && pwd)/md2dump.awk

eofnl() {
  if [ -s "$1" ] && [ "$(tail -c 1 "$1" | od -An -c | tr -d ' ')" = '\n' ]; then echo 1; else echo 0; fi
}
run() { f=$1; shift; awk -v eofnl="$(eofnl "$f")" "$@" -f "$T" "$f"; }

body=$(mktemp "${TMPDIR:-/tmp}/md2dump.XXXXXX") || exit 2
trap 'rm -f "$body" "$body.l"' EXIT

run "$dir/state.md" -v art=state >> "$body"
for a in backlog knowledge journal; do
  if [ -f "$dir/$a.md" ]; then
    run "$dir/$a.md" -v art="$a" >> "$body"
  else
    printf '{"kind":"artifact","name":"%s","preamble":null}\n' "$a" >> "$body"
  fi
done
if [ -d "$dir/lanes" ]; then
  for l in $(ls "$dir/lanes" | LC_ALL=C sort); do
    [ -d "$dir/lanes/$l" ] || continue
    rec=null; rep=null; pre=null
    [ -f "$dir/lanes/$l/recipe.md" ] && rec=$(run "$dir/lanes/$l/recipe.md" -v art=doc)
    [ -f "$dir/lanes/$l/report.md" ] && rep=$(run "$dir/lanes/$l/report.md" -v art=doc)
    : > "$body.l"
    if [ -f "$dir/lanes/$l/journal.md" ]; then
      run "$dir/lanes/$l/journal.md" -v art=lanejournal -v lane="$l" > "$body.l"
      pre=$(sed -n '1s/^#PREAMBLE //p' "$body.l")
    fi
    printf '{"kind":"lane","lane":"%s","recipe":%s,"report":%s,"journal_preamble":%s}\n' "$l" "$rec" "$rep" "$pre" >> "$body"
    grep -v '^#PREAMBLE ' "$body.l" >> "$body"
  done
fi
n=$(wc -l < "$body" | tr -d ' ')
printf '{"kind":"unit","format":"contexture-dump","version":1,"unit":"%s","extras":%s}\n' "$u" "$extras"
cat "$body"
printf '{"kind":"end","unit":"%s","records":%s}\n' "$u" "$n"
