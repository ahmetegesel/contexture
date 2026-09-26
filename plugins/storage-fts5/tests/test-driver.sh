#!/bin/sh
# test-driver.sh: execute SPI compliance test suite against SQLite FTS5 driver.

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

# the record grammar the driver renders through: the shipped core's posix driver
CTX_REFERENCE_DRIVER="$ROOT/base/.contexture/modules/session/drivers/posix/driver"
export CTX_REFERENCE_DRIVER
"$COMPLIANCE" --driver=fts5 --driver-exec="$PLUGIN_MODULE/drivers/fts5"
