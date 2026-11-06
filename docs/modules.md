# Modules: the module contract

`.contexture/ctx` is the engine: discovery, help assembly, dispatch, the run engine, and the hook runner. Modules declare; the engine assembles. A module teaches `ctx` a namespace of verbs, implicit hook points, or stream-compaction filters, and nothing in the engine changes when one is added.

This page is the authoring contract: what to write, where it goes, and how to prove it works. The engine's own behavior (run guards, load paging, audit classes, the named looks) lives in `docs/the-engine.md`; the sections below point there instead of restating it.

## Anatomy

The standard module folder is a directory under `.contexture/modules/` (the workspace modules root) or `.contexture/extensions/modules/` (the extension root, where a package installs a feature module):

```text
.contexture/modules/<name>/
  module        the manifest: # summary, # version, and a # description block
  laws          the typed-block law fragment the compose reads           (optional)
  data          the module's store declaration (see The data file)      (optional)
  install       the install part hook the package installer runs after the overlay   (optional)
  uninstall     the uninstall part hook the package installer runs before the overlay is removed (optional)
  scripts/      the verbs: extension-less files, file name = verb
  hooks/        hook files, each declaring one "# ctx-hook:" point       (optional)
  filters/      stream-compaction filters                                (optional)
  README.md     off-path maintainer notes; the engine ignores it         (optional)
```

- The directory name is the module name.
- The manifest is the engine's declaration: the summary lists the module in `ctx help`, and a malformed manifest (no summary, a `# requires:` line, a duplicate field, an unknown field, or a description block that does not run to the end of the file) warns and is skipped. A `scripts/` directory without a module file warns and is skipped.
- A directory with neither a module file nor `scripts/` — a filter-only or hook-only module — is legal: silent and unlisted.
- The `laws`, `data`, `install`, and `uninstall` files are read by the compose, the storage core, and the package installer, never by the engine; a module that uses none of them is complete with the manifest and its scripts.
- Declarations are `# key: value` comment lines in the file they govern, placed in the file's header.
- `scripts/`, `hooks/`, `install`, and `uninstall` are executable (`chmod +x`). The engine execs a verb file directly; a hook file without the bit still runs through `sh`, but the executable bit is the expectation.
- A package ships this folder as its module part; the package overlay installs it whole, and the folder is the single source for the engine, the compose, the storage, and the installer.

The builtin `unit` and `run` modules ship with the base under `.contexture/modules/`; the builtin `lane` module ships under `.contexture/extensions/modules/`, the base's first extension-root module; the storage core at `.contexture/storage/` is not a module but rides the same payload; the law layer at `.contexture/laws/` (the core law source and the composer) rides it too; a module you add is workspace-owned. See Payload.

### The interface rule

The ctx interface is the only user/agent-facing surface: a module's verbs, its manifest summary, and the help it declares. Anything not served through that interface stays module-private inside the module folder, a private script or a private asset without a `# summary:` line (the docs module's corpus grammar is the worked case: `scripts/doc.grammar`). Agents address the interface, never a file path. There is no standard shared folder for such assets: a module that needs one carries it in its own folder, so the extension root has no `templates/` part, no package declares one, and an internal asset is never shipped into a shared drawer location.

## Declarations

### The module file

```text
# summary: one line naming the module
# version: 1.0.0
# description:
# The module's preamble: what it is, why it matters, and what it holds.
# A bare # line is a paragraph break; the block runs to the end of the file.
```

The module file is the standard folder's manifest. Its fields and their readers:

| field | grammar | reader |
|---|---|---|
| `# summary:` | one line, required | the engine: discovery and the `ctx help` listing (`header_field`) |
| `# version:` | one token of letters, digits, dot, underscore, plus, or hyphen | the module's own version; a package's install version comes from the package manifest (below) |
| `# description:` | a hash block: the `# description:` line and every `# <text>` line after it, to the end of the file; a bare `#` is a blank line | the compose: the module preamble in the generated law layer |
| `# requires:` | reserved and refused | the reader refuses it; a silently ignored requires is a defect |

- The block order is summary, version, description; the description stands last because its block runs to the end of the file.
- The module name is the directory name; the summary is the only field the engine reads.
- A plain `# comment` never opens with `# <token>:` — that shape is a field, and an unknown field refuses.
- The private reader `ctx _module <file> validate|summary|version|description` is the one parser. Discovery calls `validate` on every manifest and skips a malformed one with a warning; the compose calls the field reads and the package installer validates every module part, so a `# requires:` line refuses wherever the manifest is read. A summary-only manifest stays valid: the unit module carries one, and the version and description are for the modules that ship as packages.

### The laws file

