BEGIN {
  while ((getline ln < (dir "/board.flat")) > 0) ld(ln)
  n = (T["live"] == "a") ? V["live"] + 0 : 0
  v4 = 0; v1 = 0; fin = 0
  for (i = 1; i <= n; i++) {
    w = sv("live." i ".what"); s = sv("live." i ".slug")
    if (w ~ /^FOLD START v4 /) {
      v4++
      if (v4 == 1) {
        v4_slug = s
        p = index(w, " :: ")
        if (p == 0) v4_bad = 1
        else v4_plan = substr(w, p + 4)
      }
    } else if (w ~ /^FOLD START v1 /) {
      v1++
      if (v1 == 1) v1_slug = s
    } else if (w ~ /^FOLD FINISH v4 /) {
      fin++
      fin_slug = s
      fin_what = w
      split(w, P, " ")
      fin_start = (4 in P) ? P[4] : ""
    }
  }
  if (v1 > 0) { print "V3\t" v1_slug; exit 0 }
  if (v4 > 1) { print "MULTI\t" v4_slug; exit 0 }
  if (v4 == 1) {
    if (v4_bad) { print "CORRUPT\t" v4_slug; exit 0 }
    print "ACTIVE\t" v4_slug "\t" v4_plan
    exit 0
  }
  if (fin > 0) { print "FINISHED\t" fin_slug "\t" fin_start "\t" fin_what; exit 0 }
  print "NONE"
}
