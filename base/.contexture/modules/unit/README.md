# unit: off-path module map

Low-level maintainer notes for the core-shipped unit module. Main workflow surfaces teach
the record through `ctx unit`; nothing here is linked from boot, laws, `ctx help`, or the
top README.

## Module contract

`module` carries the discovery line and the package description:

```text
# summary: the unit module: the record's 35 operations over the storage layer, one value per artifact
```

The engine discovers `.contexture/modules/unit/`, reads the summary for `ctx help`, and
builds the verb table from `scripts/*`: an extension-less file with a `# summary:` header
is a verb. `scripts/data` carries no summary and is private; the 20 verbs are the record's
public surface, and `ctx session` is retired (a line naming `ctx unit`).

## Layout

```text
module            the summary, the version, the description (the law compose preamble)
laws              the sweep-consent law under @laws (no sweep that writes without the
                  human's word in the session, the dry run the one form run without it),
                  then the record clauses: @record, @journal, @backlog, @query,
                  @refresh, @close, @handoff (the law compose fragment)
data              the storage declaration (the namespace is the folder name, unit):
                  root .contexture/units, fallback_root .contexture/sessions, suffix .md,
                  key <unit>/<path...>, changes false, the document rules
scripts/<verb>    the 20 record verbs (sh), each sourcing lib/verb.sh
scripts/data      the 35 record operations over the storage layer (sh, private), and
                  unit.migrate, the record's migrations behind migrate, outside them
lib/migrate.awk   the pointer rewrite: the tokenizer, the class table, the census, NOTE
lib/verb.sh       the shared verb shell: the payload wire, the call, the rendering
lib/render.awk    the one renderer of every text view
lib/canon.awk     the canonical renderer and the JSON string form
lib/model.awk     the legacy parse, the typed items, the derived fields, the schema JSON
lib/ops.awk       the record rules: the writes, the reads, the audit, the liveness
lib/search.awk    the exact search over the canonical render
lib/ranked.awk    the storage layer's ranked answer mapped into the record's search shape
lib/refs.awk      the refs of a write payload
lib/payfield.awk  one decoded payload value
lib/b64           the store.batch value encoder
lib/fold-*.awk    the fold verb's programs, each run with fold-lib.awk (the flat answer
                  reader): fold-find-active.awk (the live fold start), fold-plan-gen.awk
                  and fold-plan-load.awk (the plan written and read back),
                  fold-carried-scan.awk (the carried open threads), fold-hint.awk (the
                  record hint of a fetch), fold-check-scan.awk (the batches and defects)
```

## The artifact model

One store value per artifact file, the keys `<unit>/state`, `<unit>/backlog`,
`<unit>/knowledge`, `<unit>/journal`, and `<unit>/lanes/<lane>/<recipe|journal|report>`,
mapped by the data file to `.contexture/units/<unit>/<artifact>.md` (a unit not yet moved read
from the fallback root, `.contexture/sessions/<unit>/<artifact>.md`). The values are the
current file shapes, so the record order, the preambles, the anchors, the opaque items,
the legacy shapes, and the positional liveness survive unchanged. The storage layer is the
configured driver; the module never names it.

The data script answers the 35 record operations: 13 session (`create`, `list`, `active`, `load`,
`refload`, `board`, `audit`, `stamp`, `refs`, `close`, `reopen`, `units`,
`refs_to`), 8 task (`add`, `update`, `start`, `complete`, `reopen`, `drop`, `list`,
`get`), 4 entry (`record`, `get`, `list`, `closure`), 6 finding (`add`, `update`,
`supersede`, `drop`, `get`, `list`), and 4 lane (`create`, `record`, `write_report`,
`get`), plus `search.query`. `capability` and `storage.health` stay the driver's, and so
do the posix driver's `storage.leftovers`, which `diagnose --leftovers` reads through the
storage layer's library (`store_leftovers`) for the unit namespace, and `storage.sweep`,
which `migrate --sweep` runs through `store_sweep`. The data file declares the record's
documents: the document rules name the backlog, the knowledge, the journal, and each
lane's recipe, journal, and report, and `unsearched: <unit>/state` names the state, a
document every verb reads that no search returns; so the probe and the sweep count
exactly the keys the verbs read as documents, and every other key the pattern admits
(old lane scratch written as `.md` files under a unit, say) as a key outside the document
rules.

