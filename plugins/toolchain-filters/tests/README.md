# tests: the plugin's filter test material

Upstream only: the pairs ship with the plugin under `plugins/toolchain-filters/`, but an adopting workspace carries no test material; the `tests/` folder lives with the plugin, is never copied, and the upstream runner may invoke it. Read `tests/README.md` at the repository root first: it carries the full contract (why the pairs exist, how the harness works, how to maintain them).

- `<filter>-<case>.in` and `<filter>-<case>.expected`: the pairs for the plugin's filters.
- The harness runs these through a staged sandbox, staging a `toolchain-filters` module holding the plugin's filters: `tests/filter-tests.sh`.
- Roots: real vitest and jest captures, tsc and clang captures, pytest captures, and the plugin's original cargo and go captures.
