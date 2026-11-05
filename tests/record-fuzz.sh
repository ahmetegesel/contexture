#!/bin/sh
# record-fuzz.sh: the differential record fuzzer, the standing proof beside the fixed
# record compliance. It stages the shipped base (the storage core with its resolver,
# search engine, encoder, library, and posix driver, and the unit module) into two
# hermetic sandboxes, adds the fts5 plugin's own driver to the second, writes one seeded
# sequence of unit-module record writes to both through the unit data script, and
# compares every answer and every read (load, board, audit, the lists, lane artifacts,
# and exact search) byte for byte. The same sequence drives both sides, so a divergence
# names the call, the rc, the stdout, and the stderr of each side.
#
# The sequence is a Lehmer LCG over the seed, so the run is reproducible on every awk;
# the payloads cover one-line and two-line values, quotes, backslashes, multibyte text,
# canonical and legacy refs, a file pointer, entry closers, task transitions, finding
# supersession, lane entries and reports, stamps, and refs. A fixed preamble and a
# final close/reopen lead and tail the random steps, and the final read pass gets every
# artifact kind and three exact searches, so a run that lands nothing reads as an
# instrument blind, never as SAME.
# --plant replays the sequence with the fts5 side's data script wrapped so a session.load
# answer gains a byte: the comparator must read DIFF, proving the instrument can
# discriminate (the null check of knowledge#DIFFERENTIAL_FUZZER_STANDING_PROOF).
#
# Usage: tests/record-fuzz.sh [--seed=<n>] [--calls=<n>] [--plant] [--keep]
#   --seed    the LCG seed (default 20261103)
#   --calls   random write steps in the sequence (default 16; --calls=40 for a deeper run;
#             --plant replays at most 10)
#   --plant   run the planted-divergence null check instead of the zero-difference run
#   --keep    preserve the sandboxes for inspection
# Exit 0 when the run reads zero differences (or a planted divergence reads DIFF), 1 on a
# divergence (or an uncaught plant), 2 a staging failure, 77 when sqlite3 is absent.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
STORAGE_CORE="$ROOT/base/.contexture/storage"
UNIT_MOD="$ROOT/base/.contexture/modules/unit"
FTS5_MOD="$ROOT/plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5"

SEED=20261103
CALLS=16
KEEP=0
PLANT=0
for a in "$@"; do
  case "$a" in
    --seed=*) SEED=${a#--seed=} ;;
    --calls=*) CALLS=${a#--calls=} ;;
    --plant) PLANT=1 ;;
    --keep) KEEP=1 ;;
    -h|--help)
      sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "record-fuzz.sh: unknown argument: $a" >&2; exit 1 ;;
  esac
done
case "$SEED" in ''|*[!0-9]*) echo "record-fuzz.sh: --seed takes a positive number" >&2; exit 1 ;; esac
case "$CALLS" in ''|*[!0-9]*) echo "record-fuzz.sh: --calls takes a positive number" >&2; exit 1 ;; esac
[ "$SEED" -ge 1 ] || { echo "record-fuzz.sh: --seed takes a positive number" >&2; exit 1; }
[ "$CALLS" -ge 4 ] || { echo "record-fuzz.sh: --calls takes at least 4" >&2; exit 1; }

for f in "$STORAGE_CORE/scripts/store-data" "$STORAGE_CORE/scripts/library" "$STORAGE_CORE/scripts/store-search" "$STORAGE_CORE/drivers/posix/driver" "$UNIT_MOD/scripts/data" "$UNIT_MOD/lib/ops.awk" "$FTS5_MOD/driver" "$FTS5_MOD/db-init.sh" "$FTS5_MOD/schema.sql"; do
  [ -e "$f" ] || { echo "record-fuzz.sh: missing $f" >&2; exit 2; }
done
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "SKIP: sqlite3 not found on PATH"
  exit 77
