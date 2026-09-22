#!/bin/sh
# session.sh: compatibility shim: the session entry now lives at ctx session
# (the base-shipped session family; run: ctx session help)
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$dir/ctx" session "$@"
