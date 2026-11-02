#!/bin/sh
# store-fuzz.sh: the differential store fuzzer, the standing proof beside the fixed store
# compliance. It stages the shipped base (the session module, the storage core with its
# resolver, reader, search engine, encoder, library, and posix driver) and the fts5
# plugin's own module copy into two hermetic sandboxes, writes one seeded sequence of
# store puts, deletes, and batches to both, and compares every answer and every read
# (get, list, scan, and exact search) byte for byte. The same sequence drives both sides,
# so a divergence names the call, the rc, the stdout, and the stderr of each driver.
#
# The sequence is a Lehmer LCG over the seed, so the run is reproducible on every awk;
# the payloads cover text, no trailing newline, a NUL and an invalid UTF-8 byte, quotes and
# control characters, multibyte text, and a multi-line value the exact search matches.
# Two fixed puts lead the sequence and a final read pass gets every key, lists, scans,
# puts one known needle, and searches it, so a run that lands nothing reads as an
# instrument blind, never as SAME.
# --plant replays a prefix of the same sequence with the fts5 driver wrapped so its
# store.list answer gains one byte: the comparator must read DIFF, proving the instrument
# can discriminate (the null check of knowledge#DIFFERENTIAL_FUZZER_STANDING_PROOF).
#
# Usage: tests/store-fuzz.sh [--seed=<n>] [--calls=<n>] [--plant] [--keep]
#   --seed    the LCG seed (default 20261102)
#   --calls   write steps in the sequence (default 16; --calls=40 for a deeper run;
#             --plant replays at most 12)
#   --plant   run the planted-divergence null check instead of the zero-difference run
#   --keep    preserve the sandboxes for inspection
# Exit 0 when the run reads zero differences (or a planted divergence reads DIFF), 1 on a
# divergence (or an uncaught plant), 2 a staging failure, 77 when sqlite3 is absent.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"
STORAGE_CORE="$ROOT/base/.contexture/storage"
FTS5_MOD="$ROOT/plugins/storage-fts5/.contexture/modules/storage-fts5"

SEED=20261102
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
      sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "store-fuzz.sh: unknown argument: $a" >&2; exit 1 ;;
  esac
done
case "$SEED" in ''|*[!0-9]*) echo "store-fuzz.sh: --seed takes a positive number" >&2; exit 1 ;; esac
case "$CALLS" in ''|*[!0-9]*) echo "store-fuzz.sh: --calls takes a positive number" >&2; exit 1 ;; esac
[ "$SEED" -ge 1 ] || { echo "store-fuzz.sh: --seed takes a positive number" >&2; exit 1; }
[ "$CALLS" -ge 4 ] || { echo "store-fuzz.sh: --calls takes at least 4" >&2; exit 1; }

for f in "$CTX_SRC" "$SESSION_MOD/scripts/driver-resolver" "$STORAGE_CORE/scripts/store-data" "$STORAGE_CORE/scripts/library" "$STORAGE_CORE/scripts/store-search" "$STORAGE_CORE/drivers/posix/driver" "$FTS5_MOD/drivers/fts5" "$FTS5_MOD/db-init.sh" "$FTS5_MOD/schema.sql"; do
  [ -e "$f" ] || { echo "store-fuzz.sh: missing $f" >&2; exit 2; }
done
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "SKIP: sqlite3 not found on PATH"
  exit 77
fi

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH CTX_STORE_ROOT CTX_STORE_RESOLVER

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SB=$(mktemp -d "$tmp_root/store-fuzz.XXXXXX") || exit 2
cleanup() {
  if [ "$KEEP" -eq 1 ]; then
    printf 'store-fuzz: sandboxes preserved at %s\n' "$SB"
  else
    rm -rf "$SB"
  fi
}
trap cleanup EXIT INT TERM

PAY="$SB/payloads"
mkdir -p "$PAY"
printf 'alpha line\nneedle first\nomega\n' > "$PAY/p1"
printf 'no trailing newline' > "$PAY/p2"
printf 'a\000b\377' > "$PAY/p3"
printf 'quote " tab\tbackslash \\ newline\nsecond line with needle\n' > "$PAY/p4"
printf 'türkçe ğüşiöç needle\n' > "$PAY/p5"
printf 'first\nNeedle in caps\nthird\n' > "$PAY/p6"