fi

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH CTX_STORE_ROOT CTX_STORE_RESOLVER CTX_SCRATCH_ROOT

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SB=$(mktemp -d "$tmp_root/record-fuzz.XXXXXX") || exit 2
cleanup() {
  if [ "$KEEP" -eq 1 ]; then
    printf 'record-fuzz: sandboxes preserved at %s\n' "$SB"
  else
    rm -rf "$SB"
  fi
}
trap cleanup EXIT INT TERM

stage_side() { # <dir> <posix|fts5>
  rs_dir=$1; rs_kind=$2
  mkdir -p "$rs_dir/.contexture/modules" "$rs_dir/.contexture/tmp"
  cp -R "$STORAGE_CORE" "$rs_dir/.contexture/storage"
  cp -R "$UNIT_MOD" "$rs_dir/.contexture/modules/unit"
  chmod +x "$rs_dir/.contexture/storage/scripts/"* "$rs_dir/.contexture/storage/drivers/posix/driver" "$rs_dir/.contexture/modules/unit/scripts/"* 2>/dev/null || true
  if [ "$rs_kind" = fts5 ]; then
    mkdir -p "$rs_dir/.contexture/extensions/storage/drivers"
    cp -R "$FTS5_MOD" "$rs_dir/.contexture/extensions/storage/drivers/fts5"
    printf 'storage.driver: fts5\n' > "$rs_dir/.contexture/config"
    chmod +x "$rs_dir/.contexture/extensions/storage/drivers/fts5/driver" 2>/dev/null || true
  fi
}

gen_sequence() { # <calls> > <file>
  awk -v seed="$SEED" -v calls="$1" '
    function nxt() { st = (st * 48271) % 2147483647; return st }
    function pick(m) { return (nxt() % m) + 1 }
    BEGIN {
      st = seed % 2147483647
      if (st <= 0) st += 2147483646
      printf "create|u1|-|1|\n"
      printf "create|u2|-|1|\n"
      printf "task.add|u1|t1|1|\n"
      printf "task.add|u2|t1|1|\n"
      printf "lane.create|u1|l1|1|\n"
      printf "lane.create|u2|l1|1|\n"
      printf "finding.add|u1|F1|1|\n"
      printf "finding.add|u2|F1|1|\n"
      printf "entry.record|u1|pre-entry|2|\n"
      printf "lane.record|u1|l1|1|pre-lane\n"
      printf "lane.write_report|u1|l1|1|\n"
      printf "session.refs|u1|u2|0|\n"
      ne = 0
      for (n = 1; n <= calls; n++) {
        r = nxt() % 100
        u = (nxt() % 2) ? "u1" : "u2"
        if (r < 16) {
          printf "task.add|%s|t%d|%d|\n", u, pick(7), pick(4)
        } else if (r < 27) {
          printf "task.update|%s|t%d|%d|\n", u, pick(4), pick(4)
        } else if (r < 36) {
          printf "task.start|%s|t%d|0|\n", u, pick(4)
        } else if (r < 45) {
          printf "task.complete|%s|t%d|%d|\n", u, pick(4), pick(2)
        } else if (r < 51) {
          printf "task.reopen|%s|t%d|0|\n", u, pick(4)
        } else if (r < 58) {
          printf "task.drop|%s|t%d|%d|\n", u, pick(4), pick(2)
        } else if (r < 76) {
          ne++
          ex = "-"
          if (ne > 1 && (nxt() % 100) < 35) ex = "e" (n - 1)
          printf "entry.record|%s|e%d|%d|%s\n", u, n, pick(5), ex
        } else if (r < 82) {
          printf "finding.add|%s|F%d|%d|\n", u, pick(7), pick(3)
        } else if (r < 87) {
          printf "finding.update|%s|F%d|%d|\n", u, pick(4), pick(3)
        } else if (r < 91) {
          printf "finding.supersede|%s|F%d:F%d|%d|\n", u, pick(3), 10 + pick(5), pick(2)
        } else if (r < 94) {
          printf "finding.drop|%s|F%d|0|\n", u, pick(4)
        } else if (r < 97) {
          printf "lane.record|%s|l1|%d|lane-%d\n", u, pick(4), n
        } else if (r < 99) {
          printf "lane.write_report|%s|l1|%d|\n", u, pick(3)
        } else {
          printf "session.refs|%s|%s|%d|\n", u, (u == "u1" ? "u2" : "u1"), pick(3)
        }
      }
    }'
}

