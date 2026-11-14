# store-fields.awk: the storage core's field validator engine (no summary line; the module
# library's fields functions run it, a module never does). It reads no storage and writes no
# storage: it checks a container's field declaration, applies a write's actions to a record,
# fills the read defaults, and reports what breaks a declaration.
#
# Operands: part=1 <declaration> part=2 <record> part=3 <actions>. The environment carries
# SF_MODE (decl, apply, effective, conforms), SF_LABEL (the function a refusal names),
# SF_TODAY (the date a today default fills), SF_RESERVED (the reserved field names), and
# SF_RESERVED_PREFIXES (the reserved name prefixes). The library prepends its UTF-8 check
# (utf8_ok) to this program.
#
# A declaration line: <name>: <required|optional> <line|block> [list] [one-of <A|B|...>]
# [default <value>]. A record, in the unit record dialect: a line field NAME: "value" (the
# payload escape: backslash, newline, tab, carriage return), a list one such line per item, a
# block field NAME :: with its body indented two spaces; declared fields in declaration
# order, a leftover after them in encounter order. An action line, tab separated: set, add,
# or remove <field> <escaped value>, unset <field>, or block <field> <base64 body>.
#
# A refusal is one stderr line <label>: error: <message> (<CODE>), exit 1, nothing on stdout.

part == 1 { D[++nd] = $0; next }
part == 2 { R[++nr] = $0; next }
part == 3 { A[++na] = $0; next }

END {
  LABEL = ENVIRON["SF_LABEL"]
  MODE = ENVIRON["SF_MODE"]
  INV = "ERR_INVALID_ARGUMENT"
  SV = "ERR_SCHEMA_VIOLATION"
  GRAMMAR = "a field line is <name>: <required|optional> <line|block> [list] [one-of <A|B|...>] [default <value>]"
  nreserved = split(ENVIRON["SF_RESERVED"], RES, / /)
  nprefix = split(ENVIRON["SF_RESERVED_PREFIXES"], PRE, / /)
  decl_parse()
  if (MODE == "decl") exit 0
  rec_parse()
  if (MODE == "effective") { work_from_record(); fill_defaults(0); emit(); exit 0 }
  if (MODE == "conforms") exit conforms()
  if (MODE == "apply") { apply(); emit(); exit 0 }
  fail(INV, "unknown mode '" MODE "'")
}

function fail(code, msg) {
  printf "%s: error: %s (%s)\n", LABEL, msg, code > "/dev/stderr"
  exit 1
}

function word(s,    i) {
  i = index(s, " ")
  return i ? substr(s, 1, i - 1) : s
}

function ltrim(s) {
  sub(/^ +/, "", s)
  return s
}

function reserved(n,    i, p) {
  for (i = 1; i <= nreserved; i++) if (RES[i] != "" && n == RES[i]) return 1
  for (i = 1; i <= nprefix; i++) {
    p = PRE[i]
    if (p != "" && substr(n, 1, length(p)) == p) return 1
  }
  return 0
}

function reserved_list(    i, s) {
  s = ""
  for (i = 1; i <= nreserved; i++) if (RES[i] != "") s = s (s == "" ? "" : ", ") RES[i]
  for (i = 1; i <= nprefix; i++) if (PRE[i] != "") s = s ", any name starting with " PRE[i]
  return s
}

