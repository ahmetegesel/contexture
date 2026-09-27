# docs-io.sh: the docs module's one door to the corpus (sourced by the read verbs query,
# audit, check, gate, and nudge; never run, so it carries no summary line and discovery
# ignores it). It is the only file of the module that calls a corpus method or composes a
# doc's path: the verbs and their engines receive the paths it hands them.
#
# The corpus is served by the configured storage driver (the capability corpus.store,
# asked of driver-resolver). A verb reads it through a mount: a folder under which every
# doc sits at docs/<repo>/<slug>.md. The files driver answers in place with the workspace
# root (nothing copied); a store driver fills the empty folder it is handed. Every driver
# call runs with the workspace root as its cwd and CTX_ROOT, an inherited CTX_DIR unset,
# and stdin from /dev/null (the check's delta on stdin stays the verb's).
#
# The display-path rule: every doc path a verb prints is the path the files driver prints
# for the same call. An explicit doc path read in place passes as the caller's own string;
# a repo name or a bare call reads docs/<repo>/<slug>.md relative to the mount (the
# canonical address on every driver); any other doc read from a filled mount is mapped
# back to the caller's form by exact string substitution (the pairs from a scratch file,
# never awk -v). Scratch lives under the workspace's .contexture/tmp (the system temp
# only when the drawer cannot be written) and is removed on exit.

DOCS_VERB=""
DOCS_ROOT=""
DOCS_ROOT_P=""
DOCS_RESOLVER=""
DOCS_SCRATCH=""
DOCS_MOUNT=""
DOCS_INPLACE=0
DOCS_KEYS=""
DOCS_ALL=""
DOCS_CD=0
DOCS_PATHS=""
DOCS_MAP=""
DOCS_ERR=""

# docs_io_init <scripts dir> <verb>: the workspace root as the verbs resolve it
# (DOCS_WORKSPACE_ROOT, then CTX_ROOT, then the walk up to the .contexture drawer's
# parent) and the resolver as ctx lane show finds it
docs_io_init() {
  DOCS_VERB="ctx docs $2"
  di_root=""
  di_p=$1
  while [ "$di_p" != "/" ] && [ "${di_p##*/}" != ".contexture" ]; do di_p=${di_p%/*}; done
  [ "${di_p##*/}" = ".contexture" ] && di_root=${di_p%/*}
  [ -n "$di_root" ] || di_root=$(CDPATH= cd -- "$1/../../.." && pwd)
  DOCS_ROOT="${DOCS_WORKSPACE_ROOT:-${CTX_ROOT:-$di_root}}"
  DOCS_ROOT_P=$(CDPATH= cd -- "$DOCS_ROOT" 2>/dev/null && pwd) || DOCS_ROOT_P=""
  DOCS_RESOLVER="$1/../../session/scripts/driver-resolver"
  if [ ! -x "$DOCS_RESOLVER" ]; then
    DOCS_RESOLVER=""
    if [ -n "${CTX_ROOT:-}" ] && [ -x "$CTX_ROOT/.contexture/modules/session/scripts/driver-resolver" ]; then
      DOCS_RESOLVER="$CTX_ROOT/.contexture/modules/session/scripts/driver-resolver"
    elif [ -n "${CTX_ROOT:-}" ] && [ -x "$CTX_ROOT/base/.contexture/modules/session/scripts/driver-resolver" ]; then
      DOCS_RESOLVER="$CTX_ROOT/base/.contexture/modules/session/scripts/driver-resolver"
    fi
  fi
  return 0
}

# docs_call <resolver arguments>: one resolver call from the workspace root
docs_call() {
  (
    unset CTX_DIR
    CTX_ROOT=$DOCS_ROOT
    export CTX_ROOT
    cd "$DOCS_ROOT" 2>/dev/null || exit 2
    exec "$DOCS_RESOLVER" "$@" < /dev/null
  )
}

# docs_require: the configured driver serves the corpus (corpus.store), else rc 2 with the
# resolver's message and the verb's own line
docs_require() {
  if [ -z "$DOCS_RESOLVER" ]; then
    printf '%s: no storage driver resolver beside the docs module (need: the session module) (ERR_DRIVER_NOT_FOUND)\n' "$DOCS_VERB" >&2
    return 2
  fi
  if [ -z "$DOCS_ROOT_P" ]; then
    printf '%s: the workspace root is not a folder (ERR_INVALID_ARGUMENT)\n' "$DOCS_VERB" >&2
    return 2
  fi
  if docs_call require corpus.store; then
    return 0
  fi
  printf '%s: the configured storage driver serves no corpus (corpus.store)\n' "$DOCS_VERB" >&2
  return 2
}

