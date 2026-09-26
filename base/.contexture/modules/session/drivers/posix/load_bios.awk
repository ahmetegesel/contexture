# load_bios.awk: generates paginated BIOS JSON view with task compaction
# Reads state.md, backlog.md, knowledge.md, and journal.md

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

function trim(s,    r) {
  r = s
  sub(/^[ \t\r\n]+/, "", r)
  sub(/[ \t\r\n]+$/, "", r)
  return r
}

function unquote(s,    r) {
  r = trim(s)
  if (substr(r, 1, 1) == "\"" && substr(r, length(r), 1) == "\"") {
    r = substr(r, 2, length(r) - 2)
  }
  return r
}

BEGIN {
  state_status = "ACTIVE"
  state_anchor = "A1"
  state_next_action = ""
  state_objective = ""
  state_repos = ""
  state_ref_sessions = ""

  task_count = 0
  finding_count = 0
  entry_count = 0

  cur_task_slug = ""
  cur_task_status = ""
  cur_task_obj = ""
  cur_task_desc = ""
  cur_task_crit = ""
  cur_task_det = ""
  cur_task_refs = ""

  cur_finding_name = ""
  cur_finding_summary = ""
  cur_finding_ref = ""
  cur_finding_sup = ""

  cur_entry_slug = ""
  cur_entry_anchor = ""
  cur_entry_what = ""
  cur_entry_group = ""
  cur_entry_thread = ""

  in_scalar = ""
}

function flush_task() {
  if (cur_task_slug == "") return
  task_count++
  t_slug[task_count] = cur_task_slug
  t_status[task_count] = (cur_task_status != "" ? cur_task_status : "TODO")
  t_obj[task_count] = cur_task_obj
  t_desc[task_count] = cur_task_desc
  t_crit[task_count] = cur_task_crit
  t_det[task_count] = cur_task_det
  t_refs[task_count] = cur_task_refs

  cur_task_slug = ""
  cur_task_status = ""
  cur_task_obj = ""
  cur_task_desc = ""
  cur_task_crit = ""
  cur_task_det = ""
  cur_task_refs = ""
}

function flush_finding() {
  if (cur_finding_name == "") return
  finding_count++
  f_name[finding_count] = cur_finding_name
  f_summary[finding_count] = cur_finding_summary
  f_ref[finding_count] = cur_finding_ref
  f_sup[finding_count] = cur_finding_sup

  cur_finding_name = ""
  cur_finding_summary = ""
  cur_finding_ref = ""
  cur_finding_sup = ""
}

function flush_entry() {
  if (cur_entry_slug == "") return
  entry_count++
  e_slug[entry_count] = cur_entry_slug
  e_anchor[entry_count] = cur_entry_anchor
  e_what[entry_count] = cur_entry_what
  e_group[entry_count] = cur_entry_group
  e_thread[entry_count] = cur_entry_thread

  cur_entry_slug = ""
  cur_entry_anchor = ""
  cur_entry_what = ""
  cur_entry_group = ""
  cur_entry_thread = ""
}

# ----------------- state.md -----------------
FILENAME ~ /state\.md$/ {
  if ($0 ~ /^status:[ ]*/) {
    sub(/^status:[ ]*/, "", $0)
    state_status = trim($0)
  } else if ($0 ~ /^current_anchor:[ ]*/) {
    sub(/^current_anchor:[ ]*/, "", $0)
    state_anchor = trim($0)
  } else if ($0 ~ /^next_action:[ ]*/) {
    sub(/^next_action:[ ]*/, "", $0)
    state_next_action = unquote($0)
  } else if ($0 ~ /^objective:[ ]*/) {
    sub(/^objective:[ ]*/, "", $0)
    state_objective = unquote($0)
  } else if ($0 ~ /^repos:[ ]*/) {
    sub(/^repos:[ ]*/, "", $0)
    state_repos = trim($0)
  } else if ($0 ~ /^ref_sessions:[ ]*/) {
    sub(/^ref_sessions:[ ]*/, "", $0)
    state_ref_sessions = trim($0)
  }
  next
}

