function defect(code, detail) { printf "%s\t%s\n", code, detail >> (dir "/defects") }
function is_ref(p, s,   k, r) {
  k = (T[p ".refs"] == "a") ? V[p ".refs"] + 0 : 0
  for (r = 1; r <= k; r++) if (sv(p ".refs." r) == "journal#" s) return 1
  return 0
}
function is_live_thread(s) { return LIVE[s] && TH_OF[s] != "" && TH_OF[s] != "none" }
function chunk_carried_only(c, bi,   q, s) {
  for (q = C_FIRST[c]; q <= C_LAST[c]; q++) {
    s = S[q]
    if (ETS[s] == bi) continue
    if (!is_live_thread(s)) return 0
  }
  return 1
}
BEGIN {
  ns = nscope + 0; nc = nchunk + 0
  printf "" > (dir "/external.tsv")
  while ((getline ln < (dir "/scope.txt")) > 0) {
    nsx++; S[nsx] = ln; IDX[ln] = nsx
  }
  while ((getline ln < (dir "/carried_plan.txt")) > 0) PC[ln] = 1
  while ((getline ln < (dir "/chunks.tsv")) > 0) {
    split(ln, Q, "\t")
    c = Q[1] + 0
    C_LANE[c] = Q[3]; C_FIRST[c] = Q[5] + 0; C_LAST[c] = Q[6] + 0
    C_FROM[c] = Q[7]; C_TO[c] = Q[8]; C_ANCHOR[c] = Q[2]; C_KIND[c] = Q[4]
    anc = C_ANCHOR[c]
    if (!(anc in AC_FIRST) || c < AC_FIRST[anc]) AC_FIRST[anc] = c
    if (c > AC_LAST[anc]) AC_LAST[anc] = c
    AC_N[anc]++
    for (i = C_FIRST[c]; i <= C_LAST[c]; i++) SC[S[i]] = c
  }
  while ((getline ln < (dir "/board.flat")) > 0) ld(ln)
  nlive = (T["live"] == "a") ? V["live"] + 0 : 0
  for (i = 1; i <= nlive; i++) {
    p = "live." i
    L[i] = sv(p ".slug"); W[i] = sv(p ".what"); A[i] = sv(p ".anchor")
    LIVE[L[i]] = 1; TH_OF[L[i]] = sv(p ".thread"); AN_OF[L[i]] = A[i]
    if (L[i] == fs) fs_pos = i
  }
  if (fs_pos == 0) defect("PLAN_DRIFT", "the fold start " fs " is not live")
  for (i = 1; i <= nlive; i++) if (W[i] ~ /^FOLD START v1 /) defect("V3_START_LIVE", L[i] " is a live v3 fold start")
  for (i = 1; i < fs_pos; i++) if (!(L[i] in IDX)) defect("PLAN_DRIFT", L[i] " is live before the fold start but outside the plan scope")
  nb = 0
  for (i = fs_pos + 1; i <= nlive; i++) {
    p = "live." i
    ncl = (T[p ".closers"] == "a") ? V[p ".closers"] + 0 : 0
    nsct = 0; bad = 0; nother = 0
    for (j = 1; j <= ncl; j++) {
      cp = p ".closers." j
      kind = sv(cp ".kind"); verdict = sv(cp ".verdict"); reason = sv(cp ".reason")
      if (kind != "CLOSES") continue
      tn = (T[cp ".targets"] == "a") ? V[cp ".targets"] + 0 : 0
      for (k = 1; k <= tn; k++) {
        t = sv(cp ".targets." k)
        if (TSEEN[t] == i) continue
        TSEEN[t] = i
        if (!(t in IDX)) { nother++; OTHER[nother] = t; continue }
        nsct++
        ETS[t] = i
        if (t in PC) {
          defect("THREAD_CLOSED", L[i] " closes the carried open thread " t "; an open thread stays live and is carried")
          bad = 1
        }
        if (verdict != "folded" || reason == "") {
          defect("CLOSER_NOT_FOLDED", L[i] " closes " t " with " ((verdict == "") ? "(no verdict)" : verdict))
          bad = 1
        }
        if (!is_ref(p, t)) { defect("UNREFERENCED_CLOSER", L[i] " closes " t " without a journal#" t " REF"); bad = 1 }
      }
    }
    if (nsct == 0) continue
    nb++
    B_SLUG[nb] = L[i]; B_VALID[nb] = 1
    for (m = 1; m <= nother; m++) { defect("TARGET_OUTSIDE_SCOPE", L[i] " closes " OTHER[m] " outside the scope"); bad = 1 }
    min = 0; max = 0; lanes = 0; cross = 0; nonc = 0
    for (s in ETS) {
      if (ETS[s] != i) continue
      c = SC[s]
      if (ECS[c] != i) { ECS[c] = i; if (min == 0 || c < min) min = c; if (c > max) max = c }
      ln = C_LANE[c]
      if (LSET[ln] != i) { LSET[ln] = i; lanes++; if (lanes > 1) cross = 1; lane0 = ln }
    }
    if (cross) { defect("BATCH_CROSS_LANE", L[i] " spans lanes " lane0 " and another"); bad = 1 }
    for (c = min; c <= max; c++) {
      if (ECS[c] == i) continue
      if (chunk_carried_only(c, i)) continue
      nonc = 1; break
    }
    if (nonc) { defect("BATCH_NOT_CONSECUTIVE", L[i] " claims chunks " min " to " max " with a gap"); bad = 1 }
    for (c = min; c <= max && !cross; c++) {
      if (ECS[c] != i) continue
      for (q = C_FIRST[c]; q <= C_LAST[c]; q++) {
        s = S[q]
        if (ETS[s] == i) continue
        if (is_live_thread(s)) continue
        defect("BATCH_PARTIAL_CHUNK", L[i] " does not claim all of chunk " c); bad = 1; break
      }
    }
    for (c = min; c <= max; c++) {
      if (ECS[c] != i) continue
      for (q = C_FIRST[c]; q <= C_LAST[c]; q++) {
        s = S[q]
        if (ETS[s] == i) continue
        if (!is_live_thread(s)) continue
        if (!is_ref(p, s)) { defect("CARRIED_UNREFERENCED", L[i] " does not REF the carried open thread " s); bad = 1 }
      }
    }
    B_FIRST[nb] = min; B_LAST[nb] = max; B_LANE[nb] = lane0; B_COUNT[nb] = nsct
    anc0 = C_ANCHOR[min]
    if (nsct > 12) { defect("CONSTITUENT_CAP", L[i] " folds " nsct " constituents (the cap is 12); split the batch by topic"); bad = 1 }
    if (AC_N[anc0] > 1 && min == AC_FIRST[anc0] && max == AC_LAST[anc0]) { defect("WHOLE_ANCHOR_BATCH", L[i] " folds the whole anchor " anc0 " in one entry; split it by topic"); bad = 1 }
    if (max - min + 1 > 2) { defect("MERGE_BEYOND_NEXT", L[i] " spans " (max - min + 1) " chunks; a merge covers only the next chunk"); bad = 1 }
    if (max - min + 1 == 2 && W[i] !~ /\(merged: [^)]+\)/) { defect("MERGE_REASON_MISSING", L[i] " merges chunks " min " and " max " without a (merged: <reason>) in the WHAT"); bad = 1 }
    B_VALID[nb] = (bad ? 0 : 1)
    sig = ""
    for (q = 1; q <= ns; q++) if (ETS[S[q]] == i) sig = sig " " S[q]
    SIG_BY[L[i]] = sig
    nrf = (T[p ".refs"] == "a") ? V[p ".refs"] + 0 : 0
    for (r = 1; r <= nrf; r++) {
      rf = sv(p ".refs." r)
      if (rf ~ /^journal#/ && (substr(rf, 9) in ETS) && ETS[substr(rf, 9)] == i) continue
      print L[i] "\t" rf > (dir "/external.tsv")
    }
    for (s in ETS) {
      if (ETS[s] != i) continue
      CLAIM[s]++
      if (CLAIM[s] == 1) { CL1[s] = L[i] } else if (CLAIM[s] == 2) { CL2[s] = L[i] }
    }
  }
  uncovered = 0; live_scoped = 0; carried = 0; covered = 0
  for (i = 1; i <= ns; i++) {
    s = S[i]
    if (CLAIM[s] > 0) covered++
    if (CLAIM[s] == 0) {
      if (is_live_thread(s)) {
        carried++
        CARRY[s] = 1
        print s "\t" AN_OF[s] "\t" TH_OF[s] > (dir "/carried.tsv")
      } else {
        uncovered++
        if (LIVE[s]) { live_scoped++; if (mode == "full") defect("SCOPED_LIVE", s " is still live") }
        else if (mode == "full") defect("CONSOLIDATION_NOT_LIVE", s " is closed but no live consolidation covers it")
        GAP[SC[s]] = 1
      }
    }
    if (CLAIM[s] > 1) {
      e1 = CL1[s]; e2 = CL2[s]
      if (e1 > e2) { q = e1; e1 = e2; e2 = q }
      key = e1 SUBSEP e2
      if (!(key in PAIR)) {
        PAIR[key] = 1
        if (SIG_BY[e1] == SIG_BY[e2])
          defect("DOUBLE_CONSOLIDATION", e1 " and " e2 " claim the same batch (first " s ")")
        else
          defect("BATCH_OVERLAP", e1 " and " e2 " share " s)
      }
    }
  }
  if (mode == "full") for (c = 1; c <= nc; c++) if (GAP[c]) defect("BATCH_GAP", "chunk " c " is not covered by a live consolidation")
  for (c = 1; c <= nc; c++) {
    open = 0
    for (i = C_FIRST[c]; i <= C_LAST[c]; i++) if (CLAIM[S[i]] == 0 && !CARRY[S[i]]) open = 1
    print c "\t" open > (dir "/chunk_open.tsv")
  }
  valid = 0
  for (b = 1; b <= nb; b++) {
    if (B_VALID[b]) valid++
    printf "%s\t%s\t%d\t%d\t%d\t%d\n", B_SLUG[b], B_LANE[b], B_FIRST[b], B_LAST[b], B_COUNT[b], B_VALID[b] > (dir "/batches.tsv")
  }
  printf "%d\t%d\t%d\t%d\t%d\t%d\n", uncovered, nb, valid, live_scoped, carried, covered > (dir "/summary")
}
