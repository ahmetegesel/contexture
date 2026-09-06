# Changelog

All notable changes to contexture are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a major bump breaks existing artifacts, a minor bump adds sections or features, and a patch bump fixes wording.

## [Unreleased]

Nothing recorded yet. The next release section is written at ship time, in the same breath as its annotated tag.

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
