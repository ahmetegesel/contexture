#!/bin/sh
# dump-check.sh: validates a contract 2 dump (docs/the-engine.md, The dump) and names
# the first bad line. A dump is one or more unit dumps in a row; each line is one
# compact JSON object ending with LF, of a known kind, carrying exactly its required
# fields in the contract key order with values of the allowed types; a unit dump opens
# with its unit line (format contexture-dump, version 1), then its state line, the
# backlog, knowledge, and journal artifact lines each followed by their own items, the
# lanes in bytewise order each followed by its own lane items, and closes with its end
# line naming the same unit and counting the lines between the two.
#
# usage: tests/dump-check.sh <dump-file>   (or the dump on stdin with no argument)
# exit: 0 valid (prints "dump-check: ok: <units> units, <lines> lines"); 1 the first
# defect, printed "dump-check: line <n>: <detail>" on stderr; 2 an unreadable input
set -u
SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
JF="$SCRIPT_DIR/lib/jflat.awk"

if [ $# -gt 1 ]; then
  printf 'usage: tests/dump-check.sh [<dump-file>]\n' >&2
  exit 2
fi
if [ $# -eq 1 ]; then
  f=$1
  [ -r "$f" ] || { printf 'dump-check: cannot read %s\n' "$f" >&2; exit 2; }
  tmp=""
else
  tmp=$(mktemp "${TMPDIR:-/tmp}/dump-check.XXXXXX") || exit 2
  cat > "$tmp"
  f=$tmp
fi
cleanup() { [ -n "$tmp" ] && rm -f "$tmp"; }
trap cleanup EXIT

if [ ! -s "$f" ]; then
  printf 'dump-check: line 1: an empty dump (a unit line expected)\n' >&2
  exit 1
fi
lines=$(wc -l < "$f" | tr -d ' ')
if [ "$(tail -c 1 "$f" | od -An -c | tr -d ' ')" != '\n' ]; then
  printf 'dump-check: line %s: the last line does not end with LF\n' "$((lines + 1))" >&2
  exit 1
fi

awk -v lineno=1 -f "$JF" "$f" | awk -v total="$lines" '
function bad(n, msg) {
  printf "dump-check: line %d: %s\n", n, msg > "/dev/stderr"
  failed = 1
  exit 1
}
function cls(t) {
  if (t == "null") return "n"
  if (t == "true" || t == "false") return "b"
  if (t ~ /^"/) return "s"
  if (t ~ /^\[[0-9]+\]$/) return "l"
  if (t ~ /^\{/) return "o"
  if (t ~ /^-?[0-9]+$/) return "i"
  return "x"
}
# want(n, path, classes): the value at path is one of the classes (s n b l o i)
function want(n, p, c,   t) {
  if (!((p) in V)) bad(n, "missing field " p)
  t = cls(V[p])
  if (index(c, t) == 0) bad(n, "field " p " has the wrong type (" V[p] ")")
}
function keys(n, p, want_keys,   t) {
  t = V[p]
  if (t != "{" want_keys "}") bad(n, (p == "@" ? "the line" : p) " must carry exactly the keys {" want_keys "} in that order, found " t)
}
function strlist(n, p,   c, i) {
  want(n, p, "l")
  c = V[p]; gsub(/[][]/, "", c)
  for (i = 1; i <= c + 0; i++) want(n, p "." i, "s")
}
function entry_fields(n,   c, i, m, j) {
  want(n, "slug", "s"); want(n, "anchor", "sn"); want(n, "what", "sn"); want(n, "group", "sn")
  want(n, "rhythm", "sn"); want(n, "knowledge", "b"); want(n, "thread", "sn"); want(n, "legacy_status", "sn")
  strlist(n, "refs")
  want(n, "closers", "l")
  c = V["closers"]; gsub(/[][]/, "", c)
  for (i = 1; i <= c + 0; i++) {
    keys(n, "closers." i, "kind,targets,verdict,reason,verbatim")
    if (V["closers." i ".kind"] != "\"CLOSES\"" && V["closers." i ".kind"] != "\"SUPERSEDES\"") bad(n, "closers." i ".kind must be CLOSES or SUPERSEDES")
    strlist(n, "closers." i ".targets")
    want(n, "closers." i ".verdict", "sn")
    if (V["closers." i ".verdict"] !~ /^(null|"done"|"superseded"|"dropped"|"folded")$/) bad(n, "closers." i ".verdict must be done, superseded, dropped, folded, or null")
    want(n, "closers." i ".reason", "sn"); want(n, "closers." i ".verbatim", "sn")
  }
  want(n, "extra_fields", "l")
  c = V["extra_fields"]; gsub(/[][]/, "", c)
  for (i = 1; i <= c + 0; i++) {
    keys(n, "extra_fields." i, "key,value")
    want(n, "extra_fields." i ".key", "s"); want(n, "extra_fields." i ".value", "s")
  }
  want(n, "verbatim", "sn")
}
function anchor_fields(n) {
  want(n, "anchor", "s"); want(n, "continues", "sn"); want(n, "attention", "sn"); want(n, "verbatim", "sn")
}
function unq(t) { return substr(t, 2, length(t) - 2) }

function check(n,   k, c) {
  if ("!error" in V) bad(n, "not one JSON value: column " V["!error"])
  if ("!spaced" in V) bad(n, "whitespace between tokens (a dump line is compact JSON)")
  if (cls(V["@"]) != "o") bad(n, "not a JSON object")
  if (!("kind" in V) || cls(V["kind"]) != "s") bad(n, "no kind")
  k = unq(V["kind"])
  if (phase == "" || phase == "end") {
    if (k != "unit") bad(n, "a unit line expected, found kind " k)
  } else if (k == "unit") bad(n, "a unit line before the end line of unit " unit)

  if (k == "unit") {
    keys(n, "@", "kind,format,version,unit,extras")
    if (V["format"] != "\"contexture-dump\"") bad(n, "format must be contexture-dump")
    if (V["version"] != "1") bad(n, "version must be 1, found " V["version"])
    want(n, "unit", "s")
    if (unq(V["unit"]) !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) bad(n, "unit is not a slug")
    want(n, "extras", "i")
    unit = V["unit"]; start = n; phase = "unit"; units++; lastlane = ""; arts = ""
    return
  }
  if (k == "end") {
    keys(n, "@", "kind,unit,records")
    if (V["unit"] != unit) bad(n, "the end line names " V["unit"] ", the unit line " unit)
    want(n, "records", "i")
    if (V["records"] + 0 != n - start - 1) bad(n, "records says " V["records"] ", the unit dump holds " (n - start - 1) " lines between its unit and end lines")
    if (arts != "backlog,knowledge,journal,") bad(n, "the unit dump lacks an artifact line (seen: " arts ")")
    phase = "end"
    return
  }
  if (k == "state") {
    if (phase != "unit") bad(n, "the state line must follow the unit line")
    keys(n, "@", "kind,status,current_anchor,next_action,objective,repos,ref_sessions,verbatim")
    want(n, "status", "s"); want(n, "current_anchor", "s"); want(n, "next_action", "s"); want(n, "objective", "s")
    strlist(n, "repos")
    if (V["ref_sessions"] != "null") strlist(n, "ref_sessions")
    want(n, "verbatim", "sn")
    phase = "state"
    return
  }
  if (k == "artifact") {
    keys(n, "@", "kind,name,preamble")
    want(n, "preamble", "sn")
    c = unq(V["name"])
    if (c == "backlog" && phase != "state") bad(n, "the backlog artifact line must follow the state line")
    if (c == "knowledge" && phase != "backlog") bad(n, "the knowledge artifact line must follow the backlog")
    if (c == "journal" && phase != "knowledge") bad(n, "the journal artifact line must follow the knowledge")
    if (c != "backlog" && c != "knowledge" && c != "journal") bad(n, "unknown artifact " c)
    arts = arts c ","
    phase = c; nullpre = (V["preamble"] == "null")
    return
  }
  if (k == "task" || k == "finding" || k == "entry" || k == "anchor" || k == "opaque") {
    if (k == "task" && phase != "backlog") bad(n, "a task outside the backlog")
    if (k == "finding" && phase != "knowledge") bad(n, "a finding outside the knowledge")
    if ((k == "entry" || k == "anchor") && phase != "journal") bad(n, "a " k " outside the journal")
    if (k == "opaque" && phase != "backlog" && phase != "knowledge") bad(n, "an opaque item outside the backlog and the knowledge")
    if (nullpre) bad(n, "an item under an absent artifact (preamble null)")
    if (k == "task") {
      keys(n, "@", "kind,slug,status,objective,refs,description,criteria,details,verbatim")
      want(n, "slug", "s"); want(n, "status", "s"); want(n, "objective", "s"); strlist(n, "refs")
      want(n, "description", "sn"); want(n, "criteria", "sn"); want(n, "details", "sn"); want(n, "verbatim", "sn")
    } else if (k == "finding") {
      keys(n, "@", "kind,name,supersedes,refs,summary,verbatim")
      want(n, "name", "s"); want(n, "supersedes", "on")
      if (V["supersedes"] != "null") { keys(n, "supersedes", "name,reason"); want(n, "supersedes.name", "s"); want(n, "supersedes.reason", "s") }
      strlist(n, "refs"); want(n, "summary", "s"); want(n, "verbatim", "sn")
    } else if (k == "entry") {
      keys(n, "@", "kind,slug,anchor,what,group,rhythm,knowledge,thread,legacy_status,refs,closers,extra_fields,verbatim")
      entry_fields(n)
    } else if (k == "anchor") {
      keys(n, "@", "kind,anchor,continues,attention,verbatim")
      anchor_fields(n)
    } else {
      keys(n, "@", "kind,verbatim")
      want(n, "verbatim", "s")
    }
    return
  }
  if (k == "lane") {
    if (phase != "journal" && phase != "lane") bad(n, "a lane line before the journal")
    keys(n, "@", "kind,lane,recipe,report,journal_preamble")
    want(n, "lane", "s"); want(n, "recipe", "sn"); want(n, "report", "sn"); want(n, "journal_preamble", "sn")
    c = unq(V["lane"])
    if (c !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) bad(n, "lane is not a slug")
    if (lastlane != "" && !(lastlane < c)) bad(n, "lane " c " out of bytewise order after " lastlane)
    lastlane = c; phase = "lane"; nullpre = (V["journal_preamble"] == "null")
    return
  }
  if (k == "lane_item") {
    if (phase != "lane") bad(n, "a lane item outside a lane")
    if (unq(V["lane"]) != lastlane) bad(n, "a lane item of lane " unq(V["lane"]) " under lane " lastlane)
    if (nullpre) bad(n, "a lane item under an absent lane journal (journal_preamble null)")
    if (V["item"] == "\"entry\"") {
      keys(n, "@", "kind,lane,item,slug,anchor,what,group,rhythm,knowledge,thread,legacy_status,refs,closers,extra_fields,verbatim")
      entry_fields(n)
    } else if (V["item"] == "\"anchor\"") {
      keys(n, "@", "kind,lane,item,anchor,continues,attention,verbatim")
      anchor_fields(n)
    } else bad(n, "lane item must be entry or anchor")
    return
  }
  bad(n, "unknown kind " k)
}

{
  n = $0; sub(/:.*$/, "", n)
  rest = substr($0, length(n) + 2)
  if (n != cur && cur != "") { check(cur + 0); split("", V) }
  cur = n
  p = rest; sub(/=.*$/, "", p)
  V[p] = substr(rest, length(p) + 2)
}

END {
  if (failed) exit 1
  if (cur != "") check(cur + 0)
  if (failed) exit 1
  if (phase != "end") { printf "dump-check: line %d: the dump ends inside unit %s (no end line)\n", total, unit > "/dev/stderr"; exit 1 }
  printf "dump-check: ok: %d units, %d lines\n", units, total
}'
