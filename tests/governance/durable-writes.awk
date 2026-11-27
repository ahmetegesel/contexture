# durable-writes.awk: the durable write census, run by durable-writes.test.ts over the walked
# files with the census table in CENSUS_TABLE and the repository root in CENSUS_ROOT (each file
# keyed by its path below it); CENSUS_DEBUG set prints every judged line and each proven name's
# first assignment. Every line that writes outside the store lands in scratch or stands on the
# table's allow list under its class.
#
# It reads a shell file as logical units (backslash continuations, open quotes, substitutions,
# and here-document bodies joined or skipped), a .awk file and every single quoted text of a
# shell file as awk, and a .ts file as TypeScript; comment lines are skipped. A write primitive:
#   shell: a redirect (>, >>, >|, <>, &>) into anything but a null, std, tty, or fd device or a
#     descriptor dup; at a command position (after any assignment words and command, env, exec,
#     nohup, time, or xargs) mkdir, mv, cp, ln, tee, touch, install, dd, mktemp, rm, rmdir,
#     chmod, sed -i, tar extraction or creation, gzip or gunzip, curl -o or -O, wget, sqlite3
#     or a sqlite binary variable on a database other than :memory:, the library calls that
#     write a caller's file (store_get_into, fields_apply, fields_own, fields_put, fields_set,
#     fields_get), and a call of a function the table names as writing an operand, each with
#     its destination operands;
#   awk: a print or printf redirect, and a print or printf pipe or a system() whose command text
#     writes (its literal text read by the shell rules, a command held in a variable read as a
#     destination of its own);
#   TypeScript: an fs write, rename, copy, or remove call, a database open, and a sqlite3 run.
# A destination is scratch when it roots at the per verb scratch root (CTX_SCRATCH_ROOT), the
# drawer's scratch folder (.contexture/tmp, or $CTX_DIR/tmp), a mktemp of such a template, the
# absolute form of such a path (cd and pwd), or a name the table gives its file. A scratch
# variable is judged where it roots a destination: every assignment of it in that scope (the
# shell file, or the one awk program) is a judged line, rooted at scratch the same way (a for
# loop over scratch words, a ${NAME:=...} default, a function's printed value, an awk -v or
# ENVIRON value included; a read is never proven), else on its exact listed line of the system
# temp fallback; an assignment that fails is a remainder no listing absolves. A judged line is
# scratch when every destination and assignment on it is scratch, listed when the table lists
# its exact text under its file, and a remainder otherwise.
#
# The table: '#' comments and blank lines skipped; every other line holds four tab separated
# fields, the kind, the file, a subject, and the rest:
#   scratch  <file> <NAME> <reason>      a scratch variable of the file, every assignment judged
#   from     <file> <NAME> <source>      a variable the file takes from the sourced file <source>,
#                                        where it must be a scratch variable proven by assignment
#   operand  <file> <F:N> <reason>       function F writes into its operand N (1 to 9, or @ for
#                                        every operand): inside F, $N is scratch, and every call
#                                        of F in every walked file judges that operand
#   bound    <file> <N|NAME|F:NAME> <reason>   a script's own operand N, or a variable (inside F
#                                        only, with F:) holding a path its caller names, which
#                                        the line reader cannot follow: taken on its reason
#   <class>  <file> <reason> <the line as written>   an allow list entry
# with the classes store, config, laws, overlay, backups, graph, payload, and tmp-fallback.
#
# Prints every REMAINDER line, every DEAD entry (a listed line or a name the census never met),
# every UNPROVEN name (a scratch variable with no assignment in a scope it roots, or a from
# entry whose source does not prove it), the listed count per class, the name counts, and one
# summary:
#   census: files F flagged N = scratch S + listed L + remainder R
# exit 0 only when R is 0, nothing is dead or unproven, N equals S + L + R, and N is not 0.
BEGIN {
  CLASSES = " store config laws overlay backups graph payload tmp-fallback "
  CMDS = " mkdir mv cp ln tee touch install dd mktemp rm rmdir chmod sed tar gzip gunzip curl wget sqlite3 store_get_into fields_apply fields_own fields_put fields_set fields_get "
  PREFIXES = " command env exec nohup time xargs "
  DEBUG = ENVIRON["CENSUS_DEBUG"]
  ROOT = ENVIRON["CENSUS_ROOT"]
  table(ENVIRON["CENSUS_TABLE"])
}

