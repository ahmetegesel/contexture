#!/bin/sh
# test-store.sh: the generic module store on the plugin's own fts5 driver (the storage
# module's store contract): the five functions over one database, the change log's row
# order and fields, a refused write logging nothing, the one-transaction put's atomicity
# (a planted trigger aborts the write and rolls its change row back), the schema 4 open
# path that adds the store tables to a store created before them, and the old corpus
# tables (docs, doc_changes) staying untouched and unread.
#
# The sandbox stages base's storage module and the docs data file; the driver is the
# plugin's own copy, and its database is the sandbox's own store.
# Exit: 0 all pass, 1 a failure, 77 without sqlite3.
set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/../../.." && pwd)
MOD="$SCRIPT_DIR/../.contexture/modules/storage-fts5"
DRV="$MOD/drivers/fts5"
STORAGE_MOD="$ROOT/base/.contexture/modules/storage"
DOCS_DATA="$ROOT/plugins/docs-discipline/.contexture/modules/docs/data"

command -v sqlite3 >/dev/null 2>&1 || { printf 'SKIP: sqlite3 not found on PATH\n'; exit 77; }
for f in "$DRV" "$MOD/schema.sql" "$MOD/db-init.sh" "$STORAGE_MOD/scripts/store-data" "$DOCS_DATA"; do
  [ -e "$f" ] || { printf 'test-store: missing %s\n' "$f" >&2; exit 1; }
done

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -w "$ROOT/.contexture/tmp" ]; then tmp_root="$ROOT/.contexture/tmp"; fi
SB=$(mktemp -d "$tmp_root/fts5-store-test.XXXXXX") || exit 1
trap 'rm -rf "$SB"' EXIT INT TERM
mkdir -p "$SB/.contexture/modules/docs" "$SB/.contexture/tmp" "$SB/db"
cp -R "$STORAGE_MOD" "$SB/.contexture/modules/storage"
cp "$DOCS_DATA" "$SB/.contexture/modules/docs/data"
chmod +x "$SB/.contexture/modules/storage/scripts/"*

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
miss() { bad "$1"; }

O="$SB/out"; E="$SB/err"; RC=0
# f <db> <function> <argv...>: one driver call with its stdin already staged
f() { fdb=$1; shift; (cd "$SB" && CTX_STORAGE_SQLITE_PATH="$fdb" "$DRV" "$@" > "$O" 2> "$E"); RC=$?; }
answer() { [ "$RC" -eq 0 ] || miss "$1: rc $RC want 0 [$(head -c 200 "$E")]"; [ -s "$E" ] && miss "$1: wrote stderr [$(head -c 200 "$E")]"; }
refused() {
  [ "$RC" -eq "$1" ] || miss "$2: rc $RC want $1 [$(head -c 200 "$E")]"
  [ -s "$O" ] && miss "$2: printed stdout on a refusal"
  [ "$(cat "$E")" = "$3" ] || miss "$2: stderr [$(cat "$E")] want [$3]"
}
wantout() { _wo=$(cat "$O"); [ "$_wo" = "$1" ] || miss "$2: answer [$_wo] want [$1]"; }
wantfile() { cmp -s "$1" "$O" || miss "$2: answer differs from $(basename "$1")"; }

DB="$SB/db/store.db"
# a store.put with the payload from a file; a new database by default
putf() { _p=$1; shift; f "$DB" store.put "$@" < "$_p"; }
printf 'first\n' > "$SB/v1"; printf 'second\n' > "$SB/v2"; printf 'third\n' > "$SB/v3"

