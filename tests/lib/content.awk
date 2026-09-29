# content.awk: the content of a record text view, blind to its layout (backlog
# end-review-fixes item 4: every item reads in the one canonical layout, so a proof across
# layouts compares content, never bytes). It reads a capture of any text view (board, a load
# page or the joined pages, resolve, task, entry, finding show, lane show, audit, refresh,
# active, units, the lists, search) and prints its content signature, one line per fact:
# two captures hold the same content exactly when their signatures are byte-identical.
#
# What it normalizes (layout) and what it keeps (content):
#   * a carriage return ending a line, blank lines, and trailing blanks of a line: dropped
#   * the scaffolding of a paged load (the map, the page headers, the keep reading and
#     complete lines, and with VIEW=load the WRITE SCOPE line every page repeats): dropped,
#     so the joined pages compare whole
#   * an item (a column-0 @<word> line to the next one): its head (the id, and any text after
#     it), then its field lines sorted by label with the values of one label in their order,
#     then the lines no field holds in their order; a block scalar and a one-line field of
#     one label hold the same value; WHAT and OBJECTIVE lines unquoted (a quoted value over
#     several lines joined as stored), REF unquoted, REFS a list (brackets, commas, or blanks;
#     an empty list the same as none), a closer its targets, verdict, and reason (a spaced
#     hyphen or a parenthesis, the reason to its last closing parenthesis), an anchor head
#     in the stamp form its anchor, continues, and attention; a task without STATUS reads TODO
#   * the other lines kept as they are, but a state key line ("<key>: <value>" at any
#     indent) with its continuation lines (a deeper indent) one value: next_action and
#     objective unquoted, repos and ref_sessions lists
#   * VIEW=search: a result line keeps its entity and section, never its snippet (the first
#     matching line of an entity follows its field order, which is layout)
# The environment: VIEW (optional). BWK awk, mawk, gawk, busybox; the C locale.

function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function isblank(s) { return s ~ /^[ \t]*$/ }
function unq(v) {
  if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") return substr(v, 2, length(v) - 2)
  if (substr(v, 1, 1) == "\"") return substr(v, 2)
  return v
}
function unq_both(v) {
  if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") return substr(v, 2, length(v) - 2)
  return v
}
function lastparen(s,   p, q) {
  p = 0
  while ((q = index(substr(s, p + 1), ")")) > 0) p += q
  return (p > 0) ? substr(s, 1, p - 1) : s
}
function listnorm(v,   n, A, i, o, t) {
  v = trim(v)
  if (substr(v, 1, 1) == "[" && substr(v, length(v), 1) == "]") {
    v = substr(v, 2, length(v) - 2)
    n = split(v, A, /,/)
  } else n = split(v, A, /[ \t]+/)
  o = ""
  for (i = 1; i <= n; i++) { t = trim(A[i]); if (t != "") o = o (o == "" ? "" : "|") t }
  return "[" o "]"
}
function isdateslug(s) { return s ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[a-zA-Z0-9_-]*[a-zA-Z0-9]$/ }
function closernorm(v,   p1, p2, cut, tpart, rest, n, A, i, tg, xt, verdict, reason, inner) {
  p1 = index(v, " - "); p2 = index(v, " (")
  cut = 0
  if (p1 > 0) cut = p1
  if (p2 > 0 && (cut == 0 || p2 < cut)) cut = p2
  tpart = (cut > 0) ? substr(v, 1, cut - 1) : v
  rest = (cut > 0) ? trim(substr(v, cut + 1)) : ""
  n = split(tpart, A, /[ \t]+/)
  tg = ""; xt = ""
  for (i = 1; i <= n; i++) {
    if (A[i] == "") continue
    if (isdateslug(A[i])) tg = tg (tg == "" ? "" : " ") A[i]
    else xt = xt (xt == "" ? "" : " ") A[i]
  }
  verdict = ""; reason = ""
  if (substr(rest, 1, 1) == "(") {
    inner = lastparen(substr(rest, 2))
    if (inner ~ /^(done|superseded|dropped|folded): /) { verdict = inner; sub(/: .*$/, "", verdict); reason = substr(inner, length(verdict) + 3) }
    else reason = inner
  } else if (substr(rest, 1, 2) == "- ") reason = substr(rest, 3)
  return tg " | " xt " | " verdict " | " reason
}

