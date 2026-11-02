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

The builtin `session` and `run` modules ship with the base under `.contexture/modules/`; the builtin `lane` module ships under `.contexture/extensions/modules/`, the base's first extension-root module; the storage core at `.contexture/storage/` is not a module but rides the same payload; a module you add is workspace-owned. See Payload.

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
| `# version:` | one token of letters, digits, dot, underscore, plus, or hyphen | the installer: install and upgrade |
| `# description:` | a hash block: the `# description:` line and every `# <text>` line after it, to the end of the file; a bare `#` is a blank line | the compose: the module preamble in the generated `AGENTS.md` |
| `# requires:` | reserved and refused | the reader refuses it; a silently ignored requires is a defect |

- The block order is summary, version, description; the description stands last because its block runs to the end of the file.
- The module name is the directory name; the summary is the only field the engine reads.
- A plain `# comment` never opens with `# <token>:` — that shape is a field, and an unknown field refuses.
- The private reader `ctx _module <file> validate|summary|version|description` is the one parser. Discovery calls `validate` on every manifest and skips a malformed one with a warning; the compose and the installer call the field reads, so a `# requires:` line refuses wherever the manifest is read. A summary-only manifest stays valid: the session module and the driver modules carry one, and the version and description are for the modules that ship as packages.

### The laws file

A module that contributes law clauses ships a `laws` file beside its manifest: a typed-block fragment in the overlay grammar (`@append @laws`, `@append @subagents`, `@append @git`, and so on). The compose reads every installed module's laws file and merges its clauses under the block keyword; a module with no laws file is valid. The docs module's file carries the eight docs laws; the lane module's file carries the lane-isolation subagent and git clauses.

### The data file

A module that stores data through the generic module store ships a `data` file beside its `module` file: one `field: value` line per field and a line starting with `#` a comment. `namespace` and `key` are required; `root` (default: the namespace), `suffix` (default: empty), `changes` (default: false), `search` (`flat` or `documents`), `format`, `fields`, `title`, `snippet`, `modes`, and the repeatable `document` rule are optional. A key pattern carries one `<name>` placeholder per slash-separated segment, and its final segment may be a multi-segment `<name...>` placeholder, so a module's main and deeper keys share one pattern (the unit module's `<unit>/<path...>`; the docs module's fixed `<repo>/<slug>`). An unknown field refuses. The storage core reads and validates the declaration at every store call; a module with no `data` file uses no store. The grammar, the key rule, the seven store functions, and the search schema are in [The engine](the-engine.md) (The module store); the docs module's file is the worked declaration.

### The install and uninstall part hooks

A module may ship `install` and `uninstall` executables beside its manifest: optional part hooks that own the module's work beyond the file overlay. They are private files (no `# summary:`), not verbs, and the engine never runs them.

The package installer owns the order, on the human's go:

1. overlay every package part into the install root;
2. record the installed paths and modes under `.contexture/extensions/.state/<package>.files`;
3. run every installed module folder's `install`, in module-name order, after the overlay and the record.

The uninstall runs every module folder's `uninstall` before it removes the recorded overlay files. A hook runs with `CTX_ROOT`, `CTX_PACKAGE_ROOT`, and `CTX_BIN` exported and cwd at the workspace root; rc 0 is success, any other exit fails the install or uninstall, and a hook that cannot run (missing context, a refusal from its verbs) fails loudly rather than skipping. The module part hook is for the module's own data, never for the overlay: the docs module's install seeds the corpus conventions through `ctx docs write` only when the doc is absent (an upgrade never overwrites the corpus), and its uninstall leaves the store data alone, since the corpus is user data (remove a doc with `ctx docs remove`).

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
- An extension module whose name collides with a workspace module, a builtin (`session`, `run`), or a reserved name is warned and skipped: the engine never shadows silently. The package installer refuses the same collision at install.
- `ctx help` lists every module with its summary.
- `ctx <module>` prints the module's help at rc0. `ctx <module> help` prints the verb table; `ctx <module> help <verb>` prints that verb's summary, usage lines, and help lines.
- `ctx help --all` prints the top summary plus every module's block.
- A duplicate verb name inside one module shadows: the engine warns and the first file name in byte order wins.
- Reserved names cannot be module names: the session verb set (its twenty-two verbs plus `help`, so twenty-three names), plus `run` and `hooks`, plus the five session verbs retired in v0.55.0 (`append`, `amend`, `query`, `flip`, `drop`), a static list in the engine so a retired name stays unclaimed and a call to it prints its replacement. A directory carrying one is refused at discovery with a warning and never listed; the builtin `session` and `run` directories are exempt.
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
| `stamp` | after `ctx session stamp` appends the new period's anchor |
| `task-landing` | after a `ctx session task add\|start\|complete\|reopen\|drop` or `ctx session next` act lands (`task update` fires none); a refusal never fires |
| `close` | at the end of `ctx session close` |
| `load-pre` | in the main form of `ctx session load`, before the load map |
| `load-post` | in the main form of `ctx session load`, after the load banner |
| `refresh` | after `ctx session refresh` runs its board and audit |

