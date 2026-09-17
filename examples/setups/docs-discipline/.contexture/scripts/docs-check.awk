#!/usr/bin/awk -f
# docs-check.awk: completeness and freshness gate for the workspace docs
# Usage: git diff --name-status | .contexture/scripts/docs-check docs/*/*.md
# Help: .contexture/scripts/docs-check help (also --help and -h)
# Exits 0 on clean; exits 1 on completeness, freshness, or dead sources violation.

BEGIN {
    CODE_EXT_RE = "\\.(cs|js|cjs|mjs|jsx|ts|tsx|vue|svelte|astro|dart|py|rb|php|java|kt|kts|go|rs|swift|c|h|cc|cpp|hpp|sh|bash|zsh|sql|proto|graphql|gql|html|css|scss|sass|less|lua|pl|r|ex|exs|erl|hs|cshtml)$"
    EXCLUDE_RE = "(spec|\\.Test|\\.Tests|\\.min\\.|\\.generated\\.)"
    touched_count = 0
    num_affected = 0
    uncovered_count = 0
    stale_count = 0
    num_dead_sources = 0

    input_src = (change_file != "") ? change_file : "-"
    while ((getline raw_line < input_src) > 0) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", raw_line)
        if (raw_line == "") continue

        status_code = ""
        line = raw_line

        # Check for git status prefix (e.g. "D\tpath", "D path", "M\tpath", "A\tpath", "R100\told\tnew")
        if (raw_line ~ /^[MADRCU?!][0-9]*[[:space:]]+/) {
            match(raw_line, /^[MADRCU?!][0-9]*/)
            status_code = substr(raw_line, RSTART, 1)
            line = substr(raw_line, RSTART + RLENGTH)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)

            if (status_code == "R") {
                split(line, rparts, /[[:space:]]+/)
                old_f = rparts[1]
                new_f = rparts[2]
                deleted[old_f] = 1
                touched[old_f] = 1
                touched_count++
                line = new_f
                status_code = "A"
            }
            if (status_code == "D") {
                deleted[line] = 1
            }
        }

        touched[line] = 1
        touched_count++

        # Track touched documentation for freshness verification
        if (line ~ /docs\/[^\/]+\/[^\/]+\.md$/) {
            match(line, /docs\/[^\/]+\/[^\/]+\.md$/)
            dpath = substr(line, RSTART)
            split(dpath, dparts, "/")
            d_repo = dparts[2]
            d_slug = dparts[3]
            sub(/\.md$/, "", d_slug)
            touched_doc[d_repo, d_slug] = 1
            if (d_slug == "architecture" || d_slug == "overview" || d_repo == "workspace") {
                arch_touched[d_repo] = 1
            }
        }
    }
    if (input_src != "-") close(input_src)
}

