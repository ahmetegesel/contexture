# Changelog

All notable changes to contexture are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a major bump breaks existing artifacts, a minor bump adds sections or features, and a patch bump fixes wording.

## [Unreleased]

Nothing recorded yet. The next release section is written at ship time, in the same breath as its annotated tag.

## [0.29.0] - 2026-09-12

### Added

- `docs/`: the detailed manual, one page per area, composed from the grounded record by parallel lanes: the record, the engine, units and lanes, rhythms, overlays, and adoption. The README's Docs index links them.
- The README's "Updating it" section: the update procedure `AGENTS.md` @update points at (the version header, tags, the CHANGELOG read, the workspace read, the derived payload, verification with `ls-tree` plus a `cmp` per file, the MAJOR overlay review).

### Fixed

- `ONBOARDING.md` now names the example rhythms at their real home, `examples/rhythms/` (moved there in v0.27.1).
- The README's instrument table reads "in one command, one stream" for `journal-active.awk` (it runs two internal passes).
- Two spaced hyphens removed per the dashes rule: `AGENTS.workspace.md` (the installs law) and `.contexture/templates/overlay.md` (the @replace note).
- `.gitignore` whitelists `docs/`.

## [0.28.0] - 2026-09-12

### Changed

- The README is rewritten as the public face: a skimmable tour that opens on the compaction collision (a faithful summary against the surviving record), then moves through the agent's return, the human workflow and its token economy, the unit of work, delegated work, rhythms, the engine, overlays, why it works, what it is not and who it is for, adoption, and the docs index. The guide it replaces stays in git history and seeds the docs pages.
- The AGENTS.md version header names v0.28.0 (its separator reads a colon now, per the dashes rule).
- `.gitignore` whitelists `LICENSE`.

### Added

- `LICENSE` (MIT) at the root; the README deliberately carries no license text and no status line, so the file is the canonical place.
- The documented direction for `docs/`: one page per system area, linked from the README's index as they land.

## [0.27.2] - 2026-09-12

### Fixed

- The backlog REFS restriction lifted: `REFS` may name any artifact exactly (`file#symbol`), matching the backlog and recipe templates that already allowed it; the spec-stands-alone rule remains (a ref navigates, never substitutes for the meaning). The knowledge REF rule is unchanged (append-only surfaces only). AGENTS.md and README aligned.

## [0.27.1] - 2026-09-11

### Fixed

- The example rhythms moved from `.contexture/examples/` to the root `examples/` - reference material belongs outside the drawer, so updates never propose syncing it into adopted workspaces.
- The update payload is now explicit: `AGENTS.md` + `.contexture/templates/` + `.contexture/scripts/`; adoption material (`.contexture/ONBOARDING.md`, `examples/`) is used once at adoption and never re-synced; workspace-owned `.contexture/sessions/` and `.contexture/rhythms/` are never touched (README, ONBOARDING, and the sync guidance aligned).

## [0.27.0] - 2026-09-11

### Added

- `.contexture/examples/rhythms/{work,debug}/` - example rhythms with per-folder READMEs explaining them in plain terms; the work README states its token-heavy, multi-lane nature and its fit for cheaper, decent models (structured flow and redundancy closing the gap to frontier models).
- ONBOARDING: when no team rhythm emerged by the plan's end, the example rhythms are offered as the starting set; on confirmation they are copied into `.contexture/rhythms/`.

## [0.26.0] - 2026-09-11

### Added

- The session audit: `journal-audit.awk` now also flags unharvested KNOWLEDGE flags, DONE tasks without their `backlog/<slug>: DONE` event, and IN_PROGRESS tasks absent from `state.md` - siblings derived from the journal path, single-arg invocation unchanged, any finding exits nonzero (the `@close`/`@refresh`/`@handoff` gate).

### Changed

- `@rhythms`: a gate closes by its artifact - DECIDE by the backlog, VERIFY/LAND by the completion receipt carrying its evidence, REFRESH by the harvest; a gate closed by memory is debt.
- `@backlog`: the completion event carries its evidence - the command run and its observed result.
- The audit's defect classes are named at `@close` and in README (unharvested KNOWLEDGE, DONE-without-event, IN_PROGRESS-absent-from-state).

## [0.25.0] - 2026-09-11

### Added

