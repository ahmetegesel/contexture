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
  - from: "beta"
    to: "gamma"
    evidence: "flowTwo"
    detail ::
      line one
      line two

@dependency_rules
  - rule: "Alpha never calls beta directly"
    evidence: "depSym"
    detail ::
      The rule detail.