function table(f,   l, t, kind, file, subj, rest, n, ok, parts) {
  if (f == "") { bad = 1; print "durable-writes.awk: CENSUS_TABLE names no table" > "/dev/stderr"; return }
  while ((getline l < f) > 0) {
    n++
    if (l ~ /^#/ || l == "") continue
    t = index(l, "\t"); kind = substr(l, 1, t - 1); rest = substr(l, t + 1)
    t = index(rest, "\t"); file = substr(rest, 1, t - 1); rest = substr(rest, t + 1)
    t = index(rest, "\t"); subj = substr(rest, 1, t - 1); rest = substr(rest, t + 1)
    if (kind == "" || file == "" || subj == "" || rest == "" || t < 2) {
      bad = 1; printf "durable-writes.awk: malformed table line %d: %s\n", n, l > "/dev/stderr"; continue
    }
    ok = 1
    if (kind == "scratch" && subj ~ /^([A-Za-z_][A-Za-z0-9_]*:)?[A-Za-z_][A-Za-z0-9_]*$/) { SV[file SUBSEP subj] = 1; SVN[file] = SVN[file] " " subj }
    else if (kind == "from" && subj ~ /^[A-Za-z_][A-Za-z0-9_]*$/) {
      FROM[file SUBSEP subj] = rest
      t = split(rest, parts, / /)
      while (t > 0) { if (parts[t] != "") FROMSRC[parts[t] SUBSEP subj] = 1; t-- }
    }
    else if (kind == "operand" && subj ~ /^[A-Za-z_][A-Za-z0-9_]*:[1-9@]$/) {
      OP[file SUBSEP subj] = 1
      t = index(subj, ":"); CALLOP[substr(subj, 1, t - 1)] = CALLOP[substr(subj, 1, t - 1)] " " substr(subj, t + 1)
    }
    else if (kind == "bound" && subj ~ /^([1-9@]|[A-Za-z_][A-Za-z0-9_]*:([A-Za-z_][A-Za-z0-9_]*|[1-9@])|[A-Za-z_][A-Za-z0-9_]*)$/) BD[file SUBSEP subj] = 1
    else if (index(CLASSES, " " kind " ")) ALLOW[file SUBSEP rest] = kind
    else ok = 0
    if (!ok) { bad = 1; printf "durable-writes.awk: table line %d names an unknown kind or a malformed subject: %s\n", n, l > "/dev/stderr" }
  }
  close(f)
}

FNR == 1 {
  if (NR > 1) finish()
  FILE = FILENAME; NL = 0
  if (ROOT != "" && index(FILE, ROOT "/") == 1) FILE = substr(FILE, length(ROOT) + 2)
}
{ NL++; PL[NL] = $0 }
END { if (NR > 0) finish(); report() }

function report(   k, c, parts, src, n, i) {
  for (k in ALLOW) if (!(k in USED)) { split(k, parts, /\034/); dead++; printf "DEAD listed %s: %s\n", parts[1], parts[2] }
  for (k in SV) if (!(k in USEDS)) { split(k, parts, /\034/); dead++; printf "DEAD scratch %s: %s\n", parts[1], parts[2] }
  for (k in FROM) {
    split(k, parts, /\034/)
    if (!(k in USEDF)) { dead++; printf "DEAD from %s: %s\n", parts[1], parts[2]; continue }
    n = split(FROM[k], src, / /)
    for (i = 1; i <= n; i++) if (src[i] != "" && !((src[i] SUBSEP parts[2]) in PROVENV)) { unproven++; printf "UNPROVEN from %s: %s is no scratch variable %s proves by assignment\n", parts[1], parts[2], src[i] }
  }
  for (k in OP) if (!(k in USEDO)) { split(k, parts, /\034/); dead++; printf "DEAD operand %s: %s\n", parts[1], parts[2] }
  for (k in BD) if (!(k in USEDB)) { split(k, parts, /\034/); dead++; printf "DEAD bound %s: %s\n", parts[1], parts[2] }
  for (c in BYCLASS) printf "class %s %d\n", c, BYCLASS[c] | "sort"
  close("sort")
  printf "names: scratch proven %d, from a sourced file %d, operands %d with %d calls judged, bound %d\n", proven + 0, nfrom + 0, nop + 0, calls + 0, nbound + 0
  printf "census: files %d flagged %d = scratch %d + listed %d + remainder %d\n", files, flagged, nscratch, listed, remainder
  if (bad || dead || unproven || flagged == 0 || remainder > 0 || flagged != nscratch + listed + remainder) exit 1
}

# ---- per file
#
# A scope holds a variable's assignments: the shell file is one scope, each awk program in it
# another, a .awk or .ts file one; an ENVIRON reference in awk reads as the shell's variable,
# written ${NAME}. Every write and assignment also keeps the shell function it sits in, for the
# operand and bound names of the table.

function finish(   i, k, v, names, n, again) {
  files++
  NA = 0; NJ = 0; NW = 0; NPC = 0; NAX = 0; FUNC = ""; SCOPES = 0; SCOPE = 0
  split("", ROOTED); split("", JUDGED); split("", BAD); split("", HELD); split("", HELDV)
  LANG = FILE ~ /\.ts$/ ? "ts" : (FILE ~ /\.awk$/ ? "awk" : "sh")
  if (LANG == "sh") parse_sh()
  else if (LANG == "awk") parse_awk_file()
  else parse_ts()
  commands()
  for (k in FROMSRC) { split(k, names, /\034/); if (names[1] == FILE && (k in SV)) { ROOTED[names[2] SUBSEP 0] = 1; USEDS[k] = 1 } }
  for (i = 1; i <= NW; i++) {
    JSCOPE = WS[i]; JFUNC = WF[i]
    if (scratch(WD[i])) judge(WL[i], "scratch")
    else judge(WL[i], "durable", WWHAT[i] " " WD[i])
  }
  for (again = 1; again; ) {
    again = 0
    for (i = 1; i <= NA; i++) {
      if (JUDGED[i] || !((ASGV[i] SUBSEP ASGS[i]) in ROOTED)) continue
      JUDGED[i] = 1; again = 1; HELD[ASGV[i] SUBSEP ASGS[i]] = 1; HELDV[ASGD[i]] = 1; JSCOPE = ASGRS[i]; JFUNC = ASGF[i]
      if (ASGOK[i]) judge(ASGL[i], "durable", "system temp assignment " ASGV[i] "=" ASGR[i])
      else if (asg_scratch(i)) judge(ASGL[i], "scratch")
      else { BAD[ASGD[i]] = 1; judge(ASGL[i], "bad", "assignment " ASGV[i] "=" ASGR[i]) }
    }
  }
  for (k in ROOTED) {
    split(k, names, /\034/)
    if (!(k in HELD)) { unproven++; printf "UNPROVEN scratch %s: %s roots a destination where nothing assigns it (name it bound, from, or an operand)\n", FILE, names[1] }
  }
  n = split(SVN[FILE], names, / /)
  for (k = 1; k <= n; k++) {
    v = names[k]
    if (v == "" || !(v in HELDV) || (v in BAD)) continue
    proven++; PROVENV[FILE SUBSEP v] = 1
    if (DEBUG != "") for (i = 1; i <= NA; i++) if (ASGD[i] == v && JUDGED[i] && ASGR[i] != "") { printf "PROOF %s\t%s\t%s\n", FILE, v, ASGR[i]; break }
  }
  for (i = 1; i <= NJ; i++) {
    k = JLINE[i]
    if (JV[k] == "scratch") nscratch++
    else if (JV[k] == "durable" && ((FILE SUBSEP PL[k]) in ALLOW)) { USED[FILE SUBSEP PL[k]] = 1; listed++; BYCLASS[ALLOW[FILE SUBSEP PL[k]]]++ }
    else { remainder++; printf "REMAINDER %s:%d: %s: %s\n", FILE, k, JWHY[k], PL[k] }
    flagged++
    if (DEBUG != "") printf "DEBUG %s %s:%d: [%s] %s: %s\n", JV[k], FILE, k, JFN[k], JWHY[k], PL[k]
  }
  split("", JV); split("", JWHY); split("", JLINE)
}

# judge: one line's verdict merges every write and assignment on it: a failed scratch
# assignment (bad) wins over a durable write, which wins over scratch
function judge(line, verdict, why) {
  if (!(line in JV)) { NJ++; JLINE[NJ] = line; JV[line] = verdict; JWHY[line] = why; JFN[line] = JFUNC; return }
  if (verdict == "scratch") return
  if (JV[line] == "scratch") JWHY[line] = why
  else if (index(JWHY[line], why) == 0) JWHY[line] = JWHY[line] "; " why
  if (JV[line] != "bad") JV[line] = verdict
}

function device(d) { return d ~ /^\/dev\/(null|stdin|stdout|stderr|tty|fd\/[0-9]+)$/ }

function write(line, dest, what,   d) {
  d = unquote(dest)
  if (d == "" || device(d)) return
  NW++; WL[NW] = line; WD[NW] = d; WWHAT[NW] = what; WS[NW] = SCOPE; WF[NW] = FUNC
}

function assign(line, v, rhs, kind, scope,   d) {
  if ((FILE SUBSEP v) in BD || (FUNC != "" && ((FILE SUBSEP FUNC ":" v) in BD))) return
  if (FUNC != "" && ((FILE SUBSEP FUNC ":" v) in SV)) { d = FUNC ":" v; scope = "f:" FUNC }
  else if ((FILE SUBSEP v) in SV) d = v
  else return
  NA++; ASGV[NA] = v; ASGD[NA] = d; ASGR[NA] = unquote(rhs); ASGL[NA] = line; ASGK[NA] = kind; ASGF[NA] = FUNC
  ASGS[NA] = (scope == "" ? SCOPE : scope)
  ASGRS[NA] = (scope == "" ? ASGS[NA] : SCOPE)
  ASGOK[NA] = ((FILE SUBSEP PL[line]) in ALLOW) && ALLOW[FILE SUBSEP PL[line]] == "tmp-fallback"
}

function asg_scratch(i) {
  if (ASGK[i] == "read") return 0
  if (ASGR[i] == "") return 1
  if (ASGK[i] == "for") return words_scratch(ASGR[i])
  return scratch(ASGR[i])
}

function words_scratch(s,   n, w, k) {
  n = split(s, w, /[ \t]+/)
  for (k = 1; k <= n; k++) if (w[k] != "" && !scratch(w[k])) return 0
  return 1
}

function unquote(s) {
  gsub(/["'\\]/, "", s)
  sub(/^[ \t]+/, "", s); sub(/[ \t;]+$/, "", s)
  return s
}

# named: v roots a destination in scope s: an operand or bound name of the enclosing function,
# a bound operand or variable of the file, a variable from a sourced file, or a scratch variable
function named(v, s,   k) {
  NAMEDS = s; NAMEDK = ""
  if (JFUNC != "") {
    k = FILE SUBSEP JFUNC ":" v
    if (k in OP) { if (!(k in USEDO)) nop++; USEDO[k] = 1; NAMEDK = "operand"; return 1 }
    if (k in BD) { if (!(k in USEDB)) nbound++; USEDB[k] = 1; NAMEDK = "bound"; return 1 }
    if (k in SV) { USEDS[k] = 1; NAMEDS = "f:" JFUNC; ROOTED[v SUBSEP NAMEDS] = 1; NAMEDK = "scratch"; return 1 }
  }
  k = FILE SUBSEP v
  if (k in BD) { if (!(k in USEDB)) nbound++; USEDB[k] = 1; NAMEDK = "bound"; return 1 }
  if (k in FROM) { if (!(k in USEDF)) nfrom++; USEDF[k] = 1; NAMEDK = "from"; return 1 }
  if (!(k in SV)) return 0
  USEDS[k] = 1; ROOTED[v SUBSEP s] = 1; NAMEDK = "scratch"
  return 1
}

# scratch: a destination rooted at the per verb scratch root, the drawer's scratch folder, a
# mktemp of such a template, the absolute form of such a path, or a name of the table (a
# device is no file)
function scratch(d,   v, alt, rest, m, inner, s, op) {
  if (device(d)) return 1
  if (d ~ /^mktemp( |$)/) return mktemp_scratch(d)
  if (d ~ /^\.contexture\/tmp(\/|$)/) return 1
  if (substr(d, 1, 2) == "$(") {
    m = sub_close(d)
    inner = substr(d, 3, m - 3); rest = substr(d, m + 1)
    if (rest ~ /^\/\.contexture\/tmp(\/|$)/) return 1
    if (inner ~ /^mktemp( |$)/) return mktemp_scratch(inner)
    if (inner ~ /^dirname /) return rest == "" && dirname_scratch(substr(inner, 9))
    if (match(inner, /^(CDPATH= )?cd (-- )?[^ ]+( 2>\/dev\/null)? && pwd$/)) {
      inner = substr(inner, index(inner, "cd ") + 3); sub(/^-- /, "", inner); sub(/ .*$/, "", inner)
      return scratch(inner rest)
    }
    return inner ~ /^[A-Za-z_][A-Za-z0-9_]*$/ && named(inner, 0)
  }
  if (d !~ /^\$\{?([A-Za-z_][A-Za-z0-9_]*|[1-9@])/) return 0
  s = JSCOPE
  if (substr(d, 2, 1) == "{") {
    m = index(d, "}")
    if (m == 0) return 0
    v = substr(d, 3, m - 3); rest = substr(d, m + 1); s = 0
    if (match(v, /^([A-Za-z_][A-Za-z0-9_]*|[1-9@])/) && RLENGTH < length(v)) {
      op = substr(v, RLENGTH + 1); v = substr(v, 1, RLENGTH)
      if (op ~ /^:?[-=]/) { sub(/^:?[-=]/, "", op); if (op != "" && !scratch(op rest)) return 0 }
      else if (op ~ /^%%?\/\*$/) return rest == "" && dirname_scratch("$" v)
      else return 0
    }
  } else {
    match(d, /^\$([A-Za-z_][A-Za-z0-9_]*|[1-9@])/)
    v = substr(d, 2, RLENGTH - 1); rest = substr(d, RLENGTH + 1)
  }
  if (v == "CTX_SCRATCH_ROOT") return 1
  if (v == "CTX_DIR" && rest ~ /^\/tmp(\/|$)/) return 1
  if (rest ~ /^\/\.contexture\/tmp(\/|$)/) return 1
  return named(v, s)
}

# sub_close: the offset of the ) closing the $( that opens d
function sub_close(d,   k, n, c, depth) {
  n = length(d); depth = 0
  for (k = 2; k <= n; k++) {
    c = substr(d, k, 1)
    if (c == "(") depth++
    else if (c == ")") { depth--; if (depth == 0) return k }
  }
  return n + 1
}

# dirname_scratch: the folder of x is scratch when x's own folder text is, when x is an operand
# or bound name (its caller's path), or when x is a scratch variable each of whose assignments in
# its scope names a path below a scratch folder
function dirname_scratch(x,   v, i, r, n, s, k) {
  if (match(x, /\/[^\/]+$/)) return scratch(substr(x, 1, RSTART - 1))
  if (!match(x, /^\$\{?([A-Za-z_][A-Za-z0-9_]*|[1-9@])\}?$/)) return 0
  v = x; gsub(/[${}]/, "", v)
  s = (x ~ /^\$\{/) ? 0 : JSCOPE
  if (!named(v, s)) return 0
  if (NAMEDK != "scratch") return 1
  s = NAMEDS; n = 0
  for (i = 1; i <= NA; i++) {
    if (ASGV[i] != v || ASGS[i] != s) continue
    r = ASGR[i]; n++
    if (ASGK[i] != "=" || !match(r, /\/[^\/]+$/) || !scratch(substr(r, 1, RSTART - 1))) return 0
  }
  return n > 0
}

function mktemp_scratch(s,   n, w, k, t, p) {
  n = split(s, w, /[ \t]+/)
  t = ""; p = ""
  for (k = 2; k <= n; k++) {
    if (w[k] == "-p" || w[k] == "--tmpdir") { p = w[++k]; continue }
    if (w[k] ~ /^-/ || w[k] ~ /^[0-9]*[<>]/) continue
    t = w[k]
  }
  if (p != "") return scratch(p) && (t == "" || t !~ /\//)
  if (t == "") return 0
  return scratch(t)
}


# ---- shell

function blanks(k,   s) { s = ""; while (k-- > 0) s = s " "; return s }

function parse_sh(   i, s, t, top) {
  ST = ""; HD = ""; HDP = ""; CONT = 0; U = ""; M = ""; A = ""; UN = 0; FN = 0
  for (i = 1; i <= NL; i++) {
    s = PL[i]
    if (HD != "") { t = s; if (HDT) sub(/^\t+/, "", t); if (t == HD) HD = ""; continue }
    if (UN == 0 && (s ~ /^[ \t]*#/ || s ~ /^[ \t]*$/)) continue
    ONE = 0
    if (UN == 0 && match(s, /^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*\(\)/)) {
      t = substr(s, 1, RLENGTH); match(t, /^[ \t]*/)
      FIN[++FN] = substr(t, 1, RLENGTH); gsub(/[ \t()]/, "", t); FNAME[FN] = t; FUNC = t
      ONE = (s ~ /\}[ \t]*$/)
    }
    UN++; UOFF[UN] = length(U) + 1; ULN[UN] = i
    sh_line(s)
    if (HDP != "") { HD = HDP; HDT = HDPT; HDP = "" }
    if (ST == "" && !CONT) {
      unit_sh(); U = ""; M = ""; A = ""; UN = 0
      if (FN > 0 && (ONE || index(s, FIN[FN] "}") == 1)) { FN--; FUNC = FN > 0 ? FNAME[FN] : "" }
      continue
    }
    top = substr(ST, length(ST))
    U = U "\n"
    if (CONT) { M = M " "; A = A " " }
    else if (top == "s") { M = M "x"; A = A "\n" }
    else if (top == "d") { M = M "x"; A = A " " }
    else { M = M ";"; A = A " " }
    CONT = 0
  }
  if (UN > 0) unit_sh()
}

function pop() { ST = substr(ST, 1, length(ST) - 1) }

function open_sub(s, i) {
  if (substr(s, i + 2, 1) == "(") { ST = ST "a"; AD[length(ST)] = 0; M = M "$(("; A = A "   "; return i + 2 }
  ST = ST "c"; PD[length(ST)] = 0; M = M "$("; A = A "  "; return i + 1
}

function sh_line(s,   i, n, c, top, w) {
  n = length(s)
  U = U s
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1); top = substr(ST, length(ST))
    if (top == "s") {
      if (c == "'") { pop(); M = M "'"; A = A " " }
      else { M = M "x"; A = A c }
      continue
    }
    if (top == "d") {
      if (c == "\\" && i < n) { M = M "xx"; A = A "  "; i++; continue }
      if (c == "\"") { pop(); M = M "\""; A = A " "; continue }
      if (c == "$" && substr(s, i + 1, 1) == "(") { i = open_sub(s, i); continue }
      if (c == "`") { ST = ST "b"; M = M "`"; A = A " "; continue }
      M = M "x"; A = A " "; continue
    }
    if (top == "a") {
      if (c == "(") AD[length(ST)]++
      else if (c == ")" && AD[length(ST)] > 0) AD[length(ST)]--
      else if (c == ")" && substr(s, i + 1, 1) == ")") { pop(); M = M "))"; A = A "  "; i++; continue }
      M = M "x"; A = A " "; continue
    }
    if (c == "\\") {
      if (i == n) { CONT = 1; M = M " "; A = A " "; continue }
      M = M "xx"; A = A "  "; i++; continue
    }
    if (c == "'") { ST = ST "s"; M = M "'"; A = A " "; continue }
    if (c == "\"") { ST = ST "d"; M = M "\""; A = A " "; continue }
    if (c == "`") { if (top == "b") pop(); else ST = ST "b"; M = M "`"; A = A " "; continue }
    if (c == "$" && substr(s, i + 1, 1) == "(") { i = open_sub(s, i); continue }
    if (c == "(") { if (top == "c") PD[length(ST)]++; M = M c; A = A " "; continue }
    if (c == ")") {
      if (top == "c") { if (PD[length(ST)] > 0) PD[length(ST)]--; else pop() }
      M = M c; A = A " "; continue
    }
    if (c == "#" && (i == 1 || substr(s, i - 1, 1) ~ /[ \t;&|()]/)) { M = M blanks(n - i + 1); A = A blanks(n - i + 1); break }
    if (c == "<" && substr(s, i + 1, 2) == "<-" || c == "<" && substr(s, i + 1, 1) == "<" && substr(s, i + 2, 1) != "<") {
      w = substr(s, i + 2)
      HDPT = (substr(w, 1, 1) == "-")
      if (HDPT) w = substr(w, 2)
      match(w, /^[ \t]*['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/)
      if (RLENGTH > 0) {
        HDP = substr(w, 1, RLENGTH); gsub(/[ \t'"]/, "", HDP)
        M = M blanks(2 + HDPT + RLENGTH); A = A blanks(2 + HDPT + RLENGTH); i += 1 + HDPT + RLENGTH
        continue
      }
    }
    M = M c; A = A " "
  }
}

# lineof: the file line holding offset p of the current unit
function lineof(p,   k) {
  if (FIXLINE) return FIXLINE
  for (k = UN; k > 1; k--) if (UOFF[k] <= p) return ULN[k]
  return ULN[1]
}

function unit_sh() {
  AWKSCOPE = ++SCOPES
  if (A ~ /[^ \t\n]/) { SCOPE = AWKSCOPE; awk_scan(A, 1); SCOPE = 0 }
  segments(1, length(M) + 1)
  redirects(1, length(M) + 1)
  defaults()
}

# close_of: the offset of the ) closing the ( or $( at p in M, or the backtick closing p
function close_of(p,   d, k, c, n) {
  n = length(M)
  if (substr(M, p, 1) == "`") { k = index(substr(M, p + 1), "`"); return k ? p + k : n + 1 }
  d = 0
  for (k = p; k <= n; k++) {
    c = substr(M, k, 1)
    if (c == "(") d++
    else if (c == ")") { d--; if (d == 0) return k }
  }
  return n + 1
}

# segments: split M[a, b) into simple commands at list separators, pipes, groups, and
# substitutions (each substitution read as commands of its own and as a word of its command)
function segments(a, b,   k, c, start, q) {
  start = a
  for (k = a; k < b; k++) {
    c = substr(M, k, 1)
    if (c == "$" && substr(M, k + 1, 1) == "(") { q = close_of(k + 1); segments(k + 2, q); k = q; continue }
    if (c == "`") { q = close_of(k); segments(k + 1, q); k = q; continue }
    if (c == "(") { simple(start, k); q = close_of(k); segments(k + 1, q); k = q; start = k + 1; continue }
    if (c == ")") { start = k + 1; continue }
    if (c == ";" || c == "|" || (c == "&" && substr(M, k - 1, 1) != ">" && substr(M, k - 1, 1) != "<" && substr(M, k + 1, 1) != ">")) {
      if (c == "|" && substr(M, k - 1, 1) == ">") continue
      simple(start, k); start = k + 1; continue
    }
  }
  simple(start, b)
}

# words: the words of M[a, b) at depth 0, their offsets in WA and ends in WB, their text from U;
# a redirect operator (with its descriptor, and a dup's target) is a word of its own
function words(a, b,   k, c, n, in_w, r) {
  n = 0; in_w = 0
  for (k = a; k < b; k++) {
    c = substr(M, k, 1)
    if (c == " " || c == "\t" || c == "\n" || c == ";" || c == "|" || c == "(" || c == ")" || (c == "&" && substr(M, k + 1, 1) != ">")) { if (in_w) { WB[n] = k; in_w = 0 }; continue }
    if (!in_w || c == ">" || c == "<" || c == "&") {
      r = substr(M, k, b - k)
      if (match(r, /^[0-9]*(>>|>\||>&[0-9-]*|<&[0-9-]*|<>|>|<|&>)/)) {
        if (in_w) WB[n] = k
        n++; WA[n] = k; WB[n] = k + RLENGTH; in_w = 0; k += RLENGTH - 1; continue
      }
      if (!in_w) { n++; WA[n] = k; in_w = 1 }
    }
    if (c == "$" && substr(M, k + 1, 1) == "(") { k = close_of(k + 1); continue }
    if (c == "`") { k = close_of(k); continue }
  }
  if (in_w) WB[n] = (k > b ? b : k)
  for (k = 1; k <= n; k++) { if (WB[k] > b) WB[k] = b; WT[k] = substr(U, WA[k], WB[k] - WA[k]); WM[k] = substr(M, WA[k], WB[k] - WA[k]) }
  return n
}

function simple(a, b,   n, k, w, cmd, v, i, rest) {
  if (b <= a) return
  n = words(a, b)
  k = 1
  # skip redirect words and their targets wherever they stand, keyword and prefix words first
  while (k <= n) {
    w = WM[k]
    if (w ~ /^(if|then|elif|else|fi|do|done|while|until|!|\{|\}|time|esac|;;)$/) { k++; continue }
    if (w == "case") return
    if (w == "for") {
      if (k + 2 <= n && WM[k + 2] == "in") { rest = ""; for (i = k + 3; i <= n; i++) rest = rest " " WT[i]; assign(lineof(WA[k + 1]), WT[k + 1], rest, "for") }
      return
    }
    if (w ~ /^(local|export|readonly)$/) { k++; for (; k <= n; k++) if (WM[k] ~ /^[A-Za-z_][A-Za-z0-9_]*=/) asg_word(k); return }
    if (w ~ /^[A-Za-z_][A-Za-z0-9_]*=/) { asg_word(k); k++; continue }
    if (w ~ /^[0-9]*(>|>>|>\||<|<>|&>)$/) { k += 2; continue }
    if (w ~ /^[0-9]*(>|>>|>\||<|<>|&>|>&|<&)/) { k++; continue }
    if (index(PREFIXES, " " w " ")) {
      k++
      if (w == "xargs") while (k <= n && WM[k] ~ /^-/) { if (WM[k] ~ /^-[InLsPd]$/) k++; k++ }
      if (w == "env") while (k <= n && (WM[k] ~ /^-/ || WM[k] ~ /^[A-Za-z_][A-Za-z0-9_]*=/)) k++
      continue
    }
    break
  }
  if (k > n) return
  cmd = unquote(WT[k])
  if (FUNC != "" && ((FILE SUBSEP FUNC) in SV)) output(cmd, k, n)
  if (cmd == "read") { for (i = k + 1; i <= n; i++) if (WM[i] !~ /^-/ && WM[i - 1] !~ /^-[pdtnu]$/) assign(lineof(WA[i]), WM[i], "", "read"); return }
  if (cmd ~ /^\$\{?[A-Za-z_]*[Ss][Qq][Ll][Ii][Tt][Ee][A-Za-z_]*\}?$/) cmd = "sqlite3"
  sub(/^.*\//, "", cmd)
  if (cmd == "awk") {
    for (i = k + 1; i <= n; i++) {
      if (WM[i] == "-v" && i < n) { i++; if (WM[i] ~ /^[A-Za-z_][A-Za-z0-9_]*=/) asg_word(i, AWKSCOPE) }
      else if (WM[i] ~ /^-v[A-Za-z_][A-Za-z0-9_]*=/) { WT[i] = substr(WT[i], 3); asg_word(i, AWKSCOPE) }
    }
    return
  }
  if (cmd in CALLOP) called(cmd, k, n)
  if (!index(CMDS, " " cmd " ")) return
  operands(cmd, k, n)
}

# called: a call of a function the table names as writing an operand judges that operand
function called(cmd, k, n,   i, no, ops, m, w, line) {
  line = lineof(WA[k]); no = 0
  for (i = k + 1; i <= n; i++) {
    if (WM[i] ~ /^[0-9]*(>|>>|>\||<|<>|&>)$/) { i++; continue }
    if (WM[i] ~ /^[0-9]*(>&|<&)/) continue
    ops[++no] = WT[i]
  }
  m = split(CALLOP[cmd], w, / /)
  for (i = 1; i <= m; i++) {
    if (w[i] == "") continue
    calls++
    if (w[i] == "@") { for (k = 1; k <= no; k++) write(line, ops[k], cmd " operand") }
    else if (w[i] + 0 <= no) write(line, ops[w[i] + 0], cmd " operand " w[i])
  }
}

# output: a printf, an echo, or a named scratch function's call on the stdout of a named scratch
# function is one of its values, judged as its assignment
function output(cmd, k, n,   i, f, v, w) {
  for (i = k + 1; i <= n; i++) if (WM[i] ~ /^1?(>|>>|>\|)$/ || WM[i] ~ /^1?>&/) return
  if (cmd == "printf") {
    f = WT[k + 1]; gsub(/\\n/, "", f); f = unquote(f)
    for (i = k + 2; i <= n; i++) {
      if (WM[i] ~ /^[0-9]*(<|>|>>|<>)/) break
      w = unquote(WT[i])
      v = index(f, "%s"); if (v == 0) break
      f = substr(f, 1, v - 1) w substr(f, v + 2)
    }
    assign(lineof(WA[k]), FUNC, f, "=")
  } else if (cmd == "echo") {
    f = ""; for (i = k + 1; i <= n; i++) if (WM[i] !~ /^[0-9]*(<|>|>>|<>)/) f = f (f == "" ? "" : " ") WT[i]; else break
    assign(lineof(WA[k]), FUNC, f, "=")
  } else if ((FILE SUBSEP cmd) in SV) assign(lineof(WA[k]), FUNC, "$(" cmd ")", "=")
}

function asg_word(k, scope,   e) {
  e = index(WT[k], "=")
  assign(lineof(WA[k]), substr(WT[k], 1, e - 1), substr(WT[k], e + 1), "=", scope)
}

# operands: the destinations of write command cmd at word k of n words
function operands(cmd, k, n,   i, w, ops, no, last, t, p, line, flags) {
  line = lineof(WA[k])
  no = 0; flags = ""
  for (i = k + 1; i <= n; i++) {
    w = WM[i]
    if (w ~ /^[0-9]*(>|>>|>\||<|<>|&>)$/) { i++; continue }
    if (w ~ /^[0-9]*(>|>>|>\||<|<>|&>|>&|<&)/) continue
    if (w ~ /^-/ && !(w == "-" )) {
      flags = flags " " w
      if (cmd ~ /^(mkdir|install|chmod)$/ && w == "-m") i++
      else if (cmd ~ /^(mv|cp|ln|install)$/ && (w == "-t" || w == "-S")) { if (w == "-t") write(line, WT[i + 1], cmd " into"); i++ }
      else if (cmd == "touch" && w ~ /^-[dtr]$/) i++
      else if (cmd == "mktemp" && w == "-p") { p = WT[i + 1]; i++ }
      else if (cmd == "sqlite3" && w ~ /^-(cmd|separator|nullvalue|newline|init)$/) i++
      else if (cmd == "curl" && w ~ /^-(o|-output)$/) { write(line, WT[i + 1], "curl into"); i++ }
      else if (cmd == "curl" && w ~ /^-[A-Za-z]*[HdXAeu]$/) i++
      else if (cmd == "wget" && w ~ /^-O/) { t = (w == "-O") ? WT[++i] : substr(WT[i], 3); if (unquote(t) != "-") write(line, t, "wget into") }
      else if (cmd == "tar" && w ~ /^-[Cf]$/) { if (w == "-C") p = WT[i + 1]; else t = WT[i + 1]; i++ }
      continue
    }
    no++; ops[no] = WT[i]
  }
  if (cmd ~ /^(mkdir|tee|touch|rm|rmdir)$/) { for (i = 1; i <= no; i++) write(line, ops[i], cmd); return }
  if (cmd == "chmod") { for (i = 2; i <= no; i++) write(line, ops[i], cmd); return }
  if (cmd ~ /^(mv|cp|ln|install)$/) { if (no) write(line, ops[no], cmd " into"); return }
  if (cmd == "dd") { for (i = 1; i <= no; i++) if (unquote(ops[i]) ~ /^of=/) write(line, substr(unquote(ops[i]), 4), "dd into"); return }
  if (cmd == "mktemp") {
    t = ""; for (i = 1; i <= no; i++) t = t " " ops[i]
    if (p != "") t = " -p " p t
    write(line, "mktemp" t, "mktemp"); return
  }
  if (cmd == "sed") { if (flags ~ / -i/ || flags ~ / -[A-Za-z]*i/) for (i = 2; i <= no; i++) write(line, ops[i], "sed -i"); return }
  if (cmd == "tar") { if (flags ~ /x/ || (no && ops[1] ~ /^x/)) write(line, p != "" ? p : ".", "tar extraction into"); else if (flags ~ /c/ && t != "") write(line, t, "tar into"); return }
  if (cmd ~ /^(gzip|gunzip)$/) { if (flags !~ /c/) for (i = 1; i <= no; i++) write(line, ops[i], cmd); return }
  if (cmd == "curl") { if (flags ~ / -[A-Za-z]*O/) write(line, ".", "curl into"); return }
  if (cmd == "wget") { if (flags !~ / -O/ && flags !~ / --spider/) write(line, ".", "wget into"); return }
  if (cmd == "sqlite3") { if (no && unquote(ops[1]) != ":memory:") write(line, ops[1], "sqlite3 on"); return }
  if (cmd == "store_get_into" || cmd == "fields_own") { if (no >= 1) write(line, ops[1], cmd " into"); return }
  if (cmd == "fields_get") { if (no >= 2) write(line, ops[2], cmd " into"); return }
  if (cmd == "fields_put" || cmd == "fields_set") { if (no >= 3) write(line, ops[3], cmd " into"); return }
  if (cmd == "fields_apply") { if (no >= 4) write(line, ops[4], cmd " into"); return }
}

# redirects: every redirect operator in M[a, b) with its target word
function redirects(a, b,   k, c, op, t, rest, n, q, line) {
  for (k = a; k < b; k++) {
    c = substr(M, k, 1)
    if (c != ">") continue
    if (substr(M, k - 1, 1) == ">" ) continue
    op = ">"
    if (substr(M, k + 1, 1) == ">") op = ">>"
    else if (substr(M, k + 1, 1) == "|") op = ">|"
    else if (substr(M, k + 1, 1) == "&") { k++; continue }
    if (substr(M, k - 1, 1) == "<") op = "<>"
    line = lineof(k)
    q = k + length(op) - (op == "<>" ? 1 : 0)
    rest = substr(M, q)
    match(rest, /^[ \t]*/)
    q += RLENGTH
    n = words(q, b)
    if (n == 0) continue
    t = unquote(WT[1])
    k = WB[1] - 1
    if (t ~ /^\/dev\/(null|stdin|stdout|stderr|tty|fd\/[0-9]+)$/) continue
    write(line, WT[1], "redirect into")
  }
}

# defaults: ${NAME:=value} and ${NAME=value} assignments of the file's scratch variables
function defaults(   s, p, v, e, d) {
  s = U
  while (match(s, /\$\{[A-Za-z_][A-Za-z0-9_]*:?=/)) {
    v = substr(s, RSTART + 2, RLENGTH - 2); sub(/:?=$/, "", v)
    s = substr(s, RSTART + RLENGTH)
    e = index(s, "}")
    d = e ? substr(s, 1, e - 1) : s
    p = length(U) - length(s)
    assign(lineof(p), v, d, "=")
  }
}

# sh_text: the shell rules over one command text s (an awk pipe's or system()'s command),
# every hit on file line `line`
function sh_text(s, line,   sU, sM, sA, sST, sUN, sCONT) {
  sU = U; sM = M; sA = A; sST = ST; sUN = UN; sCONT = CONT
  U = ""; M = ""; A = ""; ST = ""; CONT = 0; FIXLINE = line
  sh_line(s)
  segments(1, length(M) + 1)
  redirects(1, length(M) + 1)
  FIXLINE = 0; U = sU; M = sM; A = sA; ST = sST; UN = sUN; CONT = sCONT
}

# ---- awk

function parse_awk_file(   i, s, t) {
  U = ""; UN = 0
  for (i = 1; i <= NL; i++) {
    s = PL[i]
    if (UN == 0 && (s ~ /^[ \t]*#/ || s ~ /^[ \t]*$/)) continue
    UN++; UOFF[UN] = length(U) + 1; ULN[UN] = i
    U = U s
    t = s; sub(/[ \t]+$/, "", t)
    if (t ~ /(,|\\|&&|\|\|)$/) { U = U "\n"; continue }
    awk_scan(U, 1); U = ""; UN = 0
  }
  if (UN > 0) awk_scan(U, 1)
}

# str_end: the offset of the quote closing the string opened at k in T
function str_end(T, k,   n) {
  n = length(T)
  for (k++; k <= n; k++) {
    if (substr(T, k, 1) == "\\") { k++; continue }
    if (substr(T, k, 1) == "\"") return k
  }
  return n
}

# re_end: the offset of the slash closing the regex literal opened at k in T
function re_end(T, k,   n, c, br) {
  n = length(T); br = 0
  for (k++; k <= n; k++) {
    c = substr(T, k, 1)
    if (c == "\\") { k++; continue }
    if (c == "\n") return k - 1
    if (c == "[") br = 1
    else if (c == "]") br = 0
    else if (c == "/" && !br) return k
  }
  return n
}

# regex_at: whether a slash at k in T opens a regex literal (no operand before it)
function regex_at(T, k,   j, c) {
  for (j = k - 1; j >= 1; j--) { c = substr(T, j, 1); if (c != " " && c != "\t") break }
  if (j < 1) return 1
  return (c ~ /[~(,!&|{};:?\n]/)
}

function awk_scan(T, base,   n, k, c, id, prev, rest, q, e) {
  n = length(T)
  for (k = 1; k <= n; k++) {
    c = substr(T, k, 1)
    if (c == "\"") { k = str_end(T, k); continue }
    if (c == "#") { q = index(substr(T, k), "\n"); if (!q) return; k += q - 1; continue }
    if (c == "/" && regex_at(T, k)) { k = re_end(T, k); continue }
    if (c !~ /[A-Za-z_]/) continue
    prev = k > 1 ? substr(T, k - 1, 1) : " "
    match(substr(T, k), /^[A-Za-z_][A-Za-z0-9_]*/)
    id = substr(T, k, RLENGTH)
    if (prev ~ /[A-Za-z0-9_.$]/) { k += RLENGTH - 1; continue }
    if (id == "print" || id == "printf") { k = print_stmt(T, k + RLENGTH); continue }
    rest = substr(T, k + RLENGTH)
    if (id == "system" && match(rest, /^[ \t]*\(/)) {
      q = k + length(id) + RLENGTH - 1
      e = paren_end(T, q)
      cmd_text(substr(T, q + 1, e - q - 1), lineof(base + k - 1))
      k = e; continue
    }
    if (match(rest, /^[ \t]*=[^=~]/)) {
      q = k + length(id) + RLENGTH - 1
      e = stmt_end(T, q)
      awk_assign(lineof(base + k - 1), id, substr(T, q, e - q))
    }
    k += length(id) - 1
  }
}

# paren_end: the offset of the ) closing the ( at k in T
function paren_end(T, k,   n, d, c) {
  n = length(T); d = 0
  for (; k <= n; k++) {
    c = substr(T, k, 1)
    if (c == "\"") { k = str_end(T, k); continue }
    if (c == "(") d++
    else if (c == ")") { d--; if (d == 0) return k }
  }
  return n
}

# stmt_end: the offset where the awk statement holding k ends (a newline, a semicolon, or a
# close brace at depth 0, outside strings and regex literals)
function stmt_end(T, k,   n, d, c) {
  n = length(T); d = 0
  for (; k <= n; k++) {
    c = substr(T, k, 1)
    if (c == "\"") { k = str_end(T, k); continue }
    if (c == "/" && regex_at(T, k)) { k = re_end(T, k); continue }
    if (c == "(") d++
    else if (c == ")") { if (d == 0) return k; d-- }
    else if (d == 0 && (c == ";" || c == "}" || c == "\n")) return k
  }
  return n + 1
}

# print_stmt: a print or printf from k; its redirect or pipe at depth 0 is the write
function print_stmt(T, k,   n, d, c, e, op, line) {
  n = length(T); d = 0
  e = stmt_end(T, k)
  for (; k < e; k++) {
    c = substr(T, k, 1)
    if (c == "\"") { k = str_end(T, k); continue }
    if (c == "/" && regex_at(T, k)) { k = re_end(T, k); continue }
    if (c == "(") { d++; continue }
    if (c == ")") { d--; continue }
    if (d != 0) continue
    if (c == ">") {
      op = (substr(T, k + 1, 1) == ">") ? 2 : 1
      line = lineof(k)
      awk_redirect(substr(T, k + op, e - k - op), line)
      return e
    }
    if (c == "|" && substr(T, k + 1, 1) != "|" && substr(T, k - 1, 1) != "|") {
      cmd_text(substr(T, k + 1, e - k - 1), lineof(k))
      return e
    }
  }
  return e
}

function awk_redirect(x, line,   w) {
  w = awk_word(x)
  if (w ~ /^\/dev\/(null|stdin|stdout|stderr|tty|fd\/[0-9]+)$/) return
  write(line, w, "awk print into")
}

# awk_word: an awk expression as a shell word: a string literal its text, a variable $name,
# ENVIRON["X"] $X, parens and concatenation dropped
# awk_assign: an awk assignment; a conditional value's branches are judged as words
function awk_assign(line, id, x,   q, c) {
  NAX++; AXV[NAX] = id; AXX[NAX] = x; AXL[NAX] = line; AXS[NAX] = SCOPE
  if (!((FILE SUBSEP id) in SV)) return
  q = top_char(x, "?")
  if (q) {
    c = top_char(substr(x, q + 1), ":")
    if (c) { assign(line, id, awk_word(substr(x, q + 1, c - 1)) " " awk_word(substr(x, q + c + 1)), "for"); return }
  }
  assign(line, id, awk_word(x), "=")
}

# top_char: the offset of the first ch in x outside strings and parentheses, else 0
function top_char(x, ch,   k, n, c, d) {
  n = length(x); d = 0
  for (k = 1; k <= n; k++) {
    c = substr(x, k, 1)
    if (c == "\"") { k = str_end(x, k); continue }
    if (c == "(") d++
    else if (c == ")") d--
    else if (c == ch && d == 0) return k
  }
  return 0
}

# awk_word: an awk expression as a shell word: a string literal its text, a variable $name,
# ENVIRON["X"] ${X}, a sprintf its format with each %s its argument, parens and concatenation
# dropped
function awk_word(x,   out, c, k, n, e, f, a, m, i, p) {
  sub(/^[ \t\n]+/, "", x)
  if (x ~ /^sprintf[ \t]*\(/) {
    k = index(x, "(")
    e = paren_end(x, k)
    a = substr(x, k + 1, e - k - 1)
    m = 0
    while (a != "") {
      i = top_char(a, ",")
      if (i == 0) i = length(a) + 1
      ARG[++m] = substr(a, 1, i - 1); a = substr(a, i + 1)
    }
    f = awk_word(ARG[1]); out = ""
    for (i = 2; match(f, /%[-0-9.]*[a-z]/); ) {
      p = substr(f, RSTART, RLENGTH); out = out substr(f, 1, RSTART - 1); f = substr(f, RSTART + RLENGTH)
      out = out (p ~ /s$/ && i <= m ? awk_word(ARG[i]) : "N"); i++
    }
    return out f awk_word(substr(x, e + 1))
  }
  out = ""; n = length(x)
  for (k = 1; k <= n; k++) {
    c = substr(x, k, 1)
    if (c == "\"") { e = str_end(x, k); out = out substr(x, k + 1, e - k - 1); k = e; continue }
    if (substr(x, k) ~ /^ENVIRON\[/) {
      e = index(substr(x, k), "]")
      out = out "${" substr(x, k + 9, e - 11) "}"; k += e - 1; continue
    }
    if (c ~ /[A-Za-z_]/) { match(substr(x, k), /^[A-Za-z_][A-Za-z0-9_]*/); out = out "$" substr(x, k, RLENGTH); k += RLENGTH - 1; continue }
    if (c ~ /[ \t()]/) continue
    out = out c
  }
  return out
}

# cmd_text: an awk command expression (a pipe's or system()'s) read by the shell rules; a
# command held in a variable alone is a destination of its own
function cmd_text(x, line,   v) {
  v = x; gsub(/[ \t\n()]/, "", v)
  if (v ~ /^[A-Za-z_][A-Za-z0-9_]*$/) { NPC++; PCV[NPC] = v; PCL[NPC] = line; PCS[NPC] = SCOPE; PCF[NPC] = FUNC; return }
  if (x !~ /"/) { write(line, awk_word(x), "awk command"); return }
  sh_text(awk_word(x), line)
}

# commands: a command held in an awk variable is read through every assignment of it in the
# same program, each by the shell rules on its own line; one with no assignment is a
# destination of its own
function commands(   i, j, n, sS, sF) {
  sS = SCOPE; sF = FUNC
  for (i = 1; i <= NPC; i++) {
    SCOPE = PCS[i]; FUNC = PCF[i]; n = 0
    for (j = 1; j <= NAX; j++) {
      if (AXV[j] != PCV[i] || AXS[j] != PCS[i]) continue
      n++
      if (AXX[j] ~ /"/) sh_text(awk_word(AXX[j]), AXL[j])
      else write(AXL[j], awk_word(AXX[j]), "awk command")
    }
    if (n == 0) write(PCL[i], "$" PCV[i], "awk command")
  }
  SCOPE = sS; FUNC = sF
}

# ---- TypeScript

function parse_ts(   i, s, d, t) {
  U = ""; UN = 0; d = 0
  for (i = 1; i <= NL; i++) {
    s = PL[i]
    if (UN == 0 && (s ~ /^[ \t]*(\/\/|\*|\/\*)/ || s ~ /^[ \t]*$/)) continue
    UN++; UOFF[UN] = length(U) + 1; ULN[UN] = i
    U = U s
    t = s; gsub(/'[^']*'|"[^"]*"/, "", t)
    d += gsub(/\(/, "(", t) - gsub(/\)/, ")", t)
    if (d > 0) { U = U "\n"; continue }
    ts_scan(U); U = ""; UN = 0; d = 0
  }
  if (UN > 0) ts_scan(U)
}

# ts_args: the top level arguments of the call whose ( is at k in T, into TA[1..n]
function ts_args(T, k,   n, d, c, start, e, q) {
  e = length(T); d = 0; n = 0; start = k + 1
  for (; k <= e; k++) {
    c = substr(T, k, 1)
    if (c == "'" || c == "\"" || c == "`") { q = index(substr(T, k + 1), c); k += q; continue }
    if (c == "(" || c == "[" || c == "{") { d++; continue }
    if (c == ")" || c == "]" || c == "}") {
      d--
      if (d == 0) { TA[++n] = substr(T, start, k - start); return n }
      continue
    }
    if (c == "," && d == 1) { TA[++n] = substr(T, start, k - start); start = k + 1 }
  }
  return n
}

function ts_scan(T,   s, p, k, call, n, name, line, w, i, a, m) {
  s = T
  while (match(s, /(new DatabaseSync|((fs|fsp)\.(promises\.)?)?(writeFileSync|appendFileSync|mkdirSync|mkdtempSync|renameSync|copyFileSync|cpSync|rmSync|unlinkSync|rmdirSync|symlinkSync|createWriteStream)|(fs|fsp)\.(promises\.)?(writeFile|appendFile|mkdir|mkdtemp|rename|copyFile|cp|rm|unlink|rmdir|symlink)|execFileSync|execFile|spawnSync|spawn)[ \t]*\(/)) {
    p = length(T) - length(s) + RSTART
    call = substr(s, RSTART, RLENGTH); sub(/[ \t]*\($/, "", call)
    k = p + RLENGTH - 1
    s = substr(s, RSTART + RLENGTH)
    if (p > 1 && substr(T, p - 1, 1) ~ /[A-Za-z0-9_$.]/ && call !~ /^(fs|fsp)\./) continue
    n = ts_args(T, k)
    name = call; sub(/^.*\./, "", name); sub(/^new /, "", name)
    line = lineof(p)
    if (name ~ /^(execFileSync|execFile|spawnSync|spawn)$/) {
      if (n < 2 || TA[1] !~ /[Ss]qlite/) continue
      a = TA[2]; sub(/^[ \t\n]+/, "", a)
      w = ""
      if (substr(a, 1, 1) == "[") {
        m = ts_args(a, 1)
        for (i = 1; i <= m; i++) if (TA[i] !~ /^[ \t\n]*['"]-/) { w = TA[i]; break }
      }
      if (w != "" && ts_word(w) != ":memory:") write(line, ts_word(w), "sqlite3 on")
      continue
    }
    if (n < 1) continue
    if (name ~ /^(renameSync|copyFileSync|cpSync|symlinkSync|rename|copyFile|cp|symlink)$/) { if (n >= 2) write(line, ts_word(TA[2]), name " into"); continue }
    if (name == "DatabaseSync" && ts_word(TA[1]) == ":memory:") continue
    write(line, ts_word(TA[1]), name)
  }
  ts_assign(T)
}

# ts_word: a TypeScript expression as a shell word: path.join, path.resolve, path.dirname, and
# their bare forms read through their first argument, process.env.X $X, a string literal its
# text, an identifier $name, + and template literals joined
function ts_word(x,   out, k, n, c, e, q, a) {
  sub(/^[ \t\n]+/, "", x); sub(/[ \t\n]+$/, "", x)
  while (match(x, /^(path\.)?(join|resolve|dirname|normalize)[ \t]*\(/)) {
    a = x; k = RLENGTH
    if (ts_args(x, k) < 1) break
    x = TA[1]; sub(/^[ \t\n]+/, "", x); sub(/[ \t\n]+$/, "", x)
  }
  out = ""; n = length(x)
  for (k = 1; k <= n; k++) {
    c = substr(x, k, 1)
    if (c == "'" || c == "\"") { q = index(substr(x, k + 1), c); out = out substr(x, k + 1, q - 1); k += q; continue }
    if (c == "`") {
      q = index(substr(x, k + 1), "`"); a = substr(x, k + 1, q - 1); k += q
      gsub(/\$\{/, "$", a); gsub(/\}/, "", a); out = out a; continue
    }
    if (substr(x, k) ~ /^process\.env\./) { k += 11; match(substr(x, k + 1), /^[A-Za-z_][A-Za-z0-9_]*/); out = out "$" substr(x, k + 1, RLENGTH); k += RLENGTH; continue }
    if (c ~ /[A-Za-z_$]/) { match(substr(x, k), /^[A-Za-z_$][A-Za-z0-9_$]*/); out = out "$" substr(x, k, RLENGTH); k += RLENGTH - 1; continue }
    if (c ~ /[ \t\n+()]/) continue
    out = out c
  }
  return out
}

# ts_assign: the bindings and assignments of the file's scratch variables
function ts_assign(T,   s, p, v, e, x) {
  s = T
  while (match(s, /(^|[^A-Za-z0-9_$.])[A-Za-z_$][A-Za-z0-9_$]*[ \t]*=[^=>]/)) {
    p = length(T) - length(s) + RSTART
    x = substr(s, RSTART, RLENGTH)
    s = substr(s, RSTART + RLENGTH - 1)
    sub(/^[^A-Za-z_$]/, "", x); v = x; sub(/[ \t]*=.*$/, "", v)
    if (!((FILE SUBSEP v) in SV)) continue
    e = index(s, ";"); if (e == 0) e = length(s) + 1
    assign(lineof(p), v, ts_word(substr(s, 1, e - 1)), "=")
  }
}
