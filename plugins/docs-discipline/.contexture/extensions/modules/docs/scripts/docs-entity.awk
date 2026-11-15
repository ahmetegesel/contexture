#!/usr/bin/awk -f
# docs-entity.awk: the corpus entities, read from raw docs (private engine; the get and the
# search verbs run it). Usage, behind the grammar asset:
#   awk -f docs-entity.awk part=1 doc.grammar part=2 <doc>...
# with DE_MODE get (DE_KEY: print that entity's raw lines, exit 3 when the doc holds none) or
# search (DE_QUERY, DE_TYPE, DE_LIMIT, DE_JSON: the rows of every entity holding a line that
# carries the query; DE_MODULE: the module's installed name the rows, addresses, and reads
# carry, docs unless installed under an alias).
#
# An entity is an entry with a stable key, addressed <module>#<repo>/<slug>/<key>: an id keyed
# entry (a responsibility, a contract rule, a pitfall, a caveat) by its id; a @rule block by
# rule/<category>/<rule-slug>; any other keyed entry by <block>/<key>, the key the block's
# grammar names (a first field's value, <from>><to> for data_flow, <direction>:<key> for
# edges), the same text ctx docs entry takes (the value read as the edit engine reads it, a
# backslash kept as a byte). The address carries the key encoded (key_enc):
# every ASCII byte outside letters, digits, and - _ . / : , + @ written %XX in uppercase hex
# (the percent sign, a blank, a double quote, a control byte, and every byte a shell reads
# specially among them), every other byte kept, so every address is one token, a valid
# reference, and its read safe to paste into a shell unquoted, and the encoding is the
# identity on a key holding none of those bytes. get also answers a key's own spelling when
# that spelling is one token holding no percent sign (an address written before the
# encoding), which no other key's encoding can equal. The doc's header is the entity header:
# every line no keyed entity holds (the header block, an entry known only by its place, a
# map block, a block marker, a line between entries), which get prints in file order and
# search matches. The grammar's #% block lines say each block's shape and key, so the keys
# follow the one grammar.
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
  MOD = ENVIRON["DE_MODULE"]
  NR_ROWS = 0
}

function trim(s) {
  sub(/^[ \t]+/, "", s)
  sub(/[ \t]+$/, "", s)
  return s
}

# unquote(v): v without its outer double quotes, every byte inside kept (the writer escapes
# nothing, so a backslash is a byte of the value)
function unquote(v) {
  if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") return substr(v, 2, length(v) - 2)
  return v
}

# field(s, e, f): the value of field f in the entry spanning lines s to e, at its head
# ("  - f: v") or on its own line ("    f: v"); empty when absent. Read as the edit engine
# reads a key (docs-edit.awk unit_value): the leading blanks (spaces) dropped, then the outer
# quotes, every other byte kept, so an address carries the key ctx docs entry takes
function field(s, e, f,    i, p, v) {
  for (i = s; i <= e; i++) {
    if (i == s) p = "  - " f ":"
    else p = "    " f ":"
    if (index(L[i], p) == 1) {
      v = substr(L[i], length(p) + 1)
      sub(/^ +/, "", v)
      return unquote(v)
    }
  }
  return ""
}

# key_enc(k): the key's address form: every ASCII byte outside letters, digits, and
# - _ . / : , + @ written %XX in uppercase hex, every other byte kept (the table built once
# from sprintf %c, so every supported awk agrees; a byte above ASCII never enters it)
function key_enc(k,    o, i, c) {
  if (!KE_READY) key_enc_table()
  o = ""
  for (i = 1; i <= length(k); i++) {
    c = substr(k, i, 1)
    o = o ((c in KE_PCT) ? KE_PCT[c] : c)
  }
  return o
}

function key_enc_table(    i, c, hex, keep) {
  hex = "0123456789ABCDEF"
  keep = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_./:,+@"
  for (i = 1; i < 128; i++) {
    c = sprintf("%c", i)
    if (index(keep, c)) continue
    KE_PCT[c] = "%" substr(hex, int(i / 16) + 1, 1) substr(hex, i % 16 + 1, 1)
  }
  KE_READY = 1
}

