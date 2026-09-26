# search.awk: case-insensitive substring search over the session artifacts, one result
# per matching line, in the SPI result shape shared by every driver
# Inputs: -v unit="$UNIT" -v limit=N -v entity=TYPE, the query in the environment as SQ_QUERY; the files arrive
# in the order state, backlog, knowledge, journal, then each lane's recipe, journal, report
# Result keys: entity_type, entity_id, section, snippet; total_matches counts every
# match, results stop at limit

function escape_json(s,    r) {
  r = s
  gsub(/\\/, "\\\\", r)
  gsub(/"/, "\\\"", r)
  gsub(/\n/, "\\n", r)
  gsub(/\r/, "\\r", r)
  gsub(/\t/, "\\t", r)
  return r
}

function trim(s,    r) {
  r = s
  sub(/^[ \t\r\n]+/, "", r)
  sub(/[ \t\r\n]+$/, "", r)
  return r
}

BEGIN {
  # the query arrives in the environment (SQ_QUERY), never through -v, which would
  # interpret its backslash escapes
  if ("SQ_QUERY" in ENVIRON) query = ENVIRON["SQ_QUERY"]
  match_count = 0
  shown = 0
  cur_entity_type = "session"
  cur_entity_id = unit
  query_lower = tolower(query)
  if (limit == "") limit = 20
  limit = limit + 0
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
  printf "{"
  printf "\"unit\":\"%s\",", escape_json(unit)
  printf "\"query\":\"%s\",", escape_json(query)
  printf "\"mode\":\"exact\","
  printf "\"total_matches\":%d,", match_count
  printf "\"results\":["
  for (i = 1; i <= shown; i++) {
    printf "{"
    printf "\"entity_type\":\"%s\",", escape_json(res_type[i])
    printf "\"entity_id\":\"%s\",", escape_json(res_id[i])
    printf "\"section\":\"%s\",", escape_json(res_section[i])
    printf "\"snippet\":\"%s\"", escape_json(res_snippet[i])
    printf "}"
    if (i < shown) printf ","
  }
  printf "]"
  printf "}\n"
}
