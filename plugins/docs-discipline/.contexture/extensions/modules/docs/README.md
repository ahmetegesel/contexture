# docs module: internals

The docs module ships with the docs-discipline plugin. The package install
overlays this directory at `<workspace>/.contexture/extensions/modules/docs/`;
the engine discovers its eighteen verbs. This page is the off-path maintainer
map: it is not linked from the workspace's boot, laws, or help.

## Layout

The folder is the standard module folder (`docs/modules.md`): `module` carries the summary, the version, and the description block the compose reads; `laws` carries the docs laws, its layout clauses, its boot clause, and its close clause; `data` is the storage declaration; `uninstall` is the optional part hook (it leaves the store data), and the module ships no install hook, so an install writes no corpus doc; `scripts/` holds the verbs, their private engines, and the private grammar asset `doc.grammar`; `hooks/` holds the two handler files the unit module's points run: `task-landing` nudges a task that starts, `load-end` nudges the unit's in-progress tasks; both call `ctx docs nudge` and carry no block mode; this README is off-path.

| verb | engine |
|---|---|
| `audit` | `scripts/docs-audit.awk` |
| `check` | `scripts/docs-check.awk` behind `scripts/docs-glob.awk` |
| `query` | `scripts/docs-query.awk` behind `scripts/docs-glob.awk` (`--entry`: `scripts/docs-edit.awk`); the retired `--search` form refuses naming `search` |
| `get` | `scripts/docs-entity.awk` over the one doc read through `docs-io.sh`, behind the grammar asset (the block shapes and keys) |
| `search` | `scripts/docs-entity.awk` over the materialized corpus (or one repo's docs), behind the grammar asset; the arguments parse in `docs-io.sh` (`docs_search`) |
| `nudge` | `scripts/docs-nudge.awk` |
| `gate` | self-contained; uses `scripts/docs-audit.awk`, and `scripts/docs-check.awk` behind `scripts/docs-glob.awk` |
| `changes` | none: the corpus half of a delta from the storage layer's change log, computed in `docs-io.sh` |
| `new`, `write`, `header`, `rule`, `pitfall`, `entry`, `section`, `replace`, `ids` | `scripts/docs-edit.awk` (the edit), then `scripts/docs-audit.awk` (the grammar check) |
| `remove` | none: `store.delete` through `docs-io.sh` (`--dry-run` prints the stored doc whole and writes nothing) |
| (every verb) | `scripts/docs-io.sh`, sourced: the one door to the corpus |

- The `.awk` engines, `docs-io.sh`, `doc.grammar`, and `uninstall` carry no
  `# summary:` line: discovery ignores them, they are private files,
  and they never appear in help. `doc.grammar` is the corpus grammar asset the
  write verbs and the audit enforce; it rides inside the module and is never a
  shared drawer file.
- `docs-glob.awk` is the one home of the header-source glob rule the check
  and the owner query share (`split_sources`, `glob_to_regex`,
  `source_matches`, and the specificity helpers `source_literal`,
  `source_wildcards`, `source_beats`); `check`, `gate`, and `query` load it
  ahead of their engine with a second `awk -f` (POSIX awk concatenates the
  programs), so the check engine runs on the `awk` the PATH names and neither
  engine runs alone. A source claims a path when the path equals it or
  matches it as a glob. `query --file` reads every doc and names the
  claimant whose best claiming source is the most specific: the longest
  literal part before its first wildcard (`*` or `{`; a source without one
  counts its whole length), then the fewest wildcards, then the earlier doc
  in corpus order (the store's bytewise key order); for a child repository's
  doc it strips a `projects/<repo>/` or `<repo>/` prefix when present and
  keeps the path as given otherwise, while the check skips such a doc's path
  that carries no prefix; a workspace doc reads the path as given, as the
  check does, so a root folder named `workspace` keeps its name in the path.
  Without a repo argument the claimants span repos, so the engine
  ranks each claimant's best source with the prefix it stripped prepended as
  literal text (a child repository's exact source beats a workspace glob);
  one repo's docs strip the same prefix, so a one-repo answer is unchanged.
- `gate` carries the whole close-gate logic (git aggregation, the `--since`
  range, drift warnings, the delta notices, and the self-planted
  eight-scenario matrix); the other four verbs are thin
  wrappers over their engine: audit, check, and nudge hand it the corpus paths
  `docs-io.sh` resolved from their arguments, and query drives it with parsed
  options over the helper's paths.
- `docs-io.sh` is the only file of the module that calls a store function or
  composes a doc's path (the plugin's census, `tests/census.awk` run by `tests/static/census.test.ts`, holds it there). It
  asks `driver-resolver require store`, lists the docs namespace with
  `store.list`, reads each key with `store.get` into the module's scratch at
  `docs/<repo>/<slug>.md`, and runs the engines there; no driver parses a doc
  and no mount is materialized by a driver. The store answer is flattened with
  the storage core's flattener (`scripts/json.awk`). Every view prints the logical address
  `docs/<repo>/<slug>.md`, whatever the caller's spelling and whatever the
  driver; the old display-path mapping and the draft-path refusal retire
  because the stored bytes are what a verb reads. Driver calls run from the
  workspace root with stdin from `/dev/null`. `docs_scratch` makes the verb's
  scratch once, one `docs-io.*` folder inside the per-verb root the engine
  exports at dispatch (`CTX_SCRATCH_ROOT`, as the unit verbs and the drivers
  use it), so a SIGKILLed verb's folder goes with the next dispatch's sweep of
  dead roots; an undispatched run (no root exported) stages under
  `.contexture/tmp`, the system temp only when the drawer cannot be written;
  the folder is removed on exit, a hangup, interrupt, or terminate exiting
  through that removal.
- The staged delta: `docs_delta_stage` copies a verb's status-prefixed delta
  from its stdin into the scratch (`delta`, beside the materialized corpus)
  and may close a pipeline, since the file carries the delta;
  `docs_delta_empty` tells an empty delta before the check, and the check
  engine reads the file by name (`DOCS_DELTA_ARG`, its `change_file` relative
  to the corpus scratch it runs in), never from its own stdin. `check` and
  every gate form (the default, `--since`, `--stdin`, and `--drift`) stage
  their delta this way, and the governed set's shebang list is drawn from the
  same staged file before the engine runs. `docs_since_rev`
  resolves a `--since=<rev>` base for the gate and `ctx docs changes` alike
  (rc 1 for an unknown revision or a root outside a repository with a
  commit), and `docs_corpus_untracked` counts the corpus docs the root's
  repository does not track (`git ls-files`, ignored or not) under the files
  driver.
- The quoted paths: every gate git call runs with `core.quotePath=false`, so a
  non-ASCII path arrives as its bytes. `docs_delta_decode` (under `LC_ALL=C`)
  decodes every path git still quotes (a `"..."` field: octal escapes, an
  escaped quote or backslash) before the stage: `check` and `--stdin` decode
  the caller's delta, the gate each repository's git output before its
  `projects/<repo>/` or `<repo>/` prefix lands. A field whose escapes name a
  control character (a tab, a newline, a byte below 040 or 0177) cannot ride
  a status line: it is left out (a rename keeps its other side as `A` or `D`,
  a copy its new side) and its spelling lands in the scratch list `unread`,
  which `docs_delta_unread` names in one `[GATE NOTICE]` or `[CHECK NOTICE]`
  line on stderr; a plain line passes byte for byte.
- The nudge's unit form nudges the named tasks (`--task=<slug>`, repeatable), or
  with none every IN_PROGRESS task in backlog order: each slug's block is read
  through `ctx unit task list <unit> --status=progress` and `ctx unit get
  <unit>/task/<slug>` (the text view of task show drops REFS, which the engine
  scores) into its own scratch file, and the engine runs once per task, so a
  unit with two in-progress tasks prints two blocks; a named task is nudged
  whatever its status (the force). The backlog-file form keeps its one-backlog
  first-IN_PROGRESS read, names repos alone, and refuses `--task`; it refuses a
  path inside another module's storage root (`docs_record_file`
  reads every declared root through the storage library's `store_roots`, this module's
  own `docs` namespace aside: a path spelled under a root, one physically under it, and,
  for a root inside the drawer alone, one holding `/<root>/` anywhere). It refuses rc 2
  and reads no file in two cases, each with its own line: with no storage core to list
  the roots (no `store_roots`, or its data reader not installed: `ERR_DRIVER_NOT_FOUND`),
  and when the storage core refuses: `store_roots`
  answers the whole list or refuses, so a module data file it cannot read refuses the
  list rather than leave that module's root out, and a failed or empty `store_namespace`
  refuses too, since an empty own namespace would count this module's own root as
  another module's (`ERR_STORAGE_READ`).
- The write verbs run one pipeline in `docs-io.sh`: the arguments parsed
  (`docs_parse`: the verb's control flags, every other `--<field>=` as a field
  action, a control another verb takes included, so `ctx docs entry` sets a
  component's kind with `--kind` while `ctx docs new` keeps `--kind` as the
  doc kind; a field action is carried in the environment as `EDIT_A_<n>`, `EDIT_F_<n>`,
  `EDIT_V_<n>`, a `--stdin=<field>` value kept in a scratch file the engine reads as its payload operand, so a body of any size meets no environment limit); the doc read by `store.get`; one edit by `docs-edit.awk`
  (operands `part=1 <scripts/doc.grammar> part=2 <doc> part=3 <payload>`; only
  the grammar's `#%` schema lines are read; the request through the environment,
  never `awk -v`; the whole new doc on stdout, the note or the refusal on
  stderr, rc 1 on a refusal); the result audited by `docs-audit.awk` over its
  repo in a scratch copy of the corpus made from one store pass (errors name
  `docs/<repo>/<slug>.md`); then `store.put` with `--op=<verb>` and
  `--head=<the workspace git HEAD>` (the module's own existence check covers
  what the retired create flag did). A result equal to the stored doc writes
  nothing. `replace` and
  `ids` run the edit over every doc of their scope first, check the counts
  (replace: the total must equal `--count`), audit every touched repo, then
  write one doc after another. The grammar asset resolves beside the module
   (`$DOCS_DIR/doc.grammar`), never from `CTX_ROOT`; the plugin's module copy
   carries it in the suite sandbox, so no separate staging exists.
- `docs-edit.awk` addresses what the schema names: an entry by its key (the
  id of an id-keyed block, the first field's value, `<from>><to>` for
  data_flow, `<direction>:<key>` for edges, or `#<N>`), a rule by
  `<category>/<rule-slug>`, a block by name; a new entry's id is
  `<slug>-<letter>-<token>`, the token five characters of `0-9a-z` from a
  Lehmer generator (16807 modulo 2147483647, exact in every awk's doubles, so a
  seed draws the same token on every awk, which `rand()` does not), drawn
  again while the doc or the run already holds it; the IO helper seeds each
  engine run that can mint an id (`entry`, `ids`) with `DOCS_ID_SEED` when set,
  else four bytes of `/dev/urandom`, else the process id beside the clock,
  passed as `EDIT_SEED`, which the engine reads as 0 unless it is a whole
  number, so no seed leaves the generator outside its states; a numbered id
  `<slug>-<letter><N>` stays valid and `--id` takes either form; a field an
  entry lacks lands at its schema position; a text value with a newline renders as a block scalar and
  a field written as one keeps that form; every untouched line passes byte for
  byte, and a doc without a final newline keeps it so.
- The verb scripts carry the `# summary:`/`# usage:`/`# help:` declarations;
  `ctx docs help` and `ctx docs help <verb>` render them. Help is
  engine-owned: a sole `help` argument refuses with a pointer, never prints
  help text.
- A bare `check` or `nudge` refuses loudly instead of reading standard input
  as an empty corpus; a bare `audit` reads the whole corpus through the
  driver.
- The delta source: a driver declaring `store.changelog` (a store) records
  every doc write with the workspace git HEAD, so the corpus half of a delta
  comes from the store (`ctx docs changes`: the rows stamped with the current
  HEAD, or with `--since=<rev>` every commit from `<rev>` to HEAD, the
  boundary's leading dash stripped, one net status line per doc) while the
  code half stays on git. `check` and `gate` pick the mode by `driver-resolver
  has store.changelog`, never by the driver's name, and run the check engine
  with `-v delta_source=log`: the blanket is off (a doc refreshes only the code
  its own sources name) and the trackedness probe is off (every claimant can
  ride the delta, so `UNTRACKED CLAIMANT` never fires). Under the files driver
  the engine runs as before (`delta_source` unset is git). The gate's store
  mode drops the workspace root's `docs/<repo>/<slug>.md` paths from the git
  half (those files are not the corpus) and appends `ctx docs changes`, so a
  commit empties both halves together; a HEAD move that is not a commit (a
  checkout, a reset) leaves the old rows outside the window, recovered by
  `ctx docs changes --since=<the previous HEAD>` piped with the git delta into
  the check (or by `ctx docs gate --since=<the previous HEAD>`); `--drift`
  prints a deferral notice (drift over a shared storage layer is undesigned) and
  checks the incoming code delta alone.
- The gate's delta: the default form reads the working tree (the workspace
  root's `git diff`, `git diff --cached`, and untracked files, plus each child
  repository's), so a clean tree hands the check an empty delta and proves
  the audit half alone; the gate then prints `[GATE NOTICE] the delta is
  empty (a clean tree)` on stderr. `--since=<rev>` (the default form only)
  proves a committed range: the root's half becomes `git diff --name-status
  <rev>` (from `<rev>` to the working tree, rename lines as git prints them)
  plus the untracked files, the child repositories keep their working delta
  (a notice names them), and under a store the corpus half is `ctx docs
  changes --since=<rev>`. Under the files driver git carries the corpus half
  only where the workspace tracks the corpus; an untracked corpus rides no
  delta, whether git ignores it (the corpus-untracked law's posture) or not,
  since `docs_untracked_half` leaves the corpus docs (`docs/<repo>/<slug>.md`)
  out of the root's untracked files; every governed file's claimants then read
  untracked and the check reports `UNTRACKED CLAIMANT` with a process-owned
  clean, and under `--since` a notice names that limit (the corpus docs `git
  ls-files` does not list). An empty range prints its own notice. The notices
  go to stderr; stdout and the exit code stay the check's.
- The governed set: the check governs the code extensions of `CODE_EXT_RE`
  (`awk` among them) and every extensionless file (a non-empty basename with
  no dot after its first character) whose first line starts with `#!`, plus a
  depth-1 `docs/*.md` a doc claims; `EXCLUDE_RE` applies first, and an
  extensionless file without a shebang stays out. The first line is read on
  the shell side: `docs_delta_shebangs` walks the staged delta (both sides of
  a rename), reads each extensionless path that is a readable regular file
  under the workspace root (`[ -f ]` and never a symbolic link, which git keeps
  as its target path and whose target may lie outside the root; the first line
  by `IFS= read -r`; a path with a `..` segment is skipped), and writes the
  scratch list `shebangs` (one `shebang` or `plain` line per path) that the
  engine reads by name from `DOCS_SHEBANG_LIST`, so no engine line opens a code
  path and a folder in the delta never fails the engine. A path the list
  cannot vouch for (deleted, absent, a folder such as a submodule, an embedded
  repository's `<dir>/` line, a symbolic link) counts only when a claiming doc
  lists it exactly. `check` and every
  gate form draw the list from the delta they staged; under `--drift` the
  first line is the working tree's copy, so an incoming new script reads
  ungoverned until it lands; the gate's `--test-matrix` keeps the extension
  rule alone.
- The dead sources: a deleted file a header source lists exactly, and a glob
  source that claimed a deleted path (by the glob rule, never by equality,
  even when the same doc lists the path exactly) and no longer matches any
  file. `process_doc_sources` keeps testing every source of a deleted path and
  records each such glob once per doc (`claim_glob`); `judge_globs` reads the
  scratch list `universe` by name from `DOCS_UNIVERSE_LIST` (one `listed` or
  `unlisted` line per repository, `.` the workspace root, and one `path` line
  per path), beside the shebang list, so no engine line lists a tree. The
  verb draws it (`docs_delta_universe`, called beside `docs_delta_shebangs` by
  `check` and every gate form) only when the staged delta holds a `D` or `R`
  line, and always sets the variable, empty when nothing is drawn, so an
  inherited value never reaches the engine; an absent or empty list skips
  the test, which keeps the engine tests and the gate's matrix as they were.
  Each repository's listing (`docs_universe_repo`: the root, then the
  children `docs_children` lists, the same discovery the gate's three loops
  read) is `git ls-files -co --exclude-standard` minus `git ls-files -d`, both
  with `core.quotePath=false` and decoded by `docs_delta_decode`, relative to
  the repository and under its prefix, a nested repository's or worktree's
  `<dir>/` line dropped; a repository git lists nothing for reads `unlisted`.
  The delta's deleted and renamed-away paths leave the list and its added and
  renamed-to paths join it, so the universe is always the working tree. A
  child repository's doc reads the paths under its `projects/<repo>/` or
  `<repo>/` prefix, stripped; a workspace doc reads every path. A candidate's
  repository is the child its deleted path lies in (a child's doc) or the
  child its glob's literal head lies in (a workspace doc), else the root; an
  unlisted one is named on stderr under `DOCS_UNIVERSE_LABEL` (`[CHECK
  NOTICE]` or `[GATE NOTICE]`), a listed one with no surviving match prints
  one `DEAD SOURCE` line per doc and glob and counts once. The prefilter
  `source_prefix` (in `docs-glob.awk`) never rejects a path the glob rule
  accepts. `--drift` sets `GATE_DRIFT` and skips the test with a notice.
- The doc touch: a corpus doc rides a delta only at its logical address,
  `docs/<repo>/<slug>.md` at the start of a delta path (the workspace root's
  corpus under the files driver, the `ctx docs changes` lines under a store).
  A path that merely ends in that shape (a test sample, a child repository's
  own guides under its `projects/<repo>/` or `<repo>/` prefix) is code to the check, never a doc touch: it freshens no
  claimant and triggers no blanket.
- What a clean verdict cannot see: coverage is glob membership over the
  header sources, so a broad glob (`plugins/**`, `tests/**`) covers every path
  under it and the check never names the glob that matched; and under the
  files driver a riding doc whose slug is `architecture` or `overview`
  freshens every claimed file of its repo, and any riding doc of the
  workspace repo freshens every claimed file of every repo; the slug and the
  repo decide, never the doc kind. Both print `FRESH (BLANKET)` and an
  `ARCH-COVERED` count in the body, while the verdict line and the exit code
  read as a real clean. The check's output stays as it is; a reader who needs
  ownership reads the owning doc of each changed path and checks that its own
  claimant rode the delta.

## Workspace root

The instruments resolve the workspace root in this order:

1. `DOCS_WORKSPACE_ROOT` (explicit override);
2. `CTX_ROOT` (exported by the engine at dispatch);
3. standalone: walk up from the script to the `.contexture` drawer's parent.

`docs-io.sh` resolves it once for every verb and hands the same root to the
storage driver (as its cwd and `CTX_ROOT`), so the corpus the driver serves
and the root the verb reports agree. The storage core's resolver and library
and its JSON decoder resolve from that same `CTX_ROOT` (the
core drawer or the base mirror), never by a relative climb from the module
folder, so the docs module works under the modules root and the extension root
alike; the grammar asset is the one path resolved beside the module. The gate's git
aggregation reads from that root; the corpus reads go through the driver
(under the files driver the corpus is `<root>/docs/<repo>/<slug>.md`).
`DOCS_PRODUCT_REPOS_DIR` (default `projects/`) selects the multi-repo product
directory, read by `docs_children` for the gate's scans and the check's dead
glob universe alike.

## Grammar and sample

- The corpus grammar: `scripts/doc.grammar`, a private asset inside the module;
  the write verbs and the audit enforce it, and no agent-facing surface points
  at a shared template. The suite stages the module whole, carrying the asset.
- The docs discipline's own rules ride the module's `laws` (the output rules)
  and the two rhythms (the authoring and drift procedures); the module seeds
  no conventions doc, and a workspace that keeps rules of its own writes them
  through `ctx docs new` and `ctx docs rule`.
- The plugin's `tests/sample/` corpus is reference data only: five fictional
  docs (a workspace conventions doc among them, which the rule cases read)
  plus a demo backlog used by the nudge walk and the tests. It is never copied
  into a workspace.

## Tests

The plugin's tests are the vitest project `docs-discipline` in
`plugins/docs-discipline/tests/`, run from the repository's `tests/` folder
(`bun run test:docs-discipline`; `tests/README.md` there describes the
harness). Every test stages a sandbox under the workspace's `.contexture/tmp/`
from the shipped copies alone: the runtime, the unit and lane modules, and the
storage core from `base/`, this module (its grammar asset riding inside it)
from the plugin, and on fts5 the storage-fts5 plugin's driver copy with
`storage.driver: fts5`; the engines run under the system awk. The logic runs
once, on posix. `unit/` drives each engine alone over files: `docs-edit.awk`
against the `tests/write/` goldens (every success byte for byte, every
refusal) and the opaque ids under a fixed seed (the draw, the draw again past
an id the doc holds, a seed that is not a whole number drawing as 0, `--id`
in either form and the shapes it refuses, an opaque key, `ids` keeping every id present), `docs-audit.awk` (an opaque
id's duplicate across the repo among its cases), `docs-query.awk` and
`docs-nudge.awk` against
committed expected output under `unit/expected/` (regenerated with
`DOCS_WRITE_EXPECTED=1` and read by hand), the owner rule of `query --file`
over the `tests/fixtures/owner` corpus (an exact later source over a broad
earlier glob, a narrower later glob, the fewer wildcards, the corpus-order
tie, a repo prefix, a substring that claims nothing, and without a repo
argument a child repository's exact source over a workspace glob and a
workspace doc's exact child path over the child's glob, and a workspace doc
reading a `workspace/` path as given, as the check reads it UNCOVERED),
`docs-check.awk` over the gate
matrix's eight scenarios, the twelve capture deltas, both delta sources,
the doc touch at the logical address alone, and the governed set over a
planted shebang list (the shebang script, the `.awk` engine, the plain file,
the exclusions first, a claimed script's `STALE DOC`, a deleted path listed
exactly, after a broader glob of the same doc too, the folder and `<dir>/`
lines), and the dead glob test over a planted universe list (one line per doc
and glob with its count, the glob beside the exact line of the same doc, a
listed survivor, an unrelated glob never tested, an absent or empty list
skipped, the prefilter's optional character, a child doc's stripped prefix,
a workspace doc's union, and the unlisted root and child named in the
notice),
and the pure helpers of `docs-io.sh` (`docs_children` over the product folder,
the flat form, `DOCS_PRODUCT_REPOS_DIR`, and the gate reading it in its three
loops). `static/` runs the single-door census
(`tests/census.awk` over `tests/census-allow.txt`, with three planted
bypasses), the grammar agreement check (`tests/grammar-agreement.awk`, with
two plants), the flag collision check (`tests/flag-collision.awk`: every
grammar field named like a value control stays settable through each field
verb that does not take that control, the by-design id pairs of `entry` and
`pitfall` allowed, with four plants), the one home of the glob rule (only
`docs-glob.awk` defines its functions), and the package shape. `integration/` drives the verbs end to
end: one success per write verb with its stored bytes, the opaque ids
(`DOCS_ID_SEED` and its draw again, a removed highest id never handed out
again, two unseeded adds drawing apart, either form named by `--id`,
addressed, and refused a second time), `remove --dry-run`
printing the doc and writing nothing, the write pipeline's
refusals leaving the stored doc unchanged, a dispatched verb SIGKILLed while
it holds its scratch leaving nothing after the next dispatch, the read verbs
and their misses,
the check verb's shebang read under the workspace root from a working folder
elsewhere, the check verb over a plain quoted git delta (a non-ASCII path, a
quote and a backslash, the control-character notice with a rename's readable
side), the unit-form nudge against the backlog-file form, the nudge's named
tasks and in-progress default (the force, the empty default, an unknown task's
refusal), the handler files on the unit's points (a task add prints no nudge, a
start one, complete, reopen, and drop none, a load's last page the in-progress
tasks, and a failing nudge warns without blocking), the part hooks,
and the gate (the matrix with an empty `TMPDIR` watch, the git mode in a
workspace with its own repository, a shebang script in the default delta,
the clean-tree notice, the drift warnings, `--drift`
over a bare remote, the quoted paths in every form (a non-ASCII path at the
root and in a child repository, a quote and a backslash path beside a tab
path's notice, a quoted `--stdin` delta, an incoming non-ASCII path under
`--drift`), an unignored untracked corpus in the working delta, and `--since`
over a committed range: STALE for a code-only commit, FRESH with the doc in
the commit, a rename's dead source and uncovered new path, an ignored
corpus's untracked claimant with its notice, an unignored untracked corpus
read the same way, a committed non-ASCII change's STALE, an empty range, a
child repository's working delta with its notice, and the refusals), and the
dead glob test end to end in git sandboxes (`integration/dead-globs`: the
check verb's verdict and its survivors, tracked, untracked, added, and
renamed to, never an ignored file or a deletion still in the index, quoted
survivors, an inherited list never reaching the engine, a parent workspace
whose root is no work tree with a listed child and a broken one, a custom
product folder the check and the gate share, a nested repository's `<dir>/`
line, and the gate's default, `--since`, `--stdin`, notice, and `--drift`
skip). `fault/` configures a planted driver that declares no store, so
every read verb refuses rc 2 naming the capability. `store/` keeps the cases
where the fts5 driver adds value: the corpus written through `ctx docs write`
with the docs folder removed and read back unchanged through `ctx docs write
--replace --dry-run`, one change-log row with its op and the workspace HEAD
per write, the `ctx docs changes` window, the gate's store mode (with
`--since` reading FRESH or STALE over a commit the plain gate reads empty), and a parity
smoke of the read verbs against the engines' expected output; it skips when
sqlite3 lacks FTS5. Needs: POSIX awk and sh, `base/` beside `plugins/`, git,
and for `store/` sqlite3 with FTS5.

## The gate's matrix

`ctx docs gate --test-matrix` builds its fixtures in the verb's own scratch
(`docs_scratch`: inside the per-verb root when dispatched, removed on exit),
plants a local repository inside them for the claimant trackedness probe,
writes nothing outside them, and exercises the check over eight self-planted
scenarios; the suite points `TMPDIR` at an empty watch folder and proves it
stays empty. The default gate run aggregates the live git delta (workspace root
plus every child repository), with the store's corpus half under a store
driver; `--since=<rev>` aggregates the root's committed range from `<rev>` to
the working tree instead; `--drift` evaluates the incoming remote delta; `--stdin` takes a piped
name-status list. The matrix runs the engine in its git mode on every driver
(its fixture is files by construction).