- Law `@laws#workspace-confinement`: the current workspace (the repo/worktree the agent was started in) is the boundary; never read, write, search, or otherwise reach outside it unless the human specifically asks for that act; an apparent outside need stops and asks - the agent never roams.

### Changed

- The laws are slug-addressed: ordinals dropped, each law reads `slug: statement` (`source-of-truth`, `load-only-needed`, `writer-holds-volume`, `process-free`, `compose-from-record`, `verify-before-close`, `harvest-the-human`); a law is referenced as `@laws#<slug>`; slugs are unique across the merged base + overlays; overlays append freely with no renumbering (the overlay laws keep their texts minus the ordinals). The live references were swept (AGENTS.md, README.md).

## [0.24.2] - 2026-09-10

### Changed

- The references practice applied to the handoff chain: @handoff step 1 names its target (@close 1-3), and @refresh's caller list reads "shared by rhythm boundaries, @close, and @handoff" - the handoff runs the refresh (and the harvest) through the close path.

## [0.24.1] - 2026-09-10

### Changed

- The sync procedure is derived, never listed: adoption and updates copy what the upstream tag tracks (`git archive <tag> AGENTS.md .contexture/`), verified with `git ls-tree` plus a cmp per file. No manifest to maintain; the tag's tracked set is the synced set, and the drawer holds what the convention uses - the synced set plus the workspace's sessions and rhythms - nothing else. README and ONBOARDING aligned.

## [0.24.0] - 2026-09-10

### Changed

- The convention's files move into a `.contexture/` drawer: `templates/`, `scripts/`, `ONBOARDING.md`, `rhythms/`, and `sessions/` live there; `AGENTS*.md` stay at the root for harness loading and point into the drawer for the rest. Workspace-owned files keep their root layout. In the source, the drawer is whitelisted while `.contexture/rhythms/` and `.contexture/sessions/` stay untracked; each adoption decides its own tracking. Every base pointer (AGENTS.md, README.md, ONBOARDING.md, the grammars, the script usage comments) reads the drawer spelling.

## [0.23.2] - 2026-09-10

### Changed

- The harvest moves into @refresh: it runs at every rhythm boundary and inside @close - every open flag proposed as one candidate, landed with approval, closed by reference; frequent small harvests replace the rare batch. @close's step 4 is gone (its period-scoped grep was the hole that let older flags hide); @close now reads refresh, stray audit, journal audit, stays ACTIVE. Every "(@close 4)" reference in the base now reads "(@refresh)"; README aligned.

## [0.23.1] - 2026-09-10

### Changed

- Reference sweep applied to the base: "the harvest" cites (@close 4), the default-loop mentions cite @rhythms (@boot step 9, @interact), and README names the four record files it points at.

## [0.23.0] - 2026-09-10

### Added

- The references practice in @record: a pointer names its target exactly - the section and step (@close 4), or path#symbol (journal.md#slug); a vague prose mention is a defect. README's dialect section aligned.

## [0.22.1] - 2026-09-10

### Changed

- @backlog's container charge reworked: IMPLEMENTATION DETAILS carries the specification and the execution blueprint - the requirements and decisions the change must honor, and how it lands. The abstract enumeration is gone; the readiness bar and the no-placeholder rule still enforce executability. README aligned.

## [0.22.0] - 2026-09-10

### Changed

- The default design loop runs `@refresh` explicitly as its final step: when no rhythm is invoked, the loop is DISCUSS -> DECIDE -> BACKLOG -> EXECUTE -> VERIFY -> REFRESH. README aligned.

## [0.21.0] - 2026-09-10

### Added

- `@refresh`: the artifact sweep factored out of `@close` and shared by rhythm boundaries - the events journaled, the backlog statuses advanced, `next_action` refreshed (one terse pointer, overwritten never prepended; the WHY rebuilds from open items + GROUNDED IN + live findings), settled verdicts flagged; the journal audit run, what it flags fixed; nothing closes there. `@close` step 1 calls it, then closes the period's done events by reference.

### Changed

- README aligned: the Close section names the refresh first, and the boot walkthrough's step 9 matches the base - the invoked rhythm, the matching rhythm on its trigger, or the default.

## [0.20.1] - 2026-09-10

### Added

- `scripts/rhythms-index.awk`: the rhythm selection index - one line per rhythm (name, path, `use when:`, activation), grammar-aware, defaulting a missing activation to propose.

### Changed

