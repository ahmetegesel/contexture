# md2dump.awk: fixture tool (never run by the compliance suite). Parses one markdown
# artifact of a posix unit by the parse rules of docs/the-engine.md (The record data
# model, legacy shapes) and prints its dump lines (@dump, version 1): the typed fields
# of every item plus a verbatim span present exactly when the stored span differs from
# the canonical span the typed fields render. md2dump.sh drives it per artifact; the
# fixtures under tests/fixtures/dumps were authored as markdown and converted with it,
# then read by hand.
#
# -v art=state|backlog|knowledge|journal|lanejournal -v eofnl=0|1 -v lane=<lane>
# eofnl says whether the file ends with a newline (awk cannot see it).

function jstr(s,   out, i, n, c, o, p, parts) {
  # backslash doubled by concatenation, never by a gsub replacement
  n = split(s, parts, /\\/)
  out = (n ? parts[1] : "")
  for (i = 2; i <= n; i++) out = out "\\" "\\" parts[i]
  gsub(/"/, "\\\"", out)
  gsub(/\n/, "\\n", out)
  gsub(/\t/, "\\t", out)
  gsub(/\r/, "\\r", out)
  if (out ~ /[\001-\037]/) {
    o = ""
    for (i = 1; i <= length(out); i++) {
      c = substr(out, i, 1)
      p = index(CTRL, c)
      if (p > 0) {
        if (p == 8) o = o "\\b"
        else if (p == 12) o = o "\\f"
        else o = o sprintf("\\u%04x", p)
      } else o = o c
    }
    out = o
  }
  return "\"" out "\""
}

function jnull(s) { return (s == NULLV) ? "null" : jstr(s) }

function jlist(arr, n,   i, o) {
  o = "["
  for (i = 1; i <= n; i++) o = o (i > 1 ? "," : "") jstr(arr[i])
  return o "]"
}

function isblank(s) { return s ~ /^[ \t]*$/ }

function isdateslug(s) {
  return s ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[a-zA-Z0-9_-]*[a-zA-Z0-9]$/ && length(s) >= 12
}

function unq(v) {
  if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") return substr(v, 2, length(v) - 2)
  if (substr(v, 1, 1) == "\"") return substr(v, 2)
  return v
}

function unq_both(v) {
  if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") return substr(v, 2, length(v) - 2)
  return v
}

# the stored text of lines a..b (each newline terminated, except the file's last line
# when the file lacks a final newline)
function text(a, b,   i, o) {
  o = ""
  for (i = a; i <= b; i++) o = o L[i] ((i < NL || eofnl) ? "\n" : "")
  return o
}

function listparse(v, arr,   n, inner, k, parts, i, t) {
  if (substr(v, 1, 1) == "[" && substr(v, length(v), 1) == "]") {
    inner = substr(v, 2, length(v) - 2)
    n = 0
    if (inner ~ /^[ \t]*$/) return 0
    k = split(inner, parts, /,/)
    for (i = 1; i <= k; i++) {
      t = parts[i]
      sub(/^[ \t]+/, "", t)
      sub(/[ \t]+$/, "", t)
      arr[++n] = t
    }
    return n
  }
  n = 0
  k = split(v, parts, /[ \t]+/)
  for (i = 1; i <= k; i++) if (parts[i] != "") arr[++n] = parts[i]
  return n
}

function joinlist(arr, n, sep,   i, o) {
  o = ""
  for (i = 1; i <= n; i++) o = o (i > 1 ? sep : "") arr[i]
  return o
}

