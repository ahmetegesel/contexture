#!/usr/bin/env sh
# docs-discipline plugin suite: the named runner for tests/.
# Drives the staging check; the corpus reads through the storage driver (keyed on the
# declared corpus.store: the audit and the unit-form nudge against the backlog-file form
# and the write verbs (tests/write-verbs.sh over tests/write/) and the engine checks
# (tests/engine-checks.sh) and the delta-source cases (tests/store-cases.sh) when declared,
# every read verb's rc 2 refusal when not); on fts5 the migration round trip and the
# capture parity against the files driver at the sandbox path; the single-door census
# (tests/census.sh over tests/census-allow.txt, with its three plants); the close-gate
# matrix over tests/sample/; and the grammar agreement check
# (tests/grammar-agreement.awk, with its two plants) in a staged
# scratch workspace built from the shipped copies only: the runtime and the
# session and lane modules from base/ (the repository that carries this plugin),
# the docs module and the grammar template (.contexture/templates/doc.md) from
# this plugin, never a workspace's adopted drawer, so the suite proves what ships
# (the gate pins the shipped copies). Needs: POSIX awk/sh, base/.contexture/ctx
# beside plugins/ (the plugin ships the module, not the engine), and git for the
# matrix's tracked-claimant fixture.
#
# The suite runs on either storage driver: --driver=posix (the default) or
# --driver=fts5 (the storage-fts5 plugin's own module copy staged into the
# sandbox, storage.driver: fts5 in its config; skip 77 when sqlite3 lacks FTS5);
# the fts5 run imports the staged corpus into the store and removes the docs
# folder first ([store-seed]), so its corpus checks read the store alone; it runs
# those corpus checks in a second sandbox (the same staging and import) in the
# background beside the capture-parity chain, printing their lines after the
# chain in the same order, so the two halves share no state and no wall time.
# Scratch stages under the workspace's .contexture/tmp/ (created when the tree is
# writable, as the core suites do), the system temp only when it cannot be made.
# Exit: 0 when every check passes, 1 on a failure, 77 when a need is absent.
#
# usage: tests/run.sh [--driver=posix|fts5]

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PASS=0
FAIL=0

DRIVER=posix
for a in "$@"; do
    case "$a" in
        --driver=posix|--driver=fts5) DRIVER=${a#--driver=} ;;
        *) echo "docs-discipline suite: unknown argument: $a" >&2; exit 1 ;;
    esac
done

# need: the shipped core beside plugins/ (the plugin ships the module, not the engine)
WS_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"
BASE_CTX="$WS_ROOT/base/.contexture/ctx"
BASE_MODULES="$WS_ROOT/base/.contexture/modules"
FTS5_MOD="$WS_ROOT/plugins/storage-fts5/.contexture/modules/storage-fts5"
if [ ! -f "$BASE_CTX" ] || [ ! -d "$BASE_MODULES/session" ]; then
    echo "SKIP: the shipped core (base/.contexture/ctx and its session module) not found under $WS_ROOT"
    echo "docs-discipline suite: 0 passed, 0 failed, 1 skipped"
    exit 77
fi
if [ "$DRIVER" = fts5 ]; then
    if [ ! -d "$FTS5_MOD" ]; then
        echo "SKIP: the storage-fts5 plugin copy (need: the fts5 driver run) not found at $FTS5_MOD"
        echo "docs-discipline suite: 0 passed, 0 failed, 1 skipped"
        exit 77
    fi
    if ! command -v sqlite3 >/dev/null 2>&1 || ! sqlite3 :memory: "CREATE VIRTUAL TABLE t USING fts5(x);" >/dev/null 2>&1; then
        echo "SKIP: sqlite3 with FTS5 (need: the fts5 driver run of the docs suite)"
        echo "docs-discipline suite: 0 passed, 0 failed, 1 skipped"
        exit 77
    fi
fi

