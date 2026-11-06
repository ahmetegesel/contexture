# flag-collision.awk: the static check that every grammar field named like a control flag stays
# settable through each field verb, run by static/flag-collision.test.ts over docs-io.sh, the
# grammar asset, and every verb script that calls docs_parse (operands in any order, each line
# read by its shape):
#   the control universe: docs_parse's case lines in docs-io.sh (--<name>=*) dp_c=<name> takes a
#     value; --<name>) dp_c=<name> is bare and matches only the bare flag, so --<name>=<value>
#     stays a field action and a bare control never collides);
#   the fields: the grammar's #% header and #% field lines, plus its #% block names;
#   each verb: its docs_parse "<controls>" <fields> call (a verb with fields 0 sets no field),
#     and its reach: a constant EDIT_BLOCK=<block>, else its # help: blocks: line, else the
#     header when it edits through docs_edit header or docs_edit new.
# A collision is a field in a field verb's reach whose flag (underscores read as dashes) is a
# control that takes a value. It is settable when the verb does not take that control (the parser
# hands the flag to the field parser), allowed when the verb takes it by design (the allow list
# below, with its reason), and refused otherwise: the field could never be set. One line per
# collision, a REFUSED line per reach defect, then one summary:
#   collision: verbs V, fields F, collisions C = settable S + allowed A + refused R
# rc 0 only when R is 0, no reach defect was read, and the census is not empty (controls, field
# verbs, and fields each read); rc 1 otherwise.
BEGIN {
  allow["entry" SUBSEP "id"] = "a new entry's id; ids never change"
  allow["pitfall" SUBSEP "id"] = "a new pitfall's id; ids never change"
}
FNR == 1 { verb = FILENAME; sub(/^.*\//, "", verb) }
/^[ \t]*--[a-z][a-z-]*(=\*)?\)[ \t]*dp_c=[a-z][a-z-]*[ \t]*;;/ {
  c = $0; sub(/^.*dp_c=/, "", c); sub(/[ \t]*;;.*$/, "", c)
  if (!(c in control)) { control[c] = ($0 ~ /=\*\)/); ncontrols++ }
  next
}
/^#% header [a-z_]+ / { addfield("header", $3); next }
/^#% field [a-z_|]+ [a-z_]+ / {
  nb = split($3, bs, "|")
  for (i = 1; i <= nb; i++) addfield(bs[i], $4)
  next
}
/^#% block [a-z_]+ / { block[$3] = 1; next }
/^docs_parse "[a-z -]*" [01] / {
  ctl = $0; sub(/^docs_parse "/, "", ctl); fl = ctl; sub(/".*$/, "", ctl)
  sub(/^[^"]*" /, "", fl); fl = substr(fl, 1, 1)
  if (fl == "1") { verbs[++nverbs] = verb; takes[verb] = " " ctl " " }
  next
}
/^EDIT_BLOCK=[a-z_]+[ \t]*$/ { b = $0; sub(/^EDIT_BLOCK=/, "", b); sub(/[ \t]*$/, "", b); fixed[verb] = b; next }
/^# help: blocks: / {
  l = $0; sub(/^# help: blocks: /, "", l); sub(/;.*$/, "", l)
  helpblocks[verb] = l
  next
}
/^docs_edit (header|new) / { edits_header[verb] = 1; next }
function addfield(b, f) {
  if ((b, f) in field) return
  field[b, f] = 1
  nf[b]++
  fname[b, nf[b]] = f
}
function reach(v, out,   n, parts, i, w) {
  if (v in fixed) { out[1] = fixed[v]; return 1 }
  if (v in helpblocks) {
    n = split(helpblocks[v], parts, ",")
    for (i = 1; i <= n; i++) { w = parts[i]; gsub(/[ \t]/, "", w); out[i] = w }
    return n
  }
  if (v in edits_header) { out[1] = "header"; return 1 }
  return 0
}
END {
  block["header"] = 1
  for (vi = 1; vi <= nverbs; vi++) {
    v = verbs[vi]
    delete rb
    n = reach(v, rb)
    if (n == 0) { printf "REFUSED %s: no reach (no EDIT_BLOCK, help blocks line, or header edit)\n", v; defects++; continue }
    for (ri = 1; ri <= n; ri++) {
      b = rb[ri]
      if (!(b in block) || nf[b] == 0) { printf "REFUSED %s: the reach names %s, a block the grammar does not declare with fields\n", v, b; defects++; continue }
      for (fi = 1; fi <= nf[b]; fi++) {
        f = fname[b, fi]
        pairs++
        flag = f; gsub(/_/, "-", flag)
        if (!(flag in control) || !control[flag]) continue
        collisions++
        if (index(takes[v], " " flag " ") == 0) {
          settable++
          printf "COLLISION %s %s.%s --%s settable; %s takes:%s\n", v, b, f, flag, v, substr(takes[v], 1, length(takes[v]) - 1)
        } else if ((v, flag) in allow) {
          allowed++
          printf "COLLISION %s %s.%s --%s allowed: %s\n", v, b, f, flag, allow[v, flag]
        } else {
          refused++
          printf "COLLISION %s %s.%s --%s REFUSED: %s takes --%s as its control, so the field can never be set\n", v, b, f, flag, v, flag
        }
      }
    }
  }
  printf "collision: verbs %d, fields %d, collisions %d = settable %d + allowed %d + refused %d\n", nverbs, pairs, collisions, settable, allowed, refused
  if (ncontrols == 0 || nverbs == 0 || pairs == 0 || refused > 0 || defects > 0 || collisions != settable + allowed + refused) exit 1
}
