BEGIN {
  while ((getline ln < (dir "/board.flat")) > 0) ld(ln)
  nl = (T["live"] == "a") ? V["live"] + 0 : 0
  for (i = 1; i <= nl; i++) {
    p = "live." i
    s = sv(p ".slug"); if (s == "") continue
    TH[s] = sv(p ".thread"); AN[s] = sv(p ".anchor")
  }
  while ((getline s < (dir "/scope.txt")) > 0) {
    t = TH[s]
    if (t != "" && t != "none") print s "\t" AN[s] "\t" t > (dir "/carried.tsv")
  }
}
