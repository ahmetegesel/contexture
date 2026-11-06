# docs-io.sh: the docs module's one door to the corpus (sourced by the read verbs query,
# audit, check, gate, and nudge; never run, so it carries no summary line and discovery
# ignores it). It is the only file of the module that calls a store function or composes a
# doc's path: the verbs and their engines receive the paths it hands them.
#
# The corpus is served by the configured storage driver through the generic module store
# (the capability store, asked through the storage core library). A verb reads it through
# the library's store_list and store_get: the docs module materializes the returned bytes into its own scratch at
# docs/<repo>/<slug>.md and the engines parse those files. No driver parses a doc. Every
# driver call runs with the workspace root as its cwd and CTX_ROOT, an inherited CTX_DIR
# unset, and stdin from /dev/null (the check's delta on stdin stays the verb's).
#
# The display rule: every doc path a verb prints is the logical address
# docs/<repo>/<slug>.md, whatever the caller's spelling and whatever the driver. Scratch
# lives in one folder inside the per-verb root the engine exports (CTX_SCRATCH_ROOT), under
# the workspace's .contexture/tmp when the verb runs undispatched (the system temp only when
# the drawer cannot be written), and is removed on exit.

DOCS_VERB=""
DOCS_ROOT=""
DOCS_ROOT_P=""
DOCS_RESOLVER=""
DOCS_LIB=""
DOCS_JSON=""
DOCS_SCRATCH=""
DOCS_MOUNT=""
DOCS_KEYS=""
DOCS_ALL=""
DOCS_CD=0
DOCS_PATHS=""
DOCS_ERR=""
DOCS_SINCE_REV=""

# docs_io_init <scripts dir> <verb>: the workspace root as the verbs resolve it
# (DOCS_WORKSPACE_ROOT, then CTX_ROOT, then the walk up to the .contexture drawer's
# parent) and the storage core's resolver, library, and JSON decoder, all absolute from
# CTX_ROOT (the core drawer, then the base mirror), never a relative climb from the
# module folder
docs_io_init() {
  DOCS_VERB="ctx docs $2"
  DOCS_DIR=$1
  di_root=""
  di_p=$1
  while [ "$di_p" != "/" ] && [ "${di_p##*/}" != ".contexture" ]; do di_p=${di_p%/*}; done
  [ "${di_p##*/}" = ".contexture" ] && di_root=${di_p%/*}
  [ -n "$di_root" ] || di_root=$(CDPATH= cd -- "$1/../../.." && pwd)
  DOCS_ROOT="${DOCS_WORKSPACE_ROOT:-${CTX_ROOT:-$di_root}}"
  DOCS_ROOT_P=$(CDPATH= cd -- "$DOCS_ROOT" 2>/dev/null && pwd) || DOCS_ROOT_P=""
  # the storage core and the unit lib resolve from CTX_ROOT, never a relative walk:
  # the docs module may sit under the extension root, one level deeper than the
  # workspace modules root, so a relative climb would leave the core's tree. The core
  # resolver and the base mirror are tried in that order; the JSON decoder is the unit
  # module's (the resolver's sibling lib is not the decoder's home).
  di_ctx="${CTX_ROOT:-$DOCS_ROOT}"
  DOCS_RESOLVER=""
  for di_c in "$di_ctx/.contexture/storage/scripts/driver-resolver" \
              "$di_ctx/base/.contexture/storage/scripts/driver-resolver"; do
    if [ -x "$di_c" ]; then DOCS_RESOLVER=$di_c; break; fi
  done
  DOCS_LIB=""
  for di_c in "$di_ctx/.contexture/storage/scripts/library" \
              "$di_ctx/base/.contexture/storage/scripts/library"; do
    if [ -f "$di_c" ]; then DOCS_LIB=$di_c; break; fi
  done
  DOCS_JSON=""
  for di_c in "$di_ctx/.contexture/modules/unit/lib/json.awk" \
              "$di_ctx/base/.contexture/modules/unit/lib/json.awk"; do
    if [ -f "$di_c" ]; then DOCS_JSON=$di_c; break; fi
  done
  if [ -n "$DOCS_LIB" ]; then
    CTX_STORE_ROOT="$DOCS_ROOT"
    CTX_STORE_RESOLVER="$DOCS_RESOLVER"
    export CTX_STORE_ROOT CTX_STORE_RESOLVER
    . "$DOCS_LIB"
  fi
  return 0
}

# docs_require: the configured driver serves the module store (store), else rc 2 with the
# resolver's message and the verb's own line
docs_require() {
  if [ -z "$DOCS_LIB" ] || [ -z "$DOCS_RESOLVER" ]; then
    printf '%s: the storage core library is not installed (need: the storage core) (ERR_DRIVER_NOT_FOUND)\n' "$DOCS_VERB" >&2
    return 2
  fi
  if [ -z "$DOCS_ROOT_P" ]; then
    printf '%s: the workspace root is not a folder (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" >&2
    return 2
  fi
  if store_require store < /dev/null; then
    return 0
  fi
  printf '%s: the configured storage driver serves no module store (store)\n' "$DOCS_VERB" >&2
  return 2
}

docs_io_cleanup() {
  if [ -n "$DOCS_SCRATCH" ]; then
    rm -rf "$DOCS_SCRATCH"
    DOCS_SCRATCH=""
  fi
  return 0
}

# docs_scratch: the verb's scratch folder, made once, removed on exit: one folder of its own
# inside the per-verb root the engine exports at dispatch (CTX_SCRATCH_ROOT), so a SIGKILL
# that skips the removal leaves it to the next dispatch's sweep; the drawer's scratch when
# no root is exported (an undispatched run), the system temp only when the drawer cannot be
# written
docs_scratch() {
  [ -n "$DOCS_SCRATCH" ] && return 0
  ds_base="${TMPDIR:-/tmp}"
  if [ -n "${CTX_SCRATCH_ROOT:-}" ] && mkdir -p "$CTX_SCRATCH_ROOT" 2>/dev/null && [ -d "$CTX_SCRATCH_ROOT" ] && [ -w "$CTX_SCRATCH_ROOT" ]; then
    ds_base=$CTX_SCRATCH_ROOT
  elif [ -d "$DOCS_ROOT/.contexture" ] && mkdir -p "$DOCS_ROOT/.contexture/tmp" 2>/dev/null && [ -w "$DOCS_ROOT/.contexture/tmp" ]; then
    ds_base="$DOCS_ROOT/.contexture/tmp"
  fi
  if ! DOCS_SCRATCH=$(mktemp -d "$ds_base/docs-io.XXXXXX" 2>/dev/null); then
    DOCS_SCRATCH=""
    printf '%s: cannot make its scratch folder (ERR_STORAGE_WRITE)\n' "$DOCS_VERB" >&2
    return 2
  fi
  trap 'docs_io_cleanup' EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  return 0
}