docs_io_cleanup() {
  if [ -n "$DOCS_SCRATCH" ]; then
    rm -rf "$DOCS_SCRATCH"
    DOCS_SCRATCH=""
  fi
  return 0
}

# docs_scratch: the verb's scratch folder, made once, removed on exit
docs_scratch() {
  [ -n "$DOCS_SCRATCH" ] && return 0
  ds_base="${TMPDIR:-/tmp}"
  if [ -d "$DOCS_ROOT/.contexture" ] && mkdir -p "$DOCS_ROOT/.contexture/tmp" 2>/dev/null && [ -w "$DOCS_ROOT/.contexture/tmp" ]; then
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

# docs_release: drop the scratch before an exec (an in-place mount needs none of it)
docs_release() {
  docs_io_cleanup
  trap - EXIT HUP INT TERM
  return 0
}

# docs_mount [<repo>]: the corpus mounted; DOCS_MOUNT is the root to read docs/<repo>/<slug>.md
# under and DOCS_INPLACE is 1 when the driver answered in place (the workspace root); an
# answer that is neither the root nor the folder handed over refuses rc 2
docs_mount() {
  docs_scratch || return 2
  if ! mkdir "$DOCS_SCRATCH/mount" 2>/dev/null; then
    printf '%s: cannot make its mount folder (ERR_STORAGE_WRITE)\n' "$DOCS_VERB" >&2
    return 2
  fi
  if dm_ans=$(docs_call corpus.mount "$DOCS_SCRATCH/mount" ${1:+"$1"}); then
    :
  else
    return $?
  fi
  if [ "$dm_ans" = "$DOCS_ROOT_P" ]; then
    DOCS_INPLACE=1
    DOCS_MOUNT=$DOCS_ROOT
  elif [ "$dm_ans" = "$DOCS_SCRATCH/mount" ]; then
    DOCS_INPLACE=0
    DOCS_MOUNT=$dm_ans
  else
    printf '%s: the storage driver mounted the corpus outside this workspace and its scratch (ERR_DRIVER_PROTOCOL)\n' "$DOCS_VERB" >&2
    return 2
  fi
  return 0
}

# docs_keys [<repo>]: DOCS_KEYS holds one <repo>/<slug> per line in the driver's order (the
# bytewise order of the canonical addresses); rc 1 for a repo the corpus lacks (quiet: the
# verb names it), rc 2 when the driver fails (its message kept)
docs_keys() {
  if DOCS_KEYS=$(docs_call corpus.list ${1:+"$1"} 2>"$DOCS_SCRATCH/list.err"); then
    return 0
  else
    dk_rc=$?
  fi
  DOCS_KEYS=""
  [ "$dk_rc" -ne 1 ] && cat "$DOCS_SCRATCH/list.err" >&2
  return "$dk_rc"
}

# docs_select <repo>: DOCS_KEYS narrowed from the whole list (DOCS_ALL, one driver call per
# verb) to that repo's docs, the order kept; rc 1 when the corpus holds none
docs_select() {
  DOCS_KEYS=$(printf '%s\n' "$DOCS_ALL" | DOCS_SEL="$1/" awk 'index($0, ENVIRON["DOCS_SEL"]) == 1')
  [ -n "$DOCS_KEYS" ] && return 0
  return 1
}

docs_key_valid() {
  case "$1" in
    ""|[!A-Za-z0-9]*|*[!A-Za-z0-9._-]*) return 1 ;;
  esac
  return 0
}

# docs_corpus [<repo>]: the whole corpus (or one repo's docs) for a verb that composes
# absolute paths (query, gate): require, keys, mount; DOCS_PATHS lists <mount>/docs/<key>.md
# and a filled mount maps its prefix back to the workspace root. rc 1 leaves DOCS_ERR=repo
# (an absent repo) or DOCS_ERR=empty (an empty corpus) for the verb to word
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
  docs_mount ${1:+"$1"} || return $?
  DOCS_PATHS="$DOCS_SCRATCH/paths"
  DOCS_MAP="$DOCS_SCRATCH/map"
  : > "$DOCS_MAP"
  printf '%s\n' "$DOCS_KEYS" | while IFS= read -r dc_k; do
    [ -n "$dc_k" ] && printf '%s/docs/%s.md\n' "$DOCS_MOUNT" "$dc_k"
  done > "$DOCS_PATHS"
  if [ "$DOCS_INPLACE" -eq 0 ]; then
    printf '%s/\t%s/\n' "$DOCS_MOUNT" "$DOCS_ROOT" > "$DOCS_MAP"
  fi
  return 0
}

