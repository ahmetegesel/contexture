#!/usr/bin/env sh
# census.sh <scripts dir> <allow-list>: the standing single-door census of the docs module.
# Two instruments over every verb script and engine (comment lines skipped):
#   A (names): a line naming the corpus layout or a record artifact:
#      docs/  .md  DOC_FILES  backlog  FILENAME  sessions
#   B (IO primitives): a line that opens, lists, copies, moves, writes, probes, spawns, or
#      sources: awk -f, exec, getline, cat, cp, mv, rm, mkdir, mktemp, ls, find, git,
#      system(, sqlite3, a redirect to or from a quoted path, the file tests -d -e -f -r -s
#      -w -x, dot-sourcing, the argv pass-through "$@", $DOC_FILES
# Every union line of docs-io.sh (the one door) counts as helper. Every other union line
# must match an allow-list entry exactly: <class><TAB><file><TAB><the line as written>
# (by file and content, never by line number); a line no entry matches is the remainder.
# Prints the per-class counts, the helper count, every REMAINDER line, and one summary:
#   census: flagged N = helper H + classified C + remainder R
# rc 0 only when R is 0, N equals H + C + R, and N is not 0 (an empty census proves
# nothing); rc 1 otherwise.

set -u
LC_ALL=C
export LC_ALL

[ $# -eq 2 ] || { echo "usage: census.sh <scripts dir> <allow-list>" >&2; exit 1; }
dir=$1
allow=$2
[ -d "$dir" ] && [ -f "$allow" ] || { echo "census.sh: missing scripts dir or allow-list" >&2; exit 1; }

set --
for f in "$dir"/*; do
  [ -f "$f" ] && set -- "$@" "$f"
done
[ $# -gt 0 ] || { echo "census.sh: no scripts under $dir" >&2; exit 1; }

CENSUS_ALLOW=$allow awk '
  BEGIN {
    f = ENVIRON["CENSUS_ALLOW"]
    while ((getline l < f) > 0) {
      if (l ~ /^#/ || l == "") continue
      t1 = index(l, "\t"); rest = substr(l, t1 + 1); t2 = index(rest, "\t")
      if (t1 < 2 || t2 < 2) { print "census.sh: malformed allow-list line: " l > "/dev/stderr"; bad = 1; continue }
      cls = substr(l, 1, t1 - 1); file = substr(rest, 1, t2 - 1); text = substr(rest, t2 + 1)
      allowed[file SUBSEP text] = cls
    }
    close(f)
  }
  FNR == 1 { base = FILENAME; sub(/^.*\//, "", base) }
  /^[ \t]*#/ { next }
  {
    a = ($0 ~ /docs\/|\.md|DOC_FILES|backlog|FILENAME|sessions/)
    b = ($0 ~ /awk -f|exec |getline|cat |cp |mv |rm |mkdir|mktemp|ls |find |git |system\(|sqlite3|> *"|>> *"|< *"|-[defrswx] "|^[ \t]*\. |[;&|][ \t]*\. |"\$@"|\$DOC_FILES/)
    if (!(a || b)) next
    flagged++
    if (base == "docs-io.sh") { helper++; next }
    k = base SUBSEP $0
    if (k in allowed) { byclass[allowed[k]]++; classified++; next }
    remainder++
    printf "REMAINDER %s:%d:%s%s: %s\n", base, FNR, (a ? "A" : "-"), (b ? "B" : "-"), $0
  }
  END {
    for (c in byclass) printf "class %s %d\n", c, byclass[c] | "sort"
    close("sort")
    printf "census: flagged %d = helper %d + classified %d + remainder %d\n", flagged, helper, classified, remainder
    if (bad || flagged == 0 || remainder > 0 || flagged != helper + classified + remainder) exit 1
  }' "$@"
