#!/bin/sh
# test-store-compliance.sh: the generic module store compliance suite (tests/store-compliance.sh)
# against the plugin's own fts5 driver.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
PLUGIN_MODULE="$SCRIPT_DIR/../.contexture/modules/storage-fts5"

if ! command -v sqlite3 >/dev/null 2>&1; then
  printf 'SKIP: sqlite3 not found on PATH\n'
  exit 77
fi

COMPLIANCE="$ROOT/tests/store-compliance.sh"
if [ ! -x "$COMPLIANCE" ]; then
  printf 'test-store-compliance: compliance harness missing at %s\n' "$COMPLIANCE" >&2
  exit 1
fi

"$COMPLIANCE" --driver=fts5 --driver-exec="$PLUGIN_MODULE/drivers/fts5"