# scratch: the workspace's .contexture/tmp/ (made on demand), the system temp only when it cannot be
TMP_BASE="${TMPDIR:-/tmp}"
if mkdir -p "$WS_ROOT/.contexture/tmp" 2>/dev/null && [ -d "$WS_ROOT/.contexture/tmp" ] && [ -w "$WS_ROOT/.contexture/tmp" ]; then
    TMP_BASE="$WS_ROOT/.contexture/tmp"
fi
# a sandbox of its own per run (never a fixed name), removed on exit, so concurrent
# runs of the gate never share or clear one another's staging
SANDBOX=$(mktemp -d "$TMP_BASE/docs-plugin-tests.XXXXXX") || exit 1
trap 'rm -rf "$SANDBOX"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$SANDBOX/.contexture/modules" "$SANDBOX/.contexture/templates" "$SANDBOX/docs"
cp "$BASE_CTX" "$SANDBOX/.contexture/ctx"
chmod +x "$SANDBOX/.contexture/ctx"
cp -R "$BASE_MODULES/session" "$SANDBOX/.contexture/modules/session"
[ -d "$BASE_MODULES/lane" ] && cp -R "$BASE_MODULES/lane" "$SANDBOX/.contexture/modules/lane"
cp -R "$PLUGIN_ROOT/.contexture/modules/docs" "$SANDBOX/.contexture/modules/docs"
cp "$PLUGIN_ROOT/.contexture/templates/doc.md" "$SANDBOX/.contexture/templates/doc.md"
if [ "$DRIVER" = fts5 ]; then
    cp -R "$FTS5_MOD" "$SANDBOX/.contexture/modules/storage-fts5"
    printf 'storage.driver: fts5\n' > "$SANDBOX/.contexture/config"
fi
cp -R "$PLUGIN_ROOT/docs/." "$SANDBOX/docs/"
cp -R "$PLUGIN_ROOT/tests/sample/docs/." "$SANDBOX/docs/"
cp "$PLUGIN_ROOT/tests/sample/backlog.md" "$SANDBOX/backlog.md"

cd "$SANDBOX" || exit 1
# the sandbox answers for itself: an inherited root, driver choice, or store path
# from the calling workspace never reaches it
unset CTX_DIR CTX_ROOT CTX_MODULE_DIR CTX_BIN CTX_STORAGE_DRIVER CTX_STORAGE_SQLITE_PATH CTX_REFERENCE_DRIVER
export LC_ALL=C

echo "docs-discipline plugin suite: staging, corpus reads, census, gate matrix, grammar agreement (driver: $DRIVER; staged at $SANDBOX)"
echo ""

# staging: the runtime is base's copy byte for byte and the resolver answers the
# configured driver with the staged copy (posix: the session module's, fts5: the plugin's)
case "$DRIVER" in
    posix) WANT_DRIVER="$SANDBOX/.contexture/modules/session/drivers/posix/driver" ;;
    fts5) WANT_DRIVER="$SANDBOX/.contexture/modules/storage-fts5/drivers/fts5" ;;
esac
GOT_DRIVER=$(./.contexture/modules/session/scripts/driver-resolver resolve 2>&1)
if cmp -s "$BASE_CTX" "$SANDBOX/.contexture/ctx" && [ "$GOT_DRIVER" = "$WANT_DRIVER" ]; then
    echo "[staging] PASS (base runtime; the $DRIVER driver resolves to the staged copy)"
    PASS=$((PASS + 1))
else
    echo "[staging] FAIL (driver resolved: $GOT_DRIVER; want $WANT_DRIVER)"
    FAIL=$((FAIL + 1))
fi
echo ""

