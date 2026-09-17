#!/usr/bin/awk -f
# session-record.awk: the recording commands: the seven write acts over the
# session artifacts, one engine with the act as ARGV[1] (the query precedent)
# Usage: session.sh append <session-slug>  (stdin: one or more blocks)
#        session.sh amend <session-slug> <task-slug>  (stdin: one or more field blocks)
#        session.sh flip <session-slug> <todo | progress | done> <task-slug> [<task-slug> ...]
#        session.sh drop <session-slug> <task-slug> [<task-slug> ...]  (stdin: the record block)
#        session.sh next <session-slug> "<pointer>"
#        session.sh refs <session-slug> [<session> ...]
#        session.sh close <session-slug>
# One act per call, no flags. Every form validates every input before any
# write: a refusal is rc=1 with zero stdout and zero partial writes, and the
# message names the field at fault and the fix. The stdin blocks follow the
# templates: @entry, @finding, and @task blocks for append; labeled field
# blocks for amend; the receipt entry for flip done; the record entry for
# drop. ANCHOR is derived from state.md; an entry slug's date prefix must be
# today; CLOSES and an entry's SUPERSEDES resolve to journal entries, a
# finding's SUPERSEDES to a knowledge finding; REF targets stay unchecked
# (format only); CRLF refuses; duplicate slugs and names refuse; flip done
# requires the backlog/<slug>: DONE literal with its evidence per slug; flip
# progress and next hold the audit's state cross-check; drop requires the
# record to name each slug. Append and the rewrites normalize indentation
# and field order to the templates' canonical shape. Every artifact read
# refuses CRLF; every write lands through a same-directory temp plus mv.

function usage_all() {
  print "Usage: session.sh append <session-slug>  (stdin: one or more blocks)" > "/dev/stderr"
  print "       session.sh amend <session-slug> <task-slug>  (stdin: one or more field blocks)" > "/dev/stderr"
  print "       session.sh flip <session-slug> <todo | progress | done> <task-slug> [<task-slug> ...]" > "/dev/stderr"
  print "       session.sh drop <session-slug> <task-slug> [<task-slug> ...]  (stdin: the record block)" > "/dev/stderr"
  print "       session.sh next <session-slug> \"<pointer>\"" > "/dev/stderr"
  print "       session.sh refs <session-slug> [<session> ...]" > "/dev/stderr"
  print "       session.sh close <session-slug>" > "/dev/stderr"
  print "help: .contexture/scripts/session.sh help" > "/dev/stderr"
  exit 1
}

function usage() {
  if (act == "append") print "Usage: session.sh append <session-slug>  (stdin: one or more blocks)" > "/dev/stderr"
  else if (act == "amend") print "Usage: session.sh amend <session-slug> <task-slug>  (stdin: one or more field blocks)" > "/dev/stderr"
  else if (act == "flip") print "Usage: session.sh flip <session-slug> <todo | progress | done> <task-slug> [<task-slug> ...]" > "/dev/stderr"
  else if (act == "drop") print "Usage: session.sh drop <session-slug> <task-slug> [<task-slug> ...]  (stdin: the record block)" > "/dev/stderr"
  else if (act == "next") print "Usage: session.sh next <session-slug> \"<pointer>\"" > "/dev/stderr"
  else if (act == "refs") print "Usage: session.sh refs <session-slug> [<session> ...]" > "/dev/stderr"
  else if (act == "close") print "Usage: session.sh close <session-slug>" > "/dev/stderr"
  else usage_all()
  print "help: .contexture/scripts/session.sh help" > "/dev/stderr"
  exit 1
}

function fail(msg) {
  print msg > "/dev/stderr"
  exit 1
}

function trim(s) {
  sub(/^[ \t\r]+/, "", s)
  sub(/[ \t\r]+$/, "", s)
  return s
}

function indent_of(line) {
  match(line, /^[ \t]*/)
  return RLENGTH
}

function slug_ok(s) {
  return (s ~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/)
}

function dateslug_ok(s) {
  return (s ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/)
}

function name_ok(s) {
  return (s ~ /^[A-Za-z_][A-Za-z0-9_]*$/)
}

function field2(line,   w) {
  split(trim(line), w, /[ \t]+/)
  return w[2]
}

function check_head(k, line,   w, n, rest) {
  n = split(trim(line), w, /[ \t]+/)
  if (n > 2) {
    rest = trim(line)
    sub(/^[^ \t]+[ \t]+[^ \t]+[ \t]+/, "", rest)
    fail("ERROR: block " k ": trailing text after the slug: " rest)
  }
}

function exists(path) {
  return (system("test -f \"" path "\"") == 0)
}

function load_lines(path, A,   line, n, r) {
  n = 0
  r = 0
  while ((r = (getline line < path)) > 0) {
    if (index(line, "\r") > 0) fail("ERROR: CRLF in " path " (the dialect is LF)")
    n++
    A[n] = line
  }
  close(path)
  if (r < 0) fail("ERROR: unreadable: " path)
  return n
}

function load_one(path, A, art) {
  if (!exists(path)) fail("ERROR: missing " art ": " path)
  return load_lines(path, A)
}

function load_state(   i, line) {
  state_path = ".contexture/sessions/" unit "/state.md"
  if (!exists(state_path)) fail("ERROR: no such session: " unit)
  NS = load_lines(state_path, SL)
  status = ""
  anchor = ""
  statetext = ""
  for (i = 1; i <= NS; i++) {
    line = SL[i]
    statetext = statetext " " line
    if (line ~ /^status:[ \t]*/) status = trim(substr(line, index(line, ":") + 1))
    else if (line ~ /^current_anchor:[ \t]*/) anchor = trim(substr(line, index(line, ":") + 1))
  }
}

function require_active() {
  if (status == "CLOSED") fail("ERROR: unit is CLOSED: " unit " (a closed unit takes no writes)")
  if (status != "ACTIVE") fail("ERROR: unit is not ACTIVE: " unit " (status: [" status "])")
}

function require_anchor() {
  if (anchor !~ /^A[0-9]+$/) fail("ERROR: malformed current_anchor in " state_path ": [" anchor "]")
}

function load_journal() {
  NJ = load_one(".contexture/sessions/" unit "/journal.md", JL, "journal")
  journal_path = ".contexture/sessions/" unit "/journal.md"
}

function load_knowledge() {
  NK = load_one(".contexture/sessions/" unit "/knowledge.md", KL, "knowledge")
  knowledge_path = ".contexture/sessions/" unit "/knowledge.md"
}

function load_backlog() {
  NB = load_one(".contexture/sessions/" unit "/backlog.md", BL, "backlog")
  backlog_path = ".contexture/sessions/" unit "/backlog.md"
}

function entry_exists(slug,   i) {
  for (i = 1; i <= NJ; i++) {
    if (JL[i] ~ /^@entry / && field2(JL[i]) == slug) return 1
  }
  return 0
}

function finding_exists(name,   i) {
  for (i = 1; i <= NK; i++) {
    if (KL[i] ~ /^@finding / && field2(KL[i]) == name) return 1
  }
  return 0
}

function task_exists(slug,   i) {
  for (i = 1; i <= NB; i++) {
    if (BL[i] ~ /^@task[ \t]/ && field2(BL[i]) == slug) return 1
  }
  return 0
}

