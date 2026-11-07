# Rhythms

The record turns memory into plain files; a rhythm does the same for process. A rhythm is a named order of gates for a kind of work: it tells the agent the order of the steps and what each must produce. Contexture ships none of its own. Your team chooses its rhythms, or the agent proposes one on its trigger.

## What a rhythm is

A rhythm is a file your workspace owns. It lives in `.contexture/rhythms/`, ignored or tracked exactly as your team decides, and edited like any other file. What it holds is a name, the situations it serves, and a short sequence of gates, each with the outcome it must produce.

Rhythms complement your harness's skills and features rather than replace them: skills add capability, rhythms add shape, and one can carry the other. Contexture owns two layers, the record and the process; your task skills run untouched unless they contradict one of the two. When nothing matches, the default design loop stands in.

Placement matters as much as shape. Per-turn surfaces carry interaction rules only; work patterns are rhythm material, and a workflow written into the loader taxes every turn while one written into the generated law layer taxes every boot. The boot reads the rhythm list, each rhythm's trigger and activation; a rhythm's body loads when the rhythm is confirmed.

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

Each step is one line, the form `N. GATE: outcome`. The gate names the point in order; the outcome says what must be true when it closes. Steps reference the workspace's artifacts by name (the state, the backlog, the journal, the harvest); they never restate an artifact's grammar, and they never prescribe the content of the work. The shipped work example also carries an optional `ground:` line, naming where the standards live.

Keep the text minimal. A rhythm may carry as much as a skill would, but structured and denser than prose: typed blocks carry meaning per token, and prose is where misreadings live.

The rhythm module checks the grammar each time it reads a rhythm: a step line is any line opening with a number, a dot, and a blank; its gate, the text before the first colon, reads in the stamp grammar (`[A-Z][A-Z_+]*`, so `REVIEW+HARDEN+VERIFY` stamps and `TRACE & ACCUMULATE` does not); the steps run 1 to N; and the `@rhythm` name is the file name. A defect (a missing use when, an activation other than propose or auto, an `@rhythm` name that is not the file name, a step numbering gap, a gate outside the stamp grammar, no step line) warns on stderr whenever `ctx rhythm list` reads the rhythm, which still lists; a file with no `@rhythm` line is no rhythm, and a file whose name is not a rhythm name (a letter or digit, then letters, digits, underscore, or dash, so no dot or blank) never lists, warning so when it holds an `@rhythm` line. The governance census holds every shipped rhythm to the same rule.

## Activation and selection

The rhythm module makes a workspace's rhythms discoverable through ctx. At boot the agent runs, beside the unit listing:

```
.contexture/ctx rhythm list
```

One line per rhythm comes back, carrying what selection needs, then the select line that says what to do with them:

```
work | workspace, shadows the extension copy | use when: a work request arrives in a workspace with a docs corpus and no other rhythm matches | activation: propose
debug | extension | use when: a failure needs root-cause: a bug, a flaky test, an unexpected behavior | activation: propose
select: match the request against each use when; a propose match is proposed and waits for the human's confirm, an auto match applies and says so; no match runs the design loop (@rhythms default); read a rhythm with ctx rhythm show <name>
```

The origin is a label, never a path: `workspace` for the workspace's own copy, `extension` for an installed one, and `workspace, shadows the extension copy` when the workspace copy stands in for an installed rhythm of the same name, which then lists once. A rhythm is named by its file name; one with no `use when:` line prints `(missing)`, and one with no `activation:` line defaults to `propose`, so proposal is the behavior unless the team opts into auto. The boot reads the list with the units (step 3) and its proposal names the rhythm beside the unit (step 4): a propose match is asked, an auto match is stated as applying, no match names the default loop; the human's reply settles both, and every new work request's restate names the rhythm too. `ctx rhythm show <name>` prints a confirmed rhythm whole, then the stamp line that advances it, and `ctx rhythm current <unit>` names the rhythm in force and its next gate, the line the board ends with. A workspace with no rhythm at all prints the select line alone rc 0 (the base payload ships none), so a bare base-only install still boots.

## The invariant boundary

