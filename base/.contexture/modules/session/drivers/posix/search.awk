# search.awk: the exact mode of search.query (docs/the-engine.md, Search): a case-insensitive
# (ASCII) substring of one line of the unit's searched text, a column-0 comment never
# matching; one result per matching entity and section, in record order, its snippet the
# first matching line, every exact result scoring 0. Run after canon.awk (the canonical
# renderer, the JSON string form) and model.awk (the loader, the parse, the payload reader,
# the refusal), in the C locale.
# The searched text is the text a read renders, never the stored bytes: the state text, the
# backlog (its preamble, then every item's canonical span), the knowledge, the journal, then
# each lane in bytewise order: the recipe, the lane journal (its preamble and item spans),
# the report (a document as stored); an absent artifact contributes nothing.
# Inputs: the environment: PX_MAN and PX_SIZES (the manifest of the unit with every part),
# PX_PAY (the payload, its query key), PX_ERR, SQ_UNIT, SQ_LIMIT, SQ_ENTITY, SQ_MODE (checked
# shapes).
# Result keys: unit, query, mode, total_matches, results [{entity_type, entity_id, section,
# snippet, score}]; total_matches counts the matching entity and section pairs, results
# stop at the limit.

function trim(s,    r) {
  r = s
  sub(/^[ \t\r\n]+/, "", r)
  sub(/[ \t\r\n]+$/, "", r)
  return r
}

# s_start(section, lane): a new artifact sets the section and the default entity
function s_start(sec, ln) {
  section = sec; lane = ln
  if (ln != "") { cur_entity_type = "lane"; cur_entity_id = ln }
  else { cur_entity_type = "session"; cur_entity_id = unit }
}

# s_line(line): the head rule, then the match
function s_line(t,   header, parts, ty, id, key, snippet) {
  if (t ~ /^@[a-zA-Z0-9_-]+/) {
    header = t
    sub(/^@/, "", header)
    split(header, parts, /[ \t]+/)
    ty = parts[1]
    id = parts[2]
    sub(/\(.*$/, "", id)
    if (ty == "task") { cur_entity_type = "task"; cur_entity_id = id }
    else if (ty == "finding") { cur_entity_type = "finding"; cur_entity_id = id }
    else if (ty == "entry" && lane != "") { cur_entity_type = "lane_entry"; cur_entity_id = lane "/" id }
    else if (ty == "entry") { cur_entity_type = "entry"; cur_entity_id = id }
    else if (ty == "anchor" && lane == "") { cur_entity_type = "session"; cur_entity_id = unit }
  }
  if (index(tolower(t), query_lower) == 0) return
  # a column-0 comment is a grammar description, never a match
  if (t ~ /^#/) return
  if (entity != "" && entity != "all" && cur_entity_type != entity) return
  # one row per entity and section: a later matching line of the same pair adds nothing
  key = cur_entity_type SUBSEP cur_entity_id SUBSEP section
  if (key in seen) return
  seen[key] = 1
  match_count++
  if (shown >= limit) return
  snippet = trim(t)
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

# s_text(text): every line of a rendered text
function s_text(s,   n, P, i) {
  if (s == NULLV || s == "") return
  n = split(s, P, "\n")
  if (P[n] == "") n--
  for (i = 1; i <= n; i++) { sub(/\r$/, "", P[i]); s_line(P[i]) }
}

# s_art(k): a block artifact: its preamble, then every item's canonical span
function s_art(k,   i) {
  if (!(k in PRES)) return
  s_text(PRE[k])
  for (i = 1; i <= NI[k]; i++) s_text(item_text(k, i))
}

# s_doc(k): a document as stored
function s_doc(k,   i) {
  if (!(k in PRES)) return
  for (i = 1; i <= NL[k]; i++) s_line(L[k, i])
}

BEGIN {
  FN = "search.query"; ERRF = ENVIRON["PX_ERR"]
  # the query arrives in the payload file, never through -v, which would interpret its
  # backslash escapes
  load_payload(ENVIRON["PX_PAY"])
  query = has("query") ? pv("query") : ""
  if (query !~ /[^ \t\r\n]/) die(1, "ERR_INVALID_ARGUMENT", "the search query is empty")
  if (ENVIRON["SQ_MODE"] != "exact") die(1, "ERR_CAPABILITY_UNSUPPORTED", "mode '" ENVIRON["SQ_MODE"] "' is not supported; declared modes: exact")
  unit = ENVIRON["SQ_UNIT"]
  limit = ENVIRON["SQ_LIMIT"] + 0
  entity = ENVIRON["SQ_ENTITY"]
  match_count = 0
  shown = 0
  query_lower = tolower(query)
  load_manifest(ENVIRON["PX_MAN"], ENVIRON["PX_SIZES"])
  parse_unit(unit, "backlog knowledge journal lanes")
  s_start("state", "")
  s_text(ST[unit, "text"])
  s_start("backlog", ""); s_art(unit "|backlog")
  s_start("knowledge", ""); s_art(unit "|knowledge")
  s_start("journal", ""); s_art(unit "|journal")
  for (j = 1; j <= NLANE[unit]; j++) {
    l = LANE[unit, j]
    s_start("lane_recipe", l); s_doc(unit "|lane/" l "/recipe")
    s_start("lane_journal", l); s_art(unit "|lane/" l "/journal")
    s_start("lane_report", l); s_doc(unit "|lane/" l "/report")
  }
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
  exit 0
}
