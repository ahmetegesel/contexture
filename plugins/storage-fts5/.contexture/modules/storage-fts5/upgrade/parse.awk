# parse.awk: the one-time upgrade parser of the fts5 plugin (schema version 3 to 4). It is
# the only reader of markdown in the plugin and runs only inside the upgrade step (D30):
# the version 3 store kept every artifact's text verbatim (the artifacts table), and this
# program reads one unit's texts, written to files by the upgrade, into the neutral dump
# of contract 2 (docs/the-engine.md, The dump), which the upgrade then loads through the
# same import as unit.import. It grew from the plugin's own v0.54.0 readings of these texts
# (the retired index.sh per artifact kind, closer.awk's closer cut) and follows the parse rules of
# docs/the-engine.md, The record data model, line for line, since the verbatim rule is a
# function of the bytes: an item carries its stored span as verbatim exactly when the
# canonical span its typed fields render differs from it, so this reading decides every
# verbatim as every other backend does (D7, TC60).
#
# Run in the C locale (every string is bytes). Inputs, through the environment (never awk
# -v, knowledge#FREE_TEXT_NEVER_THROUGH_AWK_V):
#   UP_UNIT  the unit
#   UP_MAN   the manifest: "F<TAB>key<TAB>eofnl<TAB>path" per artifact the unit holds (key
#            state, backlog, knowledge, journal, lane/<l>/recipe, lane/<l>/journal,
#            lane/<l>/report; eofnl 1 when the text ends with a newline or is empty),
#            "L<TAB>lane" per lane in bytewise order
# Output: the unit's dump lines on stdout. A backslash is doubled by concatenation, never
# by a gsub replacement (busybox awk and gawk --posix yield one backslash from four).

BEGIN {
  NULLV = "\001null\001"
  CTRL = ""
  for (c_i = 1; c_i < 32; c_i++) CTRL = CTRL sprintf("%c", c_i)
}

