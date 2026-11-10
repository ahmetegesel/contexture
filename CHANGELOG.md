# Changelog

All notable changes to contexture are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): a major bump breaks existing artifacts, a minor bump adds sections or features, and a patch bump fixes wording.

## [0.74.0] - 2026-11-10

MINOR: the drawer's git management becomes a package and the core names no git. The git package (1.0.0) is a module with a preamble and laws and no verbs: its laws create the `@git` section after `@update` and append the boot ground clause for a repository. The core drops its `@git` block and keeps the 14-block skeleton, and its boot step 7 becomes the generic reconcile-the-working-state step; the loader names 11 generic sections. The lane's `@git` clause moves from the lane module into the package. Both work rhythms qualify their LAND `@git` references with the package, and starter-rhythms becomes 1.1.1. The onboarding asks the git choice with no default and states the docs-discipline module's git dependency as a fact. The guides and the lane-isolation retirement summaries follow, the base and core stamps read v0.74.0, and the golden follows. No payload or catalog path is removed, the git package arrives at 1.0.0, and no other plugin but starter-rhythms changes version.

### Added

- The git package (`plugins/git`, manifest and module 1.0.0, `kind: feature`, `part: module modules/git`): a module summary, version, and description, a laws file, and no verbs. The laws create the `@git` section after `@update` when installed (the gitignore strategy decided per topology and team choice at onboarding; the branch and worktree on demand with its push, merge, and cleanup mechanics) and append the boot ground clause (the `git status -sb` ground check for a git workspace, the upstream delta, and git wins over the record). The package README carries what it gives, the install on the human's go at the act with no default, the uninstall, the no-suite reason, and the docs module's git dependency as a fact. The real-catalog case proves the module and laws land, the `@git` section after `@update` with both clauses, the boot ground clause, and the uninstall restoring the pre-install layer bytes; the governance projects check names its no-suite reason, the areas map routes `plugins/git/**` to packages, laws, and governance, the forbid surface carries its README, and the payload-table pins ask the no-default choice and the dependency fact.
- The onboarding git choice: `base/.contexture/ONBOARDING.md` and `docs/adoption.md` carry the git package as a choice with no default (the installation set, the plan's choice line, and the install step on the human's go), and both state the docs-discipline module's git dependency: its change-aware verbs, the check, the gate, and the drift read git's delta, the change log stamps the workspace git HEAD, and a workspace without git keeps the audit, the query, and the writes and loses the change-aware checks. The README's adoption walkthrough names the git package choice.

### Changed

- The core (`base/.contexture/laws/core.md`, 14 blocks): the `@git` block drops, the skeleton runs `@laws` through `@update`, and boot step 7 becomes the generic reconcile-the-working-state step: the workspace's changes and the record's account of them, the evidence wins over the record, and a mismatch journals as work, never as a note; the version line reads v0.74.0.
- The loader (`base/AGENTS.md`): its second instruction names the 11 generic sections (`@laws`, `@layout`, `@module`, `@boot`, `@interact`, `@rhythms`, `@subagents`, `@refresh`, `@close`, `@handoff`, `@update`), and the version line reads v0.74.0. The composer's expected blocks drop `git`, and the core-source, loader-sections, loader, compose-base, module-laws, synthetic fixture, and golden tests follow; the golden header reads v0.74.0.
- The lane module (`base/.contexture/modules/lane/laws`): its `@append @git` clause leaves for the git package, and the lane keeps its dispatch, landing, boundary-warning, and drift clauses. The module-laws test pins the lane's subagent clauses and no `@git`, and the compose-base test pins the base-only layer with no `@git` section.
- Both work rhythms: the starter work's LAND line and the docs-discipline reference's LAND line qualify the `@git` reference (the shape lives in `@git` when the git package is installed), and starter-rhythms becomes 1.1.1; the docs-discipline reference stays package meta, so its plugin does not bump.
- The guides: `docs/the-engine.md` drops `@git` from the core block table and the loader's list and names the git package as the custom-section worked example; `docs/modules.md` carries the 14-block skeleton, the 11-name loader list, the package's `@git` after `@update`, and the package shape; `docs/plugins.md` names the package shape and the two no-suite reasons and carries the package entry; `docs/units-and-lanes.md`'s boot step 7 reads the generic reconcile with the installed package's specifics; `docs/overlays.md` notes that the overlay's `@append @git` addresses the package's section; `tests/README.md` carries the 14-block, 11-name, real-catalog, and no-suite lines.
- The lane-isolation retirement summaries: `docs/plugins.md`, `docs/modules.md`, and the corpus's plugins and system-map entries place the moved git clauses in the git package beside the lane module's subagent clauses.
- The corpus (not shipped): the modules, plugins, and system-map docs carry the package, the 14 blocks, the 11-name loader, the package's `@git` after `@update`, the lane's subagent clauses, and the retirement summaries; all through the docs write verbs, and the audit reads clean.
- The payload: no removed path in the range; the removed-path listing reads empty over `base/` and `plugins/`, so Updating steps 6 and 8 have nothing to delete, and the adoption is a plain apply plus the git install on the human's go.

### Fixed

- The lane-isolation retirement summaries no longer place the moved git mechanics in the lane module: the five entries (`docs/plugins.md:77`, `docs/modules.md:111`, and the corpus plugins-o1, plugins-r9, and system-map plugins) name the git package for the git clauses and the lane module for the subagent clauses.

Commits in the range: 3f97ef4 (the core `@git` drop, the generic boot step 7, the 11-name loader, the composer, and the tests and golden); 8ac6f1b (the git package, its tests, and the onboarding pins); 979495d (the qualified LAND references and starter-rhythms 1.1.1); 30ec9ca (the guides and the onboarding); 630971a (the lane-isolation retirement summaries); and the release commit.

## [0.73.0] - 2026-11-10

MINOR: the unit's session load fires a load-end point and the docs module uses the unit's hook points to nudge the docs at the moment a task starts and when a load ends. The unit load script fires load-end once, on the last page, after the page body and the load-complete line, with the unit, form, and page context, and the shipped points become seven; the docs module ships two handler files, task-landing (only on `CTX_ACT=start`, passing the started task) and load-end (the unit's in-progress tasks), and its nudge takes repeatable `--task` with the in-progress tasks as the default; the nudge's task list is carried one path per line, so a workspace root holding a space never word-splits, and a space-bearing case proves it; docs-discipline becomes 1.5.0; the guides follow. No payload or catalog path is removed, and no plugin apart from docs-discipline changes version.

### Added

- The load-end hook point (the unit module): the load script fires it once, when the page is the last, after the page body and the load-complete line, with the unit, form, and page context, and a block hook fails the load rc 1; load-pre and load-post still fire on every page. The presence census expects the seven derived points (stamp, task-landing, close, load-pre, load-post, load-end, refresh), and `tests/hooks/around-verbs.test.ts` pins the once-at-last-page firing and the block stop.
- The docs module's two handler files (`plugins/docs-discipline/.contexture/extensions/modules/docs/hooks/task-landing` and `hooks/load-end`, mode 0755): task-landing runs the nudge only when `CTX_ACT=start`, passing the started task from `CTX_SLUGS`, and load-end runs the nudge on the unit's in-progress tasks at the load's end; both are non-block and small, and with the docs module absent the unit's points fire silently.
- The nudge's task parameter (`--task=<slug>`, repeatable, the unit form only): a named task nudges regardless of status, the backlog-file form refuses the parameter, and with no task the default reads every IN_PROGRESS task through `ctx unit task list`; `docs_task_files` and `docs_exec_tasks` replace `docs_active_task`, the engine forces a named task through `DOCS_NUDGE_TASK`, and the handler, nudge, force, and package tests pin the behaviors.
- The space-bearing workspace case (`plugins/docs-discipline/tests/integration/space-root.test.ts`): the nudge's default and `--task` forms and both handler files run rc 0 with empty stderr under a workspace root holding a space.

### Changed

- docs-discipline becomes 1.5.0: the module and the manifest, the README's hook and nudge prose, and the census allow-list follow; the two hook files are the module's use of the unit's points, not a new point of its own.
- The guides: `docs/modules.md` ships the seven points with load-end's firing and last-page context, names the two handler files, and its Hook files cross-reference reads seven; `docs/plugins.md` carries the handler files; `tests/README.md` names the hook coverage.
- The corpus (not shipped): the modules doc gains the seven points and the handler sentence, the engine doc names the unit's point dependency, the docs-module doc carries the nudge's named or in-progress tasks, the operations doc carries the responsibility, the plugins doc carries the handlers, and the docs-module dependency names the unit's points; all through the docs write verbs, and the audit reads clean.
- The payload: no removed path in the range; the removed-path listing reads empty over `base/` and `plugins/`, so Updating steps 6 and 8 have nothing to delete, and the adoption is a plain apply.

### Fixed

- The nudge's task-file list and the handlers no longer word-split under a workspace root holding a space: `docs_task_files` writes one task-file path per line and `docs_exec_tasks` reads the list line by line, and the nudge builds the named slugs safely; before, a root with a space split the awk file argument. The new space-bearing case proves the fix, and the two new nudge lines join the census allow-list.
- The guides count the shipped hook points as seven: `docs/modules.md`'s Hook files cross-reference now matches the same guide's Seven points ship and the corpus's seven names.

Commits in the range: 20d7eec (the load-end point, its fixtures, and the seven-point census); 3e3a439 (the docs handlers, the task nudge, and docs-discipline 1.5.0); f2fe097 (the guides); 0318ca3 (the space fix and its case); 51d69c6 (the seven-points guide line); and the release commit.

## [0.72.0] - 2026-11-10

MINOR: the composed law layer is framed for the agent that reads it. The loader names the layer's generic core sections and states that every module adds its own sections, clauses, and duties, each duty followed as steps in the framed order with its gates, and that the laws bind; the source-of-truth law becomes the positive record law; the corpus gains the module independence rule and the framing leak rule; a governance census derives the loader's named set from the core law source and reads red on a module-owned section, a custom name, or a missing module; the core block order puts the boot after the layout and the layout lists the read order; both work rhythms take the verdict-on-the-specification and framing-leak steps, and starter-rhythms becomes 1.1.0; the guides follow. No payload or catalog path is removed, and no plugin apart from starter-rhythms changes version.

### Added

- The loader section census, `tests/governance/loader-sections.test.ts` (rule id modules-r-cqgw9): it reads the core law source's 15-block skeleton, drops the four record-grammar sections, inserts the composer's `@module` after `@layout`, and compares the result in order against the generic sections the loader's second instruction names; a planted `@record`, a custom name, a missing `@module`, and an absent frame each read red, and the shipped loader reads green. `tests/support/areas.ts` routes `base/AGENTS.md` and `base/.contexture/laws/**` to laws and governance, so a loader or core-source change selects the census; `tests/support/rule-reasons.txt` carries the independence rule (modules-r-pd48k) with its reason.

### Changed

- The loader (`base/AGENTS.md`, line 2): read `AGENTS.generated.md` WHOLE as the composed law layer; its generic sections are `@laws`, `@layout`, `@module`, `@boot`, `@interact`, `@rhythms`, `@subagents`, `@refresh`, `@close`, `@handoff`, `@git`, and `@update`; every module adds its own sections, clauses, and duties, so expect more than that list, and follow each duty as steps in the framed order, gates included; the laws bind; never edit it. The loader is 1,079 bytes, under its 2,048-byte cap. A harness entry point that copies the loader rather than symlinking it keeps the old line and should be refreshed.
- The source-of-truth law (`base/.contexture/laws/core.md`): the positive record law replaces the negative one: the record is the work's durable memory, what a fresh context resumes from, the events that happened, the decisions made, and the state they left, across compaction, tool change, and break; because the work's continuity depends on it, it holds whatever else that continuity needs, the reasons, the open threads, and the evidence behind them; the workspace and the commands' results show what is, and the loaded layer and its sequences say what to do.
- The core block order: `@boot` moves from after `@query` to after `@layout`, and `@layout` lists the loader, the generated layer, then the workspace and local overlays, following the read order. The composed layer reads laws, layout, the module preambles, boot, the record grammar, interact, rhythms, subagents, refresh, close, handoff, git, update. The composer's expected blocks, the core-source skeleton pin, the golden, the synthetic fixture, and the engine guide's table follow; an overlay that replaces `@layout` or `@boot` should re-check its copy.
- The corpus (not shipped): the modules doc gains the independence rule (modules-r-pd48k), a module contributes to a core generic section or its own artifact and never into a workspace-owned rhythm or another module's framing, and the framing leak rule (modules-r-cqgw9), the loader names the generic sections only and the core restates no module's framing; it states the four record sections as the unit module's own framing and names the loader's generic list. Both rules land through the docs write verbs and the audit reads clean.
- Both work rhythms: step 3 reads the human's verdict on the specification, and step 7 gains the framing leak check (the loader names only the generic sections and the core restates no module's framing). The starter rhythm (`plugins/starter-rhythms`), its README, and the docs-discipline reference (`docs/work.md`) and its README follow; starter-rhythms becomes 1.1.0, and docs-discipline stays 1.4.1, since its reference docs are not its installed payload.
- The guides: the README names the loader's second instruction and the composed layer's sections; `docs/modules.md` carries the independence wording, the four record sections split from the three generic workflows, the loader's generic list, and the module-preamble placement; `docs/the-engine.md` carries the frame, the order table with the boot after the layout, the about-a-kilobyte measure, and the table-note sentence; `docs/the-record.md` restates the positive record law; the starter README glosses the record law and steps 3 and 7; `tests/README.md` names the census and the core-source routing.
- The payload: no removed path in the range; the removed-path listing reads empty over `base/` and `plugins/`, so Updating steps 6 and 8 have nothing to delete, and the adoption is a plain apply.

### Fixed

- The areas map routes a core-source change to the governance censuses: `base/.contexture/laws/**` selects laws and governance, so a core.md change runs the loader section census and the surface censuses, where it ran the laws project alone.
- Both work rhythms' step 7 lines name the generic sections, not core-owned ones, so the leak check speaks the shipped term and matches the corpus rule; the starter rhythm and the docs-discipline reference agree.
- The engine guide carries the table-note sentence the ground mapped: the loader names the generic core sections only, the four record sections are the unit module's framing, and each `@module` preamble belongs to its module.
- The test timeout bound: the vitest config's testTimeout rises to 240,000 ms, and the three fold-defects tests carry the same bound, where the fold protocol's and fold-defects' tests ran 100 to 120 seconds under host load and timed out the staged prerelease gate; the tests alone run faster. Tests only, no shipped path.

