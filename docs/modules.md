# Modules: the module contract

`.contexture/ctx` is the engine: discovery, help assembly, dispatch, the run engine, and the hook runner. Modules declare; the engine assembles. A module teaches `ctx` a namespace of verbs, implicit hook points, or stream-compaction filters, and nothing in the engine changes when one is added.

This page is the authoring contract: what to write, where it goes, and how to prove it works. The engine's own behavior — run guards, load paging, audit classes, query kinds — lives in `docs/the-engine.md`; the sections below point there instead of restating it.

## Anatomy

A module is a directory under `.contexture/modules/`:

```text
.contexture/modules/<name>/
  module        the module file: literally named "module", one "# summary:" line
  scripts/      the verbs: extension-less files, file name = verb
  hooks/        hook files, each declaring one "# ctx-hook:" point   (optional)
  filters/      stream-compaction filters                            (optional)
  README.md     off-path maintainer notes; the engine ignores it     (optional)
```

- The directory name is the module name.
- A module file without a `# summary:` line warns and is skipped. A `scripts/` directory without a module file warns and is skipped.
- A directory with neither a module file nor `scripts/` — a filter-only or hook-only module — is legal: silent and unlisted.
- Declarations are `# key: value` comment lines in the file they govern, placed in the file's header.
- `scripts/` files and `hooks/` files are executable (`chmod +x`). The engine execs a verb file directly; a hook file without the bit still runs through `sh`, but the executable bit is the expectation.

The builtin modules `session` and `run` ship with the base; a module you add is workspace-owned. See Payload.

## Declarations

### The module file

```text
# summary: one line naming the module
```

That one line is the module's entry in `ctx help`. The module name is the directory name; the summary is the only line the engine reads from this file.

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

- Discovery root: `.contexture/modules/`. The engine resolves the workspace root from its own location, so `ctx` works from any directory.
- `ctx help` lists every module with its summary.
- `ctx <module>` prints the module's help at rc0. `ctx <module> help` prints the verb table; `ctx <module> help <verb>` prints that verb's summary, usage lines, and help lines.
- `ctx help --all` prints the top summary plus every module's block.
- A duplicate verb name inside one module shadows: the engine warns and the first file name in byte order wins.
- Reserved names cannot be module names: the session verb set — its sixteen scripts plus `help`, so seventeen names — plus `run` and `hooks`. A directory carrying one is refused at discovery with a warning and never listed; the builtin `session` and `run` directories are exempt.
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

A hook is a file under `modules/<name>/hooks/` declaring `# ctx-hook: <point>`. The engine runs the declared hooks implicitly when that point fires — there is no `ctx hooks` verb to call, and `hooks` is a reserved name.

Six points ship:

| point | fires |
|---|---|
| `stamp` | after `ctx session stamp` appends its journal receipt |
| `task-landing` | after a `ctx session append\|flip\|drop\|next` act lands; a refusal never fires |
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
| `task-landing` | `CTX_UNIT`, `CTX_ACT`, `CTX_SLUGS` (comma-space list) |
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
# summary: append one or more blocks to the session
# usage: ctx session append <slug>
# help: pipe the blocks on stdin
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$dir/record" append "$@"
```

One home for the logic and its validation; a clean verb table. The shipped session and ideas modules are both built this way (see Worked examples).

## Filters

Filters live under `.contexture/modules/<name>/filters/`. The run module's filters scan first, then every other module in name order, so a workspace module can add an ecosystem filter without editing the base.

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

### Add a verb

1. New module? `mkdir -p .contexture/modules/<name>` and write `module` with its `# summary:` line.
2. Write `scripts/<verb>`; the header carries the declarations:

   ```sh
   #!/bin/sh
   # summary: what the verb does
   # usage: ctx <name> <verb> <args>
   # help: one detail line; repeat for more
   ```

   An awk verb starts `#!/usr/bin/awk -f` instead and writes its output on stdout.

3. `chmod +x scripts/<verb>`.
4. Prove it: `ctx help` lists the module; `ctx <name> help <verb>` renders the detail; `ctx <name> <verb> ...` runs it.

### Add a hook

1. `mkdir -p .contexture/modules/<name>/hooks`.
2. Write a hook file declaring `# ctx-hook: <point>` and, when the point must stop on failure, `# ctx-hook-mode: block`. The body reads the context variables above.
3. `chmod +x hooks/<file>`.
4. Probe at a real point: a stamp hook is the cheapest — run `ctx session stamp <unit> "<attention>"` on a scratch unit and watch the side effect.

