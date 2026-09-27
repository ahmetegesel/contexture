#!/usr/bin/awk -f
# docs-edit.awk: the structural edit engine of the docs write verbs (private engine; the
# helper docs-io.sh runs it for ctx docs new, write, header, rule, pitfall, entry, section,
# replace, ids, and query --entry).
#
# Operands: part=1 <the grammar template> part=2 <the doc> [part=3 <a payload>]. Only the
# grammar's #% schema lines are read; the doc is empty for a new doc; the payload is the
# --stdin field value or the block of a section write. The part=N operands are bounded
# tokens; the request itself comes through the environment only, never awk -v, so free
# text keeps its bytes:
#   EDIT_VERB (the verb named in messages), EDIT_OP (new, write, header, rule, entry,
#   section, ids, show, replace), EDIT_REPO, EDIT_SLUG, EDIT_KIND, EDIT_BLOCK, EDIT_KEY,
#   EDIT_AFTER, EDIT_FIRST, EDIT_REMOVE, EDIT_ID, EDIT_DRY, EDIT_NOEOL (the doc lacks a
#   final newline), EDIT_OLD, EDIT_NEW, and the field actions: EDIT_NA with EDIT_A_<n>
#   (set, unset, add, remove), EDIT_F_<n> (the field), EDIT_V_<n> (the value; trailing
#   newlines dropped, so a value read from a file keeps its text); EDIT_STDIN_N names the action a --stdin value fills from the payload operand (never the environment, whatever its size).
#
# Success: the whole new doc on stdout, every untouched line byte for byte, and the note
# on stderr (<address> <what>; the dry run adds the changed lines after it), rc 0. The show
# op prints the addressed entry's raw lines instead of a doc. A refusal: one line on
# stderr naming the reason and its error code, nothing on stdout, rc 1.

BEGIN {
    VERB = ENVIRON["EDIT_VERB"]
    if (VERB == "") VERB = "ctx docs"
    OP = ENVIRON["EDIT_OP"]
    REPO = ENVIRON["EDIT_REPO"]
    SLUG = ENVIRON["EDIT_SLUG"]
    KIND = ENVIRON["EDIT_KIND"]
    BLOCK = ENVIRON["EDIT_BLOCK"]
    KEY = ENVIRON["EDIT_KEY"]
    AFTER = ENVIRON["EDIT_AFTER"]
    FIRST = (ENVIRON["EDIT_FIRST"] == "1")
    REMOVE = (ENVIRON["EDIT_REMOVE"] == "1")
    IDSET = ENVIRON["EDIT_ID"]
    DRY = (ENVIRON["EDIT_DRY"] == "1")
    NOEOL = (ENVIRON["EDIT_NOEOL"] == "1")
    OLDTXT = ENVIRON["EDIT_OLD"]
    NEWTXT = ENVIRON["EDIT_NEW"]
    NA = ENVIRON["EDIT_NA"] + 0
    for (i = 1; i <= NA; i++) {
        AA[i] = ENVIRON["EDIT_A_" i]
        AF[i] = ENVIRON["EDIT_F_" i]
        AV[i] = ENVIRON["EDIT_V_" i]
        sub(/\n+$/, "", AV[i])
    }
    CR = sprintf("%c", 13)
    n = 0
    np = 0
}

part == 1 {
    if (substr($0, 1, 3) == "#% ") schema_line(substr($0, 4))
    next
}
part == 2 { L[++n] = $0; next }
part == 3 { P[++np] = $0; next }

# ---------------------------------------------------------------- messages and helpers

function say(s) {
    print s > "/dev/stderr"
}

function refuse(msg) {
    say(VERB ": " msg)
    exit 1
}

function spaces(k,    s) {
    s = ""
    while (k-- > 0) s = s " "
    return s
}

function join(a, from, to,    s, i) {
    s = ""
    for (i = from; i <= to; i++) s = s (i > from ? " " : "") a[i]
    return s
}

function dash(f,    s) {
    s = f
    gsub(/_/, "-", s)
    return s
}

