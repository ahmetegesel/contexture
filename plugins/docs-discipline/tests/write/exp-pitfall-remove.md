@doc capability unit
  repo: wtest
  description: "A fixture unit for the write verbs"
  sources: [src/unit/**]
  keywords: [fixture, unit]

@responsibilities
  - "Own the fixture state"
  - "Delegate the rest"

@contract
  - rule: "The first invariant holds"
    evidence: "firstSym"
  - rule: "The second invariant holds"
    evidence: "secondSym"
    detail ::
      a detail body line

@edges
  - direction: exposes
    via: http
    key: "GET /unit"
    detail: "Serves the unit."

@see_also
  - ref: other
    why: "A neighbor"