The reads of one unit fetch the exact keys with `store.get` (state, then the named
backlog, journal, and knowledge), no list: a part the storage layer does not hold is absent, and
the unit's absence is the same `ERR_ENTITY_NOT_FOUND` line the held probe answered. Only
the lane reads and `search.query` take `store.list <namespace> "<unit>/"` to discover the
lane artifacts, and the all-unit reads (`session.list`, `session.active`, `session.units`)
read every unit's state (the listing also its journal, resolved in one pass), while
`session.refs_to`, answered by the data script beside the engine, reads every state, then
every artifact of each unit in its scope (the active units, or every unit under `all`) for
`lib/refs-to.awk` to list the REF and REFS values naming its target; the cross-unit reads (`session.load`, `session.refload`) read the named units'
state, backlog, knowledge, and journal. `session.load` reads the state once, captures its
ref_sessions, then adds the parts without a second state read. `session.active` reads
every state, then each ACTIVE unit's backlog only, never a journal, so the derived move
comes from one data-script pass; a non-ACTIVE unit answers its state fields alone, its
derived fields null. The scan is not the record's read path.

Every read that needs several keys asks them in one batched `store.get` through the
library's `store_get_into`: one unit's state and parts, a unit's listed artifacts, every
unit's state, the ACTIVE units' backlogs, the listing's journals; a lone key keeps the one
key read. A refused or short batch replays its keys one key read at a time in the order
the one key reads took (a unit's state first, so a unit the storage layer does not hold refuses
before any part is read), so a refusal is the very line the one key reads printed, and a
key absent from the batch reads absent exactly as its one key read did.

A write fetches under the unit lock (`.contexture/tmp/locks/unit/<unit>.lock`), stages the
changed artifacts with the record engine, and lands them through one `store.batch`, all or
none. The multi-key writes are the batch's: `session.create`
the four fresh artifacts, `task.start` the backlog alone (the state no longer holds a
next action), `task.complete` and
`task.drop` the backlog and the journal, `session.stamp` the state and the journal,
`lane.create` the recipe and the lane journal, `lane.record` the lane journal. The driver's
namespace-scope batch lock (`store-unit.lock`, taken inside the unit lock at the commit)
serializes the batches; the unit lock serializes the read to the commit, the single-user
trade named. The unit locks keep their own folder (`locks/unit/`) beside the drivers' flat
`locks/store-<namespace>.lock`, so no unit name can meet a namespace lock: a unit named
`store-unit` or `store-docs` locks like any other.

The lock folder carries its holder's pid. A waiter polls every 0.1 s: it removes a lock
whose pid is gone at once, gives a pid-less lock ten polls of grace, and refuses a live
holder rc 2 `ERR_STORAGE_LOCKED` after 600 polls, 60 s of sleep (each poll adds its own
processes, so the wait measured 82 s at a load of 4.5); where `sleep` refuses a fraction,
a poll sleeps 1 s and counts as ten, so the sleep still totals 60 s. The recovery clears
every dead holder, so the wait exists only to bound a live one, busy or hung (a stopped
process, a holder blocked on its input, a pid reused by another process), turning an
endless wait into a named error. Its size is measured on a 1 MB unit:
six writers arriving at once (five lanes and their dispatcher) wait at most 6.8 s on
posix and 29 s on fts5 with four more writers busy on other units, eight writers 9.3 s and
42 s, so the 60 s floor holds a margin over that need, while the error still surfaces
inside an agent's two-minute command budget at a moderate load; the driver's namespace
lock waits the same 600 polls. Writers looping without pause can starve one waiter past
any bound, since the polling lock keeps no queue.

## The record root move

