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
  STATUS: PICKED hook-system

@idea lane-commands
  DUMPED: 2026-09-22
  WHAT :: Give lanes proper session commands: verbs for the lane journal append and the report write (for example ctx session lane-journal <unit> <lane> and lane-report), so subagents record through the engine instead of editing journal.md and report.md directly.
  WHY :: Lanes edit their files raw today: no grammar validation, no unique-temp save, no audit coverage; the append-only discipline and the report shape rest on convention alone.
  REF: "AGENTS.md#subagents"
  STATUS: PICKED write-path

@idea docs-check-extension-gap
  DUMPED: 2026-09-23
  WHAT :: The docs instruments coverage check is blind to .awk and extension-less deltas: CODE_EXT_RE (docs-check.awk:8) counts a fixed extension set, so a change touching only the engine files exits CLEAN with no doc update, while the same change on a .sh file reports STALE. Widen the predicate (or add an explicit engine-file class) so the shipped engine coverage guarantee holds.
  WHY :: Surfaced by the plugin-arc review (F3): the corpus claims base/.contexture/ctx and the module scripts, but the check can never red on them; the gap stays latent until a lagging doc on an engine-only change passes silently.
  REF: "plugins/docs-discipline/.contexture/modules/docs/scripts/docs-check.awk"
  STATUS: OPEN

@idea seed-parity
  DUMPED: 2026-09-23
  WHAT :: Bring the plugin's seed conventions to parity with the live corpus: the genre-boundary rule and the untracked-corpus clauses the contexture workspace carries.
  WHY :: An adopter copying the seed gets a corpus without the boundary rule; the pack's own docs should carry the generic form.
  REF: "plugins/docs-discipline/docs/workspace/conventions.md"
  STATUS: OPEN

@idea toolchain-filters-runner
  DUMPED: 2026-09-23
  WHAT :: Give the toolchain-filters plugin a tests/run.sh invoking its fixture pairs, so the plugin test convention holds and the upstream runner stops printing INFO for it.
  WHY :: Every other plugin with mechanical pieces carries a runner; the pairs currently ride the root filters suite.
  REF: "plugins/toolchain-filters/README.md"
  STATUS: OPEN

