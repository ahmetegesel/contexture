# The storage core

The storage core sits beside the engine at `.contexture/storage/`. It is not a module:
the engine does not discover it, `ctx help` does not list it, and a package never writes
it. It owns the driver resolver, the generic storage layer contract, the module-facing
library, the move engine, and the posix driver.

```text
storage/
  scripts/driver-resolver   the resolver: selection, the capability handshake, dispatch, and
                            the storage moving freeze (move-freeze, move-release, move-state)
  scripts/driver-behavior   the private differential behavior test a driver meets: posix and the
                            candidate in two scratch workspaces, one step set compared
  scripts/store-data        the private reader and validator of a module's data file, and its
                            listings (every declaration, the kept data ones among them)
  scripts/store-clear       the private counter and deleter of one named namespace's keys,
                            through the resolver in bounded batches (the uninstall's delete)
  scripts/store-move        the private move engine: every namespace from one driver to another
                            (preflight, copy and verify, check, unwind, retire), through the resolver
  scripts/store-key.awk     the one key rule: the awk functions the dispatch gate and every bundled
                            driver read (the key, the prefixes, the leading run fold set)
  scripts/store-search      the private exact search engine
  scripts/store-search.awk  the engine's parser, extractor, and matcher
  scripts/store-b64         the private base64 encoder of a stored value
  scripts/store-pack        the private codec of a batched store.get answer: pack, unpack
  scripts/store-fields.awk  the private field validator engine the library's fields functions
                            and the data reader's field lines check run
  scripts/json.awk          the one JSON flattener: a storage answer to path=value lines, read
                            by the unit, rhythm, and docs modules
  scripts/library           the module-facing interface, sourced by a module's scripts
  config                    the core storage configuration schema (driver: optional string default posix)
  drivers/posix/            the zero-dependency baseline driver (sh and awk)
  README.md                 this contract
```

## The store contract

