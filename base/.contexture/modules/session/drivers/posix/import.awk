# import.awk: unit.import of the posix driver (contract 2, docs/the-engine.md, The dump),
# run after canon.awk. It reads the dump (PX_DUMP, PX_DOCSIZE its bytes), validates every
# line before anything lands (one compact JSON object of a known kind with exactly its
# fields in the contract key order, the unit line first naming the argv unit, the state
# line, the three artifact lines each followed by its own items, the lanes in bytewise
# order, the end line counting the lines between; the checks of tests/dump-check.sh), and
# renders the unit's markdown files into the stage by the layout rule: every item's span is
# its verbatim when present, else its canonical lines (canon.awk) followed by one empty line
# when the next item exists and is not an anchor. The first defect refuses rc 1
# ERR_DUMP_FORMAT naming its line; the driver moves the staged files only after an answer.
#
# The JSON reader is linear: a line splits on its double quotes, a piece ending in an odd
# run of backslashes continues its string, a long string is joined by halves and decoded
# into its file piece by piece, so a 2 MB document never meets a quadratic copy.

function bad(msg) {
  printf "%s: error: dump line %d: %s (ERR_DUMP_FORMAT)\n", FN, LN, msg > ERRF
  close(ERRF)
  exit 1
}

function djoin(A, lo, hi, sep,   mid) {
  if (lo > hi) return ""
  if (lo == hi) return A[lo]
  mid = int((lo + hi) / 2)
  return djoin(A, lo, mid, sep) sep djoin(A, mid + 1, hi, sep)
}

# lex(s): the tokens of one line into TT (type) and TV (value): the structural characters,
# literals, and strings (TV the raw escaped content)
function lex(s,   n, Q, i, out, j, p, c, m, lit, a, SP, ns, bs) {
  NT = 0; SPACED = 0
  n = split(s, Q, "\"")
  out = 1
  i = 1
  while (i <= n) {
    if (out) {
      p = Q[i]
      m = length(p)
      j = 1
      while (j <= m) {
        c = substr(p, j, 1)
        if (index("{}[]:,", c) > 0) { TT[++NT] = c; TV[NT] = c; j++; continue }
        if (c == " " || c == "\t" || c == "\r") { SPACED = 1; j++; continue }
        lit = ""
        while (j <= m && index("{}[]:, \t\r", (c = substr(p, j, 1))) == 0) { lit = lit c; j++ }
        TT[++NT] = "l"; TV[NT] = lit
      }
      if (i == n) break
      out = 0
      i++
      continue
    }
    # inside a string: pieces until one is followed by an unescaped quote
    ns = 0
    split("", SP)
    while (1) {
      if (i > n) bad("unterminated string")
      p = Q[i]
      SP[++ns] = p
      if (i == n) bad("unterminated string")
      bs = 0
      a = length(p)
      while (a > 0 && substr(p, a, 1) == "\\") { bs++; a-- }
      if (bs % 2 == 1) { i++; continue }
      break
    }
    TT[++NT] = "s"; TV[NT] = (ns == 1) ? SP[1] : djoin(SP, 1, ns, "\"")
    if (TV[NT] ~ /[\001-\037]/) bad("a raw control character in a string")
    out = 1
    i++
  }
}

# value(path): parses the value at token TP into V (the jflat form: a scalar as its JSON
# text, an object as {k1,k2}, an array as [N])
function value(path,   t) {
  if (TP > NT) bad("unexpected end of the line")
  t = TT[TP]
  if (t == "{") return object(path)
  if (t == "[") return array(path)
  if (t == "s") { V[path] = "\"" TV[TP] "\""; TP++; return }
  if (t == "l") {
    if (TV[TP] !~ /^(true|false|null|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?)$/) bad("a bad token " TV[TP])
    V[path] = TV[TP]; TP++; return
  }
  bad("unexpected " t)
}

function child(path, k) { return (path == "@") ? k : path "." k }