function find_task_span(slug,   i, j) {
  for (i = 1; i <= NB; i++) {
    if (BL[i] ~ /^@task[ \t]/ && field2(BL[i]) == slug) {
      j = i + 1
      while (j <= NB && BL[j] !~ /^@[A-Za-z]/) j++
      TB_START = i
      TB_END = j - 1
      return 1
    }
  }
  return 0
}

function block_status(start, end,   i, s) {
  for (i = start + 1; i <= end; i++) {
    if (BL[i] ~ /^  STATUS:[ \t]/) {
      s = BL[i]
      sub(/^  STATUS:[ \t]+/, "", s)
      sub(/[ \t]+.*$/, "", s)
      return s
    }
  }
  return ""
}

function first_status_line(start, end,   i) {
  for (i = start + 1; i <= end; i++) {
    if (BL[i] ~ /^  STATUS:[ \t]/) return i
  }
  return 0
}

function count_status_lines(start, end,   i, n) {
  n = 0
  for (i = start + 1; i <= end; i++) {
    if (BL[i] ~ /^  STATUS:[ \t]/) n++
  }
  return n
}

function count_heads(start, end, name,   i, n, s) {
  n = 0
  for (i = start; i <= end; i++) {
    s = trim(BL[i])
    if (name == "OBJECTIVE" && s ~ /^OBJECTIVE[ \t]*:/) n++
    else if (name == "STATUS" && s ~ /^STATUS[ \t]*:/) n++
    else if (name == "REFS" && s ~ /^REFS[ \t]*:/) n++
    else if (name == "DESCRIPTION" && s ~ /^DESCRIPTION[ \t]*::/) n++
    else if (name == "ACCEPTANCE CRITERIA" && s ~ /^ACCEPTANCE CRITERIA[ \t]*::/) n++
    else if (name == "IMPLEMENTATION DETAILS" && s ~ /^IMPLEMENTATION DETAILS[ \t]*::/) n++
  }
  return n
}

function read_stdin(   line) {
  NIN = 0
  while ((getline line) > 0) {
    if (index(line, "\r") > 0) fail("ERROR: CRLF in stdin (the dialect is LF)")
    NIN++
    IN[NIN] = line
  }
}

function split_blocks(   i) {
  NBLK = 0
  for (i = 1; i <= NIN; i++) {
    if (IN[i] ~ /^@(entry|finding|task)[ \t]/) {
      NBLK++
      BH[NBLK] = i
      if (NBLK > 1) BE[NBLK - 1] = i - 1
    } else if (NBLK == 0 && trim(IN[i]) != "") {
      fail("ERROR: stdin line " i ": expected a block head (@entry, @finding, or @task); got: " trim(IN[i]))
    }
  }
  if (NBLK > 0) BE[NBLK] = NIN
  if (NBLK == 0) fail("ERROR: empty stdin (pipe one or more blocks)")
}

function check_ref(k, val) {
  if (val !~ /^"[^"]+#[^"]+"$/) {
    fail("ERROR: block " k ": REF malformed: " val " (the shape: \"path#symbol\" inside double quotes)")
  }
}

function check_group(k, val) {
  if (val !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) {
    fail("ERROR: block " k ": GROUP malformed: " val " (letters, digits, underscore, dash; starts alphanumeric)")
  }
}

function check_rhythm(k, val,   w, nw, rname, rstep, rgate, rpath, rn, i, line, s, g, found) {
  nw = split(val, w, /[ \t]+/)
  if (nw != 3) fail("ERROR: block " k ": RHYTHM malformed: " val " (the shape: <name> <N> <GATE>)")
  rname = w[1]
  rstep = w[2]
  rgate = w[3]
  if (!slug_ok(rname)) fail("ERROR: block " k ": RHYTHM name malformed: " rname)
  if (rstep !~ /^[0-9]+$/ || rstep + 0 < 1) fail("ERROR: block " k ": RHYTHM step malformed: " rstep)
  if (rgate !~ /^[A-Z][A-Z_+]*$/) fail("ERROR: block " k ": RHYTHM gate malformed: " rgate)
  rpath = ".contexture/rhythms/" rname ".md"
  if (!exists(rpath)) fail("ERROR: block " k ": no such rhythm: " rpath)
  rn = load_lines(rpath, RT)
  found = 0
  for (i = 1; i <= rn; i++) {
    line = RT[i]
    if (line ~ /^[ \t]*[0-9]+\.[ \t]*[A-Z][A-Z_+]*[ \t]*:/) {
      s = trim(line)
      sub(/\..*$/, "", s)
      if (s + 0 == rstep + 0) {
        g = trim(line)
        sub(/^[0-9]+\.[ \t]*/, "", g)
        sub(/[ \t]*:.*$/, "", g)
        found = 1
        if (g != rgate) fail("ERROR: block " k ": RHYTHM step " rstep " of " rname " reads " g ", not " rgate)
        break
      }
    }
  }
  if (!found) fail("ERROR: block " k ": RHYTHM step " rstep " not in " rpath)
}

function check_closer(k, label, val,   p, q, ts, inner, c, verdict, reason, w, nw, i, t) {
  p = index(val, "(")
  if (p == 0) fail("ERROR: block " k ": " label " needs the verdict and reason in parentheses (the shape: (done: the resolution))")
  ts = trim(substr(val, 1, p - 1))
  inner = substr(val, p + 1)
  q = index(inner, ")")
  if (q == 0) fail("ERROR: block " k ": " label " carries an unclosed reason")
  if (trim(substr(inner, q + 1)) != "") fail("ERROR: block " k ": " label " carries text after the reason")
  inner = trim(substr(inner, 1, q - 1))
  if (index(inner, "(") > 0 || index(inner, ")") > 0) {
    fail("ERROR: block " k ": " label " reason carries parentheses; write the reason without parentheses")
  }
  c = index(inner, ":")
  if (c == 0) fail("ERROR: block " k ": " label " needs the verdict then a colon then the reason (the shape: (done: the resolution))")
  verdict = trim(substr(inner, 1, c - 1))
  reason = trim(substr(inner, c + 1))
  if (verdict != "done" && verdict != "superseded" && verdict != "dropped" && verdict != "folded") {
    fail("ERROR: block " k ": " label " verdict must be done | superseded | dropped | folded (got: " verdict ")")
  }
  if (reason == "") fail("ERROR: block " k ": " label " needs a non-empty reason")
  if (ts == "") fail("ERROR: block " k ": " label " needs at least one target")
  if (ts ~ /[ \t]+-[ \t]+/) fail("ERROR: block " k ": " label " carries the legacy spaced-hyphen delimiter; write (verdict: reason) instead")
  nw = split(ts, w, /[ \t]+/)
  for (i = 1; i <= nw; i++) {
    t = w[i]
    if (!dateslug_ok(t)) fail("ERROR: block " k ": " label " target malformed: " t " (a date-slug like 2026-09-17-example)")
    if (!entry_exists(t)) fail("ERROR: block " k ": " label " target not in journal.md: " t)
  }
  return ts " (" verdict ": " reason ")"
}

