#!/bin/sh
# store-compliance.sh: the generic module store compliance suite (contract 2, the storage
# module's store contract). It stages the shipped base (the session module and its posix
# driver, the storage module and its data reader) and a module data file (the docs
# plugin's by default, or the one --data-file names), then holds the configured store
# driver to the five functions over a sandbox corpus at docs/workspace.
#
# The suite asserts returned data and bytes, never an exit code alone: the exact list
# answer and order, the exact bytes of a document (a NUL and an invalid UTF-8 byte
# included), the fixed stderr line of a refusal, the empty stdout of a refusal, the JSON
# echo of put and delete, and the row the mapping lands. The key rule, the data file
# grammar, the module pattern, the per-key lock, the atomic put, and the no-base-to-docs
# census are each proven, the census and the pattern with a planted difference. The
# change log is the driver's own: the posix store keeps none and refuses store.changes;
# the fts5 store keeps the generic log and its own suite (plugins/storage-fts5/tests/
# test-store.sh) holds the rows, the refusal, and the transaction's atomicity.
#
# Usage: tests/store-compliance.sh [--driver=posix|fts5] [--driver-exec=<path>] [--data-file=<path>] [--keep]
#   --driver runs the store over that driver's module (default: posix). fts5 stages the
#   plugin's own module copy and checks sqlite3; --driver-exec names the exact driver
#   executable (a plugin suite passes its own copy), skipping the staged path for the
#   calls while the resolver checks still answer from the staged copy. --data-file names
#   the module data file the suite stages (default: the docs plugin's); it must declare
#   the suite's docs-shaped contract (namespace docs, root docs, suffix .md, key
#   <repo>/<slug>, changes true), so the base-only gate runs the suite with a synthetic
#   data file and no plugin.
# Exit 0 when every case passes; 1 otherwise; 2 a staging or driver failure; 77 when
# sqlite3 is absent for the fts5 driver.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"
STORAGE_MOD="$ROOT/base/.contexture/modules/storage"
FTS5_MOD="$ROOT/plugins/storage-fts5/.contexture/modules/storage-fts5"
DATA_FILE="$ROOT/plugins/docs-discipline/.contexture/modules/docs/data"

DRIVER_NAME=posix
DRIVER_EXEC_ARG=""
KEEP=0
for a in "$@"; do
  case "$a" in
    --driver=*) DRIVER_NAME="${a#--driver=}" ;;
    --driver-exec=*) DRIVER_EXEC_ARG="${a#--driver-exec=}" ;;
    --data-file=*) DATA_FILE="${a#--data-file=}" ;;
    --keep) KEEP=1 ;;
    *) echo "store-compliance.sh: unknown argument: $a" >&2; exit 1 ;;
  esac
done

case "$DRIVER_NAME" in
  posix) IS_POSIX=1 ;;
  fts5|sqlite-fts5|storage-fts5) IS_POSIX=0; DRIVER_NAME=fts5 ;;
  *) echo "store-compliance.sh: unknown driver: $DRIVER_NAME (posix or fts5)" >&2; exit 1 ;;
esac

for f in "$CTX_SRC" "$SESSION_MOD/scripts/driver-resolver" "$STORAGE_MOD/scripts/store-data" "$DATA_FILE"; do
  [ -e "$f" ] || { echo "store-compliance.sh: missing $f" >&2; exit 2; }
done
if [ "$IS_POSIX" -eq 0 ]; then
  for f in "$FTS5_MOD/drivers/fts5" "$FTS5_MOD/db-init.sh" "$FTS5_MOD/schema.sql"; do
    [ -e "$f" ] || { echo "store-compliance.sh: missing $f" >&2; exit 2; }
  done
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "SKIP: sqlite3 not found on PATH"
    exit 77
  fi
  if [ -n "$DRIVER_EXEC_ARG" ] && [ ! -x "$DRIVER_EXEC_ARG" ]; then
    echo "store-compliance.sh: --driver-exec $DRIVER_EXEC_ARG is not executable" >&2
    exit 2
  fi
