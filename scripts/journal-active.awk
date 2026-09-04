#!/usr/bin/awk -f
# journal-active.awk: Stream unclosed journal entries with complete bodies
# Usage: awk -f scripts/journal-active.awk sessions/<unit>/journal.md sessions/<unit>/journal.md
# Or:    ./scripts/journal-active.awk sessions/<unit>/journal.md sessions/<unit>/journal.md

# PASS 1: collect closed and superseded slugs
NR == FNR {
  if ($1 == "CLOSES:" || $1 == "SUPERSEDES:") {
    line = $0
    sub(/^.*(CLOSES|SUPERSEDES):[ \t]*/, "", line)
    sub(/[ \t]+-[ \t]+.*$/, "", line)
    sub(/[ \t]+\(.*$/, "", line)
    n = split(line, words, /[ \t]+/)
    for (i = 1; i <= n; i++) {
      if (words[i] ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) {
        closed[words[i]] = 1
      }
    }
  }
  next
}

# PASS 2: stream unclosed entry bodies
/^@entry / {
  slug = $2
  printing = !(slug in closed)
}

/^@anchor / {
  printing = 0
}

printing {
  print
}