stage_side() { # <dir> <posix|fts5>
  ss_dir=$1; ss_kind=$2
  mkdir -p "$ss_dir/.contexture/modules" "$ss_dir/.contexture/tmp" "$ss_dir/fuzz-root"
  cp "$CTX_SRC" "$ss_dir/.contexture/ctx"
  chmod +x "$ss_dir/.contexture/ctx"
  cp -R "$SESSION_MOD" "$ss_dir/.contexture/modules/session"
  cp -R "$STORAGE_CORE" "$ss_dir/.contexture/storage"
  mkdir -p "$ss_dir/.contexture/modules/fuzz"
  printf 'namespace: fuzz\nroot: fuzz-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nformat: text\nmodes: exact\n' > "$ss_dir/.contexture/modules/fuzz/data"
  chmod +x "$ss_dir/.contexture/modules/session/scripts/"* "$ss_dir/.contexture/storage/scripts/"* "$ss_dir/.contexture/storage/drivers/posix/driver"
  if [ "$ss_kind" = fts5 ]; then
    cp -R "$FTS5_MOD" "$ss_dir/.contexture/modules/storage-fts5"
    printf 'storage.driver: fts5\n' > "$ss_dir/.contexture/config"
    chmod +x "$ss_dir/.contexture/modules/storage-fts5/drivers/fts5"
  fi
}

gen_sequence() { # <calls> > <file>
  awk -v seed="$SEED" -v calls="$1" '
    function nxt() { st = (st * 48271) % 2147483647; return st }
    function pick(m) { return (nxt() % m) + 1 }
    BEGIN {
      st = seed % 2147483647
      if (st <= 0) st += 2147483646
      printf "put|a/k1|p1\n"
      printf "put|a/k2|p6\n"
      for (n = 2; n < calls; n++) {
        r = nxt() % 100
        if (r < 55) {
          printf "put|a/k%d|p%d\n", pick(10), pick(6)
        } else if (r < 80) {
          printf "delete|a/k%d|\n", pick(10)
        } else {
          c = 2 + (nxt() % 3)
          s = ""
          for (i = 0; i < c; i++) {
            if (nxt() % 100 < 70) s = s (i ? ";" : "") "put:a/k" pick(10) ":p" pick(6)
            else s = s (i ? ";" : "") "delete:a/k" pick(10)
          }
          printf "batch|%s\n", s
        }
      }
    }'
}

fz_driver() {
  case "$1" in
    posix) printf '%s\n' "$POSIX_DRIVER" ;;
    fts5) printf '%s\n' "$FTS5_DRIVER" ;;
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
  fc_drv=$(fz_driver "$fc_side")
  fc_root=$(fz_root "$fc_side")
  ( cd "$fc_root" && "$fc_drv" "$fc_fn" "$@" < "$fc_in" > "$CAP/$fc_side/$fc_n.out" 2> "$CAP/$fc_side/$fc_n.err" )
  printf '%s\n' "$?" > "$CAP/$fc_side/$fc_n.rc"
  printf '%s\n' "$fc_fn" > "$CAP/$fc_side/$fc_n.fn"
}

b64file() { base64 < "$1" | tr -d '\n'; }

fz_batch_input() { # <spec> <out file>
  fb_spec=$1; fb_out=$2
  : > "$fb_out"
  fb_rest=$fb_spec
  while [ -n "$fb_rest" ]; do
    case "$fb_rest" in
      *';'*) fb_item=${fb_rest%%;*}; fb_rest=${fb_rest#*;} ;;
      *) fb_item=$fb_rest; fb_rest="" ;;
    esac
    fb_act=${fb_item%%:*}
    fb_tail=${fb_item#*:}
    case "$fb_act" in
      put)
        fb_key=${fb_tail%%:*}; fb_pay=${fb_tail#*:}
        printf 'action=put\nkey=%s\nhead=none\nvalue_b64=%s\n' "$fb_key" "$(b64file "$PAY/$fb_pay")" >> "$fb_out"
        ;;
      delete)
        printf 'action=delete\nkey=%s\nhead=none\n' "$fb_tail" >> "$fb_out"
        ;;
    esac
  done
}

fz_touched() { # <op> <key> <spec>
  case "$1" in
    put|delete) printf '%s\n' "$2" ;;
    batch)
      ft_rest=$3
      while [ -n "$ft_rest" ]; do
        case "$ft_rest" in
          *';'*) ft_item=${ft_rest%%;*}; ft_rest=${ft_rest#*;} ;;
          *) ft_item=$ft_rest; ft_rest="" ;;
        esac
        ft_tail=${ft_item#*:}
        printf '%s\n' "${ft_tail%%:*}"
      done
      ;;
  esac
}