# ==============================================================================
# 1. a fresh store serves the five functions; bytes round-trip; the answer wire is exact
# ==============================================================================
printf '== the five functions ==\n'
f "$DB" store.list docs
answer "fresh list"; wantout '{"namespace":"docs","keys":[]}' "fresh list"
f "$DB" store.get docs workspace/x
refused 1 "fresh get" "store.get: error: key 'workspace/x' not found in namespace 'docs' (ERR_ENTITY_NOT_FOUND)"
putf "$SB/v1" docs workspace/x
answer "put"; wantout '{"namespace":"docs","key":"workspace/x","op":"write"}' "put"
f "$DB" store.get docs workspace/x
[ "$RC" -eq 0 ] || miss "get: rc $RC want 0"; wantfile "$SB/v1" "get"
putf "$SB/v2" docs workspace/x --op=replace --head=abc
answer "update"; wantout '{"namespace":"docs","key":"workspace/x","op":"replace"}' "update"
f "$DB" store.get docs workspace/x
wantfile "$SB/v2" "update get"
f "$DB" store.list docs
answer "list"; wantout '{"namespace":"docs","keys":["workspace/x"]}' "list"
printf 'a\000b\377' > "$SB/vbin"
putf "$SB/vbin" docs workspace/bin
answer "binary put"
f "$DB" store.get docs workspace/bin
wantfile "$SB/vbin" "binary get"
# a null check: a byte flipped from the stored answer must read as a difference
printf 'a\000b\376' > "$SB/vbin-twin"
if cmp -s "$SB/vbin-twin" "$O"; then miss "the byte comparator read a planted byte as the same"; fi
f "$DB" store.delete docs workspace/bin
answer "delete"; wantout '{"namespace":"docs","key":"workspace/bin","op":"remove"}' "delete"
f "$DB" store.get docs workspace/bin
refused 1 "deleted get" "store.get: error: key 'workspace/bin' not found in namespace 'docs' (ERR_ENTITY_NOT_FOUND)"
f "$DB" store.delete docs workspace/bin
refused 1 "absent delete" "store.delete: error: key 'workspace/bin' not found in namespace 'docs' (ERR_ENTITY_NOT_FOUND)"
ok "the five functions serve a fresh store: list, get, put, the update echo, delete, and the absent refusals"

# ==============================================================================
# 2. the change log: seq, at, key, op, head, prior in order; the head window; the refusals
# ==============================================================================
printf '\n== the change log ==\n'
printf 'head=none\nhead=abc\n' > "$SB/heads-both"
f "$DB" store.changes docs < "$SB/heads-both"
answer "changes"
case "$(cat "$O")" in
  '{"namespace":"docs","changes":[{"seq":1,"at":"'*'","key":"workspace/x","op":"write","head":"none","prior":"absent"},{"seq":2,"at":"'*'","key":"workspace/x","op":"replace","head":"abc","prior":"present"},{"seq":3,"at":"'*'","key":"workspace/bin","op":"write","head":"none","prior":"absent"},{"seq":4,"at":"'*'","key":"workspace/bin","op":"remove","head":"none","prior":"present"}]}') ;;
  *) miss "changes: answer [$(cat "$O")]";;
esac
ok "store.changes answers the rows oldest first with seq, at, key, op, head, prior in the wire order"
printf 'head=abc\n' > "$SB/heads-abc"
f "$DB" store.changes docs < "$SB/heads-abc"
answer "changes window"
case "$(cat "$O")" in
  '{"namespace":"docs","changes":[{"seq":2,"at":"'*'","key":"workspace/x","op":"replace","head":"abc","prior":"present"}]}') ;;
  *) miss "changes window: answer [$(cat "$O")]";;
esac
ok "store.changes filters the rows to the heads on stdin"
f "$DB" store.changes docs < /dev/null
answer "changes empty"; wantout '{"namespace":"docs","changes":[]}' "changes empty"
ok "store.changes with no heads answers an empty list"
printf 'head=zz\n' > "$SB/heads-zz"
f "$DB" store.changes docs < "$SB/heads-zz"
refused 1 "malformed head" "store.changes: error: a head is a commit id or none: 'zz' (ERR_INVALID_ARGUMENT)"
printf 'what=1\n' > "$SB/heads-what"
f "$DB" store.changes docs < "$SB/heads-what"
refused 1 "unknown payload" "store.changes: error: unknown payload line 'what=1' (head=<sha> lines only) (ERR_INVALID_ARGUMENT)"
ok "store.changes refuses a malformed head and an unknown payload line"

# a namespace declaring changes: false refuses the log
mkdir -p "$SB/.contexture/modules/probe"
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > "$SB/.contexture/modules/probe/data"
f "$DB" store.changes probe < /dev/null
refused 1 "changes false" "store.changes: error: the namespace 'probe' declares no change log (changes: false) (ERR_CAPABILITY_UNSUPPORTED)"
ok "a namespace declaring changes: false refuses store.changes naming the flag"