# ---- the field scan of one item: lines a+1..cend (cend: the last non-blank line) ----
# fills FN (count), FL[i] label, FV[i] value, FB[i] 1 for a block scalar
function scan(a, cend,   j, k, last, lab, v) {
  FN = 0
  j = a + 1
  while (j <= cend) {
    if (L[j] ~ /^  [A-Z][A-Z_ ]* ::[ \t]*$/) {
      lab = L[j]
      sub(/^  /, "", lab)
      sub(/ ::[ \t]*$/, "", lab)
      last = j
      k = j + 1
      while (k <= cend) {
        if (L[k] ~ /^    /) { last = k; k++ }
        else if (isblank(L[k])) k++
        else break
      }
      v = ""
      for (k = j + 1; k <= last; k++) v = v (k > j + 1 ? "\n" : "") (L[k] ~ /^    / ? substr(L[k], 5) : "")
      FN++; FL[FN] = lab; FV[FN] = v; FB[FN] = 1; FLINE[FN] = j
      j = last + 1
      continue
    }
    if (L[j] ~ /^  [A-Z][A-Z_]*: /) {
      lab = L[j]
      sub(/^  /, "", lab)
      sub(/: .*$/, "", lab)
      v = substr(L[j], length(lab) + 5)
      if ((lab == "WHAT" || lab == "OBJECTIVE") && substr(v, 1, 1) == "\"" && (length(v) == 1 || substr(v, length(v), 1) != "\"")) {
        k = j + 1
        while (k <= cend) {
          v = v "\n" L[k]
          if (substr(L[k], length(L[k]), 1) == "\"") break
          k++
        }
        if (k > cend) k = cend
        j = k
      }
      FN++; FL[FN] = lab; FV[FN] = v; FB[FN] = 0; FLINE[FN] = j
    }
    j++
  }
}

function content_end(a, b,   e) {
  e = b
  while (e > a && isblank(L[e])) e--
  return e
}

function sep(nextk) { return (nextk != NULLV && nextk != "anchor") ? "\n" : "" }

function block_lines(label, v,   o, n, parts, i) {
  o = "  " label " ::\n"
  if (v == "") return o
  n = split(v, parts, /\n/)
  for (i = 1; i <= n; i++) o = o (parts[i] == "" ? "" : "    " parts[i]) "\n"
  return o
}

# ---- the kinds ----
function do_task(a, b, nextk,   cend, i, status, obj, refsv, nref, R, desc, crit, det, canon, stored, seen) {
  cend = content_end(a, b)
  scan(a, cend)
  status = NULLV; obj = NULLV; refsv = NULLV; desc = NULLV; crit = NULLV; det = NULLV
  for (i = 1; i <= FN; i++) {
    if (FL[i] == "STATUS" && !FB[i] && status == NULLV) status = FV[i]
    else if (FL[i] == "OBJECTIVE" && !FB[i] && obj == NULLV) obj = unq(FV[i])
    else if (FL[i] == "REFS" && !FB[i] && refsv == NULLV) refsv = FV[i]
    else if (FL[i] == "DESCRIPTION" && FB[i] && desc == NULLV) desc = FV[i]
    else if (FL[i] == "ACCEPTANCE CRITERIA" && FB[i] && crit == NULLV) crit = FV[i]
    else if (FL[i] == "IMPLEMENTATION DETAILS" && FB[i] && det == NULLV) det = FV[i]
  }
  if (status == NULLV) status = "TODO"
  if (obj == NULLV) obj = ""
  nref = (refsv == NULLV) ? 0 : listparse(refsv, R)
  slug = L[a]; sub(/^@task[ \t]+/, "", slug); sub(/[ \t].*$/, "", slug)
  canon = "@task " slug "\n  STATUS: " status "\n  OBJECTIVE: \"" obj "\"\n"
  if (nref > 0) canon = canon "  REFS: [" joinlist(R, nref, ", ") "]\n"
  if (desc != NULLV) canon = canon block_lines("DESCRIPTION", desc)
  if (crit != NULLV) canon = canon block_lines("ACCEPTANCE CRITERIA", crit)
  if (det != NULLV) canon = canon block_lines("IMPLEMENTATION DETAILS", det)
  canon = canon sep(nextk)
  stored = text(a, b)
  out("{\"kind\":\"task\",\"slug\":" jstr(slug) ",\"status\":" jstr(status) ",\"objective\":" jstr(obj) ",\"refs\":" jlist(R, nref) ",\"description\":" jnull(desc) ",\"criteria\":" jnull(crit) ",\"details\":" jnull(det) ",\"verbatim\":" (stored == canon ? "null" : jstr(stored)) "}")
}

