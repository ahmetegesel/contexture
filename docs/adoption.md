# Adoption

contexture is a convention, not a tool: one commit, any harness, no dependencies. Adoption installs it into your repository and then deletes its own instructions. This page covers both adoption paths, what you review, the choices that depend on your repository's topology, and how the installation stays current.

## Adoption in one breath

What lands is a small set of plain files: `AGENTS.md` at the root and the `.contexture/` drawer beside it. Nothing is installed: no dependency, no service, no runtime. The files are the system. `AGENTS.md` is the loader: its first instruction composes the generated law layer, `AGENTS.generated.md` at the root beside it, from the core law source and the installed modules, then reads it whole; the laws live there, not in the loader. The fresh-workspace installer (`install.sh`) is git-agnostic, preserves any pre-existing non-contexture `AGENTS.md` (staging contexture's loader at `.contexture/tmp/AGENTS.loader.md`), and lands the optional plugin catalog at `.contexture/plugins/` (with `./plugins/` as fallback in existing setups) so `ctx package` can inspect host readiness and install overlays when a workspace wants them.

Adoption is a procedure, not the convention. `.contexture/ONBOARDING.md` carries it, an agent runs it, and it is deleted when the adoption closes. What remains is the convention itself: the record and the process.

Either path ends the same way: name your first unit of work and the record starts. The best first unit is contexture itself: adopting, tweaking, and living with it is the richest possible workload for testing it.

## The fast path, agentic onboarding

Start with either the **Guided** (default) or **Fast** prompt to your AI agent, or run `install.sh --non-interactive` yourself first and point an agent at `.contexture/ONBOARDING.md`. It stages the base plus the `.contexture/plugins/` catalog (and preserves any pre-existing `AGENTS.md`), and pauses once for confirmation before writing workspace configuration. During onboarding, the agent inspects the catalog with live readiness checks via `.contexture/ctx package catalog`, `.contexture/ctx package list`, and `.contexture/ctx package info <name>`, and installs chosen plugins only on your explicit confirmation.

1. ISOLATE: verifies `.contexture/ctx` is executable first (running shell commands through `.contexture/ctx run` thereafter), creates a dedicated branch when inside a git repository without onboarding on main, halts only if unrelated dirty project files exist (ignoring pre-staged adoption files), and bootstraps the adoption unit while recording the active mode (`guided` or `familiar`); in a non-git workspace, it skips branch creation and bootstraps directly. The record starts before the first edit, so the whole adoption history lands as it happens.
2. ASSESS: checks whether `.contexture/tmp/AGENTS.loader.md` exists before reading it, reads your instruction stack first and whole (including any untouched pre-existing `AGENTS.md`), reads the contexture loader (`.contexture/tmp/AGENTS.loader.md` if preserved, else `AGENTS.md`), the generated law layer, and this project's README, and inspects live catalog plugins and host readiness via `.contexture/ctx package catalog`, `.contexture/ctx package list`, and `.contexture/ctx package info <name>`. It maps the convention's sections against your workspace one by one: what feeds each capability, what conflicts with it, what belongs there. Structure comes from listings; application code is out of scope; and it asks you what evidence cannot answer: resolutions, history, intent.
3. PROPOSE: presents a single combined proposal tailored to the active mode (`guided` by default, speaking in plain English about only what affects you and your repository while hiding internal plumbing; or `familiar`, giving a crisp plan summary) with one confirmation pause before writing workspace configuration.
4. EXECUTE: it lands the confirmed plan, running the default loop, installs confirmed plugins on your go, swaps `.contexture/tmp/AGENTS.loader.md` into `AGENTS.md` after migrating existing rules, and wires harness symlinks. Drift halts execution and re-confirms.
5. VERIFY: completes execution tasks, lands findings, and records closing events first (with no record writes after the load), checks `ctx compose --check`, runs `ctx unit load adopt-contexture`, `ctx unit audit adopt-contexture`, and `ctx docs gate` (when `docs-discipline` is installed in git), reviews `git status` and `git diff` (when in a git repo) with you before closing `adopt-contexture`, deletes `.contexture/ONBOARDING.md`, `.contexture/tmp/proposal.md`, and any leftover `.contexture/tmp/AGENTS.loader.md`, and delivers either the `guided` 10 to 15 line orientation plus optional Q&A tour offer or the `familiar` 3-line verification receipt before you start a fresh session so the new loader boots on turn 1.

Finish by naming your first unit of work.

## The manual path

For a fresh workspace (with or without git), run the installer interactively in your terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/ahmetegesel/contexture/main/install.sh | sh
```

The interactive terminal installer prints a 3-line pre-write summary of what will be added and asks `Proceed? [Y/n]` before writing any file (declining exits 0 with zero writes). It then frames core vs optional plugins in 2 plain lines before displaying `.contexture/ctx package catalog` with live readiness checks so you can inspect plugins (`info <name>`) and install selected ones with explicit `y/N` confirmation, finishing with a next-steps summary naming the Guided and Fast onboarding prompts, fresh-chat boot, and `ctx package catalog`. For pinned, offline, dry-run, or programmatic agent runs, pass flags (via `sh -s --` when piped):

- `--non-interactive`: never open `/dev/tty`; install core plus `--plugins` only
- `--plugins=<list>`: comma-separated catalog plugin names, or `none` (core only)
- `--tag=<vX.Y.Z>`: pin an exact release tag (mutually exclusive with `--from`)
- `--from=<path>`: install offline from a local checkout directory or `.tar.gz`/`.tar` archive
- `--dir=<path>`: target an existing workspace directory (default `.`)
- `--dry-run`: print the resolved installation plan without writing files

If you prefer a manual zero-script extraction from a release tarball (or a git checkout), extract the base and catalog into place while preserving executable bits (`tar` preserves mode bits without a blanket `chmod`), strip upstream `plugins/*/tests/`, place the catalog at `.contexture/plugins/`, and compose the law layer:

```sh
git checkout -b adopt-contexture
mkdir .adopt-contexture
git archive <tag> base/ plugins/ | tar -x -C .adopt-contexture
cp -Rp .adopt-contexture/base/. .
rm -rf .adopt-contexture/plugins/*/tests
cp -Rp .adopt-contexture/plugins .contexture/plugins
rm -rf .adopt-contexture
.contexture/ctx compose
```

`base/` mirrors the target tree, so its content copies into place: `AGENTS.md` lands at the root, the drawer alongside it; `.contexture/plugins/` lands as the catalog to install from (`./plugins/` remains a supported fallback). The copy carries a semantic version: MAJOR breaks existing artifacts (fields removed, shapes changed), MINOR adds sections or features, PATCH fixes wording. The installed version is the header line of `AGENTS.md` (or `.contexture/tmp/AGENTS.loader.md` when `install.sh` preserved an existing `AGENTS.md`).

The compose builds `AGENTS.generated.md` at the root, a sibling to `AGENTS.md`, `AGENTS.workspace.md`, and `AGENTS.local.md`, from the core law source, `.contexture/laws/core.md`, and the installed modules' laws. It is gitignored and never edited; the loader composes or verifies it at every boot through `.contexture/ctx compose`, so a stale or absent layer cannot boot: an absent engine or a refused compose is a broken payload the agent stops on, reporting the compose's error line, which names the missing or refused path.

Then configure the choices the agent would have proposed: the gitignore posture for your topology, the git package choice (no default; the docs-discipline module's change-aware checks need git), your overlays, and the harness symlinks. Inspect available plugins and host readiness any time with `.contexture/ctx package catalog` and `.contexture/ctx package info <name>`. If no team rhythm emerged from your instruction stack, the starter-rhythms plugin is the starting set: install it on the human's go and edit the installed copies freely.

```
.contexture/ctx package install starter-rhythms
```

The git package is a separate choice with no default: install it on the human's go as well.

```
.contexture/ctx package install git
```

`ctx package install <name>` takes a catalog name (resolving `.contexture/plugins/<name>` first, falling back to `plugins/<name>`) or a package root path (a value holding a slash), always installs into the workspace whose engine runs it, and runs only on the human's explicit go at the act, a gate the verb itself never checks. The install reads the package `manifest` (summary, version, kind, parts, and the driver name for a driver package, plus optional catalog metadata), overlays only the declared parts under `.contexture/extensions/`, records every installed path and mode under `.contexture/extensions/.state/<package>.files`, stashes any package-level `hooks/uninstall`, refuses a collision (a path outside the extension root, a core path, an existing non-recorded file, another package's file, a module or driver name collision, a storage root another installed module resolves to, a module data file whose root cannot be checked because it cannot be read, a module name outside the module name rule, a declared part that is absent, a payload path outside the declared parts), runs the module part hooks and package `hooks/install` non-interactively after the record, and recomposes the generated law layer (a compose refusal surfaces loudly, never as a stale layer). A re-install of the recorded files is an update; `.contexture/ctx package uninstall <name>` runs the stashed uninstall hook and module part hooks, removes the unchanged recorded files, preserves and reports a file changed after install, and recomposes the law layer. Every install writes the package's line into the workspace configuration (`.contexture/config`), `package.<name>: <source> [--as=<module>=<alias>]...`, through the shared locked configuration writer, and every uninstall removes it, so `.contexture/config` declares what the workspace installs, as a manifest declares what its lockfile pins: track it, in a standalone repository too, and a fresh clone reproduces its packages with one bare `.contexture/ctx package install` on the human's go (a configuration line is never a go, and boot never installs from it). `--as=<module>=<alias>` installs a module under another name when its name collides, and `.contexture/ctx package list` shows the declared packages against the installed ones, flagging a package declared but missing, installed but undeclared, or at a version its declared source no longer holds; an install record area it cannot read refuses rc 2, never reading as nothing installed. Inspect effective workspace configuration and declared schemas read-only via `.contexture/ctx config load`, `.contexture/ctx config get <ns>.<key>`, and `.contexture/ctx config schema`, and change domain settings through their owning verbs (`.contexture/ctx store config` for `storage.*`, `.contexture/ctx search config` for `search.*`).

Then name the first unit of work; the agent bootstraps its folder and the record starts.

## What you review, the proposal

In the agentic path, the proposal is the one confirmation pause before any workspace configuration write or package install. The agent keeps an internal working draft at `.contexture/tmp/proposal.md` and pauses once in chat to wait for your verdict.

In `guided` mode (the default), the agent presents a single plain-English message containing a short 2 to 3 sentence brief of what contexture brings to your workspace, what files are added or changed vs preserved, any real habit conflicts discovered, plain-word plugin recommendations (with multi-select prompts where supported), and any open questions beside the choices they affect, while hiding internal `ctx` CLI commands, `.contexture/tmp/` paths, `@append`/`@replace` mechanics, and record slugs. In `familiar` mode, the agent skips the brief and presents a crisp plan summary (topology, files touched or preserved, candidate plugins with multi-select prompts where supported, rhythms, gitignore, symlinks, and open questions), ending both modes with an active question prompt or explicit confirmation ask. No workspace configuration write happens before your verdict.

Behind the prose, the plan fills fixed fields, each answered; none states none:

```
staging     already staged by install.sh (version, catalog at .contexture/plugins/, preserved AGENTS.md status), or manual staging source
packages    catalog plugins to install on human go, grounded in ctx package catalog probes
overlay     which existing rules migrate into AGENTS.workspace.md
local       AGENTS.local.md preferences
rhythms     work patterns found in your stack, proposed as rhythm files
units       existing unit folders (the record root, or the deprecated sessions root): adopted, archived, or left
symlinks    harness entry points to wire
gitignore   the strategy for your topology
git         the git package: install it or leave it out; no default; the docs-discipline module's change-aware checks need git
deletions   existing rules the convention supersedes
untouched   what deliberately stays outside contexture
questions   what only you can answer
```

## Topology and gitignore choices

There is no universal `.gitignore` block; the topology decides, and the tracking of the record and rhythms is a team choice either way.

The git package is a choice of its own, with no default: it carries the gitignore strategy, the branch and worktree mechanics, and the boot ground check as a module with its laws and no verbs, and the core names no git. The docs-discipline module's git dependency is a fact either way: its change-aware verbs, the check, the gate, and the drift read git's delta, the change log stamps the workspace git HEAD, and a workspace without git keeps the audit, the query, and the writes and loses the change-aware checks.

Standalone repository (application code lives here): never deny by default, so existing project files keep tracking. Append your personal amendments (`AGENTS.local.md`) to the existing ignore file, and decide with the team whether `.contexture/units/` (with the deprecated `.contexture/sessions/` while units remain in it), `.contexture/store/` (the store module's records), `.contexture/backups/` (the stamped backups a leftovers sweep keeps), and `.contexture/rhythms/` are tracked or ignored. Tracked, the record travels with the repository; ignored, the record stays local. Both are defensible; the convention requires neither. Track `.contexture/config` (its package lines declare the installs a clone reproduces) and `.contexture/plugins/` (the workspace catalog copy) unless the team explicitly chooses not to vendor the catalog. Standalone repositories using `docs-discipline` under the `files` driver ignore `docs/workspace/` (agent-facing corpus working state, never committed) while keeping `docs/*.md` guides tracked. A repository updating past the record's root move gives `.contexture/units/` the line its ignore file holds for `.contexture/sessions/` (Updating, step 9). Whatever the choice, ignore the composed law layer with the root-anchored line `/AGENTS.generated.md`: it is built at install and boot and never tracked; and ignore the scratch drawer with the line `.contexture/tmp/`, where the engine stages its own scratch at every call (Updating, step 9). A repository that ignored the layer at its old place replaces its `.contexture/laws/AGENTS.generated.md` ignore line with `/AGENTS.generated.md` once the update's compose has removed the legacy file (Updating, step 9, before the step 10 review); never whitelist an `AGENTS*.md` glob, which would track the generated layer.

Parent workspace (multiple repositories, the workspace tracks convention configuration alone): deny by default and whitelist shared files explicitly:

```
*
!.gitignore
!AGENTS.md
!AGENTS.workspace.md
!README.md
!.contexture/
!.contexture/**
.contexture/tmp/
!CLAUDE.md
!GEMINI.md
```

The generated law layer, `AGENTS.generated.md`, sits at the root under the deny-by-default `*`, so the block keeps it ignored with no line of its own: whitelist the AGENTS files by name, never with an `AGENTS*.md` glob, which would track the generated layer. The scratch drawer is the other way round: the `!.contexture/**` whitelist re-includes it, so its line `.contexture/tmp/` follows the whitelist, the later line winning. The catalog at `.contexture/plugins/` rides automatically under `!.contexture/**` without a separate root whitelist line. A workspace that re-ignored the layer at its old place drops its `.contexture/laws/AGENTS.generated.md` re-ignore line once the update's compose has removed the legacy file (Updating, step 9, before the step 10 review). The last two stand for the harness entry points you wire; keep only the ones in use. This repository keeps a stricter shape: its live root (the same `AGENTS.md` and `.contexture/`) is untracked working state, its agent-facing corpus is never committed (untracked working state at `docs/workspace/` under the files driver, the storage layer alone under a store driver), and the shippable core is tracked mirrored under `base/` (see Payload classes and syncing).

## The module catalog

The builtins ship with the base and need no install. The packages install through `.contexture/ctx package install <name>` on the human's explicit go at the act; you choose them, and the agent reads the installed surfaces through `ctx help --all`. Inspect available packages, versions, and live host readiness through `.contexture/ctx package catalog` and `.contexture/ctx package info <name>`, backed by the package manifests under `.contexture/plugins/<name>/manifest` (with `plugins/<name>/manifest` fallback), and the module preambles and package READMEs carry the descriptions this catalog restates.

| module | what it gives | when to install |
|---|---|---|
| `unit` (builtin) | the record's 35 operations over the storage layer, one value per artifact: the state, backlog, journal, knowledge, and lane artifacts | ships with the base; no install |
| `run` (builtin) | the base filter pack: diff, directory listing, and log filters selected by command identity or stream signature for `ctx run`; filter-only and silent in `ctx help` | ships with the base; no install |
| `lane` (builtin) | the subagent dispatch surface: `ctx lane` create, record, report, and show, each lane's artifacts within the unit's record | ships with the base; no install |
| `rhythm` (builtin) | the process surface: list the rhythms with their triggers and activations, show one whole, and name the rhythm in force with its next gate | ships with the base; no install |
| `store` (builtin) | the free container module: declare a container as one record of the `containers` container, then get, list, put, set, delete, check, search, and config its schema-checked records and workspace storage settings | ships with the base; no install |
| `docs-discipline` (package) | the corpus-first documentation discipline: the docs module's read and schema-checked write verbs, and its close gate over a typed-block corpus | install when agents should consult a corpus before code; its change-aware checks need git |
| `ast-doc-graph` (package) | the AST and documentation graph: index the workspace's TypeScript code and documentation corpus into one queryable graph, then query symbols, call graphs, rules, and pitfalls | install when the workspace holds TypeScript sources or a corpus to link |
| `toolchain-filters` (package) | the toolchain filter pack: pytest, vitest and jest, cargo test, go test, and compiler error filters for `ctx run` | install when the workspace runs those toolchains; adopt only the filters its streams match |
| `starter-rhythms` (package) | the starter work and debug rhythms, to copy and edit into the workspace's own | install when no team rhythm emerged from the instruction stack |
| `storage-fts5` (package) | the SQLite FTS5 storage driver: the record and the corpus in one store with dual full-text indexing and exact, hybrid, and trigram search | install when the workspace wants that store and activate with `.contexture/ctx store config set driver fts5`; needs `sqlite3` 3.44 or later with FTS5 |
| `git` (package) | the git management discipline: the gitignore strategy, the branch and worktree mechanics, and the boot ground check, as a module with laws and no verbs | a choice with no default; install when the workspace is a git repository and wants those mechanics; the docs-discipline change-aware checks need git the tool either way |

## Migration, overlays, symlinks

Existing instruction files do not vanish; their project-specific rules move to overlays and rhythms. Extract multi-step workflows and checklists into `.contexture/rhythms/<name>.md` rather than `@append @laws`, and place project-specific invariants (architecture, build and test commands, code style, and the rest) from `AGENTS.md`, `CLAUDE.md`, or whatever the workspace uses into `AGENTS.workspace.md` under the appropriate blocks (`@append @laws`, `@append @layout`, `@append @interact`). Migration follows the destination, never the file list: the instruction stack guides the sweep, and the sweep covers what the stack misses: contributing guides, style and lint configs, CI rules, documentation conventions. Existing rules the convention supersedes are listed in the plan's `deletions` field; nothing disappears silently.

Initialize `AGENTS.workspace.md` with the workspace versioning rules and `AGENTS.local.md` with local preferences. Amend freely, never contradict: the laws stand, and an overlay that breaks one silently breaks what depends on it (never append rules that contradict base laws or widen exceptions beyond what the human confirmed). `@replace` is a last resort, since the replaced base text still loads and the agent can hold two versions of one section; prefer `@append`, and re-check replaced sections after every sync.

The law layer moves some rules out of the overlays: the installed modules' laws compose into `AGENTS.generated.md`, and the overlays stay workspace-owned. When an existing overlay already carries a rule that now has a module home (the docs laws, the docs layout, boot, and close clauses, the lane clauses), remove the overlay copy at upgrade: the boot compose refuses a duplicate law slug across the generated layer and both overlays.

For each harness file found during the assessment, or each active harness in use, wire the entry point as a symlink to the base file:

```
ln -s AGENTS.md CLAUDE.md
```

Where symlinks are not possible, duplicate `AGENTS.md` or reference it.

## Verify and close

Checks after completing execution tasks, landing durable findings, and recording the closing journal event, before the adoption closes (with no record writes after `ctx unit load`; run the git commands and `ctx docs gate` when inside a git repository, or review changed files directly in a non-git workspace):

```
.contexture/ctx compose --check
.contexture/ctx config load
.contexture/ctx unit load adopt-contexture
.contexture/ctx unit audit adopt-contexture
.contexture/ctx docs gate   # when docs-discipline is installed in a git repository
.contexture/ctx run git status
.contexture/ctx run git diff
```

The first two verify the composed law layer (confirming root `AGENTS.md` is now the contexture loader) and effective workspace configuration; the third loads the adoption unit (the map plus every page); the fourth must exit 0; `ctx docs gate` verifies corpus coverage and freshness when `docs-discipline` is installed in git; and the last two are the review surface you read alongside the adoption record.

Then `adopt-contexture` closes and the adoption procedure goes away. Delete `.contexture/ONBOARDING.md`, `.contexture/tmp/proposal.md`, and any leftover `.contexture/tmp/AGENTS.loader.md`: they are temporary adoption material, not the convention; remove any gitignore whitelist line naming `ONBOARDING.md`. The `.contexture/plugins/` folder stays (or `plugins/` in earlier workspaces): it is the catalog, installable into an existing setup whenever the workspace wants one of its overlays. In `guided` mode, the agent ends with a 10 to 15 line plain-English orientation (what changes next chat, 3 tiny habits, 1 line per installed add-on, and a workspace-tailored starter prompt) plus an optional Q&A or tour offer; in `familiar` mode, it ends with a terse 3-line verification receipt. Start a fresh agent session once onboarding closes so your harness boots cleanly on the new `AGENTS.md` loader from turn 1.

## Payload classes and syncing

Not everything in the drawer syncs from upstream. Three classes, and placement follows the class:

| class | paths | fate |
|---|---|---|
| update payload | `base/`: the mirrored core (`base/AGENTS.md`, `base/.contexture/{ctx,config-lib,package-install,package-uninstall,storage,laws,modules/lane,modules/rhythm,modules/run,modules/store,modules/unit,ONBOARDING.md}`) | applied onto the live root from tags, byte for byte |
| catalog | `.contexture/plugins/` (and `plugins/` fallback) | installed into the extension root when wanted; shipped with every tag, never deleted at adoption close |
| workspace-owned | `.contexture/units/` (and the deprecated `.contexture/sessions/` while units remain in it), `.contexture/store/`, the records of a workspace-added module at its declared data root, `.contexture/backups/`, `.contexture/rhythms/`, `.contexture/tmp/`, workspace-added modules under `.contexture/modules/`, and the drawer's top files: the configuration `.contexture/config` (and the legacy `.contexture/storage.conf`), an fts5 store's database `.contexture/sessions.db` with its `-wal` and `-shm` files, and a macOS Finder `.DS_Store` | never touched |

The synced set is derived, never declared: `base/` is the payload; `git archive <tag> base/` copies it, `git ls-tree` enumerates it, and a `cmp` per file verifies it. No manifest exists to drift; the tag's index is the declaration. Overlays are never in `base/`, and they survive every sync untouched. `.contexture/ONBOARDING.md` rides the payload as adoption material: used once, deleted at close, redelivered by a later apply and deleted again.

In this repository the live root (`AGENTS.md` and `.contexture/`) is untracked working state, and so is the agent-facing corpus (`docs/workspace/`) under the files driver (under a store driver it lives in the storage layer alone); the dev loop edits `base/` directly, ships a tag, and applies the payload onto the live drawer class-aware:

1. Edit `base/` directly: it is the shipping copy.
2. Ship: docs sync, commit, push, and the annotated tag in one breath.
3. Apply: first read the version actually live in the drawer by comparing its files against the tags (the payload compare below), never by assuming the previous tag; then `cp -R base/. .` from the repository root. The copy carries only payload paths, so the record, rhythms, tmp, and workspace modules are never touched. A copy adds and replaces files but never removes one: from the repository root, delete from the live drawer every payload path removed since the live version, then each folder those deletes leave empty: `git diff --name-only --no-renames --diff-filter=D <live-tag> <tag> -- base/ | sed 's|^base/||' | while IFS= read -r p; do rm -f "$p"; rmdir -p "$(dirname "$p")" 2>/dev/null || :; done`. Rename detection stays off, since git's default reports a moved file as a rename and leaves it off the list (Updating, step 6).
4. Compose the law layer right after the copy and the hand deletes: `.contexture/ctx compose`. The generated layer is gitignored, never shipped, and rebuilt after any package or payload change; the first boot verifies or recomposes it too, and the compose removes a legacy layer left at the old place. Then run the payload compare: once no removed path is left it prints no missed delete, only the workspace's own paths.
5. Verify the live install: the boot load, the audit, and the ground check.

The payload compare lists every live payload path the release lacks, whatever range the deletes came from:

```sh
# seed the extracted tag tree when the drawer holds the package overlay root, so the diff descends into it
if [ -d .contexture/extensions ]; then mkdir -p <tag-tree>/base/.contexture/extensions/modules; fi
diff -rq -x tmp base/.contexture .contexture | grep -v -x -E 'Only in \.contexture: (units|sessions|store|backups|rhythms|tmp|plugins|config|storage\.conf|sessions\.db(-wal|-shm)?|\.DS_Store)'
```

Each `Only in .contexture...` line it prints is a missed delete unless it names a path the workspace owns beside the payload: a workspace module under `.contexture/modules/`, a local drawer folder, or an installed package under the extension root (each listed in its install record `.contexture/extensions/.state/<name>.files`, beside that `.state` folder itself). The compare descends into a folder only where both sides hold it, so when the live drawer holds `.contexture/extensions`, seed the scratch tag-tree copy with `extensions/modules` before the diff: an installed package under the extension root then reads as the workspace's own, its files listed by its install record or shipped by the tags, while a module folder under `extensions/modules` a tag shipped under `base/` still prints and reads a missed delete by the tags. A leftover prints exactly as the workspace's own does (`Only in .contexture/modules: session` reads like a workspace module, `Only in .contexture: templates` like a local drawer folder), so the tags decide, never the name. Outside the install records and the legacy law layer below, a printed path some tag shipped under `base/` is a missed delete (`git log --tags --format=%h -1 -- base/.contexture/<path>` names a commit, `<path>` being the path the line names below `.contexture/`, `modules/session` for the line above), and so is a folder under `.contexture/modules/` some tag shipped under a plugin's `.contexture`, that plugin's home from before v0.60 (`git log --tags --format=%h -1 -- 'plugins/*/.contexture/modules/<name>/*'` names a commit), which the plugin's catalog install replaces under the extension root (`.contexture/ctx package install <plugin>`, on the human's go); any other path, where both print nothing, is the workspace's own. A `differ` line or an `Only in base/...` line is a copy that did not land. Once no removed path is left, the drawer's payload class equals the release and the lines left name only the workspace's own paths. The `grep` drops, by whole line, only the workspace-owned names and catalog home at the drawer's top: the six workspace-owned folders (the record root `units`, its deprecated root `sessions`, the store module's records `store`, the workspace backups `backups` where a leftovers sweep keeps its stamped backups, `rhythms`, and the scratch drawer `tmp`), the catalog home `plugins` (`.contexture/plugins/`), and the workspace's own files (the configuration `config`, the legacy `storage.conf`, an fts5 store's database `sessions.db` with its `-wal` and `-shm` files, and a macOS Finder `.DS_Store`), names no release has ever shipped under `base/`, so every payload member left behind prints, a module folder or the retired `templates` folder removed whole included, and an emptied folder prints as well. The diff's `-x tmp` keeps it out of every folder named `tmp` on both sides, so no scratch line prints, whether the checkout holds an ignored `base/.contexture/tmp` or the drawer's scratch holds the extracted tag tree; it matches the names the diff walks, never an operand, so a tag tree under `.contexture/tmp/<name>/` still prints every line, and no release has ever shipped a path with a component named `tmp`. The `-x` option is outside POSIX `diff`: GNU diff and the BSD and macOS diff take it, while busybox diff has no `-x` and refuses it, printing its usage on stderr and nothing on stdout, so the pipeline prints nothing and reads like a clean compare; run the compare with a diff that takes `-x`, and read an empty compare as clean only when the diff printed no error line. A module's data folder at the drawer's top, named by the module's installed name (`Only in .contexture: ideas` for the ideas module), prints and reads as the workspace's own by the tags, since a static list cannot know an installed name. A database the configuration relocates (its `storage.database` key) sits where that key names it, and a line naming it is the workspace's own too. An earlier compare dropped every direct child of the drawer's top and of its module folders, and so hid exactly those: the session and lane module folders and the templates folder a v0.55.0 drawer kept after a literal update. The generated law layer sits at the root, outside the compared folders, so the compare skips nothing: a legacy layer left in `.contexture/laws/` prints as a missed delete, which is why the compare runs after the compose that removes it. The same compare reads the version actually live, which the `AGENTS.md` header cannot always show: a release that bumps no header keeps the previous one (v0.63.0 kept v0.62.0's). Before the copy, extract a candidate tag's tree into a new scratch folder (`mkdir -p .contexture/tmp/<name> && git archive <tag> base/ | tar -x -C .contexture/tmp/<name>`) and run the compare with `.contexture/tmp/<name>/base/.contexture` as its first operand: the live version is the tag it finds no differing file against. On a drawer composed before v0.68.0 the detection reads the one line `Only in .contexture/laws: AGENTS.generated.md` as the legacy layer, never as a difference: the compose after the copy removes it. The range from the previous tag once missed a verb file v0.63.0 removed while the drawer still held v0.62.0, and the compare found four posix driver awk files v0.61.0 removed that every later apply had left behind.

## Updating

The base evolves upstream, and updating is judgment, not a script (`install.sh` handles fresh installs only): the changes are semantic, and every workspace differs. The path:

1. Read your installed version: the header line of `AGENTS.md`; a release that bumps no header keeps the previous one, so step 6 reads the version actually live from the files. MAJOR breaks existing artifacts (fields removed, shapes changed), MINOR adds sections or features, PATCH fixes wording.
2. Fetch the upstream tags: `git fetch https://github.com/ahmetegesel/contexture.git --tags`.
3. Read the CHANGELOG from your installed version to the target: what changed and why.
4. Read your workspace: the overlay's `@replace` blocks, live units, in-flight artifacts.
5. Decide: adopt now, migrate first, or wait.
6. Copy the payload: first read the version actually live in the drawer with the payload compare against the tags (see Payload classes and syncing), never from the header alone; then `git archive <tag> base/ | tar -x --strip-components=1 -C <your-repo>`; the archive carries only payload paths, so workspace-owned paths are never touched. The archive adds and replaces files but never removes one, so from the repository root delete every payload path removed since the live version, then each folder those deletes leave empty: `git diff --name-only --no-renames --diff-filter=D <live-tag> <tag> -- base/ | sed 's|^base/||' | while IFS= read -r p; do rm -f "$p"; rmdir -p "$(dirname "$p")" 2>/dev/null || :; done`. Rename detection stays off: by default git reports a file a release moved as a rename, never a delete, so the listing misses it; from v0.55.0 to v0.70.1 the default listing names 22 of the 44 removed paths and leaves the session and lane module folders behind, whose scripts make every `ctx` call warn and `ctx lane` refuse as an unknown command. `rmdir -p` removes a deleted path's folder and each parent it empties, and stops at the first folder that still holds an entry, so an emptied module folder and the retired `templates` folder go too while every folder the payload or the workspace still uses stays. That stop is a refusal on almost every path, so the no-op `|| :` after it ends a successful run rc 0 instead of the stop's rc 1; the payload compare after it, never the loop's exit code, proves every listed path gone. A removed file left behind misleads: v0.55.0, for one, removes the session verbs `append`, `amend`, `query`, `flip`, and `drop` and three posix driver awk files, and a removed verb file left behind still lists in `ctx unit help` though its call prints the replacement. Then run the payload compare with the target tag's tree extracted into scratch as its first operand: once no removed path is left it prints no missed delete, only the workspace's own paths, except on a drawer composed before v0.68.0, where its one line `Only in .contexture/laws: AGENTS.generated.md` is the legacy layer the step 9 compose removes, never a missed delete.
7. Verify it: `git ls-tree -r --name-only <tag> -- base/` plus a `cmp` per file against the applied paths.
8. Update the installed packages: for each install record `.contexture/extensions/.state/<name>.files`, compare its `version` line with the `# version:` line of the target's catalog manifest (`git show <tag>:plugins/<name>/manifest`). A release that changes a plugin's payload bumps that version, so an equal version means the installed payload is current and needs nothing; a different one means the catalog holds a newer payload: refresh that package's catalog folder from the tag (remove `plugins/<name>/`, then `git archive <tag> plugins/<name>/ | tar -x -C <your-repo>`), and on the human's go re-install it (`.contexture/ctx package install <name>`; a re-install of the recorded files is an update, and it recomposes the law layer). Catalog meta (the READMEs, the tests, and the files a release removes, as the package install and uninstall scripts v0.70.0 retires) changes without a version bump, so every catalog folder this step does not refresh keeps its old meta: also delete every catalog path the range removed, then each folder those deletes leave empty (`git diff --name-only --no-renames --diff-filter=D <live-tag> <tag> -- plugins/ | while IFS= read -r p; do rm -f "$p"; rmdir -p "$(dirname "$p")" 2>/dev/null || :; done` from the repository root, rename detection off as in step 6, since the default listing names 85 of the 130 catalog paths v0.55.0 to v0.70.1 removes), or refresh `plugins/` whole from the tag (remove `plugins/`, then `git archive <tag> plugins/ | tar -x -C <your-repo>`), which also brings every current README; the version comparison above still decides which installed packages to re-install. For adopter workspaces installed by `install.sh` whose catalog sits at `.contexture/plugins/`, refresh `.contexture/plugins/` from the target tag or archive (omitting `plugins/*/tests/`), compare versions with `.contexture/ctx package list` or manifest `# version:` lines, and re-install changed packages on the human's go.
9. Compose the law layer: `.contexture/ctx compose`. The generated layer is gitignored, never shipped, and rebuilt after any package or payload change; a boot verifies or recomposes it too. The compose also removes a legacy layer left at the old place, so the ignore line edit of Topology and gitignore choices follows here. Updating past the move of the record's root to `.contexture/units/`, an ignore file that names `.contexture/sessions/` gains the same line for `.contexture/units/` here too, before any write moves a unit there. The ignore file also holds the line `.contexture/tmp/`, the scratch drawer where the engine stages its own scratch (each verb's scratch root, the driver verdict cache, the lock folders), so `git status` never lists it untracked after a `ctx` call; a drawer adopted before the line was named gains it here: a standalone repository adds `.contexture/tmp/` to its ignore file, and a deny-by-default workspace adds it after its `!.contexture/**` whitelist line, which otherwise re-includes the scratch drawer (the generated layer needs no line of its own there, the scratch drawer does).
10. Review the staged diff before committing; it shows you the changed base.
11. Run your instruments against the result: the boot query, the audit, the ground check. Past the record's root move, a read of a unit still under `.contexture/sessions/` prints one line, `WARNING: the record was read from its deprecated root; each unit moves at its next write, and ctx unit migrate --all moves the rest when the human chooses`: the line is the reminder, so your agent leaves the sweep to you, and `ctx unit migrate --all` moves the rest, the closed units among them, when you choose to run it. The move that empties `.contexture/sessions/` removes that folder, and a sweep over a fully moved workspace removes an empty one left by an earlier release, printing `migrated: 0`. Past the full address refs, every new REF or REFS value takes a full address and `ctx unit load` of a unit still holding an old form warns once, `WARNING: unit <unit> holds <n> refs in an old form; ctx unit migrate <unit> rewrites them`: read the census with `ctx unit migrate --dry-run --all`, which writes nothing, then run `ctx unit migrate --all` when you choose; it rewrites how each pointer is written, never what it points to, closed units included. After a MAJOR tag, review the overlay: its rules were written against the old shape, and the docs and lane clauses moved to the module laws (a duplicate slug refuses at boot).

The payload applies cleanly, and your record, rhythms, tmp, and workspace modules are never touched; the classes hold on every update.