fi

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SB=$(mktemp -d "$tmp_root/store-compliance.XXXXXX") || exit 2
cleanup() {
  if [ "$KEEP" -eq 1 ]; then
    printf 'store-compliance: sandbox preserved at %s\n' "$SB"
  else
    rm -rf "$SB"
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$SB/.contexture/modules" "$SB/.contexture/tmp" "$SB/docs/workspace"
cp "$CTX_SRC" "$SB/.contexture/ctx"
chmod +x "$SB/.contexture/ctx"
cp -R "$SESSION_MOD" "$SB/.contexture/modules/session"
cp -R "$STORAGE_MOD" "$SB/.contexture/modules/storage"
# the suite's cases are docs-shaped; --data-file supplies any file with that contract
mkdir -p "$SB/.contexture/modules/docs"
cp "$DATA_FILE" "$SB/.contexture/modules/docs/data"
if [ "$IS_POSIX" -eq 0 ]; then
  cp -R "$FTS5_MOD" "$SB/.contexture/modules/storage-fts5"
  printf 'storage.driver: fts5\n' > "$SB/.contexture/config"
fi
chmod +x "$SB/.contexture/modules/session/scripts/"* "$SB/.contexture/modules/storage/scripts/"*
cd "$SB" || exit 2
if [ "$IS_POSIX" -eq 1 ]; then
  STAGED_DRIVER="$SB/.contexture/modules/session/drivers/posix/driver"
else
  STAGED_DRIVER="$SB/.contexture/modules/storage-fts5/drivers/fts5"
  chmod +x "$STAGED_DRIVER"
fi
if [ -n "$DRIVER_EXEC_ARG" ]; then DRIVER="$DRIVER_EXEC_ARG"; else DRIVER="$STAGED_DRIVER"; fi
RESOLVED_EXPECT="$STAGED_DRIVER"
RESOLVER="$SB/.contexture/modules/session/scripts/driver-resolver"
O="$SB/.out"; E="$SB/.err"
: > "$O"; : > "$E"
RC=0
FN=""

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'PASS: %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL: %s\n' "$1"; }
tc_fail=""
miss() { tc_fail="$tc_fail; $1"; }
tc() { if [ -z "$tc_fail" ]; then ok "$1"; else bad "$1 ($tc_fail)"; fi; tc_fail=""; }

run() { FN=$1; shift; "$DRIVER" "$@" > "$O" 2> "$E"; RC=$?; }
answer() {
  [ "$RC" -eq 0 ] || miss "$FN rc $RC want 0 [$(head -c 200 "$E")]"
  [ -s "$E" ] && miss "$FN wrote stderr [$(head -c 200 "$E")]"
  _an=$(wc -l < "$O" | tr -d ' ')
  [ "$_an" = 1 ] || miss "$FN answered $_an lines, want one"
}
rawok() {
  [ "$RC" -eq 0 ] || miss "$FN rc $RC want 0 [$(head -c 200 "$E")]"
  [ -s "$E" ] && miss "$FN wrote stderr [$(head -c 200 "$E")]"
}
refused() {
  [ "$RC" -eq "$1" ] || miss "$FN rc $RC want $1"
  [ -s "$O" ] && miss "$FN printed stdout on a refusal [$(head -c 200 "$O")]"
  _rn=$(wc -l < "$E" | tr -d ' ')
  [ "$_rn" = 1 ] || miss "$FN wrote $_rn stderr lines, want one"
  _rg=$(cat "$E")
  _rw="$FN: error: $3 ($2)"
  [ "$_rg" = "$_rw" ] || miss "$FN stderr [$_rg] want [$_rw]"
}
wantout() { _wo=$(cat "$O"); [ "$_wo" = "$1" ] || miss "$FN answer [$_wo] want [$1]"; }
wantfile() { cmp -s "$1" "$O" || miss "$FN answer differs from $(basename "$1")"; }
wantfilepath() { cmp -s "$1" "$2" || miss "the stored bytes of $(basename "$1") differ"; }