# the corpus checks (a function, so the fts5 run can give them a sandbox of their own)
corpus_checks() {
# the corpus reads key on the declared capability, never on the driver name: a driver that
# declares corpus.store serves the full checks; one that does not must refuse every read
# verb rc 2 naming the capability
if ./.contexture/modules/session/scripts/driver-resolver has corpus.store; then
    CORPUS_STORE=1
else
    CORPUS_STORE=0
fi

if [ "$CORPUS_STORE" -eq 1 ]; then
    AUDIT_OUT="$("$SANDBOX/.contexture/ctx" docs audit docs/*/*.md 2>&1)"
    AUDIT_RC=$?
    if [ "$AUDIT_RC" -eq 0 ] && [ -z "$AUDIT_OUT" ]; then
        echo "[audit] PASS (silent, rc0)"
        PASS=$((PASS + 1))
    else
        echo "[audit] FAIL (rc=$AUDIT_RC)"
        [ -n "$AUDIT_OUT" ] && printf '%s\n' "$AUDIT_OUT"
        FAIL=$((FAIL + 1))
    fi
    echo ""

    # the unit-form nudge: the sample backlog seeded verbatim into a unit (artifact.write,
    # since a task add would reshape the block), read back through resolve task# with its
    # REFS, and the nudge through the unit equal to the backlog-file form byte for byte; the
    # backlog-file form refuses a path inside the sessions drawer rc 1
    NUDGE_NOTE=""
    "$SANDBOX/.contexture/ctx" session bootstrap nudge-demo "the sample nudge task" > /dev/null 2>&1 || NUDGE_NOTE="bootstrap failed"
    ./.contexture/modules/session/scripts/driver-resolver artifact.write nudge-demo backlog < "$PLUGIN_ROOT/tests/sample/backlog.md" > /dev/null 2>&1 || NUDGE_NOTE="${NUDGE_NOTE:+$NUDGE_NOTE; }seed failed"
    TASK_BLOCK=$("$SANDBOX/.contexture/ctx" session resolve nudge-demo 'task#install-and-run-local' 2>&1)
    printf '%s\n' "$TASK_BLOCK" | grep -q '^  REFS: \[docs/demo-orders/operational.md\]$' || NUDGE_NOTE="${NUDGE_NOTE:+$NUDGE_NOTE; }resolve task# carries no REFS"
    "$SANDBOX/.contexture/ctx" docs nudge nudge-demo > "$SANDBOX/nudge-unit.out" 2>&1
    NUDGE_U_RC=$?
    "$SANDBOX/.contexture/ctx" docs nudge backlog.md docs/*/*.md > "$SANDBOX/nudge-file.out" 2>&1
    NUDGE_F_RC=$?
    "$SANDBOX/.contexture/ctx" docs nudge .contexture/sessions/nudge-demo/backlog.md docs/*/*.md > "$SANDBOX/nudge-refuse.out" 2>&1
    NUDGE_R_RC=$?
    if [ -z "$NUDGE_NOTE" ] && [ "$NUDGE_U_RC" -eq 0 ] && [ "$NUDGE_F_RC" -eq 0 ] \
        && [ -s "$SANDBOX/nudge-unit.out" ] && cmp -s "$SANDBOX/nudge-unit.out" "$SANDBOX/nudge-file.out" \
        && grep -q '^Pitfalls: order-flow-p1' "$SANDBOX/nudge-unit.out" \
        && [ "$NUDGE_R_RC" -eq 1 ] && grep -q 'read through its unit' "$SANDBOX/nudge-refuse.out"; then
        echo "[nudge-unit] PASS (the unit form equals the backlog-file form; a sessions-drawer path refuses rc1)"
        PASS=$((PASS + 1))
    else
        echo "[nudge-unit] FAIL (${NUDGE_NOTE:-unit rc=$NUDGE_U_RC, file rc=$NUDGE_F_RC, refusal rc=$NUDGE_R_RC})"
        head -5 "$SANDBOX/nudge-unit.out" "$SANDBOX/nudge-file.out" "$SANDBOX/nudge-refuse.out"
        FAIL=$((FAIL + 1))
    fi
    echo ""

    # the write verbs (tests/write-verbs.sh over the fixtures of tests/write/): every verb's
    # success bytes, every refusal leaving the stored doc byte-identical, and under a change
    # log one row per success with its op and the HEAD, read back through ctx docs changes
    WRITE_OUT=$(sh "$SCRIPT_DIR/write-verbs.sh" "$SANDBOX" "$SCRIPT_DIR/write" 2>&1)
    WRITE_RC=$?
    if [ "$WRITE_RC" -eq 0 ]; then
        echo "[write-verbs] PASS ($(printf '%s\n' "$WRITE_OUT" | tail -n 1 | sed 's/^write-verbs: //'))"
        PASS=$((PASS + 1))
    else
        echo "[write-verbs] FAIL (rc=$WRITE_RC)"
        printf '%s\n' "$WRITE_OUT" | tail -n 30
        FAIL=$((FAIL + 1))
    fi
    echo ""

    # the engines (tests/engine-checks.sh): one id namespace per repo in the audit, query
    # --pitfalls scoped to @pitfalls, a backslash search kept literal (free text through
    # the environment, never awk -v), and a draft path refused under the files driver
    ENGINE_OUT=$(sh "$SCRIPT_DIR/engine-checks.sh" "$SANDBOX" 2>&1)
    ENGINE_RC=$?
    if [ "$ENGINE_RC" -eq 0 ]; then
        echo "[engine-checks] PASS (duplicate id across kinds, pitfalls scoping, the doc a pitfall belongs to, backslash search, a draft path)"
        PASS=$((PASS + 1))
    else
        echo "[engine-checks] FAIL (rc=$ENGINE_RC)"
        printf '%s\n' "$ENGINE_OUT"
        FAIL=$((FAIL + 1))
    fi
    echo ""

    # the delta sources (tests/store-cases.sh), keyed on the declared corpus.changelog: the
    # check's store mode against its git mode, ctx docs changes (its window, --since, A, M, D,
    # its refusals) or its files-driver refusal, and the gate composing the code half from git
    # with the corpus half from the store (or from git under the files driver)
    STORE_OUT=$(sh "$SCRIPT_DIR/store-cases.sh" "$SANDBOX" 2>&1)
    STORE_RC=$?
    if [ "$STORE_RC" -eq 0 ]; then
        echo "[store-cases] PASS ($(printf '%s\n' "$STORE_OUT" | tail -n 1 | sed 's/^store-cases: //'))"
        PASS=$((PASS + 1))
    else
        echo "[store-cases] FAIL (rc=$STORE_RC)"
        printf '%s\n' "$STORE_OUT" | tail -n 30
        FAIL=$((FAIL + 1))
    fi
    echo ""
else
    REFUSE_BAD=""
    for v in "audit" "query --index" "gate" "nudge nudge-demo"; do
        # shellcheck disable=SC2086
        R_OUT=$("$SANDBOX/.contexture/ctx" docs $v 2>&1 < /dev/null)
        R_RC=$?
        { [ "$R_RC" -eq 2 ] && printf '%s' "$R_OUT" | grep -q 'corpus.store (ERR_CAPABILITY_UNSUPPORTED)'; } || REFUSE_BAD="$REFUSE_BAD [$v rc=$R_RC]"
    done
    R_OUT=$(printf 'M\tx.ts\n' | "$SANDBOX/.contexture/ctx" docs check workspace 2>&1)
    R_RC=$?
    { [ "$R_RC" -eq 2 ] && printf '%s' "$R_OUT" | grep -q 'corpus.store (ERR_CAPABILITY_UNSUPPORTED)'; } || REFUSE_BAD="$REFUSE_BAD [check rc=$R_RC]"
    if [ -z "$REFUSE_BAD" ]; then
        echo "[read-refusal] PASS (no corpus.store: audit, query, check, gate, nudge each refuse rc2 naming the capability)"
        PASS=$((PASS + 1))
    else
        echo "[read-refusal] FAIL:$REFUSE_BAD"
        FAIL=$((FAIL + 1))
    fi
    echo ""
fi
}

