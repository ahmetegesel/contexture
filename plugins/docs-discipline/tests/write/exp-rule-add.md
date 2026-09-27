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

@rule docs/third
  directive: never
  statement: "The third rule"
  status: aspirational
  prevalence: rare
  layer: repo
  provenance: ratified
  evidence: "thirdSym"

@rule docs/second
  directive: should
  statement: "The second rule"
  status: followed
  prevalence: rare
  layer: repo
  provenance: extracted
  evidence: "ruleTwo"