function parse_entry(k,   i, line, label, val, v) {
  check_head(k, IN[BH[k]])
  ESLUG[k] = field2(IN[BH[k]])
  if (!dateslug_ok(ESLUG[k])) fail("ERROR: block " k ": entry slug malformed: " ESLUG[k] " (the shape: <YYYY-MM-DD>-<name>)")
  if (substr(ESLUG[k], 1, 10) != today) fail("ERROR: block " k ": the entry slug's date prefix must be today (" today "); got: " substr(ESLUG[k], 1, 10))
  EW[k] = ""
  EWSET[k] = 0
  EG[k] = ""
  ERH[k] = ""
  EKN[k] = 0
  ETH[k] = 0
  ECN[k] = 0
  ESN[k] = 0
  ERN[k] = 0
  for (i = BH[k] + 1; i <= BE[k]; i++) {
    line = IN[i]
    if (trim(line) == "") continue
    if (indent_of(line) > 2 || line !~ /^[ \t]*(ANCHOR|WHAT|GROUP|RHYTHM|KNOWLEDGE|THREAD|CLOSES|SUPERSEDES|REF)[ \t]*:/) {
      fail("ERROR: block " k ": unrecognized entry line: " trim(line) " (fields indent 2, one per line: WHAT, GROUP, RHYTHM, KNOWLEDGE, THREAD, CLOSES, SUPERSEDES, REF)")
    }
    label = line
    sub(/[ \t]*:.*$/, "", label)
    sub(/^[ \t]+/, "", label)
    v = line
    sub(/^[ \t]*[A-Z]+[ \t]*:[ \t]*/, "", v)
    v = trim(v)
    if (label == "ANCHOR") {
      fail("ERROR: block " k ": ANCHOR is derived from state.md; delete the ANCHOR line")
    } else if (label == "WHAT") {
      if (EWSET[k]) fail("ERROR: block " k ": duplicate WHAT line")
      EW[k] = v
      EWSET[k] = 1
    } else if (label == "GROUP") {
      if (EG[k] != "") fail("ERROR: block " k ": duplicate GROUP line")
      check_group(k, v)
      EG[k] = v
    } else if (label == "RHYTHM") {
      if (ERH[k] != "") fail("ERROR: block " k ": duplicate RHYTHM line")
      check_rhythm(k, v)
      ERH[k] = v
    } else if (label == "KNOWLEDGE") {
      if (v != "true") fail("ERROR: block " k ": KNOWLEDGE must read true (got: " v ")")
      if (EKN[k]) fail("ERROR: block " k ": duplicate KNOWLEDGE line")
      EKN[k] = 1
    } else if (label == "THREAD") {
      if (v != "true") fail("ERROR: block " k ": THREAD must read true (got: " v ")")
      if (ETH[k]) fail("ERROR: block " k ": duplicate THREAD line")
      ETH[k] = 1
    } else if (label == "CLOSES") {
      ECN[k]++
      EC[k, ECN[k]] = check_closer(k, "CLOSES", v)
    } else if (label == "SUPERSEDES") {
      ESN[k]++
      ES[k, ESN[k]] = check_closer(k, "SUPERSEDES", v)
    } else if (label == "REF") {
      check_ref(k, v)
      ERN[k]++
      ERF[k, ERN[k]] = v
    }
  }
  if (!EWSET[k]) fail("ERROR: block " k ": WHAT missing (one quoted WHAT line is required)")
  if (EW[k] !~ /^"[^"]*"$/) fail("ERROR: block " k ": WHAT must be one quoted line with no embedded double quote")
  if (trim(substr(EW[k], 2, length(EW[k]) - 2)) == "") fail("ERROR: block " k ": WHAT empty")
}

function parse_finding(k,   i, line, v, cur, nonblank) {
  check_head(k, IN[BH[k]])
  FSLUG[k] = field2(IN[BH[k]])
  if (!name_ok(FSLUG[k])) fail("ERROR: block " k ": finding NAME malformed: " FSLUG[k] " (letters, digits, underscore; starts letter or underscore)")
  FSN[k] = 0
  FRN[k] = 0
  FSUMSET[k] = 0
  FSUMN[k] = 0
  cur = ""
  for (i = BH[k] + 1; i <= BE[k]; i++) {
    line = IN[i]
    if (trim(line) == "") {
      if (cur == "SUMMARY") {
        FSUMN[k]++
        FSUM[k, FSUMN[k]] = ""
        continue
      }
      continue
    }
    if (indent_of(line) <= 2 && trim(line) ~ /^SUPERSEDES[ \t]*:/) {
      if (FSN[k] > 0) fail("ERROR: block " k ": duplicate SUPERSEDES line")
      v = trim(line)
      sub(/^SUPERSEDES[ \t]*:[ \t]*/, "", v)
      FSN[k]++
      FSUP[k, FSN[k]] = check_finding_supersedes(k, v)
      cur = ""
      continue
    }
    if (indent_of(line) <= 2 && trim(line) ~ /^REF[ \t]*:/) {
      v = trim(line)
      sub(/^REF[ \t]*:[ \t]*/, "", v)
      check_ref(k, v)
      FRN[k]++
      FR[k, FRN[k]] = v
      cur = ""
      continue
    }
    if (indent_of(line) <= 2 && trim(line) ~ /^SUMMARY[ \t]*::/) {
      if (FSUMSET[k]) fail("ERROR: block " k ": duplicate SUMMARY line")
      FSUMSET[k] = 1
      cur = "SUMMARY"
      continue
    }
    if (cur == "SUMMARY" && indent_of(line) >= 2) {
      FSUMN[k]++
      FSUM[k, FSUMN[k]] = line
      continue
    }
    if (cur == "SUMMARY") fail("ERROR: block " k ": SUMMARY body lines indent at least 2; got: " trim(line))
    fail("ERROR: block " k ": unrecognized finding line: " trim(line) " (fields indent 2: SUPERSEDES, REF, SUMMARY ::)")
  }
  if (!FSUMSET[k]) fail("ERROR: block " k ": SUMMARY missing (a SUMMARY :: block is required)")
  FSUMN[k] = trim_body_tail(FSUM, k, FSUMN[k])
  nonblank = 0
  for (i = 1; i <= FSUMN[k]; i++) {
    if (trim(FSUM[k, i]) != "") nonblank = 1
  }
  if (!nonblank) fail("ERROR: block " k ": SUMMARY body empty")
}

function check_finding_supersedes(k, val,   p, target, reason) {
  p = index(val, "(")
  if (p == 0) fail("ERROR: block " k ": SUPERSEDES needs the reason in parentheses")
  if (val !~ /\)[ \t]*$/) fail("ERROR: block " k ": SUPERSEDES carries text after the reason")
  target = trim(substr(val, 1, p - 1))
  reason = trim(substr(val, p + 1, length(val) - p - 1))
  if (!name_ok(target)) fail("ERROR: block " k ": SUPERSEDES target malformed: " target " (a finding NAME)")
  if (target == FSLUG[k]) fail("ERROR: block " k ": a finding cannot supersede itself: " target)
  if (!finding_exists(target)) fail("ERROR: block " k ": SUPERSEDES target not in knowledge.md: " target)
  if (reason == "") fail("ERROR: block " k ": SUPERSEDES needs a non-empty reason")
  return target " (" reason ")"
}

