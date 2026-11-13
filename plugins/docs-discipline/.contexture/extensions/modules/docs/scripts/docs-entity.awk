#!/usr/bin/awk -f
# docs-entity.awk: the corpus entities, read from raw docs (private engine; the get and the
# search verbs run it). Usage, behind the grammar asset:
#   awk -f docs-entity.awk part=1 doc.grammar part=2 <doc>...
# with DE_MODE get (DE_KEY: print that entity's raw lines, exit 3 when the doc holds none) or
# search (DE_QUERY, DE_TYPE, DE_LIMIT, DE_JSON: the rows of every entity holding a line that
# carries the query).
#
# An entity is an entry with a stable key, addressed docs#<repo>/<slug>/<key>: an id keyed
# entry (a responsibility, a contract rule, a pitfall, a caveat) by its id; a @rule block by
# rule/<category>/<rule-slug>; any other keyed entry by <block>/<key>, the key the block's
# grammar names (a first field's value, <from>><to> for data_flow, <direction>:<key> for
# edges), the same text ctx docs entry takes, when that key is one token (no blank, double
# quote, or control character), so every address is a valid reference. The doc's header is
# the entity header: the header block itself, and for search every line no keyed entity
# holds (an entry known only by its place or keyed by more than one token, a map block, a
# line between entries). The grammar's #% block lines say each
# block's shape and key, so the keys follow the one grammar.
#
# The exact rule is the shared one: a case-insensitive (ASCII) substring of one line, a
# column-0 # line never matching, the first matching line as the snippet; a bare block
# marker (@contract, @pitfalls) matches nothing. Rows follow the docs' order, then each
# doc's first matching lines; total counts every row before the limit.
#
# BWK awk, mawk, gawk, and busybox awk: no gensub, no length(array); a backslash is never
# produced by a gsub replacement.

part == 1 {
  if ($1 == "#%" && $2 == "block") {
    SHAPE[$3] = $4
    for (i = 5; i <= NF; i++) if (index($i, "key=") == 1) KEYF[$3] = substr($i, 5)
  }
  next
}

part == 2 && FNR == 1 {
  if (DN) doc_done()
  DN = 0
}

part == 2 { L[++DN] = $0; next }

END {
  if (DN) doc_done()
  if (MODE == "get") exit (GOT ? 0 : 3)
  if (MODE == "search") emit()
}

BEGIN {
  MODE = ENVIRON["DE_MODE"]
  WANT = ENVIRON["DE_KEY"]
  QUERY = tolower(ENVIRON["DE_QUERY"])
  TYPE = ENVIRON["DE_TYPE"]
  LIMIT = ENVIRON["DE_LIMIT"] + 0
  JSON = ENVIRON["DE_JSON"]
  QRAW = ENVIRON["DE_QUERY"]
  NR_ROWS = 0
}

function trim(s) {
  sub(/^[ \t]+/, "", s)
  sub(/[ \t]+$/, "", s)
  return s
}

function unquote(v,    o, i, c) {
  v = trim(v)
  if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") {
    v = substr(v, 2, length(v) - 2)
    o = ""
    for (i = 1; i <= length(v); i++) {
      c = substr(v, i, 1)
      if (c == "\\" && i < length(v)) { i++; c = substr(v, i, 1) }
      o = o c
    }
    return o
  }
  return v
}

# field(s, e, f): the value of field f in the entry spanning lines s to e, at its head
# ("  - f: v") or on its own line ("    f: v"); empty when absent
function field(s, e, f,    i, p) {
  for (i = s; i <= e; i++) {
    if (i == s) p = "  - " f ":"
    else p = "    " f ":"
    if (index(L[i], p) == 1) return unquote(substr(L[i], length(p) + 1))
  }
  return ""
}

function etype(b) {
  if (b == "responsibilities") return "responsibility"
  if (b == "contract") return "contract"
  if (b == "pitfalls") return "pitfall"
  if (b == "caveats") return "caveat"
  return "entry"
}