function etype(b) {
  if (b == "responsibilities") return "responsibility"
  if (b == "contract") return "contract"
  if (b == "pitfalls") return "pitfall"
  if (b == "caveats") return "caveat"
  return "entry"
}

# entry_done(): the entry ES..EE of block EB keyed by the grammar, its lines owned by the
# entity under its encoded key, or by the header when it holds no key
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
  if (k != "") own(k, t, ES, EE)
  ES = 0
}

# own(k, t, s, e): lines s to e owned by the entity of natural key k and type t, under its
# encoded key; a key whose encoding still is no one token (a control character above ASCII
# under a multibyte locale) stays on the header, so every address is a valid reference
function own(k, t, s, e,    ek, i) {
  ek = key_enc(k)
  if (ek ~ /[ \t"]/ || ek ~ /[[:cntrl:]]/) return
  for (i = s; i <= e; i++) { OWN[i] = ek; OTY[i] = t }
  span(ek, s, e)
  old_spelling(k, ek)
}

# old_spelling(k, ek): get's second answer for key k, its own spelling when that is one token
# holding no percent sign and differs from its encoding ek (an address written before the
# encoding); the first entity of a spelling wins
function old_spelling(k, ek) {
  if (ek != k && k !~ /[ \t"%]/ && k !~ /[[:cntrl:]]/ && !(k in OLD)) OLD[k] = ek
}

# span(k, s, e): the entity's printable span, its trailing blank lines left out; the first
# entity of a key wins
function span(k, s, e) {
  while (e > s && L[e] !~ /[^ \t]/) e--
  if (!(k in SS)) { SS[k] = s; SE[k] = e }
}

function doc_done(    i, line, blk, repo, slug, n2, a, w, last) {
  split("", OWN); split("", OTY); split("", SS); split("", SE); split("", NOM); split("", OLD)
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
      RK = key_enc("rule/" a[2])
      old_spelling("rule/" a[2], RK)
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
  if (MODE == "get") {
    if (GOT) return
    # the header: every line it owns in file order, the trailing blank lines left out; a bare
    # block marker only when its block holds a header line too, since a marker alone would
    # read as an empty block
    if (WANT == "header") {
      split("", HP)
      last = 0
      for (i = 1; i <= DN; i++) {
        if (OWN[i] != "header") continue
        HP[i] = 1
        if (NOM[i]) {
          HP[i] = 0
          for (w = i + 1; w <= DN && L[w] !~ /^@/; w++) if (OWN[w] == "header" && L[w] ~ /[^ \t]/) { HP[i] = 1; break }
        }
        if (HP[i] && L[i] ~ /[^ \t]/) last = i
      }
      for (i = 1; i <= last; i++) if (i in HP && HP[i]) print L[i]
      GOT = (last > 0)
      return
    }
    w = WANT
    if (!(w in SS) && (w in OLD)) w = OLD[w]
    if (w in SS) {
      for (i = SS[w]; i <= SE[w]; i++) print L[i]
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
      printf "%s{\"module\":%s,\"container\":%s,\"type\":%s,\"id\":%s,\"address\":%s,\"snippet\":%s,\"read\":%s}", (i > 1 ? "," : ""), jstr(MOD), jstr(RREPO[i] "/" RSLUG[i]), jstr(RTYPE[i]), jstr(RKEY[i]), jstr(MOD "#" path), jstr(RSNIP[i]), jstr("ctx " MOD " get " path)
    }
    printf "]}\n"
    return
  }
  printf "%s search \"%s\": %d match%s", MOD, QRAW, NR_ROWS, (NR_ROWS == 1 ? "" : "es")
  if (NR_ROWS > 0) printf ", %d shown", shown
  printf "\n"
  for (i = 1; i <= shown; i++) {
    path = RREPO[i] "/" RSLUG[i] "/" RKEY[i]
    printf "  %s %s#%s: %s\n", RTYPE[i], MOD, path, RSNIP[i]
  }
  if (shown > 0) printf "read one: ctx %s get <repo>/<slug>/<key> (the address after %s#)\n", MOD, MOD
}