fz_replay() { # <side> <sequence file>
  FR_SIDE=$1
  FR_SEQ=$2
  FR_N=0
  FR_STEP=0
  while IFS='|' read -r FR_OP FR_KEY FR_SPEC; do
    FR_STEP=$((FR_STEP + 1))
    case "$FR_OP" in
      put)
        FR_N=$((FR_N + 1))
        fz_call "$FR_SIDE" "$FR_N" "$PAY/$FR_SPEC" store.put fuzz "$FR_KEY"
        ;;
      delete)
        FR_N=$((FR_N + 1))
        fz_call "$FR_SIDE" "$FR_N" /dev/null store.delete fuzz "$FR_KEY"
        ;;
      batch)
        FR_N=$((FR_N + 1))
        fz_batch_input "$FR_SPEC" "$CAP/$FR_SIDE/$FR_N.in"
        fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" store.batch fuzz
        ;;
    esac
    for FR_K in $(fz_touched "$FR_OP" "$FR_KEY" "$FR_SPEC"); do
      FR_N=$((FR_N + 1))
      fz_call "$FR_SIDE" "$FR_N" /dev/null store.get fuzz "$FR_K"
    done
    if [ $((FR_STEP % 2)) -eq 0 ]; then
      FR_N=$((FR_N + 1))
      fz_call "$FR_SIDE" "$FR_N" /dev/null store.list fuzz
      FR_N=$((FR_N + 1))
      fz_call "$FR_SIDE" "$FR_N" /dev/null store.scan fuzz
    fi
    if [ $((FR_STEP % 6)) -eq 0 ]; then
      FR_N=$((FR_N + 1))
      case $(((FR_STEP / 6) % 5)) in
        0) FR_Q=needle ;;
        1) FR_Q=NEEDLE ;;
        2) FR_Q="needle in" ;;
        3) FR_Q=türkçe ;;
        4) FR_Q=absent-word ;;
      esac
      printf 'query=%s\n' "$FR_Q" > "$CAP/$FR_SIDE/$FR_N.in"
      fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" store.search fuzz exact 20
    fi
  done < "$FR_SEQ"
  FR_I=1
  while [ "$FR_I" -le 6 ]; do
    FR_N=$((FR_N + 1))
    fz_call "$FR_SIDE" "$FR_N" /dev/null store.get fuzz "a/k$FR_I"
    FR_I=$((FR_I + 1))
  done
  FR_N=$((FR_N + 1))
  fz_call "$FR_SIDE" "$FR_N" /dev/null store.list fuzz
  FR_N=$((FR_N + 1))
  fz_call "$FR_SIDE" "$FR_N" /dev/null store.scan fuzz
  FR_N=$((FR_N + 1))
  fz_call "$FR_SIDE" "$FR_N" "$PAY/p1" store.put fuzz a/zzneedle
  FR_N=$((FR_N + 1))
  fz_call "$FR_SIDE" "$FR_N" /dev/null store.get fuzz a/zzneedle
  FR_N=$((FR_N + 1))
  printf 'query=needle\n' > "$CAP/$FR_SIDE/$FR_N.in"
  fz_call "$FR_SIDE" "$FR_N" "$CAP/$FR_SIDE/$FR_N.in" store.search fuzz exact 20
  FR_TOTAL=$FR_N
}

fz_coverage() { # <side> <total>: null-check the run actually wrote and read data
  CV_SIDE=$1
  CV_MISS=""
  CV_PUT=0; CV_GET=0; CV_LIST=0; CV_SCAN=0; CV_SEARCH=0
  CV_I=1
  while [ "$CV_I" -le "$2" ]; do
    CV_FN=$(cat "$CAP/$CV_SIDE/$CV_I.fn" 2>/dev/null)
    if [ "$(cat "$CAP/$CV_SIDE/$CV_I.rc" 2>/dev/null)" = 0 ]; then
      case "$CV_FN" in
        store.put) grep -q '"op":"write"' "$CAP/$CV_SIDE/$CV_I.out" && CV_PUT=$((CV_PUT + 1)) ;;
        store.get) [ -s "$CAP/$CV_SIDE/$CV_I.out" ] && CV_GET=$((CV_GET + 1)) ;;
        store.list) grep -q '"keys":\["' "$CAP/$CV_SIDE/$CV_I.out" && CV_LIST=$((CV_LIST + 1)) ;;
        store.scan) grep -q '"items":\[{' "$CAP/$CV_SIDE/$CV_I.out" && CV_SCAN=$((CV_SCAN + 1)) ;;
        store.search) grep -q '"total_matches":[1-9]' "$CAP/$CV_SIDE/$CV_I.out" && CV_SEARCH=$((CV_SEARCH + 1)) ;;
      esac
    fi
    CV_I=$((CV_I + 1))
  done
  [ "$CV_PUT" -ge 1 ] || CV_MISS="$CV_MISS a successful put"
  [ "$CV_GET" -ge 1 ] || CV_MISS="$CV_MISS a successful get"
  [ "$CV_LIST" -ge 1 ] || CV_MISS="$CV_MISS a non-empty list"
  [ "$CV_SCAN" -ge 1 ] || CV_MISS="$CV_MISS a non-empty scan"
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

