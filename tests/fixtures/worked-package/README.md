# worked-package: the module authoring guide's example

This package is the worked example of `docs/modules.md`. It is a feature package
with one module, the notes module, and it shows the whole authoring path end to
end:

- `manifest`: the package manifest (summary, package version, feature kind, one
  module part);
- `.contexture/extensions/modules/notes/module`: the module manifest (summary,
  version, description block);
- `.contexture/extensions/modules/notes/laws`: the law fragment the compose
  merges into `@laws`;
- `.contexture/extensions/modules/notes/data`: the store declaration (namespace
  and key pattern; the root, suffix, and change-log defaults are the core's);
- `.contexture/extensions/modules/notes/install`: the install part hook, which
  seeds one welcome note through the module's own verb and never overwrites a
  present one;
- `.contexture/extensions/modules/notes/scripts/`: the private implementation
  `notes` and the three wrappers `put`, `show`, and `keys`;
- `tests/notes.test.ts`: the test, a vitest file, which stages the shipped base
  in a sandbox, copies this package into the sandbox's catalog, installs it
  there through `ctx package install` with its package root path, exercises
  the verbs over the store, and proves the uninstall leaves the module data.

The package carries no install or uninstall script of its own: `ctx package
install` and `ctx package uninstall` take its root.

The test belongs to the `packages` vitest project, which also proves the
package installer; run it from the repository's `tests/` folder:

```sh
bun run test:packages
```

The package never installs from this repository: it is authoring material, not
a catalog entry.
