#!/usr/bin/awk -f
# docs-audit.awk: audits typed-block markdown documents (private engine; the audit verb wraps it)
# Usage: ctx docs audit [<repo>...]
# Help: ctx docs help audit
# Exits 0 on clean; exits 1 on errors with line numbers.

BEGIN {
    errors = 0
    valid_kinds["capability"] = 1
    valid_kinds["structural"] = 1
    valid_kinds["cross-cutting"] = 1
    valid_kinds["catalog"] = 1
    valid_kinds["conventions"] = 1
    valid_kinds["architecture"] = 1
    valid_kinds["operational"] = 1
    valid_kinds["overview"] = 1

    valid_blocks["@doc"] = 1
    valid_blocks["@rule"] = 1
    valid_blocks["@responsibilities"] = 1
    valid_blocks["@contract"] = 1
    valid_blocks["@dependencies"] = 1
    valid_blocks["@edges"] = 1
    valid_blocks["@pitfalls"] = 1
    valid_blocks["@patterns"] = 1
    valid_blocks["@see_also"] = 1
    valid_blocks["@members"] = 1
    valid_blocks["@member_source"] = 1
    valid_blocks["@components"] = 1
    valid_blocks["@layers"] = 1
    valid_blocks["@stages"] = 1
    valid_blocks["@deployables"] = 1
    valid_blocks["@data_flow"] = 1
    valid_blocks["@dependency_rules"] = 1
    valid_blocks["@run"] = 1
    valid_blocks["@build"] = 1
    valid_blocks["@test"] = 1
    valid_blocks["@debug"] = 1
    valid_blocks["@observability"] = 1
    valid_blocks["@areas"] = 1
    valid_blocks["@caveats"] = 1

    # the grammar template's pitfall schema (the same #% lines the write verbs
    # read): the required fields and the class/severity enums drive the read
    # validation; the audit keeps its kind and block lists because the grammar
    # agreement check reads them, and the template path arrives from docs-io
    tpl = ENVIRON["DOCS_TEMPLATE"]
    if (tpl != "") {
        while ((getline schema_line < tpl) > 0) {
            if (schema_line !~ /^#% field /) continue
            n = split(schema_line, sw, /[ \t]+/)
            if (n < 6) continue
            nb = split(sw[3], bl, /\|/)
            is_pf = 0
            for (i = 1; i <= nb; i++) if (bl[i] == "pitfalls") is_pf = 1
            if (!is_pf) continue
            fname = sw[4]
            if (sw[6] == "required") pf_required[fname] = 1
            if (sw[5] == "enum") {
                vals = ""
                for (i = 7; i <= n; i++) vals = vals (vals == "" ? "" : " ") sw[i]
                pf_enum[fname] = vals
            }
        }
        close(tpl)
    }
}

function err(file, line, msg) {
    print file ":" line ": error: " msg > "/dev/stderr"
    errors++
}

function check_pitfall(    f, v, vals, nv, iv, ok) {
    if (pf_id == "") return
    for (f in pf_required) {
        if (!(f in pf_seen)) err(prev_file, pf_line, "pitfall '" pf_id "' missing '" f ":'")
    }
    for (f in pf_enum) {
        if (f in pf_value) {
            nv = split(pf_enum[f], vals, " ")
            ok = 0
            for (iv = 1; iv <= nv; iv++) if (vals[iv] == pf_value[f]) ok = 1
            if (!ok) err(prev_file, pf_fline[f], "pitfall '" pf_id "' " f " must be one of: " pf_enum[f] " (got '" pf_value[f] "')")
        }
    }
    pf_id = ""
    delete pf_seen
    delete pf_value
    delete pf_fline
}

function check_rule() {
    if (current_rule != "") {
        if (!rule_has_directive) err(prev_file, rule_line, "rule '" current_rule "' missing 'directive:'")
        if (!rule_has_statement) err(prev_file, rule_line, "rule '" current_rule "' missing 'statement:'")
        if (!rule_has_evidence) err(prev_file, rule_line, "rule '" current_rule "' missing 'evidence:'")
    }
}

function end_file() {
    check_rule()
    check_pitfall()
    if (!has_repo) err(prev_file, 1, "missing required 'repo:' field in @doc")
    if (!has_desc) err(prev_file, 1, "missing required 'description:' field in @doc")
}

# Per-file initialization
FNR == 1 {
    if (NR > 1) {
        end_file()
    }
    prev_file = FILENAME
    in_block_scalar = 0
    block_indent = 0
    current_block = ""
    has_doc = 0
    has_repo = 0
    curr_repo = ""
    has_desc = 0
    current_rule = ""
    rule_has_directive = 0
    rule_has_statement = 0
    rule_has_evidence = 0

    # Line 1 must be @doc <kind> <slug>
    if ($1 != "@doc") {
        err(FILENAME, FNR, "first line must be @doc <kind> <slug>")
    } else {
        has_doc = 1
        kind = $2
        slug = $3
        if (!(kind in valid_kinds)) {
            err(FILENAME, FNR, "invalid doc kind '" kind "'")
        }
        if (slug == "") {
            err(FILENAME, FNR, "missing doc slug")
        }
        file_slug = FILENAME
        sub(/^.*\//, "", file_slug)
        sub(/\.md$/, "", file_slug)
        if (slug != file_slug) {
            err(FILENAME, FNR, "slug '" slug "' does not match filename '" file_slug "'")
        }
    }
    next
}

# Blank line resets block scalar
/^[[:space:]]*$/ {
    in_block_scalar = 0
    next
}

# Comment lines
/^[ ]*#/ {
    next
}

# Block header at column 0
/^@[a-z_]+/ {
    in_block_scalar = 0
    check_rule()
    check_pitfall()
    current_rule = ""
    current_block = $1

    if (!(current_block in valid_blocks)) {
        err(FILENAME, FNR, "unknown block header '" current_block "'")
    }

    if (current_block == "@rule") {
        rule_id = $2
        rule_line = FNR
        scope_rule = (curr_repo ? curr_repo : "default") ":" rule_id
        if (rule_id == "") {
            err(FILENAME, FNR, "@rule requires an identifier (e.g. category/rule-slug)")
        } else if (scope_rule in seen_rules) {
            err(FILENAME, FNR, "duplicate rule identifier '" rule_id "' in repo '" curr_repo "' (first seen at " seen_rules[scope_rule] ")")
        } else {
            seen_rules[scope_rule] = FILENAME ":" FNR
        }
        current_rule = rule_id
        rule_has_directive = 0
        rule_has_statement = 0
        rule_has_evidence = 0
    }
    next
}

# Any other @ character at start of line
/^@/ {
    err(FILENAME, FNR, "malformed block header '" $0 "'")
    next
}

# Block scalar handling: the body sits at the opening field's indent plus two; a line
# indented less ends the scalar, so a sibling field or an id line at the opening field's
# indent is audited (a blanket four-space test swallowed such a line after a block scalar)
in_block_scalar {
    if (match($0, /^[ ]*/) && RLENGTH >= block_indent) {
        next
    } else {
        in_block_scalar = 0
    }
}

# Indentation check: non-block lines must indent at least 2 spaces
!/^[ ]{2,}/ {
    err(FILENAME, FNR, "line must indent at least 2 spaces: '" $0 "'")
    next
}

# Pitfall entries: each starts with an id; a new entry closes the previous one,
# and the schema's required fields and class/severity enums are checked
current_block == "@pitfalls" && /^[ ]{2,4}- / {
    check_pitfall()
    if ($0 !~ /^[ ]{2,4}- id:[ ]*/) {
        err(FILENAME, FNR, "pitfall entry must start with 'id:'")
        next
    }
    pf_id = $NF
    pf_line = FNR
    pf_seen["id"] = 1
}

# Track block scalar opening
/::[ ]*$/ {
    in_block_scalar = 1
    block_indent = match($0, /^[ ]*/) ? RLENGTH + 2 : 2
}

# Key-value checks
/^[ ]{2}repo:[ ]*/ {
    has_repo = 1
    curr_repo = $2
}

/^[ ]{2}description:[ ]*/ {
    has_desc = 1
}

/^[ ]{2}directive:[ ]*/ {
    dir = $2
    if (dir != "must" && dir != "should" && dir != "never") {
        err(FILENAME, FNR, "directive must be 'must', 'should', or 'never', got '" dir "'")
    }
    rule_has_directive = 1
}

/^[ ]{2}statement:[ ]*/ {
    rule_has_statement = 1
}

# Evidence checks: evidence must be symbolic, never line numbers
/evidence:[ ]*/ {
    if (current_block == "@rule") rule_has_evidence = 1
    # Check for line number patterns like :123, line 123, lines 10-20, :L123, #L123
    if ($0 ~ /:[0-9]+("|[ ]|$)/ || $0 ~ /line[s]?[ ]+[0-9]+/ || $0 ~ /(:|#)L[0-9]+/) {
        err(FILENAME, FNR, "evidence must be greppable code symbols, never line numbers: '" $0 "'")
    }
}

# Pitfall fields (the @pitfalls block only): presence for the required-field
# check, the value for the class and severity enums; a block scalar's opening
# line still counts as its field present
current_block == "@pitfalls" && pf_id != "" && /^[ ]{2,4}(summary|class|severity|trigger|consequence|evidence)[ ]*(:[ ]*|::[ ]*)/ {
    fname = $0
    sub(/^[ ]*/, "", fname)
    if (fname ~ /^summary[ ]*(:|::)/) fname = "summary"
    else if (fname ~ /^class[ ]*(:|::)/) fname = "class"
    else if (fname ~ /^severity[ ]*(:|::)/) fname = "severity"
    else if (fname ~ /^trigger[ ]*(:|::)/) fname = "trigger"
    else if (fname ~ /^consequence[ ]*(:|::)/) fname = "consequence"
    else fname = "evidence"
    pf_seen[fname] = 1
    if (fname == "class" || fname == "severity") {
        v = $0
        sub(/^[ ]*(class|severity)[ ]*:[ ]*/, "", v)
        sub(/[ ]+$/, "", v)
        pf_value[fname] = v
        pf_fline[fname] = FNR
    }
    next
}

# Id checks: one namespace per repo for every id field, an entry head (- id:, the pitfalls
# and caveats) or an id line of its own at indent 4 (the contract rules and
# responsibilities); a legacy entry without an id stays silent
/^[ ]{2,4}- id:[ ]*/ || /^[ ]{4}id:[ ]*/ {
    pid = $NF
    scope_pid = (curr_repo ? curr_repo : "default") ":" pid
    if (scope_pid in seen_ids) {
        err(FILENAME, FNR, "duplicate id '" pid "' in repo '" curr_repo "' (first seen at " seen_ids[scope_pid] ")")
    } else {
        seen_ids[scope_pid] = FILENAME ":" FNR
    }
}

END {
    if (NR > 0) {
        end_file()
    }
    if (errors > 0) {
        print "docs-audit: FAILED with " errors " error(s)" > "/dev/stderr"
        exit 1
    }
}
