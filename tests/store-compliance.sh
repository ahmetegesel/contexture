#!/bin/sh
# store-compliance.sh: the generic module store compliance suite (contract 2, the storage
# core's store contract). It stages the shipped base (the session module and its posix
# driver, the storage core and its data reader and library) and a module data file (the
# docs plugin's by default, or the one --data-file names), then holds the configured store
# driver to the seven functions over a sandbox corpus at docs/workspace: list, get, put,
# delete, changes, batch, and scan, plus the search entry.
#
# The suite asserts returned data and bytes, never an exit code alone: the exact list
# answer and order, the exact bytes of a document (a NUL and an invalid UTF-8 byte
# included), the fixed stderr line of a refusal, the empty stdout of a refusal, the JSON
# echo of put and delete, the batch answer and its first-failure line, the scan answer and
# its decoded bytes, and the row the mapping lands. The key rule, the data file grammar,
# the module pattern, the namespace lock, the atomic put, the all-or-none batch, and the
# no-base-to-docs census are each proven, the census and the pattern with a planted
# difference. The change log is the driver's own: the posix store keeps none and refuses
# store.changes; the fts5 store keeps the generic log and its own suite
# (plugins/storage-fts5/tests/test-store.sh) holds the rows, the refusal, and the
# transaction's atomicity.
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
STORAGE_CORE="$ROOT/base/.contexture/storage"
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

for f in "$CTX_SRC" "$SESSION_MOD/scripts/driver-resolver" "$STORAGE_CORE/scripts/store-data" "$STORAGE_CORE/scripts/library" "$STORAGE_CORE/drivers/posix/driver" "$DATA_FILE"; do
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
cp -R "$STORAGE_CORE" "$SB/.contexture/storage"
# the suite's cases are docs-shaped; --data-file supplies any file with that contract
mkdir -p "$SB/.contexture/modules/docs"
cp "$DATA_FILE" "$SB/.contexture/modules/docs/data"
if [ "$IS_POSIX" -eq 0 ]; then
  cp -R "$FTS5_MOD" "$SB/.contexture/modules/storage-fts5"
  printf 'storage.driver: fts5\n' > "$SB/.contexture/config"
fi
chmod +x "$SB/.contexture/modules/session/scripts/"* "$SB/.contexture/storage/scripts/"* "$SB/.contexture/storage/drivers/posix/driver"
cd "$SB" || exit 2
if [ "$IS_POSIX" -eq 1 ]; then
  STAGED_DRIVER="$SB/.contexture/storage/drivers/posix/driver"
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
# b64file <path>: a file's bytes as one base64 line (the batch's put value wire)
b64file() { base64 < "$1" | tr -d '\n'; }
# b64decode <string> <out>: a base64 value decoded to <out>
b64decode() {
  printf '%s' "$1" | base64 -d > "$2" 2>/dev/null && return 0
  printf '%s' "$1" | base64 -D > "$2" 2>/dev/null
}

printf 'store-compliance suite: the %s store over the docs data file (staged at %s)\n\n' "$DRIVER_NAME" "$SB"

# ==============================================================================
# S1: the module store is installed and listed; the resolver answers the capabilities
# ==============================================================================
printf '== S1: the storage core and the resolver ==\n'
hall=$("$SB/.contexture/ctx" help --all 2>/dev/null)
case "$hall" in
  *"module storage:"*) miss "ctx help --all still lists the retired storage module" ;;
esac
[ -x "$SB/.contexture/storage/scripts/driver-resolver" ] || miss "the storage core resolver is not installed"
[ -f "$SB/.contexture/storage/scripts/library" ] || miss "the storage core library is not installed"
[ -x "$SB/.contexture/storage/drivers/posix/driver" ] || miss "the storage core posix driver is not installed"
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
"$RESOLVER" has search.schema >/dev/null 2>&1
_hass=$?
if [ "$IS_POSIX" -eq 1 ]; then
  [ "$_hass" -eq 1 ] || miss "has search.schema did not answer 1 on posix"
else
  [ "$_hass" -eq 0 ] || miss "has search.schema did not answer 0 on fts5"
fi
cap=$("$DRIVER" capability 2>/dev/null)
case "$cap" in *'"store.list"'*'"store.get"'*'"store.put"'*'"store.delete"'*'"store.changes"'*'"store.batch"'*'"store.scan"'*'"store.search"'*) ;; *) miss "the descriptor lacks a store function" ;; esac
if [ "$IS_POSIX" -eq 1 ]; then
  case "$cap" in *'"optional":["store"]'*) ;; *) miss "the descriptor optional set [$(printf '%s' "$cap" | sed 's/.*"optional"://')]" ;; esac
else
  case "$cap" in *'"optional":["store","store.changelog","search.schema"]'*) ;; *) miss "the descriptor optional set [$(printf '%s' "$cap" | sed 's/.*"optional"://')]" ;; esac
