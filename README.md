# contexture

contexture is an AI workspace convention that lives inside your repository so coding agents keep exact working continuity across context compactions, session resets, and harness or model switches.

- **Never repeat yourself**: Context windows compact into lossy summaries and fresh chats start cold. contexture preserves the decisions, constraints, open work, and verification proof from earlier turns so your agent picks up right where you left off, even across different harnesses or models.
- **Built for agents, zero friction for you**: You talk to your coding agent naturally in plain English while the agent drives `.contexture/ctx` under the hood. You never have to memorize CLI flags or maintain notes by hand, though power users can inspect, query, or script the record anytime.
- **Pluggable by design, lightweight out of the box**: Bring your own storage drivers (each shipped as a driver package whose install moves your record into it), workflow rhythms, command output filters, or modules under one shared convention, or start immediately with the simple zero-dependency POSIX driver shipped by default. No background servers, no API keys, no harness lock-in.

**How a session feels**

1. **Start**: Tell your agent what you want to build or fix. It checks in on your goal and opens a dedicated work track inside the repo.
2. **Build**: Think out loud, approve the plan, and iterate normally. Behind the scenes, your agent tracks open work, logs decisions, and keeps command proof current.
3. **Reset or switch**: Hit compaction, close the tab, or switch to another AI tool or model.
4. **Resume**: Open a fresh chat and say continue. Your agent reloads the live state in one step and picks up right where you left off.

## Quickstart

### With an AI agent

Paste the prompt that fits your familiarity at your repository root:

**Guided (new to contexture)**: explains what changes in plain English without showing internal plumbing, pauses once before editing files, and ends with a short orientation, tailored starter prompt, and optional Q&A tour.

> "Install contexture in this workspace by running `curl -fsSL https://raw.githubusercontent.com/ahmetegesel/contexture/main/install.sh | sh -s -- --non-interactive`, then read `.contexture/ONBOARDING.md` and onboard this workspace in guided mode."

**Fast (already familiar with contexture)**: skips the brief and closing tour, presents a crisp plan for a single confirmation go, and ends with a brief verification receipt.

> "Install contexture in this workspace by running `curl -fsSL https://raw.githubusercontent.com/ahmetegesel/contexture/main/install.sh | sh -s -- --non-interactive`, then read `.contexture/ONBOARDING.md` and onboard this workspace in familiar mode."

