@doc capability unit
  repo: wtest
  description: "A fixture unit for the write verbs"
  sources: [src/unit/**]
  keywords: [fixture, unit]

@responsibilities
  - "Own the fixture state"
    id: unit-o1
  - "Delegate the rest"
    id: unit-o2

@contract
  - rule: "The first invariant holds"
    id: unit-r1
    evidence: "firstSym"
  - rule: "The second invariant holds"
    id: unit-r2
    evidence: "secondSym"
    detail ::
      a detail body line

@edges
  - direction: exposes
    via: http
    key: "GET /unit"
    detail: "Serves the unit."

@pitfalls
  - id: unit-p1
    summary: "The first pitfall"
    class: bug
    severity: medium
    trigger: "A trigger"
    consequence ::
      A consequence body.
    evidence: "pitSym"

@see_also
  - ref: other
    why: "A neighbor"
