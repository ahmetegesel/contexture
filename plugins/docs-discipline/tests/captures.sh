#!/usr/bin/env sh
# captures.sh: the capture set of the docs read verbs, the instrument of the posix byte
# identity (one module against another at the same workspace path) and of the dual-driver
# parity (the same corpus under two drivers).
#
#   captures.sh plan <workspace root>            print the capture plan for the corpus in
#                                                <root>/docs (read as files: run it on a
#                                                files-driver reference), one line per
#                                                capture: <class><TAB><sh command>
#   captures.sh run <workspace root> <plan> <out> run every planned command from <root> under
#                                                sh; <out>/<NNNN>.out, .err, .rc per capture
#   captures.sh compare <dir a> <dir b>          cmp per capture file; prints DIFF lines and
#                                                one summary line; rc 0 only when every
#                                                capture of both sides is present and equal
#
# Classes: same (a successful call of the files-driver form: byte-identical is required),
# change (a named failing or degenerate call whose behavior the read side changes on
# purpose), new (a form the branch base did not have). The plan covers: the index; every
# doc projection; every block section of every doc; ten owner lookups; five searches (a
# word, a phrase, a symbol, a Turkish word, a term with no hit); the rules, per repo and per
# category; the pitfalls, all and high; every edge channel; the audit in its forms; the
# check over the gate matrix's eight deltas and the README's four; the gate over the same
# on stdin; the nudge on a backlog.md at the root when one exists.
# Needs: POSIX sh and awk, cmp. Every loop runs under sh (never zsh: unquoted splitting).

set -u
LC_ALL=C
export LC_ALL

usage() {
  echo "usage: captures.sh plan <root> | run <root> <plan> <out> | compare <a> <b>" >&2
  exit 1
}

[ $# -ge 1 ] || usage
sub=$1
shift

# the gate matrix's eight deltas and the README's four (printf formats: \t and \n kept)
DELTAS='
M\tprojects/demo/src/widgets/Widget.cs\ndocs/demo/widgets.md\n
A\tprojects/demo/src/loose/Unknown.cs\n
M\tprojects/demo/src/widgets/Widget.cs\n
M\tprojects/demo/src/widgets/Widget.cs\ndocs/demo/platform.md\n
D\tprojects/demo/src/widgets/OldWidget.cs\ndocs/demo/widgets.md\n
D\tprojects/demo/src/widgets/Widget.cs\n
A\tprojects/demo/src/tools/report.py\n
M\tprojects/demo-orders/src/order/validate.ts\ndocs/demo-orders/order-flow.md\n
M\tprojects/demo-orders/src/order/validate.ts\n
A\tprojects/demo-orders/src/tools/report.ts\n
M\tprojects/demo-orders/src/order/validate.ts\ndocs/workspace/system-map.md\n
M\ttests/run.sh\n'

plan() {
  root=$1
  [ -d "$root/docs" ] || { echo "captures.sh: no docs folder under $root" >&2; exit 1; }
  C=./.contexture/ctx
  p() { printf '%s\t%s\n' "$1" "$2"; }
  p same "$C docs query --index"
  set -- "$root"/docs/*/*.md
  first_doc=""
  for f in "$@"; do
    [ -f "$f" ] || continue
    rel=${f#"$root"/}
    slug=${f##*/}; slug=${slug%.md}
    repo=$(awk 'FNR <= 15 && /^[ ]{2}repo:[ ]*/ { sub(/^[ ]{2}repo:[ ]*/, ""); print; exit }' "$f")
    [ -n "$first_doc" ] || first_doc=$rel
    p same "$C docs query $repo $slug"
    awk '/^@[a-z_]+/ && $1 != "@doc" { b = substr($1, 2); if (!(b in seen)) { seen[b] = 1; print b } }' "$f" | while IFS= read -r b; do
      p same "$C docs query $repo $slug --section $b"
    done
  done
  # ten owner lookups: a concrete path from each sources glob (the first glob per doc),
  # then an unclaimed path, a guide, and a projects/<repo>/ path
  n=0
  for f in "$@"; do
    [ -f "$f" ] || continue
    repo=$(awk 'FNR <= 15 && /^[ ]{2}repo:[ ]*/ { sub(/^[ ]{2}repo:[ ]*/, ""); print; exit }' "$f")
    g=$(awk 'FNR <= 20 && /^[ ]{2}sources:[ ]*\[/ { s = $0; sub(/^[ ]{2}sources:[ ]*\[/, "", s); sub(/\].*$/, "", s); split(s, a, ","); x = a[1]; gsub(/^[ "]+|[ "]+$/, "", x); print x; exit }' "$f")
    [ -n "$g" ] || continue
    path=$(printf '%s\n' "$g" | awk '{ gsub(/\*\*/, "x"); gsub(/\*/, "x"); gsub(/[{}]/, ""); sub(/,.*$/, ""); print }')
    [ "$repo" = workspace ] || path="projects/$repo/$path"
    p same "$C docs query $repo --file $path"
    n=$((n + 1))
    [ "$n" -ge 7 ] && break
  done
  repo1=$(awk 'FNR <= 15 && /^[ ]{2}repo:[ ]*/ { sub(/^[ ]{2}repo:[ ]*/, ""); print; exit }' "$root/$first_doc")
  p same "$C docs query $repo1 --file nowhere/unclaimed.ts"
  p same "$C docs query $repo1 --file docs/the-engine.md"
  p same "$C docs query $repo1 --file projects/$repo1/src/x.ts"
  for term in corpus "the record" ERR_ 'değil' zzqqxx checkout; do
    p same "$C docs query $repo1 --search '$term'"
    p same "$C docs query --search '$term'"
  done
  for r in $(awk 'FNR <= 15 && /^[ ]{2}repo:[ ]*/ { sub(/^[ ]{2}repo:[ ]*/, ""); print }' "$@" | sort -u); do
    p same "$C docs query $r --rules"
    for cat in $(for f in "$@"; do awk -v r="$r" 'FNR <= 15 && /^[ ]{2}repo:/ { rr = $2 } /^@rule[ ]/ && rr == r { c = $2; sub(/\/.*$/, "", c); print c }' "$f"; done | sort -u); do
      p same "$C docs query $r --rules $cat"
    done
    p same "$C docs query $r --pitfalls"
    p same "$C docs query $r --pitfalls --severity high"
    p same "$C docs audit docs/$r/*.md"
    p new "$C docs audit $r"
  done
  for via in $(awk '/^[ ]+via:[ ]*/ { print $2 }' "$@" | sort -u); do
    p same "$C docs query --edge $via"
  done
  p same "$C docs query --edge ''"
  p same "$C docs audit docs/*/*.md"
  p same "$C docs audit $first_doc"
  p same "$C docs audit \"\$PWD/$first_doc\""
  p new "$C docs audit"
  p change "$C docs audit docs/nosuch/missing.md"
  p change "$C docs audit README.txt"
  printf '%s\n' "$DELTAS" | while IFS= read -r d; do
    [ -n "$d" ] || continue
    p same "printf '$d' | $C docs check docs/*/*.md"
    p same "printf '$d' | $C docs gate --stdin"
  done
  p new "printf 'M\ttests/run.sh\n' | $C docs check $repo1"
  if [ -f "$root/backlog.md" ]; then
    p same "$C docs nudge backlog.md docs/*/*.md"
    p same "$C docs nudge backlog.md"
    p change "$C docs nudge .contexture/sessions/x/backlog.md docs/*/*.md"
  fi
  p same "$C docs query nosuchrepo x"
  p same "$C docs gate --test-matrix"
}