docs_not_a_doc() {
  printf '%s: not a corpus doc: %s (name a repo, docs/<repo>/<slug>.md, or docs/*/*.md)\n' "$DOCS_VERB" "$1" >&2
  return 1
}

# docs_args <bare 0|1> <cwd 0|1> [<corpus argument>...]: the corpus a verb was handed,
# resolved to engine paths in DOCS_PATHS (one per line) with the display pairs in DOCS_MAP.
# Forms: a repo name (its docs); docs/<repo>/<slug>.md with any prefix (the doc at that
# address); the files-driver patterns docs/*/*.md and docs/<repo>/*.md with any prefix,
# expanded by the driver's list when the shell left them literal; no argument: the whole
# corpus when <bare> is 1, none otherwise. Only repo names (or no argument) run the engine
# inside the mount on relative paths (DOCS_CD=1), unless <cwd> is 1 (the verb keeps its
# cwd); any path form keeps the caller's cwd. rc 1 names a doc, a repo, or an argument the
# corpus does not hold; rc 2 a driver failure.
docs_args() {
  da_bare=$1
  da_cwd=$2
  shift 2
  docs_require || return 2
  docs_scratch || return 2
  docs_mount || return $?
  docs_keys || return $?
  DOCS_ALL=$DOCS_KEYS
  DOCS_PATHS="$DOCS_SCRATCH/paths"
  DOCS_MAP="$DOCS_SCRATCH/map"
  : > "$DOCS_PATHS"
  : > "$DOCS_MAP"
  DOCS_CD=1
  [ "$da_cwd" -eq 1 ] && DOCS_CD=0
  for da_a in "$@"; do
    case "$da_a" in
      */*|*.md) DOCS_CD=0 ;;
    esac
  done
  if [ $# -eq 0 ]; then
    [ "$da_bare" -eq 1 ] || return 0
    DOCS_KEYS=$DOCS_ALL
    if [ -z "$DOCS_KEYS" ]; then
      printf '%s: the corpus is empty\n' "$DOCS_VERB" >&2
      return 1
    fi
    docs_args_emit ""
    return 0
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
        da_prefix=${da_a%"docs/$da_r/$da_s"}
        if [ "$da_r" = "*" ] && [ "$da_s" = "*.md" ]; then
          DOCS_KEYS=$DOCS_ALL
          docs_args_emit "$da_prefix"
        elif [ "$da_s" = "*.md" ] && docs_key_valid "$da_r"; then
          if docs_select "$da_r"; then
            :
          else
            da_rc=$?
            [ "$da_rc" -eq 1 ] && printf '%s: no such repo: %s\n' "$DOCS_VERB" "$da_r" >&2
            return "$da_rc"
          fi
          docs_args_emit "$da_prefix"
        else
          da_slug=${da_s%.md}
          if [ "$da_slug" = "$da_s" ] || ! docs_key_valid "$da_r" || ! docs_key_valid "$da_slug"; then
            docs_not_a_doc "$da_a"
            return 1
          fi
          if docs_select "$da_r"; then
            :
          else
            da_rc=$?
            [ "$da_rc" -eq 1 ] && printf '%s: no such doc: %s/%s\n' "$DOCS_VERB" "$da_r" "$da_slug" >&2
            return "$da_rc"
          fi
          if ! printf '%s\n' "$DOCS_KEYS" | grep -qxF -- "$da_r/$da_slug"; then
            printf '%s: no such doc: %s/%s\n' "$DOCS_VERB" "$da_r" "$da_slug" >&2
            return 1
          fi
          if [ "$DOCS_INPLACE" -eq 1 ] && [ -f "$da_a" ] \
            && [ "$(CDPATH= cd -- "$da_rest" 2>/dev/null && pwd -P)" = "$(CDPATH= cd -- "$DOCS_ROOT/docs/$da_r" 2>/dev/null && pwd -P)" ]; then
            printf '%s\n' "$da_a" >> "$DOCS_PATHS"
          else
            printf '%s/docs/%s/%s.md\n' "$DOCS_MOUNT" "$da_r" "$da_slug" >> "$DOCS_PATHS"
            printf '%s/docs/%s/%s.md\t%s\n' "$DOCS_MOUNT" "$da_r" "$da_slug" "$da_a" >> "$DOCS_MAP"
          fi
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
        docs_args_emit ""
        ;;
    esac
  done
  if [ ! -s "$DOCS_PATHS" ]; then
    printf '%s: the corpus is empty\n' "$DOCS_VERB" >&2
    return 1
  fi
  return 0
}

# docs_args_emit <display prefix>: DOCS_KEYS appended to DOCS_PATHS; inside the mount
# (DOCS_CD=1) as relative canonical addresses, else as mount paths displayed as
# <prefix>docs/<key>.md (a pair only when the mount path differs from the display)
docs_args_emit() {
  printf '%s\n' "$DOCS_KEYS" | while IFS= read -r de_k; do
    [ -n "$de_k" ] || continue
    if [ "$DOCS_CD" -eq 1 ]; then
      printf 'docs/%s.md\n' "$de_k" >> "$DOCS_PATHS"
    else
      printf '%s/docs/%s.md\n' "$DOCS_MOUNT" "$de_k" >> "$DOCS_PATHS"
      if [ "$DOCS_MOUNT/docs/$de_k.md" != "$1docs/$de_k.md" ]; then
        printf '%s/docs/%s.md\t%sdocs/%s.md\n' "$DOCS_MOUNT" "$de_k" "$1" "$de_k" >> "$DOCS_MAP"
      fi
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

# docs_no_display: the verb prints no doc path (the nudge), so no display pair is due
docs_no_display() {
  [ -n "$DOCS_MAP" ] && : > "$DOCS_MAP"
  return 0
}

# docs_record_file <path>: rc 0 when the path lies inside the record's sessions drawer (by
# its spelling, or physically under the workspace's drawer): a record artifact is read
# through ctx session, never as a file (the single store)
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
# session task list, its block verbatim through ctx session resolve task# (task show's text
# view drops REFS) into scratch: DOCS_TASK names the file, empty when no task is active;
# the session verbs' rc and messages pass through
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
  if at_list=$( (unset CTX_DIR; cd "$DOCS_ROOT" && exec "$at_ctx" session task list "$1" --status=progress < /dev/null) ); then
    :
  else
    return $?
  fi
  at_slug=$(printf '%s\n' "$at_list" | awk '$1 == "[IN_PROGRESS]" { s = $2; sub(/:$/, "", s); print s; exit }')
  [ -n "$at_slug" ] || return 0
  if (unset CTX_DIR; cd "$DOCS_ROOT" && exec "$at_ctx" session resolve "$1" "task#$at_slug" < /dev/null) > "$DOCS_SCRATCH/task"; then
    DOCS_TASK="$DOCS_SCRATCH/task"
    return 0
  else
    return $?
  fi
}

# docs_delta_source: DOCS_DELTA is log when the configured driver keeps a corpus change log
# (corpus.changelog: the corpus half of a delta comes from the store), git otherwise (the
# files driver: the corpus rides the git delta as the code does); the check engine takes it
# as its bounded delta_source token
docs_delta_source() {
  DOCS_DELTA=git
  if [ -n "$DOCS_RESOLVER" ] && docs_call has corpus.changelog; then
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

# docs_changes [--since=<rev>]: the corpus half of a delta from the store's change log, one
# status-prefixed line per doc, <status> TAB docs/<repo>/<slug>.md, bytewise by path. The
# window is the rows stamped with the current HEAD; --since=<rev> widens it to the heads git
# rev-list --boundary <rev>..HEAD names (the boundary's leading dash stripped), <rev> itself,
# and HEAD. Net status per doc, as git would report the same history: A when the doc was
# absent before its first row in the window and exists now, M when it was present and
# exists now, D when it was present and is gone now, no line when it was absent and is gone.
# rc 1 on a driver without corpus.changelog (the files driver takes the corpus delta from
# git), an unknown revision, or --since outside a repository; rc 2 a driver failure
docs_changes() {
  dx_since=""
  for dx_a in "$@"; do
    case "$dx_a" in
      --since=?*) dx_since=${dx_a#--since=} ;;
      *) printf '%s: unknown argument: %s (usage: ctx docs changes [--since=<rev>])\n' "$DOCS_VERB" "$dx_a" >&2; return 1 ;;
    esac
  done
  docs_require || return 2
  if ! docs_call has corpus.changelog; then
    printf '%s: the configured storage driver keeps no corpus change log (corpus.changelog); under the files driver the corpus delta comes from git\n' "$DOCS_VERB" >&2
    return 1
  fi
  docs_scratch || return 2
  dx_head=$(docs_head)
  printf 'head=%s\n' "$dx_head" > "$DOCS_SCRATCH/heads"
  if [ -n "$dx_since" ]; then
    if [ "$dx_head" = none ]; then
      printf '%s: --since needs the workspace to be a git repository with a commit\n' "$DOCS_VERB" >&2
      return 1
    fi
    if ! dx_rev=$(git -C "$DOCS_ROOT" rev-parse --verify -q "$dx_since^{commit}" 2>/dev/null); then
      printf '%s: unknown revision: %s\n' "$DOCS_VERB" "$dx_since" >&2
      return 1
    fi
    printf 'head=%s\n' "$dx_rev" >> "$DOCS_SCRATCH/heads"
    git -C "$DOCS_ROOT" rev-list --boundary "$dx_rev..HEAD" 2>/dev/null | sed -e 's/^-//' -e 's/^/head=/' >> "$DOCS_SCRATCH/heads"
  fi
  if ! (unset CTX_DIR; CTX_ROOT=$DOCS_ROOT; export CTX_ROOT; cd "$DOCS_ROOT" && exec "$DOCS_RESOLVER" corpus.changes < "$DOCS_SCRATCH/heads") > "$DOCS_SCRATCH/rows"; then
    return 2
  fi
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

# docs_map: stdin to stdout with every display pair of DOCS_MAP applied (exact substrings,
# the pair file named through the environment)
docs_map() {
  DOCS_MAP_FILE=$DOCS_MAP awk '
    BEGIN {
      f = ENVIRON["DOCS_MAP_FILE"]
      n = 0
      while ((getline l < f) > 0) {
        t = index(l, "\t")
        if (t > 1) { n++; from[n] = substr(l, 1, t - 1); to[n] = substr(l, t + 1) }
      }
      close(f)
    }
    function repl(s, a, b,    out, p) {
      out = ""
      while ((p = index(s, a)) > 0) {
        out = out substr(s, 1, p - 1) b
        s = substr(s, p + length(a))
      }
      return out s
    }
    { s = $0; for (i = 1; i <= n; i++) s = repl(s, from[i], to[i]); print s }'
}

# docs_run <command>...: the command with the display rule applied: straight through when
# no pair is due, else stdout and stderr each mapped; its stdin is the verb's; returns its rc
docs_run() {
  if [ -z "$DOCS_MAP" ] || [ ! -s "$DOCS_MAP" ]; then
    "$@"
    return $?
  fi
  : > "$DOCS_SCRATCH/rc"
  # the rc is taken inside an if, so a caller under set -e (the gate) still records it
  { { if "$@" 2>&1 1>&3 3>&-; then dr_x=0; else dr_x=$?; fi; printf '%s\n' "$dr_x" > "$DOCS_SCRATCH/rc"; } | docs_map >&2 3>&-; } 3>&1 | docs_map
  dr_rc=$(cat "$DOCS_SCRATCH/rc" 2>/dev/null)
  return "${dr_rc:-2}"
}

# docs_exec <command>...: the command over DOCS_PATHS (appended) as the verb's last act. In
# place with nothing to map it execs as the verbs always did (inside the mount for the repo
# and bare forms); otherwise, or when the verb keeps scratch input for the command
# (DOCS_KEEP=1), it runs mapped and the scratch goes on exit.
docs_exec() {
  while IFS= read -r de_p; do
    set -- "$@" "$de_p"
  done < "$DOCS_PATHS"
  if [ "$DOCS_INPLACE" -eq 1 ] && [ ! -s "$DOCS_MAP" ] && [ "${DOCS_KEEP:-0}" -eq 0 ]; then
    de_dir=""
    [ "$DOCS_CD" -eq 1 ] && de_dir=$DOCS_MOUNT
    docs_release
    if [ -n "$de_dir" ]; then
      cd "$de_dir" || exit 2
    fi
    exec "$@"
  fi
  if [ "$DOCS_CD" -eq 1 ]; then
    cd "$DOCS_MOUNT" || exit 2
  fi
  docs_run "$@"
  exit $?
}
