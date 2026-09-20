#!/bin/sh
# compact.sh: turnkey stream compaction filter
# Zero external dependencies: pure POSIX /bin/sh and awk
#
# Usage:
#   Piping into compact (primary Unix pattern):
#     git diff | .contexture/scripts/compact.sh
#     git log -p -n 5 | .contexture/scripts/compact.sh
#     cat /path/to/app.log | .contexture/scripts/compact.sh
#
#   Direct command wrapping (optional convenience):
#     .contexture/scripts/compact.sh git diff
#     .contexture/scripts/compact.sh git show HEAD
#
# Options:
#   --mode=diff|log|auto   Force stream mode (default: auto)
#   --stats                Emit compaction stats to stderr
#   --max-context=N        Maximum context lines in diff hunks (default: 1)
#   --help, -h             Show this help

set -e

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
FILTER="$SCRIPT_DIR/compact-filter.awk"

if [ ! -f "$FILTER" ]; then
  if [ -f "$SCRIPT_DIR/../scripts/compact-filter.awk" ]; then
    FILTER="$SCRIPT_DIR/../scripts/compact-filter.awk"
  elif [ -f "./.contexture/scripts/compact-filter.awk" ]; then
    FILTER="./.contexture/scripts/compact-filter.awk"
  fi
fi

mode="auto"
stats=0
max_context=""

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      echo "usage: compact.sh [--mode=diff|log|auto] [--stats] [--max-context=N] [cmd [args...]]"
      exit 0
      ;;
    --stats)
      stats=1
      shift
      ;;
    --mode=*)
      mode="${1#--mode=}"
      shift
      ;;
    --max-context=*)
      max_context="${1#--max-context=}"
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "compact.sh: unrecognized option: $1" >&2
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

awk_args="-v mode=$mode -v stats=$stats"
[ -n "$max_context" ] && awk_args="$awk_args -v max_context=$max_context"

if [ $# -eq 0 ]; then
  # Standard Unix stdin pipe mode
  # shellcheck disable=SC2086
  exec awk -f "$FILTER" $awk_args
else
  # Command wrapper mode: preserve command exit code via fd redirection
  exec 3>&1
  status=$(
    exec 4>&1
    # shellcheck disable=SC2086
    { rc=0; "$@" 2>&1 || rc=$?; echo "$rc" >&4; } | awk -f "$FILTER" $awk_args >&3
  )
  exit "$status"
fi
