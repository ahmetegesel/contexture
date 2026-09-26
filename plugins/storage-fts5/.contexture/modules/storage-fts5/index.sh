# index.sh: the derived index of the fts5 store, shared by the driver and the migration
# (sourced; needs MODULE_DIR). The store keeps every artifact's canonical text verbatim
# (the artifacts table); the relational rows (sessions, tasks, entries, closures,
# findings, lanes, lane_entries) are rebuilt from the text of the artifact that changed,
# and the search documents follow them through the schema's triggers.
#
# idx_artifact_sql <unit> <key> <file> <now>: the SQL that stores <file> as the artifact
# <key> of <unit> and rebuilds that artifact's rows; run inside one transaction.

# the closer parse shared with the migration: one home, spliced ahead of each journal program
IDX_CLOSER_AWK=$(cat "$MODULE_DIR/closer.awk")

idx_q() {
  printf '%s' "$1" | sed "s/'/''/g"
}

idx_artifact_sql() {
  ix_u=$1
  ix_key=$2
  ix_f=$3
  ix_now=$4
  case "$ix_key" in
    lane/*/recipe|lane/*/journal|lane/*/report)
      ix_rest=${ix_key#lane/}
      ix_lane=${ix_rest%/*}
      ix_name=${ix_rest##*/}
      ;;
    *)
      ix_lane=""
      ix_name=$ix_key
      ;;
  esac
  printf "INSERT OR REPLACE INTO artifacts (unit, lane_slug, name, body, updated_at) VALUES ('%s', '%s', '%s', CAST(readfile('%s') AS TEXT), '%s');\n" \
    "$(idx_q "$ix_u")" "$(idx_q "$ix_lane")" "$(idx_q "$ix_name")" "$(idx_q "$ix_f")" "$ix_now"
  if [ -n "$ix_lane" ]; then
    printf "INSERT OR IGNORE INTO lanes (unit, lane_slug, goal, recipe, report, created_at, updated_at) VALUES ('%s', '%s', '', '', '', '%s', '%s');\n" \
      "$(idx_q "$ix_u")" "$(idx_q "$ix_lane")" "$ix_now" "$ix_now"
  fi
  case "$ix_name" in
    state) idx_state_sql "$ix_u" "$ix_f" ;;
    backlog) idx_backlog_sql "$ix_u" "$ix_f" "$ix_now" ;;
    knowledge) idx_knowledge_sql "$ix_u" "$ix_f" "$ix_now" ;;
    journal)
      if [ -n "$ix_lane" ]; then
        idx_lane_journal_sql "$ix_u" "$ix_lane" "$ix_f" "$ix_now"
      else
        idx_journal_sql "$ix_u" "$ix_f" "$ix_now"
      fi
      ;;
    recipe)
      printf "UPDATE lanes SET recipe = CAST(readfile('%s') AS TEXT), goal = '%s', updated_at = '%s' WHERE unit = '%s' AND lane_slug = '%s';\n" \
        "$(idx_q "$ix_f")" "$(idx_q "$(awk '/^[ \t]*GOAL:[ \t]*/ { v = $0; sub(/^[ \t]*GOAL:[ \t]*"?/, "", v); sub(/"?[ \t]*$/, "", v); print v; exit }' "$ix_f")")" \
        "$ix_now" "$(idx_q "$ix_u")" "$(idx_q "$ix_lane")"
      ;;
    report)
      printf "UPDATE lanes SET report = CAST(readfile('%s') AS TEXT), updated_at = '%s' WHERE unit = '%s' AND lane_slug = '%s';\n" \
        "$(idx_q "$ix_f")" "$ix_now" "$(idx_q "$ix_u")" "$(idx_q "$ix_lane")"
      ;;
  esac
}

