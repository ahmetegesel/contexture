# tests: the setup's filter test material

Upstream only: the pairs ship with the setup under `examples/`, but an adopting workspace carries no test material. Read `tests/README.md` at the repository root first: it carries the full contract (why the pairs exist, how the harness works, how to maintain them).

- `<filter>-<case>.in` and `<filter>-<case>.expected`: the pairs for the setup's filters.
- The harness runs these through a staged sandbox, staging a `tool-filters` module holding the setup filters: `tests/filter-tests.sh`.
- Roots: real vitest and jest captures, tsc and clang captures, pytest captures, and the setup's original cargo and go captures.
