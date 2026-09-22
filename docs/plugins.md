# Plugins: packaged extensions

A plugin is a packaged, optional extension for a workspace. Modules are the mechanism (the authoring contract lives in `docs/modules.md`); a plugin is the packaged unit: the exact drawer overlay a workspace copies, plus the material that explains and tests it. The core stays zero-dependency: a plugin declares its own needs and brings nothing the base must install.

## Anatomy

```text
plugins/<name>/
  .contexture/          the overlay: the drawer subtree the plugin contributes
    modules/<name>/     a ctx module: verbs, hooks, filters
    rhythms/            rhythm files
    templates/          grammar templates
    ...                 any drawer path
  AGENTS.workspace.md   root-overlay fragments, when the plugin adds laws or layout
  README.md             plugin-meta: adoption, the plugin's needs, contribution
  tests/                plugin-meta: the plugin's own suite, never copied
```

The plugin root mirrors the target tree: everything except `README.md` and `tests/` lands in a workspace at the same relative path it has here. Adoption copies the `.contexture/` subtree as-is, merges the root fragments where the target already carries such files, and merges gitignore lines where the target denies by default.

## Naming

A plugin's name says what it offers, and adopters address it as "the <name> plugin". The directory name is the plugin's name; when a plugin teaches ctx verbs, its module carries the same name (`toolchain-filters`), so the help entry and the plugin directory read the same.

## Adopt

1. Read the plugin's `README.md` whole: it carries the adoption flow, the plugin's needs, and the verification walk.
2. Copy the mirrored tree into the workspace: the `.contexture/` subtree lands as-is; root fragments (`AGENTS.workspace.md`) merge into the workspace overlay; gitignore lines merge where the target denies by default.
3. Declare the plugin's needs: install nothing the README does not name; a plugin's dependencies are its own, never the core's.
4. Run the README's verification walk before any real work depends on the plugin.

The plugin's `tests/` folder never lands in a workspace: tests live with the plugin, at the plugin root.

A plugin installs into an existing setup the same way: the mirrored tree copies into any workspace, whenever it wants the overlay, adopted already or not.

## The test convention

- A plugin's tests live at `plugins/<name>/tests/`, beside the plugin they pin, and are plugin-meta like the README: never copied, never shipped into a workspace.
- The upstream runner may invoke a plugin's suite; a suite with declared needs (a toolchain, a pilot repository) skips cleanly when a need is absent, naming it.
- The upstream ship gate includes the plugin suites: `tests/run.sh` runs every `plugins/<name>/tests/run.sh` by convention and reports it; a red plugin suite holds the ship breath.
- A plugin change is not done until its suite passes; the suite's README carries the roots and the maintenance contract, and the harness contract lives in `tests/README.md`.

## Contribute

Upstream contribution and workspace extension are the same story. Build the mechanism as a module per `docs/modules.md`, package it as a plugin (the mirror tree, the README, the tests), and name it for what it offers. A workspace-local plugin stays workspace-owned; an upstream plugin lands under `plugins/` and rides the tag as the tracked catalog, installed into a workspace when wanted and never removed at adoption close.

## The shipped plugins

- `starter-rhythms`: the work and debug rhythms to start from.
- `toolchain-filters`: test runner and compiler filters, discovered by `ctx run`.
- `lane-isolation`: on-demand worktree isolation for subagents.
- `docs-discipline`: a corpus-first documentation discipline (the `docs` module: `ctx docs query|audit|check|gate|nudge`).
- `ast-doc-graph`: an AST symbol graph linked with centralized documentation.

## Where the rest lives

- The module authoring contract (anatomy, declarations, dispatch, hooks, filters): `docs/modules.md`.
- The install flows, payload classes, and update mechanics: `docs/adoption.md`.
- The harness contract for the tests: `tests/README.md`.
- The record grammars: `docs/the-record.md`.
