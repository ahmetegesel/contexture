# plant.sh: the record fixtures and reads of the verb suites. Sourced by a suite after it
# sets SANDBOX (the workspace under test, the current folder), RESOLVER (its driver
# resolver), and PLANT_DRIVER (the configured driver's name; posix when unset).
#
# A record a backend can hold is written through the verbs themselves, the same calls on
# every driver: no function moves a record between backends
# (knowledge#MIGRATION_IS_AGENT_JUDGMENT), so the fts5 and service stores hold only what
# the verbs write. Legacy text, the shapes only a hand-written file can hold (a repeated
# slug, a CRLF line, a two-line WHAT, a malformed anchor, a state missing a line, a
# reference to a unit the store lacks), is planted as the posix files of the workspace under
# test and exists on posix alone: rcat, rput, and rappend refuse rc 3 on another driver, so
# a case that needs legacy text runs under posix and says so. rsum reads every driver alike.
#   rcat <unit> <artifact>     the artifact's bytes as the posix store holds them (state,
#                              backlog, knowledge, journal, lane/<lane>/<recipe|journal|report>);
#                              rc 1 when absent
#   rput <unit> <artifact>     the artifact replaced by stdin (the unit folder made when new)
#   rappend <unit> <artifact>  stdin added after the artifact's last byte
#   rsum <unit> [<lane>...]    one checksum of the unit as its read functions answer it
#                              (session.load, task.list all, entry.list, entry.get of every
#                              listed slug, finding.list all, lane.get of each named lane's
#                              recipe, journal, and report), and on posix its artifact files
#                              too: the picture a refused write must leave as it was

PLANT_DRIVER=${PLANT_DRIVER:-posix}

# pl_posix <verb>: rc 0 on the posix driver, else rc 3 with one line naming the rule
pl_posix() {
  [ "$PLANT_DRIVER" = posix ] && return 0
  printf 'plant: %s reads or writes legacy text as posix files; the %s store holds only what the verbs write\n' "$1" "$PLANT_DRIVER" >&2
  return 3
}

# pl_path <unit> <artifact>: the posix file of an artifact
pl_path() {
  case "$2" in
    state|backlog|knowledge|journal) printf '%s/.contexture/sessions/%s/%s.md\n' "$SANDBOX" "$1" "$2" ;;
    lane/*/recipe|lane/*/journal|lane/*/report)
      pp_rest=${2#lane/}
      printf '%s/.contexture/sessions/%s/lanes/%s/%s.md\n' "$SANDBOX" "$1" "${pp_rest%/*}" "${pp_rest##*/}"
      ;;
    *) return 1 ;;
  esac
}

rcat() {
  pl_posix rcat || return 3
  rc_f=$(pl_path "$1" "$2") || return 1
  [ -f "$rc_f" ] || return 1
  cat "$rc_f"
}

rput() {
  pl_posix rput || return 3
  rp_f=$(pl_path "$1" "$2") || return 1
  mkdir -p "$(dirname "$rp_f")"
  cat > "$rp_f"
}

rappend() {
  pl_posix rappend || return 3
  ra_f=$(pl_path "$1" "$2") || return 1
  [ -f "$ra_f" ] || return 1
  cat >> "$ra_f"
}

rsum() {
  rs_u=$1
  shift
  {
    for rs_call in "session.load $rs_u" "task.list $rs_u all" "entry.list $rs_u" "finding.list $rs_u all"; do
      "$RESOLVER" $rs_call < /dev/null 2>&1
      printf 'rc=%s\n' "$?"
    done
    for rs_s in $("$RESOLVER" entry.list "$rs_u" < /dev/null 2>/dev/null | tr ',' '\n' | sed -n 's/^.*"slug":"\([^"]*\)"$/\1/p' | LC_ALL=C sort -u); do
      "$RESOLVER" entry.get "$rs_u" "$rs_s" < /dev/null 2>&1
      printf 'rc=%s\n' "$?"
    done
    for rs_l in "$@"; do
      for rs_a in recipe journal report; do
        "$RESOLVER" lane.get "$rs_u" "$rs_l" "$rs_a" < /dev/null 2>&1
        printf 'rc=%s\n' "$?"
      done
    done
    if [ "$PLANT_DRIVER" = posix ] && [ -d "$SANDBOX/.contexture/sessions/$rs_u" ]; then
      find "$SANDBOX/.contexture/sessions/$rs_u" -type f -name '*.md' | LC_ALL=C sort | while IFS= read -r rs_f; do
        printf '%s\n' "${rs_f#"$SANDBOX"/}"
        cat "$rs_f"
      done
    fi
  } | cksum
}
