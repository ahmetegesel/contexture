#!/usr/bin/awk -f
# session-load.awk: print the load map and one page of the session load
# Usage: session.sh load <session-slug> [<page>]
#        session.sh load refs <ref_1> ... <ref_N> [<page>]
# Sections in BIOS order: state, backlog, knowledge, the live journal
# (composed from session-board.awk, one extraction home), declared
# ref_sessions read-only, then the write-scope trailer. A page ends
# before the block that would pass the line target (about 500) or the
# byte budget (about 40KB), never mid-body; a single over-budget block
# renders whole on its own page. Every call opens with
# the LOAD INCOMPLETE banner until the last page, which opens LOAD
# COMPLETE and hands off to the receipt stamp; keep calling until a page
# reads complete. The refs form streams the named sessions alone, read
# only, with its own banner, map line, trailer, and tail. The backlog
# section composes: a DONE task block renders compactly (the @task line,
# STATUS, OBJECTIVE, DESCRIPTION; REFS, ACCEPTANCE CRITERIA, and
# IMPLEMENTATION DETAILS drop), open and statusless blocks render whole,
# and the backlog file itself is never edited. Missing state is fatal
# rc=1 with zero stdout; missing backlog, knowledge, or journal is
# nonfatal: a WARNING on stderr and a placeholder line in its section.

function usage() {
  print "Usage: session.sh load <session-slug> [<page>]" > "/dev/stderr"
  print "       session.sh load refs <ref_1> ... <ref_N> [<page>]" > "/dev/stderr"
  print "help: .contexture/scripts/session.sh help" > "/dev/stderr"
  exit 1
}

