# json.awk: the one JSON flattener of base (contract 2, docs/the-engine.md, The wire).
#
# A storage function answers one compact JSON object; base decodes it here, once, into
# path lines, and every renderer (lib/render.awk) reads those lines; no verb greps JSON.
#
# Input: the answer on stdin (one JSON text; lines are joined with a newline, which JSON
# reads as whitespace). Output, one line per value, in document order:
#   <path>=<value>     a string; the value in the payload escape form of the wire
#                      (backslash, newline, tab, carriage return as \\, \n, \t, \r), every
#                      other byte raw, so a line never breaks inside a value
#   <path>:<token>     null, true, false, or a number, exactly as the JSON writes it
#   <path>#<n>         an array of n elements (printed after its elements)
# A path joins object keys with "." and array positions (1 based) with "."; the root
# object's keys stand alone. Keys are contract identifiers ([A-Za-z0-9_]), so the first
# "=", ":", or "#" of a line ends its path.
#
# The walk is linear in the answer's size: the text splits on its double quotes, a piece
# ending in an odd run of backslashes continues its string (the quote was escaped), and a
# string streams out piece by piece, so a 2 MB document never meets a quadratic copy. The
# JSON escapes map onto the payload form: \\ \n \t \r stay as they are, \" and \/ lose
# their backslash, \b \f and \u00XX (below 0x80) become their bytes (a newline, tab,
# carriage return, or backslash by \u becomes its payload escape). A malformed answer
# exits 2 with one stderr line.
#
# BWK awk, mawk, gawk, and busybox awk: no gensub, no length(array); a backslash is never
# produced by a gsub replacement.

function jfail(what) {
  printf "json.awk: error: malformed storage answer: %s\n", what > "/dev/stderr"
  JBAD = 1
  exit 2
}

function hexval(h,   i, v, c) {
  v = 0
  h = tolower(h)
  if (length(h) != 4) return -1
  for (i = 1; i <= 4; i++) {
    c = index("0123456789abcdef", substr(h, i, 1))
    if (c == 0) return -1
    v = v * 16 + c - 1
  }
  return v
}

# conv(c): prints the string chunk c in the payload form; every backslash of c starts a
# complete JSON escape
function conv(c,   A, m, k, p, e, rest, v) {
  if (index(c, "\\") == 0) { printf "%s", c; return }
  m = split(c, A, /\\/)
  printf "%s", A[1]
  k = 2
  while (k <= m) {
    p = A[k]
    if (p == "") {
      if (k == m) jfail("a dangling backslash")
      printf "\\\\%s", A[k + 1]
      k += 2
      continue
    }
    e = substr(p, 1, 1)
    rest = substr(p, 2)
    if (e == "n" || e == "t" || e == "r") printf "\\%s%s", e, rest
    else if (e == "/") printf "/%s", rest
    else if (e == "b") printf "%c%s", 8, rest
    else if (e == "f") printf "%c%s", 12, rest
    else if (e == "u") {
      v = hexval(substr(rest, 1, 4))
      if (v < 1 || v >= 128) jfail("a \\u escape outside 0x01 to 0x7f")
      rest = substr(rest, 5)
      if (v == 10) printf "\\n%s", rest
      else if (v == 9) printf "\\t%s", rest
      else if (v == 13) printf "\\r%s", rest
      else if (v == 92) printf "\\\\%s", rest
      else printf "%c%s", v, rest
    } else jfail("an unknown escape \\" e)
    k++
  }
}

# oddtail(s): 1 when s ends with an odd run of backslashes
function oddtail(s,   n) {
  n = 0
  while (n < length(s) && substr(s, length(s) - n, 1) == "\\") n++
  return n % 2
}

# valpath(): the path of the value that starts now at the current depth
function valpath(   p) {
  if (D == 0) return ""
  if (TY[D] == "o") {
    p = KEY[D]
    return (PATH[D] == "") ? p : PATH[D] "." p
  }
  IDX[D]++
  return (PATH[D] == "") ? IDX[D] : PATH[D] "." IDX[D]
}

function flush_lit(   vp) {
  if (LIT == "") return
  if (LIT !~ /^(null|true|false|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?)$/) jfail("a bad token '" LIT "'")
  vp = valpath()
  printf "%s:%s\n", vp, LIT
  LIT = ""
}

# outside(t): the structural text between two strings
function outside(t,   i, n, c, vp) {
  n = length(t)
  for (i = 1; i <= n; i++) {
    c = substr(t, i, 1)
    if (c == "{" || c == "[") {
      if (LIT != "") jfail("a token before a container")
      vp = valpath()
      D++
      TY[D] = (c == "{") ? "o" : "a"
      PATH[D] = vp
      IDX[D] = 0
      KEY[D] = ""
      EXPK[D] = (c == "{") ? 1 : 0
    } else if (c == "}" || c == "]") {
      flush_lit()
      if (D == 0) jfail("an unbalanced close")
      if (TY[D] == "a") printf "%s#%d\n", PATH[D], IDX[D]
      D--
    } else if (c == ":") {
      if (D == 0 || TY[D] != "o") jfail("a colon outside an object")
      EXPK[D] = 0
    } else if (c == ",") {
      flush_lit()
      if (D > 0 && TY[D] == "o") EXPK[D] = 1
    } else if (c == " " || c == "\t" || c == "\n" || c == "\r") {
      flush_lit()
    } else {
      LIT = LIT c
    }
  }
}

BEGIN {
  S = ""
  first = 1
  while ((getline line) > 0) {
    S = first ? line : S "\n" line
    first = 0
  }
  if (first) jfail("an empty answer")
  n = split(S, P, /"/)
  D = 0
  LIT = ""
  outside(P[1])
  i = 2
  while (i <= n) {
    # a string: pieces i..j, each but the last ending in an escaped quote
    j = i
    while (j < n && oddtail(P[j])) j++
    # j == n: no quote follows the last piece, so the text ended inside a string
    if (j == n) jfail("an unterminated string")
    if (D > 0 && TY[D] == "o" && EXPK[D]) {
      k = ""
      for (q = i; q <= j; q++) k = k ((q < j) ? substr(P[q], 1, length(P[q]) - 1) "\"" : P[q])
      KEY[D] = k
    } else {
      if (LIT != "") jfail("a token before a string")
      vp = valpath()
      printf "%s=", vp
      for (q = i; q <= j; q++) {
        if (q < j) { conv(substr(P[q], 1, length(P[q]) - 1)); printf "\"" }
        else conv(P[q])
      }
      printf "\n"
    }
    i = j + 1
    if (i <= n) outside(P[i])
    else jfail("an unterminated string")
    i++
  }
  flush_lit()
  if (D != 0) jfail("an unclosed container")
  exit 0
}
