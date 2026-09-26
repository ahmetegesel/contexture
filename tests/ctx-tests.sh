#!/bin/sh
# ctx-tests.sh: the engine suite, staged from the shipped core
# (base/.contexture/ctx plus the base session and run modules). Covers module
# discovery (summary, warn+skip shapes, filter-only/hook-only legality, the
# reserved-name refusal), assembly (help forms, module and verb detail,
# engine-owned help), dispatch (cwd, environment, argv, streams, rc), the run
# mechanics (explicit filter, stream signature, raw passthrough, filter merge
# with shadow and priority-over, the module default, COMPACT_DISABLE), the
# bad-header sandbox, and the ideas workspace module when the live drawer
# carries it (skipped cleanly otherwise).
#
# Usage: tests/ctx-tests.sh
# Exit 0 when every case passes; 1 otherwise.

set -u

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH="" cd "$SCRIPT_DIR/.." && pwd)
CTX_SRC="$ROOT/base/.contexture/ctx"
SESSION_MOD="$ROOT/base/.contexture/modules/session"
RUN_MOD="$ROOT/base/.contexture/modules/run"
IDEAS_MOD="$ROOT/.contexture/modules/ideas"
IDEAS_FIXTURE="$SCRIPT_DIR/fixtures/ideas/IDEAS.md"

export LC_ALL=C
unset COMPACT_DISABLE COMPACT_DEBUG

if [ ! -f "$CTX_SRC" ]; then
  echo "ctx-tests.sh: ctx not found at $CTX_SRC" >&2
  exit 1
fi

tmp_root="${TMPDIR:-/tmp}"
if mkdir -p "$ROOT/.contexture/tmp" 2>/dev/null && [ -d "$ROOT/.contexture/tmp" ] && [ -w "$ROOT/.contexture/tmp" ]; then
  tmp_root="$ROOT/.contexture/tmp"
fi
SANDBOX=$(mktemp -d "$tmp_root/ctx-tests.XXXXXX") || exit 1
cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

mkdir -p "$SANDBOX/.contexture/modules" "$SANDBOX/bin"
cp "$CTX_SRC" "$SANDBOX/.contexture/ctx"
chmod +x "$SANDBOX/.contexture/ctx"
cp -R "$SESSION_MOD" "$SANDBOX/.contexture/modules/session"
cp -R "$RUN_MOD" "$SANDBOX/.contexture/modules/run"

# fixture modules: a good one, three broken shapes, a reserved name, a
# filter-only and a hook-only module
mkdir -p "$SANDBOX/.contexture/modules/good/scripts" "$SANDBOX/.contexture/modules/nosummary/scripts" "$SANDBOX/.contexture/modules/scriptsonly/scripts" "$SANDBOX/.contexture/modules/filteronly/filters" "$SANDBOX/.contexture/modules/load/scripts" "$SANDBOX/.contexture/modules/hookonly/hooks"
printf '# summary: a good fixture module\n' > "$SANDBOX/.contexture/modules/good/module"
{
  echo '#!/bin/sh'
  echo '# summary: say hi'
  echo '# usage: ctx good hi [<name>]'
  echo '# help: prints hi, optionally to a name'
  echo 'echo "hi ${1:-world}"'
} > "$SANDBOX/.contexture/modules/good/scripts/hi"
{
  echo '#!/bin/sh'
  echo '# summary: print the dispatch environment'
  echo '# usage: ctx good env [args...]'
  echo '# help: prints pwd and the exported dispatch variables'
  echo 'printf "pwd=%s\n" "$PWD"'
  echo 'printf "CTX_ROOT=%s\n" "$CTX_ROOT"'
  echo 'printf "CTX_MODULE_DIR=%s\n" "$CTX_MODULE_DIR"'
  echo 'printf "CTX_BIN=%s\n" "$CTX_BIN"'
  echo 'printf "LC_ALL=%s\n" "$LC_ALL"'
  echo 'printf "argv=%s\n" "$*"'
} > "$SANDBOX/.contexture/modules/good/scripts/env"
printf '# no summary here\n' > "$SANDBOX/.contexture/modules/nosummary/module"
printf '#!/bin/sh\necho nope\n' > "$SANDBOX/.contexture/modules/nosummary/scripts/x"
{
  echo '#!/bin/sh'
  echo '# summary: orphan verb'
  echo 'echo orphan'
} > "$SANDBOX/.contexture/modules/scriptsonly/scripts/orphan"
{
  echo '#!/usr/bin/awk -f'
  echo '# filter: probe'
  echo '# match: ^ZZMARK'
  echo '# format-only: probe'
  echo '/ZZMARK/ { print "P" }'
} > "$SANDBOX/.contexture/modules/filteronly/filters/probe.awk"
printf '# summary: should never list\n' > "$SANDBOX/.contexture/modules/load/module"
printf '#!/bin/sh\necho shadow\n' > "$SANDBOX/.contexture/modules/load/scripts/y"
{
  echo '#!/bin/sh'
  echo '# ctx-hook: load-pre'
  echo 'echo "HOOK hookonly" >> marker.log'
} > "$SANDBOX/.contexture/modules/hookonly/hooks/10-emit.sh"
{
  echo '#!/bin/sh'
  echo '# summary: should never be a verb'
  echo 'echo shadow-help'
} > "$SANDBOX/.contexture/modules/good/scripts/help"
{
  echo '#!/bin/sh'
  echo 'echo "hi there famcmd output line"'
} > "$SANDBOX/bin/famcmd"

