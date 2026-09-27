# search.awk: the exact mode of search.query (docs/the-engine.md, Search): a case-insensitive
# (ASCII) substring of one line of the artifact text, a column-0 comment never matching; one
# result per matching entity and section, in record order, its snippet the first matching
# line, every exact result scoring 0. Run after canon.awk (the JSON string form) and
# model.awk (the payload reader and the refusal), in the C locale.
# Inputs: the files in the order state, backlog, knowledge, journal, then each lane in
# bytewise order: recipe, journal, report; the environment: PX_PAY (the payload, its query
# key), PX_ERR, SQ_UNIT, SQ_LIMIT, SQ_ENTITY, SQ_MODE (checked shapes).
# Result keys: unit, query, mode, total_matches, results [{entity_type, entity_id, section,
# snippet, score}]; total_matches counts the matching entity and section pairs, results
# stop at the limit.

function trim(s,    r) {
  r = s
  sub(/^[ \t\r\n]+/, "", r)
  sub(/[ \t\r\n]+$/, "", r)
  return r
}

BEGIN {
  FN = "search.query"; ERRF = ENVIRON["PX_ERR"]; REFUSED = 0
  # the query arrives in the payload file, never through -v, which would interpret its
  # backslash escapes
  load_payload(ENVIRON["PX_PAY"])
  query = has("query") ? pv("query") : ""
  if (query !~ /[^ \t\r\n]/) { REFUSED = 1; die(1, "ERR_INVALID_ARGUMENT", "the search query is empty") }
  if (ENVIRON["SQ_MODE"] != "exact") { REFUSED = 1; die(1, "ERR_CAPABILITY_UNSUPPORTED", "mode '" ENVIRON["SQ_MODE"] "' is not supported; declared modes: exact") }
  unit = ENVIRON["SQ_UNIT"]
  limit = ENVIRON["SQ_LIMIT"] + 0
  entity = ENVIRON["SQ_ENTITY"]
  match_count = 0
  shown = 0
  cur_entity_type = "session"
  cur_entity_id = unit
  query_lower = tolower(query)
}

# a new file sets the section and the default entity
FNR == 1 {
  lane = ""
  if (FILENAME ~ /\/lanes\/[^\/]+\/[^\/]+$/) {
    p = FILENAME
    sub(/^.*\/lanes\//, "", p)
    lane = p
    sub(/\/.*$/, "", lane)
    base = p
    sub(/^[^\/]*\//, "", base)
    sub(/\.md$/, "", base)
    section = "lane_" base
    cur_entity_type = "lane"
    cur_entity_id = lane
  } else {
    base = FILENAME
    sub(/^.*\//, "", base)
    sub(/\.md$/, "", base)
    section = base
    cur_entity_type = "session"
    cur_entity_id = unit
  }
}

# a block head moves the entity
/^@[a-zA-Z0-9_-]+/ {
  header = $0
  sub(/^@/, "", header)
  split(header, parts, /[ \t]+/)
  t = parts[1]
  id = parts[2]
  sub(/\(.*$/, "", id)
  if (t == "task") {
    cur_entity_type = "task"; cur_entity_id = id
  } else if (t == "finding") {
    cur_entity_type = "finding"; cur_entity_id = id
  } else if (t == "entry" && lane != "") {
    cur_entity_type = "lane_entry"; cur_entity_id = lane "/" id
  } else if (t == "entry") {
    cur_entity_type = "entry"; cur_entity_id = id
  } else if (t == "anchor" && lane == "") {
    cur_entity_type = "session"; cur_entity_id = unit
  }
}

{
  line_lower = tolower($0)
  if (index(line_lower, query_lower) > 0) {
    # a column-0 comment is a grammar description, never a match
    if ($0 ~ /^#/) next
    if (entity != "" && entity != "all" && cur_entity_type != entity) next
    # one row per entity and section: a later matching line of the same pair adds nothing
    key = cur_entity_type SUBSEP cur_entity_id SUBSEP section
    if (key in seen) next
    seen[key] = 1
    match_count++
    if (shown >= limit) next
    snippet = trim($0)
    # a field line reads as its value
    sub(/^[A-Z_]+:[ ]*/, "", snippet)
    sub(/^"[ \t]*/, "", snippet)
    sub(/[ \t]*"$/, "", snippet)
    shown++
    res_type[shown] = cur_entity_type
    res_id[shown] = cur_entity_id
    res_section[shown] = section
    res_snippet[shown] = snippet
  }
}

END {
  if (REFUSED) exit 1
  printf "{"
  printf "\"unit\":%s,", jstr(unit)
  printf "\"query\":%s,", jstr(query)
  printf "\"mode\":\"exact\","
  printf "\"total_matches\":%d,", match_count
  printf "\"results\":["
  for (i = 1; i <= shown; i++) {
    printf "{"
    printf "\"entity_type\":%s,", jstr(res_type[i])
    printf "\"entity_id\":%s,", jstr(res_id[i])
    printf "\"section\":%s,", jstr(res_section[i])
    printf "\"snippet\":%s,", jstr(res_snippet[i])
    printf "\"score\":0"
    printf "}"
    if (i < shown) printf ","
  }
  printf "]"
  printf "}\n"
}
