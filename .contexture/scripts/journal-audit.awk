#!/usr/bin/awk -f
# journal-audit.awk: Audit closures and entry grammar, print the open thread tail
# Usage: awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md
# Or:    ./.contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md
# The repair instrument: fix what it flags, fill what is missing.
# Exits 1 on: dangling closers, slugless closers, dateless entry slugs, inline
# markers on @entry lines, bracketed field lines (the [FIELD: literal-copy
# form), unharvested KNOWLEDGE flags (with line), DONE tasks without their
# backlog/<slug>: DONE event, IN_PROGRESS tasks absent from state.md; each
# flagged by slug (the knowledge flag and the bracketed field also by line).
# Session checks: backlog.md and state.md are derived from the journal's folder;
# a sibling that cannot be read skips its check quietly: lane journals are
# unaffected. Open threads (THREAD: true entries with no closer) print beside
# the audit; the tail is a display, never an enforcement: a thread paused stays
# open.

BEGIN {
  n = split(ARGV[1], parts, "/")
  dir = ""
  for (i = 1; i < n; i++) dir = dir parts[i] "/"
  backlogs = dir "backlog.md"
  states = dir "state.md"
}

/^@entry / {
  entries[$2] = 1
  entry_line[$2] = NR
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

/^  \[(THREAD|KNOWLEDGE|GROUP|REF|CLOSES|SUPERSEDES):/ {
  print "BRACKETED FIELD at line " NR ": " substr($0, 3)
  bad++
}

/^  THREAD: true[ \t]*$/ {
  threaded[NR] = last_entry
}

/^  KNOWLEDGE: true[ \t]*$/ {
  knowledge[last_entry] = entry_line[last_entry]
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

{ jtext = jtext "\n" $0 }

END {
  dangling_count = 0
  for (t in targets) {
    if (!(t in entries)) {
      print "DANGLING CLOSER at line " targets[t] ": " t
      dangling_count++
    }
  }

  for (e in knowledge) {
    if (!(e in closed)) {
      print "UNHARVESTED KNOWLEDGE at line " knowledge[e] ": " e
      bad++
    }
  }

  bloaded = 0
  while ((getline line < backlogs) > 0) {
    bloaded = 1
    if (line ~ /^@task[ \t]/) {
      cur = line
      sub(/^@task[ \t]+/, "", cur)
      sub(/[ \t]+.*$/, "", cur)
    } else if (line ~ /^  STATUS:[ \t]/) {
      st = line
      sub(/^  STATUS:[ \t]+/, "", st)
      sub(/[ \t]+.*$/, "", st)
      if (cur != "") {
        if (st == "DONE") done[cur] = 1
        else if (st == "IN_PROGRESS") inp[cur] = 1
      }
    }
  }
  close(backlogs)

  sloaded = 0
  statetext = ""
  while ((getline line < states) > 0) {
    sloaded = 1
    statetext = statetext " " line
  }
  close(states)

  if (bloaded) {
    for (t in done) {
      if (index(jtext, "backlog/" t ": DONE") == 0) {
        print "DONE WITHOUT EVENT (backlog/" t ": DONE): " t
        bad++
      }
    }
  }
  if (sloaded) {
    for (t in inp) {
      if (index(statetext, t) == 0) {
        print "IN_PROGRESS ABSENT FROM STATE: " t
        bad++
      }
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
