# contexture

When the context window fills, your harness compacts: a model is asked to summarize the session, and the next turn carries on from that summary. It reads like this:

```
## Current Work
Refactoring the auth middleware. Cookie sessions replacing the token cache.
## Files
src/auth/middleware.ts, src/auth/session.ts
## Next Steps
Finish the middleware; then update the test suite.
```

A fine summary, and still a summary: it keeps a next step, but everything behind it (what was decided and why, what was ruled out, what was corrected, what was verified, what is still open) dies with the context. The next session does not go blank; it goes confidently wrong.

What survives is what the agent wrote down as it worked:

```
@entry 2026-09-12-auth-cookie-sessions
  ANCHOR: A12
  GROUP: auth
  WHAT: "backlog/auth-cookie-sessions: DONE. Token cache retired; the rejected refresh-token reuse is journaled with its why; suite green (42/42)"
```

Structured on purpose: exact fields and references survive, and plain scripts can pull just the relevant slice, so a fresh session loads a little, exactly, instead of a summary of everything.

contexture is a convention, not a tool: any harness, one commit, no dependencies.

## What your agent sees

What returns is the open work itself: one entry per event, bodies whole:

```
@entry 2026-09-15-login-route
  ANCHOR: A12
  GROUP: auth
  WHAT: "Login route now issues the cookie session. Open: the logout race; refresh still hits the old cache"
```

Closed entries stay unloaded; the session resumes at the login route.

## How you work with it

You work as you already do: tasks, questions, corrections. The agent writes the record as it goes; you never read it.

What you read is prose: status, decisions, drafts, rendered from the record on request. The files are the agent's memory, not your homework.

The record grows with every session, until it is enormous. Loading stays small anyway. Closed and superseded entries drop out, and the schema keeps every event sliceable. A fresh session resumes mid-thread, paying for what is open, not for what accumulated. Smaller models gain the most: the discipline lives in the context, not the model, so even a modest one holds a long, complex effort.

## How it works

One unit of work, one folder of plain files, maintained by the agent as it goes:

```
.contexture/sessions/auth/
  state.md       the pointer: where the work stands
  journal.md     the memory: what happened, append-only
  knowledge.md   what was settled, each with a reference
  backlog.md     the work declared ahead
```

Events land as they happen; findings as they settle; tasks as they move. Nothing is edited after the fact: an entry stays what was true when it was written, and a revision lands on top, superseding its predecessor by reference. The current state is derived from the trail, never rewritten.

No service, no database, no runtime: the files are the system.

## A unit and its life

Everything you do belongs to a unit of work: a folder that opens when the work starts, closes when it ends, and outlives every session and compaction that touches it.

You never manage them. You name what you want; the agent finds the matching unit or bootstraps a new one, and tells you which.

The clustering earns its keep. A unit is the context boundary: a returning session loads that one unit, not the pile. Its life is the memory boundary: closed work stays as history and stops loading. And separate units keep unrelated threads apart.

## Delegated work

Delegation is first-class. Whenever work is handed to a subagent, it gets a lane: a folder holding the brief it received, the trace of what it did, and the report it leaves.

That memory is physical, so nothing depends on the subagent surviving. If a lane stalls or dies, a re-dispatch resumes from its folder, not from scratch.

Reports come back structured too: findings, evidence, verdicts. The dispatcher never absorbs raw logs; the detail stays in the lane, the thread stays in view. An orchestrating agent is the clearest example: it learns from every report while its own context stays lean.

## Rhythms

The record turns memory into plain files; a rhythm does the same for process. Named, and written down as a file your workspace owns, it holds the order of the steps and what each must produce. Rhythms complement your harness's skills and features rather than replace them: skills add capability, rhythms add shape, and one can carry the other. Contexture owns two layers, the record and the process; your task skills run untouched unless they contradict one of the two. A default loop (discuss, decide, backlog, execute, verify, refresh) stands in when nothing fits.

