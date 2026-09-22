#!/bin/sh
# ctx-hook: refresh
# ctx-hook-mode: block
label=zzz-refresh-block-fail
if [ "${FORCE_FAIL:-0}" = "1" ]; then
  echo "FAIL $label point=$CTX_HOOK_POINT" >> marker.log
  exit 3
fi
exit 0