function parse_task(k,   i, line, s, v, cur, nonblank) {
  check_head(k, IN[BH[k]])
  TSLUG[k] = field2(IN[BH[k]])
  if (!slug_ok(TSLUG[k])) fail("ERROR: block " k ": task slug malformed: " TSLUG[k])
  TST[k] = ""
  TSTSET[k] = 0
  TOBJ[k] = ""
  TOBJSET[k] = 0
  TREFVAL[k] = ""
  TRSET[k] = 0
  DBSET[k] = 0
  ABSET[k] = 0
  IBSET[k] = 0
  DBN[k] = 0
  ABN[k] = 0
  IBN[k] = 0
  cur = ""
  for (i = BH[k] + 1; i <= BE[k]; i++) {
    line = IN[i]
    if (trim(line) == "") {
      if (cur == "DESC" || cur == "AC" || cur == "ID") {
        if (cur == "DESC") { DBN[k]++; DB[k, DBN[k]] = "" }
        else if (cur == "AC") { ABN[k]++; AB[k, ABN[k]] = "" }
        else { IBN[k]++; IB[k, IBN[k]] = "" }
      }
      continue
    }
    s = trim(line)
    if (indent_of(line) <= 2 && s ~ /^STATUS[ \t]*:/) {
      if (TSTSET[k]) fail("ERROR: block " k ": duplicate STATUS line")
      v = s
      sub(/^STATUS[ \t]*:[ \t]*/, "", v)
      TST[k] = v
      TSTSET[k] = 1
      cur = ""
      continue
    }
    if (indent_of(line) <= 2 && s ~ /^OBJECTIVE[ \t]*:/) {
      if (TOBJSET[k]) fail("ERROR: block " k ": duplicate OBJECTIVE line")
      v = s
      sub(/^OBJECTIVE[ \t]*:[ \t]*/, "", v)
      TOBJ[k] = trim(v)
      TOBJSET[k] = 1
      cur = ""
      continue
    }
    if (indent_of(line) <= 2 && s ~ /^REFS[ \t]*:/) {
      if (TRSET[k]) fail("ERROR: block " k ": duplicate REFS line")
      v = s
      sub(/^REFS[ \t]*:[ \t]*/, "", v)
      TREFVAL[k] = trim(v)
      TRSET[k] = 1
      cur = ""
      continue
    }
    if (indent_of(line) <= 2 && s ~ /^DESCRIPTION[ \t]*::/) {
      if (DBSET[k]) fail("ERROR: block " k ": duplicate DESCRIPTION line")
      DBSET[k] = 1
      cur = "DESC"
      continue
    }
    if (indent_of(line) <= 2 && s ~ /^ACCEPTANCE CRITERIA[ \t]*::/) {
      if (ABSET[k]) fail("ERROR: block " k ": duplicate ACCEPTANCE CRITERIA line")
      ABSET[k] = 1
      cur = "AC"
      continue
    }
    if (indent_of(line) <= 2 && s ~ /^IMPLEMENTATION DETAILS[ \t]*::/) {
      if (IBSET[k]) fail("ERROR: block " k ": duplicate IMPLEMENTATION DETAILS line")
      IBSET[k] = 1
      cur = "ID"
      continue
    }
    if (cur == "DESC" || cur == "AC" || cur == "ID") {
      if (indent_of(line) < 2) fail("ERROR: block " k ": body lines indent at least 2; got: " s)
      if (cur == "DESC") { DBN[k]++; DB[k, DBN[k]] = line }
      else if (cur == "AC") { ABN[k]++; AB[k, ABN[k]] = line }
      else { IBN[k]++; IB[k, IBN[k]] = line }
      continue
    }
    fail("ERROR: block " k ": unrecognized task line: " s " (fields indent 2: STATUS, OBJECTIVE, REFS, DESCRIPTION ::, ACCEPTANCE CRITERIA ::, IMPLEMENTATION DETAILS ::)")
  }
  if (TSTSET[k] && TST[k] != "TODO") {
    if (TST[k] == "IN_PROGRESS") fail("ERROR: block " k ": STATUS IN_PROGRESS is a flip (run: session.sh flip " unit " progress " TSLUG[k] ")")
    if (TST[k] == "DONE") fail("ERROR: block " k ": STATUS DONE is a flip (run: session.sh flip " unit " done " TSLUG[k] ")")
    fail("ERROR: block " k ": STATUS must be TODO when present (got: " TST[k] ")")
  }
  if (!TOBJSET[k]) fail("ERROR: block " k ": OBJECTIVE missing (one quoted OBJECTIVE line is required)")
  if (TOBJ[k] !~ /^"[^"]*"$/) fail("ERROR: block " k ": OBJECTIVE must be one quoted line with no embedded double quote")
  if (trim(substr(TOBJ[k], 2, length(TOBJ[k]) - 2)) == "") fail("ERROR: block " k ": OBJECTIVE empty")
  if (TRSET[k]) TRC[k] = canon_refs(k, "REFS", TREFVAL[k])
  DBN[k] = trim_body_tail(DB, k, DBN[k])
  ABN[k] = trim_body_tail(AB, k, ABN[k])
  IBN[k] = trim_body_tail(IB, k, IBN[k])
  for (i = 1; i <= 3; i++) {
    if (i == 1 && DBSET[k]) { nonblank = 0; for (v = 1; v <= DBN[k]; v++) if (trim(DB[k, v]) != "") nonblank = 1; if (!nonblank) fail("ERROR: block " k ": DESCRIPTION body empty") }
    if (i == 2 && ABSET[k]) { nonblank = 0; for (v = 1; v <= ABN[k]; v++) if (trim(AB[k, v]) != "") nonblank = 1; if (!nonblank) fail("ERROR: block " k ": ACCEPTANCE CRITERIA body empty") }
    if (i == 3 && IBSET[k]) { nonblank = 0; for (v = 1; v <= IBN[k]; v++) if (trim(IB[k, v]) != "") nonblank = 1; if (!nonblank) fail("ERROR: block " k ": IMPLEMENTATION DETAILS body empty") }
  }
}

function canon_refs(k, label, val,   inner, n, parts, i, p, out, el) {
  if (val !~ /^\[.*\]$/) fail("ERROR: block " k ": " label " must be a bracketed list (the shape: [path#symbol, ...])")
  inner = substr(val, 2, length(val) - 2)
  if (trim(inner) == "") return "[]"
  n = split(inner, parts, /[ \t]*,[ \t]*/)
  out = ""
  for (i = 1; i <= n; i++) {
    el = trim(parts[i])
    if (el == "") fail("ERROR: block " k ": " label " carries an empty element")
    if (el !~ /^[^ \t\[\],]+#[^ \t\[\],]+$/) {
      fail("ERROR: block " k ": " label " element malformed: " el " (the shape: path#symbol)")
    }
    out = (out == "") ? el : out ", " el
  }
  return "[" out "]"
}

function emit(line) {
  ON++
  OB[ON] = line
}

function trim_body_tail(A, k, n) {
  while (n > 0 && trim(A[k, n]) == "") n--
  return n
}

function save(path,   tmp, rc, i) {
  tmp = path ".tmp"
  if (ON == 0) {
    printf "" > tmp
    close(tmp)
  } else {
    for (i = 1; i <= ON; i++) print OB[i] > tmp
    close(tmp)
  }
  rc = system("mv \"" tmp "\" \"" path "\"")
  if (rc != 0) fail("ERROR: mv failed rc=" rc " for " path)
}

