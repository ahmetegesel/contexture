# verb.sh: the shared shell of the unit and lane verbs (contract 3, docs/the-engine.md,
# The descriptor and the handshake). A verb sources this file, checks its input shape, calls
# exactly one function per record act, and renders the answer with the storage core's
# json.awk (the one flattener) and lib/render.awk (the one renderer). No verb reads or writes a record
# artifact itself: the record's 35 operations are the unit module data script's over the
# configured store, and its record rules (a CLOSED unit, a repeated key, the status
# moves) are the module's; capability and storage.health stay the driver's,
# reached through the storage core's resolver. A refusal passes through as its one fixed
# stderr line with its rc.
#
# The wire: argv carries the function and its bounded identifiers; every free-text value
# travels on stdin as payload lines key=value, escaped (backslash, newline, tab, carriage
# return as \\, \n, \t, \r), a list as <key>.count and <key>.1 to <key>.N. Values reach
# awk through the environment, never through awk -v (knowledge#FREE_TEXT_NEVER_THROUGH_AWK_V).
#
# Scratch: ctx names one per-verb root under the drawer and exports CTX_SCRATCH_ROOT; the
# verb's scratch lives there, made on first use and removed at exit, on an interrupt too;
# a root left by a SIGKILLed verb is swept by the next dispatch. A verb run outside ctx
# falls back to a folder of its own under the drawer.

VB_LIB=$(CDPATH= cd -- "$(dirname -- "${VB_SELF:-$0}")/../lib" 2>/dev/null && pwd)
# the storage core's resolver is the one path for capability and storage.health
VB_RESOLVER=""
for vb_rd in "$VB_LIB/../../../storage/scripts/driver-resolver" \
             "${CTX_ROOT:-$PWD}/.contexture/storage/scripts/driver-resolver" \
             "${CTX_ROOT:-$PWD}/base/.contexture/storage/scripts/driver-resolver"; do
  if [ -x "$vb_rd" ]; then VB_RESOLVER=$vb_rd; break; fi
done
# the unit module's data script is the record's call path; the workspace module wins, then
# the base mirror (the module may be staged from base alone)
VB_UNIT_DATA=""
for vb_ud in "$VB_LIB/../scripts/data" \
             "${CTX_ROOT:-$PWD}/.contexture/modules/unit/scripts/data" \
             "${CTX_ROOT:-$PWD}/base/.contexture/modules/unit/scripts/data"; do
  if [ -x "$vb_ud" ]; then VB_UNIT_DATA=$vb_ud; break; fi
done
# the rhythm module's private resolve, run by path (summary-less, so ctx cannot dispatch it)
VB_RHYTHM_RESOLVE=""
for vb_rr in "$VB_LIB/../../rhythm/scripts/resolve" \
             "${CTX_ROOT:-$PWD}/.contexture/modules/rhythm/scripts/resolve" \
             "${CTX_ROOT:-$PWD}/base/.contexture/modules/rhythm/scripts/resolve"; do
  if [ -f "$vb_rr" ]; then VB_RHYTHM_RESOLVE=$vb_rr; break; fi
done
# the storage core's flattener decodes every answer; the core beside the module wins, then
# the workspace drawer, then the base mirror
VB_JSON="$VB_LIB/../../../storage/scripts/json.awk"
for vb_js in "$VB_JSON" \
             "${CTX_ROOT:-$PWD}/.contexture/storage/scripts/json.awk" \
             "${CTX_ROOT:-$PWD}/base/.contexture/storage/scripts/json.awk"; do
  if [ -f "$vb_js" ]; then VB_JSON=$vb_js; break; fi
done
# the storage core's module library carries the shared checks (the UTF-8 check); the core
# beside the module wins, then the workspace drawer, then the base mirror; sourcing it only
# defines functions, so nothing resolves at source time
VB_LIBRARY=""
for vb_lb in "$VB_LIB/../../../storage/scripts/library" \
             "${CTX_ROOT:-$PWD}/.contexture/storage/scripts/library" \
             "${CTX_ROOT:-$PWD}/base/.contexture/storage/scripts/library"; do
  if [ -f "$vb_lb" ]; then VB_LIBRARY=$vb_lb; break; fi
done
[ -z "$VB_LIBRARY" ] || . "$VB_LIBRARY"
VB_RENDER="$VB_LIB/render.awk"
VB_DIR=""
VB_PAY=""
VB_RC=0
VB_NL='
'
VB_CR=$(printf '\r')

