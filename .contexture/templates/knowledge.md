# knowledge grammar

blocks at column 0; fields indent 2; SUMMARY continuation indent 4;
one blank line between blocks.
a finding is a settled decision: it carries what a later decision will
need; where no stable full version exists, the SUMMARY carries the
whole story.

@finding NAME
  SUPERSEDES: <ref> (reason)              # optional; closes by replacement, never a rewrite
  REF: "path#symbol"                      # optional; the full version in append-only artifacts
                                          # (journal.md#entry, reports/x.md#claim),
                                          # never a dynamic file; no REF -> the SUMMARY
                                          # carries the whole story
  SUMMARY ::
    continuation text

# filled sample
@finding <NAME>
  SUMMARY ::
    <the claim, or the whole story when no REF follows>
  REF: "<path#symbol>"
