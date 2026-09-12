# Adoption

contexture is a convention, not a tool: one commit, any harness, no dependencies. Adoption installs it into your repository and then deletes its own instructions. This page covers both adoption paths, what you review, the choices that depend on your repository's topology, and how the installation stays current.

## Adoption in one breath

What lands is a small set of plain files: `AGENTS.md` at the root, the `.contexture/` drawer beside it, and `examples/` as reference. Nothing is installed: no dependency, no service, no runtime. The files are the system.

Adoption is a procedure, not the convention. `.contexture/ONBOARDING.md` carries it, an agent runs it, and it is deleted when the adoption closes. What remains is the convention itself: the record and the process.

Either path ends the same way: name your first unit of work and the record starts. The best first unit is contexture itself: adopting, tweaking, and living with it is the richest possible workload for testing it.

## The fast path, agentic onboarding

Point an agent at `.contexture/ONBOARDING.md`. It runs five phases, and the proposal phase gates twice: the agent stops and waits for you there.

1. ISOLATE: it creates a dedicated branch, never working on main, halts if the tree carries uncommitted changes, and bootstraps the adoption session. The record starts before the first edit, so the whole adoption history lands as it happens.
2. ASSESS: it reads your instruction stack first and whole (the existing `AGENTS.md` and its derivations), then reads the base `AGENTS.md` and this project's README completely. It maps the convention's sections against your workspace one by one: what feeds each capability, what conflicts with it, what belongs there. Structure comes from listings; application code is out of scope; and it asks you what evidence cannot answer: resolutions, history, intent.
3. PROPOSE: it presents the installation plan in two gated segments (next section). Nothing is written before your verdict.
4. EXECUTE: it lands the confirmed plan, running the default loop. Drift halts execution and re-confirms.
5. VERIFY: it runs the boot query and the audit against the live record, then reviews `git status`, `git diff`, and the adoption record with you, ready for the PR.

Finish by naming your first unit of work.

## The manual path

For adopting by hand, start on a branch and copy the set:

```
git checkout -b adopt-contexture
git archive <tag> AGENTS.md .contexture/ examples/ | tar -x -C <your-repo>
chmod +x .contexture/scripts/*.awk
```

`AGENTS.md` lands at the root, the drawer alongside it, and the examples at the root as reference. The copy carries a semantic version: MAJOR breaks existing artifacts (fields removed, shapes changed), MINOR adds sections or features, PATCH fixes wording. The installed version is the header line of `AGENTS.md`.

Then configure the choices the agent would have proposed: the gitignore posture for your topology, your overlays, and the harness symlinks. If no team rhythm emerged from your instruction stack, the examples are the starting set: copy them into place and edit the copies freely.

```
cp -R examples/rhythms/* .contexture/rhythms/
```

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
sessions    existing session folders: adopted, archived, or left
symlinks    harness entry points to wire
gitignore   the strategy for your topology
deletions   existing rules the convention supersedes
untouched   what deliberately stays outside contexture
questions   what only you can answer
```

## Topology and gitignore choices

There is no universal `.gitignore` block; the topology decides, and the tracking of sessions and rhythms is a team choice either way.

Standalone repository (application code lives here): never deny by default, so existing project files keep tracking. Append your personal amendments (`AGENTS.local.md`) to the existing ignore file, and decide with the team whether `.contexture/sessions/` and `.contexture/rhythms/` are tracked or ignored. Tracked, the record travels with the repository; ignored, the record stays local. Both are defensible; the convention requires neither.

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

The last two stand for the harness entry points you wire; keep only the ones in use. The source repository follows the same shape, then re-ignores `.contexture/rhythms/` and `.contexture/sessions/` so per-workspace content never ships upstream.

## Migration, overlays, symlinks

Existing instruction files do not vanish; their project-specific rules move to overlays. Extract architecture, build and test commands, code style, and the rest from `AGENTS.md`, `CLAUDE.md`, or whatever the workspace uses, and place them in `AGENTS.workspace.md` under the appropriate blocks (`@append @laws`, and so on). Migration follows the destination, never the file list: the instruction stack guides the sweep, and the sweep covers what the stack misses: contributing guides, style and lint configs, CI rules, documentation conventions. Existing rules the convention supersedes are listed in the plan's `deletions` field; nothing disappears silently.

Initialize `AGENTS.workspace.md` with the workspace versioning rules and `AGENTS.local.md` with local preferences. Amend freely, never contradict: the laws stand, and an overlay that breaks one silently breaks what depends on it. `@replace` is a last resort, since the replaced base text still loads and the agent can hold two versions of one section; prefer `@append`, and re-check replaced sections after every sync.

For each harness file found during the assessment, or each active harness in use, wire the entry point as a symlink to the base file:

```
ln -s AGENTS.md CLAUDE.md
```

Where symlinks are not possible, duplicate `AGENTS.md` or reference it.

## Verify and close

Three checks before the branch merges:

```
awk -f .contexture/scripts/journal-active.awk .contexture/sessions/adopt-contexture/journal.md .contexture/sessions/adopt-contexture/journal.md
awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/adopt-contexture/journal.md
git status
git diff
```

The first streams the live record from the adoption session, bodies whole; the second must exit 0; the last two are the review surface you read alongside the adoption record.

Then the adoption material goes away. Delete `.contexture/ONBOARDING.md` and the `examples/` folder: they are the procedure, used once, not the convention. If your gitignore block names `ONBOARDING.md` explicitly, remove that line with it.

## Payload classes and syncing

Not everything in the drawer syncs from upstream. Three classes, and placement follows the class:

| class | paths | fate |
|---|---|---|
| update payload | AGENTS.md, .contexture/templates/, .contexture/scripts/ | synced from tags |
| adoption material | .contexture/ONBOARDING.md, examples/ | used once, never re-synced, deleted at adoption close |
| workspace-owned | .contexture/sessions/, .contexture/rhythms/ | never touched |

The synced set is derived, never declared: what the tag tracks under the payload paths is the set. `git archive` copies it, `git ls-tree` enumerates it, and a `cmp` per file verifies it. No manifest exists to drift; the tag's index is the declaration. Overlays are never in the path, and they survive every sync untouched.

## Updating

The base evolves upstream, and updating is judgment, not a script: the changes are semantic, and every workspace differs. The path:

1. Read your installed version: the header line of `AGENTS.md`. MAJOR breaks existing artifacts (fields removed, shapes changed), MINOR adds sections or features, PATCH fixes wording.
2. Fetch the upstream tags: `git fetch https://github.com/ahmetegesel/contexture.git --tags`.
3. Read the CHANGELOG from your installed version to the target: what changed and why.
4. Read your workspace: the overlay's `@replace` blocks, live sessions, in-flight artifacts.
5. Decide: adopt now, migrate first, or wait.
6. Copy the payload: `git archive <tag> AGENTS.md .contexture/templates/ .contexture/scripts/ | tar -x -C <your-repo>`.
7. Verify it: `git ls-tree -r --name-only <tag> -- AGENTS.md .contexture/templates/ .contexture/scripts/` plus a `cmp` per file.
8. Review the staged diff before committing; it shows you the changed base.
9. Run your instruments against the result: the boot query, the audit, the ground check. After a MAJOR tag, review the overlay: its rules were written against the old shape.

Adoption material never re-syncs, and your sessions and rhythms are never touched; the classes hold on every update.
