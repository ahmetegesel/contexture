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

[Architecture](#architecture) • [Core concepts](#core-concepts) • [Why contexture](#why-contexture) • [Installation](#installation) • [Docs](#docs)

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
        ├── state.md      Live pointer: status, current anchor, and next immediate action
        ├── backlog.md    Living task queue with acceptance criteria and execution blueprints
        ├── journal.md    Append-only event stream rebuilding working context from scratch
        ├── knowledge.md  Settled decisions and durable findings, grounded by exact references
        └── lanes/<lane>/ Subagent dispatch sandbox holding isolated brief, trace, and report
```

## Core concepts

### Units: Persistent Work Containers
A unit is an isolated folder (`.contexture/sessions/<slug>/`) that encapsulates an initiative's state, backlog, journal, and knowledge, giving the agent persistent memory across chat sessions and compactions.
* **Location:** `.contexture/sessions/<unit>/` (`state.md`, `backlog.md`, `journal.md`, `knowledge.md`)
* **Key benefit:** Bounds active context to one objective; closed units stop loading and never pollute active memory.
* **Deep dive:** [The record](docs/the-record.md) and [Units and lanes](docs/units-and-lanes.md)

### Lanes: Isolated Subagent Delegation
A lane is an isolated subagent directory (`lanes/<slug>/`) that wraps a delegated task in a brief recipe, action journal, and structured report, keeping the dispatcher's context lean while enabling instant resumption if a subagent stalls.
* **Location:** `.contexture/sessions/<unit>/lanes/<lane>/` (`recipe.md`, `journal.md`, `report.md`)
* **Key benefit:** Memory is physical on disk; if a subagent fails or times out, re-dispatch resumes without lost work.
* **Deep dive:** [Units and lanes](docs/units-and-lanes.md#lanes-the-delegated-unit)

### Rhythms: Team Workflow Gates
A rhythm is a plain text file in `.contexture/rhythms/` that defines an ordered sequence of quality gates and required outcomes, ensuring the agent follows your team's workflow instead of guessing next steps.
* **Location:** `.contexture/rhythms/<name>.md` (for example, `work.md`, `debug.md`)
* **Key benefit:** Enforces strict execution order (DISCUSS, DECIDE, BACKLOG, EXECUTE, VERIFY, REFRESH) without bloating per-turn prompts.
* **Deep dive:** [Rhythms](docs/rhythms.md)

### Overlays: Repository-Specific Customization
An overlay is a root configuration file (`AGENTS.workspace.md` for the team, `AGENTS.local.md` for personal rules) that appends or amends agent behavior for your specific repository without modifying the upstream base.
* **Location:** `AGENTS.workspace.md` (shared, tracked) and `AGENTS.local.md` (personal, local)
* **Key benefit:** Adapts laws, git rules, or boot behavior using `@append` or `@replace` while keeping upstream syncs clean.
* **Deep dive:** [Overlays](docs/overlays.md)

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
git archive v0.29.3 AGENTS.md .contexture/ examples/ | tar -x
chmod +x .contexture/scripts/*.awk
```

### 2. Run the onboarding wizard

Prompt your AI agent:

> "Read `.contexture/ONBOARDING.md` and prepare the adoption proposal."

The agent inspects your workspace topology, drafts gitignore rules and harness symlinks, and pauses for your confirmation before writing changes.

### 3. Start your first session

Once confirmed, start your first unit of work:

> "Bootstrap a new unit of work to <your goal>."

For manual installation, custom topology setups (parent workspaces vs standalone repos), or upgrading an existing installation, see [docs/adoption.md](docs/adoption.md).

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
| journal-active.awk | Every live entry, bodies whole, in one command and one stream |
| journal-audit.awk | Mechanical defect verification (malformed entries, dangling closures, unharvested flags, tasks done without their event) and the open-thread tail; exits nonzero on any defect |
| rhythms-index.awk | One line per rhythm: name, path, use when, activation |