function decl_parse(    i, l, c, name, rest, w, s, p, nv, k, vals) {
  nf = 0
  for (i = 1; i <= nd; i++) {
    l = D[i]
    if (index(l, "\r")) fail(INV, "declaration line " i " holds a carriage return")
    if (!utf8_ok(l)) fail(INV, "declaration line " i " is not valid UTF-8")
    if (l == "") fail(INV, "declaration line " i " is empty")
    c = index(l, ":")
    if (c < 2) fail(INV, "declaration line " i ": " GRAMMAR)
    name = substr(l, 1, c - 1)
    if (name !~ /^[a-z][a-z0-9_-]*$/) fail(INV, "field '" name "': a field name is lowercase letters, digits, underscore, and dash, starting with a letter")
    if (reserved(name)) fail(INV, "field '" name "': the name is reserved (" reserved_list() ")")
    if (name in DECL) fail(INV, "field '" name "': declared twice")
    rest = substr(l, c + 1)
    if (substr(rest, 1, 1) != " ") fail(INV, "field '" name "': " GRAMMAR)
    rest = ltrim(rest)
    w = word(rest)
    rest = ltrim(substr(rest, length(w) + 1))
    if (w != "required" && w != "optional") fail(INV, "field '" name "': the presence clause is required or optional, not '" w "'")
    PRES[name] = w
    w = word(rest)
    rest = ltrim(substr(rest, length(w) + 1))
    if (w != "line" && w != "block") fail(INV, "field '" name "': the shape clause is line or block, not '" w "'")
    SHAPE[name] = w
    LIST[name] = 0
    if (word(rest) == "list") {
      LIST[name] = 1
      rest = ltrim(substr(rest, 5))
    }
    HASSET[name] = 0
    if (word(rest) == "one-of") {
      s = substr(rest, 7) " "
      p = index(s, " default ")
      if (p) {
        SET[name] = substr(s, 2, p - 2)
        rest = substr(s, p + 1)
        rest = substr(rest, 1, length(rest) - 1)
      } else {
        SET[name] = substr(s, 2, length(s) - 2)
        rest = ""
      }
      if (SET[name] == "") fail(INV, "field '" name "': the one-of clause names no value")
      nv = split(SET[name], vals, /\|/)
      for (k = 1; k <= nv; k++) {
        if (vals[k] == "") fail(INV, "field '" name "': the one-of set '" SET[name] "' holds an empty value")
        ONEOF[name, vals[k]] = 1
      }
      HASSET[name] = 1
    }
    HASDEF[name] = 0
    if (word(rest) == "default") {
      DEF[name] = substr(rest, 9)
      if (DEF[name] == "") fail(INV, "field '" name "': the default clause takes a value")
      HASDEF[name] = 1
      rest = ""
    }
    if (rest != "") fail(INV, "field '" name "': unknown clause '" rest "' (" GRAMMAR ")")
    if (SHAPE[name] == "block" && LIST[name]) fail(INV, "field '" name "': a block field cannot be a list (no write form adds a block item)")
    if (SHAPE[name] == "block" && HASSET[name]) fail(INV, "field '" name "': a block field takes no one-of set")
    if (SHAPE[name] == "block" && HASDEF[name]) fail(INV, "field '" name "': a block field takes no default")
    if (LIST[name] && HASDEF[name]) fail(INV, "field '" name "': a list field takes no default")
    if (HASDEF[name] && PRES[name] == "required") fail(INV, "field '" name "': a required field takes no default (a default fills an absent optional field)")
    if (HASDEF[name] && HASSET[name] && DEF[name] == "today") fail(INV, "field '" name "': a today default cannot satisfy a one-of set")
    if (HASDEF[name] && HASSET[name] && !((name, DEF[name]) in ONEOF)) fail(INV, "field '" name "': the default '" DEF[name] "' is not one of " SET[name])
    DECL[name] = 1
    ORDER[++nf] = name
  }
}

function unesc(s,    out, i, n, c, d) {
  out = ""
  n = length(s)
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (c == "\\" && i < n) {
      d = substr(s, i + 1, 1)
      if (d == "\\") { out = out "\\"; i++; continue }
      if (d == "n") { out = out "\n"; i++; continue }
      if (d == "t") { out = out "\t"; i++; continue }
      if (d == "r") { out = out "\r"; i++; continue }
    }
    out = out c
  }
  return out
}

function esc(s,    out, i, n, c) {
  out = ""
  n = length(s)
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (c == "\\") out = out "\\" "\\"
    else if (c == "\n") out = out "\\" "n"
    else if (c == "\t") out = out "\\" "t"
    else if (c == "\r") out = out "\\" "r"
    else out = out c
  }
  return out
}

function rec_parse(    i, l, c, name, cur) {
  nrec = 0
  cur = ""
  for (i = 1; i <= nr; i++) {
    l = R[i]
    if (cur != "" && substr(l, 1, 2) == "  ") {
      RB[cur] = (RBN[cur] > 0 ? RB[cur] "\n" : "") substr(l, 3)
      RBN[cur]++
      continue
    }
    cur = ""
    if (l ~ /^[a-z][a-z0-9_-]* ::$/) {
      name = substr(l, 1, length(l) - 3)
      if (name in RK) fail(INV, "the record is malformed at line " i ": field '" name "' appears twice")
      RK[name] = "block"
      RB[name] = ""
      RBN[name] = 0
      RORD[++nrec] = name
      cur = name
      continue
    }
    c = index(l, ": \"")
    if (c > 1 && length(l) >= c + 3 && substr(l, length(l)) == "\"") {
      name = substr(l, 1, c - 1)
      if (name ~ /^[a-z][a-z0-9_-]*$/) {
        if (name in RK) {
          if (RK[name] != "line") fail(INV, "the record is malformed at line " i ": field '" name "' appears twice")
        } else {
          RK[name] = "line"
          RN[name] = 0
          RORD[++nrec] = name
        }
        RI[name, ++RN[name]] = unesc(substr(l, c + 3, length(l) - c - 3))
        continue
      }
    }
    fail(INV, "the record is malformed at line " i)
  }
}

