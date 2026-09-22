#!/usr/bin/awk -f
# session-bootstrap.awk: create a fresh session unit and fold its first anchor
# Usage: session.sh bootstrap <slug> "<objective>" [<repos>]
# Validates every argument before any filesystem write; creates
# .contexture/sessions/<slug>/ with state.md at A0, the three empty
# artifacts, appends the folded A1 receipt to journal.md, and rewrites
# current_anchor to A1 through a same-directory temp plus mv. Prints the
# final state and "next: declare the first task". The state grammar cannot
# carry brackets or quotes in repos, or quotes in the objective: those
# values are refused naming the character. Any refusal exits rc=1 with zero
# partial writes.

function usage() {
  print "Usage: session.sh bootstrap <slug> \"<objective>\" [<repos>]" > "/dev/stderr"
  print "help: ctx session help" > "/dev/stderr"
  exit 1
}

function fail(msg) {
  print msg > "/dev/stderr"
  exit 1
}

function gitstate(   tag, cmd, line, rc, first) {
  tag = "session-bootstrap-git-rc"
  cmd = "git -C . status -sb 2>/dev/null; echo \"" tag "=$?\""
  rc = ""
  first = ""
  while ((cmd | getline line) > 0) {
    if (line ~ ("^" tag "=[0-9]+$")) {
      rc = substr(line, length(tag) + 2)
      continue
    }
    if (first == "") first = line
  }
  close(cmd)
  if (rc != "0" || first == "") return "none"
  sub(/^##[ \t]*/, "", first)
  if (first == "") return "none"
  return first
}

function write_state(path, anchor,   tmp) {
  tmp = path ".tmp"
  print "status: ACTIVE" > tmp
  print "current_anchor: " anchor > tmp
  print "next_action: \"backlog the first task\"" > tmp
  print "objective: \"" objective "\"" > tmp
  print "repos: [" repos "]" > tmp
  close(tmp)
  if (system("mv \"" tmp "\" \"" path "\"") != 0) fail("ERROR: mv failed: " path)
}

function touch(path) {
  if (system(": > \"" path "\"") != 0) fail("ERROR: cannot create: " path)
}

BEGIN {
  if (ARGC < 3 || ARGC > 4) usage()
  slug = ARGV[1]
  if (slug !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) usage()
  objective = ARGV[2]
  if (objective == "") fail("ERROR: empty objective")
  if (index(objective, "\n") > 0) fail("ERROR: embedded newline in objective")
  if (objective ~ /^[ \t\r]+$/) fail("ERROR: whitespace-only objective")
  if (objective ~ /["']/) fail("ERROR: quote in objective: " substr(objective, match(objective, /["']/), 1))
  repos = ""
  if (ARGC == 4) {
    repos = ARGV[3]
    if (index(repos, "\n") > 0) fail("ERROR: embedded newline in repos")
    if (repos ~ /^[ \t\r]+$/) repos = ""
    if (repos ~ /[][]/) fail("ERROR: bracket in repos: " substr(repos, match(repos, /[][]/), 1))
    if (repos ~ /["']/) fail("ERROR: quote in repos: " substr(repos, match(repos, /["']/), 1))
  }

  dir = ".contexture/sessions/" slug
  if (system("test -e \"" dir "\"") == 0) fail("ERROR: session exists: " dir)

  state = dir "/state.md"
  journal = dir "/journal.md"
  backlog = dir "/backlog.md"
  knowledge = dir "/knowledge.md"

  if (system("mkdir -p \"" dir "\"") != 0) fail("ERROR: mkdir failed: " dir)

  write_state(state, "A0")

  touch(backlog)
  touch(knowledge)
  touch(journal)

  attention = "fresh unit; objective: " objective "; git: " gitstate()
  print "@anchor A1 (\"continues A0\", attention: " attention ")" >> journal
  close(journal)

  write_state(state, "A1")

  while ((getline line < state) > 0) print line
  close(state)
  print "next: declare the first task"
  exit 0
}