vb_cleanup() {
  vc_rc=$?
  if [ -n "$VB_DIR" ]; then
    if [ "$vc_rc" -eq 0 ] && [ -s "$VB_DIR/relay" ]; then
      # a verb run as a child of another verb hands its held warning to the parent's hold
      if [ -n "${VB_RELAY_HOLD:-}" ]; then cat "$VB_DIR/relay" >> "$VB_RELAY_HOLD"; else awk '!seen[$0]++' "$VB_DIR/relay" >&2; fi
    fi
    rm -rf "$VB_DIR"
  fi
  VB_DIR=""
  return 0
}
trap vb_cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# vb_tmp: the verb's scratch folder
vb_tmp() {
  if [ -z "$VB_DIR" ]; then
    if [ -n "${CTX_SCRATCH_ROOT:-}" ]; then
      mkdir -p "$CTX_SCRATCH_ROOT" 2>/dev/null
      [ -d "$CTX_SCRATCH_ROOT" ] && [ -w "$CTX_SCRATCH_ROOT" ] && VB_DIR=$CTX_SCRATCH_ROOT
    fi
    if [ -z "$VB_DIR" ]; then
      mkdir -p .contexture/tmp 2>/dev/null
      VB_DIR=$(mktemp -d .contexture/tmp/rec.XXXXXX 2>/dev/null) || VB_DIR=""
    fi
    if [ -z "$VB_DIR" ]; then
      printf 'ERROR: cannot create a scratch folder under .contexture/tmp\n' >&2
      exit 2
    fi
  fi
}

# VB_UTF8_AWK: the awk function utf8_ok(s), the storage library's UTF-8 check (RFC 3629)
# as awk text, which vb_kv folds into its one staging program
VB_UTF8_AWK=${LIB_UTF8_AWK:-}

# vb_label: the verb's name in its refusals (the lane verbs as "lane <verb>"), read from the
# running script's drawer path, since a lane verb points VB_SELF at this library to find it
vb_label() {
  case "$0" in
    *.contexture/extensions/modules/lane/scripts/*|*.contexture/modules/lane/scripts/*) printf 'lane %s' "${0##*/}" ;;
    *) printf '%s' "${0##*/}" ;;
  esac
}

# vb_kv <key> <value>: one payload line; a value that is not valid UTF-8 refuses rc 1 naming
# its field before any driver call (end review item 10; an argv value never holds a NUL)
vb_kv() {
  vb_tmp
  [ -n "$VB_PAY" ] || { VB_PAY="$VB_DIR/pay"; : > "$VB_PAY"; }
  VB_K="$1" VB_V="$2" LC_ALL=C awk "$VB_UTF8_AWK"'BEGIN {
    s = ENVIRON["VB_V"]
    if (!utf8_ok(s)) exit 3
    n = split(s, P, /\\/)
    o = (n ? P[1] : "")
    for (i = 2; i <= n; i++) o = o "\\" "\\" P[i]
    # a tab and a carriage return are written by split and concatenation too, never by a
    # gsub replacement (the Debian build of busybox awk drops the backslash of such a
    # replacement before a t or an r)
    n = split(o, L, /\t/); o = (n ? L[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "t" L[i]
    n = split(o, L, /\r/); o = (n ? L[1] : ""); for (i = 2; i <= n; i++) o = o "\\" "r" L[i]
    n = split(o, L, "\n")
    r = (n ? L[1] : "")
    for (i = 2; i <= n; i++) r = r "\\" "n" L[i]
    printf "%s=%s\n", ENVIRON["VB_K"], r
  }' >> "$VB_PAY"
  case $? in
    0) ;;
    3) printf '%s: error: %s is not valid UTF-8 (ERR_INVALID_ARGUMENT)\n' "$(vb_label)" "$1" >&2; exit 1 ;;
    *) printf '%s: error: cannot stage the payload field %s\n' "$(vb_label)" "$1" >&2; exit 2 ;;
  esac
}

# vb_doc_ok <field> <file>: a document (a report) holding a NUL byte or bytes that
# are not valid UTF-8 refuses rc 1 naming it, before any driver call (end review item 10);
# the NUL is found by size (tr drops it), so awk never reads one
vb_doc_ok() {
  vd_all=$(wc -c < "$2" | tr -d ' ')
  vd_non=$(tr -d '\000' < "$2" | wc -c | tr -d ' ')
  if [ "$vd_all" != "$vd_non" ]; then
    printf '%s: error: %s holds a NUL byte (ERR_INVALID_ARGUMENT)\n' "$(vb_label)" "$1" >&2
    exit 1
  fi
  lib_utf8_file_ok "$2"
  case $? in
    0) ;;
    1) printf '%s: error: %s is not valid UTF-8 (ERR_INVALID_ARGUMENT)\n' "$(vb_label)" "$1" >&2; exit 1 ;;
    *) printf '%s: error: cannot read %s\n' "$(vb_label)" "$1" >&2; exit 2 ;;
  esac
}

# vb_list <key> [<value>...]: a list payload (<key>.count, then <key>.1 to <key>.N)
vb_list() {
  vl_k=$1
  shift
  vb_kv "$vl_k.count" "$#"
  vl_i=0
  for vl_v in "$@"; do
    vl_i=$((vl_i + 1))
    vb_kv "$vl_k.$vl_i" "$vl_v"
  done
}

