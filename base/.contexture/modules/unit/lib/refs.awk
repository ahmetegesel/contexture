# refs.awk: the refs of a write payload, one per line, run after canon.awk and model.awk.
# The data script checks each one's full address shape before the unit lock.
# The environment: PX_PAY the payload file, PX_ERR the refusal file.

BEGIN {
  ERRF = ENVIRON["PX_ERR"]
  load_payload(ENVIRON["PX_PAY"])
  n = plist("refs", R)
  for (i = 1; i <= n; i++) print R[i]
}