# the output: every signature line is printed with its backslashes doubled (by concatenation,
# never by a gsub replacement), its newlines and tabs escaped
function esc(s,   n, P, i, o) {
  n = split(s, P, /\\/)
  o = P[1]
  for (i = 2; i <= n; i++) o = o "\\" "\\" P[i]
  n = split(o, P, "\n"); o = (n ? P[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "n" P[i]
  n = split(o, P, /\t/); o = (n ? P[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "t" P[i]
  return o
}

# ---- an item ----
function item_flush(   h, w, id, rest, i, j, t, lab, v, first, last, m, key, n, K, KV, NKV, x, stray, cont, st, kk) {
  if (NIL == 0) return
  h = IL[1]
  w = h; sub(/^@/, "", w); sub(/[ \t].*$/, "", w)
  rest = substr(h, length(w) + 2)
  id = trim(rest); sub(/[ \t].*$/, "", id)
  rest = trim(substr(trim(rest), length(id) + 1))
  if (w == "anchor" && rest ~ /^\("continues A[0-9]+", attention: .*\)$/) {
    x = rest; sub(/^\("continues /, "", x); cont = x; sub(/".*$/, "", cont)
    sub(/^[^"]*", attention: /, "", x); sub(/\)$/, "", x)
    rest = "continues " cont " attention " unq_both(x)
  }
  print "ITEM\t" esc(w) "\t" esc(id) "\t" esc(rest)
  NKV = 0; stray = ""; st = 0
  i = 2
  while (i <= NIL) {
    t = IL[i]
    if (t ~ /^  [A-Z][A-Z_ ]* ::([ \t].*)?$/) {
      lab = t; sub(/^  /, "", lab); sub(/ ::.*$/, "", lab)
      first = substr(t, index(t, " ::") + 3); sub(/^[ \t]+/, "", first)
      v = isblank(first) ? "" : first
      last = i; m = i + 1
      while (m <= NIL && IL[m] ~ /^    /) { last = m; m++ }
      for (m = i + 1; m <= last; m++) v = v ((m > i + 1 || !isblank(first)) ? "\n" : "") substr(IL[m], 5)
      while (v ~ /\n[ \t]*$/) sub(/\n[ \t]*$/, "", v)
      if (isblank(v)) v = ""
      KL[++NKV] = lab; KV[NKV] = v
      i = last + 1
      continue
    }
    if (t ~ /^  [A-Z][A-Z_]*: /) {
      lab = t; sub(/^  /, "", lab); sub(/: .*$/, "", lab)
      v = substr(t, length(lab) + 5)
      if ((lab == "WHAT" || lab == "OBJECTIVE") && substr(v, 1, 1) == "\"" && (length(v) == 1 || substr(v, length(v), 1) != "\"")) {
        m = i + 1
        while (m <= NIL) { v = v "\n" IL[m]; if (substr(IL[m], length(IL[m]), 1) == "\"") break; m++ }
        i = (m > NIL) ? NIL : m
      }
      if (lab == "WHAT" || lab == "OBJECTIVE") v = unq(v)
      else if (lab == "REF") v = unq_both(v)
      else if (lab == "REFS") v = listnorm(v)
      else if ((lab == "CLOSES" || lab == "SUPERSEDES") && w != "finding") v = closernorm(v)
      else if (lab == "SUPERSEDES") { x = v; sub(/[ \t].*$/, "", x); v = (index(v, "(") ? x " | " lastparen(substr(v, index(v, "(") + 1)) : x " | ") }
      if (!(w == "task" && lab == "REFS" && v == "[]")) { KL[++NKV] = lab; KV[NKV] = v }
      if (w == "task" && lab == "STATUS") st = 1
      i++
      continue
    }
    stray = stray "S\t" esc(t) "\n"
    i++
  }
  if (w == "task" && !st) { KL[++NKV] = "STATUS"; KV[NKV] = "TODO" }
  # the fields sorted by label (a stable insertion sort keeps the order within a label)
  for (i = 2; i <= NKV; i++) {
    key = KL[i]; x = KV[i]
    for (j = i - 1; j >= 1 && KL[j] > key; j--) { KL[j + 1] = KL[j]; KV[j + 1] = KV[j] }
    KL[j + 1] = key; KV[j + 1] = x
  }
  for (i = 1; i <= NKV; i++) print "F\t" esc(KL[i]) "\t" esc(KV[i])
  printf "%s", stray
  NIL = 0
}

# ---- the text outside items: state key groups normalized, other lines kept ----
function key_flush(   k, v) {
  if (KEYK == "") return
  k = KEYK; v = KEYV
  if (k == "next_action" || k == "objective") v = unq(v)
  else if (k == "repos" || k == "ref_sessions") v = listnorm(v)
  print "K\t" esc(k) "\t" esc(v)
  KEYK = ""
}

function other(t,   ind, k, v) {
  if (t ~ /^ *[a-z_]+: ?/) {
    key_flush()
    ind = t; sub(/[^ ].*$/, "", ind)
    k = substr(t, length(ind) + 1); sub(/:.*$/, "", k)
    v = substr(t, length(ind) + length(k) + 2); sub(/^ /, "", v)
    KEYK = k; KEYV = v; KEYI = length(ind)
    return
  }
  if (KEYK != "" && t ~ /^ / && match(t, /[^ ]/) && RSTART - 1 > KEYI) { KEYV = KEYV "\n" substr(t, KEYI + 1); return }
  key_flush()
  if (VIEW == "search" && t ~ /^  [a-z_]+ [^ ]+ \([a-z_]+\): /) { sub(/: .*$/, "", t) }
  print "L\t" esc(t)
}

BEGIN { VIEW = ENVIRON["VIEW"]; NIL = 0; KEYK = "" }
{
  t = $0
  sub(/\r$/, "", t)
  sub(/[ \t]+$/, "", t)
  if (isblank(t)) next
  # the paged load's scaffolding
  if (t ~ /^LOAD (INCOMPLETE|COMPLETE)/ || t ~ /^load complete: pages / || t ~ /^session-load / || t ~ /^\[load / || t ~ /^keep reading: / || t ~ /^  (state|backlog|knowledge|journal|ref [^ ]+): lines [0-9]/) next
  # VIEW=load: the WRITE SCOPE line heads every page (a page header, not the unit's content)
  if (VIEW == "load" && t ~ /^WRITE SCOPE: /) next
  if (t ~ /^@[A-Za-z]/) { key_flush(); item_flush(); IL[++NIL] = t; next }
  if (NIL > 0) { IL[++NIL] = t; next }
  other(t)
}
END { key_flush(); item_flush() }
