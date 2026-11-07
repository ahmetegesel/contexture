# Adoption

contexture is a convention, not a tool: one commit, any harness, no dependencies. Adoption installs it into your repository and then deletes its own instructions. This page covers both adoption paths, what you review, the choices that depend on your repository's topology, and how the installation stays current.

## Adoption in one breath

What lands is a small set of plain files: `AGENTS.md` at the root and the `.contexture/` drawer beside it. Nothing is installed: no dependency, no service, no runtime. The files are the system. `AGENTS.md` is the loader: its first instruction composes the generated law layer, `AGENTS.generated.md` at the root beside it, from the core law source and the installed modules, then reads it whole; the laws live there, not in the loader. The plugin catalog is an optional addition, shipped with the same tag and installed into the extension root with the package installer when a workspace wants one of its overlays (the manual path below shows the install).

Adoption is a procedure, not the convention. `.contexture/ONBOARDING.md` carries it, an agent runs it, and it is deleted when the adoption closes. What remains is the convention itself: the record and the process.

Either path ends the same way: name your first unit of work and the record starts. The best first unit is contexture itself: adopting, tweaking, and living with it is the richest possible workload for testing it.

## The fast path, agentic onboarding

Point an agent at `.contexture/ONBOARDING.md`. It adopts the base alone, and the proposal phase gates twice: the agent stops and waits for you there. The plugin catalog is optional; the manual path below lands its reference copy, and each plugin's README carries its adoption through the package installer.

1. ISOLATE: it creates a dedicated branch, never working on main, halts if the tree carries uncommitted changes, and bootstraps the adoption unit. The record starts before the first edit, so the whole adoption history lands as it happens.
2. ASSESS: it reads your instruction stack first and whole (the existing `AGENTS.md` and its derivations), then reads the generated law layer and this project's README completely. It maps the convention's sections against your workspace one by one: what feeds each capability, what conflicts with it, what belongs there. Structure comes from listings; application code is out of scope; and it asks you what evidence cannot answer: resolutions, history, intent.
3. PROPOSE: it presents the installation plan in two gated segments (next section). Nothing is written before your verdict.
4. EXECUTE: it lands the confirmed plan, running the default loop. Drift halts execution and re-confirms.
5. VERIFY: it runs the boot query and the audit against the live record, then reviews `git status`, `git diff`, and the adoption record with you, ready for the PR.

Finish by naming your first unit of work.

## The manual path

For adopting by hand, start on a branch and copy the set:

```
git checkout -b adopt-contexture
mkdir .adopt-contexture
git archive <tag> base/ plugins/ | tar -x -C .adopt-contexture
cp -R .adopt-contexture/base/. .
cp -R .adopt-contexture/plugins .
rm -rf .adopt-contexture
chmod +x .contexture/ctx .contexture/laws/compose .contexture/package-install .contexture/package-uninstall .contexture/modules/*/scripts/* .contexture/modules/*/filters/*.awk .contexture/extensions/modules/*/scripts/* plugins/*/install plugins/*/uninstall 2>/dev/null || true
sh .contexture/laws/compose
```

`base/` mirrors the target tree, so its content copies into place: `AGENTS.md` lands at the root, the drawer alongside it; `plugins/` lands at the root as the catalog to install from. The copy carries a semantic version: MAJOR breaks existing artifacts (fields removed, shapes changed), MINOR adds sections or features, PATCH fixes wording. The installed version is the header line of `AGENTS.md`.

The compose builds `AGENTS.generated.md` at the root, a sibling to `AGENTS.md`, `AGENTS.workspace.md`, and `AGENTS.local.md`, from the core law source, `.contexture/laws/core.md`, and the installed modules' laws. It is gitignored and never edited; the loader composes or verifies it at every boot, so a stale or absent layer cannot boot, and an absent compose or core source is a broken payload the agent stops on, naming the path.

Then configure the choices the agent would have proposed: the gitignore posture for your topology, your overlays, and the harness symlinks. If no team rhythm emerged from your instruction stack, the starter-rhythms plugin is the starting set: install it on the human's go and edit the installed copies freely.

```
sh plugins/starter-rhythms/install
```