# the corpus checks and the fts5 capture-parity chain need no state of one another, so the
# fts5 run gives the corpus checks a sandbox of their own (a copy of the staged one, its store
# seeded by the same import, the docs folder removed) and runs them in the background beside
# the chain; their output lands in a file and prints after the chain, in the order of old, and
# their counts join the totals. The files driver runs them in place.
B_PID=""
if [ "$DRIVER" = fts5 ]; then
    SANDBOX_B=$(mktemp -d "$TMP_BASE/docs-plugin-tests.XXXXXX") || exit 1
    trap 'rm -rf "$SANDBOX" "$SANDBOX_B"' EXIT
    cp -R "$SANDBOX/." "$SANDBOX_B/"
    rm -rf "$SANDBOX_B/.contexture/tmp"
    (
        cd "$SANDBOX_B" || exit 1
        SANDBOX=$SANDBOX_B
        PASS=0
        FAIL=0
        B_SEED=$("$SANDBOX/.contexture/ctx" storage-fts5 migrate --from=posix --to=fts5 --corpus 2>&1)
        B_SEED_RC=$?
        rm -rf "$SANDBOX/docs"
        if [ "$B_SEED_RC" -ne 0 ] || [ -e "$SANDBOX/docs" ]; then
            echo "[store-seed] FAIL (the corpus checks' sandbox: rc=$B_SEED_RC)"
            printf '%s\n' "$B_SEED"
            FAIL=$((FAIL + 1))
        fi
        corpus_checks
        echo "$PASS $FAIL" > "$SANDBOX/corpus-checks.counts"
    ) > "$SANDBOX_B/corpus-checks.out" 2>&1 < /dev/null &
    B_PID=$!
