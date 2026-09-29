# ops.awk: the record functions of the posix driver (contract 2, docs/the-engine.md, The
# functions and The record rules), run after canon.awk and model.awk. The reads answer from
# the parsed model; the writes add items by the append rule and rewrite a touched item
# canonical in place (every other line of the artifact keeps its bytes), parse the result
# again, stage every changed artifact under PX_STAGE with one
# manifest line "<staged name><TAB><path in the unit folder>", and write the answer to
# PX_OUT, which the driver prints only after every staged file has landed. A refusal
# writes one line to PX_ERR and exits 1 or 2 with nothing staged.
#
# The environment: PX_FN the function, PX_UNIT the unit, PX_NA and PX_A1.. the other argv
# tokens (checked by the driver), PX_STAGE the stage folder,
# PX_DOCSIZE (the document on stdin, staged as "doc"), PX_HEALTH and PX_DETAIL
# (storage.health).

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

# stage(k): the artifact's new bytes into the stage, one manifest line
function stage(k,   f, i, o) {
  NSTAGED++
  f = STAGE "/" NSTAGED
  printf "" > f
  for (i = 1; i <= NL[k]; i++) printf "%s%s%s", L[k, i], (((k, i) in CRL) ? "\r" : ""), ((i < NL[k] || EOFNL[k]) ? "\n" : "") > f
  close(f)
  printf "%s\t%s\n", NSTAGED, relpath(k) > (STAGE "/manifest")
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

function not_closed() {
  if (ST[U, "status"] == "CLOSED") die(1, "ERR_UNIT_CLOSED", "unit '" U "' is CLOSED; a closed unit takes no writes")
}

function nf(kind, x) { die(1, "ERR_ENTITY_NOT_FOUND", kind " '" x "' not found in unit '" U "'") }
function ex(kind, x) { die(1, "ERR_ENTITY_EXISTS", kind " '" x "' already exists in unit '" U "'") }

function find_task(k, s,   i) { for (i = 1; i <= NI[k]; i++) if (IK[k, i] == "task" && X[k, i, "slug"] == s) return i; return 0 }
function find_finding(k, n,   i) { for (i = 1; i <= NI[k]; i++) if (IK[k, i] == "finding" && X[k, i, "name"] == n) return i; return 0 }
function held(k, s) { return ((k, s) in LASTOCC) }

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

# ptr_missing(pointer, extra): the IN_PROGRESS tasks (and extra) the pointer omits, in
# backlog order, joined by ", "
function ptr_missing(p, extra,   kb, i, s, m) {
  kb = U "|backlog"
  m = ""
  for (i = 1; i <= NI[kb]; i++) {
    if (IK[kb, i] != "task") continue
    s = X[kb, i, "slug"]
    if ((X[kb, i, "status"] == "IN_PROGRESS" || s == extra) && index(p, s) == 0) m = m (m == "" ? "" : ", ") s
  }
  return m
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
  ed_splice(k, 1, 0, c_state("ACTIVE", "A1", "backlog the first task", ob, R, nr, 0, S, 0, "", ""))
  parse_state(U)
  k = U "|backlog"; PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1
  stage(k)
  k = U "|knowledge"; PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1
  stage(k)
  k = U "|journal"; PRES[k] = 1; NL[k] = 0; EOFNL[k] = 1
  ed_append(k, c_anchor("A1", "A0", att, NULLV, ""), 1)
  stage(k)
  stage(U "|state")
  answer("{\"unit\":" jstr(U) ",\"state\":" state_json(U) "}")
}

function f_session_list(   u, first, n, i) {
  n = 0
  for (i = 1; i <= NUNITS; i++) { u = UL[i]; parse_state(u); n++ }
  O("{\"store\":" jstr(n > 0 ? "present" : "absent") ",\"units\":[")
  for (i = 1; i <= NUNITS; i++) O((i > 1 ? "," : "") state_json(UL[i]))
  answer("]}")
}

function f_storage_health(   i, n, act) {
  n = 0; act = 0
  for (i = 1; i <= NUNITS; i++) { parse_state(UL[i]); n++; if (ST[UL[i], "status"] == "ACTIVE") act++ }
  answer("{\"driver\":\"posix\",\"health\":" jstr(ENVIRON["PX_HEALTH"]) ",\"detail\":" jstr(ENVIRON["PX_DETAIL"]) ",\"store\":" jstr(n > 0 ? "present" : "absent") ",\"active_units\":" act "}")
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
  board_out(U)
  answer("")
}

# ---- the audit (R16, R17): the record checks, then the posix grammar checks over the
# journal's lines; the findings in the deterministic order of docs/the-engine.md ----
function af(code, sev, slug, line, detail, first, occ) {
  NAF++
  AF[NAF] = "{\"code\":" jstr(code) ",\"severity\":" jstr(sev) ",\"slug\":" jnull(slug) ",\"line\":" (line == NULLV ? "null" : line) ",\"detail\":" jnull(detail) ",\"first_line\":" (first == NULLV ? "null" : first) ",\"occurrence\":" (occ == NULLV ? "null" : occ) "}"
  if (sev == "error") ADIRTY = 1
}

function audit_json(u,   kj, kb, i, j, c, t, s, owner, head, line, val, n, words, found, w, HELD, SEEN, DONEW, first, o, FIRSTLINE, e) {
  kj = u "|journal"; kb = u "|backlog"
  NAF = 0; ADIRTY = 0
  split("", HELD); split("", SEEN); split("", DONEW); split("", FIRSTLINE)
  for (i = 1; i <= NI[kj]; i++) if (IK[kj, i] == "entry") HELD[X[kj, i, "slug"]] = 1
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
  # group 2: the record checks
  split("", SEEN)
  for (i = 1; i <= NI[kj]; i++) {
    if (IK[kj, i] != "entry") continue
    for (c = 1; c <= X[kj, i, "c#"]; c++) for (t = 1; t <= X[kj, i, "c", c, "t#"]; t++) {
      s = X[kj, i, "c", c, "t", t]
      if (!(s in HELD) && !(s in SEEN)) { SEEN[s] = 1; af("DANGLING_CLOSER", "error", X[kj, i, "slug"], X[kj, i, "c", c, "line"], s, NULLV, NULLV) }
    }
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
  if (u in UNITS) for (i = 1; i <= NI[kb]; i++) {
    if (IK[kb, i] == "task" && X[kb, i, "status"] == "IN_PROGRESS" && index(ST[u, "text"], X[kb, i, "slug"]) == 0) af("IN_PROGRESS_ABSENT_FROM_STATE", "error", X[kb, i, "slug"], NULLV, NULLV, NULLV, NULLV)
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

function f_session_stamp(   att, ca, n, kj) {
  parse_unit(U, "journal")
  not_closed()
  need("attention"); att = pv("attention"); oneline("attention", att)
  ca = ST[U, "anchor"]
  if (ca !~ /^A[0-9]+$/ || !((U, "current_anchor") in SLINE)) die(2, "ERR_STORAGE_CORRUPT", "the state's current_anchor '" ca "' is not A<N>")
  n = substr(ca, 2) + 1
  ST[U, "anchor"] = "A" n
  st_write(U)
  kj = U "|journal"
  if (!(kj in PRES)) TYPE[kj] = "journal"
  ed_append(kj, c_anchor("A" n, ca, att, NULLV, ""), 1)
  reparse(kj)
  stage(U "|state"); stage(kj)
  answer("{\"unit\":" jstr(U) ",\"previous_anchor\":" jstr(ca) ",\"current_anchor\":" jstr("A" n) ",\"receipt\":" anchor_json(kj, NI[kj]) "}")
}

function f_session_next(   p, m) {
  parse_unit(U, "backlog")
  not_closed()
  need("pointer"); p = pv("pointer"); oneline("pointer", p)
  if (!((U, "next_action") in SLINE)) die(2, "ERR_STORAGE_CORRUPT", "the state holds no next_action line")
  m = ptr_missing(p, NULLV)
  if (m != "") die(1, "ERR_POINTER_INCOMPLETE", "next_action would not name IN_PROGRESS task(s): " m)
  ST[U, "next"] = p
  st_write(U)
  stage(U "|state")
  answer("{\"unit\":" jstr(U) ",\"next_action\":" jstr(ST[U, "next"]) "}")
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

function f_session_refs_to(   i, j, u, first) {
  O("{\"unit\":" jstr(U) ",\"referrers\":[")
  first = 1
  for (i = 1; i <= NUNITS; i++) {
    u = UL[i]; parse_state(u)
    for (j = 1; j <= ST[u, "s#"]; j++) if (ST[u, "s", j] == U) { O((first ? "" : ",") jstr(u)); first = 0; break }
  }
  answer("]}")
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

function f_task_start(   kb, s, i, p, m) {
  parse_unit(U, "backlog")
  not_closed()
  kb = U "|backlog"; s = ENVIRON["PX_A1"]
  if (!(i = find_task(kb, s))) nf("task", s)
  if (X[kb, i, "status"] != "TODO") transition("task", s, X[kb, i, "status"], "task.start", "TODO")
  p = has("pointer") ? pv("pointer") : "work active task: " s
  oneline("pointer", p)
  if (!((U, "next_action") in SLINE)) die(2, "ERR_STORAGE_CORRUPT", "the state holds no next_action line")
  m = ptr_missing(p, s)
  if (m != "") die(1, "ERR_POINTER_INCOMPLETE", "next_action would not name IN_PROGRESS task(s): " m)
  task_status(kb, i, "IN_PROGRESS")
  ST[U, "next"] = p
  st_write(U)
  stage(kb); stage(U "|state")
  answer("{\"unit\":" jstr(U) ",\"task\":" taskitem_json(kb, find_task(kb, s)) ",\"next_action\":" jstr(ST[U, "next"]) "}")
}

# want_anchor: the state's current_anchor is A<N>, else the store is corrupt (the rule of
# session.stamp, D43): an entry never takes a malformed or missing anchor
function want_anchor(   ca) {
  ca = ST[U, "anchor"]
  if (ca !~ /^A[0-9]+$/ || !((U, "current_anchor") in SLINE)) die(2, "ERR_STORAGE_CORRUPT", "the state's current_anchor '" ca "' is not A<N>")
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
  if (X[kb, i, "status"] == "IN_PROGRESS" && index(ST[U, "next"], s) > 0) transition("task", s, "IN_PROGRESS", "task.drop", "TODO, DONE, or an IN_PROGRESS task next_action does not name")
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
function f_entry_record(   kj, what, grp, th, rh, kn, R, nr, nc, c, kind, T, nt, t, vd, rs, cls, slug, d, ep) {
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
  nc = has("closers.count") ? PAY["closers.count"] : 0
  if (nc !~ /^[0-9]+$/) die(1, "ERR_INVALID_ARGUMENT", "malformed closers.count")
  cls = ""
  for (c = 1; c <= nc + 0; c++) {
    kind = pv("closers." c ".kind")
    if (kind != "CLOSES" && kind != "SUPERSEDES") die(1, "ERR_INVALID_ARGUMENT", "closers." c ".kind takes CLOSES or SUPERSEDES")
    nt = plist("closers." c ".targets", T)
    if (nt < 1) die(1, "ERR_INVALID_ARGUMENT", "closers." c " names no target")
    vd = pv("closers." c ".verdict"); rs = pv("closers." c ".reason")
    if (vd != NULLV && vd !~ /^(done|superseded|dropped|folded)$/) die(1, "ERR_INVALID_ARGUMENT", "closers." c ".verdict takes done, superseded, dropped, or folded")
    oneline("closers." c ".reason", rs)
    if (rs != NULLV && (index(rs, "(") || index(rs, ")"))) die(1, "ERR_INVALID_ARGUMENT", "closers." c ".reason holds a parenthesis")
    if (vd != NULLV && rs == NULLV) die(1, "ERR_INVALID_ARGUMENT", "closers." c " carries a verdict without a reason")
    for (t = 1; t <= nt; t++) {
      if (!isdateslug(T[t])) die(1, "ERR_INVALID_ARGUMENT", "closers." c " target '" T[t] "' is not a date-slug")
      if (!held(kj, T[t])) nf("entry", T[t])
    }
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

function f_lane_create(   l, k) {
  parse_state(U)
  not_closed()
  l = ENVIRON["PX_A1"]
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
  else if (FN == "storage.health") f_storage_health()
  else if (FN == "state.refs") f_state_refs()
  else if (FN == "session.load") f_session_load()
  else if (FN == "session.refload") f_session_refload()
  else if (FN == "session.board") f_session_board()
  else if (FN == "session.audit") f_session_audit()
  else if (FN == "session.stamp") f_session_stamp()
  else if (FN == "session.next") f_session_next()
  else if (FN == "session.refs") f_session_refs()
  else if (FN == "session.close") f_session_close()
  else if (FN == "session.reopen") f_session_reopen()
  else if (FN == "session.units") f_session_units()
  else if (FN == "session.refs_to") f_session_refs_to()
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
  else die(2, "ERR_CAPABILITY_UNSUPPORTED", "unknown function '" FN "'")
  if (STAGE != "") stage_close()
  if (OUTF != "") close(OUTF)
  exit 0
}
