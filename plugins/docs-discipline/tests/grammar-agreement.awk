#!/usr/bin/awk -f
# grammar-agreement.awk: the agreement check of the corpus grammar (plugin suite material,
# never shipped into a workspace). Reads the grammar template and the audit engine and
# asserts that the machine-readable schema (the #% lines of doc.md), the prose shapes above
# it, and the audit's kind and block lists say the same thing: every prose block and field
# is in the schema and back, every enum's values are equal on both sides, the header
# fields and the kinds agree, the requires and allows lines name known kinds, fields, and
# blocks, and the audit's valid_kinds and valid_blocks (minus @doc) equal the schema's.
# A prose value is an enum only when it is an unquoted alternation of bare words without
# angle brackets (a | b | c), so a quoted or placeholder alternation stays text.
# Refuses an empty side as a pass: no schema, no prose blocks, or no audit lists is a
# disagreement.
#
# usage: awk -f grammar-agreement.awk <doc.md> <docs-audit.awk>
# exit: 0 when everything agrees (one AGREE line); 1 with one DISAGREE line per difference

function bad(msg) { print "DISAGREE: " msg; nbad++ }
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function sortwords(s,    a, n, i, j, t, o) {
    n = split(s, a, /[ \t]+/)
    for (i = 2; i <= n; i++) { t = a[i]; for (j = i - 1; j >= 1 && a[j] > t; j--) a[j + 1] = a[j]; a[j + 1] = t }
    o = ""
    for (i = 1; i <= n; i++) if (a[i] != "") o = o (o == "" ? "" : " ") a[i]
    return o
}
function check_type(t, line) {
    if (t !~ /^(word|text|list|enum|int|id|bare)$/) bad("schema type '" t "' unknown: " line)
}
function check_presence(p, line) {
    if (p !~ /^(required|optional|new)$/) bad("schema presence '" p "' unknown: " line)
}
function schema_line(line,    n, w, i, j, nb, bl, b, v, o) {
    n = split(line, w, /[ \t]+/)
    if (w[2] == "kinds") { for (i = 3; i <= n; i++) s_kind[w[i]] = 1; return }
    if (w[2] == "header") {
        if (n < 5) { bad("schema header line malformed: " line); return }
        s_hdr[w[3]] = 1; check_type(w[4], line); check_presence(w[5], line); return
    }
    if (w[2] == "requires") {
        for (i = 3; i <= n && w[i] != "header"; i++) req_kind[w[i]] = 1
        if (i >= n) { bad("schema requires line names no header field: " line); return }
        req_field[w[i + 1]] = 1; return
    }
    if (w[2] == "block") {
        if (w[4] != "map" && w[4] != "list") bad("schema block shape '" w[4] "' unknown: " line)
        s_block[w[3]] = w[4]
        for (i = 5; i <= n; i++) if (w[i] ~ /^order=/) {
            o = substr(w[i], 7)
            if (o in s_order) bad("schema order " o " given to both " s_order[o] " and " w[3])
            s_order[o] = w[3]
        }
        return
    }
    if (w[2] == "field") {
        if (n < 6) { bad("schema field line malformed: " line); return }
        check_type(w[5], line); check_presence(w[6], line)
        nb = split(w[3], bl, /\|/)
        for (j = 1; j <= nb; j++) {
            b = bl[j]
            s_field[b, w[4]] = w[5]
            s_nfields[b]++
            if (w[5] == "enum") {
                v = ""
                for (i = 7; i <= n; i++) v = v (v == "" ? "" : " ") w[i]
                if (v == "") bad("schema enum " b "." w[4] " lists no values")
                s_enum[b, w[4]] = sortwords(v)
            }
        }
        return
    }
    if (w[2] == "allows") {
        for (i = 3; i <= n && w[i] != "blocks"; i++) a_kind[w[i]] = 1
        for (i++; i <= n; i++) a_block[w[i]] = 1
        return
    }
    bad("schema directive unknown: " line)
}
function kinds_from(s,    a, n, i) {
    gsub(/[<>]/, "", s)
    n = split(s, a, /\|/)
    for (i = 1; i <= n; i++) if (a[i] != "") p_kind[a[i]] = 1
}
function prose_line(line,    t, h, name, k, v) {
    if (line ~ /^\[?@/) {
        t = line; sub(/^\[/, "", t)
        split(t, h, /[ \t]+/)
        name = substr(h[1], 2); sub(/\]$/, "", name)
        if (name == "doc") { cur = "doc"; kinds_from(h[2]); return }
        cur = name; p_block[name] = 1
        return
    }
    if (line ~ /^[^ \t]/) { cur = ""; return }
    if (cur == "") return
    if (line ~ /^[ \t]*#/) return
    if (line ~ /^  - "/) { p_field[cur, "@bare"] = 1; return }
    if (line !~ /^(  |    )(- )?\[?[a-z_]+( ::|:)/) return
    t = trim(line); sub(/^- /, "", t); sub(/^\[/, "", t)
    k = t; sub(/( ::|:).*$/, "", k)
    v = ""
    if (t !~ /^[a-z_]+ ::/) { v = t; sub(/^[a-z_]+:[ ]*/, "", v); sub(/\]+$/, "", v); v = trim(v) }
    if (cur == "doc") { p_hdr[k] = 1; return }
    p_field[cur, k] = 1
    if (v ~ /^[a-z0-9-]+( \| [a-z0-9-]+)+$/) { gsub(/ \| /, " ", v); p_enum[cur, k] = sortwords(v) }
}

FNR == 1 { fileno++ }
fileno == 1 && /^#% / { schema_line($0); next }
fileno == 1 && /^#/ { next }
fileno == 1 { prose_line($0); next }
fileno == 2 && match($0, /valid_kinds\["[^"]+"\]/) { au_kind[substr($0, RSTART + 13, RLENGTH - 15)] = 1 }
fileno == 2 && match($0, /valid_blocks\["@[^"]+"\]/) { au_block[substr($0, RSTART + 15, RLENGTH - 17)] = 1 }

END {
    if (fileno != 2) { print "DISAGREE: usage: awk -f grammar-agreement.awk <doc.md> <docs-audit.awk>"; exit 1 }
    for (k in s_kind) nsk++
    for (k in s_block) nsb++
    for (k in p_block) npb++
    for (k in au_block) nab++
    for (k in au_kind) nak++
    if (!nsk || !nsb) bad("the template carries no schema (no #% kinds or block lines)")
    if (!npb) bad("the template carries no prose blocks")
    if (!nab || !nak) bad("the audit engine carries no valid_kinds or valid_blocks lists")
    # kinds: the schema, the prose @doc lines, the audit
    for (k in s_kind) { if (!(k in p_kind)) bad("kind " k ": in the schema, not in the prose"); if (!(k in au_kind)) bad("kind " k ": in the schema, not in the audit") }
    for (k in p_kind) if (!(k in s_kind)) bad("kind " k ": in the prose, not in the schema")
    for (k in au_kind) if (!(k in s_kind)) bad("kind " k ": in the audit, not in the schema")
    # header fields
    for (k in s_hdr) { nh++; if (!(k in p_hdr)) bad("header field " k ": in the schema, not in the prose") }
    for (k in p_hdr) if (!(k in s_hdr)) bad("header field " k ": in the prose, not in the schema")
    # blocks: the schema, the prose, the audit minus @doc
    for (k in s_block) {
        if (!(k in p_block)) bad("block " k ": in the schema, not in the prose")
        if (!(k in au_block)) bad("block " k ": in the schema, not in the audit")
        if (!s_nfields[k]) bad("block " k ": no schema field lines")
        if (!(k in a_block)) bad("block " k ": no allows line carries it")
    }
    for (k in p_block) if (!(k in s_block)) bad("block " k ": in the prose, not in the schema")
    for (k in au_block) if (k != "doc" && !(k in s_block)) bad("block " k ": in the audit, not in the schema")
    # fields per block, both ways (a bare field is the prose's quoted item line)
    for (key in s_field) {
        split(key, kp, SUBSEP); nf++
        if (!(kp[1] in s_block)) bad("field " kp[1] "." kp[2] ": its block has no schema block line")
        if (s_field[key] == "bare") { hasbare[kp[1]] = 1; if (!((kp[1], "@bare") in p_field)) bad("field " kp[1] "." kp[2] ": a bare item in the schema, none in the prose") }
        else if (!(key in p_field)) bad("field " kp[1] "." kp[2] ": in the schema, not in the prose")
    }
    for (key in p_field) {
        split(key, kp, SUBSEP)
        if (kp[2] == "@bare") { if (!(kp[1] in hasbare)) bad("field " kp[1] ": a bare item in the prose, no bare field in the schema") }
        else if (!(key in s_field)) bad("field " kp[1] "." kp[2] ": in the prose, not in the schema")
    }
    # enums: equal value sets on both sides
    for (key in s_enum) {
        split(key, kp, SUBSEP); ne++
        if (!(key in p_enum)) bad("enum " kp[1] "." kp[2] ": in the schema, not an enum in the prose")
        else if (p_enum[key] != s_enum[key]) bad("enum " kp[1] "." kp[2] ": schema [" s_enum[key] "] differs from prose [" p_enum[key] "]")
    }
    for (key in p_enum) { split(key, kp, SUBSEP); if (!(key in s_enum)) bad("enum " kp[1] "." kp[2] ": an enum in the prose, not in the schema") }
    # requires and allows name what exists; every kind is allowed some block
    for (k in req_kind) if (!(k in s_kind)) bad("requires names unknown kind " k)
    for (k in req_field) if (!(k in s_hdr)) bad("requires names unknown header field " k)
    for (k in a_kind) if (!(k in s_kind)) bad("allows names unknown kind " k)
    for (k in a_block) if (!(k in s_block)) bad("allows names unknown block " k)
    for (k in s_kind) if (!(k in a_kind)) bad("kind " k ": no allows line names it")
    if (nbad) exit 1
    printf "AGREE: %d kinds, %d header fields, %d blocks, %d block fields, %d enums; the prose and the audit lists agree\n", nsk, nh, nsb, nf, ne
    exit 0
}
