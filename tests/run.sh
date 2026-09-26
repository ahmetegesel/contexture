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

pass=0
fail=0
skipped=0

printf 'run: the upstream test runner at %s\n' "$ROOT"
printf 'core suites: %s\n\n' "$CORE_SUITES"

for entry in $CORE_SUITES; do
  s=${entry%%:*}
  if [ ! -f "$SCRIPT_DIR/$s" ]; then
    printf 'FAIL core:%s (suite missing)\n' "$entry"
    fail=$((fail + 1))
    continue
  fi
  args=""
  case "$entry" in
    # the SPI harness defaults to the installed driver; the gate pins the shipped one
    storage-compliance.sh) args="--driver-exec=$ROOT/base/.contexture/modules/session/drivers/posix/driver" ;;
    # the second session run: the same assertions on the fts5 driver
    session-tests.sh:fts5) args="--driver=fts5" ;;
  esac
  sh "$SCRIPT_DIR/$s" $args
  rc=$?
  if [ "$rc" -eq 0 ]; then
    printf 'PASS core:%s\n' "$entry"
    pass=$((pass + 1))
  elif [ "$rc" -eq 77 ]; then
    printf 'SKIP core:%s (need named by the suite above)\n' "$entry"
    skipped=$((skipped + 1))
  else
    printf 'FAIL core:%s (rc=%s)\n' "$entry" "$rc"
    fail=$((fail + 1))
  fi
done

printf '\nplugin suites (convention: plugins/<name>/tests/run.sh):\n'
plugin_seen=0
for p in "$ROOT"/plugins/*; do
  [ -d "$p" ] || continue
  plugin_seen=$((plugin_seen + 1))
  name=${p##*/}
  if [ -f "$p/tests/run.sh" ]; then
    sh "$p/tests/run.sh"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      printf 'PASS plugin:%s\n' "$name"
      pass=$((pass + 1))
    elif [ "$rc" -eq 77 ]; then
      printf 'SKIP plugin:%s (need named by the suite above)\n' "$name"
      skipped=$((skipped + 1))
    else
      printf 'FAIL plugin:%s (rc=%s)\n' "$name" "$rc"
      fail=$((fail + 1))
    fi
  elif [ -d "$p/tests" ]; then
    printf 'INFO plugin:%s: no tests/run.sh (its fixture pairs ride the filters suite)\n' "$name"
  else
    printf 'SKIP plugin:%s (no tests/)\n' "$name"
    skipped=$((skipped + 1))
  fi
done
if [ "$plugin_seen" -eq 0 ]; then
  printf 'SKIP plugin suites: plugins/ is absent\n'
  skipped=$((skipped + 1))
fi

printf '\nrun: %d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skipped"
if [ "$fail" -gt 0 ]; then
  printf 'run: FAIL\n'
  exit 1
fi
printf 'run: PASS (all suites green)\n'
exit 0