- The boot loads the rhythm index (@boot step 6): the trigger lines are the selection index, and rhythm bodies load only on selection; @boot step 9 continues on the invoked rhythm, the matching rhythm on its trigger, or the default. This completes v0.20.0's trigger/activation feature with its load side.
- README aligned: boot step 6, the files table, and the rhythms section note the index.

## [0.20.0] - 2026-09-10

### Added

- @rhythms gains two contract fields: `use when:` carries triggers only - a workflow summary becomes the shortcut agents follow instead of the steps; `activation: propose | auto` decides whether the agent proposes the matching rhythm before applying it (the default) or applies it on trigger after the team opts in, the @interact gates still holding.
- @backlog gains the readiness bar, the activation scan, and the no-placeholder rule: a task marked IN_PROGRESS is executable as written; before activation the executor scans the task (placeholders, checkable criteria, resolving REFs); a failing task returns, never execute around a gap.
- @subagents gains the lane boot and the load receipt: lanes read the overlays, state, backlog, knowledge, the recipe, and every REF it names (read-only; session surfaces are never lane-written); the first journal entry lists the refs loaded, and an unresolved REF is a brief defect - pause-ask or stop and report, never work around the gap.
- @interact carries the recording invariant for all session artifacts - journal at the event, backlog as tasks move, state as position changes, knowledge verdicts flagged as they settle - with see-pointers to their sections and shapes in @record/templates/.
- ONBOARDING.md gains the @close phase: delete it once the adoption closes - it is the procedure, not the convention; the @layout line annotates the file as deleted when the adoption closes.

### Changed

- @interact revised: the dialogue resolves intent, constraints, and approach; the restate carries the intended approach and its tradeoffs; the confirm gate is never skipped, however small; a discovery that outgrew the confirmed intent halts back to confirm.
- @subagents drift redefined: a decision within the brief is the lane's; a wall or a decision beyond it is drift - pause and ask for steering where the harness supports it, abort the fallback; the action trace is the exact stopping point, so a steer continues live and a re-dispatch resumes from the folder. Journals land as things happen, never batched; only task receipts batch. Parallel lanes only for independent domains - shared state or ordering means sequential.
- @rhythms contract adjusted: human-invoked or agent-selected on its trigger.
- README.md rhythm section aligned with the trigger and activation fields.

## [0.19.1] - 2026-09-09

### Changed

- Base @git decoupled from gitignore policy: removed the mandatory private paths prescription (sessions/, rhythms/, AGENTS.local.md) for standalone repositories. The gitignore strategy is decided per topology and team choice at onboarding (whether to track or ignore sessions/rhythms is left to the user), eliminating the contradiction between base @git and ONBOARDING.md.
- README.md and ONBOARDING.md aligned to reflect team choice on tracking or ignoring sessions/rhythms rather than prescribing a mandatory ignore list.

## [0.19.0] - 2026-09-08

### Added

- `backlog.md` replaces `plan.md` across contexture as the unit's actionable work declaration. Structured as a living queue of `@task <slug>` blocks with STATUS (`TODO | IN_PROGRESS | DONE`), OBJECTIVE, REFS, and dedicated containers for substantive technical detail: DESCRIPTION :: (problem statement, scope, context), ACCEPTANCE CRITERIA :: (verifiable done conditions), and IMPLEMENTATION DETAILS :: (technical blueprint, code locations, schemas, logic, edge cases).
- New `@backlog` section in AGENTS.md establishes the living task queue doctrine: non-destructive task evolution (mid-stride pivots, ad-hoc bug fixes, and new work insert or append as fresh `@task` blocks without destroying or recomposing uncompleted tasks), explicit containers for technical depth, grounding in persisted surfaces via REFS, and progress tracking.

### Changed

- Base layout and record maps: `plan.md` retired; `backlog.md` declared as the task backlog surface.
- `@boot` step 6 loads `backlog.md`; step 10 bootstrap next_action becomes "backlog the first task".
- Default design loop rhythm updated: step 3 becomes `BACKLOG` (intent updates `backlog.md`; next_action points to active task); step 4 executes active task; step 5 verifies task acceptance criteria.
- Unit close triggered when backlog completes (`STATUS: DONE` across tasks and unit exit criteria met).
- Templates: `templates/backlog.md` authored with official grammar and filled sample; `templates/plan.md` removed.
- README.md and ONBOARDING.md aligned: Plan sections replaced with Backlog sections, detailing the backlog mental model, `@task` grammar, non-destructive evolution, and dedicated containers.

