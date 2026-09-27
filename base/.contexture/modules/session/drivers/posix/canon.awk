# canon.awk: the canonical renderer of the posix driver (contract 2, docs/the-engine.md,
# The record data model): the canonical lines of every item kind and the one JSON string
# form. Every write renders a new item through these functions, the parse compares a
# stored span with the canonical span these functions render from its typed fields (the
# verbatim rule), and unit.import renders every item without a verbatim through them, so
# one text decides what is canonical on every path.
#
# The awk runs in the C locale: every string is bytes. A backslash is doubled by
# concatenation, never by a gsub replacement (busybox awk and gawk --posix yield one
# backslash from a replacement of four). NULLV is the sentinel of an absent value.

BEGIN {
  NULLV = "\001null\001"
  CTRL = ""
  for (c_i = 1; c_i < 32; c_i++) CTRL = CTRL sprintf("%c", c_i)
}

# jesc(s): the JSON string body of s in the JSON.stringify form: \" and \\, the short
# escapes \b \f \n \r \t, \u00XX (lower case) for every other byte below 0x20, every
# other byte raw
function jesc(s,   n, parts, i, out, o, c, p) {
  if (index(s, "\\") > 0) {
    n = split(s, parts, /\\/)
    out = parts[1]
    for (i = 2; i <= n; i++) out = out "\\" "\\" parts[i]
  } else out = s
  if (index(out, "\"") > 0) gsub(/"/, "\\\"", out)
  if (out ~ /[\001-\037]/) {
    gsub(/\n/, "\\n", out)
    gsub(/\t/, "\\t", out)
    gsub(/\r/, "\\r", out)
    if (out ~ /[\001-\037]/) {
      o = ""
      n = length(out)
      for (i = 1; i <= n; i++) {
        c = substr(out, i, 1)
        p = index(CTRL, c)
        if (p > 0) {
          if (p == 8) o = o "\\b"
          else if (p == 12) o = o "\\f"
          else o = o sprintf("\\u%04x", p)
        } else o = o c
      }
      out = o
    }
  }
  return out
}

function jstr(s) { return "\"" jesc(s) "\"" }
function jnull(s) { return (s == NULLV) ? "null" : jstr(s) }
function jbool(b) { return b ? "true" : "false" }

# jlist(arr, n): a JSON array of the strings arr[1..n]
function jlist(arr, n,   i, o) {
  o = "["
  for (i = 1; i <= n; i++) o = o (i > 1 ? "," : "") jstr(arr[i])
  return o "]"
}

function c_join(arr, n, sep,   i, o) {
  o = ""
  for (i = 1; i <= n; i++) o = o (i > 1 ? sep : "") arr[i]
  return o
}

# c_sep(next kind): the separator after an item: one empty line when the next item exists
# and is not an anchor
function c_sep(nextk) { return (nextk != NULLV && nextk != "" && nextk != "anchor") ? "\n" : "" }

# c_block(label, value): a block scalar: its head, then every body line indented four
# spaces, an empty body line written empty
function c_block(label, v,   o, n, parts, i) {
  o = "  " label " ::\n"
  if (v == "") return o
  n = split(v, parts, /\n/)
  for (i = 1; i <= n; i++) o = o (parts[i] == "" ? "" : "    " parts[i]) "\n"
  return o
}

# c_state(status, anchor, next_action, objective, repos, nrepos, has ref_sessions, refs, nrefs)
function c_state(st, ca, na, ob, R, nr, hasrs, S, ns,   o) {
  o = "status: " st "\ncurrent_anchor: " ca "\nnext_action: \"" na "\"\nobjective: \"" ob "\"\nrepos: [" c_join(R, nr, ", ") "]\n"
  if (hasrs) o = o "ref_sessions: [" c_join(S, ns, ", ") "]\n"
  return o
}

# c_task(slug, status, objective, refs, nrefs, description, criteria, details): the lines
# of a task (each section NULLV when absent)
function c_task(slug, st, ob, R, nr, desc, crit, det,   o) {
  o = "@task " slug "\n  STATUS: " st "\n  OBJECTIVE: \"" ob "\"\n"
  if (nr > 0) o = o "  REFS: [" c_join(R, nr, ", ") "]\n"
  if (desc != NULLV) o = o c_block("DESCRIPTION", desc)
  if (crit != NULLV) o = o c_block("ACCEPTANCE CRITERIA", crit)
  if (det != NULLV) o = o c_block("IMPLEMENTATION DETAILS", det)
  return o
}

# c_closer(kind, targets, ntargets, verdict, reason): one closer line, no newline
function c_closer(kind, T, nt, verdict, reason,   o) {
  o = "  " kind ": " c_join(T, nt, " ")
  if (verdict != NULLV) o = o " (" verdict ": " reason ")"
  else if (reason != NULLV) o = o " (" reason ")"
  return o
}

# c_entry(slug, anchor, what, group, rhythm, thread, refs, nrefs, closer lines, knowledge):
# the lines of a main journal entry; the closer lines arrive rendered (each closer's
# verbatim when it has one, else its canonical line), newline terminated
function c_entry(slug, anchor, what, group, rhythm, thread, R, nr, cls, know,   o, i) {
  o = "@entry " slug "\n"
  if (anchor != NULLV) o = o "  ANCHOR: " anchor "\n"
  if (what != NULLV) o = o "  WHAT: \"" what "\"\n"
  if (group != NULLV) o = o "  GROUP: " group "\n"
  if (rhythm != NULLV) o = o "  RHYTHM: " rhythm "\n"
  if (thread != NULLV) o = o "  THREAD: " thread "\n"
  for (i = 1; i <= nr; i++) o = o "  REF: \"" R[i] "\"\n"
  o = o cls
  if (know) o = o "  KNOWLEDGE: true\n"
  return o
}

# c_lane_entry(slug, what, thread, refs, nrefs): the lines of a lane journal entry
function c_lane_entry(slug, what, thread, R, nr,   o, i) {
  o = "@entry " slug "\n"
  if (what != NULLV) o = o "  WHAT: \"" what "\"\n"
  if (thread != NULLV) o = o "  THREAD: " thread "\n"
  for (i = 1; i <= nr; i++) o = o "  REF: \"" R[i] "\"\n"
  return o
}

# c_anchor(anchor, continues, attention): the stamp form, or the bare head when either
# part is absent
function c_anchor(a, cont, att) {
  if (cont != NULLV && att != NULLV) return "@anchor " a " (\"continues " cont "\", attention: " att ")\n"
  return "@anchor " a "\n"
}

# c_finding(name, supersedes name or NULLV, reason, refs, nrefs, summary)
function c_finding(name, supn, supr, R, nr, summ,   o, i) {
  o = "@finding " name "\n"
  if (supn != NULLV) o = o "  SUPERSEDES: " supn " (" supr ")\n"
  for (i = 1; i <= nr; i++) o = o "  REF: \"" R[i] "\"\n"
  return o c_block("SUMMARY", summ)
}
