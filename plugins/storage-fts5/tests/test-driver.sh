#!/bin/sh
# test-driver.sh: the record compliance suite through the unit module data script over the
# plugin's own fts5 copy (tests/storage-compliance.sh --data=unit --driver=fts5). The record
# is the unit module's data over the store; the driver keeps capability, storage.health, the
# store seven, and store.search.

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

# the plugin's own driver alone (the suite stages this plugin copy), the record through the
# unit module data script over it
"$COMPLIANCE" --data=unit --driver=fts5