# ----------------- backlog.md -----------------
FILENAME ~ /backlog\.md$/ {
  if ($0 ~ /^@task[ ]+/) {
    flush_task()
    in_scalar = ""
    line = $0
    sub(/^@task[ ]+/, "", line)
    cur_task_slug = trim(line)
    next
  }
  if (cur_task_slug == "") next

  if ($0 ~ /^[ ]{2}STATUS:[ ]*/) {
    in_scalar = ""
    v = $0
    sub(/^[ ]{2}STATUS:[ ]*/, "", v)
    cur_task_status = trim(v)
    next
  }
  if ($0 ~ /^[ ]{2}OBJECTIVE:[ ]*/) {
    in_scalar = ""
    v = $0
    sub(/^[ ]{2}OBJECTIVE:[ ]*/, "", v)
    cur_task_obj = unquote(v)
    next
  }
  if ($0 ~ /^[ ]{2}REFS:[ ]*/) {
    in_scalar = ""
    v = $0
    sub(/^[ ]{2}REFS:[ ]*/, "", v)
    cur_task_refs = trim(v)
    next
  }
  if ($0 ~ /^[ ]{2}DESCRIPTION ::[ ]*$/) {
    in_scalar = "desc"
    cur_task_desc = ""
    next
  }
  if ($0 ~ /^[ ]{2}ACCEPTANCE CRITERIA ::[ ]*$/) {
    in_scalar = "crit"
    cur_task_crit = ""
    next
  }
  if ($0 ~ /^[ ]{2}IMPLEMENTATION DETAILS ::[ ]*$/) {
    in_scalar = "det"
    cur_task_det = ""
    next
  }
  if (in_scalar != "" && $0 ~ /^[ ]{4}/) {
    line = substr($0, 5)
    if (in_scalar == "desc") {
      cur_task_desc = (cur_task_desc == "" ? line : cur_task_desc "\n" line)
    } else if (in_scalar == "crit") {
      cur_task_crit = (cur_task_crit == "" ? line : cur_task_crit "\n" line)
    } else if (in_scalar == "det") {
      cur_task_det = (cur_task_det == "" ? line : cur_task_det "\n" line)
    }
    next
  }
  if ($0 ~ /^[ \t]*$/) {
    in_scalar = ""
  }
  next
}

# ----------------- knowledge.md -----------------
FILENAME ~ /knowledge\.md$/ {
  if ($0 ~ /^@finding[ ]+/) {
    flush_finding()
    in_scalar = ""
    line = $0
    sub(/^@finding[ ]+/, "", line)
    cur_finding_name = trim(line)
    next
  }
  if (cur_finding_name == "") next

  if ($0 ~ /^[ ]{2}SUPERSEDES:[ ]*/) {
    in_scalar = ""
    v = $0
    sub(/^[ ]{2}SUPERSEDES:[ ]*/, "", v)
    cur_finding_sup = trim(v)
    next
  }
  if ($0 ~ /^[ ]{2}REF:[ ]*/) {
    in_scalar = ""
    v = $0
    sub(/^[ ]{2}REF:[ ]*/, "", v)
    cur_finding_ref = unquote(v)
    next
  }
  if ($0 ~ /^[ ]{2}SUMMARY ::[ ]*$/) {
    in_scalar = "finding_summary"
    cur_finding_summary = ""
    next
  }
  if (in_scalar == "finding_summary" && $0 ~ /^[ ]{4}/) {
    line = substr($0, 5)
    cur_finding_summary = (cur_finding_summary == "" ? line : cur_finding_summary "\n" line)
    next
  }
  if ($0 ~ /^[ \t]*$/) {
    in_scalar = ""
  }
  next
}

