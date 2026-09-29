#!/bin/sh
# test-derive.sh: the narrowed derive on the plugin's own module copy. Every write rebuilds
# only the derived search rows (the lines of the exact rule and the ranked search documents)
# of the parts it names (state, backlog, knowledge, journal, lane:<lane>); this pins that the
# rows a write sequence leaves equal a whole rebuild of the unit (lanes/si-f5-fts5-review/report
# @decisions: the gated check the narrowed derive had lacked since artifact.write retired),
# and that the lines equal the text the same writes leave in posix files.
#   1. two units written through the functions (the store holds only what the functions
#      write: knowledge#MIGRATION_IS_AGENT_JUDGMENT): der-a with a lane, der-b with a
#      stamped anchor and closers; then a sequence touching every part through every write
#      function; the same calls land in a posix sandbox through the shipped posix driver
#   2. per unit: the lines rows and the search documents (their ids aside) after the sequence
#      equal those a whole rebuild (derive.sql with no part named) writes on a copy
#   3. per unit: the lines table holds every line of the posix files of the same record, in
#      order, attributed as the exact rule's head rule reads the files (carried from the
#      retired test-upgrade); the FTS5 tables follow the search documents
#   4. the comparators read one planted stale lines row and one planted file line as
#      differences (null checks)
# Exit: 0 all pass, 1 a failure, 77 without sqlite3.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
MOD="$SCRIPT_DIR/../.contexture/modules/storage-fts5"
DRV="$MOD/drivers/fts5"
POSIX="$ROOT/base/.contexture/modules/session/drivers/posix/driver"

