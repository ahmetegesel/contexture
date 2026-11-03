# ranked.awk: the record's ranked search answer from the store.search answer, run after
# canon.awk and model.awk over the flat lines of json.awk. The store's results keep their
# rank order; the unit's keys are selected, the entity filter applied, and the limit caps
# after the complete walk. The exact mode never comes here: it is the canonical render's
# own rule (search.awk), the TC69 legacy rule.
# The environment: RQ_UNIT, RQ_QUERY, RQ_MODE, RQ_LIMIT, RQ_ENTITY.

{
  if ($0 ~ /^results#[0-9]+$/) { N = substr($0, 9) + 0; next }
  eq = index($0, "=")
  co = index($0, ":")
  if (eq > 0 && (co == 0 || eq < co)) {
    path = substr($0, 1, eq - 1); val = substr($0, eq + 1); isstr = 1
  } else if (co > 0) {
    path = substr($0, 1, co - 1); val = substr($0, co + 1); isstr = 0
  } else next
  if (path !~ /^results\.[0-9]+\.[a-z_]+$/) next
  split(path, P, ".")
  i = P[2] + 0
  f = P[3]
  if (f == "key") KEY[i] = (isstr ? pdec(val) : val)
  else if (f == "entity_type") TY[i] = (isstr ? pdec(val) : val)
  else if (f == "entity_id") EID[i] = (isstr ? pdec(val) : val)
  else if (f == "section") SEC[i] = (isstr ? pdec(val) : val)
  else if (f == "snippet") SNIP[i] = (isstr ? pdec(val) : val)
  else if (f == "score") SCORE[i] = val
}

# admit(i): the record's identity for a store result, or 0 when the key is no record
# artifact of the searched unit. The store's default document carries its artifact key as
# the entity id, so the unit maps it to the record id: the unit for a session document,
# the lane for a lane document, and a lane entry keeps the lane prefix. A marker entity
# (task, entry, finding) carries its own id. A key outside the record's artifact shape or
# a section the record does not search is dropped.
function admit(i,   unit, key, rel, np, P, lane, art, sec, ty) {
  unit = ENVIRON["RQ_UNIT"]
  key = KEY[i]
  if (substr(key, 1, length(unit) + 1) != unit "/") return 0
  rel = substr(key, length(unit) + 2)
  if (rel == "state") sec = "state"
  else if (rel == "backlog") sec = "backlog"
  else if (rel == "knowledge") sec = "knowledge"
  else if (rel == "journal") sec = "journal"
  else {
    np = split(rel, P, "/")
    if (np != 3 || P[1] != "lanes" || P[2] == "") return 0
    lane = P[2]; art = P[3]
    if (art == "recipe") sec = "lane_recipe"
    else if (art == "journal") sec = "lane_journal"
    else if (art == "report") sec = "lane_report"
    else return 0
  }
  if (SEC[i] != sec) return 0
  ty = TY[i]
  if (sec == "state" || sec == "backlog" || sec == "knowledge" || sec == "journal") {
    if (ty == "" || ty == "session") EID[i] = unit
    else if (ty != "task" && ty != "entry" && ty != "finding") return 0
  } else if (ty == "" || ty == "lane") {
    EID[i] = lane
  } else if (ty == "lane_entry" && art == "journal") {
    EID[i] = lane "/" EID[i]
  } else return 0
  if (ENVIRON["RQ_ENTITY"] != "" && ENVIRON["RQ_ENTITY"] != "all" && ty != ENVIRON["RQ_ENTITY"]) return 0
  return 1
}

END {
  total = 0; shown = 0
  for (i = 1; i <= N; i++) {
    if (!admit(i)) continue
    total++
    if (shown >= (ENVIRON["RQ_LIMIT"] + 0)) continue
    shown++
    OUT[shown] = i
  }
  printf "{\"unit\":%s,\"query\":%s,\"mode\":%s,\"total_matches\":%d,\"results\":[", jstr(ENVIRON["RQ_UNIT"]), jstr(ENVIRON["RQ_QUERY"]), jstr(ENVIRON["RQ_MODE"]), total
  for (j = 1; j <= shown; j++) {
    i = OUT[j]
    printf "%s{\"entity_type\":%s,\"entity_id\":%s,\"section\":%s,\"snippet\":%s,\"score\":%s}", (j > 1 ? "," : ""), jstr(TY[i]), jstr(EID[i]), jstr(SEC[i]), jstr(SNIP[i]), SCORE[i]
  }
  printf "]}\n"
}
