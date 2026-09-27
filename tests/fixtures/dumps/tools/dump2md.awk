# dump2md.awk: fixture tool (never run by the compliance suite). Renders one unit dump
# into posix markdown files by the contract's canonical lines and layout rules
# (docs/the-engine.md): every item's span is its verbatim when present, else its
# canonical lines followed by one empty line when the next item exists and is not an
# anchor. Input: the dump flattened by tests/lib/jflat.awk with lineno=1.
# usage: awk -v lineno=1 -f tests/lib/jflat.awk unit.dump | awk -v out=<folder> -f dump2md.awk
# md2dump.sh then dump2md.awk reproducing the source folder byte for byte is the proof
# that the parse rules and the canonical lines agree on every item of a fixture.

function hexval(h,   i, v, c) {
  v = 0
  h = tolower(h)
  for (i = 1; i <= length(h); i++) {
    c = index("0123456789abcdef", substr(h, i, 1))
    if (c == 0) return -1
    v = v * 16 + c - 1
  }
  return v
}

function dec(tok,   out, i, n, c, e, v) {
  if (tok == "null") return NULLV
  tok = substr(tok, 2, length(tok) - 2)
  out = ""
  n = length(tok)
  i = 1
  while (i <= n) {
    c = substr(tok, i, 1)
    if (c != "\\") {
      e = index(substr(tok, i), "\\")
      if (e == 0) { out = out substr(tok, i); break }
      out = out substr(tok, i, e - 1)
      i += e - 1
      continue
    }
    e = substr(tok, i + 1, 1)
    if (e == "n") out = out "\n"
    else if (e == "t") out = out "\t"
    else if (e == "r") out = out "\r"
    else if (e == "b") out = out sprintf("%c", 8)
    else if (e == "f") out = out sprintf("%c", 12)
    else if (e == "u") { v = hexval(substr(tok, i + 2, 4)); out = out sprintf("%c", v); i += 4 }
    else out = out e
    i += 2
  }
  return out
}

function g(p) { return (p in V) ? dec(V[p]) : NULLV }
function cnt(p,   t) { t = V[p]; gsub(/[][]/, "", t); return t + 0 }
function glist(p, sep,   n, i, o) {
  n = cnt(p)
  o = ""
  for (i = 1; i <= n; i++) o = o (i > 1 ? sep : "") g(p "." i)
  return o
}

function block_lines(label, v,   o, n, parts, i) {
  o = "  " label " ::\n"
  if (v == "") return o
  n = split(v, parts, /\n/)
  for (i = 1; i <= n; i++) o = o (parts[i] == "" ? "" : "    " parts[i]) "\n"
  return o
}

function closer_line(p,   o, vd, rs) {
  if (g(p ".verbatim") != NULLV) return g(p ".verbatim") "\n"
  o = "  " g(p ".kind") ": " glist(p ".targets", " ")
  vd = g(p ".verdict"); rs = g(p ".reason")
  if (vd != NULLV) o = o " (" vd ": " rs ")"
  else if (rs != NULLV) o = o " (" rs ")"
  return o "\n"
}

