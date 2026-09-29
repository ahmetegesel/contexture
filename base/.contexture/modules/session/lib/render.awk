# render.awk: the one renderer of base (contract 2, docs/the-engine.md, the rendering of
# every text view). Base maps a command to one storage function; the function answers
# JSON; lib/json.awk flattens it into path lines; this program reads those lines on
# stdin and prints the view ENVIRON["RV_VIEW"] names. Every backend's answer renders
# through the same code, so every backend prints the same text for the same record.
#
# The flattened lines: <path>=<value> (a string in the payload escape form), <path>:<token>
# (null, true, false, a number), <path>#<n> (an array). Other inputs of a view arrive in
# the environment (RV_UNIT, RV_REF, RV_QUERY, ...), never through awk -v, so free text of
# any content reaches the renderer exactly.
#
# The spans (docs/the-engine.md, The record data model): every item renders from its typed
# fields as its canonical lines followed by one empty line when the next item exists and is
# not an anchor. The canonical lines here are the contract's, the same text every backend
# prints for the same data, so every backend's answer renders the same text; no item
# carries stored bytes.
#
# Views: board, load, refload, audit, close, active, units, refs_to, closure, task_list,
# task_show, entry_show, entry_list, finding_show, finding_list, search, resolve,
# lane_doc, lane_journal, diagnose, state, field. The load views print tagged lines
# ("<section> TAB <line>") the load verb pages; every other view prints its text. A
# view's refusal prints one stderr line and exits 1.
#
# BWK awk, mawk, gawk, busybox awk; the C locale; a backslash is joined by concatenation,
# never produced by a gsub replacement.

