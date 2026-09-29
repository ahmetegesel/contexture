# verb.sh: the shared shell of the session and lane verbs (contract 2, docs/the-engine.md,
# The storage contract). A verb sources this file, checks its input shape, calls exactly
# one storage function per record act through the resolver, and renders the answer with
# lib/json.awk (the one flattener) and lib/render.awk (the one renderer). No verb reads
# or writes a session artifact itself: the configured backend is the single store, and
# its record rules (a CLOSED unit, a repeated key, the status moves, the pointer rule)
# are the backend's; a refusal of the backend passes through as its one fixed stderr line
# with its rc.
#
# The wire: argv carries the function and its bounded identifiers; every free-text value
# travels on stdin as payload lines key=value, escaped (backslash, newline, tab, carriage
# return as \\, \n, \t, \r), a list as <key>.count and <key>.1 to <key>.N. Values reach
# awk through the environment, never through awk -v (knowledge#FREE_TEXT_NEVER_THROUGH_AWK_V).
#
# Scratch: one folder under the workspace drawer (.contexture/tmp/rec.<random>), made on
# first use and removed at exit, on an interrupt too.

VB_LIB=$(CDPATH= cd -- "$(dirname -- "${VB_SELF:-$0}")/../../session/lib" 2>/dev/null && pwd)
[ -n "$VB_LIB" ] && [ -f "$VB_LIB/verb.sh" ] || VB_LIB=$(CDPATH= cd -- "$(dirname -- "${VB_SELF:-$0}")/../lib" 2>/dev/null && pwd)
VB_SESSION=$(CDPATH= cd -- "$VB_LIB/.." && pwd)
VB_RESOLVER="$VB_SESSION/scripts/driver-resolver"
VB_JSON="$VB_LIB/json.awk"
VB_RENDER="$VB_LIB/render.awk"
VB_DIR=""
VB_PAY=""
VB_RC=0
VB_NL='
'
VB_CR=$(printf '\r')

vb_cleanup() {
  [ -n "$VB_DIR" ] && rm -rf "$VB_DIR"
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
    mkdir -p .contexture/tmp 2>/dev/null
    VB_DIR=$(mktemp -d .contexture/tmp/rec.XXXXXX 2>/dev/null) || VB_DIR=""
    if [ -z "$VB_DIR" ]; then
      printf 'ERROR: cannot create a scratch folder under .contexture/tmp\n' >&2
      exit 2
    fi
  fi
}

# VB_UTF8_AWK: the awk function utf8_ok(s), true when s is valid UTF-8 (RFC 3629: no
# overlong form, no surrogate, nothing above U+10FFFF); byte values come from a table built
# with sprintf("%c"), so it runs alike on BWK awk, mawk, gawk, and busybox awk under
# LC_ALL=C (every caller sets it: bytes, never the locale's characters); an ASCII value
# takes the fast path, one match against a class of the bytes 1 to 127
VB_UTF8_AWK='
function utf8_ok(s,   n, i, j, c, need, lo, hi) {
  if (s ~ /^[\001-\177]*$/) return 1
  if (!U8_T) { for (i = 1; i < 256; i++) U8_ORD[sprintf("%c", i)] = i; U8_T = 1 }
  n = length(s); i = 1
  while (i <= n) {
    c = U8_ORD[substr(s, i, 1)]
    if (c < 128) { i++; continue }
    if (c >= 194 && c <= 223) { need = 1; lo = 128; hi = 191 }
    else if (c == 224) { need = 2; lo = 160; hi = 191 }
    else if (c >= 225 && c <= 236) { need = 2; lo = 128; hi = 191 }
    else if (c == 237) { need = 2; lo = 128; hi = 159 }
    else if (c == 238 || c == 239) { need = 2; lo = 128; hi = 191 }
    else if (c == 240) { need = 3; lo = 144; hi = 191 }
    else if (c >= 241 && c <= 243) { need = 3; lo = 128; hi = 191 }
    else if (c == 244) { need = 3; lo = 128; hi = 143 }
    else return 0
    if (i + need > n) return 0
    c = U8_ORD[substr(s, i + 1, 1)]
    if (c < lo || c > hi) return 0
    for (j = 2; j <= need; j++) { c = U8_ORD[substr(s, i + j, 1)]; if (c < 128 || c > 191) return 0 }
    i += need + 1
  }
  return 1
}
'

# vb_label: the verb's name in its refusals (the lane verbs as "lane <verb>")
vb_label() {
  case "${VB_SELF:-$0}" in
    */lane/scripts/*) printf 'lane %s' "${0##*/}" ;;
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

