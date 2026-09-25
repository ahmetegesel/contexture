# knowledge grammar

blocks at column 0; fields indent 2; SUMMARY continuation indent 4;
one blank line between blocks.
a finding states what is true, what was decided and why, or what was
ruled out; intent to act lands as a @task in the backlog; where no stable
full version exists, the SUMMARY carries the whole story.

@finding NAME
  SUPERSEDES: <ref> (reason)              # optional; closes by replacement, never a rewrite
  REF: "target#symbol"                    # optional; the full version in append-only artifacts
                                          # (journal#entry, lanes/x/report#claim),
                                          # never a dynamic surface; no REF -> the SUMMARY
                                          # carries the whole story
  SUMMARY ::
    continuation text

# filled sample
@finding <NAME>
  SUMMARY ::
    <the claim, or the whole story when no REF follows>
  REF: "<target#symbol>"