## [0.18.0] - 2026-09-08

### Added

- Two new workflow sections in the base. @journal teaches the mechanism instead of a record-type list: the journal rebuilds the working context from scratch (a fresh boot loads the active entries and nothing else), events land at formation (work beats never wait for interaction beats), an entry carries its substance (what happened, the result, why the next step follows), and the dialect's why (the token-efficient form preserves the context window while minimizing info loss, so completeness is cheap - record fully, without worry). @plan carries the composition workflow: the plan composes from the record, and GROUNDED IN references the persisted surfaces only - journal items, lane reports, knowledge findings, never a volatile file - so the plan reads with the full picture no matter when it is read.
- The handoff gains the cold read: run journal-active.awk and read the stream as a fresh boot would - the record must reconstruct the position without the conversation; while the context is still full, improve the quality and fix what was missed. The gaps close now, never after compaction.

### Changed

- Law 3 reworded to the generic principle: the schema holds the shape, the writer holds the volume; guidance names what deserves the record, never how much; token efficiency is the dialect, never a cap on content; omit ornament, never substance. A field report drove the release: an agent investigated a workspace thoroughly but wrote a thin plan and an empty journal while the comprehensive design lived only in chat prose; compaction killed the prose and the session was unrecoverable. The convention's terseness invitations had been restricting content, not form.
- @record slimmed to the map: what each artifact records and why, one line each, with pointers to the workflow sections; the poured details moved to @journal and @plan.
- scripts/journal-dangling.awk renamed scripts/journal-audit.awk: the role outgrew the name (four malformation classes plus the open-thread tail). The close step reframes it as a repair instrument: fix what it flags and fill what is missing before the period ends.
- The templates swept of volume prescriptions and given importance guidance instead: the plan grammar guides its elements and leaves the rest freestyle under the generic nudge (record comprehensively), the journal WHAT carries the event's substance, report DETAILS omit ornament but never substance, and state.md's terseness is declared as design (the map, not the content). No surface the agent fills mentions thickness: naming the dimension creates a decision point, and any mention biases.
- The README and ONBOARDING align: the plan and journal sections carry the composition and reconstruction stories, and the files-written section states the shape/volume split.

## [0.17.0] - 2026-09-07

### Changed

- The boot trigger is positional, not semantic: the first message of a fresh context is a boot by definition, whatever its shape - a boot request, a dumped task, a question. The boot reads the message as the move signal, fields the active units with one grep, matches the message against them, and proposes the move - continue the close match or bootstrap a new unit - waiting for the answer before anything works. A field test caught an agent jumping straight to work on a dumped message and skipping the boot entirely: semantic triggers have a base rate; positional ones do not.

## [0.16.6] - 2026-09-07

### Changed

- The dangling audit sees the grammar. It now flags three malformation classes it was blind to - dateless entry slugs, inline `[THREAD:` / `[KNOWLEDGE:` markers on @entry lines, and closers with no valid date-slug target - each with its line number, and exits 1 on any of them. A field sample proved the old audit passed a journal full of broken entries vacuously: its green was noise. The fix flow is agent-driven: the audit reveals, the agent executes the refit, the re-audit verifies clean.

## [0.16.5] - 2026-09-07

### Added

- The onboarding record lifecycle: the adoption session bootstraps at phase 1 and every phase journals as it happens - the record carries the whole history: findings, proposals, verdicts, changes. A field test caught the session bootstrapped empty at the last phase, the entire adoption story left unrecorded.
- The default rhythm runs the execution: at the verdict, the confirmed plan lands in plan.md, next_action points at the first step, every step's completion journals and advances next_action, drift REPLANs in the same breath - the adoption is the convention's first customer and its first demonstration.

### Changed

- @verify slims to the live record: the queries run against the journal that has existed since phase 1, and the review covers the adoption record alongside the diff.

## [0.16.4] - 2026-09-06

### Changed

- @propose runs in two segments, each ending at a gate that hands control to the human and waits - ask in chat and end the turn; the gate is the tool loop's exit, never skipped, never merged. Segment one presents the brief and the findings and gates the plan preparation; segment two pre-plans, forwards the open questions through the harness's question tool when it has one, and gates the final verdict on the updated plan. A field test caught the loop running through the whole proposal to the approval ask - the gate is the exit the loop was missing.

