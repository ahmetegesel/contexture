# docs-discipline: a corpus-first documentation setup

This folder holds an optional workspace setup: a typed-block documentation
corpus that agents read before code, five POSIX instruments that index,
project, check, nudge, and gate it, and a close gate that fails when a code
change lands without its doc update. Everything runs on plain files and POSIX
awk/sh: no runtime, no network, no vendor glue. Adopt it when agents working
in your repositories should consult a corpus instead of rediscovering the
codebase by grep.

## What it is

The mechanism in one paragraph: every repository gets unit docs in
`docs/<repo>/` written per the grammar in `.contexture/templates/doc.md`, and
the workspace gets its own docs in `docs/workspace/` (the conventions and the
map); `docs-query` serves the index, the projections, the lookups, and the
rule and pitfall views; `docs-check` compares a git change delta against the
corpus (coverage, freshness, dead sources); `docs-gate` runs the audit and the
check as one close check; `docs-nudge` extracts the active task's intent and
injects the matched docs, the top pitfalls, and (on setup verbs) the owning
repo's run, build, and test targets.

| piece | what it is | lands as |
|---|---|---|
| `.contexture/scripts/docs-audit.awk` | grammar and integrity audit: header, blocks, indentation, rule fields, symbol-only evidence, duplicate ids | copy |
| `.contexture/scripts/docs-query.awk` + `.contexture/scripts/docs-query` | the retrieval engine and its CLI: index, projection, section slice, file owner, search, rules, pitfalls, edges | copy |
| `.contexture/scripts/docs-check.awk` | the change check: coverage, freshness, and dead sources over a status-prefixed delta | copy |
| `.contexture/scripts/docs-gate` | the close gate: audit then check over the aggregated delta (or the incoming remote delta with `--drift`), plus a self-planted eight-scenario matrix | copy |
| `.contexture/scripts/docs-nudge.awk` | the task nudge: matched docs, top pitfalls, forced setup targets | copy |
| `.contexture/templates/doc.md` | the corpus grammar: eight kinds, the block shapes, the block scalar rules | copy |
| `docs/workspace/conventions.md` | the ruleset: docs discipline, git, security, typography | seed |
| `AGENTS.workspace.md` | the overlay blocks: five docs laws, layout, boot, close | merge |
| `.contexture/rhythms/work.md`, `.contexture/rhythms/docs-authoring.md`, `.contexture/rhythms/docs-drift.md` | the workspace's work rhythm (the canonical variant with the docs discipline) and the two procedure rhythms | copy (optional) |
| `gitignore.fragment` | the allowlist lines for a workspace that denies by default | merge |
| `sample/` | the fictional two-repo demo corpus plus a demo backlog | reference |
| `README.md` | this onboarding document | reference |

## Common shapes (reference rows)

The instruments are the same everywhere; the layout and the docs mapping
differ. These rows are the common shapes, not prescriptions: the mechanics
below are the pack's reference defaults, and the adoption reads the actual
repo structure and calibrates the copied instruments on the spot where the
repo differs (recording the local deltas so a future re-copy re-applies
them).