fi
_cap_fns=$(printf '%s' "$cap" | sed 's/.*"functions":\[//; s/\].*//' | tr ',' '\n' | grep -c .)
[ "$_cap_fns" = 46 ] || miss "the descriptor declares $_cap_fns functions, want 46 (38 record plus 7 store plus the store search)"
# a planted descriptor without the store capability reads red at require
planted=$(printf '%s' "$cap" | sed 's/,"store.list","store.get","store.put","store.delete","store.changes"//; s/,"store.batch","store.scan"//; s/,"store.search"//; s/"store.changelog"//; s/"search.schema"//; s/"store"//; s/,\]/]/; s/\[,/[/; s/,,/,/g')
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
"$RESOLVER" --driver=planted require search.schema >/dev/null 2>&1
[ "$?" -eq 2 ] || miss "the planted descriptor did not answer require search.schema rc2"
tc "S1: the storage core is not a module, the wrapper resolves through it, and the store capabilities answer"

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
# S6: the data file grammar: the minimum and its defaults, duplicate refusal, malformed
# fields, the variable-depth key, and the search keys the reader accepts
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
printf 'namespace: probe\nroot: ../outside\nsuffix: .txt\nkey: <a>/<b>\nchanges: true\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "malformed root '../outside' (a workspace-relative folder inside the workspace)"
[ ! -e ../outside ] || miss "the root escape reached outside the workspace"
printf 'namespace: probe\nroot: /abs\nsuffix: .txt\nkey: <a>/<b>\nchanges: true\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "malformed root '/abs' (a workspace-relative folder inside the workspace)"
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: a/b\nchanges: true\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "malformed key pattern 'a/b' (a <name> placeholder per slash-separated segment, the last optionally <name...>)"
printf 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b...>/<c>\nchanges: true\n' > .contexture/modules/probe/data
store_list probe
refused 1 ERR_INVALID_ARGUMENT "malformed key pattern '<a>/<b...>/<c>' (a <name> placeholder per slash-separated segment, the last optionally <name...>)"
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
tc "S6c: unknown and malformed fields refuse; a root escape refuses without writing outside; a changes declaration answers its driver"

# the minimum declaration: namespace and key alone; root defaults to the namespace, suffix
# to empty, changes to false, and the posix mapping proves the defaults
mkdir -p .contexture/modules/minimal
printf 'namespace: minimal\nkey: <a>/<b>\n' > .contexture/modules/minimal/data
store_put minimal a/b "$SB/pay-x"
answer
wantout '{"namespace":"minimal","key":"a/b","op":"write"}'
store_get minimal a/b
rawok
wantfile "$SB/pay-x"
store_list minimal
answer
wantout '{"namespace":"minimal","keys":["a/b"]}'
if [ "$IS_POSIX" -eq 1 ]; then
  [ -f minimal/a/b ] || miss "the default root and empty suffix did not map to minimal/a/b"
fi
store_changes minimal
[ "$RC" -eq 1 ] || miss "the default changes flag did not refuse the log (rc $RC)"
case "$(cat "$E")" in
  *"changes: false"*) ;;
  *) miss "the default changes refusal [$(cat "$E")]" ;;
esac
tc "S6d: a declaration of namespace and key alone is valid; root defaults to the namespace, suffix to empty, changes to false"

# the optional format and search keys are accepted (the search schema is a later task);
# a duplicate search key refuses like any other duplicate field
mkdir -p .contexture/modules/searchy
printf 'namespace: searchy\nroot: searchy-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nformat: text\nfields: title, body\ntitle: title\nsnippet: line\nmodes: exact\n' > .contexture/modules/searchy/data
store_list searchy
answer
wantout '{"namespace":"searchy","keys":[]}'
printf 'namespace: searchy\nroot: searchy-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nformat: text\nformat: json\n' > .contexture/modules/searchy/data
store_list searchy
refused 1 ERR_INVALID_ARGUMENT "duplicate field 'format' in the data file"
printf 'namespace: searchy\nroot: searchy-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nformat: text\nfields: title, body\ntitle: title\nsnippet: line\nmodes: exact\n' > .contexture/modules/searchy/data
tc "S6e: a declaration carrying the optional format and search keys is valid; a duplicate search key refuses"

