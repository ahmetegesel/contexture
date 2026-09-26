# closer(line, kind, lane): the closures rows of one CLOSES or SUPERSEDES line; the
# parse is identical to the board and the audit (cut at a spaced hyphen or a
# spaced open paren, split on whitespace, every date-slug token is a target); a line
# naming none still lands one row (target '') so export keeps its text; the verdict
# and reason come from the first parenthesized group; returns the first target.
# loaded ahead of an awk program that defines esc() and holds u, slug, ordinal, NR
function closer(line, kind, lane,   body, inner, verdict, reason, t, n, w, i, first) {
  body = line; sub(/^[ \t]*(CLOSES|SUPERSEDES):[ \t]*/, "", body)
  inner = ""; verdict = ""; reason = ""
  if (match(body, /\([^)]*\)/)) inner = substr(body, RSTART + 1, RLENGTH - 2)
  if (match(inner, /^[a-z]+:/)) {
    verdict = substr(inner, 1, RLENGTH - 1)
    reason = substr(inner, RLENGTH + 1); sub(/^[ \t]+/, "", reason)
  } else reason = inner
  t = body; sub(/[ \t]+-[ \t]+.*$/, "", t); sub(/[ \t]+\(.*$/, "", t)
  n = split(t, w, /[ \t]+/); first = ""
  for (i = 1; i <= n; i++) {
    if (w[i] !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) continue
    if (first == "") first = w[i]
    closure_row(lane, kind, w[i], verdict, reason, line)
  }
  if (first == "") closure_row(lane, kind, "", verdict, reason, line)
  return first
}
function closure_row(lane, kind, target, verdict, reason, raw) {
  printf "INSERT INTO closures (unit, lane_slug, entry_slug, entry_ordinal, kind, line_no, target_slug, verdict, reason, raw) VALUES ('%s', '%s', '%s', %d, '%s', %d, '%s', '%s', '%s', '%s');\n",
    esc(u), esc(lane), esc(slug), (ordinal == "" ? 1 : ordinal), kind, NR, esc(target), esc(verdict), esc(reason), esc(raw)
}
