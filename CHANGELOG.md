# Changelog

All notable changes to contexture are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a major bump breaks existing artifacts, a minor bump adds sections or features, and a patch bump fixes wording.

## [Unreleased]

Nothing recorded yet. The next release section is written at ship time, in the same breath as its annotated tag.

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

- Artifact maintenance is decoupled from rhythms. The rhythm contract now states that a rhythm replaces task progression only, while artifact invariants hold across every rhythm. The default rhythm was reframed around the task milestones: discuss, decide, plan, execute, verify.
- README and base consistency fixes landed from an audit lane: topology-aware git guidance, the dangling check named at handoff, and stale references removed.

## [0.4.0] - 2026-09-05

### Added

- ONBOARDING.md, a five-phase agentic onboarding flow: isolate, assess, configure, symlink, verify. It carries the topology-aware gitignore guidance and the instruction migration steps for adopting the convention into an existing repository.

### Changed

- The README was trimmed of the deny-by-default gitignore detail, which moved to onboarding where the repository topology is decided, and the base layout and git sections were updated to match.

## [0.3.1] - 2026-09-05

### Removed

- The opinionated rule that pushed only on explicit instruction was removed from the base git section. Workflow restrictions of this kind belong to team overlays, not to the shared base.

## [0.3.0] - 2026-09-05

### Added

- Cross-platform query scripts. `scripts/journal-active.awk` streams the active journal entries with complete bodies in a single command, tolerant of uppercase slugs, with no temp files, subshells, or process substitution. `scripts/journal-dangling.awk` audits closure references and exits nonzero with line numbers on dangling closers. Both were tested against two journals, and the audit caught two date-typoed closers in the wild, proving its teeth.
- Harness entry symlinks. `CLAUDE.md` and `GEMINI.md` were created as symlinks to `AGENTS.md`, so every harness resolves the same base file, and the gitignore whitelists both links.
- The scripts directory is whitelisted in the gitignore, and the base and README query surfaces reference the scripts.

### Changed

- The boot load command was upgraded from a slug listing to a full dump that loads all active entry bodies through a single command instead of one read per entry.

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

First versioned release of the convention.

### Added

- The workspace overlay contract. `AGENTS.workspace.md` replaces or appends per base section, survives every sync untouched, and wins over personal amendments. The overlay template ships the grammar, and boot reads the workspace overlay before local amendments.
- Semantic versioning, with the version line opening `AGENTS.md` and the README teaching the policy and the major-bump check against overlays.
- The deny-by-default gitignore. Everything is ignored unless whitelisted, so an incomplete ignore list can no longer leak a session, with the convention's own files as the explicit list.
- The statusless journal. Entries close by reference only, agent-chosen group threads organize topics, the knowledge flag feeds the close harvest, and findings load in full at boot.
