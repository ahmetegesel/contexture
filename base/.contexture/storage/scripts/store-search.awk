# store-search.awk: the storage core's private search engine (see store-search). One
# parser of the module's data file, one extractor of the per-entity documents, and one
# exact matcher. The exact rule is the record rule: one line of the raw stored value,
# ASCII-case folded, a column-0 comment never matching, one result per entity and section,
# the first matching line as the snippet, results in bytewise key and line order.
#
# The exact answer carries the entity identity the document rules derive: entity_type and
# entity_id beside the key (the flat and generic fallbacks answer the one document, its
# id the key). The exact walk collects every match before printing, so the limit applies
# after the walk and the answer's total_matches counts every pair; a limit of 0 answers
# every match (the unlimited read a module uses for its own text order and cap). The
# searched text is the stored value: the canonical source is what the module's canonical
# render writes through the store, and the core never re-renders a module's grammar.
#
# Inputs: SS_DATA (the data file), SS_NS, SS_QUERY, SS_LIMIT, SS_MANIFEST.

function trim(s,    r) {
  r = s
  sub(/^[ \t\r\n]+/, "", r)
  sub(/[ \t\r\n]+$/, "", r)
  return r
}

function die(msg) {
  printf "store.search: error: %s (ERR_INVALID_ARGUMENT)\n", msg > "/dev/stderr"
  exit 1
}

# the JSON string body: every backslash escape is written by concatenation, never by a
# gsub replacement (the awk portability rule, knowledge#AWK_ESCAPE_VIA_CONCATENATION)
function bs_double(s,    n, p, i, o) {
  n = split(s, p, /\\/)
  o = (n ? p[1] : "")
  for (i = 2; i <= n; i++) o = o "\\" "\\" p[i]
  return o
}

function sjoin(s, sep, lit,    n, p, i, o) {
  n = split(s, p, sep)
  o = (n ? p[1] : "")
  for (i = 2; i <= n; i++) o = o lit p[i]
  return o
}

function json_escape(s,    x) {
  x = bs_double(s)
  x = sjoin(x, "[\"]", "\\" "\"")
  x = sjoin(x, "[\r]", "\\" "r")
  x = sjoin(x, "[\t]", "\\" "t")
  x = sjoin(x, "[\n]", "\\" "n")
  return x
}

# read_all(path): the file's bytes as records split at LF, no trailing CR
function read_all(path,    line, out) {
  out = ""
  while ((getline line < path) > 0) {
    sub(/\r$/, "", line)
    if (out == "") out = line
    else out = out "\n" line
  }
  close(path)
  return out
}

