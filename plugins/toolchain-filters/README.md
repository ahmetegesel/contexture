# toolchain-filters: test runner and compiler filters

The toolchain-filters plugin packages ecosystem-specific output filters for common test runners and compilers.

Contexture's core ships with low-risk filters for Git unified diffs (`diff.awk`), directory listings (`list.awk`), and generic logs (`log.awk`). This plugin adds a menu of modular filters for developer toolchains, without adding external dependencies or maintenance burden to Contexture core.

## Investigate Before Adopting

This plugin is a menu, not a bundle. A filter earns its place only when the workspace actually emits the stream it matches, so inventory first:

1. List the commands the workspace really runs: package scripts, CI jobs, Makefiles, and the rhythms or docs that name test and build commands.
2. Match each command group against the menu below, by the streams it emits and the stack it serves.
3. Adopt only the matching subset. A filter for a stream the workspace never emits is dead weight: it joins every discovery scan and claims a command identity in every runner selection.

The investigation that produced this menu is the worked example: a multi-project workspace of Astro, Nuxt, React Router, GraphQL, and Flutter projects kept the core filters plus `pytest`, adapted `vitest` and `compiler-errors` to its real stream shapes, and marked `cargo-test` and `go-test` for retirement because no Rust or Go code existed there, a workspace-local act rather than a base change. The base keeps all eight filters; the adopted subset is each workspace's own verdict.

## How Discovery Works

`ctx run` discovers every filter placed in the builtin run module (`.contexture/modules/run/filters/*.awk`) and in any module's `filters/` directory (`.contexture/modules/<name>/filters/*.awk` or `.contexture/extensions/modules/<name>/filters/*.awk`); the run module scans first, then the other modules by name.

- Runner mode (`ctx run <cmd>`) selects by command identity: the `# command: <regex>` header is matched against the reconstructed command line (the basename of the command plus its arguments). First match wins, and two filters claiming one command raise a shadow warning.
- Stdin mode (`<cmd> | ctx run`) selects by stream signature: the `# match: <regex>` header is tested against a sample of the first 40 lines. `# default` marks the fallback, `log.awk`.
- ANSI escape sequences are stripped before selection and filtering, so colored output matches its plain shapes; the raw bytes stay untouched for the fail-safe comparison.
- Guards: empty or grown output falls back to raw; a shrinking filter with no notice line falls back to raw unless it declares `# format-only`; a notice-only output passes through so a false-green signal is never hidden; command stderr stays visible, whole on failure or empty stdout and tail-capped with its own notice otherwise.
- `COMPACT_DISABLE=1` bypasses compaction and passes the stream through raw; `COMPACT_DEBUG=1` reports the selection, the filter name and the match line, on stderr.

```sh
cargo test | .contexture/ctx run
pytest | .contexture/ctx run
npx vitest run | .contexture/ctx run
go test ./... | .contexture/ctx run
```

When no specialized filter matches, `ctx run` falls back to `log.awk` or passes raw output through unaltered.

## The Filter Menu

| Filter | Matches | Commands claimed | Served stack | Behavior |
|---|---|---|---|---|
| `cargo-test.awk` | `^running [0-9]+ test` | `cargo test` | Rust | Collapses passing tests into numeric counts; isolates failed tests and assertion traces. |
| `compiler-errors.awk` | tsc terse `file(12,5): error TS2322:` and tsc pretty `file:12:5` heads, plus gcc and clang `file:12:5: error:` and the rustc `error[E0308]:` form | `tsc`, `gcc`, `clang` | TypeScript, C, C++, Rust | Caps diagnostic cascades at 20 errors with an elision notice; a non-zero exit with no parsed diagnostic emits a false-green notice alone. |
| `go-test.awk` | `^=== RUN` | `go test` | Go | Collapses `--- PASS` lines; preserves `--- FAIL` traces and package status. |
| `pytest.awk` | `^=+ test session starts =+` or `collected [0-9]+ item` | `pytest`, `python -m pytest`, `python3 -m pytest` | Python | Collapses passed tests and quiet progress lines; isolates failures, XPASS, and XFAIL; keeps the final counters. |
| `vitest.awk` | vitest and jest markers (`✓`, `❯`, `×`, `↓`, `PASS`, `FAIL`, `Test Files`, `Tests`) | `vitest`, `jest`, `npx vitest`, `npx jest` | JavaScript, TypeScript | Collapses passing suites and specs; isolates failing suites and cases with their details verbatim. |

