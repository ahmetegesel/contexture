# docs-discipline: the corpus-first documentation plugin

The docs-discipline plugin packages a typed-block documentation corpus that
agents read before code, a `docs` module whose five verbs index, project,
check, nudge, and gate it, and a close gate that fails when a code change lands
without its doc update. Everything runs on plain files and POSIX awk/sh: no
runtime, no network, no vendor glue. Adopt it when agents working in your
repositories should consult a corpus instead of rediscovering the codebase by
grep.

## What it is

The mechanism in one paragraph: every repository gets unit docs in
`docs/<repo>/` written per the grammar in `.contexture/templates/doc.md`, and
the workspace gets its own docs in `docs/workspace/` (the conventions and the
map); `ctx docs query` serves the index, the projections, the lookups, and the
rule and pitfall views; `ctx docs check` compares a git change delta against
the corpus (coverage, freshness, dead sources); `ctx docs gate` runs the audit
and the check as one close check; `ctx docs nudge` extracts the active task's
intent and injects the matched docs, the top pitfalls, and (on setup verbs) the
owning repo's run, build, and test targets.

| verb | what it is | engine (private) |
|---|---|---|
| `ctx docs query` | the retrieval CLI: index, projection, section, owner, search, rules, pitfalls, edges | `docs-query.awk` |
| `ctx docs audit` | the grammar and integrity audit: header, blocks, indentation, rule fields, symbol-only evidence, duplicate ids | `docs-audit.awk` |
| `ctx docs check` | the change check: coverage, freshness, and dead sources over a status-prefixed delta | `docs-check.awk` |
| `ctx docs gate` | the close gate: audit then check over the aggregated delta (or the incoming remote delta with `--drift`), plus a self-planted eight-scenario matrix | self-contained |
| `ctx docs nudge` | the task nudge: matched docs, top pitfalls, forced setup targets | `docs-nudge.awk` |

The help surface is engine-owned: `ctx docs help` lists the five verbs and
`ctx docs help <verb>` prints that verb's usage and detail lines. A sole
`help` argument to a verb refuses with a pointer to the ctx form.

What lands where:

| piece | what it is | lands as |
|---|---|---|
| `.contexture/modules/docs/` | the docs module: the five verbs and their private engines | copy |
| `.contexture/templates/doc.md` | the corpus grammar: eight kinds, the block shapes, the block scalar rules | copy |
| `docs/workspace/conventions.md` | the ruleset: docs discipline, git, security, typography | seed |
| `AGENTS.workspace.md` | the overlay blocks: five docs laws, layout, boot, close | merge |
| `.contexture/rhythms/work.md`, `.contexture/rhythms/docs-authoring.md`, `.contexture/rhythms/docs-drift.md` | the workspace's work rhythm (the canonical variant with the docs discipline) and the two procedure rhythms | copy (optional) |
| `tests/sample/` | the fictional two-repo demo corpus plus a demo backlog | reference (never copied) |
| `tests/run.sh` | the plugin's own suite: the audit plus the gate matrix over the sample | reference (never copied) |
| `README.md` | this onboarding document | reference |

## Common shapes (reference rows)

The verbs are the same everywhere; the layout and the docs mapping
differ. These rows are the common shapes, not prescriptions: the mechanics
below are the plugin's reference defaults, and the adoption reads the actual
repo structure and calibrates the copied module on the spot where the
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

## Adoption

The plugin is adoption-gated: Assess reads the workspace, Propose renders the
findings and takes the human's go, Execute lands the confirmed plan, and
Verify proves it. The sections below are the whole flow; nothing is copied
before the verdict.

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
  (the list lives in `CODE_EXT_RE` in the check's engine,
  `.contexture/modules/docs/scripts/docs-check.awk`), skipping test
  files and generated markers (`*.min.*`, `*.generated.*`); a stack outside
  the set extends the list before the coverage claim holds. The test and
  generated exclusions are reference defaults: compare them with the repo's
  test conventions and calibrate on the spot.