# vb_call <function> [<argv>...]: one record function through the unit module data script
# over the store; capability and storage.health stay the driver's and go through the
# resolver. The pending payload is on stdin; the answer and the stderr land in the scratch
# folder; VB_RC its rc
vb_call() {
  vb_tmp
  vb_exec=$VB_UNIT_DATA
  case "${1:-}" in
    capability|storage.health) vb_exec=$VB_RESOLVER ;;
  esac
  if [ -z "$vb_exec" ]; then
    printf '%s: error: the unit module data script is not installed (ERR_DRIVER_NOT_FOUND)\n' "$(vb_label)" >&2
    exit 2
  fi
  if [ -n "$VB_PAY" ]; then
    "$vb_exec" "$@" < "$VB_PAY" > "$VB_DIR/ans" 2> "$VB_DIR/err"
    VB_RC=$?
  else
    "$vb_exec" "$@" < /dev/null > "$VB_DIR/ans" 2> "$VB_DIR/err"
    VB_RC=$?
  fi
  VB_PAY=""
  return "$VB_RC"
}

# vb_call_held <function> [<argv>...]: vb_call of a long data function with no payload, the
# data script run in the background and waited for, so a hangup, an interrupt, or a
# termination reaching the verb runs the verb's trap at once (a shell runs a trap only after
# its foreground child ends); VB_CHILD names the child while it runs, for vb_stop_child
VB_CHILD=""
vb_call_held() {
  vb_tmp
  if [ -z "$VB_UNIT_DATA" ]; then
    printf '%s: error: the unit module data script is not installed (ERR_DRIVER_NOT_FOUND)\n' "$(vb_label)" >&2
    exit 2
  fi
  "$VB_UNIT_DATA" "$@" < /dev/null > "$VB_DIR/ans" 2> "$VB_DIR/err" &
  VB_CHILD=$!
  wait "$VB_CHILD"
  VB_RC=$?
  VB_CHILD=""
  VB_PAY=""
  return "$VB_RC"
}

# vb_tree <pid>: the pid and every descendant, from one ps snapshot
vb_tree() {
  ps -A -o pid= -o ppid= 2>/dev/null | awk -v r="$1" '
    { P[$1] = $2 }
    END {
      S[r] = 1
      do { c = 0; for (p in P) if (!(p in S) && (P[p] in S)) { S[p] = 1; c = 1 } } while (c)
      for (p in S) printf "%s ", p
    }'
}

# vb_stop_child: the held child and every descendant, from one ps snapshot, sent a termination
# (a background child of a shell ignores an interrupt, so a termination is what stops it at
# any signal), then waited for: each one's own trap ends it at its next step, releasing its
# locks; a child still running after 10 s is killed with every descendant then. Silent
vb_stop_child() {
  vsc_c=${VB_CHILD:-${!:-}}
  [ -n "$vsc_c" ] || return 0
  vsc_set=$(vb_tree "$vsc_c")
  # shellcheck disable=SC2086
  [ -z "$vsc_set" ] || kill -TERM $vsc_set 2>/dev/null
  (
    sleep 10
    vsc_late=$(vb_tree "$vsc_c")
    # shellcheck disable=SC2086
    [ -z "$vsc_late" ] || kill -KILL $vsc_late
  ) > /dev/null 2>&1 &
  vsc_t=$!
  wait "$vsc_c" 2>/dev/null
  vsc_set=$(vb_tree "$vsc_t")
  # shellcheck disable=SC2086
  [ -z "$vsc_set" ] || kill -KILL $vsc_set 2>/dev/null
  wait "$vsc_t" 2>/dev/null
  VB_CHILD=""
  return 0
}

# vb_call_doc <file> <function> [<argv>...]: a record function taking a raw document on
# stdin (a recipe, a report), through the unit module data script
vb_call_doc() {
  vb_tmp
  vd_f=$1
  shift
  if [ -z "$VB_UNIT_DATA" ]; then
    printf '%s: error: the unit module data script is not installed (ERR_DRIVER_NOT_FOUND)\n' "$(vb_label)" >&2
    exit 2
  fi
  "$VB_UNIT_DATA" "$@" < "$vd_f" > "$VB_DIR/ans" 2> "$VB_DIR/err"
  VB_RC=$?
  VB_PAY=""
  return "$VB_RC"
}

# vb_through: a refused call's stderr passes through and the verb exits with its rc
vb_through() {
  [ -s "$VB_DIR/err" ] && cat "$VB_DIR/err" >&2
  exit "$VB_RC"
}

# vb_relay: a succeeded call's stderr (the warning of a read served from the store's
# deprecated root) is held in the scratch, and the exit prints it once, after the answer,
# only when the verb ends rc 0, so a refusing run prints its refusal line alone
vb_relay() {
  [ -s "$VB_DIR/err" ] && cat "$VB_DIR/err" >> "$VB_DIR/relay"
  return 0
}

