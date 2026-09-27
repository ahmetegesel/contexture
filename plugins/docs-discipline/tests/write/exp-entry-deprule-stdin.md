@doc architecture map
  repo: wtest
  description: "Fixture map"

@components
  - name: "alpha"
    repo: wtest
    kind: capability
    stack: "sh"
    responsibilities: "Alpha things"

@data_flow
  - from: "alpha"
    to: "beta"
    evidence: "flowSym"
    detail ::
      The flow detail.

@dependency_rules
  - rule: "Alpha never calls beta directly"
    evidence: "depSym"
    detail ::
      A new detail
      with "quotes" and a \ backslash