# the unit module's declaration, expressible but not installed: its variable-depth final
# placeholder admits the main files and the deeper lane files, while docs's fixed depth
# still refuses an extra segment (S4d)
printf 'unit-lane\n' > "$SB/pay-unit"
mkdir -p .contexture/modules/unit
printf 'namespace: unit\nroot: .contexture/sessions\nsuffix: .md\nkey: <unit>/<path...>\nchanges: false\n' > .contexture/modules/unit/data
store_put unit storage/state "$SB/pay-x"
answer
wantout '{"namespace":"unit","key":"storage/state","op":"write"}'
store_put unit storage/lanes/foo/report "$SB/pay-unit"
answer
wantout '{"namespace":"unit","key":"storage/lanes/foo/report","op":"write"}'
store_list unit
answer
wantout '{"namespace":"unit","keys":["storage/lanes/foo/report","storage/state"]}'
store_get unit storage/lanes/foo/report
rawok
wantfile "$SB/pay-unit"
store_put unit storage "$SB/pay-x"
refused 1 ERR_INVALID_ARGUMENT "key 'storage' does not match the namespace pattern '<unit>/<path...>'"
if [ "$IS_POSIX" -eq 1 ]; then
  [ -f .contexture/sessions/storage/state.md ] || miss "the unit main key did not map under its root and suffix"
  [ -f .contexture/sessions/storage/lanes/foo/report.md ] || miss "the unit lane key did not map under its root and suffix"
  printf 'stray\n' > .contexture/sessions/stray.md
  store_list unit
  answer
  wantout '{"namespace":"unit","keys":["storage/lanes/foo/report","storage/state"]}'
fi
tc "S6f: the unit module's <unit>/<path...> key admits the main and the lane keys and filters the list; the fixed-depth docs key stays fixed"

# ==============================================================================
# S7: the namespace lock is held during a put, and the put is atomic per key
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
  if [ -d .contexture/tmp/locks/store-docs.lock ]; then _lock_ok=1; break; fi
  _i=$((_i + 1)); sleep 0.1 2>/dev/null || sleep 1
done
printf 'locked\n' >&3
exec 3>&-
wait "$_lock_pid"
[ "$_lock_ok" -eq 1 ] || miss "the namespace lock was not observed while the put read its payload"
[ "$(cat "$SB/lock.rc" 2>/dev/null)" = 0 ] || miss "the locked put exited $(cat "$SB/lock.rc" 2>/dev/null)"
if [ "$IS_POSIX" -eq 1 ]; then
  [ -f docs/workspace/locked.md ] || miss "the locked put did not land its key"
  [ "$(cat docs/workspace/locked.md 2>/dev/null)" = "locked" ] || miss "the locked put did not land its payload"
else
  store_get docs workspace/locked
  rawok
  wantout 'locked'
fi
[ ! -d .contexture/tmp/locks/store-docs.lock ] || miss "the lock remains after the put"
rm -f "$SB/pay.fifo"
tc "S7a: put holds the namespace lock while it reads and releases it after the key lands"
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

# ==============================================================================
# S9: the module-facing library: the store five, data_get/data_emit, depth and cycle
# ==============================================================================
printf '\n== S9: the module-facing library ==\n'
. "$SB/.contexture/storage/scripts/library"
export CTX_STORE_ROOT="$SB"
unset CTX_STORE_RESOLVER
mkdir -p .contexture/modules/libprobe libprobe-root/x
printf 'namespace: libprobe\nroot: libprobe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > .contexture/modules/libprobe/data
printf 'library-value\n' > "$SB/pay-lib"
FN=store.put
store_put libprobe x/y < "$SB/pay-lib" > "$O" 2> "$E"; RC=$?
answer
wantout '{"namespace":"libprobe","key":"x/y","op":"write"}'
FN=store.get
store_get libprobe x/y < /dev/null > "$O" 2> "$E"; RC=$?
rawok
wantfile "$SB/pay-lib"
FN=store.list
store_list libprobe < /dev/null > "$O" 2> "$E"; RC=$?
answer
wantout '{"namespace":"libprobe","keys":["x/y"]}'
FN=store.delete
store_delete libprobe x/y < /dev/null > "$O" 2> "$E"; RC=$?
answer
wantout '{"namespace":"libprobe","key":"x/y","op":"remove"}'
tc "S9a: the library's store five answer through the core resolver on the $DRIVER_NAME driver"

# the library's batch and scan travel the same resolver door
printf 'action=put\nkey=x/y\nhead=none\nvalue_b64=%s\n' "$(b64file "$SB/pay-lib")" > "$SB/lib-batch"
FN=store.batch
store_batch libprobe < "$SB/lib-batch" > "$O" 2> "$E"; RC=$?
answer
wantout '{"namespace":"libprobe","actions":1}'
FN=store.scan
store_scan libprobe < /dev/null > "$O" 2> "$E"; RC=$?
answer
_s9_b=$(b64file "$SB/pay-lib")
wantout "{\"namespace\":\"libprobe\",\"items\":[{\"key\":\"x/y\",\"value_b64\":\"$_s9_b\"}]}"
tc "S9a2: the library's store batch and scan answer through the core resolver"