# parse_data(file): the search form and the document rules; a declared search form wins,
# else document rules make the document set form, else the walk reads every value as one
# document
function parse_data(file,    line, k, v, n, a) {
  form = ""
  ndoc = 0
  while ((getline line < file) > 0) {
    sub(/\r$/, "", line)
    if (line ~ /^[ \t]*#/) continue
    if (line ~ /^[ \t]*$/) continue
    k = line
    sub(/:.*/, "", k)
    v = line
    sub(/^[^:]*:[ \t]*/, "", v)
    k = trim(k); v = trim(v)
    if (k == "search") form = v
    else if (k == "document") {
      ndoc++
      n = split(v, a, /[ \t]+/)
      dpat[ndoc] = a[1]; dsec[ndoc] = a[2]; dent[ndoc] = a[3]; dmark[ndoc] = a[4]
    }
  }
  close(file)
  if (form == "" && ndoc > 0) form = "documents"
}

# pat_match(pat, key): a document key pattern against a key; a <name> placeholder per
# segment, a final <name...> admitting one or more segments, a literal segment exact
function pat_match(pat, key,    m, n, p, k, i, multi) {
  m = split(pat, p, "/")
  n = split(key, k, "/")
  if (m < 1) return 0
  multi = (p[m] ~ /^<[A-Za-z][A-Za-z0-9_]*\.\.\.>$/)
  if (multi) { if (n < m) return 0 } else { if (n != m) return 0 }
  for (i = 1; i < m; i++) {
    if (p[i] ~ /^<[A-Za-z][A-Za-z0-9_]*>$/) {
      if (k[i] == "") return 0
    } else if (p[i] != k[i]) return 0
  }
  if (multi) {
    for (i = m; i <= n; i++) if (k[i] == "") return 0
  } else {
    if (p[m] ~ /^<[A-Za-z][A-Za-z0-9_]*>$/) {
      if (k[m] == "") return 0
    } else if (p[m] != k[m]) return 0
  }
  return 1
}

# collect_rules(key): the document rules matching the key into R[1..RN], the common
# section, and the default entity (the first rule with no marker, else the first rule)
function collect_rules(key,    i, sec, def, nd) {
  nd = 0; sec = ""; def = ""
  for (i = 1; i <= ndoc; i++) {
    if (!pat_match(dpat[i], key)) continue
    nd++
    R[nd] = i
    if (sec == "") sec = dsec[i]
    else if (sec != dsec[i]) die("key '" key "' matches document rules with different sections")
    if (dmark[i] == "-" && def == "") def = dent[i]
  }
  if (nd == 0) return 0
  if (def == "") def = dent[R[1]]
  RN = nd; RSEC = sec; RDEF = def
  return 1
}

# match_line(key, section, type, id, ord, line): the exact rule's match and dedupe; every
# pair is collected and the limit is applied when the answer prints
function match_line(key, sec, typ, id, ord, line,    g, snip) {
  if (substr(line, 1, 1) == "#") return
  if (index(tolower(line), qlower) == 0) return
  g = key SUBSEP sec SUBSEP typ SUBSEP id
  if (g in seen) return
  seen[g] = 1
  total++
  snip = trim(line)
  sub(/^[A-Z_]+:[ ]*/, "", snip)
  if (length(snip) >= 2 && substr(snip, 1, 1) == "\"" && substr(snip, length(snip), 1) == "\"") {
    snip = substr(snip, 2)
    sub(/^[ \t]*/, "", snip)
    sub(/[ \t]*$/, "", snip)
    snip = substr(snip, 1, length(snip) - 1)
    sub(/[ \t]*$/, "", snip)
  }
  shown++
  rkey[shown] = key; rsec[shown] = sec; rtyp[shown] = typ; rid[shown] = id; rsnip[shown] = snip
}

# process_value(key, path): the generic one-document walk, or the document-set walk that
# names each line's entity
function process_value(key, path,    text, line, ord, cur, defdoc, i, ri, mark, ml, t, nt, nid, n, L) {
  if (form == "" || form == "flat" || !collect_rules(key)) {
    text = read_all(path)
    n = split(text, L, "\n")
    if (text == "") n = 0
    for (i = 1; i <= n; i++) {
      line = L[i]
      sub(/\r$/, "", line)
      match_line(key, "body", "document", key, i, line)
    }
    return
  }
  ord = 0; cur = 0; defdoc = 0; ndocs = 0
  while ((getline line < path) > 0) {
    sub(/\r$/, "", line)
    ord++
    nt = ""; nid = ""
    for (i = 1; i <= RN; i++) {
      ri = R[i]
      mark = dmark[ri]
      if (mark == "-") continue
      ml = length(mark)
      if (substr(line, 1, ml) != mark) continue
      if (length(line) > ml && substr(line, ml + 1, 1) != " " && substr(line, ml + 1, 1) != "\t") continue
      t = line
      sub(/^[^ \t]+[ \t]+/, "", t)
      sub(/[ \t].*$/, "", t)
      sub(/\(.*$/, "", t)
      if (t == "") continue
      nt = dent[ri]; nid = t
      break
    }
    if (nt != "") {
      if (nt == RDEF) {
        if (defdoc == 0) {
          ndocs++; defdoc = ndocs; cur = defdoc
          doc_sec[cur] = RSEC; doc_type[cur] = RDEF; doc_id[cur] = key
        } else {
          cur = defdoc
        }
      } else {
        ndocs++; cur = ndocs
        doc_sec[cur] = RSEC; doc_type[cur] = nt; doc_id[cur] = nid
      }
    } else if (cur == 0) {
      ndocs++; defdoc = ndocs; cur = defdoc
      doc_sec[cur] = RSEC; doc_type[cur] = RDEF; doc_id[cur] = key
    }
    match_line(key, doc_sec[cur], doc_type[cur], doc_id[cur], ord, line)
  }
  close(path)
}

function exact(    man, mline, t, k, p, cap) {
  ns = ENVIRON["SS_NS"]
  query = ENVIRON["SS_QUERY"]
  limit = ENVIRON["SS_LIMIT"] + 0
  if (trim(query) == "") die("the search query is empty")
  if (limit < 0) die("the search limit is not a number")
  qlower = tolower(query)
  total = 0; shown = 0
  man = ENVIRON["SS_MANIFEST"]
  while ((getline mline < man) > 0) {
    sub(/\r$/, "", mline)
    if (mline == "") continue
    t = index(mline, "\t")
    if (t == 0) continue
    k = substr(mline, 1, t - 1)
    p = substr(mline, t + 1)
    process_value(k, p)
  }
  close(man)
  cap = (limit > 0 && shown > limit) ? limit : shown
  printf "{\"namespace\":\"%s\",\"query\":\"%s\",\"mode\":\"exact\",\"total_matches\":%d,\"results\":[", \
    json_escape(ns), json_escape(query), total
  for (i = 1; i <= cap; i++) {
    if (i > 1) printf ","
    printf "{\"key\":\"%s\",\"entity_type\":\"%s\",\"entity_id\":\"%s\",\"section\":\"%s\",\"snippet\":\"%s\",\"score\":0}", \
      json_escape(rkey[i]), json_escape(rtyp[i]), json_escape(rid[i]), json_escape(rsec[i]), json_escape(rsnip[i])
  }
  printf "]}\n"
}

BEGIN {
  parse_data(ENVIRON["SS_DATA"])
  exact()
  exit 0
}
