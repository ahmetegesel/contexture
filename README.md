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
- **Extensible without forks**: Add custom rhythms, amend rules through overlays, and delegate work through subagents while the core stays untouched.

## Installation

Adopt contexture into an existing git repository in three steps:

### 1. Fetch the files

Run in your repository root:

```bash
git fetch https://github.com/ahmetegesel/contexture.git --tags
git archive v0.43.0 AGENTS.md .contexture/ examples/ | tar -x
chmod +x .contexture/scripts/*.awk .contexture/scripts/session.sh
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
3. **When the context window compacts or resets:** A fresh agent boots in milliseconds. It runs `session.sh load`, reads only the live record, and immediately resumes work without repeating ruled-out ideas.

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
    ├── scripts/          The session.sh entry point over its awk workers: load, stamp, board, audit, index, query
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

### Subagents
An isolated subagent sandbox (`lanes/<name>/`). Delegates heavy tasks in the background, keeping verbose tool logs out of your main conversation context. Deep dive: [Units and subagents](docs/units-and-lanes.md).

### Rhythms
A plain text workflow checklist in `.contexture/rhythms/`. Enforces process discipline, requiring the agent to discuss, test, and verify before claiming work is done. Deep dive: [Rhythms](docs/rhythms.md).

### Overlays
Custom workspace rule files (`AGENTS.workspace.md` for teams, `AGENTS.local.md` for local machine). Lets you add repository policies or git rules without modifying contexture's base. Deep dive: [Overlays](docs/overlays.md).

## Docs

- [The record](docs/the-record.md): Artifacts, liveness, and closure
- [The engine](docs/the-engine.md): AGENTS.md, shape grammars, and awk scripts
- [Units and subagents](docs/units-and-lanes.md): Folder lifecycles and delegated subagent work
- [Rhythms](docs/rhythms.md): Procedure grammar, activation, and the default loop
- [Overlays](docs/overlays.md): Amendment grammar and precedence rules
- [Adoption](docs/adoption.md): Onboarding flows, topology choices, and upgrading
- [Examples](examples/rhythms/): Pre-built work and debug loops
- [Setups](examples/setups/lane-isolation/): An optional setup: on-demand worktree isolation for subagents
- [Setups](examples/setups/docs-discipline/): An optional setup: a corpus-first documentation discipline

| command | what it returns |
|---|---|
| session.sh help | The full command table: every contract, printed to stdout; help, --help, and -h are the same table; every other dash-leading argument refuses at the entry point |
| session.sh active | The field: each ACTIVE unit with its slug, anchor, next action, and objective, then the closed count |
| session.sh bootstrap <slug> "<objective>" [<repos>] | A new unit: the folder, state at A0, the three empty artifacts, and the folded A1 receipt; prints the state and the next move |
| session.sh load <unit> | The load: the map plus one page (state, backlog, knowledge, the live journal, ref sessions read-only); the backlog renders DONE task blocks compactly (open blocks whole; the file never edited); each call says `LOAD INCOMPLETE` until the last, which reads `LOAD COMPLETE` |
| session.sh load refs <ref_1> ... <ref_N> [<page>] | The refs load: those sessions alone, read-only (the notice, the knowledge, the live journal), locally paged with its own banner and tail; a missing ref is fatal |
| session.sh stamp <unit> "<attention>" | The load receipt: derives the next anchor from state, rewrites current_anchor, and appends the anchor line with the attention verbatim |
| session.sh board <unit> | The live board: every unclosed entry with its body whole, then the open task slugs with their nudge |
| session.sh audit <unit> | Mechanical defect verification (malformed entries, dangling closures, unharvested flags, tasks done without their event, in-progress tasks absent from state) and the open-thread tail; exits nonzero on any defect |
| session.sh index | One line per rhythm: name, path, use when, activation |
| session.sh query entry <unit> <slug> | The entry block verbatim; duplicates render every match |
| session.sh query group <unit> <token> | The group thread: one short line per entry (anchor, slug, opening) |
| session.sh query anchors <unit> | The anchor lines verbatim, with the count; zero prints `0 anchors` |
| session.sh query finding <unit> <NAME> | The finding block plus its supersession chain, cycles marked |
| session.sh query closure <unit> <slug> | Open, or the closers with their verdicts and lines |
| session.sh query units <repo> | Each unit touching the repo: slug, status, anchor, next action |
| session.sh query refs-to <session> | Each unit referencing the session |
| session.sh query resolve <unit> <ref> | The block behind a journal, knowledge, backlog, or subagent-report reference |
| session.sh query lane <unit> <lane> | Subagent file presence with line and byte counts, the journal's last line, the report's first |
| session.sh query search <unit> <term> | Bounded match lines across the unit's artifacts (state, backlog, knowledge, journal, the subagent journals and reports), each with its locator |
| session.sh append <unit> | The write side: one or more blocks on stdin; each block's first line decides `@entry` (journal), `@finding` (knowledge), or `@task` (backlog); the command adds the anchor and refuses loudly, never partially |
| session.sh amend <unit> <slug> | Replace task fields in place from the labeled field blocks on stdin; the rest of the task stays byte-identical |
| session.sh flip <unit> <verb> <slug> [<slug> ...] | Move task status: `todo` reopens, `progress` activates (the state must already name the slug), `done` lands the receipt entry from stdin, one `backlog/<slug>: DONE` literal with its evidence per slug; several slugs ride one call |
| session.sh drop <unit> <slug> [<slug> ...] | Remove tasks: the record entry naming each lands from stdin first, then the blocks go |
| session.sh next <unit> "<pointer>" | Overwrite the one next action; refuses when an in-progress task would go unnamed |
| session.sh refs <unit> [<session> ...] | Set the read-only reference sessions; zero sessions clears them |
| session.sh close <unit> | Mark the unit CLOSED; warns on open tasks and audit findings rather than refusing |

The query family answers the named looks over the record, so agents never improvise greps that over-read: a miss is loud, rc=1 with a named error, never an empty success.

The recording family is the write side of the toolbox: `append` lands entries, findings, and tasks; `amend` replaces a task field in place; `flip` moves a task's status; `drop` removes a task while its record stays; `next` overwrites the pointer; `refs` sets the read-only reference mounts; `close` ends the unit. Every form validates all inputs before any write, refuses loudly with zero partial writes, and the batch forms carry several blocks or slugs in one call. Shapes come from `.contexture/templates/`; the help names each form's target, stdin, and template.
