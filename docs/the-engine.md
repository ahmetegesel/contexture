# The engine

## What the engine is

The engine is the part of contexture that runs and checks: AGENTS.md, the grammars, and the scripts. It is plain files and plain awk all the way down: no service, no database, no runtime.

The division of labor is deliberate. The model does the work; the machinery holds the line. A record kept by memory drifts, so the parts that must not drift are mechanical instead: the shapes are pinned in files, the searches are plain shell tools, and the checks are small scripts that run at fixed points. Quality comes from the machinery, not from the model remembering.

## AGENTS.md, delivered every turn

A coding harness reads its repository instruction file before it acts. In a contexture workspace that file is AGENTS.md, and it is the only file guaranteed to be in front of the agent every turn: everything else loads on demand. The guarantee is a convention, not a harness feature, and it shapes the file. It has to fit one read, and every line in it is paid for on every turn, so it carries only what governs and what navigates.

Its two jobs are exactly that: govern and navigate. It carries the laws and the pointers to everything else. It carries no schemas (those live in the templates), no provenance (that lives in the journal), and no rhythm names beyond the one default loop.

The sections are a tour of the convention:

| section | what it carries |
|---|---|
| `@laws` | the eight slug-addressed laws |
| `@layout` | where every file lives and what it is for |
| `@record` | the artifact map: what each artifact records and why |
| `@journal` | the event workflow: formation, substance, liveness, markings |
| `@backlog` | the task workflow |
| `@query` | how the agent decides what to load |
| `@boot` | the sequence that starts every working period |
| `@interact` | how the agent treats the human |
| `@rhythms` | the rhythm contract and the default design loop |
| `@subagents` | the dispatch contract |
| `@refresh` | the artifact sweep |
| `@close` | period end and unit close |
| `@handoff` | the proof before context death |
| `@git` | the gitignore strategy for the workspace |
| `@update` | how the base evolves upstream |

### The laws

The laws are the spine of the whole system, and they ride with the agent every turn. Each law reads `slug: statement`, and a reference addresses the slug, as in `@laws#verify-before-close`. The current eight:

- `source-of-truth`: session files are the only source of truth, never the conversation.
- `load-only-needed`: load only what the work needs; closed sessions stay untouched unless the task calls for them.
- `writer-holds-volume`: the schema holds the shape, the writer holds the volume.
- `process-free`: process is free and human-chosen; govern the output, not the process.
- `compose-from-record`: compose from the record, never from the conversation.
- `verify-before-close`: no done without evidence, and never a claim of verification not performed.
- `harvest-the-human`: durable knowledge is surfaced by question, crystallized, and landed with approval.
- `workspace-confinement`: the workspace is the boundary; the agent never roams outside it.

Slug addressing is what lets the set grow and the overlays extend it. A positional name would force every reference to chase every insertion; a slug is stable for life, and an overlay can append its own laws at the end without renumbering anything.

### The overlays beside it

AGENTS.workspace.md and AGENTS.local.md sit beside the base and extend it, by section, with `@append` or `@replace`. The workspace overlay is shared and tracked with the work; the local file is personal and yields to the workspace when they disagree. Both amend; neither may contradict a law. They have their own page; here it matters only that the base plus its overlays is what the agent actually reads.

## The templates

The grammars live in `.contexture/templates/`, one per artifact:

| grammar | the artifact it shapes |
|---|---|
| `state.md` | the live pointer |
| `backlog.md` | the unit's tasks |
| `journal.md` | the events |
| `knowledge.md` | the settled findings |
| `recipe.md` | a lane's brief |
| `report.md` | a lane's report |
| `overlay.md` | AGENTS.workspace.md and AGENTS.local.md |

Writing is filling, never inventing: an artifact is written by filling its grammar directly, with the template in hand as the complete shape. Each grammar carries every valid variation and a filled sample at its foot, written in template syntax with angle-bracket placeholders, so the shape can be read without concrete content to copy.

That last property is the drift control. Templates in a tracked folder stay exact as long as something applies them, and the fix for drift is navigation, not memory: AGENTS.md points at them, and the artifact grammar demands a match.

### The shared dialect

