# model.awk: the posix driver's record model (contract 2, docs/the-engine.md, The record
# data model): it loads the artifacts the driver hands it, parses every legacy shape by the
# parse rules into typed items that hold all of their content (the schema fields, the extra
# fields, the head text, the extra lines; no item keeps its stored bytes), renders each
# item's canonical text through canon.awk, derives the positional fields (occurrence, seq,
# next, closure, liveness, superseded_by), and renders the JSON answers of the schemas. The
# driver runs it after
# canon.awk and before ops.awk; every value arrives through the environment or a file,
# never through awk -v (knowledge#FREE_TEXT_NEVER_THROUGH_AWK_V).
#
# The inputs (paths in the environment):
#   PX_MAN   the manifest: "F<TAB>key<TAB>path" per artifact file, "U<TAB>unit" per unit
#            that holds a state, "L<TAB>unit<TAB>lane" per lane folder (bytewise order)
#   PX_SIZES the byte count of every F file in manifest order (one wc -c), so the parse
#            knows whether a file ends with a newline
#   PX_PAY   the payload file (escaped key=value lines), or empty
#   PX_ERR   the refusal file: one "<function>: error: <message> (<CODE>)" line
#   PX_OUT   the answer file (a write answers only after its files land), or empty: stdout
# A key is "<unit>|<artifact>": state, backlog, knowledge, journal, lane/<l>/recipe,
# lane/<l>/journal, lane/<l>/report.

# ---- the output and the refusal ----
function O(s) { if (OUTF == "") printf "%s", s; else printf "%s", s > OUTF }

function die(tier, code, msg) {
  printf "%s: error: %s (%s)\n", FN, msg, code > ERRF
  close(ERRF)
  exit tier
}

# ---- the payload: key=value lines, the value escaped (\\ \n \t \r) ----
function pdec(v,   n, A, i, o, p, e) {
  if (index(v, "\\") == 0) return v
  n = split(v, A, /\\/)
  o = A[1]
  i = 2
  while (i <= n) {
    p = A[i]
    if (p == "") {
      o = o "\\"
      if (i + 1 <= n) o = o A[i + 1]
      i += 2
      continue
    }
    e = substr(p, 1, 1)
    if (e == "n") o = o "\n" substr(p, 2)
    else if (e == "t") o = o "\t" substr(p, 2)
    else if (e == "r") o = o "\r" substr(p, 2)
    else o = o "\\" p
    i++
  }
  return o
}

function load_payload(path,   line, k, n) {
  if (path == "") return
  while ((getline line < path) > 0) {
    n = index(line, "=")
    if (n < 2) die(1, "ERR_INVALID_ARGUMENT", "malformed payload line (want key=value)")
    k = substr(line, 1, n - 1)
    PAY[k] = pdec(substr(line, n + 1))
  }
  close(path)
}

function has(k) { return (k in PAY) }
function pv(k) { return (k in PAY) ? PAY[k] : NULLV }

# plist(key, arr): the payload list <key>.count, <key>.1 .. <key>.N into arr; returns N,
# or -1 when the list is absent
function plist(key, arr,   n, i) {
  split("", arr)
  if (!((key ".count") in PAY)) return -1
  n = PAY[key ".count"]
  if (n !~ /^[0-9]+$/) die(1, "ERR_INVALID_ARGUMENT", "malformed list count " key ".count")
  n = n + 0
  for (i = 1; i <= n; i++) {
    if (!((key "." i) in PAY)) die(1, "ERR_INVALID_ARGUMENT", "the list " key " lacks element " i)
    arr[i] = PAY[key "." i]
  }
  return n
}

# ---- the load ----
function load_manifest(path, sizes,   line, f, n, k, sz, p, t, tot, SZ, nsz, nf) {
  nsz = 0
  if (sizes != "") {
    while ((getline line < sizes) > 0) { sub(/^[ \t]+/, "", line); split(line, f, /[ \t]+/); SZ[++nsz] = f[1] + 0 }
    close(sizes)
  }
  nf = 0
  while ((getline line < path) > 0) {
    n = split(line, f, "\t")
    if (f[1] == "U") { UNITS[f[2]] = 1; continue }
    if (f[1] == "L") {
      NLANE[f[2]]++
      LANE[f[2], NLANE[f[2]]] = f[3]
      HASLANE[f[2], f[3]] = 1
      continue
    }
    if (f[1] != "F") continue
    k = f[2]; sz = SZ[++nf]
    p = substr(line, length(f[1]) + length(f[2]) + 3)
    NL[k] = 0; PRES[k] = 1; tot = 0
    # a legacy line ending in a carriage return parses without it (every typed string is LF
    # only) and keeps it in its stored bytes: CRL marks the line, text() and stage() write
    # the carriage return back
    while ((getline t < p) > 0) {
      NL[k]++; tot += length(t) + 1
      if (t ~ /\r$/) { CRL[k, NL[k]] = 1; t = substr(t, 1, length(t) - 1) }
      L[k, NL[k]] = t
    }
    close(p)
    EOFNL[k] = (tot == sz) ? 1 : 0
    if (NL[k] == 0) EOFNL[k] = 1
  }
  close(path)
}


