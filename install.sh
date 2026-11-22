#!/bin/sh
# contexture fresh-workspace installer (POSIX /bin/sh, git-agnostic)
set -u
LC_ALL=C
export LC_ALL

REPO_URL=${CTX_INSTALL_REPO_URL:-"https://github.com/ahmetegesel/contexture"}
API_URL=${CTX_INSTALL_API_URL:-"https://api.github.com/repos/ahmetegesel/contexture"}

die() {
  rc=$1
  shift
  printf 'install.sh: %s\n' "$*" >&2
  exit "$rc"
}

usage() {
  cat <<'EOF'
usage: install.sh [options]

Fresh-workspace installer for contexture (git-agnostic, POSIX /bin/sh).
Handles fresh installs only; existing workspaces see docs/adoption.md#updating.

options:
  --non-interactive       Do not open /dev/tty; install core plus --plugins only
  --plugins=<list>        Comma-separated catalog plugin names, or 'none'
  --tag=<vX.Y.Z>          Pin an exact release tag (mutually exclusive with --from)
  --from=<path>           Install offline from a local directory or .tar.gz/.tar archive
  --dir=<path>            Target workspace directory (default: .)
  --dry-run               Print the resolved installation plan without writing files
  --help, -h              Print this usage message and exit
EOF
}

non_interactive=0
plugins_given=0
plugins_raw=""
selected_plugins=""
tag_given=0
tag_arg=""
from_given=0
from_arg=""
target_arg="."
dry_run=0

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --non-interactive)
      non_interactive=1
      shift
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --plugins=*)
      plugins_given=1
      plugins_raw=${1#--plugins=}
      shift
      ;;
    --plugins)
      [ $# -ge 2 ] || die 1 "--plugins requires a value"
      plugins_given=1
      plugins_raw=$2
      shift 2
      ;;
    --tag=*)
      tag_given=1
      tag_arg=${1#--tag=}
      shift
      ;;
    --tag)
      [ $# -ge 2 ] || die 1 "--tag requires a value"
      tag_given=1
      tag_arg=$2
      shift 2
      ;;
    --from=*)
      from_given=1
      from_arg=${1#--from=}
      shift
      ;;
    --from)
      [ $# -ge 2 ] || die 1 "--from requires a value"
      from_given=1
      from_arg=$2
      shift 2
      ;;
    --dir=*)
      target_arg=${1#--dir=}
      shift
      ;;
    --dir)
      [ $# -ge 2 ] || die 1 "--dir requires a value"
      target_arg=$2
      shift 2
      ;;
    -*)
      die 1 "unknown option: $1 (run with --help for usage)"
      ;;
    *)
      die 1 "unexpected argument: $1 (run with --help for usage)"
      ;;
  esac
done

