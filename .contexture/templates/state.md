# state grammar

flat keys at column 0, no indent. the only file edited freely.
the map, not the content: terse by design: detail lives behind refs;
the record carries the substance.

status: ACTIVE | CLOSED                  # ACTIVE = the unit is in flight
current_anchor: A<N>                     # the anchor bumped at boot;
                                         # N = previous + 1; a fresh unit
                                         # starts at A0; its first boot
                                         # stamps A1
next_action: "one terse pointer:        # the ONLY next step; overwritten,
  what to do next"                       # never prepended; the WHY rebuilds
                                         # from the record, never here;
                                         # planning phase: "plan the next move"
objective: "what the unit is for"
repos: [a, b]                            # affected repos, any count

# filled sample
status: ACTIVE
current_anchor: A<N>
next_action: "<one terse pointer: what to do next>"
objective: "<what the unit is for>"
repos: [<repo>]