fi

# the capture parity, first half (fts5 run): the read verbs' capture set (tests/captures.sh)
# run on the files driver at this very sandbox path while the docs folder is still there (the
# config set aside for the run), so the store's captures below compare byte for byte; the plan
# leaves out what cannot differ by driver and costs the most (every block section, the per-repo
# searches, the matrix): the index, every projection, the owner lookups, the corpus searches,
# the rules and pitfalls views, the edges, the audits, the check and the gate over the twelve
# deltas, and the nudge stay
if [ "$DRIVER" = fts5 ]; then
    mv "$SANDBOX/.contexture/config" "$SANDBOX/config.store"
    sh "$SCRIPT_DIR/captures.sh" plan "$SANDBOX" 2>/dev/null \
        | grep -v -e ' --section ' -e ' --test-matrix' -e 'docs query [a-z-]* --search ' > "$SANDBOX/parity.plan"
    sh "$SCRIPT_DIR/captures.sh" run "$SANDBOX" "$SANDBOX/parity.plan" "$SANDBOX/parity-files" > /dev/null 2>&1
    PARITY_FILES_RC=$?
    mv "$SANDBOX/config.store" "$SANDBOX/.contexture/config"
    mkdir -p "$SANDBOX/corpus-staged"
    cp -R "$SANDBOX/docs/." "$SANDBOX/corpus-staged/"
fi