chmod +x "$SANDBOX/.contexture/modules/session/scripts/"* "$SANDBOX/.contexture/modules/good/scripts/"* "$SANDBOX/.contexture/modules/scriptsonly/scripts/orphan" "$SANDBOX/.contexture/modules/filteronly/filters/probe.awk" "$SANDBOX/.contexture/modules/hookonly/hooks/10-emit.sh" "$SANDBOX/bin/famcmd"

cd "$SANDBOX" || exit 1
CTX=./.contexture/ctx
SBROOT=$(pwd)

pass=0
fail=0
ok() { pass=$((pass + 1)); echo "PASS: $1"; }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
a_eq() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want [$1] got [$2])"; fi; }
a_match() { if printf '%s\n' "$1" | grep -q "$2"; then ok "$3"; else bad "$3 (no match: $2)"; fi; }
a_not() { if printf '%s\n' "$1" | grep -q "$2"; then bad "$3 (unwanted: $2)"; else ok "$3"; fi; }

echo "== D discovery and assembly =="
h=$($CTX help 2>help.err)
a_eq "$?" "0" "ctx help rc0"
a_match "$h" "ctx: the workspace command binder" "top help banner"
a_match "$h" "good" "listed: good"
a_match "$h" "a good fixture module" "summary shown: good"
a_not "$h" "nosummary" "unlisted: module file without a summary"
a_not "$h" "scriptsonly" "unlisted: scripts/ without a module file"
a_not "$h" "filteronly" "unlisted and silent: filter-only module"
a_not "$h" "hookonly" "unlisted and silent: hook-only module"
a_not "$h" "load " "unlisted: reserved name"
a_not "$h" "shadow-help" "scripts/help never surfaces"
errs=$(cat help.err)
a_match "$errs" "skipping module nosummary: module file has no summary" "warn: module file without summary"
a_match "$errs" "skipping module scriptsonly: scripts/ without a module file" "warn: scripts without module file"
a_match "$errs" "reserved name refused (shadow): load" "warn: reserved name refused"
h=$($CTX 2>/dev/null)
a_match "$h" "ctx: the workspace command binder" "zero-arg ctx prints the summary rc0"
$CTX help extra >/dev/null 2>&1
a_eq "$?" "1" "ctx help with an extra argument rc1"
hall=$($CTX help --all 2>/dev/null)
rc=$?
a_eq "$rc" "0" "ctx help --all rc0"
a_match "$hall" "module good:" "help --all renders the good module block"
a_match "$hall" "module session:" "help --all renders the session module block"
a_match "$hall" "say hi" "help --all carries the verb summary"
$CTX nosuch >/dev/null 2>&1
a_eq "$?" "1" "unknown top name rc1"
err=$($CTX nosuch 2>&1 >/dev/null)
a_match "$err" "unknown command: nosuch" "unknown top name names the command"

echo "== A module and verb help =="
out=$($CTX good 2>/dev/null)
rc=$?
a_eq "$rc" "0" "bare module prints help rc0"
a_match "$out" "ctx good: a good fixture module" "bare module help carries the summary"
a_match "$out" "say hi" "bare module help lists the verb"
out=$($CTX good help hi 2>/dev/null)
a_eq "$?" "0" "verb help rc0"
a_match "$out" "say hi" "verb help summary"
a_match "$out" "prints hi, optionally to a name" "verb help body"
err=$($CTX good help 2>&1 >/dev/null)
a_match "$err" "help is engine-owned; ignoring scripts/help in good" "warn: engine help wins over scripts/help"
$CTX good help nosuch >/dev/null 2>&1
a_eq "$?" "1" "verb help on an unknown verb rc1"
$CTX good nosuch >/dev/null 2>&1
a_eq "$?" "1" "unknown verb dispatch rc1"
err=$($CTX good nosuch 2>&1 >/dev/null)
a_match "$err" "unknown verb: nosuch" "unknown verb names the verb"
a_match "$err" "ctx good: a good fixture module" "unknown verb prints the module table on stderr"

