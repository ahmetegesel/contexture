# The record

The conversation is a scratchpad; the record is the memory. When a context window fills, the harness compacts the session into a summary, and everything behind the next step (what was decided and why, what was ruled out, what was corrected, what was verified, what is still open) dies with it. The record is the layer that does not die: plain files, maintained by the agent as the work happens, next to the code.

One unit of work, one folder, four files, each with a single job:

| file | role | how it changes |
|---|---|---|
| `state.md` | the pointer: where the unit stands and what happens next | edited freely; overwritten, never appended |
| `backlog.md` | the declaration: the work declared ahead | updated in place as tasks move |
| `journal.md` | the memory: what happened, as it happened | appended; closed only by later reference |
| `knowledge.md` | the mind: what was settled | appended; superseded forward by reference |

The files are the system, and they are agent-facing: the agent maintains them as it works, and the human reads prose rendered from them on request, never the artifacts themselves.

## state.md, the pointer

The smallest file, the only one edited freely, and the first thing a working period reads. It is the map, not the content: detail lives behind refs, never inside it.

```text
status: ACTIVE
current_anchor: A12
next_action: "one terse pointer: what to do next"
objective: "what the unit is for"
repos: [app, docs]
```

- `status:` is `ACTIVE` or `CLOSED`. It is the only status field in the convention: journal entries and findings carry none.
- `current_anchor:` is the current value of the anchor counter, `A<N>`. A fresh unit starts at `A0`, and its first boot stamps `A1`; the Anchors section has the full mechanics.
- `next_action:` is one terse pointer, overwritten never prepended. The why behind it rebuilds from the record, so it is never serialized here; when the unit sits between plans, it reads "plan the next move".
- `objective:` is what the unit is for. It lives here, not in the backlog.
- `repos:` lists the affected repos, any count.

The card mutates often and freely: it is refreshed as the work moves, at every backlog update, task landing, and period end. It is a pointer, not a log: if it grew history, it would stop being a pointer. A file meant to be read whole stays within one read, and a card that outgrows its purpose is split, with a small index left where the reader looks.

## backlog.md, the declaration

The unit's actionable tasks as a living queue: the current declaration of work, written to be executed from no matter when the agent looks. The unit's overarching objective lives in `state.md`; the backlog carries the tasks.

```text
@task auth-cookie-sessions
  STATUS: IN_PROGRESS
  OBJECTIVE: "Replace the token cache with cookie sessions"
  REFS: [journal.md#2026-09-12-auth-cookie-decision, knowledge.md#SESSION_TOKEN_SHAPE, file#src/auth/middleware.ts]
  DESCRIPTION ::
    context, the problem statement, and the scope
  ACCEPTANCE CRITERIA ::
    checkable conditions that say when the task is done
  IMPLEMENTATION DETAILS ::
    the specification and the execution blueprint:
    requirements to honor, decisions made, how it lands
```

Three fields carry the task's identity: `STATUS` (`TODO`, `IN_PROGRESS`, `DONE`), `OBJECTIVE`, and, when they exist, `REFS`. Three block containers carry the substance, each with a dedicated home:

- `DESCRIPTION` carries the context, problem statement, and scope.
- `ACCEPTANCE CRITERIA` carries the checkable done conditions, the task's gates.
- `IMPLEMENTATION DETAILS` carries the specification and the execution blueprint: the requirements and decisions the change must honor, and how it lands.

The dedicated containers are the point: technical substance gets a natural home instead of being packed into forced exit conditions or dropped for brevity.

`REFS` names its targets exactly, as `path#symbol`: a journal entry (`journal.md#slug`), a lane report (`lanes/x/report.md#claim`), a knowledge finding (`knowledge.md#NAME`), or any artifact (`file#symbol`). The ref navigates; it never substitutes for the meaning. The task must read alone, with the full picture, no matter when the agent looks at it: material living only in the conversation lands in the record first, then the task cites it.

The backlog mutates non-destructively and in place. A mid-stride pivot inserts a fresh `@task` block without destroying or rewriting the uncompleted ones. Statuses advance as work moves: active work marks `IN_PROGRESS`; completion marks `DONE` and lands one journal line, `backlog/<slug>: DONE`, carrying its evidence, the command run and its observed result.

A task marked `IN_PROGRESS` is executable as written: every needed decision lives in the task or behind a ref. Placeholders (`TBD`, "similar to <task>", "as appropriate") mean the task is not ready, and the readiness check happens before execution, never around it.

Why a queue and not a numbered plan: a sequential plan assumes one fixed track, so a pivot forces a destructive rewrite; a backlog absorbs pivots by construction, and its containers hold the technical thickness a plan squeezed into exit criteria.