plant_driver() { # <sandbox>: wrap the fts5 driver so store.list answers one byte more
  pd_drv="$1/.contexture/modules/storage-fts5/drivers/fts5"
  mv "$pd_drv" "$pd_drv.real"
  {
    printf '#!/bin/sh\n'
    printf 'case "${1:-}" in\n'
    printf '  store.list)\n'
    printf '    out=$("$0.real" "$@"); rc=$?\n'
    printf '    if [ "$rc" -eq 0 ]; then printf "%%s \\n" "$out"; else printf "%%s\\n" "$out" >&2; fi\n'
    printf '    exit "$rc" ;;\n'
    printf 'esac\n'
    printf 'exec "$0.real" "$@"\n'
  } > "$pd_drv"
  chmod +x "$pd_drv"
}

if [ "$PLANT" -eq 1 ]; then
  PLANT_CALLS=$CALLS
  [ "$PLANT_CALLS" -gt 12 ] && PLANT_CALLS=12
  gen_sequence "$PLANT_CALLS" > "$SB/plant.seq"
  stage_side "$SB/plant/posix" posix
  stage_side "$SB/plant/fts5" fts5
  plant_driver "$SB/plant/fts5"
  POSIX_ROOT="$SB/plant/posix"
  FTS5_ROOT="$SB/plant/fts5"
  POSIX_DRIVER="$POSIX_ROOT/.contexture/storage/drivers/posix/driver"
  FTS5_DRIVER="$FTS5_ROOT/.contexture/modules/storage-fts5/drivers/fts5"
  CAP="$SB/plant/cap"
  mkdir -p "$CAP/posix" "$CAP/fts5"
  printf 'store-fuzz: planted divergence, seed %s, %s steps\n' "$SEED" "$PLANT_CALLS"
  fz_replay posix "$SB/plant.seq"
  fz_replay fts5 "$SB/plant.seq"
  [ "$FR_TOTAL" -ge 1 ] || { echo "store-fuzz: the plant sequence issued no calls" >&2; exit 2; }
  fz_coverage posix "$FR_TOTAL" || exit 2
  fz_coverage fts5 "$FR_TOTAL" || exit 2
  fz_compare "$CAP/posix" "$CAP/fts5" "$FR_TOTAL"
  if [ "$FC_DIFF" -gt 0 ]; then
    printf 'FUZZ: planted divergence reads DIFF (%d of %d calls differ)\n' "$FC_DIFF" "$FR_TOTAL"
    exit 0
  fi
  printf 'FUZZ: planted divergence NOT caught (%d calls compared)\n' "$FR_TOTAL"
  exit 1
fi

gen_sequence "$CALLS" > "$SB/seq"
stage_side "$SB/posix" posix
stage_side "$SB/fts5" fts5
POSIX_ROOT="$SB/posix"
FTS5_ROOT="$SB/fts5"
POSIX_DRIVER="$POSIX_ROOT/.contexture/storage/drivers/posix/driver"
FTS5_DRIVER="$FTS5_ROOT/.contexture/modules/storage-fts5/drivers/fts5"
CAP="$SB/cap"
mkdir -p "$CAP/posix" "$CAP/fts5"
printf 'store-fuzz: seed %s, %s steps, posix against fts5\n' "$SEED" "$CALLS"
fz_replay posix "$SB/seq"
fz_replay fts5 "$SB/seq"
[ "$FR_TOTAL" -ge 1 ] || { echo "store-fuzz: the sequence issued no calls" >&2; exit 2; }
fz_coverage posix "$FR_TOTAL" || exit 2
fz_coverage fts5 "$FR_TOTAL" || exit 2
fz_compare "$CAP/posix" "$CAP/fts5" "$FR_TOTAL"
if [ "$FC_DIFF" -eq 0 ]; then
  printf 'FUZZ: SAME (%d calls, seed %s)\n' "$FR_TOTAL" "$SEED"
  exit 0
fi
printf 'FUZZ: DIFF (%d of %d calls differ, seed %s)\n' "$FC_DIFF" "$FR_TOTAL" "$SEED"
exit 1