# entry_done(): the entry ES..EE of block EB keyed by the grammar, its lines owned by the
# entity, or by the header when it holds no key
function entry_done(    kf, k, p, f1, f2, v1, v2, i, t) {
  if (!ES) return
  kf = KEYF[EB]
  k = ""
  t = ""
  if (kf == "id") {
    k = field(ES, EE, "id")
    t = etype(EB)
  } else if (kf != "" && kf != "none") {
    p = index(kf, "+")
    if (p) {
      f1 = substr(kf, 1, p - 1)
      f2 = substr(kf, p + 1)
      v1 = field(ES, EE, f1)
      v2 = field(ES, EE, f2)
      if (v1 != "" && v2 != "") k = EB "/" v1 ((f1 == "from") ? ">" : ":") v2
    } else {
      v1 = field(ES, EE, kf)
      if (v1 != "") k = EB "/" v1
    }
    t = "entry"
  }
  if (k != "" && k !~ /[ \t"]/ && k !~ /[[:cntrl:]]/) {
    for (i = ES; i <= EE; i++) { OWN[i] = k; OTY[i] = t }
    span(k, ES, EE)
  }
  ES = 0
}

# span(k, s, e): the entity's printable span, its trailing blank lines left out; the first
# entity of a key wins
function span(k, s, e) {
  while (e > s && L[e] !~ /[^ \t]/) e--
  if (!(k in SS)) { SS[k] = s; SE[k] = e }
}

function doc_done(    i, line, blk, repo, slug, hs, he, n2, a) {
  split("", OWN); split("", OTY); split("", SS); split("", SE); split("", NOM)
  repo = ""; slug = ""; blk = ""; ES = 0
  for (i = 1; i <= DN; i++) {
    line = L[i]
    OWN[i] = "header"; OTY[i] = "doc"
    if (line ~ /^@doc[ \t]/) {
      entry_done()
      blk = "@doc"
      n2 = split(line, a, /[ \t]+/)
      if (n2 >= 3) slug = a[3]
      continue
    }
    if (line ~ /^@rule[ \t]/) {
      entry_done()
      if (blk == "rule") span(RK, RST, i - 1)
      blk = "rule"
      n2 = split(line, a, /[ \t]+/)
      RK = "rule/" a[2]
      OWN[i] = RK; OTY[i] = "rule"
      RST = i
      continue
    }
    if (line ~ /^@[A-Za-z_]/) {
      entry_done()
      if (blk == "rule") span(RK, RST, i - 1)
      blk = substr(line, 2)
      sub(/[ \t].*$/, "", blk)
      if (line ~ /^@[A-Za-z_]+[ \t]*$/) NOM[i] = 1
      continue
    }
    if (blk == "@doc") {
      if (repo == "" && index(line, "  repo:") == 1) repo = trim(substr(line, 8))
      continue
    }
    if (blk == "rule") { OWN[i] = RK; OTY[i] = "rule"; continue }
    if (SHAPE[blk] == "list") {
      if (index(line, "  - ") == 1) {
        entry_done()
        ES = i; EE = i; EB = blk
        continue
      }
      if (ES) EE = i
    }
  }
  entry_done()
  if (blk == "rule") span(RK, RST, DN)
  hs = 0
  for (i = 1; i <= DN; i++) if (L[i] ~ /^@doc[ \t]/) { hs = i; break }
  if (hs) {
    he = hs
    while (he < DN && L[he + 1] ~ /[^ \t]/ && L[he + 1] !~ /^@/) he++
    SS["header"] = hs; SE["header"] = he
  }
  if (MODE == "get") {
    if (!GOT && (WANT in SS)) {
      for (i = SS[WANT]; i <= SE[WANT]; i++) print L[i]
      GOT = 1
    }
    return
  }
  if (MODE == "search") {
    split("", SEEN)
    for (i = 1; i <= DN; i++) {
      if (NOM[i]) continue
      if (substr(L[i], 1, 1) == "#") continue
      if (index(tolower(L[i]), QUERY) == 0) continue
      if (OWN[i] in SEEN) continue
      if (TYPE != "" && OTY[i] != TYPE) continue
      SEEN[OWN[i]] = 1
      NR_ROWS++
      RREPO[NR_ROWS] = repo
      RSLUG[NR_ROWS] = slug
      RKEY[NR_ROWS] = OWN[i]
      RTYPE[NR_ROWS] = OTY[i]
      RSNIP[NR_ROWS] = trim(L[i])
    }
  }
}

# jstr(s): one JSON string, escaped by splitting and rejoining (the portable encoder)
function jstr(s,    n, p, o, i) {
  n = split(s, p, /\\/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "\\" p[i]
  n = split(o, p, /"/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "\"" p[i]
  n = split(o, p, /\t/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "t" p[i]
  n = split(o, p, /\r/); o = (n ? p[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "r" p[i]
  return "\"" o "\""
}

function emit(    i, shown, path) {
  shown = NR_ROWS
  if (LIMIT > 0 && shown > LIMIT) shown = LIMIT
  if (JSON == "1") {
    printf "{\"query\":%s,\"mode\":\"exact\",\"total\":%d,\"rows\":[", jstr(QRAW), NR_ROWS
    for (i = 1; i <= shown; i++) {
      path = RREPO[i] "/" RSLUG[i] "/" RKEY[i]
      printf "%s{\"module\":\"docs\",\"container\":%s,\"type\":%s,\"id\":%s,\"address\":%s,\"snippet\":%s,\"read\":%s}", (i > 1 ? "," : ""), jstr(RREPO[i] "/" RSLUG[i]), jstr(RTYPE[i]), jstr(RKEY[i]), jstr("docs#" path), jstr(RSNIP[i]), jstr("ctx docs get " path)
    }
    printf "]}\n"
    return
  }
  printf "docs search \"%s\": %d match%s", QRAW, NR_ROWS, (NR_ROWS == 1 ? "" : "es")
  if (NR_ROWS > 0) printf ", %d shown", shown
  printf "\n"
  for (i = 1; i <= shown; i++) {
    path = RREPO[i] "/" RSLUG[i] "/" RKEY[i]
    printf "  %s docs#%s: %s\n", RTYPE[i], path, RSNIP[i]
  }
  if (shown > 0) printf "read one: ctx docs get <repo>/<slug>/<key> (the address after docs#)\n"
}
