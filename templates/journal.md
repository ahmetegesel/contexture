# journal grammar

# shape authority: write from this grammar alone; never copy or seek a filled sample from other sessions

blocks at column 0; fields indent 2; one blank line between blocks.

@anchor A<N> ("one-liner")                # "(continues A<N-1>)" | "(done, disjoint)"

@entry <date>-<slug>
  ANCHOR: A<N>                            # current anchor at write time
  WHAT: "..."
  [GROUP: <token>]                        # agent-chosen thread, stable within the unit
  [KNOWLEDGE: true]                       # knowledge-worthy; the harvest's input
  [CLOSES | SUPERSEDES: <ref> (reason)]   # the ONLY closure; no closer = still open
  [REF: "path#symbol"]                    # grounding, same format as knowledge REFs