The store-only driver card is contract 4, which describes posix exactly: the driver
answers `capability` and `storage.health <namespace>` as its own methods and the six data
functions plus the search entry, and the record's 35 operations live in the unit module's data script over
the store. The health probes the named namespace's store, validated through `store-data`
like any store function (a missing, extra, or malformed argument refuses rc 1
`ERR_INVALID_ARGUMENT`, an undeclared namespace rc 1 `ERR_ENTITY_NOT_FOUND`, a
declaration the core cannot read rc 2 `ERR_STORAGE_READ`), by one table on both drivers:
the store not made (posix: the declared root and the declared fallback root both absent;
sqlite: no database file, or a file holding no table) reads `degraded`, absent; made but
unreadable (posix: either existing root) reads `error`, absent; presence is then counted
(posix: the first key the namespace's pattern admits under its root or its fallback root,
never a stray file; sqlite: the namespace's rows alone); unwritable (posix: either existing
root) reads `error` with that presence, as do the sqlite checks (another schema reads
present, a failed integrity check, an sqlite3 older than 3.44 with the store by the
file's existence); `locked` replaces `ok` whatever the presence; the detail names no
folder, and the probe prints no fallback notice.

The resolver holds every driver but the bundled posix one to the card at dispatch: the
contract `4`, the six store names in the fixed order (`list get put delete batch scan`),
the one search mode `exact`, and the optional tokens `store` and `store.promote` alone,
each refusal rc 2 `ERR_DRIVER_PROTOCOL` naming the expectation; the version is never
checked. Its verdict is cached under the drawer's scratch, one file per driver path, and
stands only while it is newer than the driver, the workspace configuration, and the
resolver itself, so a core update (a copy stamps the resolver anew) verifies every driver
against the contract it brings at its next call.

The posix driver answers a third method of its own, `storage.leftovers <namespace>`: what
the named namespace's declared root and fallback root hold beyond the documents its
declaration names, a read only walk of each that writes nothing, takes no lock, and names no folder
in its answer (the same argument refusals as the health). Each root is walked once: one
`find` from inside the root lists every entry by type through batched `printf` calls and
sizes every regular file through `wc -c` (which stats a regular file), a symbolic link
never followed. The listing is one entry per line, so a name holding a newline could forge
a line for another path: the `find` prunes every such name and prints only its parent
folder, never the name, and when it found one a second `find` sums the regular files at
or below such names through `wc -c` reading each file on its standard input, so no name
is printed. One awk pass then classifies the listing; a line it cannot parse stops the
probe rc 2 `ERR_STORAGE_READ`, a name never continued across lines. A regular file the
pattern admits is a key (the storage layer's own list rule: the suffix, the key rule, the
pattern), a document when a document rule or an `unsearched` line of the declaration
names it (every key a document when the namespace declares neither), else a key outside
the document rules, which is a leftover; each folder above a key, or above a refused key
(below), is a key folder, each
folder above an unreadable folder or a name holding a newline is opened, and every other
entry belongs to the topmost folder above it that holds no key, or stands loose in a key
folder, an opened folder, or the root. A loose folder is an unreadable folder (one with no
listed entry that cannot be read or entered), a lock remnant (named `.lock` or `*.lock`,
as an older release's lock folder inside the deprecated root), a folder outside the key
shape (it holds a file, a link, or a special file), or an empty folder (as `ctx store
delete containers/<name>` left a dropped container's folder before the delete pruned the
folders it empties); a loose file is a lock or write remnant (a lock name, or a killed
put's temp: a dot, the key file's name, and a six character `mktemp` tail, or the older
shape of the key file's name, a dot, and the tail), a refused key (a regular file whose
suffix and segment count the pattern admits while the key rule refuses its name, a name
opening with a dot aside; each folder above one is opened like a key folder, outside the
sweep's `--loose` scope, which takes a top folder holding only refused keys whole), else a
stray file (a wrong suffix, outside the pattern, or a name opening with a dot); a link and a fifo, socket,
or device count apart; a name holding a newline counts as its own kind, its bytes the
regular files at or below it; in the fallback root a key the root also holds is a shadowed
key, never a key. The answer is one compact object `{"driver","namespace",
"root","fallback"}`, each root `{"state"}` for `absent` (not made), `link` (a symbolic
link, which the storage layer never walks), `unreadable`, or `none` (the namespace declares no
fallback root), else `{"state":"walked","entries","keys","documents","kinds"}`, the
kinds `stray_files`, `nonkey_folders`, `empty_folders`, `links`, `special_files`,
`unreadable_folders`, `remnants`, `shadowed_keys`, `outside_keys`, `refused_keys`, and
`newline_names` in that order, each `{"count","bytes"}` (`keys` is `documents` plus the
`outside_keys` count, a refused key never a key; `entries` counts each name holding a newline once) (a leftover folder counts once,
its regular files' bytes rolled in; a file `wc` cannot read and an unreadable folder count
0 bytes). The sqlite driver keeps one database and no key file tree, so
it answers its unknown function line rc 2 `ERR_CAPABILITY_UNSUPPORTED`. A walk costs what
the roots hold, every entry once: it is the whole walk the leftovers explain, so it runs
only where a caller asks for it (`ctx unit diagnose --leftovers`, `ctx store check
--leftovers`), never inside another function.

The posix driver answers a fourth method of its own, `storage.sweep <namespace>
[--dry-run] [--delete] [--stamp=<stamp>] [--prefix=<prefix> | --loose]`: every leftover
the probe's walk finds, the keys outside the document rules among them, moved into
`.contexture/backups/sweep-<stamp>/<namespace>/<root|fallback>/<relative path>` (the
layout and the root label kept; the folder made only when an item moves; the stamp
`<YYYYMMDD-HHMMSS>-<pid>` unless the caller passes one, so the unit module names one
backup for a whole run), or with `--delete` removed outright with no backup kept. A
document never moves. The walk is the probe's, so its items are the probe's entries: a
keyless folder moves whole with everything below it, a loose file or a link (moved or
removed as itself, never followed) alone, and a key folder holding no document below it
(and no opened folder) moves or goes as one item too, by one rename or one removal, its
entries still counted by kind and each key folder in it counted as emptied. A folder the
walk cannot read or enter is never moved or removed, in either form, nor any folder above
it: the sweep leaves it untouched, grants itself no rights (it runs no `chmod`), and
counts it as left, its rights the human's to fix. An item that is, or holds, a symbolic
link at a document's key path refuses the whole run rc 2 `ERR_STORAGE_WRITE` (a read
follows the link, so the store may read it as the document), and a name holding a
newline anywhere in the walk's reach refuses it rc 2 `ERR_STORAGE_READ` naming the
count, since the sweep never parses such a name; the dry run refuses both alike.

A run plans under the namespace lock (both walks under one hold, so no live write's temp
is planned), then releases it and acts in batches. One awk pass decodes the plan (each
path escaped in it: a backslash, a tab, a newline, and every other control character as a
three digit octal code) and splits it into batches of at most 1000 items and 4000 walk
entries at and below them. Each batch takes the lock again, re-checks every item (still
there, of its planned type, its backup place free), runs the document guard (one `find`
over the batch's items, symbolic links never followed: a regular file or a link at a
document's key path, the item's own or one below it, a name holding a newline, or a folder
it can no longer read or enter stops the run, except in the fallback root a key the root
still holds), acts (one `rm -rf`, or one `mkdir -p` and one `mv` per run of siblings),
checks that each item left its place, and releases the lock. The sweep waits 0.2 s before
each later batch, longer than a waiting writer's 0.1 s poll, so a writer takes the lock
between two batches instead of waiting out the run: measured on the macOS host, a batch
of 1000 items holds the lock about 0.25 s, and 12000 keys outside the document rules
beside a document sweep in about 6 s, a writer waiting during it landing in about 0.15 s
(one lock hold over the whole run took about 108 s, and that writer refused after 60 s).
A fallback root left empty is dropped as the write path drops one. `--prefix` (whole key
segments ending in a slash) sweeps that folder of each root alone, the walk starting
there (every ancestor below the root must be a folder, never a link); `--loose` sweeps
the entries at the top of each root that hold no key; neither sweeps both roots whole.
`--dry-run` takes no lock, writes nothing, and answers exactly what the run would do,
refusals included. The answer is one compact object `{"driver","namespace","mode",
"dry_run","stamp","root","fallback"}`, `mode` `move` or `delete`, `stamp` the backup's
(`null` for `--delete`, a dry run, and a run that moved nothing), each root `{"state"}`
as the probe's or `{"state":"walked","kinds","emptied","left"}`, the eleven kinds of what it
swept, the key folders holding no document it cleared, and the unreadable folders it left
untouched; it names no folder. The first item it cannot move or remove, a backup place
already taken, an item gone or changed since the plan, or the guard stops it rc 2
`ERR_STORAGE_WRITE`, the line naming why and how many items it swept before, which stay
swept (a lock timeout between batches names that count too); a root that is, holds, or
lies in the drawer's backups or scratch folder refuses rc 1 `ERR_INVALID_ARGUMENT` (the
sweep would move the folder it moves into, or the lock it holds); a root that is or holds
another namespace's root or fallback root (as `store-data --list` names them) refuses rc 1
`ERR_INVALID_ARGUMENT` naming both namespaces, a listing that cannot be read whole rc 2
`ERR_STORAGE_READ`; a missing, unknown, or repeated argument, a malformed stamp or
prefix, and both scopes refuse rc 1. The sqlite driver answers its unknown function line rc
2. Its callers are `ctx unit migrate --sweep`
(per unit under its unit lock, `--prefix=<unit>/`, then `--loose` under `--all`) and
`ctx store check --leftovers --sweep` (the store namespace whole).

Six data functions and the optional promotion, called through the resolver:

| function | argv | stdin | answer |
|---|---|---|---|
| `store.list` | `<namespace> [<prefix>]` | none | `{"namespace","keys"}`: every key the module pattern admits, bytewise; the optional literal key prefix narrows it |
| `store.get` | `<namespace> <key> [<key>...]` | none | one key: the raw bytes of the key, no JSON; absent rc 1 `ERR_ENTITY_NOT_FOUND`. Two or more: `{"namespace","items":[...]}`, one item per asked key in the asked order: `{"key","value"}`, `{"key","value_b64"}` for a value holding a NUL byte, or `{"key","missing":true}` |
| `store.put` | `<namespace> <key>` | the raw bytes | `{"namespace","key"}`; atomic per key; an extra argument refuses rc 1 `ERR_INVALID_ARGUMENT` |
| `store.delete` | `<namespace> <key>` | none | `{"namespace","key"}`; posix removes the folders it empties, never the root; an extra argument refuses rc 1 |
| `store.batch` | `<namespace>` | the action lines (`action=put\|delete`, `key=<escaped>`, `value_b64=<base64>` for a put; any other line refuses as an unknown payload line) | `{"namespace","actions":N}`; all or none |
| `store.scan` | `<namespace>` | none | `{"namespace","items":[{"key","value_b64"}]}`: every admitted key, bytewise, its raw value in base64 |
| `store.search` | `<namespace> <mode> [<limit>]` | `query=<escaped>` | `{"namespace","query","mode","total_matches","results":[{key,entity_type,entity_id,section,snippet,score}]}`; limit 0 answers every result |
| `store.promote` | `<namespace> <prefix>` | none | `{"namespace","prefix","state"}`: optional (the `store.promote` token); moves the prefix (whole key segments ending in a slash) from the fallback root to the root; `moved`, or `none` when the fallback holds nothing for it or none is declared; a move that empties the fallback root, or a `none` answer over an empty one, removes that root; the root already holding it refuses rc 1 `ERR_ENTITY_EXISTS` |

The batched `store.get` is the one key read made once for many keys: every key passes the
key rule (at the dispatch gate, then again in the driver) and the pattern first, and the
first that fails refuses the whole call rc 1 with the one key form's line; an absent key is an item marked missing, never a refusal; a present
key that cannot be read refuses the whole call rc 2 with the one key form's line; a key read
from a deprecated fallback root prints the one notice. The value travels as a JSON string:
the backslash, the double quote, the tab, the carriage return, and the newline between
lines escaped, every other byte below 0x20 as `\u00XX`, and the bytes from 0x80 as stored, so
the posix driver encodes per line and the reader decodes per escape; a value holding a NUL
byte, which awk cannot carry, travels in base64 instead, encoded by `store-b64` before the
line is packed, so a value it cannot read whole refuses the call as unreadable. Inside a
value every double quote is escaped, so the item separator and a key's closing quote cannot
occur in one. Both drivers pack the line with `store-pack`, which hands the value paths to
`wc` and `cat` in runs of at most 32768 bytes, so a batched get of any size answers, and
their answers are byte identical; the posix
driver finds the asked keys by listing their own folders alone, one level each, in runs
bounded below the system's argument limit, as the walk of their common folder would list
them (the exact stored spelling, the root's copy first), so a read across many units never
walks the namespace, and sqlite writes them in one
`sqlite3` call.

Keys are exact and meet one key and value rule, the text of `scripts/store-key.awk`, so
every key any caller can write is one every driver, posix included, can hold on any
volume. A key is one or more segments joined by a slash; each segment opens with a letter
or a digit and holds only letters, digits, dot, underscore, and dash, at most 200 bytes; the
whole key is at most 512 bytes (so a posix path stays inside a 1024 byte `PATH_MAX`); and in
a namespace whose key pattern ends in a `<name...>` placeholder no segment but the last ends
with the namespace's suffix (`u/a` beside `u/a.md/x` under `.md` would make one key's folder
another key's file). A value is any bytes, empty allowed, at most 16 MiB (16777216 bytes).
The resolver checks the rule at its dispatch, one function (`kv_gate`) in the `exec` and
the dotted arm, before it resolves or runs any driver: every key of `store.get`, the key of
`store.put` and `store.delete`, the prefix of `store.list`, `store.promote`, and
`storage.sweep --prefix=`, and every `key=` and `value_b64=` line of a `store.batch`
payload. A list prefix may end inside a segment or on a slash, its whole segments under the
rule and its trailing part from the same alphabet opening with a letter or a digit; a
promote or sweep prefix is whole segments ending in a slash. A refusal is rc 1
`ERR_INVALID_ARGUMENT` with the dispatched function's own line, `<function>: error:
malformed key '<key>'`, `malformed key prefix '<prefix>'`, a batch action as `store.batch:
error: action <n> (<op> '<key>'): malformed key '<key>'`, or a value past the cap naming
the key, its size, and the cap, the key written with the payload escape (a backslash, a
newline, a tab, or a carriage return as `\\`, `\n`, `\t`, `\r`) so the line stays one;
nothing reaches stdout and no driver runs. The gate stages a put's and a batch's stdin in
the per verb scratch root (else the drawer's scratch, the system temp only when the drawer
cannot hold it), a batch payload without its NUL bytes (an awk may cut a line at one while a
shell read drops it, so the gate checks the lines the driver reads), checks it there, and
hands the staged file to the driver as its stdin, unlinked before the exec, so nothing stays
behind; a hangup, interrupt, or termination while it stages removes the file and exits 129,
130, or 143 at once, even while the caller still holds stdin open (under bash 3.2 alone, a
signal landing just as the gate starts waiting on its copy of stdin is held until stdin
ends, the one window left). A batch value's decoded size is read with its trailing padding run aside, so no
decoder yields more, and a line outside the wire's shape (an unknown or repeated line, a line
outside an action, an unknown action, an action with no key) ends the gate's batch check,
so the driver names it. The suffix clause reads the namespace's suffix and key pattern
through `store-data` when a checked key or prefix has a non final segment, and once for
every batch; a declaration it cannot read leaves the refusal to the driver. The gate's refusals come before the driver's argument
count, bounded flags, declaration, and pattern refusals. A direct driver call skips the
gate (the one bypass), and every bundled driver reads the same text for its own argument
checks and for its list, scan, and leftovers classification, so a listing never names a key
a read refuses. A put whose leading run of segments, the whole key included, folds under
ASCII case onto the same length run of a stored key with another spelling refuses rc 1
`ERR_ENTITY_EXISTS` on every driver and volume (`A/x` beside `a/y`); the driver checks it
under the namespace lock in one pass per call, the live key list folded once into its
leading runs and each put of a batch checked and added in action order, the first failing
action named. The posix batch reads that live list from the folders its keys touch alone
(`batch_live`): a `find` pair (folders, then files) per root lists the namespace root's
entries and each folder's along every action key's leading runs, one level each
(`store_entries`, the listing the batched get reads), its folders handed over in runs of at
most 32768 bytes, so no call meets the system's argument limit however many or deep the
keys (one pair for any ordinary batch), a folder's entries counting only when each folder
above it is listed in its own exact spelling. Where every run the actions fold
onto has one spelling (the actions', the stored folders', the stored keys') no twin can fire
and no count reaches the answer, so the pass reads only the live keys among them; a run
holding a second spelling (a twin, a case mismatch on a folding volume, legacy twins on a
case sensitive one) has each of its stored folders walked whole and the list sorted, so the
pass answers as over the whole namespace. So a one action unit write runs the same
processes at 0 and at 33510 keys, and never a `find` over the namespace root (a `store.put`
alone still lists the namespace for its twin check). A read or delete acts on the exact key alone, and list is bytewise. The module
pattern filters list and scan and refuses a key outside it; `store.list` takes an optional
literal bytewise key prefix (possibly ending on a slash) so a module reads its own keys
without walking the namespace. The posix mapping is
`<root>/<key><suffix>` under the workspace root, written by a same-directory temp (a dot,
the key file's name, and the `mktemp` tail, a name the key rule refuses, so a killed put
leaves a remnant and never a key) moved over the key under one namespace scope lock, so a
put lands whole or not at all. A file a posix root holds whose name the key rule refuses is
never listed, read, or written: the leftovers probe counts it as a refused key, and the
sweep moves it into a backup on the human's word. A
namespace that declares a `fallback_root` is read from its root first, then from the
fallback: `store.get`, `store.list` (the union, each key once, the root's copy
shadowing), `store.scan`, `store.search`, and the key probe; `store.put` and
`store.batch` write the root alone, and a delete (alone or as a batch action) removes the
key from both roots, so an old value never resurfaces, then each folder it emptied above
the key in either root (`store_prune`): from the key's own folder upward, one `rmdir`
each, stopping at the first folder that still holds an entry and never removing the root
itself, under the namespace lock it already holds; a batch prunes only after its whole
commit landed, so a rolled back batch restores every key into its folder, and a dropped
store container or a deleted unit's last artifact leaves no empty folder. Before it writes, a put, a delete,
or a batch (after its validation) moves each written key's top segment folder from the
fallback to the root under the namespace lock it already holds, when the fallback alone
holds it: one `mv`, the root made first when absent, so a module's write moves its folder
whole with no call of its own; the move that empties the fallback root removes that
root (one `rmdir`, which refuses silently while any entry remains, so a root still
holding a folder or a file stays and nothing is printed); a folder already in the root,
or a namespace without a fallback, costs one folder check at most and no process; a folder both roots hold refuses
rc 1 `ERR_ENTITY_EXISTS` naming the prefix (a batch in its action line) with nothing
written. A call that served a key from the
fallback and answers rc 0 prints one stderr line, `<function>: notice: namespace '<ns>'
was read from its deprecated fallback root`, naming no folder; a refusal keeps its one
line. The optional `store.promote <namespace> <prefix>` moves the prefix's folder from the
fallback to the root in one `mv` under the namespace lock (the root's parent folders made
first, a killed writer's residue moving with the folder), the card declaring the
`store.promote` token; a move that empties the fallback root removes it as the write
path's does, and a `none` answer over an empty fallback root removes that root too, so a
sweep after every prefix has moved leaves no empty deprecated root, while the storage
layer keeps its empty root when it holds no unit, the sweep then promoting nothing; sqlite keeps namespace and key
with no root, never reads a fallback, and does not declare it. The batch holds that lock once, validates the whole action list against the live keys, stages
a value per put, and commits every key under one store-scope undo log; its first failure
prints `store.batch: error: action <n> (<op> '<key>'): <message> (<CODE>)`, 1-based, and
nothing is written. The namespace lock (`.contexture/tmp/locks/store-<namespace>.lock`
while the drawer's scratch folder is writable, else under the per-user
`contexture-<user>` folder in the system temp, one rule for a writer and the health probe
on both drivers; the unit module's unit locks keep their own folder,
`locks/unit/`, so no unit name meets a namespace lock, and the library lock its own,
`locks/lib/`) carries its holder's pid: a waiter polls every 0.1 s, removes
a lock whose pid is gone at once, gives a pid-less lock ten polls of grace, and refuses a
live holder rc 2 `ERR_STORAGE_LOCKED` after 600 polls (60 s of sleep), the unit lock's
wait (the unit module's README names why and how it was sized); where `sleep` refuses a
fraction, a poll sleeps 1 s and counts as ten. A write interrupted (HUP, INT, TERM) while
it holds the lock releases it; a writer interrupted while it still waits removes nothing,
so the live holder keeps its lock and no third writer enters beside it. While a writer
holds the named namespace's lock (`store-<namespace>.lock`), `storage.health <namespace>`
reports `locked` in place of `ok` on either driver, and another namespace's lock leaves it
unlocked; a pid-less lock counts as held, a lock whose holder pid
is gone does not, since the next writer removes it.

A storage move stops every writer at once through the resolver's own marker,
`.contexture/tmp/locks/storage-moving`, a folder beside the lock families named to meet
none of them, and never in the system temp. `driver-resolver move-freeze <pid> <target>`
takes it for the holder pid (mkdir, exclusive), writing the target, the source (the driver
the take's own call resolves), then the pid, and answers rc 0 only once the writes already
past the check have drained: it polls `storage.health` through the source driver for every
namespace `store-data --list` names until none reads `locked` for 20 polls in a row 0.1 s
apart (a namespace found locked is probed first from then on); one still locked past the
shared 600 polls removes the marker and refuses rc 2 `ERR_STORAGE_LOCKED` naming the
namespace, and a listing or a probe that fails removes it and refuses rc 2
`ERR_STORAGE_READ`. A malformed holder pid (not a positive number), a dead one, or a target
name outside the driver name rule refuses rc 1 `ERR_INVALID_ARGUMENT`, a target found nowhere
rc 2 `ERR_DRIVER_NOT_FOUND`, a live holder's marker rc 2 `ERR_STORAGE_LOCKED` at once (one move
at a time), and a lock folder that cannot be written rc 2 `ERR_STORAGE_WRITE`, nothing
frozen. A dead holder's marker is reported on stderr naming its target,
`driver-resolver: notice: a crashed move to driver '<target>' left its freeze, removed now;
that move needs its recovery`, then removed, and a pid-less one after ten polls of grace.
`move-release <pid>` removes the marker only when its pid is the named one (an absent
marker answers rc 0; another holder's stays, rc 1 `ERR_INVALID_ARGUMENT`), and the read
only `move-state` answers one line: `free`, `held <target>`, or `stale <target>` (a holder
pid that is gone; a pid-less marker reads held). While a live holder's marker stands, every
dispatched function but the reads (`store.list`, `store.get`, `store.scan`,
`store.search`, `storage.health`, `storage.leftovers`, `capability`, and `storage.sweep`
with `--dry-run`) refuses at once, before the key gate reads any stdin and before any
driver runs, whichever driver it addresses; a function a later contract adds is a write
until it is listed. A put or a batch meets the marker test a second time once the key gate
has staged its stdin, so a write that passed the first test before a take and was still
reading its stdin when the take answered refuses too, its staged payload removed; the drain
covers the writers past both tests, which hold or wait on a namespace lock. The move's own
calls pass: the holder pid in `CTX_STORAGE_MOVE` (the
token the holder exports into the move's own runs alone) with the resolved driver its
target, or with the resolved driver its source for a `store.batch` whose staged actions
are deletes alone. A marker whose holder pid is gone freezes nothing (a writer passes it
and leaves it for the next take, which could otherwise remove a new move's marker); a
pid-less one counts as held. With no marker a put and a batch pay two `[ -d ]` tests
(before the key gate and after its staging), every other write one, and a read nothing; a
marker is read with the `read` and `kill` builtins alone. A HUP, INT, or TERM
to a draining take stops its probe, removes its marker, and exits 129, 130, or 143. A
caller that runs the take in the background from a non-interactive shell hands it INT
ignored on entry, which no shell can trap or reset, so that caller stops it with HUP or
TERM.

The scan answers the namespace's admitted keys with the raw value in
base64, no limit; the module decodes and stops after the keys it needs. The posix scan reads
the namespace in one pass: the root's keys as the listing walk reads them and each key only
the fallback root lists placed where a get reads it, merged bytewise into runs of paths of at
most 32768 bytes (so no call meets the system's argument limit), each run sized by `wc -c`,
read by one `od -tx1` into one `awk` that splits the stream back into the values by those
sizes and encodes three bytes at a time from a buffer of at most one `od` line and two bytes (linear
in a value's size on every supported awk), then sized again; its external commands grow with
its runs, never with its keys. A run whose file cannot be sized or read, or changed size while
the run read it (a write landing beside the unlocked scan), drops the pass, and the scan is
read again key by key through `store-b64`, which skips a key gone since the listing and names
the key it cannot read, so one value's bytes never land in another's. `store-b64` prints a
value only when its `od` succeeded and read as many bytes as the file held, sized before or
after the read (a value renamed over the file between the two answers one version whole), so
a failed or short read refuses the scan rc 2 naming the key, never answering part of the
value. A run's `od` and `awk`
run in the background under the `wait` builtin, so a hangup, interrupt, or termination stops
them at once, the `od` ending on its pipe. No driver keeps a
change log: a module's delta is its own (the docs module's is git), and `store.changes` is
an unknown function rc 2.

Search answers one shape on every driver: `{"namespace","query","mode","total_matches",
"results":[{"key","entity_type","entity_id","section","snippet","score"}]}`. `exact` is
the record rule over the raw stored value: a line matches when the query is a substring of
it after ASCII case folding, a column-0 comment never matches, one row per entity and
section, the snippet the first matching line with its label and quote pair trimmed, every
score 0. The answer carries the entity identity the document rules derive; the flat and
generic fallbacks answer the one document with its key as the id. The exact walk collects
every match before printing, so `total_matches` counts every pair and the limit applies
after the walk, in bytewise key then line order; a limit of 0 answers every result, the
unlimited read a module uses to sort into its own text order and cap there. The searched
text is the stored value: the canonical source is the module's canonical render, which the
module writes through the storage layer, and the core never re-renders a module's grammar (a
legacy value is searched as stored). The document set comes from the search schema: the
flat form reads one document per key (section `body`), the document-set form one document
per entity; a module with no schema falls back to the generic raw value. The search mode
is registered by the driver, never declared by a module: the descriptor's `search_modes`
is a list of `{name, description}` objects, `exact` alone at contract 4, `driver-resolver
modes` prints the registry one `name<TAB>description` line per mode, and the library's
`store_modes` answers it (any argument refuses). Every driver refuses any other mode
naming its registry, `exact`. Posix declares the optional tokens `store` and
`store.promote`; the resolver refuses any optional token outside `store` and
`store.promote`.

## Errors

Every store function answers one compact JSON line on success. A refusal is rc 1 (the
caller's input or the module's rules) or rc 2 (storage or driver failure), nothing on
stdout, and exactly one stderr line `<function>: error: <message> (<CODE>)` over the
existing core codes. The batch names its 1-based failing action:
`store.batch: error: action <n> (<op> '<key>'): <message> (<CODE>)`; only the first failure
prints, and nothing is written. The resolver's key and value gate refuses in that same
shape, under the dispatched function's own name, before any driver runs, and so does the
storage moving freeze, rc 2 at once: `<function>: error: storage is being moved to another
driver; retry after the move ends (ERR_STORAGE_LOCKED)`; each module re-frames it under its
own label (`entry.record: error: ...`, `store put: error: ...`, `ctx docs header: ...`). The scan uses the storage layer's codes (a malformed namespace or
data declaration is `ERR_INVALID_ARGUMENT`, an undeclared namespace
`ERR_ENTITY_NOT_FOUND`, an unreadable key or store `ERR_STORAGE_READ`) and stages its
answer, so a read failure midway prints no partial line. The library's caller lookup
refuses a caller it cannot place (a script run by a relative path, or one in no module
folder) with its one line under the store function's name, `ERR_INVALID_ARGUMENT`.
`ERR_SCHEMA_VIOLATION` is a tier 1 code the
library owns, outside the core code table: its field validator answers it for a write that
breaks a container's declaration, and the docs module for a write its grammar refuses (a
field its edit engine checks, or a result that fails its grammar audit), rc 1 and nothing
written. A module may still mint its own tier 1 code; core codes are
never redefined. The resolver's `driver-resolver: ERROR: ...` line is the one shape exception,
its own commands' refusals among them (`move-freeze`, `move-release`, `move-state`), and the
library passes it through unchanged.

The interrupt rule: rc 0 means the write landed; after an interrupt any other exit means
check with a read before writing again.

A module declares its data in a `data` file beside its `module` file, one `field: value`
line per field and a line starting with `#` a comment. Only `key` is required; `root`,
`fallback_root`, `suffix`, the search keys, the repeated `unsearched` lines, and the
repeated `field` lines are optional. The namespace is never declared: it is the module's
folder name, its installed module name, so a `namespace:` line refuses as an unknown field
naming the fix (remove the line), as does a `changes:` line (the change log left the
storage contract at contract 4):

```text
key: <segment>/<segment>            # or a final <segment...> for a variable-depth key
root: <workspace-relative folder>   # optional; default: the namespace
fallback_root: <folder>             # optional; a deprecated root read after the root
suffix: <suffix>                    # optional; default: empty
search: flat|documents              # optional; the search schema form
format: text|json                   # optional; flat only; default text
fields: <field>, <field>            # optional; flat only; validated, read by no search
title: <field>|key|head             # optional; flat default key, documents default head
snippet: line                       # optional; default line
document: <key-pattern> <section> <entity-type> <head-marker|->   # repeatable
unsearched: <key-pattern>           # repeatable; a document no search schema names
field: <name>: <required|optional> <line|block> [list] [one-of <A|B|...>] [default <value>]   # repeatable
```

A `field` line declares one field of the module's container in the library's field
grammar (The library, below), exactly as a store declaration writes it: the blanks after
`field:` are the file's separator, while the declaration keeps its own, one blank between
clauses and none trailing, so a trailing blank refuses. For example:

```text
field: what: required block
field: status: optional line one-of OPEN|PICKED|DROPPED default OPEN
field: dumped: optional line default today
```

The reader checks every field line through the library's field validator (its engine and
its reserved names, found beside the reader) at every read of the data file, and refuses a
malformed line, a reserved name, or a name declared twice rc 1 naming the data file line,
`store-data: line <N>: <the validator's reason>`; a data file without a field line never
runs the validator. The `fields` key above is the flat search schema's, a different key.

An `unsearched` line names the key pattern of a document the module reads that no search
schema names (placeholders and literal segments, as a document rule's pattern): the unit
module declares its whole document set this way, seven lines (`<unit>/state`,
`<unit>/backlog`, `<unit>/knowledge`, `<unit>/journal`, and a lane's
`<unit>/lanes/<lane>/recipe`, `journal`, and `report`), since its search is its own exact
rule over the canonical render. The leftovers probe and the sweep count a key a document rule
or an `unsearched` line names as a document; every other key the pattern admits is a key
outside the document rules, which the sweep moves. A namespace declaring neither counts
every key a document.

The namespace is the module folder's name, a token of lowercase letters, digits, dot,
underscore, and dash, starting with a letter or digit (the module name rule); the
key pattern carries one `<name>` placeholder per slash-separated segment, and its final
segment may instead be `<name...>`, which admits one or more key segments (a module's main
and deeper keys share one pattern: `key: <unit>/<path...>` admits `unit/state` and
`unit/lanes/x/report`). The root is a workspace-relative folder inside the workspace and
defaults to the namespace; the fallback root, when declared, is such a folder too, neither
equal to the root nor nested with it (one inside the other), and a file store reads it
after the root and never writes it. A declared root and fallback root apply only under the
module's own name: an extension module an install record names as installed under an
alias (its `module <installed name> <original name>` line holding two names) answers its
namespace as the root and no fallback root, so two installs of one module never share a
store, and an install record area that exists but cannot be read refuses such a module
rc 2. The suffix defaults to empty, holds at most 48 bytes, and is empty only beside a
fixed depth key pattern: the reader refuses rc 1 naming the key line a data file whose
suffix is empty while its pattern ends in a `<name...>` placeholder (one key could be
another key's folder) and naming the suffix line a suffix past 48 bytes (a 200 byte
segment, the suffix, and the put temp's 7 bytes fit a 255 byte file name). The search
form is `flat` (one document per key, section `body`; `format`, `fields`, and `title`
shape the document) or `documents` (the repeated
`document` rule names the key pattern, the section, the entity type, and the optional
column-0 head marker that starts an entity; a key no rule covers stays searchable as one
generic document). The reader refuses an unknown field. The namespace `<ns>` is served by
the data file of the module folder named `<ns>`, the workspace modules root first, then
the extension root, as discovery resolves a module name (a workspace module shadows an
extension module of its name), then the kept data: a package uninstall answered keep
retains a data carrying module's declaration under its installed name in the install
record area, `.contexture/extensions/.state/retained/<ns>/`, holding `data` (a byte copy
of the module's data file) and `origin` (the `package <name>`, `version <v>`, and
`module <installed name> <original name>` lines), so the namespace stays declared,
listed, and movable while no module serves it; the reader hands the origin to its alias
rule, so an aliased kept namespace keeps its namespace as its root and no fallback root,
and an origin it cannot read refuses rc 2 naming no path. No file named `module` ever sits
there, so the library's caller lookup never answers a kept namespace; the same package's
install takes the declaration back. `store-data <namespace>` answers one namespace on ten fixed lines, then the document
rules, and never the fallback root, so a parser reading by position ignores the field;
`store-data <namespace> --with-fallback` answers the fallback root as line 11 (an empty
line when none applies) and the rules from line 12, the form the posix driver reads;
`store-data <namespace> --with-fields` (alone or beside `--with-fallback`, in either
order) answers, after the rules, one tagged line per declared field,
`@field<TAB><name>: <spec>`, in declaration order, the form the library's `fields_own`
reads; no document rule starts with `@`, and a reader that does not ask never sees the
family, so the plain and fallback answers stay byte for byte as before (the sqlite driver
reads only its fixed lines, so a field line never reaches it); `store-data <namespace> --with-unsearched`, beside the other flags in
any order, answers after the rules and before any field line one tagged line per
`unsearched` line, `<TAB><pattern>`, in declaration order, the form the posix
driver's leftovers probe and sweep read, every other answer byte for byte as without it;
a data file names no search modes, and a `modes` line refuses as an unknown field naming
the fix;
any other argument after the namespace, or a repeated flag, refuses rc 1; the field lines
run through the library's `fields_decl_check` over a scratch copy (the verb's scratch root,
else the drawer's scratch folder), and a missing field validator or a scratch copy that
cannot be written, when a field line needs them, refuses rc 2. `store-data --list` answers
every valid declaration of both module roots, one `<namespace><TAB><root>` line each (the root the
namespace when none is declared or the module is installed under an alias, then
`<TAB><fallback root>` when one applies), sorted
by namespace, the kept declarations among them in the same row shape, a name both roots
hold answered once (the workspace module's), and leaves out a declaration it cannot read
(a malformed one, or an extension module's whose install record area cannot be read), a
module folder whose name is no namespace token, a kept declaration a module root's name
shadows, and kept data it cannot walk, one stderr line each, then exits 1 with the rows it
read, so a reader never takes a partial listing for the whole (rc 0 when nothing is left
out, rc 2 with no module drawer). `store-data --retained` answers one
`<namespace><TAB><package><TAB><original module name>` line per kept declaration no
module root shadows, read from its origin, sorted by namespace, leaving out a shadowed one
or an unreadable origin with one stderr line each and then exiting 1, so an enumeration
names a namespace kept and the package that kept it.

`scripts/store-clear` is the one place a namespace no module serves is emptied: `store-clear
count [--driver=<name>] <namespace>` prints the number of keys the namespace lists,
`store-clear namespace [--driver=<name>] <namespace>` deletes every key it lists, and
`store-clear keys [--driver=<name>] <namespace> <key file>` deletes each key the file names
(one per line, in the payload escape a listing answers) that the namespace still lists,
each printing the number deleted. Every call goes through the resolver from the workspace
root (`CTX_ROOT`, else the nearest drawer above the working folder) with `CTX_DIR` unset
and the caller's environment otherwise passed through (a move's token among it, never
demanded), the driver the one `--driver` names or the configured one; the deletes go in
`store.batch` calls of at most 200 delete actions in listing order (posix deletes about 14
ms a key at any batch size from 50 to 1000, so the bound sizes the all or none unit and the
staging), and a key the namespace no longer lists is skipped, so a run that stopped part
way finishes when run again. A refusal is one line, `store-clear <command>: error: <message>
(<CODE>)`: rc 1 a bad argument, a failed listing or batch keeping its own rc and code with
the message naming the namespace and, for a batch, the keys deleted before it; its scratch
is one folder under the per verb scratch root, else the drawer's scratch, removed on exit,
and a hangup, interrupt, or termination stops the resolver call in flight (129, 130, 143).
The package uninstaller counts and deletes a package's namespaces through it.

## Moving the records to another driver

`scripts/store-move` is the move engine the package installer drives when the storage
driver changes (no summary line, so never a verb; the installer's whole run, its answers,
hooks, unwind, and crash recovery, is docs/the-engine.md's Moving a record between backends). It moves every namespace
`store-data --list` names, the kept ones included, from one driver to another through the
resolver, the driver named by `--driver=<name>` on every call and the namespace as the
store function's argument, from the workspace root with `CTX_DIR` unset, so the key and
value gate, the storage moving freeze, and the write rule all apply. The installer runs it
under the freeze it holds and exports the freeze token (`CTX_STORAGE_MOVE`) into each
command; the engine passes it through and never demands it.

```text
store-move preflight <source> <target>      every check, nothing written
store-move copy <source> <target>           the preflight, then the copy and its verify per namespace
store-move check <source>                   after the storage.driver switch: the source against the configured driver
store-move unwind <target>                  deletes the keys this run wrote that the target still lists
store-move retire <source> <backup|delete> [<stamp>] [--rescan]  after a passed check: the old copy backed up or not, then deleted
```

Every command first refuses rc 1 `ERR_INVALID_ARGUMENT` while a `CTX_STORAGE_` variable
other than the token is set (a `CTX_STORAGE_DRIVER` override, or a location variable a
custom driver reads, would point a driver at another store), and a namespace listing that
exits non zero refuses rc 2
`ERR_STORAGE_READ` quoting its first reason. The preflight reads every namespace, then
refuses in this order: rc 2 `ERR_STORAGE_READ` a source namespace whose `store.list` reads
no key while its `storage.health` reads the store present (a blind source); rc 1
`ERR_INVALID_ARGUMENT` each source key outside the core key rule (`store-key.awk`) or
outside the declaration's document patterns (its `document` and `unsearched` lines, read
from `store-data <ns> --with-unsearched`, every key a document when it declares neither),
one indented line per key; on a source named `posix`, rc 1 `ERR_INVALID_ARGUMENT` when
`storage.leftovers` counts refused keys or keys outside the document rules in either root,
one line per namespace with the counts and the way to clear them (`ctx unit migrate --sweep
--dry-run --all` for unit, `ctx store check --leftovers --sweep --dry-run` for store, the
human's own act elsewhere), every other leftover kind a `note:` line on stderr and left in
place (a killed writer's dot named temp among them, which no listing names, so it is never
copied); and rc 1 `ERR_ENTITY_EXISTS` a target namespace that already lists a key, with its
count, since a move never merges.

The copy runs the preflight, then for each namespace scans the source once into scratch,
splits the scan line on the item brace (`tr '{' '\n'`, so no awk record holds the whole
namespace), turns each item into `action=put`, `key=<the scan's key string>`,
`value_b64=<the scan's base64>` with no decode, and writes the target in `store.batch` calls
of at most 200 puts and 8 MiB of decoded values, a larger value alone. Each batch's keys are
appended to the namespace's written keys file before the batch is sent, so the unwind
covers a batch that landed while a signal stopped the engine. The verify scans the target,
compares the two scans with `cmp` (its exit code read alone), and counts five ways, the
source list, the source scan's items, the sum of the batch answers' `actions`, the target
scan's items, and the target list, all equal, with `storage.health` reading the store
present on each side exactly when its count is above zero: two empty dumps compare equal,
so the counts catch a source whose scan is blind, and the health catches one blind to both
its list and its scan. The source's scan is trusted for its values: a source whose scan
answers wrong values beside a true list copies them, and the check reads them again alike,
so the behavior test, which holds a driver's scan to posix before the driver holds data, is
that guard. A failure refuses rc 2 `ERR_STORAGE_WRITE`, the diagnosis from the
two dumps on indented lines (`<key>: missing in the target`, `<key>: extra in the target`,
`<key>: the value differs`), with no further driver call; a refused batch stops rc 2
`ERR_STORAGE_WRITE` naming the namespace and the keys written so far.

The check, run after the installer switches `storage.driver`, refuses rc 1 while the
configured driver still resolves to the source or the run holds no copy from it, then scans
the source again through `--driver=<source>` and the configured driver with no override,
compared and counted the same way (the copy's answer sum the third count), so a source write
that slipped in after the copy's scan, or a configured driver reading another store, fails rc
2 before the move is trusted. The unwind deletes, through `store-clear keys
--driver=<target>`, the keys the run's written keys files name that the target still lists,
so a key the run did not write stays and a rerun finds nothing to do; it refuses rc 1 a
driver that is not the run's target, and any unwind once the run holds a passed check
(`checked`), since the configured driver then holds the record. The retire, after a passed check and once the configured
driver no longer resolves to the source, removes the run's written keys files first (no
unwind can then empty the only copy), on `backup` saves each namespace's checked source dump
to `.contexture/backups/move-<stamp>/<namespace>/scan` with its key count in `count` beside
it (an optional third argument gives the stamp: the installer passes its run's one stamp, so
the backup may already hold the run's other parts, such as a format change's
`@<driver>/` folder of the driver's own storage, and a rerun in the same run folder writes
the namespace folders again; without it the retire makes a fresh stamp), then deletes the keys each dump names through `store-clear keys --driver=<source>` (delete
only batches, which pass the freeze toward the source with the token) and requires
`store-clear count` to read 0. A trailing `--rescan`, with `backup` alone, serves a run
whose check can no longer pass because the configured driver took writes after a crash:
it needs only the run's copy from the source, takes the source's fresh scans in place of
the check's dumps, and reuses a namespace's `scan` the stamp's backup already holds, so a
rerun after a stopped retire never replaces the old copy's backup with what that retire
left. The output names the backup by its stamp alone. A saved dump
restores by one batch of puts built from it as the copy builds its payload:

```sh
tr '{' '\n' < .contexture/backups/move-<stamp>/<namespace>/scan \
  | awk 'index($0, "\"key\":\"") == 1 { s = substr($0, 8); i = index(s, "\",\"value_b64\":\""); v = substr(s, i + 15); sub(/".*$/, "", v); printf "action=put\nkey=%s\nvalue_b64=%s\n", substr(s, 1, i - 1), v }' \
  | .contexture/storage/scripts/driver-resolver store.batch <namespace>
```

The run's state lives in the run folder, `CTX_SCRATCH_ROOT` when exported (the installer
exports one folder into every command of a run), else `.contexture/tmp/store-move`: `move`
(the source and the target), `written.<namespace>` (the keys the copy wrote, one per line in
the payload escape), `copied.<namespace>` (the batch answers' sum), `checked.<namespace>`
(the check's verified source dump), and `checked` (the source a passed check named). Each
command works in one `work.XXXXXX` folder inside it, exported as `CTX_SCRATCH_ROOT` to every
call so a driver's staged scan goes with it, removed on exit; a hangup, interrupt, or
termination stops the resolver call in flight (TERM to the background child) and exits 129,
130, or 143, the written keys kept for the unwind. A run folder that cannot be written
refuses rc 2 `ERR_STORAGE_WRITE`; the system temp is never used. The scratch peaks near four
times the largest namespace's bytes (the two base64 dumps and the driver's staged scan), and
the check keeps every namespace's source dump until the retire.

Output is one stdout line per namespace and one summary line:

```text
docs: 20 keys copied, dumps equal
notebook: 20 keys copied, dumps equal, kept by package 'pkg-a'
copied 40 keys in 2 namespaces
```

`preflight` prints `<ns>: <n> keys to copy` and `ready to copy <n> keys in <m> namespaces`,
`check` `<ns>: <n> keys, dumps equal through the configured driver` and `checked <n> keys in
<m> namespaces`, `unwind` `<ns>: <n> keys unwound` and `unwound <n> keys in <m> namespaces`,
and `retire` `<ns>: <n> keys retired` and `retired <n> keys in <m> namespaces` closed by
`backup stamped <stamp>`, `no backup kept`, or `nothing to back up`. A refusal is one stderr
line, `store-move <command>: error: <message> (<CODE>)`, rc 1 semantic and rc 2 storage over
the existing codes, its keys, counts, or diagnosis on indented lines after it; nothing printed
names a storage, scratch, or driver path. Measured on one host through the storage-sqlite
install and uninstall at 3428 records (37.9 MB of unit values): the copy into sqlite takes
about 106 s (the posix scans 13 s, the sqlite batches 76 s), its check 29 s, and its retire
57 s; the copy back into posix about 104 s (the posix batches 76 s, the posix verify scan
13 s) and its check 29 s. A posix scan of that unit namespace takes about 12.5 s, 3.7 ms a
key, where a key by key scan took about 60 s.

## The behavior test a driver meets

The handshake reads a driver's card; `scripts/driver-behavior` holds its behavior to posix.
It is a private script (no summary line, so never a verb) in plain POSIX sh and awk with the
utilities the core already uses (`cat`, `cmp`, `cp`, `dd`, `env`, `mkdir`, `mktemp`, `mv`,
`rm`, `rmdir`, `wc`, and `od` through `store-b64`), so an adopter needs no test harness. Its
caller is the package installer, which runs it in the foreground on an
incoming driver part after the package files land and before the driver's prepare hook, rc 0
letting the install go on and any other answer unwinding it, its one line relayed. A driver author runs it by
installing the driver package into a throwaway workspace (`ctx package install <package
root>`); no guide names the script as a command to run. Until the installer's call lands,
the drivers project runs it upstream (`tests/drivers/driver-behavior.test.ts`).

The argument is the driver part as a package ships it, `storage/drivers/<name>`: a folder
holding an executable `driver`, or the executable itself, its base name the driver name
under the installer's driver name rule (letters, digits, dot, underscore, dash, not opening
with a dot), `posix` refused; `--all` prints every differing step. A bad argument refuses
rc 1 with one line, `driver-behavior: error: <message> (ERR_INVALID_ARGUMENT)`.

What it stages: one work root by `mktemp -d` in the drawer's scratch folder (a drawer that
cannot hold it answers cannot run, never the system temp) holding two scratch workspaces,
each a copy of this storage folder, the configuration library, and two synthetic namespaces
declared by data files alone: `flat` (`key: <a>/<b>`, no suffix) and `deep` (`key: <p...>`
with a 48 byte suffix, so a 200 byte final segment meets posix's 255 byte name limit
exactly, the suffix and the 7 byte temp tail added). The reference keeps the core posix
driver; the candidate holds the part at `.contexture/extensions/storage/drivers/<name>` with
`storage.driver: <name>`, its configured driver, never an override or a path, and a
candidate that does not resolve there (a core driver of its name shadowing it) answers
cannot run. Every call runs that workspace's own `driver-resolver` from its root under
`env -i` with `PATH`, `HOME`, `USER`, `TZ`, `LC_ALL=C`, `TMPDIR` and `CTX_SCRATCH_ROOT`
inside the root, and `CTX_ROOT` the root, so an exported `CTX_ROOT`, a `CTX_DIR`, a
`CTX_STORAGE_DRIVER` override, and any other `CTX_STORAGE_` variable never reach it. The
two sides run as two background jobs over the same steps, every one through the resolver's
dispatch (the handshake and the key and value gate before the driver) and none sending an
input the gate refuses, since that compares the core with itself.

| ids | group |
|---|---|
| `k01` | the card through the resolver's `check`, first |
| `h01` `l01` `c00` `g00` | the empty store: health (degraded, absent), list, scan, an absent get |
| `p01` to `g06`, `h02` | values by put and get: one, an overwrite without a final newline, empty, NUL bytes, invalid UTF-8, every byte value; health with keys (ok, present) |
| `p07` to `p10` | every allowed key character and a leading digit |
| `q01` to `q08`, `l02` to `l09` | list order across dash, dot, slash, digit, upper case, underscore, lower case; prefixes ending mid segment, on a slash, a dot, an underscore (literal), and a dash, a whole key, and the other case (nothing) |
| `p20` to `l11` | the longest keys: a 200 byte final segment, a 512 byte key of three segments, a 512 byte key of 256 segments, the lists below them; the three segment key sits below the 200 byte key, a key below another key as `o/a` below `o` |
| `t01` to `t09` | ASCII case twins refused: the whole key, a get in another case, a leading segment, in a batch against a stored key and within one batch, nothing written |
| `b01` to `b19` | batches: in order with a delete of a key put earlier, a failing third action, a twin, a put and a delete of one key, NUL, invalid UTF-8, and empty values, a malformed base64 value, an unknown payload line, a key put twice; each failing batch leaving nothing |
| `m01` | a batched get: present, empty, NUL, invalid UTF-8, missing, repeated, in the asked order |
| `s01` to `s06` | the exact search: case insensitive, never on a `#` line, the limit after the walk, a ranked mode refused |
| `c01` `c02` | the scan of both namespaces |
| `r01` to `r05` | the driver's own refusals: a key outside the pattern, an undeclared namespace, an unknown function, an extra argument, a missing key |
| `h03` | health locked while a live namespace lock is planted in the workspace's lock folder |
| `v01` to `v03` | the value at the cap: 16777216 bytes holding every byte value with a newline every 65281 bytes, by put, get, and delete alone, never in a scan or a batched get |
| `x01` to `x07`, `h04` | the deletes: a key, the same key again, a get of it, a batch per namespace deleting every key the run wrote, both lists empty, health ok with the store absent |

The comparison: the exit code, the stdout bytes by `cmp -s` on captured files (never a
shell variable or awk), and the stderr shape, nothing on rc 0 and on a refusal one line on
both sides with the same function before `: error: ` (the resolver's `driver-resolver:
ERROR:` line counting as its function) and the same code in its last parentheses, the
message free. `k01` compares the exit code and the stderr shape alone; the health steps
compare the `health` and `store` fields of an answer in its shape, one stdout line holding
exactly the keys `driver`, `health`, `detail`, and `store` in that order, the driver name
and detail free (an answer outside that shape reads as such and differs from posix's). posix is the
reference, so no answer is kept here: each step carries its intent alone, hold or refuse,
and a reference that refuses a step it must hold, holds one it must refuse, writes to stderr
while it holds one, or refuses without one line naming its function and code answers cannot
run, never same.

The answer, one stdout line naming no path:

```text
driver behavior: same: <name> answers the 100 steps as posix does          rc 0
driver behavior: differs at step <id> (<title>): <what differed>           rc 1
driver behavior: cannot run: <reason>                                      rc 2
```

A difference names the first differing step; with `--all` every differing step's line comes
first and the answer line last. A hangup, interrupt, or termination stops both sides (each
sends a termination to its call in flight and waits for it), removes the work root, and
exits 129, 130, or 143; every run leaves the drawer's scratch folder as it found it and no
process behind. No per step watchdog runs: a hung candidate waits until interrupted.

The isolation requirement a driver meets: run from a scratch workspace root as that
workspace's configured driver with only the environment above, it keeps every byte it
writes under that root (a file or database driver at its default place in the workspace's
drawer). A driver that cannot, one that needs a location from anywhere else among them,
cannot be tested, and so cannot be installed. The test cannot see a write outside the
root; upstream, the drivers project proves the requirement for the bundled
drivers with a fingerprint of a mock live workspace.

## Discovery and selection

`storage.driver` in `.contexture/config` selects the driver (declared in
`base/.contexture/storage/config`; a driver package's install writes it once the record has
moved into its driver and its uninstall removes it once the record is back in posix, the
move described above). The setting is the installer's: `ctx store config set driver` and
`unset driver` refuse naming `ctx package install` and `ctx package uninstall` (an unset
lands only while the configured driver resolves nothing, so nothing is reachable through it),
and an installed driver package's own settings refuse a change while its driver holds data.
The baseline is `posix`. `driver-resolver` reads configuration through the shared internal
config library (`base/.contexture/config-lib`, unified `:` / `=` grammar, exact key
matching, quote unwrapping, inline `#` comment stripping, first non-empty value wins). The
legacy `.contexture/storage.conf` and the `session.storage.driver` key stay readable as
transitional compatibility.

The one off overrides, `--driver=<name>` or `-d <name>` on the resolver and
`CTX_STORAGE_DRIVER`, read only: they select the driver for every read (`store.list`,
`store.get`, `store.scan`, `store.search`, `storage.health`, `storage.leftovers`,
`capability`, and `storage.sweep` with `--dry-run`, the freeze's read list) and for the
resolver's own commands, while every other dispatched function is a write, and a write
through an override whose driver differs from the configured one refuses rc 1
`ERR_INVALID_ARGUMENT` with `<function>: error: the driver override '<name>' reads only;
writes go through the configured driver '<configured>' (ERR_INVALID_ARGUMENT)`, nothing
written and no driver run. The check, `move_override`, sits in both dispatch forms between
the freeze's `move_check` and the key and value gate, reads the configuration only for a
write that carries an override, and passes the move's own writes through the freeze's pass
rule (`move_own`, and the holder's delete only batch to the move's source that
`move_staged` checks), so a token outside a live freeze passes nothing.

The resolver finds a driver in two places alone, after the installer's driver name rule
(letters, digits, dot, underscore, hyphen; not empty; not opening with a dot) refuses any
other name rc 1 `ERR_INVALID_ARGUMENT` before any path is built:

1. `posix`: the storage core's `.contexture/storage/drivers/posix/driver`, then, for a
   drawer without its storage core beside a `base/` folder (this repository's layout), the
   base mirror's `base/.contexture/storage/drivers/posix/driver`;
2. any other name: the extension root's package driver,
   `.contexture/extensions/storage/drivers/<name>/driver` or the single file
   `.contexture/extensions/storage/drivers/<name>`, read by its path with no install record
   read (the sqlite driver is installed there; the behavior test and the test harness stage
   candidates there).

A name found in neither refuses rc 2 `ERR_DRIVER_NOT_FOUND` with the resolver's own line
naming the core posix driver and the installed driver packages. The workspace custom drivers
(`.contexture/drivers/`), the storage core's other names, the module owned drivers, the
base mirror's other names and places, `ctx-storage-<name>` executables on PATH, and a driver
named by its path are retired, and a workspace driver named `posix` no longer shadows the
core one: a driver reaches a workspace only as a driver package.

## The library

A module's script sources `.contexture/storage/scripts/library` and calls the storage layer
through it; the module never names the driver, and never names a namespace: the library
serves the calling module's own namespace alone, its installed module name. At the first
storage call (never when the library is sourced, since a lane verb sources the unit verb
library by path) it takes the calling script's path (`$0`, which a sourced file shares
with the script that sourced it), folds its `.` and `..` segments lexically (no symlink
resolved, so a linked module folder answers by the link's name, as discovery names
modules), and walks up to the nearest folder holding a `module` manifest: that folder's
name is the namespace, kept for the rest of the shell and passed to the driver, whose
contract keeps its namespace argument. A relative script path (a later `cd` would
misattribute it) or no module folder above the script refuses rc 1 with one line under
the store function's name, `ERR_INVALID_ARGUMENT`. The engine runs every verb, hook, and
part hook by its absolute path, so a module's scripts always place. Another module's data
is reached only through that module's `ctx` verbs (`get`, `search`). The library exports:

- `store_namespace`, the caller lookup's answer on stdout;
- `store_list [<prefix>]`, `store_get <key>...`, `store_put <key>`, `store_delete <key>`,
  `store_batch`, `store_scan`, `store_search <query> <mode> [<limit>]`, each over the
  caller's namespace;
- `store_modes`, the mode registry, `exact` alone (any argument refuses);
- `store_get_into <targets>`, the batched read into files: the targets file
  holds one `<key><TAB><path>` line per key in the asked order; one `store.get` call answers
  every key (the one key form for a single key), each present value lands in its path byte
  for byte through `store-pack unpack`, and one `1<TAB><key>` or `0<TAB><key>` line per key
  prints on stdout; a refused call passes its rc and its one line through;
- `store_promote <prefix>`, the optional promotion (ask `store_has
  store.promote` first);
- `store_require <capability>...` and `store_has <capability>`;
- `store_roots`, the declared roots read through `store-data --list` (found beside the
  resolver the library calls, then under the drawer, then in the base mirror), never the
  driver: one `<namespace><TAB><root>` line per declared root, a fallback root on its own
  line after its root; the whole list or none: rc 2 with one `store.roots: error:` line,
  `ERR_DRIVER_NOT_FOUND` when no data reader is found and `ERR_STORAGE_READ` quoting the
  reader's first reason when the listing left a module out (a data file it cannot read)
  or failed (no module drawer), never a partial list; it reads its reader's exit inside an
  or list, so a caller under `set -e` still gets the refusal line;
- `store_leftovers`, the driver's `storage.leftovers` over the caller's own namespace, its
  one JSON line on stdout (a driver without the method passes its unknown function line
  through, rc 2), and `store_leftovers_text <answer> <summary|kinds>`, the one text form
  of that answer, naming no folder, through the storage core's flattener: `summary` prints
  one line per root (`root:`, `fallback root:`), its state (`absent (not made yet)`, `none
  declared`, unreadable, a symbolic link) or `<documents> documents in <entries> entries`
  with `nothing beyond them` or `beyond them:` and each kind found with its count and
  bytes; `kinds` prints one `<root label>: <kind>: <count> (<bytes> bytes)` line per root
  and kind found (a root it cannot walk on one line too) and nothing when nothing lies
  beyond the documents; the flattened answer stages at `<answer>.flat` beside the
  caller's file, and a malformed answer refuses rc 2 with one `store.leftovers: error:`
  line;
- `store_sweep [--dry-run] [--delete] [--stamp=<stamp>] [--prefix=<prefix> | --loose]`,
  the driver's `storage.sweep` over the caller's own namespace, its one JSON line on stdout
  (a driver without the method passes its unknown function line through, rc 2), and
  `store_sweep_text <answer> <summary|kinds|close> [<answer>...]`, its one text form,
  naming no folder, on the same kinds table: `summary` prints one line for the answer,
  `<kind> <n> (<bytes> bytes), ...; <e> folders emptied` over both roots or `nothing beyond
  the documents`, followed by `, leaving <n> unreadable folders untouched (their rights
  need fixing)` when the sweep left any (`nothing swept, leaving ...` when it swept
  nothing); `kinds` prints one `<root label>: <kind>: <count> (<bytes> bytes)` line per
  root and kind swept, `<root label>: folders emptied: <n>` and `<root label>: unreadable
  folders left: <n>` when any; `close` prints the one closing line over every answer
  given, the items, bytes, emptied folders, and folders left summed: `swept: moved <n>
  items (<bytes> bytes) into the backup stamped <stamp> and emptied <e> folders`,
  `swept: deleted ... with no backup kept ...`, `swept: nothing beyond the documents;
  nothing moved`, or for a dry run `dry run: would move|delete ...; nothing written`, each
  naming the unreadable folders left in the same words (`swept: nothing moved, leaving
  ...` when only those remain); a malformed answer refuses rc 2 with one `store.sweep:
  error:` line;
- the shared checks, each silent with rc 0 for a pass, 1 for a fail, and 2 when the check
  cannot run: `lib_utf8_ok <string>` and `lib_utf8_file_ok <file>`, the UTF-8 check (RFC
  3629: no overlong form, no surrogate, nothing above U+10FFFF), with its awk text in
  `LIB_UTF8_AWK` for a caller that folds it into its own awk program; the unit verb
  library and `ctx lane create` call it, keeping their own refusal lines;
- `lib_ref_ok <label> <ref>`, the full address shape check: one token `<owner>#<path>`,
  the owner the text before the first hash (lowercase letters, digits, dot, underscore,
  and dash, starting with a letter or digit), the path every byte after it, non-empty (a
  further hash belongs to the path: `file#<path>#<symbol>`), no blank (ASCII or Unicode),
  control character, or double quote; rc 1 prints one line
  `<label>: error: malformed ref '<ref>': a reference is <owner>#<path>, one token without blanks, control characters, or double quotes (ERR_INVALID_ARGUMENT)`.
  It checks the shape alone (an old short unit ref such as `journal#<slug>` passes): the
  owner's presence and the target's existence are the caller's: the unit and lane verbs
  refuse the retired short owners first, then call it, then check each target through
  its owner's get before any lock;
- `lib_lock` and `lib_unlock`, the library lock of the caller's namespace (`lib_lock`
  takes no argument and refuses one): one lock folder per namespace
  at `.contexture/tmp/locks/lib/<namespace>.lock`, its own family beside the unit locks
  (`locks/unit/`) and the drivers' namespace locks (`locks/store-<namespace>.lock`), so a
  holder calls every store function freely while a module's writers of the namespace wait
  their turn across a check and a write. The folder holds the holder's pid (the calling
  shell's `$$`) and `LIB_LOCK` names it while held; the wait is the namespace lock's (a dead
  holder's lock removed at once, a pid-less one after ten polls, a live holder refused rc 2
  `lib.lock: error: the library lock of '<namespace>' is held (60 s timeout) (ERR_STORAGE_LOCKED)`
  after 600 polls 0.1 s apart). A malformed namespace or a second lock in one process
  refuses rc 1 `ERR_INVALID_ARGUMENT`, an unwritable folder or pid rc 2
  `ERR_STORAGE_WRITE`. `lib_unlock` removes the lock the process holds (a no-op when none);
  the caller also calls it from its exit trap, so a signal frees the lock;
- the field validator, opt in, run over files the module stages (no storage read or write):
  `fields_decl_check <declaration>`, `fields_apply <declaration> <old record> <actions>
  <new record>`, `fields_effective <declaration> <record>`, `fields_conforms <declaration>
  <record>`, and `fields_reserved_ok <name>`, the engine being `scripts/store-fields.awk`
  (found beside the resolver, then under the drawer, then in the base mirror).
  A declaration holds one field line per field:

  ```text
  <name>: <required|optional> <line|block> [list] [one-of <A|B|...>] [default <value>]
  ```

  The name is lowercase letters, digits, underscore, and dash starting with a letter,
  never reserved (`json`, `limit`, `type`, `mode`, `container`, `id`, `ref`, `unset`,
  `stdin`, any `add-` or `remove-` name); a block takes no list, one-of, or default, a list
  no default, a required field no default, and `today` is the one dynamic default (the
  write's date, never with a one-of set). An actions file holds one tab separated action
  per line: `set`, `add`, or `remove <field> <value>` (the value in the payload escape),
  `unset <field>`, or `block <field> <base64 body>` (the body through `store-b64`; its one
  final newline dropped), the write forms `--<field>=`, `--add-<field>=`,
  `--remove-<field>=`, `--unset=`, and `--stdin=` one to one. A record is the unit record
  dialect: `name: "value"` per line value (the payload escape, a double quote as text), a
  list one line per item, a block `name ::` with its body indented two spaces, the declared
  fields in declaration order, a leftover after them in encounter order. `fields_apply`
  checks in a fixed order (the actions, UTF-8, a newline in a line value, an empty value,
  an unknown field, a value outside its one-of set, the action against the field's shape,
  a required field left absent), fills the defaults at create only, and writes the
  canonical result, nothing on a refusal; `fields_effective` fills an absent static
  default at read and never stores it; `fields_conforms` prints one `<field>: <reason>`
  line per field breaking the declaration and exits 1 when any prints;
- the checked record entry, for a module that declares its container's fields as `field`
  lines in its data file (the store reads its declarations from its own records instead,
  and both feed the one validator): `fields_own <declaration>` writes the caller's
  declared field lines to the file, one `<name>: <spec>` line each in declaration order
  (read through `store-data <namespace> --with-fields`; an empty file when none is
  declared; the reader's refusal re-framed under `fields.own`, rc 1
  `ERR_ENTITY_NOT_FOUND` for no data file, rc 1 `ERR_INVALID_ARGUMENT` for a malformed
  declaration); `fields_put <key> <actions> <record>` is a checked create and
  `fields_set <key> <actions> <record>` a checked change of one record of the caller's own
  namespace, each under the library lock (the one the caller holds, else its own for the
  call): the declared fields read, an existing key refusing a put rc 1
  `ERR_ENTITY_EXISTS` and a missing key refusing a set rc 1 `ERR_ENTITY_NOT_FOUND`, the
  actions applied by `fields_apply`'s rules (the defaults filled at create, today the
  write's date; an absent field staying absent on a change), the canonical record put at
  the key and written to the record file for the module to print back; `fields_get <key>
  <record>` writes one record with each absent static default filled at read, never
  stored, read only and lock free. A namespace whose data file carries no field line
  refuses each rc 1 `ERR_INVALID_ARGUMENT`; the validator's refusal carries the entry's
  label (`fields.put: error: field 'status': 'BOGUS' is not one of OPEN|PICKED|DROPPED (ERR_SCHEMA_VIOLATION)`),
  a store function's or the lock's refusal passes through as its own line, and a refusal
  writes nothing. The scratch sits beside the record file (`<record>.decl`, `.old`,
  `.new`, and `.t` with its answers) and is removed on return. A `ref` stays the module's
  own (a reserved name, so never a declared field), as the store keeps it.

## Errors

A store call passes the driver's answer and refusal through unchanged; the resolver's own
`driver-resolver: ERROR: ...` line is the one shape exception. The caller lookup's refusal
and the library's own checks use the one-line shape `<function>: error: <message> (<CODE>)`.

The module-addressed ref interface (`data_get` and `data_emit`) retired with the caller
lookup: a module reads another module's entity through that module's `ctx` verbs.

## The retirements

The session module's `scripts/driver-resolver` compatibility wrapper retired with the
unit module: the unit and lane verbs and the docs module reach this resolver directly. The storage module's `module` file and its `ctx help` listing retired
with the core move; the core is not a module.