mkdir -p .contexture/modules/fixture/scripts
printf 'namespace: fixture\nroot: fixture-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > .contexture/modules/fixture/data
cat > .contexture/modules/fixture/scripts/data <<'FIXTURE'
#!/bin/sh
# the fixture module's data script: data_get answers a few refs through data_emit
. "${CTX_STORE_ROOT:-$PWD}/.contexture/storage/scripts/library"
case "${1:-}" in
  data_get)
    case "${2:-}" in
      fixture#item) data_emit "$2" '{"name":"item","value":"one"}' ;;
      fixture#depth:[1-8])
        n=${2##*:}
        if [ "$n" -lt 8 ]; then
          data_get "fixture#depth:$((n + 1))" || exit $?
        else
          data_emit "$2" '{"name":"depth","value":"8"}'
        fi
        ;;
      fixture#deep:[0-9]*)
        n=${2##*:}
        data_get "fixture#deep:$((n + 1))" || exit $?
        ;;
      fixture#cycle:*)
        data_get "$2" || exit $?
        ;;
      *)
        printf 'data_get: error: item '\''%s'\'' not found (ERR_ENTITY_NOT_FOUND)\n' "${2#fixture#}" >&2
        exit 1
        ;;
    esac
    ;;
  *) exit 1 ;;
esac
FIXTURE
chmod +x .contexture/modules/fixture/scripts/data

FN=data_emit
data_emit fixture#item '{"x":1}' > "$O" 2> "$E"; RC=$?
rawok
wantout '{"ref":"fixture#item","data":{"x":1}}'
tc "S9b: data_emit prints the one-line envelope"

FN=data_get
data_get fixture#item > "$O" 2> "$E"; RC=$?
rawok
wantout '{"ref":"fixture#item","data":{"name":"item","value":"one"}}'
data_get fixture#depth:1 > "$O" 2> "$E"; RC=$?
rawok
wantout '{"ref":"fixture#depth:8","data":{"name":"depth","value":"8"}}'
tc "S9c: data_get resolves a module ref and follows a chain to the eighth hop"

data_get fixture#deep:1 > "$O" 2> "$E"; RC=$?
[ "$RC" -eq 1 ] || miss "depth: rc $RC want 1"
[ -s "$O" ] && miss "depth printed stdout [$(head -c 120 "$O")]"
[ "$(wc -l < "$E" | tr -d ' ')" = 1 ] || miss "depth wrote $(wc -l < "$E") stderr lines, want one"
grep -q 'ref depth over the limit 8 (ERR_INVALID_ARGUMENT)' "$E" || miss "depth stderr [$(head -c 200 "$E")]"
data_get fixture#cycle:a > "$O" 2> "$E"; RC=$?
[ "$RC" -eq 1 ] || miss "cycle: rc $RC want 1"
[ -s "$O" ] && miss "cycle printed stdout [$(head -c 120 "$O")]"
grep -q 'ref cycle (ERR_INVALID_ARGUMENT)' "$E" || miss "cycle stderr [$(head -c 200 "$E")]"
tc "S9d: a ref chain over 8 hops and a ref cycle refuse without an answer"

data_get fixture#absent > "$O" 2> "$E"; RC=$?
[ "$RC" -eq 1 ] || miss "absent: rc $RC want 1"
[ -s "$O" ] && miss "absent printed stdout"
[ "$(cat "$E")" = "data_get: error: ref 'fixture#absent': item 'absent' not found (ERR_ENTITY_NOT_FOUND)" ] || miss "absent stderr [$(cat "$E")]"
data_get ghost#x > "$O" 2> "$E"; RC=$?
[ "$RC" -eq 1 ] || miss "missing module: rc $RC want 1"
[ -s "$O" ] && miss "missing module printed stdout"
[ "$(cat "$E")" = "data_get: error: ref 'ghost#x': module 'ghost' not found (ERR_ENTITY_NOT_FOUND)" ] || miss "missing module stderr [$(cat "$E")]"
data_get nohash > "$O" 2> "$E"; RC=$?
[ "$RC" -eq 1 ] || miss "malformed ref: rc $RC want 1"
[ -s "$O" ] && miss "malformed ref printed stdout"
[ "$(cat "$E")" = "data_get: error: ref 'nohash': a reference is <module>#<symbol> (ERR_INVALID_ARGUMENT)" ] || miss "malformed ref stderr [$(cat "$E")]"
tc "S9e: a missing item, a missing module, and a malformed ref refuse their fixed lines"

# ==============================================================================
# S10: the search schema: the flat and document-set forms, the exact rule, the ranked
# modes, and the generic fallback
# ==============================================================================
printf '\n== S10: the search schema ==\n'
mkdir -p "$SB/payloads" .contexture/modules/searchdoc .contexture/modules/flatdoc .contexture/modules/genericdoc .contexture/modules/exactonly .contexture/modules/jsondoc
cat > .contexture/modules/searchdoc/data <<'EOF'
namespace: searchdoc
root: sd-root
suffix: .txt
key: <unit>/<path...>
changes: false
search: documents
modes: exact, hybrid, trigram
document: <unit>/state state session -
document: <unit>/backlog backlog session -
document: <unit>/backlog backlog task @task
document: <unit>/journal journal session -
document: <unit>/journal journal entry @entry
document: <unit>/journal journal session @anchor
document: <unit>/lanes/<lane>/recipe lane_recipe lane -
document: <unit>/lanes/<lane>/journal lane_journal lane -
document: <unit>/lanes/<lane>/journal lane_journal lane_entry @entry
document: <unit>/lanes/<lane>/report lane_report lane -
EOF
printf 'namespace: flatdoc\nroot: flat-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nformat: text\nmodes: exact, hybrid\n' > .contexture/modules/flatdoc/data
printf 'namespace: genericdoc\nroot: generic-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nmodes: exact, hybrid\n' > .contexture/modules/genericdoc/data
printf 'namespace: exactonly\nroot: exact-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nmodes: exact\n' > .contexture/modules/exactonly/data
printf 'namespace: jsondoc\nroot: json-root\nsuffix: .json\nkey: <a>/<b>\nchanges: false\nsearch: flat\nformat: json\nfields: title, body\ntitle: title\nmodes: exact, hybrid\n' > .contexture/modules/jsondoc/data

