# the upstream idea and need dump: picked up from here
# entries are light: @idea <slug>, DUMPED, WHAT, optional WHY and REF, STATUS.
# STATUS: OPEN | PICKED <unit> | DROPPED <why>; entries are never deleted.
# picking up = bootstrap the unit, flip the entry, and let the unit's backlog carry the executable tasks.
# loaded on demand only, never at boot; upstream only, never shipped.

@idea backlog-as-base-feature
  DUMPED: 2026-09-22
  WHAT :: Promote the upstream backlog arrangement to a base feature (a shipped @backlog section, a template, adopters' own dumps) if the upstream use earns it.
  WHY :: The need is generic; upstream-only is the proving ground.
  STATUS: DROPPED (never agreed; agent-seeded, removed per the human)

@idea hook-system-at-scale
  DUMPED: 2026-09-22
  WHAT :: Generalize the directive-discovery idea behind the stream filters into a hook system for the core workflow: artifacts declare themselves (a directive header naming the point they attach to), the engine discovers them over known directories, and things run at defined points in time (boot, stamp, task landing, close, refresh, ship) without core edits.
  WHY :: The filters already prove the shape: self-describing directives, discovery over a folder, first match wins, a shadow warning. The same mechanics would make the core extensible at named points instead of by forking it.
  REF: "docs/the-engine.md#the-scripts"
  STATUS: OPEN

@idea rhythm-enforcement
  DUMPED: 2026-09-22
  WHAT :: Find an elegant way to ensure a rhythm is used and followed, not merely available. The invocation half is solved-ish (triggers, activation, skill shims with gate-as-step-0 bodies); the compliance half is not cracked: what makes an agent actually run the steps and land the gates instead of gesturing at them. Tried so far: the shims, RHYTHM stamps on advancing entries, gate receipts, the audit teeth; none closes the loop.
  WHY :: A rhythm nobody follows is prose; the convention's promise (gates close by artifacts, no done without evidence) depends on it.
  REF: "AGENTS.md#rhythms"
  STATUS: OPEN