- How does the repo's structure differ from the reference mechanics? The
  mapping (the `projects/<repo>/` prefix), the exclusions, and the matrix
  fixtures are reference defaults; where the repo differs (a single repo
  with named namespaces, its own test layout), the adoption adapts the
  copied module on the spot and records the local deltas so a future
  re-copy re-applies them.
- Should the close gate and the nudge be wired into a harness trigger, or
  run manually at close? The plugin ships no trigger; the wiring is the
  adopter's choice.

## Propose

Render the findings to the human and ask for the go. Cover:

- the topology and the docs mapping this implies;
- the copy list (the module and the grammar), the merge list (the
  overlay blocks and the gitignore lines), and the seed list (the
  conventions plus the first unit docs);
- who owns the close gate: the gate runs when a unit closes, manually or via
  the adopter's own trigger;
- whether the work rhythm should become the standing default (an
  optional overlay line) or stay an invoked rhythm;
- what the verify run will prove before any real work depends on the plugin.

## Execute

Labels: `copy` means the file lands as shipped; `merge` means its lines go
into an existing file; `seed` means it is starting content to adapt; and
`reference` means it stays behind.

1. Copy the module and the grammar into the workspace (the same commands
   the Try it walk runs against a scratch copy):

   ```sh
   mkdir -p <workspace>/.contexture/modules
   cp -R .contexture/modules/docs <workspace>/.contexture/modules/
   cp -R .contexture/templates <workspace>/.contexture/
   ```

   The verbs run through the workspace's `ctx` (the base runtime ships at
   `.contexture/ctx`). The module resolves the workspace root from the
   engine's `CTX_ROOT` (override with `DOCS_WORKSPACE_ROOT`), so an adopted
   copy always reads the workspace it is invoked in.

2. Copy the rhythms where the docs-bound flow is wanted:

   ```sh
   mkdir -p <workspace>/.contexture/rhythms
   cp .contexture/rhythms/work.md .contexture/rhythms/docs-authoring.md .contexture/rhythms/docs-drift.md <workspace>/.contexture/rhythms/
   ```

   Optional: make the work rhythm the standing default by adding one overlay
   block: `@append @rhythms` with `default: work`.

3. Merge `AGENTS.workspace.md` into the workspace overlay (or copy the file
   whole where none exists), and merge the gitignore lines below into
   `.gitignore` where the tree denies by default. Skip any line the workspace
   already allows (the contexture base normally allows AGENTS.md and
   AGENTS.workspace.md).

   ```gitignore
   # the plugin drawer: the module and the grammar template
   !/.contexture/
   !/.contexture/**

   # the corpus: the conventions and the per-repo docs
   !/docs/
   !/docs/**

   # multi-repo layouts only: the projects/ directory itself ships (with a
   # keep file, since git cannot track an empty directory); its contents stay
   # ignored: each product repository under it is its own git repository
   !/projects/
   !/projects/.gitkeep
   ```

4. Seed the corpus: copy `docs/workspace/conventions.md`, write a
   `docs/workspace/` map for the tree (per the grammar template), then one
   unit doc per repository, then the operational doc for the repository whose
   setup targets the nudge should force.

5. Keep `tests/sample/` and this README as references: the sample is
   fictional and never part of the adopted corpus; `tests/run.sh` is the
   plugin's own suite (the audit plus the gate matrix over the sample), lives
   with the plugin, is never copied, and the upstream runner may invoke it.

## Verify

From an adopted workspace root (seed at least one doc first: the `docs/*/*.md`
glob must expand):

