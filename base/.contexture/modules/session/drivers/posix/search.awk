# search.awk: searches session files and formats contextual JSON snippets
# Inputs: -v unit="$UNIT" -v query="$QUERY"

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
  match_count = 0
  cur_entity_type = "session"
  cur_entity_id = unit
  query_lower = tolower(query)
}

# When switching files, reset context
FNR == 1 {
  cur_file = FILENAME
  sub(/^.*\//, "", cur_file)
  if (FILENAME ~ /state\.md$/) {
    cur_entity_type = "session"
    cur_entity_id = unit
  } else if (FILENAME ~ /lanes\//) {
    cur_entity_type = "lane"
    # Extract lane name from path
    p = FILENAME
    sub(/^.*lanes\//, "", p)
    sub(/\/.*$/, "", p)
    cur_entity_id = p
  } else {
    cur_entity_type = "session"
    cur_entity_id = unit
  }
}

# Track entity header in files
/^@[a-zA-Z0-9_-]+/ {
  header = $0
  sub(/^@/, "", header)
  split(header, parts, /[ \t]+/)
  t = parts[1]
  id = parts[2]
  sub(/\(.*$/, "", id)
  if (t == "task") {
    cur_entity_type = "task"
    cur_entity_id = id
  } else if (t == "finding") {
    cur_entity_type = "finding"
    cur_entity_id = id
  } else if (t == "entry") {
    cur_entity_type = "entry"
    cur_entity_id = id
  }
}

# Search matching line
{
  line_lower = tolower($0)
  if (index(line_lower, query_lower) > 0) {
    # Skip comments at column 0 if they are grammar descriptions
    if ($0 ~ /^#/) next
    snippet = trim($0)
    # Strip leading YAML-like keys if it is a field
    sub(/^[A-Z_]+:[ ]*/, "", snippet)
    sub(/^"[ \t]*/, "", snippet)
    sub(/[ \t]*"$/, "", snippet)

    match_count++
    res_type[match_count] = cur_entity_type
    res_id[match_count] = cur_entity_id
    res_file[match_count] = cur_file
    res_snippet[match_count] = snippet
  }
}

END {
  printf "{"
  printf "\"unit\":\"%s\",", escape_json(unit)
  printf "\"query\":\"%s\",", escape_json(query)
  printf "\"total_matches\":%d,", match_count
  printf "\"results\":["
  for (i = 1; i <= match_count; i++) {
    printf "{"
    printf "\"entity_type\":\"%s\",", escape_json(res_type[i])
    printf "\"entity_id\":\"%s\",", escape_json(res_id[i])
    printf "\"file\":\"%s\",", escape_json(res_file[i])
    printf "\"snippet\":\"%s\"", escape_json(res_snippet[i])
    printf "}"
    if (i < match_count) printf ","
  }
  printf "]"
  printf "}\n"
}