fz_ds() {
  case "$1" in
    posix) printf '%s\n' "$POSIX_ROOT/.contexture/modules/unit/scripts/data" ;;
    fts5) printf '%s\n' "$FTS5_ROOT/.contexture/modules/unit/scripts/data" ;;
  esac
}

fz_root() {
  case "$1" in
    posix) printf '%s\n' "$POSIX_ROOT" ;;
    fts5) printf '%s\n' "$FTS5_ROOT" ;;
  esac
}

fz_call() { # <side> <n> <stdin> <function> [args...]
  fc_side=$1; fc_n=$2; fc_in=$3; fc_fn=$4
  shift 4
  fc_ds=$(fz_ds "$fc_side")
  fc_root=$(fz_root "$fc_side")
  ( cd "$fc_root" && CTX_STORE_ROOT="$fc_root" CTX_STORE_RESOLVER="$fc_root/.contexture/storage/scripts/driver-resolver" \
      "$fc_ds" "$fc_fn" "$@" < "$fc_in" > "$CAP/$fc_side/$fc_n.out" 2> "$CAP/$fc_side/$fc_n.err" )
  printf '%s\n' "$?" > "$CAP/$fc_side/$fc_n.rc"
  printf '%s\n' "$fc_fn" > "$CAP/$fc_side/$fc_n.fn"
}

