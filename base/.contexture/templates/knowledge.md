# knowledge grammar

blocks at column 0; fields indent 2; SUMMARY continuation indent 4;
one blank line between blocks.
a finding states what is true, what was decided and why, or what was
ruled out; intent to act lands as a @task in the backlog; where no stable
full version exists, the SUMMARY carries the whole story.

@finding NAME
  SUPERSEDES: <NAME> (reason)             # optional; closes by replacement, never a rewrite
  REF: "target#symbol"                    # optional, repeatable; the full version in append-only artifacts
                                          # (journal#entry, lanes/x/report#claim),
                                          # never a dynamic surface; no REF -> the SUMMARY
                                          # carries the whole story
  SUMMARY ::
    continuation text

# the fields above stand in the canonical order the finding verbs write
# (ctx session finding add, update, supersede); an older finding with
# SUMMARY first reads back as stored

# filled sample
@finding <NAME>
  REF: "<target#symbol>"
  SUMMARY ::
    <the claim, or the whole story when no REF carries it>
