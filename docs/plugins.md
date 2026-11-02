# Plugins: packaged extensions

A plugin is a packaged, optional extension for a workspace. Modules are the mechanism (the authoring contract lives in `docs/modules.md`); a plugin is the packaged unit: the exact extension-root overlay a workspace installs, plus the material that explains and tests it. The core stays zero-dependency: a plugin declares its own needs and brings nothing the base must install.

## Anatomy

```text
plugins/<name>/
  manifest               the package declaration: summary, version, kind, parts; a driver package adds its driver name
  .contexture/
    extensions/          the overlay: the extension-root tree the package installs
      modules/<name>/    a standard module folder: manifest, laws, data, part hooks, verbs, hooks, filters, and its private assets
      storage/drivers/<name>/  a storage driver (the driver kind)
      rhythms/           rhythm files
  install                the package installer entry (overlays the declared parts into .contexture/extensions)
  uninstall              the package remover (runs the part hooks, removes the recorded files)
  README.md              plugin-meta: adoption, the plugin's needs, contribution
  tests/                 plugin-meta: the plugin's own suite, never installed
  AGENTS.workspace.md    root fragments and seeds: reference material, never installed
  docs/workspace/...     the corpus seed: reference material, applied with ctx docs write
```

The plugin root mirrors the extension root: `.contexture/extensions/` installs at the same relative path it has here. Every other path is package meta or reference material: the README, the tests, the `install` and `uninstall` scripts, the seed, and the root overlay fragments never install. The root fragments' laws belong in the module's `laws` file, which the compose reads; the seed is applied with `ctx docs write`.

## Naming

A plugin's name says what it offers, and adopters address it as "the <name> plugin". The directory name is the plugin's name; when a plugin teaches ctx verbs, its module carries the same name (`toolchain-filters`), so the help entry and the plugin directory read the same.

## Kinds and parts

Every package carries the package manifest `manifest` at its root: `# summary:`, `# version:`, `# kind: feature|driver`, one `# part: <type> <path>` per part, and, for a driver package, `# driver: <name>`. The parts are `module`, `driver`, `laws`, `rhythms`, `hooks`, and `filters`; each path is relative to the package's `.contexture/extensions/` tree (the install path). The installer overlays only the declared parts and refuses a payload file outside them; the module file stays the manifest for a module part. A `templates` part is not a type: an internal asset rides in its module (see The interface rule).

The two kinds:

- A **feature package** carries no driver. It may bring any non-driver parts, including none of the module kind: `toolchain-filters` is filters-only, `starter-rhythms` rhythms-only, and a law-fragment-only package is the same shape. A feature package with a module is a module package; a feature package with no module file is module-less.
- A **storage-driver package** declares and installs its driver: exactly one `driver` part at `storage/drivers/<name>` and a `# driver: <name>` line. The driver package ships no module file, so the engine never lists the driver as a module; its package name may differ from the driver name: `storage-fts5` declares `fts5`. `storage.driver: fts5` resolves the installed driver through the extension tier.

The three version lines are distinct: the package version (the manifest; install, upgrade, the generated law hash), the driver descriptor version (the driver's `capability`, `3.0.0` at the storage core's split descriptor), and the storage contract (`2` today; the unit module's contract 3 store-only card later). The record-only driver stays valid under contract 2; the contract 3 card is what invalidates it, at the unit module. A `# requires:` line is reserved and refused, as in the module file.

### The interface rule

The ctx interface is the only user/agent-facing surface: a package's verbs, its module summaries, and the help they declare. Anything a package does not serve through that interface stays module-private inside the module folder, a private script or a private asset without a `# summary:` line (the docs module's corpus grammar is the worked case: `scripts/doc.grammar`). Agents address the interface, never a file path. No standard shared folder exists for such assets: a module that needs one carries it in its own folder, so the extension root has no `templates/` part, no package declares one, and an internal asset is never shipped into a shared drawer location. The overlay ships only the extension-root tree; package meta and reference material (README, tests, manifest, install and uninstall scripts, the seed, the root overlay fragments) never install.

## Adopt

