#!/bin/sh
# compact.sh: discoverable stream compaction filter and runner
# Zero external dependencies: pure POSIX /bin/sh and awk
#
# Usage:
#   Piping into compact (primary Unix pattern, zero parameters):
#     git diff | .contexture/scripts/compact.sh
#     cargo test | .contexture/scripts/compact.sh
#     cat app.log | .contexture/scripts/compact.sh
#
#   Direct command wrapping (preserves command exit code):
#     .contexture/scripts/compact.sh git diff
#     .contexture/scripts/compact.sh cargo test
#
# Options:
#   --filter=NAME      Explicitly select filter from .contexture/filters/NAME.awk
#   --stats            Emit compaction stats to stderr
#   --help, -h         Show this help

set -e

SCRIPT_DIR=$(CDPATH="" cd "$(dirname "$0")" && pwd)
FILTERS_DIR="$SCRIPT_DIR/../filters"

if [ ! -d "$FILTERS_DIR" ]; then
  if [ -d "./.contexture/filters" ]; then
    FILTERS_DIR="./.contexture/filters"
  elif [ -d "$SCRIPT_DIR/filters" ]; then
    FILTERS_DIR="$SCRIPT_DIR/filters"
  fi
fi

explicit_filter=""
stats=0

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      echo "usage: compact.sh [--filter=NAME] [--stats] [cmd [args...]]"
      exit 0
      ;;
    --stats)
      stats=1
      shift
      ;;
    --filter=*)
      explicit_filter="${1#--filter=}"
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

# Step 1: Ingest input (from command execution or standard input)
cmd_status=0
if [ $# -gt 0 ]; then
  # Command wrapper mode: capture stdout/stderr and exit code
  raw_input=$(
    rc=0
    "$@" 2>&1 || rc=$?
    echo "__COMPACT_EXIT__:$rc"
  )
  cmd_status=$(echo "$raw_input" | sed -n 's/^__COMPACT_EXIT__://p')
  raw_input=$(echo "$raw_input" | sed '/^__COMPACT_EXIT__:/d')
else
  # Stdin pipe mode
  raw_input=$(cat)
fi

# If input is empty, exit cleanly preserving command exit code
if [ -z "$raw_input" ]; then
  exit "$cmd_status"
fi

# Step 2: Discover and select filter
selected_filter=""
default_filter=""

if [ -n "$explicit_filter" ]; then
  candidate="$FILTERS_DIR/${explicit_filter}.awk"
  if [ -f "$candidate" ]; then
    selected_filter="$candidate"
  elif [ -f "$FILTERS_DIR/$explicit_filter" ]; then
    selected_filter="$FILTERS_DIR/$explicit_filter"
  else
    echo "compact.sh: filter not found: $explicit_filter in $FILTERS_DIR" >&2
    printf "%s\n" "$raw_input"
    exit "$cmd_status"
  fi
else
  # Zero-parameter auto-discovery: sample stream head and check signatures
  sample=$(printf "%s\n" "$raw_input" | sed 40q)

  if [ -d "$FILTERS_DIR" ]; then
    for f in "$FILTERS_DIR"/*.awk; do
      [ -f "$f" ] || continue
      pat=$(sed -n 's/^# match: //p' "$f" | head -n 1)
      if [ -n "$pat" ]; then
        if printf "%s\n" "$sample" | awk -v pat="$pat" 'BEGIN{rc=1} $0 ~ pat {rc=0; exit} END{exit rc}'; then
          selected_filter="$f"
          break
        fi
      elif grep -q '^# default' "$f" 2>/dev/null; then
        default_filter="$f"
      fi
    done
  fi

  if [ -z "$selected_filter" ]; then
    selected_filter="$default_filter"
  fi
fi

# If still no filter found, fallback to raw input
if [ -z "$selected_filter" ] || [ ! -f "$selected_filter" ]; then
  printf "%s\n" "$raw_input"
  exit "$cmd_status"
fi

# Step 3: Execute filter and apply fail-safe protection
filtered_output=$(printf "%s\n" "$raw_input" | awk -f "$selected_filter" 2>/dev/null) || true

raw_bytes=$(printf "%s\n" "$raw_input" | wc -c | tr -d ' ')
out_bytes=$(printf "%s\n" "$filtered_output" | wc -c | tr -d ' ')

# Universal fail-safe: pass raw input if filter produced empty output or grew size
if [ -z "$filtered_output" ] || [ "$out_bytes" -gt "$raw_bytes" ]; then
  printf "%s\n" "$raw_input"
  filter_name=$(basename "$selected_filter")
  if [ "$stats" -eq 1 ]; then
    printf "[compact: %s (fail-safe passthrough: %d bytes)]\n" "$filter_name" "$raw_bytes" >&2
  fi
  exit "$cmd_status"
fi

printf "%s\n" "$filtered_output"

if [ "$stats" -eq 1 ]; then
  filter_name=$(basename "$selected_filter")
  pct=0
  if [ "$raw_bytes" -gt 0 ]; then
    pct=$(( (raw_bytes - out_bytes) * 100 / raw_bytes ))
  fi
  printf "[compact: %s, %d -> %d bytes (%d%% reduction)]\n" "$filter_name" "$raw_bytes" "$out_bytes" "$pct" >&2
fi

exit "$cmd_status"