# ----------------- journal.md -----------------
FILENAME ~ /journal\.md$/ {
  # Closure check
  if ($0 ~ /^[ ]{2}(CLOSES|SUPERSEDES):[ ]*/) {
    line = $0
    sub(/^[ ]{2}(CLOSES|SUPERSEDES):[ ]*/, "", line)
    target_cand = line
    sub(/[ (].*$/, "", target_cand)
    closed_slugs[target_cand] = 1
  }

  if ($0 ~ /^@entry[ ]+/) {
    flush_entry()
    line = $0
    sub(/^@entry[ ]+/, "", line)
    cur_entry_slug = trim(line)
    next
  }
  if (cur_entry_slug == "") next

  if ($0 ~ /^[ ]{2}ANCHOR:[ ]*/) {
    v = $0
    sub(/^[ ]{2}ANCHOR:[ ]*/, "", v)
    cur_entry_anchor = trim(v)
    next
  }
  if ($0 ~ /^[ ]{2}WHAT:[ ]*/) {
    v = $0
    sub(/^[ ]{2}WHAT:[ ]*/, "", v)
    cur_entry_what = unquote(v)
    next
  }
  if ($0 ~ /^[ ]{2}GROUP:[ ]*/) {
    v = $0
    sub(/^[ ]{2}GROUP:[ ]*/, "", v)
    cur_entry_group = trim(v)
    next
  }
  if ($0 ~ /^[ ]{2}THREAD:[ ]*/) {
    v = $0
    sub(/^[ ]{2}THREAD:[ ]*/, "", v)
    cur_entry_thread = trim(v)
    next
  }
  next
}

END {
  flush_task()
  flush_finding()
  flush_entry()

  # Output full JSON
  printf "{"
  printf "\"unit\":\"%s\",", escape_json(unit)
  printf "\"page\":%d,", (page > 0 ? page : 1)
  printf "\"total_pages\":1,"
  printf "\"complete\":true,"

  # State object
  printf "\"state\":{"
  printf "\"status\":\"%s\",", escape_json(state_status)
  printf "\"current_anchor\":\"%s\",", escape_json(state_anchor)
  printf "\"next_action\":\"%s\",", escape_json(state_next_action)
  printf "\"objective\":\"%s\",", escape_json(state_objective)
  printf "\"repos\":[],"
  printf "\"ref_sessions\":[]"
  printf "},"

  # Backlog array with compaction for DONE tasks
  printf "\"backlog\":["
  first = 1
  for (i = 1; i <= task_count; i++) {
    if (!first) printf ","
    first = 0
    printf "{"
    printf "\"slug\":\"%s\",", escape_json(t_slug[i])
    printf "\"status\":\"%s\",", escape_json(t_status[i])
    printf "\"objective\":\"%s\"", escape_json(t_obj[i])
    # If not DONE, keep full details
    if (t_status[i] != "DONE") {
      printf ",\"description\":\"%s\"", escape_json(t_desc[i])
      printf ",\"criteria\":\"%s\"", escape_json(t_crit[i])
      printf ",\"details\":\"%s\"", escape_json(t_det[i])
      printf ",\"refs\":[]"
    }
    printf "}"
  }
  printf "],"

  # Knowledge array
  printf "\"knowledge\":["
  first = 1
  for (i = 1; i <= finding_count; i++) {
    if (!first) printf ","
    first = 0
    printf "{"
    printf "\"name\":\"%s\",", escape_json(f_name[i])
    printf "\"summary\":\"%s\",", escape_json(f_summary[i])
    printf "\"ref\":\"%s\"", escape_json(f_ref[i])
    if (f_sup[i] != "") {
      printf ",\"supersedes\":\"%s\"", escape_json(f_sup[i])
    }
    printf "}"
  }
  printf "],"

  # Board entries array (unclosed entries)
  printf "\"board_entries\":["
  first = 1
  for (i = 1; i <= entry_count; i++) {
    if (e_slug[i] in closed_slugs) continue
    if (!first) printf ","
    first = 0
    printf "{"
    printf "\"slug\":\"%s\",", escape_json(e_slug[i])
    printf "\"anchor\":\"%s\",", escape_json(e_anchor[i])
    printf "\"what\":\"%s\",", escape_json(e_what[i])
    printf "\"group\":\"%s\",", escape_json(e_group[i])
    printf "\"thread\":\"%s\"", escape_json(e_thread[i])
    printf "}"
  }
  printf "],"

  # Ref sessions
  printf "\"ref_sessions\":[]"

  printf "}\n"
}
