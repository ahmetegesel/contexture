# unit: off-path module map

Low-level maintainer notes for the core-shipped unit module. Main workflow surfaces teach
the record through `ctx unit`; nothing here is linked from boot, laws, `ctx help`, or the
top README.

## Module contract

`module` carries the discovery line and the package description:

```text
# summary: the unit module: the record's 35 operations over the store, one value per artifact
```

The engine discovers `.contexture/modules/unit/`, reads the summary for `ctx help`, and
builds the verb table from `scripts/*`: an extension-less file with a `# summary:` header
is a verb. `scripts/data` carries no summary and is private; the 22 verbs are the record's
public surface, and `ctx session` is retired (a line naming `ctx unit`).

## Layout

```text
module            the summary, the version, the description (the law compose preamble)
laws              the record clauses: @record, @journal, @backlog, @query, @refresh,
                  @close, @handoff (the law compose fragment)
data              the store declaration: namespace unit, root .contexture/units,
                  fallback_root .contexture/sessions, suffix .md, key <unit>/<path...>,
                  changes false, the document rules
scripts/<verb>    the 22 record verbs (sh), each sourcing lib/verb.sh
scripts/data      the 35 record operations over the store (sh, private), and
                  unit.promote, the sweep behind migrate, outside them
lib/verb.sh       the shared verb shell: the payload wire, the call, the rendering
lib/json.awk      the one flattener: a function's JSON answer to path=value lines
lib/render.awk    the one renderer of every text view
lib/canon.awk     the canonical renderer and the JSON string form
lib/model.awk     the legacy parse, the typed items, the derived fields, the schema JSON
lib/ops.awk       the record rules: the writes, the reads, the audit, the liveness
lib/search.awk    the exact search over the canonical render
lib/store-json.awk the flattener for the store.search ranked answer
lib/ranked.awk    the store ranked answer mapped into the record's search shape
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
the legacy shapes, and the positional liveness survive unchanged. The store is the
configured driver; the module never names it.

The data script answers the 35 record operations: 13 session (`create`, `list`, `active`, `load`,
`refload`, `board`, `audit`, `stamp`, `refs`, `close`, `reopen`, `units`,
`refs_to`), 8 task (`add`, `update`, `start`, `complete`, `reopen`, `drop`, `list`,
`get`), 4 entry (`record`, `get`, `list`, `closure`), 6 finding (`add`, `update`,
`supersede`, `drop`, `get`, `list`), and 4 lane (`create`, `record`, `write_report`,
`get`), plus `search.query`. `capability` and `storage.health` stay the driver's.

The reads of one unit fetch the exact keys with `store.get` (state, then the named
backlog, journal, and knowledge), no list: a part the store does not hold is absent, and
the unit's absence is the same `ERR_ENTITY_NOT_FOUND` line the held probe answered. Only
the lane reads and `search.query` take `store.list <namespace> "<unit>/"` to discover the
lane artifacts, and the all-unit reads (`session.list`, `session.active`, `session.units`,
`session.refs_to`) read every unit's state (the listing also its journal, resolved in one
pass); the cross-unit reads (`session.load`, `session.refload`) read the named units'
state, backlog, knowledge, and journal. `session.load` reads the state once, captures its
ref_sessions, then adds the parts without a second state read. `session.active` reads
every state, then each ACTIVE unit's backlog only, never a journal, so the derived move
comes from one data-script pass; a non-ACTIVE unit answers its state fields alone, its
derived fields null. The scan is not the record's read path.

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
folders. The move is the store's own: `u_commit` makes its one `store.batch`, as before
the move, and the posix driver, inside that call and under the namespace lock it already
holds, moves the unit's folder from the fallback to the root by one rename before it
writes, so a unit moves whole at its first landing write and a write stays one store call.
The move that empties the fallback root removes that folder in the same call, while a
fallback root still holding any entry stays, with nothing printed either way.
A unit both roots hold refuses the write with the store's batch line, re-framed as
`<function>: error: action 1 (put '<key>'): key prefix '<unit>/' is held in both roots of
namespace 'unit' (ERR_ENTITY_EXISTS)`, and nothing written. So only a landing write moves
a unit: a refused write, and every write to a CLOSED unit, refused before any store call,
moves nothing.

The store prints one notice line on a rc 0 answer it served from the fallback; the data
script collects the rc 0 store stderr of `u_keys_all`, `u_keys_prefix`, `u_add_key`, and
`u_held` into the run's notice file and, only when the run ends rc 0 and after its
answer, prints its own line once:
`WARNING: the record was read from its deprecated root; each unit moves at its next write, and ctx unit migrate --all moves the rest when the human chooses`.
The line is the reminder, never an instruction to the agent: the sweep is the human's
choice. A refusal's stderr stays its one line, so every `head -n 1` reader of a refusal still reads
the refusal. A store call those four make, and `u_commit`'s `store.batch`, refuses through
one helper, `u_store_refuse`: the store's refusal line (its first line opening
`<store function>: error: `, else a first line that is the resolver's own
`driver-resolver: ` line, whole) is re-framed with the record function's own name and
printed once, so an unreadable state reads `session.board: error: cannot read key
'<unit>/state' in namespace 'unit' (ERR_STORAGE_READ)` alone, the store's code kept, the
rc as before (2 for a list, the store's for a read or the batch), and the store's own line
never reaches the verb; when the store printed neither (nothing, or only a foreign line),
the record function prints the fixed line of its call instead, `the store read failed
(ERR_STORAGE_READ)`, `the store list failed (ERR_STORAGE_READ)`, or `the store batch
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

