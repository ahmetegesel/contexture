# payfield.awk: one decoded payload value, raw, run after canon.awk and model.awk.
# The environment: PX_PAY the payload file, PX_ERR the refusal file, PK the key.

BEGIN {
  ERRF = ENVIRON["PX_ERR"]
  load_payload(ENVIRON["PX_PAY"])
  k = ENVIRON["PK"]
  printf "%s", ((k in PAY) ? PAY[k] : "")
}