run() {
  root=$1; planf=$2; out=$3
  mkdir -p "$out" || exit 1
  i=0
  while IFS= read -r line; do
    i=$((i + 1))
    id=$(printf '%04d' "$i")
    cmd=${line#*"$(printf '\t')"}
    printf '%s\n' "$line" > "$out/$id.cmd"
    (cd "$root" && sh -c "$cmd" < /dev/null) > "$out/$id.out" 2> "$out/$id.err"
    printf '%s\n' "$?" > "$out/$id.rc"
  done < "$planf"
  echo "captures.sh: $i captures in $out"
}

compare() {
  a=$1; b=$2
  same=0; diff=0; missing=0
  for f in "$a"/*.cmd; do
    [ -f "$f" ] || continue
    id=${f##*/}; id=${id%.cmd}
    cls=$(awk -F '\t' 'NR == 1 { print $1 }' "$f")
    d=0
    for k in cmd out err rc; do
      if [ ! -f "$b/$id.$k" ]; then missing=$((missing + 1)); d=1; continue; fi
      cmp -s "$a/$id.$k" "$b/$id.$k" || d=1
    done
    if [ "$d" -eq 1 ]; then
      diff=$((diff + 1))
      printf 'DIFF %s [%s] %s\n' "$id" "$cls" "$(cut -f2- "$f")"
    else
      same=$((same + 1))
    fi
  done
  na=$(ls "$a" | grep -c '\.cmd$')
  nb=$(ls "$b" | grep -c '\.cmd$')
  echo "compare: $na and $nb captures; same $same, diff $diff, missing files $missing"
  [ "$na" -gt 0 ] && [ "$na" -eq "$nb" ] && [ "$diff" -eq 0 ] && [ "$missing" -eq 0 ]
}

case "$sub" in
  plan) [ $# -eq 1 ] || usage; plan "$1" ;;
  run) [ $# -eq 3 ] || usage; run "$1" "$2" "$3" ;;
  compare) [ $# -eq 2 ] || usage; compare "$1" "$2" ;;
  *) usage ;;
esac