# vb_ok: the call succeeded, its stderr relayed, else the refusal passes through
vb_ok() {
  [ "$VB_RC" -eq 0 ] || vb_through
  vb_relay
}

# vb_err_has <text>: the refusal line of the last call carries the text
vb_err_has() {
  grep -qF -- "$1" "$VB_DIR/err" 2>/dev/null
}

# vb_render <view> [NAME=value ...]: the last answer rendered by the view; the render's rc
vb_render() {
  vr_view=$1
  shift
  # shellcheck disable=SC2086
  awk -f "$VB_JSON" < "$VB_DIR/ans" > "$VB_DIR/flat" || exit 2
  env RV_VIEW="$vr_view" "$@" awk -f "$VB_RENDER" < "$VB_DIR/flat"
}

# vb_json: the last answer unchanged (--json)
vb_json() {
  cat "$VB_DIR/ans"
}

# vb_field <path>: the text of one answer path
vb_field() {
  awk -f "$VB_JSON" < "$VB_DIR/ans" | RV_VIEW=field RV_PATH="$1" awk -f "$VB_RENDER"
}

vb_slug_ok() {
  case "$1" in
    ""|[!A-Za-z0-9]*|*[!A-Za-z0-9_-]*) return 1 ;;
  esac
  return 0
}

vb_has_nl() {
  case "$1" in *"$VB_NL"*) return 0 ;; esac
  return 1
}

vb_has_cr() {
  case "$1" in *"$VB_CR"*) return 0 ;; esac
  return 1
}

# vb_refuse_cr <value>...: the dialect is LF, a carriage return refuses before any call
vb_refuse_cr() {
  for vc_v in "$@"; do
    if vb_has_cr "$vc_v"; then
      printf 'ERROR: embedded carriage return in a field value (the dialect is LF)\n' >&2
      exit 1
    fi
  done
}

# vb_refuse_nl <field> <value> [<field> <value>...]: a one-line field takes no newline
vb_refuse_nl() {
  while [ $# -ge 2 ]; do
    if vb_has_nl "$2"; then
      printf 'ERROR: embedded newline in %s (one line)\n' "$1" >&2
      exit 1
    fi
    shift 2
  done
}

# vb_unknown <label> <argument>: an unknown flag or an extra argument refuses (D26)
vb_unknown() {
  case "$2" in
    -*) printf "%s: error: unknown option '%s' (ERR_INVALID_ARGUMENT)\n" "$1" "$2" >&2 ;;
    *) printf "%s: error: unexpected argument '%s' (ERR_INVALID_ARGUMENT)\n" "$1" "$2" >&2 ;;
  esac
  exit 1
}

# vb_refs_split <value>: the elements of a REFS value, one per line: brackets dropped,
# commas and blanks separate
vb_refs_split() {
  printf '%s\n' "$1" | awk '{
    s = $0
    sub(/^[ \t]*\[/, "", s)
    sub(/\][ \t]*$/, "", s)
    gsub(/,/, " ", s)
    n = split(s, P, /[ \t]+/)
    for (i = 1; i <= n; i++) if (P[i] != "") print P[i]
  }'
}

# vb_hook <point> [<NAME> <value>...]: the point's hooks through ctx, when ctx is at hand
vb_hook() {
  [ -n "${CTX_BIN:-}" ] && [ -x "${CTX_BIN:-}" ] || return 0
  "$CTX_BIN" _hooks "$@"
}

vb_today() { date +%Y-%m-%d; }
vb_epoch() { date +%s 2>/dev/null || printf '%s\n' "$$"; }

# The leftovers nudge (ctx unit list): what the record's storage holds beyond its documents,
# measured by the storage layer's read only probe (store_leftovers, the unit namespace) at
# most once per period, the local calendar day, through one stamp in the drawer's scratch:
# <date> <items> <bytes> after a probe, <date> unknown when the probe refused or answered
# nothing countable, <date> probing <pid> while a listing probes, <date> sweeping <pid> while
# ctx unit migrate --sweep runs (it writes the mark with its own pid before its sweep and
# removes the stamp after it, a stop by a signal included, so no probe runs during a sweep
# and the next listing measures again). A sweeping mark holds the probe back only while its
# pid lives, whatever its date, so a mark a killed sweep left reads as no mark; any other
# stamp naming today holds it back. The stamp is claimed before the probe, and a drawer that
# cannot hold it probes nothing, so the throttle always holds; the count is written, and the
# nudge printed, only while the stamp still reads the listing's own probing marker, so a
# sweep's mark or clear, or another listing's claim, made during the probe stands. The nudge
# is one line naming no path, held in the relay, so it prints once after the answer and only
# when the verb ends rc 0.
vb_leftovers_stamp() { printf '%s/.contexture/tmp/unit-leftovers.stamp\n' "$(store_lib_root)"; }

