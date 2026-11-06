#!/bin/sh
# ctx-hook: stamp
label=zz-stamp
echo "HOOK $label point=$CTX_HOOK_POINT unit=$CTX_UNIT anchor=${CTX_ANCHOR:-none} act=${CTX_ACT:-none} slugs=${CTX_SLUGS:-none} form=${CTX_LOAD_FORM:-none} page=${CTX_LOAD_PAGE:-none}"
echo "$label point=$CTX_HOOK_POINT unit=$CTX_UNIT anchor=${CTX_ANCHOR:-none} act=${CTX_ACT:-none} slugs=${CTX_SLUGS:-none} form=${CTX_LOAD_FORM:-none} page=${CTX_LOAD_PAGE:-none}" >> marker.log