Boot is not a point. The refs form of `ctx session load` fires no load hooks.

Every hook runs with:

- cwd at the workspace root;
- `CTX_HOOK_POINT` naming the point;
- the point's context exported by the call site:

| point | context |
|---|---|
| `stamp` | `CTX_UNIT`, `CTX_ANCHOR` (the new anchor) |
| `task-landing` | `CTX_UNIT`, `CTX_ACT` (`add`, `start`, `complete`, `reopen`, `drop`, or `next`), `CTX_SLUGS` (the task; for `next`, the `IN_PROGRESS` tasks as a comma-space list) |
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

One home for the logic and its validation; a clean verb table. The ideas module is built this way (see Worked examples); the session module shares its logic through a sourced library instead, since each of its verbs is one storage call and one render.

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

To test a filter without touching the live drawer, stage a sandbox workspace whose `.contexture/ctx` and `.contexture/modules/<name>/filters/` mirror the real layout: the engine resolves its root from its own path, so the sandbox is self-contained. `tests/filter-tests.sh` is the upstream precedent.

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

   Write awk to the common subset of the supported awks, BWK awk (macOS), mawk (the Debian default), gawk, and busybox awk (Alpine's build and Debian's); the suite runs green under each. Three rules the shipped scripts follow:

   - Double a backslash by concatenation, never by a `gsub` replacement: `gsub(/\\/, "\\\\")` yields two backslashes under BWK awk, mawk, and gawk but one under busybox awk and `gawk --posix`, which breaks every escape that follows. The shipped encoders call a `bs_double` helper that splits on the backslash and rejoins with `"\\" "\\"`.
   - Write every escape by splitting and rejoining, never by a `sub` or `gsub` replacement carrying a backslash before another character: `gsub(/"/, "\\\"")` or `gsub(/\t/, "\\t")` writes the backslash under BWK awk, mawk, gawk, and Alpine's busybox, but Debian's busybox awk drops it and writes a bare quote or `t`. The shipped encoders split on the byte and rejoin with the literal (`n = split(s, P, /\t/); o = P[1]; for (i = 2; i <= n; i++) o = o "\\" "t" P[i]`), the separator a regex (`/\t/`, or a bracketed string such as `"[\t]"` passed to a helper), never a one-character string, since BWK awk splits a value at its newlines too under a one-character string separator; the governance suite's G5 census (`tests/lib/awkrepl.awk`) keeps the form out of base, the plugin module copies, and the suites.
   - Spell a tab inside a dynamic regex string as `"\t"` (the string then holds a real tab), never `"\\t"`: busybox awk reads the escaped form inside a bracket expression as a backslash and a `t`.

3. `chmod +x scripts/<verb>`.
4. Prove it: `ctx help` lists the module; `ctx <name> help <verb>` renders the detail; `ctx <name> <verb> ...` runs it.

### Add a hook