validate_tag() {
  vt_val=$1
  case "$vt_val" in
    ""|-*|*/*|*..*|*[!A-Za-z0-9._+-]*)
      die 1 "invalid --tag '$vt_val'"
      ;;
  esac
}

parse_plugins_arg() {
  pa_raw=$1
  [ -n "$pa_raw" ] || die 1 "--plugins requires a non-empty value"
  if [ "$pa_raw" = "none" ]; then
    selected_plugins=""
    return 0
  fi
  if [ "$pa_raw" = "all" ]; then
    die 1 "--plugins=all is not supported (git has no default and storage-fts5 changes the storage driver; list plugins explicitly)"
  fi
  pa_rest=$pa_raw
  pa_out=""
  while :; do
    case "$pa_rest" in
      *,*)
        pa_tok=${pa_rest%%,*}
        pa_rest=${pa_rest#*,}
        pa_more=1
        ;;
      *)
        pa_tok=$pa_rest
        pa_rest=""
        pa_more=0
        ;;
    esac
    case "$pa_tok" in
      ""|.*|*[!A-Za-z0-9._-]*)
        die 1 "invalid plugin name '$pa_tok' in --plugins"
        ;;
    esac
    if [ "$pa_tok" = "none" ] || [ "$pa_tok" = "all" ]; then
      die 1 "invalid plugin name '$pa_tok' in --plugins"
    fi
    case " $pa_out " in
      *" $pa_tok "*) die 1 "duplicate plugin '$pa_tok' in --plugins" ;;
    esac
    pa_out="${pa_out:+$pa_out }$pa_tok"
    [ "$pa_more" -eq 1 ] || break
  done
  selected_plugins=$pa_out
}

if [ "$tag_given" -eq 1 ] && [ "$from_given" -eq 1 ]; then
  die 1 "--tag and --from are mutually exclusive"
fi

if [ "$tag_given" -eq 1 ]; then
  [ -n "$tag_arg" ] || die 1 "--tag requires a non-empty value"
  validate_tag "$tag_arg"
fi

if [ "$from_given" -eq 1 ]; then
  [ -n "$from_arg" ] || die 1 "--from requires a non-empty path"
fi

if [ "$plugins_given" -eq 1 ]; then
  parse_plugins_arg "$plugins_raw"
fi

[ -n "$target_arg" ] || die 1 "--dir requires a non-empty path"
[ -d "$target_arg" ] || die 1 "target directory does not exist: $target_arg"
target_dir=$(CDPATH= cd -- "$target_arg" 2>/dev/null && pwd) || die 2 "cannot enter target directory: $target_arg"
[ -w "$target_dir" ] || die 2 "target directory is not writable: $target_dir"

# Fresh-workspace guard
if [ -e "$target_dir/.contexture/ctx" ] || [ -L "$target_dir/.contexture/ctx" ]; then
  printf 'install.sh: contexture is already installed in %s (.contexture/ctx exists).\n' "$target_dir" >&2
  printf 'install.sh: this installer handles fresh installs only; to update an existing workspace, see docs/adoption.md#updating (%s/blob/main/docs/adoption.md#updating).\n' "$REPO_URL" >&2
  exit 1
fi

if [ -d "$target_dir/AGENTS.md" ]; then
  die 1 "AGENTS.md is a directory in $target_dir; cannot install"
fi

# Determine AGENTS.md disposition before any writes
agents_disp="install"
if [ -L "$target_dir/AGENTS.md" ]; then
  agents_disp="preserve"
elif [ -e "$target_dir/AGENTS.md" ]; then
  [ -f "$target_dir/AGENTS.md" ] || die 1 "AGENTS.md exists in $target_dir and is not a regular file"
  first_line=""
  IFS= read -r first_line < "$target_dir/AGENTS.md" || :
  case "$first_line" in
    "# contexture v"*) agents_disp="replace" ;;
    *) agents_disp="preserve" ;;
  esac
fi

# Resolve --from path to absolute before directory changes
from_kind=""
from_path=""
if [ -n "$from_arg" ]; then
  if [ -d "$from_arg" ]; then
    from_kind="dir"
    from_path=$(CDPATH= cd -- "$from_arg" 2>/dev/null && pwd) || die 2 "cannot enter --from directory: $from_arg"
    [ -f "$from_path/base/.contexture/ctx" ] || die 2 "source directory lacks base/.contexture/ctx: $from_path"
    [ -d "$from_path/plugins" ] || die 2 "source directory lacks plugins/: $from_path"
  elif [ -f "$from_arg" ]; then
    from_kind="archive"
    [ -r "$from_arg" ] || die 2 "archive is not readable: $from_arg"
    from_pdir=$(CDPATH= cd -- "$(dirname -- "$from_arg")" 2>/dev/null && pwd) || die 2 "cannot resolve archive directory: $from_arg"
    from_path="$from_pdir/$(basename -- "$from_arg")"
  else
    die 1 "--from path not found: $from_arg"
  fi
fi

# Dry-run plugin manifest check when --from is a local directory
if [ "$dry_run" -eq 1 ] && [ "$from_kind" = "dir" ] && [ -n "$selected_plugins" ]; then
  for p in $selected_plugins; do
    [ -f "$from_path/plugins/$p/manifest" ] || die 1 "unknown catalog plugin '$p' (not found in $from_path/plugins/$p/manifest)"
  done
fi

dl_tool=""
detect_downloader() {
  if [ -n "$dl_tool" ]; then
    return 0
  fi
  if command -v curl >/dev/null 2>&1; then
    dl_tool="curl"
  elif command -v wget >/dev/null 2>&1; then
    dl_tool="wget"
  else
    die 2 "neither curl nor wget is available; install one or pass --from <path>"
  fi
}

fetch_url() {
  fu_url=$1
  detect_downloader
  if [ "$dl_tool" = "curl" ]; then
    curl -fsSL "$fu_url"
  else
    wget -q -O - "$fu_url"
  fi
}

download_file() {
  df_url=$1
  df_out=$2
  detect_downloader
  if [ "$dl_tool" = "curl" ]; then
    curl -fsSL -o "$df_out" "$df_url"
  else
    wget -q -O "$df_out" "$df_url"
  fi
}

pick_highest_semver() {
  awk '/^v[0-9]+\.[0-9]+\.[0-9]+$/ { print substr($0, 2) }' \
    | sort -t. -k1,1n -k2,2n -k3,3n \
    | awk '{ last = $0 } END { if (last != "") print "v" last }'
}

resolve_latest_tag() {
  detect_downloader
  rlt_tag=""

  # Tier 1: releases/latest redirect
  rlt_eff=""
  if [ "$dl_tool" = "curl" ]; then
    rlt_eff=$(curl -fsSL -o /dev/null -w '%{url_effective}' "$REPO_URL/releases/latest" 2>/dev/null) || rlt_eff=""
  else
    rlt_eff=$(wget --spider -S "$REPO_URL/releases/latest" 2>&1 | awk '/^[ \t]*[Ll]ocation:[ \t]*/ { loc = $2 } END { sub(/\r$/, "", loc); print loc }') || rlt_eff=""
  fi
  case "$rlt_eff" in
    */releases/tag/v[0-9]*.[0-9]*.[0-9]*)
      rlt_cand=${rlt_eff##*/}
      rlt_tag=$(printf '%s\n' "$rlt_cand" | awk '/^v[0-9]+\.[0-9]+\.[0-9]+$/ { print; exit }')
      ;;
  esac
  if [ -n "$rlt_tag" ]; then
    printf '%s\n' "$rlt_tag"
    return 0
  fi

  # Tier 2: GitHub Tags API
  rlt_json=$(fetch_url "$API_URL/tags?per_page=100" 2>/dev/null) || rlt_json=""
  if [ -n "$rlt_json" ]; then
    rlt_tag=$(printf '%s\n' "$rlt_json" | awk '
      {
        s = $0
        while (match(s, /"name"[ \t]*:[ \t]*"v[0-9]+\.[0-9]+\.[0-9]+"/)) {
          m = substr(s, RSTART, RLENGTH)
          sub(/^"name"[ \t]*:[ \t]*"/, "", m)
          sub(/"$/, "", m)
          print m
          s = substr(s, RSTART + RLENGTH)
        }
      }
    ' | pick_highest_semver)
  fi
  if [ -n "$rlt_tag" ]; then
    printf '%s\n' "$rlt_tag"
    return 0
  fi

  # Tier 3: GitHub /tags HTML page
  rlt_html=$(fetch_url "$REPO_URL/tags" 2>/dev/null) || rlt_html=""
  if [ -n "$rlt_html" ]; then
    rlt_tag=$(printf '%s\n' "$rlt_html" | awk '
      {
        s = $0
        while (match(s, /\/releases\/tag\/v[0-9]+\.[0-9]+\.[0-9]+/)) {
          m = substr(s, RSTART + 14, RLENGTH - 14)
          print m
          s = substr(s, RSTART + RLENGTH)
        }
      }
    ' | pick_highest_semver)
  fi
  if [ -n "$rlt_tag" ]; then
    printf '%s\n' "$rlt_tag"
    return 0
  fi

  die 2 "failed to resolve latest release tag; pass --tag vX.Y.Z or --from <path>"
}

read_version_from_file() {
  rv_file=$1
  [ -f "$rv_file" ] || { printf 'unknown\n'; return 0; }
  rv_line=""
  IFS= read -r rv_line < "$rv_file" || :
  case "$rv_line" in
    "# contexture v"*)
      rv_rest=${rv_line#"# contexture "}
      printf '%s\n' "${rv_rest%%:*}"
      ;;
    *)
      printf 'unknown\n'
      ;;
  esac
}

resolved_tag=""
source_desc=""
if [ -n "$from_path" ]; then
  if [ "$from_kind" = "dir" ]; then
    resolved_tag=$(read_version_from_file "$from_path/base/AGENTS.md")
    source_desc="local directory $from_path ($resolved_tag)"
  else
    resolved_tag="archive"
    source_desc="local archive $from_path"
  fi
elif [ -n "$tag_arg" ]; then
  resolved_tag=$tag_arg
  source_desc="release tag $resolved_tag ($REPO_URL/archive/refs/tags/${resolved_tag}.tar.gz)"
else
  resolved_tag=$(resolve_latest_tag)
  source_desc="latest release tag $resolved_tag ($REPO_URL/archive/refs/tags/${resolved_tag}.tar.gz)"
fi

if [ "$dry_run" -eq 1 ]; then
  printf 'dry-run: fresh install plan\n'
  printf '  target: %s\n' "$target_dir"
  printf '  source: %s\n' "$source_desc"
  printf '  drawer: %s/.contexture/ (base payload + catalog at .contexture/plugins/)\n' "$target_dir"
  case "$agents_disp" in
    install) printf '  AGENTS.md: create %s/AGENTS.md\n' "$target_dir" ;;
    replace) printf '  AGENTS.md: replace existing contexture loader at %s/AGENTS.md\n' "$target_dir" ;;
    preserve) printf '  AGENTS.md: preserve existing %s/AGENTS.md; stage loader at .contexture/tmp/AGENTS.loader.md\n' "$target_dir" ;;
  esac
  printf '  compose: run .contexture/ctx compose -> %s/AGENTS.generated.md\n' "$target_dir"
  if [ "$plugins_given" -eq 1 ]; then
    if [ -n "$selected_plugins" ]; then
      printf '  plugins: %s\n' "$selected_plugins"
    else
      printf '  plugins: none (core only)\n'
    fi
  elif [ "$non_interactive" -eq 1 ]; then
    printf '  plugins: none (core only; --non-interactive)\n'
  else
    printf '  plugins: interactive prompt via ctx package catalog (or core only if non-TTY)\n'
  fi
  exit 0