# store_put <ns> <key> <payload file> [flags...]
store_put() {
  _sp_ns=$1; _sp_key=$2; _sp_pay=$3; shift 3
  run store.put store.put "$_sp_ns" "$_sp_key" "$@" < "$_sp_pay"
}
# store_get <ns> <key>
store_get() { run store.get store.get "$1" "$2"; }
# store_delete <ns> <key> [flags...]
store_delete() { _sd_ns=$1; _sd_key=$2; shift 2; run store.delete store.delete "$_sd_ns" "$_sd_key" "$@"; }
# store_list <ns> [args...]
store_list() { run store.list store.list "$@"; }
# store_changes <ns> [args...]
store_changes() { run store.changes store.changes "$@"; }

printf 'store-compliance suite: the %s store over the docs data file (staged at %s)\n\n' "$DRIVER_NAME" "$SB"

# ==============================================================================
# S1: the module store is installed and listed; the resolver answers the capabilities
# ==============================================================================
printf '== S1: the storage module and the resolver ==\n'
hall=$("$SB/.contexture/ctx" help --all 2>/dev/null)
case "$hall" in
  *"module storage:"*) ;;
  *) miss "ctx help --all does not list the storage module" ;;
esac
case "$hall" in
  *"the generic module store"*) ;;
  *) miss "ctx help --all carries no storage module summary" ;;
esac
resolved=$("$RESOLVER" resolve 2>/dev/null)
[ "$resolved" = "$RESOLVED_EXPECT" ] || miss "the session wrapper resolves [$resolved] want [$RESOLVED_EXPECT]"
"$RESOLVER" require store >/dev/null 2>&1
[ "$?" -eq 0 ] || miss "require store refused the $DRIVER_NAME driver"
"$RESOLVER" has store.changelog >/dev/null 2>&1
_hasc=$?
if [ "$IS_POSIX" -eq 1 ]; then
  [ "$_hasc" -eq 1 ] || miss "has store.changelog did not answer 1 on posix"
else
  [ "$_hasc" -eq 0 ] || miss "has store.changelog did not answer 0 on fts5"
fi
cap=$("$DRIVER" capability 2>/dev/null)
case "$cap" in *'"store.list"'*'"store.get"'*'"store.put"'*'"store.delete"'*'"store.changes"'*) ;; *) miss "the descriptor lacks a store function" ;; esac
if [ "$IS_POSIX" -eq 1 ]; then
  case "$cap" in *'"optional":["store"]'*) ;; *) miss "the descriptor optional set [$(printf '%s' "$cap" | sed 's/.*"optional"://')]" ;; esac
else
  case "$cap" in *'"optional":["store","store.changelog"]'*) ;; *) miss "the descriptor optional set [$(printf '%s' "$cap" | sed 's/.*"optional"://')]" ;; esac
fi
# a planted descriptor without the store capability reads red at require
planted=$(printf '%s' "$cap" | sed 's/,"store.list","store.get","store.put","store.delete","store.changes"//; s/"store.changelog"//; s/"store"//; s/,\]/]/; s/\[,/[/; s/,,/,/g')
mkdir -p .contexture/drivers/planted
{
  printf '#!/bin/sh\n'
  printf 'if [ "${1:-}" = capability ]; then\n'
  printf '  echo %s\n' "'$planted'"
  printf '  exit 0\n'
  printf 'fi\n'
  printf 'exec "%s" "$@"\n' "$DRIVER"
} > .contexture/drivers/planted/driver
chmod +x .contexture/drivers/planted/driver
"$RESOLVER" --driver=planted require store >/dev/null 2>&1
[ "$?" -eq 2 ] || miss "a planted descriptor missing store did not answer require store rc2"
"$RESOLVER" --driver=planted has store >/dev/null 2>&1
[ "$?" -eq 1 ] || miss "the planted descriptor did not answer has store rc1"
"$RESOLVER" --driver=planted require store.changelog >/dev/null 2>&1
[ "$?" -eq 2 ] || miss "the planted descriptor did not answer require store.changelog rc2"
tc "S1: the storage module is listed, the wrapper resolves through it, and the store capabilities answer"