printf 'status: ACTIVE\ncurrent_anchor: A1\nnext_action: "work"\nobjective: "test"\nrepos: []\n' > "$SB/payloads/state"
cat > "$SB/payloads/backlog" <<'EOF'
# period note

@task alpha
  STATUS: TODO
  OBJECTIVE: "First thing"

@task beta
  STATUS: TODO
  OBJECTIVE: "Second needle"
EOF
cat > "$SB/payloads/journal" <<'EOF'
@anchor A1 2026-11-02

@entry 2026-11-02-event-1
  ANCHOR: A1
  WHAT: "needle in the journal"
  THREAD: none
EOF
cat > "$SB/payloads/report" <<'EOF'
Report about a needle
second line
EOF
printf 'flat needle value\n' > "$SB/payloads/flat"
printf 'generic needle value\n' > "$SB/payloads/generic"
printf '{"title":"Needle title","body":"body needle"}\n' > "$SB/payloads/json"

# ssearch <namespace> <mode> <limit> <query>: the store.search call through the driver
ssearch() {
  FN=store.search
  printf 'query=%s\n' "$4" | "$DRIVER" store.search "$1" "$2" "$3" > "$O" 2> "$E"
  RC=$?
}
# S9 sources the library, whose store_put and store_list own those names; S10 drives the
# driver directly so the suite's own run/answer helpers stay authoritative
sput() { run store.put store.put "$1" "$2" < "$3"; }
slist() { run store.list store.list "$@"; }

sput searchdoc u1/state "$SB/payloads/state"; answer
sput searchdoc u1/backlog "$SB/payloads/backlog"; answer
sput searchdoc u1/journal "$SB/payloads/journal"; answer
sput searchdoc u1/lanes/l1/report "$SB/payloads/report"; answer
sput flatdoc f1/x "$SB/payloads/flat"; answer
sput genericdoc g1/x "$SB/payloads/generic"; answer
sput exactonly e1/x "$SB/payloads/flat"; answer
sput jsondoc j1/x "$SB/payloads/json"; answer

needle_exact='{"namespace":"searchdoc","query":"needle","mode":"exact","total_matches":3,"results":[{"key":"u1/backlog","section":"backlog","snippet":"Second needle","score":0},{"key":"u1/journal","section":"journal","snippet":"needle in the journal","score":0},{"key":"u1/lanes/l1/report","section":"lane_report","snippet":"Report about a needle","score":0}]}'
alpha_exact='{"namespace":"searchdoc","query":"alpha","mode":"exact","total_matches":1,"results":[{"key":"u1/backlog","section":"backlog","snippet":"@task alpha","score":0}]}'
status_exact='{"namespace":"searchdoc","query":"status","mode":"exact","total_matches":3,"results":[{"key":"u1/backlog","section":"backlog","snippet":"TODO","score":0},{"key":"u1/backlog","section":"backlog","snippet":"TODO","score":0},{"key":"u1/state","section":"state","snippet":"status: ACTIVE","score":0}]}'
ssearch searchdoc exact 20 needle; answer; wantout "$needle_exact"
tc "S10a: the exact rule over the document set: one row per entity and section, the first matching line, bytewise key order"
ssearch searchdoc exact 20 alpha; answer; wantout "$alpha_exact"
ssearch searchdoc exact 20 status; answer; wantout "$status_exact"
tc "S10b: two entities in one key and section answer two rows; the state section is its own row"
ssearch searchdoc exact 20 period; answer; wantout '{"namespace":"searchdoc","query":"period","mode":"exact","total_matches":0,"results":[]}'
tc "S10c: a column-0 comment line never matches"
ssearch searchdoc exact 20 ''
refused 1 ERR_INVALID_ARGUMENT "the search query is empty"
tc "S10c2: an empty search query refuses before any result"
ssearch flatdoc exact 20 needle; answer
wantout '{"namespace":"flatdoc","query":"needle","mode":"exact","total_matches":1,"results":[{"key":"f1/x","section":"body","snippet":"flat needle value","score":0}]}'
tc "S10d: the flat form searches the raw value as one document in section body"
ssearch genericdoc exact 20 needle; answer
wantout '{"namespace":"genericdoc","query":"needle","mode":"exact","total_matches":1,"results":[{"key":"g1/x","section":"body","snippet":"generic needle value","score":0}]}'
tc "S10e: a module with no search schema still searches exact through the generic fallback"
ssearch jsondoc exact 20 needle; answer
wantout '{"namespace":"jsondoc","query":"needle","mode":"exact","total_matches":1,"results":[{"key":"j1/x","section":"body","snippet":"{\"title\":\"Needle title\",\"body\":\"body needle\"}","score":0}]}'
tc "S10f: exact over a flat JSON schema still matches the raw value, never the extracted fields"
if [ "$IS_POSIX" -eq 1 ]; then
  ssearch searchdoc hybrid 20 needle
  refused 1 ERR_CAPABILITY_UNSUPPORTED "mode 'hybrid' is not supported; declared modes: exact"
  ssearch exactonly hybrid 20 needle
  refused 1 ERR_CAPABILITY_UNSUPPORTED "mode 'hybrid' is not declared by namespace 'exactonly'; declared modes: exact"
  tc "S10g: posix refuses a ranked mode, and a mode the module does not declare refuses by name"