# text(k, a, b): the stored bytes of lines a..b (each newline terminated, the file's last
# line only when the file ends with one); the preamble and a lane document read this way
function text(k, a, b,   i, o) {
  o = ""
  for (i = a; i <= b; i++) o = o L[k, i] (((k, i) in CRL) ? "\r" : "") ((i < NL[k] || EOFNL[k]) ? "\n" : "")
  return o
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

function trimb(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }

# lastparen(s): the text of s up to its last closing parenthesis (all of s without one): a
# legacy closer or supersedes reason may hold parentheses of its own
function lastparen(s,   p, q) {
  p = 0
  while ((q = index(substr(s, p + 1), ")")) > 0) p += q
  return (p > 0) ? substr(s, 1, p - 1) : s
}

# listparse(value, arr): [a, b] split on commas, or blank separated bare tokens
function listparse(v, arr,   n, inner, k, parts, i, t) {
  split("", arr)
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

# scan(k, a, cend): the lines of one item after its head (lines a+1..cend): NFD fields, FL
# label, FV value, FB 1 for a block scalar, FLINE its first line, FEND its last line; NSTR
# lines no field holds, STR each (a continuation, a comment, any other text). A block scalar
# opens with "  <LABEL> ::", text after the "::" being its first line; its body is the
# following lines indented four spaces (blank lines inside kept as empty lines), four spaces
# removed, its trailing whitespace-only lines dropped (nb).
function scan(k, a, cend,   j, m, last, lab, v, t, first, hasfirst) {
  NFD = 0; NSTR = 0
  j = a + 1
  while (j <= cend) {
    t = L[k, j]
    if (t ~ /^  [A-Z][A-Z_ ]* ::([ \t].*)?$/) {
      lab = t
      sub(/^  /, "", lab)
      sub(/ ::.*$/, "", lab)
      first = substr(t, index(t, " ::") + 3)
      sub(/^[ \t]+/, "", first)
      hasfirst = !isblank(first)
      last = j
      m = j + 1
      while (m <= cend) {
        if (L[k, m] ~ /^    /) { last = m; m++ }
        else if (isblank(L[k, m])) m++
        else break
      }
      v = hasfirst ? first : ""
      for (m = j + 1; m <= last; m++) v = v ((m > j + 1 || hasfirst) ? "\n" : "") (L[k, m] ~ /^    / ? substr(L[k, m], 5) : "")
      NFD++; FL[NFD] = lab; FV[NFD] = nb(v); FB[NFD] = 1; FLINE[NFD] = j; FEND[NFD] = last
      j = last + 1
      continue
    }
    if (t ~ /^  [A-Z][A-Z_]*: /) {
      lab = t
      sub(/^  /, "", lab)
      sub(/: .*$/, "", lab)
      v = substr(t, length(lab) + 5)
      NFD++; FL[NFD] = lab; FB[NFD] = 0; FLINE[NFD] = j
      if ((lab == "WHAT" || lab == "OBJECTIVE") && c_opens(v)) {
        m = j + 1
        while (m <= cend) {
          v = v "\n" L[k, m]
          if (substr(L[k, m], length(L[k, m]), 1) == "\"") break
          m++
        }
        if (m > cend) m = cend
        j = m
      }
      FV[NFD] = v; FEND[NFD] = j
      j++
      continue
    }
    if (!isblank(t)) STR[++NSTR] = t
    j++
  }
}

function content_end(k, a, b,   e) {
  e = b
  while (e > a && isblank(L[k, e])) e--
  return e
}

# p_head(k, a, word): the id of a head line (its second token) into HID, the text after it
# (blanks trimmed; NULLV when none) into HTX
function p_head(k, a, w,   h) {
  h = L[k, a]
  sub("^@" w "[ \t]*", "", h)
  HID = h
  sub(/[ \t].*$/, "", HID)
  HTX = trimb(substr(h, length(HID) + 1))
  if (HTX == "") HTX = NULLV
}

# x_extra(k, i, key, value), x_lines(k, i): an extra field, the extra lines of the scan
function x_extra(k, i, key, v) { X[k, i, "e", ++X[k, i, "e#"], "key"] = key; X[k, i, "e", X[k, i, "e#"], "val"] = v }
function x_lines(k, i,   n) { X[k, i, "l#"] = NSTR; for (n = 1; n <= NSTR; n++) X[k, i, "l", n] = STR[n] }

# ---- the parse of each kind into X[k, i, field] ----
# a task: the first STATUS, the first OBJECTIVE (a line unquoted, or a block), the first
# REFS, the first of each block section; every other field (a later occurrence, an unknown
# label) an extra field in line order
function p_task(k, i, a, b,   cend, j, status, obj, refsv, R, nr, desc, crit, det) {
  cend = content_end(k, a, b)
  scan(k, a, cend)
  status = NULLV; obj = NULLV; refsv = NULLV; desc = NULLV; crit = NULLV; det = NULLV
  X[k, i, "e#"] = 0
  for (j = 1; j <= NFD; j++) {
    if (FL[j] == "STATUS" && !FB[j] && status == NULLV) status = FV[j]
    else if (FL[j] == "OBJECTIVE" && obj == NULLV) obj = FB[j] ? FV[j] : unq(FV[j])
    else if (FL[j] == "REFS" && !FB[j] && refsv == NULLV) refsv = FV[j]
    else if (FL[j] == "DESCRIPTION" && FB[j] && desc == NULLV) desc = FV[j]
    else if (FL[j] == "ACCEPTANCE CRITERIA" && FB[j] && crit == NULLV) crit = FV[j]
    else if (FL[j] == "IMPLEMENTATION DETAILS" && FB[j] && det == NULLV) det = FV[j]
    else x_extra(k, i, FL[j], FV[j])
  }
  if (status == NULLV) status = "TODO"
  if (obj == NULLV) obj = ""
  nr = (refsv == NULLV) ? 0 : listparse(refsv, R)
  p_head(k, a, "task")
  X[k, i, "slug"] = HID; X[k, i, "ht"] = HTX; X[k, i, "status"] = status; X[k, i, "objective"] = obj
  X[k, i, "r#"] = nr
  for (j = 1; j <= nr; j++) X[k, i, "r", j] = R[j]
  X[k, i, "desc"] = desc; X[k, i, "crit"] = crit; X[k, i, "det"] = det
  x_lines(k, i)
}

# a finding: the first SUPERSEDES (its name the first token, its reason the parenthesis text
# to the last closing parenthesis, "" without one), every REF unquoted, the first SUMMARY (a
# block, or a line); every other field an extra field in line order
function p_finding(k, i, a, b,   cend, j, sup, supn, supr, nr, R, summ, t) {
  cend = content_end(k, a, b)
  scan(k, a, cend)
  sup = NULLV; summ = NULLV; nr = 0
  split("", R)
  X[k, i, "e#"] = 0
  for (j = 1; j <= NFD; j++) {
    if (FL[j] == "SUPERSEDES" && !FB[j] && sup == NULLV) sup = FV[j]
    else if (FL[j] == "REF" && !FB[j]) R[++nr] = unq_both(FV[j])
    else if (FL[j] == "SUMMARY" && summ == NULLV) summ = FV[j]
    else x_extra(k, i, FL[j], FV[j])
  }
  if (summ == NULLV) summ = ""
  p_head(k, a, "finding")
  supn = NULLV; supr = ""
  if (sup != NULLV) {
    supn = sup; sub(/[ \t].*$/, "", supn)
    t = sup
    if (index(t, "(") > 0) supr = lastparen(substr(t, index(t, "(") + 1))
  }
  X[k, i, "name"] = HID; X[k, i, "ht"] = HTX; X[k, i, "supn"] = supn; X[k, i, "supr"] = supr; X[k, i, "summ"] = summ
  X[k, i, "r#"] = nr
  for (j = 1; j <= nr; j++) X[k, i, "r", j] = R[j]
  x_lines(k, i)
}

# p_closer(k, i, kind, value, line number): one closer into X[k, i, "c", n, ...]: its targets
# the date-slug tokens before the first " - " or " (" (every other token of that part its extra
# text, joined by one space), then a parenthesis read to its last closing parenthesis
# ("<verdict>: <reason>" with a known verdict, else the reason alone), or " - <reason>"
function p_closer(k, i, kind, v, lno,   cut, tpart, rest, n, parts, j, T, nt, verdict, reason, inner, p1, p2, c, xt) {
  p1 = index(v, " - "); p2 = index(v, " (")
  cut = 0
  if (p1 > 0) cut = p1
  if (p2 > 0 && (cut == 0 || p2 < cut)) cut = p2
  tpart = (cut > 0) ? substr(v, 1, cut - 1) : v
  rest = (cut > 0) ? substr(v, cut + 1) : ""
  sub(/^[ \t]+/, "", rest)
  nt = 0
  split("", T)
  n = split(tpart, parts, /[ \t]+/)
  xt = NULLV
  for (j = 1; j <= n; j++) {
    if (isdateslug(parts[j])) T[++nt] = parts[j]
    else if (parts[j] != "") xt = (xt == NULLV) ? parts[j] : xt " " parts[j]
  }
  verdict = NULLV; reason = NULLV
  if (substr(rest, 1, 1) == "(") {
    inner = lastparen(substr(rest, 2))
    if (inner ~ /^(done|superseded|dropped|folded): /) {
      verdict = inner; sub(/: .*$/, "", verdict)
      reason = substr(inner, length(verdict) + 3)
    } else if (inner != "") reason = inner
  } else if (substr(rest, 1, 2) == "- ") {
    reason = substr(rest, 3)
    if (reason == "") reason = NULLV
  }
  c = ++X[k, i, "c#"]
  X[k, i, "c", c, "kind"] = kind; X[k, i, "c", c, "t#"] = nt
  for (j = 1; j <= nt; j++) X[k, i, "c", c, "t", j] = T[j]
  X[k, i, "c", c, "verdict"] = verdict; X[k, i, "c", c, "reason"] = reason; X[k, i, "c", c, "xt"] = xt
  X[k, i, "c", c, "line"] = lno
}

# an entry (main or lane journal): the last occurrence of ANCHOR, GROUP, RHYTHM, THREAD, and
# STATUS (legacy_status) is typed; the last WHAT, a line unquoted or a block; KNOWLEDGE true
# when its last line reads true; REF, CLOSES, SUPERSEDES lines are lists in line order; every
# other field (an earlier occurrence, a KNOWLEDGE not typed, an unknown label, a block of a
# one-line label) an extra field in line order
function p_entry(k, i, a, b,   cend, j, last, lw, anchor, what, group, rhythm, thread, know, lst, nr, R, tl, lab) {
  cend = content_end(k, a, b)
  scan(k, a, cend)
  split("", last)
  lw = 0
  for (j = 1; j <= NFD; j++) {
    if (!FB[j]) last[FL[j]] = j
    if (FL[j] == "WHAT") lw = j
  }
  anchor = NULLV; what = NULLV; group = NULLV; rhythm = NULLV; thread = NULLV; know = 0; lst = NULLV
  nr = 0; tl = 0
  split("", R)
  X[k, i, "c#"] = 0; X[k, i, "e#"] = 0
  for (j = 1; j <= NFD; j++) {
    lab = FL[j]
    if (lab == "WHAT" && j == lw) what = FB[j] ? FV[j] : unq(FV[j])
    else if (!FB[j] && lab ~ /^(ANCHOR|GROUP|RHYTHM|THREAD|STATUS)$/ && last[lab] == j) {
      if (lab == "ANCHOR") anchor = FV[j]
      else if (lab == "GROUP") group = FV[j]
      else if (lab == "RHYTHM") rhythm = FV[j]
      else if (lab == "THREAD") { thread = FV[j]; tl = FLINE[j] }
      else lst = FV[j]
    } else if (!FB[j] && lab == "KNOWLEDGE" && last[lab] == j && FV[j] == "true") know = 1
    else if (!FB[j] && lab == "REF") R[++nr] = unq_both(FV[j])
    else if (!FB[j] && (lab == "CLOSES" || lab == "SUPERSEDES")) p_closer(k, i, lab, FV[j], FLINE[j])
    else x_extra(k, i, lab, FV[j])
  }
  p_head(k, a, "entry")
  X[k, i, "slug"] = HID; X[k, i, "ht"] = HTX; X[k, i, "anchor"] = anchor; X[k, i, "what"] = what; X[k, i, "group"] = group
  X[k, i, "rhythm"] = rhythm; X[k, i, "thread"] = thread; X[k, i, "know"] = know; X[k, i, "lst"] = lst
  X[k, i, "tline"] = tl
  X[k, i, "r#"] = nr
  for (j = 1; j <= nr; j++) X[k, i, "r", j] = R[j]
  x_lines(k, i)
}

# an anchor: the stamp form <date> (YYYY-MM-DD) gives the date; the former receipt form
# ("continues <P>", attention: <text>) gives continues and attention (a surrounding pair of
# quotes off the attention); any other text after the anchor is its head text; the lines
# after the head its extra lines
function p_anchor(k, i, a, b,   cend, rest, cont, att, dt, j) {
  p_head(k, a, "anchor")
  rest = (HTX == NULLV) ? "" : HTX
  cont = NULLV; att = NULLV; dt = NULLV
  if (rest ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) {
    dt = rest
    HTX = NULLV
  } else if (rest ~ /^\("continues A[0-9]+", attention: .*\)$/) {
    cont = rest; sub(/^\("continues /, "", cont); sub(/".*$/, "", cont)
    att = rest; sub(/^\("continues A[0-9]+", attention: /, "", att); sub(/\)$/, "", att)
    att = unq_both(att)
    HTX = NULLV
  }
  X[k, i, "anchor"] = HID; X[k, i, "date"] = dt; X[k, i, "cont"] = cont; X[k, i, "att"] = att; X[k, i, "ht"] = HTX
  cend = content_end(k, a, b)
  NSTR = 0
  for (j = a + 1; j <= cend; j++) if (!isblank(L[k, j])) STR[++NSTR] = L[k, j]
  x_lines(k, i)
}

# an opaque item (a head other than @task in a backlog, other than @finding in a knowledge):
# its head line and its lines to its content end
function p_opaque(k, i, a, b,   cend, j) {
  X[k, i, "head"] = L[k, a]
  cend = content_end(k, a, b)
  NSTR = 0
  for (j = a + 1; j <= cend; j++) STR[++NSTR] = L[k, j]
  x_lines(k, i)
}

# kindof(type, head line)
function kindof(type, h) {
  if (type == "journal" || type == "lanejournal") return (h ~ /^@entry /) ? "entry" : "anchor"
  if (type == "backlog" && h ~ /^@task[ \t]/) return "task"
  if (type == "knowledge" && h ~ /^@finding[ \t]/) return "finding"
  return "opaque"
}

# parse_art(k, type): the preamble and the items of one block artifact; an absent
# artifact reads preamble NULLV and no item
function parse_art(k, type,   i, nh, H) {
  TYPE[k] = type
  NI[k] = 0
  if (!(k in PRES)) { PRE[k] = NULLV; return }
  nh = 0
  for (i = 1; i <= NL[k]; i++) {
    if (type == "journal" || type == "lanejournal") {
      if (L[k, i] ~ /^@entry / || L[k, i] ~ /^@anchor /) H[++nh] = i
    } else if (L[k, i] ~ /^@[A-Za-z]/) H[++nh] = i
  }
  PRE[k] = (nh > 0) ? text(k, 1, H[1] - 1) : text(k, 1, NL[k])
  NI[k] = nh
  for (i = 1; i <= nh; i++) {
    IH[k, i] = H[i]
    IE[k, i] = (i < nh) ? H[i + 1] - 1 : NL[k]
    IK[k, i] = kindof(type, L[k, H[i]])
  }
  for (i = 1; i <= nh; i++) {
    if (IK[k, i] == "task") p_task(k, i, IH[k, i], IE[k, i])
    else if (IK[k, i] == "finding") p_finding(k, i, IH[k, i], IE[k, i])
    else if (IK[k, i] == "entry") p_entry(k, i, IH[k, i], IE[k, i])
    else if (IK[k, i] == "anchor") p_anchor(k, i, IH[k, i], IE[k, i])
    else p_opaque(k, i, IH[k, i], IE[k, i])
  }
  if (type == "journal" || type == "lanejournal") derive_journal(k)
  if (type == "knowledge") derive_knowledge(k)
}

# derive_journal(k): occurrence per slug; the positional closure: an occurrence is closed
# by the first closer standing after it that names its slug (knowledge#CLOSER_CLOSES_PRECEDING_OCCURRENCES)
function derive_journal(k,   i, s, c, t, NC, NCC, CNT) {
  split("", CNT)
  for (i = 1; i <= NI[k]; i++) {
    if (IK[k, i] != "entry") continue
    s = X[k, i, "slug"]
    OCC[k, i] = ++CNT[s]
    LASTOCC[k, s] = i
  }
  split("", NC); split("", NCC)
  for (i = NI[k]; i >= 1; i--) {
    if (IK[k, i] != "entry") continue
    s = X[k, i, "slug"]
    if (s in NC) { CLBY[k, i] = NC[s]; CLBYC[k, i] = NCC[s] } else { CLBY[k, i] = 0; CLBYC[k, i] = 0 }
    for (c = X[k, i, "c#"]; c >= 1; c--) {
      for (t = X[k, i, "c", c, "t#"]; t >= 1; t--) { NC[X[k, i, "c", c, "t", t]] = i; NCC[X[k, i, "c", c, "t", t]] = c }
    }
  }
}

# derive_knowledge(k): superseded_by, the first finding whose SUPERSEDES names this one
function derive_knowledge(k,   i, n) {
  for (i = 1; i <= NI[k]; i++) {
    if (IK[k, i] != "finding") continue
    n = X[k, i, "supn"]
    if (n != NULLV && !((k, n) in SUPBY)) SUPBY[k, n] = X[k, i, "name"]
  }
}

# ---- the state ----
# every "<key>: <value>" line at column 0 opens a key; the indented lines after it continue
# its value (joined by newlines as stored) until a blank line or the next column-0 line; the
# first line of each of the six keys is typed (next_action and objective unquoted, repos and
# ref_sessions lists, ref_sessions null without its line), every other key (unknown, or a
# later occurrence) an extra field in line order, every other line an extra line
function parse_state(u,   k, i, key, v, st, ca, na, ob, rv, rs, R, nr, S, ns, seen, t, cur, NK, KK, KV, KL) {
  k = u "|state"
  st = ""; ca = ""; na = ""; ob = ""; rv = NULLV; rs = NULLV
  split("", seen)
  for (t in SLINE) if (index(t, u SUBSEP) == 1) delete SLINE[t]
  ST[u, "e#"] = 0; ST[u, "l#"] = 0
  NK = 0; cur = 0
  for (i = 1; i <= NL[k]; i++) {
    t = L[k, i]
    if (t ~ /^[a-z_]+: ?/) {
      key = t; sub(/:.*$/, "", key)
      v = substr(t, length(key) + 2); sub(/^ /, "", v)
      NK++; KK[NK] = key; KV[NK] = v; KL[NK] = i; cur = NK
      continue
    }
    if (isblank(t)) { cur = 0; continue }
    if (cur && t ~ /^[ \t]/) { KV[cur] = KV[cur] "\n" t; continue }
    ST[u, "l", ++ST[u, "l#"]] = t
  }
  for (i = 1; i <= NK; i++) {
    key = KK[i]; v = KV[i]
    if (!(key in seen) && key ~ /^(status|current_anchor|next_action|objective|repos|ref_sessions)$/) {
      seen[key] = 1
      SLINE[u, key] = KL[i]
      if (key == "status") st = v
      else if (key == "current_anchor") ca = v
      else if (key == "next_action") na = unq(v)
      else if (key == "objective") ob = unq(v)
      else if (key == "repos") rv = v
      else rs = v
      continue
    }
    ST[u, "e", ++ST[u, "e#"], "key"] = key; ST[u, "e", ST[u, "e#"], "val"] = v
  }
  nr = (rv == NULLV) ? 0 : listparse(rv, R)
  ns = (rs == NULLV) ? 0 : listparse(rs, S)
  ST[u, "status"] = st; ST[u, "anchor"] = ca; ST[u, "next"] = na; ST[u, "obj"] = ob
  ST[u, "r#"] = nr
  for (i = 1; i <= nr; i++) ST[u, "r", i] = R[i]
  ST[u, "hasrs"] = (rs != NULLV)
  ST[u, "s#"] = ns
  for (i = 1; i <= ns; i++) ST[u, "s", i] = S[i]
  ST[u, "text"] = state_text(u)
}

# ---- the canonical text of every item from its typed fields (canon.awk) ----
function xl_text(k, i,   n, o) { o = ""; for (n = 1; n <= X[k, i, "l#"]; n++) o = o X[k, i, "l", n] "\n"; return o }
function xf_text(k, i,   n, o) { o = ""; for (n = 1; n <= X[k, i, "e#"]; n++) o = o c_xfield(X[k, i, "e", n, "key"], X[k, i, "e", n, "val"]); return o }
function xr(k, i, R,   n) { split("", R); for (n = 1; n <= X[k, i, "r#"]; n++) R[n] = X[k, i, "r", n]; return X[k, i, "r#"] + 0 }

function cls_text(k, i,   c, t, T, nt, o) {
  o = ""
  for (c = 1; c <= X[k, i, "c#"]; c++) {
    nt = X[k, i, "c", c, "t#"] + 0
    split("", T)
    for (t = 1; t <= nt; t++) T[t] = X[k, i, "c", c, "t", t]
    o = o c_closer(X[k, i, "c", c, "kind"], T, nt, X[k, i, "c", c, "verdict"], X[k, i, "c", c, "reason"], X[k, i, "c", c, "xt"]) "\n"
  }
  return o
}

# item_lines(k, i): the canonical lines of item i of artifact k; item_text adds its separator
function item_lines(k, i,   R, nr) {
  nr = xr(k, i, R)
  if (IK[k, i] == "task") return c_task(X[k, i, "slug"], X[k, i, "status"], X[k, i, "objective"], R, nr, X[k, i, "desc"], X[k, i, "crit"], X[k, i, "det"], X[k, i, "ht"], xl_text(k, i), xf_text(k, i))
  if (IK[k, i] == "finding") return c_finding(X[k, i, "name"], X[k, i, "supn"], X[k, i, "supr"], R, nr, X[k, i, "summ"], X[k, i, "ht"], xl_text(k, i), xf_text(k, i))
  if (IK[k, i] == "entry") return c_entry(X[k, i, "slug"], X[k, i, "anchor"], X[k, i, "what"], X[k, i, "group"], X[k, i, "rhythm"], X[k, i, "thread"], R, nr, cls_text(k, i), X[k, i, "know"], X[k, i, "lst"], X[k, i, "ht"], xl_text(k, i), xf_text(k, i))
  if (IK[k, i] == "anchor") return c_anchor(X[k, i, "anchor"], X[k, i, "date"], X[k, i, "cont"], X[k, i, "att"], X[k, i, "ht"], xl_text(k, i))
  return c_opaque(X[k, i, "head"], xl_text(k, i))
}

function item_text(k, i) { return item_lines(k, i) c_sep((i < NI[k]) ? IK[k, i + 1] : NULLV) }

function state_text(u,   i, R, S, xl, xf) {
  split("", R); split("", S)
  for (i = 1; i <= ST[u, "r#"]; i++) R[i] = ST[u, "r", i]
  for (i = 1; i <= ST[u, "s#"]; i++) S[i] = ST[u, "s", i]
  xl = ""; xf = ""
  for (i = 1; i <= ST[u, "l#"]; i++) xl = xl ST[u, "l", i] "\n"
  for (i = 1; i <= ST[u, "e#"]; i++) xf = xf ST[u, "e", i, "key"] ": " ST[u, "e", i, "val"] "\n"
  return c_state(ST[u, "status"], ST[u, "anchor"], ST[u, "next"], ST[u, "obj"], R, ST[u, "r#"], ST[u, "hasrs"], S, ST[u, "s#"], xl, xf)
}

# ---- the JSON of the schemas ----
function xlist(k, i, tag,   n, j, o) {
  n = X[k, i, tag "#"] + 0
  o = "["
  for (j = 1; j <= n; j++) o = o (j > 1 ? "," : "") jstr(X[k, i, tag, j])
  return o "]"
}

function nextk_json(k, i) { return (i < NI[k]) ? jstr(IK[k, i + 1]) : "null" }

function kv_json(key, v) { return "{\"key\":" jstr(key) ",\"value\":" jstr(v) "}" }

function extras_json(k, i,   e, o) {
  o = "["
  for (e = 1; e <= X[k, i, "e#"]; e++) o = o (e > 1 ? "," : "") kv_json(X[k, i, "e", e, "key"], X[k, i, "e", e, "val"])
  return o "]"
}

# the fields every item with a head shares after its schema fields: head_text, extra_fields
# (extras 1), extra_lines
function tail_json(k, i, extras) {
  return (extras ? ",\"extra_fields\":" extras_json(k, i) : "") ",\"head_text\":" jnull(X[k, i, "ht"]) ",\"extra_lines\":" xlist(k, i, "l")
}

function state_json(u,   i, o, rs, e, l) {
  o = "["
  for (i = 1; i <= ST[u, "r#"]; i++) o = o (i > 1 ? "," : "") jstr(ST[u, "r", i])
  o = o "]"
  if (ST[u, "hasrs"]) {
    rs = "["
    for (i = 1; i <= ST[u, "s#"]; i++) rs = rs (i > 1 ? "," : "") jstr(ST[u, "s", i])
    rs = rs "]"
  } else rs = "null"
  e = "["
  for (i = 1; i <= ST[u, "e#"]; i++) e = e (i > 1 ? "," : "") kv_json(ST[u, "e", i, "key"], ST[u, "e", i, "val"])
  e = e "]"
  l = "["
  for (i = 1; i <= ST[u, "l#"]; i++) l = l (i > 1 ? "," : "") jstr(ST[u, "l", i])
  l = l "]"
  return "{\"unit\":" jstr(u) ",\"status\":" jstr(ST[u, "status"]) ",\"current_anchor\":" jstr(ST[u, "anchor"]) ",\"next_action\":" jstr(ST[u, "next"]) ",\"objective\":" jstr(ST[u, "obj"]) ",\"repos\":" o ",\"ref_sessions\":" rs ",\"extra_fields\":" e ",\"extra_lines\":" l "}"
}

function task_json(k, i) {
  return "{\"slug\":" jstr(X[k, i, "slug"]) ",\"ordinal\":" i ",\"status\":" jstr(X[k, i, "status"]) ",\"objective\":" jstr(X[k, i, "objective"]) ",\"refs\":" xlist(k, i, "r") ",\"description\":" jnull(X[k, i, "desc"]) ",\"criteria\":" jnull(X[k, i, "crit"]) ",\"details\":" jnull(X[k, i, "det"]) tail_json(k, i, 1) ",\"next\":" nextk_json(k, i) "}"
}

function taskitem_json(k, i) {
  return "{\"slug\":" jstr(X[k, i, "slug"]) ",\"status\":" jstr(X[k, i, "status"]) ",\"objective\":" jstr(X[k, i, "objective"]) "}"
}

function opaque_json(k, i) {
  return "{\"kind\":\"opaque\",\"seq\":" i ",\"head\":" jstr(X[k, i, "head"]) ",\"lines\":" xlist(k, i, "l") ",\"next\":" nextk_json(k, i) "}"
}

function finding_json(k, i,   sb, sup) {
  sb = ((k, X[k, i, "name"]) in SUPBY) ? SUPBY[k, X[k, i, "name"]] : NULLV
  sup = (X[k, i, "supn"] == NULLV) ? "null" : "{\"name\":" jstr(X[k, i, "supn"]) ",\"reason\":" jstr(X[k, i, "supr"]) "}"
  return "{\"name\":" jstr(X[k, i, "name"]) ",\"ordinal\":" i ",\"supersedes\":" sup ",\"refs\":" xlist(k, i, "r") ",\"summary\":" jstr(X[k, i, "summ"]) tail_json(k, i, 1) ",\"superseded_by\":" jnull(sb) ",\"active\":" jbool(sb == NULLV) ",\"next\":" nextk_json(k, i) "}"
}

function findingitem_json(k, i,   sb) {
  sb = ((k, X[k, i, "name"]) in SUPBY) ? SUPBY[k, X[k, i, "name"]] : NULLV
  return "{\"name\":" jstr(X[k, i, "name"]) ",\"summary\":" jstr(X[k, i, "summ"]) ",\"refs\":" xlist(k, i, "r") ",\"supersedes\":" jnull(X[k, i, "supn"]) ",\"active\":" jbool(sb == NULLV) "}"
}

function closer_json(k, i, c,   n, j, o) {
  n = X[k, i, "c", c, "t#"]
  o = "["
  for (j = 1; j <= n; j++) o = o (j > 1 ? "," : "") jstr(X[k, i, "c", c, "t", j])
  o = o "]"
  return "{\"kind\":" jstr(X[k, i, "c", c, "kind"]) ",\"targets\":" o ",\"verdict\":" jnull(X[k, i, "c", c, "verdict"]) ",\"reason\":" jnull(X[k, i, "c", c, "reason"]) ",\"extra_text\":" jnull(X[k, i, "c", c, "xt"]) "}"
}

function closers_json(k, i,   c, o) {
  o = "["
  for (c = 1; c <= X[k, i, "c#"]; c++) o = o (c > 1 ? "," : "") closer_json(k, i, c)
  return o "]"
}

# the entry fields from slug through extra_lines (the part every Entry form shares)
function entry_core(k, i) {
  return "\"slug\":" jstr(X[k, i, "slug"]) ",\"occurrence\":" OCC[k, i] ",\"seq\":" i ",\"anchor\":" jnull(X[k, i, "anchor"]) ",\"what\":" jnull(X[k, i, "what"]) ",\"group\":" jnull(X[k, i, "group"]) ",\"rhythm\":" jnull(X[k, i, "rhythm"]) ",\"knowledge\":" jbool(X[k, i, "know"]) ",\"thread\":" jnull(X[k, i, "thread"]) ",\"legacy_status\":" jnull(X[k, i, "lst"]) ",\"refs\":" xlist(k, i, "r") ",\"closers\":" closers_json(k, i) tail_json(k, i, 1)
}

# close_reason(k, i): "<verdict>: <reason>", the reason alone, or NULLV
function close_reason(k, i,   j, c, v, r) {
  j = CLBY[k, i]; c = CLBYC[k, i]
  v = X[k, j, "c", c, "verdict"]; r = X[k, j, "c", c, "reason"]
  if (v != NULLV) return v ": " r
  return r
}

function entry_json(k, i, withclosed,   o) {
  o = "{\"kind\":\"entry\"," entry_core(k, i)
  if (withclosed) {
    if (CLBY[k, i] == 0) o = o ",\"closed\":false,\"closed_by\":null,\"close_reason\":null"
    else o = o ",\"closed\":true,\"closed_by\":" jstr(X[k, CLBY[k, i], "slug"]) ",\"close_reason\":" jnull(close_reason(k, i))
  }
  return o ",\"next\":" nextk_json(k, i) "}"
}

function laneentry_json(k, i, lane) {
  return "{\"kind\":\"entry\",\"lane\":" jstr(lane) "," entry_core(k, i) ",\"next\":" nextk_json(k, i) "}"
}

function anchor_json(k, i) {
  return "{\"kind\":\"anchor\",\"seq\":" i ",\"anchor\":" jstr(X[k, i, "anchor"]) ",\"date\":" jnull(X[k, i, "date"]) ",\"continues\":" jnull(X[k, i, "cont"]) ",\"attention\":" jnull(X[k, i, "att"]) tail_json(k, i, 0) ",\"next\":" nextk_json(k, i) "}"
}

function entryitem_json(k, i) {
  return "{\"slug\":" jstr(X[k, i, "slug"]) ",\"occurrence\":" OCC[k, i] ",\"anchor\":" jnull(X[k, i, "anchor"]) ",\"what\":" jnull(X[k, i, "what"]) ",\"group\":" jnull(X[k, i, "group"]) "}"
}

# the board of a unit whose journal is present (streamed)
function board_out(u,   kb, kj, i, first, th) {
  kb = u "|backlog"; kj = u "|journal"
  O("{\"unit\":" jstr(u) ",\"backlog_present\":" jbool(PRE[kb] != NULLV) ",\"live\":[")
  first = 1; th = ""
  for (i = 1; i <= NI[kj]; i++) {
    if (IK[kj, i] != "entry" || CLBY[kj, i] != 0) continue
    O((first ? "" : ",") entry_json(kj, i, 0))
    first = 0
    if (X[kj, i, "thread"] != NULLV && X[kj, i, "thread"] != "none")
      th = th (th == "" ? "" : ",") "{\"slug\":" jstr(X[kj, i, "slug"]) ",\"anchor\":" jstr(X[kj, i, "anchor"] == NULLV ? "" : X[kj, i, "anchor"]) ",\"thread\":" jstr(X[kj, i, "thread"]) "}"
  }
  O("],\"open_tasks\":[")
  first = 1
  for (i = 1; i <= NI[kb]; i++) if (IK[kb, i] == "task" && X[kb, i, "status"] != "DONE") { O((first ? "" : ",") jstr(X[kb, i, "slug"])); first = 0 }
  O("],\"open_threads\":[" th "]}")
}

function backlog_out(u,   k, i) {
  k = u "|backlog"
  O("{\"preamble\":" jnull(PRE[k]) ",\"tasks\":[")
  for (i = 1; i <= NI[k]; i++) O((i > 1 ? "," : "") (IK[k, i] == "task" ? task_json(k, i) : opaque_json(k, i)))
  O("]}")
}

function knowledge_out(u,   k, i) {
  k = u "|knowledge"
  O("{\"preamble\":" jnull(PRE[k]) ",\"findings\":[")
  for (i = 1; i <= NI[k]; i++) O((i > 1 ? "," : "") (IK[k, i] == "finding" ? finding_json(k, i) : opaque_json(k, i)))
  O("]}")
}

# parse_unit(u, parts): the state and the named block artifacts of a unit (parts a string
# of words: backlog knowledge journal lanes)
function parse_unit(u, parts,   i, l) {
  if (u in UNITS) parse_state(u)
  if (index(parts, "backlog")) parse_art(u "|backlog", "backlog")
  if (index(parts, "knowledge")) parse_art(u "|knowledge", "knowledge")
  if (index(parts, "journal")) parse_art(u "|journal", "journal")
  if (index(parts, "lanes")) for (i = 1; i <= NLANE[u]; i++) { l = LANE[u, i]; parse_art(u "|lane/" l "/journal", "lanejournal") }
}

function refload_out(r) {
  if (!(r in UNITS)) { O("{\"unit\":" jstr(r) ",\"present\":false,\"knowledge\":null,\"board\":null}"); return }
  O("{\"unit\":" jstr(r) ",\"present\":true,\"knowledge\":")
  knowledge_out(r)
  O(",\"board\":")
  if (PRE[r "|journal"] == NULLV) O("null"); else board_out(r)
  O("}")
}