function split_sources(str, arr,    len, i, ch, depth, current, count) {
    len = length(str)
    depth = 0
    current = ""
    count = 0
    for (i = 1; i <= len; i++) {
        ch = substr(str, i, 1)
        if (ch == "{" || ch == "[") {
            depth++
            current = current ch
        } else if (ch == "}" || ch == "]") {
            depth--
            current = current ch
        } else if (ch == "," && depth == 0) {
            gsub(/^[[:space:]"']+|[[:space:]"']+$/, "", current)
            if (current != "") arr[++count] = current
            current = ""
        } else {
            current = current ch
        }
    }
    gsub(/^[[:space:]"']+|[[:space:]"']+$/, "", current)
    if (current != "") arr[++count] = current
    return count
}

function glob_to_regex(g,    rgx, brace_part) {
    rgx = g
    gsub(/\./, "\\.", rgx)
    while (match(rgx, /\{[^{}]*\}/)) {
        brace_part = substr(rgx, RSTART + 1, RLENGTH - 2)
        gsub(/,/, "|", brace_part)
        rgx = substr(rgx, 1, RSTART - 1) "(" brace_part ")" substr(rgx, RSTART + RLENGTH)
    }
    gsub(/\*\*\//, "\001", rgx)
    gsub(/\*\*/, "\002", rgx)
    gsub(/\*/, "[^/]*", rgx)
    gsub(/\001/, "(.*/)?", rgx)
    gsub(/\002/, ".*", rgx)
    return "^" rgx "$"
}

function process_doc_sources() {
    if (curr_sources == "" || checked_doc[curr_file]) return
    checked_doc[curr_file] = 1

    n_globs = split_sources(curr_sources, globs)

    for (t_file in touched) {
        if (curr_repo == "workspace") {
            norm_file = t_file
        } else {
            p_prefix = "projects/" curr_repo "/"
            r_prefix = curr_repo "/"
            if (index(t_file, p_prefix) == 1) {
                norm_file = substr(t_file, length(p_prefix) + 1)
            } else if (index(t_file, r_prefix) == 1) {
                norm_file = substr(t_file, length(r_prefix) + 1)
            } else {
                continue
            }
        }

        matched = 0
        exact_matched = 0
        for (i = 1; i <= n_globs; i++) {
            g = globs[i]
            rgx = glob_to_regex(g)

            if (norm_file == g) {
                matched = 1
                exact_matched = 1
                break
            } else if (norm_file ~ rgx) {
                matched = 1
                break
            }
        }

        if (matched) {
            claimed[t_file] = 1
            file_claimants[t_file] = (file_claimants[t_file] ? file_claimants[t_file] ", " : "") curr_repo "/" curr_slug
            if (!doc_affected[curr_slug]++) {
                affected_slugs[num_affected++] = curr_slug
                slug_repo[curr_slug] = curr_repo
                slug_doc[curr_slug] = curr_file
                slug_kind[curr_slug] = curr_kind
            }
            doc_matched_files[curr_slug] = (doc_matched_files[curr_slug] ? doc_matched_files[curr_slug] ", " : "") norm_file

            # Check if this claiming doc or arch doc was touched
            if (touched_doc[curr_repo, curr_slug] || arch_touched[curr_repo] || arch_touched["workspace"]) {
                file_has_fresh_doc[t_file] = 1
                doc_is_fresh[curr_slug] = 1
            }

            # If file was deleted but doc still explicitly names it in sources, flag as dead source
            if (deleted[t_file] && exact_matched) {
                dead_sources[t_file, curr_repo, curr_slug] = 1
                num_dead_sources++
            }
        }
    }
}

# Per-file processing
FNR == 1 {
    if (NR > 1) {
        process_doc_sources()
    }
    curr_file = FILENAME
    curr_slug = ""
    curr_repo = ""
    curr_sources = ""
    curr_kind = ""

    if ($1 == "@doc") {
        curr_kind = $2
        curr_slug = $3
    }
}

FNR <= 15 && /^[ ]{2}repo:[ ]*/ {
    curr_repo = $0
    sub(/^[ ]{2}repo:[ ]*/, "", curr_repo)
}

FNR <= 20 && /^[ ]{2}sources:[ ]*/ {
    curr_sources = $0
    sub(/^[ ]{2}sources:[ ]*\[/, "", curr_sources)
    sub(/\][ ]*$/, "", curr_sources)
}

END {
    if (NR > 0) {
        process_doc_sources()
    }

    if (touched_count == 0) {
        print "docs-check: 0 modified files provided on stdin."
        exit 0
    }

    print "--- TOUCHED DOCUMENTATION ---"
    if (num_affected > 0) {
        for (i = 0; i < num_affected; i++) {
            s = affected_slugs[i]
            print "AFFECTED: " s " [" slug_repo[s] "] -> " slug_doc[s]
            print "  files: " doc_matched_files[s]
        }
    } else {
        print "none (no documented files modified)"
    }
    print ""

    # 1. Coverage Audit (Completeness)
    print "--- COVERAGE AUDIT (COMPLETENESS) ---"
    for (t_file in touched) {
        if (t_file ~ CODE_EXT_RE && t_file !~ EXCLUDE_RE) {
            # Deleted files are not active code files; they cannot be uncovered active code
            if (deleted[t_file]) continue

            if (!claimed[t_file]) {
                print "UNCOVERED: " t_file
                uncovered_count++
            }
        }
    }
    if (uncovered_count == 0) {
        print "CLEAN: all touched code files are covered by sources globs."
    }
    print ""

    # 2. Freshness Audit
    print "--- FRESHNESS AUDIT ---"
    for (t_file in touched) {
        if (t_file ~ CODE_EXT_RE && t_file !~ EXCLUDE_RE) {
            if (claimed[t_file] && !file_has_fresh_doc[t_file]) {
                action_desc = deleted[t_file] ? "code deleted without doc update" : "code modified without doc update"
                print "STALE DOC: " file_claimants[t_file] " (" action_desc ")"
                print "  file: " t_file
                stale_count++
            }
        }
    }
    if (num_affected > 0) {
        for (i = 0; i < num_affected; i++) {
            s = affected_slugs[i]
            if (doc_is_fresh[s]) {
                print "FRESH: " slug_repo[s] " > " s " (doc updated in change delta)"
            }
        }
    }
    if (stale_count == 0 && num_affected > 0) {
        print "CLEAN: all affected code files have corresponding doc updates."
    } else if (num_affected == 0) {
        print "CLEAN: no documented units affected."
    }
    print ""

    # 3. Dead Sources Audit (for deleted files still explicitly in doc sources)
    if (num_dead_sources > 0) {
        print "--- DEAD SOURCES AUDIT ---"
        for (k in dead_sources) {
            split(k, parts, SUBSEP)
            print "DEAD SOURCE: " parts[2] "/" parts[3] " still explicitly lists deleted file '" parts[1] "' in sources: (cleanup required)"
        }
        print ""
    }

    # Final Verdict
    if (uncovered_count > 0 || stale_count > 0 || num_dead_sources > 0) {
        if (uncovered_count > 0) {
            print "docs-check: FAILED: " uncovered_count " code file(s) are uncovered by any documentation." > "/dev/stderr"
        }
        if (stale_count > 0) {
            print "docs-check: FAILED: " stale_count " code file(s) are stale (code changed without doc update)." > "/dev/stderr"
        }
        if (num_dead_sources > 0) {
            print "docs-check: FAILED: " num_dead_sources " deleted code file(s) still explicitly listed in doc sources." > "/dev/stderr"
        }
        exit 1
    } else {
        print "docs-check: CLEAN: all touched code files are covered and fresh."
        exit 0
    }
}