# the store run: the staged corpus imported into the store (ctx storage-fts5 migrate
# --corpus, the files read through the posix reference driver), then the docs folder
# removed, so every corpus check below reads the store alone
if [ "$DRIVER" = fts5 ]; then
    SEED_WANT=0
    for f in docs/*/*.md; do [ -f "$f" ] && SEED_WANT=$((SEED_WANT + 1)); done
    SEED_OUT=$("$SANDBOX/.contexture/ctx" storage-fts5 migrate --from=posix --to=fts5 --corpus 2>&1)
    SEED_RC=$?
    rm -rf "$SANDBOX/docs"
    if [ "$SEED_RC" -eq 0 ] && [ "$SEED_WANT" -gt 0 ] && printf '%s' "$SEED_OUT" | grep -q "\"corpus\":\"imported\",\"docs\":$SEED_WANT," && [ ! -e "$SANDBOX/docs" ]; then
        echo "[store-seed] PASS ($SEED_WANT docs imported into the store; the docs folder removed)"
        PASS=$((PASS + 1))
    else
        echo "[store-seed] FAIL (rc=$SEED_RC, want $SEED_WANT docs)"
        printf '%s\n' "$SEED_OUT"
        FAIL=$((FAIL + 1))
    fi
    echo ""

    # the migration round trip: the store exported back to files through the posix reference
    # equals the staged corpus byte for byte (diff -r, the file count, a planted byte read as a
    # difference so the comparison can fail), then the docs folder removed again
    RT_OUT=$("$SANDBOX/.contexture/ctx" storage-fts5 migrate --from=fts5 --to=posix --corpus 2>&1)
    RT_RC=$?
    RT_N=$(find "$SANDBOX/docs" -name '*.md' -type f 2>/dev/null | wc -l | tr -d ' ')
    diff -r "$SANDBOX/corpus-staged" "$SANDBOX/docs" > /dev/null 2>&1
    RT_DIFF=$?
    RT_PLANT=0
    if [ "$RT_N" -gt 0 ]; then
        RT_ONE=$(find "$SANDBOX/docs" -name '*.md' -type f | head -n 1)
        printf 'x' >> "$RT_ONE"
        diff -r "$SANDBOX/corpus-staged" "$SANDBOX/docs" > /dev/null 2>&1 || RT_PLANT=1
    fi
    rm -rf "$SANDBOX/docs"
    if [ "$RT_RC" -eq 0 ] && [ "$RT_N" -eq "$SEED_WANT" ] && [ "$RT_DIFF" -eq 0 ] && [ "$RT_PLANT" -eq 1 ] && [ ! -e "$SANDBOX/docs" ]; then
        echo "[round-trip] PASS ($RT_N docs exported byte for byte; a planted byte reads as a difference)"
        PASS=$((PASS + 1))
    else
        echo "[round-trip] FAIL (rc=$RT_RC, $RT_N of $SEED_WANT docs, diff rc=$RT_DIFF, plant seen=$RT_PLANT)"
        printf '%s\n' "$RT_OUT"
        FAIL=$((FAIL + 1))
    fi
    echo ""

    # the capture parity, second half: the same plan on the store with the docs folder gone;
    # every capture byte-identical to the files driver's except the store mode's named verdicts:
    # a check or gate capture where the files driver prints the blanket (FRESH (BLANKET)) or the
    # untracked-claimant verdict and the store prints STALE DOC
    sh "$SCRIPT_DIR/captures.sh" run "$SANDBOX" "$SANDBOX/parity.plan" "$SANDBOX/parity-store" > /dev/null 2>&1
    sh "$SCRIPT_DIR/captures.sh" compare "$SANDBOX/parity-files" "$SANDBOX/parity-store" > "$SANDBOX/parity.cmp" 2>&1
    P_TOTAL=$(awk 'END { print NR }' "$SANDBOX/parity.plan")
    P_SAME=$(sed -n 's/^compare: .* same \([0-9]*\), diff .*/\1/p' "$SANDBOX/parity.cmp")
    P_DIFF=0
    P_BAD=""
    for id in $(awk '/^DIFF / { print $2 }' "$SANDBOX/parity.cmp"); do
        P_DIFF=$((P_DIFF + 1))
        grep -q -e 'docs check ' -e 'docs gate ' "$SANDBOX/parity-files/$id.cmd" \
            && grep -q -e 'FRESH (BLANKET)' -e 'UNTRACKED CLAIMANT' "$SANDBOX/parity-files/$id.out" \
            && grep -q 'STALE DOC' "$SANDBOX/parity-store/$id.out" \
            || P_BAD="$P_BAD $id"
    done
    if [ "$PARITY_FILES_RC" -eq 0 ] && [ "$P_TOTAL" -gt 0 ] && [ "${P_SAME:-0}" -gt 0 ] \
        && [ $((${P_SAME:-0} + P_DIFF)) -eq "$P_TOTAL" ] && [ "$P_DIFF" -gt 0 ] && [ -z "$P_BAD" ]; then
        echo "[capture-parity] PASS ($P_TOTAL captures: $P_SAME byte-identical to the files driver, $P_DIFF the store mode's named verdicts)"
        PASS=$((PASS + 1))
    else
        echo "[capture-parity] FAIL ($P_TOTAL captures, same ${P_SAME:-0}, diff $P_DIFF, unexplained:${P_BAD:- none})"
        grep '^DIFF\|^compare' "$SANDBOX/parity.cmp" | head -20
        FAIL=$((FAIL + 1))
    fi
    echo ""
