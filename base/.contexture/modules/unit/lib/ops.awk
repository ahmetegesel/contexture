# ops.awk: the unit module's record functions (docs/the-engine.md, The functions and The
# record rules), run after canon.awk and model.awk. The reads answer from the parsed model;
# the writes add items by the append rule and rewrite a touched item canonical in place
# (every other line of the artifact keeps its bytes), parse the result again, stage every
# changed artifact under PX_STAGE with one manifest line "<staged name><TAB><path in the
# unit folder><TAB><unit>", and write the answer to PX_OUT, which the data script prints only after
# every staged value has landed through the store. A refusal writes one line to PX_ERR and
# exits 1 or 2 with nothing staged.
#
# The environment: PX_FN the function, PX_UNIT the unit, PX_NA and PX_A1.. the other argv
# tokens (checked by the data script), PX_STAGE the stage folder, PX_DOCSIZE (the document
# on stdin, staged as "doc").

# ---- the line edits ----
# ed_splice(k, a, b, s): lines a..b of artifact k become the lines of s (newline
# terminated; "" removes them; b = a - 1 inserts before line a)
# the carriage return mark of a legacy line (CRL, model.awk) moves with its line; a line an
# edit writes carries none
function cr_mv(k, from, to) { if ((k, from) in CRL) CRL[k, to] = 1; else delete CRL[k, to] }

function ed_splice(k, a, b, s,   n, P, i, d, old) {
  if (!(k in PRES)) { PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1 }
  n = 0
  if (s != "") { n = split(s, P, "\n"); if (P[n] == "") n-- }
  old = b - a + 1
  d = n - old
  if (d > 0) { for (i = NL[k]; i > b; i--) { L[k, i + d] = L[k, i]; cr_mv(k, i, i + d) } }
  else if (d < 0) { for (i = b + 1; i <= NL[k]; i++) { L[k, i + d] = L[k, i]; cr_mv(k, i, i + d) }; for (i = NL[k] + d + 1; i <= NL[k]; i++) { delete L[k, i]; delete CRL[k, i] } }
  for (i = 1; i <= n; i++) { L[k, a + i - 1] = P[i]; delete CRL[k, a + i - 1] }
  NL[k] += d
  if (NL[k] == 0) EOFNL[k] = 1
}

function ed_trim(k) {
  while (NL[k] > 0 && L[k, NL[k]] == "") { delete L[k, NL[k]]; delete CRL[k, NL[k]]; NL[k]-- }
}

# ed_append(k, s, isanchor): the append rule: the artifact's trailing empty lines go, one
# empty line follows unless the new item is an anchor or the artifact holds nothing, then
# the item's canonical lines
function ed_append(k, s, isanchor,   n) {
  if (!(k in PRES)) { PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1 }
  ed_trim(k)
  if (NL[k] > 0 && !isanchor) { NL[k]++; L[k, NL[k]] = ""; delete CRL[k, NL[k]] }
  n = NL[k]
  ed_splice(k, n + 1, n, s)
  EOFNL[k] = 1
}