# docs_keys [<repo>]: DOCS_KEYS holds one <repo>/<slug> per line in the store's bytewise
# order (the module pattern filters the list); rc 1 for a repo the corpus lacks (quiet: the
# verb names it), rc 2 when the store fails (its message kept)
docs_keys() {
  docs_scratch || return 2
  if ! store_list docs < /dev/null > "$DOCS_SCRATCH/list.json" 2> "$DOCS_SCRATCH/list.err"; then
    dk_rc=$?
    DOCS_KEYS=""
    cat "$DOCS_SCRATCH/list.err" >&2
    return "$dk_rc"
  fi
  if [ -z "$DOCS_JSON" ]; then
    printf '%s: the storage answer decoder is missing (need: the unit module lib/json.awk) (ERR_DRIVER_NOT_FOUND)\n' "$DOCS_VERB" >&2
    DOCS_KEYS=""
    return 2
  fi
  if ! awk -f "$DOCS_JSON" < "$DOCS_SCRATCH/list.json" > "$DOCS_SCRATCH/list.flat" 2> "$DOCS_SCRATCH/json.err"; then
    cat "$DOCS_SCRATCH/json.err" >&2
    DOCS_KEYS=""
    return 2
  fi
  DOCS_ALL=$(awk -F= '$1 ~ /^keys\.[0-9]+$/ { print substr($0, index($0, "=") + 1) }' "$DOCS_SCRATCH/list.flat")
  if [ -n "${1:-}" ]; then
    DOCS_KEYS=$(printf '%s\n' "$DOCS_ALL" | DOCS_SEL="$1/" awk 'NF && index($0, ENVIRON["DOCS_SEL"]) == 1')
    [ -n "$DOCS_KEYS" ] && return 0
    return 1
  fi
  DOCS_KEYS=$DOCS_ALL
  return 0
}

# docs_select <repo>: DOCS_KEYS narrowed from the whole list (DOCS_ALL, one store call per
# verb) to that repo's docs, the order kept; rc 1 when the corpus holds none
docs_select() {
  DOCS_KEYS=$(printf '%s\n' "$DOCS_ALL" | DOCS_SEL="$1/" awk 'NF && index($0, ENVIRON["DOCS_SEL"]) == 1')
  [ -n "$DOCS_KEYS" ] && return 0
  return 1
}

docs_key_valid() {
  case "$1" in
    ""|[!A-Za-z0-9]*|*[!A-Za-z0-9._-]*) return 1 ;;
  esac
  return 0
}

# docs_materialize: every key of DOCS_KEYS read through store.get into the module's scratch
# at DOCS_MOUNT/docs/<repo>/<slug>.md; the engines parse those bytes, never a driver
docs_materialize() {
  docs_scratch || return 2
  DOCS_MOUNT="$DOCS_SCRATCH/corpus"
  rm -rf "$DOCS_MOUNT"
  mkdir -p "$DOCS_MOUNT/docs" || {
    printf '%s: cannot make its corpus scratch (ERR_STORAGE_WRITE)\n' "$DOCS_VERB" >&2
    return 2
  }
  printf '%s\n' "$DOCS_KEYS" > "$DOCS_SCRATCH/materialize.keys"
  while IFS= read -r dm_k; do
    [ -n "$dm_k" ] || continue
    mkdir -p "$DOCS_MOUNT/docs/${dm_k%/*}" || {
      printf '%s: cannot stage the corpus (ERR_STORAGE_WRITE)\n' "$DOCS_VERB" >&2
      return 2
    }
    if ! store_get docs "$dm_k" < /dev/null > "$DOCS_MOUNT/docs/$dm_k.md" 2> "$DOCS_SCRATCH/get.err"; then
      dm_rc=$?
      cat "$DOCS_SCRATCH/get.err" >&2
      return "$dm_rc"
    fi
  done < "$DOCS_SCRATCH/materialize.keys"
  return 0
}

# docs_corpus [<repo>]: the whole corpus (or one repo's docs) for a verb that reads it as
# data (query, gate): require, list, get into scratch; DOCS_PATHS lists the relative
# logical addresses docs/<key>.md under DOCS_MOUNT. rc 1 leaves DOCS_ERR=repo (an absent
# repo) or DOCS_ERR=empty (an empty corpus) for the verb to word
docs_corpus() {
  DOCS_ERR=""
  docs_require || return 2
  docs_scratch || return 2
  if docs_keys ${1:+"$1"}; then
    :
  else
    dc_rc=$?
    [ "$dc_rc" -eq 1 ] && DOCS_ERR=repo
    return "$dc_rc"
  fi
  if [ -z "$DOCS_KEYS" ]; then
    DOCS_ERR=empty
    return 1
  fi
  docs_materialize || return $?
  DOCS_PATHS="$DOCS_SCRATCH/paths"
  : > "$DOCS_PATHS"
  printf '%s\n' "$DOCS_KEYS" | while IFS= read -r dc_k; do
    [ -n "$dc_k" ] && printf 'docs/%s.md\n' "$dc_k"
  done > "$DOCS_PATHS"
  DOCS_CD=1
  return 0
}

docs_not_a_doc() {
  printf '%s: not a corpus doc: %s (name a repo, docs/<repo>/<slug>.md, or docs/*/*.md)\n' "$DOCS_VERB" "$1" >&2
  return 1
}

# docs_args <bare 0|1> <cwd 0|1> [<corpus argument>...]: the corpus a verb was handed,
# resolved to engine paths in DOCS_PATHS (one per line). Forms: a repo name (its docs);
# docs/<repo>/<slug>.md with any prefix (the doc at that address); the patterns
# docs/*/*.md and docs/<repo>/*.md with any prefix, filtered by the store's list when the
# shell left them literal; no argument: the whole corpus when <bare> is 1, none otherwise.
# The corpus is materialized once into the module's scratch; relative logical addresses are
# handed to an engine that runs inside it (DOCS_CD=1), absolute scratch paths when the verb
# keeps its cwd (<cwd> 1, the nudge). Every view prints the logical address. rc 1 names a
# doc, a repo, or an argument the corpus does not hold; rc 2 a store failure.
docs_args() {
  da_bare=$1
  da_cwd=$2
  shift 2
  docs_require || return 2
  docs_scratch || return 2
  docs_keys || return $?
  DOCS_ALL=$DOCS_KEYS
  DOCS_PATHS="$DOCS_SCRATCH/paths"
  : > "$DOCS_PATHS"
  : > "$DOCS_SCRATCH/selected"
  DOCS_CD=1
  [ "$da_cwd" -eq 1 ] && DOCS_CD=0
  if [ $# -eq 0 ]; then
    [ "$da_bare" -eq 1 ] || return 0
    printf '%s\n' "$DOCS_ALL" > "$DOCS_SCRATCH/selected"
  fi
  for da_a in "$@"; do
    case "$da_a" in
      */*|*.md)
        da_s=${da_a##*/}
        case "$da_a" in */*) da_rest=${da_a%/*} ;; *) da_rest="" ;; esac
        da_r=${da_rest##*/}
        case "$da_rest" in */*) da_up=${da_rest%/*} ;; *) da_up="" ;; esac
        da_d=${da_up##*/}
        [ "$da_d" = "docs" ] && [ -n "$da_r" ] || { docs_not_a_doc "$da_a"; return 1; }
        if [ "$da_r" = "*" ] && [ "$da_s" = "*.md" ]; then
          printf '%s\n' "$DOCS_ALL" >> "$DOCS_SCRATCH/selected"
        elif [ "$da_s" = "*.md" ] && docs_key_valid "$da_r"; then
          if docs_select "$da_r"; then
            :
          else
            da_rc=$?
            [ "$da_rc" -eq 1 ] && printf '%s: no such repo: %s\n' "$DOCS_VERB" "$da_r" >&2
            return "$da_rc"
          fi
          printf '%s\n' "$DOCS_KEYS" >> "$DOCS_SCRATCH/selected"
        else
          da_slug=${da_s%.md}
          if [ "$da_slug" = "$da_s" ] || ! docs_key_valid "$da_r" || ! docs_key_valid "$da_slug"; then
            docs_not_a_doc "$da_a"
            return 1
          fi
          if ! printf '%s\n' "$DOCS_ALL" | grep -qxF -- "$da_r/$da_slug"; then
            printf '%s: no such doc: %s/%s\n' "$DOCS_VERB" "$da_r" "$da_slug" >&2
            return 1
          fi
          printf '%s\n' "$da_r/$da_slug" >> "$DOCS_SCRATCH/selected"
        fi
        ;;
      *)
        docs_key_valid "$da_a" || { docs_not_a_doc "$da_a"; return 1; }
        if docs_select "$da_a"; then
          :
        else
          da_rc=$?
          [ "$da_rc" -eq 1 ] && printf '%s: no such repo: %s\n' "$DOCS_VERB" "$da_a" >&2
          return "$da_rc"
        fi
        printf '%s\n' "$DOCS_KEYS" >> "$DOCS_SCRATCH/selected"
        ;;
    esac
  done
  DOCS_KEYS=$(awk 'NF' "$DOCS_SCRATCH/selected")
  if [ -z "$DOCS_KEYS" ]; then
    printf '%s: the corpus is empty\n' "$DOCS_VERB" >&2
    return 1
  fi
  docs_materialize || return $?
  docs_args_emit
  return 0
}

