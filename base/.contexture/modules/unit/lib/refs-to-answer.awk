# refs-to-answer.awk: the session.refs_to answer from the ref_sessions referrers (the first
# file, one unit per line) and the REF value rows (the second, "<unit><TAB><kind><TAB><id>
# <TAB><ref>"): {"unit":<target>,"referrers":[...],"rows":[{"unit","kind","id","ref"}...]}.
# The environment: RA_TARGET the target. A value's backslash and double quote are escaped by
# splitting and rejoining, never through a replacement (modules-r8).

function esc(s,   n, p, o, i) {
  n = split(s, p, /\\/)
  o = p[1]
  for (i = 2; i <= n; i++) o = o "\\" "\\" p[i]
  n = split(o, p, /"/)
  o = p[1]
  for (i = 2; i <= n; i++) o = o "\\" "\"" p[i]
  return "\"" o "\""
}

FILENAME == ARGV[1] { if ($0 != "") S[++ns] = $0; next }

{
  split($0, F, /\t/)
  nr++
  RU[nr] = F[1]; RK[nr] = F[2]; RI[nr] = F[3]; RR[nr] = F[4]
}

END {
  printf "{\"unit\":%s,\"referrers\":[", esc(ENVIRON["RA_TARGET"])
  for (i = 1; i <= ns; i++) printf "%s%s", (i > 1 ? "," : ""), esc(S[i])
  printf "],\"rows\":["
  for (i = 1; i <= nr; i++) printf "%s{\"unit\":%s,\"kind\":%s,\"id\":%s,\"ref\":%s}", (i > 1 ? "," : ""), esc(RU[i]), esc(RK[i]), esc(RI[i]), esc(RR[i])
  printf "]}\n"
}