command -v sqlite3 >/dev/null 2>&1 || { printf 'SKIP: sqlite3 not found on PATH\n'; exit 77; }

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-derive-test.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
mkdir -p "$SB/ws/.contexture/tmp" "$SB/px/.contexture/tmp"
DB="$SB/store.db"
SESS="$SB/px/.contexture/sessions"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
# w <function> <argv...>: one write with the payload lines on stdin, on the fts5 store and on
# the posix sandbox alike, rc 0 required on both; a failure lands in a file, since a write fed
# by a pipe runs in a subshell
: > "$SB/fails"
w() {
  cat > "$SB/pay"
  (cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$DB" "$DRV" "$@" < "$SB/pay" > "$SB/out" 2> "$SB/err"); rc=$?
  [ "$rc" -eq 0 ] || printf 'fts5 write %s rc %s: %s\n' "$*" "$rc" "$(cat "$SB/err")" >> "$SB/fails"
  (cd "$SB/px" && "$POSIX" "$@" < "$SB/pay" > "$SB/out" 2> "$SB/err"); rc=$?
  [ "$rc" -eq 0 ] || printf 'posix write %s rc %s: %s\n' "$*" "$rc" "$(cat "$SB/err")" >> "$SB/fails"
}

# the two units, through the functions
for u in der-a der-b; do
  printf 'objective=derive unit %s\nrepos.count=1\nrepos.1=alpha\nattention=derive fixture\n' "$u" | w session.create "$u"
  printf 'objective=a seeded task\ndesc=seed line one\\n\\nseed line three\ncriteria=seeded\nrefs.count=1\nrefs.1=journal#2026-09-27-seed-one\n' | w task.add "$u" seed-task
  printf 'summary=a seeded finding\nrefs.count=0\n' | w finding.add "$u" SEED_FINDING
  printf 'what=the seed entry\nthread=the human\ngroup=seed\nknowledge=false\nrefs.count=0\nclosers.count=0\nslug=2026-09-27-seed-one\ndate=2026-09-27\nepoch=1\n' | w entry.record "$u"
  printf 'what=a second seed entry\nthread=none\nknowledge=false\nrefs.count=0\nclosers.count=0\nslug=2026-09-27-seed-two\ndate=2026-09-27\nepoch=2\n' | w entry.record "$u"
done
printf '# seed recipe\nMISSION\n  GOAL: "a derive lane"\n' | w lane.create der-a seed-lane
printf 'what=a seed lane entry\nthread=none\nrefs.count=0\ndate=2026-09-27\nepoch=3\n' | w lane.record der-a seed-lane
printf '# report\n\n@claim seed\n  a seed claim\n' | w lane.write_report der-a seed-lane
printf 'date=2026-09-27\n' | w session.stamp der-b
printf 'what=closes the second seed\nthread=none\nknowledge=false\nrefs.count=0\nclosers.count=1\nclosers.1.kind=CLOSES\nclosers.1.targets.count=1\nclosers.1.targets.1=2026-09-27-seed-two\nclosers.1.verdict=done\nclosers.1.reason=seeded\ndate=2026-09-27\nepoch=4\n' | w entry.record der-b

for u in der-a der-b; do
  printf 'pointer=derive pointer\n' | w session.next "$u"
  printf 'date=2026-09-28\n' | w session.stamp "$u"
  w session.refs "$u" < /dev/null
  printf 'objective=derive task\ndesc=body line\\nsecond\nrefs.count=1\nrefs.1=knowledge#DERIVE\n' | w task.add "$u" dv-task
  printf 'objective=derive task renamed\ncriteria=a criterion\nrefs.count=0\n' | w task.update "$u" dv-task
  printf 'evidence=derived\ndate=2026-09-28\n' | w task.complete "$u" dv-task
  printf 'objective=to drop\nrefs.count=0\n' | w task.add "$u" dv-drop
  printf 'reason=gone\ndate=2026-09-28\n' | w task.drop "$u" dv-drop
  printf 'summary=derive finding\nrefs.count=0\n' | w finding.add "$u" DV_FINDING
  printf 'summary=derive finding updated\nrefs.count=1\nrefs.1=journal#dv\n' | w finding.update "$u" DV_FINDING
  printf 'summary=successor\nrefs.count=0\n' | w finding.supersede "$u" DV_FINDING DV_NEXT
  printf 'summary=to drop\nrefs.count=0\n' | w finding.add "$u" DV_DROP
  w finding.drop "$u" DV_DROP < /dev/null
  printf 'what=derive entry\nthread=the dispatcher\nknowledge=true\nrefs.count=0\nclosers.count=0\nslug=2026-09-28-dv-one\ndate=2026-09-28\nepoch=1\n' | w entry.record "$u"
  printf 'what=derive closer\nthread=none\nknowledge=false\nrefs.count=0\nclosers.count=1\nclosers.1.kind=CLOSES\nclosers.1.targets.count=1\nclosers.1.targets.1=2026-09-28-dv-one\nclosers.1.verdict=done\nclosers.1.reason=closed\ndate=2026-09-28\nepoch=2\n' | w entry.record "$u"
  printf '# derive recipe\n' | w lane.create "$u" dv-lane
  printf 'what=derive lane entry\nthread=none\nrefs.count=0\ndate=2026-09-28\nepoch=3\n' | w lane.record "$u" dv-lane
  printf '@claim dv\n  derive report\n' | w lane.write_report "$u" dv-lane
  w session.close "$u" < /dev/null
  w session.reopen "$u" < /dev/null
done

if [ -s "$SB/fails" ]; then bad "every write of the sequence lands: $(cat "$SB/fails")"; else ok "every write of the sequence lands"; fi

# snap <db> <unit> <name>: the derived rows of the unit, ids aside, in a fixed order
snap() {
  sqlite3 "$1" "SELECT lane, aord, lno, section, line, entity_type, entity_id FROM lines WHERE unit = '$2' ORDER BY lane, aord, lno;" > "$SB/$3.lines"
  sqlite3 "$1" "SELECT entity_type, entity_id, section, title, body FROM search_documents WHERE unit = '$2' ORDER BY entity_type, entity_id, section, title, body;" > "$SB/$3.docs"
}
# whole <db> <unit>: derive.sql over the unit with no part named (the whole rebuild)
whole() {
  (cd "$MOD/sql" && sqlite3 -bail "$1" > /dev/null) <<EOF
.read split.sql
CREATE TEMP TABLE touched (unit TEXT PRIMARY KEY);
INSERT INTO temp.touched VALUES ('$2');
BEGIN IMMEDIATE;
.read derive.sql
COMMIT;
EOF
}
for u in der-a der-b; do
  snap "$DB" "$u" "n-$u"
  cp -p "$DB" "$SB/whole.db"
  whole "$SB/whole.db" "$u" || bad "the whole rebuild of $u"
  snap "$SB/whole.db" "$u" "w-$u"
  if [ -s "$SB/n-$u.lines" ] && cmp -s "$SB/n-$u.lines" "$SB/w-$u.lines" && cmp -s "$SB/n-$u.docs" "$SB/w-$u.docs"; then
    ok "$u: the narrowed rows of the write sequence equal a whole rebuild ($(wc -l < "$SB/n-$u.lines" | tr -d ' ') lines, $(wc -l < "$SB/n-$u.docs" | tr -d ' ') documents)"
  else
    bad "$u: the narrowed rows of the write sequence equal a whole rebuild"
  fi
done
# the null check: one stale row in a copy reads as a difference
cp -p "$DB" "$SB/stale.db"
sqlite3 "$SB/stale.db" "UPDATE lines SET line = line || ' stale' WHERE unit = 'der-a' AND lno = (SELECT min(lno) FROM lines WHERE unit = 'der-a' AND aord = 2) AND aord = 2 AND lane = '';"
snap "$SB/stale.db" der-a s-der-a
cmp -s "$SB/s-der-a.lines" "$SB/w-der-a.lines" && bad "the comparator reads a planted stale row" || ok "the comparator reads a planted stale row"

# 3. the lines table against the posix files of the same record: the text of each artifact
# in order, and the head rule's attribution (the exact rule of docs/the-engine.md, Search,
# read from the files); carried from the retired test-upgrade
# oracle <unit> <sessions folder>: every line of the unit's files with its section and
# attribution, in the lines table's order
oracle() {
  d="$2/$1"
  {
    for a in state backlog knowledge journal; do [ -f "$d/$a.md" ] && printf '%s\t%s\t%s\n' "" "$a" "$d/$a.md"; done
    for ld in "$d"/lanes/*; do
      [ -d "$ld" ] || continue
      for a in recipe journal report; do [ -f "$ld/$a.md" ] && printf '%s\t%s\t%s\n' "${ld##*/}" "lane_$a" "$ld/$a.md"; done
    done
  } > "$SB/files-$1"
  U=$1 LC_ALL=C awk -F '\t' '
    function out(line) { printf "%s\t%s\t%s\t%s\t%s\n", sec, ++n, line, et, eid }
    {
      lane = $1; sec = $2; path = $3; n = 0
      if (lane == "") { et = "session"; eid = ENVIRON["U"] } else { et = "lane"; eid = lane }
      while ((getline line < path) > 0) {
        if (line ~ /^@[a-zA-Z0-9_-]+/) {
          h = substr(line, 2); sub(/\r$/, "", h)
          split(h, P, /[ \t]+/); t = P[1]; id = P[2]; sub(/\(.*$/, "", id)
          if (t == "task") { et = "task"; eid = id }
          else if (t == "finding") { et = "finding"; eid = id }
          else if (t == "entry" && lane != "") { et = "lane_entry"; eid = lane "/" id }
          else if (t == "entry") { et = "entry"; eid = id }
          else if (t == "anchor" && lane == "") { et = "session"; eid = ENVIRON["U"] }
        }
        out(line)
      }
      close(path)
    }' "$SB/files-$1"
}
for u in der-a der-b; do
  oracle "$u" "$SESS" > "$SB/want-$u.lines"
  sqlite3 -separator '	' "$DB" "SELECT section, lno, line, entity_type, entity_id FROM lines WHERE unit = '$u' ORDER BY lane COLLATE BINARY, aord, lno;" > "$SB/got-$u.lines"
  if [ -s "$SB/want-$u.lines" ] && cmp -s "$SB/want-$u.lines" "$SB/got-$u.lines"; then
    ok "$u: the lines table equals every line of the posix files with the head rule's attribution ($(wc -l < "$SB/want-$u.lines" | tr -d ' ') lines)"
  else
    bad "$u: the lines table against the posix files: $(cmp "$SB/want-$u.lines" "$SB/got-$u.lines" 2>&1 | head -n 1)"
  fi
done
[ "$(sqlite3 "$DB" "SELECT count(*) FROM search_documents;")" = "$(sqlite3 "$DB" "SELECT count(*) FROM fts_prose;")" ] && [ "$(sqlite3 "$DB" "SELECT count(*) FROM search_documents;")" -gt 0 ] \
  && ok "the ranked search documents are indexed by the FTS5 tables" || bad "the FTS5 tables do not follow the search documents"
# the null check: one planted file line in a copy of the posix sandbox reads as a difference
cp -Rp "$SESS" "$SB/plant-sess"
printf 'planted line\n' >> "$SB/plant-sess/der-a/journal.md"
oracle der-a "$SB/plant-sess" > "$SB/plant-der-a.lines"
cmp -s "$SB/plant-der-a.lines" "$SB/got-der-a.lines" && bad "the lines comparator reads a planted file line" || ok "the lines comparator reads a planted file line"

printf 'test-derive: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