function append_block(k, path,   A, n, m, i) {
  n = load_lines(path, A)
  m = n
  while (m >= 1 && A[m] == "") m--
  ON = 0
  for (i = 1; i <= m; i++) emit(A[i])
  if (m > 0) emit("")
  APSK[k] = ON + 1
  for (i = 1; i <= RN[k]; i++) emit(RL[k, i])
  APEK[k] = ON
  save(path)
}

function rl_add(k, line) {
  RN[k]++
  RL[k, RN[k]] = line
}

function render_entry(k,   j) {
  RN[k] = 0
  rl_add(k, "@entry " ESLUG[k])
  rl_add(k, "  ANCHOR: " anchor)
  rl_add(k, "  WHAT: " EW[k])
  if (EG[k] != "") rl_add(k, "  GROUP: " EG[k])
  if (ERH[k] != "") rl_add(k, "  RHYTHM: " ERH[k])
  if (EKN[k]) rl_add(k, "  KNOWLEDGE: true")
  if (ETH[k]) rl_add(k, "  THREAD: true")
  for (j = 1; j <= ECN[k]; j++) rl_add(k, "  CLOSES: " EC[k, j])
  for (j = 1; j <= ESN[k]; j++) rl_add(k, "  SUPERSEDES: " ES[k, j])
  for (j = 1; j <= ERN[k]; j++) rl_add(k, "  REF: " ERF[k, j])
}

function render_finding(k,   j) {
  RN[k] = 0
  rl_add(k, "@finding " FSLUG[k])
  for (j = 1; j <= FSN[k]; j++) rl_add(k, "  SUPERSEDES: " FSUP[k, j])
  for (j = 1; j <= FRN[k]; j++) rl_add(k, "  REF: " FR[k, j])
  rl_add(k, "  SUMMARY ::")
  for (j = 1; j <= FSUMN[k]; j++) {
    if (trim(FSUM[k, j]) == "") rl_add(k, "")
    else rl_add(k, "    " substr(FSUM[k, j], min_body_indent(k, "F") + 1))
  }
}

function render_task(k,   j) {
  RN[k] = 0
  rl_add(k, "@task " TSLUG[k])
  if (TSTSET[k]) rl_add(k, "  STATUS: " TST[k])
  rl_add(k, "  OBJECTIVE: " TOBJ[k])
  if (TRSET[k]) rl_add(k, "  REFS: " TRC[k])
  if (DBSET[k]) {
    rl_add(k, "  DESCRIPTION ::")
    for (j = 1; j <= DBN[k]; j++) {
      if (trim(DB[k, j]) == "") rl_add(k, "")
      else rl_add(k, "    " substr(DB[k, j], min_body_indent(k, "D") + 1))
    }
  }
  if (ABSET[k]) {
    rl_add(k, "  ACCEPTANCE CRITERIA ::")
    for (j = 1; j <= ABN[k]; j++) {
      if (trim(AB[k, j]) == "") rl_add(k, "")
      else rl_add(k, "    " substr(AB[k, j], min_body_indent(k, "A") + 1))
    }
  }
  if (IBSET[k]) {
    rl_add(k, "  IMPLEMENTATION DETAILS ::")
    for (j = 1; j <= IBN[k]; j++) {
      if (trim(IB[k, j]) == "") rl_add(k, "")
      else rl_add(k, "    " substr(IB[k, j], min_body_indent(k, "I") + 1))
    }
  }
}

function min_body_indent(k, which,   i, n, m, ind, line) {
  m = -1
  if (which == "D") n = DBN[k]
  else if (which == "A") n = ABN[k]
  else if (which == "F") n = FSUMN[k]
  else n = IBN[k]
  for (i = 1; i <= n; i++) {
    if (which == "D") line = DB[k, i]
    else if (which == "A") line = AB[k, i]
    else if (which == "F") line = FSUM[k, i]
    else line = IB[k, i]
    if (trim(line) == "") continue
    ind = indent_of(line)
    if (m < 0 || ind < m) m = ind
  }
  return (m < 0) ? 0 : m
}

function do_append(   k, j, i, path, kind) {
  if (narg != 1) usage()
  unit = ARG[1]
  if (!slug_ok(unit)) usage()
  load_state()
  require_active()
  read_stdin()
  split_blocks()
  have_j = 0
  have_k = 0
  have_b = 0
  for (k = 1; k <= NBLK; k++) {
    if (IN[BH[k]] ~ /^@entry[ \t]/) {
      BK[k] = "entry"
      if (!have_j) { load_journal(); have_j = 1 }
    } else if (IN[BH[k]] ~ /^@finding[ \t]/) {
      BK[k] = "finding"
      if (!have_k) { load_knowledge(); have_k = 1 }
    } else {
      BK[k] = "task"
      if (!have_b) { load_backlog(); have_b = 1 }
    }
  }
  for (k = 1; k <= NBLK; k++) {
    if (BK[k] == "entry") {
      require_anchor()
      parse_entry(k)
      render_entry(k)
      if (entry_exists(ESLUG[k])) fail("ERROR: block " k ": entry slug exists in journal.md: " ESLUG[k])
      for (j = 1; j < k; j++) {
        if (BK[j] == "entry" && ESLUG[j] == ESLUG[k]) fail("ERROR: block " k ": duplicate entry slug in the batch: " ESLUG[k])
      }
    } else if (BK[k] == "finding") {
      parse_finding(k)
      render_finding(k)
      if (finding_exists(FSLUG[k])) fail("ERROR: block " k ": finding NAME exists in knowledge.md: " FSLUG[k] " (to replace it, write a new finding with a SUPERSEDES line)")
      for (j = 1; j < k; j++) {
        if (BK[j] == "finding" && FSLUG[j] == FSLUG[k]) fail("ERROR: block " k ": duplicate finding NAME in the batch: " FSLUG[k])
      }
    } else if (BK[k] == "task") {
      parse_task(k)
      render_task(k)
      if (task_exists(TSLUG[k])) fail("ERROR: block " k ": task slug exists in backlog.md: " TSLUG[k])
      for (j = 1; j < k; j++) {
        if (BK[j] == "task" && TSLUG[j] == TSLUG[k]) fail("ERROR: block " k ": duplicate task slug in the batch: " TSLUG[k])
      }
    } else {
      fail("ERROR: block " k ": unknown block kind")
    }
  }
  for (k = 1; k <= NBLK; k++) {
    if (BK[k] == "entry") path = journal_path
    else if (BK[k] == "finding") path = knowledge_path
    else path = backlog_path
    append_block(k, path)
  }
  for (k = 1; k <= NBLK; k++) {
    if (BK[k] == "entry") printf "appended: @entry %s (journal.md %d-%d)\n", ESLUG[k], APSK[k], APEK[k]
    else if (BK[k] == "finding") printf "appended: @finding %s (knowledge.md %d-%d)\n", FSLUG[k], APSK[k], APEK[k]
    else printf "appended: @task %s (backlog.md %d-%d)\n", TSLUG[k], APSK[k], APEK[k]
  }
}