A module that contributes law clauses ships a `laws` file beside its manifest: a typed-block fragment in the overlay grammar (`@append @laws`, `@append @subagents`, `@append @git`, and so on). The compose reads every installed module's laws file and merges its clauses under the block keyword; a module with no laws file is valid. The docs module's file carries the eight docs laws and its layout, boot, and close clauses; the lane module's file carries the lane-isolation subagent and git clauses it absorbed.

### The law layer and the compose

The agent's laws are one generated layer, assembled from the core law source, the installed modules, and the standalone law parts. The four delivery files are the base loader (`AGENTS.md`), the generated layer (`.contexture/laws/AGENTS.generated.md`), the workspace overlay (`AGENTS.workspace.md`), and the local overlay (`AGENTS.local.md`).

The core law source is `.contexture/laws/core.md`. It carries the 15-block skeleton in order, `@laws` through `@update`: the general laws, the layout, the boot sequence, the interaction rules, the rhythm contract, the dispatch contract, the refresher, the close and handoff steps, the gitignore rule, and the update rule. The seven record sections (`@record`, `@journal`, `@backlog`, `@query`, `@refresh`, `@close`, `@handoff`) are skeletons there: their clauses are the unit module's laws file.

The merge is keyed by block keyword. A module's clause under an existing keyword appends to that block; a new keyword creates a custom section after the last core block (`@update`), in first-occurrence order. A module's laws fragment may only `@append`; a `@replace` there refuses. Each effective module contributes one `@module` preamble after the `@layout` block: its summary, its description, and the `ctx <module> help` pointer. The summary is the same line the engine lists; a summary-only module gets a summary and the pointer.

The effective module set is the engine's discovery: the workspace modules first, then the extension modules, each root in byte order; a colliding extension module is skipped. The compose reads a module's laws file beside its manifest and its manifest fields through `ctx _module`. The standalone law parts are the extension root's `laws/` files and the law fragments the package installer records in `.contexture/extensions/.state/<package>.files`; a standalone part carries clauses, never a preamble. The overlays are not inputs to the composition.

`.contexture/laws/compose` is the composer: a POSIX sh and awk script, not an engine verb. It writes `.contexture/laws/AGENTS.generated.md`, a gitignored file built at install and boot; the base ships the core source and the composer, never a tracked generated layer. The header is one deterministic line carrying the core version, the core cksum, and a sources hash over the core source, the package versions, the module versions and descriptions, and the law fragment bytes; no timestamp. Two compositions of the same inputs are byte-identical.

The composer verifies and recomposes. With `--check` it writes nothing and exits 1 on a stale generated layer; by default it recomposes only when the bytes differ. It refuses rather than composes a doubtful layer: an edited core (a block missing, extra, or reordered), a fragment carrying `@replace`, a module manifest carrying `# requires:`, a missing or unreadable law fragment, an unreadable overlay or install record, a duplicate law slug across the generated layer and either overlay, and a missing core source or engine. The law slugs are unique across the generated layer and both overlays; the overlays stay separate files, checked, never merged. A duplicate is the boot refusal a workspace meets after an upgrade that moves laws from an overlay into a module.

The loader is the base `AGENTS.md`: its first instruction runs the compose (compose or verify), then loads the generated layer whole and chains the workspace overlay and the local one. The generated layer is the lean what of the installed modules; the `ctx <module> help` pointers, the law workflows, and the rhythms carry the how. A workspace that tracks `.contexture/` adds one deny line for `.contexture/laws/AGENTS.generated.md`, after any whitelist.

The merger's tests are the vitest `laws` project (`tests/laws/`, `bun run test:laws` from `tests/`): the synthetic fixture, the base-only golden (the base's unit and lane modules, no docs), and the planted failures (an edited core, a duplicate slug, a `@replace` fragment, a `requires` line, a missing or unreadable fragment, an unreadable overlay or install record, a stale generated layer, a changed package version, and a nondeterministic input). It also proves the loader's first instruction, the absent and stale boot behavior, the docs laws and clauses, the lane clauses, the base-only composition, and the installer recompose; the manifest reader's own shapes are the `engine` project's.

### The data file

A module that stores data through the generic module store ships a `data` file beside its `module` file: one `field: value` line per field and a line starting with `#` a comment. `namespace` and `key` are required; `root` (default: the namespace), `suffix` (default: empty), `changes` (default: false), `search` (`flat` or `documents`), `format`, `fields`, `title`, `snippet`, `modes`, and the repeatable `document` rule are optional. A key pattern carries one `<name>` placeholder per slash-separated segment, and its final segment may be a multi-segment `<name...>` placeholder, so a module's main and deeper keys share one pattern (the unit module's `<unit>/<path...>`; the docs module's fixed `<repo>/<slug>`). An unknown field refuses. The storage core reads and validates the declaration at every store call; a module with no `data` file uses no store. The grammar, the key rule, the seven store functions, and the search schema are in [The engine](the-engine.md) (The module store); the docs module's file is the worked declaration.