function ref_hint() {
  print "to read a reference session: session.sh load refs <ref-slug>" > "/dev/stderr"
  usage()
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

function exists(path) {
  return (system("test -f \"" path "\"") == 0)
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

# The backlog render: a span runs from ^@task to the line before the
# next column-0 ^@[A-Za-z] line or EOF; the first STATUS line decides.
# A DONE span keeps the @task line, that STATUS line, OBJECTIVE with
# its continuation lines, and DESCRIPTION with its body; its trailing
# blank run stays. Open and statusless spans and out-of-span text
# render verbatim. The parse mirrors the board's, so CRLF renders whole.
function flush_backlog(sec,   i, endc, st, mode, line, firststat) {
  endc = nb
  while (endc >= 1 && bb[endc] == "") endc--
  st = ""
  for (i = 2; i <= endc; i++) {
    if (bb[i] ~ /^  STATUS:[ \t]/) {
      st = bb[i]
      sub(/^  STATUS:[ \t]+/, "", st)
      sub(/[ \t]+.*$/, "", st)
      break
    }
  }
  if (st == "DONE") {
    firststat = 0
    mode = ""
    for (i = 1; i <= endc; i++) {
      line = bb[i]
      if (i == 1) { add(line, sec); continue }
      if (line ~ /^  STATUS:[ \t]/) {
        if (!firststat) { firststat = 1; add(line, sec) }
        mode = ""
        continue
      }
      if (line ~ /^  OBJECTIVE:/) { add(line, sec); mode = "obj"; continue }
      if (line ~ /^  DESCRIPTION[ \t]*::/) { add(line, sec); mode = "desc"; continue }
      if (line ~ /^  [A-Z]/) { mode = ""; continue }
      # An unrecognized in-span line (a column-0 note included) falls with the dropped fields for a DONE span when no kept body is open; an open span keeps it.
      if (mode == "obj" || mode == "desc") add(line, sec)
    }
  } else {
    for (i = 1; i <= nb; i++) add(bb[i], sec)
    return
  }
  for (i = endc + 1; i <= nb; i++) add(bb[i], sec)
}

function compose_backlog(path, sec, empty_note,   line, n) {
  n = 0
  nb = 0
  inblock = 0
  while ((getline line < path) > 0) {
    n++
    if (line ~ /^@[A-Za-z]/) {
      if (inblock) { flush_backlog(sec); inblock = 0; nb = 0 }
      if (line ~ /^@task[ \t]/) { inblock = 1; nb = 1; bb[1] = line; continue }
      add(line, sec)
      continue
    }
    if (inblock) { nb++; bb[nb] = line; continue }
    add(line, sec)
  }
  close(path)
  if (inblock) flush_backlog(sec)
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

function compose_ref(rslug,   sec, rdir, rk, rj) {
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

# The page cut: a page never spans sections; within a section it ends
# before the block whose addition would pass LINE_TARGET lines or
# BYTE_BUDGET bytes, whichever comes first. A page always holds its
# first block whole, so a single over-budget block renders whole on its
# own page, never split. The cut lands on block boundaries only, so the
# pages concatenate to the full render and the map's spans stay true.
function compute_pages(   start, end, j, k, pl, pb, bl, bblk) {
  cum[0] = 0
  for (j = 1; j <= total; j++) cum[j] = cum[j - 1] + length(L[j]) + 1
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
      if (!B[j]) continue
      pl = j - start
      pb = cum[j - 1] - cum[start - 1]
      k = j + 1
      while (k <= end && !B[k]) k++
      bl = k - j
      bblk = cum[k - 1] - cum[j - 1]
      if (pl + bl > LINE_TARGET || pb + bblk > BYTE_BUDGET) {
        end = j - 1
        break
      }
    }
    pstart[npages] = start
    pend[npages] = end
    psec[npages] = S[start]
    start = end + 1
  }
}

function print_map(   si, s, pf, pl, pi, span) {
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
}

function page_header(form, page,   ps, label, w) {
  ps = pstart[page]
  label = S[ps]
  if (ps != secstart[label]) {
    split(L[ps], w, /[ \t]+/)
    label = w[1] " " w[2]
  }
  printf "[load %s | %s | page %d/%d | from %s]\n", form, psec[page], page, npages, label
}

function page_body(page,   i) {
  for (i = pstart[page]; i <= pend[page]; i++) print L[i]
}

BEGIN {
  LINE_TARGET = 500
  BYTE_BUDGET = 40960

  if (ARGC < 2) usage()

  if (ARGV[1] == "refs") {
    if (ARGC < 3) usage()
    page = 1
    ntok = ARGC - 2
    if (ARGV[ARGC - 1] ~ /^[0-9]+$/) {
      if (ARGV[ARGC - 1] + 0 < 1) usage()
      page = ARGV[ARGC - 1] + 0
      ntok--
    }
    if (ntok < 1) usage()
    nref = 0
    refstr = ""
    for (i = 2; i <= 1 + ntok; i++) {
      if (ARGV[i] !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) usage()
      if (ARGV[i] ~ /^[0-9]+$/) usage()
      nref++
      reflist[nref] = ARGV[i]
      refstr = (nref == 1) ? ARGV[i] : refstr " " ARGV[i]
    }
    for (ri = 1; ri <= nref; ri++) {
      if (!exists(".contexture/sessions/" reflist[ri] "/state.md")) {
        fail("ERROR: no such session: " reflist[ri])
      }
    }
    for (ri = 1; ri <= nref; ri++) compose_ref(reflist[ri])

    compute_pages()
    if (page > npages) {
      fail("ERROR: page out of range: " page " (1-" npages ")")
    }

    if (page < npages) {
      printf "REF LOAD INCOMPLETE (page %d of %d): keep reading the ref\n", page, npages
    } else {
      printf "REF LOAD COMPLETE: pages %d/%d\n", npages, npages
    }
    printf "session-load refs %s: %d lines, %d pages\n", refstr, total, npages
    print_map()
    printf "WRITE SCOPE: none; ref sessions READ-ONLY\n"
    print ""

    page_header("refs", page)
    page_body(page)
    if (page < npages) {
      printf "keep reading: session.sh load refs %s %d (%d pages remain)\n", refstr, page + 1, npages - page
    } else {
      printf "ref load complete: pages %d/%d\n", npages, npages
    }
    exit 0
  }

  if (ARGC > 3) usage()
  slug = ARGV[1]
  if (slug !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) usage()
  page = 1
  if (ARGC == 3) {
    if (ARGV[2] !~ /^[0-9]+$/) ref_hint()
    if (ARGV[2] + 0 < 1) usage()
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
    compose_backlog(backlog, "backlog", "(empty backlog)")
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

  for (ri = 1; ri <= nref; ri++) compose_ref(reflist[ri])

  compute_pages()

  if (page > npages) {
    fail("ERROR: page out of range: " page " (1-" npages ")")
  }

  if (page < npages) {
    printf "LOAD INCOMPLETE (page %d of %d): keep calling until a page reads complete; do not start work from a partial record\n", page, npages
  } else {
    printf "LOAD COMPLETE: pages %d/%d; stamp the receipt: session.sh stamp %s \"<the loaded set + ref_sessions + the git state>\"\n", npages, npages, slug
  }
  printf "session-load %s: %d lines, %d pages\n", slug, total, npages
  print_map()
  printf "WRITE SCOPE: .contexture/sessions/%s/ + repos: [%s]; ref sessions READ-ONLY\n", slug, repos
  print ""

  page_header(slug, page)
  page_body(page)
  if (page < npages) {
    printf "keep reading: session.sh load %s %d (%d pages remain)\n", slug, page + 1, npages - page
  } else {
    printf "load complete: pages %d/%d\n", npages, npages
  }
  exit 0
}