### Removed

- The proposal file and its cleanup step: the presentation rides in the gate questions and the question bodies, and nothing needs persisting.

## [0.16.3] - 2026-09-06

### Added

- The brief as the proposal's opening field: what contexture is, what it promises, what it tries to solve, what it provides, and what this workspace gains against its current setup - written for a human who knows nothing about the repo and grounded in the assessment's findings. The proposal file opens with it.

### Changed

- The pre-plan and the final plan land as a file: onboarding-proposal.md at the repo root, prose only, every question naming the path, the verdict question repeating it and summarizing the changes, the file removed after the verdict. Six field tests proved the channel split: files and the question tool always arrived; chat prose mid-execution never did.

## [0.16.2] - 2026-09-06

### Changed

- @propose became an ordered sequence: the pre-plan presents in prose first, the open questions go against the plan the human just read, the plan updates per the answers with the changes presented, and the final verdict lands on the updated plan only. A field test caught an agent requesting approval for a plan it never presented - parallel rule lists carry no order, and order-sensitive procedures need numbered sequences.

## [0.16.1] - 2026-09-06

### Changed

- The proposal's two audiences split. The filled grammar is the working copy - tmp holds it; the human reads proper prose, the same content organized by the shape's sections, never the raw dialect.
- The open questions forward through the harness's question tool when one exists, so the human answers in place; free text when the harness has none.

## [0.16.0] - 2026-09-06

### Added

- The onboarding proposal grammar, inline in ONBOARDING.md. The PROPOSE phase fills a fixed shape whose fields are contexture's features - copy set, overlay material, local preferences, rhythm extractions, sessions handling, symlinks, gitignore strategy, deletions, untouched, and the open questions - every field answered, none stating none. Four field reports showed prose coverage is stochastic: features became fields, and filling the shape walks them all deterministically. The shape lives in ONBOARDING.md itself - a one-shot artifact, not a recurring template.

### Changed

- @propose slimmed to the gate: no write before the verdict, the completeness rule, ambiguity at the proposal - the structure delegated to the @proposal grammar.

## [0.15.0] - 2026-09-06

### Added

- The rhythm placement principle, declared in the base. The per-turn surfaces carry interaction rules only; work patterns are rhythm material - extracted from the instruction stack at onboarding, proposed as they emerge. Until now the principle lived only in contexture's own session knowledge and never shipped, which is why onboardings kept missing workflow extractions.
- The destination buckets in the onboarding plan. The installation plan organizes the moves by destination home and answers each explicitly - overlay material, rhythm extractions, deletions, untouched - an empty home states none. The question can no longer be skipped silently: the extractions answer is on the page for the human to challenge.

### Changed

- The README's rhythms section carries the delivery split and the onboarding move: interaction rules need every-turn delivery, work patterns need per-boot delivery in rhythms/, so workflows found in a workspace's instruction stack are the first rhythm candidates.

## [0.14.1] - 2026-09-06

### Changed

- The anchor bump is defined at the boot step where it happens: a boot is a fresh context load (compaction, session restart), never a turn boundary - turns inside one working context journal under the standing anchor. Twenty anchors stamped inside a single continuous context revealed the ambiguity between the boot-side bump and the close-side period.

## [0.14.0] - 2026-09-06

### Added

- The onboarding agent now knows the convention whole before mapping: it reads the base AGENTS.md and the upstream README completely - ONBOARDING.md is the procedure, not the convention - and the README carries the philosophy behind every judgment the mapping makes.
- The destination-driven mapping. The agent walks the convention's sections one by one against the workspace's material - for each capability, what feeds it, what conflicts with it, what belongs there - instead of scanning a file list. Migration follows the destination: a step-by-step workflow living in a workspace's AGENTS.md surfaces as a rhythm candidate because the agent walked the rhythms section knowing what rhythms are for.

## [0.13.2] - 2026-09-06

### Removed

- `templates/changelog.md`. The changelog's shape is the external Keep a Changelog standard, stated in this file's own header, and its contexture-specific rules - the ship-breath timing and the tag-range completeness - live in the workspace overlay's git section. The template was a second home waiting to drift, not a grammar to pin.

## [0.13.1] - 2026-09-06

### Changed