### The package manifest

Every package carries a `manifest` at its root, beside `install`, `uninstall`, `README.md`, and `tests/`: the package's declaration, separate from the module folder's `module`. The grammar is `# <field>: <value>` header lines:

```text
# summary: one line naming the package
# version: 1.0.0
# kind: feature|driver
# part: <type> <path>              one line per part; at least one
# driver: <name>                   required exactly when kind is driver
# requires: ...                    reserved; refused
```

- The package version is the install version: the installer, a re-install (upgrade), and the generated law hash read it. The module file's `# version:` is the module's own version and is not the package version; a single-module package usually carries the same value in both places, but the package manifest is authoritative. A release that changes the package's payload (its `.contexture` tree, plus any package-root file a part hook applies at install) bumps the package version by the version rule, and a single-module package moves its module file's version with it; the governance `plugin-versions` check reads red until it does (`docs/plugins.md`, Kinds and parts).
- The two kinds: `feature` (no driver; any non-driver parts, including a module-less package) and `driver` (a storage-driver package: exactly one `driver` part and a `# driver:` name). A feature package may be a module package or carry only rhythms, filters, hooks, or a law fragment. A driver package ships no module file.
- A `# part:` line names a part type and the path it installs, relative to the package's `.contexture/extensions/` tree (the package source mirrors that tree). The types are `module`, `driver`, `laws`, `rhythms`, `hooks`, and `filters`. A module part is one folder under `modules/`; a driver part is `storage/drivers/<driver>`; a rhythms part is under `rhythms/`; a laws part is a law-fragment file or a folder of fragments. The installer overlays only the declared parts and refuses a payload file outside them, so the manifest is the install's coverage declaration, not a comment. A `templates` part is not a type: an internal asset rides in its module (see The interface rule).
- The module file stays the manifest for a module package: the package manifest declares the package, the module's manifest declares the module. A module-less package has the package manifest and no module file.
- The driver package (`storage-fts5` is the shipped one) declares its driver name (`fts5`), not a module: it ships no module file, so `ctx help` never lists a driver as a module; its driver part installs at `storage/drivers/<name>`, and `storage.driver: <name>` resolves it through the extension tier. The package name may differ from the driver name: package `storage-fts5` declares driver `fts5`. The driver's own `capability` answer carries its descriptor version (`3.0.0`) and capabilities; the package version is separate.
- The three version lines are distinct: the package version (this manifest: install, upgrade, the generated law hash), the driver descriptor version (the driver's `capability`, `3.0.0` at the storage core's split descriptor), and the storage contract (`3` today): the store-only card, with the record's rules in the unit module over the store.
- The private reader `ctx _package <manifest> validate|summary|version|kind|parts|driver` is the one parser; the installer refuses a package without a manifest and a malformed one. The reader refuses an unknown field, a duplicate field or part path, a bad part type or path, a feature/driver mismatch, and a `# requires:` line.

The shipped catalog's shapes: `docs-discipline` (a module with its laws and its private grammar inside it, plus rhythms), `ast-doc-graph` (a module), `storage-fts5` (a driver), `toolchain-filters` (filters only), and `starter-rhythms` (rhythms only); the `lane-isolation` folder is removed and its clauses live in the lane module's laws.

### The install and uninstall part hooks

A module may ship `install` and `uninstall` executables beside its manifest: optional part hooks that own the module's work beyond the file overlay. They are private files (no `# summary:`), not verbs, and the engine never runs them.

A package is the extension-root overlay: its source mirrors `.contexture/extensions/` (the module folders, the driver folders, the rhythms), and its root carries the `manifest`, the `install` and `uninstall` entry scripts, the README, the tests, and its reference material (the seed and the root overlay fragments are never copied, though a part hook may apply a package-root file, as the docs install hook writes the conventions seed into a fresh corpus; a module-owned asset rides inside its module folder). The package's `install` execs the core's private `.contexture/package-install`; the order, on the human's go:

1. read the package `manifest` (a missing or malformed one refuses) and refuse the collision classes before writing anything: a payload path outside `.contexture/extensions/`, a core path, an existing non-recorded file, a file another package recorded, a module name against a builtin (`unit`, `run`, `lane`), a workspace module, or a reserved name, a driver name against the core `posix` driver or a driver that already resolves ahead of the extension root, a duplicate namespace, a malformed module manifest, a payload path that escapes or carries blanks, a declared part that is absent, a payload file outside the declared parts, a module folder not declared as a module part, and a feature package carrying a driver path;
2. overlay every declared part into `.contexture/extensions/`;
3. record every installed path with its mode and checksum under `.contexture/extensions/.state/<package>.files`, plus a `law` line per installed law fragment (the compose's input) and the package, version, kind, and driver lines;
4. run every installed module folder's `install`, in module-name order, after the overlay and the record;
5. recompose the generated law layer: every package version and law fragment feeds its sources hash; a compose refusal surfaces loudly (the overlay and its record are in place, the law layer stale).

A re-install of the package's recorded files is an update: changed files update, a file the new source drops is removed when unchanged and preserved (and kept recorded) when changed, and a folder the removals empty is pruned. An install into a read-only extension root refuses rc 2 and writes nothing; a collision refuses rc 1. A write that fails mid-install (a file that cannot be staged, moved, backed up, or recorded) rolls the install back whole and exits rc 2: every moved file is restored or removed, the record is restored, and every folder the install made is removed (and only those), so a failed fresh install leaves the tree as it found it and its retry proceeds.

The uninstall runs every installed module folder's `uninstall` before it removes the recorded overlay files, then removes the record, then recomposes the law layer (a compose refusal surfaces loudly). A file changed after install is preserved and reported, never removed. A hook runs with `CTX_ROOT`, `CTX_PACKAGE_ROOT`, and `CTX_BIN` exported and cwd at the workspace root; rc 0 is success, any other exit fails the install or uninstall, and a hook that cannot run (missing context, a refusal from its verbs) fails loudly rather than skipping. The module part hook is for the module's own data, never for the overlay: the docs module's install seeds the corpus conventions through `ctx docs write` only when the doc is absent (an upgrade never overwrites the corpus), and its uninstall leaves the store data alone, since the corpus is user data (remove a doc with `ctx docs remove`).

### Verb scripts

A file in `scripts/` is a verb when its header carries a `# summary:` line; the file name is the verb name, extension-less. The declaration lines:

| header | meaning |
|---|---|
| `# summary: <line>` | marks the file as a verb and describes it in the verb table |
| `# usage: <line>` | one usage line in `ctx <module> help <verb>`; repeatable |
| `# help: <line>` | one detail line in `ctx <module> help <verb>`; repeatable |

A file without a `# summary:` is private: discovery ignores it and it never appears in help. Private files are how a module hides its implementation — see Wrappers. `help` is engine-owned: a `scripts/help` file carrying a summary is ignored with a warning.

### Hook files

```text
# ctx-hook: <point>
# ctx-hook-mode: block      (optional)
```

One point per hook file; write another file for another point. The mode is per hook file. The six points are named under Hooks.

### Filters

Filters declare themselves with their own header vocabulary; see Filters.

## Engine assembly

- Discovery roots: `.contexture/modules/` and `.contexture/extensions/modules/`. The workspace modules list first, then the extension modules, each root in byte order; an absent extension root is silent. The engine resolves the workspace root from its own location, so `ctx` works from any directory.
- An extension module whose name collides with a workspace module, a builtin (`unit`, `run`), or a reserved name is warned and skipped: the engine never shadows silently. The package installer refuses the same collision at install.
- `ctx help` lists every module with its summary.
- `ctx <module>` prints the module's help at rc0. `ctx <module> help` prints the verb table; `ctx <module> help <verb>` prints that verb's summary, usage lines, and help lines.
- `ctx help --all` prints the top summary plus every module's block.
- A duplicate verb name inside one module shadows: the engine warns and the first file name in byte order wins.
- Reserved names cannot be module names: the unit verb set (its twenty-one verbs plus `help`, so twenty-two names), plus `run` and `hooks`, plus the retired record verbs (`append`, `amend`, `query`, `flip`, `drop`, and `next`), a static list in the engine so a retired name stays unclaimed and a call to it prints its replacement. A directory carrying one is refused at discovery with a warning and never listed; the builtin `unit` and `run` directories are exempt.
- Help is engine-owned: no module ships a help script.

## Dispatch

```text
ctx <module> <verb> [args...]
```

- The engine validates the verb before exec. An unknown verb exits rc1 and prints the module help on stderr; an unknown module name exits rc1 too.
- The engine chdirs to the workspace root before exec.
- The verb process receives:

| variable | value |
|---|---|
| `CTX_ROOT` | the workspace root |
| `CTX_MODULE_DIR` | the module's directory |
| `CTX_BIN` | the engine, `.contexture/ctx` |
| `LC_ALL` | `C` |

- Arguments, stdin/stdout/stderr, and the exit code pass through unchanged.
- Modules carry no dispatch code. `scripts/<verb>` is a plain executable; running it directly behaves the same, except that hooks fire only through the engine.

## Hooks

A hook is a file under `<root>/<name>/hooks/` declaring `# ctx-hook: <point>`, where `<root>` is `.contexture/modules/` or `.contexture/extensions/modules/`. The engine runs the declared hooks implicitly when that point fires — there is no `ctx hooks` verb to call, and `hooks` is a reserved name. The workspace modules' hooks run first (name order), then the extension modules' (name order).

Six points ship:

| point | fires |
|---|---|
| `stamp` | after `ctx unit stamp` appends the new period's anchor |
| `task-landing` | after a `ctx unit task add\|start\|complete\|reopen\|drop` act lands (`task update` fires none); a refusal never fires |
| `close` | at the end of `ctx unit close` |
| `load-pre` | in the main form of `ctx unit load`, before the load map |
| `load-post` | in the main form of `ctx unit load`, after the load banner |
| `refresh` | after `ctx unit refresh` runs its board and audit |

Boot is not a point. The refs form of `ctx unit load` fires no load hooks.

Every hook runs with:

- cwd at the workspace root;
- `CTX_HOOK_POINT` naming the point;
- the point's context exported by the call site:

| point | context |
|---|---|
| `stamp` | `CTX_UNIT`, `CTX_ANCHOR` (the new anchor) |
| `task-landing` | `CTX_UNIT`, `CTX_ACT` (`add`, `start`, `complete`, `reopen`, or `drop`), `CTX_SLUGS` (the task) |
| `close` | `CTX_UNIT` |
| `load-pre` | `CTX_UNIT`, `CTX_LOAD_FORM=main`, `CTX_LOAD_PAGE` |
| `load-post` | `CTX_UNIT`, `CTX_LOAD_FORM=main`, `CTX_LOAD_PAGE` |
| `refresh` | `CTX_UNIT` |

Order: module names in `LC_ALL=C` order first, then each module's hook files in `LC_ALL=C` file-name order.

Failure policy:

- Default: a non-zero hook warns on stderr, the remaining hooks still run, and the point's exit code is unaffected.
- `# ctx-hook-mode: block` on a hook file: its first failure stops the point and fails it rc1.

Hooks reach the engine through the dispatch environment; when `CTX_BIN` is unset or not executable (a script run standalone), call sites skip hooks silently, so workers stay usable outside `ctx`.

## Wrappers over private implementations

The pattern for a set of similar verbs: one private implementation file, one thin wrapper per verb.

- The private file carries no `# summary:` line, so discovery ignores it: it is not a verb, and it never appears in help.
- Every wrapper carries its own declarations and execs the private file with its act name as the first argument; argv and rc pass through.

```sh
#!/bin/sh
# summary: list ideas by status (default: open)
# usage: ctx ideas list [open|picked|dropped|all]
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$dir/ideas" list "$@"
```

One home for the logic and its validation; a clean verb table. The ideas module is built this way (see Worked examples); the unit module shares its logic through a sourced library instead, since each of its verbs is one storage call and one render.

## Filters

Filters live under `.contexture/modules/<name>/filters/` or `.contexture/extensions/modules/<name>/filters/`. The run module's filters scan first, then every other module, the workspace modules before the extension modules (name order in each root), so a workspace or package module can add an ecosystem filter without editing the base.

A filter declares itself in its header:

| header | meaning |
|---|---|
| `# command: <regex>` | claims a wrapped command line (`ctx run <cmd>`) |
| `# match: <regex>` | claims a stream by signature (pipe form), from the stream head |
| `# default` | the bare fallback marker; fills an empty selection, never shadows a match |
| `# stream: merged` | the command's stderr joins the filtered stream |
| `# format-only: <reason>` | marker-less reductions are layout, not lost content |
| `# ctx-filter-priority: over` | a later match replaces an earlier one instead of warning |

A match on an already-claimed command line or signature warns as a shadow; the first match wins. `ctx run --filter=<name>` resolves the run module first, then the other modules in name order.

A filter-only module — no module file, no `scripts/` — is legal and unlisted; the run module is exactly that shape.

To test a filter without touching the live drawer, stage a sandbox workspace whose `.contexture/ctx` and `.contexture/modules/<name>/filters/` mirror the real layout: the engine resolves its root from its own path, so the sandbox is self-contained. The upstream precedent is the vitest `filters` project (`tests/filters/`) and the plugin's `toolchain-filters` project, which stage `base/` as shipped into a sandbox and pipe each pair through its `ctx run --filter`.

The filter guards (fail-safe passthrough, notice-only, format-only recovery) belong to the engine: see `docs/the-engine.md`.

## Walkthrough

The steps below use the workspace modules root; a package installs its feature module as the same folder under `.contexture/extensions/modules/`, the extension root. The engine discovers both.

### Add a verb

1. New module? `mkdir -p .contexture/modules/<name>` (or `.contexture/extensions/modules/<name>` for a package module) and write the manifest with its `# summary:` line (add `# version:` and a `# description:` block when the module ships as a package).
2. Write `scripts/<verb>`; the header carries the declarations:

   ```sh
   #!/bin/sh
   # summary: what the verb does
   # usage: ctx <name> <verb> <args>
   # help: one detail line; repeat for more
   ```

   An awk verb starts `#!/usr/bin/awk -f` instead and writes its output on stdout. Keep that absolute shebang: Linux hands `env` the words `awk -f` as one argument, so `#!/usr/bin/env awk -f` fails there, while every supported system carries `/usr/bin/awk`.

   Write awk to the common subset of the supported awks, BWK awk (macOS), mawk (the Debian default), gawk, and busybox awk (Alpine's build and Debian's); the test suite runs on whatever awk the host carries, and no container matrix runs, so these rules and the census below keep the code in that subset. Three rules the shipped scripts follow:

   - Double a backslash by concatenation, never by a `gsub` replacement: `gsub(/\\/, "\\\\")` yields two backslashes under BWK awk, mawk, and gawk but one under busybox awk and `gawk --posix`, which breaks every escape that follows. The shipped encoders call a `bs_double` helper that splits on the backslash and rejoins with `"\\" "\\"`.
   - Write every escape by splitting and rejoining, never by a `sub` or `gsub` replacement carrying a backslash before another character: `gsub(/"/, "\\\"")` or `gsub(/\t/, "\\t")` writes the backslash under BWK awk, mawk, gawk, and Alpine's busybox, but Debian's busybox awk drops it and writes a bare quote or `t`. The shipped encoders split on the byte and rejoin with the literal (`n = split(s, P, /\t/); o = P[1]; for (i = 2; i <= n; i++) o = o "\\" "t" P[i]`), the separator a regex (`/\t/`, or a bracketed string such as `"[\t]"` passed to a helper), never a one-character string, since BWK awk splits a value at its newlines too under a one-character string separator; the governance project's awk replacement census (`tests/governance/awkrepl.awk`, run by `awk-census.test.ts`) keeps the form out of base, the plugin module copies, and the tests.
   - Spell a tab inside a dynamic regex string as `"\t"` (the string then holds a real tab), never `"\\t"`: busybox awk reads the escaped form inside a bracket expression as a backslash and a `t`.

3. `chmod +x scripts/<verb>`.
4. Prove it: `ctx help` lists the module; `ctx <name> help <verb>` renders the detail; `ctx <name> <verb> ...` runs it.

### Add a hook

1. `mkdir -p .contexture/modules/<name>/hooks` (or the extension root's modules path).
2. Write a hook file declaring `# ctx-hook: <point>` and, when the point must stop on failure, `# ctx-hook-mode: block`. The body reads the context variables above.
3. `chmod +x hooks/<file>`.
4. Probe at a real point: a stamp hook is the cheapest: run `ctx unit stamp <unit>` on a scratch unit and watch the side effect.

### Add a filter

1. Write `filters/<name>.awk` with `# command:` or `# match:` in its header, after the shebang. The body is a standard awk program: it reads the stream on stdin and writes the reduced stream on stdout.
2. Probe the selection with `ctx run --filter=<name> <cmd>`, then the automatic path (`ctx run <cmd>` for command identity; a pipe for the signature).
3. Watch stderr: a shadow warning means another filter claims the same line. Add `# ctx-filter-priority: over` only when the new filter must win.

### Add a whole module

1. `mkdir -p .contexture/modules/<name>/scripts` (or `.contexture/extensions/modules/<name>/scripts` for a package module).
2. Write `module` with the summary, the version, and the description block last; add `laws` when the module contributes law clauses and `data` when it stores module data.
3. Add verb scripts; add `hooks/` and `filters/` when the module needs them; add `install` and `uninstall` part hooks when the module owns work beyond the overlay.
4. Packaged? Write the package root's `manifest` declaring the summary, the package version, `kind: feature` (or `kind: driver` with a `# driver:` line and a driver part at `storage/drivers/<name>`), and one `# part:` line per part.
5. Prove it end to end: `ctx help` lists it; bare `ctx <name>` prints its help rc0; `ctx <name> help` lists the verbs; dispatch works; an unknown verb exits rc1 with the module help on stderr; `ctx _module .contexture/modules/<name>/module validate` and, when packaged, `ctx _package <package>/manifest validate` are silent rc0.

## Checklist

| check | command | expected |
|---|---|---|
| shell syntax | `sh -n <file>` on every sh verb and hook | silent rc0 |
| awk syntax smoke | `awk -f <filter> </dev/null` | parses and runs its BEGIN block |
| executable bits | `chmod +x <script> <hook> <install> <uninstall>` | the engine and the installer exec directly |
| manifest grammar | `ctx _module <module> validate` | silent rc0; a `# requires:` line, a duplicate field, an unknown field, or a description not last refuses rc1 |
| manifest fields | `ctx _module <module> summary` / `version` / `description` | the values the engine and the compose read |
| package manifest grammar | `ctx _package <package>/manifest validate` | silent rc0; a missing summary, version, kind, or part, a bad kind, part, or driver, a duplicate field or part path, or a `# requires:` line refuses rc1 |
| package manifest fields | `ctx _package <package>/manifest summary` / `version` / `kind` / `parts` / `driver` | the values the installer reads |
| install hook | run it with `CTX_ROOT` and `CTX_PACKAGE_ROOT` in a scratch workspace | rc0 and its effect observed; a second run leaves it unchanged |
| module listed | `ctx help` | the module name with its summary |
| module help | `ctx <module>` and `ctx <module> help` | rc0; the verb table |
| verb detail | `ctx <module> help <verb>` | the usage and help lines |
| dispatch | `ctx <module> <verb> ...` | argv, streams, rc pass through |
| unknown verb | `ctx <module> <unknown>; echo $?` | `1`, module help on stderr |
| bare module | `ctx <module>; echo $?` | `0` |
| hook probe | run a real point, e.g. `ctx unit stamp` on a scratch unit | the hook's side effect observed |
| filter selection | `ctx run --filter=<name> <cmd>` | the filter selected, no shadow warning |

## Worked examples

### the worked example package: notes, from manifest to test

[`tests/fixtures/worked-package/`](../tests/fixtures/worked-package/README.md) is this guide's worked example: a feature package that carries one module and nothing else. It is authoring material, never a catalog entry, and its test is the proof the checklist describes. Read it beside this page:

- `manifest`: the package manifest, with the summary, the package version, `# kind: feature`, and one `# part: module modules/notes` line.
- `.contexture/extensions/modules/notes/module`: the module manifest, with the summary, the version, and the `# description:` block last.
- `.contexture/extensions/modules/notes/laws`: one `@append @laws` clause, the fragment the compose merges.
- `.contexture/extensions/modules/notes/data`: only `namespace: notes` and `key: <owner>/<slug>`; the root defaults to the namespace, the suffix is empty, and the change log is off.
- `.contexture/extensions/modules/notes/install`: the install part hook. The package installer runs it after the overlay and the record; it seeds one welcome note through the module's own verb and leaves a present note unchanged.
- `.contexture/extensions/modules/notes/scripts/`: the private `notes` implementation (no summary line, so it is not a verb) and the `put`, `show`, and `keys` wrappers. The implementation sources the storage core's library, so the module never names the configured driver.
- `install`, `uninstall`, `README.md`, `tests/`: the package entry scripts, the package prose, and the test; none of them installs.

The test (`tests/notes.test.ts`, a vitest file) stages the shipped base in a sandbox, copies the package into the sandbox's catalog, installs it there through its own `install` script, and proves the manifests, the landed laws and data files, the install hook's seed, the store roundtrip through the verbs, the malformed key refusal, the re-install's no-overwrite rule, and the uninstall leaving the store data. It belongs to the `packages` vitest project, which also proves the package installer itself; run it from `tests/`:

```sh
bun run test:packages
```

The package shows the whole path the sections above describe: a module part under the extension root, a module that calls the library and never the driver, a part hook that uses its own verbs, and a test that stages the shipped core rather than the live drawer.

### the storage core: not a module

The storage core at `.contexture/storage/` is not a module: `ctx help` does not list it, and it carries no verbs. It owns the driver resolver (`scripts/driver-resolver`), the private `scripts/store-data` reader that validates a module's data file (in the workspace modules and the extension modules alike), the module-facing `scripts/library` (the store seven, `store_require` and `store_has`, and the `data_get`/`data_emit` ref interface with its depth-8 and cycle rules), and the posix driver under `drivers/posix/`. The unit verbs and the docs module reach the core resolver directly; the lane module, under the extension root, sources the unit lib from `CTX_ROOT`. The seven store functions, the search schema, the data file grammar, and the library are in [The engine](the-engine.md) (The module store); the core's README carries the contract.

### unit: the record's data module

The record's core feature module, `.contexture/modules/unit/`. Its `data` file declares the record as one store value per artifact: namespace `unit`, root `.contexture/sessions`, suffix `.md`, the variable-depth key `<unit>/<path...>`, and the document-set search rules (the state, the backlog and its tasks, the knowledge and its findings, the journal and its entries, and each lane's recipe, journal, entries, and report). Its `scripts/data` answers the 35 record operations over the store's `get`, `list`, and `batch`, keeping the current file shapes so every legacy record reads unchanged; the record rules and the canonical render are the module's own (`lib/canon.awk`, `lib/model.awk`, `lib/ops.awk`, `lib/search.awk`), and a multi-key write lands through one `store.batch`, all or none. The exact search is the record rule over the canonical render; a ranked mode is the store's document-set search, filtered to the unit. The module's ref interface resolves the canonical `unit#<unit>/task/<slug>`, `unit#<unit>/entry/<slug>`, `unit#<unit>/finding/<NAME>`, and `unit#<unit>/lane/<lane>/<recipe|journal|report>` forms through `data_get` and `data_emit`; a new write validates a canonical unit ref before it lands, and `ctx unit resolve` accepts the same canonical forms publicly, while a legacy record target and a file pointer stay as stored. The unit module's 21 scripts are the record's public surface; `ctx session` is retired naming `ctx unit`, and the data script's cases (the record compliance through it, the module's own cases, and the record engine's) are the vitest project `unit-record` (`tests/unit-record`), run once on posix, with the store fuzzer's unit-shaped profile (`tests/drivers/store-fuzz.test.ts`) the seeded differential proof beside it. Off-path detail is in `.contexture/modules/unit/README.md`.

### unit: thin verbs over a shared library and a storage driver

The builtin record engine, `.contexture/modules/unit/`. Its `module` carries one summary line; its twenty-one extension-less verbs are sh scripts that source `lib/verb.sh`, check the input shape, make one call to the configured storage driver through the storage core's resolver (the unit data script is private and carries no summary), and render the answer through `lib/json.awk` and `lib/render.awk`; `index` alone is an awk verb, since it reads the rhythm files rather than the record. `fold` is the one composite maintenance verb: it reads the live board, records the fold start and the finish receipt as journal entries, carries the live open threads (REF'd, never closed), and checks the lanes' ordinary consolidated entries, which the lanes write with the record verb; the plan divides the live scope at the mechanical seams and coalesces the series, splitting an over-12 chunk only as the last resort, the fetch hands one chunk at a time, an optional `--merge` adds only the next chunk for a recorded same-topic merge, and the check refuses a whole-anchor batch. `refresh` is the one composite verb: it runs the board and the audit and then fires the refresh point. The posix driver in the storage core (`base/.contexture/storage/drivers/posix/`) is the only code that touches the record's files. Off-path detail (the verb to function map, the helpers, the hook call sites) is in `.contexture/modules/unit/README.md`.

