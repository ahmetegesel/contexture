#!/usr/bin/awk -f
# docs-query.awk: retrieval projection engine for the workspace docs (private engine; the query verb wraps it)
# Usage: ctx docs query <repo> <slug> [--section <name>] | <repo> --file <path> | --index (the full table: ctx docs help query)
# Help: ctx docs help query
# Supports: projection, section slicing, rules query, pitfall scan, file owner lookup, corpus search, edges, index.
# Runs behind docs-glob.awk (awk -f docs-glob.awk -f docs-query.awk), the glob rule it shares
# with the check.

# The free-text options come through the environment (the query verb exports them), never
# awk -v, which rewrites backslash escapes and refuses a newline; mode and repo stay -v
# (bounded tokens)
BEGIN {
    slug = ENVIRON["DOCS_Q_SLUG"]
    section = ENVIRON["DOCS_Q_SECTION"]
    file = ENVIRON["DOCS_Q_FILE"]
    search = ENVIRON["DOCS_Q_SEARCH"]
    category = ENVIRON["DOCS_Q_CATEGORY"]
    severity = ENVIRON["DOCS_Q_SEVERITY"]
    channel = ENVIRON["DOCS_Q_CHANNEL"]
}

# Per-file metadata extraction
FNR == 1 {
    # a pitfall still open at the end of the previous doc prints under that doc's slug,
    # before the metadata below turns to this doc
    if (mode == "pitfalls" && in_pitfall) {
        print_pitfall()
        in_pitfall = 0
    }
    curr_file = FILENAME
    curr_kind = ""
    curr_slug = ""
    curr_repo = ""
    curr_role = ""
    curr_desc = ""
    curr_sources = ""
    curr_keywords = ""
    curr_block = ""
    in_block_scalar = 0

    if ($1 == "@doc") {
        curr_kind = $2
        curr_slug = $3
    }
}