# ==============================================================================
# S2: the docs data file maps the corpus to docs/workspace and list is bytewise and filtered
# ==============================================================================
printf '\n== S2: the docs data file and list ==\n'
mkdir -p docs/workspace/deep
printf 'B\n' > 'docs/workspace/B.md'
printf 'a\n' > 'docs/workspace/a.md'
printf 'aa\n' > 'docs/workspace/aa.md'
printf 'a\000b\377' > 'docs/workspace/binary.md'
printf 'quote\n' > 'docs/workspace/q"uote.md'
printf 'turkce\n' > 'docs/workspace/türkçe.md'
printf 'one segment\n' > 'docs/top.md'
printf 'three segments\n' > 'docs/workspace/deep/x.md'
printf 'wrong suffix\n' > 'docs/workspace/notes.txt'
printf 'blank segment\n' > 'docs/workspace/bad name.md'
if [ "$IS_POSIX" -eq 1 ]; then
  store_list docs
  answer
  wantout '{"namespace":"docs","keys":["workspace/B","workspace/a","workspace/aa","workspace/binary","workspace/q\"uote","workspace/türkçe"]}'
else
  # the fts5 store holds its keys in the database; seed the six through put, then plant
  # three rows the pattern never admits (a one-segment key, a three-segment key, a blank)
  # to prove list filters them out
  for _k in B a aa binary 'q"uote' türkçe; do
    store_put docs "workspace/$_k" "docs/workspace/$_k.md"
    answer
  done
  sqlite3 "$SB/.contexture/sessions.db" "INSERT INTO store (namespace, key, value, updated_at) VALUES ('docs', 'top', x'78', 't'); INSERT INTO store (namespace, key, value, updated_at) VALUES ('docs', 'workspace/deep/x', x'78', 't'); INSERT INTO store (namespace, key, value, updated_at) VALUES ('docs', 'workspace/bad name', x'78', 't');"
  store_list docs
  answer
  wantout '{"namespace":"docs","keys":["workspace/B","workspace/a","workspace/aa","workspace/binary","workspace/q\"uote","workspace/türkçe"]}'
fi
tc "S2: store.list answers the bytewise keys the docs pattern admits and only those"

# ==============================================================================
# S3: get and put carry raw bytes; the JSON echo is exact
# ==============================================================================
printf '\n== S3: raw bytes and the JSON echo ==\n'
store_get docs workspace/binary
rawok
wantfile 'docs/workspace/binary.md'
tc "S3a: store.get returns a document's bytes exactly (a NUL and an invalid UTF-8 byte)"
store_put docs workspace/binary-copy 'docs/workspace/binary.md'
answer
wantout '{"namespace":"docs","key":"workspace/binary-copy","op":"write"}'
store_get docs workspace/binary-copy
rawok
wantfile 'docs/workspace/binary.md'
tc "S3a2: store.put carries a binary payload (a NUL and an invalid UTF-8 byte) byte for byte"
printf 'no trailing newline' > "$SB/pay-nonl"
store_put docs workspace/nonl "$SB/pay-nonl"
answer
wantout '{"namespace":"docs","key":"workspace/nonl","op":"write"}'
if [ "$IS_POSIX" -eq 1 ]; then
  [ -f docs/workspace/nonl.md ] || miss "the key did not land at docs/workspace/nonl.md"
fi
store_get docs workspace/nonl
rawok
wantfile "$SB/pay-nonl"
tc "S3b: store.put lands a payload with no trailing newline at the docs/workspace mapping and get returns it"
printf 'with quotes " and a tab\tand a backslash \\ and a newline\n' > "$SB/pay-rich"
store_put docs 'workspace/q"uote' "$SB/pay-rich" --op=replace --head=0123abcd
answer
wantout '{"namespace":"docs","key":"workspace/q\"uote","op":"replace"}'
store_get docs 'workspace/q"uote'
rawok
wantfile "$SB/pay-rich"
tc "S3c: store.put echoes the op and escapes the key; get returns the rich bytes"
store_delete docs workspace/nonl
answer
wantout '{"namespace":"docs","key":"workspace/nonl","op":"remove"}'
store_get docs workspace/nonl
refused 1 ERR_ENTITY_NOT_FOUND "key 'workspace/nonl' not found in namespace 'docs'"
tc "S3d: store.delete removes the key and answers the default remove op; get then refuses"
store_get docs workspace/absent
refused 1 ERR_ENTITY_NOT_FOUND "key 'workspace/absent' not found in namespace 'docs'"
store_delete docs workspace/absent
refused 1 ERR_ENTITY_NOT_FOUND "key 'workspace/absent' not found in namespace 'docs'"
tc "S3e: get and delete of an absent key refuse the fixed not-found line"