# vb_stamp_put <stamp> <line>: the stamp written whole through a temp file beside it; rc 1,
# silent, when the drawer cannot hold it (an entry at the stamp's place that is no regular
# file among them, which a rename would only move the temp file into)
vb_stamp_put() {
  if [ -e "$1" ] || [ -h "$1" ]; then
    [ -f "$1" ] && [ ! -h "$1" ] || return 1
  fi
  vsp_d=${1%/*}
  mkdir -p "$vsp_d" 2>/dev/null
  vsp_t="$1.$$"
  if { printf '%s\n' "$2" > "$vsp_t"; } 2>/dev/null && mv -f "$vsp_t" "$1" 2>/dev/null; then
    return 0
  fi
  rm -f "$vsp_t" 2>/dev/null
  return 1
}

# vb_leftovers_mark: the sweep's mark (today sweeping, then the verb's pid), best effort and
# silent
vb_leftovers_mark() {
  [ -n "$VB_LIBRARY" ] || return 0
  vb_stamp_put "$(vb_leftovers_stamp)" "$(vb_today) sweeping $$" || :
  return 0
}

# vb_leftovers_clear: the stamp removed after a sweep, so the next listing measures again
vb_leftovers_clear() {
  [ -n "$VB_LIBRARY" ] || return 0
  rm -f "$(vb_leftovers_stamp)" 2>/dev/null
  return 0
}

# vb_leftovers_nudge: the throttled measure; when the probe of this period finds content
# beyond the documents (every kind of both roots, the keys outside the document rules among
# them, summed with their bytes), the nudge line joins the relay
vb_leftovers_nudge() {
  [ -n "$VB_LIBRARY" ] || return 0
  vln_s=$(vb_leftovers_stamp)
  vln_today=$(vb_today)
  vln_last=""
  vln_rest=""
  if [ -f "$vln_s" ]; then
    { IFS=' ' read -r vln_last vln_rest < "$vln_s"; } 2>/dev/null || :
  fi
  case "$vln_rest" in
    sweeping|sweeping\ *)
      # a sweep holds the probe back while its verb lives; a dead or missing pid is no mark
      vln_pid=${vln_rest#sweeping}
      vln_pid=${vln_pid# }
      case "$vln_pid" in
        ""|*[!0-9]*) ;;
        *) kill -0 "$vln_pid" 2>/dev/null && return 0 ;;
      esac
      ;;
    *) [ "$vln_last" = "$vln_today" ] && return 0 ;;
  esac
  vln_claim="$vln_today probing $$"
  vb_stamp_put "$vln_s" "$vln_claim" || return 0
  vb_tmp
  vln_n=""
  if store_leftovers < /dev/null > "$VB_DIR/leftovers.json" 2> /dev/null \
    && LC_ALL=C awk -f "$VB_JSON" < "$VB_DIR/leftovers.json" > "$VB_DIR/leftovers.flat" 2> /dev/null; then
    vln_n=$(LC_ALL=C awk "$STORE_KINDS_AWK"'
      BEGIN { kinds_init() }
      { ld($0) }
      END {
        split("root fallback", R, " ")
        for (j = 1; j <= 2; j++) {
          if (V[R[j] ".state"] != "walked") continue
          w++
          for (i = 1; i <= NK; i++) { n += V[R[j] ".kinds." KIND[i] ".count"] + 0; b += V[R[j] ".kinds." KIND[i] ".bytes"] + 0 }
        }
        if (w) printf "%.0f %.0f\n", n, b
      }' "$VB_DIR/leftovers.flat" 2> /dev/null)
  fi
  rm -f "$VB_DIR/leftovers.json" "$VB_DIR/leftovers.flat" 2> /dev/null
  # the measure lands only over the listing's own claim: a sweep's mark or clear, or another
  # listing's claim, made during the probe stands, and this listing prints nothing
  vln_now=""
  [ -f "$vln_s" ] && vln_now=$(sed -n '1p' "$vln_s" 2> /dev/null)
  [ "$vln_now" = "$vln_claim" ] || return 0
  case "$vln_n" in
    [0-9]*" "[0-9]*) ;;
    *) vb_stamp_put "$vln_s" "$vln_today unknown" || :; return 0 ;;
  esac
  vb_stamp_put "$vln_s" "$vln_today $vln_n" || :
  vln_items=${vln_n% *}
  vln_bytes=${vln_n#* }
  [ "$vln_items" -gt 0 ] 2> /dev/null || return 0
  if [ "$vln_items" -eq 1 ]; then vln_w=item; else vln_w=items; fi
  printf "NUDGE: the record's storage holds %s %s (%s bytes) beyond its documents; the human's word comes first: tell them, show them the dry run ctx unit migrate --sweep --dry-run --all, and sweep only on their word, moving the leftovers into a backup or deleting them (--delete)\n" \
    "$vln_items" "$vln_w" "$vln_bytes" >> "$VB_DIR/relay"
}

# vb_verb_help <module label> <script path>: the verb's help table, as ctx <module> help
# <verb> prints it (the header's summary, usage, and help lines)
vb_verb_help() {
  vh_f=$2
  vh_v=${vh_f##*/}
  printf 'ctx %s %s: %s\n' "$1" "$vh_v" "$(sed -n 's/^# summary: //p' "$vh_f" | head -n 1 | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  vh_u=$(sed -n 's/^# usage: //p' "$vh_f" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -n "$vh_u" ]; then
    printf '\nusage:\n'
    printf '%s\n' "$vh_u" | while IFS= read -r vh_l; do [ -n "$vh_l" ] && printf '  %s\n' "$vh_l"; done
  fi
  vh_h=$(sed -n 's/^# help: //p' "$vh_f" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -n "$vh_h" ]; then
    printf '\nhelp:\n'
    printf '%s\n' "$vh_h" | while IFS= read -r vh_l; do [ -n "$vh_l" ] && printf '  %s\n' "$vh_l"; done
  fi
  return 0
}