`install.sh` requires no git and preserves any existing `AGENTS.md` untouched (staging contexture's loader at `.contexture/tmp/AGENTS.loader.md`). Both paths pause once for your confirmation before changing workspace configuration and remove `.contexture/ONBOARDING.md` once adoption closes; start a fresh session afterwards so the loader boots on turn 1.

### Manual terminal install (one line)

Run in your workspace root:

```sh
curl -fsSL https://raw.githubusercontent.com/ahmetegesel/contexture/main/install.sh | sh
```

The interactive installer previews what it will add and asks `Proceed? [Y/n]` before writing any file, frames core vs optional plugins before `ctx package catalog`, installs only what you select, prints next steps at completion, and supports `--tag`, `--plugins`, `--dir`, `--dry-run`, and `--from` for pinned, targeted, or offline installs. For manual extraction, installer flag details, or multi-repo parent workspaces, see [docs/adoption.md](docs/adoption.md).

### Start your first unit

Once adoption closes, prompt your AI agent:

> "Bootstrap a new unit of work to `<your goal>`."

1. Your agent opens a scoped work track for your goal and prepares the initial plan.
2. You steer and review in plain prose while the agent tracks open tasks, records decisions, and logs verification proof.
3. When context compacts or a fresh session starts, your agent reloads the live unclosed record and continues without repeating context.

### Under the hood: what your agent runs

You do not need to memorize commands to use contexture. Your agent drives `.contexture/ctx` automatically on every turn, while power users can run, inspect, or script the same commands directly anytime:

```sh
.contexture/ctx help --all            # Discover core commands and every installed module's contract
.contexture/ctx config load           # Assemble effective workspace configuration (read only)
.contexture/ctx config schema         # Show declared configuration schemas across core and modules
.contexture/ctx unit list             # List active units and each unit's derived next task
.contexture/ctx unit load <unit>      # Cold-boot a fresh session onto the unit's live working record
.contexture/ctx run <command>         # Run a shell command through stream compaction, preserving exit code
```

Run `.contexture/ctx <module> help` for any module's full verb table, or read [The engine](docs/the-engine.md) and [The record](docs/the-record.md) for complete CLI documentation.

## Updating

Upgrades stay painless because `AGENTS.md` remains a small untouched loader, team rules live in `AGENTS.workspace.md`, personal preferences live in `AGENTS.local.md`, and unit records live in workspace-owned folders that payload updates never touch. `install.sh` handles fresh installs only; to update an existing workspace:

1. Check [CHANGELOG.md](CHANGELOG.md) from your installed version to the target release tag.
2. Apply `base/` class-aware without touching workspace-owned state, remove deleted payload paths, and refresh any updated catalog plugins on explicit human confirmation.
3. Run `.contexture/ctx compose` and follow the full checklist and payload verification steps in [docs/adoption.md#updating](docs/adoption.md#updating).

## Core model

contexture separates what stays human from what stays structured. You think, converse, and iterate freely in plain prose while the `ctx` CLI validates shapes at write time, enforces state transitions, and keeps agents decoupled from whichever storage driver backs the workspace.

### Write-time structure and subtractive liveness

Most continuity problems begin at write time through unstructured notes that drift and bloat until nothing can be trusted on reload. contexture records work as typed, append-only events and settled findings grounded by exact references, then relies on subtractive liveness: as tasks finish, threads resolve, or decisions supersede earlier ones, the agent closes resolved entries by reference during the work itself so a fresh session boots onto only the unclosed working record. Mechanical integrity checks (`ctx unit audit`) enforce record structure, while unusually long units can consolidate history via `ctx unit fold` without losing the underlying trail.

### Convention-enforced extensibility and role separation

contexture grows without forks by composing every module, storage driver, workflow rhythm, and stream filter under one shared boot sequence, one generated law layer (`AGENTS.generated.md`), one `ctx` CLI doorway, and one pluggable storage contract. Standing repository policies live in overlays (`AGENTS.workspace.md` and `AGENTS.local.md`), repeatable workflows live in `.contexture/rhythms/`, and optional capabilities live in catalog plugins.

### Five core pillars

- **Units**: Scoped working memory for a task or deliverable: current state, living backlog queue with acceptance criteria, append-only event journal, and settled findings grounded by exact references. See [The record](docs/the-record.md).
- **Rhythms**: Plain-text workflow checklists that govern outcomes and verification gates without imposing rigid bureaucracy. See [Rhythms](docs/rhythms.md).
- **Subagent lanes**: Isolated dispatch sandboxes managed through `ctx lane` that keep subagent traces out of the main journal and return self-sufficient reports. See [Units and subagents](docs/units-and-lanes.md).
- **Overlays**: Team-shared rules (`AGENTS.workspace.md`) and personal machine preferences (`AGENTS.local.md`) that amend the composed law layer without editing or forking the base convention. See [Overlays](docs/overlays.md).
- **Stream compaction (`ctx run`)**: Shell commands run through `.contexture/ctx run <cmd>` (or pipe into it), collapsing verbose diffs, listings, and logs while preserving exact exit codes and full diagnostic detail on failure. See [The engine](docs/the-engine.md).

### Human habits and non-AI teammates

Day-to-day ceremony stays slim: confirm the unit and rhythm at boot, approve plans before workspace writes, and run a handoff before resets. Teammates who never prompt an AI still benefit from explicit rules in `AGENTS.workspace.md`, recorded verification proof on pull requests, and optional documentation freshness checks.

For the full `.contexture/` drawer layout and file ownership classes, see [The engine](docs/the-engine.md#the-drawer-layout).

## Builtins and catalog plugins

### Shipped builtins

Five modules ship inside `base/.contexture/modules/` and work out of the box with no installation:

- **`unit`**: Owns the unit record (state, backlog, journal, knowledge, audit, fold, search, and lifecycle operations) over the storage layer.
- **`lane`**: Manages isolated subagent dispatch lanes (`create`, `record`, `report`, `show`).
- **`rhythm`**: Lists workspace and installed rhythms, displays a rhythm whole, and reports the rhythm in force with its next gate.
- **`store`**: Declares and manages schema-checked generic data containers through `ctx store`, and manages `storage.*` settings via `ctx store config` (the storage driver itself changes only through a driver package's install and uninstall).
- **`run`**: Provides the baseline diff, directory listing, and log compaction filters for `ctx run`.

### Optional catalog plugins

Optional packages live in `.contexture/plugins/` (with `./plugins/` as fallback) and install into `.contexture/extensions/` via `.contexture/ctx package install <name>` (and uninstall via `.contexture/ctx package uninstall <name>`, whose keep or delete answer for a package's module data is the human's: `--keep-data` keeps it reachable for a later install, `--delete-data` removes it). A driver package's install moves the record from posix into its driver and its uninstall moves it back, the old copy backed up or deleted as the human answers (`--backup-old` or `--delete-old`). Inspect available packages, versions, and live host readiness read-only via `.contexture/ctx package catalog`, `.contexture/ctx package info <name>`, and `.contexture/ctx package list`. Package installation runs **only on the human's explicit go at the act** (boot never installs packages, and the verb itself checks no go).

| Plugin | Kind | What it adds | Guide |
| :--- | :--- | :--- | :--- |
| `docs-discipline` | feature | Corpus-first documentation discipline with read/write verbs, freshness checks, and a close gate (change-aware checks require `git`) | [plugins/docs-discipline/README.md](plugins/docs-discipline/README.md) |
| `ast-doc-graph` | feature | TypeScript AST and documentation graph for symbol, call-graph, rule, and pitfall queries | [plugins/ast-doc-graph/README.md](plugins/ast-doc-graph/README.md) |
| `toolchain-filters` | feature | Test runner and compiler output filters (pytest, vitest, jest, cargo test, go test) for `ctx run` | [plugins/toolchain-filters/README.md](plugins/toolchain-filters/README.md) |
| `starter-rhythms` | feature | Starter work and debug rhythms to copy and edit into your team's own | [plugins/starter-rhythms/README.md](plugins/starter-rhythms/README.md) |
| `storage-sqlite` | driver | Optional SQLite storage driver: the record and the corpus in one database, a twin of the posix driver with exact search alike on every driver (requires `sqlite3` 3.44 or later) | [plugins/storage-sqlite/README.md](plugins/storage-sqlite/README.md) |
| `git` | feature | Gitignore strategy, branch and worktree mechanics, and boot ground checks as a law-only module (explicit choice, never a default) | [plugins/git/README.md](plugins/git/README.md) |

For full catalog notes, module aliasing, and reproducing declared packages on a fresh clone, see [docs/adoption.md#the-module-catalog](docs/adoption.md#the-module-catalog) and [docs/plugins.md](docs/plugins.md). To author your own module or package under the same contract, read [docs/modules.md](docs/modules.md).

## Docs

### Core architecture and concepts

- [The record](docs/the-record.md): Unit artifacts, liveness, closure, folding, and query syntax
- [The engine](docs/the-engine.md): Law composition, CLI dispatch, storage contract, drawer layout, and `ctx run` compaction
- [Units and subagents](docs/units-and-lanes.md): Unit lifecycles and isolated subagent lanes
- [Rhythms](docs/rhythms.md): Workflow grammar, activation modes, and the default design loop
- [Overlays](docs/overlays.md): Amendment grammar and workspace/local precedence rules

### Adoption, extensibility, and testing

- [Adoption](docs/adoption.md): Agentic onboarding, installer flags, gitignore topologies, and upgrading
- [Modules](docs/modules.md): Standard module folder, manifests, laws, verbs, hooks, and stream filters
- [Plugins](docs/plugins.md): Package manifests, feature and storage-driver kinds, installation, and plugin tests
- [Tests](tests/README.md): Upstream vitest test suite running the shipped product as child processes

## Maintaining contexture

This repository builds the convention; the shippable core is tracked under `base/` and catalog packages under `plugins/`, while the live root (`AGENTS.md`, `.contexture/`) and the agent-facing corpus stay untracked working state. Edit `base/` and `plugins/` directly, run targeted tests from `tests/` (`bun run test:changed` or `bun run test:<project>`, plus `bun run test:prerelease` and plugin manifest version bumps before tagging; see [tests/README.md](tests/README.md) and [docs/plugins.md](docs/plugins.md)), and apply `base/` class-aware onto your live drawer following [docs/adoption.md#payload-classes-and-syncing](docs/adoption.md#payload-classes-and-syncing).