# state: the session row's fields (a status outside ACTIVE and CLOSED keeps the row valid)
idx_state_sql() {
  awk -v u="$1" '
    function esc(s) { gsub(/'\''/, "'\'''\''", s); return s }
    function val(line, key) { sub("^" key ":[ \t]*", "", line); sub(/[ \t\r]+$/, "", line); return line }
    function unq(v) { if (v ~ /^".*"$/) v = substr(v, 2, length(v) - 2); return v }
    /^status:/ && st == "" { st = val($0, "status") }
    /^current_anchor:/ && an == "" { an = val($0, "current_anchor") }
    /^next_action:/ && nx == "" { nx = unq(val($0, "next_action")) }
    /^objective:/ && ob == "" { ob = unq(val($0, "objective")) }
    /^repos:/ && rp == "" { rp = val($0, "repos") }
    /^ref_sessions:/ && rs == "" { rs = val($0, "ref_sessions") }
    END {
      if (st != "ACTIVE" && st != "CLOSED") st = "ACTIVE"
      if (an == "") an = "A1"
      printf "UPDATE sessions SET status = '\''%s'\'', current_anchor = '\''%s'\'', next_action = '\''%s'\'', objective = '\''%s'\'', repos = '\''%s'\'', ref_sessions = '\''%s'\'' WHERE unit = '\''%s'\'';\n", esc(st), esc(an), esc(nx), esc(ob), esc(rp == "" ? "[]" : rp), esc(rs == "" ? "[]" : rs), esc(u)
    }
  ' "$2"
}

# backlog: one task row per @task block, in file order (sort_order); REFS as a JSON array
idx_backlog_sql() {
  printf "DELETE FROM tasks WHERE unit = '%s';\n" "$(idx_q "$1")"
  awk -v u="$1" -v now="$3" '
    function esc(s) { gsub(/'\''/, "'\'''\''", s); return s }
    function jesc(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); return s }
    function refs_json(v,   n, w, i, out) {
      sub(/^[ \t]*\[/, "", v); sub(/\][ \t]*$/, "", v); gsub(/,/, " ", v)
      n = split(v, w, /[ \t]+/); out = ""
      for (i = 1; i <= n; i++) if (w[i] != "") out = out (out == "" ? "" : ",") "\"" jesc(w[i]) "\""
      return "[" out "]"
    }
    function flush_task() {
      if (slug != "") {
        # the blank separator after a block folds into its last scalar: trim it
        sub(/\n+$/, "", desc); sub(/\n+$/, "", crit); sub(/\n+$/, "", det)
        if (status != "TODO" && status != "IN_PROGRESS" && status != "DONE") status = "TODO"
        ord++
        printf "INSERT OR IGNORE INTO tasks (unit, slug, status, objective, description, acceptance_criteria, implementation_details, refs, sort_order, created_at, updated_at) VALUES ('\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', %d, '\''%s'\'', '\''%s'\'');\n",
          esc(u), esc(slug), esc(status), esc(obj), esc(desc), esc(crit), esc(det), esc(refs_json(refs)), ord, now, now
      }
      slug = ""; status = "TODO"; obj = ""; desc = ""; crit = ""; det = ""; refs = ""; mode = ""; seen_status = 0
    }
    BEGIN { slug = ""; status = "TODO"; obj = ""; desc = ""; crit = ""; det = ""; refs = ""; mode = ""; ord = 0 }
    /^@task[ \t]/ { flush_task(); slug = $2; next }
    /^@[A-Za-z]/ { flush_task(); next }
    /^[ \t]+STATUS:/ { if (!seen_status) { status = $2; seen_status = 1 }; mode = ""; next }
    /^[ \t]+OBJECTIVE:/ {
      line = $0; sub(/^[ \t]+OBJECTIVE:[ \t]*"?/, "", line); sub(/"?[ \t]*$/, "", line)
      obj = line; mode = ""; next
    }
    /^[ \t]+REFS:/ { line = $0; sub(/^[ \t]+REFS:[ \t]*/, "", line); refs = line; mode = ""; next }
    /^[ \t]+DESCRIPTION ::/ { mode = "desc"; next }
    /^[ \t]+ACCEPTANCE CRITERIA ::/ { mode = "crit"; next }
    /^[ \t]+IMPLEMENTATION DETAILS ::/ { mode = "det"; next }
    {
      line = $0; sub(/^[ \t][ \t]?[ \t]?[ \t]?/, "", line)
      if (mode == "desc") desc = (desc == "" ? line : desc "\n" line)
      else if (mode == "crit") crit = (crit == "" ? line : crit "\n" line)
      else if (mode == "det") det = (det == "" ? line : det "\n" line)
    }
    END { flush_task() }
  ' "$2"
}