# vb_rhythm_ok <rhythm>: a RHYTHM value is <name> <N> <GATE>, a step and its gate of the named
# rhythm as the rhythm module's resolve answers it, the rhythm's @rhythm line naming its file:
# the one rule of every verb taking a RHYTHM value; a refusal is one stderr line, rc 1. On
# success VB_RHYTHM_LINE holds the next gate line a stamped write prints
vb_rhythm_fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

vb_rhythm_ok() {
  vy_r=$1
  set -f
  # shellcheck disable=SC2086
  set -- $vy_r
  set +f
  [ $# -eq 3 ] || vb_rhythm_fail "ERROR: RHYTHM malformed: $vy_r (the shape: <name> <N> <GATE>)"
  vy_name=$1; vy_step=$2; vy_gate=$3
  vb_slug_ok "$vy_name" || vb_rhythm_fail "ERROR: RHYTHM name malformed: $vy_name"
  case "$vy_step" in ""|*[!0-9]*) vb_rhythm_fail "ERROR: RHYTHM step malformed: $vy_step" ;; esac
  [ "$vy_step" -ge 1 ] || vb_rhythm_fail "ERROR: RHYTHM step malformed: $vy_step"
  printf '%s\n' "$vy_gate" | grep -Eq '^[A-Z][A-Z_+]*$' || vb_rhythm_fail "ERROR: RHYTHM gate malformed: $vy_gate"
  vy_missing="ERROR: no such rhythm: $vy_name (ctx rhythm list names them)"
  [ -n "$VB_RHYTHM_RESOLVE" ] || vb_rhythm_fail "$vy_missing"
  vy_ans=$(sh "$VB_RHYTHM_RESOLVE" "$vy_name" < /dev/null 2>/dev/null) || vb_rhythm_fail "$vy_missing"
  vy_out=$(printf '%s\n' "$vy_ans" | RS_NAME=$vy_name RS_STEP=$vy_step RS_GATE=$vy_gate awk -F '	' '
    $1 == "declared" { d = substr($0, length($1) + 2) }
    $1 == "step" { n++; K[n] = $2; G[n] = $3; o = $4; for (j = 5; j <= NF; j++) o = o "\t" $j; O[n] = o }
    END {
      if (d != ENVIRON["RS_NAME"]) { printf "declares\t%s\n", d; exit }
      for (i = 1; i <= n; i++) if (K[i] + 0 == ENVIRON["RS_STEP"] + 0) break
      if (i > n) { print "missing"; exit }
      if (G[i] != ENVIRON["RS_GATE"]) { printf "reads\t%s\n", G[i]; exit }
      if (i == n) { printf "line\trhythm: %s at %s %s, its last gate\n", ENVIRON["RS_NAME"], ENVIRON["RS_STEP"], G[i]; exit }
      printf "line\trhythm: %s at %s %s; next gate: %s %s", ENVIRON["RS_NAME"], ENVIRON["RS_STEP"], G[i], K[i + 1], G[i + 1]
      if (O[i + 1] != "") printf ": %s", O[i + 1]
      printf "\n"
    }')
  case "$vy_out" in
    declares*) vb_rhythm_fail "ERROR: RHYTHM $vy_name declares @rhythm ${vy_out#declares	}; a rhythm's file name and its @rhythm line must agree" ;;
    missing) vb_rhythm_fail "ERROR: RHYTHM step $vy_step not in $vy_name" ;;
    reads*) vb_rhythm_fail "ERROR: RHYTHM step $vy_step of $vy_name reads ${vy_out#reads	}, not $vy_gate" ;;
  esac
  VB_RHYTHM_LINE=${vy_out#line	}
  return 0
}

# vb_rhythm_state <unit> [<slug> <stamp>]: the rhythm in force line, as ctx rhythm current prints
# it, through the rhythm module's resolve; nothing when the module is absent
vb_rhythm_state() {
  [ -n "$VB_RHYTHM_RESOLVE" ] || return 0
  sh "$VB_RHYTHM_RESOLVE" --state "$@" < /dev/null
}