function work_from_record(    k, f, j) {
  for (k = 1; k <= nrec; k++) {
    f = RORD[k]
    WK[f] = RK[f]
    if (RK[f] == "block") WB[f] = RB[f]
    else {
      WN[f] = RN[f]
      for (j = 1; j <= RN[f]; j++) WI[f, j] = RI[f, j]
    }
  }
}

function fill_defaults(dynamic,    k, f) {
  for (k = 1; k <= nf; k++) {
    f = ORDER[k]
    if (!HASDEF[f] || ((f in WK) && WK[f] != "")) continue
    if (DEF[f] == "today") {
      if (!dynamic) continue
      WI[f, 1] = ENVIRON["SF_TODAY"]
    } else WI[f, 1] = DEF[f]
    WK[f] = "line"
    WN[f] = 1
  }
}

function b64val(s,    i, n, c, v, bits, nb, out, chars) {
  B64BAD = 0
  B64NUL = 0
  if (!B64T) {
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    for (i = 1; i <= 64; i++) B64[substr(chars, i, 1)] = i - 1
    B64T = 1
  }
  n = length(s)
  if (n % 4 != 0) { B64BAD = 1; return "" }
  out = ""
  bits = 0
  nb = 0
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (c == "=") {
      if (i < n - 1 || (i == n - 1 && substr(s, n, 1) != "=")) { B64BAD = 1; return "" }
      break
    }
    if (!(c in B64)) { B64BAD = 1; return "" }
    bits = bits * 64 + B64[c]
    nb += 6
    if (nb >= 8) {
      nb -= 8
      v = int(bits / (2 ^ nb))
      bits -= v * (2 ^ nb)
      if (v == 0) B64NUL = 1
      else out = out sprintf("%c", v)
    }
  }
  return out
}

function has_item(f, v,    j) {
  for (j = 1; j <= WN[f]; j++) if (WI[f, j] == v) return j
  return 0
}