fz_payload() { # <side> <n> <unit> <kind> <variant> <step> [<extra>]
  fp_side=$1; fp_n=$2; fp_u=$3; fp_kind=$4; fp_v=$5; fp_step=$6; fp_extra=${7:-}
  fp_out="$CAP/$fp_side/$fp_n.in"
  : > "$fp_out"
  case "$fp_kind" in
    create)
      printf 'objective=fuzz unit needle %s\nattention=fuzz\nrepos.count=0\n' "$fp_v" > "$fp_out"
      ;;
    task.add)
      case "$fp_v" in
        1) printf 'objective=a fuzz task one\nrefs.count=0\n' ;;
        2) printf 'objective=a needle task two\ndesc=line one\\nline two\nrefs.count=1\nrefs.1=unit#%s/task/t1\n' "$fp_u" ;;
        3) printf 'objective=a türkçe task ğüşiöç\nrefs.count=1\nrefs.1=journal#2026-01-01-absent\n' ;;
        4) printf 'objective=a quoted task\nrefs.count=1\nrefs.1=docs/the-engine.md#the-record\n' ;;
      esac > "$fp_out"
      ;;
    task.update)
      case "$fp_v" in
        1) printf 'objective=an updated fuzz task\n' ;;
        2) printf 'desc=an updated description\\nwith a second line\n' ;;
        3) printf 'objective=an updated needle task\ncriteria=the fuzz stays green\n' ;;
        4) printf 'refs.count=1\nrefs.1=unit#%s/task/t1\n' "$fp_u" ;;
      esac > "$fp_out"
      ;;
    task.start)
      : > "$fp_out"
      ;;
    task.complete)
      printf 'evidence=the fuzzer observed %s\ndate=2026-11-03\n' "$fp_v" > "$fp_out"
      ;;
    task.drop)
      printf 'date=2026-11-03\nreason=dropped by the fuzzer %s\n' "$fp_v" > "$fp_out"
      ;;
    entry.record)
      case "$fp_v" in
        1) printf 'what=a fuzz entry one\nthread=none\ngroup=fuzz\nrefs.count=0\nslug=%s\n' "$fp_extra" ;;
        2) printf 'what=a needle entry with a "quote"\nthread=awaits the fuzzer\nrefs.count=1\nrefs.1=unit#%s/task/t1\nslug=%s\n' "$fp_u" "$fp_extra" ;;
        3) printf 'what=a türkçe entry ğüşiöç\nthread=none\nrefs.count=1\nrefs.1=journal#2026-01-01-absent\nslug=%s\n' "$fp_extra" ;;
        4) printf 'what=an entry with a \\ backslash\nthread=none\nrefs.count=1\nrefs.1=docs/the-engine.md#the-record\nslug=%s\n' "$fp_extra" ;;
        5) printf 'what=an auto-slug needle entry\nthread=none\ndate=2026-11-03\nepoch=%s\nrefs.count=0\n' "$((1793687300 + fp_step))" ;;
      esac > "$fp_out"
      ;;
    finding.add)
      case "$fp_v" in
        1) printf 'summary=a fuzz finding summary\nrefs.count=0\n' ;;
        2) printf 'summary=a needle finding summary\nrefs.count=1\nrefs.1=unit#%s/task/t1\n' "$fp_u" ;;
        3) printf 'summary=a türkçe finding summary\nrefs.count=1\nrefs.1=journal#2026-01-01-absent\n' ;;
      esac > "$fp_out"
      ;;
    finding.update)
      case "$fp_v" in
        1) printf 'summary=an updated fuzz finding\n' ;;
        2) printf 'summary=an updated needle finding\n' ;;
        3) printf 'refs.count=1\nrefs.1=docs/the-engine.md#the-record\n' ;;
      esac > "$fp_out"
      ;;
    finding.supersede)
      printf 'summary=a superseding needle finding\nreason=superseded by the fuzzer\nrefs.count=0\n' > "$fp_out"
      ;;
    finding.drop)
      : > "$fp_out"
      ;;
    lane.create)
      printf '# a fuzz lane recipe\nMISSION\n  GOAL: "walk the fuzzer"\n' > "$fp_out"
      ;;
    lane.record)
      case "$fp_v" in
        1) printf 'what=a fuzz lane entry\nthread=none\nrefs.count=0\nslug=%s\n' "$fp_extra" ;;
        2) printf 'what=a needle lane entry\nthread=awaits the fuzzer\nrefs.count=1\nrefs.1=unit#%s/task/t1\nslug=%s\n' "$fp_u" "$fp_extra" ;;
        3) printf 'what=a türkçe lane entry\nthread=none\nrefs.count=1\nrefs.1=journal#2026-01-01-absent\nslug=%s\n' "$fp_extra" ;;
        4) printf 'what=a quoted lane entry "q"\nthread=none\nrefs.count=0\nslug=%s\n' "$fp_extra" ;;
      esac > "$fp_out"
      ;;
    lane.write_report)
      printf 'a needle lane report %s\n' "$fp_v" > "$fp_out"
      ;;
    session.stamp)
      printf 'date=2026-11-03\n' > "$fp_out"
      ;;
    session.refs)
      : > "$fp_out"
      ;;
    session.close|session.reopen)
      : > "$fp_out"
      ;;
  esac
}

fz_reads() { # <side>: the read pass; every answer joins the comparison
  frd_side=$1
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null session.load u1
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null session.load u2
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null session.board u1
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null session.audit u1
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null task.list u1 all
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null task.list u2 all
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null entry.list u1
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null finding.list u1 all
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null lane.get u1 l1 journal
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null lane.get u1 l1 report
  FR_N=$((FR_N + 1)); fz_call "$frd_side" "$FR_N" /dev/null session.list
}

