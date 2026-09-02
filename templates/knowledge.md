# knowledge grammar

blocks at column 0; fields indent 2; SUMMARY continuation indent 4;
one blank line between blocks.

@finding NAME
  STATUS: open | closed                   # born; never edited
  SUMMARY ::
    continuation text
  [REF: "..."]                            # the full version in append-only artifacts
                                        # (journal, reports), never a dynamic file;
                                        # no REF -> the SUMMARY carries the whole story
  [SUPERSEDES: <ref> (reason)]
