# docs module: internals

The docs module ships with the docs-discipline plugin. The package install
overlays this directory at `<workspace>/.contexture/extensions/modules/docs/`;
the engine discovers its sixteen verbs. This page is the off-path maintainer
map: it is not linked from the workspace's boot, laws, or help.

## Layout

The folder is the standard module folder (`docs/modules.md`): `module` carries the summary, the version, and the description block the compose reads; `laws` carries the docs laws, its layout clauses, its boot clause, and its close clause; `data` is the store declaration; `install` and `uninstall` are the optional part hooks (install seeds the corpus conventions through `ctx docs write` once, and uninstall leaves the store data); `scripts/` holds the verbs, their private engines, and the private grammar asset `doc.grammar`; this README is off-path.

| verb | engine |
|---|---|
| `audit` | `scripts/docs-audit.awk` |
| `check` | `scripts/docs-check.awk` behind `scripts/docs-glob.awk` |
| `query` | `scripts/docs-query.awk` behind `scripts/docs-glob.awk` (`--entry`: `scripts/docs-edit.awk`) |
| `nudge` | `scripts/docs-nudge.awk` |
| `gate` | self-contained; uses `scripts/docs-audit.awk`, and `scripts/docs-check.awk` behind `scripts/docs-glob.awk` |
| `changes` | none: the corpus half of a delta from the store's change log, computed in `docs-io.sh` |
| `new`, `write`, `header`, `rule`, `pitfall`, `entry`, `section`, `replace`, `ids` | `scripts/docs-edit.awk` (the edit), then `scripts/docs-audit.awk` (the grammar check) |
| `remove` | none: `store.delete` through `docs-io.sh` |
| (every verb) | `scripts/docs-io.sh`, sourced: the one door to the corpus |

- The `.awk` engines, `docs-io.sh`, `doc.grammar`, `install`, and `uninstall`
  carry no `# summary:` line: discovery ignores them, they are private files,
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
  in corpus order (the store's bytewise key order); it strips a
  `projects/<repo>/` or `<repo>/` prefix when present and keeps the path as
  given otherwise, while the check skips a repo doc's path that carries no
  prefix.
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
  the unit module's `lib/json.awk`. Every view prints the logical address
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
- The nudge's unit form reads the active task through `ctx unit task list
  <unit> --status=progress` and `ctx unit resolve <unit> task#<slug>` (the
  text view of task show drops REFS, which the engine scores); the
  backlog-file form refuses a path inside the sessions drawer.
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
  `<category>/<rule-slug>`, a block by name; a new entry's id is the doc's
  highest number of that kind plus one; a field an entry lacks lands at its
  schema position; a text value with a newline renders as a block scalar and
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
  prints a deferral notice (drift over a shared store is undesigned) and
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
- The doc touch: a corpus doc rides a delta only at its logical address,
  `docs/<repo>/<slug>.md` at the start of a delta path (the workspace root's
  corpus under the files driver, the `ctx docs changes` lines under a store).
  A path that merely ends in that shape (a package's conventions seed, a test
  sample, a child repository's own guides under its `projects/<repo>/` or
  `<repo>/` prefix) is code to the check, never a doc touch: it freshens no
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
and the unit module's JSON decoder resolve from that same `CTX_ROOT` (the
core drawer or the base mirror), never by a relative climb from the module
folder, so the docs module works under the modules root and the extension root
alike; the grammar asset is the one path resolved beside the module. The gate's git
aggregation reads from that root; the corpus reads go through the driver
(under the files driver the corpus is `<root>/docs/<repo>/<slug>.md`).
`DOCS_PRODUCT_REPOS_DIR` (default `projects/`) selects the multi-repo product
directory.

## Grammar and sample

- The corpus grammar: `scripts/doc.grammar`, a private asset inside the module;
  the write verbs and the audit enforce it, and no agent-facing surface points
  at a shared template. The suite stages the module whole, carrying the asset.
- The seed conventions: the plugin's `docs/workspace/conventions.md`, written
  into the corpus by adoption through `ctx docs write workspace conventions`
  (under the files driver the doc lands at that same path).
- The plugin's `tests/sample/` corpus is reference data only: five fictional
  docs plus a demo backlog used by the nudge walk and the tests. It is never
  copied into a workspace.

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
refusal), `docs-audit.awk`, `docs-query.awk` and `docs-nudge.awk` against
committed expected output under `unit/expected/` (regenerated with
`DOCS_WRITE_EXPECTED=1` and read by hand), the owner rule of `query --file`
over the `tests/fixtures/owner` corpus (an exact later source over a broad
earlier glob, a narrower later glob, the fewer wildcards, the corpus-order
tie, a repo prefix, a substring that claims nothing), `docs-check.awk` over the gate
matrix's eight scenarios, the twelve capture deltas, both delta sources,
the doc touch at the logical address alone, and the governed set over a
planted shebang list (the shebang script, the `.awk` engine, the plain file,
the exclusions first, a claimed script's `STALE DOC`, a deleted path listed
exactly, after a broader glob of the same doc too, the folder and `<dir>/`
lines),
and the pure helpers of `docs-io.sh`. `static/` runs the single-door census
(`tests/census.awk` over `tests/census-allow.txt`, with three planted
bypasses), the grammar agreement check (`tests/grammar-agreement.awk`, with
two plants), the flag collision check (`tests/flag-collision.awk`: every
grammar field named like a value control stays settable through each field
verb that does not take that control, the by-design id pairs of `entry` and
`pitfall` allowed, with four plants), the one home of the glob rule (only
`docs-glob.awk` defines its functions), and the package shape. `integration/` drives the verbs end to
end: one success per write verb with its stored bytes, the write pipeline's
refusals leaving the stored doc unchanged, a dispatched verb SIGKILLed while
it holds its scratch leaving nothing after the next dispatch, the read verbs
and their misses,
the check verb's shebang read under the workspace root from a working folder
elsewhere, the check verb over a plain quoted git delta (a non-ASCII path, a
quote and a backslash, the control-character notice with a rename's readable
side), the unit-form nudge against the backlog-file form, the part hooks,
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
child repository's working delta with its notice, and the refusals). `fault/` configures a planted driver that declares no store, so
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
