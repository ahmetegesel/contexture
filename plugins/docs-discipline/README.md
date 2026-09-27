# docs-discipline: the corpus-first documentation plugin

The docs-discipline plugin packages a typed-block documentation corpus that
agents read before code, a `docs` module whose read verbs index, project,
check, nudge, and gate it and list its changes under a store driver and whose
write verbs change it block by block, each write schema-checked and audited
before it is stored, and a close gate that fails when a code change lands
without its doc update. Everything runs on POSIX awk/sh and the ctx verbs,
over plain files under the files driver or inside the store a storage driver
keeps: no runtime, no network, no vendor glue. Adopt it when agents working in your
repositories should consult a corpus instead of rediscovering the codebase by
grep.

## What it is

The mechanism in one paragraph: every repository gets unit docs addressed
`docs/<repo>/<slug>.md` written per the grammar in
`.contexture/templates/doc.md`, and the workspace gets its own docs addressed
`docs/workspace/<slug>.md` (the conventions and the map); the configured
storage driver holds them (the files driver as those very files, a store
driver such as the storage-fts5 plugin's in its store) and every verb reaches
them through it; the write verbs change a doc block by block; `ctx docs query` serves the index, the projections, the lookups, and the
rule and pitfall views; `ctx docs check` compares a git change delta against
the corpus (coverage, freshness, dead sources); `ctx docs gate` runs the audit
and the check as one close check; `ctx docs nudge` extracts the active task's
intent and injects the matched docs, the top pitfalls, and (on setup verbs) the
owning repo's run, build, and test targets.

| verb | what it is | engine (private) |
|---|---|---|
| `ctx docs query` | the retrieval CLI: index, projection, section, owner, search, rules, pitfalls, edges; `--entry <block>/<key>` prints one entry's raw lines | `docs-query.awk` (`--entry`: `docs-edit.awk`) |
| `ctx docs audit` | the grammar and integrity audit: header, blocks, indentation, rule fields, symbol-only evidence, duplicate ids | `docs-audit.awk` |
| `ctx docs check` | the change check: coverage, freshness, and dead sources over a status-prefixed delta | `docs-check.awk` |
| `ctx docs gate` | the close gate: audit then check over the aggregated delta (or the incoming remote delta with `--drift`), plus a self-planted eight-scenario matrix | self-contained |
| `ctx docs nudge` | the task nudge: matched docs, top pitfalls, forced setup targets | `docs-nudge.awk` |
| `ctx docs changes` | the corpus half of a delta under a store driver: one net status line per doc written since the current git HEAD (`--since=<rev>` widens the window); refuses under the files driver, whose corpus rides git | none (the IO helper) |
| `ctx docs new` | a doc holding only its header (first extraction, block by block) | `docs-edit.awk` |
| `ctx docs write` | a whole doc from stdin (first extraction, or `--replace` for a deliberate rewrite) | `docs-edit.awk` (the checks) |
| `ctx docs header` | header fields without a read: `--add-source`, `--remove-source` (the UNCOVERED and DEAD SOURCE fixes), keywords, children, description, role, upstream, parent | `docs-edit.awk` |
| `ctx docs rule` | a `@rule` block by `<category>/<rule-slug>`: add, change fields, remove | `docs-edit.awk` |
| `ctx docs pitfall` | a `@pitfalls` entry by its repo-unique id: add (id assigned), change, retire | `docs-edit.awk` |
| `ctx docs entry` | one entry of any list block by its key (an id, a first field's value, `<from>><to>`, `<direction>:<key>`, or `#<N>`): add with `--after` or `--first`, change fields, remove | `docs-edit.awk` |
| `ctx docs section` | a whole block from stdin: replace, create, or remove (rare) | `docs-edit.awk` |
| `ctx docs replace` | counted exact replacement over a doc, a repo, or the corpus (sync sweeps; the total must equal `--count`) | `docs-edit.awk` |
| `ctx docs remove` | a whole doc out of the corpus | none (the IO helper) |
| `ctx docs ids` | the one-time migration: keyless contract rules and responsibilities gain `<slug>-r<N>` and `<slug>-o<N>` ids | `docs-edit.awk` |

The help surface is engine-owned: `ctx docs help` lists the sixteen verbs and
`ctx docs help <verb>` prints that verb's usage and detail lines. A sole
`help` argument to a verb refuses with a pointer to the ctx form.

What lands where:

| piece | what it is | lands as |
|---|---|---|
| `.contexture/modules/docs/` | the docs module: the sixteen verbs and their private engines | copy |
| `.contexture/templates/doc.md` | the corpus grammar: eight kinds, the block shapes, the block scalar rules, and at its foot the machine-readable schema (section 6, the `#%` lines) | copy |
| `docs/workspace/conventions.md` | the ruleset: docs discipline, git, security, typography | seed |
| `AGENTS.workspace.md` | the overlay blocks: five docs laws, layout, boot, close | merge |
| `.contexture/rhythms/work.md`, `.contexture/rhythms/docs-authoring.md`, `.contexture/rhythms/docs-drift.md` | the workspace's work rhythm (the canonical variant with the docs discipline) and the two procedure rhythms | copy (optional) |
| `tests/sample/` | the fictional two-repo demo corpus plus a demo backlog | reference (never copied) |
| `tests/run.sh` | the plugin's own suite: the staging check, the audit, the unit-form nudge, the write verbs, the engine checks, the delta-source cases, the single-door census, the gate matrix over the sample, and the grammar agreement check, on either storage driver (`--driver=posix\|fts5`); the fts5 run adds the store seed, the migration round trip, and the capture parity against the files driver, with the corpus checks in a second sandbox running beside that chain | reference (never copied) |
| `tests/store-cases.sh` | the delta-source cases: the check's store mode against its git mode, `ctx docs changes` (its window, `--since`, A, M, D, its refusals), and the gate composing the code half from git with the corpus half from the store (or from git under the files driver) | reference (never copied) |
| `tests/write-verbs.sh`, `tests/write/` | the write verbs' assertions and their fixtures: every verb's result byte for byte, every refusal leaving the stored doc unchanged, the change-log rows under a store | reference (never copied) |
| `tests/engine-checks.sh` | the audit's one id namespace per repo, the pitfalls view scoped to `@pitfalls` with a doc-ending pitfall credited to its own doc, a backslash search kept literal, a draft path outside the corpus folder refused under the files driver | reference (never copied) |
| `tests/grammar-agreement.awk` | the grammar agreement check the suite runs: the `#%` schema, the prose shapes, and the audit's kind and block lists agree | reference (never copied) |
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

   The corpus lines apply under the files driver, whose corpus is the files
   under `docs/`; a corpus kept in a store driver needs none (the storage-fts5
   README names the git steps for moving a tracked corpus into its store).

   ```gitignore
   # the plugin drawer: the module and the grammar template
   !/.contexture/
   !/.contexture/**

   # the corpus under the files driver: the conventions and the per-repo docs
   !/docs/
   !/docs/**

   # multi-repo layouts only: the projects/ directory itself ships (with a
   # keep file, since git cannot track an empty directory); its contents stay
   # ignored: each product repository under it is its own git repository
   !/projects/
   !/projects/.gitkeep
   ```

4. Seed the corpus through the write verbs, which check each doc against the
   grammar and audit it before the configured driver stores it: the
   conventions first (`ctx docs write workspace conventions <
   <plugin>/docs/workspace/conventions.md`), then a workspace map for the tree
   (`ctx docs write` for a whole draft, or `ctx docs new` and the block verbs,
   per the grammar template), then one unit doc per repository, then the
   operational doc for the repository whose setup targets the nudge should
   force. Under the files driver each write lands as `docs/<repo>/<slug>.md`.

5. Keep `tests/sample/` and this README as references: the sample is
   fictional and never part of the adopted corpus; `tests/run.sh` is the
   plugin's own suite (the corpus checks, the write verbs, the store cases, and
   the gate matrix over the sample, the census, and the grammar agreement
   check), lives with the plugin, is never copied, and the upstream runner
   invokes it twice, once per storage driver.

## Verify

From an adopted workspace root (seed at least one doc first; the verbs read
the corpus through the configured storage driver, and the files driver serves
`docs/<repo>/<slug>.md` in place):

```sh
ctx docs audit                         # silence, exit 0 (the whole corpus; ctx docs audit <repo> for one repo)
ctx docs query --index                 # ends: index complete: N entries
printf 'M\tprojects/<repo>/src/example.ts\n' | ctx docs check <repo>   # substitute repo and path; red (UNCOVERED) until a doc claims it
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
- Writing: the corpus changes through the write verbs, never by editing its
  files: a field rewrite is `ctx docs entry <repo> <slug> <block> <key>
  --<field>="..."` (read the entry first with `ctx docs query <repo> <slug>
  --entry <block>/<key>` when the value is rewritten from its old text), an
  added entry lands with `--after=<key>` beside a related one, a header
  source with `ctx docs header --add-source`, a sync sweep with `ctx docs
  replace --count`; each write checks its edit against the grammar's schema,
  audits the result over its repo, and only then stores it (under a store
  driver the change log stamps it with the workspace git HEAD). `--dry-run`
  prints the changed lines without storing.
- Authoring: the `docs-authoring` rhythm: the 11-step progression (sync,
  map, backlog, draft, interrogate, audit, coverage, reconcile, project,
  trace and accumulate, refresh); the method detail lives in the template's
  comments, and each draft lands through `ctx docs write` (a whole first
  extraction) or `ctx docs new` and the block verbs.
- Drift: the `docs-drift` rhythm: sync the checkout to the current base first
  (fetch; a branch comes up to date with main), declare the affected units as
  `@task` entries in `backlog.md`, pipe the status-prefixed code delta from git
  with the corpus half (the corpus paths of the same git delta under the files
  driver, `ctx docs changes` under a store) through the check, update each
  affected doc through the write verbs in the same change, re-verify with
  `ctx docs gate`.
- Close: `ctx docs gate` must pass cleanly. The gate verifies change, never
  truth. A default run also warns on stderr when a scanned repository is on a
  non-main branch or behind its last-fetched origin; `ctx docs gate --drift`
  evaluates the incoming remote delta (the merge-base form) instead of the
  local one.
- Setup tasks: run `ctx docs nudge <unit>` when the unit's active task names
  setup verbs; it reads the first IN_PROGRESS task through `ctx session` (the
  record's own store, never the backlog as a file) and prints the owning
  operational doc's run, build, and test targets plus the top pitfalls.

## Limits and status

- Harness-free by design: nothing fires automatically. The close gate and the
  nudge are invoked at their moments (boot, close, a setup task), or wired
  into the adopter's own trigger surface. This plugin ships no trigger.
- The five read verbs ride the private engines under
  `.contexture/modules/docs/scripts/`: audit, check, and nudge hand their
  engine the corpus paths the IO helper resolved (and exec it, as before,
  when the files driver answers in place), query drives its engine with
  parsed options over the helper's paths, and gate is self-contained over the
  audit and check engines. The engines' shebang names
  `/usr/bin/awk` (the same launcher form the base scripts use). A system whose
  awk lives elsewhere invokes the engines via `awk -f <path>` instead.
- The write verbs share one pipeline in the IO helper: the doc read through
  the driver, one structural edit by `docs-edit.awk` against the schema at the
  foot of `.contexture/templates/doc.md` (the engine resolves the template
  beside the module), the result audited over its whole repo, then the store.
  A refusal writes nothing: an unknown field, an enum value outside its set, a
  missing required field on a new entry, a duplicate key or id, a missing
  address, a stale replace count, an audit failure, a newline in a one-line
  field (a text field with a newline renders as a block scalar), a carriage
  return. Untouched lines stay byte for byte; a result equal to the stored doc
  writes nothing. Free text reaches the engines through the environment, never
  `awk -v`, so quotes and backslashes keep their bytes (a `--search` term too).
- Ids: contract rules and responsibilities carry `<slug>-r<N>` and
  `<slug>-o<N>` on the entry's second line (pitfalls `<slug>-p<N>` and caveats
  `<slug>-c<N>` at the entry head, as before); a new entry takes the doc's
  highest number plus one, a removed id retires (the one residual: removing
  the highest id lets the next add reuse its number; name one with `--id` to
  avoid it). `ctx docs ids` keys a legacy corpus once; a keyless legacy entry
  stays legitimate and is addressed by `#<N>`. The audit keeps one id
  namespace per repo across every id field.
- The corpus reaches the verbs only through the storage driver, by one door
  (`scripts/docs-io.sh`): a bare `ctx docs audit` reads the whole corpus, a
  repo name reads that repo's docs, and a doc path names a doc by its address
  `docs/<repo>/<slug>.md` (under the files driver an existing file at such a
  path outside the corpus folder, a draft, refuses rc 1 rather than silently
  reading the stored doc: check a draft with `ctx docs write <repo> <slug>
  [--replace] --dry-run`). `ctx docs check` and `ctx docs nudge` refuse a bare
  invocation loudly instead of reading standard input as an empty corpus, an
  argument naming no doc or repo refuses rc 1, and an empty corpus refuses
  rc 1. A wrong invocation never returns a plausible-but-empty result.
- The glob forms (`docs/*/*.md`, `docs/<repo>/*.md`) are the files-driver
  form: under a store driver no file matches, so sh and bash hand the verb
  the literal pattern (which it expands through the driver's list) while zsh
  refuses an unmatched glob before the verb runs; name repos there. Every doc
  path a verb prints is the path the files driver prints for the same call.
- A driver that serves no corpus (without the capability `corpus.store`)
  makes every read verb refuse rc 2 naming the capability.
- Under a store driver that keeps a corpus change log (`corpus.changelog`,
  the storage-fts5 plugin among them) the corpus leaves git: each doc write
  is stamped with the workspace git HEAD, and the corpus half of a delta is
  `ctx docs changes` (the docs written since the current HEAD) while the code
  half stays on git. `ctx docs gate` composes both halves by itself (the
  workspace root's `docs/<repo>/<slug>.md` files, if any linger, are dropped
  from the git half: they are not the corpus), so a commit empties both
  together. The check then runs in its store mode: no blanket (a doc
  refreshes only the code its own sources name, so `FRESH (BLANKET)` and
  `ARCH-COVERED` never print) and no trackedness probe (every claimant can
  ride the delta, so `UNTRACKED CLAIMANT` never fires). A HEAD move that is
  not a commit (a checkout, a reset) leaves the earlier doc writes outside the
  window and reads their code stale; recover with
  `{ git diff --name-status; ctx docs changes --since=<the previous HEAD>; } | ctx docs check <repo>`.
  `ctx docs gate --drift` under a store prints a deferral notice (drift over
  a shared store is undesigned) and checks the incoming code delta alone.
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
  ids (one namespace per repo). Rule status and prevalence and most inner
  fields are not validated on read (the write verbs validate every field they
  write against the schema);
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
  the honest state there. The blanket and the untracked-claimant verdict are
  the files driver's; the store mode (above) turns both off.
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

POSIX awk/sh, the base `ctx` runtime and its session module (the plugin ships
the module, not the engine; the verbs reach the corpus through the session
module's `driver-resolver`, and the configured storage driver must serve the
corpus: the capability `corpus.store`, which the base posix driver declares
from the release that carries the corpus methods; an older base makes every
read verb refuse rc 2), and git for the close gate's delta, the check's claimant trackedness
probe, and the matrix's planted fixture repository (a non-repository run of
the check reads claimants untracked and reports the process-owned verdict;
the audit needs no repository; under a store driver git also supplies the
HEAD each doc write is stamped with, `none` outside a repository). A store
driver brings its own needs (the storage-fts5 plugin: sqlite3 with FTS5).
Nothing is installed: no runtime, no network.
The optional ast-doc-graph plugin pairs with this one: its docs extractor
reads the corpus grammar.

## Contributing

Changes land upstream with the walk re-run: every command in Try it below is
the plugin's test, and `tests/run.sh` drives the audit and the gate matrix as
the committed suite, staged from the repository's shipped core (`base/`) and
this plugin's own copies, never an adopted drawer, on the posix driver and
again with `--driver=fts5` (the storage-fts5 plugin's copy configured; skip 77
without sqlite3 FTS5). The suite also runs the single-door census
(`tests/census.sh` over `tests/census-allow.txt`): a new corpus read or path
print outside `scripts/docs-io.sh` fails it until the allow-list names it on
purpose. `tests/captures.sh` (plan, run, compare) is the capture set of the
read verbs, the instrument of the byte identity between two module versions
at one path and of the parity between two drivers: the fts5 run compares the
files driver and the store at one sandbox path and accepts only the store
mode's named verdicts as differences. The fts5 run also round-trips the
corpus through `ctx session migrate --corpus` byte for byte.
`tests/write-verbs.sh` asserts every write verb against the expected docs
under `tests/write/` (a changed rendering updates its fixture on purpose),
`tests/engine-checks.sh` the id namespace, the pitfalls scoping (a doc-ending pitfall credited to its own doc), the
literal backslash search and the files driver's draft-path refusal, and `tests/store-cases.sh` the delta sources on
either driver (the check's two modes, `ctx docs changes`, the gate's two
halves in a git workspace of its own). Keep the grammar (`.contexture/templates/doc.md`), its
machine-readable schema (section 6), and the audit in step: the suite's
grammar agreement check (`tests/grammar-agreement.awk`) fails on any
difference among the three; the `tests/sample/` corpus is reference data. Packaging,
naming, and the test convention are in `docs/plugins.md`; the module shape is
`docs/modules.md`.

## Try it

Every command below runs from the plugin root, in the repository that ships
this plugin beside `base/`, and was run as written; the outputs are verbatim
from that run (long ones abbreviated with `...` where the full output repeats
the shown shape; `<scratch>` in an output line stands for the absolute path of
the scratch workspace; a nonzero exit shows as `(exit N)`). The staging builds
a scratch workspace from the shipped copies: the base runtime, its session
module (the storage driver the verbs reach the corpus through), and this
plugin's module and grammar; it commits the corpus in a repository of its own,
since the check reads a claimant outside git as untracked (the process-owned
verdict) and never as stale. The commands then run through the staged `ctx`
(in an adopted workspace the same commands run as `ctx docs ...`). The first
part runs on the files driver, the second on the fts5 store.

```sh
scratch="../../.contexture/tmp/docs-walk"
rm -rf "$scratch"
mkdir -p "$scratch/.contexture/modules" "$scratch/docs"
cp ../../base/.contexture/ctx "$scratch/.contexture/ctx"
cp -R ../../base/.contexture/modules/session "$scratch/.contexture/modules/"
cp -R .contexture/modules/docs "$scratch/.contexture/modules/"
cp -R .contexture/templates "$scratch/.contexture/"
cp -R docs/. "$scratch/docs/"
cp -R tests/sample/docs/. "$scratch/docs/"
cp tests/sample/backlog.md "$scratch/backlog.md"
cd "$scratch"
git init -q && git add docs && git -c user.name=walk -c user.email=walk@example.invalid commit -qm walk
```

The audit over the whole corpus (a bare call; `ctx docs audit <repo>` audits
one repo):

```sh
./.contexture/ctx docs audit
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
  Drift is reconciled from the change delta, never from memory: the status-prefixed delta feeds ctx docs check with BOTH halves in one stream (the code delta from git and the corpus delta: the corpus paths of the same git delta under the files driver, ctx docs changes under a store driver); every affected doc is updated through the ctx docs write verbs in the same change, uncovered paths widen a unit's sources or open a new unit, and the audit and the check re-run clean before the doc change lands.
  evidence: .contexture/modules/docs/scripts/docs-check.awk
  anti: Shipping a code change and deferring its doc update to a later commit; or verifying with a pipeline that feeds the check the code delta alone, which cannot exit 0 by construction
  good: Both halves in one stream, records split so a rename's old path surfaces as a dead source (the working command is in the README's two-sided delta paragraph); for an uncommitted working tree, ctx docs gate composes both halves by itself on every driver and needs no pipeline
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

The nudge over the demo backlog, the corpus named by its repos (in a
workspace with a record, `ctx docs nudge <unit>` reads the active task
through `ctx session` instead):

```sh
./.contexture/ctx docs nudge backlog.md demo-orders demo-web workspace
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
not, red when a new file no doc claims (the repo names select the corpus; the
files driver also takes the glob form `docs/*/*.md`, which zsh refuses once no
file matches):

```sh
printf 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/demo-orders/order-flow.md\n' | ./.contexture/ctx docs check demo-orders demo-web workspace
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
printf 'M\tprojects/demo-orders/src/order/validate.ts\n' | ./.contexture/ctx docs check demo-orders demo-web workspace
```

```text
...
--- FRESHNESS AUDIT ---
docs-check: FAILED: 1 file(s) are stale (changed without a doc update).
STALE DOC: demo-orders/order-flow (code modified without doc update)
  file: projects/demo-orders/src/order/validate.ts

(exit 1)
```

```sh
printf 'A\tprojects/demo-orders/src/tools/report.ts\n' | ./.contexture/ctx docs check demo-orders demo-web workspace
```

```text
docs-check: FAILED: 1 code file(s) are uncovered by any documentation.
...
UNCOVERED: projects/demo-orders/src/tools/report.ts
...
(exit 1)
```

An architecture, overview, or workspace doc riding a change marks every file
in the repo fresh wholesale under the files driver. That is a blanket, not
evidence: the check reports it instead of folding it into the clean verdict,
and counts the files that no riding claimant covered (a store driver turns the
blanket off).

```sh
printf 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/workspace/system-map.md\n' | ./.contexture/ctx docs check demo-orders demo-web workspace
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
repository's code delta and the corpus delta, records split so a rename's old
path surfaces as a dead source. Under the files driver with a tracked corpus
the corpus half is the corpus paths of git:

```sh
{ git -C projects/<repo> diff --name-status --no-renames <base>..origin/<branch> | awk -F'\t' -v p=projects/<repo>/ '{ print $1 "\t" p $2 }'; git status --porcelain docs/<repo>/ | sed 's|^ *\([A-Z?]\)[A-Z? ] *|\1\t|'; } | ctx docs check <repo>
```

Under a store driver the corpus half is the store's change log since the
workspace revision the work began at:

```sh
{ git -C projects/<repo> diff --name-status --no-renames <base>..origin/<branch> | awk -F'\t' -v p=projects/<repo>/ '{ print $1 "\t" p $2 }'; ctx docs changes --since=<workspace rev>; } | ctx docs check <repo>
```

For an uncommitted working tree, `ctx docs gate` composes both halves by
itself on every driver and needs no pipeline.

The gate: clean over the same delta, then red on a planted syntax defect (a
direct file edit, which only the files driver allows and which the write
verbs would refuse):

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
  under a store driver with a change log (corpus.changelog) the delta has two halves: the code from git (the workspace root's docs/<repo>/<slug>.md paths dropped, since those files are not the corpus) and the corpus from the store (ctx docs changes: the docs written since the current HEAD, so a commit empties both halves together); the check runs in its store mode; --stdin takes the caller's delta as given, and --drift prints a deferral notice and checks the incoming code delta alone
  exit codes: 0 the audit and the check are clean; 1 a violation or a bad argument; 2 unreadable input (an awk engine's own failure)
  example: ctx docs gate --test-matrix (ends: TEST MATRIX VERDICT: ALL 8 SCENARIOS PASSED)
```

Writing through the verbs. The one-time id migration keys the sample's
contract rules and responsibilities; an entry is then read by its key, one
field rewritten, an entry added beside a related one, and a source added to
the header without reading the doc; a value outside its enum refuses and
writes nothing:

```sh
./.contexture/ctx docs ids
```

```text
docs ids: demo-orders/order-flow keyed 4
docs ids: demo-web/cart-ui keyed 4
docs ids: 8 entries keyed
```

```sh
./.contexture/ctx docs query demo-orders order-flow --entry contract/order-flow-r1
```

```text
  - rule: "A cart naming an unknown item id is rejected with a typed validation error"
    id: order-flow-r1
    evidence: "validateCart"
    detail ::
      Unknown ids never reach persistence; the caller receives the offending id list.
```

```sh
./.contexture/ctx docs entry demo-orders order-flow contract order-flow-r1 --detail="Unknown ids never reach persistence; the caller receives the offending id list and the cart stays unchanged."
./.contexture/ctx docs entry demo-orders order-flow contract --rule="An accepted order publishes exactly one order-accepted event" --evidence=publishOrderAccepted --after=order-flow-r2
./.contexture/ctx docs header demo-orders order-flow --add-source='src/events/**'
```

```text
docs entry: demo-orders/order-flow contract/order-flow-r1 updated (detail)
docs entry: demo-orders/order-flow contract/order-flow-r3 added after contract/order-flow-r2
docs header: demo-orders/order-flow header updated (sources)
```

```sh
./.contexture/ctx docs pitfall demo-orders order-flow order-flow-p2 --severity=urgent
```

```text
ctx docs pitfall: severity takes one of: low medium high critical (got 'urgent') (ERR_SCHEMA_VIOLATION)
(exit 1)
```

The audit stays silent and the section shows the three writes (the detail
kept a block scalar, the new rule placed after its neighbor):

```sh
./.contexture/ctx docs audit
./.contexture/ctx docs query demo-orders order-flow --section contract
```

```text
[order-flow > contract]
  - rule: "A cart naming an unknown item id is rejected with a typed validation error"
    id: order-flow-r1
    evidence: "validateCart"
    detail ::
      Unknown ids never reach persistence; the caller receives the offending id list and the cart stays unchanged.
  - rule: "Prices are computed from the server-side price table, never from client totals"
    id: order-flow-r2
    evidence: "priceCart"
  - rule: "An accepted order publishes exactly one order-accepted event"
    id: order-flow-r3
    evidence: "publishOrderAccepted"
```

The same corpus on the fts5 store (the storage-fts5 plugin beside this one;
needs sqlite3 with FTS5), moved by `ctx session migrate --corpus` (the scratch
holds no unit, so only the corpus travels). The move mirrors a committed corpus,
so the writes are committed first; it refuses a tracked corpus with uncommitted
changes and, after a clean move, prints the git steps that retire the files (the
walk skips them and removes the folder):

```sh
git -c user.name=walk -c user.email=walk@example.invalid commit -qam writes
cp -R ../../../plugins/storage-fts5/.contexture/modules/storage-fts5 .contexture/modules/
printf 'storage.driver: fts5\n' > .contexture/config
./.contexture/ctx session migrate --from=posix --to=fts5 --corpus
rm -rf docs
```

```text
migrate posix to fts5: 0 units, 0 records
corpus: 5 docs
session migrate: the corpus of repo(s) demo-orders demo-web workspace is tracked in git; the fts5 store now holds it, so the files invite edits that no longer reach the corpus. Next steps (run them yourself):
  git rm -r --cached docs/demo-orders
  git rm -r --cached docs/demo-web
  git rm -r --cached docs/workspace
  ignore those folders (.gitignore), commit, delete the working files, and set storage.driver: fts5 in .contexture/config
```

With no docs folder left, the verbs read the store and print what the files
driver printed:

```sh
./.contexture/ctx docs audit
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

A write lands in the store stamped with the workspace git HEAD, and
`ctx docs changes` prints the corpus half of the delta:

```sh
./.contexture/ctx docs entry demo-orders order-flow contract order-flow-r2 --detail="The price table is read once per checkout, at validation."
./.contexture/ctx docs changes
```

```text
docs entry: demo-orders/order-flow contract/order-flow-r2 updated (detail)
M	docs/demo-orders/order-flow.md
```

The code change alone reads stale; with the corpus half beside it, fresh (the
check in its store mode; the default gate composes both halves by itself):

```sh
printf 'M\tprojects/demo-orders/src/order/validate.ts\n' | ./.contexture/ctx docs gate --stdin
```

```text
docs-check: FAILED: 1 file(s) are stale (changed without a doc update).
--- TOUCHED DOCUMENTATION ---
AFFECTED: order-flow [demo-orders] -> <scratch>/docs/demo-orders/order-flow.md
  files: src/order/validate.ts
...
STALE DOC: demo-orders/order-flow (code modified without doc update)
  file: projects/demo-orders/src/order/validate.ts

(exit 1)
```

```sh
{ printf 'M\tprojects/demo-orders/src/order/validate.ts\n'; ./.contexture/ctx docs changes; } | ./.contexture/ctx docs gate --stdin
```

```text
--- TOUCHED DOCUMENTATION ---
AFFECTED: order-flow [demo-orders] -> <scratch>/docs/demo-orders/order-flow.md
  files: src/order/validate.ts
...
FRESH: demo-orders > order-flow (doc updated in change delta)
CLEAN: all affected code files have corresponding doc updates.

docs-check: CLEAN: all touched code files are covered and fresh.
```

## Files in this plugin (provenance)

| file | provenance |
|---|---|
| `README.md` | authored fresh for this plugin (reference only) |
| `AGENTS.workspace.md` | neutralized from the workspace overlay this plugin was extracted from: the five docs laws, the trimmed layout, boot and close in ctx docs forms; no names, no unrelated laws |
| `.contexture/modules/docs/module` | authored fresh: the module summary line |
| `.contexture/modules/docs/scripts/audit` | authored fresh from the docs-query precedent: the help text moved into the `# summary`/`# usage`/`# help` declarations and delegation to `docs-audit.awk` over the corpus the IO helper resolved (a bare call reads the whole corpus) |
| `.contexture/modules/docs/scripts/query` | reworked from the source CLI: the workspace root and the corpus from the IO helper (`CTX_ROOT`, the `DOCS_WORKSPACE_ROOT` override), the usage strings are ctx forms, valueless-flag validation (a missing value refuses loudly), an unknown-option refusal, a no-such-repo refusal, an empty-corpus refusal, a no-match note on an empty projection, the help forms moved into the declarations, the free-text options exported to the engine's environment, and `--entry` through the edit engine |
| `.contexture/modules/docs/scripts/check` | authored fresh from the docs-query precedent: the help forms moved into the declarations, the zero-argument refusal, and delegation to `docs-check.awk` over the corpus the IO helper resolved, in the engine's store mode (`-v delta_source=log`) when the driver keeps a change log |
| `.contexture/modules/docs/scripts/changes` | authored fresh: the corpus half of a delta from the store's change log (the net status computed in the IO helper), refusing under the files driver |
| `.contexture/modules/docs/scripts/nudge` | authored fresh from the docs-query precedent: the help forms moved into the declarations, the zero-argument refusal, the unit form (the active task through `ctx session task list` and `ctx session resolve task#`), the backlog-file form refusing a record path, and delegation to `docs-nudge.awk` over the corpus the IO helper resolved |
| `.contexture/modules/docs/scripts/gate` | neutralized from the source gate: comment header, one workspace root variable (from the IO helper: `DOCS_WORKSPACE_ROOT`, `CTX_ROOT` fallback), the corpus mounted once through the IO helper, the product-repos directory parameterized (`DOCS_PRODUCT_REPOS_DIR`, default `projects/`), the test matrix re-authored over self-planted fixtures, an unknown-argument refusal, the help moved into the declarations, and the store mode (the git half without the workspace root's corpus paths plus `ctx docs changes`, the check's store mode, the drift deferral notice) |
| `.contexture/modules/docs/scripts/docs-io.sh` | authored fresh: the one door to the corpus (sourced by every verb, never run): the root and the resolver, the `corpus.store` requirement, the mount and the list through the configured storage driver, the corpus argument forms, the display-path rule, the store mode's delta source, change window, and code-half filter, and the write side (the argument parser, the field actions in the environment, the grammar check over a scratch copy of the corpus, the store stamped with the op and the HEAD, the multi-doc pipeline of replace and ids) |
| `.contexture/modules/docs/scripts/new`, `write`, `header`, `rule`, `pitfall`, `entry`, `section`, `replace`, `remove`, `ids` | authored fresh: the write verbs, each a thin script over the IO helper's write pipeline with its help in the declarations |
| `.contexture/modules/docs/scripts/docs-edit.awk` | authored fresh: the structural edit engine of the write verbs and of `query --entry`, driven by the grammar's `#%` schema, the request through the environment |
| `.contexture/modules/docs/scripts/docs-audit.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms); the duplicate-id check generalized to one namespace per repo over every id field (an entry head or an id line of its own) |
| `.contexture/modules/docs/scripts/docs-query.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms); the free-text options read from the environment (never `awk -v`), and the pitfalls view scoped to `@pitfalls` |
| `.contexture/modules/docs/scripts/docs-check.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms); the single-repo mapping documented, not scripted; the extension predicate one-homed in `CODE_EXT_RE` and widened to the broad code set, with the generated and test exclusions in `EXCLUDE_RE`; the spec-family exclusion anchored and the architecture/overview/workspace blanket reported (`FRESH (BLANKET)`, `ARCH-COVERED`) instead of folded into the clean verdict; the governed guide predicate (a depth-1 `docs/*.md` claimed by the corpus) with the trackedness probe and the untracked-claimant verdict for every governed file (`UNTRACKED CLAIMANT`, process-owned reconciliation, never a false `STALE`); the `delta_source` token (`log` turns the blanket and the trackedness probe off for a store's driver-fed delta) |
| `.contexture/modules/docs/scripts/docs-nudge.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms) |
| `.contexture/modules/docs/README.md` | authored fresh: the off-path module map (layout, workspace root, tests) |
| `.contexture/templates/doc.md` | corrected from the source grammar: the operational sub-shapes use the corpus's `- step:` form, the architecture detail fields use scalar blocks, the keywords optionality is stated, and the section separators are plain ASCII; the contract and responsibilities shapes show their id lines, and the machine-readable schema (section 6, the `#%` lines) restates every shape for the write verbs |
| `.contexture/rhythms/work.md` | authored as the workspace's work rhythm: the canonical 10 steps with the docs discipline at GATHER, EXECUTE, and REVIEW |
| `.contexture/rhythms/docs-authoring.md` | authored from the source authoring procedure; the steps name outcomes, the method detail lives in the template's comments |
| `.contexture/rhythms/docs-drift.md` | authored from the source drift procedure; the method lives in `@rule docs/drift` |
| `docs/workspace/conventions.md` | neutralized from the source ruleset: the docs, git, security, and typography rules kept; the authoring and drift procedure rules added; the drawer sources glob and evidence fields re-pointed at the module |
| `tests/sample/docs/...` | authored fresh: a fictional two-repo demo (a map, two unit docs, one operational doc) |
| `tests/sample/backlog.md` | authored fresh: a demo backlog used by the nudge walk |
| `tests/run.sh` | authored fresh: the plugin suite (the staging check; on fts5 the capture set run first on the files driver at the sandbox path, then the store seed, the corpus imported and the docs folder removed, the migration round trip, and the capture parity against the files driver, the corpus checks then running in a second sandbox beside that chain; the corpus checks keyed on the declared `corpus.store`: the audit, the unit-form nudge against the backlog-file form, the write verbs, the engine checks, and the delta-source cases, or every read verb's rc 2 refusal; the single-door census; the gate matrix over `tests/sample/`; and the grammar agreement check), staged from `base/` and the plugins' own copies under the workspace's `.contexture/tmp/` (made on demand), on either driver (`--driver=posix\|fts5`) |
| `tests/write-verbs.sh`, `tests/write/` | authored fresh: the write verbs' table (success bytes against the expected docs, refusals leaving the stored doc unchanged, the change-log rows and `ctx docs changes` under a store) and its fixtures |
| `tests/engine-checks.sh` | authored fresh: the audit's id namespace, the pitfalls scoping and attribution, the literal backslash search, and the draft-path refusal, through the verbs on the configured driver |
| `tests/store-cases.sh` | authored fresh: the delta-source cases keyed on the declared `corpus.changelog` (the check's two modes over planted deltas; `ctx docs changes` and the gate's halves in a git workspace of its own made from the sandbox) |
| `tests/census.sh`, `tests/census-allow.txt` | authored fresh: the single-door census of the module (two instruments, names read with quotes deleted and the file-reading commands of a shell script counted, the classified allow-list by file and exact line, remainder zero) |
| `tests/captures.sh` | authored fresh: the capture set of the read verbs (plan, run, compare) |
| `tests/grammar-agreement.awk` | authored fresh: the agreement check of the `#%` schema, the prose shapes, and the audit's lists, refusing an empty side as a pass |
