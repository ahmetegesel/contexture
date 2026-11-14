# search-rows.awk: the unit search's merged answer (ctx unit search), run after canon.awk
# (the JSON string form). The input is, per searched unit in the board's unit order, one
# line "@unit<TAB><unit><TAB><status>" followed by the flat lines (json.awk) of that unit's
# search.query answer; then the rows map onto the shared search row shape:
#   module unit; container the unit data declaration's key pattern of the row's section and
#   entity type, the unit filled in (a lane row's the address form, the lane key naming the
#   record's file layout); type the record's entity type; id the
#   address path after the type segment; address unit#<unit>/<kind>/<id>; snippet; read
#   ctx unit get <path>; label closed on a CLOSED unit's rows.
# A row with no addressable entity (an artifact preamble, an anchor line, a lane journal
# outside an entry) carries no address, its id the unit (or the lane) and its read the
# whole artifact's view; under the fan-out (SR_FANOUT=1) the unit answers entities only
# (tasks, entries, findings, lane recipes and reports), never those rows nor a lane journal
# entry. The type filter keeps one entity type, the limit applies once to the merged rows,
# and total counts every merged row.
# The environment: SR_QUERY, SR_MODE, SR_LIMIT, SR_TYPE, SR_FANOUT, SR_RULES (the document
# rules, one "<key-pattern> TAB <section> TAB <entity type> TAB <marker>" line each).

BEGIN {
  SRNRULE = split(ENVIRON["SR_RULES"], SRRL, "\n")
  for (i = 1; i <= SRNRULE; i++) {
    split(SRRL[i], SRF, "\t")
    SRRPAT[i] = SRF[1]; SRRSEC[i] = SRF[2]; SRRENT[i] = SRF[3]
  }
  SRTYPE = ENVIRON["SR_TYPE"]
  if (SRTYPE == "all") SRTYPE = ""
  SRFAN = (ENVIRON["SR_FANOUT"] == "1")
  SRLIMIT = ENVIRON["SR_LIMIT"] + 0
  SRROWS = 0
}

/^@unit\t/ {
  flush()
  split($0, SRH, "\t")
  SRUNIT = SRH[2]; SRSTATUS = SRH[3]
  split("", SRTY); split("", SREID); split("", SRSEC); split("", SRSNIP)
  SRN = 0
  next
}

{
  eq = index($0, "=")
  if (eq == 0) next
  path = substr($0, 1, eq - 1)
  if (path !~ /^results\.[0-9]+\.[a-z_]+$/) next
  split(path, SRP, ".")
  i = SRP[2] + 0
  if (i > SRN) SRN = i
  v = pdec(substr($0, eq + 1))
  if (SRP[3] == "entity_type") SRTY[i] = v
  else if (SRP[3] == "entity_id") SREID[i] = v
  else if (SRP[3] == "section") SRSEC[i] = v
  else if (SRP[3] == "snippet") SRSNIP[i] = v
}

END {
  flush()
  printf "{\"query\":%s,\"mode\":%s,\"total\":%d,\"rows\":[", jstr(ENVIRON["SR_QUERY"]), jstr(ENVIRON["SR_MODE"]), SRROWS
  shown = SRROWS
  if (SRLIMIT > 0 && shown > SRLIMIT) shown = SRLIMIT
  for (k = 1; k <= shown; k++) printf "%s%s", (k > 1 ? "," : ""), SROUT[k]
  printf "]}\n"
}

# container(sec, ty, lane): the declaration's key pattern for the row, its placeholders
# filled: the rule naming the section and the entity type, else the section's first rule; a
# lane artifact's key names the record's file layout, so a lane row's container takes the
# address form <unit>/lane/<lane>/<recipe|journal|report> instead
function container(sec, ty, lane,   i, p, at) {
  if (lane != "" && sec ~ /^lane_/) return SRUNIT "/lane/" lane "/" substr(sec, 6)
  at = 0
  for (i = 1; i <= SRNRULE; i++) if (SRRSEC[i] == sec && SRRENT[i] == ty) { at = i; break }
  if (!at) for (i = 1; i <= SRNRULE; i++) if (SRRSEC[i] == sec) { at = i; break }
  if (!at) return SRUNIT
  p = SRRPAT[at]
  sub(/<unit>/, SRUNIT, p)
  if (lane != "") sub(/<lane>/, lane, p)
  return p
}

function row(cont, ty, id, addr, snip, rd,   o) {
  o = "{\"module\":\"unit\",\"container\":" jstr(cont) ",\"type\":" jstr(ty) ",\"id\":" jstr(id)
  if (addr != "") o = o ",\"address\":" jstr(addr)
  o = o ",\"snippet\":" jstr(snip) ",\"read\":" jstr(rd)
  if (SRSTATUS == "CLOSED") o = o ",\"label\":\"closed\""
  return o "}"
}

# flush(): the rows of the unit read so far, in their order within the unit
function flush(   i, ty, id, sec, lane, slug, art, path) {
  for (i = 1; i <= SRN; i++) {
    ty = SRTY[i]; id = SREID[i]; sec = SRSEC[i]
    if (SRTYPE != "" && ty != SRTYPE) continue
    path = ""
    if (ty == "task" || ty == "entry" || ty == "finding") {
      path = SRUNIT "/" ty "/" id
      SRROWS++
      SROUT[SRROWS] = row(container(sec, ty, ""), ty, id, "unit#" path, SRSNIP[i], "ctx unit get " path)
    } else if (ty == "lane" && (sec == "lane_recipe" || sec == "lane_report")) {
      art = (sec == "lane_recipe") ? "recipe" : "report"
      path = SRUNIT "/lane/" id "/" art
      SRROWS++
      SROUT[SRROWS] = row(container(sec, ty, id), ty, id "/" art, "unit#" path, SRSNIP[i], "ctx unit get " path)
    } else if (SRFAN) {
      continue
    } else if (ty == "lane_entry") {
      lane = id; sub(/\/.*$/, "", lane)
      slug = substr(id, length(lane) + 2)
      path = SRUNIT "/lane/" lane "/journal/" slug
      SRROWS++
      SROUT[SRROWS] = row(container(sec, ty, lane), ty, lane "/journal/" slug, "unit#" path, SRSNIP[i], "ctx unit get " path)
    } else if (ty == "lane") {
      SRROWS++
      SROUT[SRROWS] = row(container(sec, ty, id), ty, id, "", SRSNIP[i], "ctx lane show " SRUNIT " " id " journal")
    } else {
      SRROWS++
      SROUT[SRROWS] = row(container(sec, ty, ""), ty, SRUNIT, "", SRSNIP[i], "ctx unit load " SRUNIT)
    }
  }
  SRN = 0
}
