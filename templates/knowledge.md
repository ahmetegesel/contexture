# knowledge grammar

# shape authority: write from this grammar alone; never copy or seek a filled sample from other sessions

blocks at column 0; fields indent 2; SUMMARY continuation indent 4;
one blank line between blocks.

@finding NAME
  STATUS: open | closed                   # born; never edited
  SUMMARY ::
    continuation text
  [REF: "path#symbol"]                    # the full version in append-only artifacts
                                        # (journal.md#entry, reports/x.md#claim),
                                        # never a dynamic file; no REF -> the SUMMARY
                                        # carries the whole story
  [SUPERSEDES: <ref> (reason)]