function apply(    i, n, F, op, f, v, j, create, k) {
  create = (nr == 0)
  for (i = 1; i <= na; i++) {
    n = split(A[i], F, /\t/)
    op = F[1]
    if (op == "unset") {
      if (n != 2 || F[2] == "") fail(INV, "action line " i " is malformed (unset <field>)")
    } else if (op == "set" || op == "add" || op == "remove" || op == "block") {
      if (n != 3 || F[2] == "") fail(INV, "action line " i " is malformed (" op " <field> <value>)")
    } else fail(INV, "action line " i " is malformed (set, add, remove, unset, or block)")
    AOP[i] = op
    AF[i] = F[2]
    if (op == "block") {
      v = b64val(F[3])
      if (B64BAD) fail(INV, "field '" F[2] "': the block body is not base64")
      ANUL[i] = B64NUL
      if (substr(v, length(v)) == "\n") v = substr(v, 1, length(v) - 1)
      AV[i] = v
    } else if (op != "unset") AV[i] = unesc(F[3])
  }
  for (i = 1; i <= na; i++) {
    if (AOP[i] == "unset") continue
    if (AOP[i] == "block" && ANUL[i]) fail(INV, "field '" AF[i] "': the block body holds a NUL byte")
    if (!utf8_ok(AV[i])) fail(INV, "field '" AF[i] "': the value is not valid UTF-8")
  }
  for (i = 1; i <= na; i++) {
    if (AOP[i] == "unset") continue
    if (AOP[i] == "block") { if (index(AV[i], "\r")) fail(INV, "field '" AF[i] "': the block body holds a carriage return") }
    else if (index(AV[i], "\n") || index(AV[i], "\r")) fail(INV, "field '" AF[i] "': a line value holds a newline or a carriage return")
  }
  for (i = 1; i <= na; i++) if (AOP[i] != "unset" && AV[i] == "") fail(INV, "field '" AF[i] "': an empty value (unset removes a field)")
  for (i = 1; i <= na; i++) {
    if (AF[i] in DECL) continue
    if (AOP[i] == "unset" && (AF[i] in RK)) continue
    fail(SV, "field '" AF[i] "' is not declared")
  }
  for (i = 1; i <= na; i++) {
    if ((AOP[i] == "set" || AOP[i] == "add") && HASSET[AF[i]] && !((AF[i], AV[i]) in ONEOF)) fail(SV, "field '" AF[i] "': '" AV[i] "' is not one of " SET[AF[i]])
  }
  for (i = 1; i <= na; i++) {
    f = AF[i]
    op = AOP[i]
    if (!(f in DECL) || op == "unset") continue
    if (op == "block" && SHAPE[f] != "block") fail(INV, "field '" f "' is a line field, not a block")
    if (op != "block" && SHAPE[f] == "block") fail(INV, "field '" f "' is a block field: its value comes as a block")
    if (op == "set" && LIST[f]) fail(INV, "field '" f "' is a list: add or remove its items")
    if ((op == "add" || op == "remove") && !LIST[f]) fail(INV, "field '" f "' is single: set its value")
  }
  work_from_record()
  for (i = 1; i <= na; i++) {
    f = AF[i]
    op = AOP[i]
    v = AV[i]
    if (op == "set") { WK[f] = "line"; WN[f] = 1; WI[f, 1] = v }
    else if (op == "block") { WK[f] = "block"; WB[f] = v }
    else if (op == "add") {
      if (WK[f] != "line") { WK[f] = "line"; WN[f] = 0 }
      if (has_item(f, v)) fail(INV, "field '" f "' already holds '" v "'")
      WI[f, ++WN[f]] = v
    } else if (op == "remove") {
      j = (WK[f] == "line") ? has_item(f, v) : 0
      if (!j) fail(INV, "field '" f "' holds no item '" v "'")
      for (k = j; k < WN[f]; k++) WI[f, k] = WI[f, k + 1]
      WN[f]--
      if (WN[f] == 0) { WK[f] = ""; EMPTIED[f] = "remove" }
    } else if (op == "unset") {
      if ((f in WK) && WK[f] != "") EMPTIED[f] = "unset"
      WK[f] = ""
    }
  }
  for (k = 1; k <= nf; k++) {
    f = ORDER[k]
    if (PRES[f] == "required" && (f in EMPTIED) && (!(f in WK) || WK[f] == "")) fail(SV, "field '" f "' is required: " EMPTIED[f] " would leave it absent")
  }
  if (create) fill_defaults(1)
  for (k = 1; k <= nf; k++) {
    f = ORDER[k]
    if (PRES[f] == "required" && (!(f in WK) || WK[f] == "")) fail(SV, "field '" f "' is required and absent")
  }
}

function put(f,    j, n, P) {
  if (!(f in WK) || WK[f] == "") return
  if (WK[f] == "block") {
    print f " ::"
    n = split(WB[f], P, /\n/)
    for (j = 1; j <= n; j++) print "  " P[j]
    return
  }
  for (j = 1; j <= WN[f]; j++) print f ": \"" esc(WI[f, j]) "\""
}

function emit(    k) {
  for (k = 1; k <= nf; k++) put(ORDER[k])
  for (k = 1; k <= nrec; k++) if (!(RORD[k] in DECL)) put(RORD[k])
}

function conforms(    k, f, j, bad) {
  bad = 0
  for (k = 1; k <= nf; k++) {
    f = ORDER[k]
    if (!(f in RK)) {
      if (PRES[f] == "required") { print f ": required and absent"; bad = 1 }
      continue
    }
    if (SHAPE[f] == "block" && RK[f] != "block") { print f ": stored as a line where a block is declared"; bad = 1; continue }
    if (SHAPE[f] == "line" && RK[f] == "block") { print f ": stored as a block where a line is declared"; bad = 1; continue }
    if (SHAPE[f] == "block") continue
    if (!LIST[f] && RN[f] > 1) { print f ": holds " RN[f] " values where one is declared"; bad = 1; continue }
    if (HASSET[f]) {
      for (j = 1; j <= RN[f]; j++) {
        if (!((f, RI[f, j]) in ONEOF)) { print f ": '" RI[f, j] "' is not one of " SET[f]; bad = 1; break }
      }
    }
  }
  for (k = 1; k <= nrec; k++) {
    f = RORD[k]
    if (!(f in DECL)) { print f ": not declared (a leftover field)"; bad = 1 }
  }
  return bad
}
