#!/bin/sh
# ctx-hook: load-pre
# ctx-hook-mode: block
label=zb-block-fail
if [ "${FORCE_FAIL:-0}" = "1" ]; then
  echo "FAIL $label point=$CTX_HOOK_POINT" >> marker.log
  exit 3
fi
echo "$label point=$CTX_HOOK_POINT" >> marker.log
