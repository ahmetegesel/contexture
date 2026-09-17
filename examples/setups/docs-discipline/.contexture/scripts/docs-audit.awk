#!/usr/bin/awk -f
# docs-audit.awk: audits typed-block markdown documents
# Usage: .contexture/scripts/docs-audit.awk docs/<repo>/*.md
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
}

function err(file, line, msg) {
    print file ":" line ": error: " msg > "/dev/stderr"
    errors++
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

# Block scalar handling
in_block_scalar {
    if (/^[ ]{4,}/) {
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

# Track block scalar opening
/::[ ]*$/ {
    in_block_scalar = 1
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

# Pitfall checks
/^[ ]{2,4}- id:[ ]*/ {
    pid = $NF
    scope_pid = (curr_repo ? curr_repo : "default") ":" pid
    if (scope_pid in seen_pitfalls) {
        err(FILENAME, FNR, "duplicate pitfall id '" pid "' in repo '" curr_repo "' (first seen at " seen_pitfalls[scope_pid] ")")
    } else {
        seen_pitfalls[scope_pid] = FILENAME ":" FNR
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
