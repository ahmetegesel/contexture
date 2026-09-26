# tests: the filter test material

Upstream only: this folder is not part of the shipped payload, and adopting workspaces carry no test material. The root README navigates here; read this page before maintaining the filters or the pairs.

## Why this exists

The stream filters are byte-sensitive: one edited branch silently changes what every session sees, and nothing errors when it does. This folder is their regression net, adapted from rtk's strongest practice: static input and expected-output pairs, byte-compared by the harness. It is hermetic (POSIX sh, awk, cmp, mktemp; no toolchain, no installs, no network). The subject under test is the shipped core: the core suites run the base runtime (`base/.contexture/ctx`) and its modules, never the live drawer (the storage compliance harness is handed base's posix driver by path); the plugin suites exercise each plugin's own copy under `plugins/<name>/`, never the adopted copy in the live drawer, because the two drift. Every harness stages its sandbox under the workspace's gitignored `.contexture/tmp/` when that drawer is writable, and falls back to TMPDIR only when it is not.

## What is here

- `run.sh`: the runner: every core suite (the session suite twice, `core:session-tests.sh` on the posix driver and `core:session-tests.sh:fts5` on the fts5 driver), then every plugin suite by convention (`plugins/<name>/tests/run.sh`), one line per suite plus a final verdict; non-zero when any suite fails; a suite exiting 77 (a need absent) reports SKIP.
- `filter-tests.sh`: the filter harness. It pipes each `.in` through the runner (`ctx run --filter=<filter>`), byte-compares the output with the `.expected`, and fails when a filter carries no pair (the presence check). It also drives the mechanics cases: the ANSI strip, command identity in runner mode, the notice-only false-green output, and the recovery fallback to raw.
- `ctx-tests.sh`: the engine suite: discovery, assembly, dispatch, the run mechanics, shadow and bad-header sandboxes, the ideas module when the live drawer carries it.
- `session-tests.sh [--driver=posix|fts5]`: the session suite: verbs, refusals, paging, refs, refresh rc semantics, helper fallbacks, the dual-driver defect regressions, payload fidelity (newlines and backslash sequences reach the block verbatim, a carriage return refuses), one-line fields (an embedded newline in a one-line field refuses, a WHAT carrying double quotes appends and reads back verbatim, a legacy two-line WHAT still loads), the capability handshake at dispatch (a planted driver lacking a mandatory capability refuses rc2, a complete one is verified once per driver change), the storage failure tier (a read-only store refuses rc2 and changes nothing), interrupt cleanup (a TERMed method leaves no scratch), the parallel-write probe. It reads and writes the record only through the verbs and the driver's artifact methods, so the same assertions run on either driver; `--driver=fts5` stages the plugin's own module copy and writes `storage.driver: fts5` into its sandbox config, and skips 77 when sqlite3 lacks FTS5. A verb that bypasses the driver turns the fts5 run red.
- `storage-compliance.sh [--driver-exec=<path>]`: the SPI harness, 38 cases in 11 suites asserting the returned data of every driver method, payloads on stdin.
- `hook-tests.sh`: the hook engine suite over the committed fixture modules in `fixtures/hooks/`; every shipped hook point fires.
- `record-audit-tests.sh`: the audit's planted-defect matrix, one case per defect class the audit owns.
- `governance-tests.sh`: the main-surface forbid grep, the payload path tables re-derived against `git ls-files`, and the presence checks (verbs, hook points, filters, gate lines).
- `<filter>-<case>.in` / `<filter>-<case>.expected`: a real captured stream and the exact bytes the filter must emit.
- `compact-recovery.awk`: a synthetic probe filter for the recovery mechanics case.
- `fixtures/`: committed fixtures for the non-filter suites (hook modules, the ideas dump).

Plugin pairs live under the plugin (`plugins/toolchain-filters/tests/`) and run through a staged sandbox.

## Roots

Core pairs (this folder):

- `diff-show-trimmed`: a `git show` of a long commit message.
- `list-ansi`: a colored `ls` capture (ANSI-bearing).
- `log-repeat`: a repeated-line log capture.
- `compact-false-green`: a tsc shim emitting a JS TypeError (mechanics case).
- `compact-recovery`: synthetic input plus its probe (mechanics case).

Plugin pairs: see `plugins/toolchain-filters/tests/README.md`.

## How to maintain

- The ship gate: `tests/run.sh` must end green before any commit, tag, or push; a red run holds the ship breath. The runner reports one line per suite plus a final verdict, and a planted failure must exit non-zero.
- A filter change is not done until the harness passes: `tests/filter-tests.sh`.
- A new filter is not done until it carries at least one pair; the presence check fails otherwise.
- Update a `.expected` only with evidence: rerun the capture or reproduce the behavior. Never hand-edit an expected to match a surprise.
- Keep the pairs static and hermetic; a `.in` is a capture, never a live command.
