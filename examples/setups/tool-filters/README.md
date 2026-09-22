# Tool Filters Setup

An optional setup providing ecosystem-specific output filters for common test runners and compilers.

Contexture's core ships with low-risk filters for Git unified diffs (`diff.awk`), directory listings (`list.awk`), and generic logs (`log.awk`). This setup adds a menu of modular filters for developer toolchains, without adding external dependencies or maintenance burden to Contexture core.

## Investigate Before Adopting

This setup is a menu, not a bundle. A filter earns its place only when the workspace actually emits the stream it matches, so inventory first:

1. List the commands the workspace really runs: package scripts, CI jobs, Makefiles, and the rhythms or docs that name test and build commands.
2. Match each command group against the menu below, by the streams it emits and the stack it serves.
3. Adopt only the matching subset. A filter for a stream the workspace never emits is dead weight: it joins every discovery scan and claims a command identity in every runner selection.

The investigation that produced this menu is the worked example: a multi-project workspace of Astro, Nuxt, React Router, GraphQL, and Flutter projects kept the core filters plus `pytest`, adapted `vitest` and `compiler-errors` to its real stream shapes, and marked `cargo-test` and `go-test` for retirement because no Rust or Go code existed there, a workspace-local act rather than a base change. The base keeps all eight filters; the adopted subset is each workspace's own verdict.

## How Discovery Works

`ctx run` discovers every filter placed in the builtin run module (`.contexture/modules/run/filters/*.awk`) and in any module's `filters/` directory (e.g. `.contexture/modules/tool-filters/filters/*.awk`); the run module scans first, then the other modules by name.

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

Copy the filters the inventory matched into a workspace module, e.g. `.contexture/modules/tool-filters/filters/`:

```sh
# One filter:
cp examples/setups/tool-filters/filters/vitest.awk .contexture/modules/tool-filters/filters/

# A matched subset, one line per filter:
cp examples/setups/tool-filters/filters/vitest.awk .contexture/modules/tool-filters/filters/
cp examples/setups/tool-filters/filters/compiler-errors.awk .contexture/modules/tool-filters/filters/

# Ensure executable permissions:
chmod +x .contexture/modules/tool-filters/filters/*.awk
```

The filters' test material stays upstream, under `examples/setups/tool-filters/tests/`: the upstream harness pins the setup's filters, and the adopted copies are byte-identical, so they are pinned too. A workspace carries no test material.

Do not copy the whole directory by reflex. Each adopted filter joins the discovery scan and can claim a command identity, so the bulk copy is the one adoption path this setup advises against.

## Tests

Every filter carries input and expected-output pairs upstream, in a `tests/` folder (its README carries the why, the roots, and the maintenance contract):

```text
tests/                                 the core filters
examples/setups/tool-filters/tests/    the setup filters
```

A pair is named `<filter>-<case>.in` and `<filter>-<case>.expected`. Run the harness from the repository root:

```sh
tests/filter-tests.sh
```

It pipes each input through the runner (`ctx run --filter=<filter>`) and byte-compares the output with the expected file. Core cases run through the base runner; setup cases run through a staged sandbox: the runtime discovers filters in the builtin run module and in workspace modules, so the harness stages a `tool-filters` module holding the setup filters rather than installing them into the workspace. The presence check fails when a filter carries no fixture pair, so a new filter is not done until it has one. Mechanics cases pin the runner itself: the ANSI strip, command identity in runner mode, the notice-only false-green output, and the recovery fallback to raw.

## Writing Custom Filters

1. Create `.contexture/modules/tool-filters/filters/<your-tool>.awk`.
2. Add `# match: <regex>` for the stdin signature and `# command: <regex>` for runner identity.
3. Add the optional headers: `# default` (the fallback filter), `# stream: merged` (merge the command's stderr into the filtered stream, for compiler-style tools whose diagnostics land on stderr), `# format-only: <why>` (declare marker-less reductions as layout, not lost content).
4. Buffer lines and process them in the `END` block.
5. Keep the fail-safe fallback: if output is empty or larger than raw input, print the raw lines.
6. Emit a notice when truncating: a marker line carrying one of `collapsed`, `elided`, `repeated`, `capped`, or a `COMPACT_DISABLE` recovery pointer; a shrink with no notice falls back to raw.
7. Add a fixture pair under the matching tests folder (`tests/` for a core filter, `examples/setups/tool-filters/tests/` for a setup filter) and run the harness.

### Authoring Gotchas

- **Multibyte markers need literal alternation.** On macOS one-true-awk a bracket class holding multibyte characters matches one byte per member, so `[✓❯×↓]` can never complete and a required trailing space after the class can never match. Write `(✓|❯|×|↓)` instead. The vitest filter's marker branches were dead for exactly this reason before the adaptation.
- **Directive regexes travel verbatim.** The runner reads a header directive with `sed` and passes it to awk through the environment, so backslash escapes (`\(`, `\[`) reach the regex intact. Keep each directive on a single line: the header read takes the first matching line only.