- The onboarding assessment grounds in the workspace's self-description: the existing AGENTS.md and its derivations are read first and whole as the guide to the workspace's rules, and the sweep covers only what the stack misses (contributing guides, style and lint configs, CI rules, documentation conventions). The assessment maps every rule surface against the incoming convention - contradicting, overlapping, or complementing - and the plan must carry a resolution for each: migrated, superseded, coexisting, or flagged for the human. The agent asks freely what only the human knows - resolutions, history, intent - and presents the open questions beside the plan, never burying assumptions.

## [0.13.0] - 2026-09-06

### Added

- The PROPOSE phase in the onboarding flow. The onboarding agent derives everything detectable from the repository on its own - topology, instruction surfaces, harnesses - presents the derived installation plan, and writes nothing before the human's verdict; ambiguity surfaces at the proposal, never mid-execution. Execution is strictly bound to the confirmed plan: drift halts and re-confirms.

### Changed

- The onboarding phases restructured from a linear execution script into the convention's own design loop: ISOLATE, ASSESS, PROPOSE, EXECUTE, VERIFY - the human sees the plan before the writes, not only the diff after them.

## [0.12.0] - 2026-09-06

### Added

- The update nudge, frozen into the base. AGENTS.md gained a standalone `@update` section, one line that will not change: the base evolves upstream, and the upgrade guidance lives in this README's Updating section, fetched fresh from upstream at every update. The layering is the design: the nudge points at the README, the README carries the guidance and directs to the CHANGELOG, so the update strategy can evolve without downstream bases ever changing.
- The Updating guidance: updates are judgment, not a script. The agent reads the CHANGELOG between its installed version and the target, reads its own workspace (overlay @replace blocks, live sessions, in-flight artifacts), decides - adopt, migrate, or wait - and verifies with the workspace's own instruments. The copy commands are means in the agent's hands, never a prescribed pipeline.

### Changed

- The README's adoption step now carries the Updating guidance instead of a one-sentence copy instruction.

## [0.11.0] - 2026-09-06

### Added

- The subagent journalism contract. Lane journals now record one line per state-changing action: a file written, a command whose result was not the obvious one, a claim formed, a decision point, a drift notice, each carrying the action, the result, and why the next step followed. Task receipts batch at completion. The journal is the audit trail and the resumption surface, and the reasoning shows in the action lines without a separate reflection field.
- The dispatcher's one-window rule. The dispatcher reads the lane's report, never its journal: the report must be self-sufficient, and a thin report triggers re-dispatch rather than journal-mining. Both clauses live in the base subagent section and the recipe template's outputs grammar.

### Changed

- Five changelog sections (v0.1.0, v0.3.0, v0.3.1, v0.4.0, v0.4.1) were enriched from git history: the record's narratives stayed the spine and the tag ranges supplied the detail the record lacked. The first enrichment lane crashed to a harness concurrency limit mid-task, and the resumed instance continued from the action journal without rebuilding, which made the crash-to-resume seam the contract's first live proof.

## [0.10.0] - 2026-09-06

### Added

- The changelog itself. This file was reconstructed retroactively from the session record: a dispatch lane read the entire journal (including folded entries, which closures remove from the boot load but not from the file), mined the twelve released versions, and drafted every section below. Seven versions graded COMPLETE and five THIN, none ABSENT: the record carried the narrative for every release, and git history was needed only to resolve version-to-commit boundaries.
- The release pipeline. Every ship now lands as one breath: commit, push, an annotated git tag, and the changelog section. The tag is the mechanical release anchor, so the commit range between two tags is the release's contents, derived from git and incapable of drifting. The discipline lives in AGENTS.workspace.md next to the version-bump law.
- templates/changelog.md, pinning the section grammar that the ship breath fills.

### Changed

- .gitignore whitelists CHANGELOG.md alongside the other shared roots.

## [0.9.0] - 2026-09-06

### Added

- The boot ground check. Every boot grounds in git before trusting the record: the working tree status and the upstream delta are read first, and uncommitted changes or unpushed commits are reconciled before work continues. When git and the session record disagree, git wins, and a mismatch is journaled as work rather than noted and forgotten.

### Changed

- The boot sequence was renumbered to ten steps, and the README boot section and its walkthrough example were aligned with it.

## [0.8.0] - 2026-09-06

### Added

- The plan completion stamp. A plan carries a born-state `COMPLETED: true` marker, stamped once when its final step lands and never flipped afterward. An absent stamp means the plan is still executing. The stamp replaced a proposed two-state status field after the verdict that one write per plan lifetime halves the bookkeeping.

