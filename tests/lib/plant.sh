# plant.sh: fixture planting and artifact reads for the verb suites (D9 of
# lanes/storage-interface-design/report). Sourced by a suite after it sets SANDBOX (the
# workspace under test, the current folder) and RESOLVER (its driver resolver); the
# session module under test (PLANT_SESSION_MOD) supplies the posix driver of a staging
# workspace beside it.
#
# The record of the workspace under test is reached only through its storage functions,
# whatever its driver: a unit is exported with unit.export and imported with unit.import.
# The staging workspace ($SANDBOX/.plant) is a posix store, so the markdown text of any
# unit can be read there and a markdown fixture written there travels into the store
# under test as the neutral dump. So every backend receives the same legacy shapes, and the
# posix driver stays the only writer of markdown.
#   rcat <unit> <artifact>     the artifact's markdown (state, backlog, knowledge, journal,
#                              lane/<lane>/<recipe|journal|report>); rc 1 when absent
#   rput <unit> <artifact>     the artifact replaced by stdin (a unit the store lacks is
#                              created when its state is planted first)
#   rappend <unit> <artifact>  stdin added after the artifact's last byte
#   plant_unit <unit> <folder> the unit replaced by the markdown files of a folder
# The posix-only grammar cases (text a typed store cannot hold) write the posix files of
# the workspace under test directly, as the design names them.

PLANT_WS="$SANDBOX/.plant"
PLANT_SESSION_MOD=${PLANT_SESSION_MOD:-$SANDBOX/.contexture/modules/session}

plant_setup() {
  rm -rf "$PLANT_WS"
  mkdir -p "$PLANT_WS/.contexture/modules" "$PLANT_WS/.contexture/sessions" "$PLANT_WS/.contexture/tmp"
  cp -R "$PLANT_SESSION_MOD" "$PLANT_WS/.contexture/modules/session"
}

# pl_drv <function> [argv]: the staging posix driver, from its own workspace
pl_drv() {
  ( cd "$PLANT_WS" && ./.contexture/modules/session/drivers/posix/driver "$@" )
}

# pl_stage <unit>: the unit of the store under test into the staging workspace; rc 0 when
# the store holds it, 1 when not (the staging folder is then empty)
pl_stage() {
  [ -d "$PLANT_WS/.contexture/modules" ] || plant_setup
  rm -rf "$PLANT_WS/.contexture/sessions/$1"
  if "$RESOLVER" unit.export "$1" < /dev/null > "$PLANT_WS/dump" 2> /dev/null; then
    pl_drv unit.import "$1" < "$PLANT_WS/dump" > /dev/null || return 2
    return 0
  fi
  mkdir -p "$PLANT_WS/.contexture/sessions/$1"
  return 1
}

# pl_path <unit> <artifact>: the staged file of an artifact
pl_path() {
  case "$2" in
    state|backlog|knowledge|journal) printf '%s/.contexture/sessions/%s/%s.md\n' "$PLANT_WS" "$1" "$2" ;;
    lane/*/recipe|lane/*/journal|lane/*/report)
      pp_rest=${2#lane/}
      printf '%s/.contexture/sessions/%s/lanes/%s/%s.md\n' "$PLANT_WS" "$1" "${pp_rest%/*}" "${pp_rest##*/}"
      ;;
    *) return 1 ;;
  esac
}

# pl_back <unit> <held>: the staged unit into the store under test
pl_back() {
  pl_drv unit.export "$1" < /dev/null > "$PLANT_WS/dump2" || { echo "plant: the staged unit $1 does not export (plant its state first)" >&2; return 1; }
  if [ "$2" -eq 0 ]; then
    "$RESOLVER" unit.import "$1" --replace < "$PLANT_WS/dump2" > /dev/null
  else
    "$RESOLVER" unit.import "$1" < "$PLANT_WS/dump2" > /dev/null
  fi
}

rcat() {
  pl_stage "$1" || return 1
  rc_f=$(pl_path "$1" "$2") || return 1
  [ -f "$rc_f" ] || return 1
  cat "$rc_f"
}

rput() {
  pl_stage "$1"
  rp_held=$?
  [ "$rp_held" -le 1 ] || return 2
  rp_f=$(pl_path "$1" "$2") || return 1
  mkdir -p "$(dirname "$rp_f")"
  cat > "$rp_f"
  pl_back "$1" "$rp_held"
}

rappend() {
  { rcat "$1" "$2"; cat; } > "$PLANT_WS.append"
  rput "$1" "$2" < "$PLANT_WS.append"
  ra_rc=$?
  rm -f "$PLANT_WS.append"
  return "$ra_rc"
}

plant_unit() {
  pl_stage "$1"
  pu_held=$?
  [ "$pu_held" -le 1 ] || return 2
  rm -rf "$PLANT_WS/.contexture/sessions/$1"
  mkdir -p "$PLANT_WS/.contexture/sessions/$1"
  cp -R "$2"/. "$PLANT_WS/.contexture/sessions/$1/"
  pl_back "$1" "$pu_held"
}