A plugin install reads the package `manifest` (summary, version, kind, parts, and the driver name for a driver package), overlays only the declared parts under `.contexture/extensions/`, records every installed path and mode under `.contexture/extensions/.state/<package>.files`, refuses a collision (a path outside the extension root, a core path, an existing non-recorded file, another package's file, a module or driver name collision, a duplicate namespace, a declared part that is absent, a payload path outside the declared parts), runs the module part hooks after the record, and recomposes the generated law layer (a compose refusal surfaces loudly, never as a stale layer). A re-install of the recorded files is an update; `sh plugins/<name>/uninstall` removes the unchanged recorded files, preserves and reports a file changed after install, and recomposes the law layer.

Then name the first unit of work; the agent bootstraps its folder and the record starts.

## What you review, the proposal

In the agentic path, the proposal is the one document you genuinely read. It is written for you as prose, never presented as the raw working grammar, and it arrives in two segments. Each segment ends at a gate: the agent asks in chat, ends its turn, and waits.

Segment one, the ground. The agent presents the brief (what contexture is, what it promises, what your workspace gains against its current setup, written for someone who knows nothing about the repo) and its assessment findings. You approve preparing the plan, or discuss.

Segment two, the plan. The agent presents the plan as prose and asks its open questions beside the material they touch. You answer, it updates the plan, shows you what changed, and asks for the verdict on that updated plan only. An approval ask for an unseen or stale plan is never valid, and no workspace write happens before the verdict.

Behind the prose, the plan fills fixed fields, each answered; none states none:

```
copy        the adoption set, derived from the tag
overlay     which existing rules migrate into AGENTS.workspace.md
local       AGENTS.local.md preferences
rhythms     work patterns found in your stack, proposed as rhythm files
units       existing unit folders (the record root, or the deprecated sessions root): adopted, archived, or left
symlinks    harness entry points to wire
gitignore   the strategy for your topology
deletions   existing rules the convention supersedes
untouched   what deliberately stays outside contexture
questions   what only you can answer
```

## Topology and gitignore choices

There is no universal `.gitignore` block; the topology decides, and the tracking of the record and rhythms is a team choice either way.

Standalone repository (application code lives here): never deny by default, so existing project files keep tracking. Append your personal amendments (`AGENTS.local.md`) to the existing ignore file, and decide with the team whether `.contexture/units/` (with the deprecated `.contexture/sessions/` while units remain in it) and `.contexture/rhythms/` are tracked or ignored. Tracked, the record travels with the repository; ignored, the record stays local. Both are defensible; the convention requires neither. Whatever the choice, ignore the composed law layer with the root-anchored line `/AGENTS.generated.md`: it is built at install and boot and never tracked. A repository that ignored the layer at its old place replaces its `.contexture/laws/AGENTS.generated.md` ignore line with `/AGENTS.generated.md` once the update's compose has removed the legacy file (Updating, step 9, before the step 10 review); never whitelist an `AGENTS*.md` glob, which would track the generated layer.

Parent workspace (multiple repositories, the workspace tracks convention configuration alone): deny by default and whitelist shared files explicitly:

```
*
!.gitignore
!AGENTS.md
!AGENTS.workspace.md
!README.md
!.contexture/
!.contexture/**
!CLAUDE.md
!GEMINI.md
```

The generated law layer, `AGENTS.generated.md`, sits at the root under the deny-by-default `*`, so the block keeps it ignored with no line of its own: whitelist the AGENTS files by name, never with an `AGENTS*.md` glob, which would track the generated layer. A workspace that re-ignored the layer at its old place drops its `.contexture/laws/AGENTS.generated.md` re-ignore line once the update's compose has removed the legacy file (Updating, step 9, before the step 10 review). The last two stand for the harness entry points you wire; keep only the ones in use. This repository keeps a stricter shape: its live root (the same `AGENTS.md` and `.contexture/`) is untracked working state, its agent-facing corpus is never committed (untracked working state at `docs/workspace/` under the files driver, the store alone under a store driver), and the shippable core is tracked mirrored under `base/` (see Payload classes and syncing).

## Migration, overlays, symlinks

Existing instruction files do not vanish; their project-specific rules move to overlays. Extract architecture, build and test commands, code style, and the rest from `AGENTS.md`, `CLAUDE.md`, or whatever the workspace uses, and place them in `AGENTS.workspace.md` under the appropriate blocks (`@append @laws`, and so on). Migration follows the destination, never the file list: the instruction stack guides the sweep, and the sweep covers what the stack misses: contributing guides, style and lint configs, CI rules, documentation conventions. Existing rules the convention supersedes are listed in the plan's `deletions` field; nothing disappears silently.

Initialize `AGENTS.workspace.md` with the workspace versioning rules and `AGENTS.local.md` with local preferences. Amend freely, never contradict: the laws stand, and an overlay that breaks one silently breaks what depends on it. `@replace` is a last resort, since the replaced base text still loads and the agent can hold two versions of one section; prefer `@append`, and re-check replaced sections after every sync.

The law layer moves some rules out of the overlays: the installed modules' laws compose into `AGENTS.generated.md`, and the overlays stay workspace-owned. When an existing overlay already carries a rule that now has a module home (the docs laws, the docs layout, boot, and close clauses, the lane clauses), remove the overlay copy at upgrade: the boot compose refuses a duplicate law slug across the generated layer and both overlays.

For each harness file found during the assessment, or each active harness in use, wire the entry point as a symlink to the base file:

```
ln -s AGENTS.md CLAUDE.md
```

Where symlinks are not possible, duplicate `AGENTS.md` or reference it.

## Verify and close

Three checks before the branch merges:

```
.contexture/ctx unit load adopt-contexture
.contexture/ctx unit audit adopt-contexture
git status
git diff
```

The first loads the adoption unit: the map plus every page; the second must exit 0; the last two are the review surface you read alongside the adoption record.

Then the adoption procedure goes away. Delete `.contexture/ONBOARDING.md`: it is the procedure, used once, not the convention; remove any gitignore whitelist line naming it. The `plugins/` folder stays: it is the tracked catalog, installable into an existing setup whenever the workspace wants one of its overlays.

## Payload classes and syncing

Not everything in the drawer syncs from upstream. Three classes, and placement follows the class:

| class | paths | fate |
|---|---|---|
| update payload | `base/`: the mirrored core (`base/AGENTS.md`, `base/.contexture/{ctx,package-install,package-uninstall,storage,laws,modules/run,modules/unit,extensions,ONBOARDING.md}`) | applied onto the live root from tags, byte for byte |
| catalog | `plugins/` | installed into the extension root when wanted; shipped with every tag, never deleted at adoption close |
| workspace-owned | `.contexture/units/` (and the deprecated `.contexture/sessions/` while units remain in it), `.contexture/rhythms/`, `.contexture/tmp/`, workspace-added modules under `.contexture/modules/` | never touched |

The synced set is derived, never declared: `base/` is the payload; `git archive <tag> base/` copies it, `git ls-tree` enumerates it, and a `cmp` per file verifies it. No manifest exists to drift; the tag's index is the declaration. Overlays are never in `base/`, and they survive every sync untouched. `.contexture/ONBOARDING.md` rides the payload as adoption material: used once, deleted at close, redelivered by a later apply and deleted again.

In this repository the live root (`AGENTS.md` and `.contexture/`) is untracked working state, and so is the agent-facing corpus (`docs/workspace/`) under the files driver (under a store driver it lives in the store alone); the dev loop edits `base/` directly, ships a tag, and applies the payload onto the live drawer class-aware:

1. Edit `base/` directly: it is the shipping copy.
2. Ship: docs sync, commit, push, and the annotated tag in one breath.
3. Apply: first read the version actually live in the drawer by comparing its files against the tags (the payload compare below), never by assuming the previous tag; then `cp -R base/. .` from the repository root. The copy carries only payload paths, so the record, rhythms, tmp, and workspace modules are never touched. A copy adds and replaces files but never removes one: delete from the live drawer every payload path removed since the live version (`git diff --name-status --diff-filter=D <live-tag> <tag> -- base/` lists them).
4. Compose the law layer right after the copy and the hand deletes: `sh .contexture/laws/compose`. The generated layer is gitignored, never shipped, and rebuilt after any package or payload change; the first boot verifies or recomposes it too, and the compose removes a legacy layer left at the old place. Then run the payload compare: it prints nothing once no removed path is left.
5. Verify the live install: the boot load, the audit, and the ground check.

The payload compare lists every live payload path the release lacks, whatever range the deletes came from:

```sh
diff -rq base/.contexture .contexture | grep -v -E '^Only in \.contexture(/modules|/extensions|/extensions/modules)?: '
```

Each `Only in .contexture/...` line it prints is a missed delete; a `differ` line or an `Only in base/...` line is a copy that did not land; no output means the drawer's payload class equals the release. The generated law layer sits at the root, outside the compared folders, so the compare skips nothing: a legacy layer left in `.contexture/laws/` prints as a missed delete, which is why the compare runs after the compose that removes it. The `grep` drops the direct children of the four folders where workspace-owned paths and installed packages sit beside the payload (the drawer's top, its module folder, the extension root, and the extension root's module folder), so a payload member removed whole at that level shows only in the range. The same compare reads the version actually live, which the `AGENTS.md` header cannot always show: a release that bumps no header keeps the previous one (v0.63.0 kept v0.62.0's). Before the copy, extract a candidate tag's tree into a new scratch folder (`mkdir -p .contexture/tmp/<name> && git archive <tag> base/ | tar -x -C .contexture/tmp/<name>`) and run the compare with `.contexture/tmp/<name>/base/.contexture` as its first operand: the live version is the tag it finds no differing file against. On a drawer composed before v0.68.0 the detection reads the one line `Only in .contexture/laws: AGENTS.generated.md` as the legacy layer, never as a difference: the compose after the copy removes it. The range from the previous tag once missed a verb file v0.63.0 removed while the drawer still held v0.62.0, and the compare found four posix driver awk files v0.61.0 removed that every later apply had left behind.

