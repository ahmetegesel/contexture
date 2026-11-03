# refs.awk: the refs of a write payload, one per line, run after canon.awk and model.awk.
# The data script validates a new canonical unit ref before writing; a legacy target and a
# file pointer stay as stored (the forward-only rule).
# The environment: PX_PAY the payload file, PX_ERR the refusal file.

BEGIN {
  ERRF = ENVIRON["PX_ERR"]
  load_payload(ENVIRON["PX_PAY"])
  n = plist("refs", R)
  for (i = 1; i <= n; i++) print R[i]
}
