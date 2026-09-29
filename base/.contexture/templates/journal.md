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

@anchor A<N> <YYYY-MM-DD>                                           # period ordering: the period's number and date (ctx session stamp), no receipt text; never liveness

@entry <date>-<slug>
  ANCHOR: A<N>                            # current anchor at write time
  WHAT: "..."                             # the event's substance; a closer carries the verdict + the resolution here
  GROUP: <token>                          # optional; agent-chosen thread, stable within the unit
  RHYTHM: <name> <N> <GATE>               # optional; the process in force, on the entries that advance the rhythm
  THREAD: <what it awaits>                # required; the act outside the unit's flow that must resolve this: the human's response | a dispatched subagent's report | another unit's act; none when nothing outside acts; born at the write, never flipped; the resolving entry carries CLOSES same-breath; none = receipt: final word on a completed fact, no closer obligation
  REF: "target#symbol"                    # optional, repeatable; grounding, same format as knowledge REFs
  CLOSES: <slug> (<verdict>: reason)      # optional, repeatable; verdict = done | superseded | dropped | folded; the ONLY closure; no closer = still open
  SUPERSEDES: <slug> (<verdict>: reason)  # optional, repeatable; closes by replacement, never a rewrite
  KNOWLEDGE: true                         # optional; knowledge-worthy, the harvest's input

# the fields above stand in the canonical order the record verbs write
# (ctx session record); an older entry in another order reads back as stored

# filled sample
@anchor A<N> <YYYY-MM-DD>

@entry <date>-<slug>
  ANCHOR: A<N>
  WHAT: "<the event's substance: what happened, the result, why next>"
  GROUP: <token>
  RHYTHM: work 6 EXECUTE
  THREAD: <what it awaits>
  REF: "<target#symbol>"
  CLOSES: <date>-<slug> (done: <the resolution>)
  KNOWLEDGE: true
