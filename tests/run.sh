#!/bin/sh
# run.sh: the upstream test runner. Runs the core suites (filters, ctx, session, hooks,
# record-audit, governance, storage-compliance), each hermetic and staged from the
# shipped core (storage compliance runs against base's posix driver by path, never the
# live drawer's copy); the session suite runs twice, once on the posix driver and once
# on the fts5 driver (the plugin's own copy staged into its sandbox; skip 77 when sqlite3
# lacks FTS5), so every verb is proven to reach the one configured store; then every
# plugin suite by convention
# (plugins/<name>/tests/run.sh; a suite with a declared need absent exits 77
# and skips cleanly, naming the need).
#
# The suites run concurrently: each is independent (its own mktemp sandbox, its own
# locks and stores inside it), so the runner starts them together, keeps each suite's
# output (stdout and stderr merged) in its own file under one gate scratch folder, and
# prints every suite's output followed by its outcome line in the fixed order below,
# whatever order they finish in. A suite's exit code is read from the suite itself
# (written by the job that ran it), never from a pipeline. A suite still running after
# GATE_SUITE_TIMEOUT seconds (default 1200) is stopped with its whole process tree and
# fails. GATE_JOBS caps how many suites run at once (default 0: all; 1 runs them one
# after another, the order unchanged; the session suite still runs its section groups at
# once inside its own run).
#
# The runner prints one outcome line per suite plus a final verdict, and exits
# non-zero when any suite fails. This is the ship gate: a red run holds the
# ship breath (tests/README.md, docs/plugins.md, AGENTS.workspace.md @git).
#
# Usage: tests/run.sh

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG

CORE_SUITES="filter-tests.sh ctx-tests.sh session-tests.sh session-tests.sh:fts5 hook-tests.sh record-audit-tests.sh governance-tests.sh storage-compliance.sh"

GATE_SUITE_TIMEOUT=${GATE_SUITE_TIMEOUT:-1200}
GATE_JOBS=${GATE_JOBS:-0}
case "$GATE_SUITE_TIMEOUT" in ''|*[!0-9]*) echo "run: GATE_SUITE_TIMEOUT must be a number of seconds" >&2; exit 1 ;; esac
case "$GATE_JOBS" in ''|*[!0-9]*) echo "run: GATE_JOBS must be a number" >&2; exit 1 ;; esac

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
GATE_DIR=$(mktemp -d "$tmp_root/gate.XXXXXX") || { echo "run: cannot create the gate scratch folder" >&2; exit 1; }

# tree_of <pid>: the pid and every descendant, parents first
tree_of() {
  { ps -eo pid=,ppid= 2>/dev/null || ps -o pid,ppid 2>/dev/null; } | awk -v r="$1" '
    $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ { kids[$2] = kids[$2] " " $1 }
    END { q[1] = r; h = 1; t = 1
      while (h <= t) { p = q[h++]; print p; n = split(kids[p], k, " "); for (i = 1; i <= n; i++) q[++t] = k[i] } }'
}
# stop_tree <pid>: TERM the whole tree, then KILL whatever outlived a second
stop_tree() {
  st_pids=$(tree_of "$1")
  # shellcheck disable=SC2086
  kill -TERM $st_pids 2>/dev/null
  sleep 1
  # shellcheck disable=SC2086
  kill -KILL $st_pids 2>/dev/null
  return 0
}

# the job list, in the fixed print order: one folder per suite (label, kind, the command)
n=0
ids=""
add_job() { # <label> <kind: run|missing|info|skip> [<suite path> [<argument>]]
  n=$((n + 1))
  mkdir -p "$GATE_DIR/$n"
  printf '%s\n' "$1" > "$GATE_DIR/$n/label"
  printf '%s\n' "$2" > "$GATE_DIR/$n/kind"
  [ $# -ge 3 ] && printf '%s\n' "$3" > "$GATE_DIR/$n/suite"
  [ $# -ge 4 ] && printf '%s\n' "$4" > "$GATE_DIR/$n/arg"
  ids="$ids $n"
}

for entry in $CORE_SUITES; do
  s=${entry%%:*}
  if [ ! -f "$SCRIPT_DIR/$s" ]; then
    add_job "core:$entry" missing
    continue
  fi
  case "$entry" in
    # the SPI harness defaults to the installed driver; the gate pins the shipped one
    storage-compliance.sh) add_job "core:$entry" run "$SCRIPT_DIR/$s" "--driver-exec=$ROOT/base/.contexture/modules/session/drivers/posix/driver" ;;
    # the second session run: the same assertions on the fts5 driver
    session-tests.sh:fts5) add_job "core:$entry" run "$SCRIPT_DIR/$s" "--driver=fts5" ;;
    *) add_job "core:$entry" run "$SCRIPT_DIR/$s" ;;
  esac
done
core_count=$n