fi

tty_open=0
if [ "$non_interactive" -eq 0 ] && [ "$plugins_given" -eq 0 ]; then
  isp_tty=${CTX_INSTALL_TTY:-/dev/tty}
  if ( : < "$isp_tty" ) 2>/dev/null; then
    tty_open=1
    exec 3<"$isp_tty"
    printf 'This will install contexture in %s (%s).\n' "$target_dir" "$source_desc"
    case "$agents_disp" in
      install)
        printf 'Adds: AGENTS.md (loader), AGENTS.generated.md (composed laws), and .contexture/ (runtime, builtins, plugin catalog).\n'
        ;;
      replace)
        printf 'Updates: AGENTS.md (existing loader), AGENTS.generated.md (composed laws), and adds .contexture/ (runtime, builtins, plugin catalog).\n'
        ;;
      preserve)
        printf 'Preserves existing AGENTS.md untouched (stages loader at .contexture/tmp/AGENTS.loader.md); adds .contexture/ and AGENTS.generated.md.\n'
        ;;
    esac
    printf 'No other project files are modified; optional plugins come next only if you select them.\n'
    while :; do
      printf 'Proceed? [Y/n]: '
      if ! IFS= read -r proceed_ans <&3; then
        exec 3<&-
        tty_open=0
        printf 'Installation cancelled.\n'
        exit 0
      fi
      proceed_ans=$(printf '%s' "$proceed_ans" | awk '{ gsub(/^[ \t]+|[ \t]+$/, ""); print }')
      case "$proceed_ans" in
        ""|y|Y|yes|YES|Yes)
          break
          ;;
        n|N|no|NO|No)
          exec 3<&-
          tty_open=0
          printf 'Installation cancelled.\n'
          exit 0
          ;;
        *)
          printf 'Please enter y or n.\n'
          ;;
      esac
    done
  fi
