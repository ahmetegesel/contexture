#!/usr/bin/awk -f
# session-stamp.awk: bump the session anchor and append the load receipt
# Usage: session.sh stamp <session-slug> "<attention>"
# Derives A<N> from state.md, rewrites current_anchor to A<N+1> through a
# same-directory temp plus mv, appends the anchor line to journal.md, and
# prints the transition. Malformed state, an empty, whitespace-only, or
# newline-carrying attention refuses loudly rc=1 with no partial write.

function usage() {
  print "Usage: session.sh stamp <session-slug> \"<attention>\"" > "/dev/stderr"
  print "help: .contexture/scripts/session.sh help" > "/dev/stderr"
  exit 1
}

function fail(msg) {
  print msg > "/dev/stderr"
  exit 1
}

function exists(path,   t, r) {
  r = (getline t < path)
  if (r >= 0) close(path)
  return (r >= 0)
}

BEGIN {
  if (ARGC != 3) usage()
  slug = ARGV[1]
  if (slug !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) usage()
  attention = ARGV[2]
  if (attention == "") fail("ERROR: empty attention")
  if (index(attention, "\n") > 0) fail("ERROR: embedded newline in attention")
  if (attention ~ /^[ \t\r]+$/) fail("ERROR: whitespace-only attention")

  dir = ".contexture/sessions/" slug "/"
  state = dir "state.md"
  journal = dir "journal.md"
  if (!exists(state)) fail("ERROR: missing state: " state)

  n = 0
  status = ""
  anchor = ""
  while ((getline line < state) > 0) {
    n++
    lines[n] = line
    if (line ~ /^status:[ \t]*/) {
      status = line
      sub(/^status:[ \t]*/, "", status)
      sub(/[ \t]+$/, "", status)
    }
    if (line ~ /^current_anchor:[ \t]*/) {
      anchor = line
      sub(/^current_anchor:[ \t]*/, "", anchor)
      sub(/[ \t]+$/, "", anchor)
    }
  }
  close(state)
  if (n == 0) fail("ERROR: missing state: " state)
  if (status != "ACTIVE") fail("ERROR: status is not ACTIVE: [" status "]")
  if (anchor !~ /^A[0-9]+$/) fail("ERROR: malformed current_anchor: [" anchor "]")
  N = substr(anchor, 2) + 0

  tmp = state ".tmp"
  for (i = 1; i <= n; i++) {
    if (lines[i] ~ /^current_anchor:[ \t]*/) {
      print "current_anchor: A" (N + 1) > tmp
    } else {
      print lines[i] > tmp
    }
  }
  close(tmp)
  rc = system("mv \"" tmp "\" \"" state "\"")
  if (rc != 0) fail("ERROR: mv failed rc=" rc)

  print "@anchor A" (N + 1) " (\"continues A" N "\", attention: " attention ")" >> journal
  close(journal)
  print "transition: A" N " -> A" (N + 1)
  exit 0
}
