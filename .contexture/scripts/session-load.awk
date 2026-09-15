#!/usr/bin/awk -f
# session-load.awk: print the load map and one page of the session load
# Usage: .contexture/scripts/session-load.awk <session-slug> [<page>]
# Sections in BIOS order: state, backlog, knowledge, the live journal
# (composed from session-board.awk, one extraction home), declared
# ref_sessions read-only, then the write-scope trailer. Pages cut at
# block starts around 500 lines, never mid-body; read every page the
# map reports. Missing state is fatal rc=1 with zero stdout; missing
# backlog, knowledge, or journal is nonfatal: a WARNING on stderr and a
# placeholder line in its section.

function usage() {
  print "Usage: session-load.awk <session-slug> [<page>]" > "/dev/stderr"
  exit 1
}

function fail(msg) {
  print msg > "/dev/stderr"
  exit 1
}

function add(line, sec,   first) {
  total++
  L[total] = line
  S[total] = sec
  first = !(sec in secstart)
  if (first) {
    nsec++
    seclist[nsec] = sec
    secstart[sec] = total
  }
  secend[sec] = total
  B[total] = (first || line ~ /^@(entry|finding|task|anchor) /) ? 1 : 0
}

function exists(path,   t, r) {
  r = (getline t < path)
  if (r >= 0) close(path)
  return (r >= 0)
}

function read_whole(path, sec, empty_note,   line, n) {
  n = 0
  while ((getline line < path) > 0) {
    add(line, sec)
    n++
  }
  close(path)
  if (n == 0) add(empty_note, sec)
}

function compose_stream(slug_arg, sec,   helper, tag, cmd, line, n, rc) {
  helper = ".contexture/scripts/session-board.awk"
  tag = "session-load-helper-rc"
  cmd = helper " " slug_arg "; echo \"" tag "=$?\""
  n = 0
  rc = ""
  while ((cmd | getline line) > 0) {
    if (line ~ ("^" tag "=[0-9]+$")) {
      rc = substr(line, length(tag) + 2)
      continue
    }
    add(line, sec)
    n++
  }
  close(cmd)
  if (rc == "") fail("ERROR: could not determine " helper " exit status")
  if (rc != "0") fail("ERROR: " helper " failed rc=" rc " for " slug_arg)
  if (n == 0) add("(no active entries)", sec)
}

function warn_missing(artifact, path) {
  print "WARNING: missing " artifact ": " path > "/dev/stderr"
}

BEGIN {
  if (ARGC < 2 || ARGC > 3) usage()
  slug = ARGV[1]
  if (slug !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) usage()
  page = 1
  if (ARGC == 3) {
    if (ARGV[2] !~ /^[0-9]+$/ || ARGV[2] + 0 < 1) usage()
    page = ARGV[2] + 0
  }

  dir = ".contexture/sessions/" slug "/"
  state = dir "state.md"
  if (!exists(state)) fail("ERROR: missing state: " state)

  n = 0
  nref = 0
  repos = ""
  while ((getline line < state) > 0) {
    n++
    add(line, "state")
    if (line ~ /^repos:[ \t]*/) {
      r = line
      sub(/^repos:[ \t]*/, "", r)
      sub(/^\[/, "", r)
      sub(/\].*$/, "", r)
      repos = r
    } else if (line ~ /^ref_sessions:[ \t]*\[/) {
      r = line
      sub(/^ref_sessions:[ \t]*\[/, "", r)
      sub(/\].*$/, "", r)
      nr = split(r, parts, /[ \t]*,[ \t]*/)
      for (i = 1; i <= nr; i++) {
        gsub(/^[ \t]+|[ \t]+$/, "", parts[i])
        if (parts[i] == "") continue
        if (parts[i] !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) {
          print "WARNING: invalid ref session: " parts[i] > "/dev/stderr"
          continue
        }
        nref++
        reflist[nref] = parts[i]
      }
    }
  }
  close(state)
  if (n == 0) fail("ERROR: missing state: " state)

  backlog = dir "backlog.md"
  if (!exists(backlog)) {
    warn_missing("backlog", backlog)
    add("(no backlog yet)", "backlog")
  } else {
    read_whole(backlog, "backlog", "(empty backlog)")
  }

  knowledge = dir "knowledge.md"
  if (!exists(knowledge)) {
    warn_missing("knowledge", knowledge)
    add("(no knowledge yet)", "knowledge")
  } else {
    read_whole(knowledge, "knowledge", "(empty knowledge)")
  }

  journal = dir "journal.md"
  if (!exists(journal)) {
    warn_missing("journal", journal)
    add("(no journal yet)", "journal")
  } else {
    compose_stream(slug, "journal")
  }

  for (ri = 1; ri <= nref; ri++) {
    rslug = reflist[ri]
    sec = "ref " rslug
    rdir = ".contexture/sessions/" rslug "/"
    add("# === REF SESSION: " rslug " (READ-ONLY) ===", sec)
    add("# NOTICE: Read-only reference context. Do not edit, resolve, or append entries here.", sec)
    add("# All new tasks, active events, and state changes belong exclusively to the active session.", sec)
    add("# --- ref knowledge.md ---", sec)
    rk = rdir "knowledge.md"
    if (!exists(rk)) {
      warn_missing("knowledge", rk)
      add("(no knowledge yet)", sec)
    } else {
      read_whole(rk, sec, "(empty knowledge)")
    }
    add("# --- ref live journal ---", sec)
    rj = rdir "journal.md"
    if (!exists(rj)) {
      warn_missing("journal", rj)
      add("(no journal yet)", sec)
    } else {
      compose_stream(rslug, sec)
    }
  }

  npages = 0
  start = 1
  while (start <= total) {
    npages++
    end = total
    for (j = start + 1; j <= total; j++) {
      if (S[j] != S[start]) {
        end = j - 1
        break
      }
    }
    for (j = start + 1; j <= end; j++) {
      if (j - start >= 500 && B[j]) {
        end = j - 1
        break
      }
    }
    pstart[npages] = start
    pend[npages] = end
    psec[npages] = S[start]
    start = end + 1
  }

  if (page > npages) {
    fail("ERROR: page out of range: " page " (1-" npages ")")
  }

  printf "session-load %s: %d lines, %d pages\n", slug, total, npages
  for (si = 1; si <= nsec; si++) {
    s = seclist[si]
    pf = 0
    pl = 0
    for (pi = 1; pi <= npages; pi++) {
      if (psec[pi] == s) {
        if (pf == 0) pf = pi
        pl = pi
      }
    }
    span = (pf == pl) ? ("page " pf) : ("pages " pf "-" pl)
    printf "  %s: lines %d-%d | %s\n", s, secstart[s], secend[s], span
  }
  printf "WRITE SCOPE: .contexture/sessions/%s/ + repos: [%s]; ref sessions READ-ONLY\n", slug, repos
  print ""

  ps = pstart[page]
  label = S[ps]
  if (ps != secstart[label]) {
    split(L[ps], w, /[ \t]+/)
    label = w[1] " " w[2]
  }
  printf "[load %s | %s | page %d/%d | from %s]\n", slug, psec[page], page, npages, label
  for (i = ps; i <= pend[page]; i++) print L[i]
  if (page < npages) {
    printf "next: session-load.awk %s %d\n", slug, page + 1
  } else {
    printf "pages %d/%d; complete\n", npages, npages
  }
  exit 0
}
