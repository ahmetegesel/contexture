# model.awk: the posix driver's record model (contract 2, docs/the-engine.md, The record
# data model): it loads the artifacts the driver hands it, parses every legacy shape by the
# parse rules into typed items, decides each item's verbatim with the canonical renderer
# (canon.awk), derives the positional fields (occurrence, seq, next, closure, liveness,
# superseded_by), and renders the JSON answers of the schemas. The driver runs it after
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
    while ((getline t < p) > 0) { NL[k]++; L[k, NL[k]] = t; tot += length(t) + 1 }
    close(p)
    EOFNL[k] = (tot == sz) ? 1 : 0
    if (NL[k] == 0) EOFNL[k] = 1
  }
  close(path)
}

# text(k, a, b): the stored bytes of lines a..b (each newline terminated, the file's last
# line only when the file ends with one)
function text(k, a, b,   i, o) {
  o = ""
  for (i = a; i <= b; i++) o = o L[k, i] ((i < NL[k] || EOFNL[k]) ? "\n" : "")
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

# scan(k, a, cend): the field lines of one item (lines a+1..cend): NFD fields, FL label,
# FV value, FB 1 for a block scalar, FLINE its first line, FEND its last line
function scan(k, a, cend,   j, m, last, lab, v) {
  NFD = 0
  j = a + 1
  while (j <= cend) {
    if (L[k, j] ~ /^  [A-Z][A-Z_ ]* ::[ \t]*$/) {
      lab = L[k, j]
      sub(/^  /, "", lab)
      sub(/ ::[ \t]*$/, "", lab)
      last = j
      m = j + 1
      while (m <= cend) {
        if (L[k, m] ~ /^    /) { last = m; m++ }
        else if (isblank(L[k, m])) m++
        else break
      }
      v = ""
      for (m = j + 1; m <= last; m++) v = v (m > j + 1 ? "\n" : "") (L[k, m] ~ /^    / ? substr(L[k, m], 5) : "")
      NFD++; FL[NFD] = lab; FV[NFD] = v; FB[NFD] = 1; FLINE[NFD] = j; FEND[NFD] = last
      j = last + 1
      continue
    }
    if (L[k, j] ~ /^  [A-Z][A-Z_]*: /) {
      lab = L[k, j]
      sub(/^  /, "", lab)
      sub(/: .*$/, "", lab)
      v = substr(L[k, j], length(lab) + 5)
      NFD++; FL[NFD] = lab; FB[NFD] = 0; FLINE[NFD] = j
      if ((lab == "WHAT" || lab == "OBJECTIVE") && substr(v, 1, 1) == "\"" && (length(v) == 1 || substr(v, length(v), 1) != "\"")) {
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
    }
    j++
  }
}

function content_end(k, a, b,   e) {
  e = b
  while (e > a && isblank(L[k, e])) e--
  return e
}

# ---- the parse of each kind into X[k, i, field] ----
function p_task(k, i, a, b, nextk,   cend, j, status, obj, refsv, R, nr, desc, crit, det, slug, canon, stored) {
  cend = content_end(k, a, b)
  scan(k, a, cend)
  status = NULLV; obj = NULLV; refsv = NULLV; desc = NULLV; crit = NULLV; det = NULLV
  for (j = 1; j <= NFD; j++) {
    if (FL[j] == "STATUS" && !FB[j] && status == NULLV) status = FV[j]
    else if (FL[j] == "OBJECTIVE" && !FB[j] && obj == NULLV) obj = unq(FV[j])
    else if (FL[j] == "REFS" && !FB[j] && refsv == NULLV) refsv = FV[j]
    else if (FL[j] == "DESCRIPTION" && FB[j] && desc == NULLV) desc = FV[j]
    else if (FL[j] == "ACCEPTANCE CRITERIA" && FB[j] && crit == NULLV) crit = FV[j]
    else if (FL[j] == "IMPLEMENTATION DETAILS" && FB[j] && det == NULLV) det = FV[j]
  }
  if (status == NULLV) status = "TODO"
  if (obj == NULLV) obj = ""
  nr = (refsv == NULLV) ? 0 : listparse(refsv, R)
  slug = L[k, a]; sub(/^@task[ \t]+/, "", slug); sub(/[ \t].*$/, "", slug)
  X[k, i, "slug"] = slug; X[k, i, "status"] = status; X[k, i, "objective"] = obj
  X[k, i, "r#"] = nr
  for (j = 1; j <= nr; j++) X[k, i, "r", j] = R[j]
  X[k, i, "desc"] = desc; X[k, i, "crit"] = crit; X[k, i, "det"] = det
  canon = c_task(slug, status, obj, R, nr, desc, crit, det) c_sep(nextk)
  stored = text(k, a, b)
  IV[k, i] = (stored == canon) ? NULLV : stored
}

function p_finding(k, i, a, b, nextk,   cend, j, sup, supn, supr, nr, R, summ, name, t, canon, stored) {
  cend = content_end(k, a, b)
  scan(k, a, cend)
  sup = NULLV; summ = NULLV; nr = 0
  split("", R)
  for (j = 1; j <= NFD; j++) {
    if (FL[j] == "SUPERSEDES" && !FB[j] && sup == NULLV) sup = FV[j]
    else if (FL[j] == "REF" && !FB[j]) R[++nr] = unq_both(FV[j])
    else if (FL[j] == "SUMMARY" && FB[j] && summ == NULLV) summ = FV[j]
  }
  if (summ == NULLV) summ = ""
  name = L[k, a]; sub(/^@finding[ \t]+/, "", name); sub(/[ \t].*$/, "", name)
  supn = NULLV; supr = ""
  if (sup != NULLV) {
    supn = sup; sub(/[ \t].*$/, "", supn)
    t = sup
    if (index(t, "(") > 0) {
      t = substr(t, index(t, "(") + 1)
      if (index(t, ")") > 0) t = substr(t, 1, index(t, ")") - 1)
      supr = t
    }
  }
  X[k, i, "name"] = name; X[k, i, "supn"] = supn; X[k, i, "supr"] = supr; X[k, i, "summ"] = summ
  X[k, i, "r#"] = nr
  for (j = 1; j <= nr; j++) X[k, i, "r", j] = R[j]
  canon = c_finding(name, supn, supr, R, nr, summ) c_sep(nextk)
  stored = text(k, a, b)
  IV[k, i] = (stored == canon) ? NULLV : stored
}

# p_closer(k, i, kind, value, line, line number): one closer into X[k, i, "c", n, ...];
# returns the line the entry's canonical lines carry (the stored line)
function p_closer(k, i, kind, v, line, lno,   cut, tpart, rest, n, parts, j, T, nt, verdict, reason, inner, canon, p1, p2, c) {
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
  for (j = 1; j <= n; j++) if (isdateslug(parts[j])) T[++nt] = parts[j]
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
  canon = c_closer(kind, T, nt, verdict, reason)
  c = ++X[k, i, "c#"]
  X[k, i, "c", c, "kind"] = kind; X[k, i, "c", c, "t#"] = nt
  for (j = 1; j <= nt; j++) X[k, i, "c", c, "t", j] = T[j]
  X[k, i, "c", c, "verdict"] = verdict; X[k, i, "c", c, "reason"] = reason
  X[k, i, "c", c, "verb"] = (canon == line) ? NULLV : line
  X[k, i, "c", c, "line"] = lno
  return line "\n"
}

function p_entry(k, i, a, b, nextk, islane,   cend, j, last, slug, anchor, what, group, rhythm, thread, know, lst, nr, R, ne, cls, canon, stored, tl) {
  cend = content_end(k, a, b)
  scan(k, a, cend)
  split("", last)
  for (j = 1; j <= NFD; j++) last[FL[j] SUBSEP FB[j]] = j
  anchor = NULLV; what = NULLV; group = NULLV; rhythm = NULLV; thread = NULLV; know = 0; lst = NULLV
  nr = 0; ne = 0; cls = ""; tl = 0
  split("", R)
  X[k, i, "c#"] = 0
  for (j = 1; j <= NFD; j++) {
    if (!FB[j] && FL[j] ~ /^(ANCHOR|WHAT|GROUP|RHYTHM|THREAD|KNOWLEDGE|STATUS)$/ && last[FL[j] SUBSEP 0] == j) {
      if (FL[j] == "ANCHOR") anchor = FV[j]
      else if (FL[j] == "WHAT") what = unq(FV[j])
      else if (FL[j] == "GROUP") group = FV[j]
      else if (FL[j] == "RHYTHM") rhythm = FV[j]
      else if (FL[j] == "THREAD") { thread = FV[j]; tl = FLINE[j] }
      else if (FL[j] == "KNOWLEDGE") know = (FV[j] == "true") ? 1 : 0
      else if (FL[j] == "STATUS") lst = FV[j]
    } else if (FB[j] && FL[j] == "WHAT" && last["WHAT" SUBSEP 1] == j && !(("WHAT" SUBSEP 0) in last)) {
      what = FV[j]
    } else if (!FB[j] && FL[j] == "REF") {
      R[++nr] = unq_both(FV[j])
    } else if (!FB[j] && (FL[j] == "CLOSES" || FL[j] == "SUPERSEDES")) {
      cls = cls p_closer(k, i, FL[j], FV[j], L[k, FLINE[j]], FLINE[j])
    } else {
      ne++
      X[k, i, "e", ne, "key"] = FL[j]; X[k, i, "e", ne, "val"] = FV[j]
    }
  }
  slug = L[k, a]; sub(/^@entry[ \t]+/, "", slug); sub(/[ \t].*$/, "", slug)
  X[k, i, "slug"] = slug; X[k, i, "anchor"] = anchor; X[k, i, "what"] = what; X[k, i, "group"] = group
  X[k, i, "rhythm"] = rhythm; X[k, i, "thread"] = thread; X[k, i, "know"] = know; X[k, i, "lst"] = lst
  X[k, i, "tline"] = tl
  X[k, i, "r#"] = nr
  for (j = 1; j <= nr; j++) X[k, i, "r", j] = R[j]
  X[k, i, "e#"] = ne
  if (islane) {
    canon = c_lane_entry(slug, what, thread, R, nr)
    # a lane entry's canonical lines never carry ANCHOR, GROUP, RHYTHM, closers, KNOWLEDGE
    if (anchor != NULLV || group != NULLV || rhythm != NULLV || X[k, i, "c#"] > 0 || know) canon = canon "\001"
  } else canon = c_entry(slug, anchor, what, group, rhythm, thread, R, nr, cls, know)
  canon = canon c_sep(nextk)
  stored = text(k, a, b)
  IV[k, i] = (stored == canon) ? NULLV : stored
}

function p_anchor(k, i, a, b, nextk,   h, anc, rest, cont, att, canon, stored) {
  h = L[k, a]
  sub(/^@anchor[ \t]+/, "", h)
  anc = h; sub(/[ \t].*$/, "", anc)
  rest = substr(h, length(anc) + 2)
  cont = NULLV; att = NULLV
  if (rest ~ /^\("continues A[0-9]+", attention: .*\)$/) {
    cont = rest; sub(/^\("continues /, "", cont); sub(/".*$/, "", cont)
    att = rest; sub(/^\("continues A[0-9]+", attention: /, "", att); sub(/\)$/, "", att)
    att = unq_both(att)
  }
  X[k, i, "anchor"] = anc; X[k, i, "cont"] = cont; X[k, i, "att"] = att
  canon = c_anchor(anc, cont, att) c_sep(nextk)
  stored = text(k, a, b)
  IV[k, i] = (stored == canon) ? NULLV : stored
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
function parse_art(k, type,   i, nh, H, b, nk) {
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
    nk = (i < nh) ? IK[k, i + 1] : NULLV
    if (IK[k, i] == "task") p_task(k, i, IH[k, i], IE[k, i], nk)
    else if (IK[k, i] == "finding") p_finding(k, i, IH[k, i], IE[k, i], nk)
    else if (IK[k, i] == "entry") p_entry(k, i, IH[k, i], IE[k, i], nk, type == "lanejournal")
    else if (IK[k, i] == "anchor") p_anchor(k, i, IH[k, i], IE[k, i], nk)
    else IV[k, i] = text(k, IH[k, i], IE[k, i])
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
function parse_state(u,   k, i, key, v, st, ca, na, ob, rv, rs, R, nr, S, ns, seen, canon, stored) {
  k = u "|state"
  st = ""; ca = ""; na = ""; ob = ""; rv = NULLV; rs = NULLV
  split("", seen)
  for (i = 1; i <= NL[k]; i++) {
    if (L[k, i] !~ /^[a-z_]+: ?/) continue
    key = L[k, i]; sub(/:.*$/, "", key)
    v = substr(L[k, i], length(key) + 2); sub(/^ /, "", v)
    if (key in seen) continue
    seen[key] = 1
    SLINE[u, key] = i
    if (key == "status") st = v
    else if (key == "current_anchor") ca = v
    else if (key == "next_action") na = unq(v)
    else if (key == "objective") ob = unq(v)
    else if (key == "repos") rv = v
    else if (key == "ref_sessions") rs = v
  }
  nr = (rv == NULLV) ? 0 : listparse(rv, R)
  ns = (rs == NULLV) ? 0 : listparse(rs, S)
  ST[u, "status"] = st; ST[u, "anchor"] = ca; ST[u, "next"] = na; ST[u, "obj"] = ob
  ST[u, "r#"] = nr
  for (i = 1; i <= nr; i++) ST[u, "r", i] = R[i]
  ST[u, "hasrs"] = (rs != NULLV)
  ST[u, "s#"] = ns
  for (i = 1; i <= ns; i++) ST[u, "s", i] = S[i]
  canon = c_state(st, ca, na, ob, R, nr, rs != NULLV, S, ns)
  stored = text(k, 1, NL[k])
  ST[u, "verb"] = (stored == canon) ? NULLV : stored
  ST[u, "text"] = stored
}

# ---- the JSON of the schemas ----
function xlist(k, i, tag,   n, j, o) {
  n = X[k, i, tag "#"] + 0
  o = "["
  for (j = 1; j <= n; j++) o = o (j > 1 ? "," : "") jstr(X[k, i, tag, j])
  return o "]"
}

function nextk_json(k, i) { return (i < NI[k]) ? jstr(IK[k, i + 1]) : "null" }

function state_json(u,   i, o, rs) {
  o = "["
  for (i = 1; i <= ST[u, "r#"]; i++) o = o (i > 1 ? "," : "") jstr(ST[u, "r", i])
  o = o "]"
  if (ST[u, "hasrs"]) {
    rs = "["
    for (i = 1; i <= ST[u, "s#"]; i++) rs = rs (i > 1 ? "," : "") jstr(ST[u, "s", i])
    rs = rs "]"
  } else rs = "null"
  return "{\"unit\":" jstr(u) ",\"status\":" jstr(ST[u, "status"]) ",\"current_anchor\":" jstr(ST[u, "anchor"]) ",\"next_action\":" jstr(ST[u, "next"]) ",\"objective\":" jstr(ST[u, "obj"]) ",\"repos\":" o ",\"ref_sessions\":" rs ",\"verbatim\":" jnull(ST[u, "verb"]) "}"
}

function task_json(k, i) {
  return "{\"slug\":" jstr(X[k, i, "slug"]) ",\"ordinal\":" i ",\"status\":" jstr(X[k, i, "status"]) ",\"objective\":" jstr(X[k, i, "objective"]) ",\"refs\":" xlist(k, i, "r") ",\"description\":" jnull(X[k, i, "desc"]) ",\"criteria\":" jnull(X[k, i, "crit"]) ",\"details\":" jnull(X[k, i, "det"]) ",\"next\":" nextk_json(k, i) ",\"verbatim\":" jnull(IV[k, i]) "}"
}

function taskitem_json(k, i) {
  return "{\"slug\":" jstr(X[k, i, "slug"]) ",\"status\":" jstr(X[k, i, "status"]) ",\"objective\":" jstr(X[k, i, "objective"]) "}"
}

function opaque_json(k, i) {
  return "{\"kind\":\"opaque\",\"seq\":" i ",\"next\":" nextk_json(k, i) ",\"verbatim\":" jstr(IV[k, i]) "}"
}

function finding_json(k, i,   sb, sup) {
  sb = ((k, X[k, i, "name"]) in SUPBY) ? SUPBY[k, X[k, i, "name"]] : NULLV
  sup = (X[k, i, "supn"] == NULLV) ? "null" : "{\"name\":" jstr(X[k, i, "supn"]) ",\"reason\":" jstr(X[k, i, "supr"]) "}"
  return "{\"name\":" jstr(X[k, i, "name"]) ",\"ordinal\":" i ",\"supersedes\":" sup ",\"refs\":" xlist(k, i, "r") ",\"summary\":" jstr(X[k, i, "summ"]) ",\"superseded_by\":" jnull(sb) ",\"active\":" jbool(sb == NULLV) ",\"next\":" nextk_json(k, i) ",\"verbatim\":" jnull(IV[k, i]) "}"
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
  return "{\"kind\":" jstr(X[k, i, "c", c, "kind"]) ",\"targets\":" o ",\"verdict\":" jnull(X[k, i, "c", c, "verdict"]) ",\"reason\":" jnull(X[k, i, "c", c, "reason"]) ",\"verbatim\":" jnull(X[k, i, "c", c, "verb"]) "}"
}

function closers_json(k, i,   c, o) {
  o = "["
  for (c = 1; c <= X[k, i, "c#"]; c++) o = o (c > 1 ? "," : "") closer_json(k, i, c)
  return o "]"
}

function extras_json(k, i,   e, o) {
  o = "["
  for (e = 1; e <= X[k, i, "e#"]; e++) o = o (e > 1 ? "," : "") "{\"key\":" jstr(X[k, i, "e", e, "key"]) ",\"value\":" jstr(X[k, i, "e", e, "val"]) "}"
  return o "]"
}

# the entry fields from slug through extra_fields (the part every Entry form shares)
function entry_core(k, i) {
  return "\"slug\":" jstr(X[k, i, "slug"]) ",\"occurrence\":" OCC[k, i] ",\"seq\":" i ",\"anchor\":" jnull(X[k, i, "anchor"]) ",\"what\":" jnull(X[k, i, "what"]) ",\"group\":" jnull(X[k, i, "group"]) ",\"rhythm\":" jnull(X[k, i, "rhythm"]) ",\"knowledge\":" jbool(X[k, i, "know"]) ",\"thread\":" jnull(X[k, i, "thread"]) ",\"legacy_status\":" jnull(X[k, i, "lst"]) ",\"refs\":" xlist(k, i, "r") ",\"closers\":" closers_json(k, i) ",\"extra_fields\":" extras_json(k, i)
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
  return o ",\"next\":" nextk_json(k, i) ",\"verbatim\":" jnull(IV[k, i]) "}"
}

function laneentry_json(k, i, lane) {
  return "{\"kind\":\"entry\",\"lane\":" jstr(lane) "," entry_core(k, i) ",\"next\":" nextk_json(k, i) ",\"verbatim\":" jnull(IV[k, i]) "}"
}

function anchor_json(k, i) {
  return "{\"kind\":\"anchor\",\"seq\":" i ",\"anchor\":" jstr(X[k, i, "anchor"]) ",\"continues\":" jnull(X[k, i, "cont"]) ",\"attention\":" jnull(X[k, i, "att"]) ",\"next\":" nextk_json(k, i) ",\"verbatim\":" jnull(IV[k, i]) "}"
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
