# journal grammar

blocks at column 0; fields indent 2; one blank line between blocks.
fields are written bare; unused fields are omitted.
the dialect compresses form, never content: an entry carries its
substance: what happened, the result, why the next step follows;
would a fresh boot reconstructing the position need it? then it
records.

a folded digest is an @entry like any other: its WHAT carries its chapter's
synthesis and its decision sets whole for a reader with no prior context, and
its CLOSES fold the originals by reference and stand as the fetch map; folded
entries leave the load, never the file, and a reader fetches an original by
its slug when the summary leaves a question open.

@anchor A<N> ("continues A<N-1>", attention: <the loaded set>)   # period ordering + load receipt; never liveness

@entry <date>-<slug>
  ANCHOR: A<N>                            # current anchor at write time
  WHAT: "..."                             # the event's substance; a closer carries the verdict + the resolution here
  GROUP: <token>                          # optional; agent-chosen thread, stable within the unit
  RHYTHM: <name> <N> <GATE>               # optional; the process in force, on the entries that advance the rhythm
  KNOWLEDGE: true                         # optional; knowledge-worthy, the harvest's input
  THREAD: <what it awaits>                # required; the act outside the unit's flow that must resolve this: the human's response | a dispatched lane's report | another unit's act; none when nothing outside acts; born at the write, never flipped; the resolving entry carries CLOSES same-breath; none = receipt: final word on a completed fact, no closer obligation
  CLOSES: <slug> (<verdict>: reason)      # optional; verdict = done | superseded | dropped | folded; the ONLY closure; no closer = still open
  SUPERSEDES: <slug> (<verdict>: reason)  # optional; closes by replacement, never a rewrite
  REF: "path#symbol"                      # optional; grounding, same format as knowledge REFs

# filled sample
@anchor A<N> ("continues A<N-1>", attention: <the loaded set>)

@entry <date>-<slug>
  ANCHOR: A<N>
  WHAT: "<the event's substance: what happened, the result, why next>"
  GROUP: <token>
  RHYTHM: work 6 EXECUTE
  KNOWLEDGE: true
  THREAD: <what it awaits>
  CLOSES: <date>-<slug> (done: <the resolution>)
  REF: "<path#symbol>"
