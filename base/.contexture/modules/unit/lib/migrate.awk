# migrate.awk: the record's pointer rewrite, one unit's stored artifacts at a time, the
# library ctx unit migrate runs through the data script (unit.migrate). It reads each
# artifact value as stored, rewrites only pointer tokens into full addresses (<owner>#<path>),
# moves the prose a REF value holds into a NOTE line on its item, and leaves every other byte
# as it stands. Every pointer shaped token (a token holding #, /, or IDEAS.md) of every field
# and every REF and REFS value is counted in the census, one row each: rewritten, kept (with
# its reason), or moved to NOTE.
#
# The environment: MG_MODE rewrite (each artifact written to its output path), census (the
# rows alone), suggest (one REF value, MG_TOKEN, answered as its disposition and new form, the
# full form a write refusal names), or check (the REF values of the file MG_VALUES, one per
# line, answered as the count a migration would change, the load's old forms warning); MG_UNIT the owning unit; MG_REPOS the corpus repos the docs module lists,
# blank separated; MG_MAP the run's map file, one line per artifact
# "<input><TAB><kind><TAB><lane><TAB><output><TAB><label><TAB><final newline 1|0>", the kind
# one of state, backlog, journal, knowledge, recipe, ljournal, report; MG_CHANGED the file
# that names each changed artifact's label; MG_CENSUS the census file the rows append to,
# "<unit><TAB><label><TAB><field><TAB><class><TAB><disposition><TAB><token><TAB><new><TAB><line>";
# MG_HELD the file naming every unit the store holds, one per line, the only units a record
# storage path rewrites to (with no file, as for suggest and check, every unit counts as held).
#
# The address forward (ctx unit migrate --forward): MG_FWD_OLD and MG_FWD_NEW the two full
# address prefixes; a token starting with the old prefix and holding more after it becomes
# the new prefix plus the same rest, ahead of the full address class, and so does an address
# another class rewrites a token into; a REF value's first token ending in a colon is tested
# without its colon, and when it forwards the colon goes to NOTE as the path rule sends it
# (the class path with a trailing colon, address forward, which REF values and recipe items
# treat as that rule's own). MG_MODE collect lists each such forwarded address in
# MG_FWD_OUT, one per line, as kept (so every later rule a kept token meets runs and lists
# its own), for the verb to check once through the owner's get; rewrite and census read the
# answers from MG_FWD_CHECK, "<address><TAB><ok|missing|none|noget>" per line, and rewrite
# only an address that answered ok, keeping every other under a class naming why.
#
# The class table: the exclusions and the law pointers stand in the table below, each pinned
# by a test, so a new exclusion is a test change.

function excl_init() {
  EXCL["task#nope"] = "excluded: placeholder"
  EXCL["finding#NAME"] = "excluded: placeholder"
  EXCL["lane#L"] = "excluded: placeholder"
  EXCL["lane#L/journal#X"] = "excluded: placeholder"
  PREFIX_RE = "^(lane|unit|task|journal|knowledge|backlog|finding|entry|store|docs|file|journal\\.md|knowledge\\.md|backlog\\.md|IDEAS\\.md)#$"
  LAW_RE = "^@[A-Za-z][A-Za-z0-9_-]*#."
  URL_RE = "^[A-Za-z][A-Za-z0-9+.-]*://"
  RECEIPT_RE = "^backlog/[A-Za-z0-9][A-Za-z0-9_-]*:?$"
  LANE_PH_RE = "^lane#[A-Za-z]/(recipe|report|journal)(#.*)?$"
  START_RE = "^((journal|knowledge|backlog|lane|task|finding|entry)#|(journal|knowledge|backlog)\\.md#|lanes/|IDEAS\\.md)"
  TCOLON = "path with a trailing colon"
}

# trim(t): the core of a free text token, CL and CR the characters cut from its ends
function trim(t,   p) {
  CL = ""
  CR = ""
  while (t != "") {
    p = substr(t, 1, 1)
    if (index("([{\"'`*\\", p) == 0) break
    CL = CL p
    t = substr(t, 2)
  }
  while (t != "") {
    p = substr(t, length(t), 1)
    if (index(")]}\"'`,;:.!?*\\", p) == 0) break
    CR = p CR
    t = substr(t, 1, length(t) - 1)
  }
  return t
}

# lane_art(l, art, c, u): a lane artifact's address; a recipe or report section anchor also
# leaves SECT and the artifact's own address in ARTV
function lane_art(l, art, c, u,   s) {
  s = "unit#" u "/lane/" l "/" art
  if (c != "" && art != "journal") { SECT = c; ARTV = s }
  if (c != "") s = s "/" c
  return s
}

