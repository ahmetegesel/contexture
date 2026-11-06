@doc structural idtwo
  repo: etest
  description: "Reuses that id as a pitfall id"
  sources: [b/**]
  keywords: [b]

@pitfalls
  - id: idone-r1
    summary: "A pitfall"
    class: bug
    severity: low
    trigger: "t"
    consequence: "c"
    evidence: "pitSym"
