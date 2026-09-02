# recipe grammar

@context: "one-liner: what this lane is"

MISSION
  GOAL: "..."

GROUND_AND_REFS
  SOURCE_OF_TRUTH: <path>
  REFS: [...]
  drift: stop + report; never improvise
  [READ_ONLY: <paths the lane must not modify>]

REPORT
  PATH: <path>
  SHAPE: templates/report.md        # the report grammar: follow its blocks
  RETURN: summary only: verdicts + residual risks

# filled sample
@context: "<one-liner: what this lane is>"

MISSION
  GOAL: "<what the lane must decide>"

GROUND_AND_REFS
  SOURCE_OF_TRUTH: <path>
  REFS: [<path#symbol>]
  drift: stop + report; never improvise
  READ_ONLY: [<paths the lane must not modify>]

REPORT
  PATH: reports/<date>-<slug>.md
  SHAPE: templates/report.md
  RETURN: summary only: verdicts + residual risks
