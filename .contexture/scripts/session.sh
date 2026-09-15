#!/bin/sh
# session.sh: the session entry point: one doorway over the awk workers
# Usage: .contexture/scripts/session.sh <command> [args]
# Commands: active, bootstrap, load, stamp, board, audit, index, help.
# The help carries every command contract; the workers are the
# implementation. help prints the table to stdout rc=0; no argument, an
# unknown command, or extra help arguments print the table to stderr rc=1
# with zero stdout. Any argument beginning with a dash, in any position,
# refuses before dispatch: the table to stderr rc=1 with zero stdout (the
# awk option parser would consume it before the workers' guards run). The
# wrapper chdirs to the workspace root, its directory over two, so every
# worker's relative paths resolve from the root wherever the caller stands.
# Each command forwards its arguments to its worker and exits with the
# worker's exit code. Invoke the real path: through an out-of-tree symlink
# to this file the directory resolves to the link's directory and dispatch
# fails.

dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$dir/../.." && pwd)

show_help() {
  cat <<'EOF'
session.sh: the session entry point over the awk workers

usage:
  session.sh help
  session.sh active
  session.sh bootstrap <slug> "<objective>" [<repos>]
  session.sh load <slug> [<page>]
  session.sh load refs <ref_1> ... <ref_N> [<page>]
  session.sh stamp <slug> "<attention>"
  session.sh board <slug>
  session.sh audit <slug>
  session.sh index

no flags: any argument beginning with a dash, in any position, refuses rc=1 with this table on stderr and zero stdout

commands:
  help       print this table; stdout rc=0. no argument, an unknown command, or extra help arguments print the table to stderr rc=1 with zero stdout
  active     no arguments: every ACTIVE unit (slug, current_anchor, next_action, objective verbatim) then the closed count; a missing sessions directory prints "no sessions yet" rc=0; an argument refuses rc=1
  bootstrap  <slug> "<objective>" [<repos>]: create the unit folder, state at A0 folded to A1, the three artifacts; prints the state and "next: declare the first task"; refusals rc=1 with zero partial writes (existing slug, malformed slug, empty objective, embedded newline, extra arguments)
  load       <slug> [<page>]: the load map plus one page; keep calling until a page reads complete; missing state is fatal rc=1; a missing backlog, knowledge, or journal warns on stderr and prints a placeholder
  load refs  <ref_1> ... <ref_N> [<page>]: the refs load: those sessions read-only (the notice, the knowledge, the live journal), locally paged; a missing ref is fatal rc=1; a session named refs reads via load refs refs
  stamp      <slug> "<attention>": bump current_anchor to A<N+1> and append the anchor receipt to journal.md; malformed state or attention refuses rc=1 with no partial write
  board      <slug>: the live board: unclosed journal entries with complete bodies, then the open task slugs; missing journal is fatal rc=1; a missing backlog warns on stderr
  audit      <slug>: the session audit: dangling and slugless closers, entry grammar, the backlog and state cross-checks; rc=1 on any finding; prints the open thread tail
  index      no arguments: the rhythm index from .contexture/rhythms/ as name (path) | use when | activation; an argument refuses rc=1

workers: .contexture/scripts/session-<command>.awk, cross-platform POSIX awk (index is rhythms-index.awk)
EOF
}

usage_error() {
  show_help >&2
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    -*) usage_error ;;
  esac
done

if ! cd "$root"; then
  echo "ERROR: cannot enter workspace root: $root" >&2
  exit 1
fi

case "$1" in
  help)
    shift
    if [ "$#" -ne 0 ]; then usage_error; fi
    show_help
    exit 0
    ;;
  active)
    shift
    exec "$dir/session-active.awk" "$@"
    ;;
  bootstrap)
    shift
    exec "$dir/session-bootstrap.awk" "$@"
    ;;
  load)
    shift
    exec "$dir/session-load.awk" "$@"
    ;;
  stamp)
    shift
    exec "$dir/session-stamp.awk" "$@"
    ;;
  board)
    shift
    exec "$dir/session-board.awk" "$@"
    ;;
  audit)
    shift
    exec "$dir/session-audit.awk" "$@"
    ;;
  index)
    shift
    exec "$dir/rhythms-index.awk" "$@"
    ;;
  *)
    usage_error
    ;;
esac
