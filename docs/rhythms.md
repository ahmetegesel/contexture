# Rhythms

The record turns memory into plain files; a rhythm does the same for process. A rhythm is a named order of gates for a kind of work: it tells the agent the order of the steps and what each must produce. Contexture ships none of its own. Your team chooses its rhythms, or the agent proposes one on its trigger.

## What a rhythm is

A rhythm is a file your workspace owns. It lives in `.contexture/rhythms/`, ignored or tracked exactly as your team decides, and edited like any other file. What it holds is a name, the situations it serves, and a short sequence of gates, each with the outcome it must produce.

Rhythms complement your harness's skills and features rather than replace them: skills add capability, rhythms add shape, and one can carry the other. Contexture owns two layers, the record and the process; your task skills run untouched unless they contradict one of the two. When nothing matches, the default design loop stands in.

Placement matters as much as shape. Per-turn surfaces carry interaction rules only; work patterns are rhythm material, and a workflow written into AGENTS.md taxes every turn forever. The boot loads the trigger index; a rhythm's body loads when the rhythm is invoked.

## The grammar

A rhythm is written in the same dialect as the artifacts: typed blocks at column 0, bodies indented two, contract words spelled once.

```
@rhythm <name>
  use when: <the situations it serves>
  activation: propose | auto
  1. GATE: outcome
  2. GATE: outcome
```

`@rhythm <name>` opens the block. `use when:` carries triggers only, never a summary of the workflow: a summary becomes the shortcut an agent follows instead of the steps.

`activation:` decides how the rhythm starts. `propose` is the default: the agent recognizes the trigger and proposes the rhythm before applying it, and the human confirms. `auto` is the team's explicit opt-in: the agent applies the rhythm on trigger without a separate ask. Either way, the acts inside still pass the interaction gates.

Each step is one line, the form `N. GATE: outcome`. The gate names the point in order; the outcome says what must be true when it closes. Steps reference the workspace's artifacts by name (the state pointer, the backlog, the journal, the harvest); they never restate an artifact's grammar, and they never prescribe the content of the work. The shipped work example also carries an optional `ground:` line, naming where the standards live.

Keep the text minimal. A rhythm may carry as much as a skill would, but structured and denser than prose: typed blocks carry meaning per token, and prose is where misreadings live.

## Activation and selection

The index is how a workspace's rhythms become discoverable. At boot the agent runs:

```
awk -f .contexture/scripts/rhythms-index.awk .contexture/rhythms/*.md
```

One line per rhythm comes back, carrying what selection needs:

```
work (.contexture/rhythms/work.md) | use when: a work request arrives and no other rhythm matches | activation: auto
```

A rhythm with no `use when:` line prints `(missing)`; a rhythm with no `activation:` line defaults to `propose`, so proposal is the behavior unless the team opts into auto. The agent matches the trigger against the request, proposes or applies, and falls back to the default loop when nothing matches.

## The invariant boundary

A rhythm replaces task progression only. The artifact invariants hold across every rhythm: entries land as events happen, findings settle as decisions, tasks move in the backlog, the pointer advances, the harvest runs at boundaries. The record is not a rhythm's business: a rhythm never restates what the core already records, and extra recording rules belong to an overlay.

Gate closures follow the same discipline. DECIDE closes by the backlog, VERIFY and LAND close by the completion receipt carrying its evidence, and REFRESH closes by the harvest. A gate closed by memory is debt.

## Authoring

Write the smallest text that shapes the work. The contract has three clauses, and they converge agents with no examples in context: never re-specify grammars, never prescribe content, one line per step (`N. GATE: outcome`). In the measured series, a prose rhythm lost its gates at 222 tokens; an agent given only the clauses produced the form clean at 130.

Author empirically. State a positive recipe rather than a prohibition, because a prohibition tends to produce the unwanted content it names. Start from the workflows your workspace already runs: the step-by-step patterns found in an instruction stack are the first rhythm candidates, and onboarding proposes them for extraction when it presents the installation plan. When no team rhythm emerges, the examples are offered as the starting set.

## The default design loop

When no rhythm is invoked, the agent runs the design loop:

```
1. DISCUSS: explore the problem space; grounded questions resolve intent
2. DECIDE: the human verdict settles the intent; the harvest candidate triggers
3. BACKLOG: the intent updates backlog.md; next_action points at the active task
4. EXECUTE: work the active task; drift updates the backlog in the same breath
5. VERIFY: the task's acceptance criteria are proven; the journal records completion, next_action advances
6. REFRESH: run @refresh
```

This is the fallback, not the frame: a human rhythm replaces the progression when one is invoked.

## The shipped examples

Two examples ship at `examples/rhythms/`, each with a plain-language README beside it.

`work` applies when a work request arrives and no other rhythm matches, with `activation: auto`. It is token-heavy by design: one unit of work moves through several lanes (recon, grounding, execution, review), and each lane is a fresh context reading the record instead of dragging the history along. That buys context management and redundancy, and it is strongly recommended for cheaper, decent models: the structured flow and the independent verification close much of the gap to frontier models. Frontier models run it as discipline rather than necessity.

`debug` applies when a failure needs a root cause (a bug, a flaky test, unexpected behavior), with `activation: propose`. It is a light, single-context loop: one focused agent, one gate at a time. Its first gate requires a red reproduction, recorded with a reference, before any fix.

The gate glosses in plain words, the cost, and the practice notes live in `examples/rhythms/work/README.md` and `examples/rhythms/debug/README.md`. The examples are snapshots to copy and edit; in this repository the live copy of `work` sits at `.contexture/rhythms/work.md`, and in any workspace the live rhythms belong in its own `.contexture/rhythms/`. Onboarding offers the examples when a team brings no rhythm of its own, and removes both the examples and the onboarding guideline at adoption close.
