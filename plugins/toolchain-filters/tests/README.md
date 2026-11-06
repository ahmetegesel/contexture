# tests: the plugin's filter test material

Upstream only: the pairs ship with the plugin under `plugins/toolchain-filters/`, but an adopting workspace carries no test material; the `tests/` folder lives with the plugin, is never copied, and the upstream runner may invoke it. Read `tests/README.md` at the repository root first: it carries the full contract (why the pairs exist, how the harness works, how to maintain them).

- `<filter>-<case>.in` and `<filter>-<case>.expected`: the pairs for the plugin's filters.
- `mechanics/compact-false-green.in` and `.expected`: a tsc capture for the notice-only false-green mechanics case.
- The vitest project `toolchain-filters` runs them (`bun run test:toolchain-filters` from the repository's `tests/`): `pairs.test.ts` pipes each pair through a staged sandbox whose extension root holds the plugin's module tree (`staged.ts`), and `mechanics.test.ts` carries the ANSI strip and the notice-only false green.
- Roots: real vitest and jest captures, tsc and clang captures, pytest captures, and the plugin's original cargo and go captures.
