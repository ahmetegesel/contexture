# awkrepl.awk: the sub and gsub replacement strings of awk source that carry a backslash
# before a character other than a backslash or an ampersand. POSIX reads such a backslash
# as a literal one, but awk builds differ (Debian's busybox awk drops it, so a replacement
# "\\t" writes a bare t and "\\\"" a bare quote), so the shipped code escapes by splitting
# and joining with concatenation instead (the review lane si-e5, finding F3). Prints
# <file>:<line>: <the replacement literal> per hit; reads the files named on the command
# line, awk inside sh scripts included; a heuristic over one line: the call's first argument
# is a /regex/ or runs to the first comma, the second argument must open a string literal.
function hit(s,   i, c, n, v, esc) {
  # s starts at the opening quote of the literal; decode the source escapes into v
  v = ""; n = length(s); esc = 0
  for (i = 2; i <= n; i++) {
    c = substr(s, i, 1)
    if (esc && c ~ /[0-7]/) {
      # an octal escape is one byte, never a backslash: read up to three digits
      while (i < n && substr(s, i + 1, 1) ~ /[0-7]/ && esc < 3) { i++; esc++ }
      v = v "o"; esc = 0; continue
    }
    if (esc) { v = v (c == "\\" ? "\\" : (c == "\"" ? "\"" : (c == "n" ? "\n" : (c == "t" ? "\t" : (c == "r" ? "\r" : (c == "/" ? "/" : "\\" c)))))); esc = 0; continue }
    if (c == "\\") { esc = 1; continue }
    if (c == "\"") break
    v = v c
  }
  LIT = substr(s, 1, i)
  # the value: a backslash pair is one literal backslash, a backslash before & is a literal &;
  # a backslash before anything else is the unportable form
  n = length(v)
  for (i = 1; i <= n; i++) {
    c = substr(v, i, 1)
    if (c != "\\") continue
    if (i == n) return 1
    c = substr(v, i + 1, 1)
    if (c == "\\" || c == "&") { i++; continue }
    return 1
  }
  return 0
}
{
  line = $0
  while ((p = match(line, /(^|[^A-Za-z0-9_])g?sub\(/)) > 0) {
    rest = substr(line, RSTART + RLENGTH)
    line = rest
    if (substr(rest, 1, 1) == "/") {
      # skip the regex literal to its closing unescaped slash
      j = 2; n = length(rest)
      while (j <= n) { c = substr(rest, j, 1); if (c == "\\") { j += 2; continue } if (c == "/") break; j++ }
      rest = substr(rest, j + 1)
    } else {
      k = index(rest, ","); if (!k) continue
      rest = substr(rest, k)
    }
    sub(/^[ \t]*,[ \t]*/, "", rest)
    if (substr(rest, 1, 1) != "\"") continue
    if (hit(rest)) printf "%s:%d: %s\n", FILENAME, FNR, LIT
  }
}
