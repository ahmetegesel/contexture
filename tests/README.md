# tests: the filter test material

Upstream only: this folder is not part of the shipped payload, and adopting workspaces carry no test material. The root README navigates here; read this page before maintaining the filters or the pairs.

## Why this exists

The stream filters are byte-sensitive: one edited branch silently changes what every session sees, and nothing errors when it does. This folder is their regression net, adapted from rtk's strongest practice: static input and expected-output pairs, byte-compared by the harness. It is hermetic (POSIX sh, awk, cmp, mktemp; no toolchain, no installs, no network). The subject under test is the shipped core: the core suites run the base runtime (`base/.contexture/ctx`) and its modules, never the live drawer (the storage compliance harness is handed base's posix driver by path); the plugin suites exercise each plugin's own copy under `plugins/<name>/`, never the adopted copy in the live drawer, because the two drift. Every harness stages its sandbox under the workspace's gitignored `.contexture/tmp/` when that drawer is writable, and falls back to TMPDIR only when it is not; each run makes a sandbox of its own (mktemp, never a fixed name) and keeps its locks, stores, and scratch inside it, because the runner starts the suites concurrently and two gates may run at once.

## What is here

- `run.sh`: the runner: every core suite (the session suite twice, `core:session-tests.sh` on the posix driver and `core:session-tests.sh:fts5` on the fts5 driver), then every plugin suite by convention (`plugins/<name>/tests/run.sh`), one line per suite plus a final verdict; non-zero when any suite fails; a suite exiting 77 (a need absent) reports SKIP. The suites run concurrently: each is a background job with its own output file in one gate scratch folder, its exit code written by the job itself (never read through a pipeline); when all have ended the runner prints every suite's output and outcome line in the fixed order above, then the suite times and the verdict. A suite still running after `GATE_SUITE_TIMEOUT` seconds (default 1200) is stopped with its whole process tree and fails; `GATE_JOBS=<n>` caps how many run at once (`GATE_JOBS=1` runs the suites one after another, same order, same output; the session suite still runs its groups at once inside its own run).
- `filter-tests.sh`: the filter harness. It pipes each `.in` through the runner (`ctx run --filter=<filter>`), byte-compares the output with the `.expected`, and fails when a filter carries no pair (the presence check). It also drives the mechanics cases: the ANSI strip, command identity in runner mode, the notice-only false-green output, and the recovery fallback to raw.
- `ctx-tests.sh`: the engine suite: discovery, assembly, dispatch, the run mechanics, shadow and bad-header sandboxes, the ideas module when the live drawer carries it.
- `session-tests.sh [--driver=posix|fts5] [--group=1|2|3|all]`: the session suite, its sections in three groups that share no unit, run at once by default (each group in its own sandbox, the outputs printed in group order under one summary line), one group with `--group=<n>`, or every section in one sandbox in order with `--group=all`: verbs, refusals, paging, refs, refresh rc semantics, helper fallbacks, the dual-driver defect regressions, payload fidelity (newlines and backslash sequences reach the block verbatim, a carriage return refuses), backslash payloads on every awk (a backslash, a doubled backslash, a literal backslash n, and a trailing backslash read back byte for byte from every typed write), one-line fields (an embedded newline in a one-line field refuses, a WHAT carrying double quotes appends and reads back verbatim, a legacy two-line WHAT still loads), one quote rule (a quoted state objective, next pointer, appended and amended task OBJECTIVE land and read back verbatim, the newline refusals kept), path-free messages (every verb warning and error names the artifact and its unit, never a sessions path; entry.record echoes its ref), the capability handshake at dispatch (a planted driver lacking a mandatory capability refuses rc2, a complete one is verified once per driver change), the storage failure tier (a read-only store refuses rc2 and changes nothing, and the store comes back whole once its files are writable again), interrupt cleanup (a TERMed method leaves no scratch), the parallel-write probe. It reads and writes the record only through the verbs and the driver's artifact methods, so the same assertions run on either driver; `--driver=fts5` stages the plugin's own module copy and writes `storage.driver: fts5` into its sandbox config, and skips 77 when sqlite3 lacks FTS5. A verb that bypasses the driver turns the fts5 run red.
- `storage-compliance.sh [--driver-exec=<path>]`: the SPI harness, 39 cases in 11 suites asserting the returned data of every driver method, payloads on stdin; TC39 fixes the exact search answer (entity set, order, total) that every driver must return.
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

- The ship gate: `tests/run.sh` must end green before any commit, tag, or push; a red run holds the ship breath. The runner reports one line per suite plus a final verdict, a planted failure must exit non-zero, and a planted hang must end as a failure at the suite timeout with no process left behind.
- A new suite (core or plugin) stages in a sandbox of its own (mktemp under the scratch drawer, removed on exit) and never writes a fixed name or a path outside it: the runner starts every suite at once, so a shared path turns into a race.
- A filter change is not done until the harness passes: `tests/filter-tests.sh`.
- A new filter is not done until it carries at least one pair; the presence check fails otherwise.
- Update a `.expected` only with evidence: rerun the capture or reproduce the behavior. Never hand-edit an expected to match a surprise.
- Keep the pairs static and hermetic; a `.in` is a capture, never a live command.
- Portability: the suite carries no awk of its own choosing; it runs under whatever awk the system has. Before a change to an awk encoder, decoder, or regex string ships, run `tests/run.sh` under each supported awk (BWK awk on macOS, and in disposable Linux containers Debian with its default mawk, Debian with gawk, Alpine with busybox awk, with sqlite3 and git inside the container for the fts5 run and the governance probe); an assertion that only one awk turns red is the reason the matrix exists.