```sh
ctx docs audit docs/*/*.md        # silence, exit 0
ctx docs query --index                 # ends: index complete: N entries
printf 'M\tprojects/<repo>/src/example.ts\n' | ctx docs check docs/*/*.md   # substitute repo and path; red (UNCOVERED) until a doc claims it
ctx docs gate                          # in a git workspace: audit plus the aggregated delta check
ctx docs gate --drift                  # in a git workspace: audit plus the incoming remote delta check
ctx docs gate --test-matrix            # ALL 8 SCENARIOS PASSED
ctx docs help gate                     # the full explanation and the module's verb table
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
  lookup via `ctx docs query --index`; a missing `index complete` marker
  means the read was truncated.
- Lookup: query line, then owning doc, then section; read code only for what
  the doc lacked. `ctx docs query` answers owner lookups and the rules and
  pitfalls dimensions.
- Authoring: the `docs-authoring` rhythm: the 11-step progression (sync,
  map, backlog, draft, interrogate, audit, coverage, reconcile, project,
  trace and accumulate, refresh); the method detail lives in the template's
  comments.
- Drift: the `docs-drift` rhythm: sync the checkout to the current base first
  (fetch; a branch comes up to date with main), declare the affected units as
  `@task` entries in `backlog.md`, pipe the status-prefixed git delta through
  the check, update each affected doc in the same change, re-verify.
- Close: `ctx docs gate` must pass cleanly. The gate verifies change, never
  truth. A default run also warns on stderr when a scanned repository is on a
  non-main branch or behind its last-fetched origin; `ctx docs gate --drift`
  evaluates the incoming remote delta (the merge-base form) instead of the
  local one.
- Setup tasks: run `ctx docs nudge` on the active backlog when a task names
  setup verbs; it prints the owning operational doc's run, build, and test
  targets plus the top pitfalls.

## Limits and status

- Harness-free by design: nothing fires automatically. The close gate and the
  nudge are invoked at their moments (boot, close, a setup task), or wired
  into the adopter's own trigger surface. This plugin ships no trigger.
- The five verbs ride the private engines under
  `.contexture/modules/docs/scripts/`: audit, check, and nudge exec their
  engine directly, query drives its engine with parsed options, and gate is
  self-contained over the audit and check engines. The engines' shebang names
  `/usr/bin/awk` (the same launcher form the base scripts use). A system whose
  awk lives elsewhere invokes the engines via `awk -f <path>` instead.
- The verbs refuse a bare invocation (no arguments) loudly instead of
  reading standard input as an empty corpus: the corpus files are the
  invocation. A wrong invocation never returns a plausible-but-empty result.
- The sample corpus is fictional and reference-only; the adopter's corpus is
  the real subject.
- The gate's matrix is self-planted: it builds its fixtures with `mktemp`,
  plants a local repository inside them for the claimant trackedness probe,
  and writes nothing outside the fixture directory.
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
  stdout and the exit code stay as the check left them. `ctx docs gate
  --drift` aggregates the incoming remote delta (the merge-base form) instead
  of the local delta, so commits made locally ahead of the remote never read
  as incoming deletions. In a team flow only the un-reflected incoming
  changes surface: a code change whose covering doc rode the same commits
  reads fresh, and only the changes whose docs did not ride are marked for
  reconciliation. A riding doc is the workflow's mark on the commit, since a
  workspace running the discipline does not hand-maintain its docs; so the
  flagged set also maps where the discipline is not yet in play. The test
  operates at co-change level; whether a doc that rode reflects the substance
  is the reconcile step's judgment, never the gate's.
- The check's satisfiers are generous by design: a touched unit reads fresh
  when any claimant unit doc, the repository's architecture doc, or a
  workspace doc rides the delta; the latter two are a repo-wide blanket, so
  the check reports it (`FRESH (BLANKET)` plus an `ARCH-COVERED` count of the
  files no riding claimant covered) instead of folding it silently into a
  clean verdict; coverage counts only the listed extensions; deleting a unit
  doc does not red the check. The gate stays scoped to the change delta,
  never the corpus's truth.
- The governed guide pages count as governed files: a depth-1 `docs/*.md`
  claimed by a corpus doc's sources demands its claimant ride the same delta
  (`STALE DOC` with `guide modified without corpus update` otherwise);
  unclaimed markdown stays outside, and the corpus itself (`docs/*/*.md`)
  never enters the governed set. The untracked-claimant verdict covers every
  governed file, the claimed code extensions included: when all of a file's
  claimants are untracked, none can ride a tracked delta, so the check
  reports the state (`UNTRACKED CLAIMANT` plus the claimant paths and the
  process-owned reconciliation via the docs-drift flow) and exits 0 instead
  of a false `STALE`; one tracked claimant among several restores the delta
  rule. The trackedness probe runs `git ls-files` per unique claimant and
  memoizes it; a non-repository run reads every claimant untracked, which is
  the honest state there.
- The excluded set is path-shaped: the generated and test families
  (`.spec.`, `.Test`, `.min.`, `.generated.`) plus any path segment named
  `spec` (including a top-level `spec/`), so a repository or directory
  literally named `spec` is invisible to coverage and freshness.
- The authoring and drift rhythms declare their work as `@task` entries in
  `backlog.md` (the base convention's task grammar) before drafting or
  reconciling; `tests/sample/backlog.md` shows the shape the demo uses. A
  workspace without the base's backlog treats the declaration step as its own
  convention's.
- The plugin is young. The walk below exercises every verb against the
  sample; adoption itself is the real test.

## Needs

POSIX awk/sh, the base `ctx` runtime (the plugin ships the module, not the
engine), and git for the close gate's delta, the check's claimant trackedness
probe, and the matrix's planted fixture repository (a non-repository run of
the check reads claimants untracked and reports the process-owned verdict;
the audit needs no repository). Nothing is installed: no runtime, no network.
The optional ast-doc-graph plugin pairs with this one: its docs extractor
reads the corpus grammar.

## Contributing

Changes land upstream with the walk re-run: every command in Try it below is
the plugin's test, and `tests/run.sh` drives the audit and the gate matrix as
the committed suite. Keep the grammar (`.contexture/templates/doc.md`) and the
audit in step; the `tests/sample/` corpus is reference data. Packaging,
naming, and the test convention are in `docs/plugins.md`; the module shape is
`docs/modules.md`.

## Try it

Every command below runs from the plugin root and was run as written; the
outputs are verbatim from that run (long ones abbreviated with `...` where
the full output repeats the shown shape; `<scratch>` in an output line stands
for the temp path the staging step created). The staging builds a scratch
workspace carrying the base runtime and this plugin's module; the commands
then run through the staged `ctx` (in an adopted workspace the same commands
run as `ctx docs ...`).

```sh
scratch="../../.contexture/tmp/docs-walk"
rm -rf "$scratch"
mkdir -p "$scratch/.contexture/modules" "$scratch/docs"
cp ../../.contexture/ctx "$scratch/.contexture/ctx"
cp -R .contexture/modules/docs "$scratch/.contexture/modules/"
cp -R docs/. "$scratch/docs/"
cp -R tests/sample/docs/. "$scratch/docs/"
cp tests/sample/backlog.md "$scratch/backlog.md"
cd "$scratch"
```

The audit over the corpus:

```sh
./.contexture/ctx docs audit docs/*/*.md
```

```text
(no output; exit 0)
```

The index:

```sh
./.contexture/ctx docs query --index
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
./.contexture/ctx docs query demo-orders order-flow
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
./.contexture/ctx docs query demo-orders order-flow --section contract
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
./.contexture/ctx docs query demo-orders --file src/order/validate.ts
```

```text
OWNER: order-flow (capability) [demo-orders]
SUMMARY: Cart validation, pricing, and order persistence for the demo storefront
DOC: <scratch>/docs/demo-orders/order-flow.md
```

```sh
./.contexture/ctx docs query workspace --rules docs/drift
```

```text
MUST docs/drift (universal, workspace)
  Drift is reconciled from the change delta, never from memory: the status-prefixed git delta feeds ctx docs check with BOTH halves in one stream (the repository's code delta and the workspace's own docs/<repo>/ delta); every affected doc is updated in the same change, uncovered paths widen a unit's sources or open a new unit, and the audit and the check re-run clean before the doc change lands.
  evidence: .contexture/modules/docs/scripts/docs-check.awk
  anti: Shipping a code change and deferring its doc update to a later commit; or verifying with a pipeline that feeds the check the code delta alone, which cannot exit 0 by construction
  good: Both halves in one stream, records split so a rename's old path surfaces as a dead source (the working command is in the README's two-sided delta paragraph); for an uncommitted working tree, ctx docs gate already aggregates both halves and needs no pipeline
```

```sh
./.contexture/ctx docs query demo-orders --pitfalls
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
./.contexture/ctx docs query --edge http
```

```text
[demo-orders > order-flow]
      via: http
[demo-web > cart-ui]
      via: http
```

The nudge over the demo backlog:

```sh
./.contexture/ctx docs nudge backlog.md docs/*/*.md
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
printf 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/demo-orders/order-flow.md\n' | ./.contexture/ctx docs check docs/*/*.md
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
printf 'M\tprojects/demo-orders/src/order/validate.ts\n' | ./.contexture/ctx docs check docs/*/*.md
```

```text
docs-check: FAILED: 1 file(s) are stale (changed without a doc update).
...
STALE DOC: demo-orders/order-flow (code modified without doc update)
  file: projects/demo-orders/src/order/validate.ts
```

```sh
printf 'A\tprojects/demo-orders/src/tools/report.ts\n' | ./.contexture/ctx docs check docs/*/*.md
```

```text
docs-check: FAILED: 1 code file(s) are uncovered by any documentation.
...
UNCOVERED: projects/demo-orders/src/tools/report.ts
```

An architecture, overview, or workspace doc riding a change marks every file
in the repo fresh wholesale. That is a blanket, not evidence: the check
reports it instead of folding it into the clean verdict, and counts the files
that no riding claimant covered.

```sh
printf 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/workspace/system-map.md\n' | ./.contexture/ctx docs check docs/*/*.md
```

```text
--- FRESHNESS AUDIT ---
FRESH (BLANKET): demo-orders > order-flow (counted fresh only because an architecture/overview/workspace doc was touched)
ARCH-COVERED: 1 file(s) counted fresh ONLY because an architecture/overview/workspace doc was touched, not because their own claiming doc rode the change.
  This is a blanket, not evidence. Verify those docs directly before reading the verdict as clean.
