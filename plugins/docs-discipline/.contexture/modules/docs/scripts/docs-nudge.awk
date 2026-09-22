#!/usr/bin/awk -f
# docs-nudge.awk: task context and pitfall extractor for the workspace docs (private engine; the nudge verb wraps it)
# Usage: ctx docs nudge backlog.md docs/<repo>/*.md
# Help: ctx docs help nudge
# Pure POSIX awk; extracts active task intent, matches relevant documentation and pitfalls,
# and forces the owning operational doc's @run/@build/@test targets on setup verbs.

BEGIN {
    active_slug = ""
    active_obj = ""
    active_refs = ""
    active_body = ""
    file_idx = 0
    num_matched = 0
    num_pitfalls = 0
    setup_intent = 0
}

function clean_text(txt,    t) {
    t = tolower(txt)
    gsub(/[^a-z0-9_.-]/, " ", t)
    return t
}

function add_keywords(txt,    words, n, i, w) {
    n = split(clean_text(txt), words, /[ ]+/)
    for (i = 1; i <= n; i++) {
        w = words[i]
        gsub(/^[-_.]+|[-_.]+$/, "", w)
        if (length(w) >= 3 && !stop_words[w]) {
            task_kw[w] = 1
        }
    }
}

function has_setup_verbs(txt,    words, n, i, w) {
    n = split(clean_text(txt), words, /[ ]+/)
    for (i = 1; i <= n; i++) {
        w = words[i]
        if (w ~ /^(install|run|build|test|env|toolchain)/) return 1
    }
    return 0
}

function repo_in_task(    r) {
    if (doc_repo == "") return 0
    r = tolower(doc_repo)
    if (task_kw[r]) return 1
    if (index(clean_text(active_refs), r) > 0) return 1
    if (index(clean_text(active_body), r) > 0) return 1
    return 0
}

function print_setup_steps(d, sec,    cnt, j, line) {
    cnt = setup_step_count[d "|" sec]
    line = ""
    for (j = 1; j <= cnt; j++) line = (line == "" ? "" : line "; ") setup_steps[d "|" sec, j]
    print "  " sec ": " line
}

function init_stop_words() {
    stop_words["the"] = 1; stop_words["and"] = 1; stop_words["for"] = 1; stop_words["with"] = 1
    stop_words["that"] = 1; stop_words["this"] = 1; stop_words["from"] = 1; stop_words["into"] = 1
    stop_words["task"] = 1; stop_words["status"] = 1; stop_words["refs"] = 1; stop_words["done"] = 1
    stop_words["todo"] = 1; stop_words["progress"] = 1; stop_words["objective"] = 1
    stop_words["description"] = 1; stop_words["details"] = 1; stop_words["acceptance"] = 1
    stop_words["criteria"] = 1; stop_words["implementation"] = 1; stop_words["develop"] = 1
    stop_words["prototype"] = 1; stop_words["scripts"] = 1; stop_words["using"] = 1
}

function compute_score(    score, kw_list, n, i, w) {
    if (doc_slug == "" || doc_repo == "") return 0
    score = 0
    if (task_kw[tolower(doc_slug)] || index(clean_text(active_refs), tolower(doc_slug)) > 0) score += 10
    if (task_kw[tolower(doc_repo)] || index(clean_text(active_body), tolower(doc_repo)) > 0) score += 5
    if (doc_keywords != "") {
        n = split(clean_text(doc_keywords), kw_list, /[ ]+/)
        for (i = 1; i <= n; i++) {
            w = kw_list[i]
            if (task_kw[w]) score += 3
        }
    }
    if (doc_desc != "") {
        n = split(clean_text(doc_desc), kw_list, /[ ]+/)
        for (i = 1; i <= n; i++) {
            w = kw_list[i]
            if (task_kw[w]) score += 1
        }
    }
    return score
}

FNR == 1 {
    file_idx++
    if (file_idx == 1) {
        init_stop_words()
    } else if (file_idx == 2) {
        if (curr_status == "IN_PROGRESS" && active_slug == "") {
            active_slug = curr_slug
            active_obj = curr_obj
            active_refs = curr_refs
            active_body = curr_body
        }
        if (active_slug == "") exit 0
        add_keywords(active_slug)
        add_keywords(active_obj)
        add_keywords(active_refs)
        add_keywords(active_body)
        setup_intent = has_setup_verbs(active_slug " " active_obj " " active_refs " " active_body)
    }

    doc_repo = ""
    doc_slug = ""
    doc_kind = ""
    doc_desc = ""
    doc_keywords = ""
    header_checked = 0
    in_pitfalls = 0
    curr_pf_id = ""
    setup_section = ""
    forced_doc = 0
}

