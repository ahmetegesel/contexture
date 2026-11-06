@doc structural esc
  repo: etest
  description: "Carries a literal backslash sequence"
  sources: [e/**]
  keywords: [e]

@contract
  - rule: "The marker reads zz\tqq on disk"
    evidence: "escSym"
