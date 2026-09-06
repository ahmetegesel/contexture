#!/usr/bin/awk -f
# journal-dangling.awk: Audit closures and print the open thread tail
# Usage: awk -f scripts/journal-dangling.awk sessions/<unit>/journal.md
# Or:    ./scripts/journal-dangling.awk sessions/<unit>/journal.md
# Dangling closers (a CLOSES/SUPERSEDES slug naming no @entry) exit 1.
# Open threads (THREAD: true entries with no closer) print beside the audit;
# the tail is a display, never an enforcement: a thread paused stays open.

/^@entry / {
  entries[$2] = 1
  last_entry = $2
}

/^  THREAD: true[ \t]*$/ {
  threaded[NR] = last_entry
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
      closed[words[i]] = 1
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
  tail = 0
  for (l = 1; l <= NR; l++) {
    if (l in threaded && !(threaded[l] in closed)) {
      if (tail == 0) {
        print "OPEN THREADS (awaiting resolution):"
      }
      print "  line " l ": " threaded[l]
      tail++
    }
  }
  if (tail == 0) {
    print "open threads: none"
  }
}
