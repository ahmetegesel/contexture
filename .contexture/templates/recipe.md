# recipe grammar
blocks at column 0; fields indent 2; tasks indent 4;
typed blocks over prose; the dialect compresses form, never content:
the brief carries what the lane needs to act without the parent
context: exactness is the brief's job.

@context: "what this lane is"

MISSION
  GOAL: "the deliverable or decision"
  TASKS:
    1. <name>: <the task's intent>; exit: "<verifiable condition>"
    2. <name>: <the task's intent>; exit: "<verifiable condition>"

GROUND_AND_REFS
  # sliced context: exact symbols/lines; broad folder dumps forbidden
  SOURCE_OF_TRUTH: <file#symbol-or-lines>
  REFS: [<file#symbol>, <journal#entry>, <knowledge#finding>]
  [FACTS ::
    exact isolated constraints from parent attention; one statement per line;
    verbatim quotes or conditions; never conversational prose]
  WRITE_SCOPE: [., <explicit target files or dirs>]
  drift: stop + report; never improvise

OUTPUTS
  JOURNAL: journal.md               # action trace + resumption surface: a WHAT per state-changing action (file written, command with a non-obvious result), claim formed, decision point, drift notice; action + result + why-next; task receipts batch at completion; the dispatcher never reads it
  REPORT: report.md                 # the dispatcher's only window: self-sufficient claims and evidence; .contexture/templates/report.md
  RETURN: summary only: verdicts + residual risks
  RESUME: read recipe.md + journal.md; continue from last uncompleted task

# filled sample
@context: "remediate README.md and AGENTS.md consistency and contradictions"

MISSION
  GOAL: "Apply targeted byte-clean fixes across README.md and AGENTS.md"
  TASKS:
    1. git-topology: align AGENTS.md line 104 with standalone vs parent workspace rules; exit: "diff clean"
    2. handoff-audit: add .contexture/scripts/journal-audit.awk to README handoff step; exit: "awk clean"

GROUND_AND_REFS
  SOURCE_OF_TRUTH: reports/2026-09-05-readme-consistency-audit.md#claim-1
  REFS: [AGENTS.md#L104, README.md#L484-491, knowledge.md#TOPOLOGY_AWARE_ADOPTION]
  FACTS ::
    standalone repos ignore only .contexture/sessions/, .contexture/rhythms/, AGENTS.local.md;
    deny-by-default (*) belongs strictly to parent workspaces;
    zero em-dashes in any edit
  WRITE_SCOPE: [., README.md, AGENTS.md]
  drift: stop + report; never improvise

OUTPUTS
  JOURNAL: journal.md
  REPORT: report.md
  RETURN: summary only: verdicts + residual risks
  RESUME: read recipe.md + journal.md; continue from last uncompleted task

# the journal grammar: a WHAT per state-changing action (file written,
# command with a non-obvious result), claim formed, decision point, drift
# notice; action + result + why-next; task receipts batch at completion;
# the dispatcher reads the report, never the journal