function head_name(line,   s) {
  s = trim(line)
  if (s ~ /^STATUS[ \t]*:/) return "STATUS"
  if (s ~ /^OBJECTIVE[ \t]*:/) return "OBJECTIVE"
  if (s ~ /^REFS[ \t]*:/) return "REFS"
  if (s ~ /^DESCRIPTION[ \t]*::/) return "DESCRIPTION"
  if (s ~ /^ACCEPTANCE CRITERIA[ \t]*::/) return "ACCEPTANCE CRITERIA"
  if (s ~ /^IMPLEMENTATION DETAILS[ \t]*::/) return "IMPLEMENTATION DETAILS"
  return ""
}

function parse_field_blocks(   i, line, ind, s, name, v, cur, nonblank) {
  NFB = 0
  cur = 0
  for (i = 1; i <= NIN; i++) {
    line = IN[i]
    if (trim(line) == "") {
      if (cur > 0 && (FFIELD[cur] == "DESCRIPTION" || FFIELD[cur] == "ACCEPTANCE CRITERIA" || FFIELD[cur] == "IMPLEMENTATION DETAILS")) {
        FBN[cur]++
        FB[cur, FBN[cur]] = ""
      }
      continue
    }
    ind = indent_of(line)
    name = (ind <= 2) ? head_name(line) : ""
    if (name != "") {
      if (name == "STATUS") fail("ERROR: STATUS is not amendable (run: session.sh flip " unit " todo | progress | done <task-slug>)")
      NFB++
      cur = NFB
      FFIELD[NFB] = name
      FBN[NFB] = 0
      if (name == "OBJECTIVE" || name == "REFS") {
        v = line
        sub(/^[ \t]*[A-Z ]+[ \t]*:[ \t]*/, "", v)
        FVAL[NFB] = trim(v)
      }
      continue
    }
    if (ind < 2) fail("ERROR: stdin line " i ": expected a field label (OBJECTIVE, REFS, DESCRIPTION ::, ACCEPTANCE CRITERIA ::, IMPLEMENTATION DETAILS ::) or an indented body; got: " trim(line))
    if (cur == 0) fail("ERROR: stdin line " i ": a body line before any field label")
    if (FFIELD[cur] == "OBJECTIVE" || FFIELD[cur] == "REFS") fail("ERROR: stdin line " i ": " FFIELD[cur] " is one line; a body follows it")
    FBN[cur]++
    FB[cur, FBN[cur]] = line
  }
  if (NFB == 0) fail("ERROR: empty stdin (pipe one or more field blocks)")
  for (i = 1; i <= NFB; i++) {
    if (FFIELD[i] == "DESCRIPTION" || FFIELD[i] == "ACCEPTANCE CRITERIA" || FFIELD[i] == "IMPLEMENTATION DETAILS") {
      FBN[i] = trim_body_tail(FB, i, FBN[i])
    }
  }
  for (i = 1; i <= NFB; i++) {
    for (v = i + 1; v <= NFB; v++) {
      if (FFIELD[v] == FFIELD[i]) fail("ERROR: duplicate field block: " FFIELD[i])
    }
    if (FFIELD[i] == "OBJECTIVE") {
      if (FVAL[i] !~ /^"[^"]*"$/) fail("ERROR: OBJECTIVE must be one quoted line with no embedded double quote")
      if (trim(substr(FVAL[i], 2, length(FVAL[i]) - 2)) == "") fail("ERROR: OBJECTIVE empty")
    } else if (FFIELD[i] == "REFS") {
      FREFVAL[i] = canon_refs_field(i, FVAL[i])
    } else {
      nonblank = 0
      for (v = 1; v <= FBN[i]; v++) {
        if (trim(FB[i, v]) != "") nonblank = 1
      }
      if (!nonblank) fail("ERROR: " FFIELD[i] " body empty")
    }
  }
}

