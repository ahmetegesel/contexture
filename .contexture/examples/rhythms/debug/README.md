# The debug rhythm - an example

This folder holds an example *rhythm* and a plain-language explanation of it.
A rhythm is a named order of gates for a kind of work. The convention ships
none of its own - your team chooses its rhythms, or the agent proposes one on
its trigger. This example shows a complete one so you can see the shape, copy
it, and edit it into your own.

## What it is

`debug` applies when a failure needs root-cause: a bug, a flaky test, an
unexpected behavior. Its activation is `propose` - the agent recognizes the
trigger and proposes the rhythm before applying it; the human confirms.

It is a light, single-context loop: unlike the work rhythm, it does not need
several lanes - one focused agent, one gate at a time, is the shape.

## The gates, in plain words

1. REPRODUCE - make the failure happen on demand and write it down (the record
   gets a reference to it). Read the error whole. Check what the record
   already knows before touching anything; the reproduction comes first,
   a fix without one is a guess.
2. TRACE - follow the failure back to its original trigger. Check what changed
   recently and instrument the boundaries the data passes through.
3. HYPOTHESIS - one minimal idea at a time, and state what it predicts before
   testing it. Three failed fixes in a row is a signal: stop and question the
   architecture with the human.
4. FIX - fix the root, never the symptom. Add defense at other layers where
   the failure warrants it, and land the fix with its record.
5. VERIFY - the reproduction now passes, regressions are checked, and the
   evidence is fresh - the mechanical checks where the change carries them.
6. REFRESH - the housekeeping sweep: journal, backlog, knowledge, the audit.

## What it looks like in practice

A test fails intermittently. The agent reproduces it, records the
reproduction, traces it to a shared helper that never resets its guard,
proposes the one-line fix, and proves it by re-running the reproduction and
the suite.

## Notes

- Gates close by their artifacts, never by memory.
- The record - state, backlog, journal, knowledge - is the source of truth,
  never the conversation.
- Onboarding offers this example when a team has no rhythm of its own; once
  copied, it is the team's to edit.
- This file is an illustrative snapshot. Your team's live rhythms belong in
  `.contexture/rhythms/`.
