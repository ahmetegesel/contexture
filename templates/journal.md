# journal grammar

blocks at column 0; fields indent 2; one blank line between blocks.

@anchor A<N> ("continues A<N-1>", attention: <the loaded set>)   # period ordering + load receipt; never liveness

@entry <date>-<slug>
  ANCHOR: A<N>                            # current anchor at write time
  WHAT: "..."                             # a closer carries the resolution here
  [GROUP: <token>]                        # agent-chosen thread, stable within the unit
  [KNOWLEDGE: true]                       # knowledge-worthy; the harvest's input
  [CLOSES | SUPERSEDES: <slug> (<verdict>: reason)]  # verdict = done | superseded | dropped | folded; the ONLY closure; no closer = still open
  [REF: "path#symbol"]                    # grounding, same format as knowledge REFs

# filled sample
@anchor A<N> ("continues A<N-1>", attention: <the loaded set>)

@entry <date>-<slug>
  ANCHOR: A<N>
  WHAT: "<what happened, one line>"
  GROUP: <token>
  KNOWLEDGE: true
  CLOSES: <date>-<slug> (done: <the resolution>)
  REF: "<path#symbol>"
