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
  STATUS: PICKED docs-plugins

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
  STATUS: DROPPED met: the ast-doc-graph vitest project proves the TypeScript extraction (typescript 6.0.3 pinned, 78 tests at v0.66.0, the TypeScript 7 stub included), and the cited plugins/ast-doc-graph/tests/run.sh is retired; closed at the human's word in unit docs-plugins

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
  STATUS: DROPPED the human rejects a harness mechanism for runner adoption; the direction is hardening the rules and the prose (idea ctx-run-adoption, journal#2026-09-26-event-1790452331)

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
  STATUS: PICKED cli-help-and-governance

@idea busybox-plugin-suites
  DUMPED: 2026-09-26
  WHAT ::
    Make the plugin suites green under Alpine busybox (found by lane awk-portability; every core suite already green there on both drivers):
    docs-discipline: docs-check.awk reads its change list with getline from the file name dash, which busybox awk opens as a file named dash, so the gate matrix sees 0 files (proposed: read /dev/stdin); without git the gate matrix exits rc1 instead of the 77 skip its suite header promises.
    ast-doc-graph: test-ddl passes mktemp a template with .db after the X run, which busybox mktemp refuses (proposed: end the template in the X run); verify-pilot exits 127 without bash (proposed: detect bash and skip 77).
    storage-fts5: the plugin suite reports PASS when both its suites skip (no sqlite3), so a skipped run reads as a pass.
    cleanup: base parse_blocks.awk is referenced by no script.
    The container harness stays under the workspace scratch of lane awk-portability (run-env.sh, in-container.sh) for the rerun.
  WHY ::
    The storage unit put the Linux containers (mawk, gawk, busybox) into its portability proof; busybox is the one awk that breaks the old escapes, so the rest of the plugin frame should hold there too. The human moved these out of backlog#awk-escape-portability to the ideas list.
  REF: "lanes/awk-portability/report#open"
  STATUS: OPEN

@idea ctx-run-adoption
  DUMPED: 2026-09-26
  WHAT ::
    Raise ctx run adoption through the rules and the prose alone: the agents (the main agent and every lane) still run commands raw, read-only views most of all (cat, sed, grep, head, ls, wc, git status and diff, docker inspections), and self-report it as drift afterwards. Harden the compact-streams law and every surface that restates it (the base laws, the subagent contract, recipe templates, the boot and interact steps) so the runner prefix is the default act, never a discipline remembered afterwards.
  WHY ::
    The human wants the runner used far more than it is; the evidence is in the storage unit journal: lanes driver-test-run-x, driver-test-run-y, driver-test-compare, driver-retest-run-x, driver-retest-run-y, shared-ref-fixes, awk-portability, verb-consistency reported raw commands, and the main agent ran raw checks too. The human rejects a harness mechanism (a hook rewriting commands); the fix is rules and prose, discussed separately from the storage unit. The idea harness-auto-runner proposes the harness route this direction rejects.
  REF: "journal#2026-09-26-event-1790452331"
  STATUS: OPEN

@idea docs-query-workspace-prefix
  DUMPED: 2026-11-06
  WHAT :: ctx docs query --file strips a leading <repo>/ prefix for every repo, the workspace included, while ctx docs check reads a workspace doc's path as given; so in a repository with a top-level folder literally named workspace, --file workspace/<path> names an owner through the query that the check reads as UNCOVERED. Decide which reading is right and make the two agree.
  WHY :: Found by the docs-discipline cluster review (lanes/review-docs-cluster/report F6, probed); rare, since it needs that exact folder name; the human chose to record it rather than fix it in unit docs-plugins.
  REF: "plugins/docs-discipline/.contexture/extensions/modules/docs/scripts/docs-query.awk"
  STATUS: PICKED docs-plugins

@idea docs-retired-id-memory
  DUMPED: 2026-11-06
  WHAT :: A corpus doc's next id is its highest present id plus one, so removing the highest-numbered contract rule, responsibility, or pitfall lets the next new entry of that kind take the same id, and a journal entry, a report, or a test title citing the old id silently names a different entry; the grammar says a removed id retires, which holds only below the highest. Remember retired ids per doc so a new entry never reuses one (the workaround today: --id).
  WHY :: Found by the corpus homes lane (lanes/exec-homes-docs/report F4, docs-module-p2); it matters more now that test titles cite rule ids for the coverage report; the human chose to record it rather than fix it in unit docs-plugins.
  REF: "plugins/docs-discipline/.contexture/extensions/modules/docs/scripts/docs-edit.awk"
  STATUS: PICKED docs-plugins

@idea legacy-sunset
  DUMPED: 2026-11-07
  WHAT ::
    One global retirement of the temporary legacy branches the drawer-layout moves add, once adopters had time to move: (1) the composer boot cleanup that removes a legacy .contexture/laws/AGENTS.generated.md; (2) the posix fallback read of .contexture/sessions (the unit data file fallback_root, the store-data opt-in answer, the deprecation line); (3) the move on first write promotion and store.promote; (4) ctx unit migrate. The removal release refuses rc 2 while units remain in the old root, naming ctx unit migrate --all, so nothing disappears silently; the changelog names the end.
  WHY ::
    The human ruled both deprecation windows open ended (unit drawer-layout, journal 2026-11-07-event-1794033554 and 2026-11-07-event-1794033824): the legacy logic retires by a separate global task after a while, never on a date fixed now.
  REF: "unit#drawer-layout/entry/2026-11-07-event-1794033824"
  STATUS: OPEN

@idea audit-repair-verb
  DUMPED: 2026-11-07
  WHAT ::
    A repair path for the audit grammar findings no verb can fix today (bracketed field lines, inline markers on entry lines, dateless slugs on the append-only journal): a verb that supersedes or rewrites the broken entry through the record, so the only repair is never a hand edit of the stored journal.
  WHY ::
    Lane gather-leak-audit (unit drawer-layout) found the audit help plus a stored line number leaves a hand edit as the only repair, a file act against the cli-doorway law; internals-leak-audit rewords the help to send such findings to the human until a verb exists.
  REF: "unit#drawer-layout/lane/gather-leak-audit/report"
  STATUS: OPEN

@idea corpus-logical-address
  DUMPED: 2026-11-07
  WHAT ::
    The docs verbs print the corpus logical address docs/<repo>/<slug>.md, which under the files driver is the real file path, the corpus twin of the record path leak. Decide whether ctx docs query prints <repo>/<slug> while the check and gate keep the path form their deltas need, a docs-discipline contract change with a plugin bump.
  WHY ::
    Lane gather-leak-audit (unit drawer-layout) found it out of scope for internals-leak-audit: the address is load bearing in the check and gate deltas under a tracked files corpus.
  REF: "unit#drawer-layout/lane/gather-leak-audit/report"
  STATUS: OPEN

@idea package-list
  DUMPED: 2026-11-07
  WHAT ::
    A read only ctx package list sub-verb: each installed package with its recorded version and the catalog version beside it, so the update step that reads each .contexture/extensions/.state/<name>.files version line and the catalog manifest by path (docs/adoption.md update step 8) goes through ctx.
  WHY ::
    The human chose the ctx package group shape for the install doorway, which leaves room for a list sub-verb (unit drawer-layout, compose-through-ctx); lane ground-compose-verb found the adoption step reading install records by path, the leak the human principle names.
  REF: "unit#drawer-layout/lane/ground-compose-verb/report"
  STATUS: OPEN

@idea docs-edit-spin
  DUMPED: 2026-11-07
  WHAT ::
    The docs module corpus edit engine docs-edit.awk (run as awk -f docs-edit.awk part=1 doc.grammar part=2 <old doc> part=3 /dev/null) spun forever at full CPU on some input: four orphaned runs from the scratch sandbox of lane review-c5-docs (unit docs-plugins) were found after 10h20m and killed (unit drawer-layout journal, ops group). Reproduce with a lane: read that lane s journal and report for the probes it ran around epoch 1794010302 to 1794010348, find the input class that loops (part=3 /dev/null suggests an edit with an empty payload or a removal), fix the loop so the engine refuses or finishes, and add a test with a timeout.
  WHY ::
    A write verb that hangs instead of refusing is the false result class the dont-fool-yourself law names; an agent calling ctx docs entry or section would wait forever and orphaned runs burn CPU for hours.
  REF: "unit#docs-plugins/lane/review-c5-docs/report"
  STATUS: OPEN

@idea fts5-refusal-gaps
  DUMPED: 2026-11-07
  WHAT ::
    Two pre-existing defects under the storage-fts5 driver, found by lane exec-store-refusal of unit drawer-layout and left out of v0.70.0 by the human. F4: the unit data script's u_search reads sq_rc=$? inside an if ! store_search block, where it is always 0, so a refused ranked store search (reachable only on fts5) makes ctx unit search exit rc 0 beside its error line. F5: the fts5 db_init opens with an unsilenced mkdir -p of the database's parent folder, so a configured database path under a folder it cannot make prints mkdir's own line naming that folder before the refusal. Fix both with a proving test each, red before: the search refusal exits the store's rc through the shared u_store_refuse helper, and the mkdir is silenced or its failure refuses with the storage line that names no location; a storage-fts5 patch bump.
  WHY ::
    F4 is a false success, the result class the dont-fool-yourself law names: an agent reads rc 0 and trusts an empty answer. F5 leaks a storage location into an agent facing stderr, against the record rule that verb errors name no storage location.
  REF: "unit#drawer-layout/lane/exec-store-refusal/report"
  STATUS: OPEN