## journal.md, the memory

The journal is the unit's running record and the single recording surface: events land as they happen, and the file only ever gains lines. It exists to do one thing: rebuild the working context from scratch. A fresh session loads the live entries and nothing else, and holds the position without the conversation. That reader decides what deserves an entry: whatever the reconstruction needs.

```text
@anchor A12 ("continues A11", attention: <the loaded set>)

@entry 2026-09-12-auth-cookie-sessions
  ANCHOR: A12
  WHAT: "backlog/auth-cookie-sessions: DONE. Token cache retired; the rejected refresh-token reuse is recorded with its why; suite green (42/42)"
  GROUP: auth
  KNOWLEDGE: true
  CLOSES: 2026-09-05-token-cache-introduced (done: replaced by cookie sessions)
  REF: "lanes/auth-refresh/report.md#claim"
```

An entry uses the fields it needs; the sample shows them together. In full:

- `@entry <date>-<slug>` opens a block. The slug is the entry's name, and closures target it, so it is contractual: a date, a dash, and a slug ending alphanumeric.
- `ANCHOR:` is the anchor current at write time, the period the entry belongs to.
- `WHAT:` carries the event's substance: what happened, the result, why the next step follows. A closer carries its verdict and resolution here.
- `GROUP:` is the agent's topic thread, stable within the unit.
- `KNOWLEDGE: true` marks the entry knowledge-worthy; it is the harvest's input.
- `THREAD: true` marks an entry that awaits resolution (a verdict, an execution, a dispatch report, the harvest). It is stamped at birth, never flipped, and closes the moment the awaited thing arrives.
- `CLOSES:` or `SUPERSEDES:` is the only closure: it names an earlier slug, carries a verdict word and a reason, and leaves the target untouched. The liveness section has the mechanics.
- `REF: "path#symbol"` grounds the entry in an artifact.

Events land at formation, never batched at period end: the interaction beats the journal as it happens, and the work beats never wait for an interaction beat. An entry that would help a fresh boot reconstruct the position records, and the dialect makes recording cheap, so the record pours fully.

Append-only is the file's identity. An edit would rewrite what was true then; entries stay evidence of their moment, a revision lands on top and supersedes by reference, and the current state is derived from the trail, never rewritten. The discipline survives because it reduces to one recurring action: append. One action, fired often, needs no memory of rules, and the more the record accumulates, the more that one action suffices.

## knowledge.md, the mind

Knowledge holds what the unit settled, each finding written at the moment of a decision or a discovery. Findings are statusless: developing ideas stay in the journal, so everything that lands here is already established.

```text
@finding SESSION_TOKEN_SHAPE
  SUPERSEDES: TOKEN_REFRESH_REUSE (cookie sessions replaced token refresh, 2026-09-12)
  REF: "journal.md#2026-09-12-auth-cookie-decision"
  SUMMARY ::
    Sessions are carried in cookies; refresh-token reuse is rejected and
    must not return.
```

- `@finding NAME` opens a block. The name is the finding's identity, and a later successor targets it.
- `SUPERSEDES: <ref> (reason)` appears on a revision and names the finding it replaces. Supersession is forward-only: the predecessor is never touched.
- `REF: "path#symbol"` points at the full version in an append-only artifact: `journal.md#entry` or `lanes/x/report.md#claim`. Never a dynamic file: references of record must survive. Where no stable full version exists, the `SUMMARY` carries the whole story. A finding with no ref and no story is a hypothesis: useful for questions, never a base for tasks.
- `SUMMARY ::` carries the settled claim.

A finding lands only through the harvest of a `KNOWLEDGE: true` entry: the agent proposes one compact candidate, the human confirms or reshapes it, and the entry closes by reference. A candidate that is not confirmed drops; nothing lands just to be recorded.

Knowledge is append-only and carries no timeline: the journal owns time, and the refs are the seam between the two. It loads fully, because it stays small; each line is a settled decision. Its current view is derived: a finding that a successor names is replaced, even though it stays on disk as evidence of what was believed before.

## Liveness and closure

What loads is decided by one subtraction: live = not closed. The load list is every journal entry whose slug no `CLOSES` or `SUPERSEDES` names, whole file, all anchors. Nothing is flipped and nothing is maintained: an entry's liveness is derived from the closures that exist.

Closure is a later entry naming its target. The target is never touched. The closer carries a verdict word, `done`, `superseded`, `dropped`, or `folded`, then the reason; the closer's `WHAT` carries the resolution. A close without a statement is a lie. And the closer lands in the same breath the target resolves: resolution and closure are one write, never a maintenance pass.

