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
  tests/                 plugin-meta: the plugin's own vitest project, never installed
  AGENTS.workspace.md    root overlay fragments: reference material, never installed
  docs/workspace/...     the corpus seed: never copied; the docs install part hook writes it into a fresh corpus
```

The plugin root mirrors the extension root: `.contexture/extensions/` installs at the same relative path it has here. Every other path is package meta or reference material: the README, the tests, the `install` and `uninstall` scripts, the seed, and the root overlay fragments are never copied. The root fragments' laws belong in the module's `laws` file, which the compose reads. The seed is the one package-root file that still reaches a workspace: the docs module's `install` part hook reads it through `$CTX_PACKAGE_ROOT` and writes it into the corpus with `ctx docs write` on a first install, when no conventions doc exists, and never overwrites a present one.

## Naming

A plugin's name says what it offers, and adopters address it as "the <name> plugin". The directory name is the plugin's name; when a plugin teaches ctx verbs, its module carries the same name (`toolchain-filters`), so the help entry and the plugin directory read the same.

## Kinds and parts

Every package carries the package manifest `manifest` at its root: `# summary:`, `# version:`, `# kind: feature|driver`, one `# part: <type> <path>` per part, and, for a driver package, `# driver: <name>`. The parts are `module`, `driver`, `laws`, `rhythms`, `hooks`, and `filters`; each path is relative to the package's `.contexture/extensions/` tree (the install path). The installer overlays only the declared parts and refuses a payload file outside them; the module file stays the manifest for a module part. A `templates` part is not a type: an internal asset rides in its module (see The interface rule).

The two kinds:

- A **feature package** carries no driver. It may bring any non-driver parts, including none of the module kind: `toolchain-filters` is filters-only, `starter-rhythms` rhythms-only, and a law-fragment-only package is the same shape. A feature package with a module is a module package; a feature package with no module file is module-less.
- A **storage-driver package** declares and installs its driver: exactly one `driver` part at `storage/drivers/<name>` and a `# driver: <name>` line. The driver package ships no module file, so the engine never lists the driver as a module; its package name may differ from the driver name: `storage-fts5` declares `fts5`. `storage.driver: fts5` resolves the installed driver through the extension tier.

The three version lines are distinct: the package version (the manifest; install, upgrade, the generated law hash), the driver descriptor version (the driver's `capability`, `3.0.0` at the storage core's split descriptor), and the storage contract (`3` today): the store-only card, with the record's rules in the unit module over the store. A `# requires:` line is reserved and refused, as in the module file.

The package version moves with the payload: a release that changes a plugin's payload, its installed `.contexture` tree plus any package-root file a part hook applies at install (today the docs conventions seed), bumps that plugin's manifest version by the `@git` version rule (PATCH for fixes and wording, MINOR for a feature, a MAJOR only on the human's call), and a single-module package moves its module file's `# version:` with it (docs-discipline's `docs` module; a module file that carries no version line, as ast-doc-graph's, is exempt). The README, the tests, the `install` and `uninstall` scripts, and the manifest itself are package meta: a change there alone bumps nothing. The bump rides the first payload change of a release cycle, since the governance `plugin-versions` check (see The test convention) reads red at once; nothing in the installer compares versions, so the version is how an adopter sees that a newer payload waits in the catalog (`docs/adoption.md`, Updating).

### The interface rule

The ctx interface is the only user/agent-facing surface: a package's verbs, its module summaries, and the help they declare. Anything a package does not serve through that interface stays module-private inside the module folder, a private script or a private asset without a `# summary:` line (the docs module's corpus grammar is the worked case: `scripts/doc.grammar`). Agents address the interface, never a file path. No standard shared folder exists for such assets: a module that needs one carries it in its own folder, so the extension root has no `templates/` part, no package declares one, and an internal asset is never shipped into a shared drawer location. The overlay ships only the extension-root tree; package meta and reference material (README, tests, manifest, install and uninstall scripts, the seed, the root overlay fragments) are never copied, and the seed reaches a corpus only through the docs install part hook.

## Adopt