# docs_args_emit: DOCS_KEYS appended to DOCS_PATHS, relative logical addresses inside the
# materialized scratch (DOCS_CD=1) or absolute scratch paths for a verb that keeps its cwd
docs_args_emit() {
  printf '%s\n' "$DOCS_KEYS" | while IFS= read -r de_k; do
    [ -n "$de_k" ] || continue
    if [ "$DOCS_CD" -eq 1 ]; then
      printf 'docs/%s.md\n' "$de_k" >> "$DOCS_PATHS"
    else
      printf '%s/docs/%s.md\n' "$DOCS_MOUNT" "$de_k" >> "$DOCS_PATHS"
    fi
  done
  return 0
}

# docs_file_form <argument>: rc 0 when the argument is spelled as a file (a slash or a .md
# suffix), 1 when it is a bare word (a unit or a repo)
docs_file_form() {
  case "$1" in
    */*|*.md) return 0 ;;
  esac
  return 1
}

# docs_no_display: the verb prints no doc path (the nudge), so no display work is due
docs_no_display() {
  return 0
}

# docs_record_file <path>: rc 0 when the path lies inside the record's sessions drawer (by
# its spelling, or physically under the workspace's drawer): a record artifact is read
# through ctx unit, never as a file (the single store)
docs_record_file() {
  case "$1" in
    .contexture/sessions/*|*/.contexture/sessions/*) return 0 ;;
  esac
  [ -d "$DOCS_ROOT/.contexture/sessions" ] || return 1
  rf_s=$(CDPATH= cd -- "$DOCS_ROOT/.contexture/sessions" 2>/dev/null && pwd -P) || return 1
  case "$1" in */*) rf_d=${1%/*} ;; *) rf_d=. ;; esac
  rf_p=$(CDPATH= cd -- "${rf_d:-/}" 2>/dev/null && pwd -P) || return 1
  case "$rf_p/" in "$rf_s"/*) return 0 ;; esac
  return 1
}

# docs_active_task <unit>: the unit's first IN_PROGRESS task (backlog order) through ctx
# unit task list, its block verbatim through ctx unit resolve task# (task show's text
# view drops REFS) into scratch: DOCS_TASK names the file, empty when no task is active;
# the unit verbs' rc and messages pass through
docs_active_task() {
  DOCS_TASK=""
  at_ctx=""
  if [ -x "$DOCS_ROOT/.contexture/ctx" ]; then
    at_ctx="$DOCS_ROOT/.contexture/ctx"
  elif [ -n "${CTX_BIN:-}" ] && [ -x "$CTX_BIN" ]; then
    at_ctx=$CTX_BIN
  fi
  if [ -z "$at_ctx" ]; then
    printf '%s: no ctx runtime at the workspace root (need: .contexture/ctx) (ERR_DRIVER_NOT_FOUND)\n' "$DOCS_VERB" >&2
    return 2
  fi
  docs_scratch || return 2
  if at_list=$( (unset CTX_DIR; cd "$DOCS_ROOT" && exec "$at_ctx" unit task list "$1" --status=progress < /dev/null) ); then
    :
  else
    return $?
  fi
  at_slug=$(printf '%s\n' "$at_list" | awk '$1 == "[IN_PROGRESS]" { s = $2; sub(/:$/, "", s); print s; exit }')
  [ -n "$at_slug" ] || return 0
  if (unset CTX_DIR; cd "$DOCS_ROOT" && exec "$at_ctx" unit resolve "$1" "task#$at_slug" < /dev/null) > "$DOCS_SCRATCH/task"; then
    DOCS_TASK="$DOCS_SCRATCH/task"
    return 0
  else
    return $?
  fi
}

# docs_delta_source: DOCS_DELTA is log when the configured driver keeps a store change log
# (store.changelog: the corpus half of a delta comes from the store), git otherwise (the
# files driver: the git delta carries the corpus only where the workspace tracks it); the
# check engine takes it as its bounded delta_source token
docs_delta_source() {
  DOCS_DELTA=git
  if [ -n "$DOCS_LIB" ] && store_has store.changelog < /dev/null; then
    DOCS_DELTA=log
  fi
  return 0
}

# docs_head: the workspace's git HEAD (a full commit id), or none outside a repository
docs_head() {
  dh_h=$(git -C "$DOCS_ROOT" rev-parse --verify -q HEAD 2>/dev/null) || dh_h=""
  [ -n "$dh_h" ] || dh_h=none
  printf '%s\n' "$dh_h"
}

# docs_since_rev <rev>: DOCS_SINCE_REV, the commit <rev> names in the workspace root's
# repository (the base of a --since window); rc 1 naming the need outside a repository with
# a commit, or naming an unknown revision
docs_since_rev() {
  DOCS_SINCE_REV=""
  if [ "$(docs_head)" = none ]; then
    printf '%s: --since needs the workspace to be a git repository with a commit\n' "$DOCS_VERB" >&2
    return 1
  fi
  if ! DOCS_SINCE_REV=$(git -C "$DOCS_ROOT" rev-parse --verify -q "$1^{commit}" 2>/dev/null); then
    DOCS_SINCE_REV=""
    printf '%s: unknown revision: %s\n' "$DOCS_VERB" "$1" >&2
    return 1
  fi
  return 0
}

# docs_delta_stage: the status-prefixed delta on stdin copied into the verb's scratch, so the
# verb can tell an empty delta (docs_delta_empty) and the check engine reads it by name
# (DOCS_DELTA_ARG, its change_file relative to the corpus scratch it runs in), never from
# its stdin; the file carries the delta, so the stage may close a pipeline; rc 2 when the
# scratch cannot hold it
DOCS_DELTA_ARG="change_file=../delta"
docs_delta_stage() {
  docs_scratch || return 2
  cat > "$DOCS_SCRATCH/delta" || return 2
  return 0
}

# docs_delta_empty: rc 0 when the staged delta carries no path, 1 when it carries one
docs_delta_empty() {
  awk 'NF { n = 1; exit } END { exit n }' "$DOCS_SCRATCH/delta"
}

# docs_delta_decode [<prefix>]: a status-prefixed delta on stdin, every path git quoted (a
# "..." field: a non-ASCII byte as an octal escape under core.quotePath, a quote or a
# backslash escaped) decoded to its bytes, so the check reads it as its plain twin; a plain
# line passes byte for byte. A field whose escapes name a control character (a tab, a
# newline, a byte below 040 or 0177) cannot ride a status line: it is left out and its
# spelling, after <prefix>, lands in the scratch list docs_delta_unread names; a rename with
# one such side keeps its other side (A for the new path, D for the old), a copy its new one
docs_delta_decode() {
  DOCS_DECODE_PFX="${1:-}" DOCS_UNREAD="$DOCS_SCRATCH/unread" LC_ALL=C awk '
    BEGIN {
      BS = sprintf("%c", 92); DQ = sprintf("%c", 34)
      PFX = ENVIRON["DOCS_DECODE_PFX"]; UNREAD = ENVIRON["DOCS_UNREAD"]
      for (i = 0; i < 8; i++) OCT[i ""] = i
    }
    function unq(f,    n, i, c, v, k, o) {
      n = length(f)
      if (n < 2 || substr(f, 1, 1) != DQ || substr(f, n, 1) != DQ) return f
      o = ""
      i = 2
      while (i < n) {
        c = substr(f, i++, 1)
        if (c != BS) { o = o c; continue }
        c = substr(f, i, 1)
        if (c == DQ || c == BS) { o = o c; i++; continue }
        v = 0
        for (k = 0; k < 3 && i < n; k++) {
          c = substr(f, i, 1)
          if (!(c in OCT)) break
          v = v * 8 + OCT[c]
          i++
        }
        if (k == 0 || v < 32 || v == 127 || v > 255) { BAD = 1; return f }
        o = o sprintf("%c", v)
      }
      return o
    }
    function unread(f) { print PFX f >> UNREAD }
    {
      st = ""
      rest = $0
      if (match(rest, /^[MADRCU?!][0-9]*[ \t]+/)) { st = substr(rest, 1, RLENGTH); rest = substr(rest, RLENGTH + 1) }
      c = substr(st, 1, 1)
      t = index(rest, "\t")
      if ((c == "R" || c == "C") && t > 0) {
        a = substr(rest, 1, t - 1); b = substr(rest, t + 1)
        BAD = 0; da = unq(a); ba = BAD
        BAD = 0; db = unq(b); bb = BAD
        if (ba) unread(a)
        if (bb) unread(b)
        if (ba && !bb) print "A\t" db
        else if (bb && !ba && c == "R") print "D\t" da
        else if (!ba && !bb) print st da "\t" db
        next
      }
      BAD = 0; d = unq(rest)
      if (BAD) { unread(rest); next }
      print st d
    }'
}

# docs_delta_unread <label>: the notice on stderr naming the delta paths docs_delta_decode
# left out, one line after <label>; nothing when it left none out
docs_delta_unread() {
  [ -s "$DOCS_SCRATCH/unread" ] || return 0
  DOCS_NOTICE_LABEL=$1 awk '
    { s = s (NR > 1 ? ", " : "") $0 }
    END { printf "%s %d delta path(s) hold a control character (a tab, a newline) that a status line cannot carry; the check does not read them: %s\n", ENVIRON["DOCS_NOTICE_LABEL"], NR, s }' "$DOCS_SCRATCH/unread" >&2
}

# docs_untracked_half: the workspace root's untracked files (git ls-files --others on stdin)
# as A lines, the corpus docs (docs/<repo>/<slug>.md) left out: an untracked doc cannot ride a
# tracked delta, whether git ignores it or not, so the check reads its claimants untracked
docs_untracked_half() {
  awk '$0 != "" && $0 !~ /^docs\/[^\/]+\/[^\/]+\.md$/ { print "A\t" $0 }'
}

# docs_delta_shebangs: the governed set's first-line read, on this side so no engine line
# opens a code path. Every extensionless path of the staged delta (a non-empty basename with
# no dot after its first character; both sides of a rename) that is a readable regular file
# under the workspace root, never a symbolic link (git keeps a link as its target path, and
# its target may lie outside the root), its path free of a .. segment, lands in the scratch
# list as shebang<TAB><path> when its first line starts with #!, plain<TAB><path> otherwise;
# the check engine reads the list by name from DOCS_SHEBANG_LIST, and a path left out
# (deleted, absent, a folder, a link) counts only when a header source lists it exactly.
# Under --drift the first line is the working tree's copy.
docs_delta_shebangs() {
  DOCS_SHEBANG_LIST="$DOCS_SCRATCH/shebangs"
  export DOCS_SHEBANG_LIST
  awk '
    { gsub(/^[[:space:]]+|[[:space:]]+$/, "") }
    $0 == "" { next }
    /^[MADRCU?!][0-9]*[[:space:]]+/ {
      rn = (substr($0, 1, 1) == "R")
      sub(/^[MADRCU?!][0-9]*[[:space:]]+/, "")
      if (rn) { split($0, rp, /[[:space:]]+/); path(rp[1]); path(rp[2]); next }
    }
    { path($0) }
    function path(p,    b) {
      b = p
      sub(/.*\//, "", b)
      if (b != "" && substr(b, 2) !~ /[.]/) print p
    }' "$DOCS_SCRATCH/delta" | while IFS= read -r ds_p; do
    case "/$ds_p/" in */../*) continue ;; esac
    [ -f "$DOCS_ROOT/$ds_p" ] && [ ! -h "$DOCS_ROOT/$ds_p" ] && [ -r "$DOCS_ROOT/$ds_p" ] || continue
    ds_l=""
    IFS= read -r ds_l < "$DOCS_ROOT/$ds_p" || :
    case "$ds_l" in
      '#!'*) printf 'shebang\t%s\n' "$ds_p" ;;
      *) printf 'plain\t%s\n' "$ds_p" ;;
    esac
  done > "$DOCS_SHEBANG_LIST"
}

# docs_corpus_untracked: under the files driver, where a doc's logical address is its file
# under the workspace root, DOCS_UNTRACKED counts the materialized corpus docs the root's
# repository does not track (ignored or not; every doc outside a repository) and DOCS_NDOCS
# counts them all
docs_corpus_untracked() {
  git -C "$DOCS_ROOT" ls-files -- docs > "$DOCS_SCRATCH/tracked" 2>/dev/null || : > "$DOCS_SCRATCH/tracked"
  DOCS_UNTRACKED=$(DOCS_TRACKED="$DOCS_SCRATCH/tracked" awk '
    BEGIN { f = ENVIRON["DOCS_TRACKED"]; while ((getline l < f) > 0) t[l] = 1; close(f) }
    !($0 in t) { n++ }
    END { print n + 0 }' "$DOCS_PATHS")
  DOCS_NDOCS=$(awk 'END { print NR }' "$DOCS_PATHS")
  return 0
}

# docs_store_changes_rows: the store.changes answer flattened into its six status fields,
# <seq> TAB <at> TAB <op> TAB <key> TAB <head> TAB <prior>, oldest first
docs_store_changes_rows() {
  if [ -z "$DOCS_JSON" ]; then
    printf '%s: the storage answer decoder is missing (need: the unit module lib/json.awk) (ERR_DRIVER_NOT_FOUND)\n' "$DOCS_VERB" >&2
    return 2
  fi
  if ! awk -f "$DOCS_JSON" < "$1" > "$2.flat" 2> "$2.err"; then
    cat "$2.err" >&2
    return 2
  fi
  awk '
    {
      p = $0
      if ((eq = index(p, "=")) > 0) { v = substr(p, eq + 1); p = substr(p, 1, eq - 1) }
      else if ((cl = index(p, ":")) > 0) { v = substr(p, cl + 1); p = substr(p, 1, cl - 1) }
      else next
      if (p !~ /^changes\.[0-9]+\./) next
      rest = substr(p, 9)
      dot = index(rest, ".")
      if (dot < 2) next
      n = substr(rest, 1, dot - 1) + 0
      f = substr(rest, dot + 1)
      row[n, f] = v
      if (n > max) max = n
    }
    END {
      for (i = 1; i <= max; i++)
        printf "%s\t%s\t%s\t%s\t%s\t%s\n", row[i, "seq"], row[i, "at"], row[i, "op"], row[i, "key"], row[i, "head"], row[i, "prior"]
    }' "$2.flat" > "$2"
  return 0
}

# docs_changes [--since=<rev>]: the corpus half of a delta from the store's change log, one
# status-prefixed line per doc, <status> TAB docs/<repo>/<slug>.md, bytewise by path. The
# window is the rows stamped with the current HEAD; --since=<rev> widens it to the heads git
# rev-list --boundary <rev>..HEAD names (the boundary's leading dash stripped), <rev> itself,
# and HEAD. Net status per doc, as git would report the same history: A when the doc was
# absent before its first row in the window and exists now, M when it was present and
# exists now, D when it was present and is gone now, no line when it was absent and is gone.
# rc 1 on a driver without store.changelog (under the files driver git carries the corpus
# delta where the workspace tracks the corpus, and nothing carries an untracked one), an
# unknown revision, or --since outside a repository; rc 2 a driver failure
docs_changes() {
  dx_since=""
  for dx_a in "$@"; do
    case "$dx_a" in
      --since=?*) dx_since=${dx_a#--since=} ;;
      *) printf '%s: unknown argument: %s (usage: ctx docs changes [--since=<rev>])\n' "$DOCS_VERB" "$dx_a" >&2; return 1 ;;
    esac
  done
  docs_require || return 2
  if ! store_has store.changelog < /dev/null; then
    printf '%s: the configured storage driver keeps no store change log (store.changelog); under the files driver the corpus delta comes from git where the workspace tracks the corpus, and an untracked corpus reconciles through the docs-drift flow\n' "$DOCS_VERB" >&2
    return 1
  fi
  docs_scratch || return 2
  printf 'head=%s\n' "$(docs_head)" > "$DOCS_SCRATCH/heads"
  if [ -n "$dx_since" ]; then
    docs_since_rev "$dx_since" || return 1
    printf 'head=%s\n' "$DOCS_SINCE_REV" >> "$DOCS_SCRATCH/heads"
    git -C "$DOCS_ROOT" rev-list --boundary "$DOCS_SINCE_REV..HEAD" 2>/dev/null | sed -e 's/^-//' -e 's/^/head=/' >> "$DOCS_SCRATCH/heads"
  fi
  if ! store_changes docs < "$DOCS_SCRATCH/heads" > "$DOCS_SCRATCH/rows.json"; then
    return 2
  fi
  docs_store_changes_rows "$DOCS_SCRATCH/rows.json" "$DOCS_SCRATCH/rows" || return $?
  docs_keys || return $?
  printf '%s\n' "$DOCS_KEYS" > "$DOCS_SCRATCH/now"
  DOCS_NOW_FILE="$DOCS_SCRATCH/now" awk -F '\t' '
    BEGIN {
      f = ENVIRON["DOCS_NOW_FILE"]
      while ((getline k < f) > 0) if (k != "") now[k] = 1
      close(f)
    }
    NF == 6 && !($4 in first) { first[$4] = $6; order[++n] = $4 }
    END {
      for (i = 1; i <= n; i++) {
        k = order[i]
        if (first[k] == "absent" && (k in now)) print "A\tdocs/" k ".md"
        else if (first[k] == "present" && (k in now)) print "M\tdocs/" k ".md"
        else if (first[k] == "present") print "D\tdocs/" k ".md"
      }
    }' "$DOCS_SCRATCH/rows" | sort -t "$(printf '\t')" -k2,2
}

# docs_changes_prepare [--since=<rev>] / docs_changes_emit: the corpus half computed into the
# scratch before a pipeline (its refusal stops the verb), then printed inside it
docs_changes_prepare() {
  docs_scratch || return 2
  docs_changes "$@" > "$DOCS_SCRATCH/changes"
}
docs_changes_emit() {
  cat "$DOCS_SCRATCH/changes"
}

# docs_code_half: a git delta on stdin without the workspace root's corpus paths
# (docs/<repo>/<slug>.md): under a store those files, if any linger, are not the corpus; a
# rename with one corpus side keeps its other side (A for the new path, D for the old)
docs_code_half() {
  awk -F '\t' '
    function corpus(p) { return p ~ /^docs\/[^\/]+\/[^\/]+\.md$/ }
    $1 ~ /^R/ && NF >= 3 {
      if (corpus($2) && corpus($3)) next
      if (corpus($3)) { print "D\t" $2; next }
      if (corpus($2)) { print "A\t" $3; next }
      print; next
    }
    NF >= 2 && corpus($2) { next }
    { print }'
}

# docs_git_env: an engine that runs inside the scratch still probes the workspace's git
# repository (the check's trackedness test) by its root, never by a scratch path
docs_git_env() {
  DOCS_GIT_ROOT="$DOCS_ROOT"
  export DOCS_GIT_ROOT
  return 0
}

# docs_engine_run <command>...: the engine in the materialized corpus scratch, so every
# path it prints is the relative logical address docs/<repo>/<slug>.md
docs_engine_run() {
  ( docs_git_env; cd "$DOCS_MOUNT" || exit 2; "$@" )
}

# docs_exec <command>...: the command over DOCS_PATHS (appended) as the verb's last act;
# inside the materialized scratch for relative logical addresses, or from the verb's cwd
# for a caller that keeps it (the nudge). The scratch goes on exit.
docs_exec() {
  while IFS= read -r de_p; do
    set -- "$@" "$de_p"
  done < "$DOCS_PATHS"
  if [ "$DOCS_CD" -eq 1 ]; then
    ( docs_git_env; cd "$DOCS_MOUNT" || exit 2; "$@" )
    exit $?
  fi
  "$@"
  exit $?
}

# ---------------------------------------------------------------------------------------
# The write side (ctx docs new, write, header, rule, pitfall, entry, section, replace,
# remove, ids, and query --entry). Every write runs one pipeline: the arguments parsed and
# refused early (an unknown flag); the doc read through store.get; one structural edit by
# docs-edit.awk against the grammar's #% schema (the module's grammar asset), which
# refuses what the schema refuses (an unknown field, an enum value outside its set, a
# missing required field, a duplicate key or id, a missing address, a newline in a one-line
# field, a carriage return); the result audited by docs-audit.awk over its whole repo (the
# stored docs with the edited ones in place, run from a scratch copy so errors name
# docs/<repo>/<slug>.md); then store.put with --op=<verb> and --head=<the workspace git
# HEAD>. A refusal at any step writes nothing. --dry-run stops before the store and prints
# the changed lines.

DOCS_NA=0
DOCS_NP=0
DOCS_AFTER=""
DOCS_FIRST=0
DOCS_REMOVE=0
DOCS_ID=""
DOCS_DRY=0
DOCS_REPLACE=0
DOCS_KIND=""
DOCS_OLD=""
DOCS_HAS_OLD=0
DOCS_NEW=""
DOCS_HAS_NEW=0
DOCS_COUNT=""
DOCS_STDIN_FIELD=""
DOCS_FLAGS=""
DOCS_GRAMMAR=""

# docs_template: the grammar asset inside the module (scripts/doc.grammar): the schema
# the write verbs and the audit enforce, private to the module, never a shared drawer file
docs_template() {
  DOCS_TEMPLATE="$DOCS_DIR/doc.grammar"
  if [ ! -f "$DOCS_TEMPLATE" ]; then
    printf '%s: the corpus grammar asset scripts/doc.grammar is missing; reinstall the docs module (ERR_DRIVER_NOT_FOUND)\n' "$DOCS_VERB" >&2
    return 2
  fi
  export DOCS_TEMPLATE
  return 0
}

# docs_act <set|unset|add|remove> <field> <value>: one field action for the edit engine,
# carried in the environment (free text never through awk -v)
docs_act() {
  DOCS_NA=$((DOCS_NA + 1))
  eval "EDIT_A_$DOCS_NA=\$1 EDIT_F_$DOCS_NA=\$2 EDIT_V_$DOCS_NA=\$3"
  export "EDIT_A_$DOCS_NA" "EDIT_F_$DOCS_NA" "EDIT_V_$DOCS_NA"
  EDIT_NA=$DOCS_NA
  export EDIT_NA
}

docs_bad_flag() {
  printf '%s: unknown option: %s (flags: %s) (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" "$1" "$DOCS_FLAGS" >&2
  return 1
}

# docs_parse <controls> <fields 0|1> [<argument>...]: positionals into DOCS_P1..DOCS_P<n>
# (DOCS_NP); the control flags the verb takes (<controls>, space separated: after first
# remove id dry-run replace kind old new count stdin) into DOCS_*; with <fields> 1 every
# other --<field>=<value> (a control the verb does not take among them, as entry's --kind
# for a component), --add-<field>=<item>, --remove-<field>=<item>, and
# --unset=<field> into a field action (dashes read as underscores; the engine refuses a
# field the block does not carry); anything else refuses rc 1 naming the verb's flags
docs_parse() {
  dp_ok=" $1 "
  dp_fields=$2
  shift 2
  for dp_a in "$@"; do
    dp_c=""
    case "$dp_a" in
      --after=*) dp_c=after ;;
      --first) dp_c=first ;;
      --remove) dp_c=remove ;;
      --id=*) dp_c=id ;;
      --dry-run) dp_c=dry-run ;;
      --replace) dp_c=replace ;;
      --kind=*) dp_c=kind ;;
      --old=*) dp_c=old ;;
      --new=*) dp_c=new ;;
      --count=*) dp_c=count ;;
      --stdin=*) dp_c=stdin ;;
    esac
    case "$dp_ok" in
      *" $dp_c "*) ;;
      *) dp_c="" ;;
    esac
    if [ -n "$dp_c" ]; then
      case "$dp_c" in
        after) DOCS_AFTER=${dp_a#--after=} ;;
        first) DOCS_FIRST=1 ;;
        remove) DOCS_REMOVE=1 ;;
        id) DOCS_ID=${dp_a#--id=} ;;
        dry-run) DOCS_DRY=1 ;;
        replace) DOCS_REPLACE=1 ;;
        kind) DOCS_KIND=${dp_a#--kind=} ;;
        old) DOCS_OLD=${dp_a#--old=}; DOCS_HAS_OLD=1 ;;
        new) DOCS_NEW=${dp_a#--new=}; DOCS_HAS_NEW=1 ;;
        count) DOCS_COUNT=${dp_a#--count=} ;;
        stdin) DOCS_STDIN_FIELD=$(printf '%s' "${dp_a#--stdin=}" | tr - _) ;;
      esac
      continue
    fi
    case "$dp_a" in
      --*)
        [ "$dp_fields" -eq 1 ] || { docs_bad_flag "$dp_a"; return 1; }
        case "$dp_a" in
          --*=*) ;;
          *) docs_bad_flag "$dp_a"; return 1 ;;
        esac
        dp_n=${dp_a%%=*}
        dp_n=${dp_n#--}
        dp_v=${dp_a#*=}
        dp_act=set
        case "$dp_n" in
          unset) dp_act=unset; dp_n=$dp_v; dp_v="" ;;
          add-?*) dp_act=add; dp_n=${dp_n#add-} ;;
          remove-?*) dp_act=remove; dp_n=${dp_n#remove-} ;;
        esac
        case "$dp_n" in
          ""|*[!a-z0-9_-]*) docs_bad_flag "$dp_a"; return 1 ;;
        esac
        dp_n=$(printf '%s' "$dp_n" | tr - _)
        # a verb's singular spellings (header: --add-source for the sources list)
        for dp_al in ${DOCS_ALIASES:-}; do
          [ "${dp_al%%=*}" = "$dp_n" ] && dp_n=${dp_al#*=}
        done
        docs_act "$dp_act" "$dp_n" "$dp_v"
        ;;
      *)
        DOCS_NP=$((DOCS_NP + 1))
        eval "DOCS_P$DOCS_NP=\$dp_a"
        ;;
    esac
  done
  return 0
}

# docs_stdin_value: the --stdin=<field> value read raw from stdin (quotes, backslashes, and
# newlines kept) into a set action; the value itself stays in a scratch file the edit engine
# reads as its payload operand (EDIT_STDIN_N names the action it fills), never in the
# environment, so a body of any size meets no argument or environment limit
docs_stdin_value() {
  [ -n "$DOCS_STDIN_FIELD" ] || return 0
  case "$DOCS_STDIN_FIELD" in
    *[!a-z0-9_]*) docs_bad_flag "--stdin=$DOCS_STDIN_FIELD"; return 1 ;;
  esac
  docs_scratch || return 2
  DOCS_PAYLOAD="$DOCS_SCRATCH/payload"
  cat > "$DOCS_PAYLOAD" || return 2
  docs_act set "$DOCS_STDIN_FIELD" ""
  EDIT_STDIN_N=$DOCS_NA
  export EDIT_STDIN_N
}

# docs_payload: the verb's stdin saved raw into scratch (a whole doc, a section block);
# DOCS_PAYLOAD names the file
docs_payload() {
  if [ -t 0 ]; then
    printf '%s: the content comes on stdin (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" >&2
    return 1
  fi
  docs_scratch || return 2
  DOCS_PAYLOAD="$DOCS_SCRATCH/payload"
  cat > "$DOCS_PAYLOAD" || return 2
}

# docs_noeol <file>: rc 0 when a non-empty file lacks its final newline
docs_noeol() {
  [ -s "$1" ] || return 1
  [ "$(tail -c 1 "$1" | wc -l | tr -d ' ')" -eq 0 ]
}

# docs_read_doc <repo> <slug> <file>: the stored doc into <file> through store.get; rc 1
# names an absent doc
docs_read_doc() {
  if store_get docs "$1/$2" < /dev/null > "$3" 2> "$DOCS_SCRATCH/read.err"; then
    return 0
  else
    dr_rc=$?
  fi
  if [ "$dr_rc" -eq 1 ]; then
    printf '%s: no such doc: %s/%s (ERR_ENTITY_NOT_FOUND)\n' "$DOCS_VERB" "$1" "$2" >&2
  else
    cat "$DOCS_SCRATCH/read.err" >&2
  fi
  return "$dr_rc"
}

# docs_exists <repo> <slug>: rc 0 when the corpus holds the doc, 1 when not, 2 on a failure
docs_exists() {
  if store_get docs "$1/$2" < /dev/null > /dev/null 2> "$DOCS_SCRATCH/exists.err"; then
    return 0
  else
    de_rc=$?
  fi
  [ "$de_rc" -eq 1 ] && return 1
  cat "$DOCS_SCRATCH/exists.err" >&2
  return 2
}

# docs_engine <op> <repo> <slug> <doc file> <out file>: the edit engine over one doc with
# the request exported; its note (or refusal) lands in <out file>.note; rc 0, 1 a refusal,
# 2 the engine's own failure
docs_engine() {
  EDIT_VERB=$DOCS_VERB
  EDIT_OP=$1
  EDIT_REPO=$2
  EDIT_SLUG=$3
  EDIT_NOEOL=0
  docs_noeol "$4" && EDIT_NOEOL=1
  EDIT_KIND=$DOCS_KIND
  EDIT_AFTER=$DOCS_AFTER
  EDIT_FIRST=$DOCS_FIRST
  EDIT_REMOVE=$DOCS_REMOVE
  EDIT_ID=$DOCS_ID
  EDIT_DRY=$DOCS_DRY
  EDIT_OLD=$DOCS_OLD
  EDIT_NEW=$DOCS_NEW
  EDIT_NA=$DOCS_NA
  export EDIT_VERB EDIT_OP EDIT_REPO EDIT_SLUG EDIT_NOEOL EDIT_KIND EDIT_BLOCK EDIT_KEY EDIT_AFTER EDIT_FIRST EDIT_REMOVE EDIT_ID EDIT_DRY EDIT_OLD EDIT_NEW EDIT_NA
  if awk -f "$DOCS_DIR/docs-edit.awk" part=1 "$DOCS_TEMPLATE" part=2 "$4" part=3 "${DOCS_PAYLOAD:-/dev/null}" > "$5" 2> "$5.note"; then
    return 0
  else
    dn_rc=$?
  fi
  cat "$5.note" >&2
  [ "$dn_rc" -eq 1 ] && return 1
  return 2
}

# docs_grammar_put <repo> <slug> <file>: the grammar check's scratch copy of the corpus
# (made once per verb from one store.list and store.get pass), with <file> in the doc's
# place (an empty <file> name removes it)
docs_grammar_put() {
  if [ -z "$DOCS_GRAMMAR" ]; then
    docs_keys || return $?
    DOCS_ALL=$DOCS_KEYS
    docs_materialize || return $?
    DOCS_GRAMMAR="$DOCS_SCRATCH/grammar"
    mkdir -p "$DOCS_GRAMMAR/docs" || return 2
    gp_list=$(printf '%s\n' "$DOCS_ALL")
    for gp_k in $gp_list; do
      mkdir -p "$DOCS_GRAMMAR/docs/${gp_k%/*}" && cp "$DOCS_MOUNT/docs/$gp_k.md" "$DOCS_GRAMMAR/docs/$gp_k.md" || {
        printf '%s: cannot stage the grammar check (ERR_STORAGE_WRITE)\n' "$DOCS_VERB" >&2
        return 2
      }
    done
  fi
  mkdir -p "$DOCS_GRAMMAR/docs/$1" || return 2
  if [ -n "$3" ]; then
    cp "$3" "$DOCS_GRAMMAR/docs/$1/$2.md" || return 2
  else
    rm -f "$DOCS_GRAMMAR/docs/$1/$2.md"
  fi
  return 0
}

# docs_grammar_check <repo>: the audit engine over the repo's docs in the scratch copy (the
# canonical addresses in its messages); rc 1 prints the audit's lines and the refusal
docs_grammar_check() {
  if (cd "$DOCS_GRAMMAR" && set -- docs/"$1"/*.md && [ -f "$1" ] && exec awk -f "$DOCS_DIR/docs-audit.awk" "$@") 2> "$DOCS_SCRATCH/audit.err"; then
    return 0
  fi
  cat "$DOCS_SCRATCH/audit.err" >&2
  printf '%s: the result fails the grammar audit of repo %s; nothing written (ERR_SCHEMA_VIOLATION)\n' "$DOCS_VERB" "$1" >&2
  return 1
}

# docs_store <repo> <slug> <op> <file>: store.put stamped with the op and the workspace
# HEAD; the driver's message passes on a failure
docs_store() {
  ds_head=$(docs_head)
  if store_put docs "$1/$2" "--op=$3" "--head=$ds_head" < "$4" > /dev/null 2> "$DOCS_SCRATCH/store.err"; then
    return 0
  else
    dst_rc=$?
  fi
  cat "$DOCS_SCRATCH/store.err" >&2
  return "$dst_rc"
}

# docs_say <repo> <slug> <note file>: the verb's line (docs <verb>: <repo>/<slug> <note>)
# and, on a dry run, the changed lines after it
docs_say() {
  DOCS_SAY_PFX="${DOCS_VERB#ctx }: " DOCS_SAY_DOC="$1/$2" awk 'NR == 1 { print ENVIRON["DOCS_SAY_PFX"] ENVIRON["DOCS_SAY_DOC"] " " $0; next } { print }' "$3"
}

docs_keys_ok() {
  docs_key_valid "$1" || { printf '%s: malformed repo: %s (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" "$1" >&2; return 1; }
  docs_key_valid "$2" || { printf '%s: malformed slug: %s (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" "$2" >&2; return 1; }
  return 0
}

# docs_edit <op> <repo> <slug>: the one-doc write pipeline (new, write, header, rule, entry,
# section); EDIT_BLOCK and EDIT_KEY name the address, the field actions are in place
docs_edit() {
  dd_op=$1
  dd_repo=$2
  dd_slug=$3
  docs_keys_ok "$dd_repo" "$dd_slug" || return 1
  docs_require || return 2
  docs_scratch || return 2
  docs_template || return 2
  dd_old="$DOCS_SCRATCH/old"
  dd_new="$DOCS_SCRATCH/new"
  : > "$dd_old"
  case "$dd_op" in
    new)
      if docs_exists "$dd_repo" "$dd_slug"; then
        printf '%s: %s/%s already exists (ERR_ENTITY_EXISTS)\n' "$DOCS_VERB" "$dd_repo" "$dd_slug" >&2
        return 1
      else
        dd_rc=$?
        [ "$dd_rc" -eq 1 ] || return "$dd_rc"
      fi
      ;;
    write)
      if docs_exists "$dd_repo" "$dd_slug"; then
        if [ "$DOCS_REPLACE" -ne 1 ]; then
          printf '%s: %s/%s already exists; --replace rewrites it whole (ERR_ENTITY_EXISTS)\n' "$DOCS_VERB" "$dd_repo" "$dd_slug" >&2
          return 1
        fi
        # a rewrite of the stored bytes changes nothing: nothing written and, under a store,
        # no change-log row (a row would let the doc ride the delta and freshen its code)
        docs_read_doc "$dd_repo" "$dd_slug" "$DOCS_SCRATCH/stored" || return $?
        if cmp -s "$DOCS_SCRATCH/stored" "$DOCS_PAYLOAD"; then
          printf '%s: %s/%s unchanged (nothing written)\n' "${DOCS_VERB#ctx }" "$dd_repo" "$dd_slug"
          return 0
        fi
      else
        dd_rc=$?
        [ "$dd_rc" -eq 1 ] || return "$dd_rc"
        if [ "$DOCS_REPLACE" -eq 1 ]; then
          printf '%s: no such doc: %s/%s; --replace rewrites an existing doc (ERR_ENTITY_NOT_FOUND)\n' "$DOCS_VERB" "$dd_repo" "$dd_slug" >&2
          return 1
        fi
      fi
      dd_old=$DOCS_PAYLOAD
      DOCS_PAYLOAD=""
      ;;
    *)
      docs_read_doc "$dd_repo" "$dd_slug" "$dd_old" || return $?
      ;;
  esac
  docs_engine "$dd_op" "$dd_repo" "$dd_slug" "$dd_old" "$dd_new" || return $?
  if [ "$dd_op" != new ] && [ "$dd_op" != write ] && cmp -s "$dd_old" "$dd_new"; then
    printf '%s: %s/%s unchanged (nothing written)\n' "${DOCS_VERB#ctx }" "$dd_repo" "$dd_slug"
    return 0
  fi
  docs_grammar_put "$dd_repo" "$dd_slug" "$dd_new" || return $?
  docs_grammar_check "$dd_repo" || return 1
  if [ "$DOCS_DRY" -eq 1 ]; then
    docs_say "$dd_repo" "$dd_slug" "$dd_new.note"
    printf '%s: dry run, nothing written\n' "$DOCS_VERB"
    return 0
  fi
  # the change-log op is the verb's own (pitfall runs the engine's entry op)
  docs_store "$dd_repo" "$dd_slug" "${DOCS_STORE_OP:-$dd_op}" "$dd_new" || return $?
  docs_say "$dd_repo" "$dd_slug" "$dd_new.note"
  return 0
}

# docs_show <repo> <slug> <block>/<key>: the addressed entry's raw lines (query --entry)
docs_show() {
  docs_keys_ok "$1" "$2" || return 1
  case "$3" in
    */?*) ;;
    *) printf '%s: --entry takes <block>/<key> (got %s) (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" "$3" >&2; return 1 ;;
  esac
  EDIT_BLOCK=${3%%/*}
  EDIT_KEY=${3#*/}
  docs_require || return 2
  docs_scratch || return 2
  docs_template || return 2
  docs_read_doc "$1" "$2" "$DOCS_SCRATCH/old" || return $?
  docs_engine show "$1" "$2" "$DOCS_SCRATCH/old" "$DOCS_SCRATCH/new" || return $?
  cat "$DOCS_SCRATCH/new"
}