The record is not a rhythm's business. Recording is core and automatic: under every rhythm, entries land as they happen, findings settle as decisions, and a fresh session resumes from the record. A rhythm never restates what the core already records; extra recording rules belong to an overlay.

The agent proposes the matching rhythm and you say yes, or your workspace opts into automatic. The process stays yours.

## The engine

The workspace is a small set of plain files:

```
AGENTS.md            the laws, delivered every turn
.contexture/
  templates/         the grammars every artifact fills
  scripts/           the queries and audits
  rhythms/           your process patterns
  sessions/          the units of work
AGENTS.workspace.md  the workspace overlay
AGENTS.local.md      your amendments
```

AGENTS.md is the only file delivered to the agent every turn; everything else loads on demand. The templates pin each artifact's shape, so writing is filling, never inventing. The scripts are plain awk and shell: they stream what is live, audit closures, and find gaps.

Because the record is append-only and schema-driven, the scripts can see what is missing and push the agent to complete it. Quality comes from the machinery, not from the model remembering.

## Making it yours

Two files extend the convention for your workspace. AGENTS.workspace.md is the shared overlay: your workspace's amendments, tracked with the work. AGENTS.local.md is yours alone: personal preferences that yield to the workspace when they disagree.

Amend freely, never contradict. Extend a section or replace it; add rules where they fit. Nothing enforces this, which is why it is on you: the core carries the guarantees, and an overlay that contradicts a law silently breaks what depends on them.

## Why it works

The record is the missing layer. Today's harnesses manage context generically: they append the conversation, summarize when it fills, and hope the summary holds. The work behind the conversation is not their concern. Put the work in structured files the agent maintains, and summarization stops being the memory.

Nothing here is novel: keeping records is how every long project survives. What changes is where the record lives: beside the agent, maintained as the work happens.

The parts reinforce each other. Append-only makes one recurring action enough; the schema makes that write exact; the scripts make gaps visible; the laws keep the whole thing in front of the agent every turn. Nothing depends on the model remembering to be disciplined: the machinery holds the line, and that is also why smaller models keep up. Their attention stays on the work.

The laws are the spine: a short, slug-addressed set that rides with the agent every turn. They live in AGENTS.md; overlays add their own where a workspace needs them.

## What it is not, and who it is for

Not a library, not a plugin: nothing to import, nothing to install. Not a managed product: no service holds your work. Not magic: the agent still does the work, and the record keeps it.

Not a knowledge base either. It works alongside one; what your sessions accumulate is exactly what a knowledge base wants.

It is for people who run coding agents daily and want the work to survive the window. Long sessions, high standards, no patience for re-explaining: that is the fit. If you want a service to remember for you, this is not it.

## Adopt in five minutes

The fast path: point an agent at `.contexture/ONBOARDING.md`. It isolates a branch, maps your existing instructions, proposes the installation, and executes on your yes (files, gitignore, symlinks, overlays).

The manual path: copy the set and make the scripts runnable.

```
git archive <tag> AGENTS.md .contexture/ examples/ | tar -x -C <your-repo>
chmod +x .contexture/scripts/*.awk
```

Either way, finish the same way: tell the agent what the first unit of work is. It bootstraps the folder, and the record starts.

## Docs

- The record: artifacts, liveness, closure
- The engine: AGENTS.md, the grammars, the scripts
- Units and lanes: the folder, its life, delegated work
- Rhythms: the grammar, activation, the default loop
- Overlays: the amendment grammar, precedence
- Adoption: the onboarding flow, topology choices
- Examples: a work loop and a debug loop to copy

<!-- docs links land here -->

For the instruments behind it all:

| script | what it returns |
|---|---|
| journal-active.awk | every live entry, bodies whole, in one pass |
| journal-audit.awk | the record's defects (malformed entries, dangling closures, unharvested flags, tasks done without their event) and the open-thread tail; exits nonzero on any |
| rhythms-index.awk | one line per rhythm: name, path, use when, activation |
