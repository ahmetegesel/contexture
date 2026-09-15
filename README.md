# contexture

contexture is a zero-dependency workspace convention that gives AI coding agents persistent memory. Instead of relying on lossy chat compaction that forgets why code was written, agents maintain structured, append-only records directly in your repository.

| Dimension | Traditional LLM Compaction | contexture Disk Memory |
|:---|:---|:---|
| **Storage** | Ephemeral chat window (lost on reset) | Plain markdown files in repo (`.contexture/`) |
| **When context fills** | Model writes a lossy prose summary | Append-only event log; zero information loss |
| **What survives** | Vague intentions ("Refactor auth middleware") | Exact decisions, why alternatives failed, test proof |
| **Resuming work** | Model acts confidently wrong from missing facts | Fresh agent queries active slice; resumes in seconds |
| **Dependencies** | Proprietary agent cloud or vector databases | Zero dependencies; uses standard `git` and `awk` |

contexture is a convention, not a tool: lightweight, abstracted, extensible. Plain files, any harness, one commit, no dependencies.

- [Why contexture](#why-contexture)
- [Installation](#installation)
- [Architecture](#architecture)
- [Core concepts](#core-concepts)
- [Docs](#docs)

## Why contexture

- **Lightweight by construction**: Plain files and POSIX awk, no background services, no databases, no external dependencies.
- **Abstracted by design**: The schema governs shapes and the laws govern mechanisms, carrying zero workflow policies your workspace cannot override.
- **Extensible without forks**: Add custom rhythms, amend rules through overlays, and delegate work through subagent lanes while the core stays untouched.

## Installation

Adopt contexture into an existing git repository in three steps:

### 1. Fetch the files

Run in your repository root:

```bash
git fetch https://github.com/ahmetegesel/contexture.git --tags
git archive v0.34.1 AGENTS.md .contexture/ examples/ | tar -x
chmod +x .contexture/scripts/*.awk
```

### 2. Run the onboarding wizard

Prompt your AI agent:

> "Read `.contexture/ONBOARDING.md` and prepare the adoption proposal."

The agent inspects your workspace topology, drafts gitignore rules and harness symlinks, and pauses for your confirmation before writing changes.

### 3. Start your first session

Once confirmed, start your first unit of work:

> "Bootstrap a new unit of work to <your goal>."

### What happens next?

1. **The agent creates the unit:** It creates `.contexture/sessions/<your-task>/` with your active tasks (`backlog.md`) and an append-only event log (`journal.md`).
2. **You talk in plain prose:** You prompt and review as you normally do. Behind the scenes, the agent updates its tasks, logs test proofs, and records decisions in its files. You never manage the files manually.
3. **When the context window compacts or resets:** A fresh agent boots in milliseconds. It runs `session-load`, reads only the live record, and immediately resumes work without repeating ruled-out ideas.

For manual installation, custom topology setups (parent workspaces vs standalone repos), or upgrading an existing installation, see [docs/adoption.md](docs/adoption.md).

## Architecture

The workspace couples root governance with a dedicated convention drawer:

```text
.
├── AGENTS.md             Base laws and navigation pointers, delivered every turn
├── AGENTS.workspace.md   Shared workspace overlay, tracked in git for team-wide rules
├── AGENTS.local.md       Personal developer amendments, uncommitted local overrides
└── .contexture/          The convention drawer, isolating machinery from project code
    ├── rhythms/          Reusable workflow patterns governing task progression
    ├── scripts/          Deterministic awk tools streaming active context and auditing defects
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
A dedicated folder for your task (`.contexture/sessions/<name>/`). Gives the agent persistent memory so that when chat resets or compacts, it resumes without losing decisions or test proofs. Deep dive: [The record](docs/the-record.md).

### Lanes
An isolated subagent sandbox (`lanes/<name>/`). Delegates heavy tasks in the background, keeping verbose tool logs out of your main conversation context. Deep dive: [Units and lanes](docs/units-and-lanes.md).

### Rhythms
A plain text workflow checklist in `.contexture/rhythms/`. Enforces process discipline, requiring the agent to discuss, test, and verify before claiming work is done. Deep dive: [Rhythms](docs/rhythms.md).

### Overlays
Custom workspace rule files (`AGENTS.workspace.md` for teams, `AGENTS.local.md` for local machine). Lets you add repository policies or git rules without modifying contexture's base. Deep dive: [Overlays](docs/overlays.md).

## Docs

- [The record](docs/the-record.md): Artifacts, liveness, and closure
- [The engine](docs/the-engine.md): AGENTS.md, shape grammars, and awk scripts
- [Units and lanes](docs/units-and-lanes.md): Folder lifecycles and delegated subagent work
- [Rhythms](docs/rhythms.md): Procedure grammar, activation, and the default loop
- [Overlays](docs/overlays.md): Amendment grammar and precedence rules
- [Adoption](docs/adoption.md): Onboarding flows, topology choices, and upgrading
- [Examples](examples/rhythms/): Pre-built work and debug loops

| script | what it returns |
|---|---|
| session-load.awk | The load: the map plus one page (state, backlog, knowledge, the live journal, ref sessions read-only); each call says `LOAD INCOMPLETE` until the last, which reads `LOAD COMPLETE` |
| session-stamp.awk | The load receipt: derives the next anchor from state, rewrites current_anchor, and appends the anchor line with the attention verbatim |
| session-board.awk | The live board: every unclosed entry with its body whole, then the open task slugs with their nudge |
| session-audit.awk | Mechanical defect verification (malformed entries, dangling closures, unharvested flags, tasks done without their event, in-progress tasks absent from state) and the open-thread tail; exits nonzero on any defect |
| rhythms-index.awk | One line per rhythm: name, path, use when, activation |
