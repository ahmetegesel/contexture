# parse_blocks.awk: pure POSIX awk state machine for typed block parsing
# Modes:
#   action="to_json" (default): prints JSON array of all blocks
#   action="find" -v target_id="...": prints JSON object for target block or exits 1
#   action="check_closure" -v target_id="...": checks if target_id is closed by any entry

# a backslash doubled by concatenation, never by a gsub replacement: a replacement of
# four backslashes yields one under busybox awk and gawk --posix
function bs_double(s,    n, p, i, o) {
  n = split(s, p, /\\/)
  o = (n ? p[1] : "")
  for (i = 2; i <= n; i++) o = o "\\" "\\" p[i]
  return o
}

function escape_json(s,    r) {
  r = bs_double(s)
  gsub(/"/, "\\\"", r)
  gsub(/\n/, "\\n", r)
  gsub(/\r/, "\\r", r)
  gsub(/\t/, "\\t", r)
  return r
}

function flush_block(    i, k, out, first, val, desc, crit, det, sum, obj) {
  if (cur_type == "") return

  block_count++
  b_type[block_count] = cur_type
  b_id[block_count] = cur_id

  # Build JSON object representation for this block
  out = "{"
  out = out "\"type\":\"" escape_json(cur_type) "\","
  out = out "\"id\":\"" escape_json(cur_id) "\""

  for (i = 1; i <= cur_field_count; i++) {
    k = cur_field_key[i]
    val = cur_field_val[i]
    out = out ",\"" escape_json(k) "\":\"" escape_json(val) "\""
  }

  out = out "}"
  b_json[block_count] = out

  if (action == "find" && cur_id == target_id) {
    found_json = out
    found = 1
  }

  cur_type = ""
  cur_id = ""
  cur_field_count = 0
  in_scalar = 0
  scalar_key = ""
  scalar_val = ""
}

BEGIN {
  block_count = 0
  cur_type = ""
  cur_id = ""
  cur_field_count = 0
  in_scalar = 0
  scalar_key = ""
  scalar_val = ""
  found = 0
  found_json = ""
  closure_found = 0
  closer_slug = ""
  closer_reason = ""
}

# Check for closure lines in journal
{
  if (action == "check_closure" && target_id != "") {
    if ($0 ~ /^[ ]{2}(CLOSES|SUPERSEDES):[ ]*/) {
      line = $0
      sub(/^[ ]{2}(CLOSES|SUPERSEDES):[ ]*/, "", line)
      # Format: slug (verdict: reason)
      target_cand = line
      sub(/[ (].*$/, "", target_cand)
      if (target_cand == target_id) {
        closure_found = 1
        closer_reason = line
        if (sub(/^[^()]*\(/, "", closer_reason)) {
          sub(/\)[^)]*$/, "", closer_reason)
        }
      }
    }
  }
}

# New block header: @type id
/^@[a-zA-Z0-9_-]+/ {
  flush_block()

  header = $0
  sub(/^@/, "", header)
  split(header, parts, /[ \t]+/)
  cur_type = parts[1]
  cur_id = parts[2]
  # Remove any trailing parentheses or punctuation from id
  sub(/\(.*$/, "", cur_id)

  if (action == "check_closure" && closure_found && closer_slug == "") {
    # If closure was found in the entry we just left, record its slug
    # We track entry slugs
  }
  next
}

# Block scalar header: KEY ::
/^[ ]{2}[A-Z_]+[ ]*::[ ]*$/ {
  line = $0
  sub(/^[ ]{2}/, "", line)
  sub(/[ ]*::[ ]*$/, "", line)
  in_scalar = 1
  scalar_key = tolower(line)
  scalar_val = ""
  next
}

# Continuation line for block scalar: 4 spaces indent
/^[ ]{4}/ {
  if (in_scalar) {
    line = substr($0, 5)
    if (scalar_val == "") {
      scalar_val = line
    } else {
      scalar_val = scalar_val "\n" line
    }
    # Keep updated in fields
    # Check if key already recorded
    f_idx = 0
    for (i = 1; i <= cur_field_count; i++) {
      if (cur_field_key[i] == scalar_key) {
        f_idx = i
        break
      }
    }
    if (f_idx == 0) {
      cur_field_count++
      f_idx = cur_field_count
      cur_field_key[f_idx] = scalar_key
    }
    cur_field_val[f_idx] = scalar_val
    next
  }
}

# Regular field: 2 spaces KEY: value
/^[ ]{2}[A-Z_]+:[ ]*/ {
  in_scalar = 0
  line = $0
  sub(/^[ ]{2}/, "", line)
  colon_pos = index(line, ":")
  k = tolower(substr(line, 1, colon_pos - 1))
  v = substr(line, colon_pos + 1)
  sub(/^[ \t]+/, "", v)
  sub(/[ \t]+$/, "", v)
  # Strip surrounding quotes if present
  if (substr(v, 1, 1) == "\"" && substr(v, length(v), 1) == "\"") {
    v = substr(v, 2, length(v) - 2)
  }

  cur_field_count++
  cur_field_key[cur_field_count] = k
  cur_field_val[cur_field_count] = v
  next
}

# Blank line ends scalar
/^[ \t]*$/ {
  in_scalar = 0
}

END {
  flush_block()

  if (action == "check_closure") {
    if (closure_found) {
      printf "CLOSED|%s|%s\n", closer_slug, closer_reason
      exit 0
    } else {
      printf "OPEN\n"
      exit 0
    }
  }

  if (action == "find") {
    if (found) {
      print found_json
      exit 0
    } else {
      exit 1
    }
  }

  # Default: to_json
  printf "["
  for (i = 1; i <= block_count; i++) {
    printf "%s", b_json[i]
    if (i < block_count) printf ","
  }
  printf "]\n"
}
