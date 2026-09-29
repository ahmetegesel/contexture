# canon.awk: the canonical renderer of the posix driver (contract 2, docs/the-engine.md,
# The record data model): the canonical lines of every item kind and the one JSON string
# form. Every item renders from its typed fields through these functions and nothing else:
# a write stores a new or touched item as these lines, a read prints them, and search reads
# them, so one text decides the layout on every path. No item keeps its stored bytes.
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

# nb(v): a block value without its trailing whitespace-only lines (a value of blanks alone
# is ""): the one block value rule of every write and every read, since the dialect cannot
# tell such a line from the separator after the item. A one-line value keeps its blanks.
function nb(v,   t, r, p) {
  if (v == NULLV || v == "") return v
  t = v
  sub(/[ \t\n]+$/, "", t)
  if (t == "") return ""
  r = substr(v, length(t) + 1)
  p = index(r, "\n")
  return t ((p > 0) ? substr(r, 1, p - 1) : r)
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

# c_opens(v): v opens a double quote it does not close (the parse would continue it)
function c_opens(v) { return substr(v, 1, 1) == "\"" && (length(v) == 1 || substr(v, length(v), 1) != "\"") }

# c_quoted(label, value): a quoted one-line field, or a block scalar when the value holds a
# newline (a WHAT or an OBJECTIVE over several lines)
function c_quoted(label, v) {
  if (index(v, "\n") > 0) return c_block(label, v)
  return "  " label ": \"" v "\"\n"
}

# c_xfield(key, value): an extra field of an item (a label beyond the schema, or an earlier or
# later occurrence of a schema label): a one-line field with its value as stored, or a block
# scalar when the value holds a newline (or opens a WHAT or OBJECTIVE quote it never closes)
function c_xfield(k, v) {
  if (index(v, "\n") > 0 || ((k == "WHAT" || k == "OBJECTIVE") && c_opens(v))) return c_block(k, v)
  return "  " k ": " v "\n"
}

# c_head(word, id, head_text): the head line of an item
function c_head(w, id, ht) { return "@" w " " id ((ht != NULLV && ht != "") ? " " ht : "") "\n" }

# c_state(status, anchor, next_action, objective, repos, nrepos, has ref_sessions, refs, nrefs,
# the extra lines, the extra fields): the extra lines (the state's lines no key holds) first,
# then the six keys, then every extra key with its value (a value's later lines follow it as
# stored)
function c_state(st, ca, na, ob, R, nr, hasrs, S, ns, xl, xf,   o) {
  o = xl "status: " st "\ncurrent_anchor: " ca "\nnext_action: \"" na "\"\nobjective: \"" ob "\"\nrepos: [" c_join(R, nr, ", ") "]\n"
  if (hasrs) o = o "ref_sessions: [" c_join(S, ns, ", ") "]\n"
  return o xf
}

# c_task(slug, status, objective, refs, nrefs, description, criteria, details, head text, the
# extra lines, the extra fields): the head, the extra lines, the schema lines, then the extra
# fields (a task's first occurrence of a label is typed, so a later one follows it)
function c_task(slug, st, ob, R, nr, desc, crit, det, ht, xl, xf,   o) {
  o = c_head("task", slug, ht) xl "  STATUS: " st "\n" c_quoted("OBJECTIVE", ob)
  if (nr > 0) o = o "  REFS: [" c_join(R, nr, ", ") "]\n"
  if (desc != NULLV) o = o c_block("DESCRIPTION", desc)
  if (crit != NULLV) o = o c_block("ACCEPTANCE CRITERIA", crit)
  if (det != NULLV) o = o c_block("IMPLEMENTATION DETAILS", det)
  return o xf
}

# c_closer(kind, targets, ntargets, verdict, reason, extra text): one closer line, no newline;
# the extra text (the words of a legacy target part that name no date-slug) after the targets
function c_closer(kind, T, nt, verdict, reason, xt,   o) {
  o = "  " kind ": " c_join(T, nt, " ")
  if (xt != NULLV && xt != "") o = o (nt > 0 ? " " : "") xt
  if (verdict != NULLV) o = o " (" verdict ": " reason ")"
  else if (reason != NULLV) o = o " (" reason ")"
  return o
}

# c_entry(slug, anchor, what, group, rhythm, thread, refs, nrefs, closer lines, knowledge,
# legacy status, head text, the extra lines, the extra fields): the lines of an entry of the
# main journal or a lane journal; the head, the extra lines, the extra fields (an entry's last
# occurrence of a one-line label is typed, so an earlier one precedes it), then ANCHOR,
# STATUS, WHAT, GROUP, RHYTHM, THREAD, REF, the closers, KNOWLEDGE, each when set
function c_entry(slug, anchor, what, group, rhythm, thread, R, nr, cls, know, lst, ht, xl, xf,   o, i) {
  o = c_head("entry", slug, ht) xl xf
  if (anchor != NULLV) o = o "  ANCHOR: " anchor "\n"
  if (lst != NULLV) o = o "  STATUS: " lst "\n"
  if (what != NULLV) o = o c_quoted("WHAT", what)
  if (group != NULLV) o = o "  GROUP: " group "\n"
  if (rhythm != NULLV) o = o "  RHYTHM: " rhythm "\n"
  if (thread != NULLV) o = o "  THREAD: " thread "\n"
  for (i = 1; i <= nr; i++) o = o "  REF: \"" R[i] "\"\n"
  o = o cls
  if (know) o = o "  KNOWLEDGE: true\n"
  return o
}

# c_anchor(anchor, date, continues, attention, head text, the extra lines): the stamp form
# @anchor <A> <date> (end review item 7: the period's number and date, no receipt text); a
# legacy anchor in the former receipt form ("continues <P>", attention: <text>) when both
# parts are set; else the bare head followed by its head text
function c_anchor(a, dt, cont, att, ht, xl) {
  if (dt != NULLV) return "@anchor " a " " dt "\n" xl
  if (cont != NULLV && att != NULLV) return "@anchor " a " (\"continues " cont "\", attention: " att ")\n" xl
  return c_head("anchor", a, ht) xl
}

# c_finding(name, supersedes name or NULLV, reason, refs, nrefs, summary, head text, the
# extra lines, the extra fields)
function c_finding(name, supn, supr, R, nr, summ, ht, xl, xf,   o, i) {
  o = c_head("finding", name, ht) xl
  if (supn != NULLV) o = o "  SUPERSEDES: " supn " (" supr ")\n"
  for (i = 1; i <= nr; i++) o = o "  REF: \"" R[i] "\"\n"
  return o c_block("SUMMARY", summ) xf
}

# c_opaque(head, lines): an item of an unknown head word: its head line and its lines
function c_opaque(h, ls) { return h "\n" ls }
