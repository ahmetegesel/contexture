#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:$PATH"
export NODE_OPTIONS="--no-deprecation"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTRACT_DOCS="$SCRIPT_DIR/extract-docs.ts"

# Locate tsx binary
TSX_BIN=""

# 1. Check if --project-root is passed
PROJECT_ROOT=""
for ((i=1; i<=$#; i++)); do
  arg="${!i}"
  if [[ "$arg" == "--project-root" ]]; then
    next_index=$((i + 1))
    PROJECT_ROOT="${!next_index:-}"
  elif [[ "$arg" == --project-root=* ]]; then
    PROJECT_ROOT="${arg#--project-root=}"
  fi
done

if [[ -n "$PROJECT_ROOT" && -x "$PROJECT_ROOT/node_modules/.bin/tsx" ]]; then
  TSX_BIN="$PROJECT_ROOT/node_modules/.bin/tsx"
fi

# 2. Check current working directory
if [[ -z "$TSX_BIN" && -x "$PWD/node_modules/.bin/tsx" ]]; then
  TSX_BIN="$PWD/node_modules/.bin/tsx"
fi

# 3. Check parent directories of positional arguments
if [[ -z "$TSX_BIN" ]]; then
  for arg in "$@"; do
    if [[ ! "$arg" =~ ^-- && -e "$arg" ]]; then
      candidate_dir="$(cd "$(dirname "$arg")" && pwd)"
      while [[ "$candidate_dir" != "/" && -n "$candidate_dir" ]]; do
        if [[ -x "$candidate_dir/node_modules/.bin/tsx" ]]; then
          TSX_BIN="$candidate_dir/node_modules/.bin/tsx"
          break 2
        fi
        candidate_dir="$(dirname "$candidate_dir")"
      done
    fi
  done
fi

# 4. Check system PATH
if [[ -z "$TSX_BIN" ]] && command -v tsx >/dev/null 2>&1; then
  TSX_BIN="$(command -v tsx)"
fi

# 5. Check sibling project directories
if [[ -z "$TSX_BIN" ]]; then
  for candidate in "$SCRIPT_DIR/../../../../../*/node_modules/.bin/tsx"; do
    if [[ -x "$candidate" ]]; then
      TSX_BIN="$candidate"
      break
    fi
  done
fi

# Execute extractor: use tsx if found, otherwise use node with native strip-types
if [[ -n "$TSX_BIN" ]]; then
  exec "$TSX_BIN" "$EXTRACT_DOCS" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node --experimental-strip-types "$EXTRACT_DOCS" "$@"
else
  echo "Error: neither tsx nor node runtime found in PATH." >&2
  exit 1
fi
