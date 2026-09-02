# report grammar

# shape authority: write from this grammar alone; never copy or seek a filled sample from other sessions

blocks at column 0; fields indent 2; BODY continuation indent 4;
one blank line between blocks.
beyond this minimum, write what the lane needs, in these shapes.

@orientation
  VERDICTS: one line per deliverable
  READ_FIRST: the load-bearing claims

@claim <name>
  VERDICT: "one line"
  EVIDENCE: <file:line or ref> ("verbatim")
  [MARK: VERIFIED | INFERRED | ABSENT]   # ABSENT = the highest burden:
                                         # -a, case-insensitive, every
                                         # separator spelling, one place
                                         # it would live
  BODY ::
    the actual content: analysis, walkthroughs, two-sided evidence,
    anything the claim needs; indented; free in length and subsections

@risks
  what the lane did NOT verify (the honest handoff): where the report's
  confidence is thin
