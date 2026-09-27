# jflat.awk: a POSIX awk JSON reader for the storage contract tests (contract 2).
#
# mode=flat (the default): every input line is one JSON text; for each line it prints
#   @=<container summary of the root>
#   <path>=<token>            one line per value, in document order for scalars
#   <path>=[N]                an array of N elements (printed after its elements)
#   <path>={k1,k2,...}        an object with its keys in order (printed after its members)
# paths join object keys with "." and array positions with ".<n>" (1 based); a scalar
# token is printed exactly as it stands in the JSON text (a string keeps its quotes and
# escapes), so an assertion compares the JSON literal. With lineno=1 every output line is
# prefixed "<input line number>:". A line that is not one JSON value prints
#   !error=<column>:<what>
# and a line holding whitespace between tokens prints "!spaced=1" (the contract's answer
# is compact: no insignificant whitespace).
#
# mode=dec: every input line is one JSON string token (quotes included); it prints the
# decoded bytes with no newline added (the lines of a multi-line input are decoded one
# after another). Escapes: \" \\ \/ \b \f \n \r \t and \u00XX below 0x80; any other
# \u escape is a decode error (exit 3), since the contract writes every non-ASCII
# character raw (docs/the-engine.md, the JSON form).
#
# BWK awk, mawk, gawk, and busybox awk: no gensub, no length(array), no \x escapes in
# regexes; a backslash is doubled by concatenation, never by a gsub replacement.

function jerr(what) {
  if (ERR == "") ERR = P ":" what
}

function skipws(   c) {
  while (P <= N) {
    c = substr(S, P, 1)
    if (c == " " || c == "\t" || c == "\r" || c == "\n") { SPACED = 1; P++ } else break
  }
}

# value(path): parses one value at P, prints its lines, returns 1 on success
function value(path,   c, tok, rest) {
  skipws()
  if (P > N) { jerr("unexpected end"); return 0 }
  c = substr(S, P, 1)
  if (c == "{") return object(path)
  if (c == "[") return array(path)
  rest = substr(S, P)
  if (c == "\"") {
    if (!match(rest, /^"([^"\\]|\\.)*"/)) { jerr("unterminated string"); return 0 }
  } else if (!match(rest, /^(true|false|null|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?)/)) {
    jerr("bad token"); return 0
  }
  tok = substr(rest, 1, RLENGTH)
  if (c == "\"" && tok ~ /[\001-\037]/) { jerr("raw control character in string"); return 0 }
  P += RLENGTH
  emit(path, tok)
  return 1
}

function emit(path, tok) {
  if (path == "") path = "@"
  printf "%s%s=%s\n", PFX, path, tok
}

function child(path, k) {
  return (path == "") ? k : path "." k
}

function object(path,   keys, k, rest, n) {
  P++
  keys = ""
  n = 0
  skipws()
  if (substr(S, P, 1) == "}") { P++; emit(path, "{}"); return 1 }
  while (1) {
    skipws()
    rest = substr(S, P)
    if (!match(rest, /^"([^"\\]|\\.)*"/)) { jerr("expected a key"); return 0 }
    k = substr(rest, 2, RLENGTH - 2)
    P += RLENGTH
    skipws()
    if (substr(S, P, 1) != ":") { jerr("expected a colon"); return 0 }
    P++
    if (!value(child(path, k))) return 0
    keys = keys (n ? "," : "") k
    n++
    skipws()
    c = substr(S, P, 1)
    if (c == ",") { P++; continue }
    if (c == "}") { P++; break }
    jerr("expected a comma or a closing brace")
    return 0
  }
  emit(path, "{" keys "}")
  return 1
}

function array(path,   n, c) {
  P++
  n = 0
  skipws()
  if (substr(S, P, 1) == "]") { P++; emit(path, "[0]"); return 1 }
  while (1) {
    n++
    if (!value(child(path, n))) return 0
    skipws()
    c = substr(S, P, 1)
    if (c == ",") { P++; continue }
    if (c == "]") { P++; break }
    jerr("expected a comma or a closing bracket")
    return 0
  }
  emit(path, "[" n "]")
  return 1
}

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

# decode(tok) prints the bytes of a string token as it goes (a 2 MB document decodes in
# one pass: the token splits on its backslashes, each piece after one starting with
# the escape letter; an empty piece is an escaped backslash whose next piece is text)
function decode(tok,   A, n, i, p, e, v) {
  if (tok !~ /^".*"$/) { DECERR = 1; return }
  tok = substr(tok, 2, length(tok) - 2)
  n = split(tok, A, /\\/)
  if (n == 0) return
  printf "%s", A[1]
  i = 2
  while (i <= n) {
    p = A[i]
    if (p == "") {
      if (i == n) { DECERR = 1; return }
      printf "\\%s", A[i + 1]
      i += 2
      continue
    }
    e = substr(p, 1, 1)
    p = substr(p, 2)
    if (e == "\"") printf "\"%s", p
    else if (e == "/") printf "/%s", p
    else if (e == "b") printf "%c%s", 8, p
    else if (e == "f") printf "%c%s", 12, p
    else if (e == "n") printf "\n%s", p
    else if (e == "r") printf "\r%s", p
    else if (e == "t") printf "\t%s", p
    else if (e == "u") {
      v = hexval(substr(p, 1, 4))
      if (v < 0 || v >= 128 || length(p) < 4) { DECERR = 1; return }
      printf "%c%s", v, substr(p, 5)
    } else { DECERR = 1; return }
    i++
  }
}

BEGIN {
  if (mode == "") mode = "flat"
  DECERR = 0
}

mode == "dec" {
  decode($0)
  if (DECERR) exit 3
  next
}

{
  S = $0
  N = length(S)
  P = 1
  ERR = ""
  SPACED = 0
  PFX = (lineno == 1) ? NR ":" : ""
  if (value("")) {
    skipws()
    if (P <= N) jerr("trailing text")
  }
  if (ERR != "") printf "%s!error=%s\n", PFX, ERR
  if (SPACED) printf "%s!spaced=1\n", PFX
}

END {
  if (mode == "dec" && DECERR) exit 3
}