# ==============================================================================
# 3. a refused write logs nothing and leaves the stored bytes whole
# ==============================================================================
printf '\n== the refusals leave the log alone ==\n'
_rows_before=$(sqlite3 "$DB" "SELECT count(*) FROM store_changes;")
printf 'alpha\n' > "$SB/alpha"
putf "$SB/alpha" docs workspace/Alpha
answer "alpha put"
_rows_alpha=$(sqlite3 "$DB" "SELECT count(*) FROM store_changes;")
printf 'alpha twin\n' > "$SB/alpha-twin"
putf "$SB/alpha-twin" docs workspace/alpha
refused 1 "twin" "store.put: error: key 'workspace/alpha' folds onto 'workspace/Alpha' under ASCII case; keys differing only by case never coexist in namespace 'docs' (ERR_ENTITY_EXISTS)"
putf "$SB/alpha-twin" docs a/b/c
refused 1 "pattern" "store.put: error: key 'a/b/c' does not match the namespace pattern '<repo>/<slug>' (ERR_INVALID_ARGUMENT)"
putf "$SB/alpha-twin" docs workspace/x --op=bad/op
refused 1 "op" "store.put: error: malformed op 'bad/op' (ERR_INVALID_ARGUMENT)"
_rows_after=$(sqlite3 "$DB" "SELECT count(*) FROM store_changes;")
[ "$_rows_alpha" = "$_rows_after" ] || miss "a refused write logged a row ($_rows_alpha -> $_rows_after)"
f "$DB" store.get docs workspace/Alpha
wantfile "$SB/alpha" "alpha get after refusals"
[ "$((_rows_alpha - _rows_before))" = 1 ] || miss "the alpha put logged $((_rows_alpha - _rows_before)) rows, want 1"
ok "a case twin, an off-pattern key, and a malformed op refuse and log nothing; the stored bytes stay whole"

# ==============================================================================
# 4. atomicity: a planted trigger aborts the write and rolls its change row back
# ==============================================================================
printf '\n== atomicity of one write ==\n'
printf 'atomic-old\n' > "$SB/old"; printf 'atomic-new\n' > "$SB/new"
putf "$SB/old" docs workspace/atomic
answer "atomic old"
_rows_pre=$(sqlite3 "$DB" "SELECT count(*) FROM store_changes;")
sqlite3 "$DB" "CREATE TRIGGER boom BEFORE INSERT ON store WHEN NEW.key = 'workspace/atomic' BEGIN SELECT RAISE(ABORT, 'planted'); END;" || miss "the planted trigger did not land"
putf "$SB/new" docs workspace/atomic
refused 2 "atomic abort" "store.put: error: the storage write of key 'workspace/atomic' failed (ERR_STORAGE_WRITE)"
f "$DB" store.get docs workspace/atomic
wantfile "$SB/old" "atomic old survives"
_rows_post=$(sqlite3 "$DB" "SELECT count(*) FROM store_changes;")
[ "$_rows_pre" = "$_rows_post" ] || miss "the aborted write's change row survived ($_rows_pre -> $_rows_post)"
sqlite3 "$DB" "DROP TRIGGER boom;"
putf "$SB/new" docs workspace/atomic
answer "atomic retry"
f "$DB" store.get docs workspace/atomic
wantfile "$SB/new" "atomic new after drop"
ok "an aborted put leaves the old value and no change row (the log insert rolls back with it); the retry lands"

# ==============================================================================
# 5. the schema 4 open path adds the store tables without a version bump
# ==============================================================================
printf '\n== the schema 4 open path ==\n'
OLD="$SB/db/old-v4.db"
sqlite3 "$OLD" "CREATE TABLE units (unit TEXT PRIMARY KEY, status TEXT, current_anchor TEXT, next_action TEXT, objective TEXT, repos TEXT, ref_sessions TEXT); PRAGMA user_version = 4;" || miss "the pre-store schema 4 database did not land"
f "$OLD" store.list docs
answer "open old v4"; wantout '{"namespace":"docs","keys":[]}' "open old v4"
[ "$(sqlite3 "$OLD" "PRAGMA user_version;")" = 4 ] || miss "the open path bumped the schema version"
[ "$(sqlite3 "$OLD" "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN ('store', 'store_changes');")" = 2 ] || miss "the open path did not add both store tables"
putf2() { _p=$1; shift; f "$OLD" store.put "$@" < "$_p"; }
putf2 "$SB/v1" docs workspace/old-path
answer "old v4 put"
f "$OLD" store.get docs workspace/old-path
wantfile "$SB/v1" "old v4 get"
sqlite3 "$DB" "PRAGMA table_info(store);" > "$SB/t-fresh-store"
sqlite3 "$OLD" "PRAGMA table_info(store);" > "$SB/t-old-store"
cmp -s "$SB/t-fresh-store" "$SB/t-old-store" || miss "the fresh and upgraded store table shapes differ"
sqlite3 "$DB" "PRAGMA table_info(store_changes);" > "$SB/t-fresh-changes"
sqlite3 "$OLD" "PRAGMA table_info(store_changes);" > "$SB/t-old-changes"
cmp -s "$SB/t-fresh-changes" "$SB/t-old-changes" || miss "the fresh and upgraded store_changes shapes differ"
ok "a pre-store schema 4 database gains store and store_changes on open, its version stays 4, and the shapes match a fresh store"