# ---- the JSON string form (JSON.stringify): \" \\ \b \f \n \r \t, \u00XX lower case below
# 0x20, every other byte raw ----
function jesc(s,   n, parts, i, out, o, c, p) {
  if (index(s, "\\") > 0) {
    n = split(s, parts, /\\/)
    out = parts[1]
    for (i = 2; i <= n; i++) out = out "\\" "\\" parts[i]
  } else out = s
  if (index(out, "\"") > 0) gsub(/"/, "\\\"", out)
  if (out ~ /[\001-\037]/) {
    gsub(/\n/, "\\n", out)
    gsub(/\t/, "\\t", out)
    gsub(/\r/, "\\r", out)
    if (out ~ /[\001-\037]/) {
      o = ""
      n = length(out)
      for (i = 1; i <= n; i++) {
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
  }
  return out
}
function js(s) { return "\"" jesc(s) "\"" }
function jn(s) { return (s == NULLV) ? "null" : js(s) }
function jb(b) { return b ? "true" : "false" }
function jarr(A, n,   i, o) {
  o = "["
  for (i = 1; i <= n; i++) o = o (i > 1 ? "," : "") js(A[i])
  return o "]"
}
function join(A, n, sep,   i, o) {
  o = ""
  for (i = 1; i <= n; i++) o = o (i > 1 ? sep : "") A[i]
  return o
}

# ---- the canonical lines (docs/the-engine.md, The canonical lines) ----
function sep_after(nk) { return (nk != NULLV && nk != "anchor") ? "\n" : "" }
function block(label, v,   o, n, P, i) {
  o = "  " label " ::\n"
  if (v == "") return o
  n = split(v, P, /\n/)
  for (i = 1; i <= n; i++) o = o (P[i] == "" ? "" : "    " P[i]) "\n"
  return o
}
function canon_state(st, ca, na, ob, R, nr, hasrs, S, ns,   o) {
  o = "status: " st "\ncurrent_anchor: " ca "\nnext_action: \"" na "\"\nobjective: \"" ob "\"\nrepos: [" join(R, nr, ", ") "]\n"
  if (hasrs) o = o "ref_sessions: [" join(S, ns, ", ") "]\n"
  return o
}
function canon_task(slug, st, ob, R, nr, d, c, t,   o) {
  o = "@task " slug "\n  STATUS: " st "\n  OBJECTIVE: \"" ob "\"\n"
  if (nr > 0) o = o "  REFS: [" join(R, nr, ", ") "]\n"
  if (d != NULLV) o = o block("DESCRIPTION", d)
  if (c != NULLV) o = o block("ACCEPTANCE CRITERIA", c)
  if (t != NULLV) o = o block("IMPLEMENTATION DETAILS", t)
  return o
}
function canon_closer(kind, T, nt, verdict, reason,   o) {
  o = "  " kind ": " join(T, nt, " ")
  if (verdict != NULLV) o = o " (" verdict ": " reason ")"
  else if (reason != NULLV) o = o " (" reason ")"
  return o
}
function canon_entry(slug, anchor, what, group, rhythm, thread, R, nr, cls, know,   o, i) {
  o = "@entry " slug "\n"
  if (anchor != NULLV) o = o "  ANCHOR: " anchor "\n"
  if (what != NULLV) o = o "  WHAT: \"" what "\"\n"
  if (group != NULLV) o = o "  GROUP: " group "\n"
  if (rhythm != NULLV) o = o "  RHYTHM: " rhythm "\n"
  if (thread != NULLV) o = o "  THREAD: " thread "\n"
  for (i = 1; i <= nr; i++) o = o "  REF: \"" R[i] "\"\n"
  o = o cls
  if (know) o = o "  KNOWLEDGE: true\n"
  return o
}
function canon_lane_entry(slug, what, thread, R, nr,   o, i) {
  o = "@entry " slug "\n"
  if (what != NULLV) o = o "  WHAT: \"" what "\"\n"
  if (thread != NULLV) o = o "  THREAD: " thread "\n"
  for (i = 1; i <= nr; i++) o = o "  REF: \"" R[i] "\"\n"
  return o
}
function canon_anchor(a, cont, att) {
  if (cont != NULLV && att != NULLV) return "@anchor " a " (\"continues " cont "\", attention: " att ")\n"
  return "@anchor " a "\n"
}
function canon_finding(name, supn, supr, R, nr, summ,   o, i) {
  o = "@finding " name "\n"
  if (supn != NULLV) o = o "  SUPERSEDES: " supn " (" supr ")\n"
  for (i = 1; i <= nr; i++) o = o "  REF: \"" R[i] "\"\n"
  return o block("SUMMARY", summ)
}

# ---- the texts: L[k, i] the lines without their newline and without a legacy trailing
# carriage return (CR[k, i] marks it; the stored bytes keep it) ----
function load(man,   line, f, k, p, t) {
  NLANES = 0
  while ((getline line < man) > 0) {
    split(line, f, "\t")
    if (f[1] == "L") { LANES[++NLANES] = f[2]; continue }
    if (f[1] != "F") continue
    k = f[2]
    p = substr(line, length(f[1]) + length(f[2]) + length(f[3]) + 4)
    HAS[k] = 1; NL[k] = 0
    EOFNL[k] = f[3] + 0
    while ((getline t < p) > 0) {
      NL[k]++
      if (t ~ /\r$/) { CR[k, NL[k]] = 1; t = substr(t, 1, length(t) - 1) }
      L[k, NL[k]] = t
    }
    close(p)
    if (NL[k] == 0) EOFNL[k] = 1
  }
  close(man)
}

# the stored bytes of lines a..b of k
function bytes(k, a, b,   i, o) {
  o = ""
  for (i = a; i <= b; i++) o = o L[k, i] (((k, i) in CR) ? "\r" : "") ((i < NL[k] || EOFNL[k]) ? "\n" : "")
  return o
}

function blank(s) { return s ~ /^[ \t]*$/ }
function dateslug(s) { return length(s) >= 12 && s ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[a-zA-Z0-9_-]*[a-zA-Z0-9]$/ }
function unq(v) {
  if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") return substr(v, 2, length(v) - 2)
  if (substr(v, 1, 1) == "\"") return substr(v, 2)
  return v
}
function unq_pair(v) {
  if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") return substr(v, 2, length(v) - 2)
  return v
}
# a list value: [a, b] split on commas (each element trimmed), else blank separated tokens
function list(v, A,   n, inner, k, P, i, t) {
  split("", A)
  n = 0
  if (substr(v, 1, 1) == "[" && substr(v, length(v), 1) == "]") {
    inner = substr(v, 2, length(v) - 2)
    if (inner ~ /^[ \t]*$/) return 0
    k = split(inner, P, /,/)
    for (i = 1; i <= k; i++) {
      t = P[i]
      sub(/^[ \t]+/, "", t)
      sub(/[ \t]+$/, "", t)
      A[++n] = t
    }
    return n
  }
  k = split(v, P, /[ \t]+/)
  for (i = 1; i <= k; i++) if (P[i] != "") A[++n] = P[i]
  return n
}

# fields(k, a, e): the field lines of an item's content (lines a+1..e) into NF_ fields:
# FLAB the label, FVAL the value, FBLK 1 for a block scalar, FLN its line
function fields(k, a, e,   j, m, last, lab, v) {
  NF_ = 0
  j = a + 1
  while (j <= e) {
    if (L[k, j] ~ /^  [A-Z][A-Z_ ]* ::[ \t]*$/) {
      lab = L[k, j]
      sub(/^  /, "", lab)
      sub(/ ::[ \t]*$/, "", lab)
      last = j
      m = j + 1
      while (m <= e) {
        if (L[k, m] ~ /^    /) { last = m; m++ }
        else if (blank(L[k, m])) m++
        else break
      }
      v = ""
      for (m = j + 1; m <= last; m++) v = v (m > j + 1 ? "\n" : "") (L[k, m] ~ /^    / ? substr(L[k, m], 5) : "")
      NF_++; FLAB[NF_] = lab; FVAL[NF_] = v; FBLK[NF_] = 1; FLN[NF_] = j
      j = last + 1
      continue
    }
    if (L[k, j] ~ /^  [A-Z][A-Z_]*: /) {
      lab = L[k, j]
      sub(/^  /, "", lab)
      sub(/: .*$/, "", lab)
      v = substr(L[k, j], length(lab) + 5)
      NF_++; FLAB[NF_] = lab; FBLK[NF_] = 0; FLN[NF_] = j
      # a quoted WHAT or OBJECTIVE that does not close on its line continues to the content
      # line that ends with a quote
      if ((lab == "WHAT" || lab == "OBJECTIVE") && substr(v, 1, 1) == "\"" && (length(v) == 1 || substr(v, length(v), 1) != "\"")) {
        m = j + 1
        while (m <= e) {
          v = v "\n" L[k, m]
          if (substr(L[k, m], length(L[k, m]), 1) == "\"") break
          m++
        }
        if (m > e) m = e
        j = m
      }
      FVAL[NF_] = v
    }
    j++
  }
}

# the content end: the item's last line before its trailing blank lines
function content_end(k, a, b,   e) {
  e = b
  while (e > a && blank(L[k, e])) e--
  return e
}

function D(s) { print s; NREC++ }

# ---- the items ----
function task_line(k, a, b, nk,   j, st, ob, rv, R, nr, d, c, t, slug, canon, stored) {
  fields(k, a, content_end(k, a, b))
  st = NULLV; ob = NULLV; rv = NULLV; d = NULLV; c = NULLV; t = NULLV
  for (j = 1; j <= NF_; j++) {
    if (!FBLK[j] && FLAB[j] == "STATUS" && st == NULLV) st = FVAL[j]
    else if (!FBLK[j] && FLAB[j] == "OBJECTIVE" && ob == NULLV) ob = unq(FVAL[j])
    else if (!FBLK[j] && FLAB[j] == "REFS" && rv == NULLV) rv = FVAL[j]
    else if (FBLK[j] && FLAB[j] == "DESCRIPTION" && d == NULLV) d = FVAL[j]
    else if (FBLK[j] && FLAB[j] == "ACCEPTANCE CRITERIA" && c == NULLV) c = FVAL[j]
    else if (FBLK[j] && FLAB[j] == "IMPLEMENTATION DETAILS" && t == NULLV) t = FVAL[j]
  }
  if (st == NULLV) st = "TODO"
  if (ob == NULLV) ob = ""
  nr = (rv == NULLV) ? 0 : list(rv, R)
  slug = L[k, a]; sub(/^@task[ \t]+/, "", slug); sub(/[ \t].*$/, "", slug)
  canon = canon_task(slug, st, ob, R, nr, d, c, t) sep_after(nk)
  stored = bytes(k, a, b)
  return "{\"kind\":\"task\",\"slug\":" js(slug) ",\"status\":" js(st) ",\"objective\":" js(ob) ",\"refs\":" jarr(R, nr) ",\"description\":" jn(d) ",\"criteria\":" jn(c) ",\"details\":" jn(t) ",\"verbatim\":" jn(stored == canon ? NULLV : stored) "}"
}

function finding_line(k, a, b, nk,   j, sup, supn, supr, R, nr, summ, name, x, canon, stored, sj) {
  fields(k, a, content_end(k, a, b))
  sup = NULLV; summ = NULLV; nr = 0
  split("", R)
  for (j = 1; j <= NF_; j++) {
    if (!FBLK[j] && FLAB[j] == "SUPERSEDES" && sup == NULLV) sup = FVAL[j]
    else if (!FBLK[j] && FLAB[j] == "REF") R[++nr] = unq_pair(FVAL[j])
    else if (FBLK[j] && FLAB[j] == "SUMMARY" && summ == NULLV) summ = FVAL[j]
  }
  if (summ == NULLV) summ = ""
  name = L[k, a]; sub(/^@finding[ \t]+/, "", name); sub(/[ \t].*$/, "", name)
  supn = NULLV; supr = ""
  if (sup != NULLV) {
    supn = sup; sub(/[ \t].*$/, "", supn)
    x = sup
    if (index(x, "(") > 0) {
      x = substr(x, index(x, "(") + 1)
      if (index(x, ")") > 0) x = substr(x, 1, index(x, ")") - 1)
      supr = x
    }
  }
  canon = canon_finding(name, supn, supr, R, nr, summ) sep_after(nk)
  stored = bytes(k, a, b)
  sj = (supn == NULLV) ? "null" : "{\"name\":" js(supn) ",\"reason\":" js(supr) "}"
  return "{\"kind\":\"finding\",\"name\":" js(name) ",\"supersedes\":" sj ",\"refs\":" jarr(R, nr) ",\"summary\":" js(summ) ",\"verbatim\":" jn(stored == canon ? NULLV : stored) "}"
}

# closer(kind, value, line): one closer as JSON (CJSON), NCLOSERS counted; the targets the
# value before its first " - " or " (" holds (every blank separated date-slug), the verdict
# and reason from what follows the cut
function closer(kind, v, line,   p1, p2, cut, tpart, rest, n, P, j, T, nt, verdict, reason, inner, canon) {
  p1 = index(v, " - "); p2 = index(v, " (")
  cut = 0
  if (p1 > 0) cut = p1
  if (p2 > 0 && (cut == 0 || p2 < cut)) cut = p2
  tpart = (cut > 0) ? substr(v, 1, cut - 1) : v
  rest = (cut > 0) ? substr(v, cut + 1) : ""
  sub(/^[ \t]+/, "", rest)
  nt = 0
  split("", T)
  n = split(tpart, P, /[ \t]+/)
  for (j = 1; j <= n; j++) if (dateslug(P[j])) T[++nt] = P[j]
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
  canon = canon_closer(kind, T, nt, verdict, reason)
  NCLOSERS++
  return "{\"kind\":" js(kind) ",\"targets\":" jarr(T, nt) ",\"verdict\":" jn(verdict) ",\"reason\":" jn(reason) ",\"verbatim\":" jn(canon == line ? NULLV : line) "}"
}

# entry_fields(k, a, b, nk, lane): the dump fields of an entry from slug through verbatim
function entry_fields(k, a, b, nk, lane,   j, lastj, slug, anchor, what, group, rhythm, thread, know, lst, nr, R, cls, cj, ej, canon, stored) {
  fields(k, a, content_end(k, a, b))
  split("", lastj)
  for (j = 1; j <= NF_; j++) lastj[FLAB[j] SUBSEP FBLK[j]] = j
  anchor = NULLV; what = NULLV; group = NULLV; rhythm = NULLV; thread = NULLV; know = 0; lst = NULLV
  nr = 0; cls = ""; cj = ""; ej = ""; NCLOSERS = 0
  split("", R)
  for (j = 1; j <= NF_; j++) {
    if (!FBLK[j] && FLAB[j] ~ /^(ANCHOR|WHAT|GROUP|RHYTHM|THREAD|KNOWLEDGE|STATUS)$/ && lastj[FLAB[j] SUBSEP 0] == j) {
      if (FLAB[j] == "ANCHOR") anchor = FVAL[j]
      else if (FLAB[j] == "WHAT") what = unq(FVAL[j])
      else if (FLAB[j] == "GROUP") group = FVAL[j]
      else if (FLAB[j] == "RHYTHM") rhythm = FVAL[j]
      else if (FLAB[j] == "THREAD") thread = FVAL[j]
      else if (FLAB[j] == "KNOWLEDGE") know = (FVAL[j] == "true") ? 1 : 0
      else lst = FVAL[j]
    } else if (FBLK[j] && FLAB[j] == "WHAT" && lastj["WHAT" SUBSEP 1] == j && !(("WHAT" SUBSEP 0) in lastj)) {
      what = FVAL[j]
    } else if (!FBLK[j] && FLAB[j] == "REF") {
      R[++nr] = unq_pair(FVAL[j])
    } else if (!FBLK[j] && (FLAB[j] == "CLOSES" || FLAB[j] == "SUPERSEDES")) {
      cj = cj (cj == "" ? "" : ",") closer(FLAB[j], FVAL[j], L[k, FLN[j]])
      cls = cls L[k, FLN[j]] "\n"
    } else {
      ej = ej (ej == "" ? "" : ",") "{\"key\":" js(FLAB[j]) ",\"value\":" js(FVAL[j]) "}"
    }
  }
  slug = L[k, a]; sub(/^@entry[ \t]+/, "", slug); sub(/[ \t].*$/, "", slug)
  if (lane) {
    canon = canon_lane_entry(slug, what, thread, R, nr)
    # a lane entry's canonical lines never carry ANCHOR, GROUP, RHYTHM, a closer, KNOWLEDGE
    if (anchor != NULLV || group != NULLV || rhythm != NULLV || NCLOSERS > 0 || know) canon = canon "\001"
  } else canon = canon_entry(slug, anchor, what, group, rhythm, thread, R, nr, cls, know)
  canon = canon sep_after(nk)
  stored = bytes(k, a, b)
  return "\"slug\":" js(slug) ",\"anchor\":" jn(anchor) ",\"what\":" jn(what) ",\"group\":" jn(group) ",\"rhythm\":" jn(rhythm) ",\"knowledge\":" jb(know) ",\"thread\":" jn(thread) ",\"legacy_status\":" jn(lst) ",\"refs\":" jarr(R, nr) ",\"closers\":[" cj "],\"extra_fields\":[" ej "],\"verbatim\":" jn(stored == canon ? NULLV : stored)
}

# anchor_fields(k, a, b, nk): the dump fields of an anchor from anchor through verbatim
function anchor_fields(k, a, b, nk,   h, anc, rest, cont, att, canon, stored) {
  h = L[k, a]
  sub(/^@anchor[ \t]+/, "", h)
  anc = h; sub(/[ \t].*$/, "", anc)
  rest = substr(h, length(anc) + 2)
  cont = NULLV; att = NULLV
  if (rest ~ /^\("continues A[0-9]+", attention: .*\)$/) {
    cont = rest; sub(/^\("continues /, "", cont); sub(/".*$/, "", cont)
    att = rest; sub(/^\("continues A[0-9]+", attention: /, "", att); sub(/\)$/, "", att)
    att = unq_pair(att)
  }
  canon = canon_anchor(anc, cont, att) sep_after(nk)
  stored = bytes(k, a, b)
  return "\"anchor\":" js(anc) ",\"continues\":" jn(cont) ",\"attention\":" jn(att) ",\"verbatim\":" jn(stored == canon ? NULLV : stored)
}

# kind(type, head): the item kind a head line starts
function kind(type, h) {
  if (type == "journal" || type == "lanejournal") return (h ~ /^@entry /) ? "entry" : "anchor"
  if (type == "backlog" && h ~ /^@task[ \t]/) return "task"
  if (type == "knowledge" && h ~ /^@finding[ \t]/) return "finding"
  return "opaque"
}

# heads(k, type): the preamble (PREAMBLE) and the item spans (NH items, HA start, HB end, HK
# kind) of a block artifact; in a journal only "@entry " and "@anchor " lines are heads, in
# the backlog and the knowledge every column-0 @ word
function heads(k, type,   i) {
  NH = 0
  if (!(k in HAS)) { PREAMBLE = NULLV; return }
  for (i = 1; i <= NL[k]; i++) {
    if (type == "journal" || type == "lanejournal") {
      if (L[k, i] ~ /^@entry / || L[k, i] ~ /^@anchor /) HA[++NH] = i
    } else if (L[k, i] ~ /^@[A-Za-z]/) HA[++NH] = i
  }
  PREAMBLE = (NH > 0) ? bytes(k, 1, HA[1] - 1) : bytes(k, 1, NL[k])
  for (i = 1; i <= NH; i++) {
    HB[i] = (i < NH) ? HA[i + 1] - 1 : NL[k]
    HK[i] = kind(type, L[k, HA[i]])
  }
}

function nextkind(i) { return (i < NH) ? HK[i + 1] : NULLV }

function doc(k) { return (k in HAS) ? js(bytes(k, 1, NL[k])) : "null" }

function state_line(k,   i, key, v, seen, st, ca, na, ob, rv, rs, R, nr, S, ns, canon, stored) {
  st = ""; ca = ""; na = ""; ob = ""; rv = NULLV; rs = NULLV
  split("", seen)
  for (i = 1; i <= NL[k]; i++) {
    if (L[k, i] !~ /^[a-z_]+: ?/) continue
    key = L[k, i]; sub(/:.*$/, "", key)
    v = substr(L[k, i], length(key) + 2); sub(/^ /, "", v)
    if (key in seen) continue
    seen[key] = 1
    if (key == "status") st = v
    else if (key == "current_anchor") ca = v
    else if (key == "next_action") na = unq(v)
    else if (key == "objective") ob = unq(v)
    else if (key == "repos") rv = v
    else if (key == "ref_sessions") rs = v
  }
  nr = (rv == NULLV) ? 0 : list(rv, R)
  ns = (rs == NULLV) ? 0 : list(rs, S)
  canon = canon_state(st, ca, na, ob, R, nr, rs != NULLV, S, ns)
  stored = bytes(k, 1, NL[k])
  return "{\"kind\":\"state\",\"status\":" js(st) ",\"current_anchor\":" js(ca) ",\"next_action\":" js(na) ",\"objective\":" js(ob) ",\"repos\":" jarr(R, nr) ",\"ref_sessions\":" (rs == NULLV ? "null" : jarr(S, ns)) ",\"verbatim\":" jn(stored == canon ? NULLV : stored) "}"
}

BEGIN {
  U = ENVIRON["UP_UNIT"]
  load(ENVIRON["UP_MAN"])
  print "{\"kind\":\"unit\",\"format\":\"contexture-dump\",\"version\":1,\"unit\":" js(U) ",\"extras\":0}"
  NREC = 0
  D(state_line("state"))
  heads("backlog", "backlog")
  D("{\"kind\":\"artifact\",\"name\":\"backlog\",\"preamble\":" jn(PREAMBLE) "}")
  for (i = 1; i <= NH; i++) {
    if (HK[i] == "task") D(task_line("backlog", HA[i], HB[i], nextkind(i)))
    else D("{\"kind\":\"opaque\",\"verbatim\":" js(bytes("backlog", HA[i], HB[i])) "}")
  }
  heads("knowledge", "knowledge")
  D("{\"kind\":\"artifact\",\"name\":\"knowledge\",\"preamble\":" jn(PREAMBLE) "}")
  for (i = 1; i <= NH; i++) {
    if (HK[i] == "finding") D(finding_line("knowledge", HA[i], HB[i], nextkind(i)))
    else D("{\"kind\":\"opaque\",\"verbatim\":" js(bytes("knowledge", HA[i], HB[i])) "}")
  }
  heads("journal", "journal")
  D("{\"kind\":\"artifact\",\"name\":\"journal\",\"preamble\":" jn(PREAMBLE) "}")
  for (i = 1; i <= NH; i++) {
    if (HK[i] == "entry") D("{\"kind\":\"entry\"," entry_fields("journal", HA[i], HB[i], nextkind(i), 0) "}")
    else D("{\"kind\":\"anchor\"," anchor_fields("journal", HA[i], HB[i], nextkind(i)) "}")
  }
  for (l = 1; l <= NLANES; l++) {
    ln = LANES[l]
    kj = "lane/" ln "/journal"
    heads(kj, "lanejournal")
    D("{\"kind\":\"lane\",\"lane\":" js(ln) ",\"recipe\":" doc("lane/" ln "/recipe") ",\"report\":" doc("lane/" ln "/report") ",\"journal_preamble\":" jn(PREAMBLE) "}")
    for (i = 1; i <= NH; i++) {
      if (HK[i] == "entry") D("{\"kind\":\"lane_item\",\"lane\":" js(ln) ",\"item\":\"entry\"," entry_fields(kj, HA[i], HB[i], nextkind(i), 1) "}")
      else D("{\"kind\":\"lane_item\",\"lane\":" js(ln) ",\"item\":\"anchor\"," anchor_fields(kj, HA[i], HB[i], nextkind(i)) "}")
    }
  }
  print "{\"kind\":\"end\",\"unit\":" js(U) ",\"records\":" NREC "}"
  exit 0
}