The data file declares the root `.contexture/units` and the fallback root
`.contexture/sessions`, the root releases before the move wrote. The posix store reads a
unit from the root first, then from the fallback; nothing else in the module knows the
folders. The move is the storage layer's own: `u_commit` makes its one `store.batch`, as before
the move, and the posix driver, inside that call and under the namespace lock it already
holds, moves the unit's folder from the fallback to the root by one rename before it
writes, so a unit moves whole at its first landing write and a write stays one store call.
The move that empties the fallback root removes that folder in the same call, while a
fallback root still holding any entry stays, with nothing printed either way.
A unit both roots hold refuses the write with the storage layer's batch line, re-framed as
`<function>: error: action 1 (put '<key>'): key prefix '<unit>/' is held in both roots of
namespace 'unit' (ERR_ENTITY_EXISTS)`, and nothing written. So only a landing write moves
a unit: a refused write, and every write to a CLOSED unit, refused before any store call,
moves nothing.

The storage layer prints one notice line on a rc 0 answer it served from the fallback; the data
script collects the rc 0 store stderr of `u_keys_all`, `u_keys_prefix`, `u_add_key`, and
`u_held` into the run's notice file and, only when the run ends rc 0 and after its
answer, prints its own line once:
`WARNING: the record was read from its deprecated root; each unit moves at its next write, and ctx unit migrate --all moves the rest when the human chooses`.
The line is the reminder, never an instruction to the agent: the sweep is the human's
choice. A refusal's stderr stays its one line, so every `head -n 1` reader of a refusal still reads
the refusal. A store call those four make, and `u_commit`'s `store.batch`, refuses through
one helper, `u_store_refuse`: the storage layer's refusal line (its first line opening
`<store function>: error: `, else a first line that is the resolver's own
`driver-resolver: ` line, whole) is re-framed with the record function's own name and
printed once, so an unreadable state reads `session.board: error: cannot read key
'<unit>/state' in namespace 'unit' (ERR_STORAGE_READ)` alone, the storage layer's code kept, the
rc as before (2 for a list, the storage layer's for a read or the batch), and the storage layer's own line
never reaches the verb; when the storage layer printed neither (nothing, or only a foreign line),
the record function prints the fixed line of its call instead, `the storage layer read failed
(ERR_STORAGE_READ)`, `the storage layer list failed (ERR_STORAGE_READ)`, or `the storage layer batch
failed (ERR_STORAGE_WRITE)`, so the one line always carries a code. The verb library relays the line in one place: `vb_relay` holds a succeeded
call's stderr in the verb's scratch, and the verb's exit prints it once, after the answer,
only when the verb ends rc 0; `vb_ok` relays through it in every verb that calls it (list
before its render, fold on its board read, which every fold view makes first), and audit,
board, and diagnose call it after their render, so a verb level refusal after a read (a
load page out of range, a claim the report lacks, a unit no other unit references) prints
its line alone, and a fold check with defects ends rc 1 with no warning.
A verb that runs other verbs as its children holds their relays: refresh runs board and
audit each with a scratch root of its own and `VB_RELAY_HOLD` naming refresh's own held
relay, so a child ending rc 0 hands its held warning to that hold instead of printing it,
and refresh's exit prints the merged relay once, deduplicated, after its answer, only when
refresh ends rc 0.

`unit.migrate [--dry-run|--collect] <unit>...|--all` stands outside the 35 operations: it
checks every named unit is held (or lists every unit by its state key under `--all`),
then per unit under its unit lock promotes it through `store.promote unit <unit>/` (asking
`store_has store.promote` once first; never under `--dry-run`) and rewrites its pointers
(`lib/migrate.awk` over every artifact value as stored, the census rows into the verb's
census folder, the changed values through one `store.batch`, no record operation, so a
CLOSED unit is reached), runs the residual scan `u_mig_residual` over what each unit is left
holding (its own awk, apart from the tokenizer: every token still holding an old pointer
form outside NOTE, CLOSES, and SUPERSEDES lines and `ref_sessions`, one row each into
`residual.tsv`, which the verb tallies by the census after's class for the same token on the
same line), stops at the first refusal, re-framed as
`unit.migrate: error: unit '<unit>': <message>`, and answers
`{"promote":<bool>,"moved":N,"rewritten":N,"migrated":N}`, migrated counting the units
either migration changed; the sweep prints no warning. Under an address forward (the verb's
`--forward=<old prefix>=<new prefix>`, exported as `MG_FWD_OLD` and `MG_FWD_NEW`; the verb
refuses a malformed one before any read: `mg_prefix_ok` checks each side's full address
shape, a retired short form, a placeholder character (`<`, `>`, `*`, or `...`), and the
slash or hash it must end in, `mg_new_inside` a `file#` new prefix outside the workspace by
the write check's own rule, then the overlap of the two prefixes), the verb first calls `unit.migrate --collect <unit>...|--all`, which reads the same units with no lock
and no write and appends each candidate token's forwarded address to `forward.cand` in the
census folder (`lib/migrate.awk` in its collect mode), answering `{"collected":N}`; the verb
checks each distinct address once through `vb_ref_state` and writes the answers to
`forward.tsv`, which the run's two engine passes read through `MG_FWD_CHECK`, and the
residual scan also lists a token still holding the old prefix. The engine tests a REF
value's first token ending in a colon for the forward without its colon, the colon going to
NOTE as the path rule sends it, and the path rule keeps its NOTE word for word when its
address is forwarded. The posix promotion removes the fallback
root its move empties, and an empty fallback root when it answers `none`, so `--all` over
a fully moved store prints `migrated: 0` and leaves no empty deprecated root (a store
listing no unit reaches no promotion, and its fallback root stays). `ctx unit migrate` is
its verb.

`unit.sweep [--dry-run] [--delete] <unit>...|--all`, outside the 35 operations too, is the
sweep behind `ctx unit migrate --sweep`. Before any walk or write it reads the installed
unit declaration through the storage core's data reader (`store-data unit
--with-unsearched`, the reader the driver takes the document rules from) and refuses rc 1
`ERR_INVALID_ARGUMENT` unless it declares the state unsearched (`unsearched:
<unit>/state`), since without that line every unit's state is a key outside the document
rules, which the sweep would take (a partial payload sync, say); a declaration the reader
cannot answer refuses rc 2. Each named unit (one the storage layer holds), or with `--all` every
first key segment `store.list` answers in either root (a unit when it holds a
`<segment>/state` key, else a key segment outside the units), is swept under its unit lock
through `store_sweep --prefix=<unit>/` (that folder of both roots), then with `--all` the
top of each root through `store_sweep --loose`, so the two cover both roots whole; one
stamp (`--stamp=<YYYYMMDD-HHMMSS>-<pid>`, none for a dry run or a delete) names the run's
backup for every call. A segment whose keys the storage layer holds in both roots (a key of the
deprecated root that the root holds too, the answer's `shadowed_keys` of the fallback root)
refuses rc 1 `ERR_ENTITY_EXISTS` before anything of it is swept, the dry run alike, as the
migration's root move refuses such a unit (`u_sweep_twice`): a dry run reads the count from
its own answer, and a run asks a dry run of the segment first while the deprecated root is
walked (one answer showing it absent, undeclared, or not walked ends the asking). It
rewrites no ref and runs no other migration, so a CLOSED unit is reached. Each storage
layer answer lands in the folder the verb names (`SW_DIR`, the verb's scratch) as
`<n>.json`, one `sweep.tsv` line naming the segment's kind (`unit`, `prefix`, or `top` for
the top of the roots), its name, and the file; `SW_DIR/run` holds the run's stamp once the
sweep starts, a refused storage layer call writes `SW_DIR/stop` (the items it swept before
it), and the answer is `{"mode":"move|delete","dry_run":<bool>,"calls":N}`. The verb
renders each answer through the library's `store_sweep_text` (`summary` per line, labelled
`unit <unit>:`, `outside the units, key segment <segment>:`, or `outside the units:`, and
`close` once over them all). The first refusal stops the run naming the unit
(`unit.sweep: error: unit '<unit>': <the storage layer's message>`), the units swept before
it staying swept; the verb first prints, through `mg_sweep_partial`, the line of every
segment swept before it and one line with the run total swept before the stop (those
answers' items plus the refused call's own count) and the stamp: `stopped: swept <n> items
before the stop, moved into the backup stamped <stamp>`, `..., deleted with no backup
kept`, `stopped: nothing swept before the stop`, or `dry run: would stop after sweeping <n>
items; nothing written`; a refusal before the sweep starts (a bad argument, an unknown
unit, the state guard) prints its line alone. `--dry-run` takes no lock and writes
nothing. The verb runs the data script as a held child (`vb_call_held`: in the background
and waited for, so its trap runs at once): on a hangup, an interrupt, or a termination
`mg_sweep_stop` has `vb_stop_child` send the child and every descendant from one `ps`
snapshot a termination (a background child ignores an interrupt), wait for each to end at
its next step with its locks released, and kill any still running after 10 s, then prints
`migrate: stopped by a signal; ...` naming the run's stamp in the move form and exits 129,
130, or 143. Like the migrations, it prints no deprecated root warning.

The leftovers nudge tells the agent the sweep is due, at the boot read where it speaks to
the human: `ctx unit list` (every form, after a rendered answer; a refusing render exits
first) calls the verb library's `vb_leftovers_nudge`, which measures what the record's
storage holds beyond its documents at most once per period, the local calendar day. The
day's mark is one stamp in the drawer's scratch, `.contexture/tmp/unit-leftovers.stamp`
(the engine sweeps only its `verb.*` roots there), holding one line: `<YYYY-MM-DD> <items>
<bytes>` after a probe, `<YYYY-MM-DD> unknown` when the probe refused or walked no root,
`<YYYY-MM-DD> probing <pid>` while a listing probes, or `<YYYY-MM-DD> sweeping <pid>` while
a sweep runs. A sweeping mark holds the probe back only while its pid lives, whatever its
date (a sweep across midnight still holds it), so a mark whose verb is gone, or that names
no pid, reads as no mark; any other mark naming today holds it back, so a day costs one
probe whatever the listings. Otherwise the listing claims the day first (`<date> probing
<its pid>`, through `vb_stamp_put`: a temp file beside the stamp and one `mv`, refusing an
entry at the stamp's place that is no regular file), and a drawer that cannot keep the mark
probes nothing at all, so the throttle always holds; a claim a killed listing left still
holds the day. The probe is the library's `store_leftovers` over the unit namespace (the
caller lookup names it), flattened by the storage core's `json.awk` and summed through the
library's kinds table (`STORE_KINDS_AWK`): every kind of both walked roots, the keys
outside the document rules among them, with their bytes, so the counts are the sweep dry
run's closing counts. The count, or `unknown`, is written only while the stamp still reads
the listing's own claim, so a sweep's mark or clear, or another listing's claim, made while
it probed stands, and that listing prints nothing (the probe takes no lock, so a sweep may
run beside it). When the items are more than zero, one line joins the relay, so it prints
once after the answer and only on rc 0: `NUDGE: the record's storage holds <n> items
(<bytes> bytes) beyond its documents; the human's word comes first: tell them, show them
the dry run ctx unit migrate --sweep --dry-run --all, and sweep only on their word, moving
the leftovers into a backup or deleting them (--delete)` (`1 item` in the singular). It
names no path and writes nothing to the record. `ctx unit migrate --sweep`, a run and never
a dry run, writes `<date> sweeping <its pid>` through `vb_leftovers_mark` before its
`unit.sweep` call and removes the stamp through `vb_leftovers_clear` after it, and in its
stop trap when a hangup, an interrupt, or a termination stops it, so no listing probes
while the sweep runs and the next listing measures again, nudging a remainder or nothing; a
sweep killed outright leaves its mark, which reads as no mark once its pid is gone. The
load and every other verb carry no nudge: lanes boot by loading their unit, so a load
nudge would often be spent on a subagent.

## The ref check

A write's refs are full addresses, `<owner>#<path>` (`unit#<unit>/entry/<slug>`,
`unit#<unit>/task/<slug>`, `unit#<unit>/finding/<NAME>`,
`unit#<unit>/lane/<lane>/<recipe|journal|report>[/<SECTION or slug>]`,
`store#<container>/<id>`, `docs#<repo>/<slug>/<id>`, `file#<path>[#<symbol>]`). The verbs
check each in two steps before their storage call: `vb_ref_ok` refuses a retired short or
legacy form naming its full address (`lib/migrate.awk` in its suggest mode computes it for
the writing unit) and passes everything else through the storage library's `lib_ref_ok`;
then `vb_refs_exist` checks each target through `vb_ref_state` (which answers ok, missing,
none, or noget, and which `ctx unit migrate --forward` asks too), a `file#` path by the core
(inside the workspace it must exist, outside it the shape alone counts, the symbol never)
and every other owner through `ctx <owner> get <path>`, refusing
`<verb>: error: ref '<ref>': target not found (ERR_ENTITY_NOT_FOUND)`,
`... owner '<owner>' is not installed (ERR_ENTITY_NOT_FOUND)`, or
`... owner '<owner>' has no get verb (ERR_ENTITY_NOT_FOUND)`. `vb_owner` probes each owner
once per verb run: a name the engine reserves is classed through `ctx _reserved` and `ctx _builtin` and
never dispatched (`ctx run help get` would run a command), any other through
`ctx <owner> help get`, then `ctx <owner> help`; a path starting with a dash reads target not
found before any get, since get would take it for an option; a ref given twice in one write
is checked once. No lock is held during the checks: the unit lock is taken only inside the
data script, whose `u_refs_shape` re-checks the shape of a payload's refs before that lock as
a backstop for a direct call, and whose `lane.create` reads the recipe before the lock and
puts its REFS block items through the same check (`u_refs_check`). A value
already stored reads as it stands until `ctx unit migrate` rewrites it; `ctx unit load`
counts the unit's REF and REFS values a migration would still rewrite (`lib/migrate.awk`
in its check mode) and warns once after its answer while any remain.

