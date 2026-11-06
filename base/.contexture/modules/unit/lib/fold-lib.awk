function ld(line,   c, p, v) {
  if (!match(line, /[=:#]/)) return
  p = substr(line, 1, RSTART - 1)
  c = substr(line, RSTART, 1)
  v = substr(line, RSTART + 1)
  V[p] = v
  if (c == "=") T[p] = "s"
  else if (c == "#") T[p] = "a"
  else if (v == "null") T[p] = "z"
  else if (v == "true" || v == "false") T[p] = "b"
  else T[p] = "n"
}
function sv(p) { return !(p in T) || T[p] == "z" ? "" : unesc(V[p]) }
function unesc(v,   n, A, i, o) {
  if (index(v, "\\") == 0) return v
  gsub(/\\\\/, "\034", v)
  gsub(/\\n/, "\n", v)
  gsub(/\\t/, "\t", v)
  gsub(/\\r/, "\r", v)
  if (index(v, "\034") == 0) return v
  n = split(v, A, /\034/)
  o = A[1]
  for (i = 2; i <= n; i++) o = o "\\" A[i]
  return o
}