Two kinds of open entries, and only two:

- A `THREAD: true` entry awaits something and closes the moment it arrives. A paused thread stays open: the open tail in the load is the reminder it exists, and a resume is fresh entries plus a `next_action` ref, never a fake close.
- An unmarked entry is a receipt: the final word on a completed fact. It takes no closer. It stays open as the boot's context trail and folds only at a human-called chapter turn or at unit close. Receipts never close at period end.

The failure direction is deliberate, and it has a name: default-live. An entry loads unless a mechanical fact excludes it. Prose failures (a reworded label, a missing mark, a typo in a name) can over-load a few entries; they never drop a live one. Over-loading costs tokens; dropping loses memory, and only the second is irrecoverable. A settled entry still sitting in the load is visible debt: a missing closer, settled when the period ends.

Closers must resolve. Every `CLOSES` or `SUPERSEDES` slug has to name a real entry; a typo silently keeps its target live, and the load pays for it. The extraction parses the target field only: a slug mentioned in the reason prose closes nothing, and a target slug must end alphanumeric. A dangling closer is a defect, never a note.

Liveness is the journal's rule. The other files load and age by their own logic:

| file | how it loads | what decides its currency |
|---|---|---|
| `state.md` | whole: it is the map | the writer, who overwrites it freely |
| `backlog.md` | whole: it is the queue | `STATUS` |
| `journal.md` | the live entries: the subtraction | closure by reference |
| `knowledge.md` | whole: it stays small, every line a decision | the successor's `SUPERSEDES` line |

## Anchors

Time is recorded by anchors. An `@anchor` line stamps one working period, a fresh context load, and receipts what that period loaded:

```text
@anchor A12 ("continues A11", attention: <the loaded set>)
```

A fresh unit starts at `A0`; its first boot stamps `A1`; each later stamp is the previous plus one. The attention list names what was loaded, as a receipt: it informs a reader and never feeds the next load; the subtraction decides.

Anchors have exactly two jobs: period ordering and load receipts. They are never liveness. No entry loads or skips by its anchor, and age never closes anything: an entry stays live until a closure names it.

Entries carry the anchor that was current when they were written, which clusters them into periods by a plain grep; the clustering survives any reordering of the file. Knowledge carries no anchor: the temporal axis belongs to the journal, and refs are the seam between the axes. `state.md` carries only the counter's current value.

## Supersession

A revision never rewrites the thing it revises. It lands on top and supersedes its predecessor by reference; the predecessor stays as the evidence of what was believed then, and the current state of the record is derived from the trail.

In the journal, a later entry's `SUPERSEDES: <slug> (superseded: reason)` closes the earlier entry. In knowledge, the successor finding carries `SUPERSEDES: <ref> (reason)`, and the predecessor remains on disk, marked from the successor's side.

`CLOSES` and `SUPERSEDES` are one mechanic, and the verdict word carries the nuance. `SUPERSEDES` records that a belief or an entry was replaced. `CLOSES` records that something ended: `done`, `dropped`, or `folded`. Both name a real target; both leave it untouched; both put the resolution in the closer's `WHAT`.

## The schema as the memory boundary

Everything above rests on one property: structure is what makes information survive. The agent fills information into schemas, so the schema is the boundary of what the record can remember. What has no field is not saved in a form the agent will later recognize.

That boundary sets two failure modes, and the design treats them differently:

- Information with no field yet is recoverable. Fields emerge as queries demand them, and the refit moves existing material forward. The journal is the free-form catch-all: the unshaped lands there first, and shaping happens later.
- A nuance nobody recognizes at write time is the unguardable residual. No schema protects against it, and no sweep over whole entries sees it. The design accepts it rather than pretending to solve it.

The boundary pays for itself in loading. The record grows with every session until it is enormous, and loading stays small: closed and superseded entries drop out, revisions replace their predecessors, and because every event carries the same shaped fields, a query can slice any subset. A session pays for what is open, not for what accumulated.

The four grammars share one pseudo-language, and it is strict on purpose:

- Typed blocks start at column 0; bodies indent two.
- `::` opens a block scalar; `|` means alternation only; `[ ]` wraps optional parts; `->` means flow; `#` starts a comment.
- Whitespace is syntax: the queries anchor on block starts, so a stray indent silently breaks them. The templates pin the shapes; write by filling one, never by copying a stale instance.
- Spellings are contractual: a word with two spellings is a search that silently misses, and a search that cannot be relied on is a rule that cannot be enforced.

None of it is a volume prescription. The schema holds the shape, the writer holds the volume: guidance names what deserves the record, never how much. Token efficiency is the dialect, never a cap on content. Omit ornament, never substance.