Each filter's header carries the exact `# match:` and `# command:` regexes; the table states what they target.

## Adoption

Install the pack into the extension root, on the human's go at the act:

```sh
.contexture/ctx package install toolchain-filters
```

The install lands every filter at
`.contexture/extensions/modules/toolchain-filters/filters/`, where `ctx run`
discovers it. The installed module is workspace-owned: remove the filters the
inventory did not match, because each one joins the discovery scan and can
claim a command identity. To adopt a single filter without the pack, copy it
into a workspace module (`.contexture/modules/toolchain-filters/filters/`)
instead:

```sh
mkdir -p .contexture/modules/toolchain-filters/filters
cp plugins/toolchain-filters/.contexture/extensions/modules/toolchain-filters/filters/vitest.awk .contexture/modules/toolchain-filters/filters/
chmod +x .contexture/modules/toolchain-filters/filters/*.awk
```

The filters' test material stays upstream, under `plugins/toolchain-filters/tests/`: the upstream harness pins the plugin's filters, and the adopted copies are byte-identical, so they are pinned too. A workspace carries no test material: the `tests/` folder lives with the plugin, is never copied, and the upstream runner may invoke it.

## Tests

Every filter carries input and expected-output pairs upstream, in a `tests/` folder (its README carries the why, the roots, and the maintenance contract):

```text
tests/filters/pairs/                     the core filters
plugins/toolchain-filters/tests/       the plugin filters
```

A pair is named `<filter>-<case>.in` and `<filter>-<case>.expected`. Run the tests from the repository's `tests/` folder:

```sh
bun run test:filters
bun run test:toolchain-filters
```

Each test pipes an input through the runner (`ctx run --filter=<filter>`) of a sandbox staged from `base/` and byte-compares the output with the expected file, failing at the first differing offset. Plugin cases stage the plugin's own module tree into the sandbox's extension root, its installed layout, rather than installing it into the workspace. The presence check fails when a filter carries no fixture pair, so a new filter is not done until it has one. Mechanics cases pin the runner itself: the ANSI strip, command identity in runner mode, the notice-only false-green output, and the recovery fallback to raw.

## Writing Custom Filters

1. Create `.contexture/extensions/modules/toolchain-filters/filters/<your-tool>.awk`.
2. Add `# match: <regex>` for the stdin signature and `# command: <regex>` for runner identity.
3. Add the optional headers: `# default` (the fallback filter), `# stream: merged` (merge the command's stderr into the filtered stream, for compiler-style tools whose diagnostics land on stderr), `# format-only: <why>` (declare marker-less reductions as layout, not lost content).
4. Buffer lines and process them in the `END` block.
5. Keep the fail-safe fallback: if output is empty or larger than raw input, print the raw lines.
6. Emit a notice when truncating: a marker line carrying one of `collapsed`, `elided`, `repeated`, `capped`, or a `COMPACT_DISABLE` recovery pointer; a shrink with no notice falls back to raw.
7. Add a fixture pair under the matching tests folder (`tests/filters/pairs/` for a core filter, `plugins/toolchain-filters/tests/` for a plugin filter) and run the tests.

### Authoring Gotchas

- **Multibyte markers need literal alternation.** On macOS one-true-awk a bracket class holding multibyte characters matches one byte per member, so `[✓❯×↓]` can never complete and a required trailing space after the class can never match. Write `(✓|❯|×|↓)` instead. The vitest filter's marker branches were dead for exactly this reason before the adaptation.
- **Directive regexes travel verbatim.** The runner reads a header directive with `sed` and passes it to awk through the environment, so backslash escapes (`\(`, `\[`) reach the regex intact. Keep each directive on a single line: the header read takes the first matching line only.

## Needs

None beyond the base: every filter is a plain awk program, and the runner (`ctx run`) and its guards ship with the convention. No installs and no external tools: the filters receive the command's stream, not its toolchain.

## Contributing

A new filter or an adapted one lands upstream with its fixture pair (the presence check fails without one) and a green run of `bun run test:filters` and `bun run test:toolchain-filters`. Keep each filter's `# match:` and `# command:` headers exact: they are the selection contract. Packaging, naming, and the test convention are in `docs/plugins.md`.