fi

# Track pre-existing directories so failure cleanup only removes what we created
had_dot_ctx=0
[ -d "$target_dir/.contexture" ] && had_dot_ctx=1
had_tmp=0
[ -d "$target_dir/.contexture/tmp" ] && had_tmp=1
stage_dir=""
installed_committed=0

cleanup() {
  if [ "${tty_open:-0}" -eq 1 ]; then
    exec 3<&- 2>/dev/null || :
    tty_open=0
  fi
  if [ -n "$stage_dir" ] && [ -d "$stage_dir" ]; then
    rm -rf "$stage_dir" 2>/dev/null || :
  fi
  if [ "$installed_committed" -eq 0 ]; then
    if [ "$had_tmp" -eq 0 ] && [ -d "$target_dir/.contexture/tmp" ]; then
      rmdir "$target_dir/.contexture/tmp" 2>/dev/null || :
    fi
    if [ "$had_dot_ctx" -eq 0 ] && [ -d "$target_dir/.contexture" ]; then
      rmdir "$target_dir/.contexture" 2>/dev/null || :
    fi
  fi
}

trap cleanup EXIT
trap 'cleanup; exit 129' HUP
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

mkdir -p "$target_dir/.contexture/tmp" || die 2 "cannot create $target_dir/.contexture/tmp"