Commits in the range: c1c0854 (the loader frame, the record law, the census, and the golden); 59c481c (the layout read order and the boot after the layout); 9c00059 (the rhythm steps and starter-rhythms 1.1.0); f041c11 (the guides); d546c60 (the core-source areas route); 1d68692 (the generic leak-check wording); dc9ff41 (the engine guide's table sentence); fe215df (the fold-defects test timeouts); ebde3af (the suite timeout bound); and the release commit.

## [0.71.0] - 2026-11-09

MINOR: the builtin lane and rhythm modules move from the extension root to the workspace modules root, beside unit and run, so the extension root holds only installed packages. The help listing and the composed law layer list them with the workspace modules, the builtin set becomes one shared engine reader, the update path seeds its tag tree with `extensions/modules` when the drawer holds the package overlay root, and the law golden regenerates. No plugin payload changes, so no plugin version moves and no re-install is needed.

### Breaking

- The payload moves 12 files: `base/.contexture/extensions/modules/lane/{laws,module,scripts/create,scripts/record,scripts/report,scripts/show}` to `base/.contexture/modules/lane/` and `base/.contexture/extensions/modules/rhythm/{README.md,module,scripts/current,scripts/list,scripts/resolve,scripts/show}` to `base/.contexture/modules/rhythm/`, byte for byte except the rhythm README line that names its root. `base/.contexture/extensions` then carries no tracked payload file. Updating past this release deletes the 12 old live paths by its removed-path listing (Updating step 6) and the apply adds the new ones; the emptied `extensions/modules/lane` and `extensions/modules/rhythm` folders go while `.contexture/extensions` itself stays where installed packages live. A leftover lane or rhythm under the extension root now collides with a builtin, warns `skipping extension module <name>: collides with a builtin`, and is skipped.
- `ctx help` lists lane and rhythm with the workspace modules, before the installed extension modules, where they listed after them; the composed law layer's `@module` order follows. The per-verb output is unchanged.
- The payload declaration drops `extensions` and names `modules/lane` and `modules/rhythm`: `base/AGENTS.md` and `base/.contexture/{ctx,package-install,package-uninstall,storage,laws,modules/lane,modules/rhythm,modules/run,modules/unit,ONBOARDING.md}`.

### Added

- The engine's one builtin reader: `is_builtin` and its private verb `ctx _builtin` hold `unit`, `run`, `lane`, and `rhythm`, and the engine's discovery, reserved exemption, extension skip, filter and hook scans, the composer, and the package installer all read it, so the builtin sets can no longer split.

### Changed

- The unit verb library's rhythm resolve candidates and the four rhythm scripts' drawer depth move from the extension root to the workspace modules root, so `ctx rhythm list`, `show`, `current`, and the stamp check of `ctx unit record --rhythm` and `ctx lane create --rhythm` read the moved module.
- The update path's payload compare seeds the scratch tag-tree copy with `extensions/modules` when the live drawer holds `.contexture/extensions`, since `diff -rq` does not descend into a folder the tag side lacks: an installed package under the extension root reads as the workspace's own, its install record naming its files, while a module folder under `extensions/modules` a tag shipped under `base/` still prints and reads a missed delete by the tags.
- The corpus (not shipped): the modules, the-engine, system-map, and operations docs name the four builtins and the shared reader, place lane and rhythm in the workspace modules root, carry the moved payload declaration, and the operations apply step carries the compare seed and the extension-root reading.

### Fixed

- The law golden regenerates: the compose output changes in line 1's sources hash and in the `@module` order (lane, rhythm, and unit come first with the workspace modules), nothing else; `tests/laws/fixtures/base-only.golden` follows.

Commits in the range: 300a327 (the payload move); 0d6c18f (the shared builtin reader); 372954e (the guides, the payload declaration, and the update path); d55bed1 (the tests, the compare seed, and the v0.71.0 golden); 9473c51 (the docs review fixes); d9d583e (the composer skip pin); and the release commit.

## [0.70.2] - 2026-11-08

PATCH: the update path lists every removed payload path and shows every leftover. The removed path listings of Updating steps 6 and 8 and the dev loop run with rename detection off and remove the folders their deletes empty, ending a successful run rc 0; the payload compare shows a module folder or the templates folder left behind while dropping the workspace's own folders and files at the drawer's top; its reading tells a missed delete from the workspace's own by the tags; the adoption procedure and the guide name the `.contexture/tmp/` ignore line. The payload change is `.contexture/ONBOARDING.md` alone; no plugin payload changes, so docs-discipline and storage-fts5 are unchanged.

### Changed

- Updating, for a workspace updated by the earlier steps from a version before the session to unit move: it may still hold the session module folder, the lane module folder (and, from v0.58.1, the old storage module folder), and the templates folder; every ctx call then warns about skipping those modules and `ctx lane` refuses as an unknown command. Rerun the new listing from the version that was live before that update, or read the new compare and remove only the paths a tag shipped: the printed paths some tag shipped under `base/` (and a pre v0.60 plugin home under `.contexture/modules/`, replaced by the catalog install on the human's go), never the workspace's own lines (its modules, local drawer folders, installed packages, configuration, or an fts5 store's database).
- The `.contexture/tmp/` ignore line (the engine's scratch drawer) is now named everywhere a workspace sets its ignore lines: the adoption procedure (`.contexture/ONBOARDING.md`, payload), docs/adoption.md Topology and gitignore choices, and Updating step 9. A standalone repository adds it; a deny-by-default workspace adds it after its `!.contexture/**` whitelist line, which otherwise re-includes it. A drawer adopted earlier gains it at its next update (step 9); without it git status lists the scratch drawer untracked after ctx calls.
- The CHANGELOG 0.70.0 items that quote the earlier listing stay as history; a reader following them over a range with moves adds `--no-renames`.
- The corpus (not shipped): the operations apply step carries the listing, the folder removal ending rc 0, the compare's reading with the drawer top files, and the tags discriminator.
- Tests only, no adopter step: the governance payload-table project pins the three listings, the folder removing loop and its rc 0 end on planted paths, a census against any delete filtered git diff without `--no-renames` in the guides, the compare showing leftovers while dropping the workspace's top folders and files, the reading's tags discriminator and its two commands run over leftovers and workspace names, the tmp line in Updating step 9 and the deny-by-default block, and the two tmp lines of the adoption procedure.

### Fixed

- docs/adoption.md Updating step 6, Updating step 8, and the dev loop step list the removed payload and catalog paths with `git diff --name-only --no-renames --diff-filter=D`, piped into a loop that also removes each folder the deletes empty and ends a successful run rc 0. The earlier listing kept git's rename detection on, which reports a moved file as a rename and leaves it off the list: 22 of the 44 base paths v0.55.0 to v0.70.1 removes (25 of 48 from v0.58.1), and 85 of the 130 catalog paths (88 of 134 from v0.58.1); and nothing removed the emptied folders.
- The payload compare drops by whole line only the workspace owned names at the drawer's top: the four folders (`units`, `sessions`, `rhythms`, `tmp`) and the workspace's own files (the configuration `config`, the legacy `storage.conf`, an fts5 store's database with its wal and shm files, a macOS folder metadata file `.DS_Store`); a database relocated by `storage.database` is the workspace's own too. The earlier grep dropped every direct child of the drawer's top, its module folder, and the extension root's levels, which is exactly where a module or the templates folder left behind shows, so it read empty over a broken drawer. The compare now also prints the workspace's own modules, local drawer folders, and installed packages: empty is no longer the clean verdict, no missed delete is.
- The compare's reading tells a missed delete from the workspace's own by the tags, never the name: outside the install records and the legacy law layer, a printed path some tag shipped under `base/` (`git log --tags --format=%h -1 -- base/.contexture/<path>` names a commit) is a missed delete, and so is a folder under `.contexture/modules/` that a plugin shipped before v0.60 (the same command over `plugins/*/.contexture/modules/<name>/*`), that plugin's old home, which its catalog install replaces on the human's go; any other printed path is the workspace's own.

Commits in the range: 9c4ed98, 77c37ff, 2143a6c (the update path fix, its pins, and the adoption procedure's tmp line); 573fb57, 1840f2e, 73dfec8 (the review fixes: the drawer top workspace files, the loops ending rc 0, the tags reading); and the release commit.

## [0.70.1] - 2026-11-08

PATCH: a fully migrated workspace keeps no empty deprecated record root, and a refused store read never reads as an answer. The posix store removes `.contexture/sessions` once a move empties it, and `ctx unit migrate --all` removes it when it is already empty; a record function whose store prints neither its own refusal nor the resolver's line prints its call's fixed line with its code; `ctx unit diagnose` prints `active units: unknown` when its listing refuses, never 0. storage-fts5 1.2.2; docs-discipline unchanged.

### Changed

- storage-fts5 1.2.1 to 1.2.2 (see Fixed), the release's one plugin bump; the empty root fix touches no plugin payload, and docs-discipline is unchanged. An fts5 drawer re-installs storage-fts5 for the new health detail, on the human's go at the act.
- Updating: a workspace already fully migrated runs `.contexture/ctx unit migrate --all` once after the update to remove its empty `.contexture/sessions`; it prints `migrated: 0`. On macOS a folder metadata file (`.DS_Store`) left in the deprecated root keeps the folder, since the removal refuses while any entry remains; if the folder stays after the sweep, remove that file and the folder by hand.
- A custom file driver reading a fallback root keeps its own lifecycle: the removal is the posix driver's, and fts5 keeps no root and is untouched.
- Output that parsers meet: a consumer of `ctx unit diagnose --json` accepts null for `active_units`; a reader matching the old fts5 health detail text moves to the new one; a reader of a record function's refusal over a store that breaks the one line shape meets the fixed line with its code.
- No store call or process is added to a write: `ctx unit record` still makes store.get, store.get, store.batch, and a write that moves nothing runs no added removal; no store operation, answer shape, or code changes. The posix fallback removal returns at once for a namespace that declares no fallback, so no caller can aim it at the workspace folder.
- The guides name the removal throughout (the-record, the-engine's store contract, its `store.promote` row, and its drawer tree, the unit and storage READMEs, adoption, units-and-lanes, modules, and README), with the no unit limit beside every sweep claim; docs/the-engine.md and the unit module README name the three fixed fallback lines and state the resolver's line as the only store line that rides whole; the-engine's diagnose section names the unknown count. `ctx unit refresh` over a refused read still prints the board's line and then the audit's, as designed.
- Tests only, no adopter step: storage-faults rows through a wrapper resolver pin the silent, foreign, and foreign then real store lines on get, list, and batch, each to its one line; a diagnose case pins the unknown count; a store-fallback guard case pins that a put, a delete, or a batch that moves nothing leaves an empty fallback root in place; the migrate help test pins the no unit limit; the fts5-schema health case pins the new detail and that a store read lays the schema.

### Fixed

- The posix store removes the deprecated record root `.contexture/sessions` once it is empty: the move on first write (a put, a delete, or a batch) and the sweep's promotion remove the fallback root folder in the same call when their move empties it, by one directory removal that refuses silently while any folder or file remains, so a root still holding a unit or any other entry stays, nothing printed either way. Every fully migrated workspace kept an empty `.contexture/sessions` before.
- `ctx unit migrate --all`, or a named `ctx unit migrate <unit>`, over a store whose deprecated root exists and is empty removes it and still prints `migrated: 0` (the optional `store.promote` removes an empty fallback root when it answers none). Known limit: a store holding no unit at all reaches no promotion and keeps its empty root, the sweep then promoting nothing; the migrate help, the corpus rules, the unit and storage READMEs, and the guides state it.
- `ctx unit diagnose` never reports an ACTIVE count it could not read: when its listing refuses, the line reads `active units: unknown (<the refusal's message and code>)` (or `unknown (the record's listing did not answer)` when the listing printed nothing), where it printed `active units: 0`; every other line still prints, the exit code stays 0, and `--json` carries `active_units` as null. The help names the line and the exit codes: 0 the diagnosis printed, a part it could not read named in its own line; 1 an unrecognized option; 2 the storage resolver missing or no scratch folder.
- A record function whose store call refused with a stderr line that is neither the store function's own refusal nor the resolver's line prints the fixed line of its call with its code (`the store read failed (ERR_STORAGE_READ)`, `the store list failed (ERR_STORAGE_READ)`, or `the store batch failed (ERR_STORAGE_WRITE)`, for example `session.board: error: the store read failed (ERR_STORAGE_READ)`), where it printed that line whole with no code and whatever folder it named. Only a store that breaks the one line shape itself meets it (a crashing or third party driver, a shell error line); the shipped drivers' refusals and the resolver's lines read as before.
- storage-fts5 1.2.2: the `storage.health` degraded detail for a database file holding no table reads `database present, its schema not laid yet (the first store read or write lays it)`, where it said the first write lays it, though a read lays it too; the driver folder README and the package README state when the schema is laid (an absent file by its first write, a read of an absent file making nothing; an existing empty file at its first open, read or write).

Commits in the range: 0a5674a (the empty root removal); 82a0efa, e33dfa7, dcefac7, 7fee015, 365ce16 (the empty root review fixes); 55c9b20, b787b25, 948514e (the store refusal review fixes and storage-fts5 1.2.2); faa3427 (the diagnose unknown count); and the release commit.

## [0.70.0] - 2026-11-07

MINOR: the agent facing surfaces go through ctx. `ctx lane create` takes the brief as parameters and composes the recipe itself; a base `rhythm` module lists the rhythms, shows one, and names the rhythm in force, replacing `ctx unit index`; the engine builtins `ctx compose` and `ctx package install|uninstall` front the private composer and package installers, and the loader's first instruction runs `ctx compose`; `ctx unit list` replaces `ctx unit active` and `ctx unit units`; a lane artifact is referenced as `lane#<lane>/<recipe|journal|report>[#<claim>]` and resolves through ctx; and the shipped laws, rhythms, help, and verb output name ctx verbs, never record storage, held so by two new censuses. The boot proposes the rhythm with the unit. docs-discipline 1.4.1, storage-fts5 1.2.1.

### Breaking

- `ctx lane create` no longer reads stdin: the stdin recipe is retired for the brief parameters (see Added). A script that pipes a recipe refuses rc 1 with one line naming the five required flags and `ctx lane help create`, and nothing is written. Lanes created before keep their stored recipes and resolve, show, record, and report as before; only new lanes take the composed shape.
- `ctx unit index` is retired for `ctx rhythm list`: it refuses rc 1 as an unknown verb with the module help, and no retired name stays reserved, so `index` leaves the reserved module names and a workspace or package module may now take it. An overlay, hook, or script calling it moves to `ctx rhythm list`.
- `ctx unit active` and `ctx unit units` are retired for `ctx unit list` (see Added): each refuses rc 1 as an unknown verb with the module help and prints no replacement hint, and the `units --json` form is dropped. `list` joins the reserved module names while `active` and `units` leave them, since the reserved set reads the unit verb set; the retired `query` and `next` hints now name `list`. Overlays, rhythms, scripts, and notes naming the retired verbs move by hand to `ctx unit list` and `ctx unit list --all --repo=<repo>`. The unit verb count is 20.
- `ctx unit list --all --repo=<repo>` prints a different text than `ctx unit units <repo>` did: no `units <repo>: N units` header and no blank lines, one line per unit `<slug> [<STATUS>] <anchor>` with the anchor value alone, and the status as stored (units printed `[CLOSED]` for every status but ACTIVE). On a store not created yet every `list` form prints `no units yet` rc 0, where `units` refused rc 1.
- The payload apply hand deletes `base/.contexture/modules/unit/scripts/index`, `scripts/active`, and `scripts/units` from the live drawer (`git diff --name-status --diff-filter=D v0.69.0 v0.70.0 -- base/` lists them). The delete is load bearing: a left `units` script fails with an unknown view error, and a left `active` script keeps answering and keeps `active` reserved; the payload compare lists each one left.
- The reserved module names gain `compose` and `package`: a workspace or extension module of either name now warns `reserved name refused (shadow)` and is skipped at every dispatch, the composer leaves its laws out, and the package installer refuses it. The package installer also refuses a package module named `rhythm` as a builtin, as it refuses `lane`.
- The plugin install and uninstall scripts are retired, replaced by `ctx package install|uninstall`: those of ast-doc-graph, docs-discipline, starter-rhythms, storage-fts5, and toolchain-filters, and the worked example's. Run `.contexture/ctx package install <name>` and `.contexture/ctx package uninstall <name>`; a third party package still carrying its own wrapper installs through `ctx package` by its root path; the private `.contexture/package-install` and `.contexture/package-uninstall` stay as the implementations. A fresh adoption or a refreshed catalog folder loses the scripts, but a package whose version did not move keeps its old catalog folder, where the retired script still runs the private installer and the README still teaches it. Updating past this release, remove the retired `plugins/*/install` and `plugins/*/uninstall` from your catalog (`git diff --name-status --diff-filter=D <live-tag> <tag> -- plugins/` lists them), or refresh `plugins/` whole from the tag (docs/adoption.md, Updating step 8).
- Installing from one catalog into another workspace: the retired wrapper honored an inherited `CTX_ROOT`; `ctx package` ignores it and installs into the workspace whose engine runs the verb, so run that workspace's engine with the package root path (`<workspace>/.contexture/ctx package install <path>`).
- The installers recompose through `ctx compose`, and the absent composer skip is dropped: an install or uninstall into a payload without the composer now fails rc 2 after the overlay and its record land, the message naming `.contexture/ctx compose`.
- The stamp check (`ctx unit record --rhythm`, `ctx lane create --rhythm`) reads steps by the rhythm grammar: a step line opens with a number, a dot, and a blank, and every such line is a step in file order. Three kinds of workspace rhythm that stamped on v0.69.0 now refuse: steps written `N.GATE:` with no blank, prose holding a numbered line before a step, and files with CRLF line endings. They refuse as step not in, as reads `<the prose line>`, or with the name refusal, and `ctx rhythm list` names each defect. The dialect is LF; no CRLF handling is added.
- A stamp of a rhythm whose `@rhythm` line differs from its file name now refuses rc 1. The missing rhythm and missing step refusals name no folder: `ERROR: no such rhythm: <name> (ctx rhythm list names them)` and `ERROR: RHYTHM step <N> not in <name>`.
- A workspace or installed rhythm file whose name is not a rhythm name (a dot, a blank) no longer lists, where `ctx unit index` listed it; `ctx rhythm list` warns for such a file when it holds an `@rhythm` line.
- `ctx unit resolve` of an absent lane recipe or report now refuses rc 1 (`resolve: error: reference '<ref>' not found in unit '<unit>' (ERR_ENTITY_NOT_FOUND)`) in both views, where it printed one empty line rc 0; `ctx lane show` keeps its empty line. The canonical `unit#<unit>/lane/<lane>/<recipe|report>` of an absent document refuses on resolve too, while a write carrying it still lands (the write proves the lane only).
- A legacy `lanes/<lane>/<extra>/report#<claim>` or `report.md#<claim>` reference, with path segments before the artifact name, now refuses rc 1 as unsupported where it answered the lane's report claim; a legacy `lanes/` claim holding more than one hash takes the claim after the first hash, as the `lane#` shape does, where it took the text after the last.
- `ctx lane create` refusals and help: `--help` and `-h` print the full table `ctx lane help create` prints (they printed a two line usage), as do `ctx lane create <unit> --help`, `-h`, and `help` (a create with only a unit and the word help printed the missing flags refusal); a malformed unit refuses `lane create: error: malformed unit '<unit>' (ERR_INVALID_ARGUMENT)` rc 1 where the usage line printed; fewer than two arguments print the new usage line; an empty `--ref`, `--task`, or `--decision` refuses rc 1 as malformed (`malformed ref ''`, `malformed task ''`, `malformed decision ''`), as every other REF write does; an empty required or single flag counts as missing.
- Output that parsers meet: `ctx lane create`'s stdout grows from its one line `lane created: <lane> in <unit>` to that line, an empty line, the label `dispatch prompt (the subagent's launch message; never stored):`, and three prompt lines (`head -n 1` still reads the lane line); the board's stdout, and refresh's, gains a closing rhythm line and `session.board`'s JSON a `rhythm` key; a stamped `ctx unit record` prints a second stdout line; `ctx unit entry list --json` carries a `rhythm` key per entry after `group`; `ctx unit fold`'s plan, progress, and lane boundary lines change (see Changed); the lane verbs' library refusals read `lane record: error:`, `lane show: error:`, and `lane report: error:` (lane report's NUL and UTF-8 lines and lane show's missing data script line among them), where they read `<verb>: error:`; a record verb's refusal over a store failure is one line carrying the store's code (see Fixed). A script matching the old text needs the new.

### Added

- The parameterized `ctx lane create <unit> <lane-slug>`: required `--goal`, `--branch`, `--writes`, `--scope` (repeatable, numbered by the verb), and `--report` (repeatable); optional `--ref`, `--task` (`backlog#<slug>`), `--decision` (`journal#<slug>`), `--rhythm` (checked by record's rule), `--fact`, and `--substrate`; each as `--name=value` or `--name value`. The verb composes the recipe with its fixed BOUNDARY (the workspace boundary sentence, the runner rule, never a background process left running, the record door and the write scope), BOOT (every REF read, each TASKS and DECISIONS item read whole through `ctx unit task show` and `ctx unit entry show`, the load receipt riding as `--ref` lines), JOURNAL, and REPORT blocks, and prints the dispatch prompt, never stored. Each refusal is one stderr line before the storage call; `ctx lane help create`, `ctx lane create --help`, and `-h` print one table.
- The base rhythm module, an extension root module beside lane (every generated law layer gains `@module rhythm`): `ctx rhythm list` (origin labels, never paths; a workspace copy shadowing an installed one; the select line; grammar warnings on stderr, one per defect, a malformed gate whose number also breaks the order warning once, as the gate defect), `ctx rhythm show <name>`, and `ctx rhythm current <unit>` (the rhythm in force, the last stamped entry of the whole journal, and its next gate). One private resolve is the rule for record, lane create, list, show, current, the board, and the census, and record and lane create share one rhythm check in the unit verb library, record's refusal lines unchanged.
- A stamped `ctx unit record` prints the next gate line after `recorded entry`, and the board (and `ctx unit refresh`) ends with the rhythm in force line, read from `session.board`'s new `rhythm` field in the board's own data call.
- The engine builtin `ctx compose [--check]`: answered before discovery, it execs the core's private composer with its arguments, output, and exit code unchanged; a payload without the composer refuses rc 2 naming it; a sole `--help` or `-h` prints its usage; `ctx help` lists it.
- The engine builtin group, the install verb `ctx package install <package>` and `ctx package uninstall <package>`: a catalog name resolves to `plugins/<name>` at the workspace root, a value holding a slash is a package root path read from the working folder, and uninstall takes an absent catalog folder's name as the installed package's name; the package always lands in the workspace whose engine runs the verb. An install or uninstall runs only on the human's explicit go at the act, which the verb never checks; its help, `ctx help`, and core.md `@layout` state it. The group answers before discovery, so a broken module never blocks its usage, refusals, or help, while a package's part hooks still run module verbs, so a broken module's discovery warning can appear in an install's output. The private installers' lines pass through unchanged, labels included (`package-install: installed ...`, `package-uninstall: removed ...`).
- `ctx unit list [--active|--all] [--repo=<repo>]`: every ACTIVE unit with its next move (the retired active view, byte equal on one store), or every unit with its status as stored, filtered by repo.
- The `lane#` reference shape `lane#<lane>/<recipe|journal|report>[#<claim>]`, resolved by `ctx unit resolve` beside the legacy `lanes/` form and the canonical `unit#` form, each whole artifact printing what `ctx lane show` prints; the legacy whole artifact form `lanes/<lane>/<recipe|journal|report>`, which refused as unsupported, now resolves. The laws teach `lane#`; the writers keep accepting `lanes/`.
- The `<KEY> ::` claim form: a report or recipe claim resolves by the last head naming it, `@<claim>` or a column-0 `<KEY> ::` head, bare or inline (`<NAME> :: <text>`), its span reaching the line before the next non-blank column-0 line, blank lines kept; a document whose later head names a claim an earlier head also names answers the later span. A lane journal claim, `lane#<lane>/journal#<slug>` or the legacy `lanes/<lane>/journal#<slug>`, prints the last lane journal entry carrying that slug as `ctx lane show` prints it. A missing claim or slug refuses rc 1 as not found in the text and `--json` views, and a claim's `--json` prints the `lane.get` answer of its artifact.
- The censuses: the rhythm grammar census (`tests/governance/rhythm-grammar.test.ts`) over every shipped rhythm and the docs work copy, null checked by planted defects; the agent surface census (`tests/governance/surface-leaks.test.ts`) refusing the record storage pattern (the namespace lock family, the sessions folder, drawer, or directory wording, a bare module root) in the shipped laws, the rhythms, every verb's own `--help` and each sub-verb's, the run and unit `--diagnose` forms, and the engine builtins read from `ctx help`'s usage block, and refusing a help form that answers rc not 0 or with a stderr; the verb output census (`tests/unit-verbs/verb-output.test.ts`) running every unit, lane, and rhythm verb and sub-verb, keyed from the argv it runs through the parsed help tables above a floor of 43 keys, with a refusal family of missing entities, held locks, a read only unit folder, and a unit in both roots, under its own 300 s hook bound; the forbid grep refusing the composer path, the private installer paths, and `plugins/<name>/install` or `uninstall` on every main surface and the `ctx help` outputs; governance pins on the docs/plugins.md tree and the Updating step 8 cleanup; a composer change selects the engine project in `bun run test:changed`. Tests only, no adopter step.

### Changed

- The loader's first instruction runs `.contexture/ctx compose` and stops on a missing engine or a compose exit other than 0, reporting the compose's error line. A harness entry point that copies the loader, rather than symlinking it, should be refreshed; the old `sh .contexture/laws/compose` still works while the composer stays at its path.
- The boot and the restate name the rhythm: `@boot` 3 reads `ctx rhythm list` beside `ctx unit list`; `@boot` 4's proposal names the rhythm with the unit; `@boot` 6 reads `ctx rhythm current`; `@boot` 9 continues at the next gate `ctx rhythm current` names when the confirmed rhythm is the one in force, else at its first step (`ctx rhythm show <name>`); the `@interact` restate names the rhythm and its next gate; a new `@rhythms` verbs clause says the first entry after a confirmed rhythm carries its first stamp; `@rhythms` default 3 and the record laws name `ctx unit list`. Every boot runs `ctx rhythm list`, so each grammar defect of an adopter's own rhythms prints one stderr warning per boot, and an installed docs-discipline below 1.4.1 prints the docs-authoring step 10 warning until `ctx package install docs-discipline` runs on the human's go.
- `@subagents`: the brief bullet names `ctx lane create`'s parameters; the search delegation clause (the dispatcher never runs raw exploration, a lookup with unbounded output whose target it does not already hold, such as grep, find, a read to locate, a record sweep through `ctx unit search`, a census, or an earlier recipe read to learn a brief; the docs map, the index, an owning doc, and a ranked `ctx docs query`, is its own read; where the harness cannot dispatch, the agent explores in place); the re-verify bullet (re-run the report's commands; a doubted absence claim goes to a fresh lane); the load receipt rides as `--ref` lines; lanes are created from their brief parameters. The unit laws' lanes line follows, and the lane laws' boundary-warning clause says `ctx lane create` writes the boundary into the recipe and the dispatch prompt and forbids leaving a background process running.
- The cli-doorway clause: `@laws#cli-doorway` says the record's storage is the driver's, never listed, read, or written by path, a need ctx does not serve being a gap to report, and names `ctx rhythm current` beside `ctx unit` and `ctx lane` among the verbs the record is reached through. The reference clauses teach `lane#` and the `<KEY> ::` claim. The core `@layout` storage line names no unit module folder and lists the built-in posix driver among the storage core's parts; the unit module description drops implementation paths; core.md `@layout` names the generated layer composed by `ctx compose`, the law sources line without the composer, and the runtime line naming `ctx compose` and `ctx package install|uninstall` with the go clause. The record laws' composed `@close` 3 sends an audit finding no verb can repair to the human. The unit laws' named looks name `ctx unit list --repo=<repo>`. The golden and the sources checksum move.
- Help: the audit help sends a finding no verb can repair (a bracketed field line, an inline marker, a dateless slug, a missing THREAD, a slugless or dangling closer) to the human, never to a hand edit of the record or an entry minted only to quiet it; the resolve help states the claim spans and that the last head naming a claim, in either form, wins; the nudge help names its `<backlog-file>` placeholder, states the form rule (a first argument holding a `/` or ending in `.md`; any other value names a unit), and names the refused store roots by the module declarations the storage library lists them from; the check help gives the pushed range form for both corpus halves; `ctx unit help fold` names the `ctx lane create` command the plan prints above the manual; the NUL and UTF-8 byte refusals name a lane report as the one document they check and the `ctx lane create` flags as fields.
- `ctx unit fold` prints the one line `ctx lane create` command for the next lane: the plan's NEXT line reads `NEXT: create the first lane with this command (if absent), then fetch:` above it, where `(recipe: the manual below)` stood; the progress reads `NEXT: fetch lane <lane>:` when the lane exists and `NEXT: create lane <lane> with this command, then fetch it:` when absent, where `NEXT: fetch lane <lane> (create it with its manual if absent):` stood; the lane boundary reads `The orchestrator creates <lane> with this command and dispatches it:`. The manual stays as the lane's loop and reaches the lane through the composed recipe, boundary sentence included; the fold lane command's `--writes` value, and so every new fold lane recipe's write scope, grants the lane its consolidated and superseding entries over the general rule that a subagent never writes the unit's record.
- The composed REPORT block: its verdict line reads `VERDICT :: done, partial, or drifted, with one line why` (it read `VERDICT: ...`), and its claim line says each section opens at column 0 as `<NAME> ::`, its text on that line or its body indented two spaces below; the create help example and fold's lane command model `<NAME> ::` values. A recipe stored before keeps its text, and a report written with a `VERDICT:` colon line still does not resolve as `lane#<lane>/report#VERDICT`.
- docs-discipline 1.4.0 to 1.4.1, the cycle's one bump: the docs-authoring step 10 gate is renamed `TRACE+ACCUMULATE` (it could not be stamped as `TRACE & ACCUMULATE`); the docs-authoring and docs-drift steps name `ctx lane show`, `ctx unit task add`, and `ctx docs help check`; the docs laws drop the files driver folder sentence and their `@layout` line points at `ctx docs help` instead of the docs module README path; the conventions seed points at `ctx docs help check`; the nudge and check help above. A re-install takes the human's go at the act, and it never overwrites an existing conventions doc, so an adopter's corpus keeps the old `docs/drift` good field until it is updated with `ctx docs rule workspace conventions docs/drift --good="..."`; the old pointer still resolves.
- storage-fts5 1.2.0 to 1.2.1 (see Fixed); adopters on fts5 re-install it for the fix, on the human's go at the act.
- The payload apply (the operations RUN step and docs/adoption.md) runs `.contexture/ctx compose` after the copy and the hand deletes, and the live adoption's docs-discipline re-install is `.contexture/ctx package install docs-discipline`; the adoption chmod lists drop the composer, the private installers, and the plugin wrappers, since the builtins run them through sh; Updating step 8 deletes the catalog paths a release removed, or refreshes `plugins/` whole, since catalog meta moves no version.
- The guides name `ctx rhythm`, `ctx unit list`, `ctx compose`, and `ctx package`; teach the `lane#` reference shape and its claims; send the six audit classes no verb repairs to the human and name the two verb repairs; name the unit module as the actor that creates a bootstrapped unit; and mirror the cli-doorway verbs. The engine guide narrows its discovery warning claim to the builtins themselves, and the plugin tree drops the retired package root scripts.
- The corpus reverses two clauses that were lane corrections, never human rulings: modules-r19's never an engine verb and the-engine-r22's never engine verbs.
- A repository contributor rule, not payload: this repository's overlay gains the inner-workings law (a feature's inner workings are known only inside its implementation), claiming only the reach its censuses hold.

### Fixed

- A refusing run over a unit served from the deprecated root prints its refusal alone (a load page out of range, a claim the report lacks, and refs-to with no referrer printed the warning first), and a rc 0 run prints the warning once after its answer, the relay held in the verb library; a red audit (rc 1 with findings) no longer prints the warning. `ctx unit refresh` prints it once, after its answer, only on a rc 0 end (it printed two, one even on a rc 1 end); `ctx unit fold`'s views (the progress view, a lane fetch, a check or finish ending rc 0, the plan) print it after their answer (the progress view printed none); `ctx rhythm current` prints its line, then the warning, only on a rc 0 end.
- A record verb whose store call refuses prints one stderr line, its own function carrying the store's message and code (for example `session.board: error: cannot read key '<unit>/journal' in namespace 'unit' (ERR_STORAGE_READ)`), where it printed the store's own line and then a fixed `the store read failed` or `the store list failed` line, always ERR_STORAGE_READ. The rc is unchanged; the code is now the store's (a store scratch failure under a list reads ERR_STORAGE_WRITE).
- A posix store read failure (an unreadable key file) no longer prints cat's own line naming the absolute storage path through every reading verb; the `store.get` refusal line stands alone.
- storage-fts5 1.2.1: a database file the driver cannot read refuses `cannot read the store` (ERR_STORAGE_READ) and an empty one it cannot lay the schema in `cannot create the store` (ERR_STORAGE_WRITE), neither naming the database's location; a failed value read no longer prints cat's own line naming the driver's scratch.
- The fold progress view and `ctx unit fold <unit> --check` on a fresh plan with no batch no longer print a shell error naming the fold script and its scratch file; they answer rc 0 and rc 1 with an empty stderr.
- `ctx run --diagnose` names its builtin filters by name alone, on one line as the module filters line does, and no longer prints the runtime's filters folder.
- `ctx unit refresh --help` and `-h` print its help table on stdout rc 0, as every other unit and lane verb does; it refused rc 1, taking the flag for a slug.
- The verb library labels a refusal `lane <verb>` only when the running script sits under the drawer's lane module scripts folder, so a workspace whose path holds a `lane/scripts` pair keeps the unit verbs' own labels.
- `ctx rhythm list` matches its answer tags on the tab, so a rhythm whose name begins with skipped or badname lists normally.

Commits in the range: 73d4fc3, e2bd179, 3dd5007, 7eae853, d2baf78 (the parameterized lane create); 797ffe1, f23c802, 180899a (the lane boundary, labels, and load receipt); 2669c35, 032198d, 9d7398f, be90bb3, f59c680, f97492e, fae91d4, 2237d0a (the rhythm module and the boot's rhythm steps); 1ef2b76, b3c358e, 85b66ad, e84af65, a7806ba, af708ef, f76f193 (ctx compose and ctx package); 187be5e, 19868f2, 1455f5e, 686e891, 663dbfd, 4947d8b, 0f48e01 (the lane# shape, ctx unit list, and the surface censuses); 7d07be5 (the warning only after a rc 0 answer); 26ecd38, 69d9d69, 83af80f, 652e3dc, 393613d, 8ec89c8, 599f791, cf0b5fe (the lane surface review fixes); 1ebedcc, 98e0d7f, db5ce65, 672d3dc (the rhythm review fixes); c78594b, 6f316a6, 9ad7309, a2c63ae (the compose and package review fixes); 35dfcd9, d7e2595, 40c8046, b50412d, 9415ecc, 02ca658, 3a8b85b, cb2b397 (the census review fixes); 12b117f, 8da4a09, 18785e8, 70718db, ae2a3d5 (the listing review fixes); dc191f6, a9d7a44, baf3103, 60eb303, bbfff09, 150cd9d, a11d6cc, 9ad69ba, 43ef677, 94ebbb0 (the prose review fixes); 2d02726, 4e33c5f, 11e25e1 (the reference review fixes); 071e615, ad8ced4 (the one line store refusal and storage-fts5 1.2.1); and the release commit.

## [0.69.0] - 2026-11-07

MINOR: the record's home moves to `.contexture/units`, gradually, and the drawer's paths keep one owner each. Every existing record keeps reading through the deprecated fallback root `.contexture/sessions`; a unit moves whole at its first write, inside the store's own write call, so a write stays one store call; `ctx unit migrate` sweeps the rest when the human chooses. `storage.health` probes the namespace it is given under one state table on both drivers, the docs guard reads every declared store root through the storage library, and a governance census holds the record root, the database name, and the lock literals to their owners. storage-fts5 1.2.0, docs-discipline 1.4.0.

### Breaking

- `storage.health` takes the namespace, required: `storage.health <namespace>`. A missing, extra, or malformed argument refuses rc 1 ERR_INVALID_ARGUMENT, an undeclared namespace rc 1 ERR_ENTITY_NOT_FOUND, a declaration the core cannot read rc 2 ERR_STORAGE_READ. The answer describes that namespace's store alone under one state table on both drivers; `ctx unit diagnose` passes `unit`. A custom driver adopts the argument. storage-fts5 1.2.0 and this base move together: with either one older, `ctx unit diagnose` reads storage health error until both are current.
- Changed health answers: fts5 reads ok with the store absent for a database holding no key of the namespace (it read degraded); posix reads error for an unreadable root (a new row) and reports the true presence when unwritable; presence counts the named namespace alone, the fallback root included; no detail names a folder.
- `store-data <namespace>` refuses a second argument rc 1, except the new `--with-fallback`. New forms for custom parsers: `store-data <namespace> --with-fallback` answers a declared fallback root as line 13 (an empty line when none) and the rules from line 14, and `store-data --list` answers every valid declaration, namespace TAB root, with a declared fallback root as a third column. The plain answer is unchanged.
- The record's root is `.contexture/units`; the unit module declares `.contexture/sessions` as its deprecated fallback root. An updating adopter whose ignore file names `.contexture/sessions/` adds the same line for `.contexture/units/` before the next write moves a unit (docs/adoption.md, Updating 9).
- A custom driver that maps a namespace root to files reads the new root alone from the plain store-data answer, so legacy units read as absent until it reads `--with-fallback`; a unit then moves at its first write only if the driver's own write path moves it, else through `ctx unit migrate` (when the driver declares `store.promote`) or by hand.
- The docs nudge's backlog file guard refuses a path inside any other module's store root; docs-discipline 1.4.0 pairs with a base whose library carries `store_roots`, and on an older base the file form refuses rc 2 naming the storage core.

### Added

- The gradual move: the posix store reads a namespace's root first, then its declared fallback root, the root's copy shadowing a key both hold; put and batch write the root; a delete removes the key from both. Its write path (put, delete, batch) moves the written key's top folder from the fallback to the root by one rename under the namespace lock it already holds, so a unit moves whole at its first landing write and `ctx unit record` still makes two reads and one batch; a folder both roots hold refuses the write rc 1 ERR_ENTITY_EXISTS naming the prefix. CLOSED units never move by a write.
- A run whose reads came from the fallback and that ends rc 0 prints once, after its answer: `WARNING: the record was read from its deprecated root; each unit moves at its next write, and ctx unit migrate --all moves the rest when the human chooses`. Every unit and lane verb relays it, audit, board, and diagnose among them. The deprecation window is open ended; a later release (the idea `legacy-sunset`) retires the fallback read, the move, and the sweep.
- `ctx unit migrate (<unit> ...|--all)`: the sweep for the units nobody writes, through the optional store token `store.promote` (the posix card declares store and store.promote; the resolver accepts it beside store, store.changelog, and search.schema). It prints `migrated: <n>`, is idempotent, stops at the first unit held in both roots, and under fts5 prints that nothing moves. The unit verb count is 22.
- The library's `store_roots` lists every declared store root (a fallback root on its own line); `fts5` namespace locks follow the posix lock folder rule.
- A governance drawer literal census (`tests/governance/drawer-literals.test.ts`) holds the storage core, the drivers, the engine, the composer, the package overlay, the module roots, and the test TypeScript to the drawer layout's owners; `tests/support/drawer.ts` is the tests' one reader of the record root, the database name, and the lock layout.

### Changed

- storage-fts5 1.1.0 to 1.2.0; docs-discipline 1.3.1 to 1.4.0 (manifest and docs module file together).
- The package installer refuses a package carrying `.contexture/units` or `.contexture/laws` as a core path.
- The fts5 database keeps its name, sessions.db, and never reads either posix root.
- The guides, the unit module and storage READMEs, and the corpus name the new root, the deprecated root, the move, the warning, and the sweep; the posix health detail no longer names the sessions directory.

### Fixed

- The posix driver no longer aborts a writer when USER is unset and the drawer's scratch folder is unwritable.

Commits in the range: 9ee51d8, 41b6c6c, 12c127f, 306319e (the drawer path owners); 4a8125f, 0ec6457 (the record root move); 31720a1 (the updating guide); 0d57f4d, 961572d (the move in the write path and the warning wording); and the release commit.

## [0.68.0] - 2026-11-07

MINOR: the generated law layer moves to the workspace root, and the shipped help, laws, and output say unit where they said session. The composed layer is now `AGENTS.generated.md` beside `AGENTS.md`, `AGENTS.workspace.md`, and `AGENTS.local.md`; the composer removes the layer an older composer left under `.contexture/laws/` at every boot, a temporary branch the idea `legacy-sunset` retires later. The unit and lane verbs, the laws, and the runtime messages name the unit, and the help lines that named the storage driver as the actor of a record operation name the unit module. docs-discipline 1.3.1.

### Breaking

- The generated law layer's path is `AGENTS.generated.md` at the workspace root, no longer `.contexture/laws/AGENTS.generated.md`. A standalone repository replaces its ignore line `.contexture/laws/AGENTS.generated.md` with `/AGENTS.generated.md`; a parent workspace that whitelists `.contexture/` drops its re-ignore line, since its deny by default line keeps a root file ignored; never whitelist an `AGENTS*.md` glob. Make the ignore edit after the update's compose has removed the legacy file (docs/adoption.md, Updating step 9).
- A harness entry point that is a copy of the old loader, rather than a symlink to `AGENTS.md`, still reads `.contexture/laws/AGENTS.generated.md`, which the first compose removes: it now stops at boot instead of booting on a stale layer. Refresh such copies, and any overlay, script, or tool text naming the old path.
- The composer's stderr lines changed: `compose: composed AGENTS.generated.md`, `compose: stale: AGENTS.generated.md`, and `compose: error: cannot write AGENTS.generated.md` (they named the old path); two are new: `compose: removed legacy .contexture/laws/AGENTS.generated.md`, and `compose: error: cannot remove the legacy .contexture/laws/AGENTS.generated.md, the root layer already written` (rc 2).
- The runtime messages say unit: `session-load` reads `unit-load`; `no sessions yet` reads `no units yet`; `no active sessions` reads `no active units`; `# === REF SESSION: <u> (READ-ONLY) ===` reads `# === REF UNIT: <u> (READ-ONLY) ===`; `the active session` reads `the active unit`; `ref sessions READ-ONLY` reads `ref units READ-ONLY`; `to read a reference session` reads `to read a reference unit`; `ERROR: no such session` reads `ERROR: no such unit`; `ERROR: ref session malformed` and `ERROR: duplicate ref session` read `ref unit`; `ERROR: session exists: unit <slug>` reads `ERROR: already exists: unit <slug>`; `ERROR: no unit references session: <u>` reads `ERROR: no unit references <u>`. A script matching the old text needs the new.
- The core law layout changed: `@layout` gains the `AGENTS.generated.md` line and names `.contexture/laws/` the law sources (core.md and the composer). An overlay that replaces `@layout` needs a re-check.

### Changed

- The composer's default mode, whether it rewrote the layer or found it current, removes a legacy `.contexture/laws/AGENTS.generated.md` (a symlink included) with one notice; `--check` never removes it. No fallback read of the old path: the compose rebuilds the layer from its sources.
- The shipped help, the laws, and the module laws name the unit where they named the session: `ctx unit audit` is the unit audit, `ctx unit diagnose` reads storage diagnostics: configuration, storage driver, and storage health, `ctx unit refs` takes `[<unit> ...]`, search, stamp, resolve, and the lane verbs speak of units; the laws read the active unit's live surfaces, the reference units (ref_sessions) read only, every journal entry of the unit, cross-unit, the unit audit, and the subagent's journal and report staying in the unit's record. The kept names stay by ruling: the on-disk root `.contexture/sessions` and `sessions.db`, the `session.*` record operation names, the search entity type `session`, the config keys `session.storage.driver` and `session.storage.database`, the stored field `ref_sessions`, and the `ctx session retired` message. diagnose's posix health detail still names the sessions directory until the storage probe is redesigned.
- Fifteen help lines that said the storage driver composes the slug, injects the anchor, or holds the record rules name the unit module, which does that work under contract 3.
- docs-discipline 1.3.0 to 1.3.1, its manifest and its docs module file together: its laws say retrieval at boot and composed into the generated layer.
- The update and dev loop steps (docs/adoption.md) run the compose right after the copy and the hand deletes, then the payload compare without `-x`: a leftover legacy layer prints as a missed delete, and the live version detection reads the one line `Only in .contexture/laws: AGENTS.generated.md`, on a drawer composed before v0.68.0, as the legacy layer. tests/README.md names the golden regeneration command.
- The guides, the onboarding, and the README tree seat the generated layer at the root, call `.contexture/laws/` the law sources, and say unit where they said session in concept wording.

### Fixed

- A root `AGENTS.generated.md` that is a symbolic link reads as stale under `--check`, and a default run replaces it with the composed file before the legacy cleanup, so the cleanup never leaves the root layer dangling after an rc 0 run.
- The guides no longer call the laws folder the law layer or say everything but the overlays lives in the drawer, and the adoption update step says live units.

Commits in the range: 0048f28 (the generated layer at the root); 241960a, 263b10b (the unit wording and the runtime messages); d57da32, bbc6745, e8e7748 (the review fixes); and the release commit.

## [0.67.0] - 2026-11-07

MINOR: false results ended in both plugins, opaque corpus ids, and rule id coverage. docs-discipline 1.3.0 reads paths git quotes, never lets an untracked corpus read fresh, stages its scratch in the swept per-verb root, previews ctx docs remove, ranks owners across repos, and gives a new corpus entry an opaque id that is never handed out again; ast-doc-graph 1.2.0 drops the rows of removed files, records its repository and source roots, and ends six silent failures; the pre-release set reports every corpus contract rule id covered by a test or reasoned in a tracked table.

### Added

- `ctx docs remove --dry-run` prints the doc it would delete, whole, and writes nothing, as every other write verb previews.
- A new corpus entry's id (a contract rule, a responsibility, a pitfall, a caveat), minted by `ctx docs entry`, `ctx docs pitfall`, or `ctx docs ids`, is opaque: `<slug>-<letter>-<five lowercase letters or digits>` (for example `docs-module-r-k3x9m`), drawn again while the doc holds it, so a removed id is never handed out as the next number. Every numbered id stays valid as written, and `--id` names an id in either form; any other shape refuses naming both. `DOCS_ID_SEED=<whole number>` fixes the draw, the same on every awk; any other value draws as seed 0; unset, each verb call seeds from the system's random device (the process id beside the clock where it cannot be read).
- `ctx ast-doc-graph index --delta --no-reconcile` re-indexes only the named or newer files, keeping the delta's root checks and refusals but removing and adding no other file.
- The pre-release set ends with a rule id coverage report that never fails the run (`tests/support/rules.ts`): per corpus doc, how many contract rule ids a passed test cites in its own title and how many the tracked reasons table (`tests/support/rule-reasons.txt`) explains, every uncovered id, the responsibility and pitfall ids apart, and every unknown id, off-form citation, describe-level citation, and stale or orphan reason; it reads the corpus through `ctx docs query`, reads partial when the run is not the whole set, and skips naming the need where no live drawer exists (`VITEST_CORPUS_ROOT` names another workspace root). Test titles cite the ids they prove in one canonical form, the full id in brackets on the asserting test, numbered or opaque.
- The corpus states contracts the code already kept: the resolver's driver-name precedence, the library's resolver lookup, the store search's exact rule, a store driver call's temps removed on an interrupt (`the-engine-r25` to `the-engine-r28`), the fts5 store's database placement (`plugins-r12`), the rhythm index (`modules-r20`), and the unit's own close and reopen moves (`the-record-r21`); two new structural docs, `docs-module` and `ast-doc-graph`, home their plugins' contracts.
- storage-fts5 tests for the four `storage.health` branches no test reached and for the `storage.database` key placing the store; ast-doc-graph tests for a repository under folders named like the exclusions, and for the TypeScript and docs id lines of both forms.

### Changed

- docs-discipline 1.2.0 to 1.3.0, its manifest and its docs module file together; ast-doc-graph 1.1.0 to 1.2.0.
- Under the files driver an untracked corpus doc rides no gate delta, whether git ignores it or not: a file only untracked docs claim reads UNTRACKED CLAIMANT with the process-owned clean, and a file a tracked doc also claims reads that doc's freshness, so a new doc not yet staged beside a tracked claimant that did not ride reads STALE DOC until git tracks it; the `--since` notice counts the docs git does not track.
- A docs verb dispatched by ctx stages its scratch inside the per-verb root `CTX_SCRATCH_ROOT`, the gate's matrix among them, so a verb killed by SIGKILL leaves nothing the next dispatch does not sweep.
- `ctx docs query --file` reads a workspace doc's paths as given, as the check does (a `workspace/` or `projects/workspace/` prefix is no longer stripped for the workspace repo's docs); without a repo argument it ranks claimants of different repos with the stripped prefix counted, so a child repository's exact source beats a workspace glob.
- An ast-doc-graph full index rebuilds the graph from the files it discovers in its one transaction, records every discovered file, and records the graph's repository root and source scan root (a new `graph_meta` table); the query scans the recorded roots wherever the database lives; a delta whose `--repo-root`, or a given `--src-dir`, differs refuses rc 1 naming both, and a delta scans the recorded source root, so a graph built with `--src-dir` never widens. A repository moved or copied with its graph needs a full index: its deltas refuse, and a moved one's queries print one notice naming the absent root. A graph indexed by an earlier release keeps a guessed root, and its query's refresh removes no file and prints one notice naming the full index that records the root.
- Every ast-doc-graph delta reconciles the graph with the disk first: a file the graph indexed that the disk no longer has is removed, and a discovered file the graph does not hold is added when a folder the graph already covers holds it. Each documentation unit is recorded under its markdown file with a DEFINES edge, so stats count one more DEFINES per unit.
- The full ast-doc-graph docs walk of a repository with no docs folder reads its root outside the index's exclusion folders.
- The guides and the corpus state the docs check's freshness blanket as it runs (an architecture or overview slug freshens its own repo, any riding workspace doc every repo), the gate's quotePath scope, and the coverage report's counts; the reasons table explains `modules-r17`.

### Fixed

- `ctx docs check` and every gate form read a path git quotes (a non-ASCII byte, a quote, a backslash) as its bytes instead of passing it ungoverned; a path holding a control character is left out and named in a `[GATE NOTICE]` or `[CHECK NOTICE]` line.
- An untracked files-driver corpus that git does not ignore no longer reads FRESH under the gate.
- The `ctx docs write` help no longer promises a warning for a header field past line 12; it names the header lines the check and the query read.
- A negative or non-finite `DOCS_ID_SEED` no longer sticks the id draw on one token, where `ctx docs ids` or a doc's second new entry never returned.
- ast-doc-graph: a rule or pitfall block before any `@doc` line is skipped with one warning naming the file instead of failing the whole index; a repository with no markdown indexes rc 0; an unknown query subcommand refuses rc 1 naming the known ones; a failed inline delta prints one stderr line and the query answers from the graph as it stands; a full index without `--clean` no longer repeats search rows, nor does one run for a name a source declares twice; the sqlite3 fallback delta keeps the derived edges, applies the schema, and reads a graph past 1 MB whole; a deleted, renamed, or moved source or corpus doc no longer keeps its rows until `--clean`, a doc whose header slug differs from its file name included; a delta removing or adding thousands of files no longer fails on the command line length; a database kept outside its repository no longer loses rows through the query's refresh.
- The ast-doc-graph README names bash among the needs, says the opaque id line is skipped like the numbered one, and its walk and pilot outputs count the per-unit DEFINES edges; the docs-discipline README walk stages the storage core, so its commands run as written; the storage-fts5 README's schema test row names its tests; the resolver's planted card test rows each name their card and call.

Commits in the range: 40ed1f4, 0a4c11f (the guides); 7ed68a6, 06a7c9d, 30f8bc8, a5dd84a, e1b946f, e1a5dc1, d46cf09, f9c853d, 67fe023, f3bebcd, e83d05a, f10405f, 812e064, b170258, 1411472, 1533919, 4b20fec, d691c59 (the coverage report and the tags); 7317d28, 43eb958, b52808b, 20d8d27, 9423543, 7066dcb, cc075da (the docs-discipline fixes); 8a6c6c8, fa670e6, a6dc4ea, 4f6ea3b, 40c7085 (the workspace strip and the opaque ids); f55dbd5, 2bb5db8, 9140856, bdf72c5, 0fd962a, 88e0a12, 360ee2a, 35b6740, 0b77066 (the ast-doc-graph fixes and the removed files); 3ca274c, ea8b015, fbc4c1f, e24883e (the plugin tags); 466e1f7, 17058d3, c1a3707, 23b9acb, 3a6797a (the residue); fc6749b, 79248d6, 96a73bb, 3c5b5f2, becc496, 2c9bac9, ebcb035, abe52eb, 2a0853f, 3b401b1, b75913e (the two reviews); 401779f, 4fa736d, 4a6a3f9, 801f706, e256cad (the recorded roots and the two new rules); f3afd1f, 867be44, 3097739, f0ce81d, a5cd1ab (the last review); and the release commit.

## [0.66.0] - 2026-11-06

MINOR: the ast-doc-graph cluster, ast-doc-graph 1.1.0. The index runs only inside a contexture drawer and stages its streams in one per-run folder removed at exit, `AST_DOC_GRAPH_TYPESCRIPT` names the TypeScript compiler API the extractor parses with and an index with none reachable refuses naming each typescript it found, the entry points run as the script by their real paths, and the caller's PATH chooses the runner.

### Added

- `AST_DOC_GRAPH_TYPESCRIPT` names the TypeScript compiler API ast-doc-graph parses with: a TypeScript 5 or 6 package folder or its entry file. When set it is the only candidate, and one that loads no package or carries no compiler API refuses naming the variable and what it found. Unset (or empty), the extractor takes its own Node resolution, then the target repository's. The extractor stays on a TypeScript 5 or 6 compiler API whatever the target uses, since TypeScript 7 exposes none, and the plugin installs none.
- The ast-doc-graph tests prove the compiler API resolution over a committed TypeScript 7 stub package, with no install. A static census guards the module tree: no PATH edit (an appended PATH included), no sibling-project glob, no pre-extension-root path, no absolute /tmp path (a shell default-value fallback such as `${TMPDIR:-/tmp}` included), each rule null-checked by its planted lines.

### Changed

- ast-doc-graph 1.0.1 to 1.1.0.
- The ast-doc-graph index runs only inside a contexture drawer: the workspace when ctx dispatches it (`CTX_ROOT`, which must hold a `.contexture` folder), else a repository root that holds its own `.contexture` folder. Outside one it refuses rc 1 before any write. A direct run against a repository without `.contexture` now refuses where it used to stage under the system temp folder (a behavior change). The query verb keeps reading any database it is given, and its micro-sync still discards the index's exit code.
- The index stages its intermediate streams in one per-run folder inside the verb's scratch (`CTX_SCRATCH_ROOT`, never the root itself, else the drawer's `.contexture/tmp`), removed at exit, hangup, interrupt, and termination; a folder it cannot make refuses rc 2. The persistent `.contexture/cache/ast-doc-graph` folder and its ignore rule are gone. `--cache-dir` stays a caller-owned folder, emptied only by `--clean`.
- The launchers no longer prepend `/opt/homebrew/bin` to PATH, so the caller's PATH chooses node. They extend the caller's `NODE_OPTIONS` instead of replacing it, and silence Node's experimental warning on the type-stripping run.
- With no TypeScript compiler API reachable, the index refuses rc 1 naming each typescript it found with its version and path, the variable, and the need for a TypeScript 5 or 6, and writes nothing. Before, the message listed every target file with a stack.

### Fixed

- The ast-doc-graph entry points run as the script when the module is reached through a symbolic link or sits under a folder whose name holds a space or a non-ASCII character. Before, the index exited rc 0 with no output and an empty graph.db.
- A full ast-doc-graph index makes the database folder only when the loader runs, so a refusal or failure before it (no compiler API, no runner) leaves a `--db` inside an absent folder unmade; a delta on an absent database refuses without making its folder.
- The ast-doc-graph module names its extension root: the extractor header comments and the spec's invariant, and the loader's working-folder schema fallback is gone.
- The launchers drop a sibling-project tsx probe whose quoted glob never expanded.

Commits in the range: 0f7318e (the extension root, ast-doc-graph 1.1.0), 1347fc4 (the sibling probe), d578f62 (the real-path entry guard), 099f8e7 (the caller's PATH, NODE_OPTIONS), 53da21c (the drawer and the per-run scratch), a2170e6 (AST_DOC_GRAPH_TYPESCRIPT and the refusal), 150a35a (the drawer tmp made when absent), e374e38 (the census reads an appended PATH and a default-value /tmp fallback), 6e67b2f (the database folder made only when the loader runs), 88fd725 (the in-process refusal names its need), 43f36ca (the module README paragraph rewrapped), and the release commit.

## [0.65.0] - 2026-11-06

MINOR: the docs-discipline cluster, docs-discipline 1.2.0. The close gate proves a committed range and names the limits of its delta, the check governs awk engines and shebang scripts, anchors its doc touch, and reads every dead source, the owner lookup names the most specific owner by the check's own glob rule, `ctx docs entry` sets a component's kind, and a single-module package's module version is held to its manifest's.

### Added

- `ctx docs gate --since=<rev>`: the close gate proves a committed range: the workspace root's repository from `<rev>` to the working tree plus its untracked files, the child repositories keeping their working delta, and the corpus half by driver (the same git delta for a tracked corpus, `ctx docs changes --since=<rev>` under a store driver). It joins the default form alone; an unknown revision, an empty one, another argument beside it, or a root outside a repository with a commit refuses rc 1.
- The gate names the limits of its delta in `[GATE NOTICE]` lines on stderr: an empty delta on a clean tree (pointing at `--since`), an empty range, the child repositories `--since` leaves on their working delta, and a files-driver corpus that git ignores under `--since`; stdout and the exit code stay the check's.
- `ctx docs check` and `ctx docs gate` govern awk engines (`.awk` joins the code extensions) and every extensionless script whose first line is a shebang (`#!`), read by the verb over its staged delta under the workspace root, never by the engine. An extensionless file without a shebang stays out, and a path the verb does not read (deleted, absent, a folder such as a submodule or an embedded repository's `<dir>/` line, a symbolic link) is governed only when a header source lists it exactly. A delta that read CLEAN can now read UNCOVERED or STALE DOC for such scripts: a wider governed set for every adopter.
- The docs-discipline flag collision check (`tests/flag-collision.awk`): every grammar field named like a value control stays settable through each field verb that does not take that control, the by-design id pairs of `entry` and `pitfall` allowed, null-checked by four plants.
- The governance single-module lockstep: a catalog package whose manifest declares one module part, and whose module file carries a version line, holds the two versions equal; a versionless module file is exempt.

### Changed

- docs-discipline 1.1.1 to 1.2.0, its manifest and its docs module file together.
- `ctx docs query --file` names the most specific owner by the check's own glob rule: a doc claims the path when a header source equals it or matches it as a glob (the substring and raw-prefix matches are gone, so a path that merely holds a source has no owner), and among several claimants the answer is the doc whose best claiming source has the longest literal part before its first wildcard, then the fewest wildcards, then the earlier doc in corpus order; the answer's shape and exit codes are unchanged.
- The check and query engines share one header-source glob definition (the docs module's `docs-glob.awk`), loaded ahead of either engine; the check verb runs its engine on the awk the PATH names instead of the engine's `/usr/bin/awk` shebang. The check verb and every gate form stage their delta in the module scratch and the engine reads it by name, never from its own stdin.
- A value control flag a field verb does not take is read as a field flag: on `ctx docs entry`, `header`, `new`, `pitfall`, and `rule`, any of `--after`, `--id`, `--kind`, `--old`, `--new`, `--count`, and `--stdin` the verb does not take (such as `header --kind`, `header --stdin`, `new --id`, `rule --id`) now refuses through the edit engine as an unknown field (`ERR_SCHEMA_VIOLATION`) instead of an unknown option (`ERR_INVALID_ARGUMENT`), rc 1 either way.
- The files-driver wording: git carries the corpus only where the workspace tracks it (the gate and changes help, the changes refusal, the docs-drift rhythm, the plugin README, and the conventions seed's docs/drift anti).
- The ownership limits of a clean check (glob coverage over the header sources, the files-driver blanket) documented in the docs module README, the plugin README's Limits, and the close gate step; the check's output unchanged.

### Fixed

- `ctx docs entry` sets a components entry's kind through `--kind`, on a new component and an existing one (it refused as an unknown option, so a component kind needed `--stdin=kind`); `ctx docs new` keeps `--kind` as the doc kind.
- `ctx docs check` counts a doc touch only at the corpus logical address `docs/<repo>/<slug>.md` at the start of a delta path: a code path that merely ends in that shape (a package seed, a test sample, a child repository's own guide under its prefix) no longer reads FRESH under a store's change log nor triggers the files-driver workspace blanket (a verdict change).
- `ctx docs check` reads a deleted file's dead source from every source of its doc: a file listed exactly after a broader glob of the same doc (sources `[src/**, src/old.sh]`) read no DEAD SOURCE, so a doc that rode the delta while still listing the deleted file read CLEAN rc 0 (a verdict change).
- Two guide sentences: the plugin anatomy's overlay fragment line no longer calls them seeds, and the golden regeneration names the release version stamp, which no plugin bump moves.

Commits in the range: c80afce (ctx docs entry --kind, docs-discipline 1.2.0), db5fb57 (the single-module lockstep, two guide sentences), b1d2f87 (gate --since, the staged delta, the gate notices), c9aad8e (the anchored doc touch), f7c6720 (the governed set: awk and shebang scripts), 4041c7f (the owner rule and docs-glob.awk), 10ec357 (every source reads a dead source), 0bac05f (a symbolic link is never vouched), 6a79d31 (the ignored-corpus count no longer overwrites --count), and the release commit.

## [0.64.2] - 2026-11-06

PATCH: the plugin version rule. A release that changes a plugin's payload now bumps that plugin's manifest version, a governance check holds the rule over the staged payload, and the three plugins whose payloads moved without a bump catch up.

### Added

- The governance plugin-versions check (`tests/governance/plugin-versions.test.ts`). It reads the index against the nearest release tag: a plugin whose version is unchanged reads red, naming the plugin, the tag that first shipped that version, and the changed paths, when its payload differs from that tag. The payload is its `.contexture` tree plus every literal package-root path its payload scripts read (the part hooks and every script they run). A changed version must be a greater x.y.z. The release that first shipped a version is found by the version line's value, so a touch that keeps the value moves nothing, and the version line is read as the installer reads it. The check runs in every governance run; a shallow clone, or no reachable release tag, skips it naming the need and fails the pre-release set. It is null-checked by a package root census with planted lines and by a sandbox repository walking the ship breath states.

### Changed

- storage-fts5 1.0.0 to 1.1.0: its payload changed in v0.61.0 (the contract 3 store-only card and fts5 schema 5, the break that release named, held to MINOR), v0.63.0, v0.64.0, and v0.64.1 while its manifest stayed 1.0.0.
- ast-doc-graph 1.0.0 to 1.0.1: its payload changed in v0.60.1 and v0.64.0 (the discovery exclusions fix, the CLI guard refactor, the module README) while its manifest stayed 1.0.0.
- docs-discipline 1.1.0 to 1.1.1, the manifest and the docs module file together: the docs module README changed in v0.64.0.
- A release that changes a plugin's payload (its installed `.contexture` tree, plus any package-root file a part hook applies at install) bumps that plugin's manifest version by the version rule: `AGENTS.workspace.md` gains the @git plugin versions clause, and `docs/plugins.md`, `docs/modules.md`, the `README.md` dev loop, and `tests/README.md` state the rule.
- `docs/adoption.md` Updating gains a package step: compare each install record's version with the target catalog manifest's, and refresh and re-install a package whose version moved, on the human's go.
- The changed-files map selects the governance project for a plugin manifest or payload change, so `bun run test:changed` runs the version check.
- The governance git and repository top helpers move into the shared walk helpers.

### Fixed

- `docs/plugins.md` and `docs/modules.md` said the docs conventions seed never installs; the docs module's install part hook writes it into a corpus that holds no conventions doc on a first install, and the guides now say so.

The storage-fts5 bump that v0.64.1 deferred lands here, with the rule and the check that enforce it.

Commits in the range: 13eae5e (the governance git helpers move), 0eaf15d (the plugin versions check, red on three plugins), 5c5f139 (the three bumps), 75331c2 (a plugin payload change selects governance), 736b4fc (the guides: the version rule, the adopter's package step, the seed), 52bd8c3 (the @git plugin versions clause), 45f826a (a read behind the empty default guard is counted), 5a4c100 (the census reads every payload script), a27ca04 (a touch of the version line keeps its first release), da5befd (the version line read as the installer reads it), and the release commit.

## [0.64.1] - 2026-11-06

PATCH: storage correctness and the guides as built. Storage writes that answered success on a failed scratch write now refuse, an interrupted store call leaves no scratch, the resolver refuses a missing driver whatever its cache holds, and the engine guide describes the storage contract as it is built.

### Fixed

- A batch whose manifest append failed after its first action answered rc 0 and counted every action while it committed only the first, on posix and fts5. The same unchecked writes into a call's fresh scratch let a posix batch lose an undo step, `session.create` overwrite an existing unit, `task.add` write a backlog holding only the new task, a write lose a line of its batch payload, and `store.list` answer short, each at rc 0. Every such write in the unit data script and both drivers now goes through a checked, silent helper (`scratch_new` and `scratch_add` in the drivers, `u_new` and `u_put` in the data script) and refuses rc 2 `ERR_STORAGE_WRITE`; the fts5 transaction scripts are built as one checked chain, so none reaches sqlite3 without its `COMMIT`, and fts5 `store.get` refuses a short value write.
- A batch value or payload that cannot be staged refuses rc 2 `ERR_STORAGE_WRITE` naming its action and key, where it refused rc 1 as "malformed base64 value"; bad base64 still refuses rc 1 `ERR_INVALID_ARGUMENT`.
- The resolver's `require` and `has` refuse a missing driver rc 2 `ERR_DRIVER_NOT_FOUND` even with a fresh cached verdict: the driver is checked before the cache, and a verdict stands only while its driver exists, since a bash or ksh sh reads `-nt` as true against a missing file.
- An interrupted store call (HUP, INT, TERM) removes its store-data scratch file and every read's temp files (posix list, scan, and search; fts5 list), as the engine guide states.
- A write into a folder the call just made fails with its one refusal line: the lock pid writes, `batch_decode`, the fts5 listings, and the data script's payload, sizes, and lane document writes take the grouped redirect form, so the shell's own redirect error no longer prints beside the refusal.

### Changed

- `docs/the-engine.md` describes contract 3 as built (the unit module implements the record rules once over the store; the drivers are store-only), states that the lock wait is a poll, not a queue, with the 60 s bound accepted, and that a cached verdict holds only while its driver exists; `README.md`'s command rows and `docs/units-and-lanes.md` follow, and the storage-fts5 READMEs and the driver's store comment describe schema 5.
- `docs/adoption.md` deletes the payload paths removed since the version actually live in the drawer, not since the previous tag, and names the payload compare (one `diff -rq` of `base/.contexture` against the drawer).
- The K and KR-c storage fault tests signal only once their writer is seen reading the planted lock (`catShim`), and new store-faults and storage-faults cases plant each failure above, each red on the code before it.
- The fold verb runs its seven awk programs from `lib/fold-*.awk` in the unit module instead of writing them into scratch on every call: the same programs byte for byte, seven processes and scratch writes fewer per call, and a fold call answers as before.

The storage-fts5 payload changed in this range (its driver, its READMEs) while its manifest stays 1.0.0; the rule that a payload change bumps the manifest lands with the docs-plugins unit's plugin-version-bumps.

Commits in the range: a55eb51 (the lock wait is a poll, not a queue), f527db0 (K and KR-c wait on the planted lock), 7ee4ca1 (the apply deletes from the live version; the payload compare), de8a103 (the engine guide states contract 3 as built), 0a323ec (the fts5 README and the lane guide follow), b27da11 (a fresh folder write keeps its one refusal line), 8872853 (an interrupted call removes its store-data file), a6cd5a6 (the fts5 driver comment for schema 5), 01981fb (a failed scratch write refuses rc 2), 0ceee65 (an unstageable value refuses as a write), aab21d4 (require and has refuse a missing driver), ad5de20 (an interrupted read removes its temps), ed08798 (the fold programs from lib files), and the release commit.

## [0.64.0] - 2026-11-06

MINOR: the test suite on vitest. The shell suites and their runners give way to TypeScript vitest projects under `tests/` that run the shipped product as child processes (sh and the system awk, staged from `base/` and `plugins/` exactly as shipped), one project per area plus each plugin's own project by convention; the logic is tested once, on posix, each driver once, against the store contract, and the files run in parallel. The release gate falls from 1897 s (the v0.62.0 shell gate) to 152 s (1509 tests passed, 5 skipped, on 8 workers), the unit module area runs in 97 s, and one test in seconds. The port and its measurements proved seven product defects, fixed here, and the lock wait is sized by measurement. Naming the breaks: every shell suite and both runners (`tests/run.sh`, `tests/fast.sh`) are gone, with `GATE_JOBS` and `GATE_SUITE_TIMEOUT`; the release gate is `bun run test:prerelease` from `tests/`, which needs the dev dependencies under `tests/` (vitest, typescript, @types/node, installed with bun from the tracked `bun.lock`: `bun install --frozen-lockfile`) and sqlite3 with FTS5; a writer facing a live lock holder now waits a 60 s floor before `ERR_STORAGE_LOCKED` (5 s before), and the refusal reads `(60 s timeout)`; the unit lock folder moves from `.contexture/tmp/locks/<unit>.lock` to `.contexture/tmp/locks/unit/<unit>.lock`, so a stale old-layout lock folder is ignored and can be removed by hand, and a writer of an earlier version and one of this version do not exclude each other on the same unit while both run at once. The release also repairs the loader and core law headers that v0.63.0 left at v0.62.0.

### Added

- The test tooling in `tests/`: `package.json` (bun as the installer, `bun.lock` tracked, `node_modules/` ignored; the exact dev dependencies vitest 5.1.0, typescript 6.0.3, and @types/node 22.20.5), `vitest.config.mts` (one project per area, every `plugins/<name>/tests/` holding a test file a project of its own by convention, `maxWorkers` at half the cores by measurement, 16 tests in flight per file), `tsconfig.json` (`bun run typecheck`), and the shared helpers in `tests/support/` (the stage of `base/` as shipped, copy-only seeded snapshots and lazy snapshot chains, every child with an explicit env as its own process group stopped whole at its own timeout and swept after each file, the record and verb wires, the lock plants with the sleep shim, the store and fuzz helpers, the changed-files map, the timing reporter).
- The projects: `harness`, `drivers`, `unit-record`, `unit-verbs`, `governance`, `filters`, `engine`, `hooks`, `laws`, `packages`, `base`, `integration`, the pre-release `sqlite-smoke`, and the plugin projects `storage-fts5`, `toolchain-filters`, `docs-discipline`, and `ast-doc-graph`: 1,514 tests in the release gate.
- The commands: `bun run test` (every default project), `bun run test:prerelease` (the release gate: every project, sqlite3 with FTS5 required, so no fts5 case, fault, fuzz, or bypass guard can skip), `bun run test:<project>`, the area groups `test:unit`, `test:drivers`, and `test:drivers:posix`, `bun run test:changed [<ref>]` (the projects the changed paths select through a static path table the governance `areas` census keeps complete), and one test by name (`bun run test:<project> <file> -t "<name>"`).
- The run reports: `tests/.reports/last.json` (every test's state, duration, and failure) and `timing.json`, with a timing summary at the end of each run.
- The guards that replace the dual-driver logic runs: the governance store-bypass check (every module line naming the store, a driver, the resolver's answer, sqlite3, or the lock area matches an exact allow-list; three planted bypasses read red) and the pre-release SQLite smoke set (every command family under fts5; a planted bypassing verb reads red).
- New proofs the shell suites never ran: the verb-to-store chain once per artifact family; the record engine held equal to the data script for all 36 dispatched functions; the differential store fuzzer's unit-shaped profile; the lock waits through the shipped scripts; the hook runner's direct seam; the ast-doc-graph pipeline, delta, and freshness check over a committed mini repository; the 13 toolchain filter cases a stale path skipped; a planted failure and a planted hang ending red with no process left behind.
- `tests/README.md` "Writing a test": the shape to start from and the rules the port settled.

### Changed

- The lock wait: the unit lock and both drivers' namespace locks wait 600 polls 0.1 s apart (60 s of sleep; a sleep that refuses a fraction sleeps 1 s and counts ten polls) before refusing a live holder, sized so six writers queued on a 1 MB unit under load still land (the shipped 5 s refused writers in 8 of 8 measured queue runs); the refusal message reads `(60 s timeout)`.
- The unit lock folder moves from `.contexture/tmp/locks/<unit>.lock` to `.contexture/tmp/locks/unit/<unit>.lock`, beside the drivers' flat `store-<namespace>.lock` entries, so the unit locks and the namespace locks never share a folder whatever a unit is named. Naming the break: a stale old-layout lock folder a killed writer of an earlier version left is ignored and can be removed by hand, and a writer of an earlier version and one of this version do not exclude each other on the same unit while both run at once.
- The workspace overlay's test-scope and ship breath, `tests/README.md`, `README.md`, `docs/modules.md`, `docs/plugins.md`, `docs/the-engine.md`, and the storage core, docs-discipline, and storage-fts5 READMEs describe the vitest suite: the change's project during the work, the release gate before a release only, no container matrix (the governance awk census guards the portability trap), and no stale suite, runner, case id, or session wording on their test text.
- ast-doc-graph's loader and TypeScript extractor run their command line only when executed as the script, so the tests import them.

### Removed

- Every shell suite: `tests/` (filter, ctx, hook, law, module, governance, session, unit-data, record-audit, storage-compliance, store-compliance, store-fuzz, record-fuzz, base-only, and the unrunnable v0.54 parity harness), `tests/lib/` (`content.awk`, `jflat.awk`, `plant.sh`; `awkrepl.awk` moves to `tests/governance/`), the worked package's `run.sh`, and the plugin suites (storage-fts5's five, docs-discipline's six, ast-doc-graph's three, its pilot harness among them).
- The runners `tests/run.sh` and `tests/fast.sh` with `GATE_JOBS`, `GATE_SUITE_TIMEOUT`, the fixed print order, and the exit 77 skip.

### Fixed

- A writer interrupted while it waits for a namespace lock no longer removes the live holder's lock: `store_lock` keeps the path local and marks the lock held only once `mkdir` takes it (both drivers), so mutual exclusion holds.
- A batch payload line refused inside an action (a duplicate `key=`, `head=`, or `value_b64=` line, or an unknown payload line) names its 1-based action, where it named the one before (both drivers).
- The driver resolver adds nothing to stderr when its verdict folder is unwritable, at dispatch and at require.
- A failed package install rolls back the folders it made (and only those), the staging failures included, so a failed fresh install leaves the tree as it found it and its retry proceeds.
- ast-doc-graph's discovery and freshness check match their exclusions inside the scanned root only, so a repository under a `.contexture`, `tests`, or `.worktrees` folder indexes its TypeScript and sees its dirty files.
- A unit named `store-unit` can be written: its unit lock was the record store's namespace lock, so every write waited out the 60 s and refused `ERR_STORAGE_LOCKED`; a unit named after another namespace lock (`store-docs`) no longer contends with that namespace's writes.
- `storage.health` (`ctx unit diagnose`) reports `locked` on either driver while a write holds the record store lock: the posix driver read a path nothing creates, and the fts5 driver had no locked state.

Commits in the range: 3829789 (the test tooling package), 2f16ab0 (the projects config and the per-run sandbox root), fae3071 (the shared helpers), 4313c06 (one smoke test per invocation kind), c9b5805 (the harness guide), f59c574 (the 60 s lock wait in all three locks), 6103e12 (the lock wait helpers and the drivers project), 451ff4a (the storage-fts5 project home and its resolution probe), 3cb63b0 (the storage core readers), d3a1a54 (the store contract over both drivers), 427c2f8 (the posix store on disk and the write faults), 1746569 (the namespace lock hold, release, and interrupts), 64392b1 (the storage-fts5 suite ported), 02eb81f (the differential store fuzzer with its unit-shaped profile), 86edbac (the v0.54 parity harness retired), 73835a9 (the driver projects guide), b50589f (the module-facing library), 0533a32 (the driver resolver), 1850dc0 (the posix-only driver filter), e60b34f (the store suites retired, the runners re-pointed), 153aa76 (the namespace lock waiter fix), c17f54d (its pin flipped), e8a3ef6 (the batch action number fix), bb8f239 (its pins flipped), 520d5d9 (the resolver stderr fix), a0a1c9a (its pin flipped and the require verdict write), 505cb2d (the record compliance cases over the snapshot chain), 8b7fa47 (the engine, the views, the search rules, the audit classes, and the module data cases), 9aa8893 (the chain built through the engine), 18ae512 (the record suites retired), 72a68ee (the record project order), 2114f51 (the unit-verbs project), 2b16316 (the task and record families), 81fad12 (the finding, search, and resolve families), db64501 (the lane family), fb342ab (the load, board and audit, refresh, and standalone families), 4d3a0d6 (diagnose, units, refs-to, and the input matrices), b572973 (the REF shape and byte rules), a7dd521 (the quote rule, the messages, the layout, and the static checks), 14782a9 (the fold protocol), 7e47e9b (the fold surface and its defect classes), 19fc795 (the storage faults and the concurrency probe), b10d45c (the session suite retired), 6a06ec7 (the governance checks and the store-bypass check), 3f72a80 (the filter pairs and mechanics), 0e38205 (the law compose tests), c6e03e4 (the package overlay tests and the worked example), ce7f4c2 (the engine and hook tests), 5cc42ca (one sandbox per capture test), d9e7d3c (the governance shell suite retired), 01608a2 (typescript 6.0.3), 32c1aa3 (the docs engines alone), 3e32d18 (the docs verbs end to end), fbc3ad9 (the docs store mode cases on fts5), ad75148 (the docs shell suites retired), 068dfd6 (the ast-doc-graph script guards), 3538237 (the ast-doc-graph discovery fix), 65b7079 (the ast-doc-graph project), 77dc007 (the ast-doc-graph shell suites retired), 482e604 (the installer rollback folders fix), edabcc1 (the base project), 2e1a7db (the integration project), a96dda9 (the SQLite smoke set), 0ed0dac (the base-only suite retired), 3501d77 (the process-group stop of a hung call), 5461854 (the package commands replace the shell runners), f40d013 (the worker count, the timeouts, and the lock-wait bound by measurement), 19ca082 (the store-locks TERM timing), 9524194 (the KR-a holder killed with its group), 8491880 (the awk census exclusions inside the repository), 1de583f (the test writing guide), f83a558 (the guides' stale suite and session wording), 333e35c (the unit locks in their own folder), c463c81 (the two lock families proven apart), 46f9d42 (the storage health locked state on both drivers), 9f24ea3 (its proof), and the release commit.

## [0.63.0] - 2026-11-05

MINOR: the derived pointer and the record speed. The state stops storing `next_action`: the next move derives from the backlog at presentation time, so it cannot go stale. `ctx unit active` shows the derived next task per unit without a journal scan. Naming the break: the State artifact loses `next_action`, `ctx unit next` and `task start --pointer` retire, and the audit's IN_PROGRESS-cross-check drops.

### Added

- The derived next: `ctx unit active` prints `next: <slug> (<status>)` per ACTIVE unit (the first exact IN_PROGRESS, else the first non-DONE task in backlog order), with the no-work forms (`next: none (empty backlog)`, `next: none (no open task)`) and the missing-backlog warning; the load states the reader rule and adds nothing, since the backlog page carries the tasks.
- `session.active`: one data-script call over every state plus each ACTIVE unit's backlog; no journal fetch.

### Changed

- The record speed: the batch parser's quadratic long-line strips (the suffix CR strip 12.4 s on a 1.24 MB line) become a quote-strip, `record` 15.1 s to 1.4 s (10.9x) byte-identical, 5/5 concurrent records rc0; the store-data reader runs in two awk passes (15x, 62/62 differential fixtures); engine discovery reads headers in-process (about 69 percent off a missing-module call); `store.list` escapes its keys in one pass (16x).
- `ctx unit active`: 76 s to 9.5 s; `last_event` and the threads count leave the output, the journal scan is gone.
- An open task is any status but not DONE, exactly the board's rule; an unknown legacy status now derives instead of reading as no open task; `task.drop` protects any IN_PROGRESS task.
- The state's legacy `next_action` is ignored by the record reads and exact search and erased by the next state write; a ranked backend may still match its raw document until that write.

### Removed

- `next_action` from the State schema; `ctx unit next` (the replacement line names the derived view); `task start --pointer`; the audit's IN_PROGRESS-absent-from-state check; `last_event` and the thread count from `active`.

## [0.62.0] - 2026-11-04

MINOR: the law compose lands. The base is a loader; the law layer is composed from the core source, the installed modules' fragments, and the preambles at install and boot, and the workspace and local overlays chain after it. The generated layer is gitignored. The docs laws move into the docs module, the lane laws gain the boundary-warning, and the workspace overlay keeps its own five laws.

### Added

- The core law source `base/.contexture/laws/core.md` (the 15-block skeleton in order) and the composer `base/.contexture/laws/compose` (a POSIX sh/awk script; the effective module set plus the standalone law parts; the module preambles after `@layout`; the custom sections after `@update`; the deterministic cksum header; the checks: determinism, an intact core, the unique slugs across the generated and both overlays, each module once, the version and hash; the refusals).
- The loader `base/AGENTS.md` (856 B): compose or verify, the absent-payload refusal, the generated whole, then the workspace and local overlays.
- The boot and install triggers: the loader's first instruction, the adoption copy and ONBOARDING compose, and the installer/uninstaller recompose after the law set changes.
- The tests: `tests/law-tests.sh` 212 assertions (the loader, the boot, the docs and lane laws, the base-only golden, the installer recompose, the plants), the 19th gate job, and the fast `law` area.

### Changed

- The docs module's laws file carries the generalized corpus-untracked plus its layout, boot, and close clauses; the docs module and package versions are 1.1.0.
- The lane module's laws gain the boundary-warning; the docs plugin overlay is retired.
- The workspace overlay loses the eight docs laws, the docs and lane clauses, and the storage line, keeping the five workspace laws (installs, background-subagents, docs-sync, workspace-tmp, test-scope), the corpus-untracked-here, the ideas rule, and the release rules.
- The every-turn AGENTS stack drops from 34,994 B to the 856 B loader; the boot whole is about 36.7 KB with the docs module.
- The payload declaration gains `laws`.

## [0.61.1] - 2026-11-04

PATCH: the unit module release's records and the header repair. The v0.61.0 tag carries the unit module, the clean cut to `ctx unit`, the contract 3 store-only drivers, and the fast test gate; its changelog section was omitted and its header left at v0.60.2. The v0.61.0 breaks, named here: a record-only driver refuses under contract 3; `ctx session` retires in favor of `ctx unit`; the fts5 store re-enters a fresh schema 5.

### Added

- The unit module at `base/.contexture/modules/unit`: the 35 record operations over the store's get, put, list, batch, and the extended search; the canonical render; the canonical refs resolved publicly through `ctx unit resolve` and `data_get`; the active listing; the 12 document-set rules; the legacy parse and the file-pointer exemption.
- The contract 3 store-only desk: the seven store names in order, the record-only refusal, the fts5 schema 5, the capability and health as driver methods.
- The clean cut: `ctx unit` with the 22 verbs, the base and root AGENTS at `ctx unit`, the docs and corpus reconciled, the session module retired.
- The fast test gate: `GATE_JOBS=5` parallel jobs with the early-red notice, the data-script cost cut (the exact-key reads, the one-state load; the dbg-anchor load 1.546 s to 0.759 s, the 66-case posix 632 s to 453 s), the duplicate suites removed (the base-only nested compliance and the storage-fts5 test-driver), the record fuzzer, and the flakes hardened (the midnight dates derived from the artifacts, the lock retries, the KR tree kill).

### Changed

- The payload declaration gains `modules/unit` in place of `modules/session`; the governance and base-only checks follow.
- The gate's timeout is 3600 s for the data mode; the fast loop runs the smoke, the unit-data half, or the affected suite.

## [0.60.2] - 2026-11-03

PATCH: the core record-shape templates retire. The break: `base/.contexture/templates/` and its seven files leave the payload, so an adopter on v0.60.1 or earlier deletes `.contexture/templates` from the live drawer by hand; nothing at runtime read them, since the verbs write the shapes and the audit parses them. The release also repairs the AGENTS.md header that v0.60.1 left at v0.60.0.

### Added

- The exact recipe and report block grammar in `docs/units-and-lanes.md`, beside the content contract: the replacement home for the two documents the lane verbs store and return raw, with no parser enforcing their shape.

### Changed

- The payload declaration drops `,templates` in `README.md`, `docs/adoption.md`, `docs/the-engine.md`, `docs/workspace/operations.md`, and `docs/workspace/system-map.md`, the last brought to the full canonical set with `package-install` and `package-uninstall`.
- The engine page's templates section becomes the artifact shapes, pointing at `@record`, `docs/the-record.md`, `docs/units-and-lanes.md`, and `docs/overlays.md`; `docs/overlays.md` states the inline block is the whole grammar; the README and drawer-layout tree rows drop.
- The corpus reconciles through the `ctx docs` verbs: the record page's sources and its grammar claim, the system map's record stack, sources, payload, and grammar wording, and the module page's part-type list.

### Removed

- `base/.contexture/templates/` and its seven files: `backlog.md`, `journal.md`, `knowledge.md`, `overlay.md`, `recipe.md`, `report.md`, and `state.md`.
- The governance suite's template glob loop and its payload assertion's `,templates`; the package installer's core-path case entry for `templates` (the generic outside-root refusal still covers the path).

### Fixed

- `base/AGENTS.md` and the root `AGENTS.md` header read v0.60.2; v0.60.1 shipped without bumping the header, so the installed-version read stayed at v0.60.0.

## [0.60.1] - 2026-11-02

PATCH: the templates part retires and the record resolves installed rhythms. The break: a package manifest's `templates` part is now an unknown part type and refuses, and there is no shared templates folder; an internal asset rides inside its module. The rhythm fix resolves a RHYTHM stamp against the workspace rhythms root, then the extension rhythms root, and the docs-discipline package stops shipping work.md (starter-rhythms owns it).

### Added

- The docs module's grammar asset `scripts/doc.grammar`, private to the module; the write verbs and the audit resolve it beside the module, and no shared template is read.
- The interface rule in the module and plugin guides: the ctx interface is the only user/agent-facing surface, anything not served there stays module-private inside the extension folder, and no standard shared templates part or folder exists.
- The record's RHYTHM stamp resolves both rhythm roots, workspace first; an installed extension rhythm stamps without a workspace copy, and the docs-shaped work rhythm stays as reference material at `plugins/docs-discipline/docs/work.md`.

### Changed

- The docs suite's census scans scripts and engines only, so a private data asset is not read as shell code.
- The docs-discipline package declares the module and its rhythms only; its grammar rides inside the module, and its installed rhythms are `docs-authoring` and `docs-drift`.

### Removed

- The shared `.contexture/extensions/templates` tree and the docs package's templates part; the docs corpus grammar moves into the docs module.
- The docs-discipline package's installed `work.md`; starter-rhythms owns the installed generic `work`, and the two packages no longer collide.

### Fixed

- `ctx session record --rhythm=<name> <N> <GATE>` resolves an installed extension-root rhythm, and a workspace copy shadows it; a missing rhythm names both roots.

## [0.60.0] - 2026-11-02

MINOR: the module system lands: the standard module folder and its manifest grammar, the extension root as the packages' overlay target and the core's second read root, the package installer and uninstaller with the extension-root-only overlay and its collision checks, the package manifest's feature and driver kinds, the catalog mirrored into the extension root, the authoring guide, and the module suite. The storage stays the core's; the session and the unit module follow.

### Added

- The standard module folder: the module file's grammar (the summary, the version, the description hash block last, the refused requires) with the private `ctx _module` reader and the discovery validation; the laws fragment, the data declaration, and the install and uninstall part hooks.
- The extension root `.contexture/extensions`: the packages' overlay target and the core's second read root, with the engine's workspace-first discovery and the collision warnings, the resolver's extension driver tier, the two-root store-data owner scan, the extension rhythm index, and the `CTX_ROOT`-absolute docs library and template.
- The package installer and uninstaller: the extension-root-only overlay, the `.state/<package>.files` record of paths, modes, checksums, and law fragments, the collision table (an outside or core path, an unrecorded or another package's file, a module name against a builtin, a workspace module, or a reserved name, a driver name against posix or ahead of the extension root, a duplicate namespace, a malformed manifest), the re-install as an update, the read-only refusal, the part hooks' order, and the uninstall's preservation.
- The package manifest's two kinds: the feature package and the storage-driver package, with the typed parts and their extension-relative paths, the driver name and the `storage.driver` mapping, the three version lines, and the refused requires; the private `ctx _package` reader enforces it.
- The five packages' manifests and the mirror: the docs module, its rhythms and template, the fts5 driver, the ast-doc-graph module, the toolchain filters, and the starter rhythms under `.contexture/extensions`.
- The authoring guide and the worked example at `tests/fixtures/worked-package`, with its own 33-assertion test.
- `tests/module-tests.sh` as the 16th gate job (241 assertions) and the fast loop's module selector.

### Changed

- The fts5 driver is a storage-driver package part, not a module: the engine never lists it, and `storage.driver: fts5` resolves from the extension root ahead of the transitional module tier.
- The session wrapper, the docs module, the runner, and the lanes reach the core through the extension root's contract; the docs module's corpus writes go through the library and the store.
- The overlay's docs laws move into the docs module's fragment; the lane-isolation clauses live in the lane module's laws.

### Removed

- The storage-fts5 module file (the driver is a package part); the lane-isolation package (its clauses are the lane module's laws); the old `.contexture/modules` homes of the docs module, the fts5 driver, the ast-doc-graph, the toolchain filters, the starter rhythms, and the lane (the live drawer adopts the extension root).

### Fixed

- The installer prunes the folders a stale-file removal empties, so a dropped module can be re-added.
- The package-manifest reader refuses a part path with an empty segment.
- The uninstaller preserves and reports any record path outside the extension root, under the state area, or carrying a dot segment.

Commits in the range: b7a07b6 (the standard folder), e597152 (the extension root), 518854c (the package overlay), 5e27a9e (the manifests), 9a49737 (the catalog), 784c288 (the guide), 1809058 (the module tests), 401d833 (the review and its three hardened findings), and the release commit.

## [0.59.0] - 2026-11-02

MINOR: the storage core lands as a core mechanism, not a module: the resolver, the store contract, the module-facing library, the optional search schema, the transactional batch and the scan, the split descriptor, the error shape, and the committed differential fuzzer, with the storage module retired and the driver at version 3.0.0. The record's 38 typed functions stay on the driver until the unit module moves them; the batch and the scan are additive.

### Added

- The storage core at `.contexture/storage`: the driver resolver, the store-data reader, the `store-search` engine, the module-facing library (`store_list`, `store_get`, `store_put`, `store_delete`, `store_changes`, `store_batch`, `store_scan`, `store_search`, `store_require`, `store_has`, `data_get`, `data_emit`), the store contract README, and the posix driver.
- The store family: the transactional batch (an ordered put/delete list in one namespace over the stdin payload, all or none, the first failure naming the 1-based action and key) and the scan (the namespace's items under the module pattern, bytewise, the raw value in base64, no limit) beside the five.
- The optional search schema in the data file in the flat and the document-set forms; the exact rule over the raw stored value on every driver; the ranked extraction where the driver declares `search.schema` (the fts5 store FTS index, the write-time derivation, the schema-signature rederive); the generic value fallback.
- The module storage declaration's minimum: the namespace and the key pattern required; the root, suffix, changes, format, and search keys optional with the posix defaults (the root = the namespace, the suffix empty, the changes false); the variable-depth final placeholder shared by the docs's `<repo>/<slug>` and the unit module's `<unit>/<path...>`.
- `tests/store-fuzz.sh`: the committed differential fuzzer (a seeded write sequence into posix and the fts5 plugin's own copy, every answer and read compared byte for byte, a coverage guard, and a `--plant` mode), a 15th gate job.
- The split descriptor's `store` array and the `search.schema` token.

### Changed

- The descriptor splits: `functions` is exactly the 38 record names, `store` is the seven data names in fixed order, and the driver version is 3.0.0 under contract 2; the handshake keeps a record-only driver valid and refuses a partial store family, a token without the family, an outside name, and a function outside the 38, and requires `exact` among the search modes.
- The error shape is one line across every storage surface (`<function>: error: <message> (<CODE>`) with the batch's action context, the scan's staged answer, the ref re-frame, the module codes at tier 1, and the resolver's exception; no new core code.
- The docs module reaches the corpus through the core library, not the resolver; the session wrapper stays as the compatibility path.
- The resolver's tiers gain `.contexture/storage/drivers`; `storage.driver` in `.contexture/config` is the contract, and the legacy `session.storage.driver` and `.contexture/storage.conf` reads stay transitional.

### Removed

- The storage feature module (`.contexture/modules/storage`): the storage is a core mechanism, not a module, and `ctx help` no longer lists it.
- The posix driver's old home under the session module's `drivers/`: it moves to the storage core.

### Fixed

- The scan stages its answer, so a mid-scan read failure prints nothing on stdout and the encoder's stderr is suppressed; the search re-frames the private engine's refusal as `store.search` with the same code; `store-b64` refuses a missing or unreadable file.
- The fts5 ranked search encodes a query holding a double quote correctly and stages its answer, capturing the sqlite stderr.
- The fts5 `store.delete` takes the namespace lock before the existence check, so two concurrent deletes answer one success and one not found.
- The handshake requires `exact` among the search modes and each of the 38 record functions once; the fts5 `store.get` refuses a schema-5 database; the fts5 `store.changes` and `store.twin` print one stderr line.

Commits in the range: ce9ea82 (the storage core's foundation), 5dac510 (the data declaration), 9371679 (the search schema), 6ea8523 (the batch and the scan), a0a08e9 (the descriptor split), ce9ec51 (the error shape), 9d0c16c (the differential fuzzer), ad3eabf (the independent review and its six hardened findings), and the release commit.

## [0.58.3] - 2026-10-29

PATCH: a SIGKILLed writer no longer poisons the workspace: a stale unit or store lock is recovered from its holder pid, and a killed verb's per-verb scratch is swept by the next dispatch.

### Fixed

- The posix and fts5 unit and store locks carry their holder's pid; a waiter removes a lock whose pid is gone and proceeds, while a live holder still refuses ERR_STORAGE_LOCKED.
- `ctx` names one per-verb scratch root and exports `CTX_SCRATCH_ROOT`; the verb library and both drivers stage under it and remove it on return, and the next dispatch sweeps a root left by a SIGKILLed verb.
- The session suite's P2 residue case tests each pattern on its own with a planted single leak, and the new KR section proves the stale-lock recovery, the live-holder refusal, and the scratch sweep on both drivers.

Commits in the range: cfb9a43 (the recovery) and the release commit.

## [0.58.2] - 2026-10-29

PATCH: the test suites regroup into a fast inner loop and the full pre-land gate, the slow jobs run concurrently, and every check stays.

### Added

- `tests/fast.sh`: the fast inner loop with nine area selectors (`unit`, `engine`, `record <group>`, `driver posix|fts5`, `docs`, `docs-fts5`, `plugin <name>`, `base`); it is POSIX sh and awk, adds no dependency, treats 77 as a skip, and never replaces the full gate. `tests/README.md` documents the three layers, the pre-commit and pre-push sets, and the layer map.
- `tests/base-only-tests.sh --skip-core`: the B1 to B5 payload checks alone (145 assertions), keeping the full run at 152.

### Changed

- The session suite's fold section runs as group 4, so the old three groups and FC run at once; the counts stay 1,151 posix and 1,062 fts5.
- The base-only suite launches its seven nested posix suites before B1 to B5 behind a capped rc-file poll, and the storage-fts5 suite runs its seven sub-suites the same way; the verdicts, counts, and fixed output order are unchanged.
- The operations corpus documents the four session groups and adds the fast inner loop step.

### Fixed

- `tests/fast.sh` refuses the `.` and `..` plugin names that resolved outside `plugins/`.

Commits in the range: f5aff16 (storage-fts5 sub-suites concurrent), 208a3d0 (session group 4), 19c139b (base-only nested concurrent), 87e85fd (the fast loop and layer docs), 11b8d51 (the plugin dot-name refusal), and the release commit.

## [0.58.1] - 2026-10-29

PATCH: the docs discipline closes its two latent read gaps, the gate matrix stays inside the workspace, and the agent corpus names the storage-fts5 driver.

### Fixed

- `ctx docs query` forms that match nothing now refuse rc 1 as the help states: a search term, a rule category, a pitfall severity, an edge channel, a section, and a file owner never answer a plausible-but-empty success.
- The docs audit reads the grammar schema's pitfall fields and refuses a class outside its enum or a missing required field, so a hand edit cannot escape the read check the write verbs already enforce.
- The docs gate matrix builds its fixtures under the workspace drawer's `.contexture/tmp` and the suite runs it with `TMPDIR` pointed at an empty watch folder, proving the watch stays empty.

### Changed

- The agent corpus's plugins doc names the storage-fts5 driver among the six bundles, with its record and store contract and its pitfall; the retired import wording is gone.

Commits in the range: the release commit.

## [0.58.0] - 2026-10-28

MINOR: the generic module store decouples module data from the record; the docs corpus lives on it, and fts5 serves it beside the record with a change log. Every break is named below.

### Added

- The base storage module and the generic module store contract: the five functions (`store.list`, `store.get`, `store.put`, `store.delete`, `store.changes`), the module data file (namespace, root, suffix, key pattern, changes), the exact-key rule with the ASCII case-twin refusal, the bytewise list, the atomic per-key put, the optional generic change log, the descriptor at 38 record plus 5 store functions, TC70, `tests/store-compliance.sh`, and the no-base-to-docs boundary. The session module's resolver becomes a compatibility wrapper over the storage module's resolver.
- The docs corpus on the generic store: the docs module's data file, the `ctx docs` write verbs writing through the store, the logical address `docs/<repo>/<slug>.md`, and the docs suite capture parity (72 byte-identical captures plus 4 named store-mode verdicts).
- The storage-fts5 store: the `store` and `store_changes` tables, the five store functions natively in SQL, the generic change log, and the schema 4 open path that adds the store tables to a store created before them without a version bump; the legacy docs tables stay untouched and unread.
- The storage-fts5 module README: the module-folder map of the schema, the SQL layout, the store, and the plugin's cases; the plugin README stays the adoption guide.

### Changed

- The docs module reads and writes through the store; the six corpus methods and their tokens retire; a driver without the store still serves the record. The descriptor is the final 38 record plus 5 store functions with the optional `store` and `store.changelog`.
- The posix driver maps a module's declared root under the workspace, so the docs corpus stays where it was and the logical addresses replace the display paths; fts5 holds the same bytes in its store with a change log per write.
- The guides are trimmed to catalog level and link the module READMEs: the docs module and storage-fts5 internals live in their module READMEs; README lists `modules/storage` in the payload and states the logical corpus address; the workspace overlay points the corpus map at the module README; the released guides describe the posix and fts5 drivers only.
- The base onboarding procedure adopts the base alone; the plugin catalog is the optional addition the adoption guide and the plugin READMEs describe.

### Removed

- The six corpus methods (`corpus.list`, `corpus.read`, `corpus.write`, `corpus.remove`, `corpus.mount`, `corpus.changes`) and the `corpus.store` and `corpus.changelog` tokens; a driver without the store still serves the record, and the old corpus tables are not read.
- The driver resolver's `sqlite-fts5` and `storage-fts5` aliases for the `fts5` driver (breaking): configure the driver by the name the plugin declares (`fts5`).

### Fixed

- The review fixes on 25caa9a: the posix store refuses a key its case-insensitive root cannot represent exactly beside a stored key (F1); the docs edit engine no longer stores a blank line after a splice point and the docs audit tracks a block scalar's body indent (F3 and F4, exposed under mawk); the fold test anchors its receipt check (F5).
- The base-only fixes: `ctx session index` answers rc 0 with an empty index when `.contexture/rhythms/` is absent, so a bare base-only install completes its boot step (BG1); an exact-search snippet strips a field value's double quotes only as a pair, so a lowercase field line (the state's `next_action`) keeps its closing quote (BG2).
- The base-only gate: `tests/base-only-tests.sh` stages `base/` alone and proves the shipped base with no plugin (the no-plugin help, the 43-function posix descriptor, the record, lane, and store smoke over a synthetic data module, the absent-rhythms index, the store refusals, the no-base-to-docs census with a plant, and the posix core suites); `tests/store-compliance.sh` gains `--data-file`, and `tests/run.sh` runs the gate.

Commits in the range: b3ffa5a (the base module store), 5d48a5e (the fts5 store), cbe0dc5 (the docs corpus port), 25caa9a (the review fixes), and the release commit.

## [0.57.0] - 2026-10-27

MINOR: the consolidation fold consolidates a unit's live record into ordinary entries whose REFs name the batch, with the record as the state, the grain planned at the record's mechanical seams, and the open threads carried (a fold compacts history, never obligations).

### Added

- `ctx session fold <unit> [--lane=<lane> [--merge] | --check | --finish]`: one stateless verb over the record. The first no-lane call computes the live scope, partitions it once in journal order into chunks at the mechanical seams, coalesces the mechanical series (consecutive task receipts, a release with its land, a `part N` or lane-prefix series, a shared backlog REF), splits an over-12 chunk only as the last resort (recorded as `cap_split`, at the last seam in its first 12 or at the last entry with a `(cap split: no seam)` note), records the fold start, and prints the plan with the carried open threads, the first lane's manual, and the first act. A fetch returns one unclosed chunk, its entries, the lane's remaining chunks (never another chunk's entries), and the next act; `--merge` adds only the immediately following chunk's entries, the one permitted merge partner; a fetch never advances. The lane writes one ordinary journal entry with `ctx session record`: the one-line synthesis in the WHAT, one REF per constituent plus any external report, and one folded closer per non-thread constituent; a carried open thread is REF'd as context, never closed; a merge records its same-topic reason in the WHAT as `(merged: <reason>)`. `--check` derives the batches from the live post-plan entries' CLOSES and REFs, treats a scoped live entry carrying THREAD other than none as carried (never `SCOPED_LIVE`), proves every batch REFs the carried threads in its chunks and the closed receipts are the scope minus the carried threads, no non-thread scoped entry remains live, and the audit is clean with its open-thread tail; it names every defect class, the grain's included (`CONSTITUENT_CAP`, `WHOLE_ANCHOR_BATCH`, `MERGE_BEYOND_NEXT`, `MERGE_REASON_MISSING`). `--finish` writes `FOLD FINISH v4 ... covered=<n> carried=<m> open threads ...` and closes the fold start done; the carried threads stay live and a live receipt refuses a second one.
- The grain is mechanical: the plan owns the batch boundaries, coalescing the series and splitting at the seams; the over-12 split is the plan's last resort, never a hard cap on a seam-sized batch; the fetch hands one chunk at a time; the lane merges only the immediately following chunk with a recorded reason; a whole-anchor batch is refused; a lane never splits a chunk.
- Open threads are carried, not folded: the fold leaves every open obligation live and visible, references it from its batch, and reports the carried count in the finish receipt; a batch that closes a carried thread (`THREAD_CLOSED`) or skips its REF (`CARRIED_UNREFERENCED`) refuses the check.
- The lane manual teaches the ordinary record command, the refs and closers as the batch (open threads REF'd and never closed), the one-chunk handoff and the `--merge` next-chunk handoff, the same-topic reason, the supersession repair, the boundary, the finish, and the no-digest rule; every step goes through the runner.
- Tests FC1 to FC17 cover the command surface and the manual, the plan and the partition (a zero-milestone anchor, a tail, a closed entry outside the scope), the lanes, the one-chunk fetch and the merge fetch, the lane's normal entry, the merge with its reason, the boundary, the coverage check and every defect class, the carried open-thread path (live, visible, counted, tail kept), the supersession repair, the finish and its idempotence, the long one-line WHAT, the NUL and CR refusals, the one-chunk handoff, the merge reason, the last-resort split, and the whole-anchor refusal.

### Changed

- `docs/the-engine.md` and `docs/the-record.md` document the consolidation fold, its mechanical grain, and the carried open threads; `README.md` carries the command row; `docs/modules.md` describes the fold's role; the journal template and the `@journal` folding law state the mechanical grain and that a fold compacts history, never obligations, and that open threads stay live and are carried.
- The live drawer adopts the base session module.

### Fixed

- The v3 digest path, the full bucket-set checkpoint and its percent encoding, and the `CHAPTER_FOLD` milestone leave the command, the tests, and the guides. The v3 draft was never released.

## [0.56.0] - 2026-10-25

MINOR: `ctx session active` carries each unit's recency and orders the field newest first.

### Added

- `session.list` answers the UnitListing schema: the UnitSummary fields (unit through extra_lines), then `last_event`, the date the last main-journal item carries (an anchor's stamp date or an entry slug's `YYYY-MM-DD` prefix), null when the last item carries no date or the journal is empty; lane journals are excluded. The posix derivation is a backward head-line scan of the manifested journal, the fts5 derivation a last-row lookup over `journal_items`; both answer the same JSON for the same record, with the stored schema, `session.units`, and the 38-function contract unchanged.
- `ctx session active` prints two spaces then `last_event: YYYY-MM-DD` after each unit's objective lines when the date is known, and orders the ACTIVE units newest first, with a bytewise unit tie-break and undated units last; the verb help names the field and the order.
- The compliance suite pins the derivation as TC80 (an A1-only unit answers null, a recorded entry its date, a stamped anchor its distinct stamp date) and asserts session.list's bytewise order; the session suite pins the active date line, the newest-first order, and nulls last; the counts are 74 cases on posix and 68 on every other backend.

### Changed

- `tests/parity-v054.sh` retires the active view: the intentional output addition and order change leave nothing to compare against the old base, so active leaves the kept-view list.

## [0.55.3] - 2026-10-25

PATCH: the runner's capture sink is anonymous; a command can no longer read its own captured output.

### Fixed

- `ctx run` creates its stdout and stderr capture files in the workspace scratch drawer and unlinks them before the wrapped command runs. The runner keeps open read and write handles, so the capture lives without a directory entry: a recursive command can no longer find, read, and re-emit its own output. This closes the self-referential loop that grew a capture file until the disk filled. Tests pin the capture's invisibility, stdin preservation, stderr separation, and exit-code preservation.

## [0.55.2] - 2026-10-24

PATCH: clean up physical file leakage in session ref renderer.

### Fixed

- The session ref renderer during session load with `ref_sessions` output `# --- ref knowledge.md ---`, leaking the physical storage file extension. Rendered delimiter is now `# --- ref knowledge ---`, consistent with `# --- ref live journal ---` and the docs-audience-separation law.

## [0.55.1] - 2026-10-22

PATCH: a wording change to the harvest law, no artifact shape changed.

### Changed

- The harvest lands by the agent's judgement: a candidate that meets the bar lands in knowledge and its entry closes by reference, and a candidate that does not drops; no approval gate. The unit close promotes durable knowledge by the same bar. The law, the refresh and close steps, and the guides follow.

## [0.55.0] - 2026-09-30

MINOR by the version ceiling; every break is named below.

### Added

- The storage contract, contract 2: every session and lane command maps to one storage function with fixed arguments, payload, answer, and refusals (38 record functions beside the 6 corpus methods kept as shipped); base sends the parameters and renders every text view from the data the function returns, so every backend prints the same text; each backend stores the record its own way and enforces the record rules itself, each rule pinned by a compliance case. The capability descriptor `{driver, version, contract, functions, search_modes, optional}` replaces the capability token lists. No command moves a record between backends: a record reaches another backend by re-entering it through the ordinary verbs, a corpus through the `ctx docs` write verbs.
- `ctx lane create <unit> <lane>`: the dispatcher lands the recipe on stdin, stored as given with an empty lane journal; an existing lane refuses rc 1 (`ERR_ENTITY_EXISTS`).
- `ctx session entry closure <unit> <slug>`, `ctx session units <repo>`, and `ctx session refs-to <unit>`: the three named looks of the former query family that no typed verb carried.
- `ctx session record --rhythm="<name> <N> <GATE>"` (checked against the rhythm file) and repeatable `--ref`, `--closes`, and `--supersedes`, one line each; `ctx session task update --refs`; repeatable `--ref` on `finding add`, `finding update` (replacing the list), and `ctx lane record`.
- `ctx session diagnose` prints the descriptor as lines (contract, functions declared, the search modes the driver declares, optional capabilities, storage health, ACTIVE units).
- New answer fields for content the schema fields cannot hold: `extra_fields` on State, Task, Entry, Finding; `head_text` on Task, Entry, Anchor, Finding; `extra_lines` on State, Task, Entry, Anchor, Finding; `legacy_status` on Entry; `extra_text` on Closer; an Opaque item answers `head` and `lines`; the Anchor answer carries `date`.
- Tests: the compliance suite states contract 2 in 73 cases on posix and 67 on every other backend, every case asserting the data returned; fixtures a backend can hold are built through the functions and every backend is held to the same read answers (TC76), while legacy text is planted as posix files in six posix-alone cases; the session suite reads through the verbs on every driver; `tests/lib/content.awk` compares text views by content; `tests/parity-v054.sh` compares every kept view of two bases over copies of real units; the governance suite's G5 census keeps unportable awk replacement escapes out; the storage-fts5 suite gains `test-schema`, `test-verbs`, `test-version`, `test-derive`.

### Changed

- Every session and lane verb is an sh script over one shared verb library, one JSON flattener, and one renderer. `--json` prints the storage function's answer unchanged, compact and in the contract key order, so every `--json` shape changes to the contract schema.
- Every item reads in one canonical layout on every driver (task, entry, finding show, resolve, board, load, lane show journal, active, units, exact search): a legacy item stored in another field order, spacing, or quoting prints in the canonical lines with every value kept, content the schema cannot hold in the named fields above. A posix file keeps every byte until a write touches one of its items; the touched item is then stored in its canonical lines. A block value drops its trailing whitespace-only lines on every write and read.
- `ctx session search` requires `--mode` (breaking): without it the verb refuses rc 1 naming the modes the configured driver declares; `exact` is the one mode every backend implements (a case-insensitive substring of one line, over the rendered text); a mode the driver does not declare refuses naming the declared ones; results carry `score` (0 for exact).
- A closer takes only `<slug> (<verdict>: <reason>)` (breaking): `ctx session record --closes` and `--supersedes` refuse a bare target, a missing or unknown verdict (done, superseded, dropped, folded), an empty reason, or a reason holding a parenthesis, rc 1 naming the form; every closer target must name an entry the journal holds. A legacy closer or SUPERSEDES reason reads to its last closing parenthesis.
- Every REF and REFS element a write carries takes `<target>#<symbol>` (a # with text on both sides) or a whole target path holding a / and ending in a name, a root-level file written `./<file>` (breaking): a lone `/`, a trailing `/`, `./`, a bare file name, blanks (a Unicode blank and an ASCII control byte count as one), and double quotes refuse rc 1 naming both shapes; stored values read as they are.
- `ctx session stamp <unit>` takes the unit alone and appends `@anchor A<N> <date>` (breaking): a text argument refuses rc 1; `session.stamp` takes `date` instead of attention; the load's last page hands off to stamping the new period; the laws' load receipt wording goes (anchors are period ordering); legacy anchors holding receipt text read as stored.
- Every payload field and document a verb carries (a lane recipe or report included) that is not valid UTF-8 or holds a NUL byte refuses rc 1 naming the field, before any driver call; legacy posix files holding such bytes keep reading.
- Task status moves are the backend's rule: `start` moves only a `TODO` task, `complete` a `TODO` or `IN_PROGRESS` task, `reopen` an `IN_PROGRESS` or `DONE` task, `drop` refuses an `IN_PROGRESS` task that `next_action` names (`ERR_INVALID_TRANSITION`); `ctx session next` and `task start` refuse a pointer that omits an `IN_PROGRESS` task (`ERR_POINTER_INCOMPLETE`); `task update` and `finding update` with no field refuse rc 1.
- Completion and drop receipts are written by the backend in the same write as the status change, their slugs taking a `-1` suffix while the journal holds the slug.
- Every verb refuses an unknown flag or an extra positional argument rc 1; every write refuses a `CLOSED` unit rc 1 (`ERR_UNIT_CLOSED`) at the backend; record-rule refusals print one fixed line, `<function>: error: <message> (<CODE>)`; entry.record and both receipts refuse a malformed or missing `current_anchor` rc 2 (`ERR_STORAGE_CORRUPT`).
- `ctx lane record` refuses a THREAD that is empty, `true`, or `false`, as `ctx session record` does.
- Under posix a `lanes/<lane>` folder holding no recipe, journal, or report is no lane: lane show and `lane.get` refuse it, every listing skips it, `ctx lane create` of its name lands beside its files.
- The capability handshake reads contract 2 at dispatch: a descriptor that does not declare it or lacks a record function halts rc 2 (`ERR_DRIVER_PROTOCOL`) naming the gap, and a driver's own refusal line passes through a failed handshake; `require` and `has` answer the optional capabilities and `search.mode.<m>`.
- The POSIX driver is rewritten to contract 2 in POSIX sh and awk (a canonical renderer, the legacy parse into named fields, the functions and the audit) and stages every write inside the sessions folder, renamed into place under the unit lock; a write touching several files rolls back on a failed step or an interrupt. Its JSON strings and every payload field escape by split and concatenation, so the record reads the same under every awk, Debian's busybox awk included.
- The FTS5 driver answers every function natively in SQL, with no posix delegation or unit materialization, and holds typed rows only; it needs sqlite3 3.44 or later (`storage.health` reports error below it). Its store is laid at schema 4 in a new or empty file, and a store at any other version refuses every function rc 2 (`ERR_STORAGE_SCHEMA`) naming its version, with no in-place upgrade and no backup: move it aside and re-enter the record into a fresh store. The storage-fts5 module carries no verb of its own.
- The laws: `@query` search requires a mode, `@record` references names the two pointer shapes, `@journal` anchors are period ordering, `@boot` step 8 stamps the new period. The engine guide states the exit tiers' interrupt rule: rc 0 means landed; after an interrupt any other exit means check with a read. The README command table, ONBOARDING, the guides, the session module README, and the templates follow the new interface; the agent corpus follows through the docs write verbs.

### Removed

- `ctx session append`, `amend`, `query` (all ten kinds), `flip`, and `drop`: each name prints its replacement rc 1 (`append`: record, task add, finding add; `amend`: task update; `query`: entry show, entry list, entry closure, finding show, resolve, search, units, refs-to, lane show; `flip`: task start, complete, reopen; `drop`: task drop).
- The raw block stdin inputs of `ctx session record`, `task add`, `task update`, `finding add`, `finding update`, and `ctx lane record`: the typed flags are the only write inputs, so no markdown crosses the command interface.
- `ctx storage-fts5 migrate` with its `index.sh` and `closer.awk`; no command moves a record between backends.
- The contract 1 driver methods (`artifact.read`, `artifact.write`, `artifact.list`, `session.init`, `entry.anchors`, `lane.status`, `lane.close`, `resolve.ref`) and its capability tokens; `session.pointer`, `task.show`, `entry.show`, `finding.show`, `lane.show`, and `lane.report` renamed to `session.next`, `task.get`, `entry.get`, `finding.get`, `lane.get`, and `lane.write_report`.
- Payload files an update copy does not delete, removed from an adopted drawer by hand: `session/scripts/append`, `amend`, `query`, `flip`, `drop`; the posix driver's `load_bios.awk`, `parse_blocks.awk`, `serialize_blocks.awk`; in an adopted storage-fts5 module `scripts/migrate`, `index.sh`, `closer.awk` (the plugin README's cleanup step).

### Fixed

- The typed task verbs allowed any status move, so a `DONE` task could restart silently; a same-day complete, reopen, complete wrote a colliding receipt slug; the posix driver's lane creation overwrote an existing lane's journal; the audit printed its record checks in the awk's hash order, which differs between awks.
- A legacy line carrying a carriage return put the CR into typed fields; fts5 read back a block value ending in whitespace-only lines differently from posix; `task update` and `finding update` with a raw block on stdin answered updated and changed nothing.
- The docs plugin's glob patterns escape a dot as `[.]`.

## [0.54.0] - 2026-09-27

### Added

- The docs corpus behind the storage driver: the SPI gains a corpus subsystem (`corpus.list`, `corpus.read`, `corpus.write`, `corpus.remove`, `corpus.mount`, `corpus.changes`) with the optional capabilities `corpus.store` and `corpus.changelog`, outside the mandatory handshake, so a record-only driver keeps serving every session verb. `driver-resolver` gains `require` and `has`, with a verdict cache per capability set. The POSIX driver serves the corpus as files under `docs/<repo>/<slug>.md`; the FTS5 driver keeps it in its store with a change log.
- Every `ctx docs` read verb (query, audit, check, gate, nudge) reaches the corpus only through the configured driver, by one helper; under a store the verbs print the same doc paths the files driver prints. `ctx docs nudge <unit> [<repo>...]` reads the active task through `ctx session`.
- Ten write verbs, each checked against the grammar and audited over its repo before anything is stored, then stamped with its operation and the workspace git HEAD: `ctx docs new`, `write`, `header`, `rule`, `pitfall`, `entry`, `section`, `replace`, `remove`, `ids`. `ctx docs query <repo> <slug> --entry <block>/<key>` prints one entry's raw lines.
- `ctx docs changes [--since=<rev>]`: the corpus half of a delta under a change-log driver, one net status line per doc written since the current HEAD.
- Ids for contract rules (`<slug>-r<N>`) and responsibilities (`<slug>-o<N>`) on the entry's second line; `ctx docs ids [<repo>] [--dry-run]` keys a legacy corpus once.
- The grammar template carries a machine-readable schema section (`#%` lines) with an agreement check against the prose and the audit's lists.
- `ctx storage-fts5 migrate --corpus` (with `--prune` on export) moves the corpus both ways through the POSIX reference, byte-identical round trip; the FTS5 schema reaches version 3 (tables `docs` and `doc_changes`), and an older database climbs to it on its next open.
- The docs-discipline suite runs twice in the gate (`plugin:docs-discipline` and `plugin:docs-discipline:fts5`), staged from the shipped copies, with the single-door census, the write-verb table, the delta-source cases, the migration round trip, and the capture parity against the files driver. The compliance harness grows to 51 cases in 13 suites (the corpus store and the resolver's optional capabilities).

### Changed

- Under a change-log driver the check drops the blanket rule and the untracked-claimant verdict (a doc refreshes only the code its own sources name), and the gate composes the code half from git with the corpus half from the store; `--drift` under a store prints a deferral notice. The files driver keeps git as before.
- A bare `ctx docs audit` audits the whole corpus instead of refusing; an absent doc, an unknown repo, and an empty corpus refuse rc 1 with a named message (an awk open error rc 2 before); under the files driver an explicit path to a file outside the corpus folder refuses rc 1 and names `ctx docs write --dry-run` for drafts; the backlog-file nudge refuses a path inside the sessions drawer; the usage lines of a bare `ctx docs check` and `ctx docs nudge` name the repo and unit forms.
- The bare `ctx storage-fts5 migrate` moves the corpus beside every unit; an empty source never empties the destination.
- `corpus.changes` rows carry six fields, the doc's prior state (`absent` or `present`) included, so the net status tells an added doc from a modified one.
- `corpus.write` refuses, on every driver, a key that folds onto another doc's or repo's key under ASCII case (`ERR_ENTITY_EXISTS`); every corpus method acts on the exact key alone, a case twin reading as absent.
- The audit keeps one id namespace per repo across every id field (message `duplicate id`); `ctx docs query --pitfalls` lists only `@pitfalls` entries; a backslash in a query option is literal, since free text reaches the engines through the environment, never `awk -v`.
- Removing the last item of a list field removes the field, refused where the field is required; a `ctx docs write --replace` carrying the stored bytes writes nothing and logs no change.
- The laws docs-are-code, corpus-untracked, corpus-reconcile, docs-audience-separation, and harness-free, the @layout docs line, and the docs-drift, docs-authoring, and work rhythms read the store-aware way; the guides follow. The ast-doc-graph plugin still reads the corpus as files and indexes no docs under a store driver, documented as a limit.

### Fixed

- `ctx docs query --pitfalls` credits a pitfall that ends a doc to its own doc, never the next doc's slug.
- `ctx docs replace` refuses a carriage return; a `--stdin` value of any size reaches the write verbs through a payload file instead of the environment.
- On a case-insensitive filesystem the POSIX `corpus.read`, `corpus.remove`, and the repo-filtered `corpus.list` and `corpus.mount` answered for a key that differed from a stored doc's only by case, and a twin remove deleted the stored doc.

## [0.53.2] - 2026-09-27

### Changed

- The ship gate (`tests/run.sh`) runs every suite concurrently: each suite runs as its own job with its own output and exit code file (never read through a pipeline), the output and outcome lines print in the previous fixed order, `GATE_SUITE_TIMEOUT` (default 1200 s) stops a stuck suite with its whole process tree and fails it, `GATE_JOBS` caps how many suites run at once, and every suite reads stdin from `/dev/null`. The same suites, assertion lines, and counts as before; the gate runs about 3.5 times faster.
- The session suite runs its sections in three concurrent groups, each in its own sandbox, with the same assertions and the same summary line; `--group=all` runs the previous single-sandbox suite.

### Fixed

- Two test scratch names collided when two suites or two gates ran at once: the docs-discipline suite's staging folder and the ast-doc-graph DDL test's database (a `mktemp` template whose X run was not trailing); both now create a unique folder per run and remove it on exit.

## [0.53.1] - 2026-09-26

### Added

- `entry.record` takes an optional `ref` payload key: the REF line lands after THREAD and the success echo carries `ref` after `thread` (empty when absent), on both drivers.

### Changed

- One embedded double quote rule for every one-line quoted field: WHAT, a task OBJECTIVE, `next_action`, and the state objective accept an embedded double quote on every write path (append of an `@task` block, amend, `ctx session next`, and bootstrap, which accepts a single quote too); the newline and carriage return refusals stay, and every reader returns the value verbatim.
- Verb messages name the artifact and the unit, never a storage path, whatever the driver (for example `ERROR: missing state: unit <u>`, `WARNING: missing backlog: unit <u>`).
- `ctx session search --mode=exact` means one thing on every driver: a line matches when it carries the query as a substring, ASCII letters compared without case in the C locale, a column 0 comment never matching; the answer is one row per matching entity and section in record order, the first matching line as its snippet, `total_matches` counting those rows. The FTS5 driver answers exact queries through the reference search over its verbatim text; hybrid and trigram stay native.
- The `ctx session finding update` usage shows `--summary` and `--ref` as optional, in the help table and both guides.

### Fixed

- Backslash escaping is portable across awk implementations: every encoder doubles a backslash by concatenation instead of a `gsub` replacement, which busybox awk and `gawk --posix` read as a single backslash (a literal backslash n decoded as a newline, a trailing backslash escaped the next byte, JSON views broke); a dynamic regex string carries a real tab instead of an escaped one. The core suites run green under BWK awk, mawk, gawk, and busybox awk on both drivers; the absolute `/usr/bin/awk` shebangs stay, since an `env` shebang fails on Linux.
- The session suite's read-only store fixture restores the database's WAL and shared memory files as well as the database; on Linux a read-only WAL refused every later write.

## [0.53.0] - 2026-09-26

### Added

- Single store routing: every `ctx session` and `ctx lane` verb now reaches the record only through the configured storage driver (record, append, amend, flip, drop, next, stamp, refs, close, reopen, bootstrap, active, board, load, audit, refresh, every query kind, and finding update, supersede, drop), so a configured backend is the one store. New driver methods on both drivers: `artifact.read`, `artifact.write`, `artifact.list`, `session.create`, `storage.health`; the POSIX driver gains `finding.update`, `finding.supersede`, `finding.drop`.
- The FTS5 driver keeps every artifact's text verbatim and answers the record methods through the POSIX reference serialization over its stored text, so both drivers answer alike by construction and an export writes back byte-identical files; it stays native for the store, its index, search, health, and listing.
- `ctx session reopen`: marks a CLOSED unit ACTIVE again, the reverse of close.
- The capability handshake runs at dispatch for every driver but the bundled POSIX one, with a cached verdict per driver change; a driver missing a mandatory capability halts with rc2 naming it.
- The ship gate runs the full session suite twice, once per driver, and the SPI compliance harness against the shipped POSIX driver (`tests/storage-compliance.sh --driver-exec`); plugin suites exercise the plugin's own copy.
- Multi-target closers and legacy repeated slugs: one closer line may name several targets, an entry may carry several closer lines, and a closer closes every occurrence of a slug that stands before it; a legacy repeated slug stays readable (the audit warns with `LEGACY DUPLICATE SLUG`, rc unchanged) while a new repeat is refused.
- `entry show --json` carries the entry's `ref`; `ctx session record --closes` keeps a caller verdict verbatim.

### Changed

- The driver payload transport: free text reaches a driver on stdin (escaped key=value lines, a single document raw), never as an argv argument, so a lane report of any size lands. A driver written against 0.52.0 needs updating for this transport and the new methods.
- One search contract: both drivers return `entity_type`, `entity_id`, `section`, `snippet` per result (a ranked driver adds `rrf_score` and `sources`), and `--limit`, `--entity`, `--mode`, `--json` are honored; an empty query is refused. `entry list --group` and `--anchor` filter on both drivers.
- The task status vocabulary (`todo`, `progress`, `done`, `all`) maps to the canonical statuses in one place; an unknown word is refused.
- Every typed write refuses a CLOSED unit; embedded newlines and carriage returns in one-line fields are refused before any write; `ctx session append` accepts a WHAT carrying embedded double quotes.
- `ctx lane show <unit> <lane> report` is the documented scripted read path of a lane report (`ctx lane report` with no body reads stdin).
- Verb messages name units and artifacts instead of storage paths where the load warnings are concerned; `ctx session diagnose` reports the driver's own health and counts ACTIVE units exactly.

### Fixed

- Free text reached awk through `-v`, so a two-line `task update --desc` erased the whole backlog while reporting success, two-line `task add` and `finding add` landed nothing, and backslash sequences were rewritten; values now travel in the environment and a failed render exits 2 with nothing written.
- The POSIX driver ignored failed file commits (success printed on a read-only store); every failed write now exits 2, removes its temp, and releases its lock. Signal cleanup no longer depends on the shell's EXIT trap.
- `ctx lane report` and `ctx lane show` text views print the stored artifact byte for byte (the escape decoding and a quote-comma truncation were wrong).
- Task and finding defects found by the dual-driver test: `task update` dropping `--desc`, `--criteria`, `--details`; repeated finding names and lane entry slugs accepted or failing rc2 (now rc1 `ERR_ENTITY_EXISTS`); typed resolve refs unsupported or not found; a lane report resolve crash; `task add --refs` missing from the JSON; a malformed task slug accepted; an objective cut at an escaped quote; `finding supersede` of a missing predecessor exiting 0; a raw `@finding` block on stdin crashing; `record --slug` accepting an existing slug; `finding update --ref` ignored.
- The FTS5 migration: re-runnable import, supersession status derived from the record's references, every closer target imported with its verdict, an in-place schema upgrade of older databases, and derived index rows without trailing newlines.
- Help flags: `--help` and `-h` on every finding, task, and entry subcommand and after the record verbs print the usage instead of failing.
- The governance probe declares the lane module, and the ship steps stage the payload before the gate.

## [0.52.0] - 2026-09-26

### Added

- Storage Provider Interface (SPI): a normalized driver contract across session, task, entry, finding, resolve, lane, and search subsystems, with a standardized three tier exit code hierarchy (0 success, 1 semantic error, 2 driver error) and deterministic module owned driver discovery at `.contexture/modules/<module>/drivers/<driver name>`.
- The zero dependency POSIX filesystem driver as the default baseline backend, implementing the full SPI in pure POSIX `sh` and `awk` with atomic single file replacement and multi file transaction locking.
- The SQLite FTS5 storage driver plugin as the dogfood backend (`plugins/storage-fts5/`): a normalized relational schema, dual FTS5 virtual tables (Porter stemming for prose, trigram tokenization for code identifiers and multilingual text with Turkish diacritics preserved), pure SQL Reciprocal Rank Fusion search returning contextual snippets, full finding CRUD, and a bidirectional migration engine between POSIX markdown and SQLite.
- The agent semantic command interface: typed CLI flags across `ctx session` (task add, update, start, complete, reopen, drop, list, show; journal record; finding add, show, update, supersede, drop, list) and a dedicated top level `ctx lane` module (record, report, show), replacing raw block piping as the primary interaction surface while preserving it for bulk import.
- Universal search (`ctx session search`) and reference resolution (`ctx session resolve`) as record surfaces, returning ranked contextual snippets and formatted entity blocks without mode enums.
- `--diagnose` inspection on `ctx run` and `ctx session`, exposing runner and storage runtime state (workspace root, config, resolved driver, capability handshake, storage health, active units) without manual file inspection.

### Changed

- `base/AGENTS.md` governance consolidated: the `engine-blackbox` and `record-blackbox` laws replaced by a single affirmative `cli-doorway` law naming `.contexture/ctx` as the sole doorway to the runtime and the record; `@layout` pruned of internal implementation paths (`.contexture/modules/`, `.contexture/sessions/`, `.contexture/templates/`, `ONBOARDING.md`) and physical disk assumptions purged across `@record`, `@query`, `@subagents`, and `@close`.
- `@record` reframed storage agnostic: `the state`, `the backlog`, `the journal`, and `knowledge` are defined as abstract entities addressed through CLI verbs rather than physical files.
- `docs/the-engine.md`, `docs/the-record.md`, and `docs/plugins.md` updated for the storage abstraction, the SPI, and the FTS5 dogfood plugin.

### Fixed

- Uninitialized receipt variable in the FTS5 driver; missing `ctx session resolve` CLI verb coverage; missing `sqlite-fts5`/`storage-fts5` driver alias resolution; missing `.contexture/config` lookup in the FTS5 driver.

## [0.51.5] - 2026-09-25

### Added

- Added `record-blackbox` law to `base/AGENTS.md` and `docs/the-record.md`, establishing the record as a conceptual data surface accessed exclusively through `ctx session` tooling rather than raw file viewing or editor tools.

### Changed

- Grounded reference syntax across `base/AGENTS.md`, base templates (`backlog.md`, `journal.md`, `knowledge.md`), and `docs/the-record.md`: standardized on logical `target#symbol` references (such as `journal#slug`, `knowledge#NAME`, `file#symbol`) rather than physical relative filesystem paths (`path#symbol (journal.md#slug)`).
- Replaced file-centric phrasing in base governance with conceptual record terminology (`the record` as the single source of truth, `the state`, `the backlog`, `knowledge`).
- Updated `AGENTS.workspace.md` to explicitly teach CLI tooling access for the `ideas` module (`ctx ideas list, show, add, pick, drop`), decoupling workspace idea access from raw file operations.

## [0.51.4] - 2026-09-25

### Added

- Added `engine-blackbox` law and mechanical `TEST` to `base/AGENTS.md` and `docs/the-engine.md`, mandating that agents treat `.contexture/` runtime scripts as closed executables, discover contracts strictly through `ctx help` and templates, and rely on CLI error feedback rather than inspecting runtime script implementations.

### Fixed

- Complete CLI help coverage for `session` module: updated all sixteen verbs in `base/.contexture/modules/session/scripts/` to provide exhaustive usage lines, behavior explanations, exit codes, and self-contained copy-pasteable examples. Explicitly documented stdin block requirements for `flip`, `append`, `amend`, and `drop`, and clarified that `ANCHOR` is derived from state and must not be passed.
- Complete CLI help coverage for `ideas` module: updated `add`, `drop`, `list`, `pick`, and `show` in `.contexture/modules/ideas/scripts/` with usage, exit codes, examples, and the full `@idea` block schema for `ctx ideas add`.

## [0.51.3] - 2026-09-23

### Fixed

- Base layout module discovery: removed the workspace-specific `ideas` module leak from `base/AGENTS.md` and `docs/the-engine.md`, describing `.contexture/modules/` generically as discovered dynamically via `ctx help`.
- Dynamic module discovery at boot: updated `@boot` step 1 in `base/AGENTS.md` to invoke `.contexture/ctx help --all`, establishing runtime self-discovery as the single source of truth across all workspaces.

## [0.51.2] - 2026-09-23

### Fixed

- The docs check covers the guide pages: a depth-1 `docs/*.md` claimed by a corpus doc is governed, so a guide edit demands its claimant ride the same change; unclaimed markdown stays outside.
- The untracked-claimant verdict: a governed file whose claimants are all untracked reports `CLEAN (PROCESS-OWNED)` and hands the reconciliation to the process instead of a false `STALE`; one tracked claimant among several restores the delta rule.
- The close gate's self-planted matrix plants a local repository for the claimant trackedness probe (and fails loudly without git).
- Guide corrections: the `ctx help` row names the module summaries, the delegating-verbs count is precise (the exec wrappers, the parsed-options query, the self-contained gate), and the overlay sample shows the live local-amendment block.

### Changed

- This repository's agent-facing corpus (`docs/workspace/`) is untracked working state: gitignored, maintained through the overlay laws and the docs rhythms; the guides stay tracked and keep the docs-sync law.

## [0.51.1] - 2026-09-23

### Fixed

- The docs-discipline rhythms teach the module verbs: the work, authoring, and drift rhythms name `ctx docs audit`, `ctx docs check`, `ctx docs query`, and `ctx docs gate` instead of the retired instrument short names.

## [0.51.0] - 2026-09-23

### Added

- The plugin frame: `plugins/` replaces `examples/` as the tracked catalog of distributable overlays. A plugin mirrors the target tree (only `README.md` and `tests/` are plugin-meta), installs into an existing setup after adoption, and declares its own needs; five plugins ship (`starter-rhythms`, `toolchain-filters`, `lane-isolation`, `docs-discipline`, `ast-doc-graph`), each addressed as "the <name> plugin" and carrying adoption, needs, and contribution sections. `docs/plugins.md` carries the packaging, adoption, naming, and test-convention contract.
- Plugin suites: `plugins/<name>/tests/run.sh` runs a plugin's own suite; the upstream runner invokes every plugin suite by convention and reports it, and a declared need skips with the need named.
- The `docs` module from the docs-discipline plugin: `ctx docs query|audit|check|gate|nudge` over a typed-block corpus, with the engines private and the module README carrying the low-level map.
- The `ast-doc-graph` module: `ctx ast-doc-graph index|query` over the private pipeline (extractors, loader, schema, spec).
- The base tree: the shippable core is tracked under `base/` (a mirror of the target: `base/AGENTS.md` plus `base/.contexture/{ctx,modules/session,modules/run,templates,ONBOARDING.md}`). Its tracked tree is the payload: the archive and the update derive from it structurally, with no path tables to drift.
- The upstream test pipeline: `tests/run.sh` runs six core suites (filters, ctx, session, hooks, record-audit, governance) staged from the shipped engine, plus every plugin suite by convention; presence checks fail when a shipped surface carries no case; the ship gate states the run green before any commit, tag, or push.
- The docs-discipline corpus for this repository: `docs/workspace/` (conventions, the map, unit docs) audited clean, with the close gate wired into the close path.

### Changed

- The live root (`AGENTS.md` and `.contexture/`) is untracked working state in this repository: gitignored wholesale and never shipped. The development loop is: edit `base/`, ship, then apply `base/` onto the live drawer class-aware (sessions, rhythms, tmp, and local modules are never touched).
- The adoption and update commands read `base/`: `git archive <tag> base/ plugins/` then copy the base content into the target; the update strips the base prefix.
- The payload classes read: payload = `base/`, catalog = `plugins/` (shipped, no longer deleted at adoption close), workspace-owned = the live root paths.
- The plugin READMEs teach only `ctx` forms; the two bundles' instruments are module verbs now.

### Removed

- The `examples/` tree, superseded by `plugins/`; the plugin-side `.contexture/scripts/` interim paths; the pre-`base/` payload paths as the shipping source.

### Fixed

- The session suite's paging fixture computes the entry date at runtime; the record requires an entry slug's date prefix to be the current day, so the suite no longer breaks at a date roll.

## [0.50.0] - 2026-09-22

### Added

- The `ctx` engine: one public entry over the built-in session verbs, modules, and the `run` builtin; assembled help (`ctx help`, `ctx help --all`, `ctx <module> help [<verb>]`); engine-side verb validation with a uniform unknown-verb refusal.
- The self-describing module system under `.contexture/modules/`: a module file carrying the summary; verb scripts whose headers declare their summary, usage, and help lines; hook files that declare their point and mode; filter files that declare their match. The engine assembles; modules declare.
- Implicit hooks at six points (stamp, task-landing, close, load-pre, load-post, refresh): warn-continue by default, a block mode that stops the point, and a hidden runner the help surfaces never show.
- The `refresh` verb: the live board, the audit (its exit code is the verb's), then the refresh hooks.
- The `ideas` module: list, show, add, pick, drop over the upstream idea dump, as the first workspace module.
- `docs/modules.md`: the module authoring contract, from anatomy and declaration vocabulary to the walkthrough and the validation checklist.
- The workspace scratch drawer: `.contexture/tmp/` is the sanctioned, gitignored scratch root; engines and the test harness prefer it over the system temp.
- Unique same-directory temp saves in the record writers: concurrent write acts no longer clobber a shared temp name.

### Changed

- The record engine moves under `.contexture/modules/session/` as the base-shipped module; every surface teaches `ctx` forms; the legacy entry paths and their compatibility shims are gone.
- Stream filters live with the builtin `run` module; module filters merge after the builtin filters (name-sorted, first match wins, shadow warning, a priority-over directive for deliberate replacement).
- The update payload carries the engine, the builtin modules, the templates, and the run filters; workspace-added modules, rhythms, sessions, and tmp are never touched.
- The record's reserved-name set and the shim-free migration path are stated once in the module contract; the shell entry refuses nothing it cannot validate.

### Removed

- `.contexture/scripts/`, the legacy `session.sh` and `compact.sh` shims, and the top-level filters drawer: the engine and the modules are the whole surface.

## [0.49.1] - 2026-09-22

### Changed

- The filter test material leaves the shipped payload: the core fixture pairs and the harness move to the repository's `tests/` folder, navigated from the root README, and the setup's pairs to `examples/setups/tool-filters/tests/`. Adopting workspaces carry no test material; the upstream tests pin the shipped filters and the byte-identical adopted copies.

## [0.49.0] - 2026-09-22

### Added

- Command-identity filter selection in runner mode: `compact.sh` tests the wrapped command line against anchored `# command:` directives before the signature scan, so streams whose first signature sits past the 40-line sample window still select (a long-message `git show` selects the diff filter); a shadow warning names filters claiming one command.
- ANSI escape stripping pre-pass: escape sequences are removed before the signature scan and before the selected filter runs, while raw bytes stay for the fail-safe comparison and the passthrough.
- Recovery and safety guards: a shrinking filter whose output carries no recognized notice falls back to raw; notice-only output passes through; a false-green guard surfaces a non-zero exit with zero parsed diagnostics; per-filter `# stream: merged` keeps stderr in the filtered stream for compiler-style tools, while default stderr is whole on failure or empty stdout and tail-capped with its own notice otherwise.
- Selection transparency: `COMPACT_DISABLE=1` bypasses compaction with the exit code intact, `COMPACT_DEBUG=1` reports the selected filter and the matched line on stderr.
- Static fixture harness: `.contexture/scripts/filter-tests.sh` runs input and expected-output pairs through the filters, byte-compares, checks that every filter carries a fixture, and pins the runner mechanics (ANSI strip, command identity, notice-only false-green, recovery fallback).

### Changed

- Directive patterns reach awk through the environment, so backslash escapes in a `# match:` signature survive verbatim; directive values are whitespace-trimmed.
- The pytest filter collapses verbose summary counters, quiet progress runs, and surfaces XPASS and XFAIL.
- The vitest and jest filter matches the real reporter markers (pass, fail file, fail case, skip, and the colonless summary forms) with a failure-detail state; the byte-level multibyte bracket branches are replaced by literal alternation.
- The compiler filter matches the tsc terse, pretty, and standalone shapes alongside gcc, clang, and rustc, and adds the false-green guard; the diff filter collapses only after a hunk header, so blob shows and stat output pass verbatim, and its collapse marker names the recovery.
- The tool-filters setup reads as a menu: investigate the workspace's command streams before adopting, and carry the fixture pairs with the adopted filter.

### Fixed

- The wrapped command's exit status survives commands whose output lacks a trailing newline (direct status capture replaces the marker-based ingest).
- The raw fallbacks print no spurious newline for stderr-only commands.

## [0.48.1] - 2026-09-21

### Fixed

- The docs-discipline pack's drift gate closes three blind spots: the exclusion pattern's bare `spec` was unanchored and also swallowed `aspect`, `special`, and `specific` (now `[.]spec[.]`, `/spec/`, and `^spec/`); an architecture, overview, or workspace doc riding a change silently marked every file in the repo fresh (now reported as `FRESH (BLANKET)` plus an `ARCH-COVERED` count of the files no riding claimant covered); and the one-sided pipeline could never pass, because freshness registers only when a doc path appears in the same stdin stream. `@rule docs/drift` and the drift rhythm now require the two-sided delta, and the pack README carries the working command.

## [0.48.0] - 2026-09-21

### Added

- Incremental delta indexing for AST and documentation graphs: `examples/setups/ast-doc-graph/loader/index-graph.ts` supports `--delta` mode, opening existing databases without recreation; performs atomic cascaded deletions of old symbols, edges, and documentation records; re-links semantic `GOVERNS`, `WARNS`, and `COVERS` edges across standing database entities; updates file metadata in new `indexed_files` tracking table.
- Zero-daemon Just-In-Time (JIT) micro-sync: `bin/graph-query` checks filesystem freshness before query dispatch using system `find -newer` against `graph.db`; 0 dirty files executes directly with 0ms overhead; 1 to 2 dirty files triggers inline micro-sync via `ast-doc-index --delta` in ~300ms; 3 or more dirty files emits a non-blocking advisory notice to stderr while immediately executing the query; `--no-sync` flag bypasses freshness checks.
- SQLite Write-Ahead Logging and concurrency hardening: `schema.sql` and `graph-query` enforce `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000`, eliminating `SQLITE_BUSY` locking collisions between concurrent readers and micro-sync writers; explicit triggers (`trg_symbols_del_edges`, `trg_docs_del_edges`, `trg_rules_del_edges`, `trg_pitfalls_del_edges`) prevent orphan rows in polymorphic `edges` table.
- Multi-directory repository root discovery: `bin/ast-doc-index` automatically scans repository roots across all code directories (`components/`, `pages/`, `backend/`, `services/`, `hooks/`, `stores/`) when `--src-dir` is omitted, adhering to standard directory exclusions (`node_modules`, `dist`, `build`, `archive`, `.git`, `.contexture`, `.work`, `tests`, `__tests__`, `.worktrees`).

## [0.47.0] - 2026-09-21

### Added

- Directory listing compaction filter: `.contexture/filters/list.awk` provides zero-dependency discoverable compaction for POSIX `ls -l` and `ls -la` outputs; matches `total [0-9]+` and standard file permission signatures; strips redundant column overhead (permissions, owner, group, link counts) and condenses entries to clean `[dir]`, `[file]`, `[link]`, and `[dev]` indicators; collapses large directory listings (>40 items) into an elided summary preserving total file and directory counts; passes fail-safe checks with zero distortion on small listings.
- Universal command compaction standard: `@laws#compact-streams` elevates stream compaction to an unconditional invariant for all shell command executions; establishes direct call runner mode prefix (`.contexture/scripts/compact.sh <cmd>`) as the canonical pattern to preserve command exit codes and merge stderr automatically; `@interact` act step mandates the runner prefix for every command execution; `.contexture/templates/recipe.md` promotes `COMMAND_POLICY` to a mandatory instruction under `GROUND_AND_REFS`; `AGENTS.workspace.md` codifies raw command execution without `compact.sh` as drift.


## [0.46.0] - 2026-09-21

### Added

- AST and documentation graph setup: `examples/setups/ast-doc-graph/` links code symbols and call graph hierarchies to centralized documentation rules and pitfalls; intermediate JSONL data contracts (`symbols`, `edges`, `docs`, `doc_rules`, `doc_pitfalls`) decouple AST extraction from storage; SQLite relational schema with dual FTS5 virtual tables (`fts_symbols` with trigram tokenizer, `fts_docs` with unicode61 BM25 ranking) and cycle-safe recursive CTE queries; zero-dependency retrieval CLI `graph-query` wrapping system `/usr/bin/sqlite3` for sub-millisecond execution; unified single-shot repository indexing driver `bin/ast-doc-index`; automated pilot verification test runner `verify-pilot.sh`.


## [0.45.1] - 2026-09-21

### Added

- Stream compaction law and subagent piping rule: `@laws#compact-streams` mandates piping verbose command outputs (Git diffs, test runners, build cascades, repetitive logs) through `.contexture/scripts/compact.sh` to prevent context flooding; `@subagents` and `.contexture/templates/recipe.md` reinforce the piping rule across subagent dispatches; `README.md` introduces Stream compaction under Core concepts.


## [0.45.0] - 2026-09-21

### Added

- Discoverable stream filter architecture: `.contexture/filters/` establishes a modular drawer for stream reduction filters; each filter self-declares its match signature (`# match: <regex>`) or default status (`# default`); `.contexture/scripts/compact.sh` samples incoming streams and automatically selects the matching filter with zero CLI flags; core ships with `.contexture/filters/diff.awk` (unified diff reduction) and `.contexture/filters/log.awk` (generic log deduplication).
- Unified tool filters setup: `examples/setups/tool-filters/` provides adoptable ecosystem filters (`cargo-test.awk`, `pytest.awk`, `vitest.awk`, `go-test.awk`, `compiler-errors.awk`) that workspaces can copy into `.contexture/filters/` for automatic test runner and compiler compaction without adding maintenance overhead to core.


## [0.44.0] - 2026-09-21

### Added

- The stream compaction filter: `.contexture/scripts/compact.sh` and `.contexture/scripts/compact-filter.awk` provide zero-dependency token reduction for unified diffs and repetitive logs; piping into `compact.sh` collapses runs of unchanged context lines in Git unified diffs and deduplicates consecutive log entries with timestamp normalization; built-in fail-safe protection streams raw output unaltered if input is incompressible or if compaction produces empty or expanded output; command wrapper mode preserves the wrapped process's exit status.


## [0.43.0] - 2026-09-17

### Added

- The help forms: `help`, `--help`, and `-h` print the same text on the session entry point and on every docs-discipline instrument; the session table gains its orientation line; the bundle's `docs-audit`, `docs-check`, and `docs-nudge` wrappers join (the `docs-query` precedent), each answering the forms with what it does, its exact invocation, its exit codes, and an example, and delegating every other invocation byte-faithfully to its engine; `docs-gate`'s help lists the whole instrument family; every engine's usage head names its wrapper.

### Changed

- The dispatch vocabulary: one prose mapping (a subagent, the record's older name noted once at the folder's line) and `subagent` in every other surface, so the common term is what agents keep reading; `@subagents` opens with the dispatch definition (a step that names a subagent runs as a dispatched subagent: its own context, its own folder, its own report); the boot names the exact help command with its accepted forms; the kept paths and names (`lanes/`, the page filename, the setup name, the query kind) resolve unchanged.

## [0.42.0] - 2026-09-17

### Added

- The docs-discipline bundle's architecture shape gains the system map: an `@components` block for workspace-level maps beside the per-repository shape, registered in the audit; the template comments carry the interrogation method (datastore geometry, wire reality, domain equations, failure physics).
- The authoring rhythm runs eleven steps (adding the backlog declaration, the interrogation pass, the reconcile depth gate, and the cross-repository trace with signposts and bilateral links); the drift rhythm gains its backlog declaration.
- The gate warns on branch and commit lag by default and gains `--drift`, which evaluates the incoming remote delta (merge-base form) so locally ahead commits never read as incoming deletions; the scans cover nested, flat, and root-repository topologies.
- The check and query engines normalize quoted source globs and dual topology prefixes.

### Changed

- The authoring rhythm conforms to the one-line step form with the method one-homed in the template comments; the bundle's flavor is neutralized; the sample map teaches the system-map shape; the README documents the drift modes, the warnings, and the team semantics: only the un-reflected incoming changes are marked, a riding doc being the workflow's mark, the co-change test the mechanical net.

## [0.41.0] - 2026-09-17

### Added

- The `THREAD` field is required on every session entry: `THREAD: <what it awaits>` names the act outside the unit's own flow that must resolve the entry (the human's response, a dispatched lane's report, another unit's act), and `THREAD: none` marks a receipt. The recording doorway refuses a missing line, an empty value, a duplicate line, and the boolean spellings.
- The audit flags a missing `THREAD` from 2026-09-18 forward and prints the open threads with their targets; the board and the load tail render the open threads beside the open tasks; the lane journals carry the field when the lane awaits.

### Changed

- The marker's doctrine is rewritten: born at the write, never flipped, closed in the same breath by the resolving entry; the agent's own executions (the state and the board carry them) and the harvest (the audit's knowledge check carries it) are no longer threads.

## [0.40.0] - 2026-09-17

### Added

- The load's pages are budgeted twice: about 500 lines or about 40 KB, whichever binds first, ending each page before the block that would cross it, so a page stays under common harness output caps; the flow is unchanged (numbered pages, the map, the banners, the completion), the content identical, only the cut points move. A single block larger than the budget renders whole on its own page.
- The confinement law's sanctioned recovery: the harness's saved copy of a command's own truncated output is the agent's own output, sanctioned to read, read-only, the named file alone; the temp-file routing stays unsanctioned.
- The handoff's cold read is bounded: the map and the state page, the backlog section with its open tasks whole, the journal's tail, the knowledge tail when this period landed findings, and the audit; the full-body pass belongs to the next boot, a fresh context.

### Changed

- The docs carry the budgeted cut and the bounded handoff; the load dispatch pins a byte-oriented locale so the budget holds on every awk.

## [0.39.0] - 2026-09-17

### Added

- The recording commands: `session.sh append` takes one or more typed blocks in a single call and dispatches each by its first line (an entry to the journal, a finding to knowledge, a task to the backlog); `amend` replaces task fields; `flip` moves status across one or many slugs, with a done call landing one receipt that carries each slug's event and evidence; `drop` removes tasks with one record naming each; `next`, `refs`, and `close` cover the state's moves.
- One worker carries the acts: every form validates all inputs before any write, refuses loudly with the fix named, and re-emits the canonical block shape; the help rows name each form, its template, and its stdin.

### Changed

- The BIOS names the commands and the artifact terms, never the session files; the REFs stay pointer data.
- The lane files, the authorized surgeries, and the state's identity fields stay outside the command set by named decision; the audit remains the reveal instrument behind the commands.

## [0.38.1] - 2026-09-17

### Added

- The journal's folding practice: at a human-called chapter turn, entries may fold into a comprehensive digest carrying the chapter's synthesis and its decision sets whole; the digest's `CLOSES` fold the originals by reference and stand as the fetch map; folded entries leave the load, never the file.
- The reading path: a summary or a digest is an entry point, never the whole story; a reader who needs the detail fetches the original by its slug, one command away.

### Changed

- The journal grammar template and the record docs carry the same two ideas. The clauses ride a proving-ground run: a folded copy answered a twelve-question reconstruction set against the live record, ten of twelve at the skeleton bar, the rest supplied by the documented fetch path.

## [0.38.0] - 2026-09-16

### Added

- The load renders DONE task blocks compactly: the backlog section prints each completed block as its task line, `STATUS`, `OBJECTIVE`, and `DESCRIPTION`; open and statusless blocks render whole, and the backlog file itself is never edited, so the full body stays one resolve away. On the live record the section shrinks by roughly half while every reference keeps resolving.
- `resolve` accepts `backlog.md#<slug>`: one line prints the whole task block verbatim (past the load's compact render, since it reads the file), with the loud miss `ERROR: no such task`, malformed symbols refused through the supported set, and a missing backlog named.

### Changed

- The suite pins the new behaviors (the compact render and its drop set, the in-span note rule, the CRLF direction, the empty-present placeholder, the real-render field-count invariant, and the resolve backlog cases).
- The wrapper's help rows and the engine, load, and record docs carry both behaviors.

## [0.37.0] - 2026-09-16

### Added

- The session query family: `session.sh query` answers the ten foreseeable looks over session artifacts with one named form each (entry, group, anchors, finding, closure, units, refs-to, resolve, lane, search). Group and search snippets cut at 90 bytes, search stops at 50 lines with a trailing count, and every miss is loud: rc 1, zero stdout, a named error, never a plausible empty. A group thread renders deliberately uncapped, one line per entry, so a large thread streams whole.
- `session-query.awk` is the single engine behind the forms: BSD-safe awk, no dependencies, one argument shape per kind with validation before any output.
- The suite extends the canonical copy with the query cases, the fixtures, and the control mutation; a discrimination run against the pre-fix engine pins each guard to its case.

### Changed

- The BIOS and the manuals stop prescribing grep: `@query` carries `query units <repo>`, `query refs-to <session>`, and `query group <unit> <token>`; the anchor map grep in the manuals becomes `query anchors <unit>`.
- The wrapper's help table lists the query rows, and the README, the engine docs, and the record docs carry the family and its bounds.

## [0.36.2] - 2026-09-16

### Added

- The docs-discipline setup bundle ships: `examples/setups/docs-discipline/` carries a corpus-first documentation discipline: a typed-block corpus grammar, six POSIX instruments (the audit, the query engine and its CLI, the coverage and drift check, the nudge, and the close gate with a self-planted matrix), the authoring and drift rules, three rhythms (the workspace's work rhythm with the docs discipline, the authoring and drift procedures), a fictional two-repo sample, and an onboarding README. The bundle ships adoption-tested on a real single-repo corpus; the adaptations live in that record.

### Changed

- The bundle's README carries the calibration stance (the pack ships reference mechanics; the adoption reads the repo's structure and makes the structural remedies on the spot, recording the local deltas), the lane markings on the heavy steps, the SYNC preflights, the one-homed widened coverage filter, and the eight-scenario matrix.
- The seed's `section-refs` example re-points to a real unit doc.
- The workspace overlay pins the changelog naming discipline: no adopter, project, or personal names in the changelog's text; those live in the record.

## [0.36.1] - 2026-09-15

### Added

- The first setup bundle ships: `examples/setups/lane-isolation/` carries the on-demand worktree setup (the two overlay blocks verbatim from the workspace's own overlay, the `.worktrees/.gitignore` guard, and a plain-language README), and the README's docs index lists it beside the example rhythms. Per the human's call it ships unexercised: the setup reflects the configuration in force, its README marks it young, and the first real use still verifies the pattern.

## [0.36.0] - 2026-09-15

### Added

- The refs form on the load: `session.sh load refs <ref_1> ... <ref_N> [<page>]` streams those sessions read-only, each composed exactly as the unit load composes a reference (the notice, the knowledge, the live journal), in its own local pages with its own map, banner, and tail. The boot's declared `ref_sessions` composition is unchanged; this is the on-demand consult. Any existing session is nameable, a missing one refuses at rc 1, zero refs prints the usage, and a trailing numeric argument is the page. A session named `refs` stays reachable through the escape hatch `load refs refs`.

### Changed

- The unit load's ref composition and page loop are extracted into shared functions, so the refs form's bytes come from the same home as the unit load's and cannot drift. A non-numeric second argument on the unit form now refuses with the hint pointing at the refs form.
- The README's instrument table, `docs/the-engine.md`, and `docs/units-and-lanes.md` name the form.

### Fixed

- A `state.md` that is a directory, or otherwise not a regular file, now refuses cleanly in both readers: the unit load reports the missing state, the refs form reports no such session, and the field warns and still counts it, instead of a raw interpreter error.

## [0.35.0] - 2026-09-15

### Added

- The session toolbox: one entry point. `.contexture/scripts/session.sh` fronts the workers with a strict command table (`help`, `active`, `bootstrap`, `load`, `stamp`, `board`, `audit`, `index`); `session.sh help` prints every command's contract, so no one reads a script to learn one; the boot runs it after the overlays, and every worker's misuse output points at it.
- `session-active.awk`: the field in one call. Each ACTIVE unit with its slug, anchor, next action, and objective, then the closed count. A missing sessions directory prints `no sessions yet` at rc 0, a valid adoption start; a state matching neither status spelling, or unreadable, warns on stderr and still counts.
- `session-bootstrap.awk`: a fresh unit in one call. The folder, the state at `A0`, the three empty artifacts, and the folded `A1` receipt (fresh unit, objective, workspace git state); for new units the boot's load and stamp steps fold away.

### Changed

- The BIOS reads the wrapper form: `session.sh active` replaces the field grep; steps 5, 6, and 8 read `session.sh load`, `index`, and `stamp`; step 10 reads `session.sh bootstrap` and continues at the index; `@query` reads `session.sh board`; `@close` and `@handoff` read `session.sh audit`; `@layout` names the entry point and its help.
- The README instrument table, `docs/the-engine.md`, `docs/units-and-lanes.md`, `docs/adoption.md`, `docs/rhythms.md`, the ONBOARDING verify block, and the template samples read the wrapper forms; the ONBOARDING bootstrap procedure uses `session.sh bootstrap` with the folded receipt.

### Fixed

- The guard rails: any dash-leading argument, in any position, refuses at the entry point (the refusal table to stderr, rc 1, zero stdout), so awk's option parser never sees a flag; the wrapper anchors every command at the workspace root; `session-bootstrap` refuses brackets and quotes in `repos` and quotes in the objective, all with zero partial writes. The fresh review found the dash and working-directory classes (silent rc 0 reads, silent writes, and a silent `no sessions yet` from a subdirectory) and the harden pass closed them, covered by the suite.

## [0.34.1] - 2026-09-15

### Fixed

- The base keeps `branch/worktree` together and never says `worktree` alone: `templates/recipe.md`'s `BRANCH` comment drops to `# required`, and `docs/units-and-lanes.md`'s recipe paragraph reads the active `branch/worktree` with the working root in the write scope. A bare mention would read as an endorsement of the mechanism. The workspace overlay is untouched: there the choice is explicit by design.

## [0.34.0] - 2026-09-15

### Added

- The recipe grammar requires `BRANCH`: every recipe names the active branch the lane works on, with the worktree path, when one is used, sitting in `WRITE_SCOPE`. The fact is held to at write time by the template shape and the `@subagents` wording; it deliberately carries no worktree policy, so a dispatcher can give a lane the unit's branch or one of its own.

### Changed

- `docs/units-and-lanes.md`'s recipe paragraph is aligned.

## [0.33.0] - 2026-09-15

### Added

- The journal grammar gains the rhythm stamp: entries that advance a rhythm carry `RHYTHM: <name> <N> <GATE>`, a label of the process in force at the write (`RHYTHM: work 6 EXECUTE`). It is a born-state stamp, never updated, omitted by entries that do not advance the rhythm; the position rides the record's streams with nothing in state to maintain.

### Changed

- `@rhythms`'s contract carries the counterpart clause (its presence stamped on the advancing entries, never maintained), and `session-audit.awk`'s bracketed-field and inline-marker lists include `RHYTHM` so the `[RHYTHM: ...]` literal-copy fires. `templates/journal.md`, `docs/the-record.md`, and `docs/rhythms.md` are aligned.

## [0.32.2] - 2026-09-15

### Changed

- The knowledge map line states the boundary positively: findings are what is true, what was decided and why, or what was ruled out; intent to act takes the `@task` shape in `backlog.md`; developing ideas stay journal events. `statusless` is dropped: the schema states it by omission, and naming the dimension invites it.
- The backlog is a living queue: the declaration invitation gains its counterweight (`when unsure, declare; when the need dissolves, drop it`), the opening line names advance, update, and drop with the journal holding the history, and the evolution line loses its anti-drop read (`tasks can be added, updated, reordered, or dropped`).
- `templates/knowledge.md`, `docs/the-record.md`, and `docs/units-and-lanes.md` are aligned with both halves.

## [0.32.1] - 2026-09-15

### Fixed

- The boot load's continuation signal now survives multi-tool-call batching and tail truncation: every incomplete call opens with `LOAD INCOMPLETE (page N of M): keep calling until a page reads complete; do not start work from a partial record` and closes with `keep reading: session-load.awk <slug> <N+1> (K pages remain)`; the final page opens with `LOAD COMPLETE` plus the receipt stamp command and closes with `load complete: pages M/M`. `@boot` step 5 reads "keep calling until a page reads complete"; `docs/the-engine.md`, `docs/units-and-lanes.md`, and the README instrument table are synced.

## [0.32.0] - 2026-09-15

### Added

- `session-board.awk` opens with the board counts (`board <slug>: N live entries, M open tasks`), streams every live entry with its body whole, and closes with the open task slugs under their nudge line, `the entries say what happened; these say what remains`. A missing backlog is loud on stderr and nonfatal, reading `no backlog` in the opener with no tail; a missing journal remains fatal with zero stdout.
- `@backlog` gains the declaration line: the task is where intent survives the conversation; a worthless one costs a line, a missing one is unrecoverable; when unsure, declare. The `@interact` artifacts clause now reads `backlog as work is declared and tasks move`.

### Changed

- `journal-active.awk` renamed to `session-board.awk` and `journal-audit.awk` renamed to `session-audit.awk`; the BIOS call sites, the README instrument table, `docs/the-engine.md`, `docs/adoption.md`, the ONBOARDING verify block, and the report and recipe template samples read the new names.
- `@refresh` reads the board first, its open-task list the status checklist, and calls `session-audit`; `@close 3` and `@handoff 2` read `session-audit.awk`.

## [0.31.0] - 2026-09-14

### Added

- `session-load.awk` is the boot load as a script-side pager: every invocation prints the map (the sections with their line ranges and page spans) plus one page, and the last line carries the next call while pages remain. The sections are state, backlog, knowledge, the live journal, and any `ref_sessions` (knowledge and stream under read-only banners), ending with the write-scope trailer. Pages cut only at block starts near 500 lines, so a body never splits; small units end at one page with no nudge.
- `session-stamp.awk` writes the load receipt: it derives the next anchor from `state.md`, rewrites `current_anchor`, and appends the anchor line with the attention verbatim, refusing empty, whitespace-only, or newline attention, malformed anchors, and non-ACTIVE state with no partial write.

### Changed

- `journal-active.awk` and `journal-audit.awk` accept only the session slug; a path, the legacy double path, extra arguments, and the refs flags all fail loud with a usage line and rc=1. `journal-active.awk` stays as the updated board.
- `rhythms-index.awk` gains its shebang and defaults to `.contexture/rhythms/` with no arguments; arguments and a missing directory fail loud.
- The BIOS call sites and the documentation read the executable form, `.contexture/scripts/<name>.awk <slug>`: `@boot` steps 5, 6, and 8, `@query`, `@close 3`, and `@handoff 2` in `AGENTS.md`; the README instrument table (five instruments, one form each); `docs/the-engine.md`, `docs/units-and-lanes.md`, `docs/adoption.md`, and `docs/rhythms.md`; the ONBOARDING verify block; the report template's sample.

### Fixed

- The silent-empty class (the v0.29.3 trap): a wrong invocation produced an empty stream at rc=0, a failure shaped like success. Every script now fails loud on a wrong invocation; `session-load.awk` surfaces the composed helper's exit status, so a broken helper fails the load instead of printing the success-shaped `(no active entries)`; dash-leading slugs are refused across the scripts.

## [0.30.1] - 2026-09-14

### Added

- Added `docs-sync` law and `docs sync` requirement to ship breath in `AGENTS.workspace.md`, ensuring all changes to base mechanics, scripts, templates, or governance audit and update README.md and relevant docs/ before release.

### Changed

- Documentation updated across `docs/the-record.md`, `docs/the-engine.md`, `docs/units-and-lanes.md`, and `README.md` to document `ref_sessions` in `state.md`, multi-session reference streaming in `journal-active.awk`, and session slug support across scripts.

## [0.30.0] - 2026-09-14

### Added

- Sessions support linking read-only reference context via the optional `ref_sessions` field in `state.md`. Boot loads knowledge from referenced sessions fully and streams active journal entries, preserving read-only isolation while providing grounding across sessions.
- `journal-active.awk` supports multi-session reference streaming via `-v refs=1` and `-v refs_only=1`, automatically resolving `ref_sessions` declared in `state.md` and printing a clear read-only delimiter reminder banner.
- `tools/` ignored by default in `.gitignore` for workspace-local utilities.

### Changed

- Script ergonomics: `journal-active.awk` and `journal-audit.awk` accept session slugs directly without requiring full file paths or legacy double paths.

## [0.29.9] - 2026-09-13

### Changed

- The Core concepts section in the README reformatted from a markdown table into clean, lean sub-headings, improving mobile readability and eliminating table wrapping friction while keeping plain-language definitions.

## [0.29.8] - 2026-09-13

### Added

- The Installation section in the README gains a "What happens next?" lifecycle walkthrough explaining the 3-step sequence after the bootstrap prompt: automated unit folder creation, natural language interaction, and millisecond cold-boot recovery on context compaction.

### Changed

- The Core concepts section replaced its verbose cards with an intuitive 4-row plain-language table, eliminating academic vocabulary and presenting immediate concrete utility for Units, Lanes, Rhythms, and Overlays.

## [0.29.7] - 2026-09-13

### Changed

- The README sections and in-page navigation list reordered to prioritize motivation and adoption: Why contexture leads first, followed immediately by Installation, Architecture, Core concepts, and Docs.

## [0.29.6] - 2026-09-13

### Changed

- The README in-page navigation bar switched from an inline horizontal row to a compact vertical bullet list for cleaner mobile and desktop rendering.

## [0.29.5] - 2026-09-13

### Changed

- The README gains a single-line horizontal in-page navigation bar right after the opening triad line, allowing readers to jump directly to Architecture, Core concepts, Why contexture, Installation, or Docs without scrolling.
- The "Quickstart" section heading in the README is renamed to "Installation" to match standard developer scanning and search conventions on GitHub.

## [0.29.4] - 2026-09-13

### Changed

- The README is refactored into a fast, visual storefront based on reader feedback: opens on a blunt two-sentence value proposition passing the 5-second test, visualizes traditional compaction against contexture memory across five dimensions, consolidates root governance and the drawer into a unified architecture tree, introduces scannable concept cards with concrete functional definitions linked to docs/, condenses the architectural triad, and provides an unambiguous 60-second quickstart while pruning 32 lines of redundant narrative prose.

### Added

- `AGENTS.workspace.md` gains the `background-subagents` law under `@laws`: subagents and lanes run strictly in the background; the turn ends immediately at launch and never blocks the conversation or polls for completion.

## [0.29.3] - 2026-09-12

### Fixed

- The bracketed-marker trap: AGENTS.md @journal and the journal, backlog, and knowledge templates now spell optional fields bare, with "optional" in the comments, and the dialect line states that brackets wrap optional values, never field names. Agents had copied the bracketed field list literally while the audit recognized only the bare form, so real threads vanished from the open-thread tail with rc=0.
- journal-audit.awk adds a BRACKETED FIELD defect class (a "  [FIELD: ..." line) with the line number and a nonzero exit, so the malformed copy can no longer hide; null-checked with the planted form, and the bare form keeps the tail intact.
- Two comment dashes in the scripts removed per the dashes rule.

## [0.29.2] - 2026-09-12

### Fixed

- The dashes rule swept the older surfaces: 148 spaced hyphens used as punctuation replaced with colons, semicolons, commas, or parentheses across AGENTS.md, the templates, CHANGELOG.md, ONBOARDING.md, and the example rhythms. Line-start list markers and the Keep a Changelog heading separator stay as classified syntax; the residual classified scan is empty and no em or en dashes remain.
- `.gitignore` whitelists `examples/`, which has been tracked since v0.27.1 but was not whitelisted, so new files there could not be staged normally.

## [0.29.1] - 2026-09-12

### Changed

- The README states the design's three properties out loud: the first screen's footer carries "lightweight, abstracted, extensible", and a section after "Why it works" unpacks each (lightweight by construction, abstracted by design, extensible without forks).

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

- The example rhythms moved from `.contexture/examples/` to the root `examples/`: reference material belongs outside the drawer, so updates never propose syncing it into adopted workspaces.
- The update payload is now explicit: `AGENTS.md` + `.contexture/templates/` + `.contexture/scripts/`; adoption material (`.contexture/ONBOARDING.md`, `examples/`) is used once at adoption and never re-synced; workspace-owned `.contexture/sessions/` and `.contexture/rhythms/` are never touched (README, ONBOARDING, and the sync guidance aligned).

## [0.27.0] - 2026-09-11

### Added

- `.contexture/examples/rhythms/{work,debug}/`: example rhythms with per-folder READMEs explaining them in plain terms; the work README states its token-heavy, multi-lane nature and its fit for cheaper, decent models (structured flow and redundancy closing the gap to frontier models).
- ONBOARDING: when no team rhythm emerged by the plan's end, the example rhythms are offered as the starting set; on confirmation they are copied into `.contexture/rhythms/`.

## [0.26.0] - 2026-09-11

### Added

- The session audit: `journal-audit.awk` now also flags unharvested KNOWLEDGE flags, DONE tasks without their `backlog/<slug>: DONE` event, and IN_PROGRESS tasks absent from `state.md`; siblings derived from the journal path, single-arg invocation unchanged, any finding exits nonzero (the `@close`/`@refresh`/`@handoff` gate).

### Changed

- `@rhythms`: a gate closes by its artifact: DECIDE by the backlog, VERIFY/LAND by the completion receipt carrying its evidence, REFRESH by the harvest; a gate closed by memory is debt.
- `@backlog`: the completion event carries its evidence: the command run and its observed result.
- The audit's defect classes are named at `@close` and in README (unharvested KNOWLEDGE, DONE-without-event, IN_PROGRESS-absent-from-state).

## [0.25.0] - 2026-09-11

### Added

- Law `@laws#workspace-confinement`: the current workspace (the repo/worktree the agent was started in) is the boundary; never read, write, search, or otherwise reach outside it unless the human specifically asks for that act; an apparent outside need stops and asks; the agent never roams.

### Changed

- The laws are slug-addressed: ordinals dropped, each law reads `slug: statement` (`source-of-truth`, `load-only-needed`, `writer-holds-volume`, `process-free`, `compose-from-record`, `verify-before-close`, `harvest-the-human`); a law is referenced as `@laws#<slug>`; slugs are unique across the merged base + overlays; overlays append freely with no renumbering (the overlay laws keep their texts minus the ordinals). The live references were swept (AGENTS.md, README.md).

## [0.24.2] - 2026-09-10

### Changed

- The references practice applied to the handoff chain: @handoff step 1 names its target (@close 1-3), and @refresh's caller list reads "shared by rhythm boundaries, @close, and @handoff"; the handoff runs the refresh (and the harvest) through the close path.

## [0.24.1] - 2026-09-10

### Changed

- The sync procedure is derived, never listed: adoption and updates copy what the upstream tag tracks (`git archive <tag> AGENTS.md .contexture/`), verified with `git ls-tree` plus a cmp per file. No manifest to maintain; the tag's tracked set is the synced set, and the drawer holds what the convention uses (the synced set plus the workspace's sessions and rhythms), nothing else. README and ONBOARDING aligned.

## [0.24.0] - 2026-09-10

### Changed

- The convention's files move into a `.contexture/` drawer: `templates/`, `scripts/`, `ONBOARDING.md`, `rhythms/`, and `sessions/` live there; `AGENTS*.md` stay at the root for harness loading and point into the drawer for the rest. Workspace-owned files keep their root layout. In the source, the drawer is whitelisted while `.contexture/rhythms/` and `.contexture/sessions/` stay untracked; each adoption decides its own tracking. Every base pointer (AGENTS.md, README.md, ONBOARDING.md, the grammars, the script usage comments) reads the drawer spelling.

## [0.23.2] - 2026-09-10

### Changed

- The harvest moves into @refresh: it runs at every rhythm boundary and inside @close: every open flag proposed as one candidate, landed with approval, closed by reference; frequent small harvests replace the rare batch. @close's step 4 is gone (its period-scoped grep was the hole that let older flags hide); @close now reads refresh, stray audit, journal audit, stays ACTIVE. Every "(@close 4)" reference in the base now reads "(@refresh)"; README aligned.

## [0.23.1] - 2026-09-10

### Changed

- Reference sweep applied to the base: "the harvest" cites (@close 4), the default-loop mentions cite @rhythms (@boot step 9, @interact), and README names the four record files it points at.

## [0.23.0] - 2026-09-10

### Added

- The references practice in @record: a pointer names its target exactly: the section and step (@close 4), or path#symbol (journal.md#slug); a vague prose mention is a defect. README's dialect section aligned.

## [0.22.1] - 2026-09-10

### Changed

- @backlog's container charge reworked: IMPLEMENTATION DETAILS carries the specification and the execution blueprint: the requirements and decisions the change must honor, and how it lands. The abstract enumeration is gone; the readiness bar and the no-placeholder rule still enforce executability. README aligned.

## [0.22.0] - 2026-09-10

### Changed

- The default design loop runs `@refresh` explicitly as its final step: when no rhythm is invoked, the loop is DISCUSS -> DECIDE -> BACKLOG -> EXECUTE -> VERIFY -> REFRESH. README aligned.

## [0.21.0] - 2026-09-10

### Added

- `@refresh`: the artifact sweep factored out of `@close` and shared by rhythm boundaries: the events journaled, the backlog statuses advanced, `next_action` refreshed (one terse pointer, overwritten never prepended; the WHY rebuilds from open items + GROUNDED IN + live findings), settled verdicts flagged; the journal audit run, what it flags fixed; nothing closes there. `@close` step 1 calls it, then closes the period's done events by reference.

### Changed

- README aligned: the Close section names the refresh first, and the boot walkthrough's step 9 matches the base: the invoked rhythm, the matching rhythm on its trigger, or the default.

## [0.20.1] - 2026-09-10

### Added

- `scripts/rhythms-index.awk`: the rhythm selection index: one line per rhythm (name, path, `use when:`, activation), grammar-aware, defaulting a missing activation to propose.

### Changed

- The boot loads the rhythm index (@boot step 6): the trigger lines are the selection index, and rhythm bodies load only on selection; @boot step 9 continues on the invoked rhythm, the matching rhythm on its trigger, or the default. This completes v0.20.0's trigger/activation feature with its load side.
- README aligned: boot step 6, the files table, and the rhythms section note the index.

## [0.20.0] - 2026-09-10

### Added

- @rhythms gains two contract fields: `use when:` carries triggers only: a workflow summary becomes the shortcut agents follow instead of the steps; `activation: propose | auto` decides whether the agent proposes the matching rhythm before applying it (the default) or applies it on trigger after the team opts in, the @interact gates still holding.
- @backlog gains the readiness bar, the activation scan, and the no-placeholder rule: a task marked IN_PROGRESS is executable as written; before activation the executor scans the task (placeholders, checkable criteria, resolving REFs); a failing task returns, never execute around a gap.
- @subagents gains the lane boot and the load receipt: lanes read the overlays, state, backlog, knowledge, the recipe, and every REF it names (read-only; session surfaces are never lane-written); the first journal entry lists the refs loaded, and an unresolved REF is a brief defect; pause-ask or stop and report, never work around the gap.
- @interact carries the recording invariant for all session artifacts (journal at the event, backlog as tasks move, state as position changes, knowledge verdicts flagged as they settle) with see-pointers to their sections and shapes in @record/templates/.
- ONBOARDING.md gains the @close phase: delete it once the adoption closes; it is the procedure, not the convention; the @layout line annotates the file as deleted when the adoption closes.

### Changed

- @interact revised: the dialogue resolves intent, constraints, and approach; the restate carries the intended approach and its tradeoffs; the confirm gate is never skipped, however small; a discovery that outgrew the confirmed intent halts back to confirm.
- @subagents drift redefined: a decision within the brief is the lane's; a wall or a decision beyond it is drift: pause and ask for steering where the harness supports it, abort the fallback; the action trace is the exact stopping point, so a steer continues live and a re-dispatch resumes from the folder. Journals land as things happen, never batched; only task receipts batch. Parallel lanes only for independent domains; shared state or ordering means sequential.
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

- Two new workflow sections in the base. @journal teaches the mechanism instead of a record-type list: the journal rebuilds the working context from scratch (a fresh boot loads the active entries and nothing else), events land at formation (work beats never wait for interaction beats), an entry carries its substance (what happened, the result, why the next step follows), and the dialect's why (the token-efficient form preserves the context window while minimizing info loss, so completeness is cheap: record fully, without worry). @plan carries the composition workflow: the plan composes from the record, and GROUNDED IN references the persisted surfaces only (journal items, lane reports, knowledge findings, never a volatile file) so the plan reads with the full picture no matter when it is read.
- The handoff gains the cold read: run journal-active.awk and read the stream as a fresh boot would: the record must reconstruct the position without the conversation; while the context is still full, improve the quality and fix what was missed. The gaps close now, never after compaction.

### Changed

- Law 3 reworded to the generic principle: the schema holds the shape, the writer holds the volume; guidance names what deserves the record, never how much; token efficiency is the dialect, never a cap on content; omit ornament, never substance. A field report drove the release: an agent investigated a workspace thoroughly but wrote a thin plan and an empty journal while the comprehensive design lived only in chat prose; compaction killed the prose and the session was unrecoverable. The convention's terseness invitations had been restricting content, not form.
- @record slimmed to the map: what each artifact records and why, one line each, with pointers to the workflow sections; the poured details moved to @journal and @plan.
- scripts/journal-dangling.awk renamed scripts/journal-audit.awk: the role outgrew the name (four malformation classes plus the open-thread tail). The close step reframes it as a repair instrument: fix what it flags and fill what is missing before the period ends.
- The templates swept of volume prescriptions and given importance guidance instead: the plan grammar guides its elements and leaves the rest freestyle under the generic nudge (record comprehensively), the journal WHAT carries the event's substance, report DETAILS omit ornament but never substance, and state.md's terseness is declared as design (the map, not the content). No surface the agent fills mentions thickness: naming the dimension creates a decision point, and any mention biases.
- The README and ONBOARDING align: the plan and journal sections carry the composition and reconstruction stories, and the files-written section states the shape/volume split.

## [0.17.0] - 2026-09-07

### Changed

- The boot trigger is positional, not semantic: the first message of a fresh context is a boot by definition, whatever its shape: a boot request, a dumped task, a question. The boot reads the message as the move signal, fields the active units with one grep, matches the message against them, and proposes the move (continue the close match or bootstrap a new unit) waiting for the answer before anything works. A field test caught an agent jumping straight to work on a dumped message and skipping the boot entirely: semantic triggers have a base rate; positional ones do not.

## [0.16.6] - 2026-09-07

### Changed

- The dangling audit sees the grammar. It now flags three malformation classes it was blind to (dateless entry slugs, inline `[THREAD:` / `[KNOWLEDGE:` markers on @entry lines, and closers with no valid date-slug target) each with its line number, and exits 1 on any of them. A field sample proved the old audit passed a journal full of broken entries vacuously: its green was noise. The fix flow is agent-driven: the audit reveals, the agent executes the refit, the re-audit verifies clean.

## [0.16.5] - 2026-09-07

### Added

- The onboarding record lifecycle: the adoption session bootstraps at phase 1 and every phase journals as it happens; the record carries the whole history: findings, proposals, verdicts, changes. A field test caught the session bootstrapped empty at the last phase, the entire adoption story left unrecorded.
- The default rhythm runs the execution: at the verdict, the confirmed plan lands in plan.md, next_action points at the first step, every step's completion journals and advances next_action, drift REPLANs in the same breath: the adoption is the convention's first customer and its first demonstration.

### Changed

- @verify slims to the live record: the queries run against the journal that has existed since phase 1, and the review covers the adoption record alongside the diff.

## [0.16.4] - 2026-09-06

### Changed

- @propose runs in two segments, each ending at a gate that hands control to the human and waits: ask in chat and end the turn; the gate is the tool loop's exit, never skipped, never merged. Segment one presents the brief and the findings and gates the plan preparation; segment two pre-plans, forwards the open questions through the harness's question tool when it has one, and gates the final verdict on the updated plan. A field test caught the loop running through the whole proposal to the approval ask: the gate is the exit the loop was missing.

### Removed

- The proposal file and its cleanup step: the presentation rides in the gate questions and the question bodies, and nothing needs persisting.

## [0.16.3] - 2026-09-06

### Added

- The brief as the proposal's opening field: what contexture is, what it promises, what it tries to solve, what it provides, and what this workspace gains against its current setup, written for a human who knows nothing about the repo and grounded in the assessment's findings. The proposal file opens with it.

### Changed

- The pre-plan and the final plan land as a file: onboarding-proposal.md at the repo root, prose only, every question naming the path, the verdict question repeating it and summarizing the changes, the file removed after the verdict. Six field tests proved the channel split: files and the question tool always arrived; chat prose mid-execution never did.

## [0.16.2] - 2026-09-06

### Changed

- @propose became an ordered sequence: the pre-plan presents in prose first, the open questions go against the plan the human just read, the plan updates per the answers with the changes presented, and the final verdict lands on the updated plan only. A field test caught an agent requesting approval for a plan it never presented: parallel rule lists carry no order, and order-sensitive procedures need numbered sequences.

## [0.16.1] - 2026-09-06

### Changed

- The proposal's two audiences split. The filled grammar is the working copy; tmp holds it; the human reads proper prose, the same content organized by the shape's sections, never the raw dialect.
- The open questions forward through the harness's question tool when one exists, so the human answers in place; free text when the harness has none.

## [0.16.0] - 2026-09-06

### Added

- The onboarding proposal grammar, inline in ONBOARDING.md. The PROPOSE phase fills a fixed shape whose fields are contexture's features: copy set, overlay material, local preferences, rhythm extractions, sessions handling, symlinks, gitignore strategy, deletions, untouched, and the open questions; every field answered, none stating none. Four field reports showed prose coverage is stochastic: features became fields, and filling the shape walks them all deterministically. The shape lives in ONBOARDING.md itself, a one-shot artifact, not a recurring template.

### Changed

- @propose slimmed to the gate: no write before the verdict, the completeness rule, ambiguity at the proposal; the structure delegated to the @proposal grammar.

## [0.15.0] - 2026-09-06

### Added

- The rhythm placement principle, declared in the base. The per-turn surfaces carry interaction rules only; work patterns are rhythm material: extracted from the instruction stack at onboarding, proposed as they emerge. Until now the principle lived only in contexture's own session knowledge and never shipped, which is why onboardings kept missing workflow extractions.
- The destination buckets in the onboarding plan. The installation plan organizes the moves by destination home and answers each explicitly (overlay material, rhythm extractions, deletions, untouched); an empty home states none. The question can no longer be skipped silently: the extractions answer is on the page for the human to challenge.

### Changed

- The README's rhythms section carries the delivery split and the onboarding move: interaction rules need every-turn delivery, work patterns need per-boot delivery in rhythms/, so workflows found in a workspace's instruction stack are the first rhythm candidates.

## [0.14.1] - 2026-09-06

### Changed

- The anchor bump is defined at the boot step where it happens: a boot is a fresh context load (compaction, session restart), never a turn boundary; turns inside one working context journal under the standing anchor. Twenty anchors stamped inside a single continuous context revealed the ambiguity between the boot-side bump and the close-side period.

## [0.14.0] - 2026-09-06

### Added

- The onboarding agent now knows the convention whole before mapping: it reads the base AGENTS.md and the upstream README completely (ONBOARDING.md is the procedure, not the convention) and the README carries the philosophy behind every judgment the mapping makes.
- The destination-driven mapping. The agent walks the convention's sections one by one against the workspace's material (for each capability, what feeds it, what conflicts with it, what belongs there) instead of scanning a file list. Migration follows the destination: a step-by-step workflow living in a workspace's AGENTS.md surfaces as a rhythm candidate because the agent walked the rhythms section knowing what rhythms are for.

## [0.13.2] - 2026-09-06

### Removed

- `templates/changelog.md`. The changelog's shape is the external Keep a Changelog standard, stated in this file's own header, and its contexture-specific rules (the ship-breath timing and the tag-range completeness) live in the workspace overlay's git section. The template was a second home waiting to drift, not a grammar to pin.

## [0.13.1] - 2026-09-06

### Changed

- The onboarding assessment grounds in the workspace's self-description: the existing AGENTS.md and its derivations are read first and whole as the guide to the workspace's rules, and the sweep covers only what the stack misses (contributing guides, style and lint configs, CI rules, documentation conventions). The assessment maps every rule surface against the incoming convention (contradicting, overlapping, or complementing) and the plan must carry a resolution for each: migrated, superseded, coexisting, or flagged for the human. The agent asks freely what only the human knows (resolutions, history, intent) and presents the open questions beside the plan, never burying assumptions.

## [0.13.0] - 2026-09-06

### Added

- The PROPOSE phase in the onboarding flow. The onboarding agent derives everything detectable from the repository on its own (topology, instruction surfaces, harnesses) presents the derived installation plan, and writes nothing before the human's verdict; ambiguity surfaces at the proposal, never mid-execution. Execution is strictly bound to the confirmed plan: drift halts and re-confirms.

### Changed

- The onboarding phases restructured from a linear execution script into the convention's own design loop: ISOLATE, ASSESS, PROPOSE, EXECUTE, VERIFY: the human sees the plan before the writes, not only the diff after them.

## [0.12.0] - 2026-09-06

### Added

- The update nudge, frozen into the base. AGENTS.md gained a standalone `@update` section, one line that will not change: the base evolves upstream, and the upgrade guidance lives in this README's Updating section, fetched fresh from upstream at every update. The layering is the design: the nudge points at the README, the README carries the guidance and directs to the CHANGELOG, so the update strategy can evolve without downstream bases ever changing.
- The Updating guidance: updates are judgment, not a script. The agent reads the CHANGELOG between its installed version and the target, reads its own workspace (overlay @replace blocks, live sessions, in-flight artifacts), decides (adopt, migrate, or wait) and verifies with the workspace's own instruments. The copy commands are means in the agent's hands, never a prescribed pipeline.

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
