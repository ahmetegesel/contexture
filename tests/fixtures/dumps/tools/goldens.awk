# goldens.awk: fixture tool (never run by the compliance suite). Computes the answers
# contract 2 fixes for one imported unit dump, by the derivation rules of
# docs/the-engine.md (ordinal, seq, occurrence, next, positional closure, live,
# open_tasks, open_threads, superseded_by, active): task.get, finding.get, entry.get,
# session.board, session.load (a unit without ref_sessions units), lane.get. Each answer
# is written to <out>/<function>.<id>.json as one compact JSON line.
# usage: awk -v lineno=1 -f tests/lib/jflat.awk unit.dump | awk -v out=<folder> -f goldens.awk

function J(n, p,   t, keys, k, i, o, m) {
  t = V[n, p]
  if (t ~ /^\{/ && t !~ /^"/) {
    if (t == "{}") return "{}"
    keys = substr(t, 2, length(t) - 2)
    m = split(keys, k, /,/)
    o = "{"
    for (i = 1; i <= m; i++) o = o (i > 1 ? "," : "") "\"" k[i] "\":" J(n, (p == "@" ? "" : p ".") k[i])
    return o "}"
  }
  if (t ~ /^\[[0-9]+\]$/) {
    m = substr(t, 2, length(t) - 2) + 0
    o = "["
    for (i = 1; i <= m; i++) o = o (i > 1 ? "," : "") J(n, (p == "@" ? "" : p ".") i)
    return o "]"
  }
  return t
}
function T(n, p) { return V[n, p] }
function dq(t) { return (t == "null") ? "" : substr(t, 2, length(t) - 2) }

function wr(name, s,   f) {
  f = out "/" name ".json"
  print s > f
  close(f)
}

function nextof(i, arr, cnt) { return (i < cnt) ? "\"" arr[i + 1] "\"" : "null" }

function task_json(i,   n) {
  n = TK[i]
  return "{\"slug\":" T(n, "slug") ",\"ordinal\":" i ",\"status\":" T(n, "status") ",\"objective\":" T(n, "objective") ",\"refs\":" J(n, "refs") ",\"description\":" T(n, "description") ",\"criteria\":" T(n, "criteria") ",\"details\":" T(n, "details") ",\"next\":" nextof(i, BKK, NB) ",\"verbatim\":" T(n, "verbatim") "}"
}
function opaque_json(i, kinds, cnt, recs) {
  return "{\"kind\":\"opaque\",\"seq\":" i ",\"next\":" nextof(i, kinds, cnt) ",\"verbatim\":" T(recs[i], "verbatim") "}"
}
function finding_json(i,   n, sb, j) {
  n = KF[i]
  sb = "null"
  for (j = 1; j <= NK; j++) if (KNK[j] == "finding" && T(KF[j], "supersedes.name") == T(n, "name")) { sb = T(KF[j], "name"); break }
  return "{\"name\":" T(n, "name") ",\"ordinal\":" i ",\"supersedes\":" J(n, "supersedes") ",\"refs\":" J(n, "refs") ",\"summary\":" T(n, "summary") ",\"superseded_by\":" sb ",\"active\":" (sb == "null" ? "true" : "false") ",\"next\":" nextof(i, KNK, NK) ",\"verbatim\":" T(n, "verbatim") "}"
}

# closing(i): the index of the first journal item after i whose closers name item i's slug
function closing(i,   j, n, c, m, t, k, s) {
  s = T(JR[i], "slug")
  for (j = i + 1; j <= NJ; j++) {
    if (JK[j] != "entry") continue
    n = JR[j]
    c = T(n, "closers"); gsub(/[][]/, "", c)
    for (k = 1; k <= c + 0; k++) {
      m = T(n, "closers." k ".targets"); gsub(/[][]/, "", m)
      for (t = 1; t <= m + 0; t++) if (T(n, "closers." k ".targets." t) == s) { CLK = k; return j }
    }
  }
  return 0
}

function occ(i,   j, c) {
  c = 0
  for (j = 1; j <= i; j++) if (JK[j] == "entry" && T(JR[j], "slug") == T(JR[i], "slug")) c++
  return c
}

function entry_json(i, withclosed,   n, o, j, v, r, cr) {
  n = JR[i]
  o = "{\"kind\":\"entry\",\"slug\":" T(n, "slug") ",\"occurrence\":" occ(i) ",\"seq\":" i ",\"anchor\":" T(n, "anchor") ",\"what\":" T(n, "what") ",\"group\":" T(n, "group") ",\"rhythm\":" T(n, "rhythm") ",\"knowledge\":" T(n, "knowledge") ",\"thread\":" T(n, "thread") ",\"legacy_status\":" T(n, "legacy_status") ",\"refs\":" J(n, "refs") ",\"closers\":" J(n, "closers") ",\"extra_fields\":" J(n, "extra_fields")
  if (withclosed) {
    j = closing(i)
    if (j == 0) o = o ",\"closed\":false,\"closed_by\":null,\"close_reason\":null"
    else {
      v = T(JR[j], "closers." CLK ".verdict"); r = T(JR[j], "closers." CLK ".reason")
      if (v != "null") cr = "\"" dq(v) ": " dq(r) "\""
      else cr = r
      o = o ",\"closed\":true,\"closed_by\":" T(JR[j], "slug") ",\"close_reason\":" cr
    }
  }
  return o ",\"next\":" nextof(i, JK, NJ) ",\"verbatim\":" T(n, "verbatim") "}"
}

function anchor_json(i, recs, kinds, cnt,   n) {
  n = recs[i]
  return "{\"kind\":\"anchor\",\"seq\":" i ",\"anchor\":" T(n, "anchor") ",\"continues\":" T(n, "continues") ",\"attention\":" T(n, "attention") ",\"next\":" nextof(i, kinds, cnt) ",\"verbatim\":" T(n, "verbatim") "}"
}

function state_json(   n) {
  n = SR
  return "{\"unit\":" UQ ",\"status\":" T(n, "status") ",\"current_anchor\":" T(n, "current_anchor") ",\"next_action\":" T(n, "next_action") ",\"objective\":" T(n, "objective") ",\"repos\":" J(n, "repos") ",\"ref_sessions\":" J(n, "ref_sessions") ",\"verbatim\":" T(n, "verbatim") "}"
}

function board_json(   o, i, first, ot, th, ft) {
  if (JPRE == "null") return "null"
  o = "{\"unit\":" UQ ",\"backlog_present\":" (BPRE == "null" ? "false" : "true") ",\"live\":["
  first = 1; th = ""; ft = 1
  for (i = 1; i <= NJ; i++) {
    if (JK[i] != "entry" || closing(i) > 0) continue
    o = o (first ? "" : ",") entry_json(i, 0)
    first = 0
    if (T(JR[i], "thread") != "null" && T(JR[i], "thread") != "\"none\"") {
      th = th (ft ? "" : ",") "{\"slug\":" T(JR[i], "slug") ",\"anchor\":" (T(JR[i], "anchor") == "null" ? "\"\"" : T(JR[i], "anchor")) ",\"thread\":" T(JR[i], "thread") "}"
      ft = 0
    }
  }
  o = o "],\"open_tasks\":["
  first = 1
  for (i = 1; i <= NB; i++) if (BKK[i] == "task" && T(TK[i], "status") != "\"DONE\"") { o = o (first ? "" : ",") T(TK[i], "slug"); first = 0 }
  return o "],\"open_threads\":[" th "]}"
}

function lanejournal_json(l,   o, i, first, c, n, k) {
  o = "{\"unit\":" UQ ",\"lane\":\"" l "\",\"artifact\":\"journal\",\"preamble\":" LPRE[l] ",\"items\":["
  c = 0
  for (i = 1; i <= NL_[l]; i++) { LK_[i] = LK[l, i]; LR_[i] = LR[l, i] }
  for (i = 1; i <= NL_[l]; i++) {
    n = LR[l, i]
    o = o (i > 1 ? "," : "")
    if (LK[l, i] == "anchor") o = o anchor_json(i, LR_, LK_, NL_[l])
    else {
      c = 0
      for (k = 1; k <= i; k++) if (LK[l, k] == "entry" && T(LR[l, k], "slug") == T(n, "slug")) c++
      o = o "{\"kind\":\"entry\",\"lane\":\"" l "\",\"slug\":" T(n, "slug") ",\"occurrence\":" c ",\"seq\":" i ",\"anchor\":" T(n, "anchor") ",\"what\":" T(n, "what") ",\"group\":" T(n, "group") ",\"rhythm\":" T(n, "rhythm") ",\"knowledge\":" T(n, "knowledge") ",\"thread\":" T(n, "thread") ",\"legacy_status\":" T(n, "legacy_status") ",\"refs\":" J(n, "refs") ",\"closers\":" J(n, "closers") ",\"extra_fields\":" J(n, "extra_fields") ",\"next\":" nextof(i, LK_, NL_[l]) ",\"verbatim\":" T(n, "verbatim") "}"
    }
  }
  return o "]}"
}

{
  n = $0; sub(/:.*$/, "", n)
  rest = substr($0, length(n) + 2)
  p = rest; sub(/=.*$/, "", p)
  V[n, p] = substr(rest, length(p) + 2)
  if (n + 0 > MAXN) MAXN = n + 0
}

END {
  art = ""; curlane = ""
  for (n = 1; n <= MAXN; n++) {
    k = dq(V[n, "kind"])
    if (k == "unit") { UQ = V[n, "unit"]; U = dq(UQ) }
    else if (k == "state") SR = n
    else if (k == "artifact") {
      art = dq(V[n, "name"])
      if (art == "backlog") BPRE = V[n, "preamble"]
      if (art == "knowledge") KPRE = V[n, "preamble"]
      if (art == "journal") JPRE = V[n, "preamble"]
    } else if (k == "lane") {
      art = "lane"; curlane = dq(V[n, "lane"]); LANES[++NLANES] = curlane
      LREC[curlane] = V[n, "recipe"]; LREP[curlane] = V[n, "report"]; LPRE[curlane] = V[n, "journal_preamble"]
    } else if (k == "lane_item") {
      NL_[curlane]++
      LK[curlane, NL_[curlane]] = dq(V[n, "item"]); LR[curlane, NL_[curlane]] = n
    } else if (art == "backlog" && (k == "task" || k == "opaque")) {
      NB++; BKK[NB] = k; TK[NB] = n
    } else if (art == "knowledge" && (k == "finding" || k == "opaque")) {
      NK++; KNK[NK] = k; KF[NK] = n
    } else if (art == "journal" && (k == "entry" || k == "anchor")) {
      NJ++; JK[NJ] = k; JR[NJ] = n
    }
  }
  # the per-item answers
  for (i = 1; i <= NB; i++) if (BKK[i] == "task") wr("task.get." dq(T(TK[i], "slug")), "{\"unit\":" UQ ",\"task\":" task_json(i) "}")
  for (i = 1; i <= NK; i++) if (KNK[i] == "finding") wr("finding.get." dq(T(KF[i], "name")), "{\"unit\":" UQ ",\"finding\":" finding_json(i) "}")
  # entry.get answers the last occurrence of a slug
  for (i = 1; i <= NJ; i++) if (JK[i] == "entry") LASTOCC[dq(T(JR[i], "slug"))] = i
  for (s in LASTOCC) wr("entry.get." s, "{\"unit\":" UQ ",\"entry\":" entry_json(LASTOCC[s], 1) "}")
  wr("session.board", board_json())
  # session.load
  bl = ""
  for (i = 1; i <= NB; i++) bl = bl (i > 1 ? "," : "") (BKK[i] == "task" ? task_json(i) : opaque_json(i, BKK, NB, TK))
  kl = ""
  for (i = 1; i <= NK; i++) kl = kl (i > 1 ? "," : "") (KNK[i] == "finding" ? finding_json(i) : opaque_json(i, KNK, NK, KF))
  wr("session.load", "{\"unit\":" UQ ",\"state\":" state_json() ",\"backlog\":{\"preamble\":" BPRE ",\"tasks\":[" bl "]},\"knowledge\":{\"preamble\":" KPRE ",\"findings\":[" kl "]},\"board\":" board_json() ",\"refs\":[]}")
  for (i = 1; i <= NLANES; i++) {
    l = LANES[i]
    wr("lane.get." l ".recipe", "{\"unit\":" UQ ",\"lane\":\"" l "\",\"artifact\":\"recipe\",\"content\":" LREC[l] "}")
    wr("lane.get." l ".report", "{\"unit\":" UQ ",\"lane\":\"" l "\",\"artifact\":\"report\",\"content\":" LREP[l] "}")
    wr("lane.get." l ".journal", lanejournal_json(l))
  }
}
