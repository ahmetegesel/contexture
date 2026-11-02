# Plugins: packaged extensions

A plugin is a packaged, optional extension for a workspace. Modules are the mechanism (the authoring contract lives in `docs/modules.md`); a plugin is the packaged unit: the exact extension-root overlay a workspace installs, plus the material that explains and tests it. The core stays zero-dependency: a plugin declares its own needs and brings nothing the base must install.

## Anatomy

```text
plugins/<name>/
  .contexture/
    extensions/          the overlay: the extension-root tree the package installs
      modules/<name>/    a standard module folder: manifest, laws, data, part hooks, verbs, hooks, filters
      storage/drivers/<name>/  a storage driver (the driver kind)
      rhythms/           rhythm files
      templates/         grammar templates
  install                the package installer entry (overlays this tree into .contexture/extensions)
  uninstall              the package remover (runs the part hooks, removes the recorded files)
  README.md              plugin-meta: adoption, the plugin's needs, contribution
  tests/                 plugin-meta: the plugin's own suite, never installed
  AGENTS.workspace.md    root fragments and seeds: reference material, never installed
  docs/workspace/...     the corpus seed: reference material, applied with ctx docs write
```

The plugin root mirrors the extension root: `.contexture/extensions/` installs at the same relative path it has here. Every other path is package meta or reference material: the README, the tests, the `install` and `uninstall` scripts, the seed, and the root overlay fragments never install. The root fragments' laws belong in the module's `laws` file, which the compose reads; the seed is applied with `ctx docs write`.

## Naming

A plugin's name says what it offers, and adopters address it as "the <name> plugin". The directory name is the plugin's name; when a plugin teaches ctx verbs, its module carries the same name (`toolchain-filters`), so the help entry and the plugin directory read the same.

## Adopt

1. Read the plugin's `README.md` whole: it carries the adoption flow, the plugin's needs, and the verification walk.
2. Ensure the base is adopted; its `.contexture/package-install` and `.contexture/package-uninstall` do the work.
3. On the human's go at the act, run the package's install from the workspace root: `sh plugins/<name>/install`. It overlays only `.contexture/extensions/`, records every installed path and its mode under `.contexture/extensions/.state/<name>.files` (with the law fragments the compose reads), refuses the collision classes, and runs the installed module folders' `install` part hooks after the record. A re-install of the recorded files is an update.
4. Apply the reference material by hand: the seed goes in through `ctx docs write`; the root overlay fragments' laws live in the module's `laws` file.
5. Declare the plugin's needs: install nothing the README does not name; a plugin's dependencies are its own, never the core's.
6. Run the README's verification walk before any real work depends on the plugin.

The plugin's `tests/` folder never lands in a workspace: tests live with the plugin, at the plugin root. Uninstall with `sh plugins/<name>/uninstall`: it runs the module `uninstall` part hooks, removes the unchanged recorded files, preserves and reports a file changed after install, and removes the record.

A plugin installs into an existing setup the same way: the extension-root overlay installs into any adopted workspace, whenever it wants it.

## The test convention

- A plugin's tests live at `plugins/<name>/tests/`, beside the plugin they pin, and are plugin-meta like the README: never copied, never shipped into a workspace.
- A suite exercises the plugin's own copy, resolved from the suite's location (`plugins/<name>/.contexture/...`), never the workspace's adopted copy in the live drawer: the two drift, and a suite pinned to the adopted copy passes on whatever was installed last. A suite that calls a workspace harness hands it the plugin's executable by path (the storage compliance harness takes `--driver-exec=<path>`); under contract 2 a storage driver answers every function itself, so no suite hands a driver another backend to render through.
- The upstream runner may invoke a plugin's suite; a suite with declared needs (a toolchain, a pilot repository) skips cleanly when a need is absent, naming it.
- The upstream ship gate includes the plugin suites: `tests/run.sh` runs every `plugins/<name>/tests/run.sh` by convention and reports it; a red plugin suite holds the ship breath. The gate runs every suite at the same time, so a plugin suite stages its scratch in a folder of its own (mktemp under the workspace's `.contexture/tmp/`, removed on exit), never a fixed name, and reads nothing from its stdin. A plugin whose verbs reach a storage driver runs a second time on the fts5 driver as a job of its own: `plugin:docs-discipline` runs the docs suite on posix and `plugin:docs-discipline:fts5` runs it again with `--driver=fts5` (the storage-fts5 plugin's copy staged, skip 77 without sqlite3 FTS5), as the session suite runs twice among the core suites.
- A plugin change is not done until its suite passes; the suite's README carries the roots and the maintenance contract, and the harness contract lives in `tests/README.md`.

## Contribute

Upstream contribution and workspace extension are the same story. Build the mechanism as a module per `docs/modules.md`, package it as a plugin (the mirror tree, the README, the tests), and name it for what it offers. A workspace-local plugin stays workspace-owned; an upstream plugin lands under `plugins/` and rides the tag as the tracked catalog, installed into a workspace when wanted and never removed at adoption close.

## The shipped plugins

- `starter-rhythms`: the work and debug rhythms to start from.
- `toolchain-filters`: test runner and compiler filters, discovered by `ctx run`.
- `lane-isolation`: on-demand worktree isolation for subagents.
- `docs-discipline`: a corpus-first documentation discipline (the `docs` module: the read verbs `ctx docs query|audit|check|gate|nudge|changes` and the write verbs `ctx docs new|write|header|rule|pitfall|entry|section|replace|remove|ids`); every verb reaches the corpus through the configured storage driver's module store and prints the logical address `docs/<repo>/<slug>.md`, and each write is checked against the grammar before it is stored. The [module README](plugins/docs-discipline/.contexture/modules/docs/README.md) carries the corpus contract and the [plugin README](plugins/docs-discipline/README.md) carries adoption.
- `ast-doc-graph`: an AST symbol graph linked with centralized documentation.
- `storage-fts5`: a SQLite FTS5 storage driver holding the record and the module data in one database, with dual full-text indexing and ranked search beside `exact` (the record's typed tables and the store's derived document index, declared by the module's search schema); it answers the record and the module store natively, carries no verb of its own (its v0.54.0 migrate verb retired), and a record reaches it through the ordinary verbs and a corpus through the `ctx docs` write verbs. The [plugin README](plugins/storage-fts5/README.md) carries adoption and needs; the [module README](plugins/storage-fts5/.contexture/modules/storage-fts5/README.md) carries the schema, the SQL layout, and the store cases.

## Where the rest lives

- The module authoring contract (anatomy, declarations, dispatch, hooks, filters): `docs/modules.md`.
- The install flows, payload classes, and update mechanics: `docs/adoption.md`.
- The harness contract for the tests: `tests/README.md`.
- The record grammars: `docs/the-record.md`.