# vb_doc_ok <field> <file>: a document (a recipe, a report) holding a NUL byte or bytes that
# are not valid UTF-8 refuses rc 1 naming it, before any driver call (end review item 10);
# the NUL is found by size (tr drops it), so awk never reads one
vb_doc_ok() {
  vd_all=$(wc -c < "$2" | tr -d ' ')
  vd_non=$(tr -d '\000' < "$2" | wc -c | tr -d ' ')
  if [ "$vd_all" != "$vd_non" ]; then
    printf '%s: error: %s holds a NUL byte (ERR_INVALID_ARGUMENT)\n' "$(vb_label)" "$1" >&2
    exit 1
  fi
  LC_ALL=C awk "$VB_UTF8_AWK"'{ if (!utf8_ok($0)) exit 3 }' "$2"
  case $? in
    0) ;;
    3) printf '%s: error: %s is not valid UTF-8 (ERR_INVALID_ARGUMENT)\n' "$(vb_label)" "$1" >&2; exit 1 ;;
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

# vb_call <function> [<argv>...]: one storage function through the resolver, the pending
# payload on stdin; the answer and the stderr land in the scratch folder; VB_RC its rc
vb_call() {
  vb_tmp
  if [ -n "$VB_PAY" ]; then
    "$VB_RESOLVER" "$@" < "$VB_PAY" > "$VB_DIR/ans" 2> "$VB_DIR/err"
    VB_RC=$?
  else
    "$VB_RESOLVER" "$@" < /dev/null > "$VB_DIR/ans" 2> "$VB_DIR/err"
    VB_RC=$?
  fi
  VB_PAY=""
  return "$VB_RC"
}

# vb_call_doc <file> <function> [<argv>...]: a function taking a raw document on stdin
vb_call_doc() {
  vb_tmp
  vd_f=$1
  shift
  "$VB_RESOLVER" "$@" < "$vd_f" > "$VB_DIR/ans" 2> "$VB_DIR/err"
  VB_RC=$?
  VB_PAY=""
  return "$VB_RC"
}

# vb_through: a refused call's stderr passes through and the verb exits with its rc
vb_through() {
  [ -s "$VB_DIR/err" ] && cat "$VB_DIR/err" >&2
  exit "$VB_RC"
}

# vb_ok: the call succeeded, else the refusal passes through
vb_ok() {
  [ "$VB_RC" -eq 0 ] || vb_through
  [ -s "$VB_DIR/err" ] && cat "$VB_DIR/err" >&2
  return 0
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

# vb_ref_ok <label> <ref>: a REF or REFS element names its target in one of the two
# pointer shapes of @record references (end review item 6, Q6 by the human): <target>#<symbol>
# (a # with text on both sides, so ### passes) or a whole target path (holding a / and
# ending in a name, so a root-level file reads ./<file> or <file>#<section>: the human's A17
# decision; a lone /, //, a trailing / as in lanes/, and ./ name no target and refuse: R-REF
# of the second review); one token: no blank, no double quote, and no control character (an
# ASCII control byte counts as a blank, R-REF, and so does a Unicode blank). The control
# check goes through tr, since bash as sh reserves \001 and \177 inside its patterns; the
# Unicode blanks through awk index under LC_ALL=C (bytes, never the locale). New writes
# only: a legacy value already stored reads as it stands.
vb_ref_ok() {
  vr_ok=1
  # the Unicode blanks beyond ASCII (the White_Space set: NEL, NBSP, U+1680, U+2000 to
  # U+200A, U+2028, U+2029, U+202F, U+205F, U+3000) as UTF-8 byte strings, each followed by
  # a |, built by printf so no such byte sits in this file
  vr_ub=$(printf '\302\205|\302\240|\341\232\200|\342\200\200|\342\200\201|\342\200\202|\342\200\203|\342\200\204|\342\200\205|\342\200\206|\342\200\207|\342\200\210|\342\200\211|\342\200\212|\342\200\250|\342\200\251|\342\200\257|\342\201\237|\343\200\200|')
  [ "$(printf '%s' "$2" | LC_ALL=C tr -d '\001-\037\177')" = "$2" ] || vr_ok=0
  [ "$vr_ok" -eq 1 ] && VB_V="$2" VB_B="$vr_ub" LC_ALL=C awk 'BEGIN {
    n = split(ENVIRON["VB_B"], B, "|")
    for (i = 1; i < n; i++) if (index(ENVIRON["VB_V"], B[i])) exit 0
    exit 1
  }' && vr_ok=0
  [ "$vr_ok" -eq 1 ] && case "$2" in
    ""|*[' 	"']*) ;;
    */|.|./) ;;
    ?*'#'?*) return 0 ;;
    */?*) return 0 ;;
  esac
  printf "%s: error: malformed ref '%s': a reference is <target>#<symbol> or a whole target path holding a / and ending in a name (a root-level file as ./<file>), one token without blanks, control characters, or double quotes (ERR_INVALID_ARGUMENT)\n" "$1" "$2" >&2
  exit 1
}
