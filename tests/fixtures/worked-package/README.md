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
- `install` and `uninstall`: the package entry scripts that exec the core's
  overlay installer and uninstaller;
- `tests/run.sh`: the test, which stages the shipped base in a sandbox, installs
  this package there, exercises the verbs over the store, and proves the
  uninstall leaves the module data.

Run the test from the repository root:

```sh
sh tests/fixtures/worked-package/tests/run.sh
```

The module suite (`tests/module-tests.sh`) runs the same test in the gate. The
package never installs from this repository: it is authoring material, not a
catalog entry.
