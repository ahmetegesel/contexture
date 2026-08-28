# journal grammar

blocks at column 0; fields indent 2; one blank line between blocks.

@anchor A<N> ("one-liner")                # "(continues A<N-1>)" | "(done, disjoint)"

@entry <date>-<slug>
  ANCHOR: A<N>                            # current anchor at write time
  STATUS: open | closed                   # born; never edited
  WHAT: "..."
  [SUPERSEDES | CLOSES: <ref> (reason)]   # closure by reference; reason travels
  [REF: "..."]                            # grounding