CLEAN: all affected code files have corresponding doc updates.

docs-check: CLEAN: all touched code files are covered and fresh.
```

**The two-sided delta.** A pushed range needs both halves in one stream, the
repository's code delta and the workspace's own docs delta, records split so a
rename's old path surfaces as a dead source:

```sh
{ git -C projects/<repo> diff --name-status --no-renames <base>..origin/<branch> | awk -F'\t' -v p=projects/<repo>/ '{ print $1 "\t" p $2 }'; git status --porcelain docs/<repo>/ | sed 's|^ *\([A-Z?]\)[A-Z? ] *|\1\t|'; } | ctx docs check docs/<repo>/*.md
```

For an uncommitted working tree, `ctx docs gate` already aggregates both
halves and needs no pipeline.

The gate: clean over the same delta, then red on a planted syntax defect.

```sh
printf 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/demo-orders/order-flow.md\n' | ./.contexture/ctx docs gate --stdin
```

```text
--- TOUCHED DOCUMENTATION ---
...
docs-check: CLEAN: all touched code files are covered and fresh.
```

```sh
printf '@doc capability broken\n  repo: demo-orders\n' > docs/demo-orders/broken.md
printf 'M\tprojects/demo-orders/src/order/validate.ts\n' | ./.contexture/ctx docs gate --stdin
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
./.contexture/ctx docs gate --test-matrix
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

The help surface; `ctx docs help gate` renders the gate's declarations:

```sh
./.contexture/ctx docs help gate
```

```text
ctx docs gate: the close gate: the corpus audit plus the coverage and freshness check as one pass

usage:
  ctx docs gate
  ctx docs gate --drift
  ctx docs gate --stdin
  ctx docs gate --test-matrix

help:
  runs the corpus audit, then feeds the aggregated status-prefixed delta to the check; it fails when either does; the default run also warns on stderr when a scanned repository is on a non-main branch or behind its last-fetched origin
  exit codes: 0 the audit and the check are clean; 1 a violation or a bad argument; 2 unreadable input (an awk engine's own failure)
  example: ctx docs gate --test-matrix (ends: TEST MATRIX VERDICT: ALL 8 SCENARIOS PASSED)
```

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `README.md` | authored fresh for this plugin (reference only) |
| `AGENTS.workspace.md` | neutralized from the workspace overlay this plugin was extracted from: the five docs laws, the trimmed layout, boot and close in ctx docs forms; no names, no unrelated laws |
| `.contexture/modules/docs/module` | authored fresh: the module summary line |
| `.contexture/modules/docs/scripts/audit` | authored fresh from the docs-query precedent: the help text moved into the `# summary`/`# usage`/`# help` declarations, the zero-argument refusal, and byte-faithful delegation to `docs-audit.awk` |
| `.contexture/modules/docs/scripts/query` | reworked from the source CLI: the workspace root derivation reads `CTX_ROOT` (with the `DOCS_WORKSPACE_ROOT` override), the usage strings are ctx forms, valueless-flag validation (a missing value refuses loudly), an unknown-option refusal, a no-such-repo refusal, a no-match note on an empty projection, and the help forms moved into the declarations |
| `.contexture/modules/docs/scripts/check` | authored fresh from the docs-query precedent: the help forms moved into the declarations, the zero-argument refusal, and byte-faithful delegation to `docs-check.awk` |
| `.contexture/modules/docs/scripts/nudge` | authored fresh from the docs-query precedent: the help forms moved into the declarations, the zero-argument refusal, and byte-faithful delegation to `docs-nudge.awk` |
| `.contexture/modules/docs/scripts/gate` | neutralized from the source gate: comment header, one workspace root variable (`DOCS_WORKSPACE_ROOT`, `CTX_ROOT` fallback), the product-repos directory parameterized (`DOCS_PRODUCT_REPOS_DIR`, default `projects/`), the test matrix re-authored over self-planted fixtures, an unknown-argument refusal, and the help moved into the declarations |
| `.contexture/modules/docs/scripts/docs-audit.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms) |
| `.contexture/modules/docs/scripts/docs-query.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms) |
| `.contexture/modules/docs/scripts/docs-check.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms); the single-repo mapping documented, not scripted; the extension predicate one-homed in `CODE_EXT_RE` and widened to the broad code set, with the generated and test exclusions in `EXCLUDE_RE`; the spec-family exclusion anchored and the architecture/overview/workspace blanket reported (`FRESH (BLANKET)`, `ARCH-COVERED`) instead of folded into the clean verdict; the governed guide predicate (a depth-1 `docs/*.md` claimed by the corpus) with the trackedness probe and the untracked-claimant verdict for every governed file (`UNTRACKED CLAIMANT`, process-owned reconciliation, never a false `STALE`) |
| `.contexture/modules/docs/scripts/docs-nudge.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms) |
| `.contexture/modules/docs/README.md` | authored fresh: the off-path module map (layout, workspace root, tests) |
| `.contexture/templates/doc.md` | corrected from the source grammar: the operational sub-shapes use the corpus's `- step:` form, the architecture detail fields use scalar blocks, the keywords optionality is stated, and the section separators are plain ASCII |
| `.contexture/rhythms/work.md` | authored as the workspace's work rhythm: the canonical 10 steps with the docs discipline at GATHER, EXECUTE, and REVIEW |
| `.contexture/rhythms/docs-authoring.md` | authored from the source authoring procedure; the steps name outcomes, the method detail lives in the template's comments |
| `.contexture/rhythms/docs-drift.md` | authored from the source drift procedure; the method lives in `@rule docs/drift` |
| `docs/workspace/conventions.md` | neutralized from the source ruleset: the docs, git, security, and typography rules kept; the authoring and drift procedure rules added; the drawer sources glob and evidence fields re-pointed at the module |
| `tests/sample/docs/...` | authored fresh: a fictional two-repo demo (a map, two unit docs, one operational doc) |
| `tests/sample/backlog.md` | authored fresh: a demo backlog used by the nudge walk |
| `tests/run.sh` | authored fresh: the plugin suite (the audit plus the gate matrix over `tests/sample/`), staged under the workspace's `.contexture/tmp/` when writable |
