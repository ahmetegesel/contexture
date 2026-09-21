#!/bin/sh
# compact.sh: discoverable stream compaction filter and runner
# Zero-install: POSIX /bin/sh, awk, and core OS utilities (sed, wc, tail, mktemp)
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
#
# Environment:
#   COMPACT_DISABLE=1  Bypass compaction: run the command or pass stdin through raw
#   COMPACT_DEBUG=1    Report the selection decision on stderr
#
# Filter header directives:
#   # match: <regex>      Stream signature for stdin-mode auto-discovery
#   # command: <regex>    Command identity for runner-mode selection
#   # default             Fallback filter when no signature matches
#   # stream: merged      Merge the command's stderr into the filter input
#   # format-only: <why>  Shrinking without a notice is formatting only
#
# Notices: a truncating filter emits a marker line carrying one of
# collapsed, elided, repeated, capped, or a COMPACT_DISABLE recovery pointer;
# a shrinking filter without a notice falls back to raw

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
debug=0
if [ "${COMPACT_DEBUG:-0}" = "1" ]; then
  debug=1
fi

# Emit the captured command stderr: whole on failure or empty stdout,
# tail-capped with its own notice otherwise
emit_stderr() {
  if [ -z "$stderr_input" ]; then
    return 0
  fi
  if [ "$cmd_status" -ne 0 ] || [ -z "$raw_input" ]; then
    printf "%s\n" "$stderr_input" >&2
    return 0
  fi
  stderr_lines=$(printf "%s\n" "$stderr_input" | wc -l | tr -d ' ')
  if [ "$stderr_lines" -le 10 ]; then
    printf "%s\n" "$stderr_input" >&2
  else
    printf "[compact: stderr capped: showing the last 10 of %s lines; COMPACT_DISABLE=1 for the full stream]\n" "$stderr_lines" >&2
    printf "%s\n" "$stderr_input" | tail -n 10 >&2
  fi
}

