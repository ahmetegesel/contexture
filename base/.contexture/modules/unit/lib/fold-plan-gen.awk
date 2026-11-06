BEGIN {
  while ((getline ln < (dir "/board.flat")) > 0) ld(ln)
  nl = (T["live"] == "a") ? V["live"] + 0 : 0
  n = 0
  for (i = 1; i <= nl; i++) {
    p = "live." i
    s = sv(p ".slug"); if (s == "") continue
    n++; S[n] = s; A[n] = sv(p ".anchor"); W[n] = sv(p ".what"); TH[n] = sv(p ".thread")
  }
  if (n == 0) exit 0
  ng = 0; i = 1
  while (i <= n) {
    ng++; GF[ng] = i; a = A[i]; j = i
    while (j < n && A[j + 1] == a) j++
    GL[ng] = j; GA[ng] = a; i = j + 1
  }
  nc = 0
  for (g = 1; g <= ng; g++) {
    f = GF[g]; l = GL[g]; nm = 0
    for (k = f; k <= l; k++) {
      kd = kind(W[k])
      if (kd != "") { nm++; MI[nm] = k; MK[nm] = kd }
    }
    lane = "fold-" epoch "-" g
    if (nm == 0) {
      nc++; CAN[nc] = san(GA[g]); CLN[nc] = lane; CKD[nc] = "ANCHOR"; CF[nc] = f; CL[nc] = l
    } else {
      prev = f
      for (m = 1; m <= nm; m++) {
        nc++; CAN[nc] = san(GA[g]); CLN[nc] = lane; CKD[nc] = MK[m]; CF[nc] = prev; CL[nc] = MI[m]
        prev = MI[m] + 1
      }
      if (prev <= l) { nc++; CAN[nc] = san(GA[g]); CLN[nc] = lane; CKD[nc] = "TAIL"; CF[nc] = prev; CL[nc] = l }
    }
  }
  ncc = 0
  for (c = 1; c <= nc; c++) {
    if (ncc > 0 && CLN[c] == GCN[ncc] && CF[c] == GCL[ncc] + 1 && joins(GCF[ncc], GCL[ncc], GCK[ncc], CF[c], CL[c], CKD[c])) {
      GCL[ncc] = CL[c]; GCK[ncc] = GCK[ncc] "/" CKD[c]
    } else {
      ncc++; GCF[ncc] = CF[c]; GCL[ncc] = CL[c]; GCN[ncc] = CLN[c]; GCK[ncc] = CKD[c]; GCA[ncc] = CAN[c]
    }
  }
  nc = ncc
  for (c = 1; c <= nc; c++) { CF[c] = GCF[c]; CL[c] = GCL[c]; CLN[c] = GCN[c]; CKD[c] = GCK[c]; CAN[c] = GCA[c] }
  ncs = 0
  for (c = 1; c <= nc; c++) {
    f = CF[c]; l = CL[c]; was = 0
    while (l - f + 1 > 12) {
      s = split_at(f, l)
      ncs++; SCF[ncs] = f; SCL[ncs] = s; SCK[ncs] = CKD[c]; SCN[ncs] = CLN[c]; SCA[ncs] = CAN[c]; SCS[ncs] = 1
      f = s + 1; was = 1
    }
    ncs++; SCF[ncs] = f; SCL[ncs] = l; SCK[ncs] = CKD[c]; SCN[ncs] = CLN[c]; SCA[ncs] = CAN[c]; SCS[ncs] = (was ? 1 : 0)
  }
  nc = ncs
  for (c = 1; c <= nc; c++) { CF[c] = SCF[c]; CL[c] = SCL[c]; CKD[c] = SCK[c]; CLN[c] = SCN[c]; CAN[c] = SCA[c]; CSP[c] = SCS[c] }
  covered = 0
  for (c = 1; c <= nc; c++) covered += (CL[c] - CF[c] + 1)
  if (covered != n) exit 9
  for (c = 1; c <= nc; c++) if (CL[c] - CF[c] + 1 > 12) exit 9
  ncar = 0
  for (i = 1; i <= n; i++) if (TH[i] != "" && TH[i] != "none") { ncar++; CR[ncar] = S[i] }
  out = dir "/plan.json"
  printf "{\"v\":4,\"unit\":\"%s\",\"epoch\":\"%s\",\"scope\":[", unit, epoch > out
  for (i = 1; i <= n; i++) printf "%s\"%s\"", (i > 1 ? "," : ""), S[i] > out
  printf "],\"carried\":[" > out
  for (i = 1; i <= ncar; i++) printf "%s\"%s\"", (i > 1 ? "," : ""), CR[i] > out
  printf "],\"chunks\":[" > out
  for (c = 1; c <= nc; c++) printf "%s{\"id\":%d,\"anchor\":\"%s\",\"lane\":\"%s\",\"kind\":\"%s\",\"first\":%d,\"last\":%d,\"from\":\"%s\",\"to\":\"%s\",\"count\":%d,\"cap_split\":%s}", (c > 1 ? "," : ""), c, CAN[c], CLN[c], CKD[c], CF[c], CL[c], S[CF[c]], S[CL[c]], (CL[c] - CF[c] + 1), (CSP[c] ? "true" : "false") > out
  printf "],\"lanes\":[" > out
  nlan = 0
  for (c = 1; c <= nc; c++) if (!(CLN[c] in SEENL)) { SEENL[CLN[c]] = 1; nlan++; LAN[nlan] = CLN[c] }
  for (i = 1; i <= nlan; i++) printf "%s\"%s\"", (i > 1 ? "," : ""), LAN[i] > out
  printf "]}\n" > out
  close(out)
}
function joins(pf, pl, pk, cf, cl, ck) {
  if (pk == "TASK_DONE" && ck == "TASK_DONE") return 1
  if (pk == "RELEASE" && ck == "TASK_DONE") return 1
  p1 = clause(W[pf]); c1 = clause(W[cf])
  if (p1 != "" && p1 == c1) return 1
  return 0
}
function clause(w,   x) {
  x = w
  if (match(x, /part [0-9]+/)) return "part " substr(x, RSTART + 5, RLENGTH - 5)
  if (match(x, /si-[A-Za-z0-9_]+/)) return substr(x, RSTART, RLENGTH)
  if (match(x, /backlog#[A-Za-z0-9_-]+/)) return substr(x, RSTART, RLENGTH)
  return ""
}
function split_at(f, l,   i, best) {
  best = f + 11
  for (i = f + 1; i <= f + 11 && i < l; i++) if (is_seam(i)) best = i
  return best
}
function is_seam(i) {
  if (W[i] ~ /^backlog\/[A-Za-z0-9_-]+: DONE/) return 1
  if (W[i] ~ /^DECIDE/ || W[i] ~ /^RELEASE/ || W[i] ~ /^LAND /) return 1
  if (clause(W[i]) != "") return 1
  return 0
}
function san(a,   s, i, c, o) {
  if (a == "") return "NA"
  s = a; o = ""
  for (i = 1; i <= length(s); i++) {
    c = substr(s, i, 1)
    o = o (c ~ /[A-Za-z0-9_-]/ ? c : "_")
  }
  return (o == "" ? "NA" : o)
}
function kind(w) {
  if (w ~ /^backlog\/[A-Za-z0-9_-]+: DONE/) return "TASK_DONE"
  if (w ~ /^LAND / || w ~ /^RELEASE/ || w ~ /^shipped/ || w ~ /tag v[0-9]/) return "RELEASE"
  if (w ~ /^DECIDE/ || w ~ /DISCUSS and DECIDE settled/) return "DECIDE"
  if (w ~ /^HANDOFF/) return "HANDOFF"
  if (w ~ /^PERIOD CLOSE/) return "PERIOD_CLOSE"
  if (w ~ /^HARVEST/) return "HARVEST"
  if (w ~ /^LANE REPORT/) return "LANE_REPORT"
  if (w ~ /^HUMAN/) return "HUMAN"
  return ""
}