function object(path,   keys, n, k) {
  TP++
  keys = ""; n = 0
  if (TP <= NT && TT[TP] == "}") { TP++; V[path] = "{}"; return }
  while (1) {
    if (TP > NT || TT[TP] != "s") bad("expected a key")
    k = TV[TP]; TP++
    if (TP > NT || TT[TP] != ":") bad("expected a colon")
    TP++
    value(child(path, k))
    keys = keys (n ? "," : "") k; n++
    if (TP > NT) bad("expected a comma or a closing brace")
    if (TT[TP] == ",") { TP++; continue }
    if (TT[TP] == "}") { TP++; break }
    bad("expected a comma or a closing brace")
  }
  V[path] = "{" keys "}"
}

function array(path,   n) {
  TP++
  n = 0
  if (TP <= NT && TT[TP] == "]") { TP++; V[path] = "[0]"; return }
  while (1) {
    n++
    value(child(path, n))
    if (TP > NT) bad("expected a comma or a closing bracket")
    if (TT[TP] == ",") { TP++; continue }
    if (TT[TP] == "]") { TP++; break }
    bad("expected a comma or a closing bracket")
  }
  V[path] = "[" n "]"
}

# ---- the decode: \" \\ \/ \b \f \n \r \t and \u00XX below 0x80 ----
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

# jdec(raw, file): the bytes of a raw string body, returned (file "") or printed to file
function jdec(raw, file,   A, n, i, p, e, v, o, piece) {
  n = split(raw, A, /\\/)
  o = ""
  if (n == 0) return ""
  piece = A[1]
  if (file != "") printf "%s", piece > file; else o = piece
  i = 2
  while (i <= n) {
    p = A[i]
    if (p == "") {
      if (i == n) bad("a dangling backslash in a string")
      piece = "\\" A[i + 1]
      i += 2
    } else {
      e = substr(p, 1, 1)
      p = substr(p, 2)
      if (e == "\"") piece = "\"" p
      else if (e == "/") piece = "/" p
      else if (e == "b") piece = sprintf("%c", 8) p
      else if (e == "f") piece = sprintf("%c", 12) p
      else if (e == "n") piece = "\n" p
      else if (e == "r") piece = "\r" p
      else if (e == "t") piece = "\t" p
      else if (e == "u") {
        v = hexval(substr(p, 1, 4))
        if (v < 1 || v >= 128 || length(p) < 4) bad("an unsupported \\u escape (the contract writes every character from 0x20 raw)")
        piece = sprintf("%c", v) substr(p, 5)
      } else bad("an unknown escape \\" e)
      i++
    }
    if (file != "") printf "%s", piece > file; else o = o piece
  }
  return o
}

function g(p) { return (V[p] == "null") ? NULLV : jdec(substr(V[p], 2, length(V[p]) - 2), "") }
function cnt(p,   t) { t = V[p]; gsub(/[][]/, "", t); return t + 0 }
function glist(p, arr,   n, i) { split("", arr); n = cnt(p); for (i = 1; i <= n; i++) arr[i] = g(p "." i); return n }