else
  ssearch searchdoc hybrid 20 needle; answer
  case "$(cat "$O")" in
    '{"namespace":"searchdoc","query":"needle","mode":"hybrid","total_matches":3,'*) ;;
    *) miss "the hybrid answer [$(cat "$O")]" ;;
  esac
  grep -q '"key":"u1/backlog"' "$O" || miss "the hybrid answer lacks the backlog key"
  grep -q '"score":0\.' "$O" || miss "the hybrid answer lacks a positive score"
  ssearch searchdoc trigram 20 needle; answer
  case "$(cat "$O")" in
    '{"namespace":"searchdoc","query":"needle","mode":"trigram","total_matches":3,'*) ;;
    *) miss "the trigram answer [$(cat "$O")]" ;;
  esac
  ssearch flatdoc hybrid 20 needle; answer
  case "$(cat "$O")" in *'"section":"body"'*'"score":0.'*) ;; *) miss "the flat hybrid answer [$(cat "$O")]" ;; esac
  ssearch genericdoc hybrid 20 needle; answer
  case "$(cat "$O")" in *'"key":"g1/x"'*'"section":"body"'*'"score":0.'*) ;; *) miss "the generic hybrid answer [$(cat "$O")]" ;; esac
  ssearch jsondoc hybrid 20 needle; answer
  case "$(cat "$O")" in *'"key":"j1/x"'*'"section":"body"'*'"score":0.'*) ;; *) miss "the JSON hybrid answer [$(cat "$O")]" ;; esac
  ssearch exactonly hybrid 20 needle
  refused 1 ERR_CAPABILITY_UNSUPPORTED "mode 'hybrid' is not declared by namespace 'exactonly'; declared modes: exact"
  tc "S10g: the ranked modes answer from the fts5 store index; the generic raw fallback ranks a schema-less module; an undeclared mode refuses by name"
fi
# the schema's shape refusals
mkdir -p .contexture/modules/badsearch
printf 'namespace: badsearch\nroot: bad-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: documents\n' > .contexture/modules/badsearch/data
slist badsearch
refused 1 ERR_INVALID_ARGUMENT "the document-set search form takes at least one document rule"
printf 'namespace: badsearch\nroot: bad-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: documents\nformat: text\ndocument: <a>/<b> body document -\n' > .contexture/modules/badsearch/data
slist badsearch
refused 1 ERR_INVALID_ARGUMENT "the document-set search form takes no format or fields"
printf 'namespace: badsearch\nroot: bad-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\ndocument: <a>/<b> body document -\n' > .contexture/modules/badsearch/data
slist badsearch
refused 1 ERR_INVALID_ARGUMENT "a document rule needs the document-set search form"
printf 'namespace: badsearch\nroot: bad-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: documents\ndocument: <a>/<b> body document\n' > .contexture/modules/badsearch/data
slist badsearch
refused 1 ERR_INVALID_ARGUMENT "line 7: a document rule takes the key pattern, the section, the entity type, and the head marker (or -)"
printf 'namespace: badsearch\nroot: bad-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nmodes: exact, exact\n' > .contexture/modules/badsearch/data
slist badsearch
refused 1 ERR_INVALID_ARGUMENT "duplicate mode 'exact'"
printf 'namespace: badsearch\nroot: bad-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nmodes: hybrid\n' > .contexture/modules/badsearch/data
slist badsearch
refused 1 ERR_INVALID_ARGUMENT "the modes must include exact"
tc "S10h: the search schema's shape refusals name the rule (a document form without a rule, a flat field with a document rule, a three-token rule, a repeated mode, modes without exact)"