1. `mkdir -p .contexture/modules/<name>/hooks` (or the extension root's modules path).
2. Write a hook file declaring `# ctx-hook: <point>` and, when the point must stop on failure, `# ctx-hook-mode: block`. The body reads the context variables above.
3. `chmod +x hooks/<file>`.
4. Probe at a real point: a stamp hook is the cheapest: run `ctx session stamp <unit>` on a scratch unit and watch the side effect.

### Add a filter

1. Write `filters/<name>.awk` with `# command:` or `# match:` in its header, after the shebang. The body is a standard awk program: it reads the stream on stdin and writes the reduced stream on stdout.
2. Probe the selection with `ctx run --filter=<name> <cmd>`, then the automatic path (`ctx run <cmd>` for command identity; a pipe for the signature).
3. Watch stderr: a shadow warning means another filter claims the same line. Add `# ctx-filter-priority: over` only when the new filter must win.

### Add a whole module

1. `mkdir -p .contexture/modules/<name>/scripts` (or `.contexture/extensions/modules/<name>/scripts` for a package module).
2. Write `module` with the summary, the version, and the description block last; add `laws` when the module contributes law clauses and `data` when it stores module data.
3. Add verb scripts; add `hooks/` and `filters/` when the module needs them; add `install` and `uninstall` part hooks when the module owns work beyond the overlay.
4. Prove it end to end: `ctx help` lists it; bare `ctx <name>` prints its help rc0; `ctx <name> help` lists the verbs; dispatch works; an unknown verb exits rc1 with the module help on stderr; `ctx _module .contexture/modules/<name>/module validate` is silent rc0.

## Checklist

| check | command | expected |
|---|---|---|
| shell syntax | `sh -n <file>` on every sh verb and hook | silent rc0 |
| awk syntax smoke | `awk -f <filter> </dev/null` | parses and runs its BEGIN block |
| executable bits | `chmod +x <script> <hook> <install> <uninstall>` | the engine and the installer exec directly |
| manifest grammar | `ctx _module <module> validate` | silent rc0; a `# requires:` line, a duplicate field, an unknown field, or a description not last refuses rc1 |
| manifest fields | `ctx _module <module> summary` / `version` / `description` | the values the engine, the installer, and the compose read |
| install hook | run it with `CTX_ROOT` and `CTX_PACKAGE_ROOT` in a scratch workspace | rc0 and its effect observed; a second run leaves it unchanged |
| module listed | `ctx help` | the module name with its summary |
| module help | `ctx <module>` and `ctx <module> help` | rc0; the verb table |
| verb detail | `ctx <module> help <verb>` | the usage and help lines |
| dispatch | `ctx <module> <verb> ...` | argv, streams, rc pass through |
| unknown verb | `ctx <module> <unknown>; echo $?` | `1`, module help on stderr |
| bare module | `ctx <module>; echo $?` | `0` |
| hook probe | run a real point, e.g. `ctx session stamp` on a scratch unit | the hook's side effect observed |
| filter selection | `ctx run --filter=<name> <cmd>` | the filter selected, no shadow warning |

## Worked examples

### the storage core: not a module

The storage core at `.contexture/storage/` is not a module: `ctx help` does not list it, and it carries no verbs. It owns the driver resolver (`scripts/driver-resolver`), the private `scripts/store-data` reader that validates a module's data file (in the workspace modules and the extension modules alike), the module-facing `scripts/library` (the store seven, `store_require` and `store_has`, and the `data_get`/`data_emit` ref interface with its depth-8 and cycle rules), and the posix driver under `drivers/posix/`. The session module's `scripts/driver-resolver` is a compatibility wrapper that execs the core's resolver, so the session verbs, the docs module, and the plugin suites keep their old path while every caller resolves the configured driver through the core; the lane module, under the extension root, sources the session lib from `CTX_ROOT`. The seven store functions, the search schema, the data file grammar, and the library are in [The engine](the-engine.md) (The module store); the core's README carries the contract.

### session: thin verbs over a shared library and a storage driver

The builtin record engine, `.contexture/modules/session/`. Its `module` carries one summary line; its twenty-two extension-less verbs are sh scripts that source `lib/verb.sh`, check the input shape, make one call to the configured storage driver through the storage core's resolver (the session `scripts/driver-resolver` wraps it; a private script either way: neither carries a summary), and render the answer through `lib/json.awk` and `lib/render.awk`; `index` alone is an awk verb, since it reads the rhythm files rather than the record. `fold` is the one composite maintenance verb: it reads the live board, records the fold start and the finish receipt as journal entries, carries the live open threads (REF'd, never closed), and checks the lanes' ordinary consolidated entries, which the lanes write with the record verb; the plan divides the live scope at the mechanical seams and coalesces the series, splitting an over-12 chunk only as the last resort, the fetch hands one chunk at a time, an optional `--merge` adds only the next chunk for a recorded same-topic merge, and the check refuses a whole-anchor batch. `refresh` is the one composite verb: it runs the board and the audit and then fires the refresh point. The posix driver in the storage core (`base/.contexture/storage/drivers/posix/`) is the only code that touches the record's files. Off-path detail (the verb to function map, the helpers, the hook call sites) is in `.contexture/modules/session/README.md`.

### ideas: a private engine with an environment override

The workspace-owned ideas module, `.contexture/modules/ideas/`. The private `scripts/ideas` is a full POSIX sh program reading `IDEAS_FILE`, which defaults to `IDEAS.md` at the workspace root; the wrappers `list`, `show`, `add`, `pick`, and `drop` exec it with the verb name. It shows the pattern where the private implementation owns validation, file selection, and write safety while the engine contract stays untouched.

### run: a filter-only module

The builtin run module, `.contexture/modules/run/`. It has no module file and no `scripts/` — `filters/` only (`diff.awk`, `list.awk`, `log.awk`) — so it is silent and unlisted in `ctx help`, yet its filters scan first. This is the shape to copy for an ecosystem filter pack.

## Payload

A module you add is workspace-owned: updates never touch it. The builtin `session` and `run` modules and the storage core ride the update payload under `.contexture/modules/` and `.contexture/storage/`; the builtin `lane` module rides it under `.contexture/extensions/modules/`, the base's first extension-root module; a package's installed files live under the same extension root and no update touches them. The source repository tracks the payload mirrored under `base/`, and an update applies it onto the live drawer byte for byte. Either way, keep `scripts/` and `hooks/` files executable. The classes and the sync mechanics live in `docs/the-engine.md` (The drawer layout) and `docs/adoption.md` (Payload classes and syncing).

## Where the rest lives

- Engine behavior: run guards, load paging, audit classes, the named looks: `docs/the-engine.md`.
- The record grammars (state, backlog, journal, knowledge) — `docs/the-record.md`.
- Drawer layout, the three payload classes, and update mechanics — `docs/the-engine.md` (The drawer layout) and `docs/adoption.md` (Payload classes and syncing, Updating).
- Packaging a module as a plugin for reuse or contribution: `docs/plugins.md`.
- Session module internals — `.contexture/modules/session/README.md`, off-path.
