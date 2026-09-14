#!/usr/bin/awk -f
# journal-active.awk: Stream unclosed journal entries with complete bodies
# Usage: .contexture/scripts/journal-active.awk <session-slug>
# One form: the slug resolves to .contexture/sessions/<slug>/journal.md.
# A path, extra arguments, and the retired refs flags are refused rc=1
# with a usage line.

function usage() {
  print "Usage: journal-active.awk <session-slug>" > "/dev/stderr"
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

  # Pass 2: stream unclosed entry bodies
  printing = 0
  while ((getline line < journal_path) > 0) {
    if (line ~ /^@entry /) {
      n = split(line, words, /[ \t]+/)
      slug = words[2]
      printing = !(slug in closed)
    } else if (line ~ /^@anchor /) {
      printing = 0
    }
    if (printing) {
      print line
    }
  }
  close(journal_path)
}

BEGIN {
  if (ARGC != 2 || refs != "" || refs_only != "") usage()
  slug = ARGV[1]
  if (slug !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) usage()
  journal = ".contexture/sessions/" slug "/journal.md"
  process_journal(journal)
  exit 0
}