## Updating

The base evolves upstream, and updating is judgment, not a script: the changes are semantic, and every workspace differs. The path:

1. Read your installed version: the header line of `AGENTS.md`; a release that bumps no header keeps the previous one, so step 6 reads the version actually live from the files. MAJOR breaks existing artifacts (fields removed, shapes changed), MINOR adds sections or features, PATCH fixes wording.
2. Fetch the upstream tags: `git fetch https://github.com/ahmetegesel/contexture.git --tags`.
3. Read the CHANGELOG from your installed version to the target: what changed and why.
4. Read your workspace: the overlay's `@replace` blocks, live units, in-flight artifacts.
5. Decide: adopt now, migrate first, or wait.
6. Copy the payload: first read the version actually live in the drawer with the payload compare against the tags (see Payload classes and syncing), never from the header alone; then `git archive <tag> base/ | tar -x --strip-components=1 -C <your-repo>`; the archive carries only payload paths, so workspace-owned paths are never touched. The archive adds and replaces files but never removes one, so delete every payload path removed since the live version (`git diff --name-status --diff-filter=D <live-tag> <tag> -- base/` lists them): v0.55.0, for one, removes the session verbs `append`, `amend`, `query`, `flip`, and `drop` and three posix driver awk files, and a removed verb file left behind still lists in `ctx unit help` though its call prints the replacement. Then run the payload compare with the target tag's tree extracted into scratch as its first operand: it prints nothing once no removed path is left, except on a drawer composed before v0.68.0, where its one line `Only in .contexture/laws: AGENTS.generated.md` is the legacy layer the step 9 compose removes, never a missed delete.
7. Verify it: `git ls-tree -r --name-only <tag> -- base/` plus a `cmp` per file against the applied paths.
8. Update the installed packages: for each install record `.contexture/extensions/.state/<name>.files`, compare its `version` line with the `# version:` line of the target's catalog manifest (`git show <tag>:plugins/<name>/manifest`). A release that changes a plugin's payload bumps that version, so an equal version means the installed payload is current and needs nothing; a different one means the catalog holds a newer payload: refresh that package's catalog folder from the tag (remove `plugins/<name>/`, then `git archive <tag> plugins/<name>/ | tar -x -C <your-repo>`), and on the human's go re-install it (`sh plugins/<name>/install`; a re-install of the recorded files is an update, and it recomposes the law layer).
9. Compose the law layer: `sh .contexture/laws/compose`. The generated layer is gitignored, never shipped, and rebuilt after any package or payload change; a boot verifies or recomposes it too. The compose also removes a legacy layer left at the old place, so the ignore line edit of Topology and gitignore choices follows here.
10. Review the staged diff before committing; it shows you the changed base.
11. Run your instruments against the result: the boot query, the audit, the ground check. After a MAJOR tag, review the overlay: its rules were written against the old shape, and the docs and lane clauses moved to the module laws (a duplicate slug refuses at boot).

The payload applies cleanly, and your record, rhythms, tmp, and workspace modules are never touched; the classes hold on every update.