# ==============================================================================
# S4: the key rule: exact keys, the case twin, the pattern, and the malformed shapes
# ==============================================================================
printf '\n== S4: the key rule ==\n'
printf 'Alpha\n' > "$SB/pay-alpha"
store_put docs workspace/Alpha "$SB/pay-alpha"
answer
store_get docs workspace/Alpha
rawok
wantfile "$SB/pay-alpha"
printf 'alpha\n' > "$SB/pay-alpha2"
store_put docs workspace/alpha "$SB/pay-alpha2"
refused 1 ERR_ENTITY_EXISTS "key 'workspace/alpha' folds onto 'workspace/Alpha' under ASCII case; keys differing only by case never coexist in namespace 'docs'"
store_get docs workspace/ALPHA
refused 1 ERR_ENTITY_NOT_FOUND "key 'workspace/ALPHA' not found in namespace 'docs'"
store_get docs workspace/Alpha
rawok
wantfile "$SB/pay-alpha"
tc "S4a: a case twin refuses on put; get acts on the exact key alone and the stored key survives"
for _k in '/workspace/x' 'workspace/../x' 'workspace/./x' 'workspace/a b' 'workspace/a	b' 'workspace/x/'; do
  store_put docs "$_k" "$SB/pay-alpha"
  refused 1 ERR_INVALID_ARGUMENT "malformed key '$_k'"
done
tc "S4b: a key with a leading slash, a dot or dot-dot segment, a blank, a control, a trailing slash, or an off-pattern segment refuses"
printf 'x\n' > "$SB/pay-x"
store_put docs 'workspace/x\y' "$SB/pay-x"
refused 1 ERR_INVALID_ARGUMENT "malformed key 'workspace/x\\y'"
tc "S4c: a key with a backslash refuses"
for _k in 'workspace' 'a/b/c' 'workspace/x/y'; do
  store_put docs "$_k" "$SB/pay-x"
  refused 1 ERR_INVALID_ARGUMENT "key '$_k' does not match the namespace pattern '<repo>/<slug>'"
done
tc "S4d: a key outside the module pattern refuses before any file is touched"
store_delete docs workspace/Alpha
answer
wantout '{"namespace":"docs","key":"workspace/Alpha","op":"remove"}'
tc "S4e: the exact key deletes after the twin refusal"
# the filesystem may fold more than ASCII: a key the posix root cannot hold exactly beside a
# stored key refuses instead of silently replacing it; an exact-key store holds both
printf 'Sigma\n' > "$SB/pay-sigma"
printf 'sigma\n' > "$SB/pay-sigma2"
mkdir -p "$SB/foldprobe"
: > "$SB/foldprobe/Σ"
if [ -e "$SB/foldprobe/σ" ]; then FOLDS=1; else FOLDS=0; fi
rm -rf "$SB/foldprobe"
store_put docs workspace/Σ "$SB/pay-sigma"
answer
store_put docs workspace/σ "$SB/pay-sigma2"
if [ "$IS_POSIX" -eq 1 ] && [ "$FOLDS" -eq 1 ]; then
  refused 1 ERR_ENTITY_EXISTS "key 'workspace/σ' cannot be represented exactly beside 'workspace/Σ' under the filesystem's case folding; the two keys never coexist in namespace 'docs'"
  store_get docs workspace/Σ
  rawok
  wantfile "$SB/pay-sigma"
  store_get docs workspace/σ
  refused 1 ERR_ENTITY_NOT_FOUND "key 'workspace/σ' not found in namespace 'docs'"
  store_delete docs workspace/Σ
  answer
else
  answer
  store_get docs workspace/Σ
  rawok
  wantfile "$SB/pay-sigma"
  store_get docs workspace/σ
  rawok
  wantfile "$SB/pay-sigma2"
  store_delete docs workspace/Σ
  answer
  store_delete docs workspace/σ
  answer