fi


# the corpus checks: joined from their sandbox on fts5 (the output in the old place, the counts
# added), run in place on the files driver
if [ -n "$B_PID" ]; then
    wait "$B_PID"
    cat "$SANDBOX_B/corpus-checks.out"
    B_COUNTS=$(cat "$SANDBOX_B/corpus-checks.counts" 2>/dev/null)
    if [ -n "$B_COUNTS" ]; then
        PASS=$((PASS + ${B_COUNTS% *}))
        FAIL=$((FAIL + ${B_COUNTS#* }))
    else
        echo "[corpus-checks] FAIL (their sandbox reported no counts)"
        echo ""
        FAIL=$((FAIL + 1))
    fi
else
    corpus_checks
fi

# the single-door census (tests/census.sh): every line of the module's verbs and engines
# that names the corpus or uses an IO primitive sits in docs-io.sh or in the classified
# allow-list (tests/census-allow.txt), remainder zero; three plants prove it can fail: a cat
# of a composed corpus path in a verb, a getline over a computed path in an engine, and a
# quote-split corpus path read by awk without -f in a verb
S_SCRIPTS="$SANDBOX/.contexture/modules/docs/scripts"
CENSUS_OUT=$(sh "$SCRIPT_DIR/census.sh" "$S_SCRIPTS" "$SCRIPT_DIR/census-allow.txt" 2>&1)
CENSUS_RC=$?
mkdir -p "$SANDBOX/census-plant"
cp "$S_SCRIPTS"/* "$SANDBOX/census-plant/"
printf 'cat "$ROOT_DIR/docs/$REPO/x.md" >/dev/null\n' >> "$SANDBOX/census-plant/query"
PLANT_C1=$(sh "$SCRIPT_DIR/census.sh" "$SANDBOX/census-plant" "$SCRIPT_DIR/census-allow.txt" 2>&1)
PLANT_C1_RC=$?
cp "$S_SCRIPTS/query" "$SANDBOX/census-plant/query"
awk '{ print } /^END \{/ && !d { print "    while ((getline pl < (root \"/do\" \"cs/x/y\" \".m\" \"d\")) > 0) n++"; d = 1 }' "$S_SCRIPTS/docs-check.awk" > "$SANDBOX/census-plant/docs-check.awk"
PLANT_C2=$(sh "$SCRIPT_DIR/census.sh" "$SANDBOX/census-plant" "$SCRIPT_DIR/census-allow.txt" 2>&1)
PLANT_C2_RC=$?
# the third plant hides from a literal match: the corpus path split by quotes and read by a
# command outside the old primitive list (awk without -f)
cp "$S_SCRIPTS/docs-check.awk" "$SANDBOX/census-plant/docs-check.awk"
printf '%s\n' 'pf="$DOCS_ROOT/do""cs/$REPO/x.m""d"' "awk 'NR == 1' \"\$pf\" >/dev/null 2>&1" >> "$SANDBOX/census-plant/query"
PLANT_C3=$(sh "$SCRIPT_DIR/census.sh" "$SANDBOX/census-plant" "$SCRIPT_DIR/census-allow.txt" 2>&1)
PLANT_C3_RC=$?
if [ "$CENSUS_RC" -eq 0 ] && printf '%s' "$CENSUS_OUT" | grep -q 'remainder 0$' \
    && [ "$PLANT_C1_RC" -eq 1 ] && printf '%s' "$PLANT_C1" | grep -q '^REMAINDER query:' \
    && [ "$PLANT_C2_RC" -eq 1 ] && printf '%s' "$PLANT_C2" | grep -q '^REMAINDER docs-check.awk:' \
    && [ "$PLANT_C3_RC" -eq 1 ] && [ "$(printf '%s\n' "$PLANT_C3" | grep -c '^REMAINDER query:')" -eq 2 ]; then
    echo "[census] PASS ($(printf '%s' "$CENSUS_OUT" | tail -1 | sed 's/^census: //'); all three plants read REMAINDER)"
    PASS=$((PASS + 1))
else
    echo "[census] FAIL (rc=$CENSUS_RC, verb plant rc=$PLANT_C1_RC, engine plant rc=$PLANT_C2_RC, split-name plant rc=$PLANT_C3_RC)"
    printf '%s\n%s\n%s\n%s\n' "$CENSUS_OUT" "$PLANT_C1" "$PLANT_C2" "$PLANT_C3" | grep -e REMAINDER -e '^census' | head -20
    FAIL=$((FAIL + 1))
fi
echo ""

MATRIX_OUT="$("$SANDBOX/.contexture/ctx" docs gate --test-matrix 2>&1)"
MATRIX_RC=$?
if [ "$MATRIX_RC" -eq 0 ] && printf '%s' "$MATRIX_OUT" | grep -q "TEST MATRIX VERDICT: ALL 8 SCENARIOS PASSED"; then
    echo "[gate-matrix] PASS (ALL 8 SCENARIOS PASSED)"
    PASS=$((PASS + 1))
else
    echo "[gate-matrix] FAIL (rc=$MATRIX_RC)"
    printf '%s\n' "$MATRIX_OUT" | tail -20
    FAIL=$((FAIL + 1))
fi
echo ""

# grammar agreement: the #% schema of doc.md, its prose shapes, and the audit's kind and
# block lists agree (tests/grammar-agreement.awk); two plants prove the check can fail: an
# extra field in the prose and an extra enum value in the schema each read DISAGREE
AGREE_AWK="$SCRIPT_DIR/grammar-agreement.awk"
S_DOC="$SANDBOX/.contexture/templates/doc.md"
S_AUD="$SANDBOX/.contexture/modules/docs/scripts/docs-audit.awk"
AGREE_OUT=$(awk -f "$AGREE_AWK" "$S_DOC" "$S_AUD" 2>&1)
AGREE_RC=$?
awk '{ print } $0 == "    nature: internal | external" { print "    planted_field: \"x\"" }' "$S_DOC" > "$SANDBOX/plant-prose.md"
PLANT_A=$(awk -f "$AGREE_AWK" "$SANDBOX/plant-prose.md" "$S_AUD" 2>&1)
PLANT_A_RC=$?
awk '{ if ($0 == "#% field dependencies nature enum required internal external") print $0 " planted"; else print }' "$S_DOC" > "$SANDBOX/plant-schema.md"
PLANT_B=$(awk -f "$AGREE_AWK" "$SANDBOX/plant-schema.md" "$S_AUD" 2>&1)
PLANT_B_RC=$?
if [ "$AGREE_RC" -eq 0 ] && printf '%s' "$AGREE_OUT" | grep -q '^AGREE: ' \
    && [ "$PLANT_A_RC" -eq 1 ] && printf '%s' "$PLANT_A" | grep -q '^DISAGREE: field dependencies.planted_field' \
    && [ "$PLANT_B_RC" -eq 1 ] && printf '%s' "$PLANT_B" | grep -q '^DISAGREE: enum dependencies.nature'; then
    echo "[grammar-agreement] PASS (${AGREE_OUT#AGREE: }; both plants read DISAGREE)"
    PASS=$((PASS + 1))
else
    echo "[grammar-agreement] FAIL (rc=$AGREE_RC, prose plant rc=$PLANT_A_RC, schema plant rc=$PLANT_B_RC)"
    printf '%s\n%s\n%s\n' "$AGREE_OUT" "$PLANT_A" "$PLANT_B" | head -20
    FAIL=$((FAIL + 1))
fi
echo ""

echo "docs-discipline suite ($DRIVER): $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