fz_search() { # <side> <unit> <query>
  fzq_side=$1; fzq_u=$2; fzq_q=$3
  FR_N=$((FR_N + 1))
  printf 'query=%s\n' "$fzq_q" > "$CAP/$fzq_side/$FR_N.in"
  fz_call "$fzq_side" "$FR_N" "$CAP/$fzq_side/$FR_N.in" search.query "$fzq_u" --mode=exact
}

fz_replay() { # <side> <sequence file>
  FR_SIDE=$1
  FR_SEQ=$2
  FR_N=0
  FR_STEP=0
  while IFS='|' read -r FR_OP FR_UNIT FR_NAME FR_VAR FR_EXTRA; do
    FR_STEP=$((FR_STEP + 1))
    FR_N=$((FR_N + 1))
    case "$FR_OP" in
      create)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" create "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" session.create "$FR_UNIT"
        ;;
      task.add)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" task.add "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" task.add "$FR_UNIT" "$FR_NAME"
        ;;
      task.update)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" task.update "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" task.update "$FR_UNIT" "$FR_NAME"
        ;;
      task.start)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" task.start "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" task.start "$FR_UNIT" "$FR_NAME"
        ;;
      task.complete)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" task.complete "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" task.complete "$FR_UNIT" "$FR_NAME"
        ;;
      task.reopen)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" task.reopen "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" task.reopen "$FR_UNIT" "$FR_NAME"
        ;;
      task.drop)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" task.drop "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" task.drop "$FR_UNIT" "$FR_NAME"
        ;;
      entry.record)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" entry.record "$FR_VAR" "$FR_STEP" "$FR_NAME"
        if [ "$FR_EXTRA" != "-" ] && [ -n "$FR_EXTRA" ]; then
          printf 'closers.count=1\nclosers.1.kind=CLOSES\nclosers.1.targets.count=1\nclosers.1.targets.1=%s\nclosers.1.verdict=done\nclosers.1.reason=fuzzed\n' "$FR_EXTRA" >> "$CAP/$FR_SIDE/$FR_N.in"
        fi
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" entry.record "$FR_UNIT"
        ;;
      finding.add)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" finding.add "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" finding.add "$FR_UNIT" "$FR_NAME"
        ;;
      finding.update)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" finding.update "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" finding.update "$FR_UNIT" "$FR_NAME"
        ;;
      finding.supersede)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" finding.supersede "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" finding.supersede "$FR_UNIT" "${FR_NAME%%:*}" "${FR_NAME#*:}"
        ;;
      finding.drop)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" finding.drop "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" finding.drop "$FR_UNIT" "$FR_NAME"
        ;;
      lane.create)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" lane.create "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" lane.create "$FR_UNIT" "$FR_NAME"
        ;;
      lane.record)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" lane.record "$FR_VAR" "$FR_STEP" "$FR_EXTRA"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" lane.record "$FR_UNIT" "$FR_NAME"
        ;;
      lane.write_report)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" lane.write_report "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" lane.write_report "$FR_UNIT" "$FR_NAME"
        ;;
      session.stamp)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" session.stamp "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" session.stamp "$FR_UNIT"
        ;;
      session.refs)
        fz_payload "$FR_SIDE" "$FR_N" "$FR_UNIT" session.refs "$FR_VAR" "$FR_STEP"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" session.refs "$FR_UNIT" "$FR_NAME"
        ;;
      *)
        printf 'record-fuzz: unknown sequence op %s\n' "$FR_OP" >&2
        exit 2
        ;;
    esac
    if [ $((FR_STEP % 3)) -eq 0 ]; then
      fz_reads "$FR_SIDE"
    fi
  done < "$FR_SEQ"
  FR_N=$((FR_N + 1)); fz_call "$FR_SIDE" "$FR_N" /dev/null session.close u1
  fz_reads "$FR_SIDE"
  FR_N=$((FR_N + 1)); fz_call "$FR_SIDE" "$FR_N" /dev/null session.reopen u1
  fz_reads "$FR_SIDE"
  fz_search "$FR_SIDE" u1 needle
  fz_search "$FR_SIDE" u1 türkçe
  fz_search "$FR_SIDE" u2 absent-word
  FR_TOTAL=$FR_N
}