# docs_remove_doc <repo> <slug>: store.delete with op remove, stamped with the HEAD
docs_remove_doc() {
  docs_keys_ok "$1" "$2" || return 1
  docs_require || return 2
  docs_scratch || return 2
  docs_exists "$1" "$2" || {
    dx_rc=$?
    [ "$dx_rc" -eq 1 ] && printf '%s: no such doc: %s/%s (ERR_ENTITY_NOT_FOUND)\n' "$DOCS_VERB" "$1" "$2" >&2
    return "$dx_rc"
  }
  dx_head=$(docs_head)
  if store_delete docs "$1/$2" --op=remove "--head=$dx_head" < /dev/null > /dev/null 2> "$DOCS_SCRATCH/store.err"; then
    printf 'docs remove: %s/%s removed\n' "$1" "$2"
    return 0
  else
    dx_rc=$?
  fi
  cat "$DOCS_SCRATCH/store.err" >&2
  return "$dx_rc"
}

# docs_scope [<repo> [<slug>]]: DOCS_KEYS narrowed to the scope a multi-doc verb names (the
# whole corpus, one repo, one doc); rc 1 names what the corpus lacks
docs_scope() {
  docs_keys || return $?
  DOCS_ALL=$DOCS_KEYS
  if [ -n "${1:-}" ]; then
    docs_key_valid "$1" || { printf '%s: malformed repo: %s (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" "$1" >&2; return 1; }
    docs_select "$1" || { printf '%s: no such repo: %s (ERR_ENTITY_NOT_FOUND)\n' "$DOCS_VERB" "$1" >&2; return 1; }
  fi
  if [ -n "${2:-}" ]; then
    docs_key_valid "$2" || { printf '%s: malformed slug: %s (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" "$2" >&2; return 1; }
    printf '%s\n' "$DOCS_KEYS" | grep -qxF -- "$1/$2" || { printf '%s: no such doc: %s/%s (ERR_ENTITY_NOT_FOUND)\n' "$DOCS_VERB" "$1" "$2" >&2; return 1; }
    DOCS_KEYS="$1/$2"
  fi
  [ -n "$DOCS_KEYS" ] || { printf '%s: the corpus is empty\n' "$DOCS_VERB" >&2; return 1; }
  return 0
}

# docs_multi <op> [<repo> [<slug>]]: the multi-doc pipeline (replace, ids): every doc of the
# scope edited into scratch first, the counts checked (replace: the total must equal
# --count, else each doc's count is printed and nothing written), every touched repo
# audited, then the writes one doc after another (a failure names the docs that landed)
docs_multi() {
  dm_op=$1
  shift
  docs_require || return 2
  docs_scratch || return 2
  docs_template || return 2
  docs_scope "$@" || return $?
  dm_i=0
  dm_total=0
  : > "$DOCS_SCRATCH/touched"
  : > "$DOCS_SCRATCH/counts"
  dm_list=$(printf '%s\n' "$DOCS_KEYS")
  for dm_k in $dm_list; do
    dm_i=$((dm_i + 1))
    dm_r=${dm_k%/*}
    dm_s=${dm_k#*/}
    docs_read_doc "$dm_r" "$dm_s" "$DOCS_SCRATCH/m$dm_i.old" || return $?
    docs_engine "$dm_op" "$dm_r" "$dm_s" "$DOCS_SCRATCH/m$dm_i.old" "$DOCS_SCRATCH/m$dm_i.new" || return $?
    dm_c=$(awk 'NR == 1 { print $NF + 0; exit }' "$DOCS_SCRATCH/m$dm_i.new.note")
    dm_total=$((dm_total + dm_c))
    if [ "$dm_c" -gt 0 ]; then
      printf '%s\t%s\t%s\n' "$dm_i" "$dm_k" "$dm_c" >> "$DOCS_SCRATCH/counts"
    fi
  done
  if [ "$dm_op" = replace ] && [ "$dm_total" -ne "$DOCS_COUNT" ]; then
    awk -F '\t' '{ print "  " $2 ": " $3 }' "$DOCS_SCRATCH/counts" >&2
    printf '%s: %s occurrences in scope, --count says %s; nothing written (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" "$dm_total" "$DOCS_COUNT" >&2
    return 1
  fi
  dm_tab=$(printf '\t')
  while IFS=$dm_tab read -r dm_i dm_k dm_c; do
    docs_grammar_put "${dm_k%/*}" "${dm_k#*/}" "$DOCS_SCRATCH/m$dm_i.new" || return $?
    printf '%s\n' "${dm_k%/*}" >> "$DOCS_SCRATCH/touched"
  done < "$DOCS_SCRATCH/counts"
  for dm_r in $(sort -u "$DOCS_SCRATCH/touched"); do
    docs_grammar_check "$dm_r" || return 1
  done
  dm_docs=$(awk 'END { print NR }' "$DOCS_SCRATCH/counts")
  if [ "$DOCS_DRY" -eq 1 ]; then
    while IFS=$dm_tab read -r dm_i dm_k dm_c; do
      docs_say "${dm_k%/*}" "${dm_k#*/}" "$DOCS_SCRATCH/m$dm_i.new.note"
    done < "$DOCS_SCRATCH/counts"
    printf '%s: dry run: %s in %s docs, nothing written\n' "$DOCS_VERB" "$dm_total" "$dm_docs"
    return 0
  fi
  while IFS=$dm_tab read -r dm_i dm_k dm_c; do
    if ! docs_store "${dm_k%/*}" "${dm_k#*/}" "$dm_op" "$DOCS_SCRATCH/m$dm_i.new"; then
      printf '%s: stopped at %s; the docs printed above landed (ERR_STORAGE_WRITE)\n' "$DOCS_VERB" "$dm_k" >&2
      return 2
    fi
    docs_say "${dm_k%/*}" "${dm_k#*/}" "$DOCS_SCRATCH/m$dm_i.new.note" | awk 'NR == 1'
  done < "$DOCS_SCRATCH/counts"
  case "$dm_op" in
    replace) printf '%s: %s replaced in %s docs\n' "${DOCS_VERB#ctx }" "$dm_total" "$dm_docs" ;;
    ids) printf '%s: %s entries keyed\n' "${DOCS_VERB#ctx }" "$dm_total" ;;
  esac
  return 0
}