echo "== X dispatch contract =="
out=$($CTX good hi ada 2>/dev/null)
a_eq "$out" "hi ada" "dispatch: argv passes through"
out=$($CTX good env "a b" c 2>/dev/null)
a_match "$out" "pwd=$SBROOT" "dispatch: cwd is the workspace root"
a_match "$out" "CTX_ROOT=$SBROOT" "dispatch: CTX_ROOT exported"
a_match "$out" "CTX_MODULE_DIR=$SBROOT/.contexture/modules/good" "dispatch: CTX_MODULE_DIR exported"
a_match "$out" "CTX_BIN=$SBROOT/.contexture/ctx" "dispatch: CTX_BIN exported"
a_match "$out" "LC_ALL=C" "dispatch: LC_ALL=C exported"
a_match "$out" "argv=a b c" "dispatch: quoted argv passes through"
mkdir -p nested/deeper
out=$(cd nested/deeper && "$SBROOT/.contexture/ctx" good hi 2>/dev/null)
a_eq "$out" "hi world" "dispatch from a nested dir rc0"
out=$(cd nested/deeper && "$SBROOT/.contexture/ctx" good env 2>/dev/null)
a_match "$out" "pwd=$SBROOT" "dispatch chdirs to the workspace root from anywhere"
$CTX load >/dev/null 2>&1
a_eq "$?" "1" "reserved module not dispatchable rc1"

echo "== R run mechanics =="
out=$(printf 'ZZMARK hello\n' | $CTX run --filter=probe 2>/dev/null)
a_eq "$out" "P" "explicit filter resolves (filter-only module)"
out=$(printf 'ZZMARK hello\n' | $CTX run 2>/dev/null)
a_eq "$out" "P" "stream signature selects the filter"
out=$(printf 'plain unmatched text\n' | $CTX run 2>/dev/null)
a_eq "$out" "plain unmatched text" "unmatched stream passes through raw"
out=$(printf 'x\n' | $CTX run --filter=nope 2>run.err)
a_eq "$?" "0" "explicit missing filter keeps the command rc"
a_match "$(cat run.err)" "filter not found: nope" "explicit missing filter names the miss"
a_eq "$out" "x" "explicit missing filter passes the raw stream"
out=$($CTX run --help 2>/dev/null)
a_eq "$?" "0" "ctx run --help rc0"
a_match "$out" "usage: ctx run" "ctx run --help prints the run usage"

# filter merge: a module filter claims a command; a later module shadows it,
# and priority-over replaces the earlier selection
mkdir -p .contexture/modules/famone/filters .contexture/modules/famtow/filters
printf '# summary: fixture module one\n' > .contexture/modules/famone/module
{
  echo '#!/usr/bin/awk -f'
  echo '# filter: famone'
  echo '# command: ^famcmd$'
  echo '# format-only: famone'
  echo '{ print "FAM-ONE" }'
} > .contexture/modules/famone/filters/a.awk
printf '# summary: fixture module two\n' > .contexture/modules/famtow/module
{
  echo '#!/usr/bin/awk -f'
  echo '# filter: famtow'
  echo '# command: ^famcmd$'
  echo '# format-only: famtow'
  echo '{ print "FAM-TWO" }'
} > .contexture/modules/famtow/filters/b.awk
out=$(PATH="$SANDBOX/bin:$PATH" $CTX run famcmd 2>shadow.err)
a_eq "$out" "FAM-ONE" "module filter selected first by name order"
a_match "$(cat shadow.err)" "shadow warning: a.awk and famtow/b.awk both claim: famcmd" "later module match warns as shadow"
printf '# ctx-filter-priority: over\n' >> .contexture/modules/famtow/filters/b.awk
out=$(PATH="$SANDBOX/bin:$PATH" COMPACT_DEBUG=1 $CTX run famcmd 2>prio.err)
a_eq "$out" "FAM-TWO" "priority over replaces the earlier selection"
a_match "$(cat prio.err)" "selected famtow/b.awk (command match: famcmd, priority over)" "priority over reported in debug"
mkdir -p .contexture/modules/famdef/filters
printf '# summary: fixture module default\n' > .contexture/modules/famdef/module
{
  echo '#!/usr/bin/awk -f'
  echo '# filter: famdef'
  echo '# default: famdef'
  echo '# format-only: famdef'
  echo '{ print "DEF" }'
} > .contexture/modules/famdef/filters/d.awk
mv .contexture/modules/run/filters/log.awk .contexture/modules/run/filters/log.awk.off
out=$(printf 'hello world\n' | COMPACT_DEBUG=1 $CTX run 2>def.err)
mv .contexture/modules/run/filters/log.awk.off .contexture/modules/run/filters/log.awk
a_eq "$out" "DEF" "module default fills an empty selection"
a_match "$(cat def.err)" "selected famdef/d.awk (module default)" "module default reported in debug"

