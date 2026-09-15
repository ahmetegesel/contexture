#!/usr/bin/awk -f
# session-board.awk: the live board: unclosed journal entries with complete
# bodies, then the open task slugs with their closing nudge
# Usage: session.sh board <session-slug>
# One form: the slug resolves .contexture/sessions/<slug>/{journal,backlog}.md.
# A path, extra arguments, and the retired refs flags are refused rc=1
# with a usage line. Missing journal is fatal rc=1 with zero stdout;
# missing backlog is loud on stderr, nonfatal: the opener reads
# "no backlog" and no tail prints.

function usage() {
  print "Usage: session.sh board <session-slug>" > "/dev/stderr"
  print "help: .contexture/scripts/session.sh help" > "/dev/stderr"
  exit 1
}

function process_journal(journal_path,   test_line, test_ret, line, words, n, i, closed, printing, slug) {
  test_line = ""
  test_ret = (getline test_line < journal_path)
  if (test_ret < 0) {
    print "ERROR: journal file not found: " journal_path > "/dev/stderr"
    exit 1
  }
  close(journal_path)

  # Pass 1: collect closed and superseded slugs
  while ((getline line < journal_path) > 0) {
    if (line ~ /^[ \t]*(CLOSES|SUPERSEDES):/) {
      sub(/^[ \t]*(CLOSES|SUPERSEDES):[ \t]*/, "", line)
      sub(/[ \t]+-[ \t]+.*$/, "", line)
      sub(/[ \t]+\(.*$/, "", line)
      n = split(line, words, /[ \t]+/)
      for (i = 1; i <= n; i++) {
        if (words[i] ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) {
          closed[words[i]] = 1
        }
      }
    }
  }
  close(journal_path)

  # Pass 2: buffer the unclosed entry bodies and count them
  printing = 0
  while ((getline line < journal_path) > 0) {
    if (line ~ /^@entry /) {
      n = split(line, words, /[ \t]+/)
      slug = words[2]
      printing = !(slug in closed)
      if (printing) live++
    } else if (line ~ /^@anchor /) {
      printing = 0
    }
    if (printing) {
      nbuf++
      buf[nbuf] = line
    }
  }
  close(journal_path)
}

function collect_open_tasks(backlog_path,   line, cur, st, i) {
  while ((getline line < backlog_path) > 0) {
    if (line ~ /^@task[ \t]/) {
      cur = line
      sub(/^@task[ \t]+/, "", cur)
      sub(/[ \t]+.*$/, "", cur)
      ntasks++
      task[ntasks] = cur
      status[ntasks] = ""
    } else if (line ~ /^  STATUS:[ \t]/) {
      if (ntasks > 0 && status[ntasks] == "") {
        st = line
        sub(/^  STATUS:[ \t]+/, "", st)
        sub(/[ \t]+.*$/, "", st)
        status[ntasks] = st
      }
    }
  }
  close(backlog_path)
  for (i = 1; i <= ntasks; i++) {
    if (status[i] != "DONE") {
      nopen++
      openslug[nopen] = task[i]
    }
  }
}

BEGIN {
  if (ARGC != 2 || refs != "" || refs_only != "") usage()
  slug = ARGV[1]
  if (slug !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) usage()
  dir = ".contexture/sessions/" slug "/"
  journal = dir "journal.md"
  backlog = dir "backlog.md"

  process_journal(journal)

  has_backlog = 0
  test_line = ""
  if ((getline test_line < backlog) >= 0) {
    has_backlog = 1
    close(backlog)
  }

  if (has_backlog) {
    collect_open_tasks(backlog)
  } else {
    print "WARNING: missing backlog: " backlog > "/dev/stderr"
  }

  lives = (live == 1) ? "entry" : "entries"
  if (has_backlog) {
    opens = (nopen == 1) ? "task" : "tasks"
    printf "board %s: %d live %s, %d open %s\n", slug, live, lives, nopen, opens
  } else {
    printf "board %s: %d live %s, no backlog\n", slug, live, lives
  }

  if (nbuf > 0) {
    print ""
    for (i = 1; i <= nbuf; i++) print buf[i]
  }

  if (nopen > 0) {
    print ""
    print "OPEN TASKS"
    for (i = 1; i <= nopen; i++) print "  " openslug[i]
    print "the entries say what happened; these say what remains"
  }
  exit 0
}
