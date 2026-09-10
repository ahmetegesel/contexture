# rhythms-index.awk - the rhythm selection index
# usage: awk -f .contexture/scripts/rhythms-index.awk .contexture/rhythms/*.md
function emit() {
  if (name != "")
    printf "%s (%s) | use when: %s | activation: %s\n",
           name, src, (use == "" ? "(missing)" : use),
           (act == "" ? "propose" : act)
}
FNR == 1 { emit(); name=""; use=""; act=""; src=FILENAME }
/^@rhythm / { name=$0; sub(/^@rhythm[[:space:]]+/, "", name); src=FILENAME }
/^  use when:/ { use=$0; sub(/^  use when:[[:space:]]*/, "", use) }
/^  activation:/ { act=$0; sub(/^  activation:[[:space:]]*/, "", act) }
END { emit() }
