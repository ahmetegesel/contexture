# The work rhythm - an example

This folder holds an example *rhythm* and a plain-language explanation of it.
A rhythm is a named order of gates for a kind of work. The convention ships
none of its own - your team chooses its rhythms, or the agent proposes one on
its trigger. This example shows a complete one so you can see the shape, copy
it, and edit it into your own.

## What it is

`work` is the default rhythm: it applies when a work request arrives and no
other rhythm matches. Its activation is `auto` - the agent applies it on
trigger without a separate ask, because this is the rhythm work usually needs.

## What it costs, and who it fits

This rhythm is token-heavy by design: one unit of work moves through several
lanes - recon, grounding, execution, review - and each lane is a fresh context
that reads the record instead of dragging the history along. That costs tokens,
and buys two things: strong context management and redundancy.

It is strongly recommended for cheaper, decent models. The structured flow and
the independent verification close much of the gap to frontier models: the same
quality of output is reached through redundancy instead of raw model power.
Frontier models run it fine too - for them it is mostly discipline, not
necessity.

## The gates, in plain words

1. GATHER - collect the request: what the human wants, the constraints, and
   where the answers live. Facts come from the record first, the repository
   for what the record lacked; a recon lane can do this at scale. The gate
   closes when the facts and the open questions are on the table.
2. DISCUSS - talk it through with the human. Facts, constraints, and decisions
   are journaled as they surface, so the conversation leaves a trace.
3. DECIDE - the human's verdict. The work lands in the backlog as tasks: what
   to do, how it will be judged, and how it will be executed.
4. GROUND - independent lanes check the plan against the record and the
   repository before anything is built. Mistakes surface here, not mid-build.
5. AMEND - the corrections land in place; anything material goes back to the
   human.
6. EXECUTE - one lane per task (small same-shape tasks batch), parallel where
   independent. Each change lands with its own checks.
7. GUARDS - the mechanical checks run green before any review: the audits and
   whatever the change carries.
8. REVIEW+HARDEN+VERIFY - one fresh lane reviews independently, findings are
   fixed, and the guards are proven again.
9. LAND - one act once the gates are green, after the human's sign-off. Where
   a project lands through a code review flow, its own rhythm takes over here.
10. REFRESH - the housekeeping sweep: journal, backlog, knowledge, the audit.

## What it looks like in practice

Someone asks for a change. The agent gathers the facts, asks the questions
that only the human can answer, and writes the verdict into the backlog. A
ground lane proves the plan, execution lanes do the work, a fresh lane reviews
it, and the change lands as one act - each step leaving its artifact behind.

## Notes

- Gates close by their artifacts, never by memory. A task done without its
  journal event is a defect the audit prints.
- The record - state, backlog, journal, knowledge - is the source of truth,
  never the conversation.
- Onboarding offers this example when a team has no rhythm of its own; once
  copied, it is the team's to edit.
- This file is an illustrative snapshot. Your team's live rhythms belong in
  `.contexture/rhythms/`.