| shape | code lives | docs live | sources mapping | notes |
|---|---|---|---|---|
| parent multi-repo workspace | product repos under `projects/` | `docs/workspace/` plus `docs/<repo>/` per repo | non-workspace docs are repo-relative (`src/...`); the reference check prefixes them with `projects/<repo>/` | the `projects/` gitignore lines apply; the gate aggregates the workspace root and every `projects/*/.git` |
| single-repo workspace | one repository at the workspace root | `docs/workspace/` (the repo's unit docs included) | `repo: workspace` with root-relative sources (`src/...`); a corpus with named namespaces (for example `repo: app` at the root) calibrates the check's mapping on the spot | the reference check maps `repo: workspace` docs against the workspace root, non-workspace docs through the prefix; no `projects/` aggregation |
| monorepo | one repository, many packages | `docs/workspace/` | `repo: workspace` with package-scoped globs (`packages/<name>/**`) | map each package as a unit; same mechanics as single-repo |
| standalone repository | the repository is its own root | `docs/workspace/` | `repo: workspace`, root-relative sources | the drawer ships inside the repository; same mapping as single-repo |

The gate's scanners follow the shape: product repositories under `projects/`
are scanned through the `projects/<repo>/` prefix; when `projects/` is absent
the workspace root's child repositories are scanned directly (flat); and when
the workspace root itself is a repository (single-repo, monorepo, standalone)
it is scanned as one, its paths root-relative so `repo: workspace` docs claim
them. The default run warns about drift in these repositories on stderr;
`--drift` evaluates their incoming remote delta.

## Assess

The agent reads the workspace and answers, without writing anything:

- Which topology row matches: several repositories, one repository, or one
  repository with many packages?
- Is there a workspace root distinct from the product repositories, or is the
  repository itself the root?
- Does the tree deny by default (`*` near the top of `.gitignore`), and does
  a contexture overlay (`AGENTS.workspace.md`) already exist?
- Which repositories exist, and which one needs docs first?
- Which code extensions does the tree use? The coverage filter counts a
  broad default set of code, markup, style, shell, SQL, and IDL extensions
  (the list lives in `CODE_EXT_RE` in `docs-check.awk`), skipping test
  files and generated markers (`*.min.*`, `*.generated.*`); a stack outside
  the set extends the list before the coverage claim holds. The test and
  generated exclusions are reference defaults: compare them with the repo's
  test conventions and calibrate on the spot.
- How does the repo's structure differ from the reference mechanics? The
  mapping (the `projects/<repo>/` prefix), the exclusions, and the matrix
  fixtures are reference defaults; where the repo differs (a single repo
  with named namespaces, its own test layout), the adoption adapts the
  copied instruments on the spot and records the local deltas so a future
  re-copy re-applies them.
- Should the close gate and the nudge be wired into a harness trigger, or
  run manually at close? The setup ships no trigger; the wiring is the
  adopter's choice.

## Propose

Render the findings to the human and ask for the go. Cover:

- the topology and the docs mapping this implies;
- the copy list (the instruments and the grammar), the merge list (the
  overlay blocks and the gitignore lines), and the seed list (the
  conventions plus the first unit docs);
- who owns the close gate: the gate runs when a unit closes, manually or via
  the adopter's own trigger;
- whether the work rhythm should become the standing default (an
  optional overlay line) or stay an invoked rhythm;
- what the verify run will prove before any real work depends on the setup.

## Execute

Labels: `copy` means the file lands as shipped; `merge` means its lines go
into an existing file; `seed` means it is starting content to adapt; and
`reference` means it stays behind.

1. Copy the instruments and the grammar into the workspace (the same commands
   the Try it walk runs against a scratch copy):

   ```sh
   mkdir -p <workspace>/.contexture
   cp -R .contexture/scripts <workspace>/.contexture/
   cp -R .contexture/templates <workspace>/.contexture/
   ```

   The instruments expect the drawer placement: the workspace root resolves
   two levels up from `.contexture/scripts/` (override with
   `DOCS_WORKSPACE_ROOT`).

2. Copy the rhythms where the docs-bound flow is wanted:

   ```sh
   mkdir -p <workspace>/.contexture/rhythms
   cp .contexture/rhythms/work.md .contexture/rhythms/docs-authoring.md .contexture/rhythms/docs-drift.md <workspace>/.contexture/rhythms/
   ```

   Optional: make the work rhythm the standing default by adding one overlay
   block: `@append @rhythms` with `default: work`.

3. Merge `AGENTS.workspace.md` into the workspace overlay (or copy the file
   whole where none exists), and merge the `gitignore.fragment` lines into
   `.gitignore` where the tree denies by default. Skip any line the workspace
   already allows.

4. Seed the corpus: copy `docs/workspace/conventions.md`, write a
   `docs/workspace/` map for the tree (per the grammar template), then one
   unit doc per repository, then the operational doc for the repository whose
   setup targets the nudge should force.

5. Keep `sample/` and this README as references: the sample is fictional and
   never part of the adopted corpus.

## Verify

From the workspace root (seed at least one doc first: the `docs/*/*.md` glob must expand):

```sh
.contexture/scripts/docs-audit.awk docs/*/*.md        # silence, exit 0
.contexture/scripts/docs-query --index                 # ends: index complete: N entries
printf 'M\tprojects/<repo>/src/example.ts\n' | .contexture/scripts/docs-check.awk docs/*/*.md   # substitute repo and path; red (UNCOVERED) until a doc claims it
.contexture/scripts/docs-gate                          # in a git workspace: audit plus the aggregated delta check
.contexture/scripts/docs-gate --drift                  # in a git workspace: audit plus the incoming remote delta check
.contexture/scripts/docs-gate --test-matrix            # ALL 8 SCENARIOS PASSED
```

Expected: the audit prints nothing; the index ends with its entry count; the
check prints `docs-check: CLEAN` for a delta whose doc update rides it, and
fails (exit 1) on a stale or uncovered delta (the check line above needs its
repo and path substituted; before the corpus covers the path it reds as
UNCOVERED, the honest pre-seed state); the gate passes only when both
the audit and the check pass; the matrix runs eight self-planted scenarios
through the check and passes when every scenario's expectation holds. The Try
it walk below runs every one of these.

## Daily use

- Boot: the overlay's `@boot` line loads the index whole before any specific
  lookup; a missing `index complete` marker means the read was truncated.
- Lookup: query line, then owning doc, then section; read code only for what
  the doc lacked. `docs-query` answers owner lookups and the rules and
  pitfalls dimensions.
- Authoring: the `docs-authoring` rhythm: the 11-step progression (sync,
  map, backlog, draft, interrogate, audit, coverage, reconcile, project,
  trace and accumulate, refresh); the method detail lives in the template's
  comments.
- Drift: the `docs-drift` rhythm: sync the checkout to the current base first
  (fetch; a branch comes up to date with main), declare the affected units as
  `@task` entries in `backlog.md`, pipe the status-prefixed git delta through
  the check, update each affected doc in the same change, re-verify.
- Close: `docs-gate` must pass cleanly. The gate verifies change, never
  truth. A default run also warns on stderr when a scanned repository is on a
  non-main branch or behind its last-fetched origin; `docs-gate --drift`
  evaluates the incoming remote delta (the merge-base form) instead of the
  local one.
- Setup tasks: run `docs-nudge.awk` on the active backlog when a task names
  setup verbs; it prints the owning operational doc's run, build, and test
  targets plus the top pitfalls.

## Limits and status

- Harness-free by design: nothing fires automatically. The close gate and the
  nudge are invoked at their moments (boot, close, a setup task), or wired
  into the adopter's own trigger surface. This pack ships no trigger.
- The direct-run commands use `/usr/bin/awk` (the same launcher form the base
  scripts use); a system whose awk lives elsewhere invokes the engines via
  `awk -f <path>` instead.
- The sample corpus is fictional and reference-only; the adopter's corpus is
  the real subject.
- The gate's matrix is self-planted: it builds its fixtures with `mktemp`,
  writes nothing outside them, and needs no repository.
- The single-repo mapping is documented, not scripted: the check maps
  non-workspace docs through `projects/<repo>/`. A corpus whose code sits at
  the root marks its docs `repo: workspace`, or the adoption calibrates the
  mapping on the spot and records the local delta.
- The audit validates a subset: the doc header, the block vocabulary, the
  indentation rule, the rule fields, symbol-only evidence, and duplicate
  ids. Rule status and prevalence and most inner fields are not validated;
  the corpus today is complete, so the blindness is latent, not violated.
- The gate verifies change, never truth: passing it means the touched code
  has fresh docs, not that the corpus is correct.
- The default run's drift warnings read the last-fetched remote refs, not the
  live remote: fetch first for current ones. They print to stderr only, and
  stdout and the exit code stay as the check left them. `docs-gate --drift`
  aggregates the incoming remote delta (the merge-base form) instead of the
  local delta, so commits made locally ahead of the remote never read as
  incoming deletions. In a team flow only the un-reflected incoming changes
  surface: a code change whose covering doc rode the same commits reads fresh,
  and only the changes whose docs did not ride are marked for reconciliation.
  A riding doc is the workflow's mark on the commit, since a workspace running
  the discipline does not hand-maintain its docs; so the flagged set also maps
  where the discipline is not yet in play.
  The test operates at co-change level; whether a doc that rode reflects the
  substance is the reconcile step's judgment, never the gate's.
- The check's satisfiers are generous by design: a touched unit reads fresh
  when any claimant unit doc, the repository's architecture doc, or a
  workspace doc rides the delta; coverage counts only the listed extensions;
  deleting a unit doc does not red the check. The gate stays scoped to the
  change delta, never the corpus's truth.
- The authoring and drift rhythms declare their work as `@task` entries in
  `backlog.md` (the base convention's task grammar) before drafting or
  reconciling; `sample/backlog.md` shows the shape the demo uses. A workspace
  without the base's backlog treats the declaration step as its own
  convention's.
- The setup is young. The walk below exercises every instrument against the
  sample; adoption itself is the real test.

## Try it

Every command below runs from the pack root and was run as written; the
outputs are verbatim from that run (long ones abbreviated with `...` where
the full output repeats the shown shape; `<scratch>` in an output line stands
for the temp path the staging step created).

```sh
scratch=$(mktemp -d)
mkdir -p "$scratch/.contexture" "$scratch/docs"
cp -R .contexture/scripts "$scratch/.contexture/"
cp -R docs/. "$scratch/docs/"
cp -R sample/docs/. "$scratch/docs/"
cp sample/backlog.md "$scratch/backlog.md"
cd "$scratch"
```

The audit over the corpus:

```sh
.contexture/scripts/docs-audit.awk docs/*/*.md
```

```text
(no output; exit 0)
```

The index:

```sh
.contexture/scripts/docs-query --index
```

```text
demo-orders               operational                  operational                     Run, build, test, debug, and observe the demo order service
demo-orders               order-flow                   capability                      Cart validation, pricing, and order persistence for the demo
demo-web                  cart-ui                      capability                      Storefront cart interaction: add, remove, quantity edits, an
workspace                 conventions                  conventions                     Universal workspace conventions: documentation discipline, g
workspace                 system-map                   architecture                    The demo workspace map: two fictional product repos, their c
index complete: 5 entries
```

A projection and a section slice:

```sh
.contexture/scripts/docs-query demo-orders order-flow
```

```text
[capability: order-flow] 
Cart validation, pricing, and order persistence for the demo storefront


RESPONSIBILITIES:
  - Validate every submitted cart against stock and pricing rules
  - Persist accepted orders and publish the order-accepted event

CONTRACT:
  - rule: A cart naming an unknown item id is rejected with a typed validation error
    evidence: validateCart
    detail ::
      Unknown ids never reach persistence; the caller receives the offending id list.
  - rule: Prices are computed from the server-side price table, never from client totals
    evidence: priceCart
...
```

```sh
.contexture/scripts/docs-query demo-orders order-flow --section contract
```

```text
[order-flow > contract]
  - rule: "A cart naming an unknown item id is rejected with a typed validation error"
    evidence: "validateCart"
    detail ::
      Unknown ids never reach persistence; the caller receives the offending id list.
  - rule: "Prices are computed from the server-side price table, never from client totals"
    evidence: "priceCart"
```

The owner lookup, a rule view, and the pitfall view:

```sh
.contexture/scripts/docs-query demo-orders --file src/order/validate.ts
```

```text
OWNER: order-flow (capability) [demo-orders]
SUMMARY: Cart validation, pricing, and order persistence for the demo storefront
DOC: <scratch>/docs/demo-orders/order-flow.md
```

```sh
.contexture/scripts/docs-query workspace --rules docs/drift
```

```text
MUST docs/drift (universal, workspace)
  Drift is reconciled from the change delta, never from memory: the status-prefixed git delta feeds docs-check, every affected doc is updated in the same change, uncovered paths widen a unit's sources or open a new unit, and the audit and the check re-run clean before the doc change lands.
  evidence: .contexture/scripts/docs-check.awk
  anti: Shipping a code change and deferring its doc update to a later commit
  good: The same-change doc update, verified by docs-gate before close
```

```sh
.contexture/scripts/docs-query demo-orders --pitfalls
```

```text
! [HIGH/bug] order-flow-p1: A retried checkout can persist the same cart twice (order-flow.md)
  Trigger: The storefront retries POST /orders after a timeout while the first request is still in flight
  Evidence: validateCart

! [MEDIUM/drift-risk] order-flow-p2: A price edited between validation and persistence is applied inconsistently (order-flow.md)
  Trigger: The price table changes while a checkout request is in flight
  Evidence: priceCart
```

The edge view:

```sh
.contexture/scripts/docs-query --edge http
```

```text
[demo-orders > order-flow]
      via: http
[demo-web > cart-ui]
      via: http
```

The nudge over the demo backlog:

```sh
.contexture/scripts/docs-nudge.awk backlog.md docs/*/*.md
```

```text
[CONTEXT NUDGE: Task 'install-and-run-local']
Matched Docs: demo-orders/operational, demo-orders/order-flow, demo-web/cart-ui
Setup (demo-orders/operational):
  run: Install dependencies; Start the dev server
  build: Compile the service; Package the container
  test: Run the unit suite; Run the checkout integration test
  toolchain: Run `npm install` at the repository root. `.nvmrc` pins Node 20, so switch to it before installing.
Pitfalls: order-flow-p1: A retried checkout can persist the same cart twice; order-flow-p2: A price edited between validation and persistence is applied inconsistently; cart-ui-p1: A stale cart snapshot is posted after a failed checkout
```

The check over a delta: clean when the doc rides the change, red when it does
not, red when a new file no doc claims:

```sh
printf 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/demo-orders/order-flow.md\n' | .contexture/scripts/docs-check.awk docs/*/*.md
```

```text
--- TOUCHED DOCUMENTATION ---
AFFECTED: order-flow [demo-orders] -> docs/demo-orders/order-flow.md
  files: src/order/validate.ts

--- COVERAGE AUDIT (COMPLETENESS) ---
CLEAN: all touched code files are covered by sources globs.

--- FRESHNESS AUDIT ---
FRESH: demo-orders > order-flow (doc updated in change delta)
CLEAN: all affected code files have corresponding doc updates.

docs-check: CLEAN: all touched code files are covered and fresh.
```

```sh
printf 'M\tprojects/demo-orders/src/order/validate.ts\n' | .contexture/scripts/docs-check.awk docs/*/*.md
```

```text
docs-check: FAILED: 1 code file(s) are stale (code changed without doc update).
...
STALE DOC: demo-orders/order-flow (code modified without doc update)
  file: projects/demo-orders/src/order/validate.ts
```

```sh
printf 'A\tprojects/demo-orders/src/tools/report.ts\n' | .contexture/scripts/docs-check.awk docs/*/*.md
```

```text
docs-check: FAILED: 1 code file(s) are uncovered by any documentation.
...
UNCOVERED: projects/demo-orders/src/tools/report.ts
```

The gate: clean over the same delta, then red on a planted syntax defect.

```sh
printf 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/demo-orders/order-flow.md\n' | .contexture/scripts/docs-gate --stdin
```

```text
--- TOUCHED DOCUMENTATION ---
...
docs-check: CLEAN: all touched code files are covered and fresh.
```

```sh
printf '@doc capability broken\n  repo: demo-orders\n' > docs/demo-orders/broken.md
printf 'M\tprojects/demo-orders/src/order/validate.ts\n' | .contexture/scripts/docs-gate --stdin
rm docs/demo-orders/broken.md
```

```text
<scratch>/docs/demo-orders/broken.md:1: error: missing required 'description:' field in @doc
docs-audit: FAILED with 1 error(s)
(exit 1)
```

In a git workspace, the gate aggregates on its own (workspace root plus each
product repo's git) instead of reading stdin. The same change above reads
clean once the doc rides it, and red without the doc update.

The self-planted matrix:

```sh
.contexture/scripts/docs-gate --test-matrix
```

```text
=================================================================
  CLOSE GATE TEST MATRIX: 8 SCENARIOS (self-planted fixtures)
=================================================================
...
  TEST MATRIX VERDICT: ALL 8 SCENARIOS PASSED
=================================================================
```

Each of the eight scenarios prints its own `--> RESULT: PASS` line: no
changes, a valid edit, an uncovered file, a stale file, a multi-claimant doc
update, a deletion with its doc update, a deletion without one, and a newly
counted extension (an uncovered Python file).

## Files in this bundle (provenance)

| file | provenance |
|---|---|
| `README.md` | authored fresh for this pack (reference only) |
| `AGENTS.workspace.md` | neutralized from the workspace overlay this setup was extracted from: the five docs laws, the trimmed layout, boot and close at the drawer paths; no names, no unrelated laws |
| `gitignore.fragment` | authored fresh |
| `.contexture/scripts/docs-audit.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage line |
| `.contexture/scripts/docs-query.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage line |
| `.contexture/scripts/docs-query` | verbatim from the source CLI except the workspace root derivation (drawer-aware, `DOCS_WORKSPACE_ROOT` override), the usage block paths, valueless-flag validation (a missing value refuses loudly), an unknown-option refusal, a no-such-repo refusal, and a no-match note on an empty projection |
| `.contexture/scripts/docs-check.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage line; the single-repo mapping documented, not scripted; the extension predicate one-homed in `CODE_EXT_RE` and widened to the broad code set, with the generated and test exclusions in `EXCLUDE_RE` |
| `.contexture/scripts/docs-nudge.awk` | verbatim from the source instrument except the shebang and the line-2 comment |
| `.contexture/scripts/docs-gate` | neutralized from the source gate: comment header, one workspace root variable (`DOCS_WORKSPACE_ROOT`, script-dir default), the product-repos directory parameterized (`DOCS_PRODUCT_REPOS_DIR`, default `projects/`), the test matrix re-authored over self-planted fixtures, and an unknown-argument refusal |
| `.contexture/templates/doc.md` | corrected from the source grammar: the operational sub-shapes use the corpus's `- step:` form, the architecture detail fields use scalar blocks, the keywords optionality is stated, and the section separators are plain ASCII |
| `.contexture/rhythms/work.md` | authored as the workspace's work rhythm: the canonical 10 steps with the docs discipline at GATHER, EXECUTE, and REVIEW |
| `.contexture/rhythms/docs-authoring.md` | authored from the source authoring procedure; the steps name outcomes, the method detail lives in the template's comments |
| `.contexture/rhythms/docs-drift.md` | authored from the source drift procedure; the method lives in `@rule docs/drift` |
| `docs/workspace/conventions.md` | neutralized from the source ruleset: the docs, git, security, and typography rules kept; the authoring and drift procedure rules added; two evidence fields repaired to artifacts that exist in this pack |
| `sample/docs/...` | authored fresh: a fictional two-repo demo (a map, two unit docs, one operational doc) |
| `sample/backlog.md` | authored fresh: a demo backlog used by the nudge walk |
