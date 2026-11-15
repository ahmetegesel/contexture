# idea.awk: the ideas module's private record reader (no summary line; the ideas worker
# runs it, never ctx). A record is the unit record dialect the storage layer's field
# validator writes: a line field NAME: "value" (the payload escape: backslash, newline, tab,
# carriage return), a list one such line per item, a block NAME :: with its body indented
# two spaces. The record comes on stdin; the environment selects the work:
#
#   REC_MODE=unesc                       the one input line unescaped, with no newline added
#   REC_MODE=values  REC_ARG=<field>     each value of the field unescaped, one per line
#   REC_MODE=text    REC_ARG=<id>        one line: the id, then each line field and its
#                                        values, block fields left out
#   REC_MODE=json    REC_ARG=<names>     the record as one JSON object, the named fields
#                                        always lists, any other field a list when repeated
#   REC_MODE=rows                        the flattened storage layer search answer mapped to
#                                        the shared search rows: ROWS_OWNER, ROWS_CONTAINER,
#                                        and ROWS_TYPE name them, ROWS_LIMIT rows shown,
#                                        ROWS_QUERY echoed, ROWS_FORMAT json or text
#
# BWK awk, mawk, gawk, and busybox awk: every escape is written by concatenation, never by a
# sub or gsub replacement.

function unesc(s,    out, i, n, c, d) {
  out = ""
  n = length(s)
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (c == "\\" && i < n) {
      d = substr(s, i + 1, 1)
      if (d == "\\") { out = out "\\"; i++; continue }
      if (d == "n") { out = out "\n"; i++; continue }
      if (d == "t") { out = out "\t"; i++; continue }
      if (d == "r") { out = out "\r"; i++; continue }
    }
    out = out c
  }
  return out
}

function jesc(s,    out, i, n, c) {
  if (!JT) { for (i = 1; i < 32; i++) JORD[sprintf("%c", i)] = i; JT = 1 }
  out = ""
  n = length(s)
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (c == "\\") out = out "\\" "\\"
    else if (c == "\"") out = out "\\" "\""
    else if (c == "\n") out = out "\\" "n"
    else if (c == "\t") out = out "\\" "t"
    else if (c == "\r") out = out "\\" "r"
    else if (c in JORD) out = out sprintf("\\u%04x", JORD[c])
    else out = out c
  }
  return "\"" out "\""
}

function named(n) { return n != "" && index(" " NAMES " ", " " n " ") > 0 }

BEGIN {
  MODE = ENVIRON["REC_MODE"]
  NAMES = ENVIRON["REC_ARG"]
  cur = ""
  nf = 0
}

{
  if (MODE == "unesc") { printf "%s", unesc($0); next }
  if (MODE == "rows") { rows_line($0); next }
  line = $0
  if (cur != "" && substr(line, 1, 2) == "  ") {
    BODY[cur] = (BN[cur] > 0 ? BODY[cur] "\n" : "") substr(line, 3)
    BN[cur]++
    next
  }
  if (line ~ /^[a-z][a-z0-9_-]* ::$/) {
    cur = substr(line, 1, length(line) - 3)
    if (!(cur in KIND)) { ORD[++nf] = cur; KIND[cur] = "block"; BODY[cur] = ""; BN[cur] = 0 }
    next
  }
  cur = ""
  c = index(line, ": \"")
  if (c < 2) next
  field = substr(line, 1, c - 1)
  if (!(field in KIND)) { ORD[++nf] = field; KIND[field] = "line"; N[field] = 0 }
  V[field, ++N[field]] = unesc(substr(line, c + 3, length(line) - c - 3))
}

END {
  if (MODE == "unesc") exit 0
  if (MODE == "rows") { rows_end(); exit 0 }
  if (MODE == "values") {
    f = NAMES
    if (KIND[f] == "block") { if (BN[f] > 0) print BODY[f] }
    else for (j = 1; j <= N[f]; j++) print V[f, j]
    exit 0
  }
  if (MODE == "json") {
    out = ""
    for (k = 1; k <= nf; k++) {
      f = ORD[k]
      out = out (out == "" ? "" : ",") jesc(f) ":"
      if (KIND[f] == "block") out = out jesc(BODY[f])
      else if (named(f) || N[f] > 1) {
        item = ""
        for (j = 1; j <= N[f]; j++) item = item (j > 1 ? "," : "") jesc(V[f, j])
        out = out "[" item "]"
      } else out = out jesc(V[f, 1])
    }
    printf "{%s}", out
    exit 0
  }
  if (MODE == "text") {
    out = NAMES
    for (k = 1; k <= nf; k++) {
      f = ORD[k]
      if (KIND[f] == "block") continue
      item = ""
      for (j = 1; j <= N[f]; j++) item = item (j > 1 ? ", " : "") V[f, j]
      out = out " | " f ": " item
    }
    print out
    exit 0
  }
  printf "idea.awk: error: unknown mode '%s' (ERR_INVALID_ARGUMENT)\n", MODE > "/dev/stderr"
  exit 1
}

function rows_line(l,    m, p, k, v) {
  if (l !~ /^results\.[0-9]+\.(key|snippet)=/) return
  p = index(l, "=")
  k = substr(l, 1, p - 1)
  v = unesc(substr(l, p + 1))
  split(k, m, /\./)
  if (m[2] + 0 > NROWS) NROWS = m[2] + 0
  if (m[3] == "key") RKEY[m[2] + 0] = v
  else { sub(/^ +/, "", v); RSNIP[m[2] + 0] = v }
}

function rows_end(    i, id, total, shown, out, lim, json, own, con, typ) {
  lim = ENVIRON["ROWS_LIMIT"] + 0
  json = (ENVIRON["ROWS_FORMAT"] == "json")
  own = ENVIRON["ROWS_OWNER"]
  con = ENVIRON["ROWS_CONTAINER"]
  typ = ENVIRON["ROWS_TYPE"]
  total = 0; shown = 0; out = ""
  for (i = 1; i <= NROWS; i++) {
    id = RKEY[i]
    if (id == "" || index(id, "/")) continue
    total++
    if (total > lim) continue
    shown++
    if (json) out = out (shown > 1 ? "," : "") "{\"module\":" jesc(own) ",\"container\":" jesc(con) ",\"type\":" jesc(typ) ",\"id\":" jesc(id) ",\"address\":" jesc(own "#" id) ",\"snippet\":" jesc(RSNIP[i]) ",\"read\":" jesc("ctx " own " get " id) "}"
    else out = out "  " typ " " own "#" id ": " RSNIP[i] "\n"
  }
  if (json) { printf "{\"query\":%s,\"mode\":\"exact\",\"total\":%d,\"rows\":[%s]}\n", jesc(ENVIRON["ROWS_QUERY"]), total, out; return }
  printf "search \"%s\": %d %s, %d shown\n%s", ENVIRON["ROWS_QUERY"], total, (total == 1 ? "match" : "matches"), shown, out
  print "read one: ctx " own " get <id> (the address after " own "#)"
}