# ---- the checks (tests/dump-check.sh) ----
function cls(t) {
  if (t == "null") return "n"
  if (t == "true" || t == "false") return "b"
  if (t ~ /^"/) return "s"
  if (t ~ /^\[[0-9]+\]$/) return "l"
  if (t ~ /^\{/) return "o"
  if (t ~ /^-?[0-9]+$/) return "i"
  return "x"
}
function want(p, c,   t) {
  if (!(p in V)) bad("missing field " p)
  t = cls(V[p])
  if (index(c, t) == 0) bad("field " p " has the wrong type")
}
function keys(p, want_keys) {
  if (V[p] != "{" want_keys "}") bad((p == "@" ? "the line" : p) " must carry exactly the keys {" want_keys "} in that order")
}
function strlist(p,   c, i) {
  want(p, "l")
  c = cnt(p)
  for (i = 1; i <= c; i++) want(p "." i, "s")
}
function entry_fields(   c, i) {
  want("slug", "s"); want("anchor", "sn"); want("what", "sn"); want("group", "sn")
  want("rhythm", "sn"); want("knowledge", "b"); want("thread", "sn"); want("legacy_status", "sn")
  strlist("refs")
  want("closers", "l")
  c = cnt("closers")
  for (i = 1; i <= c; i++) {
    keys("closers." i, "kind,targets,verdict,reason,verbatim")
    if (V["closers." i ".kind"] != "\"CLOSES\"" && V["closers." i ".kind"] != "\"SUPERSEDES\"") bad("closers." i ".kind must be CLOSES or SUPERSEDES")
    strlist("closers." i ".targets")
    want("closers." i ".verdict", "sn")
    if (V["closers." i ".verdict"] !~ /^(null|"done"|"superseded"|"dropped"|"folded")$/) bad("closers." i ".verdict must be done, superseded, dropped, folded, or null")
    want("closers." i ".reason", "sn"); want("closers." i ".verbatim", "sn")
  }
  want("extra_fields", "l")
  c = cnt("extra_fields")
  for (i = 1; i <= c; i++) {
    keys("extra_fields." i, "key,value")
    want("extra_fields." i ".key", "s"); want("extra_fields." i ".value", "s")
  }
  want("verbatim", "sn")
}
function anchor_fields() { want("anchor", "s"); want("continues", "sn"); want("attention", "sn"); want("verbatim", "sn") }

# ---- the render ----
function file_open(rel) {
  NSTAGED++
  CUR = STAGE "/" NSTAGED
  printf "" > CUR
  printf "%s\t%s\n", NSTAGED, rel > MAN
}
function file_close() { if (CUR != "") close(CUR); CUR = "" }
function put(s) { printf "%s", s > CUR }

# hold(kind, canonical text, verbatim): an item waits for its successor's kind
function flush(nextk) {
  if (PK == "") return
  if (PV != NULLV) put(PV)
  else put(PC c_sep(nextk))
  PK = ""
}
function hold(kind, c, v) { PK = kind; PC = c; PV = v }

function closer_lines(   c, i, o, T, nt) {
  c = cnt("closers")
  o = ""
  for (i = 1; i <= c; i++) {
    if (V["closers." i ".verbatim"] != "null") { o = o g("closers." i ".verbatim") "\n"; continue }
    nt = glist("closers." i ".targets", T)
    o = o c_closer(g("closers." i ".kind"), T, nt, g("closers." i ".verdict"), g("closers." i ".reason")) "\n"
  }
  return o
}

function canon_entry(lane,   R, nr) {
  nr = glist("refs", R)
  if (lane && V["anchor"] == "null" && V["group"] == "null" && V["rhythm"] == "null" && cnt("closers") == 0 && V["knowledge"] == "false")
    return c_lane_entry(g("slug"), g("what"), g("thread"), R, nr)
  return c_entry(g("slug"), g("anchor"), g("what"), g("group"), g("rhythm"), g("thread"), R, nr, closer_lines(), V["knowledge"] == "true")
}

function render(k,   R, nr, S, ns, T, v, l, c, kind) {
  if (k == "unit") return
  if (k == "state") {
    file_open("state.md")
    if (V["verbatim"] != "null") jdec(substr(V["verbatim"], 2, length(V["verbatim"]) - 2), CUR)
    else {
      nr = glist("repos", R)
      ns = (V["ref_sessions"] == "null") ? 0 : glist("ref_sessions", S)
      put(c_state(g("status"), g("current_anchor"), g("next_action"), g("objective"), R, nr, V["ref_sessions"] != "null", S, ns))
    }
    file_close()
    return
  }
  if (k == "artifact" || k == "lane" || k == "end") { flush(""); file_close() }
  if (k == "artifact") {
    if (V["preamble"] == "null") return
    file_open(g("name") ".md")
    jdec(substr(V["preamble"], 2, length(V["preamble"]) - 2), CUR)
    return
  }
  if (k == "lane") {
    l = g("lane")
    printf "d\tlanes/%s\n", l > MAN
    if (V["recipe"] != "null") { file_open("lanes/" l "/recipe.md"); jdec(substr(V["recipe"], 2, length(V["recipe"]) - 2), CUR); file_close() }
    if (V["report"] != "null") { file_open("lanes/" l "/report.md"); jdec(substr(V["report"], 2, length(V["report"]) - 2), CUR); file_close() }
    if (V["journal_preamble"] != "null") { file_open("lanes/" l "/journal.md"); jdec(substr(V["journal_preamble"], 2, length(V["journal_preamble"]) - 2), CUR) }
    return
  }
  if (k == "end") return
  kind = k
  if (k == "lane_item") kind = (V["item"] == "\"anchor\"") ? "anchor" : "entry"
  flush(kind)
  v = g("verbatim")
  if (v != NULLV) { hold(kind, "", v); return }
  if (k == "task") {
    nr = glist("refs", R)
    c = c_task(g("slug"), g("status"), g("objective"), R, nr, g("description"), g("criteria"), g("details"))
  } else if (k == "finding") {
    nr = glist("refs", R)
    c = c_finding(g("name"), (V["supersedes"] == "null") ? NULLV : g("supersedes.name"), (V["supersedes"] == "null") ? "" : g("supersedes.reason"), R, nr, g("summary"))
  } else if (k == "entry") c = canon_entry(0)
  else if (k == "anchor" || kind == "anchor") c = c_anchor(g("anchor"), g("continues"), g("attention"))
  else if (k == "lane_item") c = canon_entry(1)
  else c = ""
  if (kind == "entry" && (V["legacy_status"] != "null" || cnt("extra_fields") > 0)) bad("an entry carries a field its canonical lines cannot hold, and no verbatim")
  hold(kind, c, NULLV)
}

# check(): one line (already in V) against the dump grammar
function check(   k, c) {
  if (cls(V["@"]) != "o") bad("not a JSON object")
  if (!("kind" in V) || cls(V["kind"]) != "s") bad("no kind")
  k = substr(V["kind"], 2, length(V["kind"]) - 2)
  if (PHASE == "") { if (k != "unit") bad("a unit line expected, found kind " k) }
  else if (PHASE == "end") bad("a line after the end line: unit.import takes one unit")
  else if (k == "unit") bad("a unit line before the end line of unit " UNITSEEN)
  if (k == "unit") {
    keys("@", "kind,format,version,unit,extras")
    if (V["format"] != "\"contexture-dump\"") bad("format must be contexture-dump")
    if (V["version"] != "1") bad("version must be 1, found " V["version"])
    want("unit", "s")
    UNITSEEN = g("unit")
    if (UNITSEEN !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) bad("unit is not a slug")
    if (UNITSEEN != U) bad("the dump is for unit '" UNITSEEN "', not '" U "'")
    want("extras", "i")
    START = LN; PHASE = "unit"; LASTLANE = ""; ARTS = ""
    return k
  }
  if (k == "end") {
    keys("@", "kind,unit,records")
    if (g("unit") != UNITSEEN) bad("the end line names another unit than the unit line")
    want("records", "i")
    if (V["records"] + 0 != LN - START - 1) bad("records says " V["records"] ", the unit dump holds " (LN - START - 1) " lines between its unit and end lines")
    if (ARTS != "backlog,knowledge,journal,") bad("the unit dump lacks an artifact line")
    RECORDS = V["records"] + 0
    PHASE = "end"
    return k
  }
  if (k == "state") {
    if (PHASE != "unit") bad("the state line must follow the unit line")
    keys("@", "kind,status,current_anchor,next_action,objective,repos,ref_sessions,verbatim")
    want("status", "s"); want("current_anchor", "s"); want("next_action", "s"); want("objective", "s")
    strlist("repos")
    if (V["ref_sessions"] != "null") strlist("ref_sessions")
    want("verbatim", "sn")
    PHASE = "state"
    return k
  }
  if (k == "artifact") {
    keys("@", "kind,name,preamble")
    want("preamble", "sn")
    c = g("name")
    if (c == "backlog" && PHASE != "state") bad("the backlog artifact line must follow the state line")
    if (c == "knowledge" && PHASE != "backlog") bad("the knowledge artifact line must follow the backlog")
    if (c == "journal" && PHASE != "knowledge") bad("the journal artifact line must follow the knowledge")
    if (c != "backlog" && c != "knowledge" && c != "journal") bad("unknown artifact " c)
    ARTS = ARTS c ","
    PHASE = c; NULLPRE = (V["preamble"] == "null")
    return k
  }
  if (k == "task" || k == "finding" || k == "entry" || k == "anchor" || k == "opaque") {
    if (k == "task" && PHASE != "backlog") bad("a task outside the backlog")
    if (k == "finding" && PHASE != "knowledge") bad("a finding outside the knowledge")
    if ((k == "entry" || k == "anchor") && PHASE != "journal") bad("a " k " outside the journal")
    if (k == "opaque" && PHASE != "backlog" && PHASE != "knowledge") bad("an opaque item outside the backlog and the knowledge")
    if (NULLPRE) bad("an item under an absent artifact (preamble null)")
    if (k == "task") {
      keys("@", "kind,slug,status,objective,refs,description,criteria,details,verbatim")
      want("slug", "s"); want("status", "s"); want("objective", "s"); strlist("refs")
      want("description", "sn"); want("criteria", "sn"); want("details", "sn"); want("verbatim", "sn")
    } else if (k == "finding") {
      keys("@", "kind,name,supersedes,refs,summary,verbatim")
      want("name", "s"); want("supersedes", "on")
      if (V["supersedes"] != "null") { keys("supersedes", "name,reason"); want("supersedes.name", "s"); want("supersedes.reason", "s") }
      strlist("refs"); want("summary", "s"); want("verbatim", "sn")
    } else if (k == "entry") {
      keys("@", "kind,slug,anchor,what,group,rhythm,knowledge,thread,legacy_status,refs,closers,extra_fields,verbatim")
      entry_fields()
    } else if (k == "anchor") {
      keys("@", "kind,anchor,continues,attention,verbatim")
      anchor_fields()
    } else {
      keys("@", "kind,verbatim")
      want("verbatim", "s")
    }
    return k
  }
  if (k == "lane") {
    if (PHASE != "journal" && PHASE != "lane") bad("a lane line before the journal")
    keys("@", "kind,lane,recipe,report,journal_preamble")
    want("lane", "s"); want("recipe", "sn"); want("report", "sn"); want("journal_preamble", "sn")
    c = g("lane")
    if (c !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) bad("lane is not a slug")
    if (LASTLANE != "" && !(LASTLANE < c)) bad("lane " c " out of bytewise order after " LASTLANE)
    LASTLANE = c; PHASE = "lane"; NULLPRE = (V["journal_preamble"] == "null")
    return k
  }
  if (k == "lane_item") {
    if (PHASE != "lane") bad("a lane item outside a lane")
    if (g("lane") != LASTLANE) bad("a lane item of another lane under lane " LASTLANE)
    if (NULLPRE) bad("a lane item under an absent lane journal (journal_preamble null)")
    if (V["item"] == "\"entry\"") {
      keys("@", "kind,lane,item,slug,anchor,what,group,rhythm,knowledge,thread,legacy_status,refs,closers,extra_fields,verbatim")
      entry_fields()
    } else if (V["item"] == "\"anchor\"") {
      keys("@", "kind,lane,item,anchor,continues,attention,verbatim")
      anchor_fields()
    } else bad("lane item must be entry or anchor")
    return k
  }
  bad("unknown kind " k)
}

BEGIN {
  FN = ENVIRON["PX_FN"]; U = ENVIRON["PX_UNIT"]; ERRF = ENVIRON["PX_ERR"]; OUTF = ENVIRON["PX_OUT"]
  STAGE = ENVIRON["PX_STAGE"]; MAN = STAGE "/manifest"; NSTAGED = 0; CUR = ""; PK = ""
  dump = ENVIRON["PX_DUMP"]
  size = ENVIRON["PX_DOCSIZE"] + 0
  LN = 1
  if (size == 0) bad("an empty dump (a unit line expected)")
  tot = 0; PHASE = ""
  while ((getline line < dump) > 0) {
    tot += length(line) + 1
    split("", V); split("", TT); split("", TV)
    lex(line)
    if (NT == 0) bad("an empty line")
    TP = 1
    value("@")
    if (TP <= NT) bad("trailing text after the object")
    if (SPACED) bad("whitespace between tokens (a dump line is compact JSON)")
    kind = check()
    render(kind)
    LN++
  }
  close(dump)
  LN--
  if (tot != size) bad("the last line does not end with LF")
  if (PHASE != "end") bad("the dump ends inside unit " UNITSEEN " (no end line)")
  file_close()
  close(MAN)
  printf "%d\n", RECORDS > OUTF
  close(OUTF)
  exit 0
}