function do_finding(a, b, nextk,   cend, i, sup, supn, supr, nref, R, summ, canon, stored, name, t) {
  cend = content_end(a, b)
  scan(a, cend)
  sup = NULLV; summ = NULLV; nref = 0
  for (i = 1; i <= FN; i++) {
    if (FL[i] == "SUPERSEDES" && !FB[i] && sup == NULLV) sup = FV[i]
    else if (FL[i] == "REF" && !FB[i]) R[++nref] = unq_both(FV[i])
    else if (FL[i] == "SUMMARY" && FB[i] && summ == NULLV) summ = FV[i]
  }
  if (summ == NULLV) summ = ""
  name = L[a]; sub(/^@finding[ \t]+/, "", name); sub(/[ \t].*$/, "", name)
  supj = "null"
  canon = "@finding " name "\n"
  if (sup != NULLV) {
    supn = sup; sub(/[ \t].*$/, "", supn)
    supr = ""
    t = sup
    if (index(t, "(") > 0) {
      t = substr(t, index(t, "(") + 1)
      if (index(t, ")") > 0) t = substr(t, 1, index(t, ")") - 1)
      supr = t
    }
    supj = "{\"name\":" jstr(supn) ",\"reason\":" jstr(supr) "}"
    canon = canon "  SUPERSEDES: " supn " (" supr ")\n"
  }
  for (i = 1; i <= nref; i++) canon = canon "  REF: \"" R[i] "\"\n"
  canon = canon block_lines("SUMMARY", summ) sep(nextk)
  stored = text(a, b)
  out("{\"kind\":\"finding\",\"name\":" jstr(name) ",\"supersedes\":" supj ",\"refs\":" jlist(R, nref) ",\"summary\":" jstr(summ) ",\"verbatim\":" (stored == canon ? "null" : jstr(stored)) "}")
}

# closer(kind, value, line) appends one closer JSON to CLJ and its canonical line to CLC
function closer(kind, v, line,   cut, tpart, rest, n, parts, i, T, nt, verdict, reason, inner, canon, p1, p2) {
  p1 = index(v, " - "); p2 = index(v, " (")
  cut = 0
  if (p1 > 0) cut = p1
  if (p2 > 0 && (cut == 0 || p2 < cut)) cut = p2
  tpart = (cut > 0) ? substr(v, 1, cut - 1) : v
  rest = (cut > 0) ? substr(v, cut + 1) : ""
  sub(/^[ \t]+/, "", rest)
  nt = 0
  n = split(tpart, parts, /[ \t]+/)
  for (i = 1; i <= n; i++) if (isdateslug(parts[i])) T[++nt] = parts[i]
  verdict = NULLV; reason = NULLV
  if (substr(rest, 1, 1) == "(") {
    inner = substr(rest, 2)
    if (index(inner, ")") > 0) inner = substr(inner, 1, index(inner, ")") - 1)
    if (inner ~ /^(done|superseded|dropped|folded): /) {
      verdict = inner; sub(/: .*$/, "", verdict)
      reason = substr(inner, length(verdict) + 3)
    } else if (inner != "") reason = inner
  } else if (substr(rest, 1, 2) == "- ") {
    reason = substr(rest, 3)
    if (reason == "") reason = NULLV
  }
  canon = "  " kind ": " joinlist(T, nt, " ")
  if (verdict != NULLV) canon = canon " (" verdict ": " reason ")"
  else if (reason != NULLV) canon = canon " (" reason ")"
  CLC = CLC ((canon == line) ? line : line) "\n"
  CLJ = CLJ (CLJ == "" ? "" : ",") "{\"kind\":" jstr(kind) ",\"targets\":" jlist(T, nt) ",\"verdict\":" jnull(verdict) ",\"reason\":" jnull(reason) ",\"verbatim\":" (canon == line ? "null" : jstr(line)) "}"
}

