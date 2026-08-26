# recipe grammar

@context: "one-liner — what this lane is"

MISSION
  GOAL: "..."

GROUND_AND_REFS
  SOURCE_OF_TRUTH: <path>
  REFS: [...]
  drift: stop + report — never improvise
  [READ_ONLY: <paths the lane must not modify>]

REPORT
  PATH: <path>
  SHAPE: templates/report.md        # the report grammar — follow its blocks
  RETURN: summary only — verdicts + residual risks