# in_unit(u, r): a path r inside unit u's old folder set as its unit address in NEWV: 1 for
# (journal|backlog|knowledge).md#<id>, 2 for lanes/<l>/<art>[.md][#C], 0 for any other path
function in_unit(u, r,   kind, l, art, c) {
  if (r ~ /^(journal|backlog|knowledge)\.md#./) {
    kind = substr(r, 1, index(r, ".") - 1)
    kind = (kind == "journal") ? "entry" : (kind == "knowledge") ? "finding" : "task"
    DISP = "rewritten"
    NEWV = "unit#" u "/" kind "/" substr(r, index(r, "#") + 1)
    return 1
  }
  if (r ~ /^lanes\/[^\/#]+\/(recipe|journal|report)(\.md)?(#.+)?$/) {
    r = substr(r, 7)
    l = substr(r, 1, index(r, "/") - 1)
    art = substr(r, index(r, "/") + 1)
    c = ""
    if (art ~ /#./) { c = substr(art, index(art, "#") + 1); art = substr(art, 1, index(art, "#") - 1) }
    sub(/\.md$/, "", art)
    DISP = "rewritten"
    NEWV = lane_art(l, art, c, u)
    return 2
  }
  return 0
}

function held(u) { return !HELDCHK || (u in HELD) }

# fwd_on(t): t starts with the forward's old prefix and holds more after it
function fwd_on(t) { return FWDO != "" && index(t, FWDO) == 1 && length(t) > length(FWDO) }

# fwd(t): the address forward of a token fwd_on accepts: rewritten to its forwarded address
# when that address answered its owner's get, else kept with the class naming why; listed
# and kept in the collect mode
function fwd(t,   a, s) {
  FWD = 1
  a = FWDN substr(t, length(FWDO) + 1)
  NOTEV = ""
  if (MODE == "collect") {
    print a >> FWDOUT
    NEWV = t
    DISP = "kept"
    return "address forward"
  }
  s = (a in FWDS) ? FWDS[a] : ""
  if (s == "ok") {
    NEWV = a
    DISP = "rewritten"
    return "address forward"
  }
  NEWV = t
  DISP = "kept"
  if (s == "none") return "address forward, owner not installed"
  if (s == "noget") return "address forward, owner has no get verb"
  if (s == "missing") return "address forward, target not found"
  return "address forward, target not checked"
}

# addr_ok(a): every segment of an address a rewrite produced is a slug (letters, digits, dot,
# underscore, dash) and the segments make its owner's form, so a pointer glued to text never
# yields a corrupt address
function addr_ok(a,   o, S, n, i) {
  o = substr(a, 1, index(a, "#") - 1)
  n = split(substr(a, index(a, "#") + 1), S, /\//)
  for (i = 1; i <= n; i++) if (S[i] !~ /^[A-Za-z0-9._-]+$/) return 0
  if (o == "store") return n == 2
  if (o == "docs") return n == 3
  if (S[2] == "lane") return (n == 4 || n == 5) && S[4] ~ /^(recipe|journal|report)$/
  return n == 3 && S[2] ~ /^(entry|task|finding)$/
}

# cls(t, inref): the class of one token; NEWV the token's new form (equal to t when kept),
# DISP rewritten, kept, or note, NOTEV the text a REF value moves to NOTE. inref is 1 for a
# REF or REFS value's first token, where file shaped tokens take the file# owner. A rewrite
# whose address fails addr_ok is kept as a pointer glued to text. A forwarded token is
# checked by its owner's get instead; a rewrite another class makes whose address the
# forward takes is forwarded when it answers (its class gaining ", address forward"), and
# stays the class's rewrite otherwise; a lane section split (SECT) is never forwarded.
function cls(t, inref,   c, a, n) {
  SECT = ""
  ARTV = ""
  FWD = 0
  c = cls1(t, inref)
  if (FWD) return c
  if (DISP == "rewritten" && NEWV ~ /^(unit|store|docs)#/ && !addr_ok(NEWV)) {
    DISP = "kept"
    NEWV = t
    NOTEV = ""
    SECT = ""
    return "pointer glued to text"
  }
  if (DISP == "rewritten" && SECT == "" && fwd_on(NEWV)) {
    a = NEWV
    n = NOTEV
    fwd(a)
    FWD = 0
    NOTEV = n
    if (DISP == "rewritten") return c ", address forward"
    DISP = "rewritten"
    NEWV = a
  }
  return c
}

function cls1(t, inref,   r, a, n, P, l, art, c, rp, u, kind, slug, id, hu) {
  NEWV = t
  NOTEV = ""
  DISP = "kept"
  if (t in EXCL) return EXCL[t]
  if (t ~ /[<>*]/ || index(t, "...") || t ~ LANE_PH_RE) return "excluded: placeholder pattern"
  if (t ~ PREFIX_RE) return "excluded: prefix mention with no target"
  if (t ~ LAW_RE) return "excluded: law pointer"
  if (t ~ URL_RE) return "excluded: url"
  if (t ~ RECEIPT_RE) return "excluded: completion receipt prefix"
  if (t ~ /^(file#)?(\.\/)?(journal|knowledge|backlog)\.md#./) {
    r = t
    sub(/^file#/, "", r)
    sub(/^\.\//, "", r)
    in_unit(UNIT, r)
    return "the .md short forms"
  }
  if (inref && t ~ /[^:]:$/ && fwd_on(substr(t, 1, length(t) - 1))) {
    c = fwd(substr(t, 1, length(t) - 1))
    if (DISP == "rewritten") { NOTEV = t; return TCOLON ", " c }
    NEWV = t
    return c
  }
  if (fwd_on(t)) return fwd(t)
  if (t ~ /^(unit|store|docs|file)#./) return "full address"
  if (inref && t ~ /[^:]:$/) {
    c = cls1(substr(t, 1, length(t) - 1), 1)
    if (DISP == "rewritten" && NEWV ~ /^(file|docs)#/) { NOTEV = t; return TCOLON }
    NEWV = t
    NOTEV = ""
    DISP = "kept"
    SECT = ""
    ARTV = ""
  }
  if (t ~ /(^|\/)IDEAS\.md(#.+)?$/) {
    DISP = "rewritten"
    if (t ~ /#./) {
      NEWV = "store#ideas/" substr(t, index(t, "#") + 1)
      return "IDEAS.md slug"
    }
    NEWV = "store#containers/ideas"
    return "IDEAS.md bare"
  }
  if (t ~ /^(\.\/)?docs\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\.md(#.+|:[0-9].*)?$/) {
    r = t
    sub(/^\.\//, "", r)
    split(r, P, /\//)
    rp = P[2]
    if (index(" " REPOS " ", " " rp " ")) {
      slug = substr(r, length(rp) + 7)
      if (slug ~ /\.md:[0-9]/) {
        sub(/\.md:.*$/, "", slug)
        if (!inref) return "corpus doc path:line in text"
        DISP = "rewritten"
        NEWV = "docs#" rp "/" slug "/header"
        NOTEV = t
        return "corpus doc path:line"
      }
      id = "header"
      if (slug ~ /#./) {
        id = substr(slug, index(slug, "#") + 1)
        slug = substr(slug, 1, index(slug, "#") - 1)
      }
      sub(/\.md$/, "", slug)
      DISP = "rewritten"
      NEWV = "docs#" rp "/" slug "/" id
      return "corpus doc path"
    }
  }
  u = UNIT
  if (t ~ /^journal#./) { DISP = "rewritten"; NEWV = "unit#" u "/entry/" substr(t, 9); return "short journal#" }
  if (t ~ /^knowledge#./) { DISP = "rewritten"; NEWV = "unit#" u "/finding/" substr(t, 11); return "short knowledge#" }
  if (t ~ /^backlog#./) { DISP = "rewritten"; NEWV = "unit#" u "/task/" substr(t, 9); return "short backlog#" }
  if (t ~ /^lane#./) {
    r = substr(t, 6)
    if (r ~ /^[^\/#]+\/(recipe|report)#./) {
      l = substr(r, 1, index(r, "/") - 1)
      r = substr(r, index(r, "/") + 1)
      DISP = "rewritten"
      NEWV = lane_art(l, substr(r, 1, index(r, "#") - 1), substr(r, index(r, "#") + 1), u)
      return "short lane# with a section"
    }
    if (r ~ /^[^\/#]+\/journal#./) {
      l = substr(r, 1, index(r, "/") - 1)
      DISP = "rewritten"
      NEWV = lane_art(l, "journal", substr(r, index(r, "#") + 1), u)
      return "short lane# with a journal entry"
    }
    if (r ~ /^[^\/#]+\/(recipe|journal|report)$/) {
      l = substr(r, 1, index(r, "/") - 1)
      DISP = "rewritten"
      NEWV = lane_art(l, substr(r, index(r, "/") + 1), "", u)
      return "short lane#"
    }
    if (r ~ /^[^\/#]+\/[^\/#]+\/(recipe|journal|report)$/) {
      split(r, P, /\//)
      DISP = "rewritten"
      NEWV = lane_art(P[2], P[3], "", P[1])
      return "lane#<unit>/<lane>/<artifact>"
    }
    return "excluded: lane# naming no artifact"
  }
  if (t ~ /^(task|finding|entry)#./) {
    kind = substr(t, 1, index(t, "#") - 1)
    DISP = "rewritten"
    NEWV = "unit#" u "/" kind "/" substr(t, index(t, "#") + 1)
    return "task#, finding#, entry#"
  }
  if (t ~ /^lanes\// && in_unit(u, t) == 2) return "legacy lanes/"
  if (t ~ /^[a-z0-9][a-z0-9_-]*#./) return "address of another owner"
  if (t ~ /^\.\.\/[A-Za-z0-9][A-Za-z0-9_-]*\//) {
    r = substr(t, 4)
    n = in_unit(substr(r, 1, index(r, "/") - 1), substr(r, index(r, "/") + 1))
    if (n == 1) return "../<unit>/ artifact"
    if (n == 2) return "../<unit>/lanes/"
  }
  if (t ~ /^(\.contexture\/)?(sessions|units)\/[A-Za-z0-9][A-Za-z0-9_-]*\//) {
    r = t
    sub(/^(\.contexture\/)?(sessions|units)\//, "", r)
    hu = substr(r, 1, index(r, "/") - 1)
    n = in_unit(hu, substr(r, index(r, "/") + 1))
    if (n && !held(hu)) {
      SECT = ""
      ARTV = ""
      DISP = inref ? "rewritten" : "kept"
      NEWV = inref ? "file#" t : t
      return "storage path of a unit this record does not hold"
    }
    if (n == 1) return "record storage artifact"
    if (n == 2) return "record storage lane artifact"
  }
  if (!inref) {
    if (t ~ /^\.?\.?\//) return "free text path"
    if (t ~ /\//) return "free text path or slash word"
    if (t ~ /IDEAS\.md/) return "free text IDEAS.md word"
    return "free text hash word"
  }
  if (LANE != "" && t ~ /^(recipe|journal|report)\.md(#.+)?$/) {
    art = t
    c = ""
    if (art ~ /#./) { c = substr(art, index(art, "#") + 1); art = substr(art, 1, index(art, "#") - 1) }
    sub(/\.md$/, "", art)
    DISP = "rewritten"
    NEWV = lane_art(LANE, art, c, UNIT)
    return "lane relative artifact"
  }
  if (t ~ /:[0-9][0-9,:-]*$/) {
    r = t
    sub(/:[0-9][0-9,:-]*$/, "", r)
    if (r ~ /\// || r ~ /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.[A-Za-z][A-Za-z0-9]*$/ || r ~ /^\.[A-Za-z][A-Za-z0-9_.-]*$/) {
      DISP = "rewritten"
      NEWV = "file#" (r ~ /\// ? r : "./" r)
      NOTEV = t
      return "file path:line"
    }
  }
  if (t ~ /\//) {
    DISP = "rewritten"
    NEWV = "file#" t
    if (t ~ /^\//) return "absolute path"
    if (t ~ /^\.\.\//) return "parent relative path"
    if (t ~ /^\.\//) return "root ./ path"
    if (t ~ /^lanes\//) return "legacy lanes/ file"
    return (t ~ /#./) ? "repo file#symbol" : "repo file path"
  }
  if (t ~ /^\.?[A-Za-z0-9_-][A-Za-z0-9_.-]*\.[A-Za-z][A-Za-z0-9]*#./ || t ~ /^\.[A-Za-z][A-Za-z0-9_.-]*#./) {
    DISP = "rewritten"
    NEWV = "file#" t
    return "root file#symbol"
  }
  if (t ~ /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.[A-Za-z][A-Za-z0-9]*$/ || t ~ /^\.[A-Za-z][A-Za-z0-9_.-]*$/) {
    DISP = "rewritten"
    NEWV = "file#./" t
    return "root file name"
  }
  DISP = "note"
  NOTEV = t
  return "not a pointer"
}

function row(field, class, disp, tok, nv) {
  printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%d\n", UNIT, LABEL, field, class, disp, tok, nv, FNR >> CENSUS
}

function isfull(c) { return c == "full address" || c == "address of another owner" || c ~ /^address forward/ }

# refval(v, field): one REF or REFS value; RV_NEW its new value ("" when the value leaves
# the field), RV_NOTE the text a NOTE line takes ("" for none), RV_CHG 1 when it changed.
# Only a full address stays in the field: every other value leaves it word for word for NOTE
function refval(v, field, strip,   s, first, rest, c, i) {
  RV_NEW = v
  RV_NOTE = ""
  RV_CHG = 0
  s = v
  if (strip && s ~ /^".*"$/ && length(s) >= 2) s = substr(s, 2, length(s) - 2)
  if (s ~ /^`.*`$/ && length(s) >= 2) s = substr(s, 2, length(s) - 2)
  if (s == "") {
    row(field, "empty value", "note", v, "")
    RV_NEW = ""; RV_CHG = 1
    return
  }
  if (s ~ /[ \t]/) {
    first = s
    sub(/[ \t].*$/, "", first)
    rest = substr(s, length(first) + 1)
    sub(/^[ \t]+/, "", rest)
    if (first ~ /^(recipe|report|journal)\.md#./) {
      row(field, "annotated token, its anchor holding blanks", "note", v, "")
      RV_NEW = ""; RV_NOTE = s; RV_CHG = 1
      return
    }
    c = cls(first, 1)
    if (DISP == "rewritten" && SECT != "") {
      row(field, c ", anchor followed by words, to NOTE", "rewritten", v, ARTV)
      RV_NEW = ARTV; RV_NOTE = s; RV_CHG = 1
      return
    }
    if (index(c, TCOLON) == 1) {
      row(field, c ", the whole value to NOTE", "rewritten", v, NEWV)
      RV_NEW = NEWV; RV_NOTE = s; RV_CHG = 1
      return
    }
    if (DISP == "rewritten" || isfull(c)) {
      row(field, c ", annotation to NOTE", "rewritten", v, NEWV)
      RV_NEW = NEWV; RV_NOTE = (NOTEV != "" ? NOTEV " " : "") rest; RV_CHG = 1
      return
    }
    row(field, (DISP == "kept" ? c ", annotated" : "prose"), "note", v, "")
    RV_NEW = ""; RV_NOTE = s; RV_CHG = 1
    return
  }
  c = cls(s, 1)
  if (DISP == "rewritten") {
    row(field, c, "rewritten", v, NEWV)
    RV_NEW = NEWV; RV_NOTE = NOTEV; RV_CHG = 1
    return
  }
  if (!isfull(c)) {
    row(field, c, "note", v, "")
    RV_NEW = ""; RV_NOTE = s; RV_CHG = 1
    return
  }
  if (s != v) {
    row(field, c ", quotes dropped", "rewritten", v, s)
    RV_NEW = s; RV_CHG = 1
    return
  }
  row(field, c, "kept", v, v)
}

# text(line, field): every pointer shaped token of a free text line counted, the unit forms,
# the IDEAS.md forms, and the corpus doc paths rewritten in place, every other byte kept
function text(line, field,   out, rest, tok) {
  out = ""
  rest = line
  while (match(rest, /[^ \t]+/)) {
    out = out substr(rest, 1, RSTART - 1)
    tok = substr(rest, RSTART, RLENGTH)
    rest = substr(rest, RSTART + RLENGTH)
    if (tok !~ /[#\/]/ && index(tok, "IDEAS.md") == 0) { out = out tok; continue }
    out = out word(tok, field)
  }
  return out rest
}

# word(tok, field): one token of free text, its core cut into pieces, each rewritten or kept
function word(tok, field,   core, cl, cr, n, i, o) {
  core = trim(tok)
  cl = CL
  cr = CR
  if (core == "" || (core !~ /[#\/]/ && index(core, "IDEAS.md") == 0)) return tok
  if ((core in EXCL) || core ~ /[<>*]/ || index(core, "...") || core ~ URL_RE || core ~ LAW_RE) {
    split("", WPC)
    split("", WPS)
    n = 1
    WPC[1] = core
    WPS[1] = ""
  } else n = cut(core)
  o = ""
  for (i = 1; i <= n; i++) o = o piece(WPC[i], field) WPS[i]
  return cl o cr
}

# cut(t): the pieces of a token's core in WPC, each followed by its separator in WPS: a comma,
# a semicolon, or the run of characters outside a path before a later pointer start (never a
# slash or a hash, so lane#l/journal#x and ../<unit>/journal.md#x stay whole)
function cut(t,   n, s, i, j, L, c) {
  split("", WPC)
  split("", WPS)
  n = 0
  s = 1
  L = length(t)
  for (i = 1; i <= L; i++) {
    c = substr(t, i, 1)
    if (c == "," || c == ";") {
      WPC[++n] = substr(t, s, i - s)
      WPS[n] = c
      s = i + 1
      continue
    }
    if (i > s && substr(t, i - 1, 1) !~ /[A-Za-z0-9._\/#-]/ && substr(t, i) ~ START_RE) {
      j = i - 1
      while (j > s && substr(t, j - 1, 1) !~ /[A-Za-z0-9._\/#-]/) j--
      WPC[++n] = substr(t, s, j - s)
      WPS[n] = substr(t, j, i - j)
      s = i
    }
  }
  WPC[++n] = substr(t, s)
  WPS[n] = ""
  return n
}

# piece(p, field): one piece of a token, its core rewritten in place or kept, counted either
# way; a trailing possessive is cut only when the core without it rewrites
function piece(p, field,   core, cl, cr, c, b, bcr) {
  core = trim(p)
  cl = CL
  cr = CR
  if (core == "" || (core !~ /[#\/]/ && index(core, "IDEAS.md") == 0)) return p
  c = cls(core, 0)
  if (DISP != "rewritten" && core ~ /.'s$/) {
    b = trim(substr(core, 1, length(core) - 2))
    bcr = CR
    c = cls(b, 0)
    if (DISP == "rewritten") {
      core = b
      cr = bcr "'s" cr
    } else c = cls(core, 0)
  }
  if (DISP == "rewritten") {
    row(field, c, "rewritten", core, NEWV)
    CHANGED = 1
    return cl NEWV cr
  }
  row(field, c, "kept", core, core)
  return p
}

# counted(line, field, class): the pointer shaped tokens of a line kept as written, each
# counted under the class (a closer line, a markdown heading, the text NOTE holds)
function counted(line, field, class,   rest, tok, core) {
  rest = line
  while (match(rest, /[^ \t]+/)) {
    tok = substr(rest, RSTART, RLENGTH)
    rest = substr(rest, RSTART + RLENGTH)
    core = trim(tok)
    if (core ~ /^#+$/) continue
    if (core ~ /[#\/]/ || index(core, "IDEAS.md")) row(field, class, "kept", core, core)
  }
}

function emit(s) { BUF[++NB] = s }

# flush(): the buffered item written, its NOTE lines after its last non-blank line
function flush(   i, last) {
  last = NB
  while (last > 0 && BUF[last] ~ /^[ \t]*$/) last--
  for (i = 1; i <= NB; i++) {
    put(BUF[i])
    if (i == last && NN > 0) notes()
  }
  if (last == 0 && NN > 0) notes()
  NB = 0
  NN = 0
}

function notes(   j) {
  for (j = 1; j <= NN; j++) put("  NOTE: " NOTES[j])
  CHANGED = 1
}

# put(s): one output line; the last line of an artifact stored with no final newline is
# written with none, so a rewritten value keeps its ending
function put(s) {
  if (MODE != "rewrite") return
  if (HAVEP) print PEND > OUT
  PEND = s
  HAVEP = 1
}

function is_block() { return KIND == "backlog" || KIND == "journal" || KIND == "knowledge" || KIND == "ljournal" }

# refs_split(body): a REFS list's items in RSI, split only at a comma outside double quotes
# (a backslash escaping the next character) and outside parentheses, the blanks after it
# dropped
function refs_split(body,   n, i, L, c, q, d, cur) {
  split("", RSI)
  n = 0
  if (body == "") return 0
  q = 0
  d = 0
  cur = ""
  L = length(body)
  for (i = 1; i <= L; i++) {
    c = substr(body, i, 1)
    if (c == "\\" && i < L) { cur = cur c substr(body, i + 1, 1); i++; continue }
    if (c == "\"") q = !q
    else if (!q && c == "(") d++
    else if (!q && c == ")" && d > 0) d--
    if (c == "," && !q && d == 0) {
      RSI[++n] = cur
      cur = ""
      while (i < L && substr(body, i + 1, 1) ~ /[ \t]/) i++
      continue
    }
    cur = cur c
  }
  RSI[++n] = cur
  return n
}

function refs_line(line,   pre, body, br, n, i, out, chg, kept) {
  pre = line
  sub(/REFS:.*$/, "", pre)
  body = substr(line, length(pre) + 6)
  sub(/^[ \t]*/, "", body)
  pre = substr(line, 1, length(line) - length(body))
  br = 0
  if (body ~ /^\[.*\]$/) { br = 1; body = substr(body, 2, length(body) - 2) }
  n = refs_split(body)
  chg = 0
  out = ""
  kept = 0
  for (i = 1; i <= n; i++) {
    refval(RSI[i], "REFS", 1)
    if (RV_CHG) chg = 1
    if (RV_NOTE != "") NOTES[++NN] = RV_NOTE
    if (RV_NEW == "") continue
    out = out (kept ? ", " : "") RV_NEW
    kept++
  }
  if (!chg) return line
  CHANGED = 1
  if (kept == 0) return "\001"
  return pre (br ? "[" out "]" : out)
}

function ref_line(line,   pre, v, q) {
  pre = line
  sub(/REF:.*$/, "", pre)
  v = substr(line, length(pre) + 5)
  sub(/^[ \t]*/, "", v)
  pre = substr(line, 1, length(line) - length(v))
  q = (v ~ /^".*"$/ && length(v) >= 2)
  refval(q ? substr(v, 2, length(v) - 2) : v, "REF", 0)
  if (RV_NOTE != "") NOTES[++NN] = RV_NOTE
  if (!RV_CHG) return line
  CHANGED = 1
  if (RV_NEW == "") return "\001"
  if (q) return pre "\"" RV_NEW "\""
  return pre RV_NEW
}

# recipe_values(line, key): a TASKS: or DECISIONS: line, free text: its pointer tokens
# rewritten, the annotations beside them never
function recipe_values(line, key,   pre) {
  pre = substr(line, 1, index(line, key ":") + length(key))
  return pre text(substr(line, length(pre) + 1), key)
}

# recipe_value(v, field): a REFS block line, a comma separated list of refs: each item's first
# token takes the REF rules and the rest of the item is free text, every separator and
# annotation kept as written; an item after the first whose first token is no pointer is
# free text whole
function recipe_value(v, field,   n, i, o) {
  n = rcut(v)
  o = ""
  for (i = 1; i <= n; i++) o = o recipe_item(RIT[i], field, i) RIS[i]
  return o
}

# rcut(v): a REFS block line's items in RIT, each followed by its separator in RIS: a comma
# outside double quotes (a backslash escaping the next character) and outside parentheses,
# with the blanks after it
function rcut(v,   n, s, i, j, L, c, q, d) {
  split("", RIT)
  split("", RIS)
  n = 0
  s = 1
  q = 0
  d = 0
  L = length(v)
  for (i = 1; i <= L; i++) {
    c = substr(v, i, 1)
    if (c == "\\") { i++; continue }
    if (c == "\"") q = !q
    else if (!q && c == "(") d++
    else if (!q && c == ")" && d > 0) d--
    else if (!q && d == 0 && c == ",") {
      j = i + 1
      while (j <= L && substr(v, j, 1) ~ /[ \t]/) j++
      RIT[++n] = substr(v, s, i - s)
      RIS[n] = substr(v, i, j - i)
      s = j
      i = j - 1
    }
  }
  RIT[++n] = substr(v, s)
  RIS[n] = ""
  return n
}

function recipe_item(v, field, i,   first, rest, c) {
  first = v
  sub(/[ \t].*$/, "", first)
  rest = substr(v, length(first) + 1)
  if (first == "") return v
  c = cls(first, 1)
  if (DISP == "rewritten") {
    row(field, c, "rewritten", first, NEWV)
    CHANGED = 1
    return NEWV (index(c, TCOLON) == 1 ? ":" : "") text(rest, field)
  }
  if (DISP == "note" && i > 1) return text(v, field)
  row(field, (DISP == "note" ? "recipe text, no pointer" : c), "kept", first, first)
  return first text(rest, field)
}

function line_of(line,   t) {
  if (line ~ /^#/) { counted(line, "heading", "excluded: markdown heading"); return line }
  if (line ~ /^@/) { counted(line, "head line", "excluded: head line"); return line }
  if (KIND == "state") {
    if (line ~ /^(ref_sessions|repos|status|current_anchor)[ \t]*:/) return line
    return text(line, "OBJECTIVE")
  }
  if (KIND == "recipe") {
    if (line ~ /^[^ \t]/) INREFS = (line ~ /^REFS[ \t]*::/)
    if (line ~ /^  TASKS:[ \t]/) return recipe_values(line, "TASKS")
    if (line ~ /^  DECISIONS:[ \t]/) return recipe_values(line, "DECISIONS")
    if (INREFS && line ~ /^[ \t]+[^ \t]/) {
      match(line, /^[ \t]+/)
      return substr(line, 1, RLENGTH) recipe_value(substr(line, RLENGTH + 1), "REFS")
    }
    return text(line, "recipe text")
  }
  if (KIND == "report") return text(line, "report text")
  if (line ~ /^  NOTE:[ \t]/) { counted(line, "NOTE", "excluded: inside NOTE"); return line }
  if (line ~ /^  (CLOSES|SUPERSEDES):/) { counted(line, "CLOSES", "excluded: closer line"); return line }
  if (line ~ /^  REF:/) return ref_line(line)
  if (KIND == "backlog" && line ~ /^  REFS:/) return refs_line(line)
  t = line
  return text(line, FIELD)
}

# field(line): the field a block artifact line belongs to, for the census
function field_of(line,   f) {
  if (line ~ /^  [A-Z][A-Z _]*(:|::)/) {
    f = line
    sub(/^[ \t]+/, "", f)
    sub(/[ \t]*::?.*$/, "", f)
    FIELD = f
  }
}

function start(f,   P) {
  split(MAP[f], P, /\t/)
  KIND = P[1]
  LANE = P[2]
  OUT = P[3]
  LABEL = P[4]
  FNL = P[5]
  HAVEP = 0
  PEND = ""
  NB = 0
  NN = 0
  INREFS = 0
  FIELD = "text"
  CHANGED = 0
}

function finish() {
  if (is_block()) flush()
  if (MODE == "rewrite") {
    if (HAVEP) printf "%s%s", PEND, (FNL == "0" ? "" : "\n") > OUT
    else printf "" > OUT
    close(OUT)
  }
  if (CHANGED && CHANGEDF != "") print LABEL > CHANGEDF
}

BEGIN {
  excl_init()
  MODE = ENVIRON["MG_MODE"]
  UNIT = ENVIRON["MG_UNIT"]
  REPOS = ENVIRON["MG_REPOS"]
  split("", HELD)
  HELDCHK = (ENVIRON["MG_HELD"] != "")
  if (HELDCHK) {
    while ((getline ml < ENVIRON["MG_HELD"]) > 0) HELD[ml] = 1
    close(ENVIRON["MG_HELD"])
  }
  CENSUS = ENVIRON["MG_CENSUS"]
  CHANGEDF = ENVIRON["MG_CHANGED"]
  FWDO = ""
  FWDN = ""
  split("", FWDS)
  if (MODE == "rewrite" || MODE == "census" || MODE == "collect") {
    FWDO = ENVIRON["MG_FWD_OLD"]
    FWDN = ENVIRON["MG_FWD_NEW"]
    if (FWDN == "") FWDO = ""
    FWDOUT = ENVIRON["MG_FWD_OUT"]
    if (MODE == "collect" && FWDOUT == "") FWDO = ""
    if (MODE == "collect") CENSUS = "/dev/null"
    if (FWDO != "" && ENVIRON["MG_FWD_CHECK"] != "") {
      while ((getline ml < ENVIRON["MG_FWD_CHECK"]) > 0) {
        fk = index(ml, "\t")
        if (fk > 1) FWDS[substr(ml, 1, fk - 1)] = substr(ml, fk + 1)
      }
      close(ENVIRON["MG_FWD_CHECK"])
    }
  }
  if (MODE == "suggest") {
    CENSUS = "/dev/null"
    if (ENVIRON["MG_TOKEN"] ~ /[ \t]/ || ENVIRON["MG_TOKEN"] == "") { print "kept\t"; exit 0 }
    c = cls(ENVIRON["MG_TOKEN"], 1)
    printf "%s\t%s\n", DISP, NEWV
    exit 0
  }
  if (MODE == "check") {
    CENSUS = "/dev/null"
    LANE = ""
    while ((getline ml < ENVIRON["MG_VALUES"]) > 0) {
      refval(ml, "REF", 0)
      if (RV_CHG) nold++
    }
    print nold + 0
    exit 0
  }
  while ((getline ml < ENVIRON["MG_MAP"]) > 0) {
    split(ml, MP, /\t/)
    MAP[MP[1]] = MP[2] "\t" MP[3] "\t" MP[4] "\t" MP[5] "\t" MP[6]
  }
  close(ENVIRON["MG_MAP"])
  CUR = ""
}

FNR == 1 {
  if (CUR != "") finish()
  CUR = FILENAME
  start(FILENAME)
}

{
  line = $0
  if (is_block()) {
    if (line ~ /^@/) flush()
    field_of(line)
    o = line_of(line)
    if (o != "\001") emit(o)
    next
  }
  put(line_of(line))
}

END {
  if (CUR != "") finish()
  if (CHANGEDF != "") close(CHANGEDF)
}