All grammars speak one dialect, and it is contractual. Typed blocks start at column 0; bodies indent two; `::` opens an indented block value; `|` means alternation only; `[ ]` wraps optional parts; `->` means flow; `#` starts a comment. Whitespace is load-bearing: a block that starts at the wrong column silently breaks every query written against it.

Spellings are contractual too. A pointer names its target exactly, a section and step (`@refresh`) or a path and symbol (`journal.md#entry`); a vague mention is a defect. The reason is mechanical: the workspace queries with plain search, and a vocabulary word with two spellings is a search that silently misses.

The dialect governs form, never volume. It compresses how things are written, never how much: the schema holds the shape, the writer holds the volume. The grammars name the elements an artifact must carry; the rest is freestyle. The artifacts themselves, and the fields they carry, are the record page's material.

## The scripts

Three instruments ship in `.contexture/scripts/`, and they are the engine's machinery: one streams what is live, one audits the record's defects, one indexes the rhythms. They are POSIX awk, which means no dependencies, no model tokens, and the same answer every time. They run through `awk -f`, so nothing needs installing.

### journal-active.awk: the stream

Returns every live entry with its body whole. Live means unclosed: the set is the journal entries that no closure names. One command, one stream:

```bash
awk -f .contexture/scripts/journal-active.awk .contexture/sessions/<unit>/journal.md .contexture/sessions/<unit>/journal.md
```

The file is passed twice in the same execution: the first read collects the closure targets, the second streams the bodies. The closure parse reads the target field only, so a slug mentioned in a closure's reason prose can never close anything. The output is the set, whole, with no hand-picking and no per-entry reads.

The command runs at boot, where it is the load, and at handoff, where it is the cold read: the stream read exactly as a fresh boot would read it.

### journal-audit.awk: the repair instrument

Returns the record's defects, each flagged with a line or a slug, and exits nonzero when any fires:

```bash
awk -f .contexture/scripts/journal-audit.awk .contexture/sessions/<unit>/journal.md
```

One argument. The script derives `backlog.md` and `state.md` from the journal's folder and checks the session alongside the journal; a lane journal has no siblings, so those checks skip quietly there. When the run is clean the script also prints the open-thread tail: the entries stamped `THREAD: true` that no closure names. The tail is a display, never an enforcement: a thread that pauses stays open, and its line in the tail is the reminder it exists.

The classes, and what each one asks for:

| flag | the defect | the repair |
|---|---|---|
| dangling closer | a `CLOSES:` or `SUPERSEDES:` names a slug no entry carries | fix the slug or the closer |
| slugless closer | a closer carries no valid date-slug target | point it at real entries |
| dateless entry slug | an entry name does not match the date-slug grammar | fix the entry's slug to the date-slug grammar |
| inline marker | `THREAD:` or `KNOWLEDGE:` sits on the `@entry` line | move it to its own field line |
| unharvested knowledge | a `KNOWLEDGE: true` entry that no closer names | harvest it at the next refresh; the entry then closes by reference |
| done without event | a `STATUS: DONE` task with no `backlog/<slug>: DONE` line in the journal | record the completion event |
| in-progress absent from state | a `STATUS: IN_PROGRESS` task the state pointer does not name | refresh `next_action` in state.md |

The audit is a repair instrument: fix what it flags and fill what is missing before the period ends; a note about a flag is not a repair. It runs at refresh, close, and handoff, and close and handoff expect exit 0.

### rhythms-index.awk: the selection index

Returns one line per rhythm: the name, the path, its trigger, and its activation policy.

```bash
awk -f .contexture/scripts/rhythms-index.awk .contexture/rhythms/*.md
```

The boot loads this index to discover what rhythms exist; a rhythm's body loads only when it is selected. A file with no `use when:` line prints `(missing)`, and an activation the file does not state defaults to `propose`: the agent proposes the rhythm on its trigger and the human confirms. `auto` is the explicit opt-in, where the agent applies the rhythm without a separate ask.

### One audit per grammar

The three scripts are payload instruments, shipped with the convention and identical everywhere. A session can also carry an audit of its own for a grammar the payload does not know yet; the session's bank audit is the precedent. It stays session-local until its grammar proves generic, then it can promote to the payload as a sibling. The separation is deliberate: no experimental checks inside a shipped script, and each audit derives its siblings rather than being handed their paths. Refresh and handoff run every audit in play, and the receipt carries the results.