if command -v mktemp >/dev/null 2>&1; then
  stage_dir=$(mktemp -d "$target_dir/.contexture/tmp/install.$$.XXXXXX" 2>/dev/null) || stage_dir=""
fi
if [ -z "$stage_dir" ]; then
  si=0
  while [ "$si" -lt 100 ]; do
    scand="$target_dir/.contexture/tmp/install.$$.$si"
    if mkdir "$scand" 2>/dev/null; then
      stage_dir=$scand
      break
    fi
    si=$((si + 1))
  done
fi
[ -n "$stage_dir" ] || die 2 "cannot create staging directory under $target_dir/.contexture/tmp"

src_root=""
if [ "$from_kind" = "dir" ]; then
  src_root=$from_path
else
  archive=""
  if [ "$from_kind" = "archive" ]; then
    archive=$from_path
  else
    archive="$stage_dir/release.tar.gz"
    tarball_url="$REPO_URL/archive/refs/tags/${resolved_tag}.tar.gz"
    download_file "$tarball_url" "$archive" || die 2 "failed to download $tarball_url"
    [ -s "$archive" ] || die 2 "downloaded empty archive from $tarball_url"
  fi
  mkdir -p "$stage_dir/extract" || die 2 "cannot create extract directory"
  if gzip -t "$archive" 2>/dev/null; then
    (umask 022 && gzip -dc "$archive" | tar -xpf - -C "$stage_dir/extract") || die 2 "failed to extract archive: $archive"
  else
    (umask 022 && tar -xpf "$archive" -C "$stage_dir/extract") || die 2 "failed to extract archive: $archive"
  fi
  if [ -f "$stage_dir/extract/base/.contexture/ctx" ]; then
    src_root="$stage_dir/extract"
  else
    match_count=0
    for xd in "$stage_dir/extract"/*; do
      [ -d "$xd" ] || continue
      if [ -f "$xd/base/.contexture/ctx" ]; then
        src_root=$xd
        match_count=$((match_count + 1))
      fi
    done
    [ "$match_count" -eq 1 ] || die 2 "archive lacks valid contexture payload (base/.contexture/ctx)"
  fi
  [ -d "$src_root/plugins" ] || die 2 "archive lacks plugins/ catalog"
fi

[ -f "$src_root/base/AGENTS.md" ] || die 2 "source lacks base/AGENTS.md"
installed_version=$(read_version_from_file "$src_root/base/AGENTS.md")

# Stage payload in .contexture/tmp before landing into .contexture/
mkdir -p "$stage_dir/payload/.contexture" || die 2 "cannot create payload stage"
(umask 022 && cp -Rp "$src_root/base/.contexture/." "$stage_dir/payload/.contexture/") || die 2 "cannot stage base payload"
rm -rf "$stage_dir/payload/.contexture/tmp" "$stage_dir/payload/.contexture/laws/AGENTS.generated.md"
(umask 022 && cp -Rp "$src_root/plugins" "$stage_dir/payload/.contexture/plugins") || die 2 "cannot stage plugin catalog"
for pdir in "$stage_dir/payload/.contexture/plugins"/*; do
  [ -d "$pdir/tests" ] && rm -rf "$pdir/tests"
done

# Move staged entries atomically into target .contexture/
for entry in "$stage_dir/payload/.contexture"/*; do
  [ -e "$entry" ] || continue
  ename=${entry##*/}
  if [ -d "$target_dir/.contexture/$ename" ] && [ -d "$entry" ]; then
    (umask 022 && cp -Rp "$entry/." "$target_dir/.contexture/$ename/") || die 2 "cannot place .contexture/$ename"
    rm -rf "$entry"
  else
    mv "$entry" "$target_dir/.contexture/$ename" || die 2 "cannot place .contexture/$ename"
  fi
done

# Verify executable mode bits survived transport and placement
[ -x "$target_dir/.contexture/ctx" ] || die 2 "executable bit missing on .contexture/ctx after install"
[ -x "$target_dir/.contexture/storage/drivers/posix/driver" ] || die 2 "executable bit missing on posix storage driver after install"
[ -x "$target_dir/.contexture/storage/scripts/driver-resolver" ] || die 2 "executable bit missing on driver-resolver after install"

