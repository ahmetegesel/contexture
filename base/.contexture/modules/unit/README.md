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
data              the store declaration: namespace unit, root .contexture/sessions,
                  suffix .md, key <unit>/<path...>, changes false, the document rules
scripts/<verb>    the 22 record verbs (sh), each sourcing lib/verb.sh
scripts/data      the 35 record operations over the store (sh, private)
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
```

## The artifact model

One store value per artifact file, the keys `<unit>/state`, `<unit>/backlog`,
`<unit>/knowledge`, `<unit>/journal`, and `<unit>/lanes/<lane>/<recipe|journal|report>`,
mapped by the data file to `.contexture/sessions/<unit>/<artifact>.md`. The values are the
current file shapes, so the record order, the preambles, the anchors, the opaque items,
the legacy shapes, and the positional liveness survive unchanged. The store is the
configured driver; the module never names it.

The data script answers the 35 record operations: 13 session (`create`, `list`, `load`,
`refload`, `board`, `audit`, `stamp`, `next`, `refs`, `close`, `reopen`, `units`,
`refs_to`), 8 task (`add`, `update`, `start`, `complete`, `reopen`, `drop`, `list`,
`get`), 4 entry (`record`, `get`, `list`, `closure`), 6 finding (`add`, `update`,
`supersede`, `drop`, `get`, `list`), and 4 lane (`create`, `record`, `write_report`,
`get`), plus `search.query`. `capability` and `storage.health` stay the driver's.

The reads fetch the unit's artifacts by `store.list <namespace> "<unit>/"` and
`store.get`; the all-unit reads (`session.list`, `session.units`, `session.refs_to`) read
every unit's state (the listing also its journal) and the cross-unit reads
(`session.load`, `session.refload`) read the named units' state, backlog, knowledge, and
journal. The scan is not the record's read path.

A write fetches under the unit lock (`.contexture/tmp/locks/<unit>.lock`, the same path the
posix driver uses), stages the changed artifacts with the record engine, and lands them
through one `store.batch`, all or none. The multi-key writes are the batch's: `session.create`
the four fresh artifacts, `task.start` the backlog and the state, `task.complete` and
`task.drop` the backlog and the journal, `session.stamp` the state and the journal,
`lane.create` the recipe and the lane journal, `lane.record` the lane journal. The store's namespace-scope batch lock
serializes the batches; the unit lock serializes the read to the commit, the single-user
trade named.

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
and the ref. A legacy record target (`journal#<slug>`, `task#<slug>`, `knowledge#<NAME>`,
`lanes/<lane>/report#<claim>`) and a file pointer stay as stored: the check is forward
only, the two pointer shapes of @record references. The existing refs keep reading; the
migration to the canonical form is an agent rewrite, not a verb.

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

`tests/storage-compliance.sh --data=unit --driver=posix|fts5` runs the record compliance
(the same 66 posix and 60 other-backend cases) through this data script over the store.
`tests/unit-data-tests.sh` runs that case set on both drivers (or one with `--driver`) and
adds the module's own cases: the canonical refs and the write refusal, the file-pointer
exemption, the legacy ref, the ranked search identity, the active listing, the per-unit
read, and the `--smoke` sequence the fast inner loop uses. The gate runs the two driver
halves as separate concurrent jobs, and `tests/record-fuzz.sh` is the seeded differential
proof of the module's writes and reads across posix and fts5.
