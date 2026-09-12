# Overlays

The core carries the guarantees; your workspace carries its differences. Two files make that split real: `AGENTS.workspace.md`, the shared overlay tracked with the work, and `AGENTS.local.md`, your personal amendments. This page covers what each file is, the grammar they speak, how precedence resolves between them, and the one rule that binds both: amend, never contradict.

## The two files

`AGENTS.workspace.md` is the shared overlay. Its contents are your workspace's amendments: the rules and adaptations that make the shared convention fit this repository. It is tracked with the repository and copied between teams, so the adaptations travel with the work.

`AGENTS.local.md` is yours alone: personal preferences, rhythm defaults, small conveniences for the person you are or the machine you work on. Where the two disagree, the local file yields to the workspace overlay. Keep it tiny; it is read at boot and should cost nothing to load.

Both files sit at the repository root beside `AGENTS.md`. Both survive every sync of the upstream base untouched: the update payload is derived from what the tag tracks, and overlays are never in that path.

## Why overlays exist

A convention shared across teams has to stay generic, and a repository is never generic. Overlays are where the two meet.

The base deliberately draws the line:

- The base provides mechanisms and file contracts; workflow policy lives in overlays or in git hooks, never in the shared base. A push restriction, for example, is one team's opinion, not a convention law.
- The base carries generic workflow laws only. Product-specific rules belong to the product's own governance; mixing the two layers confuses both audiences.
- Shared material carries the why; private state carries the work. The base and the shared overlay are copied between teams; sessions, rhythms, and the local file stay yours.

Placement follows that line. A rule the whole convention should hold belongs in the base, upstream. A rule only your workspace holds belongs in the overlay. Extra recording rules, for instance, belong to an overlay rather than to a rhythm.

## The amendment grammar

An overlay is a sequence of addresses. Each block names a base section and either extends it or replaces it.

```
@append <section-name>       # added after the named base section
  <the workspace's lines>

@replace <section-name>      # the workspace's version stands in for the
                             # base section
  <the workspace's lines>
```

`@append` adds lines after the named base section. `@replace` makes the workspace's version stand in for the base section. The grammar lives in `.contexture/templates/overlay.md`.

Overlays speak the house dialect: typed blocks at column 0, bodies indented two spaces, one statement per line. Keep the lines terse and structural; an overlay is read by an agent at boot, not studied by a human.

Overlays bind runtime behavior only. The rule goes in the overlay; the reasoning behind it goes in the record. An overlay is not the place for design history, philosophy, or commentary.

Laws can be added the same way, through `@append @laws`:

```
@append @laws
  <slug>: <the rule, one statement>
```

Each law reads `slug: statement`, and references to a law are `@laws#<slug>`. Slugs are unique across the merged base plus overlays, so a new law must not reuse a slug that already exists anywhere in the merge. A law added by an overlay binds exactly like the base's own. The laws themselves are covered on the engine page.

## Precedence

The order is simple: the base, then the workspace overlay, then your local file.

At boot the agent reads `AGENTS.workspace.md` first, then `AGENTS.local.md`. Where the two conflict, the workspace's version wins and the local one is ignored, which is why the local file is described as yielding. Both sit below the laws: an overlay amends, it never overrides a guarantee the core carries. The boot order itself is open to amendment by an overlay, so overlays are read at the very start of boot.

## Amend, never contradict

This is the one rule the overlays cannot negotiate:

> Amend freely, never contradict. Extend a section or replace it; add rules where they fit. Nothing enforces this, which is why it is on you: the core carries the guarantees, and an overlay that contradicts a law silently breaks what depends on them.

Nothing checks the overlays against the base, and that is deliberate. An invariant with two homes has none: restate a law's content in an overlay and you have created two copies that will drift, each looking locally correct while the seam rots. Do not restate the base; add only what the workspace adds. A local "skip verification" is a contradiction, not an amendment, and it fails quietly: the scripts and the boot still assume the guarantee, and the break surfaces later, somewhere else.

## When to use @replace

Prefer `@append`. `@replace` is a last resort, for the rare section whose base shape genuinely does not fit the workspace.

The reason is mechanical: a replaced base section still loads. `AGENTS.md` is delivered every turn, so the agent holds the base text and the overlay's replacement side by side; two versions of one section compete, and the agent may follow either. Performance degrades. When a replacement is unavoidable, re-check the replaced section after every sync, since the base text it stands in for may have changed. MAJOR updates in particular demand a review of the overlay. Contexture's own overlays use `@append` throughout; no live `@replace` exists in this repository.

## Overlay life

Overlays are workspace-owned. A sync of the upstream base never rewrites them, and the update guidance treats them as out of scope: what you adopted is the base, and what you wrote around it stays. The exception is semantic, not mechanical: a MAJOR update changes shapes, so the overlay receives a review even though nothing overwrites it.

Tracking follows ownership. The workspace overlay is shared and tracked with the repository. The local file is personal; in standalone repositories most teams ignore it, and whether sessions and rhythms are tracked is a team choice made at onboarding. In parent meta-workspaces that whitelist shared files explicitly, `AGENTS.workspace.md` is on the list.

Adoption is where the files begin: the onboarding flow proposes the workspace overlay and initializes the local one, then leaves you to grow them. The adoption page walks that flow.

## Worked examples

Contexture's own overlays are live examples of the grammar in use. The clauses below are this workspace's policy; the shape is the point. The full files sit at the repository root.

`AGENTS.workspace.md` adds a law and extends the git section:

```
# contexture's workspace overlay; wins over AGENTS.local.md
@append @laws
  installs: <the act-scoped permission rule>

@append @git
  version: MAJOR = breaking (fields removed, shapes changed); MINOR = new sections, features; PATCH = fixes, wording
  bumps: agent applies PATCH + MINOR at ship, no ask; MAJOR = human verdict alone, agent proposes only
  ship breath: commit + push + annotated tag vX.Y.Z + the CHANGELOG.md section, one act; every commit in the tag range appears in the section
```

`AGENTS.local.md` adds two personal rules:

```
# local amendments. the user's, never the convention's.
# amend, never contradict: the laws stand; yields to the workspace overlay.

@append @laws
  dashes: never as punctuation in any artifact; the em dash and the spaced hyphen both read as the machine tell. Commas, colons, periods, or parentheses instead; hyphens only inside compound words.

@append @boot
  dry run: complete boot load, queries, and verifications without writes to state.md, journal.md, or files; report reconstructed position and stamp; cuts writes, never loads.
```

The pattern settles adoption too: an adopting workspace copies the base byte for byte and puts every adaptation in its overlay, so future syncs stay clean. The adoption page carries that story.