# ------------------------------------------------------------------------------
# the flattened answer
function ld(line,   c, p, v) {
  if (!match(line, /[=:#]/)) return
  p = substr(line, 1, RSTART - 1)
  c = substr(line, RSTART, 1)
  v = substr(line, RSTART + 1)
  V[p] = v
  if (c == "=") T[p] = "s"
  else if (c == "#") T[p] = "a"
  else if (v == "null") T[p] = "z"
  else if (v == "true" || v == "false") T[p] = "b"
  else T[p] = "n"
}

function ex(p) { return (p in T) }
function nul(p) { return !(p in T) || T[p] == "z" }
function nn(p) { return (T[p] == "a") ? V[p] + 0 : 0 }
function bv(p) { return (p in T) && V[p] == "true" }
function kid(p, k) { return D(p) k }
# D(p): the prefix of p's members ("" for the answer's root)
function D(p) { return (p == "") ? "" : p "." }
# znull(p): an object-valued path answered null (a present object prints no line of its own)
function znull(p) { return (p in T) && T[p] == "z" }

# unesc(v): the text of a payload-escaped value
function unesc(v,   n, A, i, o) {
  if (index(v, "\\") == 0) return v
  gsub(/\\\\/, "\034", v)
  gsub(/\\n/, "\n", v)
  gsub(/\\t/, "\t", v)
  gsub(/\\r/, "\r", v)
  if (index(v, "\034") == 0) return v
  n = split(v, A, /\034/)
  o = A[1]
  for (i = 2; i <= n; i++) o = o "\\" A[i]
  return o
}

# sv(p): the text of a string path, "" when absent or null
function sv(p) { return nul(p) ? "" : unesc(V[p]) }

# ------------------------------------------------------------------------------
# output: plain prints text as it is; tagged prints each line as "<section> TAB <line>"
function put(text,   n, L, i) {
  if (!TAGGED) { printf "%s", text; return }
  if (text == "") return
  n = split(text, L, "\n")
  if (L[n] == "") n--
  for (i = 1; i <= n; i++) printf "%s\t%s\n", SEC, L[i]
}

# putl(text): text as whole lines: every line ends with a newline (an awk line walk, as
# v0.54.0 printed each line it read)
function putl(text) {
  if (text == "") return
  if (substr(text, length(text)) != "\n") text = text "\n"
  put(text)
}

function line(s) { put(s "\n") }

function warn(s) { print s > "/dev/stderr" }

function fail(s) {
  print s > "/dev/stderr"
  RC = 1
  exit 1
}

# ------------------------------------------------------------------------------
# the canonical lines (docs/the-engine.md, The record data model)
function list_join(p, sep,   n, i, o) {
  n = nn(p)
  o = ""
  for (i = 1; i <= n; i++) o = o (i > 1 ? sep : "") sv(D(p) "" i)
  return o
}

function c_block(label, v,   o, n, P, i) {
  o = "  " label " ::\n"
  if (v == "") return o
  n = split(v, P, "\n")
  for (i = 1; i <= n; i++) o = o (P[i] == "" ? "" : "    " P[i]) "\n"
  return o
}

# c_opens(v): v opens a double quote it does not close
function c_opens(v) { return substr(v, 1, 1) == "\"" && (length(v) == 1 || substr(v, length(v), 1) != "\"") }

# c_quoted(label, value): a quoted one-line field, a block scalar when the value holds a newline
function c_quoted(label, v) {
  if (index(v, "\n") > 0) return c_block(label, v)
  return "  " label ": \"" v "\"\n"
}

# c_xfield(key, value): an extra field: one line with the value as stored, a block scalar when
# the value holds a newline (or opens a WHAT or OBJECTIVE quote it never closes)
function c_xfield(k, v) {
  if (index(v, "\n") > 0 || ((k == "WHAT" || k == "OBJECTIVE") && c_opens(v))) return c_block(k, v)
  return "  " k ": " v "\n"
}

# the extra lines and the extra fields of an item, and its head line
function c_xl(p,   n, i, o) {
  o = ""
  n = nn(D(p) "extra_lines")
  for (i = 1; i <= n; i++) o = o sv(D(p) "extra_lines." i) "\n"
  return o
}

function c_xf(p,   n, i, o) {
  o = ""
  n = nn(D(p) "extra_fields")
  for (i = 1; i <= n; i++) o = o c_xfield(sv(D(p) "extra_fields." i ".key"), sv(D(p) "extra_fields." i ".value"))
  return o
}

function c_head(w, id, p) { return "@" w " " id (nul(D(p) "head_text") ? "" : " " sv(D(p) "head_text")) "\n" }

# the state: its extra lines, the six keys, its extra keys (a value's later lines as stored)
function c_state(p,   o, n, i) {
  o = c_xl(p) "status: " sv(D(p) "status") "\ncurrent_anchor: " sv(D(p) "current_anchor") "\nnext_action: \"" sv(D(p) "next_action") "\"\nobjective: \"" sv(D(p) "objective") "\"\nrepos: [" list_join(D(p) "repos", ", ") "]\n"
  if (!nul(D(p) "ref_sessions")) o = o "ref_sessions: [" list_join(D(p) "ref_sessions", ", ") "]\n"
  n = nn(D(p) "extra_fields")
  for (i = 1; i <= n; i++) o = o sv(D(p) "extra_fields." i ".key") ": " sv(D(p) "extra_fields." i ".value") "\n"
  return o
}

function state_text(p) { return c_state(p) }

# a task: the head, the extra lines, the schema lines, then the extra fields
function c_task(p,   o) {
  o = c_head("task", sv(D(p) "slug"), p) c_xl(p) "  STATUS: " sv(D(p) "status") "\n" c_quoted("OBJECTIVE", sv(D(p) "objective"))
  if (nn(D(p) "refs") > 0) o = o "  REFS: [" list_join(D(p) "refs", ", ") "]\n"
  if (!nul(D(p) "description")) o = o c_block("DESCRIPTION", sv(D(p) "description"))
  if (!nul(D(p) "criteria")) o = o c_block("ACCEPTANCE CRITERIA", sv(D(p) "criteria"))
  if (!nul(D(p) "details")) o = o c_block("IMPLEMENTATION DETAILS", sv(D(p) "details"))
  return o c_xf(p)
}

function c_closer(p,   o) {
  o = "  " sv(D(p) "kind") ": " list_join(D(p) "targets", " ")
  if (!nul(D(p) "extra_text")) o = o (nn(D(p) "targets") > 0 ? " " : "") sv(D(p) "extra_text")
  if (!nul(D(p) "verdict")) o = o " (" sv(D(p) "verdict") ": " sv(D(p) "reason") ")"
  else if (!nul(D(p) "reason")) o = o " (" sv(D(p) "reason") ")"
  return o
}

# an entry of the main journal or a lane journal: the head, the extra lines, the extra fields,
# then ANCHOR, STATUS, WHAT, GROUP, RHYTHM, THREAD, REF, the closers, KNOWLEDGE, each when set
function c_entry(p,   o, i, n) {
  o = c_head("entry", sv(D(p) "slug"), p) c_xl(p) c_xf(p)
  if (!nul(D(p) "anchor")) o = o "  ANCHOR: " sv(D(p) "anchor") "\n"
  if (!nul(D(p) "legacy_status")) o = o "  STATUS: " sv(D(p) "legacy_status") "\n"
  if (!nul(D(p) "what")) o = o c_quoted("WHAT", sv(D(p) "what"))
  if (!nul(D(p) "group")) o = o "  GROUP: " sv(D(p) "group") "\n"
  if (!nul(D(p) "rhythm")) o = o "  RHYTHM: " sv(D(p) "rhythm") "\n"
  if (!nul(D(p) "thread")) o = o "  THREAD: " sv(D(p) "thread") "\n"
  n = nn(D(p) "refs")
  for (i = 1; i <= n; i++) o = o "  REF: \"" sv(D(p) "refs." i) "\"\n"
  n = nn(D(p) "closers")
  for (i = 1; i <= n; i++) o = o c_closer(D(p) "closers." i) "\n"
  if (bv(D(p) "knowledge")) o = o "  KNOWLEDGE: true\n"
  return o
}

function c_anchor(p) {
  if (!nul(D(p) "continues") && !nul(D(p) "attention"))
    return "@anchor " sv(D(p) "anchor") " (\"continues " sv(D(p) "continues") "\", attention: " sv(D(p) "attention") ")\n" c_xl(p)
  return c_head("anchor", sv(D(p) "anchor"), p) c_xl(p)
}

function c_finding(p,   o, i, n) {
  o = c_head("finding", sv(D(p) "name"), p) c_xl(p)
  if (!znull(D(p) "supersedes") && ex(D(p) "supersedes.name")) o = o "  SUPERSEDES: " sv(D(p) "supersedes.name") " (" sv(D(p) "supersedes.reason") ")\n"
  n = nn(D(p) "refs")
  for (i = 1; i <= n; i++) o = o "  REF: \"" sv(D(p) "refs." i) "\"\n"
  return o c_block("SUMMARY", sv(D(p) "summary")) c_xf(p)
}

# an opaque item: its head line and its lines
function c_opaque(p,   o, n, i) {
  o = sv(D(p) "head") "\n"
  n = nn(D(p) "lines")
  for (i = 1; i <= n; i++) o = o sv(D(p) "lines." i) "\n"
  return o
}

# kind(p, dflt): an item's kind: its kind field, else the kind of its artifact (a Task and
# a Finding carry none)
function kind(p, dflt) { return ex(D(p) "kind") ? sv(D(p) "kind") : dflt }

function canon(p, k) {
  if (k == "task") return c_task(p)
  if (k == "finding") return c_finding(p)
  if (k == "anchor") return c_anchor(p)
  if (k == "entry") return c_entry(p)
  if (k == "opaque") return c_opaque(p)
  return ""
}

# span(p, k): the item's canonical lines and its separator
function span(p, k,   t) {
  t = canon(p, k)
  if (!nul(D(p) "next") && sv(D(p) "next") != "anchor") t = t "\n"
  return t
}

# block(p, k): the span without its trailing empty lines
function block(p, k,   t) {
  t = span(p, k)
  while (length(t) >= 2 && substr(t, length(t) - 1) == "\n\n") t = substr(t, 1, length(t) - 1)
  return t
}

# ------------------------------------------------------------------------------
# the state line groups (the v0.54.0 rule of active and units): each column-0 key line
# and the indented lines after it until an empty line or the next column-0 line; the last
# group of a key wins
function st_groups(text, loose,   n, L, i, ln, cur) {
  ST_status = ""; ST_anchor = ""; ST_nl = 0; ST_ol = 0; ST_repos = ""; ST_hasrepos = 0
  n = split(text, L, "\n")
  if (n > 0 && L[n] == "") n--
  cur = ""
  for (i = 1; i <= n; i++) {
    ln = L[i]
    if (ln ~ /^repos:[ \t]*/) {
      ST_repos = ln
      sub(/^repos:[ \t]*/, "", ST_repos)
      sub(/^\[/, "", ST_repos)
      sub(/\].*$/, "", ST_repos)
      ST_hasrepos = 1
    }
    if (ln ~ /^[ \t]*$/) { cur = ""; continue }
    if (ln ~ /^[ \t]/) {
      if (cur == "next_action") { ST_nl++; ST_nxt[ST_nl] = ln }
      else if (cur == "objective") { ST_ol++; ST_obj[ST_ol] = ln }
      continue
    }
    if (loose ? (ln ~ /^status:[ \t]*/) : (ln ~ /^status:[ \t]/)) {
      ST_status = ln
      sub(/^status:[ \t]*/, "", ST_status)
      sub(/[ \t\r]+$/, "", ST_status)
      cur = "status"
    } else if (loose ? (ln ~ /^current_anchor:[ \t]*/) : (ln ~ /^current_anchor:[ \t]/)) {
      ST_anchor = ln
      cur = "current_anchor"
    } else if (loose ? (ln ~ /^next_action:[ \t]*/) : (ln ~ /^next_action:[ \t]/)) {
      ST_nl = 1
      ST_nxt[1] = ln
      cur = "next_action"
    } else if (loose && ln ~ /^objective:[ \t]*/) {
      ST_ol = 1
      ST_obj[1] = ln
      cur = "objective"
    } else if (!loose && ln ~ /^repos:[ \t]*/) {
      cur = "repos"
    } else {
      cur = ""
    }
  }
}

# ------------------------------------------------------------------------------
# board (kept): the header, the live spans, the open tasks, the open threads
function v_board(p,   u, L, T2, H, i, bp) {
  u = sv(D(p) "unit")
  L = nn(D(p) "live")
  T2 = nn(D(p) "open_tasks")
  H = nn(D(p) "open_threads")
  bp = bv(D(p) "backlog_present")
  if (!bp) warn("WARNING: missing backlog: unit " u)
  if (bp) line(sprintf("board %s: %d live %s, %d open %s", u, L, (L == 1) ? "entry" : "entries", T2, (T2 == 1) ? "task" : "tasks"))
  else line(sprintf("board %s: %d live %s, no backlog", u, L, (L == 1) ? "entry" : "entries"))
  if (L > 0) {
    line("")
    for (i = 1; i <= L; i++) putl(span(D(p) "live." i, "entry"))
  }
  if (T2 > 0) {
    line("")
    line("OPEN TASKS")
    for (i = 1; i <= T2; i++) line("  " sv(D(p) "open_tasks." i))
    line("the entries say what happened; these say what remains")
  }
  if (H > 0) {
    line("")
    line("OPEN THREADS (awaiting outside the unit)")
    for (i = 1; i <= H; i++) line("  " sv(D(p) "open_threads." i ".slug") " (" sv(D(p) "open_threads." i ".anchor") "): " sv(D(p) "open_threads." i ".thread"))
    line("these await someone outside: resolve or re-ask")
  }
}

# the DONE compaction of load (v0.54.0 flush_backlog): a DONE task keeps its head, the
# first STATUS line, OBJECTIVE with its continuation lines, DESCRIPTION with its body, and
# its trailing empty run
function done_compact(text,   n, B, endc, i, st, mode, ln, firststat, o) {
  n = split(text, B, "\n")
  if (n > 0 && B[n] == "") n--
  endc = n
  while (endc >= 1 && B[endc] == "") endc--
  st = ""
  for (i = 2; i <= endc; i++) {
    if (B[i] ~ /^  STATUS:[ \t]/) {
      st = B[i]
      sub(/^  STATUS:[ \t]+/, "", st)
      sub(/[ \t]+.*$/, "", st)
      break
    }
  }
  if (st != "DONE") return text
  o = ""
  firststat = 0
  mode = ""
  for (i = 1; i <= endc; i++) {
    ln = B[i]
    if (i == 1) { o = o ln "\n"; continue }
    if (ln ~ /^  STATUS:[ \t]/) {
      if (!firststat) { firststat = 1; o = o ln "\n" }
      mode = ""
      continue
    }
    if (ln ~ /^  OBJECTIVE:/) { o = o ln "\n"; mode = "obj"; continue }
    if (ln ~ /^  DESCRIPTION[ \t]*::/) { o = o ln "\n"; mode = "desc"; continue }
    if (ln ~ /^  [A-Z]/) { mode = ""; continue }
    if (mode == "obj" || mode == "desc") o = o ln "\n"
  }
  for (i = endc + 1; i <= n; i++) o = o B[i] "\n"
  return o
}

# the backlog section of load: the preamble, then every task (a DONE task compacted) and
# opaque item as its span
function load_backlog(p, u,   n, i, k, t, any) {
  if (nul(D(p) "preamble")) {
    warn("WARNING: missing backlog: unit " u)
    line("(no backlog yet)")
    return
  }
  any = 0
  t = sv(D(p) "preamble")
  if (t != "") { putl(t); any = 1 }
  n = nn(D(p) "tasks")
  for (i = 1; i <= n; i++) {
    k = kind(D(p) "tasks." i, "task")
    t = span(D(p) "tasks." i, k)
    if (k == "task") t = done_compact(t)
    if (t != "") { putl(t); any = 1 }
  }
  if (!any) line("(empty backlog)")
}

function load_knowledge(p, u, missing_note,   n, i, t, any) {
  if (znull(p) || nul(D(p) "preamble")) {
    warn("WARNING: missing knowledge: unit " u)
    line("(no knowledge yet)")
    return
  }
  any = 0
  t = sv(D(p) "preamble")
  if (t != "") { putl(t); any = 1 }
  n = nn(D(p) "findings")
  for (i = 1; i <= n; i++) {
    t = span(D(p) "findings." i, kind(D(p) "findings." i, "finding"))
    if (t != "") { putl(t); any = 1 }
  }
  if (!any) line("(empty knowledge)")
}

function load_ref(p,   u) {
  u = sv(D(p) "unit")
  SEC = "ref " u
  line("# === REF SESSION: " u " (READ-ONLY) ===")
  line("# NOTICE: Read-only reference context. Do not edit, resolve, or append entries here.")
  line("# All new tasks, active events, and state changes belong exclusively to the active session.")
  line("# --- ref knowledge.md ---")
  load_knowledge(D(p) "knowledge", u)
  line("# --- ref live journal ---")
  if (znull(D(p) "board") || !ex(D(p) "board.unit")) {
    warn("WARNING: missing journal: unit " u)
    line("(no journal yet)")
  } else v_board(D(p) "board")
}

# load (kept but the WRITE SCOPE line): the tagged lines of every section; the WRITE SCOPE
# repos arrive as a "#repos" line of the state section's group rule
function v_load(   u, n, i, st) {
  TAGGED = 1
  u = sv("unit")
  SEC = "state"
  st = state_text("state")
  putl(st)
  st_groups(st, 1)
  SEC = "backlog"
  load_backlog("backlog", u)
  SEC = "knowledge"
  load_knowledge("knowledge", u)
  SEC = "journal"
  if (znull("board") || !ex("board.unit")) {
    warn("WARNING: missing journal: unit " u)
    line("(no journal yet)")
  } else v_board("board")
  n = nn("refs")
  for (i = 1; i <= n; i++) load_ref("refs." i)
  printf "\001repos\t%s\n", ST_repos
}

function v_refload(   n, i) {
  TAGGED = 1
  n = nn("refs")
  for (i = 1; i <= n; i++) load_ref("refs." i)
}

# ------------------------------------------------------------------------------
# audit (kept; the order deterministic, D29): the findings in the backend's order, then
# the open thread tail when clean; rc 1 when not clean
function audit_line(p,   c, l, s, d, ln) {
  c = sv(D(p) "code")
  s = sv(D(p) "slug")
  d = sv(D(p) "detail")
  ln = nul(D(p) "line") ? "" : " at line " V[D(p) "line"]
  if (c == "LEGACY_DUPLICATE_SLUG") {
    if (nul(D(p) "line")) return "LEGACY DUPLICATE SLUG: " s " (occurrence " V[D(p) "occurrence"] "; warning: a closer closes the occurrences before it)"
    return "LEGACY DUPLICATE SLUG" ln ": " s " (first at line " V[D(p) "first_line"] "; warning: a closer closes the occurrences before it)"
  }
  if (c == "DATELESS_SLUG") return "DATELESS SLUG" ln ": " s
  if (c == "INLINE_MARKER") return "INLINE MARKER" ln ": " s
  if (c == "BRACKETED_FIELD") return "BRACKETED FIELD" ln ": " d
  if (c == "SLUGLESS_CLOSER") return "SLUGLESS CLOSER" ln ": no valid date-slug target"
  if (c == "DANGLING_CLOSER") {
    if (nul(D(p) "line")) return "DANGLING CLOSER: " d " (in " s ")"
    return "DANGLING CLOSER" ln ": " d
  }
  if (c == "UNHARVESTED_KNOWLEDGE") return "UNHARVESTED KNOWLEDGE" ln ": " s
  if (c == "DONE_WITHOUT_EVENT") return "DONE WITHOUT EVENT (backlog/" s ": DONE): " s
  if (c == "IN_PROGRESS_ABSENT_FROM_STATE") return "IN_PROGRESS ABSENT FROM STATE: " s
  if (c == "MISSING_THREAD") return "MISSING THREAD" ln ": " s " (declare THREAD: <what it awaits> | none)"
  return c ln ": " s
}

function v_audit(p,   n, i, t, clean) {
  n = nn(D(p) "findings")
  for (i = 1; i <= n; i++) line(audit_line(D(p) "findings." i))
  clean = bv(D(p) "clean")
  if (!clean) { RC = 1; return }
  n = nn(D(p) "open_threads")
  t = 0
  for (i = 1; i <= n; i++) {
    if (t == 0) line("OPEN THREADS (awaiting resolution):")
    if (nul(D(p) "open_threads." i ".line")) line("  " sv(D(p) "open_threads." i ".slug") " (" sv(D(p) "open_threads." i ".thread") ")")
    else line("  line " V[D(p) "open_threads." i ".line"] ": " sv(D(p) "open_threads." i ".slug") " (" sv(D(p) "open_threads." i ".thread") ")")
    t++
  }
  if (t == 0) line("open threads: none")
}

# close (kept): the warnings of the returned audit and the open tasks on stderr, then the
# closed line
function v_close(   n, i, u, o) {
  u = sv("unit")
  if (!bv("audit.clean")) {
    n = nn("audit.findings")
    if (n == 0) warn("WARNING: audit failed rc=1 (run: ctx session audit " u ")")
    for (i = 1; i <= n; i++) warn("WARNING: " audit_line("audit.findings." i))
  }
  if (nn("open_tasks") > 0) warn("WARNING: open tasks: " list_join("open_tasks", ", "))
  line("CLOSED: " u)
}

# ------------------------------------------------------------------------------
# active (kept): every ACTIVE unit with its anchor, next_action, and objective line groups
function v_active(   n, i, p, first, nact, ntot, j, st) {
  n = nn("units")
  if (n == 0 && sv("store") == "absent") { line("no sessions yet"); return }
  first = 1
  nact = 0
  ntot = 0
  for (i = 1; i <= n; i++) {
    p = "units." i
    ntot++
    st_groups(state_text(p), 1)
    if (ST_status == "ACTIVE") {
      if (!first) line("")
      first = 0
      nact++
      line(sv(D(p) "unit"))
      if (ST_anchor != "") line("  " ST_anchor)
      for (j = 1; j <= ST_nl; j++) line("  " ST_nxt[j])
      for (j = 1; j <= ST_ol; j++) line("  " ST_obj[j])
    } else if (ST_status != "CLOSED") {
      warn("WARNING: unrecognized status [" ST_status "] in state: unit " sv(D(p) "unit"))
    }
  }
  if (nact == 0) line("no active sessions")
  line("closed: " (ntot - nact))
}

# units (the former query units): the units touching a repo with their anchor and
# next_action line groups
function v_units(   n, i, p, j, known) {
  n = nn("units")
  if (n == 0) fail("ERROR: no unit touches repo: " sv("repo") " (known: " list_join("known_repos", ", ") ")")
  line(sprintf("units %s: %d units", sv("repo"), n))
  line("")
  for (i = 1; i <= n; i++) {
    p = "units." i
    if (i > 1) line("")
    st_groups(state_text(p), 0)
    line(sv(D(p) "unit") " " ((ST_status == "ACTIVE") ? "[ACTIVE]" : "[CLOSED]"))
    if (ST_anchor != "") line("  " ST_anchor)
    for (j = 1; j <= ST_nl; j++) line("  " ST_nxt[j])
  }
}

function v_refs_to(   n, i) {
  n = nn("referrers")
  if (n == 0) fail("ERROR: no unit references session: " sv("unit"))
  line(sprintf("refs-to %s: %d units", sv("unit"), n))
  line("")
  for (i = 1; i <= n; i++) line("  " sv("referrers." i))
}

# closure (new): open or closed with the first closer's verdict, then every later closer
function v_closure(   n, i, p, v) {
  n = nn("closers")
  if (!bv("closed")) line("closure " sv("unit") " " sv("slug") ": open")
  else {
    v = nul("closers.1.closer.verdict") ? "" : sv("closers.1.closer.verdict")
    if (v != "") line("closure " sv("unit") " " sv("slug") ": closed (" v ")")
    else line("closure " sv("unit") " " sv("slug") ": closed")
  }
  for (i = 1; i <= n; i++) {
    p = "closers." i
    line("")
    line("closer " sv(D(p) "by") " (" sv(D(p) "by_anchor") ")")
    line(c_closer(D(p) "closer"))
  }
}

# ------------------------------------------------------------------------------
# the lists (kept) and the show views (the stored block, D15)
function v_task_list(   n, i, p) {
  n = nn("tasks")
  for (i = 1; i <= n; i++) {
    p = "tasks." i
    printf "  [%s] %s: %s\n", sv(D(p) "status"), sv(D(p) "slug"), sv(D(p) "objective")
  }
}

function v_entry_list(   n, i, p) {
  n = nn("entries")
  for (i = 1; i <= n; i++) {
    p = "entries." i
    printf "  [%s] %s: %s\n", sv(D(p) "anchor"), sv(D(p) "slug"), sv(D(p) "what")
  }
}

# a summary in one line: every newline and tab printed as one space
function oneline(s) {
  gsub(/[\n\t]/, " ", s)
  return s
}

function v_finding_list(   n, i, p) {
  n = nn("findings")
  for (i = 1; i <= n; i++) {
    p = "findings." i
    printf "  %s: %s\n", sv(D(p) "name"), oneline(sv(D(p) "summary"))
  }
}

function v_task_show() { put(block("task", "task")) }
function v_entry_show() { put(block("entry", "entry")) }

function v_finding_show(   t, nl) {
  t = block("finding", "finding")
  if (!nul("finding.superseded_by")) {
    nl = index(t, "\n")
    if (nl > 0) t = substr(t, 1, nl) "  SUPERSEDED_BY: " sv("finding.superseded_by") "\n" substr(t, nl + 1)
    else t = t "\n  SUPERSEDED_BY: " sv("finding.superseded_by") "\n"
  }
  put(t)
}

# search (kept for exact): the count line, then one line per result
function v_search(   n, i, p) {
  n = nn("results")
  printf "search %s \"%s\": %d matches, %d shown\n", ENVIRON["RV_UNIT"], ENVIRON["RV_QUERY"], V["total_matches"] + 0, n
  for (i = 1; i <= n; i++) {
    p = "results." i
    printf "  %s %s (%s): %s\n", sv(D(p) "entity_type"), sv(D(p) "entity_id"), sv(D(p) "section"), oneline_nl(sv(D(p) "snippet"))
  }
}

function oneline_nl(s) {
  gsub(/\n/, " ", s)
  return s
}

# ------------------------------------------------------------------------------
# resolve (kept): the item's span, trailing separator included; a lane report claim is the
# report's block from the last "@<claim>" (or "@claim <claim>") line to the line before
# the next column-0 ^@[A-Za-z] line (the v0.54.0 rule, base's since resolve is base's)
function v_resolve(   k, n, L, i, found, e, t, claim, w, o) {
  k = ENVIRON["RV_KIND"]
  if (k == "task") { put(span("task", "task")); return }
  if (k == "finding") { put(span("finding", "finding")); return }
  if (k == "entry") { put(span("entry", "entry")); return }
  claim = ENVIRON["RV_CLAIM"]
  n = split(sv("content"), L, "\n")
  if (n > 0 && L[n] == "") n--
  found = 0
  for (i = 1; i <= n; i++) {
    t = L[i]
    sub(/[ \t\r]+$/, "", t)
    if (t == "@" claim) found = i
    else if (L[i] ~ /^@claim[ \t]/) {
      split(L[i], w, /[ \t]+/)
      if (w[2] == claim) found = i
    }
  }
  if (!found) fail("resolve: error: reference '" ENVIRON["RV_REF"] "' not found in unit '" ENVIRON["RV_UNIT"] "' (ERR_ENTITY_NOT_FOUND)")
  e = found + 1
  while (e <= n && L[e] !~ /^@[A-Za-z]/) e++
  e--
  o = ""
  for (i = found; i <= e; i++) o = o L[i] "\n"
  put(o)
}

# ------------------------------------------------------------------------------
# lane show (kept): a document's content with its trailing newlines collapsed to exactly
# one (a null document is one empty line); the journal as its preamble and every item's
# span, collapsed the same way. The content streams, so a 2 MB report meets no copy.
function pr_collapsed(v,   n, A, i) {
  # v is payload-escaped: strip every trailing \n escape (a \n preceded by an even run of
  # backslashes), then print the text and one newline
  while (length(v) >= 2 && substr(v, length(v) - 1) == "\\n" && !odd_bs_before(v, length(v) - 1)) v = substr(v, 1, length(v) - 2)
  if (index(v, "\\") == 0) { printf "%s\n", v; return }
  gsub(/\\\\/, "\034", v)
  gsub(/\\n/, "\n", v)
  gsub(/\\t/, "\t", v)
  gsub(/\\r/, "\r", v)
  n = split(v, A, /\034/)
  printf "%s", A[1]
  for (i = 2; i <= n; i++) printf "\\%s", A[i]
  printf "\n"
}

# odd_bs_before(v, pos): 1 when the backslash at pos is itself escaped, that is, preceded
# by an odd run of backslashes
function odd_bs_before(v, pos,   n) {
  n = 0
  while (pos - 1 - n >= 1 && substr(v, pos - 1 - n, 1) == "\\") n++
  return n % 2
}

function v_lane_doc() {
  if (nul("content")) { printf "\n"; return }
  pr_collapsed(V["content"])
}

function v_lane_journal(   n, i, t, o) {
  o = sv("preamble")
  n = nn("items")
  for (i = 1; i <= n; i++) o = o span("items." i, kind("items." i, "entry"))
  while (length(o) > 0 && substr(o, length(o)) == "\n") o = substr(o, 1, length(o) - 1)
  printf "%s\n", o
}

# ------------------------------------------------------------------------------
# diagnose (changed): the descriptor as lines; the base lines arrive in the environment
function v_diagnose(   m) {
  m = list_join("search_modes", ", ")
  printf "  contract:        %s (%s %s)\n", sv("contract"), sv("driver"), sv("version")
  printf "  functions:       %d declared\n", nn("functions")
  printf "  search modes:    %s (default exact)\n", (m == "" ? "none" : m)
  m = list_join("optional", ", ")
  printf "  optional:        %s\n", (m == "" ? "none" : m)
}

function v_health() {
  printf "%s\t%s\t%s\t%s\n", sv("health"), sv("detail"), sv("store"), V["active_units"] + 0
}

# state: the state text of an answer's state (bootstrap prints it)
function v_state() { put(state_text(ENVIRON["RV_PATH"])) }

# field: the text of one path, no newline added
function v_field() { printf "%s", sv(ENVIRON["RV_PATH"]) }

BEGIN {
  while ((getline ln) > 0) ld(ln)
  RC = 0
  TAGGED = 0
  SEC = ""
  view = ENVIRON["RV_VIEW"]
  if (view == "board") v_board("")
  else if (view == "load") v_load()
  else if (view == "refload") v_refload()
  else if (view == "audit") v_audit("")
  else if (view == "close") v_close()
  else if (view == "active") v_active()
  else if (view == "units") v_units()
  else if (view == "refs_to") v_refs_to()
  else if (view == "closure") v_closure()
  else if (view == "task_list") v_task_list()
  else if (view == "task_show") v_task_show()
  else if (view == "entry_show") v_entry_show()
  else if (view == "entry_list") v_entry_list()
  else if (view == "finding_show") v_finding_show()
  else if (view == "finding_list") v_finding_list()
  else if (view == "search") v_search()
  else if (view == "resolve") v_resolve()
  else if (view == "lane_doc") v_lane_doc()
  else if (view == "lane_journal") v_lane_journal()
  else if (view == "diagnose") v_diagnose()
  else if (view == "health") v_health()
  else if (view == "state") v_state()
  else if (view == "field") v_field()
  else fail("render.awk: error: unknown view '" view "'")
  exit RC
}
