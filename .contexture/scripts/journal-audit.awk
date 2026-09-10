#!/usr/bin/awk -f
# journal-audit.awk: Audit closures and entry grammar, print the open thread tail
# Usage: awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md
# Or:    ./.contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md
# The repair instrument: fix what it flags, fill what is missing.
# Exits 1 on: dangling closers, slugless closers, dateless entry slugs, inline
# markers on @entry lines - each flagged with its line number.
# Open threads (THREAD: true entries with no closer) print beside the audit;
# the tail is a display, never an enforcement: a thread paused stays open.

/^@entry / {
  entries[$2] = 1
  last_entry = $2
  if ($2 !~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) {
    print "DATELESS SLUG at line " NR ": " $2
    bad++
  }
  if ($0 ~ /\[(THREAD|KNOWLEDGE):/) {
    print "INLINE MARKER at line " NR ": " $2
    bad++
  }
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
  found = 0
  for (i = 1; i <= n; i++) {
    if (words[i] ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) {
      targets[words[i]] = NR
      closed[words[i]] = 1
      found = 1
    }
  }
  if (found == 0) {
    print "SLUGLESS CLOSER at line " NR ": no valid date-slug target"
    bad++
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
  if (bad > 0 || dangling_count > 0) {
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