# vb_unit <label> <unit>: the unit slug shape (B1), before any call
vb_unit() {
  vb_slug_ok "$2" && return 0
  printf "%s: error: malformed unit '%s' (ERR_INVALID_ARGUMENT)\n" "$1" "$2" >&2
  exit 1
}

# vb_lane <label> <lane>: the lane slug shape (B4)
vb_lane() {
  vb_slug_ok "$2" && return 0
  printf "%s: error: malformed lane '%s' (ERR_INVALID_ARGUMENT)\n" "$1" "$2" >&2
  exit 1
}

# vb_ref_ok <label> <ref> [<unit>]: a REF or REFS element is a full address, <owner>#<path>
# (@record references): a retired short or legacy form (journal#, knowledge#, backlog#,
# lane#, task#, finding#, entry#, a lanes/ path, a bare whole path, IDEAS.md) refuses naming
# its full form, the form ctx unit migrate writes for the unit, and every other value passes
# the storage library's one full address shape check (lib_ref_ok). Whether the owner is
# installed and the target exists is vb_refs_exist's, before any lock. A value copied with its
# quotes from a view's REF line is named as given, its suggestion computed without them.
vb_ref_ok() {
  vr_v=$2
  case "$vr_v" in '"'?*'"') vr_v=${vr_v#\"}; vr_v=${vr_v%\"} ;; esac
  case "$vr_v" in
    '~/'*)
      printf "%s: error: malformed ref '%s': a compressed view form; a reference is a full address <owner>#<path>; write unit#%s/%s (ERR_INVALID_ARGUMENT)\n" "$1" "$(store_lib_escape "$2")" "${3:-<unit>}" "${vr_v#\~/}" >&2
      exit 1 ;;
  esac
  vr_full=$(vb_ref_full "$vr_v" "${3:-<unit>}")
  if [ -n "$vr_full" ]; then
    printf "%s: error: malformed ref '%s': a reference is a full address <owner>#<path>; write %s (ERR_INVALID_ARGUMENT)\n" "$1" "$(store_lib_escape "$2")" "$vr_full" >&2
    exit 1
  fi
  lib_ref_ok "$1" "$2" || exit 1
}

