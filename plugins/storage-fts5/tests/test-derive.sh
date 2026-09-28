#!/bin/sh
# test-derive.sh: the narrowed derive on the plugin's own module copy. Every write rebuilds
# only the derived search rows (the lines of the exact rule and the ranked search documents)
# of the parts it names (state, backlog, knowledge, journal, lane:<lane>); this pins that the
# rows a write sequence leaves equal a whole rebuild of the unit (lanes/si-f5-fts5-review/report
# @decisions: the gated check the narrowed derive had lacked since artifact.write retired).
#   1. the fixture units legacy-u (every legacy shape, lanes) and tc57-u (a repeated slug)
#      imported; a sequence touching every part through every write function
#   2. per unit: the lines rows and the search documents (their ids aside) after the sequence
#      equal those a whole rebuild (derive.sql with no part named) writes on a copy
#   3. the comparator reads one planted stale lines row as a difference (null check)
# Exit: 0 all pass, 1 a failure, 77 without sqlite3.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
MOD="$SCRIPT_DIR/../.contexture/modules/storage-fts5"
DRV="$MOD/drivers/fts5"
FXD="$ROOT/tests/fixtures/dumps"

command -v sqlite3 >/dev/null 2>&1 || { printf 'SKIP: sqlite3 not found on PATH\n'; exit 77; }

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-derive-test.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
mkdir -p "$SB/ws/.contexture/tmp"
DB="$SB/store.db"

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
# w <function> <argv...>: a write with the payload lines on stdin, rc 0 required; a failure
# lands in a file, since a write fed by a pipe runs in a subshell
: > "$SB/fails"
w() { (cd "$SB/ws" && CTX_STORAGE_SQLITE_PATH="$DB" "$DRV" "$@" > "$SB/out" 2> "$SB/err"); rc=$?; [ "$rc" -eq 0 ] || printf 'write %s rc %s: %s\n' "$*" "$rc" "$(cat "$SB/err")" >> "$SB/fails"; }

w unit.import legacy-u < "$FXD/legacy.dump"
w unit.import tc57-u < "$FXD/tc57-repeat.dump"
for u in legacy-u tc57-u; do
  printf 'pointer=derive pointer\n' | w session.next "$u"
  printf 'attention=derive stamp\n' | w session.stamp "$u"
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
for u in legacy-u tc57-u; do
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
sqlite3 "$SB/stale.db" "UPDATE lines SET line = line || ' stale' WHERE unit = 'legacy-u' AND lno = (SELECT min(lno) FROM lines WHERE unit = 'legacy-u' AND aord = 2) AND aord = 2 AND lane = '';"
snap "$SB/stale.db" legacy-u s-legacy-u
cmp -s "$SB/s-legacy-u.lines" "$SB/w-legacy-u.lines" && bad "the comparator reads a planted stale row" || ok "the comparator reads a planted stale row"

printf 'test-derive: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
