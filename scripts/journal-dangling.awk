#!/usr/bin/awk -f
# journal-dangling.awk: Audit closures to verify every target slug resolves to a real entry
# Usage: awk -f scripts/journal-dangling.awk sessions/<unit>/journal.md
# Or:    ./scripts/journal-dangling.awk sessions/<unit>/journal.md

/^@entry / {
  entries[$2] = 1
}

$1 == "CLOSES:" || $1 == "SUPERSEDES:" {
  line = $0
  sub(/^.*(CLOSES|SUPERSEDES):[ \t]*/, "", line)
  sub(/[ \t]+-[ \t]+.*$/, "", line)
  sub(/[ \t]+\(.*$/, "", line)
  n = split(line, words, /[ \t]+/)
  for (i = 1; i <= n; i++) {
    if (words[i] ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) {
      targets[words[i]] = NR
    }
  }
}

END {
  dangling_count = 0
  for (t in targets) {
    if (!(t in entries)) {
      print "DANGLING CLOSER at line " targets[t] ": " t
      dangling_count++
    }
  }
  if (dangling_count > 0) {
    exit 1
  }
}
