# starter-rhythms: the work and debug rhythms to start from

The starter-rhythms plugin packages two rhythms, `work` and `debug`, with a
plain-language explanation of each. A rhythm is a named order of gates for a
kind of work. The convention ships none of its own: your team chooses its
rhythms, or the agent proposes one on its trigger. These two are the starting
set: copy them, and edit the copies into your own.

## What it offers

| rhythm | applies when | activation |
|---|---|---|
| `work` | a work request arrives and no other rhythm matches | `auto` |
| `debug` | a failure needs a root cause (a bug, a flaky test, unexpected behavior) | `propose` |

## Adoption

The plugin mirrors the target tree, so its `.contexture/` subtree lands as-is.
Copy the rhythm files into the workspace drawer:

```sh
mkdir -p .contexture/rhythms
cp plugins/starter-rhythms/.contexture/rhythms/work.md \
   plugins/starter-rhythms/.contexture/rhythms/debug.md \
   .contexture/rhythms/
```

The copies are your team's to edit. Onboarding offers this plugin when a team
brings no rhythm of its own, and removes the plugins folder with ONBOARDING at
adoption close. The upstream copy stays the distributable one: workspace edits
never travel back.

## The work rhythm

`work` is the default rhythm: it applies when a work request arrives and no
other rhythm matches. Its activation is `auto`: the agent applies it on
trigger without a separate ask, because this is the rhythm work usually needs.

### What it costs, and who it fits

This rhythm is token-heavy by design: one unit of work moves through several
subagents (recon, grounding, execution, review) and each subagent is a fresh
context that reads the record instead of dragging the history along. That costs
tokens, and buys two things: strong context management and redundancy.

It is strongly recommended for cheaper, decent models. The structured flow and
the independent verification close much of the gap to frontier models: the same
quality of output is reached through redundancy instead of raw model power.
Frontier models run it fine too; for them it is mostly discipline, not
necessity.

### The gates, in plain words

1. GATHER: collect the request: what the human wants, the constraints, and
   where the answers live. Facts come from the record first, the repository
   for what the record lacked; a recon subagent can do this at scale. The gate
   closes when the facts and the open questions are on the table.
2. DISCUSS: talk it through with the human. Facts, constraints, and decisions
   are journaled as they surface, so the conversation leaves a trace.
3. DECIDE: the human's verdict. The work lands in the backlog as tasks: what
   to do, how it will be judged, and how it will be executed.
4. GROUND: independent subagents check the plan against the record and the
   repository before anything is built. Mistakes surface here, not mid-build.
5. AMEND: the corrections land in place; anything material goes back to the
   human.
6. EXECUTE: one subagent per task (small same-shape tasks batch), parallel
   where independent. Each change lands with its own checks.
7. GUARDS: the mechanical checks run green before any review: the audits and
   whatever the change carries.
8. REVIEW+HARDEN+VERIFY: one fresh subagent reviews independently, findings
   are fixed, and the guards are proven again.
9. LAND: one act once the gates are green, after the human's sign-off. Where
   a project lands through a code review flow, its own rhythm takes over here.
10. REFRESH: the housekeeping sweep: journal, backlog, knowledge, the audit.

### What it looks like in practice

Someone asks for a change. The agent gathers the facts, asks the questions
that only the human can answer, and writes the verdict into the backlog. A
ground subagent proves the plan, execution subagents do the work, and a fresh
subagent reviews it, and the change lands as one act, each step leaving its
artifact behind.

## The debug rhythm

`debug` applies when a failure needs root-cause: a bug, a flaky test, an
unexpected behavior. Its activation is `propose`: the agent recognizes the
trigger and proposes the rhythm before applying it; the human confirms.

It is a light, single-context loop: unlike the work rhythm, it does not need
several subagents: one focused agent, one gate at a time, is the shape.

### The gates, in plain words

1. REPRODUCE: make the failure happen on demand and write it down (the record
   gets a reference to it). Read the error whole. Check what the record
   already knows before touching anything; the reproduction comes first,
   a fix without one is a guess.
2. TRACE: follow the failure back to its original trigger. Check what changed
   recently and instrument the boundaries the data passes through.
3. HYPOTHESIS: one minimal idea at a time, and state what it predicts before
   testing it. Three failed fixes in a row is a signal: stop and question the
   architecture with the human.
4. FIX: fix the root, never the symptom. Add defense at other layers where
   the failure warrants it, and land the fix with its record.
5. VERIFY: the reproduction now passes, regressions are checked, and the
   evidence is fresh; the mechanical checks where the change carries them.
6. REFRESH: the housekeeping sweep: journal, backlog, knowledge, the audit.

### What it looks like in practice

A test fails intermittently. The agent reproduces it, records the
reproduction, traces it to a shared helper that never resets its guard,
proposes the one-line fix, and proves it by re-running the reproduction and
the suite.

## Needs

None beyond the base: the plugin is plain markdown, with no scripts and no
dependencies. `ctx session index` reads whatever rhythm files land in
`.contexture/rhythms/`.

## Contributing

Change the rhythms here, in the upstream copy, and keep this README's gate
glosses in step: they are the plain-language view of the files. Packaging,
naming, and the test convention are in `docs/plugins.md`.

## Notes

- Gates close by their artifacts, never by memory. A task done without its
  journal event is a defect the audit prints.
- The record (state, backlog, journal, knowledge) is the source of truth,
  never the conversation.
- This README is the plugin's explanation; your team's live rhythms belong in
  `.contexture/rhythms/`.