fz_coverage() { # <side> <total>: null-check the run actually wrote and read data
  CV_SIDE=$1
  CV_MISS=""
  CV_CREATE=0; CV_TASK=0; CV_ENTRY=0; CV_FINDING=0; CV_LANE=0; CV_LANEENTRY=0; CV_REPORT=0
  CV_LOAD=0; CV_TASKS=0; CV_ENTRIES=0; CV_FINDINGS=0; CV_LANES=0; CV_UNITS=0; CV_SEARCH=0
  CV_I=1
  while [ "$CV_I" -le "$2" ]; do
    CV_FN=$(cat "$CAP/$CV_SIDE/$CV_I.fn" 2>/dev/null)
    if [ "$(cat "$CAP/$CV_SIDE/$CV_I.rc" 2>/dev/null)" = 0 ]; then
      case "$CV_FN" in
        session.create) grep -q '"status":"ACTIVE"' "$CAP/$CV_SIDE/$CV_I.out" && CV_CREATE=$((CV_CREATE + 1)) ;;
        task.add) grep -q '"task":{"slug"' "$CAP/$CV_SIDE/$CV_I.out" && CV_TASK=$((CV_TASK + 1)) ;;
        entry.record) grep -q '"entry":{"kind":"entry"' "$CAP/$CV_SIDE/$CV_I.out" && CV_ENTRY=$((CV_ENTRY + 1)) ;;
        finding.add) grep -q '"finding":{"name"' "$CAP/$CV_SIDE/$CV_I.out" && CV_FINDING=$((CV_FINDING + 1)) ;;
        lane.create) grep -q '"lane"' "$CAP/$CV_SIDE/$CV_I.out" && CV_LANE=$((CV_LANE + 1)) ;;
        lane.record) grep -q '"entry"' "$CAP/$CV_SIDE/$CV_I.out" && CV_LANEENTRY=$((CV_LANEENTRY + 1)) ;;
        lane.write_report) grep -q '"lane"' "$CAP/$CV_SIDE/$CV_I.out" && CV_REPORT=$((CV_REPORT + 1)) ;;
        session.load) grep -q '"backlog"' "$CAP/$CV_SIDE/$CV_I.out" && CV_LOAD=$((CV_LOAD + 1)) ;;
        task.list) grep -q '"tasks":\[{' "$CAP/$CV_SIDE/$CV_I.out" && CV_TASKS=$((CV_TASKS + 1)) ;;
        entry.list) grep -q '"entries":\[{' "$CAP/$CV_SIDE/$CV_I.out" && CV_ENTRIES=$((CV_ENTRIES + 1)) ;;
        finding.list) grep -q '"findings":\[{' "$CAP/$CV_SIDE/$CV_I.out" && CV_FINDINGS=$((CV_FINDINGS + 1)) ;;
        lane.get) [ -s "$CAP/$CV_SIDE/$CV_I.out" ] && CV_LANES=$((CV_LANES + 1)) ;;
        session.list) grep -q '"units":\[{"' "$CAP/$CV_SIDE/$CV_I.out" && CV_UNITS=$((CV_UNITS + 1)) ;;
        search.query) grep -q '"total_matches":[1-9]' "$CAP/$CV_SIDE/$CV_I.out" && CV_SEARCH=$((CV_SEARCH + 1)) ;;
      esac
    fi
    CV_I=$((CV_I + 1))
  done
  [ "$CV_CREATE" -ge 1 ] || CV_MISS="$CV_MISS a successful session.create"
  [ "$CV_TASK" -ge 1 ] || CV_MISS="$CV_MISS a successful task.add"
  [ "$CV_ENTRY" -ge 1 ] || CV_MISS="$CV_MISS a successful entry.record"
  [ "$CV_FINDING" -ge 1 ] || CV_MISS="$CV_MISS a successful finding.add"
  [ "$CV_LANE" -ge 1 ] || CV_MISS="$CV_MISS a successful lane.create"
  [ "$CV_LANEENTRY" -ge 1 ] || CV_MISS="$CV_MISS a successful lane.record"
  [ "$CV_REPORT" -ge 1 ] || CV_MISS="$CV_MISS a successful lane.write_report"
  [ "$CV_LOAD" -ge 1 ] || CV_MISS="$CV_MISS a non-empty session.load"
  [ "$CV_TASKS" -ge 1 ] || CV_MISS="$CV_MISS a non-empty task.list"
  [ "$CV_ENTRIES" -ge 1 ] || CV_MISS="$CV_MISS a non-empty entry.list"
  [ "$CV_FINDINGS" -ge 1 ] || CV_MISS="$CV_MISS a non-empty finding.list"
  [ "$CV_LANES" -ge 1 ] || CV_MISS="$CV_MISS a non-empty lane.get"
  [ "$CV_UNITS" -ge 1 ] || CV_MISS="$CV_MISS a non-empty session.list"
  [ "$CV_SEARCH" -ge 1 ] || CV_MISS="$CV_MISS a matching search"
  [ -z "$CV_MISS" ] && return 0
  printf 'FUZZ: instrument blind on %s:%s\n' "$CV_SIDE" "$CV_MISS"
  return 1
}