function unquote(v) {
    if (length(v) >= 2 && substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") return substr(v, 2, length(v) - 2)
    return v
}

function blank(s) {
    return s ~ /^[ \t]*$/
}

function key_ok(s) {
    return s ~ /^[A-Za-z0-9][A-Za-z0-9._-]*$/
}

# ---------------------------------------------------------------- the #% schema

function schema_line(s,    a, m, i, j, k, b, nb, bl, kv, v) {
    m = split(s, a, " ")
    if (a[1] == "kinds") {
        for (i = 2; i <= m; i++) KINDOK[a[i]] = 1
        KINDLIST = join(a, 2, m)
    } else if (a[1] == "header") {
        b = "@doc"
        FN[b]++
        FNAME[b, FN[b]] = a[2]
        FT[b, a[2]] = a[3]
        FP[b, a[2]] = a[4]
        FX[b, a[2]] = FN[b]
        FV[b, a[2]] = ""
    } else if (a[1] == "requires") {
        for (j = 2; j <= m && a[j] != "header"; j++) ;
        for (i = 2; i < j; i++) HREQ[a[i], a[j + 1]] = 1
    } else if (a[1] == "block") {
        b = a[2]
        BS[b] = a[3]
        BO[b] = 0
        BF[b] = ""
        BK[b] = ""
        for (i = 4; i <= m; i++) {
            k = index(a[i], "=")
            if (k == 0) continue
            kv = substr(a[i], 1, k - 1)
            v = substr(a[i], k + 1)
            if (kv == "first") BF[b] = v
            else if (kv == "key") BK[b] = v
            else if (kv == "order") BO[b] = v + 0
        }
        NBL++
        BLN[NBL] = b
    } else if (a[1] == "field") {
        nb = split(a[2], bl, "|")
        for (j = 1; j <= nb; j++) {
            b = bl[j]
            FN[b]++
            FNAME[b, FN[b]] = a[3]
            FT[b, a[3]] = a[4]
            FP[b, a[3]] = a[5]
            FX[b, a[3]] = FN[b]
            FV[b, a[3]] = (m >= 6) ? " " join(a, 6, m) " " : ""
        }
    } else if (a[1] == "allows") {
        for (j = 2; j <= m && a[j] != "blocks"; j++) ;
        for (i = 2; i < j; i++) for (k = j + 1; k <= m; k++) ALLOW[a[i], a[k]] = 1
    }
}

function field_list(b,    s, i) {
    s = ""
    for (i = 1; i <= FN[b]; i++) s = s (i > 1 ? ", " : "") dash(FNAME[b, i])
    return s
}

function list_blocks(    s, i) {
    s = ""
    for (i = 1; i <= NBL; i++) if (BS[BLN[i]] == "list") s = s (s == "" ? "" : ", ") BLN[i]
    return s
}

function kind_blocks(k,    s, i) {
    s = ""
    for (i = 1; i <= NBL; i++) if ((k, BLN[i]) in ALLOW) s = s (s == "" ? "" : ", ") BLN[i]
    return s
}

# a field required on write: the schema's required and new marks, and the header fields
# the kind requires (sources, keywords)
function required(b, f) {
    if (FP[b, f] == "required" || FP[b, f] == "new") return 1
    if (b == "@doc" && ((DKIND, f) in HREQ)) return 1
    return 0
}

function id_letter(b) {
    if (b == "contract") return "r"
    if (b == "responsibilities") return "o"
    if (b == "pitfalls") return "p"
    if (b == "caveats") return "c"
    return ""
}

# ---------------------------------------------------------------- value checks

function check_value(b, f, v,    ty) {
    if (index(v, CR)) refuse("a carriage return in the value of " dash(f) " (ERR_INVALID_ARGUMENT)")
    ty = FT[b, f]
    if (ty != "text" && index(v, "\n")) refuse("a newline in the one-line field " dash(f) " (ERR_INVALID_ARGUMENT)")
    if (v == "") refuse("an empty value for " dash(f) "; --unset=" dash(f) " removes a field (ERR_INVALID_ARGUMENT)")
    if (ty == "enum" && index(FV[b, f], " " v " ") == 0) {
        refuse(dash(f) " takes one of:" substr(FV[b, f], 1, length(FV[b, f]) - 1) " (got '" v "') (ERR_SCHEMA_VIOLATION)")
    }
    if (ty == "int" && v !~ /^[0-9]+$/) refuse(dash(f) " takes a whole number (got '" v "') (ERR_SCHEMA_VIOLATION)")
    if (ty == "id") check_id(b, v)
    if (f == "evidence" && (v ~ /:[0-9]+([ "]|$)/ || v ~ /line[s]?[ ]+[0-9]+/ || v ~ /(:|#)L[0-9]+/)) {
        refuse("evidence must be greppable code symbols, never line numbers: '" v "' (ERR_SCHEMA_VIOLATION)")
    }
}

function check_id(b, v,    pre) {
    pre = DSLUG "-" id_letter(b)
    if (index(v, pre) != 1 || substr(v, length(pre) + 1) !~ /^[1-9][0-9]*$/) {
        refuse("an id of @" b " in this doc reads " pre "<N> (got '" v "') (ERR_SCHEMA_VIOLATION)")
    }
}

# split_items <comma list> <array>: the items, split at depth zero (a glob's {a,b} keeps its
# comma), each trimmed; an empty item refuses
function split_items(s, arr, f,    i, ch, depth, cur, cnt) {
    depth = 0
    cur = ""
    cnt = 0
    for (i = 1; i <= length(s); i++) {
        ch = substr(s, i, 1)
        if (ch == "{" || ch == "[") depth++
        else if (ch == "}" || ch == "]") depth--
        if (ch == "," && depth == 0) {
            gsub(/^[ \t]+|[ \t]+$/, "", cur)
            if (cur == "") refuse("an empty item in the list " dash(f) " (ERR_INVALID_ARGUMENT)")
            arr[++cnt] = cur
            cur = ""
        } else cur = cur ch
    }
    gsub(/^[ \t]+|[ \t]+$/, "", cur)
    if (cur != "" || cnt > 0) {
        if (cur == "") refuse("an empty item in the list " dash(f) " (ERR_INVALID_ARGUMENT)")
        arr[++cnt] = cur
    }
    return cnt
}

function join_items(arr, cnt,    s, i) {
    s = ""
    for (i = 1; i <= cnt; i++) s = s (i > 1 ? ", " : "") arr[i]
    return s
}

# ---------------------------------------------------------------- the doc's structure

function parse_doc(    i, b, e, w) {
    NB = 0
    for (i = 1; i <= n; i++) {
        if (substr(L[i], 1, 1) == "@") {
            NB++
            BST[NB] = i
            split(L[i], w, " ")
            BNM[NB] = substr(w[1], 2)
            BID[NB] = w[2]
            BW3[NB] = w[3]
        }
    }
    for (b = 1; b <= NB; b++) {
        e = (b < NB) ? BST[b + 1] - 1 : n
        while (e > BST[b] && blank(L[e])) e--
        BEN[b] = e
    }
    DKIND = ""
    DSLUG = SLUG
    if (NB > 0 && BST[1] == 1 && BNM[1] == "doc") {
        DKIND = BID[1]
        DSLUG = BW3[1]
    }
}

function need_doc() {
    if (!(NB > 0 && BST[1] == 1 && BNM[1] == "doc")) refuse("the stored doc does not open with its @doc line (ERR_SCHEMA_VIOLATION)")
}

# the blocks named <b> (a rule by its id): FOUND is the count, FB the first
function find_block(b, id,    i) {
    FOUND = 0
    FB = 0
    for (i = 1; i <= NB; i++) {
        if (BNM[i] != b) continue
        if (b == "rule" && BID[i] != id) continue
        FOUND++
        if (FB == 0) FB = i
    }
}

function parse_entries(b,    i, k) {
    NE = 0
    for (i = BST[b] + 1; i <= BEN[b]; i++) if (substr(L[i], 1, 4) == "  - ") EST[++NE] = i
    for (k = 1; k <= NE; k++) {
        EEN[k] = (k < NE) ? EST[k + 1] - 1 : BEN[b]
        while (EEN[k] > EST[k] && blank(L[EEN[k]])) EEN[k]--
    }
}

# field_name <line> <indent>: the field a line opens at that indent (name, then : or ::)
function field_name(s, ind,    r) {
    if (substr(s, 1, ind) != spaces(ind)) return ""
    r = substr(s, ind + 1)
    if (!match(r, /^[a-z_][a-z0-9_]*[ ]*:/)) return ""
    r = substr(r, 1, RLENGTH - 1)
    sub(/[ ]+$/, "", r)
    return r
}

# load_unit <first> <last> <indent> <head> <block>: the fields of an entry (head 1: the first
# line is "  - <first field>") or of a map block or header (head 0), each field with its
# lines verbatim (its block scalar body and any continuation included); UPRE holds lines
# before the first field
function load_unit(s, e, ind, head, b,    i, nm, cur) {
    UC = 0
    UPRE = ""
    UPREN = 0
    UHEAD = head
    UIND = ind
    UB = b
    for (i = s; i <= e; i++) {
        nm = ""
        if (head && i == s) {
            if (FT[b, BF[b]] == "bare") nm = BF[b]
            else nm = field_name(substr(L[i], 5), 0)
            if (nm == "") nm = "?"
        } else nm = field_name(L[i], ind)
        if (nm != "") {
            UC++
            UN[UC] = nm
            UL[UC] = L[i]
            UCH[UC] = 0
        } else if (UC == 0) {
            UPRE = UPRE (UPREN++ ? "\n" : "") L[i]
        } else {
            UL[UC] = UL[UC] "\n" L[i]
        }
    }
}

function unit_find(f,    j) {
    for (j = 1; j <= UC; j++) if (UN[j] == f) return j
    return 0
}

# the value a unit field holds: a one-line value unquoted, a block scalar's body lines
# with their indent removed
function unit_value(j,    t, m, parts, first, v, k, pl, bodyind) {
    m = split(UL[j], parts, "\n")
    first = parts[1]
    pl = (UHEAD && j == 1) ? 4 : UIND
    v = substr(first, pl + 1)
    if (UHEAD && j == 1 && FT[UB, UN[j]] == "bare") return unquote(v)
    k = index(v, ":")
    v = substr(v, k + 1)
    if (substr(v, 1, 1) == ":") {
        bodyind = (UB == "@doc" || BS[UB] == "map") ? 4 : 6
        t = ""
        for (k = 2; k <= m; k++) t = t (k > 2 ? "\n" : "") substr(parts[k], bodyind + 1)
        return t
    }
    sub(/^[ ]+/, "", v)
    return unquote(v)
}

function unit_scalar(j,    first) {
    first = UL[j]
    if (index(first, "\n")) first = substr(first, 1, index(first, "\n") - 1)
    return first ~ /::[ ]*$/
}

function unit_quoted(j,    first, k) {
    first = UL[j]
    if (index(first, "\n")) first = substr(first, 1, index(first, "\n") - 1)
    k = index(first, ":")
    first = substr(first, k + 1)
    sub(/^[ ]+/, "", first)
    return substr(first, 1, 1) == "\""
}

# the raw item text of a list field (between the brackets)
function unit_items(j, arr,    v) {
    v = UL[j]
    if (index(v, "\n")) v = substr(v, 1, index(v, "\n") - 1)
    v = substr(v, index(v, ":") + 1)
    sub(/^[ ]+/, "", v)
    sub(/[ ]+$/, "", v)
    if (substr(v, 1, 1) == "[") v = substr(v, 2)
    if (substr(v, length(v), 1) == "]") v = substr(v, 1, length(v) - 1)
    if (v ~ /^[ \t]*$/) return 0
    return split_items(v, arr, UN[j])
}

# render one field's lines (joined by newlines) at the unit's layout
function render(j_is_head, f, v, scalar, quoted,    ty, pfx, bodyind, out, m, parts, i) {
    ty = FT[UB, f]
    pfx = j_is_head ? "  - " : spaces(UIND)
    bodyind = (UB == "@doc" || BS[UB] == "map") ? 4 : 6
    if (ty == "bare") return pfx "\"" v "\""
    if (ty == "list") return pfx f ": [" v "]"
    if (ty == "text") {
        if (index(v, "\n") || scalar) {
            out = pfx f " ::"
            m = split(v, parts, "\n")
            for (i = 1; i <= m; i++) out = out "\n" (parts[i] == "" ? "" : spaces(bodyind) parts[i])
            return out
        }
        return pfx f ": \"" v "\""
    }
    if (ty == "word" && (quoted || v !~ /^[A-Za-z0-9._\/*@+-]+$/)) return pfx f ": \"" v "\""
    return pfx f ": " v
}

# insert a new field at its schema position (never before an entry's head line)
function unit_insert(f, text,    j, p, k) {
    p = UC + 1
    for (j = 1; j <= UC; j++) {
        if (UHEAD && j == 1) continue
        if (((UB, UN[j]) in FX) && FX[UB, UN[j]] > FX[UB, f]) { p = j; break }
    }
    for (k = UC; k >= p; k--) { UN[k + 1] = UN[k]; UL[k + 1] = UL[k]; UCH[k + 1] = UCH[k] }
    UC++
    UN[p] = f
    UL[p] = text
    UCH[p] = 1
    return p
}

function unit_delete(j,    k) {
    for (k = j; k < UC; k++) { UN[k] = UN[k + 1]; UL[k] = UL[k + 1]; UCH[k] = UCH[k + 1] }
    UC--
}

function unit_text(    s, j) {
    s = UPRE
    for (j = 1; j <= UC; j++) s = s ((s != "" || j > 1 || UPREN) ? "\n" : "") UL[j]
    return s
}

# apply the field actions to the loaded unit; ACTED lists the fields changed. <isnew> 1 for
# a new entry or block (ids may be given there; the fields must all be the kind's)
function apply_actions(isnew,    i, a, f, v, j, cnt, items, k, found, ty) {
    ACTED = ""
    for (i = 1; i <= NA; i++) {
        a = AA[i]
        f = AF[i]
        v = AV[i]
        if (!((UB, f) in FT) || (UB == "@doc" && f == "repo")) {
            refuse("unknown field '" dash(f) "' for " (UB == "@doc" ? "the header" : "@" UB) " (fields: " (UB == "@doc" ? header_fields() : field_list(UB)) ") (ERR_SCHEMA_VIOLATION)")
        }
        ty = FT[UB, f]
        if (ty == "id" && !isnew) refuse("ids are stable: " dash(f) " cannot be set or removed on an existing entry (ERR_INVALID_ARGUMENT)")
        j = unit_find(f)
        if (a == "set") {
            if (ty == "list") {
                if (index(v, CR)) refuse("a carriage return in the value of " dash(f) " (ERR_INVALID_ARGUMENT)")
                if (index(v, "\n")) refuse("a newline in the one-line field " dash(f) " (ERR_INVALID_ARGUMENT)")
                split("", items)
                cnt = split_items(v, items, f)
                if (cnt == 0) refuse("an empty value for " dash(f) "; --unset=" dash(f) " removes a field (ERR_INVALID_ARGUMENT)")
                v = join_items(items, cnt)
            } else check_value(UB, f, v)
            if (j) {
                UL[j] = render(UHEAD && j == 1, f, v, unit_scalar(j), unit_quoted(j))
                UCH[j] = 1
            } else unit_insert(f, render(0, f, v, 0, 0))
        } else if (a == "unset") {
            if (!j) refuse(dash(f) " is absent from " unit_name() " (ERR_ENTITY_NOT_FOUND)")
            if (required(UB, f) || (UHEAD && j == 1)) refuse(dash(f) " is required and cannot be removed (ERR_SCHEMA_VIOLATION)")
            unit_delete(j)
        } else if (a == "add" || a == "remove") {
            if (ty != "list") refuse("--" a "-" dash(f) " applies to a list field; " dash(f) " is not one (ERR_INVALID_ARGUMENT)")
            if (index(v, CR)) refuse("a carriage return in the value of " dash(f) " (ERR_INVALID_ARGUMENT)")
            if (index(v, "\n")) refuse("a newline in the one-line field " dash(f) " (ERR_INVALID_ARGUMENT)")
            gsub(/^[ \t]+|[ \t]+$/, "", v)
            if (v == "") refuse("an empty item for " dash(f) " (ERR_INVALID_ARGUMENT)")
            split("", items)
            cnt = j ? unit_items(j, items) : 0
            found = 0
            for (k = 1; k <= cnt; k++) if (items[k] == v || unquote(items[k]) == v) found = k
            if (a == "add") {
                if (found) refuse("'" v "' is already listed in " dash(f) " (ERR_ENTITY_EXISTS)")
                items[++cnt] = v
            } else {
                if (!found) refuse("'" v "' is not listed in " dash(f) " (ERR_ENTITY_NOT_FOUND)")
                for (k = found; k < cnt; k++) items[k] = items[k + 1]
                cnt--
                # the last item gone: the field goes with it (an empty list is no value), which a
                # required field refuses, as --unset does
                if (cnt == 0) {
                    if (required(UB, f) || (UHEAD && j == 1)) refuse("removing '" v "' would empty " dash(f) "; " dash(f) " is required and cannot be removed (ERR_SCHEMA_VIOLATION)")
                    unit_delete(j)
                    if (index(" " ACTED " ", " " dash(f) " ") == 0) ACTED = ACTED (ACTED == "" ? "" : ", ") dash(f)
                    continue
                }
            }
            if (j) {
                UL[j] = render(UHEAD && j == 1, f, join_items(items, cnt), 0, 0)
                UCH[j] = 1
            } else unit_insert(f, render(0, f, join_items(items, cnt), 0, 0))
        } else refuse("unknown field action '" a "' (ERR_INVALID_ARGUMENT)")
        if (index(" " ACTED " ", " " dash(f) " ") == 0) ACTED = ACTED (ACTED == "" ? "" : ", ") dash(f)
    }
}

function header_fields(    s, i) {
    s = ""
    for (i = 1; i <= FN["@doc"]; i++) if (FNAME["@doc", i] != "repo") s = s (s == "" ? "" : ", ") dash(FNAME["@doc", i])
    return s
}

function unit_name() {
    if (UB == "@doc") return "the header"
    return "the entry"
}

# ---------------------------------------------------------------- output

# the edits: DEL[i] drops line i; BEFORE[i] and AFT[i] carry lines emitted before and
# after line i (BEFORE[n + 1] appends); a doc is rebuilt only from them
function splice(s, e, t, has,    j) {
    for (j = s; j <= e; j++) DEL[j] = 1
    if (has) BEFORE[s] = ((s in BEFORE) ? BEFORE[s] "\n" : "") t
}

function emit_text(t,    m, parts, i) {
    m = split(t, parts, "\n")
    if (m == 0) { O[++NO] = ""; return }
    for (i = 1; i <= m; i++) O[++NO] = parts[i]
}

function emit_doc(    i) {
    NO = 0
    for (i = 1; i <= n + 1; i++) {
        if (i in BEFORE) emit_text(BEFORE[i])
        if (i <= n && !(i in DEL)) O[++NO] = L[i]
        if (i in AFT) emit_text(AFT[i])
    }
    for (i = 1; i <= NO; i++) {
        if (i == NO && NOEOL) printf "%s", O[i]
        else print O[i]
    }
}

# delete block b with one blank line beside it (the one before it, else the one after)
function delete_block(b,    s, e) {
    s = BST[b]
    e = BEN[b]
    if (s > 1 && blank(L[s - 1])) s--
    else if (e < n && blank(L[e + 1])) e++
    splice(s, e, "", 0)
}

# insert a whole new block (its lines joined by newlines) at the schema position of <b>:
# after the last block whose order is not past it
function insert_block_schema(b, text,    i, p, bo) {
    p = 1
    for (i = 1; i <= NB; i++) {
        bo = (BNM[i] == "doc") ? 0 : BO[BNM[i]]
        if (((BNM[i]) in BO) || BNM[i] == "doc") if (bo <= BO[b]) p = i
    }
    splice(BEN[p] + 1, BEN[p], "\n" text, 1)
}

function insert_block_after(p, text) {
    splice(BEN[p] + 1, BEN[p], "\n" text, 1)
}

function insert_block_before(p, text) {
    splice(BST[p], BST[p] - 1, text "\n", 1)
}

# ---------------------------------------------------------------- entries and keys

# the key an entry answers to: its id (id-keyed kinds), its first field's value (natural
# keys), from>to for data_flow and direction:key for edges; empty when keyless
function entry_key(b, k) {
    load_unit(EST[k], EEN[k], 4, 1, b)
    if (BK[b] == "" || BK[b] == "none") return ""
    return rekey_value()
}

# the entry of block b a key addresses: #N by ordinal, else by its key; refuses when none
# or several match
function find_entry(b, key,    k, hits, at) {
    if (key ~ /^#[0-9]+$/) {
        k = substr(key, 2) + 0
        if (k < 1 || k > NE) refuse("@" BNM[b] " has no entry " key " (" NE " entries) (ERR_ENTITY_NOT_FOUND)")
        return k
    }
    hits = 0
    at = 0
    for (k = 1; k <= NE; k++) if (entry_key(BNM[b], k) == key) { hits++; if (!at) at = k }
    if (hits == 0) refuse("@" BNM[b] " has no entry '" key "' (ERR_ENTITY_NOT_FOUND)")
    if (hits > 1) refuse("@" BNM[b] " has " hits " entries keyed '" key "'; address one by #N (ERR_INVALID_ARGUMENT)")
    return at
}

# every id value the doc carries (an id field at an entry head or on its own line)
function doc_ids(    i, v) {
    split("", IDS)
    for (i = 1; i <= n; i++) {
        if (L[i] ~ /^[ ]*(- )?id:[ ]*/) {
            v = L[i]
            sub(/^[ ]*(- )?id:[ ]*/, "", v)
            sub(/[ ]+$/, "", v)
            IDS[unquote(v)] = i
        }
    }
}

# one more than the highest <slug>-<letter><N> the doc carries
function next_id(b) {
    return DSLUG "-" id_letter(b) (max_id(b) + 1)
}

# ---------------------------------------------------------------- the ops

function op_new(    b, i, j, f, t, text) {
    if (!(KIND in KINDOK)) refuse("unknown doc kind '" KIND "' (kinds: " KINDLIST ") (ERR_SCHEMA_VIOLATION)")
    DKIND = KIND
    DSLUG = SLUG
    UB = "@doc"
    UC = 0
    UPRE = ""
    UPREN = 0
    UHEAD = 0
    UIND = 2
    UC = 1
    UN[1] = "repo"
    UL[1] = "  repo: " REPO
    UCH[1] = 1
    apply_actions(1)
    for (i = 1; i <= FN["@doc"]; i++) {
        f = FNAME["@doc", i]
        if (required("@doc", f) && !unit_find(f)) refuse("a " KIND " doc requires " dash(f) " (--" dash(f) "=...) (ERR_SCHEMA_VIOLATION)")
    }
    text = "@doc " KIND " " SLUG "\n" unit_text()
    NOEOL = 0
    n = 0
    BEFORE[1] = text
    NOTE = "created (" KIND ")"
}

function op_write(    i, w, r, lastline) {
    for (i = 1; i <= n; i++) if (index(L[i], CR)) refuse("a carriage return in the doc at line " i " (ERR_INVALID_ARGUMENT)")
    if (n == 0) refuse("the doc on stdin is empty (ERR_INVALID_ARGUMENT)")
    split(L[1], w, " ")
    if (w[1] != "@doc") refuse("the doc on stdin must open with its @doc line naming " SLUG " (ERR_SCHEMA_VIOLATION)")
    if (w[3] != SLUG) refuse("the @doc line names slug '" w[3] "', the address names '" SLUG "' (ERR_SCHEMA_VIOLATION)")
    r = ""
    lastline = 0
    for (i = 2; i <= n && !blank(L[i]) && substr(L[i], 1, 1) != "@"; i++) {
        if (L[i] ~ /^  repo:[ ]*/) { r = L[i]; sub(/^  repo:[ ]*/, "", r); sub(/[ ]+$/, "", r) }
        if (field_name(L[i], 2) != "") lastline = i
    }
    if (r != REPO) refuse("the header names repo '" r "', the address names '" REPO "' (ERR_SCHEMA_VIOLATION)")
    NOTE = "written (" n " lines)"
    if (lastline > 12) NOTE = NOTE "; warning: a header field sits at line " lastline ", past the line-12 window the nudge reads"
}

function op_header(    t) {
    need_doc()
    if (NA == 0) refuse("no field to change (ERR_INVALID_ARGUMENT)")
    load_unit(2, BEN[1], 2, 0, "@doc")
    apply_actions(0)
    t = unit_text()
    if (BEN[1] >= 2) splice(2, BEN[1], t, t != "")
    else if (t != "") splice(2, 1, t, 1)
    NOTE = "header updated (" ACTED ")"
}

function op_rule(    b, p, t, i, f) {
    need_doc()
    if (KEY !~ /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/) refuse("a rule is addressed <category>/<rule-slug> (got '" KEY "') (ERR_INVALID_ARGUMENT)")
    find_block("rule", KEY)
    if (FOUND > 1) refuse("the doc carries rule/" KEY " " FOUND " times (ERR_SCHEMA_VIOLATION)")
    b = FB
    if (REMOVE) {
        if (!b) refuse("no rule/" KEY " in " REPO "/" SLUG " (ERR_ENTITY_NOT_FOUND)")
        if (NA > 0 || AFTER != "" || FIRST) refuse("--remove takes no field or placement (ERR_INVALID_ARGUMENT)")
        delete_block(b)
        NOTE = "rule/" KEY " removed (the rule slug is not recycled)"
        return
    }
    if (b) {
        if (AFTER != "" || FIRST) refuse("placement applies to a new rule; rule/" KEY " exists (ERR_INVALID_ARGUMENT)")
        if (NA == 0) refuse("no field to change (ERR_INVALID_ARGUMENT)")
        load_unit(BST[b] + 1, BEN[b], 2, 0, "rule")
        apply_actions(0)
        splice(BST[b] + 1, BEN[b], unit_text(), 1)
        NOTE = "rule/" KEY " updated (" ACTED ")"
        return
    }
    if (!((DKIND, "rule") in ALLOW)) refuse("a " DKIND " doc carries no @rule block (its blocks: " kind_blocks(DKIND) ") (ERR_SCHEMA_VIOLATION)")
    UB = "rule"
    UC = 0
    UPRE = ""
    UPREN = 0
    UHEAD = 0
    UIND = 2
    apply_actions(1)
    for (i = 1; i <= FN["rule"]; i++) {
        f = FNAME["rule", i]
        if (required("rule", f) && !unit_find(f)) refuse("a new rule requires " dash(f) " (--" dash(f) "=...) (ERR_SCHEMA_VIOLATION)")
    }
    t = "@rule " KEY "\n" unit_text()
    if (AFTER != "") {
        find_block("rule", AFTER)
        if (!FB) refuse("no rule/" AFTER " to place after (ERR_ENTITY_NOT_FOUND)")
        insert_block_after(FB, t)
        NOTE = "rule/" KEY " added after rule/" AFTER
    } else if (FIRST) {
        p = 0
        for (i = 1; i <= NB; i++) if (BNM[i] == "rule") { p = i; break }
        if (p) insert_block_before(p, t)
        else insert_block_after(NB, t)
        NOTE = "rule/" KEY " added first"
    } else {
        insert_block_after(NB, t)
        NOTE = "rule/" KEY " added at the end"
    }
    if (DRY) SHOW = t
}

function op_entry(    b, k, t, i, f, key, id, pos, nk, lastk, letter, newkey) {
    need_doc()
    if (!(BLOCK in BS)) refuse("unknown block '" BLOCK "' (list blocks: " list_blocks() ") (ERR_SCHEMA_VIOLATION)")
    if (BLOCK == "rule") refuse("a @rule block is written by ctx docs rule (ERR_INVALID_ARGUMENT)")
    if (BS[BLOCK] != "list") refuse("@" BLOCK " is not a list block; ctx docs section writes it whole (ERR_INVALID_ARGUMENT)")
    find_block(BLOCK, "")
    if (FOUND > 1) refuse("the doc carries @" BLOCK " " FOUND " times (ERR_SCHEMA_VIOLATION)")
    b = FB
    if (b) parse_entries(b)
    else NE = 0
    if (KEY != "") {
        if (!b) refuse("the doc carries no @" BLOCK " block (ERR_ENTITY_NOT_FOUND)")
        k = find_entry(b, KEY)
        if (AFTER != "" || FIRST) refuse("placement applies to a new entry; " BLOCK "/" KEY " exists (ERR_INVALID_ARGUMENT)")
        if (IDSET != "") refuse("ids are stable: --id applies to a new entry only (ERR_INVALID_ARGUMENT)")
        if (REMOVE) {
            if (NA > 0) refuse("--remove takes no field (ERR_INVALID_ARGUMENT)")
            key = entry_key(BLOCK, k)
            nk = 0
            for (i = BST[b] + 1; i <= BEN[b]; i++) if (i < EST[k] || i > EEN[k]) if (!blank(L[i])) nk++
            if (nk == 0) delete_block(b)
            else {
                t = EST[k]
                lastk = EEN[k]
                splice(t, lastk, "", 0)
            }
            NOTE = BLOCK "/" KEY " removed" ((BK[BLOCK] == "id" && key != "") ? " (the id " key " retires)" : "")
            return
        }
        if (NA == 0) refuse("no field to change (ERR_INVALID_ARGUMENT)")
        load_unit(EST[k], EEN[k], 4, 1, BLOCK)
        apply_actions(0)
        t = unit_text()
        # a natural key rewritten must stay unique in the block (entry_key reloads the unit,
        # so the new text is kept first)
        if (BK[BLOCK] != "id" && BK[BLOCK] != "none" && BK[BLOCK] != "") {
            newkey = rekey_value()
            for (i = 1; i <= NE; i++) if (i != k && entry_key(BLOCK, i) == newkey) refuse("@" BLOCK " already has an entry keyed '" newkey "' (ERR_ENTITY_EXISTS)")
        }
        splice(EST[k], EEN[k], t, 1)
        NOTE = BLOCK "/" KEY " updated (" ACTED ")"
        if (DRY) SHOW = t
        return
    }
    if (REMOVE) refuse("--remove needs the entry's key (ERR_INVALID_ARGUMENT)")
    if (!b && !((DKIND, BLOCK) in ALLOW)) refuse("a " DKIND " doc carries no @" BLOCK " block (its blocks: " kind_blocks(DKIND) ") (ERR_SCHEMA_VIOLATION)")
    if (!b && AFTER != "") refuse("the doc carries no @" BLOCK " block, so no entry " AFTER " to place after (ERR_ENTITY_NOT_FOUND)")
    if (b && AFTER != "") find_entry(b, AFTER)
    UB = BLOCK
    UC = 0
    UPRE = ""
    UPREN = 0
    UHEAD = 1
    UIND = 4
    # the head field first, whatever the flag order, so later fields land at their schema place
    f = BF[BLOCK]
    letter = id_letter(BLOCK)
    id = ""
    if (BK[BLOCK] == "id") {
        if (IDSET != "") {
            check_id(BLOCK, IDSET)
            doc_ids()
            if (IDSET in IDS) refuse("the id " IDSET " already exists in " REPO "/" SLUG " (ERR_ENTITY_EXISTS)")
            id = IDSET
        } else id = next_id(BLOCK)
    } else if (IDSET != "") refuse("@" BLOCK " carries no id; --id applies to an id-keyed block (ERR_INVALID_ARGUMENT)")
    for (i = 1; i <= NA; i++) if (AF[i] == "id") refuse("an id is assigned, or named by --id (ERR_INVALID_ARGUMENT)")
    if (f == "id") {
        UC = 1
        UN[1] = "id"
        UL[1] = "  - id: " id
        UCH[1] = 1
    } else {
        pos = 0
        for (i = 1; i <= NA; i++) if (AF[i] == f && AA[i] == "set") pos = i
        if (!pos) refuse("a new @" BLOCK " entry requires " dash(f) " (--" dash(f) "=...) (ERR_SCHEMA_VIOLATION)")
        if (!((UB, f) in FT)) refuse("unknown field '" dash(f) "' (ERR_SCHEMA_VIOLATION)")
        if (FT[UB, f] != "list") check_value(UB, f, AV[pos])
        UC = 1
        UN[1] = f
        UL[1] = render(1, f, AV[pos], 0, 0)
        UCH[1] = 1
        if (id != "") unit_insert("id", render(0, "id", id, 0, 0))
    }
    # the remaining actions (the head field's set is already rendered)
    drop_action(f)
    apply_actions(1)
    for (i = 1; i <= FN[BLOCK]; i++) {
        f = FNAME[BLOCK, i]
        if (required(BLOCK, f) && !unit_find(f)) refuse("a new @" BLOCK " entry requires " dash(f) " (--" dash(f) "=...) (ERR_SCHEMA_VIOLATION)")
    }
    t = unit_text()
    # the new key must be unique in the block
    key = ""
    if (BK[BLOCK] == "id") key = id
    else if (BK[BLOCK] != "none" && BK[BLOCK] != "") {
        key = rekey_value()
        for (i = 1; i <= NE; i++) if (entry_key(BLOCK, i) == key) refuse("@" BLOCK " already has an entry keyed '" key "' (ERR_ENTITY_EXISTS)")
    }
    if (key == "") key = "#" (NE + 1)
    if (!b) {
        insert_block_schema(BLOCK, "@" BLOCK "\n" t)
        NOTE = BLOCK "/" key " added (a new @" BLOCK " block)"
    } else if (AFTER != "") {
        k = find_entry(b, AFTER)
        splice(EEN[k] + 1, EEN[k], t, 1)
        if (key ~ /^#/) key = "#" (k + 1)
        NOTE = BLOCK "/" key " added after " BLOCK "/" AFTER
    } else if (FIRST && NE > 0) {
        splice(EST[1], EST[1] - 1, t, 1)
        if (key ~ /^#/) key = "#1"
        NOTE = BLOCK "/" key " added first"
    } else {
        splice(BEN[b] + 1, BEN[b], t, 1)
        NOTE = BLOCK "/" key " added at the end"
    }
    if (DRY) SHOW = t
}

# the key the loaded unit answers to after its actions (natural or composite)
function rekey_value(    kk, p, f1, f2, sep, j1, j2) {
    kk = BK[UB]
    p = index(kk, "+")
    if (p) {
        f1 = substr(kk, 1, p - 1)
        f2 = substr(kk, p + 1)
        sep = (f1 == "from") ? ">" : ":"
        j1 = unit_find(f1)
        j2 = unit_find(f2)
        return (j1 ? unit_value(j1) : "") sep (j2 ? unit_value(j2) : "")
    }
    j1 = unit_find(kk)
    return j1 ? unit_value(j1) : ""
}

function drop_action(f,    i, k) {
    k = 0
    for (i = 1; i <= NA; i++) {
        if (AF[i] == f && AA[i] == "set") continue
        k++
        AA[k] = AA[i]
        AF[k] = AF[i]
        AV[k] = AV[i]
    }
    NA = k
}

function op_section(    b, e, i, hdr, t, p) {
    need_doc()
    if (!(BLOCK in BS)) refuse("unknown block '" BLOCK "' (ERR_SCHEMA_VIOLATION)")
    if (BLOCK == "rule" && KEY !~ /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/) refuse("a rule section is addressed rule/<category>/<rule-slug> (ERR_INVALID_ARGUMENT)")
    hdr = (BLOCK == "rule") ? "@rule " KEY : "@" BLOCK
    find_block(BLOCK, KEY)
    if (FOUND > 1) refuse("the doc carries " hdr " " FOUND " times (ERR_SCHEMA_VIOLATION)")
    b = FB
    if (REMOVE) {
        if (!b) refuse("no " hdr " in " REPO "/" SLUG " (ERR_ENTITY_NOT_FOUND)")
        if (AFTER != "" || FIRST) refuse("--remove takes no placement (ERR_INVALID_ARGUMENT)")
        delete_block(b)
        NOTE = substr(hdr, 2) " removed"
        return
    }
    while (np > 0 && blank(P[np])) np--
    if (np == 0) refuse("the block on stdin is empty (ERR_INVALID_ARGUMENT)")
    for (i = 1; i <= np; i++) if (index(P[i], CR)) refuse("a carriage return in the block at line " i " (ERR_INVALID_ARGUMENT)")
    t = P[1]
    sub(/[ ]+$/, "", t)
    if (t != hdr) refuse("the block on stdin must open with " hdr " (ERR_SCHEMA_VIOLATION)")
    t = ""
    for (i = 1; i <= np; i++) {
        if (i > 1 && substr(P[i], 1, 1) == "@") refuse("the stdin carries more than one block (line " i ") (ERR_SCHEMA_VIOLATION)")
        t = t (i > 1 ? "\n" : "") P[i]
    }
    if (b) {
        if (AFTER != "" || FIRST) refuse("placement applies to a new block; " hdr " exists (ERR_INVALID_ARGUMENT)")
        splice(BST[b], BEN[b], t, 1)
        NOTE = substr(hdr, 2) " replaced"
        if (DRY) SHOW = t
        return
    }
    if (!((DKIND, BLOCK) in ALLOW)) refuse("a " DKIND " doc carries no @" BLOCK " block (its blocks: " kind_blocks(DKIND) ") (ERR_SCHEMA_VIOLATION)")
    if (AFTER != "") {
        if (AFTER ~ /^rule\//) find_block("rule", substr(AFTER, 6))
        else find_block(AFTER, "")
        if (!FB) refuse("no " AFTER " block to place after (ERR_ENTITY_NOT_FOUND)")
        insert_block_after(FB, t)
        NOTE = substr(hdr, 2) " added after " AFTER
    } else if (FIRST) {
        insert_block_after(1, t)
        NOTE = substr(hdr, 2) " added first"
    } else {
        insert_block_schema(BLOCK, t)
        NOTE = substr(hdr, 2) " added"
    }
    if (DRY) SHOW = t
}

function op_ids(    b, k, bn, j, id, cnt, head, line, parts) {
    need_doc()
    cnt = 0
    LISTING = ""
    # N continues past the highest id of each kind already in the doc
    NEXTN["contract"] = max_id("contract")
    NEXTN["responsibilities"] = max_id("responsibilities")
    for (b = 1; b <= NB; b++) {
        bn = BNM[b]
        if (bn != "contract" && bn != "responsibilities") continue
        parse_entries(b)
        for (k = 1; k <= NE; k++) {
            load_unit(EST[k], EEN[k], 4, 1, bn)
            if (unit_find("id")) continue
            id = DSLUG "-" id_letter(bn) (++NEXTN[bn])
            # the id rides the line after the entry's first field (its whole extent)
            j = split(UL[1], parts, "\n")
            line = EST[k] + j - 1
            AFT[line] = ((line in AFT) ? AFT[line] "\n" : "") "    id: " id
            cnt++
            head = substr(L[EST[k]], 5)
            LISTING = LISTING (LISTING == "" ? "" : "\n") REPO "/" SLUG " " bn " #" k " " id " " substr(head, 1, 60)
        }
    }
    NOTE = "keyed " cnt
}

# the highest <N> of the doc's <slug>-<letter><N> ids of block b's kind (0 when none)
function max_id(b,    pre, best, v, t) {
    pre = DSLUG "-" id_letter(b)
    best = 0
    doc_ids()
    for (v in IDS) {
        if (index(v, pre) != 1) continue
        t = substr(v, length(pre) + 1)
        if (t ~ /^[1-9][0-9]*$/ && t + 0 > best) best = t + 0
    }
    return best
}

function op_show(    b, k) {
    need_doc()
    if (BLOCK == "rule") {
        find_block("rule", KEY)
        if (!FB) refuse("no rule/" KEY " in " REPO "/" SLUG " (ERR_ENTITY_NOT_FOUND)")
        for (k = BST[FB]; k <= BEN[FB]; k++) print L[k]
        return
    }
    if (!(BLOCK in BS)) refuse("unknown block '" BLOCK "' (ERR_SCHEMA_VIOLATION)")
    if (BS[BLOCK] != "list") {
        find_block(BLOCK, "")
        if (!FB) refuse("the doc carries no @" BLOCK " block (ERR_ENTITY_NOT_FOUND)")
        for (k = BST[FB]; k <= BEN[FB]; k++) print L[k]
        return
    }
    find_block(BLOCK, "")
    if (!FB) refuse("the doc carries no @" BLOCK " block (ERR_ENTITY_NOT_FOUND)")
    b = FB
    parse_entries(b)
    k = find_entry(b, KEY)
    for (b = EST[k]; b <= EEN[k]; b++) print L[b]
}

function op_replace(    s, i, p, cnt, out) {
    if (OLDTXT == "") refuse("--old is empty (ERR_INVALID_ARGUMENT)")
    # the dialect is LF: a carriage return never lands through a sweep, as through every write
    if (index(OLDTXT, CR)) refuse("a carriage return in --old (ERR_INVALID_ARGUMENT)")
    if (index(NEWTXT, CR)) refuse("a carriage return in --new (ERR_INVALID_ARGUMENT)")
    s = ""
    for (i = 1; i <= n; i++) s = s L[i] ((i < n || !NOEOL) ? "\n" : "")
    cnt = 0
    out = ""
    while ((p = index(s, OLDTXT)) > 0) {
        out = out substr(s, 1, p - 1) NEWTXT
        s = substr(s, p + length(OLDTXT))
        cnt++
    }
    printf "%s", out s
    say("replaced " cnt)
}

END {
    # a --stdin=<field> value arrives as the payload operand (never the environment): its
    # lines joined, trailing newlines dropped, into the action EDIT_STDIN_N names
    SN = ENVIRON["EDIT_STDIN_N"] + 0
    if (SN >= 1 && SN <= NA) {
        AV[SN] = ""
        for (i = 1; i <= np; i++) AV[SN] = AV[SN] (i > 1 ? "\n" : "") P[i]
        sub(/\n+$/, "", AV[SN])
    }
    if (OP == "replace") { op_replace(); exit 0 }
    parse_doc()
    if (OP == "show") { op_show(); exit 0 }
    if (OP == "new") op_new()
    else if (OP == "write") op_write()
    else if (OP == "header") op_header()
    else if (OP == "rule") op_rule()
    else if (OP == "entry") op_entry()
    else if (OP == "section") op_section()
    else if (OP == "ids") op_ids()
    else refuse("unknown edit op '" OP "' (ERR_INVALID_ARGUMENT)")
    emit_doc()
    say(NOTE)
    if (OP == "ids" && DRY && LISTING != "") say(LISTING)
    if (DRY && SHOW != "") say(SHOW)
}