# COMPACT_DISABLE: raw execution, command rc intact; pipe form rc0
COMPACT_DISABLE=1 $CTX run sh -c 'exit 5' >/dev/null 2>&1
a_eq "$?" "5" "COMPACT_DISABLE keeps the command exit code"
out=$(printf 'raw line\n' | COMPACT_DISABLE=1 $CTX run 2>/dev/null)
a_eq "$out" "raw line" "COMPACT_DISABLE pipe form passes the raw stream"
err=$(COMPACT_DISABLE=1 COMPACT_DEBUG=1 $CTX run sh -c 'exit 0' 2>&1 >/dev/null)
a_match "$err" "debug: bypassed (COMPACT_DISABLE=1)" "COMPACT_DISABLE debug notice"

echo "== H hook-only module discovery =="
$CTX session bootstrap u1 "ctx suite unit" >/dev/null 2>&1
: > marker.log
$CTX session load u1 >/dev/null 2>&1
a_eq "$(cat marker.log)" "HOOK hookonly" "hook-only module hook fires at load-pre"

echo "== I ideas workspace module =="
if [ -d "$IDEAS_MOD" ] && [ -f "$IDEAS_FIXTURE" ]; then
  cp -R "$IDEAS_MOD" .contexture/modules/ideas
  chmod +x .contexture/modules/ideas/scripts/*
  h=$($CTX help 2>/dev/null)
  a_match "$h" "ideas" "ctx help lists the ideas module"
  mkdir -p ideas-scratch
  cp "$IDEAS_FIXTURE" ideas-scratch/IDEAS.md
  export IDEAS_FILE="$SANDBOX/ideas-scratch/IDEAS.md"
  open=$($CTX ideas list 2>/dev/null)
  a_eq "$open" "probe-open" "ideas list open returns only the OPEN slug"
  all=$($CTX ideas list all 2>/dev/null)
  a_match "$all" "probe-picked" "ideas list all carries every status"
  a_not "$open" "probe-picked" "picked slug stays out of the open list"
  a_not "$open" "never reaches the open list" "non-open bodies never reach the open list"
  show=$($CTX ideas show probe-picked 2>/dev/null)
  a_match "$show" "^@idea probe-picked" "ideas show resolves one block"
  $CTX ideas show no-such-idea >/dev/null 2>&1
  a_eq "$?" "1" "ideas show unknown slug rc1"
  bh=$($CTX ideas 2>/dev/null)
  rc=$?
  a_eq "$rc" "0" "bare ideas prints module help rc0"
  a_match "$bh" "list ideas by status" "ideas help lists the verb table"
  printf '@idea probe-new\n  WHAT: "probe idea"\n' | $CTX ideas add >/dev/null 2>&1
  a_eq "$?" "0" "ideas add rc0"
  $CTX ideas add </dev/null >/dev/null 2>&1
  a_eq "$?" "1" "ideas add empty stdin rc1"
  printf '@idea probe-new\n  WHAT: "dup"\n' | $CTX ideas add >/dev/null 2>&1
  a_eq "$?" "1" "ideas add duplicate slug rc1"
  $CTX ideas pick probe-new demo-unit >/dev/null 2>&1
  a_eq "$?" "0" "ideas pick dashed unit rc0"
  $CTX ideas list picked 2>/dev/null | grep -qx probe-new && ok "picked list contains the slug" || bad "picked list contains the slug"
  $CTX ideas drop probe-new "(why with parens)" >/dev/null 2>&1
  a_eq "$?" "0" "ideas drop parenthesized why rc0"
  $CTX ideas list dropped 2>/dev/null | grep -qx probe-new && ok "dropped list contains the slug" || bad "dropped list contains the slug"
  a_not "$($CTX ideas list 2>/dev/null)" "probe-new" "open list excludes the dropped probe"
  unset IDEAS_FILE
else
  echo "SKIP ideas: live ideas module or fixture not present (workspace-only module)"
fi

echo "== R run diagnostics =="
$CTX run --diagnose >/dev/null 2>&1
a_eq "$?" "0" "run --diagnose rc0"
run_diag=$($CTX run --diagnose 2>/dev/null)
a_match "$run_diag" "runner compaction diagnostics" "run --diagnose outputs header"
a_match "$run_diag" "temp directory:" "run --diagnose reports temp directory"
a_match "$run_diag" "builtin filters:" "run --diagnose reports builtin filters"

echo "== summary =="
echo "ctx-tests: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
