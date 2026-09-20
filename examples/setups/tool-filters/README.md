# Tool Filters Setup

An optional setup providing ecosystem-specific output filters for common test runners and compilers.

Contexture's core ships with rock-solid, low-risk filters for Git unified diffs (`diff.awk`) and generic logs (`log.awk`). This setup provides modular filters for developer toolchains without adding external dependencies or maintenance burden to Contexture core.

## How Discovery Works

Contexture's stream runner (`.contexture/scripts/compact.sh`) automatically discovers all filters placed in `.contexture/filters/*.awk`.

Each filter self-declares its match signature in its header:

```awk
# match: ^running [0-9]+ test
```

When you pipe command output into `compact.sh`, it samples the first lines, matches the stream against all available filters in `.contexture/filters/`, and executes the matching filter. No flags or configuration options are needed.

```sh
cargo test | .contexture/scripts/compact.sh
pytest | .contexture/scripts/compact.sh
npx vitest run | .contexture/scripts/compact.sh
go test ./... | .contexture/scripts/compact.sh
```

If the stream does not match any specialized filter, `compact.sh` falls back to `log.awk` (generic log deduplication) or passes raw output through unaltered.

## Included Filters

| Filter | Target Tool | Match Signature | Behavior |
|---|---|---|---|
| `cargo-test.awk` | Rust (`cargo test`) | `^running [0-9]+ test` | Collapses passing tests into numeric counts; isolates failed tests and assertion traces. |
| `pytest.awk` | Python (`pytest`) | `^(=+ test session starts =+\|collected [0-9]+ item)` | Collapses passed tests; isolates failure traces, exceptions, and summary. |
| `vitest.awk` | JavaScript (`vitest`, `jest`) | `^[ \t]*([✓✔✕✗]\|PASS\|FAIL)` | Collapses passing specs; isolates failed test blocks and assertion diffs. |
| `go-test.awk` | Go (`go test`) | `^=== RUN` | Collapses `--- PASS` lines; preserves `--- FAIL` traces and package status. |
| `compiler-errors.awk` | Compilers (`rustc`, `gcc`, `clang`, `tsc`) | `(:[0-9]+:[0-9]+: (fatal )?error:\|^error(\[[A-Za-z0-9_-]+\])?:)` | Caps diagnostic error cascades at 20 errors, preserving root causes. |

## Adoption

To adopt one or more filters in your workspace, copy the desired filter files into `.contexture/filters/`:

```sh
# Copy a specific filter:
cp examples/setups/tool-filters/filters/cargo-test.awk .contexture/filters/

# Or copy the entire collection:
cp examples/setups/tool-filters/filters/*.awk .contexture/filters/

# Ensure executable permissions:
chmod +x .contexture/filters/*.awk
```

Once copied, `.contexture/scripts/compact.sh` immediately and automatically discovers them on subsequent command invocations.

## Writing Custom Filters

You can add custom filters for internal build systems or proprietary tools:

1. Create `.contexture/filters/<your-tool>.awk`.
2. Add `# match: <regex>` near the top so `compact.sh` can recognize the stream.
3. Buffer lines and process them in the `END` block.
4. Include a fail-safe fallback: if output is empty or larger than raw input, print raw lines.
