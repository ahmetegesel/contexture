# docs-glob.awk: the header-source glob rule the check and the owner query share (private; the
# check, gate, and query verbs load it ahead of their engine with a second awk -f)
# A source claims a path when the path equals it or matches glob_to_regex of it; among several
# claiming sources the more specific has the longer literal part before its first wildcard
# (* or {; a source without one counts its whole length), then the fewer wildcards.

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
    gsub(/\./, "[.]", rgx)
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

function source_matches(path, g) {
    return (path == g || path ~ glob_to_regex(g))
}

function source_literal(g,    at) {
    at = match(g, /[*{]/)
    return at ? at - 1 : length(g)
}

function source_wildcards(g,    copy) {
    copy = g
    return gsub(/[*{]/, "", copy)
}

function source_beats(a, b) {
    if (source_literal(a) != source_literal(b)) return source_literal(a) > source_literal(b)
    return source_wildcards(a) < source_wildcards(b)
}
