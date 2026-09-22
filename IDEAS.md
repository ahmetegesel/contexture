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
  STATUS: PICKED hook-system

@idea rhythm-enforcement
  DUMPED: 2026-09-22
  WHAT :: Find an elegant way to ensure a rhythm is used and followed, not merely available. The invocation half is solved-ish (triggers, activation, skill shims with gate-as-step-0 bodies); the compliance half is not cracked: what makes an agent actually run the steps and land the gates instead of gesturing at them. Tried so far: the shims, RHYTHM stamps on advancing entries, gate receipts, the audit teeth; none closes the loop.
  WHY :: A rhythm nobody follows is prose; the convention's promise (gates close by artifacts, no done without evidence) depends on it.
  REF: "AGENTS.md#rhythms"
  STATUS: OPEN
@idea docs-discipline-migration
  DUMPED: 2026-09-22
  WHAT :: Migrate the docs-discipline five instruments (docs-query, docs-audit, docs-check, docs-gate, docs-nudge) into a ctx module under .contexture/modules/docs/ once the binder and ideas slice prove the contract.
  WHY :: Follow-up after hook-system: deferred by human scope decision so ctx ships without the docs pack; discovery root and header grammar already fit.
  REF: "backlog.md#docs-and-verify"
  STATUS: PICKED hook-system

@idea workspace-tmp
  DUMPED: 2026-09-22
  WHAT :: First-class workspace tmp under .contexture/tmp/ (gitignored): a sanctioned scratch root agents and engines use for mktemp, fixtures, and short-lived files so nothing ever leaves the workspace for temp routing.
  WHY :: Subagents and tools keep reaching for /tmp or harness scratch outside the workspace; @laws#workspace-confinement unsanctions temp-file routing but offers no in-workspace alternative. One gitignored drawer removes the need to roam; ctx run and test harnesses can default TMPDIR there.
  REF: "AGENTS.md#git"
  STATUS: PICKED workspace-tmp

@idea plugin-frame
  DUMPED: 2026-09-22
  WHAT :: Reframe examples as plugins: each plugin wraps an exact drawer overlay at plugins/<name>/.contexture/ (modules/, rhythms/, templates/, ...) plus plugin-meta at the plugin root (README.md adoption/needs/contribution, tests/ its own suite never copied, AGENTS.workspace.md root-overlay fragments where needed); no sample folder. Adoption copies the .contexture subtree and merges root fragments; core stays zero-dependency and plugins declare their own needs. Guidance: docs/modules.md (build a module) + docs/plugins.md (package, adopt, contribute, test convention). The starter-rhythms plugin folds the example rhythms under the frame (its overlay is rhythms/).
  WHY :: "examples" undersells distributable extensions; the module mechanism is the engine and plugins are the packaged unit; upstream contribution and workspace extension become the same story.
  REF: "docs/modules.md"
  STATUS: PICKED hook-system

@idea test-pipeline
  DUMPED: 2026-09-22
  WHAT :: Build the upstream test pipeline: tests/run.sh as the single entry over core suites (filters, ctx, session, hooks, record-audit, governance), hermetic sandboxes under .contexture/tmp, byte baselines where output is contractual and rc/key-line assertions where behavioral, presence checks per surface; plugin tests live with their plugin and the runner can invoke them; ship breath gates on the run.
  WHY :: One committed suite exists (filters); the hook matrix lives in scratch; everything else is ad-hoc lane matrices; no ship gate. The convention's determinism promise needs a real regression net.
  REF: "tests/README.md"
  STATUS: PICKED hook-system

@idea docs-discipline-dogfood
  DUMPED: 2026-09-22
  WHAT :: Adopt the docs-discipline plugin into the contexture workspace itself: install its drawer pieces (the docs module, the grammar template, the corpus under docs/, the overlay blocks, the rhythms) and wire the close gate, so this repo becomes the plugin frame end-to-end proof and its own first consumer.
  WHY :: The pack is already adoption-tested (extracted from a real workspace) and lane-isolation already reflects this repo own configuration; the docs said it and GATHER missed it. The dogfood is the honest verification of the plugin adoption path and puts the repo own docs under the discipline it ships.
  REF: "plugins/docs-discipline/README.md"
  STATUS: OPEN

@idea lane-commands
  DUMPED: 2026-09-22
  WHAT :: Give lanes proper session commands: verbs for the lane journal append and the report write (for example ctx session lane-journal <unit> <lane> and lane-report), so subagents record through the engine instead of editing journal.md and report.md directly.
  WHY :: Lanes edit their files raw today: no grammar validation, no unique-temp save, no audit coverage; the append-only discipline and the report shape rest on convention alone.
  REF: "AGENTS.md#subagents"
  STATUS: OPEN

@idea docs-check-extension-gap
  DUMPED: 2026-09-23
  WHAT :: The docs instruments coverage check is blind to .awk and extension-less deltas: CODE_EXT_RE (docs-check.awk:8) counts a fixed extension set, so a change touching only the engine files exits CLEAN with no doc update, while the same change on a .sh file reports STALE. Widen the predicate (or add an explicit engine-file class) so the shipped engine coverage guarantee holds.
  WHY :: Surfaced by the plugin-arc review (F3): the corpus claims base/.contexture/ctx and the module scripts, but the check can never red on them; the gap stays latent until a lagging doc on an engine-only change passes silently.
  REF: "plugins/docs-discipline/.contexture/modules/docs/scripts/docs-check.awk"
  STATUS: OPEN