@idea guides-truth-read
  DUMPED: 2026-09-23
  WHAT :: Read the eight guides (docs/*.md) whole against the code and the record and correct what does not hold; the corpus got its truth-read, the guides got three incidental fixes.
  WHY :: Three defects surfaced incidentally (the verbs claim, the delegating count, the stale sample); the rest are unread.
  REF: "docs/the-engine.md"
  STATUS: OPEN

@idea planted-failure-coverage
  DUMPED: 2026-09-23
  WHAT :: Extend the pipeline's self-proof to a planted failure per core suite (today only filters, session, and governance are planted).
  WHY :: The runner's per-suite rc contract is proven on three paths only; the other suites' failure paths are unexercised.
  REF: "tests/run.sh"
  STATUS: OPEN

@idea fresh-checkout-paths
  DUMPED: 2026-09-23
  WHAT :: Exercise the fresh-checkout skip paths (the ctx suite's ideas section and the docs-discipline plugin suite's exit-77) in a drawer-less sandbox.
  WHY :: The pipeline's behavior on a clean clone is untested; the live drawer always exists here.
  REF: "tests/ctx-tests.sh"
  STATUS: OPEN

@idea onboarding-redelivery
  DUMPED: 2026-09-23
  WHAT :: Skip or auto-retire the ONBOARDING re-delivery on apply: a closed workspace receives the guideline again and must delete it a second time.
  WHY :: A recurring surprise in the apply flow; a marker or a pre-apply check closes it.
  REF: "docs/adoption.md#the-manual-path"
  STATUS: OPEN

@idea governance-index-scope
  DUMPED: 2026-09-23
  WHAT :: The governance payload check reads git ls-files (the index); add a HEAD-only checkout case so a fresh clone's payload check is exercised.
  WHY :: The index equals the commit in this repo's flow, so the HEAD-only path is unproven.
  REF: "tests/governance-tests.sh"
  STATUS: OPEN

@idea apply-not-mirror
  DUMPED: 2026-09-23
  WHAT :: Name or prune the apply's additive-overwrite semantics in the apply flow: an upstream-deleted payload file lingers in the live drawer until removed by hand.
  WHY :: The semantics are by design but unstated where the loop is taught.
  REF: "README.md#maintaining-contexture"
  STATUS: OPEN

@idea dead-source-globs
  DUMPED: 2026-09-23
  WHAT :: The dead-source audit flags explicit source entries only, never globs: a glob that matches nothing (after a rename) stays silent. Evaluate globs in the audit.
  WHY :: Dead globs go unnoticed until a delta surprises; the corpus's coverage claims rest on globs.
  REF: "plugins/docs-discipline/.contexture/modules/docs/scripts/docs-check.awk"
  STATUS: OPEN

@idea ast-doc-graph-ts-gating
  DUMPED: 2026-09-23
  WHAT :: Verify the ast-doc-graph TypeScript extraction and the pilot suite in a TypeScript-capable repository (need-gated here: no compiler, no pilot).
  WHY :: The plugin's TS side is unproven in this workspace; a capable repo closes the gate.
  REF: "plugins/ast-doc-graph/tests/run.sh"
  STATUS: OPEN

@idea recording-commands
  DUMPED: 2026-09-23
  WHAT :: Close the write-time bypass: the BIOS names only recording commands, never session files; every write act gains its command (append dispatching by the block's first token, a next_action update, a task landing with its event); the REF-syntax verdict.
  WHY :: The single-doorway doctrine extends from reads to writes; the habitual recording path becomes the validating command.
  REF: "AGENTS.md#backlog"
  STATUS: PICKED write-path

@idea recall-store
  DUMPED: 2026-09-23
  WHAT :: Build a workspace-confined content-addressed recall store for elided and truncated outputs (the rtk recall cache's native analog): the compact filters elide content, the store keeps the full bytes retrievable by hash on demand.
  WHY :: The filters trade bytes for recall; a local store closes the loss without leaving the workspace or shipping telemetry.
  REF: ".contexture/sessions/recall-cache/knowledge.md"
  STATUS: OPEN

@idea fts5-repo-search
  DUMPED: 2026-09-23
  WHAT :: A zero-dependency repository hybrid search on native sqlite3 FTS5 (Porter plus trigram, RRF fusion) as a packaged plugin: symbol and prose search with snippets, replacing full-file discovery dumps.
  WHY :: Discovery is the remaining token sink the corpus pointers do not cover; sqlite3 ships wherever the convention runs.
  REF: ".contexture/sessions/repo-search-fts5/knowledge.md"
  STATUS: PICKED storage

@idea harness-auto-runner
  DUMPED: 2026-09-23
  WHAT :: An integration pattern where a harness hook rewrites shell commands through the runner (the context-mode PreToolUse plus rtk two-tier defense, natively): the raw command never runs, the compacted stream returns.
  WHY :: The runner prefix is manual today; a harness-side rewrite makes compaction the default path instead of a discipline.
  REF: ".contexture/sessions/context-mode-rtk/lanes/rtk-adaptation/report.md"
  STATUS: OPEN

@idea storage-abstraction
  DUMPED: 2026-09-23
  WHAT :: Decouple the contexture artifacts' storage from the machinery: a storage interface behind the session (and corpus) read and write paths, so a workspace can swap the file backend for another store without touching the scripts; dogfood it with a vector or FTS search backend serving the queries.
  WHY :: The plain-text files are the convention's premise, but retrieval could ride a richer store; an interface keeps the machinery stable while the storage evolves, and a search backend proves it end to end.
  REF: "docs/the-record.md"
  STATUS: PICKED storage

@idea knowledge-promotion-to-docs
  DUMPED: 2026-09-23
  WHAT :: A promotion path from session knowledge to the docs: durable, general findings (knowledge.md) land in the corpus or the guides as first-class documentation and the session entry closes by reference; a command or a rhythm step carries it.
  WHY :: Findings settle in the unit's knowledge but stay invisible to the corpus and the guides, and the docs-first law reads the docs, not the sessions; promotion makes the durable layer cumulative.
  REF: "docs/workspace/the-record.md"
  STATUS: PICKED knowledge-promotion

@idea session-crud-ergonomics
  DUMPED: 2026-09-23
  WHAT :: Make the ctx session CRUD commands first-shot-correct: structured arguments instead of raw block heredocs where possible, validation errors carrying the exact expected shape, and nudges that steer the next attempt (a malformed append teaches its grammar instead of failing tersely); first-attempt success, second at worst, never repeated blind retries.
  WHY :: Agents routinely mis-enter blocks, fields, slugs, and dates (this session's retries: hyphenated finding names, missing REF symbols, an apostrophe in a bootstrap objective); each failure costs a roundtrip and invites improvisation.
  REF: "docs/modules.md"
  STATUS: OPEN