`unit.promote <unit>...|--all` stands outside the 35 operations, as `data_get` does: it
checks every named unit is held (or lists every unit by its state key under `--all`),
promotes each under its unit lock through `store.promote unit <unit>/` (asking
`store_has store.promote` once first), stops at the first refusal, re-framed as
`unit.promote: error: unit '<unit>': <message>`, and answers
`{"promote":true,"migrated":N}`, or `{"promote":false,"migrated":0}` under a driver
without the token; the sweep prints no warning. The posix promotion removes the fallback
root its move empties, and an empty fallback root when it answers `none`, so `--all` over
a fully moved store prints `migrated: 0` and leaves no empty deprecated root (a store
listing no unit reaches no promotion, and its fallback root stays). `ctx unit migrate` is
its verb.

## The ref interface

`data_get` resolves a canonical unit ref and `data_emit` prints the envelope:

```text
unit#<unit>/task/<slug>
unit#<unit>/entry/<slug>
unit#<unit>/finding/<NAME>
unit#<unit>/lane/<lane>/<recipe|journal|report>
```

A new write validates its canonical `unit#...` refs through the storage core's `data_get`
before anything lands and refuses a missing target, re-framed with the write's function
and the ref. The public `ctx unit resolve <unit> <ref>` accepts the same canonical forms
(the ref carries its target unit) beside the abstract and legacy forms, so a canonical ref
stored in a source item resolves to its entity. A legacy record target (`journal#<slug>`,
`task#<slug>`, `knowledge#<NAME>`, `lanes/<lane>/report#<claim>`) and a file pointer stay
as stored: the check is forward only, the two pointer shapes of @record references. The
existing refs keep reading; the migration to the canonical form is an agent rewrite, not a
verb.

## The search

`search.query --mode=exact` is the record rule over the canonical render (the states, the
preambles, every item's canonical span, each lane) in record order, so a legacy value
answers the canonical text. A ranked mode is the store's search over the document-set
schema (the data file's rules derive the entities at write time; the fts5 store indexes
them), filtered to the unit's keys, with `--entity` applied and `--limit` capped after the
complete walk; the store's rank order is kept. The store answers a default document's
identity as its artifact key, so the data script maps it to the record id: the unit for a
session document (state, backlog, knowledge, journal), the lane for a lane document, and a
lane entry keeps its `<lane>/` prefix; a result outside the record's artifact shape or the
sections the record searches is dropped. A ranked mode the configured driver does not
declare refuses with the store's line, re-framed as `search.query`.

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
