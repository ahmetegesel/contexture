@doc conventions conv
  repo: wtest
  description: "Fixture conventions"
  sources: [conv/**]

@rule docs/fourth
  directive: must
  statement: "The fourth rule"
  status: followed
  prevalence: dominant
  layer: repo
  provenance: ratified
  evidence: "ruleFour"

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
  status: followed
  prevalence: rare
  layer: repo
  provenance: extracted
  evidence: "ruleTwo"
