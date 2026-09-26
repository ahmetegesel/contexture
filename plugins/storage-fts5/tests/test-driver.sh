#!/bin/sh
# test-driver.sh: execute SPI compliance test suite against SQLite FTS5 driver.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)

if ! command -v sqlite3 >/dev/null 2>&1; then
  printf 'SKIP: sqlite3 not found on PATH\n'
  exit 77
fi

COMPLIANCE="$ROOT/tests/storage-compliance.sh"
if [ ! -x "$COMPLIANCE" ]; then
  printf 'test-driver: compliance test harness missing at %s\n' "$COMPLIANCE" >&2
  exit 1
fi

"$COMPLIANCE" --driver=fts5