# journal: one entry row per @entry block and one anchor row per @anchor line, file
# order, a repeated slug keyed by its ordinal; closer lines land in closures
idx_journal_sql() {
  printf "DELETE FROM closures WHERE unit = '%s' AND lane_slug = '';\nDELETE FROM entries WHERE unit = '%s';\n" "$(idx_q "$1")" "$(idx_q "$1")"
  awk -v u="$1" -v now="$3" "$IDX_CLOSER_AWK"'
    function esc(s) { gsub(/'\''/, "'\'''\''", s); return s }
    function flush_entry() {
      if (slug != "") {
        sub(/\n+$/, "", what)
        printf "INSERT INTO entries (unit, slug, ordinal, entry_type, anchor, what, entry_group, thread, closes, supersedes, ref, rhythm, is_knowledge, created_at) VALUES ('\''%s'\'', '\''%s'\'', %d, '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', %d, '\''%s'\'');\n",
          esc(u), esc(slug), ordinal, esc(type), esc(anchor), esc(what), esc(grp), esc(thread), esc(closes), esc(supersedes), esc(ref), esc(rhythm), is_k, now
      }
      slug = ""; type = "ENTRY"; anchor = "A1"; what = ""; grp = ""; thread = "none"; closes = ""; supersedes = ""; ref = ""; rhythm = ""; is_k = 0; mode = ""
    }
    BEGIN { slug = ""; type = "ENTRY"; anchor = "A1"; what = ""; grp = ""; thread = "none"; closes = ""; supersedes = ""; ref = ""; rhythm = ""; is_k = 0; mode = "" }
    /^@anchor / {
      flush_entry()
      slug = sprintf("%s-anchor-%s", substr(now, 1, 10), $2)
      ordinal = ++occ[slug]
      type = "ANCHOR"; anchor = $2; what = $0
      flush_entry()
      next
    }
    /^@entry / { flush_entry(); slug = $2; ordinal = ++occ[slug]; type = "ENTRY"; next }
    /^@[A-Za-z]/ { flush_entry(); next }
    slug == "" { next }
    /^[ \t]+ANCHOR:/ { anchor = $2; mode = ""; next }
    /^[ \t]+GROUP:/ { grp = $2; mode = ""; next }
    /^[ \t]+THREAD:/ { line = $0; sub(/^[ \t]+THREAD:[ \t]*/, "", line); thread = line; mode = ""; next }
    /^[ \t]+CLOSES:/ { t = closer($0, "CLOSES", ""); if (closes == "") closes = t; mode = ""; next }
    /^[ \t]+SUPERSEDES:/ { t = closer($0, "SUPERSEDES", ""); if (supersedes == "") supersedes = t; mode = ""; next }
    /^[ \t]+REF:/ { line = $0; sub(/^[ \t]+REF:[ \t]*"?/, "", line); sub(/"?[ \t]*$/, "", line); ref = line; mode = ""; next }
    /^[ \t]+RHYTHM:/ { line = $0; sub(/^[ \t]+RHYTHM:[ \t]*/, "", line); rhythm = line; mode = ""; next }
    /^[ \t]+KNOWLEDGE:[ \t]*true/ { is_k = 1; mode = ""; next }
    /^[ \t]+WHAT:/ {
      line = $0; sub(/^[ \t]+WHAT:[ \t]*"?/, "", line); sub(/"?[ \t]*$/, "", line)
      what = line; mode = "what"; next
    }
    {
      if (mode == "what") {
        line = $0; sub(/^[ \t][ \t]?[ \t]?[ \t]?/, "", line); sub(/"?[ \t]*$/, "", line)
        what = (what == "" ? line : what "\n" line)
      }
    }
    END { flush_entry() }
  ' "$2"
}

# knowledge: one finding row per @finding block; the superseded status is derived from
# the successors' SUPERSEDES lines (the record marks supersession by reference alone)
idx_knowledge_sql() {
  printf "DELETE FROM findings WHERE unit = '%s';\n" "$(idx_q "$1")"
  awk -v u="$1" -v now="$3" '
    function esc(s) { gsub(/'\''/, "'\'''\''", s); return s }
    function flush_finding() {
      if (name != "") {
        sub(/\n+$/, "", summary)
        printf "INSERT OR IGNORE INTO findings (unit, name, status, summary, ref, supersedes, created_at, updated_at) VALUES ('\''%s'\'', '\''%s'\'', '\''ACTIVE'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'');\n",
          esc(u), esc(name), esc(summary), esc(ref), esc(supersedes), now, now
      }
      name = ""; summary = ""; ref = ""; supersedes = ""; mode = ""
    }
    BEGIN { name = ""; summary = ""; ref = ""; supersedes = ""; mode = "" }
    /^@finding / { flush_finding(); name = $2; next }
    /^@[A-Za-z]/ { flush_finding(); next }
    /^[ \t]+REF:/ { line = $0; sub(/^[ \t]+REF:[ \t]*"?/, "", line); sub(/"?[ \t]*$/, "", line); ref = line; mode = ""; next }
    /^[ \t]+SUPERSEDES:/ { line = $0; sub(/^[ \t]+SUPERSEDES:[ \t]*/, "", line); sub(/[ \t]+.*$/, "", line); supersedes = line; mode = ""; next }
    /^[ \t]+SUMMARY ::/ { mode = "summary"; next }
    {
      if (mode == "summary") {
        line = $0; sub(/^[ \t][ \t]?[ \t]?[ \t]?/, "", line)
        summary = (summary == "" ? line : summary "\n" line)
      }
    }
    END { flush_finding() }
  ' "$2"
  printf "UPDATE findings SET status = 'SUPERSEDED', superseded_by = (SELECT s.name FROM findings s WHERE s.unit = findings.unit AND s.supersedes = findings.name ORDER BY s.id LIMIT 1), updated_at = '%s' WHERE unit = '%s' AND name IN (SELECT supersedes FROM findings WHERE unit = '%s' AND supersedes != '');\n" \
    "$3" "$(idx_q "$1")" "$(idx_q "$1")"
}

# lane journal: one lane entry row per @entry block, closer lines in closures (lane set)
idx_lane_journal_sql() {
  printf "DELETE FROM closures WHERE unit = '%s' AND lane_slug = '%s';\nDELETE FROM lane_entries WHERE unit = '%s' AND lane_slug = '%s';\n" \
    "$(idx_q "$1")" "$(idx_q "$2")" "$(idx_q "$1")" "$(idx_q "$2")"
  awk -v u="$1" -v l="$2" -v now="$4" "$IDX_CLOSER_AWK"'
    function esc(s) { gsub(/'\''/, "'\'''\''", s); return s }
    function flush_le() {
      if (slug != "") {
        sub(/\n+$/, "", what)
        printf "INSERT INTO lane_entries (unit, lane_slug, slug, ordinal, what, thread, ref, created_at) VALUES ('\''%s'\'', '\''%s'\'', '\''%s'\'', %d, '\''%s'\'', '\''%s'\'', '\''%s'\'', '\''%s'\'');\n",
          esc(u), esc(l), esc(slug), ordinal, esc(what), esc(thread), esc(ref), now
      }
      slug = ""; what = ""; thread = "none"; ref = ""; mode = ""
    }
    BEGIN { slug = ""; what = ""; thread = "none"; ref = ""; mode = "" }
    /^@entry / { flush_le(); slug = $2; ordinal = ++occ[slug]; next }
    /^@[A-Za-z]/ { flush_le(); next }
    slug == "" { next }
    /^[ \t]+THREAD:/ { line = $0; sub(/^[ \t]+THREAD:[ \t]*/, "", line); thread = line; mode = ""; next }
    /^[ \t]+CLOSES:/ { closer($0, "CLOSES", l); mode = ""; next }
    /^[ \t]+SUPERSEDES:/ { closer($0, "SUPERSEDES", l); mode = ""; next }
    /^[ \t]+REF:/ { line = $0; sub(/^[ \t]+REF:[ \t]*"?/, "", line); sub(/"?[ \t]*$/, "", line); ref = line; mode = ""; next }
    /^[ \t]+[A-Z]+:/ && $0 !~ /^[ \t]+WHAT:/ { mode = ""; next }
    /^[ \t]+WHAT:/ {
      line = $0; sub(/^[ \t]+WHAT:[ \t]*"?/, "", line); sub(/"?[ \t]*$/, "", line)
      what = line; mode = "what"; next
    }
    {
      if (mode == "what") {
        line = $0; sub(/^[ \t][ \t]?[ \t]?[ \t]?/, "", line); sub(/"?[ \t]*$/, "", line)
        what = (what == "" ? line : what "\n" line)
      }
    }
    END { flush_le() }
  ' "$3"
}