function do_entry(a, b, nextk, islane,   cend, i, last, slug, anchor, what, group, rhythm, thread, know, lst, nref, R, EX, canon, stored, single) {
  cend = content_end(a, b)
  scan(a, cend)
  split("", last)
  for (i = 1; i <= FN; i++) last[FL[i] SUBSEP FB[i]] = i
  anchor = NULLV; what = NULLV; group = NULLV; rhythm = NULLV; thread = NULLV; know = "false"; lst = NULLV
  nref = 0; CLJ = ""; CLC = ""; EX = ""
  for (i = 1; i <= FN; i++) {
    if (!FB[i] && FL[i] ~ /^(ANCHOR|WHAT|GROUP|RHYTHM|THREAD|KNOWLEDGE|STATUS)$/ && last[FL[i] SUBSEP 0] == i) {
      if (FL[i] == "ANCHOR") anchor = FV[i]
      else if (FL[i] == "WHAT") what = unq(FV[i])
      else if (FL[i] == "GROUP") group = FV[i]
      else if (FL[i] == "RHYTHM") rhythm = FV[i]
      else if (FL[i] == "THREAD") thread = FV[i]
      else if (FL[i] == "KNOWLEDGE") know = (FV[i] == "true") ? "true" : "false"
      else if (FL[i] == "STATUS") lst = FV[i]
    } else if (FB[i] && FL[i] == "WHAT" && last["WHAT" SUBSEP 1] == i && !(("WHAT" SUBSEP 0) in last)) {
      what = FV[i]
    } else if (!FB[i] && FL[i] == "REF") {
      R[++nref] = unq_both(FV[i])
    } else if (!FB[i] && (FL[i] == "CLOSES" || FL[i] == "SUPERSEDES")) {
      closer(FL[i], FV[i], L[FLINE[i]])
    } else {
      EX = EX (EX == "" ? "" : ",") "{\"key\":" jstr(FL[i]) ",\"value\":" jstr(FV[i]) "}"
    }
  }
  slug = L[a]; sub(/^@entry[ \t]+/, "", slug); sub(/[ \t].*$/, "", slug)
  canon = "@entry " slug "\n"
  if (islane) {
    if (what != NULLV) canon = canon "  WHAT: \"" what "\"\n"
    if (thread != NULLV) canon = canon "  THREAD: " thread "\n"
    for (i = 1; i <= nref; i++) canon = canon "  REF: \"" R[i] "\"\n"
    # a lane entry's canonical lines never carry ANCHOR, GROUP, RHYTHM, closers, KNOWLEDGE
    if (anchor != NULLV || group != NULLV || rhythm != NULLV || CLJ != "" || know == "true") canon = canon "\001"
  } else {
    if (anchor != NULLV) canon = canon "  ANCHOR: " anchor "\n"
    if (what != NULLV) canon = canon "  WHAT: \"" what "\"\n"
    if (group != NULLV) canon = canon "  GROUP: " group "\n"
    if (rhythm != NULLV) canon = canon "  RHYTHM: " rhythm "\n"
    if (thread != NULLV) canon = canon "  THREAD: " thread "\n"
    for (i = 1; i <= nref; i++) canon = canon "  REF: \"" R[i] "\"\n"
    canon = canon CLC
    if (know == "true") canon = canon "  KNOWLEDGE: true\n"
  }
  canon = canon sep(nextk)
  stored = text(a, b)
  single = "\"slug\":" jstr(slug) ",\"anchor\":" jnull(anchor) ",\"what\":" jnull(what) ",\"group\":" jnull(group) ",\"rhythm\":" jnull(rhythm) ",\"knowledge\":" know ",\"thread\":" jnull(thread) ",\"legacy_status\":" jnull(lst) ",\"refs\":" jlist(R, nref) ",\"closers\":[" CLJ "],\"extra_fields\":[" EX "],\"verbatim\":" (stored == canon ? "null" : jstr(stored))
  if (islane) out("{\"kind\":\"lane_item\",\"lane\":" jstr(lane) ",\"item\":\"entry\"," single "}")
  else out("{\"kind\":\"entry\"," single "}")
}