## The completeness loop

The loop is what the machinery does with the record: it makes gaps visible at fixed points and demands repair instead of notes. Taking the stations in the order a unit meets them:

- **Boot** loads the rhythm index and streams the live entries. The load is the subtraction, not a judgment call, so the agent pays for what is open and nothing else.
- **Work** journals events as they happen and flags knowledge-worthy entries where they land. The flag is the harvest's input; nothing needs to be collected later.
- **Refresh** runs at every rhythm boundary and inside close. It sweeps the artifacts: events journaled, backlog statuses advanced, `next_action` refreshed. It runs the harvest: every open flag, one candidate each; a confirmed candidate lands in knowledge and its entry closes by reference, and a candidate that is not landed drops. Then it runs the audit, and what it flags is fixed.
- **Close** closes the period's done events by reference and requires the audit to exit 0.
- **Handoff** runs before context death, whether that is a compaction, a tool change, or a long break. The period-end writes run if they are not done, then the cold read: run `journal-active.awk` and read the stream as a fresh boot would. While the context is still full, improve the quality and fix what was missed; the gaps close now, never after compaction. The audit exits 0.

Why this holds together:

- The record is append-only and schema-driven, so "missing" is a mechanical fact rather than a memory test: an absent closer, an unrecorded done event, a status the pointer does not name are all visible to a small script.
- The checks run at fixed points, and they are cheap: a few awk commands, no model tokens, the same answer every time. Frequency is the point; the open-flag sweep at each refresh is the check, not a rare batch at the end. When harvesting waited for period end, older flags slipped past every close.
- An instrument earns trust by failing on the defect it guards. A check that returns the same answer whether or not the failure is present proves nothing, so the instruments are proved against planted defects before they are trusted, and a green run means exactly the classes it checks are clean. It is never a claim that the record is complete.

## The drawer layout

Everything the convention installs or uses lives under `.contexture/`, except the files a harness must find at the repository root:

```text
AGENTS.md            the laws, delivered every turn
AGENTS.workspace.md  the shared overlay
AGENTS.local.md      your amendments
examples/            example rhythms, copied at adoption
.contexture/
  ONBOARDING.md      the adoption guideline (removed when the adoption closes)
  templates/         the grammars every artifact fills
  scripts/           the queries and audits
  rhythms/           your process patterns
  sessions/          the units of work
```

The root belongs to the harness: AGENTS.md has to sit where the harness looks for repository instructions, and the overlays sit beside it. Everything else lives in the drawer. An adopting workspace keeps its own files at the root, freely; the drawer's contents are the convention's, and the two never mix.

### One home, three classes

Placement follows the class of the file, never convenience:

| class | files | on an update |
|---|---|---|
| update payload | AGENTS.md, `.contexture/templates/`, `.contexture/scripts/` | replaced from the new tag, byte for byte |
| adoption material | `.contexture/ONBOARDING.md`, `examples/` | delivered once; never re-synced; the guideline is removed when the adoption closes |
| workspace-owned | `.contexture/sessions/`, `.contexture/rhythms/` | never touched |

The classes exist because the files have different lives. The payload evolves with the convention and must stay identical across every workspace. Adoption material is used once and then belongs to the past: the guideline has served its purpose by close, and the examples are reference material a workspace copies when it wants them. Sessions and rhythms are the workspace's own state, and no update may touch them.

### The sync derives from the tag

There is no manifest. The tracked set under a release tag is the declaration: `git archive <tag> AGENTS.md .contexture/` copies it, `git ls-tree` enumerates it, and a comparison per file verifies it. Whatever the tag tracks is the set; a file cannot silently join or leave the payload without changing the tag.

### The layout bounds the load

The drawer is also the context mechanism, and the reason is structural. When the agent works a unit, it reads `.contexture/sessions/<unit>/` and the convention's files it needs, never a global blob of everything. The filesystem is the index, and the folder is the boundary: no rule has to say "do not read the rest", because the layout has already said it.

The record page covers what the artifacts hold and how liveness works; units and lanes covers the container and the dispatch; rhythms covers the process layer; overlays covers the amendment grammar; adoption covers the install.