# Place AGENTS.md or stage loader when a non-contexture AGENTS.md already exists
[ -f "$src_root/base/AGENTS.md" ] || die 2 "source lacks base/AGENTS.md"
case "$agents_disp" in
  install|replace)
    cp -p "$src_root/base/AGENTS.md" "$target_dir/AGENTS.md" || die 2 "cannot write $target_dir/AGENTS.md"
    ;;
  preserve)
    cp -p "$src_root/base/AGENTS.md" "$target_dir/.contexture/tmp/AGENTS.loader.md" || die 2 "cannot stage .contexture/tmp/AGENTS.loader.md"
    ;;
esac

installed_committed=1

run_ctx() {
  (cd "$target_dir" && ./.contexture/ctx "$@" 3<&-)
}

# Compose generated law layer
run_ctx compose || exit $?

# Obtain deterministic catalog list from ctx package catalog --names
catalog_names=$(run_ctx package catalog --names) || exit $?

in_catalog() {
  ic_name=$1
  printf '%s\n' "$catalog_names" | awk -v t="$ic_name" '$0 == t { f = 1; exit } END { exit(f ? 0 : 1) }'
}

# Validate explicit --plugins names before installing any plugin
if [ "$plugins_given" -eq 1 ] && [ -n "$selected_plugins" ]; then
  for p in $selected_plugins; do
    in_catalog "$p" || die 1 "unknown catalog plugin '$p' (run .contexture/ctx package catalog to list available plugins)"
  done
fi

resolve_menu_token() {
  rmt_tok=$1
  case "$rmt_tok" in
    *[!0-9]*|"")
      if in_catalog "$rmt_tok"; then
        printf '%s\n' "$rmt_tok"
        return 0
      fi
      return 1
      ;;
    *)
      rmt_pick=$(printf '%s\n' "$catalog_names" | awk -v idx="$rmt_tok" 'NR == idx { print; exit }')
      if [ -n "$rmt_pick" ]; then
        printf '%s\n' "$rmt_pick"
        return 0
      fi
      return 1
      ;;
  esac
}

interactive_select_plugins() {
  isp_tty=${CTX_INSTALL_TTY:-/dev/tty}
  if [ "$tty_open" -eq 0 ]; then
    if ! ( : < "$isp_tty" ) 2>/dev/null; then
      printf 'install.sh: no interactive terminal; installing core only (pass --non-interactive to silence or --plugins=<list> to install plugins)\n' >&2
      selected_plugins=""
      return 0
    fi
  fi

  if [ -z "$catalog_names" ]; then
    if [ "$tty_open" -eq 1 ]; then
      exec 3<&-
      tty_open=0
    fi
    selected_plugins=""
    return 0
  fi

  printf '\n'
  printf 'Core is ready now: unit memory, subagent lanes, workflow rhythms, key-value store, and command compaction need no install.\n'
  printf 'Optional plugins add project capabilities (docs discipline, TypeScript graph, git rules, test filters, starter rhythms, SQLite search); pick below or press Enter for core only.\n'
  printf '\n'
  run_ctx package catalog || exit $?
  printf '\n'
  printf '%s\n' "$catalog_names" | awk '{ printf "  %d) %s\n", NR, $0 }'
  printf '\n'

  if [ "$tty_open" -eq 0 ]; then
    exec 3<"$isp_tty"
    tty_open=1
  fi
  while :; do
    printf "Select plugins to install (names or numbers separated by commas/spaces, 'info <name>' for details, or Enter for core only): "
    if ! IFS= read -r isp_line <&3; then
      selected_plugins=""
      break
    fi
    isp_trimmed=$(printf '%s' "$isp_line" | awk '{ gsub(/^[ \t]+|[ \t]+$/, ""); print }')
    if [ -z "$isp_trimmed" ] || [ "$isp_trimmed" = "none" ]; then
      selected_plugins=""
      break
    fi

    # Handle 'info <name-or-number>' or '? <name-or-number>'
    isp_first=${isp_trimmed%%[ 	]*}
    if [ "$isp_first" = "info" ] || [ "$isp_first" = "?" ]; then
      isp_arg=$(printf '%s' "${isp_trimmed#"$isp_first"}" | awk '{ gsub(/^[ \t]+|[ \t]+$/, ""); print }')
      if [ -z "$isp_arg" ]; then
        printf 'Usage: info <plugin-name-or-number>\n'
        continue
      fi
      if isp_target=$(resolve_menu_token "$isp_arg"); then
        printf '\n'
        run_ctx package info "$isp_target" || :
        printf '\n'
      else
        printf "Unknown plugin '%s'.\n" "$isp_arg"
      fi
      continue
    fi

    # Parse comma/space-separated selection without pathname glob expansion
    isp_norm=$(printf '%s' "$isp_trimmed" | tr ',' ' ')
    isp_cand=""
    isp_bad=""
    isp_had_f=0
    case $- in *f*) isp_had_f=1 ;; esac
    set -f
    for isp_tok in $isp_norm; do
      if isp_res=$(resolve_menu_token "$isp_tok"); then
        case " $isp_cand " in
          *" $isp_res "*) ;;
          *) isp_cand="${isp_cand:+$isp_cand }$isp_res" ;;
        esac
      else
        isp_bad=$isp_tok
        break
      fi
    done
    [ "$isp_had_f" -eq 1 ] || set +f

    if [ -n "$isp_bad" ]; then
      printf "Unknown plugin selection '%s'; enter names or numbers from the list above.\n" "$isp_bad"
      continue
    fi
    if [ -z "$isp_cand" ]; then
      selected_plugins=""
      break
    fi

    isp_disp=$(printf '%s' "$isp_cand" | awk '{ gsub(/ /, ", "); print }')
    printf 'Install %s? [y/N]: ' "$isp_disp"
    if ! IFS= read -r isp_conf <&3; then
      selected_plugins=""
      break
    fi
    isp_conf=$(printf '%s' "$isp_conf" | awk '{ gsub(/^[ \t]+|[ \t]+$/, ""); print }')
    case "$isp_conf" in
      y|Y|yes|YES|Yes)
        selected_plugins=$isp_cand
        break
        ;;
      *)
        printf 'Selection cancelled.\n'
        ;;
    esac
  done
  exec 3<&-
  tty_open=0
}