A rhythm replaces task progression only. The artifact invariants hold across every rhythm: entries land as events happen, findings settle as decisions, tasks move in the backlog, the derived move advances with them, the harvest runs at boundaries. The record is not a rhythm's business: a rhythm never restates what the core already records, and extra recording rules belong to an overlay. The rhythm's own mark is one stamp: the entries that advance it carry `RHYTHM: <name> <N> <GATE>`, a label of the process in force, never a maintained field. The record checks the stamp through the rhythm module, by the rule `ctx rhythm list` reads: the workspace's own `.contexture/rhythms/<name>.md` first, then the installed `.contexture/extensions/rhythms/<name>.md`, so an installed rhythm stamps without a workspace copy and a workspace copy shadows the installed one; the rhythm's `@rhythm` line must name its file, and step N must read the gate. A stamped write prints the next gate after its receipt (`rhythm: work at 6 EXECUTE; next gate: 7 GUARDS: ...`, or `its last gate` at the last step), so the next step is in front of the agent at every stamped write, and `ctx rhythm current <unit>` reads the unit's last stamp back as the rhythm in force.

Gate closures follow the same discipline. DECIDE closes by the backlog, VERIFY and LAND close by the completion receipt carrying its evidence, and REFRESH closes by the harvest. A gate closed by memory is debt.

## Authoring

Write the smallest text that shapes the work. The contract has three clauses, and they converge agents with no examples in context: never re-specify grammars, never prescribe content, one line per step (`N. GATE: outcome`). In the measured series, a prose rhythm lost its gates at 222 tokens; an agent given only the clauses produced the form clean at 130.

Author empirically. State a positive recipe rather than a prohibition, because a prohibition tends to produce the unwanted content it names. Start from the workflows your workspace already runs: the step-by-step patterns found in an instruction stack are the first rhythm candidates, and onboarding proposes them for extraction when it presents the installation plan. When no team rhythm emerges, the starter-rhythms plugin is offered as the starting set.

## The default design loop

When no rhythm is invoked, the agent runs the design loop:

```
1. DISCUSS: explore the problem space; grounded questions resolve intent
2. DECIDE: the human verdict settles the intent; the harvest candidate triggers
3. BACKLOG: the intent updates backlog.md; the first IN_PROGRESS task, else the first open task (every status but DONE), is the move
4. EXECUTE: work the active task; drift updates the backlog in the same breath
5. VERIFY: the task's acceptance criteria are proven; the journal records completion, the backlog's derived move advances
6. REFRESH: run @refresh
```

This is the fallback, not the frame: a human rhythm replaces the progression when one is invoked.

## The shipped rhythms

The starter-rhythms plugin ships two rhythms at `plugins/starter-rhythms/.contexture/extensions/rhythms/`, explained in its README; the package install lands them under the workspace's `.contexture/extensions/rhythms/`, where `ctx rhythm list` reads them. It owns the installed generic `work`; docs-discipline ships `docs-authoring` and `docs-drift` and keeps its docs-shaped `work` variant as reference material under `plugins/docs-discipline/docs/work.md`, for a workspace that wants the docs default.

`work` applies when a work request arrives and no other rhythm matches, with `activation: auto`. It is token-heavy by design: one unit of work moves through several subagents (recon, grounding, execution, review), and each subagent is a fresh context reading the record instead of dragging the history along. That buys context management and redundancy, and it is strongly recommended for cheaper, decent models: the structured flow and the independent verification close much of the gap to frontier models. Frontier models run it as discipline rather than necessity.

`debug` applies when a failure needs a root cause (a bug, a flaky test, unexpected behavior), with `activation: propose`. It is a light, single-context loop: one focused agent, one gate at a time. Its first gate requires a red reproduction, recorded with a reference, before any fix.

The gate glosses in plain words, the cost, and the practice notes live in `plugins/starter-rhythms/README.md`. The shipped rhythms are snapshots to copy and edit; in this repository the live copy of `work` belongs at `.contexture/rhythms/work.md`, the docs-shaped variant copied from the docs-discipline reference, in any workspace the live rhythms belong in its own `.contexture/rhythms/`, and an installed package's rhythms sit under `.contexture/extensions/rhythms/`. A workspace owns a rhythm by copying it into its own root, which the rhythm module resolves before the installed copy, and `ctx rhythm list` labels the workspace copy as shadowing the installed one. Onboarding offers the starter plugin when a team brings no rhythm of its own, and removes both the plugins and the onboarding guideline at adoption close.
