#!/bin/sh
# compact.sh: silent forwarder over ctx run
# The selection body lives in ctx run; this file only execs it with the
# CONTEXTURE_COMPACT_SHIM flag so the legacy message labels stay identical
# for every existing call site. One-way by construction: ctx run never calls
# back here. No usage is taught from this file; ctx help and ctx run --help
# are the public surface.
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONTEXTURE_COMPACT_SHIM=1 exec "$dir/ctx" run "$@"