# canon(kind): the canonical lines of the current record (without the separator)
function canon(kind,   o, i, n) {
  if (kind == "task") {
    o = "@task " g("slug") "\n  STATUS: " g("status") "\n  OBJECTIVE: \"" g("objective") "\"\n"
    if (cnt("refs") > 0) o = o "  REFS: [" glist("refs", ", ") "]\n"
    if (g("description") != NULLV) o = o block_lines("DESCRIPTION", g("description"))
    if (g("criteria") != NULLV) o = o block_lines("ACCEPTANCE CRITERIA", g("criteria"))
    if (g("details") != NULLV) o = o block_lines("IMPLEMENTATION DETAILS", g("details"))
    return o
  }
  if (kind == "finding") {
    o = "@finding " g("name") "\n"
    if (g("supersedes.name") != NULLV) o = o "  SUPERSEDES: " g("supersedes.name") " (" g("supersedes.reason") ")\n"
    n = cnt("refs")
    for (i = 1; i <= n; i++) o = o "  REF: \"" g("refs." i) "\"\n"
    return o block_lines("SUMMARY", g("summary"))
  }
  if (kind == "entry") {
    o = "@entry " g("slug") "\n"
    if (g("anchor") != NULLV) o = o "  ANCHOR: " g("anchor") "\n"
    if (g("what") != NULLV) o = o "  WHAT: \"" g("what") "\"\n"
    if (g("group") != NULLV) o = o "  GROUP: " g("group") "\n"
    if (g("rhythm") != NULLV) o = o "  RHYTHM: " g("rhythm") "\n"
    if (g("thread") != NULLV) o = o "  THREAD: " g("thread") "\n"
    n = cnt("refs")
    for (i = 1; i <= n; i++) o = o "  REF: \"" g("refs." i) "\"\n"
    n = cnt("closers")
    for (i = 1; i <= n; i++) o = o closer_line("closers." i)
    if (V["knowledge"] == "true") o = o "  KNOWLEDGE: true\n"
    return o
  }
  if (kind == "laneentry") {
    o = "@entry " g("slug") "\n"
    if (g("what") != NULLV) o = o "  WHAT: \"" g("what") "\"\n"
    if (g("thread") != NULLV) o = o "  THREAD: " g("thread") "\n"
    n = cnt("refs")
    for (i = 1; i <= n; i++) o = o "  REF: \"" g("refs." i) "\"\n"
    return o
  }
  if (kind == "anchor") {
    if (g("continues") != NULLV && g("attention") != NULLV) return "@anchor " g("anchor") " (\"continues " g("continues") "\", attention: " g("attention") ")\n"
    return "@anchor " g("anchor") "\n"
  }
  return ""
}

# an item waits for its successor, whose kind decides the separator
function flush(nextk,   s) {
  if (PK == "") return
  s = (PV != NULLV) ? PV : PC ((nextk != "" && nextk != "anchor") ? "\n" : "")
  printf "%s", s > PF
  PK = ""
}

function hold(kind, file, c, v) { PK = kind; PF = file; PC = c; PV = v }

function record(   k, f, l, kind) {
  k = g("kind")
  if (k == "unit") { U = g("unit"); D = out; system("mkdir -p '" D "'"); return }
  if (k == "state") {
    f = D "/state.md"
    printf "%s", (g("verbatim") != NULLV ? g("verbatim") : canon_state()) > f
    close(f)
    return
  }
  if (k == "artifact" || k == "lane" || k == "end") { flush(""); if (CUR != "") close(CUR); CUR = "" }
  if (k == "artifact") {
    if (g("preamble") == NULLV) return
    CUR = D "/" g("name") ".md"
    printf "%s", g("preamble") > CUR
    return
  }
  if (k == "lane") {
    l = D "/lanes/" g("lane")
    system("mkdir -p '" l "'")
    if (g("recipe") != NULLV) { printf "%s", g("recipe") > (l "/recipe.md"); close(l "/recipe.md") }
    if (g("report") != NULLV) { printf "%s", g("report") > (l "/report.md"); close(l "/report.md") }
    if (g("journal_preamble") != NULLV) { CUR = l "/journal.md"; printf "%s", g("journal_preamble") > CUR }
    return
  }
  if (k == "end") return
  kind = k
  if (k == "lane_item") kind = (g("item") == "anchor") ? "anchor" : "laneentry"
  flush((kind == "laneentry") ? "entry" : kind)
  hold(kind, CUR, (k == "opaque") ? "" : canon(kind), g("verbatim"))
}

function canon_state(   o) {
  o = "status: " g("status") "\ncurrent_anchor: " g("current_anchor") "\nnext_action: \"" g("next_action") "\"\nobjective: \"" g("objective") "\"\nrepos: [" glist("repos", ", ") "]\n"
  if (V["ref_sessions"] != "null") o = o "ref_sessions: [" glist("ref_sessions", ", ") "]\n"
  return o
}

BEGIN { NULLV = "\001null\001"; LAST = "" }

{
  n = $0; sub(/:.*$/, "", n)
  rest = substr($0, length(n) + 2)
  if (n != LAST && LAST != "") { record(); split("", V) }
  LAST = n
  p = rest; sub(/=.*$/, "", p)
  V[p] = substr(rest, length(p) + 2)
}

END { if (LAST != "") record(); flush(""); if (CUR != "") close(CUR) }
