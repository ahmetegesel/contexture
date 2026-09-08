# plan grammar

flat keys at column 0; steps indent 2; step lines indent 4.
the schema guides these elements; the rest is freestyle; the generic
nudge is the only rule: record comprehensively.

GOAL: "what the unit achieves"

[COMPLETED: true]                        # stamped once at the landing breath; absent = executing; never flipped; the next REPLAN replaces the file whole

STEPS:
  1. step-name: the step's intent
     exit: "checkable done-condition"
     [exit: "another condition"]         # several allowed, one per line
     [note ::                            # anything the executor needs:
         free-form]                      # assumptions, risks, context, detail

GROUNDED IN: journal.md#slug, lanes/x/report.md#claim, knowledge.md#NAME;
  the persisted surfaces only, never a volatile file; the sources the
  plan composed from - the full picture no matter when the plan is read

# filled sample
GOAL: "<what the unit achieves>"

STEPS:
  1. <step-name>: <the step's intent>
     exit: "<checkable done-condition>"

GROUNDED IN: journal.md#<slug>, knowledge.md#<NAME>
