# tests: the filter test material

Upstream only: this folder is not part of the shipped payload, and adopting workspaces carry no test material. The root README navigates here; read this page before maintaining the filters or the pairs.

## Why this exists

The stream filters are byte-sensitive: one edited branch silently changes what every session sees, and nothing errors when it does. This folder is their regression net, adapted from rtk's strongest practice: static input and expected-output pairs, byte-compared by the harness. It is hermetic (POSIX sh, awk, cmp, mktemp; no toolchain, no installs, no network). The harness stages its sandbox under the workspace's gitignored `.contexture/tmp/` when that drawer is writable, and falls back to TMPDIR only when it is not.

## What is here

- `<filter>-<case>.in`: a real captured stream, named by filter and case.
- `<filter>-<case>.expected`: the exact bytes the filter must emit.
- `compact-recovery.awk`: a synthetic probe filter for the recovery mechanics case.
- `filter-tests.sh`: the harness. It pipes each `.in` through the runner (`ctx run --filter=<filter>`), byte-compares the output with the `.expected`, and fails when a filter carries no pair (the presence check). It also drives the mechanics cases: the ANSI strip, command identity in runner mode, the notice-only false-green output, and the recovery fallback to raw. Setup pairs live under the setup (`examples/setups/tool-filters/tests/`) and run through a staged sandbox.

## Roots

Core pairs (this folder):

- `diff-show-trimmed`: a `git show` of a long commit message.
- `list-ansi`: a colored `ls` capture (ANSI-bearing).
- `log-repeat`: a repeated-line log capture.
- `compact-false-green`: a tsc shim emitting a JS TypeError (mechanics case).
- `compact-recovery`: synthetic input plus its probe (mechanics case).

Setup pairs: see `examples/setups/tool-filters/tests/README.md`.

## How to maintain

- A filter change is not done until the harness passes: `tests/filter-tests.sh`.
- A new filter is not done until it carries at least one pair; the presence check fails otherwise.
- Update a `.expected` only with evidence: rerun the capture or reproduce the behavior. Never hand-edit an expected to match a surprise.
- Keep the pairs static and hermetic; a `.in` is a capture, never a live command.