plugin_seen=0
for p in "$ROOT"/plugins/*; do
  [ -d "$p" ] || continue
  plugin_seen=$((plugin_seen + 1))
  name=${p##*/}
  if [ -f "$p/tests/run.sh" ]; then
    add_job "plugin:$name" run "$p/tests/run.sh"
  elif [ -d "$p/tests" ]; then
    add_job "plugin:$name" info
  else
    add_job "plugin:$name" skip
  fi
done

running=""
stop_all() {
  for j in $running; do
    [ -f "$GATE_DIR/$j/rc" ] || stop_tree "$(cat "$GATE_DIR/$j/pid")"
  done
  wait
}
trap 'rm -rf "$GATE_DIR"' EXIT
trap 'stop_all; exit 130' INT
trap 'stop_all; exit 143' TERM HUP

# launch <id>: the suite as a background job; its rc lands in rc (atomic rename)
launch() {
  ld="$GATE_DIR/$1"
  ls=$(cat "$ld/suite")
  if [ -f "$ld/arg" ]; then
    la=$(cat "$ld/arg")
    ( sh "$ls" "$la" > "$ld/out" 2>&1 < /dev/null; printf '%s\n' "$?" > "$ld/rc.part"; mv "$ld/rc.part" "$ld/rc" ) &
  else
    ( sh "$ls" > "$ld/out" 2>&1 < /dev/null; printf '%s\n' "$?" > "$ld/rc.part"; mv "$ld/rc.part" "$ld/rc" ) &
  fi
  printf '%s\n' "$!" > "$ld/pid"
  date +%s > "$ld/start"
  running="$running $1"
}

queue=""
for i in $ids; do
  [ "$(cat "$GATE_DIR/$i/kind")" = run ] && queue="$queue $i"
done

while :; do
  # finished or overdue jobs leave the running set
  still=""
  now=$(date +%s)
  for j in $running; do
    jd="$GATE_DIR/$j"
    if [ -f "$jd/rc" ]; then
      date +%s > "$jd/end"
      continue
    fi
    if [ $((now - $(cat "$jd/start"))) -ge "$GATE_SUITE_TIMEOUT" ]; then
      stop_tree "$(cat "$jd/pid")"
      : > "$jd/timedout"
      date +%s > "$jd/end"
      continue
    fi
    still="$still $j"
  done
  running=$still
  # start queued jobs while a slot is free
  while [ -n "$queue" ]; do
    set -- $running
    if [ "$GATE_JOBS" -gt 0 ] && [ $# -ge "$GATE_JOBS" ]; then
      break
    fi
    set -- $queue
    launch "$1"
    shift
    queue="$*"
  done
  [ -z "$running" ] && [ -z "$queue" ] && break
  sleep 1
done
wait

pass=0
fail=0
skipped=0

printf 'run: the upstream test runner at %s\n' "$ROOT"
printf 'core suites: %s\n\n' "$CORE_SUITES"

times=""
for i in $ids; do
  d="$GATE_DIR/$i"
  label=$(cat "$d/label")
  kind=$(cat "$d/kind")
  if [ "$i" -eq $((core_count + 1)) ]; then
    printf '\nplugin suites (convention: plugins/<name>/tests/run.sh):\n'
  fi
  case "$kind" in
    missing)
      printf 'FAIL %s (suite missing)\n' "$label"
      fail=$((fail + 1))
      continue
      ;;
    info)
      printf 'INFO %s: no tests/run.sh (its fixture pairs ride the filters suite)\n' "$label"
      continue
      ;;
    skip)
      printf 'SKIP %s (no tests/)\n' "$label"
      skipped=$((skipped + 1))
      continue
      ;;
  esac
  cat "$d/out"
  times="$times $label=$(( $(cat "$d/end") - $(cat "$d/start") ))s"
  if [ -f "$d/timedout" ]; then
    printf 'FAIL %s (timed out after %ss, stopped)\n' "$label" "$GATE_SUITE_TIMEOUT"
    fail=$((fail + 1))
    continue
  fi
  rc=$(cat "$d/rc")
  if [ "$rc" -eq 0 ]; then
    printf 'PASS %s\n' "$label"
    pass=$((pass + 1))
  elif [ "$rc" -eq 77 ]; then
    printf 'SKIP %s (need named by the suite above)\n' "$label"
    skipped=$((skipped + 1))
  else
    printf 'FAIL %s (rc=%s)\n' "$label" "$rc"
    fail=$((fail + 1))
  fi
done
if [ "$core_count" -eq "$n" ]; then
  printf '\nplugin suites (convention: plugins/<name>/tests/run.sh):\n'
fi
if [ "$plugin_seen" -eq 0 ]; then
  printf 'SKIP plugin suites: plugins/ is absent\n'
  skipped=$((skipped + 1))
fi

printf '\nsuite times:%s\n' "$times"
printf '\nrun: %d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skipped"
if [ "$fail" -gt 0 ]; then
  printf 'run: FAIL\n'
  exit 1
fi
printf 'run: PASS (all suites green)\n'
exit 0