1. Read the plugin's `README.md` whole: it carries the adoption flow, the plugin's needs, and the verification walk.
2. Ensure the base is adopted; its `.contexture/package-install` and `.contexture/package-uninstall` do the work.
3. On the human's go at the act, run the package's install from the workspace root: `sh plugins/<name>/install`. It reads the package `manifest` (summary, version, kind, parts, and the driver name for a driver package), overlays only the declared parts under `.contexture/extensions/`, records every installed path and its mode under `.contexture/extensions/.state/<name>.files` (with the law fragments the compose reads), refuses the collision classes and a payload path outside the declared parts, and runs the installed module folders' `install` part hooks after the record. A re-install of the recorded files is an update.
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
- The module suite holds the package manifest cases: the two kinds and the six package shapes, the parts coverage, the package and driver versions, the refused `requires`, the driver not listed as a module, and the extension-root reads (the rhythm index, the law-fragment record, the store-data owner scan, and the docs store under the extension root) (`tests/module-tests.sh`), and it runs the worked example's own test.
- The gate names the catalog's no-suite packages rather than passing them silently: `plugin:toolchain-filters` reports INFO (its fixture pairs ride the filters suite) and `plugin:starter-rhythms` reports SKIP (no tests directory).
- The worked example package (`tests/fixtures/worked-package/`, linked from `docs/modules.md`) is the authoring reference for a feature package: its test stages the shipped base, installs it in a sandbox, and proves the module, the laws, the data declaration, the install part hook, the store verbs, and the uninstall. It is upstream test material, never a catalog entry.
- A plugin change is not done until its suite passes; the suite's README carries the roots and the maintenance contract, and the harness contract lives in `tests/README.md`.

## Contribute

Upstream contribution and workspace extension are the same story. Build the mechanism as a module per `docs/modules.md`, package it as a plugin (the mirror tree, the README, the tests), and name it for what it offers. A workspace-local plugin stays workspace-owned; an upstream plugin lands under `plugins/` and rides the tag as the tracked catalog, installed into a workspace when wanted and never removed at adoption close.

## The shipped plugins

- `starter-rhythms`: a feature package, rhythms only (`part: rhythms rhythms`); the work and debug rhythms to start from.
- `toolchain-filters`: a feature package, filters only (`part: filters modules/toolchain-filters/filters`); test runner and compiler filters, discovered by `ctx run`.
- `lane-isolation`: retired into the lane module's laws (the lane module is the base's extension-root module); the folder is removed from the catalog and it carried no package manifest.
- `docs-discipline`: a feature package with a module part (its laws and its private corpus grammar inside the module) and rhythms (the `docs` module: the read verbs `ctx docs query|audit|check|gate|nudge|changes` and the write verbs `ctx docs new|write|header|rule|pitfall|entry|section|replace|remove|ids`); every verb reaches the corpus through the configured storage driver's module store and prints the logical address `docs/<repo>/<slug>.md`, and each write is checked against the grammar before it is stored. The [module README](plugins/docs-discipline/.contexture/extensions/modules/docs/README.md) carries the corpus contract and the [plugin README](plugins/docs-discipline/README.md) carries adoption.
- `ast-doc-graph`: a feature package with a module part (`part: module modules/ast-doc-graph`); an AST symbol graph linked with centralized documentation.
- `storage-fts5`: a storage-driver package (`kind: driver`, `driver: fts5`, `part: driver storage/drivers/fts5`): a SQLite FTS5 storage driver holding the record and the module data in one database, with dual full-text indexing and ranked search beside `exact` (the record's typed tables and the store's derived document index, declared by the module's search schema); it answers the record and the module store natively, ships no module file (so the engine never lists it as a module), carries no verb of its own (its v0.54.0 migrate verb retired), and a record reaches it through the ordinary verbs and a corpus through the `ctx docs` write verbs. The [plugin README](plugins/storage-fts5/README.md) carries adoption and needs; the [driver README](plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5/README.md) carries the schema, the SQL layout, and the store cases.

## Where the rest lives

- The module authoring contract (anatomy, declarations, dispatch, hooks, filters): `docs/modules.md`.
- The install flows, payload classes, and update mechanics: `docs/adoption.md`.
- The harness contract for the tests: `tests/README.md`.
- The record grammars: `docs/the-record.md`.