### Changed

- The plan template, the base record section, and the README were aligned with the stamp.

## [0.7.0] - 2026-09-06

### Added

- The thread and receipt doctrine for the journal. Entries split by what they await: a thread, meaning an entry that awaits a resolution, carries a `THREAD: true` marker from birth and closes in the same breath as its resolution; a receipt, meaning the final word on a completed fact, carries no closer obligation and stays open as the boot's context trail.

### Changed

- The dangling-closer audit script now prints the open thread tail beside the dangling check. A missing closer had previously left no trace, so a clean exit read as journal health while resolved entries sat unclosed.
- The period-end stray audit narrowed to open threads, and the handoff verification expanded into a sweep of the whole open list that catches forgotten thread markers.
- The README journal, close, and handoff sections were aligned with the doctrine.

## [0.6.0] - 2026-09-05

### Added

- Lane encapsulation for dispatched subagent work. Every dispatch now lives in a dedicated lane folder holding its recipe, journal, and report together. Lanes journal execution incrementally in the lane folder, and a re-dispatch resumes from that folder after a crash, timeout, or context exhaustion. The dispatch contract mandates sliced context: exact file references, one fact per line, and no broad folder dumps.
- A token-efficient recipe contract. The recipe template was rewritten around sequenced tasks with exit criteria, strict context slicing, and co-located outputs.
- A strengthened report contract. The report template now mirrors the recipe's tasks, requires an epistemic mark on every claim, and replaces freeform narrative with dense structural detail and typed residual risks.

### Changed

- The parallel recipes and reports directories were replaced by lane folders across the base convention, the README, and the templates.
- Consistency remediation landed across the README and ONBOARDING after a dedicated audit lane.

## [0.5.0] - 2026-09-05

### Changed

- Knowledge findings are statusless. The STATUS field was removed from the knowledge template, the base record and query sections, and the README. Every finding that lands in knowledge is already a settled decision, so the field carried no information; supersession is handled forward-only by the SUPERSEDES reference. The shape change was declared breaking and released as a major bump.

## [0.4.1] - 2026-09-05

### Changed

- Artifact maintenance is decoupled from rhythms. The rhythm contract now states that a rhythm replaces task progression only, while the artifact invariants (@record, @laws: journaling transitions, advancing `next_action`, harvesting verdicts) hold across every rhythm. The default rhythm was reframed from a six-step loop that braided journaling, verdicts, and knowledge landing into plan execution, to the task milestones: discuss, decide, plan, execute, verify.
- README and base consistency fixes landed from an audit lane: the git guidance became topology-aware (parent workspaces deny by default, standalone repositories append the private paths), the handoff section names `scripts/journal-dangling.awk` and its exit-0 check, the phantom grep example in the boot walkthrough was replaced by the closure stamp the load pass actually collects, the boot step count was corrected to the eight active steps, the engine reads bash, awk, and grep, manual adoption gained the script permission step, and the stale references, the BIOS mention among them, are gone.

## [0.4.0] - 2026-09-05

### Added

- ONBOARDING.md, a five-phase agentic onboarding flow: isolate, assess, configure, symlink, verify, each phase a concrete procedure. Isolate starts from a dedicated branch, never from main; assess reads the repository topology and the existing instruction surfaces; configure installs the base assets, migrates standing instructions into the overlay and the personal amendments, and adapts the gitignore; symlink wires the harness entry points to `AGENTS.md`; verify proves the install with a bootstrap session, the query scripts, and a clean boot. It carries the topology-aware gitignore guidance and the instruction migration steps for adopting the convention into an existing repository.

### Changed

- The README's adoption guidance was rebuilt around topology: the deny-by-default gitignore detail moved to onboarding where the repository topology is assessed, an adopting agent is pointed at `ONBOARDING.md` as the executed path, manual adoption starts on a dedicated branch, and wiring the harness symlinks entered the adoption steps. The base layout gained the ONBOARDING.md line, and the gitignore whitelist named ONBOARDING.md alongside the other shared roots.

## [0.3.1] - 2026-09-05

### Removed

- The opinionated rule that pushed only on explicit instruction was removed from the base git section: a one-line removal plus the version bump, shipped as the standing versioning law's patch case, wording not shape. Workflow restrictions of this kind belong to team overlays, not to the shared base.