## The search

`search.query --mode=exact` is the record rule over the canonical render (the preambles,
every item's canonical span, each lane; never the state) in record order, so a legacy value
answers the canonical text. A ranked mode is the storage layer's search over the document-set
schema (the data file's rules derive the entities at write time; the fts5 store indexes
them), filtered to the unit's keys, with `--entity` applied and `--limit` capped after the
complete walk (0 for every result); the storage layer's rank order is kept. The storage layer answers a default document's
identity as its artifact key, so the data script maps it to the record id: the unit for a
session document (backlog, knowledge, journal; the state is never a result), the lane for a lane document, and a
lane entry keeps its `<lane>/` prefix; a result outside the record's artifact shape or the
sections the record searches is dropped. A mode the unit's records cannot answer (the
configured driver's registry through the library's `store_modes`, a ranked mode only where
the unit's data file declares its search schema) refuses before any store search, rc 1
`ERR_CAPABILITY_UNSUPPORTED` naming the answerable modes. The exact mode asks neither the
held probe nor the registry: exact answers everywhere, and the unit's listed artifacts
prove it held, a unit without its state refusing with the held probe's own line before any
artifact is read.

The search verb (`scripts/search`) lists the units through `session.active` (the default
scope its ACTIVE units, `--all` every unit, `--unit` one, the listing narrowed to that one
unit by `session.active <unit>`, so a one unit search reads no other unit's state), calls `search.query` once per
unit uncapped, and maps the merged rows onto the shared row shape with `lib/search-rows.awk`
(the container from the data declaration's document rules, read through the storage core's
data reader; the address, the read, and the closed label), applying the limit once.

## The tests

The vitest project `unit-record` (`tests/unit-record`, `bun run test:unit-record` from
`tests/`) proves the record logic once, on posix: the record compliance cases through this
data script over a staged store, the module's own cases (the canonical refs and the write
refusal, the file-pointer exemption, the legacy ref, the ranked search identity over a
canned fts5 store answer, the active listing, the per-unit read), the audit classes, and
the record engine alone (`lib/canon.awk`, `lib/model.awk`, `lib/ops.awk`), held equal to
this data script for every dispatched function by a differential test, with the search,
ranked, render, payload, and base64 programs each tested alone. The vitest project
`unit-verbs` (`tests/unit-verbs`, `bun run test:unit-verbs`; `bun run test:unit` runs both
unit projects) proves the `ctx unit` and `ctx lane` verbs once, on posix: one file per verb
family, each over its own seeded snapshot built through the verbs, the input matrices of
`lib/verb.sh` (the REF shapes, the UTF-8 and NUL checks, the newline and carriage return
refusals) one function at a time with one wiring test per write path, the fold protocol
and its defect classes, and the fault cases (a read-only store, an interrupted waiter, a
killed writer, a held lock, concurrent writers). The store fuzzer's
unit-shaped profile (`tests/drivers/store-fuzz.test.ts`) is the seeded differential proof of the
store calls the module makes across posix and fts5.
