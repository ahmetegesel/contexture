#!/usr/bin/env sh
# engine-checks.sh <sandbox>: three engine behaviors asserted through the verbs on the
# sandbox's configured driver, each with a discriminating input (a repo etest seeded through
# the driver, removed again at the end):
#   [dup-id]     the audit's one id namespace per repo: a contract rule's id line and a
#                pitfall id in two docs of one repo read "duplicate id" rc 1 (the id check
#                once saw only entry-head ids, so this pair passed)
#   [pitfalls]   query --pitfalls lists @pitfalls entries only: an overview doc's @caveats
#                (ids at the entry head too) are not printed as pitfalls
#   [backslash]  query --search keeps a backslash literal (the free text reaches the engine
#                through the environment, never awk -v, which read \t as a tab)
# Exit 0 when all three pass, 1 otherwise.

set -u
SB=$1
cd "$SB" || exit 1
C="$SB/.contexture/ctx"
R="$SB/.contexture/modules/session/scripts/driver-resolver"
W="$SB/engine-checks.scratch"
rm -rf "$W"
mkdir -p "$W" || exit 1
FAIL=0

printf '%s\n' '@doc structural idone' '  repo: etest' '  description: "Holds a contract rule id"' '  sources: [a/**]' '  keywords: [a]' '' \
  '@contract' '  - rule: "A rule"' '    id: idone-r1' '    evidence: "ruleSym"' > "$W/idone.md"
printf '%s\n' '@doc structural idtwo' '  repo: etest' '  description: "Reuses that id as a pitfall id"' '  sources: [b/**]' '  keywords: [b]' '' \
  '@pitfalls' '  - id: idone-r1' '    summary: "A pitfall"' '    class: bug' '    severity: low' '    trigger: "t"' '    consequence: "c"' '    evidence: "pitSym"' > "$W/idtwo.md"
printf '%s\n' '@doc overview over' '  repo: etest' '  description: "An overview with a caveat"' '' \
  '@caveats' '  - id: over-c1' '    text: "A caveat, never a pitfall"' > "$W/over.md"
printf '%s\n' '@doc structural esc' '  repo: etest' '  description: "Carries a literal backslash sequence"' '  sources: [e/**]' '  keywords: [e]' '' \
  '@contract' '  - rule: "The marker reads zz\tqq on disk"' '    evidence: "escSym"' > "$W/esc.md"
for d in idone idtwo over esc; do
  "$R" corpus.write etest "$d" --head=0000000 < "$W/$d.md" > /dev/null 2>&1 || { echo "engine-checks: seeding etest/$d failed"; exit 1; }
done

OUT=$("$C" docs audit etest 2>&1)
RC=$?
if [ "$RC" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "duplicate id 'idone-r1' in repo 'etest'"; then
  echo "  [dup-id] PASS"
else
  echo "  [dup-id] FAIL (rc=$RC): $OUT"
  FAIL=$((FAIL + 1))
fi

OUT=$("$C" docs query etest --pitfalls 2>&1)
RC=$?
if printf '%s\n' "$OUT" | grep -q 'idone-r1' && ! printf '%s\n' "$OUT" | grep -q 'over-c1'; then
  echo "  [pitfalls] PASS"
else
  echo "  [pitfalls] FAIL (rc=$RC): $OUT"
  FAIL=$((FAIL + 1))
fi

OUT=$("$C" docs query etest --search 'zz\tqq' 2>&1)
RC=$?
if [ "$RC" -eq 0 ] && printf '%s\n' "$OUT" | grep -qF 'The marker reads zz\tqq on disk'; then
  echo "  [backslash] PASS"
else
  echo "  [backslash] FAIL (rc=$RC): $OUT"
  FAIL=$((FAIL + 1))
fi

for d in idone idtwo over esc; do
  "$R" corpus.remove etest "$d" --head=0000000 > /dev/null 2>&1
done
rm -rf "$W"
echo "engine-checks: $((3 - FAIL)) passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
