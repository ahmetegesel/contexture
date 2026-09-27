@doc conventions conv
  repo: wtest
  description: "Fixture conventions"
  sources: [conv/**]

@rule docs/first
  directive: must
  statement: "The first rule"
  status: followed
  prevalence: universal
  layer: repo
  provenance: ratified
  evidence: "ruleSym"

@rule docs/second
  directive: should
  statement: "The second rule"
  status: violated
  prevalence: rare
  layer: repo
  provenance: extracted
  caution: "Mind it"
  evidence: "ruleTwo"
