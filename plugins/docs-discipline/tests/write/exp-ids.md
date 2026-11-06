@doc capability unit
  repo: wtest
  description: "A fixture unit for the write verbs"
  sources: [src/unit/**]
  keywords: [fixture, unit]

@responsibilities
  - "Own the fixture state"
    id: unit-o-kb1uj
  - "Delegate the rest"
    id: unit-o-p1cup

@contract
  - rule: "The first invariant holds"
    id: unit-r-07m9y
    evidence: "firstSym"
  - rule: "The second invariant holds"
    id: unit-r-t5sws
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