function do_anchor(a, b, nextk, islane,   cend, h, anc, rest, cont, att, canon, stored, body) {
  cend = content_end(a, b)
  h = L[a]
  sub(/^@anchor[ \t]+/, "", h)
  anc = h; sub(/[ \t].*$/, "", anc)
  rest = substr(h, length(anc) + 2)
  cont = NULLV; att = NULLV
  if (rest ~ /^\("continues A[0-9]+", attention: .*\)$/) {
    cont = rest; sub(/^\("continues /, "", cont); sub(/".*$/, "", cont)
    att = rest; sub(/^\("continues A[0-9]+", attention: /, "", att); sub(/\)$/, "", att)
    att = unq_both(att)
  }
  canon = (cont != NULLV && att != NULLV) ? "@anchor " anc " (\"continues " cont "\", attention: " att ")\n" : "@anchor " anc "\n"
  canon = canon sep(nextk)
  stored = text(a, b)
  body = "\"anchor\":" jstr(anc) ",\"continues\":" jnull(cont) ",\"attention\":" jnull(att) ",\"verbatim\":" (stored == canon ? "null" : jstr(stored))
  if (islane) out("{\"kind\":\"lane_item\",\"lane\":" jstr(lane) ",\"item\":\"anchor\"," body "}")
  else out("{\"kind\":\"anchor\"," body "}")
}

function do_opaque(a, b) {
  out("{\"kind\":\"opaque\",\"verbatim\":" jstr(text(a, b)) "}")
}

function out(s) { print s; RECORDS++ }

function state_line(   i, k, v, st, ca, na, ob, rv, rs, nr, R, ns, S, canon, stored) {
  st = ""; ca = ""; na = ""; ob = ""; rv = NULLV; rs = NULLV
  for (i = 1; i <= NL; i++) {
    if (L[i] !~ /^[a-z_]+: ?/) continue
    k = L[i]; sub(/:.*$/, "", k)
    v = substr(L[i], length(k) + 2); sub(/^ /, "", v)
    if (k in SEEN) continue
    SEEN[k] = 1
    if (k == "status") st = v
    else if (k == "current_anchor") ca = v
    else if (k == "next_action") na = unq(v)
    else if (k == "objective") ob = unq(v)
    else if (k == "repos") rv = v
    else if (k == "ref_sessions") rs = v
  }
  nr = (rv == NULLV) ? 0 : listparse(rv, R)
  ns = (rs == NULLV) ? 0 : listparse(rs, S)
  canon = "status: " st "\ncurrent_anchor: " ca "\nnext_action: \"" na "\"\nobjective: \"" ob "\"\nrepos: [" joinlist(R, nr, ", ") "]\n"
  if (rs != NULLV) canon = canon "ref_sessions: [" joinlist(S, ns, ", ") "]\n"
  stored = text(1, NL)
  out("{\"kind\":\"state\",\"status\":" jstr(st) ",\"current_anchor\":" jstr(ca) ",\"next_action\":" jstr(na) ",\"objective\":" jstr(ob) ",\"repos\":" jlist(R, nr) ",\"ref_sessions\":" (rs == NULLV ? "null" : jlist(S, ns)) ",\"verbatim\":" (stored == canon ? "null" : jstr(stored)) "}")
}

BEGIN {
  NULLV = "\001null\001"
  CTRL = ""
  for (i = 1; i < 32; i++) CTRL = CTRL sprintf("%c", i)
  RECORDS = 0
}

{ L[++NL] = $0 }

END {
  if (art == "state") { state_line(); exit 0 }
  if (art == "doc") { print jstr(text(1, NL)); exit 0 }
  islane = (art == "lanejournal")
  nh = 0
  for (i = 1; i <= NL; i++) {
    if (art == "journal" || art == "lanejournal") {
      if (L[i] ~ /^@entry / || L[i] ~ /^@anchor /) H[++nh] = i
    } else if (L[i] ~ /^@[A-Za-z]/) H[++nh] = i
  }
  pre = (nh > 0) ? text(1, H[1] - 1) : text(1, NL)
  if (NL == 0) pre = ""
  # a lane journal's preamble travels on the lane line md2dump.sh writes
  if (art == "lanejournal") print "#PREAMBLE " jstr(pre)
  else out("{\"kind\":\"artifact\",\"name\":" jstr(art) ",\"preamble\":" jstr(pre) "}")
  for (i = 1; i <= nh; i++) {
    b = (i < nh) ? H[i + 1] - 1 : NL
    K[i] = kindof(L[H[i]])
  }
  for (i = 1; i <= nh; i++) {
    b = (i < nh) ? H[i + 1] - 1 : NL
    nk = (i < nh) ? K[i + 1] : NULLV
    if (K[i] == "task") do_task(H[i], b, nk)
    else if (K[i] == "finding") do_finding(H[i], b, nk)
    else if (K[i] == "entry") do_entry(H[i], b, nk, islane)
    else if (K[i] == "anchor") do_anchor(H[i], b, nk, islane)
    else do_opaque(H[i], b)
  }
}

function kindof(h) {
  if (art == "journal" || art == "lanejournal") return (h ~ /^@entry /) ? "entry" : "anchor"
  if (art == "backlog" && h ~ /^@task[ \t]/) return "task"
  if (art == "knowledge" && h ~ /^@finding[ \t]/) return "finding"
  return "opaque"
}