fi
tc "S4f: a key the filesystem folds refuses without losing the stored key; an exact-key store holds both"

# ==============================================================================
# S5: the flags, the namespace, and the change-log refusal
# ==============================================================================
printf '\n== S5: flags, namespaces, changes ==\n'
store_put docs workspace/x "$SB/pay-x" --bogus
refused 1 ERR_INVALID_ARGUMENT "unknown argument '--bogus'"
store_put docs workspace "$SB/pay-x" --bogus
refused 1 ERR_INVALID_ARGUMENT "unknown argument '--bogus'"
store_put docs workspace/x "$SB/pay-x" '--op=bad/op'
refused 1 ERR_INVALID_ARGUMENT "malformed op 'bad/op'"
store_put docs workspace/x "$SB/pay-x" '--head=zz'
refused 1 ERR_INVALID_ARGUMENT "--head takes a commit id or none: 'zz'"
store_list docs extra
refused 1 ERR_INVALID_ARGUMENT "store.list takes one argument, the namespace"
run store.get store.get docs
refused 1 ERR_INVALID_ARGUMENT "store.get takes the namespace and the key"
run store.put store.put docs
refused 1 ERR_INVALID_ARGUMENT "store.put takes the namespace, the key, and optional flags"
if [ "$IS_POSIX" -eq 1 ]; then
  store_changes docs
  refused 1 ERR_CAPABILITY_UNSUPPORTED "the posix store keeps no change log; namespace 'docs' reports its delta through its module (changes: true)"
fi
store_list nosuch
refused 1 ERR_ENTITY_NOT_FOUND "namespace 'nosuch' is declared by no module data file"
store_list 'Bad!'
refused 1 ERR_INVALID_ARGUMENT "malformed namespace 'Bad!'"
tc "S5: unknown flags, malformed op and head, bad argc, an unknown namespace, and a malformed namespace answer their fixed lines"

# ==============================================================================
# S6: the data file grammar: a second namespace, duplicate refusal, malformed fields
# ==============================================================================
printf '\n== S6: the data file grammar ==\n'
mkdir -p .contexture/modules/probe probe-root/x/y
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > .contexture/modules/probe/data
printf 'probe\n' > probe-root/x/y.txt
printf 'deep\n' > probe-root/x/y/z.txt
if [ "$IS_POSIX" -eq 1 ]; then
  store_list probe
  answer
  wantout '{"namespace":"probe","keys":["x/y"]}'
else
  store_put probe x/y "$SB/pay-x"
  answer
  wantout '{"namespace":"probe","key":"x/y","op":"write"}'
  store_list probe
  answer
  wantout '{"namespace":"probe","keys":["x/y"]}'
fi
tc "S6a: a second module's data file is read and its pattern filters the list"
mkdir -p .contexture/modules/probe2
printf 'namespace: probe\nroot: probe2-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: true\n' > .contexture/modules/probe2/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "namespace 'probe' is declared by more than one module: probe probe2"
rm -rf .contexture/modules/probe2
tc "S6b: a second data file declaring the same namespace refuses"
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b>\nmode: fast\nchanges: true\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "unknown field 'mode' in the data file"
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b>\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "the data file declares no changes flag"
printf 'namespace: probe\nroot: ../outside\nsuffix: .txt\nkey: <a>/<b>\nchanges: true\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "malformed root '../outside' (a workspace-relative folder inside the workspace)"
[ ! -e ../outside ] || miss "the root escape reached outside the workspace"
printf 'namespace: probe\nroot: /abs\nsuffix: .txt\nkey: <a>/<b>\nchanges: true\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "malformed root '/abs' (a workspace-relative folder inside the workspace)"
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: a/b\nchanges: true\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "malformed key pattern 'a/b' (a <name> placeholder per slash-separated segment)"
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: maybe\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "malformed changes flag 'maybe' (true or false)"
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: true\n' > .contexture/modules/probe/data
store_put probe x/y "$SB/pay-x"
answer
wantout '{"namespace":"probe","key":"x/y","op":"write"}'
if [ "$IS_POSIX" -eq 1 ]; then
  store_changes probe
  refused 1 ERR_CAPABILITY_UNSUPPORTED "the posix store keeps no change log; namespace 'probe' reports its delta through its module (changes: true)"