# ==============================================================================
# 6. the old corpus tables stay untouched and unread
# ==============================================================================
printf '\n== the corpus tables stay untouched ==\n'
sqlite3 "$DB" "INSERT INTO docs (repo, slug, body, updated_at) VALUES ('workspace', 'old-doc', 'old body', 't'); INSERT INTO doc_changes (at, op, repo, slug, head, prior) VALUES ('t', 'write', 'workspace', 'old-doc', 'feed', 'absent');" || miss "the old corpus rows did not land"
f "$DB" store.list docs
answer "old docs unread"
case "$(cat "$O")" in *'"workspace/old-doc"'*) miss "store.list read the old docs table" ;; esac
case "$(cat "$O")" in *'"workspace/x"'*) ;; *) miss "store.list lost the store's own rows [$(cat "$O")]" ;; esac
f "$DB" store.get docs workspace/old-doc
refused 1 "old doc get" "store.get: error: key 'workspace/old-doc' not found in namespace 'docs' (ERR_ENTITY_NOT_FOUND)"
printf 'head=feed\n' > "$SB/heads-feed"
f "$DB" store.changes docs < "$SB/heads-feed"
answer "old doc log unread"; wantout '{"namespace":"docs","changes":[]}' "old doc log unread"
putf "$SB/v3" docs workspace/new-doc
answer "new doc put"
[ "$(sqlite3 "$DB" "SELECT count(*) || '|' || (SELECT body FROM docs WHERE repo = 'workspace' AND slug = 'old-doc') FROM docs;")" = "1|old body" ] || miss "the store write changed the docs table"
[ "$(sqlite3 "$DB" "SELECT count(*) FROM doc_changes;")" = 1 ] || miss "the store write changed the doc_changes table"
ok "the store never reads docs/doc_changes and never writes them; its own rows answer alone"

# ==============================================================================
# 7. an empty payload stores as a zero-length blob
# ==============================================================================
printf '\n== an empty value ==\n'
: > "$SB/vempty"
putf "$SB/vempty" docs workspace/empty
answer "empty put"
f "$DB" store.get docs workspace/empty
[ "$RC" -eq 0 ] || miss "empty get: rc $RC want 0"
[ -s "$O" ] && miss "an empty value answered bytes"
[ "$(sqlite3 "$DB" "SELECT length(value) FROM store WHERE namespace = 'docs' AND key = 'workspace/empty';")" = 0 ] || miss "the empty value did not store as a zero-length blob"
ok "an empty payload stores as a zero-length blob and reads back empty"

# ==============================================================================
# 8. the descriptor: 38 record + 5 store; store and store.changelog
# ==============================================================================
printf '\n== the descriptor ==\n'
"$DRV" capability > "$O" 2> "$E"; _caprc=$?
[ "$_caprc" -eq 0 ] || miss "capability: rc $_caprc [$(cat "$E")]"
case "$(cat "$O")" in *'"store.list"'*'"store.get"'*'"store.put"'*'"store.delete"'*'"store.changes"'*) ;; *) miss "the descriptor lacks a store function" ;; esac
case "$(cat "$O")" in *'"optional":["store","store.changelog"]'*) ;; *) miss "the descriptor optional set [$(sed 's/.*"optional"://' "$O")]" ;; esac
ok "the descriptor declares the five store functions and store and store.changelog"

printf '\ntest-store: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