## [0.3.0] - 2026-09-05

### Added

- Cross-platform query scripts. `scripts/journal-active.awk` streams the active journal entries with complete bodies in a single command: the first pass memorizes every closure target, the second streams the bodies no closure names. Slug matching is uppercase-tolerant because testing exposed that the inline pipeline's lowercase-only regex had been silently missing uppercase slugs. The script runs as a single awk process, with no temp files, subshells, or process substitution, so it behaves identically on macOS, Linux, and Git Bash. `scripts/journal-dangling.awk` audits closure references in a single pass and exits nonzero with line numbers on dangling closers. Both were tested against two journals, and the audit caught two date-typoed closers in a second workspace's journal, proving its teeth.
- Harness entry symlinks. `CLAUDE.md` and `GEMINI.md` were created as symlinks to `AGENTS.md`, so every harness resolves the same base file, and the gitignore whitelists both links.
- The scripts directory is whitelisted in the gitignore, and the base and README query surfaces were reworked to reference the scripts.

### Changed

- The boot load moved in two steps, both inside this release: a full dump first replaced the per-entry reads by embedding the load loop in the query surfaces, then the embedded loop was replaced wholesale by `scripts/journal-active.awk` once testing showed the inline pipeline carried the same lowercase-only slug defect.

## [0.2.0] - 2026-09-05

### Added

- The boot load redesign. Live is now defined as not closed: the load list is every journal entry whose slug no closure names. The load command ships in the base query section and the README, streaming active entry bodies in one shot.

### Changed

- Anchors are period ordering and load receipts only; they no longer declare liveness. Closures carry a verdict word (done, superseded, dropped, folded), the closing entry's text carries the resolution, and closure extraction parses the target field only, never the reason prose.
- The period end gained the stray audit and the dangling check, and grounding a report now requires a reference in the loaded record. The journal template was updated; no shapes were removed and existing journals boot identically.
- The workspace overlay file was tightened to the terser line form of the base convention.

## [0.1.1] - 2026-09-04

### Changed

- The privacy sweep. Five posture claims were stripped from the base and two from the README, leaving the deny-by-default gitignore as the single privacy explanation. The deny-by-default steps in both the adopting and syncing sections now teach the sessions whitelist as the explicit tracking opt-in.

## [0.1.0] - 2026-09-02

First versioned release of the convention. It was not written in one pass: the convention was carved out of working practice, beginning with the archive of a legacy project and a freshly scoped `AGENTS.md`, and matured across roughly a hundred pre-versioning commits before the human declared the first stable version.

### Added

- The workspace overlay contract. `AGENTS.workspace.md` replaces or appends per base section, survives every sync untouched, and wins over personal amendments. The overlay template ships the grammar, and boot reads the workspace overlay before local amendments.
- Semantic versioning, with the version line opening `AGENTS.md` and the README teaching the policy and the major-bump check against overlays.
- The deny-by-default gitignore. Everything is ignored unless whitelisted, so an incomplete ignore list can no longer leak a session, with the convention's own files as the explicit list.
- The statusless journal. Entries close by reference only, agent-chosen group threads organize topics, the knowledge flag feeds the close harvest, and findings load in full at boot. The close state chases every closer in the same breath an entry resolves, and findings link to events through references of the form path#symbol into append-only artifacts, so nothing load-bearing lives in a dynamic file.
- The artifact grammars in `templates/`, seven of them at this release: session state, plan, journal, knowledge, recipe, report, and overlay. Every grammar carries a filled sample, and the templates are the shape authority: an artifact is written by filling its grammar, never by copying another session's prose.
- The dispatch contract for subagents. Recipe and report grammars define the brief and the evidence, a lane that cannot write its report returns the artifact verbatim for the dispatcher to persist byte-clean, and a dispatch never blocks the conversation: the turn ends at launch.
- The message-first boot. The opening message names the move before anything loads, the active session is verified with one targeted grep, and new units bootstrap from the boot itself. Local amendments are read first because they may amend the boot order.
- The design loop as the default rhythm, alongside the laws that shape the work: write token-efficient, and harvest the human, meaning knowledge lands only on approval while developing ideas stay in the journal.
- The README as the repo homepage, rebuilt from an earlier team guideline and swept into coherence before the tag: its TL;DR, philosophy, journal, knowledge, boot, and close sections all match the shipped convention.