### Add a filter

1. Write `filters/<name>.awk` with `# command:` or `# match:` in its header, after the shebang. The body is a standard awk program: it reads the stream on stdin and writes the reduced stream on stdout.
2. Probe the selection with `ctx run --filter=<name> <cmd>`, then the automatic path (`ctx run <cmd>` for command identity; a pipe for the signature).
3. Watch stderr: a shadow warning means another filter claims the same line. Add `# ctx-filter-priority: over` only when the new filter must win.

### Add a whole module

1. `mkdir -p .contexture/modules/<name>/scripts`.
2. Write `module` with one `# summary:` line.
3. Add verb scripts; add `hooks/` and `filters/` when the module needs them.
4. Prove it end to end: `ctx help` lists it; bare `ctx <name>` prints its help rc0; `ctx <name> help` lists the verbs; dispatch works; an unknown verb exits rc1 with the module help on stderr.

## Checklist

| check | command | expected |
|---|---|---|
| shell syntax | `sh -n <file>` on every sh verb and hook | silent rc0 |
| awk syntax smoke | `awk -f <filter> </dev/null` | parses and runs its BEGIN block |
| executable bits | `chmod +x <script> <hook>` | the engine execs directly |
| module listed | `ctx help` | the module name with its summary |
| module help | `ctx <module>` and `ctx <module> help` | rc0; the verb table |
| verb detail | `ctx <module> help <verb>` | the usage and help lines |
| dispatch | `ctx <module> <verb> ...` | argv, streams, rc pass through |
| unknown verb | `ctx <module> <unknown>; echo $?` | `1`, module help on stderr |
| bare module | `ctx <module>; echo $?` | `0` |
| hook probe | run a real point, e.g. `ctx session stamp` on a scratch unit | the hook's side effect observed |
| filter selection | `ctx run --filter=<name> <cmd>` | the filter selected, no shadow warning |

## Worked examples

### session: wrappers over a private engine

The builtin record engine, `.contexture/modules/session/`. Its `module` carries one summary line; its extension-less scripts are `active`, `bootstrap`, `load`, `stamp`, `board`, `audit`, `index`, `query`, and `refresh`. The private `scripts/record` has no summary, so it is not a verb; the seven wrappers `append`, `amend`, `flip`, `drop`, `next`, `refs`, and `close` exec it with their act name. `refresh` is a real script rather than a wrapper because it composes sibling workers and then fires the refresh point. Off-path detail — the worker map, helpers, and call sites — is in `.contexture/modules/session/README.md`.

### ideas: a private engine with an environment override

The workspace-owned ideas module, `.contexture/modules/ideas/`. The private `scripts/ideas` is a full POSIX sh program reading `IDEAS_FILE`, which defaults to `IDEAS.md` at the workspace root; the wrappers `list`, `show`, `add`, `pick`, and `drop` exec it with the verb name. It shows the pattern where the private implementation owns validation, file selection, and write safety while the engine contract stays untouched.

### run: a filter-only module

The builtin run module, `.contexture/modules/run/`. It has no module file and no `scripts/` — `filters/` only (`diff.awk`, `list.awk`, `log.awk`) — so it is silent and unlisted in `ctx help`, yet its filters scan first. This is the shape to copy for an ecosystem filter pack.

## Payload

A module you add is workspace-owned: updates never touch it. The builtin `session` and `run` modules ride the update payload: the source repository tracks them mirrored under `base/`, and an update applies them onto the live drawer byte for byte. Either way, keep `scripts/` and `hooks/` files executable. The classes and the sync mechanics live in `docs/the-engine.md` (The drawer layout) and `docs/adoption.md` (Payload classes and syncing).

## Where the rest lives

- Engine behavior: run guards, load paging, audit classes, query kinds — `docs/the-engine.md`.
- The record grammars (state, backlog, journal, knowledge) — `docs/the-record.md`.
- Drawer layout, the three payload classes, and update mechanics — `docs/the-engine.md` (The drawer layout) and `docs/adoption.md` (Payload classes and syncing, Updating).
- Packaging a module as a plugin for reuse or contribution: `docs/plugins.md`.
- Session module internals — `.contexture/modules/session/README.md`, off-path.
