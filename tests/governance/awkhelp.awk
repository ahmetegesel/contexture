# awkhelp.awk: the shell case arms whose pattern names help, --help, or -h. The engine owns a
# sole -h or --help after every verb, and a bare help after a verb is its slot's value, so a
# verb script carries no help arm. Prints <file>:<line>: <the line> per arm and a closing line
# "files <n> arms <n>"; reads the files named on the command line; a heuristic over one line:
# each ;; separated segment that opens with a pattern list closed by ")" (a leading "(" and a
# leading "case <word> in" dropped) is split at "|", and an alternative equal to help, --help,
# or -h once its quotes are stripped counts.
function arm(seg,   p, pat, n, a, i, t) {
  sub(/^[ \t]+/, "", seg)
  if (seg ~ /^#/) return 0
  sub(/^case[ \t]+[^ \t]+[ \t]+in[ \t]+/, "", seg)
  p = index(seg, ")")
  if (!p) return 0
  pat = substr(seg, 1, p - 1)
  sub(/^\(/, "", pat)
  if (pat == "" || pat ~ /[ \t`(]/) return 0
  n = split(pat, a, /\|/)
  for (i = 1; i <= n; i++) {
    t = a[i]
    gsub(/["']/, "", t)
    if (t == "help" || t == "--help" || t == "-h") return 1
  }
  return 0
}
FNR == 1 { files++ }
{
  n = split($0, s, /;;/)
  for (i = 1; i <= n; i++) if (arm(s[i])) { arms++; print FILENAME ":" FNR ": " $0; break }
}
END { print "files " files + 0 " arms " arms + 0 }