### ideas: a private engine with an environment override

The workspace-owned ideas module, `.contexture/modules/ideas/`. The private `scripts/ideas` is a full POSIX sh program reading `IDEAS_FILE`, which defaults to `IDEAS.md` at the workspace root; the wrappers `list`, `show`, `add`, `pick`, and `drop` exec it with the verb name. It shows the pattern where the private implementation owns validation, file selection, and write safety while the engine contract stays untouched.

### run: a filter-only module

The builtin run module, `.contexture/modules/run/`. It has no module file and no `scripts/` — `filters/` only (`diff.awk`, `list.awk`, `log.awk`) — so it is silent and unlisted in `ctx help`, yet its filters scan first. This is the shape to copy for an ecosystem filter pack.

## Payload

A module you add is workspace-owned: updates never touch it. The builtin `unit` and `run` modules, the storage core, and the law layer ride the update payload under `.contexture/modules/`, `.contexture/storage/`, and `.contexture/laws/`; the builtin `lane` module rides it under `.contexture/extensions/modules/`, the base's first extension-root module; a package's installed files live under the same extension root and no update touches them. The source repository tracks the payload mirrored under `base/`, and an update applies it onto the live drawer byte for byte. Either way, keep `scripts/` and `hooks/` files executable. The classes and the sync mechanics live in `docs/the-engine.md` (The drawer layout) and `docs/adoption.md` (Payload classes and syncing).

## Where the rest lives

- Engine behavior: run guards, load paging, audit classes, the named looks: `docs/the-engine.md`.
- The record grammars (state, backlog, journal, knowledge): `docs/the-record.md`.
- Drawer layout, the three payload classes, and update mechanics: `docs/the-engine.md` (The drawer layout) and `docs/adoption.md` (Payload classes and syncing, Updating).
- Packaging a module as a plugin for reuse or contribution: `docs/plugins.md`.
- Unit module internals: `.contexture/modules/unit/README.md`, off-path.
