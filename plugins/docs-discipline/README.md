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
`docs/<repo>/<slug>.md` written per the docs module's grammar (a private
asset inside the module, enforced by the write verbs), and the workspace gets its own docs addressed
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
| `ctx docs query` | the retrieval CLI: index, projection, section, owner (the most specific claimant by the check's own glob rule), search, rules, pitfalls, edges; `--entry <block>/<key>` prints one entry's raw lines | `docs-query.awk` behind `docs-glob.awk` (`--entry`: `docs-edit.awk`) |
| `ctx docs audit` | the grammar and integrity audit: header, blocks, indentation, rule fields, the pitfall required fields and class/severity enums, symbol-only evidence, duplicate ids | `docs-audit.awk` |
| `ctx docs check` | the change check: coverage, freshness, and dead sources over a status-prefixed delta | `docs-check.awk` behind `docs-glob.awk` |
| `ctx docs gate` | the close gate: audit then check over the aggregated working-tree delta (a committed range with `--since=<rev>`, or the incoming remote delta with `--drift`), plus a self-planted eight-scenario matrix | self-contained |
| `ctx docs nudge` | the task nudge: matched docs, top pitfalls, forced setup targets | `docs-nudge.awk` |
| `ctx docs changes` | the corpus half of a delta under a store driver: one net status line per doc written since the current git HEAD (`--since=<rev>` widens the window); refuses under the files driver, where git carries a tracked corpus and nothing carries an untracked one | none (the IO helper) |
| `ctx docs new` | a doc holding only its header (first extraction, block by block) | `docs-edit.awk` |
| `ctx docs write` | a whole doc from stdin (first extraction, or `--replace` for a deliberate rewrite) | `docs-edit.awk` (the checks) |
| `ctx docs header` | header fields without a read: `--add-source`, `--remove-source` (the UNCOVERED and DEAD SOURCE fixes), keywords, children, description, role, upstream, parent | `docs-edit.awk` |
| `ctx docs rule` | a `@rule` block by `<category>/<rule-slug>`: add, change fields, remove | `docs-edit.awk` |
| `ctx docs pitfall` | a `@pitfalls` entry by its repo-unique id: add (id assigned), change, retire | `docs-edit.awk` |
| `ctx docs entry` | one entry of any list block by its key (an id, a first field's value, `<from>><to>`, `<direction>:<key>`, or `#<N>`): add with `--after` or `--first`, change fields (a component's kind through `--kind`), remove | `docs-edit.awk` |
| `ctx docs section` | a whole block from stdin: replace, create, or remove (rare) | `docs-edit.awk` |
| `ctx docs replace` | counted exact replacement over a doc, a repo, or the corpus (sync sweeps; the total must equal `--count`) | `docs-edit.awk` |
| `ctx docs remove` | a whole doc out of the corpus (`--dry-run` prints the doc it would delete and writes nothing) | none (the IO helper) |
| `ctx docs ids` | the one-time migration: keyless contract rules and responsibilities gain `<slug>-r-<token>` and `<slug>-o-<token>` ids | `docs-edit.awk` |

The help surface is engine-owned: `ctx docs help` lists the sixteen verbs and
`ctx docs help <verb>` prints that verb's usage and detail lines. A sole
`help` argument to a verb refuses with a pointer to the ctx form.

What lands where:

| piece | what it is | lands as |
|---|---|---|
| `.contexture/extensions/modules/docs/` | the standard module folder: the manifest, the laws, the data declaration, the install and uninstall part hooks, the sixteen verbs and their private engines, and the corpus grammar as the private asset `scripts/doc.grammar` (eight kinds, the block shapes, the block scalar rules, and at its foot the machine-readable schema, section 6, the `#%` lines) | install (module part) |
| `docs/workspace/conventions.md` | the ruleset: docs discipline, git, security, typography | seed (ctx docs write) |
| `AGENTS.workspace.md` | retired: no root overlay fragment ships; the laws, layout, boot, and close live in the module's laws file | retired |
| `.contexture/extensions/rhythms/docs-authoring.md`, `.contexture/extensions/rhythms/docs-drift.md` | the two procedure rhythms | install (rhythms part) |
| `docs/work.md` | the docs-shaped work rhythm: the canonical 10 steps with the docs discipline at GATHER, EXECUTE, and REVIEW | reference (copy it into the workspace's own `.contexture/rhythms/` to own it; the starter-rhythms plugin owns the installed generic `work`) |
| `tests/sample/` | the fictional two-repo demo corpus plus a demo backlog | reference (never copied) |
| `tests/` | the plugin's vitest project `docs-discipline`: the engines and helpers alone (`unit/`), the census, the grammar agreement, the flag collision check, the glob rule's one home, and the package shape (`static/`), the verbs end to end on posix (`integration/`), the read refusal on a driver without a store (`fault/`), and the store mode on fts5 (`store/`) | reference (never copied) |
| `tests/write/` | the edit engine's seeds, payloads, and goldens: every write verb's result byte for byte | reference (never copied) |
| `tests/census.awk`, `tests/census-allow.txt` | the single-door census of the module and its classified allow-list | reference (never copied) |
| `tests/grammar-agreement.awk` | the grammar agreement check the static tests run: the `#%` schema, the prose shapes, and the audit's kind and block lists agree | reference (never copied) |
| `tests/flag-collision.awk` | the flag collision check the static tests run: every grammar field named like a value control stays settable through each field verb that does not take that control | reference (never copied) |
| `README.md` | this onboarding document | reference |

The write verbs' edit engine is portable across BWK awk, mawk, gawk, and busybox awk: a splice
point with no text already emits no separating blank line (mawk keeps a split leading empty
field where BWK drops it), so a header, rule, entry, section, or ids write stores the same
bytes on every awk; the edit engine's tests run on the host's awk (no container matrix
runs; the governance awk census guards the known trap statically). The
audit's block scalar body is the opening field's indent plus two, so a sibling field or an id
line after a block scalar is still audited under every awk; a blanket four-space body test
would swallow it after a nested block scalar.

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
  broad default set of code, markup, style, shell, awk, SQL, and IDL
  extensions (the list lives in `CODE_EXT_RE` in the check's engine,
  `.contexture/extensions/modules/docs/scripts/docs-check.awk`) and every
  extensionless script whose first line is a shebang (`#!`), skipping test
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
- the copy list (the module, its grammar riding inside it), the merge list (the
  gitignore lines), and the seed list (the
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

1. Install the package into the extension root, on the human's go at the act:

   ```sh
   sh plugins/docs-discipline/install
   ```

   The installer overlays `.contexture/extensions/modules/docs` (the grammar
   rides inside the module as `scripts/doc.grammar`) and the two procedure
   rhythms under `.contexture/extensions/rhythms/`; it records every installed
   path and runs the module's install hook, which seeds the workspace
   conventions through `ctx docs write` once and never overwrites a present
   doc. The docs-shaped work rhythm stays reference material at `docs/work.md`.
   The verbs run through the workspace's `ctx` (the base runtime ships at `.contexture/ctx`).
   The module resolves the workspace root from the engine's `CTX_ROOT`
   (override with `DOCS_WORKSPACE_ROOT`), so an adopted copy always reads the
   workspace it is invoked in.

2. The docs-shaped work rhythm is optional: copy `docs/work.md` into the
   workspace's own `.contexture/rhythms/` to own and edit it, and make it the
   standing default by adding one overlay block, `@append @rhythms` with
   `default: work`. The install lands only the two procedure rhythms under
   `.contexture/extensions/rhythms/`; the starter-rhythms plugin owns the
   installed generic `work`, so the two packages never collide.

3. Nothing merges into the workspace overlay: the docs laws and the layout,
   boot, and close clauses ride the module's `laws` file, and the compose
   composes them into the generated law layer. Merge the gitignore lines below
   into `.gitignore` where the tree denies by default. Skip any line the
   workspace already allows (the contexture base normally allows AGENTS.md and
   AGENTS.workspace.md).

   The corpus lines apply under the files driver, whose corpus is the files
   under `docs/`; a corpus kept in a store driver needs none (the storage-fts5
   README names the git steps for moving a tracked corpus into its store).

   ```gitignore
   # the plugin drawer: the module (its grammar rides inside it)
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
   per the module's grammar), then one unit doc per repository, then the
   operational doc for the repository whose setup targets the nudge should
   force. Under the files driver each write lands as `docs/<repo>/<slug>.md`.

5. Keep `tests/sample/` and this README as references: the sample is
   fictional and never part of the adopted corpus; `tests/` holds the
   plugin's own vitest project (the engines, the write verbs, the read verbs,
   the gate matrix over the sample, the census, the grammar agreement check,
   and the store mode cases on fts5), lives with the plugin, and is never
   copied.

## Verify

From an adopted workspace root (seed at least one doc first; the verbs read
the corpus through the configured storage driver, and the files driver serves
`docs/<repo>/<slug>.md` in place):

```sh
ctx docs audit                         # silence, exit 0 (the whole corpus; ctx docs audit <repo> for one repo)
ctx docs query --index                 # ends: index complete: N entries
printf 'M\tprojects/<repo>/src/example.ts\n' | ctx docs check <repo>   # substitute repo and path; red (UNCOVERED) until a doc claims it
ctx docs gate                          # in a git workspace: audit plus the aggregated delta check
ctx docs gate --since=<rev>            # in a git workspace: audit plus the committed range from <rev> to the working tree
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
  prints the changed lines without storing, on every write verb `ctx docs
  remove` included (it prints the doc it would delete, whole).
- Authoring: the `docs-authoring` rhythm: the 11-step progression (sync,
  map, backlog, draft, interrogate, audit, coverage, reconcile, project,
  trace and accumulate, refresh); the method detail lives in the grammar's
  comments, and each draft lands through `ctx docs write` (a whole first
  extraction) or `ctx docs new` and the block verbs.
- Drift: the `docs-drift` rhythm: sync the checkout to the current base first
  (fetch; a branch comes up to date with main), declare the affected units as
  `@task` entries in `backlog.md`, pipe the status-prefixed code delta from git
  with the corpus half (the corpus paths of the same git delta under the files
  driver with a tracked corpus, the flow's own list of updated docs with an
  untracked one, `ctx docs changes` under a store) through the check, update each
  affected doc through the write verbs in the same change, re-verify with
  `ctx docs gate`.
- Close: `ctx docs gate` must pass cleanly. The gate verifies change, never
  truth. A default run also warns on stderr when a scanned repository is on a
  non-main branch or behind its last-fetched origin; `ctx docs gate --drift`
  evaluates the incoming remote delta (the merge-base form) instead of the
  local one. A default run on a clean tree checks an empty delta and says so
  in a `[GATE NOTICE]` on stderr; close a committed range (a unit's, or a
  release's since the previous tag) with `ctx docs gate --since=<rev>`.
- Setup tasks: run `ctx docs nudge <unit>` when the unit's active task names
  setup verbs; it reads the first IN_PROGRESS task through `ctx unit` (the
  record's own store, never the backlog as a file) and prints the owning
  operational doc's run, build, and test targets plus the top pitfalls.

## Limits and status

- Harness-free by design: nothing fires automatically. The close gate and the
  nudge are invoked at their moments (boot, close, a setup task), or wired
  into the adopter's own trigger surface. This plugin ships no trigger.
- The five read verbs ride the private engines under
  `.contexture/extensions/modules/docs/scripts/`: audit, check, and nudge hand their
  engine the logical paths the IO helper materialized from the store, query
  drives its engine with parsed options over the helper's paths, and gate is
  self-contained over the audit and check engines. The engines' shebang names
  `/usr/bin/awk` (the same launcher form the base scripts use). A system whose
  awk lives elsewhere invokes the engines via `awk -f <path>` instead. The
  check and query engines share the header-source glob rule in
  `docs-glob.awk`, so their verbs run them as `awk -f docs-glob.awk -f
  <engine>` on the awk the PATH names, and neither runs alone.
- The owner lookup (`ctx docs query [<repo>] --file <path>`) claims by the
  check's own rule: a doc claims the path (for a child repository's doc a
  `projects/<repo>/` or `<repo>/` prefix stripped when present, the path kept
  as given otherwise and always for a workspace doc, as the check reads it)
  when a header source equals it or matches it as a glob, so a path that
  merely holds a source as a substring has no owner. Among several claimants
  the answer is the doc whose best claiming source has the longest literal
  part before its first wildcard (`*` or `{`; a source without one counts its
  whole length), then the fewest wildcards, then the earlier doc in corpus
  order, still one `OWNER`, `SUMMARY`, `DOC` answer, and a miss refuses rc 1.
  Without a repo argument every repo's docs claim, and a claimant's best
  source reads with the prefix it stripped as literal text, so
  `projects/demo/src/x.ts` belongs to demo's exact `src/x.ts` over a
  workspace `projects/**`; one repo's docs strip the same prefix, so the
  one-repo form answers as before.
- The write verbs share one pipeline in the IO helper: the doc read through
  the driver, one structural edit by `docs-edit.awk` against the schema at the
  foot of the module's private grammar asset `scripts/doc.grammar` (the engine
  resolves it beside the module), the result audited over its whole repo, then
  the store.
  A refusal writes nothing: an unknown field, an enum value outside its set, a
  missing required field on a new entry, a duplicate key or id, a missing
  address, a stale replace count, an audit failure, a newline in a one-line
  field (a text field with a newline renders as a block scalar), a carriage
  return. Untouched lines stay byte for byte; a result equal to the stored doc
  writes nothing. Free text reaches the engines through the environment, never
  `awk -v`, so quotes and backslashes keep their bytes (a `--search` term too).
- Ids: contract rules and responsibilities carry theirs on the entry's second
  line, pitfalls and caveats at the entry head. A new entry's id is
  `<slug>-<letter>-<token>`: the letter `r` for a contract rule, `o` a
  responsibility, `p` a pitfall, `c` a caveat, and the token five random
  lowercase letters or digits (`docs-module-r-k3x9m`), drawn again while the
  doc already holds the id. Nothing remembers a removed id and nothing counts
  up, so a removed id is not handed out again: a later draw meets it only by
  a one in 36^5 chance, where the numbered scheme handed the highest number
  out again after its removal. Every numbered id (`<slug>-r<N>`,
  `<slug>-o<N>`, `<slug>-p<N>`, `<slug>-c<N>`) stays valid as written, and
  `--id` names an id in either form. Each verb call draws its own seed from
  `/dev/urandom` (the process id and the clock where it cannot be read);
  `DOCS_ID_SEED=<whole number>` fixes it, so a test gets the same ids on every
  run and every awk. `ctx docs ids` keys a legacy corpus once; a keyless
  legacy entry stays legitimate and is addressed by `#<N>`. The audit keeps
  one id namespace per repo across every id field.
- The corpus reaches the verbs only through the storage driver, by one door
  (`scripts/docs-io.sh`): a bare `ctx docs audit` reads the whole corpus, a
  repo name reads that repo's docs, and a doc path names a doc by its
  logical address `docs/<repo>/<slug>.md`; the verb reads the stored doc,
  never a file at the caller's spelling, so a draft path cannot stand in for
  the corpus doc (check a draft with `ctx docs write <repo> <slug>
  [--replace] --dry-run`). `ctx docs check` and `ctx docs nudge` refuse a bare
  invocation loudly instead of reading standard input as an empty corpus, an
  argument naming no doc or repo refuses rc 1, a query form that matches
  nothing refuses rc 1 (a search term, a rule category, a pitfall severity, an
  edge channel, a section, an owner path), and an empty corpus refuses rc 1.
  A wrong invocation never returns a plausible-but-empty result.
- The glob forms (`docs/*/*.md`, `docs/<repo>/*.md`) are address patterns: sh
  and bash hand the verb a pattern no file matches, which it expands through
  the store's list, while zsh refuses an unmatched glob before the verb runs;
  name repos there or quote the pattern. Every doc path a verb prints is the
  logical address `docs/<repo>/<slug>.md`, whatever the caller's spelling.
- A driver that serves no module store (without the capability `store`)
  makes every read verb refuse rc 2 naming the capability.
- Under a store driver that keeps a generic change log (`store.changelog`,
  the storage-fts5 plugin among them) the corpus leaves git: each doc write
  is stamped with the workspace git HEAD, and the corpus half of a delta is
  `ctx docs changes` (the docs written since the current HEAD) while the code
  half stays on git. `ctx docs gate` composes both halves by itself (the
  workspace root's `docs/<repo>/<slug>.md` files, if any linger, are dropped
  from the git half: they are not the corpus), so a commit empties both
  together, and `ctx docs gate --since=<rev>` composes them over a committed
  range (`ctx docs changes --since=<rev>` beside the root's `git diff <rev>`). The check then runs in its store mode: no blanket (a doc
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
- Every docs verb stages its scratch (the materialized corpus, the staged
  delta, the payloads) in one folder of its own inside the per-verb root the
  engine exports at dispatch (`CTX_SCRATCH_ROOT`) and removes it on exit, so a
  verb killed by SIGKILL leaves nothing the next dispatch's sweep does not
  remove; run undispatched (no root exported) it stages under the workspace
  drawer's `.contexture/tmp`, the system temp only when that drawer cannot be
  written.
- The gate's matrix is self-planted: it builds its fixtures in the verb's own
  scratch, plants a local repository inside them for the claimant
  trackedness probe, and writes nothing outside the fixture directory; the
  gate test points `TMPDIR` at an empty watch folder and proves it stays empty.
- The single-repo mapping is documented, not scripted: the check maps
  non-workspace docs through `projects/<repo>/`. A corpus whose code sits at
  the root marks its docs `repo: workspace`, or the adoption calibrates the
  mapping on the spot and records the local delta.
- The audit validates a subset: the doc header, the block vocabulary, the
  indentation rule, the rule fields, the pitfall required fields and
  class/severity enums, symbol-only evidence, and duplicate ids (one namespace
  per repo). Rule status and prevalence and most inner fields (the pitfall's
  summary, trigger, consequence, and evidence values among them) are not
  validated on read (the write verbs validate every field they write against
  the schema); the corpus today is complete, so the blindness is latent, not
  violated.
- The gate verifies change, never truth: passing it means the touched code
  has fresh docs, not that the corpus is correct.
- The default delta is the working tree's: on a clean tree the check gets
  nothing, prints `docs-check: 0 modified files provided on stdin.`, and the
  gate adds a `[GATE NOTICE]` on stderr; `--since=<rev>` proves a committed
  range instead (the workspace root's repository from `<rev>` to the working
  tree, rename lines as git prints them; the child repositories keep their
  working delta, which a notice names). `--since` joins the default form
  alone; an unknown revision, an empty one, or a root outside a repository
  with a commit refuses rc 1. Under the files driver git carries the corpus
  half only for a tracked corpus: an untracked one rides no delta, whether git
  ignores it (the corpus-untracked posture) or not (an adopter between seeding
  the corpus and committing it), since the root's untracked files leave the
  corpus docs out; every form there reads `UNTRACKED CLAIMANT` and a
  process-owned clean, and the `--since` notice names the limit. A doc rides
  once git tracks it (staged or committed). The notices print to stderr only;
  stdout and the exit code stay the check's.
- Paths git quotes read as their bytes: every gate git call runs with
  `core.quotePath=false`, so a non-ASCII path arrives unquoted, and the check
  and every gate form decode a path git still quotes (`"..."` with octal
  escapes, an escaped quote or backslash), so a plain `git diff --name-status`
  piped into `ctx docs check` reads as its unquoted twin. A path holding a
  control character (a tab, a newline) cannot ride a status line: it is left
  out of the delta and named in a `[GATE NOTICE]` or `[CHECK NOTICE]` on
  stderr, and a rename with such a side keeps its other side.
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
  when any claimant unit doc rides the delta, when a doc of its repository
  whose slug is `architecture` or `overview` rides it, or when any doc of the
  workspace repo rides it; the latter two are a blanket keyed on the slug and
  the repo, never the doc kind, and a riding workspace doc reaches the
  claimed files of every repository, not its own alone. The check reports
  the blanket (`FRESH (BLANKET)` plus an `ARCH-COVERED` count of the files no
  riding claimant covered) instead of folding it silently into a clean
  verdict, though the verdict line and the exit code still read as a real
  clean; coverage counts only the listed extensions (`awk` among them)
  and the extensionless scripts whose first line is a shebang; deleting a
  unit doc does not red the check. A doc rides only at its logical address,
  `docs/<repo>/<slug>.md` at the start of a delta path, so a code path that
  merely ends in that shape (a package seed, a test sample, a child
  repository's own guides under its prefix) freshens nothing. The gate stays
  scoped to the change delta, never the corpus's truth.
- Coverage is glob membership, not ownership: a path is covered when any
  header source glob matches it, so a broad glob (`plugins/**`, `tests/**`)
  covers every file under it, and the check never names the glob that
  matched. A clean verdict therefore says each touched file sits under some
  doc's sources, not that the doc which owns it describes it; read the owning
  doc of each changed path and check that its own claimant rode the delta.
  The check's output stays as it is.
- A script without an extension is governed by its first line: an
  extensionless file (a non-empty basename with no dot after its first
  character) counts when its first line starts with `#!`, read by the verb on
  the shell side under the workspace root (a readable regular file, never a
  symbolic link, its path free of a `..` segment), never by the engine, so a
  folder in the delta (a submodule, an embedded repository's `<dir>/` line)
  never fails the check. An extensionless file without a shebang stays out; a
  path the verb does not read (deleted, absent, a folder, a symbolic link,
  which git keeps as its target path) counts only when a header source lists
  it exactly; under `--drift` the first line is the working tree's copy, so an
  incoming new script reads ungoverned until it lands; the gate's matrix
  keeps the extension rule alone.
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

POSIX awk/sh, the base `ctx` runtime and its unit module (the plugin ships
the module, not the engine; the verbs reach the corpus through the storage
core's resolver, and the configured storage driver must serve the
module store: the capability `store`, which the base posix driver declares
from the release that carries the generic store; an older base makes every
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
the plugin's test, and the plugin's vitest project (`bun run
test:docs-discipline` from the repository's `tests/` folder) drives the
engines, the verbs, and the gate matrix, staged from the repository's shipped
core (`base/`) and this plugin's own copies, never an adopted drawer; the
logic runs once on posix, and the store mode cases run on fts5 (the
storage-fts5 plugin's copy configured; skipped without sqlite3 FTS5). The
project also runs the single-door census (`tests/census.awk` over
`tests/census-allow.txt`): a new corpus read or path print outside
`scripts/docs-io.sh` fails it until the allow-list names it on purpose. The
edit engine's tests hold every write against the expected docs under
`tests/write/` (a changed rendering updates its golden on purpose), and the
query and nudge engines' tests hold their answers against the committed
expected output under `tests/unit/expected/`. Keep the module's grammar (`scripts/doc.grammar`), its
machine-readable schema (section 6), and the audit in step: the project's
grammar agreement check (`tests/grammar-agreement.awk`) fails on any
difference among the three, and the flag collision check
(`tests/flag-collision.awk`) fails when a grammar field named like a value
control (`--kind`, `--id`, `--after`, and the rest) can no longer be set
through a field verb; the `tests/sample/` corpus is reference data. Packaging,
naming, and the test convention are in `docs/plugins.md`; the module shape is
`docs/modules.md`.

## Try it

Every command below runs from the plugin root, in the repository that ships
this plugin beside `base/`, and was run as written; the outputs are verbatim
from that run (long ones abbreviated with `...` where the full output repeats
the shown shape; `<scratch>` in an output line stands for the absolute path of
the scratch workspace; a nonzero exit shows as `(exit N)`). The staging builds
a scratch workspace from the shipped copies: the base runtime, the storage
core, its unit module (the record and storage driver the verbs reach the
corpus through), and this plugin's module (its grammar rides inside); it commits the corpus in a repository of its own,
since the check reads a claimant outside git as untracked (the process-owned
verdict) and never as stale. The commands then run through the staged `ctx`
(in an adopted workspace the same commands run as `ctx docs ...`). The first
part runs on the files driver, the second on the fts5 store.

```sh
scratch="../../.contexture/tmp/docs-walk"
rm -rf "$scratch"
mkdir -p "$scratch/.contexture/modules" "$scratch/.contexture/extensions/modules" "$scratch/docs/workspace"
cp ../../base/.contexture/ctx "$scratch/.contexture/ctx"
cp -R ../../base/.contexture/storage "$scratch/.contexture/"
cp -R ../../base/.contexture/modules/unit "$scratch/.contexture/modules/"
cp -R .contexture/extensions/modules/docs "$scratch/.contexture/extensions/modules/"
cp -R docs/workspace/. "$scratch/docs/workspace/"
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
  evidence: .contexture/extensions/modules/docs/scripts/docs-check.awk
  anti: Shipping a code change and deferring its doc update to a later commit; or verifying with a pipeline that feeds the check the code delta alone: it reads every claimed file stale where a claimant is tracked, and CLEAN (PROCESS-OWNED) where none is, so its verdict says nothing about the docs
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
through `ctx unit` instead):

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
glob form `docs/*/*.md` is an address pattern the verb expands through the
store's list, so quote it when the shell would expand it first):

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

Under the files driver a riding doc whose slug is `architecture` or `overview`
marks every claimed file of its repo fresh wholesale, and any riding doc of the
workspace repo does so for every repo (below, the workspace system-map freshens
a file of `demo-orders`); the slug and the repo decide, never the doc kind.
That is a blanket, not evidence: the check reports it instead of folding it
into the clean verdict, and counts the files that no riding claimant covered
(a store driver turns the blanket off).

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
itself and needs no pipeline, and for a range the workspace root's own
repository committed, `ctx docs gate --since=<rev>` does the same: the root's
`git diff --name-status <rev>` plus its untracked files, the child
repositories' working delta, and the corpus half by driver (the same git
delta for a tracked corpus, `ctx docs changes --since=<rev>` under a store).
An untracked files-driver corpus rides neither form: the check reads its
claimants untracked (`UNTRACKED CLAIMANT`, a process-owned clean), `--since`
names the limit in a notice, and the docs-drift flow's own list of the docs
it updated is the corpus half to pipe beside the code delta.

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
  ctx docs gate --since=<rev>
  ctx docs gate --drift
  ctx docs gate --stdin
  ctx docs gate --test-matrix

help:
  runs the corpus audit, then feeds the aggregated status-prefixed delta to the check; it fails when either does; the default run also warns on stderr when a scanned repository is on a non-main branch or behind its last-fetched origin
  the default delta is the working tree's (git diff, git diff --cached, the untracked files), so a clean tree hands the check nothing and a notice on stderr says so; --since=<rev> proves a committed range instead: the workspace root's repository from <rev> to the working tree (git diff <rev> plus the untracked files), the child repositories keeping their working delta (a notice names them); under the files driver git carries the corpus half only where the workspace tracks the corpus: the untracked files leave the corpus docs out, so an untracked doc never rides, ignored or not, and an untracked corpus under --since gets a notice naming the process-owned limit; --since joins the default form alone, and an unknown revision or a root outside a repository refuses rc 1
  git runs with core.quotePath=false, so a non-ASCII path arrives as its bytes; a path git still quotes is decoded (a quote, a backslash), and one holding a control character (a tab, a newline) cannot ride a status line, so it is left out and named in a notice; --stdin decodes the caller's delta the same way
  under a store driver with a change log (store.changelog) the delta has two halves: the code from git (the workspace root's docs/<repo>/<slug>.md paths dropped, since those files are not the corpus) and the corpus from the store (ctx docs changes: the docs written since the current HEAD, so a commit empties both halves together, or since <rev> under --since); the check runs in its store mode; --stdin takes the caller's delta as given, and --drift prints a deferral notice and checks the incoming code delta alone
  the notices and warnings go to stderr with a bracketed prefix; stdout and the exit code stay the check's
  exit codes: 0 the audit and the check are clean; 1 a violation or a bad argument; 2 unreadable input (an awk engine's own failure)
  example: ctx docs gate --test-matrix (ends: TEST MATRIX VERDICT: ALL 8 SCENARIOS PASSED)
```

Writing through the verbs. The one-time id migration keys the sample's
contract rules and responsibilities; an entry is then read by its key, one
field rewritten, an entry added beside a related one, and a source added to
the header without reading the doc; a value outside its enum refuses and
writes nothing. A new id is drawn at random, so the walk fixes the draw with
`DOCS_ID_SEED` and the ids below are the ones it prints:

```sh
export DOCS_ID_SEED=20261107
./.contexture/ctx docs ids
```

```text
docs ids: demo-orders/order-flow keyed 4
docs ids: demo-web/cart-ui keyed 4
docs ids: 8 entries keyed
```

```sh
./.contexture/ctx docs query demo-orders order-flow --entry contract/order-flow-r-07m9y
```

```text
  - rule: "A cart naming an unknown item id is rejected with a typed validation error"
    id: order-flow-r-07m9y
    evidence: "validateCart"
    detail ::
      Unknown ids never reach persistence; the caller receives the offending id list.
```

```sh
./.contexture/ctx docs entry demo-orders order-flow contract order-flow-r-07m9y --detail="Unknown ids never reach persistence; the caller receives the offending id list and the cart stays unchanged."
./.contexture/ctx docs entry demo-orders order-flow contract --rule="An accepted order publishes exactly one order-accepted event" --evidence=publishOrderAccepted --after=order-flow-r-t5sws
./.contexture/ctx docs header demo-orders order-flow --add-source='src/events/**'
```

```text
docs entry: demo-orders/order-flow contract/order-flow-r-07m9y updated (detail)
docs entry: demo-orders/order-flow contract/order-flow-r-kb1uj added after contract/order-flow-r-t5sws
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
    id: order-flow-r-07m9y
    evidence: "validateCart"
    detail ::
      Unknown ids never reach persistence; the caller receives the offending id list and the cart stays unchanged.
  - rule: "Prices are computed from the server-side price table, never from client totals"
    id: order-flow-r-t5sws
    evidence: "priceCart"
  - rule: "An accepted order publishes exactly one order-accepted event"
    id: order-flow-r-kb1uj
    evidence: "publishOrderAccepted"
```

The same corpus on the fts5 store (the storage-fts5 plugin beside this one;
needs sqlite3 with FTS5). No command moves a corpus between drivers: once the
driver is set, each doc goes into the store through `ctx docs write` (the
grammar check and the repo's audit on every doc, as on any write). The writes
are committed first, and after the move the files leave git in a commit of
their own, so the store's change-log rows of the move fall outside the window
`ctx docs changes` reads below:

```sh
git -c user.name=walk -c user.email=walk@example.invalid commit -qam writes
mkdir -p .contexture/extensions/storage/drivers
cp -R ../../../plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5 .contexture/extensions/storage/drivers/
printf 'storage.driver: fts5\n' > .contexture/config
for f in docs/*/*.md; do r=${f#docs/}; s=${f##*/}; ./.contexture/ctx docs write "${r%%/*}" "${s%.md}" < "$f"; done
git rm -r -q --cached docs && git -c user.name=walk -c user.email=walk@example.invalid commit -qm "the corpus moves into the store"
rm -rf docs
```

```text
docs write: demo-orders/operational written (47 lines)
docs write: demo-orders/order-flow written (56 lines)
docs write: demo-web/cart-ui written (39 lines)
docs write: workspace/conventions written (157 lines)
docs write: workspace/system-map written (45 lines)
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
./.contexture/ctx docs entry demo-orders order-flow contract order-flow-r-t5sws --detail="The price table is read once per checkout, at validation."
./.contexture/ctx docs changes
```

```text
docs entry: demo-orders/order-flow contract/order-flow-r-t5sws updated (detail)
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
| `AGENTS.workspace.md` | retired: the module's `laws` file carries the docs laws and the layout, boot, and close clauses the compose reads |
| `.contexture/extensions/modules/docs/module` | authored fresh: the module summary line |
| `.contexture/extensions/modules/docs/scripts/audit` | authored fresh from the docs-query precedent: the help text moved into the `# summary`/`# usage`/`# help` declarations and delegation to `docs-audit.awk` over the corpus the IO helper resolved (a bare call reads the whole corpus) |
| `.contexture/extensions/modules/docs/scripts/query` | reworked from the source CLI: the workspace root and the corpus from the IO helper (`CTX_ROOT`, the `DOCS_WORKSPACE_ROOT` override), the usage strings are ctx forms, valueless-flag validation (a missing value refuses loudly), an unknown-option refusal, a no-such-repo refusal, an empty-corpus refusal, a no-match note on an empty projection, the help forms moved into the declarations, the free-text options exported to the engine's environment, and `--entry` through the edit engine |
| `.contexture/extensions/modules/docs/scripts/check` | authored fresh from the docs-query precedent: the help forms moved into the declarations, the zero-argument refusal, and delegation to `docs-check.awk` over the corpus the IO helper resolved, in the engine's store mode (`-v delta_source=log`) when the driver keeps a change log; the delta staged in the scratch and read by name, the shebang list drawn from it first |
| `.contexture/extensions/modules/docs/scripts/changes` | authored fresh: the corpus half of a delta from the store's change log (the net status computed in the IO helper), refusing under the files driver |
| `.contexture/extensions/modules/docs/scripts/nudge` | authored fresh from the docs-query precedent: the help forms moved into the declarations, the zero-argument refusal, the unit form (the active task through `ctx unit task list` and `ctx unit resolve task#`), the backlog-file form refusing a record path, and delegation to `docs-nudge.awk` over the corpus the IO helper resolved |
| `.contexture/extensions/modules/docs/scripts/gate` | neutralized from the source gate: comment header, one workspace root variable (from the IO helper: `DOCS_WORKSPACE_ROOT`, `CTX_ROOT` fallback), the corpus read once through the IO helper into its scratch, the product-repos directory parameterized (`DOCS_PRODUCT_REPOS_DIR`, default `projects/`), the test matrix re-authored over self-planted fixtures, an unknown-argument refusal, the help moved into the declarations, the store mode (the git half without the workspace root's corpus paths plus `ctx docs changes`, the check's store mode, the drift deferral notice), and the `--since=<rev>` range with every form's delta staged in the IO helper's scratch and the delta notices on stderr |
| `.contexture/extensions/modules/docs/scripts/docs-io.sh` | authored fresh: the one door to the corpus (sourced by every verb, never run): the root and the resolver, the `store` requirement, the list and get materialized into the module's scratch, the logical address rule, the store mode's delta source, change window, and code-half filter, the staged delta the check reads by name with the `--since` base it shares with the gate, the governed set's shebang list read from the staged delta's extensionless paths, and the write side (the argument parser, the field actions in the environment, the grammar check over a scratch copy of the corpus, the store put stamped with the op and the HEAD, the multi-doc pipeline of replace and ids) |
| `.contexture/extensions/modules/docs/scripts/new`, `write`, `header`, `rule`, `pitfall`, `entry`, `section`, `replace`, `remove`, `ids` | authored fresh: the write verbs, each a thin script over the IO helper's write pipeline with its help in the declarations |
| `.contexture/extensions/modules/docs/scripts/docs-edit.awk` | authored fresh: the structural edit engine of the write verbs and of `query --entry`, driven by the grammar's `#%` schema, the request through the environment |
| `.contexture/extensions/modules/docs/scripts/docs-audit.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms); the duplicate-id check generalized to one namespace per repo over every id field (an entry head or an id line of its own) |
| `.contexture/extensions/modules/docs/scripts/docs-query.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms); the free-text options read from the environment (never `awk -v`), the pitfalls view scoped to `@pitfalls`, and the owner lookup claiming by the check's glob rule (the substring and raw-prefix matches gone) and answering the most specific claimant once every doc is read |
| `.contexture/extensions/modules/docs/scripts/docs-check.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms); the single-repo mapping documented, not scripted; the extension predicate one-homed in `CODE_EXT_RE` and widened to the broad code set, with the generated and test exclusions in `EXCLUDE_RE`; the spec-family exclusion anchored and the architecture/overview/workspace blanket reported (`FRESH (BLANKET)`, `ARCH-COVERED`) instead of folded into the clean verdict; the governed guide predicate (a depth-1 `docs/*.md` claimed by the corpus) with the trackedness probe and the untracked-claimant verdict for every governed file (`UNTRACKED CLAIMANT`, process-owned reconciliation, never a false `STALE`); the `delta_source` token (`log` turns the blanket and the trackedness probe off for a store's driver-fed delta); the doc touch anchored to the logical address at the start of a delta path; the governed set (`is_governed`) widened to `awk` and the shebang scripts the verb's list vouches for, a path the list cannot vouch for governed only when a header source lists it exactly |
| `.contexture/extensions/modules/docs/scripts/docs-nudge.awk` | verbatim from the source instrument except the shebang, the line-2 comment, and the usage and help lines (now ctx forms) |
| `.contexture/extensions/modules/docs/scripts/docs-glob.awk` | authored fresh: the header-source glob rule the check and the owner query share, `split_sources` and `glob_to_regex` moved out of the two engines (byte-identical copies before), plus the claim predicate and the specificity helpers; loaded ahead of either engine by a second `awk -f` |
| `.contexture/extensions/modules/docs/README.md` | authored fresh: the off-path module map (layout, workspace root, tests) |
| `.contexture/extensions/modules/docs/scripts/doc.grammar` | corrected from the source grammar: the operational sub-shapes use the corpus's `- step:` form, the architecture detail fields use scalar blocks, the keywords optionality is stated, and the section separators are plain ASCII; the contract and responsibilities shapes show their id lines, and the machine-readable schema (section 6, the `#%` lines) restates every shape for the write verbs; it is private to the module, never a shared template |
| `docs/work.md` | authored as the docs-shaped work rhythm: the canonical 10 steps with the docs discipline at GATHER, EXECUTE, and REVIEW; reference material, copied into the workspace's own `.contexture/rhythms/` to own it |
| `.contexture/extensions/rhythms/docs-authoring.md` | authored from the source authoring procedure; the steps name outcomes, the method detail lives in the grammar's comments |
| `.contexture/extensions/rhythms/docs-drift.md` | authored from the source drift procedure; the method lives in `@rule docs/drift` |
| `docs/workspace/conventions.md` | neutralized from the source ruleset: the docs, git, security, and typography rules kept; the authoring and drift procedure rules added; the drawer sources glob and evidence fields re-pointed at the module |
| `tests/sample/docs/...` | authored fresh: a fictional two-repo demo (a map, two unit docs, one operational doc) |
| `tests/sample/backlog.md` | authored fresh: a demo backlog used by the nudge walk |
| `tests/` (the vitest project) | authored fresh: the engines alone over the sample, the write goldens, and committed expected output; the verbs end to end on posix; the read refusal on a planted driver; the store mode on fts5 |
| `tests/write/` | authored fresh: the write verbs' seeds, payloads, and expected docs |
| `tests/census.awk`, `tests/census-allow.txt` | authored fresh: the single-door census of the module (two instruments, names read with quotes deleted and the file-reading commands of a shell script counted, the classified allow-list by file and exact line, remainder zero) |
| `tests/grammar-agreement.awk` | authored fresh: the agreement check of the `#%` schema, the prose shapes, and the audit's lists, refusing an empty side as a pass |
| `tests/flag-collision.awk` | authored fresh: the collision check of the grammar fields named like a value control against each field verb's controls and reach, the by-design id pairs allow-listed, refusing an empty reach or census as a pass |