# vb_ref_full <ref> <unit>: the full address ctx unit migrate writes for a retired form
# (lib/migrate.awk's class rules, the unit the writing one), printed; nothing for a value no
# class rewrites. The owners journal, knowledge, backlog, lane, task, finding, and entry are
# the retired short owners: a value under one that no rule rewrites (a placeholder) names
# the unit# form in general. A unit given as <unit> (a caller with no unit, refs-to) is
# rewritten under a stand in no unit slug can be, then named <unit> in the answer
vb_ref_full() {
  vf_repos=""
  case "$1" in
    docs/*|./docs/*) [ -n "${CTX_BIN:-}" ] && vf_repos=$("$CTX_BIN" docs query --index < /dev/null 2>/dev/null | awk '$1 != "index" && NF > 1 && !s[$1]++ { printf "%s ", $1 }') ;;
  esac
  vf_u=$2
  [ "$vf_u" = '<unit>' ] && vf_u=.unit.
  vf_out=$(MG_MODE=suggest MG_UNIT=$vf_u MG_TOKEN=$1 MG_REPOS=$vf_repos LC_ALL=C awk -f "$VB_LIB/migrate.awk" < /dev/null 2>/dev/null)
  case "$vf_out" in
    rewritten*)
      vf_out=${vf_out#rewritten	}
      case "$vf_out" in "unit#.unit./"*) vf_out="unit#<unit>/${vf_out#unit#.unit./}" ;; esac
      printf '%s\n' "$vf_out"
      return 0 ;;
  esac
  case "$1" in
    journal#*|knowledge#*|backlog#*|lane#*|task#*|finding#*|entry#*) printf 'unit#%s/<entry|task|finding|lane>/<id>\n' "$2" ;;
  esac
}

# vb_owner <ctx> <root> <owner>: prints has (the owner answers get), noget (an installed
# module with no get verb), or none (no module of that name). A name the engine reserves never
# reaches a module's dispatch (ctx run help get would run a command), so it is classed by the
# engine's readers alone: a reserved builtin as noget, any other reserved name as none
vb_owner() {
  if (cd "$2" && "$1" _reserved "$3" < /dev/null > /dev/null 2>&1); then
    if (cd "$2" && "$1" _builtin "$3" < /dev/null > /dev/null 2>&1); then printf 'noget'; else printf 'none'; fi
  elif (cd "$2" && "$1" "$3" help get < /dev/null > /dev/null 2>&1); then
    printf 'has'
  elif (cd "$2" && "$1" "$3" help < /dev/null > /dev/null 2>&1); then
    printf 'noget'
  else
    printf 'none'
  fi
}

# vb_path_inside <path>: whether a file path lies inside the workspace, printing in or out: an
# absolute path inside it starts with the workspace root (CTX_ROOT, else the working folder)
# plus a slash, a relative one never climbs above the root (each .. a step up, each other
# segment but . and an empty one a step down). The one rule of a file# address's place: the
# write check (vb_ref_state: inside, the path must exist; outside, the shape alone counts) and
# ctx unit migrate's forward (mg_new_inside: a file# new prefix outside is refused) both ask it
vb_path_inside() {
  VE_P=$1 VE_R=${CTX_ROOT:-$PWD} awk 'BEGIN {
    p = ENVIRON["VE_P"]; r = ENVIRON["VE_R"]
    if (substr(p, 1, 1) == "/") { if (index(p "/", r "/") != 1) { print "out"; exit } p = substr(p, length(r) + 2) }
    n = split(p, S, /\//); d = 0
    for (i = 1; i <= n; i++) { if (S[i] == "..") { d--; if (d < 0) { print "out"; exit } } else if (S[i] != "." && S[i] != "") d++ }
    print "in"
  }' < /dev/null
}

# vb_ref_state <ref>: whether a full address names something that exists, answered in
# VB_STATE: ok, missing (the target is not found), none (the owner is not installed), or
# noget (an installed owner with no get verb). A file# path is the core's (inside the
# workspace, by vb_path_inside, it must exist, relative to the workspace root or absolute;
# outside it the shape alone is checked; the symbol after a further hash never), every other
# owner answers through its own ctx <owner> get <path>, the path everything after the first
# hash, each owner probed once per verb run (vb_owner); a path starting with a dash names no
# target, since get would read it as an option, so it reads missing before any get. The write
# check (vb_refs_exist) and the address forward of ctx unit migrate both ask it
VB_OWN_HAVE=" "
VB_OWN_NOGET=" "
VB_OWN_NONE=" "
vb_ref_state() {
  vs_root=${CTX_ROOT:-$PWD}
  vs_ctx=${CTX_BIN:-$VB_LIB/../../../ctx}
  vs_o=${1%%#*}
  vs_p=${1#*#}
  VB_STATE=missing
  if [ "$vs_o" = file ]; then
    vs_f=${vs_p%%#*}
    vs_in=$(vb_path_inside "$vs_f")
    [ "$vs_in" = out ] && { VB_STATE=ok; return 0; }
    case "$vs_f" in /*) vs_t=$vs_f ;; *) vs_t="$vs_root/$vs_f" ;; esac
    [ -e "$vs_t" ] && VB_STATE=ok
    return 0
  fi
  case "$VB_OWN_HAVE$VB_OWN_NOGET$VB_OWN_NONE" in
    *" $vs_o "*) ;;
    *)
      case $(vb_owner "$vs_ctx" "$vs_root" "$vs_o") in
        has) VB_OWN_HAVE="$VB_OWN_HAVE$vs_o " ;;
        noget) VB_OWN_NOGET="$VB_OWN_NOGET$vs_o " ;;
        *) VB_OWN_NONE="$VB_OWN_NONE$vs_o " ;;
      esac
      ;;
  esac
  case "$VB_OWN_NONE" in *" $vs_o "*) VB_STATE=none; return 0 ;; esac
  case "$VB_OWN_NOGET" in *" $vs_o "*) VB_STATE=noget; return 0 ;; esac
  case "$vs_p" in
    -*) ;;
    *) (cd "$vs_root" && "$vs_ctx" "$vs_o" get "$vs_p" < /dev/null > /dev/null 2>&1) && VB_STATE=ok ;;
  esac
  return 0
}

# vb_refs_exist <label> <ref>...: each full address names something that exists, checked
# before any lock through vb_ref_state, a ref given twice checked once. A miss refuses rc 1
# naming the ref (ERR_ENTITY_NOT_FOUND: target not found, owner not installed, or owner has
# no get verb), nothing written
vb_refs_exist() {
  ve_label=$1
  shift
  ve_seen=" "
  for ve_r in "$@"; do
    case "$ve_seen" in *" $ve_r "*) continue ;; esac
    ve_seen="$ve_seen$ve_r "
    vb_ref_state "$ve_r"
    case "$VB_STATE" in
      ok) continue ;;
      none) printf "%s: error: ref '%s': owner '%s' is not installed (ERR_ENTITY_NOT_FOUND)\n" "$ve_label" "$ve_r" "${ve_r%%#*}" >&2 ;;
      noget) printf "%s: error: ref '%s': owner '%s' has no get verb (ERR_ENTITY_NOT_FOUND)\n" "$ve_label" "$ve_r" "${ve_r%%#*}" >&2 ;;
      *) printf "%s: error: ref '%s': target not found (ERR_ENTITY_NOT_FOUND)\n" "$ve_label" "$ve_r" >&2 ;;
    esac
    exit 1
  done
  return 0
}