file_idx == 1 {
    if ($1 == "@task") {
        if (curr_status == "IN_PROGRESS" && active_slug == "") {
            active_slug = curr_slug
            active_obj = curr_obj
            active_refs = curr_refs
            active_body = curr_body
        }
        curr_slug = $2
        curr_status = ""
        curr_obj = ""
        curr_refs = ""
        curr_body = ""
        next
    }
    if ($1 == "STATUS:") { curr_status = $2; next }
    if ($1 == "OBJECTIVE:") {
        curr_obj = $0
        sub(/^[ ]*OBJECTIVE:[ ]*"/, "", curr_obj)
        sub(/"[ ]*$/, "", curr_obj)
        next
    }
    if ($1 == "REFS:") {
        curr_refs = $0
        sub(/^[ ]*REFS:[ ]*\[/, "", curr_refs)
        sub(/\][ ]*$/, "", curr_refs)
        next
    }
    curr_body = curr_body " " $0
    next
}

file_idx >= 2 {
    if ($1 == "@doc") { doc_kind = $2; doc_slug = $3; next }
    if (FNR <= 12 && /^[ ]{2}repo:[ ]*/) { doc_repo = $2; next }
    if (FNR <= 12 && /^[ ]{2}description:[ ]*/) {
        doc_desc = $0
        sub(/^[ ]{2}description:[ ]*"/, "", doc_desc)
        sub(/"[ ]*$/, "", doc_desc)
        next
    }
    if (FNR <= 12 && /^[ ]{2}keywords:[ ]*/) {
        doc_keywords = $0
        sub(/^[ ]{2}keywords:[ ]*\[/, "", doc_keywords)
        sub(/\][ ]*$/, "", doc_keywords)
        next
    }

    # As soon as header finishes (at first subsequent block or FNR >= 12)
    if (!header_checked && (/^@[a-z_]+/ || FNR >= 12)) {
        header_checked = 1
        forced_doc = 0
        if (setup_intent && doc_kind == "operational" && repo_in_task()) {
            forced_doc = 1
        }
        s = compute_score()
        if (forced_doc) {
            s += 1000
        } else if (s < 3) {
            nextfile
        }
        doc_entry = doc_repo "/" doc_slug
        matched_docs[++num_matched] = doc_entry
        matched_score[doc_entry] = s
    }

    if (header_checked) {
        if (forced_doc) {
            if (/^@(run|build|test)$/) {
                setup_section = substr($0, 2)
                next
            }
            if (/^@[a-z_]+/) setup_section = ""
            if (setup_section != "") {
                if (/^[ ]{2}-[ ]+step:[ ]*/) {
                    st = $0
                    sub(/^[ ]{2}-[ ]+step:[ ]*"/, "", st)
                    sub(/"[ ]*$/, "", st)
                    sk = doc_repo "/" doc_slug "|" setup_section
                    setup_steps[sk, ++setup_step_count[sk]] = st
                } else if (tolower($0) ~ /engines|packagemanager|nvmrc/) {
                    match($0, /^[ ]*/)
                    ind = RLENGTH
                    tc = $0
                    sub(/^[ ]+/, "", tc)
                    gsub(/[ ]{2,}/, " ", tc)
                    sub(/[ ]+$/, "", tc)
                    tk = doc_repo "/" doc_slug
                    if (tc != "" && (toolchain_doc[tk] == "" || ind > toolchain_indent[tk])) {
                        toolchain_doc[tk] = tc
                        toolchain_indent[tk] = ind
                    }
                }
            }
        }
        if (/^@pitfalls/) { in_pitfalls = 1; next }
        if (/^@[a-z_]+/ && !/^@pitfalls/) {
            if (in_pitfalls) nextfile
        }
        if (in_pitfalls) {
            if (/^[ ]{2}-[ ]+id:[ ]*/) { curr_pf_id = $3; next }
            if (/^[ ]{4}summary:[ ]*/) {
                pf_sum = $0
                sub(/^[ ]{4}summary:[ ]*/, "", pf_sum)
                gsub(/"/, "", pf_sum)
                if (curr_pf_id != "") {
                    doc_entry = doc_repo "/" doc_slug
                    p_idx = ++doc_total_pfs[doc_entry]
                    doc_pf_id[doc_entry, p_idx] = curr_pf_id
                    doc_pf_sum[doc_entry, p_idx] = pf_sum
                    curr_pf_id = ""
                }
                next
            }
        }
    }
}

END {
    if (active_slug == "" && curr_status == "IN_PROGRESS") {
        active_slug = curr_slug
    }
    if (active_slug == "") exit 0

    print "[CONTEXT NUDGE: Task '" active_slug "']"

    if (num_matched > 0) {
        for (i = 1; i <= num_matched; i++) {
            for (j = i + 1; j <= num_matched; j++) {
                if (matched_score[matched_docs[j]] > matched_score[matched_docs[i]]) {
                    tmp = matched_docs[i]
                    matched_docs[i] = matched_docs[j]
                    matched_docs[j] = tmp
                }
            }
        }
        limit = num_matched > 3 ? 3 : num_matched
        docs_str = ""
        for (i = 1; i <= limit; i++) {
            d = matched_docs[i]
            docs_str = (docs_str == "" ? "" : docs_str ", ") d
            for (p = 1; p <= doc_total_pfs[d]; p++) {
                if (num_pitfalls < 3) {
                    pitfall_list[++num_pitfalls] = doc_pf_id[d, p] ": " doc_pf_sum[d, p]
                }
            }
        }
        print "Matched Docs: " docs_str
    } else {
        print "Matched Docs: none"
    }

    if (setup_intent) {
        for (i = 1; i <= num_matched; i++) {
            d = matched_docs[i]
            total_setup = setup_step_count[d "|run"] + setup_step_count[d "|build"] + setup_step_count[d "|test"]
            if (total_setup > 0 || toolchain_doc[d] != "") {
                print "Setup (" d "):"
                if (setup_step_count[d "|run"] > 0) print_setup_steps(d, "run")
                if (setup_step_count[d "|build"] > 0) print_setup_steps(d, "build")
                if (setup_step_count[d "|test"] > 0) print_setup_steps(d, "test")
                if (toolchain_doc[d] != "") print "  toolchain: " toolchain_doc[d]
            }
        }
    }

    if (num_pitfalls > 0) {
        pf_str = ""
        for (i = 1; i <= num_pitfalls; i++) {
            pf_str = (pf_str == "" ? "" : pf_str "; ") pitfall_list[i]
        }
        print "Pitfalls: " pf_str
    } else {
        print "Pitfalls: none"
    }
}