fz_show() { # <file> <max bytes>
  head -c "$2" "$1" 2>/dev/null | od -An -c | tr '\n' ' '
}

fz_compare() { # <posix capture dir> <fts5 capture dir> <total>
  FC_DIFF=0
  FC_I=1
  while [ "$FC_I" -le "$3" ]; do
    FC_BAD=""
    if ! cmp -s "$1/$FC_I.rc" "$2/$FC_I.rc"; then
      FC_BAD="$FC_BAD rc $(cat "$1/$FC_I.rc" 2>/dev/null)/$(cat "$2/$FC_I.rc" 2>/dev/null)"
    fi
    if ! cmp -s "$1/$FC_I.out" "$2/$FC_I.out"; then
      FC_BAD="$FC_BAD stdout"
    fi
    if ! cmp -s "$1/$FC_I.err" "$2/$FC_I.err"; then
      FC_BAD="$FC_BAD stderr"
    fi
    if [ -n "$FC_BAD" ]; then
      FC_DIFF=$((FC_DIFF + 1))
      if [ "$FC_DIFF" -le 5 ]; then
        printf 'DIFF call %s:%s\n' "$FC_I" "$FC_BAD"
        printf '  posix rc=%s stdout=[%s] stderr=[%s]\n' \
          "$(cat "$1/$FC_I.rc" 2>/dev/null)" "$(fz_show "$1/$FC_I.out" 160)" "$(fz_show "$1/$FC_I.err" 160)"
        printf '  fts5  rc=%s stdout=[%s] stderr=[%s]\n' \
          "$(cat "$2/$FC_I.rc" 2>/dev/null)" "$(fz_show "$2/$FC_I.out" 160)" "$(fz_show "$2/$FC_I.err" 160)"
      fi
    fi
    FC_I=$((FC_I + 1))
  done
}

plant_data() { # <sandbox>: wrap the fts5 side's data script so session.load gains a field
  pd="$1/.contexture/modules/unit/scripts/data"
  mv "$pd" "$pd.real"
  cat > "$pd" <<'PLANT'
#!/bin/sh
case "${1:-}" in
  session.load)
    out=$("$0.real" "$@"); rc=$?
    if [ "$rc" -eq 0 ]; then printf '%s' "$out" | sed 's/}$/,"plant":true}/'; else printf '%s' "$out"; fi
    exit "$rc" ;;