# ==============================================================================
# S11: the transactional batch: all or none, the first-failure line, the change rows
# ==============================================================================
printf '\n== S11: the batch ==\n'
# S9 sourced the library, whose store_put and store_get own those names; S11 and S12
# drive the driver directly so the suite's own run/answer helpers stay authoritative
s11_put() { run store.put store.put "$1" "$2" < "$3"; }
s11_get() { run store.get store.get "$1" "$2"; }
printf 'one\n' > "$SB/bat-one"
printf 'two\n' > "$SB/bat-two"
printf 'three\n' > "$SB/bat-three"
s11_put docs workspace/bat1 "$SB/bat-one"; answer
s11_put docs workspace/bat2 "$SB/bat-two"; answer
if [ "$IS_POSIX" -eq 0 ]; then
  _s11_seq=$(sqlite3 "$SB/.contexture/sessions.db" "SELECT coalesce(max(seq), 0) FROM store_changes;")
fi
{
  printf 'action=put\nkey=workspace/bat3\nhead=0123abcd\nvalue_b64=%s\n' "$(b64file "$SB/bat-three")"
  printf 'action=delete\nkey=workspace/bat1\nhead=none\n'
  printf 'action=put\nkey=workspace/bat2\nhead=none\nvalue_b64=%s\n' "$(b64file "$SB/bat-one")"
} > "$SB/batch-ok"
run store.batch store.batch docs < "$SB/batch-ok"
answer
wantout '{"namespace":"docs","actions":3}'
s11_get docs workspace/bat3; rawok; wantfile "$SB/bat-three"
s11_get docs workspace/bat1
refused 1 ERR_ENTITY_NOT_FOUND "key 'workspace/bat1' not found in namespace 'docs'"
s11_get docs workspace/bat2; rawok; wantfile "$SB/bat-one"
tc "S11a: the batch applies puts and deletes in order and answers its action count"
if [ "$IS_POSIX" -eq 0 ]; then
  _s11_rows=$(sqlite3 "$SB/.contexture/sessions.db" "SELECT op || '|' || key || '|' || prior || '|' || head FROM store_changes WHERE seq > $_s11_seq ORDER BY seq;")
  _s11_want='put|workspace/bat3|absent|0123abcd
delete|workspace/bat1|present|none
put|workspace/bat2|present|none'
  [ "$_s11_rows" = "$_s11_want" ] || miss "the batch change rows [$_s11_rows] want [$_s11_want]"
  tc "S11b: the fts5 batch lands one change row per action in order, prior at its position"
fi

# a semantic failure at action 2: only that line, and action 1 never lands
{
  printf 'action=put\nkey=workspace/bat4\nhead=none\nvalue_b64=%s\n' "$(b64file "$SB/bat-two")"
  printf 'action=delete\nkey=workspace/bat9\nhead=none\n'
} > "$SB/batch-sem"
run store.batch store.batch docs < "$SB/batch-sem"
refused 1 ERR_ENTITY_NOT_FOUND "action 2 (delete 'workspace/bat9'): key 'workspace/bat9' not found in namespace 'docs'"
s11_get docs workspace/bat4
refused 1 ERR_ENTITY_NOT_FOUND "key 'workspace/bat4' not found in namespace 'docs'"
tc "S11c: a semantic failure at action 2 names it and leaves action 1 unwritten"

# a planted storage failure at action 2 rolls action 1 back and names action 2
if [ "$IS_POSIX" -eq 1 ]; then
  mkdir -p docs/ro
  printf 'ro\n' > "$SB/bat-ro"
  {
    printf 'action=put\nkey=a/new\nhead=none\nvalue_b64=%s\n' "$(b64file "$SB/bat-one")"
    printf 'action=put\nkey=ro/x\nhead=none\nvalue_b64=%s\n' "$(b64file "$SB/bat-ro")"
  } > "$SB/batch-plant"
  chmod 500 docs/ro
  run store.batch store.batch docs < "$SB/batch-plant"
  chmod 700 docs/ro
  refused 2 ERR_STORAGE_WRITE "action 2 (put 'ro/x'): the storage write of key 'ro/x' failed"
  s11_get docs a/new
  refused 1 ERR_ENTITY_NOT_FOUND "key 'a/new' not found in namespace 'docs'"
  [ ! -d docs/a ] || miss "the rollback left the folder action 1 created"
  tc "S11d: a planted second-action write failure rolls the first back and names action 2"