fi
tc "S6c: unknown, missing, and malformed fields refuse; a root escape refuses without writing outside; a changes declaration answers its driver"

# ==============================================================================
# S7: the per-key lock is held during a put, and the put is atomic per key
# ==============================================================================
printf '\n== S7: the lock and the atomic put ==\n'
printf 'atomic-old\n' > "$SB/pay-old"
store_put docs workspace/atomic "$SB/pay-old"
answer
printf 'atomic-new\n' > "$SB/pay-new"
mkfifo "$SB/pay.fifo"
("$DRIVER" store.put docs workspace/locked < "$SB/pay.fifo" > "$SB/lock.out" 2> "$SB/lock.err"; printf '%s\n' "$?" > "$SB/lock.rc") &
_lock_pid=$!
exec 3> "$SB/pay.fifo"
_lock_ok=0
_i=0
while [ "$_i" -lt 50 ]; do
  if [ -d .contexture/tmp/locks/store-docs/workspace/locked.lock ]; then _lock_ok=1; break; fi
  _i=$((_i + 1)); sleep 0.1 2>/dev/null || sleep 1
done
printf 'locked\n' >&3
exec 3>&-
wait "$_lock_pid"
[ "$_lock_ok" -eq 1 ] || miss "the per-key lock was not observed while the put read its payload"
[ "$(cat "$SB/lock.rc" 2>/dev/null)" = 0 ] || miss "the locked put exited $(cat "$SB/lock.rc" 2>/dev/null)"
if [ "$IS_POSIX" -eq 1 ]; then
  [ -f docs/workspace/locked.md ] || miss "the locked put did not land its key"
  [ "$(cat docs/workspace/locked.md 2>/dev/null)" = "locked" ] || miss "the locked put did not land its payload"
else
  store_get docs workspace/locked
  rawok
  wantout 'locked'
fi
[ ! -d .contexture/tmp/locks/store-docs/workspace/locked.lock ] || miss "the lock remains after the put"
rm -f "$SB/pay.fifo"
tc "S7a: put holds a per-key lock while it reads and releases it after the key lands"
if [ "$IS_POSIX" -eq 1 ]; then
  chmod 500 docs/workspace
  store_put docs workspace/atomic "$SB/pay-new"
  refused 2 ERR_STORAGE_WRITE "the storage write of key 'workspace/atomic' failed"
  store_get docs workspace/atomic
  rawok
  wantfile "$SB/pay-old"
  chmod 700 docs/workspace
  tc "S7b: a put that cannot create its temp refuses rc2 and leaves the old key whole"
  _tmp_left=$(find docs/workspace -type f -name '*.md.??????' 2>/dev/null | wc -l | tr -d ' ')
  [ "$_tmp_left" = 0 ] || miss "$_tmp_left put temp file(s) remain under docs/workspace"
  tc "S7c: a landed put leaves no temp under the store root"
fi

# ==============================================================================
# S8: the no-base-to-docs census (the storage module never calls the docs module)
# ==============================================================================
printf '\n== S8: the no-base-to-docs census ==\n'
census_hits() {
  find "$1" -type f -exec grep -lE 'modules/docs|docs-edit\.awk|docs-model\.awk' {} + 2>/dev/null | wc -l | tr -d ' '
}
_hits=$(census_hits "$ROOT/base/.contexture")
[ "$_hits" = 0 ] || miss "the no-base-to-docs census reads $_hits"
_plant=$(mktemp -d "$SB/census.XXXXXX")
cp -R "$ROOT/base/.contexture" "$_plant/base"
printf 'base/.contexture/modules/docs\n' > "$_plant/base/plant"
_p_hits=$(census_hits "$_plant/base")
[ "$_p_hits" = 1 ] || miss "the census read $_p_hits on a planted reference"
rm -rf "$_plant"
tc "S8: base carries no docs module or docs parser reference, and the census catches a plant"

printf '\n== summary ==\n'
printf 'store-compliance (%s): pass=%d fail=%d\n' "$DRIVER_NAME" "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
