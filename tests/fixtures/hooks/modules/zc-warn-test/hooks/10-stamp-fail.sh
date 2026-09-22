#!/bin/sh
# ctx-hook: stamp
label=zc-warn-fail
if [ "${FORCE_FAIL:-0}" = "1" ]; then
  echo "FAIL $label point=$CTX_HOOK_POINT" >> marker.log
  exit 3
fi
echo "$label point=$CTX_HOOK_POINT" >> marker.log
