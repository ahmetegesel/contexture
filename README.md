# contexture

contexture is a zero-dependency workspace convention that gives AI coding agents persistent memory. Instead of relying on lossy chat compaction that forgets why code was written, agents maintain structured, append-only records directly in your repository.

| Dimension | Traditional LLM Compaction | contexture Disk Memory |
|:---|:---|:---|
| **Storage** | Ephemeral chat window (lost on reset) | Authoritative storage backend (.contexture/) |
| **When context fills** | Model writes a lossy prose summary | Append-only event log; zero information loss |
| **What survives** | Vague intentions ("Refactor auth middleware") | Exact decisions, why alternatives failed, test proof |
| **Resuming work** | Model acts confidently wrong from missing facts | Fresh agent queries active slice; resumes in seconds |
| **Dependencies** | Proprietary agent cloud or vector databases | Zero dependencies; uses standard POSIX tools |

contexture is a convention, not a tool: lightweight, abstracted, extensible. Plain files, any harness, one commit, no dependencies.

- [Why contexture](#why-contexture)
- [Installation](#installation)
- [Architecture](#architecture)
- [Core concepts](#core-concepts)
- [Docs](#docs)
- [Maintaining contexture](#maintaining-contexture)

## Why contexture

- **Lightweight by construction**: Plain files and POSIX awk baseline, no mandatory background services, no required databases, no external dependencies. The system awk is enough: the whole test suite runs green under BWK awk (the macOS awk), mawk (the Debian default), gawk, and busybox awk (Alpine).
- **Abstracted by design**: The schema governs shapes and the laws govern mechanisms, carrying zero workflow policies your workspace cannot override.
- **Extensible without forks**: Add custom rhythms, amend rules through overlays, configure storage drivers, and delegate work through subagents while the core stays untouched.

## Installation

Adopt contexture into an existing git repository in three steps:

### 1. Fetch the files

Run in your repository root (`<tag>` is the latest release tag; the fetch lists them with `git tag -l`):

```bash
git fetch https://github.com/ahmetegesel/contexture.git --tags
mkdir .adopt-contexture
git archive <tag> base/ plugins/ | tar -x -C .adopt-contexture
cp -R .adopt-contexture/base/. .
cp -R .adopt-contexture/plugins .
rm -rf .adopt-contexture
chmod +x .contexture/ctx .contexture/modules/*/scripts/* .contexture/modules/*/filters/*.awk
```

`base/` mirrors the target tree, so its content copies into place: `AGENTS.md` at the root, the drawer beside it. `plugins/` lands at the root as the catalog to install from.

### 2. Run the onboarding wizard

Prompt your AI agent:

> "Read `.contexture/ONBOARDING.md` and prepare the adoption proposal."

The agent inspects your workspace topology, drafts gitignore rules and harness symlinks, and pauses for your confirmation before writing changes.

### 3. Start your first session

Once confirmed, start your first unit of work:

> "Bootstrap a new unit of work to <your goal>."

### What happens next?

1. **The agent creates the unit:** It initializes `.contexture/sessions/<your-task>/` with active tasks (`backlog.md`) and an append-only event log (`journal.md`).
2. **You talk in plain prose:** You prompt and review as you normally do. Behind the scenes, the agent updates tasks, logs test proofs, and records decisions through semantic CLI verbs. You never manage the files manually.
3. **When the context window compacts or resets:** A fresh agent boots in milliseconds. It runs `ctx session load`, reads only the live record, and immediately resumes work without repeating ruled-out ideas.

For manual installation, custom topology setups (parent workspaces vs standalone repos), or upgrading an existing installation, see [docs/adoption.md](docs/adoption.md).

## Architecture

The workspace couples root governance with a dedicated convention drawer:

```text
.
├── AGENTS.md             Base laws and navigation pointers, delivered every turn
├── AGENTS.workspace.md   Shared workspace overlay, tracked in git for team-wide rules
├── AGENTS.local.md       Personal developer amendments, uncommitted local overrides
└── .contexture/          The convention drawer, isolating machinery from project code
    ├── ctx               The runtime: discovery, help assembly, dispatch, the run engine, and hooks
    ├── config            Optional workspace configuration (session.storage.driver: posix)
    ├── modules/          The modules: session (the record engine), run (stream filters), and workspace additions
    ├── rhythms/          Reusable workflow patterns governing task progression
    ├── templates/        Shape grammars ensuring structured writes without guesswork
    └── sessions/<unit>/  Isolated unit of work bounding context and lifecycle history
        ├── state.md      Live pointer: status, current anchor, next action, and refs
        ├── backlog.md    Living task queue with acceptance criteria and execution blueprints
        ├── journal.md    Append-only event stream rebuilding working context from scratch
        ├── knowledge.md  Settled decisions and durable findings, grounded by exact references
        └── lanes/<lane>/ Subagent dispatch sandbox holding isolated brief, trace, and report
```

## Core concepts

### Units
A dedicated scope for your task (`.contexture/sessions/<name>/`). Gives the agent persistent memory so that when chat resets or compacts, it resumes without losing decisions or test proofs. Deep dive: [The record](docs/the-record.md).

### Subagents
An isolated subagent sandbox (`lanes/<name>/`). Delegates heavy tasks in the background, keeping verbose tool logs out of your main conversation context. Managed via the top-level `ctx lane` module. Deep dive: [Units and subagents](docs/units-and-lanes.md).

### Storage abstraction
Pluggable backend architecture via the Storage Provider Interface (SPI). Decouples agents from physical disk files or database schemas. Every verb reaches the record through the configured driver alone, so the configured backend is the single store; free-text fields travel to the driver on stdin, never argv. The zero-dependency baseline POSIX driver manages markdown files, while storage plugins such as `storage-fts5` keep the same text verbatim in SQLite with dual Porter and Trigram indexing, pure SQL Reciprocal Rank Fusion (RRF) search, and high-density 5 to 12 token snippet extraction. Deep dive: [The record](docs/the-record.md) and [The engine](docs/the-engine.md).

### Rhythms
A plain text workflow checklist in `.contexture/rhythms/`. Enforces process discipline, requiring the agent to discuss, test, and verify before claiming work is done. Deep dive: [Rhythms](docs/rhythms.md).

### Overlays
Custom workspace rule files (`AGENTS.workspace.md` for teams, `AGENTS.local.md` for local machine). Lets you add repository policies or git rules without modifying contexture's base. Deep dive: [Overlays](docs/overlays.md).

### Stream compaction
Universal stream reduction runner and filter (`ctx run`). All shell commands execute through it (runner mode prefix: `.contexture/ctx run <cmd>`) or pipe into it (`<cmd> | .contexture/ctx run`). Runner mode selects the filter by the wrapped command's identity and stdin mode by the stream signature, strips ANSI escape sequences before matching, and collapses unchanged Git diff context lines (`diff.awk`), verbose directory listings (`list.awk`), passing test runs, and repetitive logs (`log.awk`) by 40 to 90 percent without installs or diagnostic loss. Preserves exact exit codes, keeps command stderr visible (whole on failure or empty stdout, tail-capped with its own notice otherwise), falls back to raw when a shrinking filter carries no notice, and honors `COMPACT_DISABLE=1` (bypass) and `COMPACT_DEBUG=1` (selection report). Capture scratch prefers the workspace's gitignored `.contexture/tmp/` drawer. Deep dive: [The engine](docs/the-engine.md).

## Docs

- [The record](docs/the-record.md): Artifacts, liveness, and closure
- [The engine](docs/the-engine.md): AGENTS.md, shape grammars, and awk scripts
- [Modules](docs/modules.md): The module contract: anatomy, declarations, hooks, and filters
- [Plugins](docs/plugins.md): Packaging, adoption, and the plugin test convention
- [Units and subagents](docs/units-and-lanes.md): Folder lifecycles and delegated subagent work
- [Rhythms](docs/rhythms.md): Procedure grammar, activation, and the default loop
- [Overlays](docs/overlays.md): Amendment grammar and precedence rules
- [Adoption](docs/adoption.md): Onboarding flows, topology choices, and upgrading
- [Starter rhythms](plugins/starter-rhythms/): The work and debug rhythms to start from
- [Toolchain filters](plugins/toolchain-filters/): Test runner and compiler filters
- [Lane isolation](plugins/lane-isolation/): On-demand worktree isolation for subagents
- [Docs discipline](plugins/docs-discipline/): A corpus-first documentation discipline
- [AST doc graph](plugins/ast-doc-graph/): An AST symbol graph linked with centralized documentation
- [Storage FTS5](plugins/storage-fts5/): SQLite FTS5 storage driver with dual full-text indexing, RRF search, and migration
- [Tests](tests/): The filter test material, upstream only; see [tests/README.md](tests/README.md)
- [Maintaining contexture](#maintaining-contexture): The `base/` dev loop: edit, ship, apply

| command | what it returns |
|---|---|
| ctx help | The runtime summary: `ctx run`, `ctx session` with its verbs, and every discovered module with its summary line |
| ctx session help | The full command table: every contract, printed to stdout; help, --help, and -h are the same table; every other dash-leading argument refuses at the entry point |
| ctx session active | The field: each ACTIVE unit with its slug, anchor, next action, and objective, then the closed count |
| ctx session bootstrap <slug> "<objective>" [<repos>] | A new unit: the folder, state at A0, the three empty artifacts, and the folded A1 receipt; prints the state and the next move |
| ctx session load <unit> | The load: the map plus one page (state, backlog, knowledge, the live journal, ref sessions read-only); the backlog renders DONE task blocks compactly (open blocks whole; the file never edited); each call says `LOAD INCOMPLETE` until the last, which reads `LOAD COMPLETE` |
| ctx session load refs <ref_1> ... <ref_N> [<page>] | The refs load: those sessions alone, read-only (the notice, the knowledge, the live journal), locally paged with its own banner and tail; a missing ref is fatal |
| ctx session stamp <unit> "<attention>" | The load receipt: derives the next anchor from state, rewrites current_anchor, and appends the anchor line with the attention verbatim |
| ctx session board <unit> | The live board: every unclosed entry with its body whole, then the open task slugs with their nudge |
| ctx session audit <unit> | Mechanical defect verification (malformed entries, dangling closures, unharvested flags, tasks done without their event, in-progress tasks absent from state) and the open-thread tail; exits nonzero on any defect |
| ctx session index | One line per rhythm: name, path, use when, activation |
| ctx session task <verb> [args] | Task operations: add, update, start, complete, reopen, drop, list, show with typed flags and atomic state updates |
| ctx session record <unit> --what="..." [--flags] | Append an immutable journal event with auto-injected local date, active anchor, and default receipt thread |
| ctx session entry <verb> [args] | Journal entry inspection: show, list matching entries |
| ctx session finding <verb> [args] | Finding lifecycle CRUD: add, show, update, supersede, drop, list |
| ctx session search <unit> "<query>" [--limit=N] [--entity=TYPE] [--mode=MODE] [--json] | Universal search across all entity domains in one result shape for every driver (entity_type, entity_id, section, snippet); ranked drivers return high-density 5 to 12 token snippets |
| ctx session resolve <unit> <ref> | Resolve abstract entity references (task#slug, finding#NAME, entry#slug, lane#slug/report#claim) and the legacy file forms to the entity block |
| ctx lane <verb> <unit> <lane-slug> [args] | Subagent lane management: show, record, report isolated from parent session journals |
| ctx storage-fts5 migrate --from=<posix\|fts5> --to=<posix\|fts5> [--unit=<unit>] | Bidirectional byte-exact migration between POSIX flat files and the SQLite store |
| ctx session query entry <unit> <slug> | The entry block verbatim; duplicates render every match |
| ctx session query group <unit> <token> | The group thread: one short line per entry (anchor, slug, opening) |
| ctx session query anchors <unit> | The anchor lines verbatim, with the count; zero prints `0 anchors` |
| ctx session query finding <unit> <NAME> | The finding block plus its supersession chain, cycles marked |
| ctx session query closure <unit> <slug> | Open, or the closers with their verdicts and lines |
| ctx session query units <repo> | Each unit touching the repo: slug, status, anchor, next action |
| ctx session query refs-to <session> | Each unit referencing the session |
| ctx session query resolve <unit> <ref> | The block behind a journal, knowledge, backlog, or subagent-report reference |
| ctx session query lane <unit> <lane> | Subagent file presence with line and byte counts, the journal's last line, the report's first |
| ctx session query search <unit> <term> | Bounded match lines across the unit's artifacts (state, backlog, knowledge, journal, the subagent journals and reports), each with its locator |
| ctx session append <unit> | Legacy write side: one or more blocks on stdin; each block's first line decides `@entry`, `@finding`, or `@task` |
| ctx session amend <unit> <slug> | Legacy: replace task fields in place from labeled field blocks on stdin |
| ctx session flip <unit> <verb> <slug> [<slug> ...] | Legacy: move task status (todo, progress, done with receipt) |
| ctx session drop <unit> <slug> [<slug> ...] | Legacy: remove tasks while recording receipt |
| ctx session next <unit> "<pointer>" | Overwrite the one next action; refuses when an in-progress task would go unnamed |
| ctx session refs <unit> [<session> ...] | Set the read-only reference sessions; zero sessions clears them |
| ctx session close <unit> | Mark the unit CLOSED; warns on open tasks and audit findings rather than refusing |
| ctx session reopen <unit> | Mark a CLOSED unit ACTIVE again; refuses for a unit that is not CLOSED |
| ctx run | Universal discoverable stream compaction: direct runner prefix (.contexture/ctx run <cmd>) or pipe; selects by command identity in runner mode and by signature on stdin, strips ANSI, and collapses diffs, directory listings, test passes, or logs; COMPACT_DISABLE=1 bypasses, COMPACT_DEBUG=1 reports the selection; fail-safe and recovery fallbacks to raw |

The query and search forms answer questions over the record, so agents never improvise greps that over-read: a miss is loud, rc=1 with a named error, never an empty success.

The primary interaction toolbox provides typed semantic verbs (`task`, `record`, `entry`, `finding`, `search`, `resolve`) and `ctx lane`, ensuring atomic state transitions and eliminating format guessing. Legacy block piping (`append`, `amend`, `flip`, `drop`) is preserved as a fallback for bulk migrations and compatibility.

## Maintaining contexture

This repository builds the convention; workspaces consume it from tags. The shippable core is tracked mirrored under `base/`: `base/AGENTS.md` and `base/.contexture/{ctx,modules/session,modules/run,templates,ONBOARDING.md}`. The live root (`AGENTS.md`, `.contexture/`) and the agent-facing corpus (`docs/workspace/`) are untracked working state, this repository's own running installation and operational corpus, and they keep working through every change; the guides (`docs/*.md`) stay tracked.

The dev loop:

1. Edit `base/` directly: it is the shipping copy.
2. Run the test pipeline (it stages the base runtime): `tests/run.sh`.
3. Ship: docs sync, commit, push, and the annotated tag in one breath.
4. Apply the payload onto the live drawer, class-aware: `cp -R base/. .` from the repository root. The copy carries only payload paths, so sessions, rhythms, tmp, and workspace modules are never touched.

`plugins/` is the tracked catalog of packaged overlays, installed into a workspace when wanted (see [docs/plugins.md](docs/plugins.md)); `docs/adoption.md` carries the same loop beside the adopter's view.
