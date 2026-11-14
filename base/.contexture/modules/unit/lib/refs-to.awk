# refs-to.awk: the REF and REFS values of one unit's artifacts that name a target, one row
# each, "<unit><TAB><kind><TAB><id><TAB><ref>": a task's REFS (kind task), an entry's REF
# (entry), a finding's REF (finding), a lane journal entry's REF (lane_entry, id
# <lane>/<slug>), and a lane recipe's REFS block and TASKS and DECISIONS values (lane_recipe,
# id <lane>). The environment: RT_UNIT the unit, RT_TARGET a unit name (a ref into that unit
# matches) or a full address (the ref itself, or an address below it, a file# path's symbols
# included), RT_MAP the manifest lines "<file><TAB><part>" of the unit's artifacts.

function want(r,   t) {
  t = TARGET
  if (index(t, "#") == 0) return index(r, "unit#" t "/") == 1
  if (index(t, "file#") == 1 && index(r, t "#") == 1) return 1
  return r == t || index(r, t "/") == 1
}

function emit(kind, id, r) {
  if (want(r)) printf "%s\t%s\t%s\t%s\n", UNIT, kind, id, r
}

function strip(v) {
  if (v ~ /^".*"$/ && length(v) >= 2) v = substr(v, 2, length(v) - 2)
  return v
}

BEGIN {
  UNIT = ENVIRON["RT_UNIT"]
  TARGET = ENVIRON["RT_TARGET"]
  while ((getline ml < ENVIRON["RT_MAP"]) > 0) {
    split(ml, P, /\t/)
    PART[P[1]] = P[2]
  }
}

FNR == 1 {
  part = PART[FILENAME]
  kind = ""; lane = ""; id = ""; inrefs = 0
  if (part == "backlog") kind = "task"
  else if (part == "journal") kind = "entry"
  else if (part == "knowledge") kind = "finding"
  else if (part ~ /^lane\/[^\/]+\/journal$/) { kind = "lane_entry"; lane = substr(part, 6); sub(/\/journal$/, "", lane) }
  else if (part ~ /^lane\/[^\/]+\/recipe$/) { kind = "lane_recipe"; lane = substr(part, 6); sub(/\/recipe$/, "", lane); id = lane }
}

kind == "" { next }

kind == "lane_recipe" {
  if ($0 ~ /^[^ \t]/) inrefs = ($0 ~ /^REFS[ \t]*::/)
  if ($0 ~ /^  (TASKS|DECISIONS):[ \t]/) {
    v = $0
    sub(/^  [A-Z]+:[ \t]*/, "", v)
    n = split(v, V, /, /)
    for (i = 1; i <= n; i++) { w = V[i]; sub(/[ \t].*$/, "", w); emit(kind, id, w) }
    next
  }
  if (inrefs && $0 ~ /^[ \t]+[^ \t]/) { w = $0; sub(/^[ \t]+/, "", w); sub(/[ \t].*$/, "", w); emit(kind, id, w) }
  next
}

/^@(task|entry|finding)[ \t]/ {
  id = $2
  if (kind == "lane_entry") id = lane "/" $2
  next
}

/^  REF:/ {
  v = $0
  sub(/^  REF:[ \t]*/, "", v)
  emit(kind, id, strip(v))
  next
}

kind == "task" && /^  REFS:/ {
  v = $0
  sub(/^  REFS:[ \t]*/, "", v)
  if (v ~ /^\[.*\]$/) v = substr(v, 2, length(v) - 2)
  n = split(v, V, /,[ \t]*/)
  for (i = 1; i <= n; i++) if (V[i] != "") emit(kind, id, strip(V[i]))
}
