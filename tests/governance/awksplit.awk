# awksplit.awk: the split calls of awk source whose separator is a string literal of one
# character other than a single space or a newline. BWK awk splits a value at its newlines
# too under such a separator, while gawk, mawk, and busybox awk split at the character alone,
# so the shipped code writes the separator as a regex; a single space is the default field
# splitting and a newline splits alike on every awk. Prints <file>:<line>: <the literal> per
# hit; reads the files named on the command line, awk inside sh scripts included (the sh
# quote escape '\'' read as one quote); a heuristic over one line: the third argument runs to
# its depth 0 comma or closing paren, and only an argument that is one string literal counts.
function to(s, j, q,   n, c) {
  # the index of the q closing the literal that opens at j, else 0
  n = length(s)
  for (j++; j <= n; j++) {
    c = substr(s, j, 1)
    if (c == "\\") j++
    else if (c == q) return j
  }
  return 0
}
function third(s, j,   n, c, k, na, depth, a) {
  n = length(s); na = 1; depth = 0; a = ""
  for (; j <= n; j++) {
    c = substr(s, j, 1)
    if (c == "\"" || (c == "/" && a ~ /^[ \t]*$/)) {
      k = to(s, j, c); if (!k) k = n
      a = a substr(s, j, k - j + 1); j = k; continue
    }
    if (c == "(" || c == "[") depth++
    else if (c == ")" || c == "]") { if (!depth) break; depth-- }
    else if (c == "," && !depth) { if (na == 3) break; na++; a = ""; continue }
    a = a c
  }
  return na == 3 ? a : ""
}
function one(s,   b, v, i) {
  if (s !~ /^"/ || to(s, 1, "\"") != length(s)) return 0
  b = substr(s, 2, length(s) - 2)
  gsub(/'\\''/, "'", b)
  if (b ~ /^\\[0-7][0-7]?[0-7]?$/) {
    for (i = 2; i <= length(b); i++) v = v * 8 + substr(b, i, 1)
    return v != 10 && v != 32
  }
  if (b ~ /^\\[\\"abfrtv]$/ || b == "\\/") return 1
  return length(b) == 1 && b != " "
}
{
  line = $0; pos = 1
  while ((k = index(substr(line, pos), "split(")) > 0) {
    s = pos + k - 1; pos = s + 6
    if (s > 1 && substr(line, s - 1, 1) ~ /[A-Za-z0-9_.]/) continue
    a = third(line, pos)
    sub(/^[ \t]+/, "", a); sub(/[ \t]+$/, "", a)
    if (one(a)) printf "%s:%d: %s\n", FILENAME, FNR, a
  }
}