esac
exec "$0.real" "$@"
PLANT
  chmod +x "$pd"
}

run_side() { # <kind> <dir> <sequence>
  rs_kind=$1; rs_dir=$2; rs_seq=$3
  CAP="$SB/cap"
  case "$rs_kind" in
    posix)
      POSIX_ROOT="$rs_dir"
      POSIX_DRIVER="$rs_dir/.contexture/storage/drivers/posix/driver"
      ;;
    fts5)
      FTS5_ROOT="$rs_dir"
      FTS5_DRIVER="$rs_dir/.contexture/extensions/storage/drivers/fts5/driver"
      ;;
  esac
  fz_replay "$rs_kind" "$rs_seq"
  printf '%s\n' "$FR_TOTAL" > "$SB/$rs_kind.total"
}

if [ "$PLANT" -eq 1 ]; then
  PLANT_CALLS=$CALLS
  [ "$PLANT_CALLS" -gt 10 ] && PLANT_CALLS=10
  gen_sequence "$PLANT_CALLS" > "$SB/plant.seq"
  stage_side "$SB/plant/posix" posix
  stage_side "$SB/plant/fts5" fts5
  plant_data "$SB/plant/fts5"
  mkdir -p "$SB/cap/posix" "$SB/cap/fts5"
  printf 'record-fuzz: planted divergence, seed %s, %s steps\n' "$SEED" "$PLANT_CALLS"
  run_side posix "$SB/plant/posix" "$SB/plant.seq"
  PTOTAL=$FR_TOTAL
  FR_TOTAL=0
  run_side fts5 "$SB/plant/fts5" "$SB/plant.seq"
  FTOTAL=$FR_TOTAL
  FR_TOTAL=$PTOTAL
  [ "$PTOTAL" -eq "$FTOTAL" ] || { printf 'record-fuzz: the two sides issued %s and %s calls\n' "$PTOTAL" "$FTOTAL" >&2; exit 2; }
  fz_coverage posix "$PTOTAL" || exit 2
  fz_coverage fts5 "$FTOTAL" || exit 2
  fz_compare "$SB/cap/posix" "$SB/cap/fts5" "$PTOTAL"
  if [ "$FC_DIFF" -gt 0 ]; then
    printf 'FUZZ: planted divergence reads DIFF (%d of %d calls differ)\n' "$FC_DIFF" "$PTOTAL"
    exit 0
  fi
  printf 'FUZZ: planted divergence NOT caught (%d calls compared)\n' "$PTOTAL"
  exit 1
fi

gen_sequence "$CALLS" > "$SB/seq"
stage_side "$SB/posix" posix
stage_side "$SB/fts5" fts5
mkdir -p "$SB/cap/posix" "$SB/cap/fts5"
printf 'record-fuzz: seed %s, %s steps, posix against fts5\n' "$SEED" "$CALLS"
run_side posix "$SB/posix" "$SB/seq"
PTOTAL=$FR_TOTAL
FR_TOTAL=0
run_side fts5 "$SB/fts5" "$SB/seq"
FTOTAL=$FR_TOTAL
FR_TOTAL=$PTOTAL
[ "$PTOTAL" -eq "$FTOTAL" ] || { printf 'record-fuzz: the two sides issued %s and %s calls\n' "$PTOTAL" "$FTOTAL" >&2; exit 2; }
fz_coverage posix "$PTOTAL" || exit 2
fz_coverage fts5 "$FTOTAL" || exit 2
fz_compare "$SB/cap/posix" "$SB/cap/fts5" "$PTOTAL"
if [ "$FC_DIFF" -eq 0 ]; then
  printf 'FUZZ: SAME (%d calls, seed %s)\n' "$PTOTAL" "$SEED"
  exit 0
fi
printf 'FUZZ: DIFF (%d of %d calls differ, seed %s)\n' "$FC_DIFF" "$PTOTAL" "$SEED"
exit 1
