#!/bin/sh
# test-driver.sh: the contract 2 compliance suite (tests/storage-compliance.sh) against the
# plugin's own fts5 driver.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
# the plugin's own module copy, never the workspace's adopted one: the two drift
PLUGIN_MODULE="$SCRIPT_DIR/../.contexture/modules/storage-fts5"

if ! command -v sqlite3 >/dev/null 2>&1; then
  printf 'SKIP: sqlite3 not found on PATH\n'
  exit 77
fi

COMPLIANCE="$ROOT/tests/storage-compliance.sh"
if [ ! -x "$COMPLIANCE" ]; then
  printf 'test-driver: compliance test harness missing at %s\n' "$COMPLIANCE" >&2
  exit 1
fi

# the plugin's own driver alone: it answers every function natively, no other driver runs
"$COMPLIANCE" --driver=fts5 --driver-exec="$PLUGIN_MODULE/drivers/fts5"
