BEGIN {
  while ((getline ln < (dir "/board.flat")) > 0) ld(ln)
  nl = (T["live"] == "a") ? V["live"] + 0 : 0
  for (i = 1; i <= nl; i++) {
    p = "live." i
    s = sv(p ".slug"); if (s == "") continue
    t = sv(p ".thread")
    if (t != "" && t != "none") TH[s] = t
  }
  while ((getline s < (dir "/carried_plan.txt")) > 0) PC[s] = 1
  n = 0
  while ((getline s < (dir "/scope.txt")) > 0) { n++; SL[n] = s }
  for (i = first; i <= last; i++) printf "    --ref=\"journal#%s\" \\\n", SL[i] >> (dir "/hint_refs")
  for (i = first; i <= last; i++) {
    s = SL[i]
    if (s in TH || s in PC) print s >> (dir "/hint_carried")
    else printf "    --closes=\"%s (folded: consolidated)\" \\\n", s >> (dir "/hint_closers")
  }
}