function canon_refs_field(i, val,   inner, n, parts, p, out, el) {
  if (val !~ /^\[.*\]$/) fail("ERROR: field block " i ": REFS must be a bracketed list (the shape: [path#symbol, ...])")
  inner = substr(val, 2, length(val) - 2)
  if (trim(inner) == "") return "[]"
  n = split(inner, parts, /[ \t]*,[ \t]*/)
  out = ""
  for (p = 1; p <= n; p++) {
    el = trim(parts[p])
    if (el == "") fail("ERROR: field block " i ": REFS carries an empty element")
    if (el !~ /^[^ \t\[\],]+#[^ \t\[\],]+$/) fail("ERROR: field block " i ": REFS element malformed: " el " (the shape: path#symbol)")
    out = (out == "") ? el : out ", " el
  }
  return "[" out "]"
}

function parse_task_segments(   i, name, s, lastnonblank) {
  NSEG = 0
  TB_TAIL = TB_START
  for (i = TB_START + 1; i <= TB_END; i++) {
    if (trim(BL[i]) != "") TB_TAIL = i
  }
  for (i = TB_START + 1; i <= TB_TAIL; i++) {
    if (trim(BL[i]) == "") continue
    name = (indent_of(BL[i]) <= 2) ? head_name(BL[i]) : ""
    if (name != "") {
      NSEG++
      SEGH[NSEG] = i
      SEGNAME[NSEG] = name
    } else if (indent_of(BL[i]) <= 2) {
      fail("ERROR: unrecognized line in task " TSLUG[k] " at backlog.md " i ": " trim(BL[i]))
    }
  }
}

function seg_index(name,   s) {
  for (s = 1; s <= NSEG; s++) {
    if (SEGNAME[s] == name) return s
  }
  return 0
}

function seg_end(s) {
  if (s < NSEG) return SEGH[s + 1] - 1
  return TB_TAIL
}

function emit_segment(s,   i) {
  for (i = SEGH[s]; i <= seg_end(s); i++) emit(BL[i])
}

function amend_field(name,   i, j, m) {
  for (i = 1; i <= NFB; i++) {
    if (FFIELD[i] != name) continue
    if (name == "OBJECTIVE") { emit("  OBJECTIVE: " FVAL[i]); return 1 }
    if (name == "REFS") { emit("  REFS: " FREFVAL[i]); return 1 }
    emit("  " name " ::")
    m = min_body_indent_field(i)
    for (j = 1; j <= FBN[i]; j++) {
      if (trim(FB[i, j]) == "") emit("")
      else emit("    " substr(FB[i, j], m + 1))
    }
    return 1
  }
  return 0
}

function min_body_indent_field(i,   j, m, ind) {
  m = -1
  for (j = 1; j <= FBN[i]; j++) {
    if (trim(FB[i, j]) == "") continue
    ind = indent_of(FB[i, j])
    if (m < 0 || ind < m) m = ind
  }
  return (m < 0) ? 0 : m
}

function do_amend(   i, j, s, n, name, start, end, order) {
  if (narg != 2) usage()
  unit = ARG[1]
  task_slug = ARG[2]
  if (!slug_ok(unit) || !slug_ok(task_slug)) usage()
  load_state()
  require_active()
  read_stdin()
  parse_field_blocks()
  load_backlog()
  if (!find_task_span(task_slug)) fail("ERROR: no such task: " task_slug)
  TSLUG[1] = task_slug
  parse_task_segments()
  for (i = 1; i <= NFB; i++) {
    name = FFIELD[i]
    if (count_heads(TB_START, TB_TAIL, name) > 1) {
      fail("ERROR: task " task_slug " carries duplicate " name " lines (fix by hand first)")
    }
  }
  if (count_heads(TB_START, TB_TAIL, "OBJECTIVE") == 0 && !field_amended("OBJECTIVE")) {
    fail("ERROR: task " task_slug " has no OBJECTIVE (amend it with an OBJECTIVE block)")
  }
  ON = 0
  i = 1
  while (i <= NB) {
    if (i != TB_START) {
      emit(BL[i])
      i++
      continue
    }
    emit(BL[i])
    s = seg_index("STATUS")
    if (s > 0) emit_segment(s)
    order[1] = "OBJECTIVE"; order[2] = "REFS"; order[3] = "DESCRIPTION"; order[4] = "ACCEPTANCE CRITERIA"; order[5] = "IMPLEMENTATION DETAILS"
    for (n = 1; n <= 5; n++) {
      name = order[n]
      if (field_amended(name)) {
        AFS[name] = ON + 1
        amend_field(name)
        AFE[name] = ON
      } else {
        s = seg_index(name)
        if (s > 0) emit_segment(s)
      }
    }
    for (j = TB_TAIL + 1; j <= TB_END; j++) emit(BL[j])
    i = TB_END + 1
  }
  save(backlog_path)
  for (i = 1; i <= NFB; i++) printf "amended: %s %s (backlog.md %d-%d)\n", task_slug, FFIELD[i], AFS[FFIELD[i]], AFE[FFIELD[i]]
}

function field_amended(name,   i) {
  for (i = 1; i <= NFB; i++) {
    if (FFIELD[i] == name) return 1
  }
  return 0
}

function do_flip(   i, j, k, verb, lit, idx, what, path, start, end) {
  if (narg < 3) usage()
  unit = ARG[1]
  if (!slug_ok(unit)) usage()
  verb = ARG[2]
  if (verb != "todo" && verb != "progress" && verb != "done") {
    fail("ERROR: bad flip verb: " verb " (todo | progress | done)")
  }
  nsl = narg - 2
  for (i = 1; i <= nsl; i++) {
    TARG[i] = ARG[2 + i]
    if (!slug_ok(TARG[i])) usage()
  }
  load_state()
  require_active()
  load_backlog()
  for (i = 1; i <= nsl; i++) {
    if (!find_task_span(TARG[i])) fail("ERROR: no such task: " TARG[i])
    if (count_status_lines(TB_START, TB_END) > 1) {
      fail("ERROR: task " TARG[i] " carries duplicate STATUS lines (fix by hand first)")
    }
    TSTART[i] = TB_START
    TEND[i] = TB_END
    TSTATL[i] = first_status_line(TB_START, TB_END)
    TSTAT[i] = block_status(TB_START, TB_END)
    for (j = 1; j < i; j++) {
      if (TARG[j] == TARG[i]) fail("ERROR: duplicate task in the call: " TARG[i])
    }
    if (verb == "progress" && index(statetext, TARG[i]) == 0) {
      fail("ERROR: the state must already name " TARG[i] " to activate it (run: session.sh next " unit " \"<a pointer naming " TARG[i] ">\")")
    }
  }
  if (verb == "done") {
    read_stdin()
    split_blocks()
    if (NBLK != 1) fail("ERROR: flip done needs one receipt block on stdin")
    if (IN[BH[1]] !~ /^@entry[ \t]/) fail("ERROR: the receipt must be one @entry block")
    load_journal()
    BK[1] = "entry"
    require_anchor()
    parse_entry(1)
    render_entry(1)
    if (entry_exists(ESLUG[1])) fail("ERROR: the receipt entry slug exists in journal.md: " ESLUG[1])
    jtext = ""
    for (i = 1; i <= NJ; i++) jtext = jtext "\n" JL[i]
    what = substr(EW[1], 2, length(EW[1]) - 2)
    for (i = 1; i <= nsl; i++) {
      lit = "backlog/" TARG[i] ": DONE"
      idx = index(what, lit)
      if (idx == 0) fail("ERROR: the receipt WHAT must carry \"" lit "\" with the evidence after it")
      if (trim(substr(what, idx + length(lit))) == "") fail("ERROR: the receipt WHAT must carry the evidence after \"" lit "\"")
      if (TSTAT[i] == "DONE" && index(jtext, lit) > 0) fail("ERROR: " TARG[i] " is already DONE with its event in journal.md (already landed)")
    }
    append_block(1, journal_path)
    jstart = APSK[1]
  }
  ON = 0
  i = 1
  while (i <= NB) {
    k = 0
    for (j = 1; j <= nsl; j++) {
      if (TSTART[j] == i) k = j
    }
    if (k == 0) {
      emit(BL[i])
      i++
      continue
    }
    emit(BL[i])
    if (TSTATL[k] == 0) emit("  STATUS: " flip_value(verb))
    j = i + 1
    while (j <= TEND[k]) {
      if (j == TSTATL[k]) emit("  STATUS: " flip_value(verb))
      else emit(BL[j])
      j++
    }
    i = TEND[k] + 1
  }
  save(backlog_path)
  for (i = 1; i <= nsl; i++) {
    if (verb == "done") printf "flip: %s DONE (event: journal.md %d)\n", TARG[i], jstart
    else if (verb == "progress") printf "flip: %s IN_PROGRESS\n", TARG[i]
    else printf "flip: %s TODO\n", TARG[i]
  }
}

function flip_value(verb) {
  if (verb == "todo") return "TODO"
  if (verb == "progress") return "IN_PROGRESS"
  return "DONE"
}

function do_drop(   i, j, k) {
  if (narg < 2) usage()
  unit = ARG[1]
  if (!slug_ok(unit)) usage()
  nsl = narg - 1
  for (i = 1; i <= nsl; i++) {
    TARG[i] = ARG[1 + i]
    if (!slug_ok(TARG[i])) usage()
  }
  load_state()
  require_active()
  load_backlog()
  for (i = 1; i <= nsl; i++) {
    if (!find_task_span(TARG[i])) fail("ERROR: no such task: " TARG[i])
    TSTART[i] = TB_START
    TEND[i] = TB_END
    TSTAT[i] = block_status(TB_START, TB_END)
    for (j = 1; j < i; j++) {
      if (TARG[j] == TARG[i]) fail("ERROR: duplicate task in the call: " TARG[i])
    }
    if (TSTAT[i] == "IN_PROGRESS" && index(statetext, TARG[i]) > 0) {
      fail("ERROR: " TARG[i] " is IN_PROGRESS and the state still names it (park it first: session.sh flip " unit " todo " TARG[i] ", then: session.sh drop " unit " " TARG[i] ")")
    }
  }
  read_stdin()
  split_blocks()
  if (NBLK != 1) fail("ERROR: drop needs one record block on stdin")
  if (IN[BH[1]] !~ /^@entry[ \t]/) fail("ERROR: the record must be one @entry block")
  load_journal()
  BK[1] = "entry"
  require_anchor()
  parse_entry(1)
  render_entry(1)
  if (entry_exists(ESLUG[1])) fail("ERROR: the record entry slug exists in journal.md: " ESLUG[1])
  for (i = 1; i <= nsl; i++) {
    if (index(EW[1], TARG[i]) == 0) fail("ERROR: the record WHAT must name " TARG[i])
  }
  append_block(1, journal_path)
  ON = 0
  i = 1
  while (i <= NB) {
    k = 0
    for (j = 1; j <= nsl; j++) {
      if (TSTART[j] == i) k = 1
    }
    if (k == 1) {
      for (j = 1; j <= nsl; j++) {
        if (TSTART[j] == i) i = TEND[j] + 1
      }
      continue
    }
    emit(BL[i])
    i++
  }
  while (ON >= 1 && OB[ON] == "") ON--
  save(backlog_path)
  for (i = 1; i <= nsl; i++) printf "dropped: %s (record: journal.md %d)\n", TARG[i], APSK[1]
}

function do_next(   i, j, candidate, missing, n, nimp, slug, nnal) {
  if (narg != 2) usage()
  unit = ARG[1]
  pointer = ARG[2]
  if (!slug_ok(unit)) usage()
  if (pointer == "") fail("ERROR: empty pointer")
  if (index(pointer, "\"") > 0) fail("ERROR: embedded double quote in pointer")
  if (index(pointer, "\n") > 0) fail("ERROR: embedded newline in pointer")
  load_state()
  require_active()
  load_backlog()
  nal = 0
  nnal = 0
  for (i = 1; i <= NS; i++) {
    if (SL[i] ~ /^next_action:[ \t]*/) {
      nal = i
      nnal++
    }
  }
  if (nal == 0) fail("ERROR: missing next_action in " state_path " (fix the state by hand)")
  if (nnal > 1) fail("ERROR: duplicate next_action in " state_path " (fix the state by hand)")
  ON = 0
  i = 1
  while (i <= NS) {
    if (i == nal) {
      emit("next_action: \"" pointer "\"")
      i++
      while (i <= NS && SL[i] ~ /^[ \t]/) i++
      continue
    }
    emit(SL[i])
    i++
  }
  candidate = ""
  for (i = 1; i <= ON; i++) candidate = candidate " " OB[i]
  nimp = 0
  missing = ""
  for (i = 1; i <= NB; i++) {
    if (BL[i] ~ /^@task[ \t]/) {
      slug = field2(BL[i])
      j = i + 1
      while (j <= NB && BL[j] !~ /^@[A-Za-z]/) j++
      st = block_status(i, j - 1)
      if (st == "IN_PROGRESS") {
        nimp++
        if (index(candidate, slug) == 0) missing = (missing == "") ? slug : missing ", " slug
      }
      i = j - 1
    }
  }
  if (missing != "") {
    fail("ERROR: next_action would not name IN_PROGRESS task(s): " missing " (name them in the pointer, or run: session.sh flip " unit " todo <task-slug> to park, session.sh drop " unit " <task-slug> to remove)")
  }
  save(state_path)
  printf "next_action: \"%s\"\n", pointer
}

function do_refs(   i, s, list, p, replaced, inserted) {
  if (narg < 1) usage()
  unit = ARG[1]
  if (!slug_ok(unit)) usage()
  list = ""
  for (i = 2; i <= narg; i++) {
    s = ARG[i]
    if (!slug_ok(s)) fail("ERROR: ref session malformed: " s)
    if (s == unit) fail("ERROR: the unit cannot reference itself: " unit)
    if (!exists(".contexture/sessions/" s "/state.md")) fail("ERROR: no such session: " s)
    for (p = 2; p < i; p++) {
      if (ARG[p] == s) fail("ERROR: duplicate ref session: " s)
    }
    list = (list == "") ? s : list ", " s
  }
  load_state()
  require_active()
  hasref = 0
  for (p = 1; p <= NS; p++) {
    if (SL[p] ~ /^ref_sessions:[ \t]*/) hasref = 1
  }
  ON = 0
  i = 1
  done = 0
  while (i <= NS) {
    if (SL[i] ~ /^ref_sessions:[ \t]*/) {
      if (!done) {
        emit("ref_sessions: [" list "]")
        done = 1
      }
      i++
      while (i <= NS && SL[i] ~ /^[ \t]/) i++
      continue
    }
    emit(SL[i])
    if (!hasref && !done && SL[i] ~ /^repos:[ \t]*/) {
      emit("ref_sessions: [" list "]")
      done = 1
    }
    i++
  }
  if (!done) emit("ref_sessions: [" list "]")
  save(state_path)
  printf "ref_sessions: [%s]\n", list
}

function run_audit(   cmd, tag, line, i) {
  AUDN = 0
  arc = ""
  tag = "session-record-audit-rc"
  cmd = ".contexture/scripts/session-audit.awk " unit "; echo \"" tag "=$?\""
  while ((cmd | getline line) > 0) {
    if (line ~ ("^" tag "=[0-9]+$")) {
      arc = substr(line, length(tag) + 2)
      continue
    }
    AUDN++
    AUD[AUDN] = line
  }
  close(cmd)
  if (arc == "") fail("ERROR: could not determine the audit exit status")
}

function do_close(   i, j, s, open, st) {
  if (narg != 1) usage()
  unit = ARG[1]
  if (!slug_ok(unit)) usage()
  load_state()
  if (status == "CLOSED") fail("ERROR: unit already CLOSED: " unit)
  require_active()
  run_audit()
  if (arc != 0) {
    if (AUDN == 0) print "WARNING: audit failed rc=" arc " (run: session.sh audit " unit ")" > "/dev/stderr"
    for (i = 1; i <= AUDN; i++) print "WARNING: " AUD[i] > "/dev/stderr"
  }
  open = ""
  if (exists(".contexture/sessions/" unit "/backlog.md")) {
    load_backlog()
    for (i = 1; i <= NB; i++) {
      if (BL[i] ~ /^@task[ \t]/) {
        s = field2(BL[i])
        j = i + 1
        while (j <= NB && BL[j] !~ /^@[A-Za-z]/) j++
        st = block_status(i, j - 1)
        if (st != "DONE") open = (open == "") ? s : open ", " s
        i = j - 1
      }
    }
  }
  if (open != "") print "WARNING: open tasks: " open > "/dev/stderr"
  ON = 0
  for (i = 1; i <= NS; i++) {
    if (SL[i] ~ /^status:[ \t]*/) emit("status: CLOSED")
    else emit(SL[i])
  }
  save(state_path)
  print "CLOSED: " unit
}

BEGIN {
  cmd = "date +%Y-%m-%d"
  if ((cmd | getline today) <= 0) fail("ERROR: could not determine today's date")
  close(cmd)
  if (ARGC < 2) usage_all()
  act = ARGV[1]
  narg = ARGC - 2
  for (i = 2; i < ARGC; i++) ARG[i - 1] = ARGV[i]
  for (i = 0; i < ARGC; i++) delete ARGV[i]
  if (act == "append") do_append()
  else if (act == "amend") do_amend()
  else if (act == "flip") do_flip()
  else if (act == "drop") do_drop()
  else if (act == "next") do_next()
  else if (act == "refs") do_refs()
  else if (act == "close") do_close()
  else {
    print "ERROR: unknown record act: " act > "/dev/stderr"
    usage_all()
  }
  exit 0
}