else
  _s11_seq=$(sqlite3 "$SB/.contexture/sessions.db" "SELECT coalesce(max(seq), 0) FROM store_changes;")
  sqlite3 "$SB/.contexture/sessions.db" "CREATE TRIGGER plant_store BEFORE INSERT ON store WHEN NEW.key = 'workspace/boom' BEGIN SELECT RAISE(ABORT, 'planted'); END;"
  {
    printf 'action=put\nkey=workspace/bat5\nhead=none\nvalue_b64=%s\n' "$(b64file "$SB/bat-one")"
    printf 'action=put\nkey=workspace/boom\nhead=none\nvalue_b64=%s\n' "$(b64file "$SB/bat-two")"
  } > "$SB/batch-plant"
  run store.batch store.batch docs < "$SB/batch-plant"
  sqlite3 "$SB/.contexture/sessions.db" "DROP TRIGGER plant_store;"
  refused 2 ERR_STORAGE_WRITE "action 2 (put 'workspace/boom'): the storage write of key 'workspace/boom' failed"
  s11_get docs workspace/bat5
  refused 1 ERR_ENTITY_NOT_FOUND "key 'workspace/bat5' not found in namespace 'docs'"
  _s11_after=$(sqlite3 "$SB/.contexture/sessions.db" "SELECT count(*) FROM store_changes WHERE seq > $_s11_seq;")
  [ "$_s11_after" = 0 ] || miss "the rolled-back batch left $_s11_after change rows"
  tc "S11d: a planted second-action write failure rolls the first back and names action 2"
fi

# malformed payloads: the action and key context is named, nothing written
printf 'action=bogus\nkey=workspace/bat6\n' > "$SB/batch-bad-op"
run store.batch store.batch docs < "$SB/batch-bad-op"
refused 1 ERR_INVALID_ARGUMENT "action 1 (bogus '?'): unknown action 'bogus' (put or delete)"
printf 'action=put\nkey=workspace/bat6\n' > "$SB/batch-no-val"
run store.batch store.batch docs < "$SB/batch-no-val"
refused 1 ERR_INVALID_ARGUMENT "action 1 (put 'workspace/bat6'): a put carries no value"
printf 'action=delete\nkey=workspace/bat2\nvalue_b64=aGk=\n' > "$SB/batch-del-val"
run store.batch store.batch docs < "$SB/batch-del-val"
refused 1 ERR_INVALID_ARGUMENT "action 1 (delete 'workspace/bat2'): a delete carries no value"
: > "$SB/batch-empty"
run store.batch store.batch docs < "$SB/batch-empty"
refused 1 ERR_INVALID_ARGUMENT "action 1 (? '?'): the batch carries no actions"
tc "S11e: a malformed action, a missing put value, a delete value, and an empty list refuse with the action context"

# ==============================================================================
# S12: the scan: the module pattern, bytewise order, the raw bytes in base64, empty
# ==============================================================================
printf '\n== S12: the scan ==\n'
mkdir -p .contexture/modules/scanprobe scan-root/x
printf 'namespace: scanprobe\nroot: scan-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > .contexture/modules/scanprobe/data
printf 'B\n' > scan-root/x/B.txt
printf 'a\n' > scan-root/x/a.txt
printf 'aa\n' > scan-root/x/aa.txt
printf 'a\000b\377' > scan-root/x/bin.txt
mkdir -p scan-root/x/y
printf 'three segments\n' > scan-root/x/y/z.txt
printf 'one segment\n' > scan-root/top.txt
if [ "$IS_POSIX" -eq 0 ]; then
  for _k in B a aa bin; do
    s11_put scanprobe "x/$_k" "scan-root/x/$_k.txt"
    answer
  done
  sqlite3 "$SB/.contexture/sessions.db" "INSERT INTO store (namespace, key, value, updated_at) VALUES ('scanprobe', 'top', x'78', 't'); INSERT INTO store (namespace, key, value, updated_at) VALUES ('scanprobe', 'x/y/z', x'78', 't');"
fi
run store.scan store.scan scanprobe
answer
_s12_b=$(b64file scan-root/x/B.txt)
_s12_a=$(b64file scan-root/x/a.txt)
_s12_aa=$(b64file scan-root/x/aa.txt)
_s12_bin=$(b64file scan-root/x/bin.txt)
wantout "{\"namespace\":\"scanprobe\",\"items\":[{\"key\":\"x/B\",\"value_b64\":\"$_s12_b\"},{\"key\":\"x/a\",\"value_b64\":\"$_s12_a\"},{\"key\":\"x/aa\",\"value_b64\":\"$_s12_aa\"},{\"key\":\"x/bin\",\"value_b64\":\"$_s12_bin\"}]}"
_s12_got=$(sed -n 's/.*"key":"x\/bin","value_b64":"\([^"]*\)".*/\1/p' "$O")
b64decode "$_s12_got" "$SB/scan-bin.out" || miss "the scanned binary value did not decode"
cmp -s "$SB/scan-bin.out" scan-root/x/bin.txt || miss "the scanned binary value differs from the stored bytes"
tc "S12a: the scan answers every admitted key bytewise with its raw value in base64 (a binary value included)"
mkdir -p .contexture/modules/emptyprobe
printf 'namespace: emptyprobe\nroot: empty-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n' > .contexture/modules/emptyprobe/data
run store.scan store.scan emptyprobe
answer
wantout '{"namespace":"emptyprobe","items":[]}'
tc "S12b: an empty namespace answers an empty item list"

printf '\n== summary ==\n'
printf 'store-compliance (%s): pass=%d fail=%d\n' "$DRIVER_NAME" "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