function relpath(k,   a) {
  a = substr(k, index(k, "|") + 1)
  if (a ~ /^lane\//) { sub(/^lane\//, "lanes/", a); return a ".md" }
  return a ".md"
}

# stage(k): the artifact's new bytes into the stage, one manifest line naming its unit (the
# key's text before the bar), so a write over two units lands each under its own
function stage(k,   f, i, o) {
  NSTAGED++
  f = STAGE "/" NSTAGED
  printf "" > f
  for (i = 1; i <= NL[k]; i++) printf "%s%s%s", L[k, i], (((k, i) in CRL) ? "\r" : ""), ((i < NL[k] || EOFNL[k]) ? "\n" : "") > f
  close(f)
  printf "%s\t%s\t%s\n", NSTAGED, relpath(k), substr(k, 1, index(k, "|") - 1) > (STAGE "/manifest")
}

function stage_doc(rel) { printf "doc\t%s\n", rel > (STAGE "/manifest") }
function stage_close() { close(STAGE "/manifest") }

# ---- the checks every write shares ----
function oneline(name, v) {
  if (v == NULLV) return
  if (index(v, "\n") > 0) die(1, "ERR_INVALID_ARGUMENT", name " takes one line")
  if (index(v, "\r") > 0) die(1, "ERR_INVALID_ARGUMENT", name " holds a carriage return")
}
function nocr(name, v) { if (v != NULLV && index(v, "\r") > 0) die(1, "ERR_INVALID_ARGUMENT", name " holds a carriage return") }
function need(k) { if (!has(k)) die(1, "ERR_INVALID_ARGUMENT", "missing payload key " k) }

# not_closed, nf, and ex check and name the unit U, or the unit given (a write over two units)
function not_closed(u) {
  if (u == "") u = U
  if (ST[u, "status"] == "CLOSED") die(1, "ERR_UNIT_CLOSED", "unit '" u "' is CLOSED; a closed unit takes no writes")
}

function nf(kind, x, u) { die(1, "ERR_ENTITY_NOT_FOUND", kind " '" x "' not found in unit '" (u == "" ? U : u) "'") }
function ex(kind, x, u) { die(1, "ERR_ENTITY_EXISTS", kind " '" x "' already exists in unit '" (u == "" ? U : u) "'") }

function find_task(k, s,   i) { for (i = 1; i <= NI[k]; i++) if (IK[k, i] == "task" && X[k, i, "slug"] == s) return i; return 0 }
function find_finding(k, n,   i) { for (i = 1; i <= NI[k]; i++) if (IK[k, i] == "finding" && X[k, i, "name"] == n) return i; return 0 }
function held(k, s) { return ((k, s) in LASTOCC) }
function live_flag(k, s,   i) { for (i = 1; i <= NI[k]; i++) if (IK[k, i] == "entry" && X[k, i, "slug"] == s && X[k, i, "know"] && !CLBY[k, i]) return 1; return 0 }

# gen_slug(k, base): the base, suffixed -1 while the journal holds it
function gen_slug(k, s) { while (held(k, s)) s = s "-1"; return s }

function want_date(d) { if (d !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) die(1, "ERR_INVALID_ARGUMENT", "date takes YYYY-MM-DD") }
function want_epoch(e) { if (e !~ /^[0-9]+$/) die(1, "ERR_INVALID_ARGUMENT", "epoch takes digits") }

# ---- the state write ----
# st_write(u): the state, a touched item, rewritten canonical from its typed fields (the
# caller set them in ST first), its extra fields and extra lines kept
function st_write(u,   k) {
  k = u "|state"
  ed_splice(k, 1, NL[k], state_text(u))
  EOFNL[k] = 1
  parse_state(u)
}

# ---- the item writes ----
function reparse(k,   key) {
  for (key in LASTOCC) if (index(key, k SUBSEP) == 1) delete LASTOCC[key]
  for (key in SUPBY) if (index(key, k SUBSEP) == 1) delete SUPBY[key]
  parse_art(k, TYPE[k])
}

# item_rewrite(k, i): the touched item i of artifact k rewritten canonical in place from its
# typed fields (the caller set them in X first): its span, to the next head, becomes its
# canonical lines and its separator; every other line of the artifact keeps its bytes (a last
# item rewritten leaves the artifact ending with a newline)
function item_rewrite(k, i,   last) {
  last = (i == NI[k])
  ed_splice(k, IH[k, i], IE[k, i], item_text(k, i))
  if (last) EOFNL[k] = 1
  reparse(k)
}

function task_status(k, i, s) {
  X[k, i, "status"] = s
  item_rewrite(k, i)
}

function item_drop(k, i,   a, b) {
  a = IH[k, i]; b = IE[k, i]
  ed_splice(k, a, b, "")
  ed_trim(k)
  reparse(k)
}

# ---- the answers ----
function answer(s) { O(s "\n") }

function recs_refs(key, arr,   n, i) {
  n = plist(key, arr)
  if (n < 0) return 0
  for (i = 1; i <= n; i++) oneline(key " element", arr[i])
  return n
}

# ---- the functions ----
function f_session_create(   R, nr, S, ob, att, k) {
  need("objective"); need("attention")
  ob = pv("objective"); att = pv("attention")
  oneline("objective", ob); oneline("attention", att)
  nr = recs_refs("repos", R)
  UNITS[U] = 1
  k = U "|state"; PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1
  ed_splice(k, 1, 0, c_state("ACTIVE", "A1", ob, R, nr, 0, S, 0, "", ""))
  parse_state(U)
  k = U "|backlog"; PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1
  stage(k)
  k = U "|knowledge"; PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1
  stage(k)
  k = U "|journal"; PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1
  ed_append(k, c_anchor("A1", NULLV, "A0", att, NULLV, ""), 1)
  stage(k)
  stage(U "|state")
  answer("{\"unit\":" jstr(U) ",\"state\":" state_json(U) "}")
}

# unit_listing_json(u): the UnitSummary fields in their order, then last_event last (the
# UnitListing schema of session.list)
function unit_listing_json(u,   j) {
  j = state_json(u)
  return substr(j, 1, length(j) - 1) ",\"last_event\":" jnull(last_event(u "|journal")) "}"
}

function f_session_list(   u, first, n, i) {
  n = 0
  for (i = 1; i <= NUNITS; i++) { u = UL[i]; parse_state(u); n++ }
  O("{\"store\":" jstr(n > 0 ? "present" : "absent") ",\"units\":[")
  for (i = 1; i <= NUNITS; i++) O((i > 1 ? "," : "") unit_listing_json(UL[i]))
  answer("]}")
}

# active_task(kb): the derived move: the first task in backlog order with exact
# IN_PROGRESS, else the first open task, open being the board's rule, every status but
# DONE, so a legacy or unknown status is the move and prints as stored; returns its index
# or 0, its status in AT_STATUS
function active_task(kb,   i) {
  AT_STATUS = NULLV
  if (PRE[kb] == NULLV) return 0
  for (i = 1; i <= NI[kb]; i++) {
    if (IK[kb, i] != "task") continue
    if (X[kb, i, "status"] == "IN_PROGRESS") { AT_STATUS = "IN_PROGRESS"; return i }
  }
  for (i = 1; i <= NI[kb]; i++) {
    if (IK[kb, i] != "task") continue
    if (X[kb, i, "status"] != "DONE") { AT_STATUS = X[kb, i, "status"]; return i }
  }
  return 0
}

# st_active(u): the state's status reads exact ACTIVE after the same edge whitespace trim
# the data script's active scan applies, so the answered derived fields match the units the
# scan fetched
function st_active(u,   s) {
  s = ST[u, "status"]
  sub(/^[ \t]+/, "", s)
  sub(/[ \t\r]+$/, "", s)
  return s == "ACTIVE"
}

# active_listing_json(u, active): the UnitSummary fields, then the derived move (next_task
# null when none), the task count, and the backlog presence; the active view reads no
# journal, so it carries no thread count and no last_event; a non-ACTIVE unit's backlog is
# not read, so its derived fields are null, never a false backlog_present or a zero count
# (the renderer prints ACTIVE units alone)
function active_listing_json(u, aa,   kb, nt, ns, j, i) {
  kb = u "|backlog"
  j = state_json(u)
  if (!aa) return substr(j, 1, length(j) - 1) ",\"next_task\":null,\"task_count\":null,\"backlog_present\":null}"
  ns = 0
  for (i = 1; i <= NI[kb]; i++) if (IK[kb, i] == "task") ns++
  nt = active_task(kb)
  return substr(j, 1, length(j) - 1) ",\"next_task\":" (nt ? "{\"slug\":" jstr(X[kb, nt, "slug"]) ",\"status\":" jstr(AT_STATUS) "}" : "null") ",\"task_count\":" ns ",\"backlog_present\":" jbool(PRE[kb] != NULLV) "}"
}

function f_session_active(   i, u) {
  O("{\"store\":" jstr(NUNITS > 0 ? "present" : "absent") ",\"units\":[")
  for (i = 1; i <= NUNITS; i++) {
    u = UL[i]
    parse_unit(u, "backlog")
    O((i > 1 ? "," : "") active_listing_json(u, st_active(u)))
  }
  answer("]}")
}

function f_state_refs(   i) {
  parse_state(U)
  for (i = 1; i <= ST[U, "s#"]; i++) print ST[U, "s", i]
}

function f_session_load(   i, r) {
  parse_unit(U, "backlog knowledge journal")
  for (i = 1; i <= ST[U, "s#"]; i++) { r = ST[U, "s", i]; if (r in UNITS && !((r, "done") in PARSED)) { parse_unit(r, "backlog knowledge journal"); PARSED[r, "done"] = 1 } }
  O("{\"unit\":" jstr(U) ",\"state\":" state_json(U) ",\"backlog\":")
  backlog_out(U)
  O(",\"knowledge\":")
  knowledge_out(U)
  O(",\"board\":")
  if (PRE[U "|journal"] == NULLV) O("null"); else board_out(U)
  O(",\"refs\":[")
  for (i = 1; i <= ST[U, "s#"]; i++) { O(i > 1 ? "," : ""); refload_out(ST[U, "s", i]) }
  answer("]}")
}

function f_session_refload(   i, r, n) {
  n = ENVIRON["PX_NA"] + 0
  for (i = 0; i <= n; i++) {
    r = (i == 0) ? U : ENVIRON["PX_A" i]
    if (!((r, "done") in PARSED)) { parse_unit(r, "backlog knowledge journal"); PARSED[r, "done"] = 1 }
  }
  O("{\"refs\":[")
  for (i = 0; i <= n; i++) { O(i > 0 ? "," : ""); refload_out(i == 0 ? U : ENVIRON["PX_A" i]) }
  answer("]}")
}

function f_session_board() {
  parse_unit(U, "backlog journal")
  if (PRE[U "|journal"] == NULLV) nf("artifact", "journal")
  board_out(U, 1)
  answer("")
}

# ---- the audit (R16, R17): the record checks, then the posix grammar checks over the
# journal's lines; the findings in the deterministic order of docs/the-engine.md ----
function af(code, sev, slug, line, detail, first, occ) {
  NAF++
  AF[NAF] = "{\"code\":" jstr(code) ",\"severity\":" jstr(sev) ",\"slug\":" jnull(slug) ",\"line\":" (line == NULLV ? "null" : line) ",\"detail\":" jnull(detail) ",\"first_line\":" (first == NULLV ? "null" : first) ",\"occurrence\":" (occ == NULLV ? "null" : occ) "}"
  if (sev == "error") ADIRTY = 1
}

function audit_json(u,   kj, kb, i, j, c, t, s, owner, head, line, val, n, words, found, w, PRIOR, SEEN, DONEW, first, o, FIRSTLINE, e) {
  kj = u "|journal"; kb = u "|backlog"
  NAF = 0; ADIRTY = 0
  split("", SEEN); split("", DONEW); split("", FIRSTLINE)
  # group 1, in journal position order
  owner = NULLV
  for (line = 1; line <= NL[kj]; line++) {
    head = L[kj, line]
    if (head ~ /^@entry /) {
      s = head; sub(/^@entry[ \t]+/, "", s); sub(/[ \t].*$/, "", s)
      owner = s
      if (s in FIRSTLINE) { SEEN[s]++; af("LEGACY_DUPLICATE_SLUG", "warning", s, line, NULLV, FIRSTLINE[s], SEEN[s]) }
      else { FIRSTLINE[s] = line; SEEN[s] = 1 }
      if (s !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) af("DATELESS_SLUG", "error", s, line, NULLV, NULLV, NULLV)
      if (head ~ /\[(THREAD|KNOWLEDGE|RHYTHM):/) af("INLINE_MARKER", "error", s, line, NULLV, NULLV, NULLV)
      continue
    }
    if (head ~ /^  \[(THREAD|KNOWLEDGE|GROUP|RHYTHM|REF|CLOSES|SUPERSEDES):/) af("BRACKETED_FIELD", "error", owner, line, substr(head, 3), NULLV, NULLV)
    n = split(head, words, /[ \t]+/)
    w = (words[1] == "") ? words[2] : words[1]
    if (w == "CLOSES:" || w == "SUPERSEDES:") {
      val = head
      sub(/^.*(CLOSES|SUPERSEDES):[ \t]*/, "", val)
      sub(/[ \t]+-[ \t]+.*$/, "", val)
      sub(/[ \t]+\(.*$/, "", val)
      n = split(val, words, /[ \t]+/)
      found = 0
      for (j = 1; j <= n; j++) if (words[j] ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/) found = 1
      if (!found) af("SLUGLESS_CLOSER", "error", owner, line, NULLV, NULLV, NULLV)
    }
  }
  # group 2: the record checks; a closer target counts only when an entry before the closing
  # entry holds it, the order derive_journal closes by, so a self closer reads dangling
  split("", SEEN); split("", PRIOR)
  for (i = 1; i <= NI[kj]; i++) {
    if (IK[kj, i] != "entry") continue
    for (c = 1; c <= X[kj, i, "c#"]; c++) for (t = 1; t <= X[kj, i, "c", c, "t#"]; t++) {
      s = X[kj, i, "c", c, "t", t]
      if (!(s in PRIOR) && !(s in SEEN)) { SEEN[s] = 1; af("DANGLING_CLOSER", "error", X[kj, i, "slug"], X[kj, i, "c", c, "line"], s, NULLV, NULLV) }
    }
    PRIOR[X[kj, i, "slug"]] = 1
  }
  for (i = 1; i <= NI[kj]; i++) if (IK[kj, i] == "entry" && X[kj, i, "know"] && CLBY[kj, i] == 0) af("UNHARVESTED_KNOWLEDGE", "error", X[kj, i, "slug"], IH[kj, i], NULLV, NULLV, NULLV)
  for (i = 1; i <= NI[kj]; i++) {
    if (IK[kj, i] != "entry") continue
    if (X[kj, i, "what"] != NULLV) DONEW[++DONEW[0]] = X[kj, i, "what"]
    for (e = 1; e <= X[kj, i, "e#"]; e++) if (X[kj, i, "e", e, "key"] == "WHAT") DONEW[++DONEW[0]] = X[kj, i, "e", e, "val"]
  }
  for (i = 1; i <= NI[kb]; i++) {
    if (IK[kb, i] != "task" || X[kb, i, "status"] != "DONE") continue
    s = "backlog/" X[kb, i, "slug"] ": DONE"
    found = 0
    for (j = 1; j <= DONEW[0] && !found; j++) if (index(DONEW[j], s) > 0) found = 1
    if (!found) af("DONE_WITHOUT_EVENT", "error", X[kb, i, "slug"], NULLV, NULLV, NULLV, NULLV)
  }
  for (i = 1; i <= NI[kj]; i++) {
    if (IK[kj, i] != "entry") continue
    s = X[kj, i, "slug"]
    if (s ~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[a-zA-Z0-9_-]+[a-zA-Z0-9]$/ && substr(s, 1, 10) >= "2026-09-18" && X[kj, i, "thread"] == NULLV) af("MISSING_THREAD", "error", s, IH[kj, i], NULLV, NULLV, NULLV)
  }
  o = "{\"unit\":" jstr(u) ",\"clean\":" jbool(!ADIRTY) ",\"findings\":["
  for (i = 1; i <= NAF; i++) o = o (i > 1 ? "," : "") AF[i]
  o = o "],\"open_threads\":["
  first = 1
  for (i = 1; i <= NI[kj]; i++) {
    if (IK[kj, i] != "entry" || CLBY[kj, i] != 0) continue
    if (X[kj, i, "thread"] == NULLV || X[kj, i, "thread"] == "none") continue
    o = o (first ? "" : ",") "{\"slug\":" jstr(X[kj, i, "slug"]) ",\"thread\":" jstr(X[kj, i, "thread"]) ",\"line\":" X[kj, i, "tline"] "}"
    first = 0
  }
  return o "]}"
}

function f_session_audit() {
  parse_unit(U, "backlog journal")
  if (PRE[U "|journal"] == NULLV) nf("artifact", "journal")
  answer(audit_json(U))
}

# session.stamp: the new period's anchor, its number and date (end review item 7); no text
function f_session_stamp(   dt, ca, n, kj) {
  parse_unit(U, "journal")
  not_closed()
  need("date"); dt = pv("date"); want_date(dt)
  ca = ST[U, "anchor"]
  if (ca !~ /^A[0-9]+$/ || !((U, "current_anchor") in SLINE)) die(2, "ERR_STORAGE_CORRUPT", "the state's current_anchor '" ca "' is not A<N>")
  n = substr(ca, 2) + 1
  ST[U, "anchor"] = "A" n
  st_write(U)
  kj = U "|journal"
  if (!(kj in PRES)) TYPE[kj] = "journal"
  ed_append(kj, c_anchor("A" n, dt, NULLV, NULLV, NULLV, ""), 1)
  reparse(kj)
  stage(U "|state"); stage(kj)
  answer("{\"unit\":" jstr(U) ",\"previous_anchor\":" jstr(ca) ",\"current_anchor\":" jstr("A" n) ",\"receipt\":" anchor_json(kj, NI[kj]) "}")
}

# session.objective: the reworded objective and its receipt of the old and new wording
function f_session_objective(   ob, old, dt, r) {
  parse_unit(U, "journal")
  not_closed()
  need("objective"); ob = pv("objective"); oneline("objective", ob)
  need("date"); dt = pv("date"); want_date(dt)
  old = ST[U, "obj"]
  if (ob == old) die(1, "ERR_INVALID_ARGUMENT", "the objective is unchanged")
  ST[U, "obj"] = ob
  st_write(U)
  r = receipt("objective reworded from \"" old "\" to \"" ob "\"", dt "-objective")
  stage(U "|state"); stage(U "|journal")
  answer("{\"unit\":" jstr(U) ",\"previous_objective\":" jstr(old) ",\"objective\":" jstr(ob) ",\"receipt\":" entry_json(U "|journal", r, 0) "}")
}

function f_session_refs(   n, i, r, R, o) {
  parse_state(U)
  not_closed()
  n = ENVIRON["PX_NA"] + 0
  for (i = 1; i <= n; i++) { r = ENVIRON["PX_A" i]; if (!(r in UNITS)) die(1, "ERR_ENTITY_NOT_FOUND", "unit '" r "' not found"); R[i] = r }
  ST[U, "hasrs"] = 1; ST[U, "s#"] = n
  for (i = 1; i <= n; i++) ST[U, "s", i] = R[i]
  st_write(U)
  stage(U "|state")
  o = "["
  for (i = 1; i <= ST[U, "s#"]; i++) o = o (i > 1 ? "," : "") jstr(ST[U, "s", i])
  answer("{\"unit\":" jstr(U) ",\"ref_sessions\":" o "]}")
}

function f_session_close(   kb, i, first, o) {
  parse_unit(U, "backlog journal")
  if (ST[U, "status"] != "ACTIVE") die(1, "ERR_INVALID_TRANSITION", "unit '" U "' is " ST[U, "status"] "; session.close moves only from ACTIVE")
  ST[U, "status"] = "CLOSED"
  st_write(U)
  stage(U "|state")
  kb = U "|backlog"
  o = "["; first = 1
  for (i = 1; i <= NI[kb]; i++) if (IK[kb, i] == "task" && X[kb, i, "status"] != "DONE") { o = o (first ? "" : ",") jstr(X[kb, i, "slug"]); first = 0 }
  answer("{\"unit\":" jstr(U) ",\"status\":\"CLOSED\",\"open_tasks\":" o "],\"audit\":" audit_json(U) "}")
}

function f_session_reopen() {
  parse_state(U)
  if (ST[U, "status"] != "CLOSED") die(1, "ERR_INVALID_TRANSITION", "unit '" U "' is " ST[U, "status"] "; session.reopen moves only from CLOSED")
  ST[U, "status"] = "ACTIVE"
  st_write(U)
  stage(U "|state")
  answer("{\"unit\":" jstr(U) ",\"status\":\"ACTIVE\"}")
}

function f_session_units(   repo, i, j, u, first, K, nk, t, m) {
  repo = U
  O("{\"repo\":" jstr(repo) ",\"units\":[")
  first = 1; nk = 0
  for (i = 1; i <= NUNITS; i++) {
    u = UL[i]; parse_state(u)
    m = 0
    for (j = 1; j <= ST[u, "r#"]; j++) {
      if (ST[u, "r", j] == repo) m = 1
      if (!(ST[u, "r", j] in KNOWN)) { KNOWN[ST[u, "r", j]] = 1; K[++nk] = ST[u, "r", j] }
    }
    if (m) { O((first ? "" : ",") state_json(u)); first = 0 }
  }
  for (i = 2; i <= nk; i++) { t = K[i]; for (j = i - 1; j >= 1 && K[j] > t; j--) K[j + 1] = K[j]; K[j + 1] = t }
  answer("],\"known_repos\":" jlist(K, nk) "}")
}


# ---- tasks ----
function f_task_add(   kb, s, ob, desc, crit, det, R, nr) {
  parse_unit(U, "backlog")
  not_closed()
  kb = U "|backlog"; s = ENVIRON["PX_A1"]
  if (find_task(kb, s)) ex("task", s)
  need("objective"); ob = pv("objective"); oneline("objective", ob)
  desc = nb(pv("desc")); crit = nb(pv("criteria")); det = nb(pv("details"))
  nocr("desc", desc); nocr("criteria", crit); nocr("details", det)
  nr = recs_refs("refs", R)
  if (!(kb in PRES)) TYPE[kb] = "backlog"
  ed_append(kb, c_task(s, "TODO", ob, R, nr, desc, crit, det, NULLV, "", ""), 0)
  reparse(kb)
  stage(kb)
  answer("{\"unit\":" jstr(U) ",\"task\":" task_json(kb, find_task(kb, s)) "}")
}

# task.update: the task takes the given typed fields (a present key replaces its field) and is
# rewritten canonical in place with every field it holds (its extra fields, head text, and
# extra lines kept); every other byte of the backlog stays
function f_task_update(   kb, s, R, nr, v, i) {
  parse_unit(U, "backlog")
  not_closed()
  kb = U "|backlog"; s = ENVIRON["PX_A1"]
  if (!(i = find_task(kb, s))) nf("task", s)
  if (has("objective")) oneline("objective", pv("objective"))
  nr = plist("refs", R)
  for (v = 1; v <= nr; v++) oneline("refs element", R[v])
  nocr("desc", pv("desc")); nocr("criteria", pv("criteria")); nocr("details", pv("details"))
  if (has("objective")) X[kb, i, "objective"] = pv("objective")
  if (nr >= 0) { X[kb, i, "r#"] = nr; for (v = 1; v <= nr; v++) X[kb, i, "r", v] = R[v] }
  if (has("desc")) X[kb, i, "desc"] = nb(pv("desc"))
  if (has("criteria")) X[kb, i, "crit"] = nb(pv("criteria"))
  if (has("details")) X[kb, i, "det"] = nb(pv("details"))
  item_rewrite(kb, i)
  stage(kb)
  answer("{\"unit\":" jstr(U) ",\"task\":" task_json(kb, find_task(kb, s)) "}")
}

function transition(kind, x, st, fn, allowed) {
  die(1, "ERR_INVALID_TRANSITION", kind " '" x "' is " st "; " fn " moves only from " allowed)
}

function f_task_start(   kb, s, i) {
  parse_unit(U, "backlog")
  not_closed()
  kb = U "|backlog"; s = ENVIRON["PX_A1"]
  if (!(i = find_task(kb, s))) nf("task", s)
  if (X[kb, i, "status"] != "TODO") transition("task", s, X[kb, i, "status"], "task.start", "TODO")
  task_status(kb, i, "IN_PROGRESS")
  stage(kb)
  answer("{\"unit\":" jstr(U) ",\"task\":" taskitem_json(kb, find_task(kb, s)) "}")
}

# want_anchor([u]): the state's current_anchor is A<N>, else the store is corrupt (the rule of
# session.stamp, D43): an entry never takes a malformed or missing anchor; a unit given is
# named in the refusal
function want_anchor(u,   ca, w) {
  w = (u == "") ? "" : "unit '" u "': "
  if (u == "") u = U
  ca = ST[u, "anchor"]
  if (ca !~ /^A[0-9]+$/ || !((u, "current_anchor") in SLINE)) die(2, "ERR_STORAGE_CORRUPT", w "the state's current_anchor '" ca "' is not A<N>")
}

# receipt(what, base slug): the receipt entry appended to the journal; returns its index
function receipt(what, base,   kj, slug) {
  want_anchor()
  kj = U "|journal"
  if (!(kj in PRES)) TYPE[kj] = "journal"
  slug = gen_slug(kj, base)
  ed_append(kj, c_entry(slug, ST[U, "anchor"], what, NULLV, NULLV, "none", EMPTY, 0, "", 0, NULLV, NULLV, "", ""), 0)
  reparse(kj)
  return NI[kj]
}

function f_task_complete(   kb, kj, s, i, ev, d, r) {
  parse_unit(U, "backlog journal")
  not_closed()
  kb = U "|backlog"; kj = U "|journal"; s = ENVIRON["PX_A1"]
  if (!(i = find_task(kb, s))) nf("task", s)
  if (X[kb, i, "status"] != "TODO" && X[kb, i, "status"] != "IN_PROGRESS") transition("task", s, X[kb, i, "status"], "task.complete", "TODO or IN_PROGRESS")
  need("evidence"); need("date")
  ev = pv("evidence"); d = pv("date"); oneline("evidence", ev); want_date(d)
  task_status(kb, i, "DONE")
  r = receipt("backlog/" s ": DONE (" ev ")", d "-" s "-completed")
  stage(kb); stage(kj)
  answer("{\"unit\":" jstr(U) ",\"task\":" taskitem_json(kb, find_task(kb, s)) ",\"receipt\":" entry_json(kj, r, 0) "}")
}

function f_task_reopen(   kb, s, i) {
  parse_unit(U, "backlog")
  not_closed()
  kb = U "|backlog"; s = ENVIRON["PX_A1"]
  if (!(i = find_task(kb, s))) nf("task", s)
  if (X[kb, i, "status"] != "IN_PROGRESS" && X[kb, i, "status"] != "DONE") transition("task", s, X[kb, i, "status"], "task.reopen", "IN_PROGRESS or DONE")
  task_status(kb, i, "TODO")
  stage(kb)
  answer("{\"unit\":" jstr(U) ",\"task\":" taskitem_json(kb, find_task(kb, s)) "}")
}

function f_task_drop(   kb, kj, s, i, rs, d, r) {
  parse_unit(U, "backlog journal")
  not_closed()
  kb = U "|backlog"; kj = U "|journal"; s = ENVIRON["PX_A1"]
  if (!(i = find_task(kb, s))) nf("task", s)
  if (X[kb, i, "status"] == "IN_PROGRESS") transition("task", s, "IN_PROGRESS", "task.drop", "TODO or DONE; reopen an IN_PROGRESS task before dropping it")
  need("date"); d = pv("date"); want_date(d)
  rs = has("reason") ? pv("reason") : "task dropped"
  oneline("reason", rs)
  item_drop(kb, i)
  r = receipt("backlog/" s ": DROPPED (" rs ")", d "-" s "-dropped")
  stage(kb); stage(kj)
  answer("{\"unit\":" jstr(U) ",\"slug\":" jstr(s) ",\"receipt\":" entry_json(kj, r, 0) "}")
}

function f_task_list(   kb, st, i, first) {
  parse_unit(U, "backlog")
  kb = U "|backlog"; st = ENVIRON["PX_A1"]
  O("{\"unit\":" jstr(U) ",\"tasks\":[")
  first = 1
  for (i = 1; i <= NI[kb]; i++) if (IK[kb, i] == "task" && (st == "all" || X[kb, i, "status"] == st)) { O((first ? "" : ",") taskitem_json(kb, i)); first = 0 }
  answer("]}")
}

function f_task_get(   kb, s, i) {
  parse_unit(U, "backlog")
  kb = U "|backlog"; s = ENVIRON["PX_A1"]
  if (!(i = find_task(kb, s))) nf("task", s)
  answer("{\"unit\":" jstr(U) ",\"task\":" task_json(kb, i) "}")
}

# ---- journal entries ----
function f_entry_record(   kj, what, grp, th, rh, kn, R, nr, r, fr, nc, c, kind, T, nt, t, vd, rs, cls, slug, d, ep) {
  parse_unit(U, "journal")
  not_closed()
  want_anchor()
  kj = U "|journal"
  if (!(kj in PRES)) TYPE[kj] = "journal"
  if (has("slug")) {
    slug = pv("slug"); oneline("slug", slug)
    if (slug !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) die(1, "ERR_INVALID_ARGUMENT", "malformed slug '" slug "'")
    if (held(kj, slug)) ex("entry", slug)
  }
  need("what"); what = pv("what"); oneline("what", what)
  grp = pv("group"); th = pv("thread"); rh = pv("rhythm")
  oneline("group", grp); oneline("thread", th); oneline("rhythm", rh)
  kn = (pv("knowledge") == "true") ? 1 : 0
  if (has("knowledge") && pv("knowledge") != "true" && pv("knowledge") != "false") die(1, "ERR_INVALID_ARGUMENT", "knowledge takes true or false")
  nr = recs_refs("refs", R)
  fr = 0
  for (r = 1; r <= nr; r++) if (R[r] ~ /^unit#[A-Za-z0-9][A-Za-z0-9_-]*\/finding\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/) fr = 1
  nc = has("closers.count") ? PAY["closers.count"] : 0
  if (nc !~ /^[0-9]+$/) die(1, "ERR_INVALID_ARGUMENT", "malformed closers.count")
  cls = ""
  for (c = 1; c <= nc + 0; c++) {
    kind = pv("closers." c ".kind")
    if (kind != "CLOSES" && kind != "SUPERSEDES") die(1, "ERR_INVALID_ARGUMENT", "closers." c ".kind takes CLOSES or SUPERSEDES")
    nt = plist("closers." c ".targets", T)
    if (nt < 1) die(1, "ERR_INVALID_ARGUMENT", "closers." c " names no target")
    vd = pv("closers." c ".verdict"); rs = pv("closers." c ".reason")
    if (vd != NULLV && vd !~ /^(done|superseded|dropped|folded|harvested|discarded)$/) die(1, "ERR_INVALID_ARGUMENT", "closers." c ".verdict takes done, superseded, dropped, folded, harvested, or discarded")
    oneline("closers." c ".reason", rs)
    if (rs != NULLV && (index(rs, "(") || index(rs, ")"))) die(1, "ERR_INVALID_ARGUMENT", "closers." c ".reason holds a parenthesis")
    if (vd != NULLV && rs == NULLV) die(1, "ERR_INVALID_ARGUMENT", "closers." c " carries a verdict without a reason")
    for (t = 1; t <= nt; t++) {
      if (!isdateslug(T[t])) die(1, "ERR_INVALID_ARGUMENT", "closers." c " target '" T[t] "' is not a date-slug")
      if (!held(kj, T[t])) nf("entry", T[t])
      if (vd != "harvested" && vd != "discarded" && live_flag(kj, T[t])) die(1, "ERR_INVALID_ARGUMENT", "closer target " T[t] " carries KNOWLEDGE: true; close it harvested (with a --ref to the finding it landed) or discarded, not " (vd == NULLV ? "none" : vd))
    }
    if (vd == "harvested" && !fr) die(1, "ERR_INVALID_ARGUMENT", "a harvested closer needs a --ref naming the finding it landed, unit#<unit>/finding/<NAME>")
    cls = cls c_closer(kind, T, nt, vd, rs, NULLV) "\n"
  }
  if (!has("slug")) {
    need("date"); need("epoch")
    d = pv("date"); ep = pv("epoch"); want_date(d); want_epoch(ep)
    slug = gen_slug(kj, d "-event-" ep)
  }
  ed_append(kj, c_entry(slug, ST[U, "anchor"], what, grp, rh, th, R, nr, cls, kn, NULLV, NULLV, "", ""), 0)
  reparse(kj)
  stage(kj)
  answer("{\"unit\":" jstr(U) ",\"entry\":" entry_json(kj, NI[kj], 0) "}")
}

function f_entry_get(   kj, s) {
  parse_unit(U, "journal")
  kj = U "|journal"; s = ENVIRON["PX_A1"]
  if (!held(kj, s)) nf("entry", s)
  answer("{\"unit\":" jstr(U) ",\"entry\":" entry_json(kj, LASTOCC[kj, s], 1) "}")
}

function f_entry_list(   kj, i, first, n, a, anc, grp, fa, fg) {
  parse_unit(U, "journal")
  kj = U "|journal"
  n = ENVIRON["PX_NA"] + 0
  fa = 0; fg = 0
  for (i = 1; i <= n; i++) {
    a = ENVIRON["PX_A" i]
    if (a ~ /^--anchor=/) { fa = 1; anc = substr(a, 10) }
    else if (a ~ /^--group=/) { fg = 1; grp = substr(a, 9) }
  }
  O("{\"unit\":" jstr(U) ",\"entries\":[")
  first = 1
  for (i = 1; i <= NI[kj]; i++) {
    if (IK[kj, i] != "entry") continue
    if (fa && X[kj, i, "anchor"] != anc) continue
    if (fg && X[kj, i, "group"] != grp) continue
    O((first ? "" : ",") entryitem_json(kj, i)); first = 0
  }
  answer("]}")
}

function f_entry_closure(   kj, s, last, j, c, t, first, o, hit, a) {
  parse_unit(U, "journal")
  kj = U "|journal"; s = ENVIRON["PX_A1"]
  if (!held(kj, s)) nf("entry", s)
  last = LASTOCC[kj, s]
  o = ""; first = 1
  for (j = last + 1; j <= NI[kj]; j++) {
    if (IK[kj, j] != "entry") continue
    for (c = 1; c <= X[kj, j, "c#"]; c++) {
      hit = 0
      for (t = 1; t <= X[kj, j, "c", c, "t#"]; t++) if (X[kj, j, "c", c, "t", t] == s) hit = 1
      if (!hit) continue
      a = X[kj, j, "anchor"]
      o = o (first ? "" : ",") "{\"by\":" jstr(X[kj, j, "slug"]) ",\"by_anchor\":" jstr(a == NULLV ? "" : a) ",\"closer\":" closer_json(kj, j, c) "}"
      first = 0
    }
  }
  answer("{\"unit\":" jstr(U) ",\"slug\":" jstr(s) ",\"occurrence\":" OCC[kj, last] ",\"closed\":" jbool(CLBY[kj, last] != 0) ",\"closers\":[" o "]}")
}

# ---- findings ----
function f_finding_add(   kk, n, sm, R, nr, sp, sr) {
  parse_unit(U, "knowledge")
  not_closed()
  kk = U "|knowledge"; n = ENVIRON["PX_A1"]
  if (find_finding(kk, n)) ex("finding", n)
  sp = pv("supersedes")
  if (sp != NULLV) {
    oneline("supersedes", sp)
    if (sp !~ /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/) die(1, "ERR_INVALID_ARGUMENT", "supersedes takes a finding NAME: '" sp "'")
    if (!find_finding(kk, sp)) nf("finding", sp)
  }
  need("summary"); sm = pv("summary"); nocr("summary", sm)
  sr = has("supersedes_reason") ? pv("supersedes_reason") : "superseded"
  oneline("supersedes_reason", sr)
  nr = recs_refs("refs", R)
  add_finding(kk, n, sp, sr, R, nr, sm)
  answer("{\"unit\":" jstr(U) ",\"finding\":" finding_json(kk, find_finding(kk, n)) "}")
}

function add_finding(kk, n, sp, sr, R, nr, sm) {
  if (!(kk in PRES)) TYPE[kk] = "knowledge"
  ed_append(kk, c_finding(n, sp, sr, R, nr, nb(sm), NULLV, "", ""), 0)
  reparse(kk)
  stage(kk)
}

# finding.update: the finding takes the given summary and or refs and is rewritten canonical
# in place with every field it holds; every other byte of the knowledge stays
function f_finding_update(   kk, n, i, R, nr, m) {
  parse_unit(U, "knowledge")
  not_closed()
  kk = U "|knowledge"; n = ENVIRON["PX_A1"]
  if (!(i = find_finding(kk, n))) nf("finding", n)
  nocr("summary", pv("summary"))
  nr = plist("refs", R)
  for (m = 1; m <= nr; m++) oneline("refs element", R[m])
  if (has("summary")) X[kk, i, "summ"] = nb(pv("summary"))
  if (nr >= 0) { X[kk, i, "r#"] = nr; for (m = 1; m <= nr; m++) X[kk, i, "r", m] = R[m] }
  item_rewrite(kk, i)
  stage(kk)
  answer("{\"unit\":" jstr(U) ",\"finding\":" finding_json(kk, find_finding(kk, n)) "}")
}

function f_finding_supersede(   kk, old, nw, sm, R, nr, sr) {
  parse_unit(U, "knowledge")
  not_closed()
  kk = U "|knowledge"; old = ENVIRON["PX_A1"]; nw = ENVIRON["PX_A2"]
  if (!find_finding(kk, old)) nf("finding", old)
  if (find_finding(kk, nw)) ex("finding", nw)
  need("summary"); sm = pv("summary"); nocr("summary", sm)
  sr = has("reason") ? pv("reason") : "superseded"
  oneline("reason", sr)
  nr = recs_refs("refs", R)
  add_finding(kk, nw, old, sr, R, nr, sm)
  answer("{\"unit\":" jstr(U) ",\"superseded\":" jstr(old) ",\"finding\":" finding_json(kk, find_finding(kk, nw)) "}")
}

function f_finding_drop(   kk, n, i) {
  parse_unit(U, "knowledge")
  not_closed()
  kk = U "|knowledge"; n = ENVIRON["PX_A1"]
  if (!(i = find_finding(kk, n))) nf("finding", n)
  item_drop(kk, i)
  stage(kk)
  answer("{\"unit\":" jstr(U) ",\"name\":" jstr(n) "}")
}

function f_finding_get(   kk, n, i) {
  parse_unit(U, "knowledge")
  kk = U "|knowledge"; n = ENVIRON["PX_A1"]
  if (!(i = find_finding(kk, n))) nf("finding", n)
  answer("{\"unit\":" jstr(U) ",\"finding\":" finding_json(kk, i) "}")
}

function f_finding_list(   kk, i, first, act) {
  parse_unit(U, "knowledge")
  kk = U "|knowledge"; act = (ENVIRON["PX_A1"] == "active")
  O("{\"unit\":" jstr(U) ",\"findings\":[")
  first = 1
  for (i = 1; i <= NI[kk]; i++) {
    if (IK[kk, i] != "finding") continue
    if (act && ((kk, X[kk, i, "name"]) in SUPBY)) continue
    O((first ? "" : ",") findingitem_json(kk, i)); first = 0
  }
  answer("]}")
}

# ---- lanes ----
function lane_needed(l) { if (!((U, l) in HASLANE)) nf("lane", l) }

# lane.create replace (PX_A2): an unstarted lane, its journal holding no item and an empty or
# absent preamble, takes the new recipe alone; its journal and report stay as they are
function f_lane_create(   l, k) {
  parse_state(U)
  not_closed()
  l = ENVIRON["PX_A1"]
  if (ENVIRON["PX_A2"] == "replace") {
    lane_needed(l)
    k = U "|lane/" l "/journal"
    parse_art(k, "lanejournal")
    if (NI[k] > 0 || (PRE[k] != NULLV && PRE[k] != "")) transition("lane", l, "started", "lane.create replace", "an unstarted lane; a started lane takes a new lane")
    stage_doc("lanes/" l "/recipe.md")
    answer("{\"unit\":" jstr(U) ",\"lane\":" jstr(l) "}")
    return
  }
  if ((U, l) in HASLANE) ex("lane", l)
  stage_doc("lanes/" l "/recipe.md")
  k = U "|lane/" l "/journal"; PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1
  stage(k)
  answer("{\"unit\":" jstr(U) ",\"lane\":" jstr(l) "}")
}

function f_lane_record(   l, k, what, th, R, nr, slug, d, ep, i) {
  l = ENVIRON["PX_A1"]
  parse_state(U)
  not_closed()
  lane_needed(l)
  k = U "|lane/" l "/journal"
  parse_art(k, "lanejournal")
  if (has("slug")) {
    slug = pv("slug"); oneline("slug", slug)
    if (slug !~ /^[A-Za-z0-9][A-Za-z0-9_-]*$/) die(1, "ERR_INVALID_ARGUMENT", "malformed slug '" slug "'")
    if (held(k, slug)) die(1, "ERR_ENTITY_EXISTS", "lane entry '" l "/" slug "' already exists in unit '" U "'")
  }
  need("what"); what = pv("what"); oneline("what", what)
  th = pv("thread"); oneline("thread", th)
  nr = recs_refs("refs", R)
  if (!has("slug")) {
    need("date"); need("epoch")
    d = pv("date"); ep = pv("epoch"); want_date(d); want_epoch(ep)
    slug = gen_slug(k, d "-event-" ep)
  }
  ed_append(k, c_entry(slug, NULLV, what, NULLV, NULLV, th, R, nr, "", 0, NULLV, NULLV, "", ""), 0)
  reparse(k)
  stage(k)
  answer("{\"unit\":" jstr(U) ",\"lane\":" jstr(l) ",\"entry\":" laneentry_json(k, NI[k], l) "}")
}

function f_lane_write_report(   l) {
  l = ENVIRON["PX_A1"]
  parse_state(U)
  not_closed()
  lane_needed(l)
  stage_doc("lanes/" l "/report.md")
  answer("{\"unit\":" jstr(U) ",\"lane\":" jstr(l) ",\"bytes\":" (ENVIRON["PX_DOCSIZE"] + 0) "}")
}

# doc_out(k): a document as one JSON string, streamed line by line, or null; a line that ended
# in a carriage return (CRL, model.awk) gets it back, so the document reads byte for byte
function doc_out(k,   i) {
  if (!(k in PRES)) { O("null"); return }
  O("\"")
  for (i = 1; i <= NL[k]; i++) O(jesc(L[k, i] (((k, i) in CRL) ? "\r" : "")) ((i < NL[k] || EOFNL[k]) ? "\\n" : ""))
  O("\"")
}

function lanejournal_items(k, l,   i) {
  for (i = 1; i <= NI[k]; i++) O((i > 1 ? "," : "") (IK[k, i] == "anchor" ? anchor_json(k, i) : laneentry_json(k, i, l)))
}

function f_lane_get(   l, a, k) {
  l = ENVIRON["PX_A1"]; a = ENVIRON["PX_A2"]
  lane_needed(l)
  k = U "|lane/" l "/" a
  if (a == "journal") {
    parse_art(k, "lanejournal")
    O("{\"unit\":" jstr(U) ",\"lane\":" jstr(l) ",\"artifact\":\"journal\",\"preamble\":" jnull(PRE[k]) ",\"items\":[")
    lanejournal_items(k, l)
    answer("]}")
    return
  }
  O("{\"unit\":" jstr(U) ",\"lane\":" jstr(l) ",\"artifact\":" jstr(a) ",\"content\":")
  doc_out(k)
  answer("}")
}

# ---- the transfer (unit.transfer, outside the record's 35 operations) ----
# xf_list(key, arr, re, what): a selector list of the payload into arr, each value matching
# re, a value given twice kept once in its first place; returns the count
function xf_list(key, arr, re, what,   n, i, A, m, SEEN) {
  split("", arr); split("", SEEN)
  n = plist(key, A)
  m = 0
  for (i = 1; i <= n; i++) {
    if (A[i] !~ re) die(1, "ERR_INVALID_ARGUMENT", "malformed " what " '" A[i] "'")
    if (A[i] in SEEN) continue
    SEEN[A[i]] = 1
    arr[++m] = A[i]
  }
  return m
}

function xf_sort(A, n,   i, j, t) { for (i = 2; i <= n; i++) { t = A[i]; for (j = i - 1; j >= 1 && A[j] > t; j--) A[j + 1] = A[j]; A[j + 1] = t } }

# fwd_line(s): s with every exact moved address (FWO, a source address) written as its target
# address (FWN): an occurrence counts when no address character stands before it and no slug
# character after it, a trailing period cut as the migration cuts it, so a longer slug never
# matches; FWDN counts the rewrites
function fwd_line(s,   j, old, n, o, pos, p, b, c, q, hit) {
  for (j = 1; j <= NFWD; j++) {
    old = FWO[j]
    n = length(old)
    if (index(s, old) == 0) continue
    o = ""
    pos = 1
    while ((p = index(substr(s, pos), old)) > 0) {
      p += pos - 1
      b = (p > 1) ? substr(s, p - 1, 1) : ""
      c = substr(s, p + n, 1)
      q = substr(s, p + n + 1, 1)
      hit = (b == "" || index(XADDR, b) == 0)
      if (hit && c != "") {
        if (c == ".") hit = (q == "" || index(XSLUG, q) == 0)
        else hit = (index(XADDR, c) == 0)
      }
      o = o substr(s, pos, p - pos) (hit ? FWN[j] : old)
      if (hit) FWDN++
      pos = p + n
    }
    s = o substr(s, pos)
  }
  return s
}

# fwd_art(k): the forward over every line of artifact k but the lines it never rewrites, the
# exclusions of ctx unit migrate: column 0 head and heading lines, a block artifact's NOTE,
# CLOSES, and SUPERSEDES lines, and the state's ref_sessions, repos, status, and
# current_anchor lines; a line is edited in place, its carriage return mark kept; returns
# whether a line changed
function fwd_art(k,   part, kind, i, s, t, ch) {
  part = substr(k, index(k, "|") + 1)
  if (part == "state") kind = "state"
  else if (part ~ /^lane\/[^\/]+\/(recipe|report)$/) kind = "doc"
  else kind = "block"
  ch = 0
  for (i = 1; i <= NL[k]; i++) {
    s = L[k, i]
    if (s ~ /^[@#]/) continue
    if (kind == "state" && s ~ /^(ref_sessions|repos|status|current_anchor)[ \t]*:/) continue
    if (kind == "block" && s ~ /^  (NOTE:[ \t]|CLOSES:|SUPERSEDES:)/) continue
    t = fwd_line(s)
    if (t != s) { L[k, i] = t; ch = 1 }
  }
  return ch
}

# unit.transfer (PX_UNIT the source, PX_A1 the target, PX_A2 dry for a dry run): the open
# tasks, findings, and open entries the payload selects move from the source to the target
# in one write. Each entry is copied to the target journal in source order from its typed
# fields (the target anchor, a provenance REF after its own, no closer line) while the
# original stays; each task and finding lands in the target whole and leaves the source; the
# exact addresses of the moved tasks and findings are forwarded in place over every artifact
# of both units; one pointer entry lands last in the source, closing the moved originals as
# superseded. PX_ROWS holds the outside referrer rows read before the locks, kept here for
# the moved addresses
function f_unit_transfer(   src, tgt, dry, kbS, kkS, kjS, kbT, kkT, kjT, TS, nts, FS, nfs, ES, nes, GS, ngs, i, j, n, SEL, E, nen, TI, ntk, FI, nfd, ESL, ETX, TSL, TTX, FSL, FTX, R, nr, d, ep, slug, P, np, cls, k, KEYS, nk, KSEEN, line, CHG, MV, o, first) {
  src = U; tgt = ENVIRON["PX_A1"]; dry = (ENVIRON["PX_A2"] == "dry")
  kbS = src "|backlog"; kkS = src "|knowledge"; kjS = src "|journal"
  kbT = tgt "|backlog"; kkT = tgt "|knowledge"; kjT = tgt "|journal"
  parse_unit(src, "backlog knowledge journal")
  parse_unit(tgt, "backlog knowledge journal")
  not_closed(src); not_closed(tgt)
  want_anchor(src); want_anchor(tgt)
  nts = xf_list("tasks", TS, "^[A-Za-z0-9][A-Za-z0-9_-]*$", "task slug")
  nfs = xf_list("findings", FS, "^[A-Za-z0-9_][A-Za-z0-9_-]*$", "finding NAME")
  nes = xf_list("entries", ES, "^[A-Za-z0-9][A-Za-z0-9_-]*$", "entry slug")
  ngs = xf_list("groups", GS, "^[A-Za-z0-9][A-Za-z0-9_-]*$", "group")
  if (nts + nfs + nes + ngs == 0) die(1, "ERR_INVALID_ARGUMENT", "unit.transfer takes at least one selector: a task, a finding, an entry, or a group")
  need("date"); need("epoch")
  d = pv("date"); ep = pv("epoch"); want_date(d); want_epoch(ep)
  ntk = 0
  for (j = 1; j <= nts; j++) {
    if (!(i = find_task(kbS, TS[j]))) nf("task", TS[j], src)
    if (X[kbS, i, "status"] == "DONE") transition("task", TS[j], "DONE", "unit.transfer", "an open status, every status but DONE")
    TI[++ntk] = i
  }
  nfd = 0
  for (j = 1; j <= nfs; j++) {
    if (!(i = find_finding(kkS, FS[j]))) nf("finding", FS[j], src)
    if (X[kkS, i, "supn"] != NULLV || ((kkS, FS[j]) in SUPBY)) die(1, "ERR_INVALID_TRANSITION", "finding '" FS[j] "' is in a supersession chain in unit '" src "'; unit.transfer moves only a finding that neither supersedes nor is superseded")
    FI[++nfd] = i
  }
  split("", SEL)
  for (j = 1; j <= nes; j++) {
    if (!held(kjS, ES[j])) nf("entry", ES[j], src)
    i = LASTOCC[kjS, ES[j]]
    if (CLBY[kjS, i] != 0) die(1, "ERR_INVALID_TRANSITION", "entry '" ES[j] "' is closed in unit '" src "'; unit.transfer moves only open entries")
    SEL[i] = 1
  }
  for (j = 1; j <= ngs; j++) {
    n = 0
    for (i = 1; i <= NI[kjS]; i++) if (IK[kjS, i] == "entry" && X[kjS, i, "group"] == GS[j] && CLBY[kjS, i] == 0) { SEL[i] = 1; n++ }
    if (n == 0) die(1, "ERR_ENTITY_NOT_FOUND", "group '" GS[j] "' selects no open entry in unit '" src "'")
  }
  nen = 0; split("", XSEEN)
  for (i = NI[kjS]; i >= 1; i--) if ((i in SEL) && !(X[kjS, i, "slug"] in XSEEN)) { XSEEN[X[kjS, i, "slug"]] = 1; E[++nen] = i }
  xf_sort(E, nen); xf_sort(TI, ntk); xf_sort(FI, nfd)
  for (j = 1; j <= nen; j++) if (held(kjT, X[kjS, E[j], "slug"])) ex("entry", X[kjS, E[j], "slug"], tgt)
  for (j = 1; j <= ntk; j++) if (find_task(kbT, X[kbS, TI[j], "slug"])) ex("task", X[kbS, TI[j], "slug"], tgt)
  for (j = 1; j <= nfd; j++) if (find_finding(kkT, X[kkS, FI[j], "name"])) ex("finding", X[kkS, FI[j], "name"], tgt)
  for (j = 1; j <= nen; j++) {
    i = E[j]
    ESL[j] = X[kjS, i, "slug"]
    nr = xr(kjS, i, R)
    R[++nr] = "unit#" src "/entry/" ESL[j]
    ETX[j] = c_entry(ESL[j], ST[tgt, "anchor"], X[kjS, i, "what"], X[kjS, i, "group"], X[kjS, i, "rhythm"], X[kjS, i, "thread"], R, nr, "", X[kjS, i, "know"], X[kjS, i, "lst"], X[kjS, i, "ht"], xl_text(kjS, i), xf_text(kjS, i))
  }
  for (j = 1; j <= ntk; j++) { TSL[j] = X[kbS, TI[j], "slug"]; TTX[j] = item_lines(kbS, TI[j]) }
  for (j = 1; j <= nfd; j++) { FSL[j] = X[kkS, FI[j], "name"]; FTX[j] = item_lines(kkS, FI[j]) }
  if (nen > 0) {
    if (!(kjT in PRES)) TYPE[kjT] = "journal"
    for (j = 1; j <= nen; j++) ed_append(kjT, ETX[j], 0)
    CHG[kjT] = 1
  }
  if (ntk > 0) {
    if (!(kbT in PRES)) TYPE[kbT] = "backlog"
    for (j = 1; j <= ntk; j++) ed_append(kbT, TTX[j], 0)
    for (j = 1; j <= ntk; j++) item_drop(kbS, find_task(kbS, TSL[j]))
    CHG[kbT] = 1; CHG[kbS] = 1
  }
  if (nfd > 0) {
    if (!(kkT in PRES)) TYPE[kkT] = "knowledge"
    for (j = 1; j <= nfd; j++) ed_append(kkT, FTX[j], 0)
    for (j = 1; j <= nfd; j++) item_drop(kkS, find_finding(kkS, FSL[j]))
    CHG[kkT] = 1; CHG[kkS] = 1
  }
  nk = 0
  while ((getline line < ENVIRON["PX_MAN"]) > 0) {
    if (line !~ /^F\t/) continue
    split(line, P, "\t")
    if (!(P[2] in KSEEN)) { KSEEN[P[2]] = 1; KEYS[++nk] = P[2] }
  }
  close(ENVIRON["PX_MAN"])
  for (k in PRES) if (!(k in KSEEN) && (index(k, src "|") == 1 || index(k, tgt "|") == 1)) { KSEEN[k] = 1; KEYS[++nk] = k }
  XSLUG = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
  XADDR = XSLUG ".#/"
  NFWD = 0; FWDN = 0
  for (j = 1; j <= ntk; j++) { FWO[++NFWD] = "unit#" src "/task/" TSL[j]; FWN[NFWD] = "unit#" tgt "/task/" TSL[j] }
  for (j = 1; j <= nfd; j++) { FWO[++NFWD] = "unit#" src "/finding/" FSL[j]; FWN[NFWD] = "unit#" tgt "/finding/" FSL[j] }
  for (j = 1; j <= nk; j++) if (fwd_art(KEYS[j])) CHG[KEYS[j]] = 1
  reparse(kjS)
  slug = gen_slug(kjS, d "-event-" ep)
  np = 0
  if (ntk > 0) P[++np] = "tasks " c_join(TSL, ntk, ", ")
  if (nfd > 0) P[++np] = "findings " c_join(FSL, nfd, ", ")
  if (nen > 0) P[++np] = "entries " c_join(ESL, nen, ", ")
  split("", R); nr = 0
  for (j = 1; j <= nen; j++) R[++nr] = "unit#" tgt "/entry/" ESL[j]
  for (j = 1; j <= ntk; j++) R[++nr] = "unit#" tgt "/task/" TSL[j]
  for (j = 1; j <= nfd; j++) R[++nr] = "unit#" tgt "/finding/" FSL[j]
  cls = (nen > 0) ? c_closer("CLOSES", ESL, nen, "superseded", "moved to unit " tgt, NULLV) "\n" : ""
  ed_append(kjS, c_entry(slug, ST[src, "anchor"], "moved to unit " tgt ": " c_join(P, np, "; "), NULLV, NULLV, "none", R, nr, cls, 0, NULLV, NULLV, "", ""), 0)
  reparse(kjS)
  CHG[kjS] = 1
  if (!(kjS in KSEEN)) { KSEEN[kjS] = 1; KEYS[++nk] = kjS }
  for (j = 1; j <= nk; j++) if (KEYS[j] in CHG) stage(KEYS[j])
  for (j = 1; j <= NFWD; j++) MV[FWO[j]] = 1
  o = ""; first = 1
  if (ENVIRON["PX_ROWS"] != "") {
    while ((getline line < ENVIRON["PX_ROWS"]) > 0) {
      split(line, P, "\t")
      if (!(P[4] in MV)) continue
      o = o (first ? "" : ",") "{\"unit\":" jstr(P[1]) ",\"kind\":" jstr(P[2]) ",\"id\":" jstr(P[3]) ",\"ref\":" jstr(P[4]) "}"
      first = 0
    }
    close(ENVIRON["PX_ROWS"])
  }
  answer("{\"source\":" jstr(src) ",\"target\":" jstr(tgt) ",\"dry_run\":" jbool(dry) ",\"tasks\":" jlist(TSL, ntk) ",\"findings\":" jlist(FSL, nfd) ",\"entries\":" jlist(ESL, nen) ",\"pointer\":" jstr(slug) ",\"forwarded\":" FWDN ",\"outside\":[" o "]}")
}

# ---- the dispatch ----
BEGIN {
  FN = ENVIRON["PX_FN"]; U = ENVIRON["PX_UNIT"]; ERRF = ENVIRON["PX_ERR"]; OUTF = ENVIRON["PX_OUT"]
  STAGE = ENVIRON["PX_STAGE"]; NSTAGED = 0
  split("", EMPTY)
  load_payload(ENVIRON["PX_PAY"])
  load_manifest(ENVIRON["PX_MAN"], ENVIRON["PX_SIZES"])
  NUNITS = 0
  for (px_u in UNITS) NUNITS++
  # the unit order of the manifest is bytewise; UL keeps it
  px_n = 0
  while ((getline px_line < ENVIRON["PX_MAN"]) > 0) if (px_line ~ /^U\t/) UL[++px_n] = substr(px_line, 3)
  close(ENVIRON["PX_MAN"])
  if (FN == "session.create") f_session_create()
  else if (FN == "session.list") f_session_list()
  else if (FN == "session.active") f_session_active()
  else if (FN == "state.refs") f_state_refs()
  else if (FN == "session.load") f_session_load()
  else if (FN == "session.refload") f_session_refload()
  else if (FN == "session.board") f_session_board()
  else if (FN == "session.audit") f_session_audit()
  else if (FN == "session.stamp") f_session_stamp()
  else if (FN == "session.objective") f_session_objective()
  else if (FN == "session.refs") f_session_refs()
  else if (FN == "session.close") f_session_close()
  else if (FN == "session.reopen") f_session_reopen()
  else if (FN == "session.units") f_session_units()
  else if (FN == "task.add") f_task_add()
  else if (FN == "task.update") f_task_update()
  else if (FN == "task.start") f_task_start()
  else if (FN == "task.complete") f_task_complete()
  else if (FN == "task.reopen") f_task_reopen()
  else if (FN == "task.drop") f_task_drop()
  else if (FN == "task.list") f_task_list()
  else if (FN == "task.get") f_task_get()
  else if (FN == "entry.record") f_entry_record()
  else if (FN == "entry.get") f_entry_get()
  else if (FN == "entry.list") f_entry_list()
  else if (FN == "entry.closure") f_entry_closure()
  else if (FN == "finding.add") f_finding_add()
  else if (FN == "finding.update") f_finding_update()
  else if (FN == "finding.supersede") f_finding_supersede()
  else if (FN == "finding.drop") f_finding_drop()
  else if (FN == "finding.get") f_finding_get()
  else if (FN == "finding.list") f_finding_list()
  else if (FN == "lane.create") f_lane_create()
  else if (FN == "lane.record") f_lane_record()
  else if (FN == "lane.write_report") f_lane_write_report()
  else if (FN == "lane.get") f_lane_get()
  else if (FN == "unit.transfer") f_unit_transfer()
  else die(2, "ERR_CAPABILITY_UNSUPPORTED", "unknown function '" FN "'")
  if (STAGE != "") stage_close()
  if (OUTF != "") close(OUTF)
  exit 0
}