# Read the first value of a filter header directive, trimmed of surrounding
# whitespace so an invisible blank never silently disables it
directive_value() {
  sed -n "s/^# $1: //p" "$2" | head -n 1 | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      echo "usage: compact.sh [--filter=NAME] [--stats] [cmd [args...]]"
      echo "env: COMPACT_DISABLE=1 bypasses compaction; COMPACT_DEBUG=1 reports the selection"
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

# Explicit bypass: raw execution, command exit code intact
if [ "${COMPACT_DISABLE:-0}" = "1" ]; then
  if [ "$debug" -eq 1 ]; then
    printf "[compact: debug: bypassed (COMPACT_DISABLE=1)]\n" >&2
  fi
  if [ $# -gt 0 ]; then
    rc=0
    "$@" || rc=$?
    exit "$rc"
  fi
  cat
  exit 0
fi

# Step 1: Ingest input (from command execution or standard input)
cmd_status=0
stderr_input=""
stdout_tmp=""
stderr_tmp=""

cleanup() {
  if [ -n "$stdout_tmp" ]; then
    rm -f "$stdout_tmp"
  fi
  if [ -n "$stderr_tmp" ]; then
    rm -f "$stderr_tmp"
  fi
}

if [ $# -gt 0 ]; then
  # Command wrapper mode: stdout and stderr captured separately, exit code kept
  trap cleanup EXIT
  stdout_tmp=$(mktemp "${TMPDIR:-/tmp}/compact-stdout.XXXXXX")
  stderr_tmp=$(mktemp "${TMPDIR:-/tmp}/compact-stderr.XXXXXX")
  rc=0
  ( "$@" >"$stdout_tmp" 2>"$stderr_tmp" ) || rc=$?
  cmd_status=$rc
  raw_input=$(cat "$stdout_tmp")
  stderr_input=$(cat "$stderr_tmp")
  rm -f "$stdout_tmp" "$stderr_tmp"
  stdout_tmp=""
  stderr_tmp=""
else
  # Stdin pipe mode
  raw_input=$(cat)
fi

# If both streams are empty, exit cleanly preserving command exit code
if [ -z "$raw_input" ] && [ -z "$stderr_input" ]; then
  exit "$cmd_status"
fi

# Step 1b: Strip ANSI escape sequences before selection and filtering;
# raw bytes stay untouched for the fail-safe comparison
esc=$(printf '\033')
clean_input="$raw_input"
case "$raw_input" in
  *"$esc"*)
    clean_input=$(printf "%s\n" "$raw_input" | awk '{gsub(/\033\[[0-9;]*[a-zA-Z]/, ""); print}')
    ;;
esac

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
    if [ -n "$raw_input" ]; then
      printf "%s\n" "$raw_input"
    fi
    emit_stderr
    exit "$cmd_status"
  fi
  if [ "$debug" -eq 1 ]; then
    printf "[compact: debug: selected %s (explicit)]\n" "$(basename "$selected_filter")" >&2
  fi
else
  # Runner mode selects by command identity first: the wrapped command line
  # is the signal, never the output sample
  if [ $# -gt 0 ]; then
    cmd_line=""
    cmd_first=1
    for arg in "$@"; do
      if [ "$cmd_first" -eq 1 ]; then
        arg=$(basename "$arg")
        cmd_first=0
      fi
      cmd_line="$cmd_line $arg"
    done
    cmd_line=${cmd_line# }

    if [ -d "$FILTERS_DIR" ]; then
      for f in "$FILTERS_DIR"/*.awk; do
        [ -f "$f" ] || continue
        pat=$(directive_value command "$f")
        [ -n "$pat" ] || continue
        if printf "%s\n" "$cmd_line" | COMPACT_PAT="$pat" awk '$0 ~ ENVIRON["COMPACT_PAT"] {found=1; exit} END{exit !found}' 2>/dev/null; then
          if [ -z "$selected_filter" ]; then
            selected_filter="$f"
            if [ "$debug" -eq 1 ]; then
              printf "[compact: debug: selected %s (command match: %s)]\n" "$(basename "$f")" "$cmd_line" >&2
            fi
          else
            printf "[compact: shadow warning: %s and %s both claim: %s]\n" "$(basename "$selected_filter")" "$(basename "$f")" "$cmd_line" >&2
          fi
        fi
      done
    fi
  fi

  if [ -z "$selected_filter" ]; then
    # Zero-parameter auto-discovery: sample stream head and check signatures
    sample=$(printf "%s\n" "$clean_input" | sed 40q)

    if [ -d "$FILTERS_DIR" ]; then
      for f in "$FILTERS_DIR"/*.awk; do
        [ -f "$f" ] || continue
        pat=$(directive_value match "$f")
        if [ -n "$pat" ]; then
          if printf "%s\n" "$sample" | COMPACT_PAT="$pat" awk 'BEGIN{rc=1} $0 ~ ENVIRON["COMPACT_PAT"] {rc=0; exit} END{exit rc}' 2>/dev/null; then
            selected_filter="$f"
            if [ "$debug" -eq 1 ]; then
              printf "[compact: debug: selected %s (signature match: %s)]\n" "$(basename "$f")" "$pat" >&2
              match_line=$(printf "%s\n" "$sample" | COMPACT_PAT="$pat" awk '$0 ~ ENVIRON["COMPACT_PAT"] {print; exit}' 2>/dev/null)
              if [ -n "$match_line" ]; then
                printf "[compact: debug: matched line: %s]\n" "$match_line" >&2
              fi
            fi
            break
          fi
        elif grep -q '^# default' "$f" 2>/dev/null; then
          default_filter="$f"
        fi
      done
    fi

    if [ -z "$selected_filter" ]; then
      selected_filter="$default_filter"
      if [ "$debug" -eq 1 ] && [ -n "$selected_filter" ]; then
        printf "[compact: debug: selected %s (default)]\n" "$(basename "$selected_filter")" >&2
      fi
    fi
  fi
fi

# Merge stderr for filters that declare it (compiler-style tools)
stream_mode=""
if [ -n "$selected_filter" ] && [ -f "$selected_filter" ]; then
  stream_mode=$(directive_value stream "$selected_filter")
fi
if [ "$stream_mode" = "merged" ] && [ -n "$stderr_input" ]; then
  if [ -n "$raw_input" ]; then
    raw_input=$(printf "%s\n%s" "$raw_input" "$stderr_input")
  else
    raw_input="$stderr_input"
  fi
  stderr_input=""
  clean_input="$raw_input"
  case "$raw_input" in
    *"$esc"*)
      clean_input=$(printf "%s\n" "$raw_input" | awk '{gsub(/\033\[[0-9;]*[a-zA-Z]/, ""); print}')
      ;;
  esac
fi

# If still no filter found, fallback to raw input
if [ -z "$selected_filter" ] || [ ! -f "$selected_filter" ]; then
  if [ -n "$raw_input" ]; then
    printf "%s\n" "$raw_input"
  fi
  emit_stderr
  exit "$cmd_status"
fi

# Empty stdout with no merged filter: stderr is the whole output
if [ -z "$raw_input" ]; then
  emit_stderr
  exit "$cmd_status"
fi

# Step 3: Execute filter and apply fail-safe and recovery guards
filtered_output=$(printf "%s\n" "$clean_input" | awk -v COMPACT_EXIT="$cmd_status" -f "$selected_filter" 2>/dev/null) || true

raw_bytes=$(printf "%s\n" "$raw_input" | wc -c | tr -d ' ')
clean_bytes=$(printf "%s\n" "$clean_input" | wc -c | tr -d ' ')
out_bytes=$(printf "%s\n" "$filtered_output" | wc -c | tr -d ' ')
filter_name=$(basename "$selected_filter")

# A notice is a marker line: an elision, collapse, or recovery pointer; the
# marker vocabulary keeps bracketed data lines from reading as notices
notice_state=$(printf "%s\n" "$filtered_output" | awk '
  /^[ \t]*\.\.\. \(/ { notice = 1; next }
  /^[ \t]*\[[^]]*(collapsed|elided|repeated|capped|COMPACT_DISABLE)[^]]*\]/ { notice = 1; next }
  /^[ \t]*$/ { next }
  { other = 1 }
  END { printf "%d %d\n", notice + 0, (other ? 0 : 1) }
')
has_notice=${notice_state% *}
notice_only=${notice_state#* }

# A format-only filter declares that its marker-less reductions are layout,
# never lost content
format_only=""
if [ -f "$selected_filter" ]; then
  format_only=$(directive_value format-only "$selected_filter")
fi

# Universal fail-safe: pass raw input if the filter produced empty output
if [ -z "$filtered_output" ]; then
  printf "%s\n" "$raw_input"
  if [ "$stats" -eq 1 ]; then
    printf "[compact: %s (fail-safe passthrough: %d bytes)]\n" "$filter_name" "$raw_bytes" >&2
  fi
  emit_stderr
  exit "$cmd_status"
fi

# Notice-only output: the filter is signaling (a false-green guard, for
# example); pass it through, never revert the signal to raw
if [ "$notice_only" -eq 1 ]; then
  printf "%s\n" "$filtered_output"
  if [ "$stats" -eq 1 ]; then
    printf "[compact: %s (notice-only output passed through)]\n" "$filter_name" >&2
  fi
  emit_stderr
  exit "$cmd_status"
fi

# Byte fail-safe: pass raw input if the filter grew the stream
if [ "$out_bytes" -gt "$raw_bytes" ]; then
  printf "%s\n" "$raw_input"
  if [ "$stats" -eq 1 ]; then
    printf "[compact: %s (fail-safe passthrough: %d bytes)]\n" "$filter_name" "$raw_bytes" >&2
  fi
  emit_stderr
  exit "$cmd_status"
fi

# Recovery: a shrinking filter without a notice either truncated silently or
# only reformatted; format-only filters declare that, everything else goes raw
if [ "$out_bytes" -lt "$clean_bytes" ] && [ "$has_notice" -eq 0 ] && [ -z "$format_only" ]; then
  printf "%s\n" "$raw_input"
  if [ "$stats" -eq 1 ]; then
    printf "[compact: %s (recovery fallback: %d -> %d bytes, no notice)]\n" "$filter_name" "$clean_bytes" "$out_bytes" >&2
  fi
  emit_stderr
  exit "$cmd_status"
fi

printf "%s\n" "$filtered_output"

if [ "$stats" -eq 1 ]; then
  pct=0
  if [ "$raw_bytes" -gt 0 ]; then
    pct=$(( (raw_bytes - out_bytes) * 100 / raw_bytes ))
  fi
  printf "[compact: %s, %d -> %d bytes (%d%% reduction)]\n" "$filter_name" "$raw_bytes" "$out_bytes" "$pct" >&2
fi

emit_stderr
exit "$cmd_status"