1. Read the plugin's `README.md` whole: it carries the adoption flow, the plugin's needs, and the verification walk.
2. Ensure the base is adopted; its `.contexture/package-install` and `.contexture/package-uninstall` do the work.
3. On the human's go at the act, run the package's install from the workspace root: `sh plugins/<name>/install`. It reads the package `manifest` (summary, version, kind, parts, and the driver name for a driver package), overlays only the declared parts under `.contexture/extensions/`, records every installed path and its mode under `.contexture/extensions/.state/<name>.files` (with the law fragments the compose reads), refuses the collision classes and a payload path outside the declared parts, and runs the installed module folders' `install` part hooks after the record. The installer then recomposes the generated law layer (`.contexture/laws/compose`), since every package version and law fragment feeds its sources hash; a compose refusal surfaces loudly, never as a stale layer. A re-install of the recorded files is an update.
4. Nothing applies by hand: the part hooks apply what a package seeds (the docs module's `install` hook writes the conventions seed into a corpus that holds no conventions doc yet), and the root overlay fragments' laws live in the module's `laws` file.
5. Declare the plugin's needs: install nothing the README does not name; a plugin's dependencies are its own, never the core's.
6. Run the README's verification walk before any real work depends on the plugin.

The plugin's `tests/` folder never lands in a workspace: tests live with the plugin, at the plugin root. Uninstall with `sh plugins/<name>/uninstall`: it runs the module `uninstall` part hooks, removes the unchanged recorded files, preserves and reports a file changed after install, removes the record, and recomposes the generated law layer.

A plugin installs into an existing setup the same way: the extension-root overlay installs into any adopted workspace, whenever it wants it.

## The test convention

- A plugin's tests live at `plugins/<name>/tests/` as the plugin's own vitest project, rooted at the plugin and importing the shared harness helpers as `@support` (`tests/vitest.config.mts` declares a project by convention for every `plugins/<name>/tests/` that holds a test file, so a new plugin's tests run with no config edit; `bun run test:<name>` from `tests/` runs it, a script the governance `projects` check requires). They are plugin-meta like the README: never copied, never shipped into a workspace.
- A test exercises the plugin's own copy, resolved from the repository (`plugins/<name>/.contexture/...`) and staged into a sandbox beside the shipped base, never the workspace's adopted copy in the live drawer: the two drift, and a test pinned to the adopted copy passes on whatever was installed last. The harness stages the storage-fts5 driver copy into every fts5 sandbox, so the shared store contract tests of the `drivers` project hold that copy.
- A test with a declared need (sqlite3 with FTS5, a TypeScript compiler API) skips when the need is absent, naming it, except in the pre-release set (`bun run test:prerelease`), where a missing sqlite3 with FTS5 fails the run, since a skipped fts5 case proves nothing.
- The upstream ship gate includes the plugin tests: `bun run test:prerelease` from `tests/` (the release gate) and `bun run test` (every default project during the work) run every project, the plugin projects among them; a red plugin test holds the ship breath. The tests run concurrently, so each stages its scratch in a fresh sandbox under the run root (`.contexture/tmp/vitest-*`, removed when the run ends), never a fixed name, and reads nothing from its stdin. The docs-discipline project tests its logic once, on posix, and keeps the store mode cases where the driver adds value on fts5 (`store/`); the unit and lane verbs run once, on posix, in the vitest `unit-verbs` project, since a storage driver holds no record logic.
- The vitest `packages` project (`tests/packages`, `bun run test:packages` from `tests/`) holds the package manifest cases: the two kinds and the six package shapes, the parts coverage, the package and driver versions, the refused `requires`, the driver not listed as a module, and the extension-root reads (the rhythm list, the law-fragment record, the store-data owner scan, and the docs store under the extension root), and it runs the worked example's own test (`tests/fixtures/worked-package/tests/notes.test.ts`).
- The governance `plugin-versions` check (`tests/governance/plugin-versions.test.ts`) holds the version rule over the index, the payload the ship breath stages first: against the nearest release tag, a plugin whose version is unchanged reads red, naming the plugin, the tag that first shipped that version, and the changed paths, when its payload (`plugins/<name>/.contexture/**` plus every literal `$CTX_PACKAGE_ROOT/<path>` its payload scripts read, since the installer exports the package root to the module part hooks and every script a hook runs inherits it) differs from that tag; a changed version must be a greater x.y.z. It runs in every governance run, and a plugin manifest or payload change selects the governance project under `bun run test:changed`. A shallow clone or a repository with no reachable release tag skips it naming the need, except in the pre-release set, where that need fails the run. The same file holds the single-module lockstep over the working tree: every catalog package whose manifest declares exactly one `module` part, and whose module file carries a `# version:` line, holds that version equal to its manifest's, both read as the installer reads them (blanks trimmed); a module file without a version line is exempt, and a planted mismatch reads red.
- No catalog package passes silently without tests: the governance `projects` check requires every `plugins/<name>/` to have its own project or a named no-suite reason; `starter-rhythms` is the one today (a rhythms payload with no code, its install and its rhythms in `ctx rhythm list` proven by the `packages` project).
- The worked example package (`tests/fixtures/worked-package/`, linked from `docs/modules.md`) is the authoring reference for a feature package: its test stages the shipped base, installs it in a sandbox, and proves the module, the laws, the data declaration, the install part hook, the store verbs, and the uninstall. It is upstream test material, never a catalog entry.
- A plugin change is not done until its tests pass; the plugin's README carries the roots and the maintenance contract, and the harness contract lives in `tests/README.md`.

## Contribute

Upstream contribution and workspace extension are the same story. Build the mechanism as a module per `docs/modules.md`, package it as a plugin (the mirror tree, the README, the tests), and name it for what it offers. A workspace-local plugin stays workspace-owned; an upstream plugin lands under `plugins/` and rides the tag as the tracked catalog, installed into a workspace when wanted and never removed at adoption close.

## The shipped plugins

- `starter-rhythms`: a feature package, rhythms only (`part: rhythms rhythms`); the work and debug rhythms to start from.
- `toolchain-filters`: a feature package, filters only (`part: filters modules/toolchain-filters/filters`); test runner and compiler filters, discovered by `ctx run`.
- `lane-isolation`: retired into the lane module's laws (the lane module is a base extension-root module, beside the rhythm module); the folder is removed from the catalog and it carried no package manifest.
- `docs-discipline`: a feature package with a module part (its laws and its private corpus grammar inside the module) and rhythms (the `docs` module: the read verbs `ctx docs query|audit|check|gate|nudge|changes` and the write verbs `ctx docs new|write|header|rule|pitfall|entry|section|replace|remove|ids`); every verb reaches the corpus through the configured storage driver's module store and prints the logical address `docs/<repo>/<slug>.md`, and each write is checked against the grammar before it is stored. The [module README](plugins/docs-discipline/.contexture/extensions/modules/docs/README.md) carries the corpus contract and the [plugin README](plugins/docs-discipline/README.md) carries adoption.
- `ast-doc-graph`: a feature package with a module part (`part: module modules/ast-doc-graph`); an AST symbol graph linked with centralized documentation.
- `storage-fts5`: a storage-driver package (`kind: driver`, `driver: fts5`, `part: driver storage/drivers/fts5`): a SQLite FTS5 storage driver holding the record and the module data in one database, with dual full-text indexing and ranked search beside `exact` (the record's typed tables and the store's derived document index, declared by the module's search schema); it answers the record and the module store natively, ships no module file (so the engine never lists it as a module), carries no verb of its own (its v0.54.0 migrate verb retired), and a record reaches it through the ordinary verbs and a corpus through the `ctx docs` write verbs. The [plugin README](plugins/storage-fts5/README.md) carries adoption and needs; the [driver README](plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5/README.md) carries the schema, the SQL layout, and the store cases.

## Where the rest lives

- The module authoring contract (anatomy, declarations, dispatch, hooks, filters): `docs/modules.md`.
- The install flows, payload classes, and update mechanics: `docs/adoption.md`.
- The harness contract for the tests: `tests/README.md`.
- The record grammars: `docs/the-record.md`.
