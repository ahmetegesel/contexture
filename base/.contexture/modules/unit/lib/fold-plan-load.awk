BEGIN {
  while ((getline ln < (dir "/plan.flat")) > 0) ld(ln)
  if (sv("v") != "4") exit 8
  ns = (T["scope"] == "a") ? V["scope"] + 0 : 0
  nc = (T["chunks"] == "a") ? V["chunks"] + 0 : 0
  nl = (T["lanes"] == "a") ? V["lanes"] + 0 : 0
  if (ns < 1 || nc < 1 || nl < 1) exit 8
  for (i = 1; i <= ns; i++) {
    s = sv("scope." i)
    if (s == "") exit 8
    SIDX[s] = i
    print s > (dir "/scope.txt")
  }
  ncar = (T["carried"] == "a") ? V["carried"] + 0 : 0
  for (i = 1; i <= ncar; i++) {
    s = sv("carried." i)
    if (s == "" || !(s in SIDX)) exit 8
    if (s in PCARR) exit 8
    PCARR[s] = 1
    print s > (dir "/carried_plan.txt")
  }
  covered = 0
  prev_last = 0
  for (i = 1; i <= nc; i++) {
    p = "chunks." i
    id = sv(p ".id"); anc = sv(p ".anchor"); ln = sv(p ".lane"); kd = sv(p ".kind")
    f = sv(p ".first") + 0; l = sv(p ".last") + 0; fr = sv(p ".from"); to = sv(p ".to"); ct = sv(p ".count") + 0
    if (id != i) exit 8
    if (f != prev_last + 1 || l < f) exit 8
    if (fr != sv("scope." f) || to != sv("scope." l)) exit 8
    if (ct != l - f + 1) exit 8
    if (ct > 12) exit 8
    if (ln in lane_last) {
      if (lane_last[ln] + 1 != f || lane_anchor[ln] != anc) exit 8
    } else {
      lane_anchor[ln] = anc
    }
    lane_last[ln] = l
    prev_last = l
    print id "\t" anc "\t" ln "\t" kd "\t" f "\t" l "\t" fr "\t" to "\t" ct > (dir "/chunks.tsv")
    covered += ct
  }
  if (prev_last != ns || covered != ns) exit 8
  for (i = 1; i <= nl; i++) {
    ln = sv("lanes." i)
    if (ln == "" || !(ln in lane_last)) exit 8
    print ln > (dir "/lanes.txt")
  }
  print "unit\t" sv("unit") > (dir "/plan.meta")
  print "epoch\t" sv("epoch") > (dir "/plan.meta")
  print "scope_n\t" ns > (dir "/plan.meta")
  print "chunk_n\t" nc > (dir "/plan.meta")
  print "lane_n\t" nl > (dir "/plan.meta")
  print "covered\t" covered > (dir "/plan.meta")
  print "uncovered\t" (ns - covered) > (dir "/plan.meta")
}