if [ "$non_interactive" -eq 0 ] && [ "$plugins_given" -eq 0 ]; then
  interactive_select_plugins
fi

installed_plugins=""
for p in $selected_plugins; do
  if run_ctx package install "$p"; then
    installed_plugins="${installed_plugins:+$installed_plugins }$p"
  else
    inst_rc=$?
    if [ -n "$installed_plugins" ]; then
      printf 'install.sh: failed installing plugin %s (previously installed: %s)\n' "$p" "$installed_plugins" >&2
    else
      printf 'install.sh: failed installing plugin %s\n' "$p" >&2
    fi
    exit "$inst_rc"
  fi
done

printf '\nContexture %s installed in %s\n' "$installed_version" "$target_dir"
printf '  catalog: .contexture/plugins/\n'
printf '  law layer: AGENTS.generated.md (composed)\n'
if [ -n "$installed_plugins" ]; then
  printf '  plugins installed: %s\n' "$installed_plugins"
  case " $installed_plugins " in
    *" storage-fts5 "*)
      printf '  storage-fts5 installed: activate with .contexture/ctx store config set driver fts5\n'
      ;;
  esac
else
  printf '  plugins installed: none (core only; run .contexture/ctx package catalog to inspect)\n'
fi

if [ "$agents_disp" = "preserve" ]; then
  printf '\nNOTICE: existing AGENTS.md was preserved untouched.\n'
  printf '  Contexture loader was staged at .contexture/tmp/AGENTS.loader.md.\n'
  printf '  Onboarding will migrate your existing rules into AGENTS.workspace.md and swap the loader into AGENTS.md;\n'
  printf '  start a fresh agent session once onboarding closes so the new loader boots on turn 1.\n'
fi

printf '\nNext steps:\n'
printf '  1. Prompt your AI agent to finish workspace setup:\n'
printf '     Guided (new to contexture; plain-English walkthrough, one confirmation, closing orientation):\n'
printf '       "Read .contexture/ONBOARDING.md and onboard this workspace in guided mode."\n'
printf '     Fast (already familiar; crisp plan, single confirmation, brief receipt):\n'
printf '       "Read .contexture/ONBOARDING.md and onboard this workspace in familiar mode."\n'
printf '  2. Once onboarding closes, start a fresh chat so your agent boots from AGENTS.md on turn 1.\n'
printf '  3. Inspect or add optional plugins anytime with: .contexture/ctx package catalog\n'
exit 0