# Collect doc metadata without mutating $0
FNR <= 15 && /^[ ]{2}repo:[ ]*/ {
    curr_repo = $0
    sub(/^[ ]{2}repo:[ ]*/, "", curr_repo)
}
FNR <= 15 && /^[ ]{2}role:[ ]*/ {
    curr_role = $0
    sub(/^[ ]{2}role:[ ]*/, "", curr_role)
}
FNR <= 15 && /^[ ]{2}description:[ ]*/ {
    curr_desc = $0
    sub(/^[ ]{2}description:[ ]*"/, "", curr_desc)
    sub(/"[ ]*$/, "", curr_desc)
}
FNR <= 20 && /^[ ]{2}sources:[ ]*/ {
    curr_sources = $0
    sub(/^[ ]{2}sources:[ ]*\[/, "", curr_sources)
    sub(/\][ ]*$/, "", curr_sources)
}
FNR <= 20 && /^[ ]{2}keywords:[ ]*/ {
    curr_keywords = $0
    sub(/^[ ]{2}keywords:[ ]*\[/, "", curr_keywords)
    sub(/\][ ]*$/, "", curr_keywords)
}

# ─── MODE: INDEX ─────────────────────────────────────────────────────────────
mode == "index" {
    if (curr_desc != "" && !seen_index[curr_file]) {
        seen_index[curr_file] = 1
        n_index++
        printf "%-25s %-28s %-14s %-16s %s\n", curr_repo, curr_slug, curr_kind, curr_role, substr(curr_desc, 1, 60)
    }
    next
}

# ─── MODE: FILE OWNER LOOKUP ─────────────────────────────────────────────────
# A doc claims the path (a projects/<repo>/ or <repo>/ prefix stripped when present) by the
# check's own rule (docs-glob.awk source_matches); every doc is read, and the answer in END is
# the claimant whose best claiming source is the most specific (source_beats), the earlier doc
# in corpus order on a full tie
mode == "file" {
    if (curr_sources != "" && !seen_file_check[curr_file]) {
        seen_file_check[curr_file] = 1
        n = split_sources(curr_sources, src_globs)
        norm_file = file
        p_prefix = "projects/" curr_repo "/"
        r_prefix = curr_repo "/"
        if (index(norm_file, p_prefix) == 1) {
            norm_file = substr(norm_file, length(p_prefix) + 1)
        } else if (index(norm_file, r_prefix) == 1) {
            norm_file = substr(norm_file, length(r_prefix) + 1)
        }
        doc_best = ""
        for (i = 1; i <= n; i++) {
            if (source_matches(norm_file, src_globs[i]) && (doc_best == "" || source_beats(src_globs[i], doc_best))) doc_best = src_globs[i]
        }
        if (doc_best != "" && (owner_source == "" || source_beats(doc_best, owner_source))) {
            owner_source = doc_best
            owner_head = "OWNER: " curr_slug " (" curr_kind (curr_role ? ", " curr_role : "") ") [" curr_repo "]"
            owner_summary = "SUMMARY: " curr_desc
            owner_doc = "DOC: " curr_file
        }
    }
    next
}

# ─── MODE: SEARCH ────────────────────────────────────────────────────────────
mode == "search" {
    if (search != "") {
        s_lower = tolower(search)
        line_lower = tolower($0)
        if (index(line_lower, s_lower) > 0) {
            clean_line = $0
            sub(/^[ ]+/, "  ", clean_line)
            if (!seen_search_doc[curr_file]++) {
                print "[" curr_repo " > " curr_slug " (" curr_kind ")]"
            }
            if (clean_line !~ /^@doc/) {
                print clean_line
            }
        }
    }
    next
}

# ─── MODE: EDGE SEARCH ───────────────────────────────────────────────────────
mode == "edge" {
    if (/^@edges/) { in_edges = 1; next }
    if (/^@[a-z_]+/ && !/^@edges/) { in_edges = 0 }
    if (in_edges) {
        if (channel == "" || index(tolower($0), tolower(channel)) > 0) {
            if (!seen_edge_doc[curr_file]++) {
                print "[" curr_repo " > " curr_slug "]"
            }
            print "  " $0
        }
    }
    next
}

# ─── MODE: RULES PROJECTION ──────────────────────────────────────────────────
mode == "rules" {
    if (repo != "" && curr_repo != repo && curr_repo != "") next
    if (/^@rule[ ]+/) {
        if (in_rule) print_rule()
        in_rule = 1
        r_id = $2
        sub(/^@rule[ ]+/, "", r_id)
        if (category != "" && index(r_id, category) != 1) {
            in_rule = 0
            next
        }
        r_directive = ""
        r_statement = ""
        r_prevalence = ""
        r_layer = ""
        r_evidence = ""
        r_anti = ""
        r_good = ""
        next
    }
    if (/^@[a-z_]+/ && !/^@rule/) {
        if (in_rule) print_rule()
        in_rule = 0
    }
    if (in_rule) {
        if (/^[ ]{2}directive:[ ]*/) { r_directive = toupper($2) }
        else if (/^[ ]{2}statement:[ ]*/) {
            r_statement = $0
            sub(/^[ ]{2}statement:[ ]*"/, "", r_statement)
            sub(/"[ ]*$/, "", r_statement)
        }
        else if (/^[ ]{2}prevalence:[ ]*/) { r_prevalence = $2 }
        else if (/^[ ]{2}layer:[ ]*/) { r_layer = $2 }
        else if (/^[ ]{2}evidence:[ ]*/) {
            r_evidence = $0
            sub(/^[ ]{2}evidence:[ ]*"/, "", r_evidence)
            sub(/"[ ]*$/, "", r_evidence)
        }
        else if (/^[ ]{2}anti:[ ]*/) {
            r_anti = $0
            sub(/^[ ]{2}anti:[ ]*"/, "", r_anti)
            sub(/"[ ]*$/, "", r_anti)
        }
        else if (/^[ ]{2}good:[ ]*/) {
            r_good = $0
            sub(/^[ ]{2}good:[ ]*"/, "", r_good)
            sub(/"[ ]*$/, "", r_good)
        }
    }
    next
}

function print_rule() {
    badge = ""
    if (r_prevalence != "" || r_layer != "") {
        badge = " (" r_prevalence (r_layer ? ", " r_layer : "") ")"
    }
    print (r_directive ? r_directive : "RULE") " " r_id badge
    if (r_statement != "") print "  " r_statement
    if (r_evidence != "")  print "  evidence: " r_evidence
    if (r_anti != "")      print "  anti: " r_anti
    if (r_good != "")      print "  good: " r_good
    print ""
}

# ─── MODE: PITFALLS SCAN ─────────────────────────────────────────────────────
mode == "pitfalls" {
    if (repo != "" && curr_repo != repo && curr_repo != "") next
    # entries count only inside @pitfalls (an overview doc's @caveats carry ids too)
    if (/^@[a-z_]+/) p_block = $1
    if (p_block == "@pitfalls" && /^[ ]{2,4}- id:[ ]*/) {
        if (in_pitfall) print_pitfall()
        p_id = $NF
        p_class = ""
        p_sev = ""
        p_sum = ""
        p_trig = ""
        p_con = ""
        p_evi = ""
        in_pitfall = 1
        next
    }
    if (in_pitfall) {
        if (/^@[a-z_]+/) {
            print_pitfall()
            in_pitfall = 0
        } else {
            if (/class:[ ]*/) p_class = $NF
            else if (/severity:[ ]*/) p_sev = $NF
            else if (/summary:[ ]*/) {
                p_sum = $0
                sub(/^[ ]*summary:[ ]*"/, "", p_sum)
                sub(/"[ ]*$/, "", p_sum)
            }
            else if (/trigger:[ ]*/) {
                p_trig = $0
                sub(/^[ ]*trigger:[ ]*"/, "", p_trig)
                sub(/"[ ]*$/, "", p_trig)
            }
            else if (/consequence:[ ]*/) {
                p_con = $0
                sub(/^[ ]*consequence:[ ]*"/, "", p_con)
                sub(/"[ ]*$/, "", p_con)
            }
            else if (/evidence:[ ]*/) {
                p_evi = $0
                sub(/^[ ]*evidence:[ ]*"/, "", p_evi)
                sub(/"[ ]*$/, "", p_evi)
            }
        }
    }
    next
}

function print_pitfall() {
    if (severity != "" && tolower(p_sev) != tolower(severity)) return
    sev_tag = toupper(p_sev) (p_class ? "/" p_class : "")
    print "! [" sev_tag "] " p_id ": " p_sum " (" curr_slug ".md)"
    if (p_trig != "") print "  Trigger: " p_trig
    if (p_con != "")  print "  Consequence: " p_con
    if (p_evi != "")  print "  Evidence: " p_evi
    print ""
}

# ─── DEFAULT: SINGLE DOC PROJECTION ──────────────────────────────────────────
slug != "" && curr_slug == slug {
    # Section slicing
    if (section != "") {
        target_block = "@" section
        if ($1 == target_block) {
            in_section = 1
            print "[" curr_slug " > " section "]"
            next
        }
        if (/^@[a-z_]+/ && $1 != target_block) {
            in_section = 0
        }
        if (in_section) {
            print $0
        }
        next
    }

    # Full doc projection: strip boilerplate
    if (FNR == 1) {
        print "[" curr_kind ": " curr_slug (curr_role ? " (" curr_role ")" : "") "] " curr_repo
        next
    }
    if (/^[ ]{2}repo:/ || /^[ ]{2}role:/) next
    if (/^[ ]{2}description:[ ]*/) {
        desc_text = $0
        sub(/^[ ]{2}description:[ ]*"/, "", desc_text)
        sub(/"[ ]*$/, "", desc_text)
        print desc_text "\n"
        next
    }
    if (/^[ ]{2}sources:[ ]*/ || /^[ ]{2}keywords:[ ]*/) next

    # Section headers
    if (/^@[a-z_]+/) {
        sec_name = toupper(substr($1, 2))
        print sec_name ":"
        next
    }
    # Strip quotes around field values
    line = $0
    gsub(/\"/, "", line)
    print line
}

END {
    if (mode == "file" && owner_source != "") {
        print owner_head
        print owner_summary
        print owner_doc
    }
    if (mode == "rules" && in_rule) print_rule()
    if (mode == "pitfalls" && in_pitfall) print_pitfall()
    if (mode == "index") printf "index complete: %d entries\n", n_index
}
