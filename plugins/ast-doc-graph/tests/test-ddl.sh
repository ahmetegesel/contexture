#!/usr/bin/env sh
# Test verification script for ast-doc-graph SQLite DDL and CTE queries.
# Strictly zero external dependencies: uses /usr/bin/sqlite3.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA_FILE="${SCRIPT_DIR}/../.contexture/modules/ast-doc-graph/schema.sql"

# need: sqlite3
SQLITE_BIN="/usr/bin/sqlite3"
if [ ! -x "${SQLITE_BIN}" ]; then
    SQLITE_BIN="$(command -v sqlite3 || true)"
fi
if [ -z "${SQLITE_BIN}" ]; then
    echo "SKIP: sqlite3 not found"
    exit 77
fi

# scratch: the workspace's .contexture/tmp/ when writable, the system temp otherwise
TMP_BASE="${AST_DOC_GRAPH_TMP:-}"
WS_ROOT="${SCRIPT_DIR}/../../.."
if [ -z "${TMP_BASE}" ] && [ -d "${WS_ROOT}/.contexture" ] && mkdir -p "${WS_ROOT}/.contexture/tmp" 2>/dev/null && [ -w "${WS_ROOT}/.contexture/tmp" ]; then
    TMP_BASE="${WS_ROOT}/.contexture/tmp"
fi
[ -n "${TMP_BASE}" ] || TMP_BASE="${TMPDIR:-/tmp}"

TMP_DB=$(mktemp "${TMP_BASE}/ast_doc_graph_test_XXXXXX.db")
trap 'rm -f "${TMP_DB}"' EXIT INT TERM

# 1. Apply schema DDL
"${SQLITE_BIN}" "${TMP_DB}" < "${SCHEMA_FILE}"

# 2. Insert test data
"${SQLITE_BIN}" "${TMP_DB}" << 'EOF'
/* Seed documents */
INSERT INTO docs (id, repo, kind, summary, sources, keywords)
VALUES (
    'doc:cascade-protocol',
    'bilingo-mvp',
    'protocol',
    'Cascade protocol execution lifecycle and state transitions',
    '["backend/core/cascadeCore.ts", "backend/services/sessionService.ts"]',
    '["cascade", "session", "lifecycle"]'
);

/* Seed rules */
INSERT INTO rules (id, doc_id, statement, evidence_symbols, evidence_raw, detail, anti, good)
VALUES (
    'rule:peek-tracking',
    'doc:cascade-protocol',
    'Record peek counts on learner interaction lines',
    '["recordPeek", "setTotalUserLines"]',
    'recordPeek; setTotalUserLines',
    'Learner interaction lines must persist peek counts across session restarts',
    'Omitting peek count update',
    'Calling recordPeek on every learner line'
);

/* Seed pitfalls */
INSERT INTO pitfalls (id, doc_id, severity, type, statement, trigger, evidence_symbols, evidence_raw)
VALUES (
    'pitfall:levenshtein-threshold',
    'doc:cascade-protocol',
    'high',
    'gotcha',
    'Levenshtein distance calculation diverges on unnormalized input',
    'Input strings containing combining diacritics',
    '["calculateLevenshtein", "normalizeText"]',
    'calculateLevenshtein; normalizeText'
);

/* Seed symbols */
INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
VALUES (
    'sym:1',
    'startSession',
    'CascadeCore.startSession',
    'method',
    'backend/core/cascadeCore.ts',
    35,
    78,
    '(config: SessionConfig) => SessionResult',
    'Initializes cascade session state'
);

INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
VALUES (
    'sym:2',
    'getNextPhase',
    'CascadeCore.getNextPhase',
    'method',
    'backend/core/cascadeCore.ts',
    80,
    115,
    '(phase: Phase) => Phase',
    'Calculates next transition phase'
);

INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
VALUES (
    'sym:3',
    'startSession',
    'SessionService.startSession',
    'method',
    'backend/services/sessionService.ts',
    55,
    92,
    '(userId: string) => Promise<Session>',
    'Service entry point for starting sessions'
);

INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
VALUES (
    'sym:4',
    'runGymSession',
    'runGymSession',
    'function',
    'simulation/sessionRun.ts',
    36,
    111,
    '() => void',
    'Simulates gym session runs'
);

/* Seed call graph edges with mutual recursion cycle between sym:1 and sym:2 */
INSERT INTO edges (source, target, kind) VALUES ('sym:4', 'sym:3', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:3', 'sym:1', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:1', 'sym:2', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:2', 'sym:1', 'CALLS');

/* Seed governance edges */
INSERT INTO edges (source, target, kind) VALUES ('rule:peek-tracking', 'sym:1', 'GOVERNS');
INSERT INTO edges (source, target, kind) VALUES ('pitfall:levenshtein-threshold', 'sym:1', 'WARNS');
INSERT INTO edges (source, target, kind) VALUES ('doc:cascade-protocol', 'sym:1', 'COVERS');
EOF

# 3. Verify FTS5 trigram symbol search
SYMBOL_MATCH_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM fts_symbols WHERE fts_symbols MATCH 'start';")
if [ "${SYMBOL_MATCH_COUNT}" -ne 2 ]; then
    echo "FAILED: Expected 2 trigram matches for 'start', got ${SYMBOL_MATCH_COUNT}" >&2
    exit 1
fi

# 4. Verify FTS5 unicode61 docs search
DOC_MATCH_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM fts_docs WHERE fts_docs MATCH 'cascade';")
if [ "${DOC_MATCH_COUNT}" -lt 1 ]; then
    echo "FAILED: Expected at least 1 unicode61 match for 'cascade', got ${DOC_MATCH_COUNT}" >&2
    exit 1
fi

# 5. Verify cycle-safe Upstream Callers CTE query
UPSTREAM_ROWS=$("${SQLITE_BIN}" "${TMP_DB}" << 'EOF'
WITH RECURSIVE upstream_callers(id, depth, path) AS (
    SELECT
        'sym:1' AS id,
        0 AS depth,
        '/sym:1/' AS path
    UNION ALL
    SELECT
        e.source AS id,
        uc.depth + 1 AS depth,
        uc.path || e.source || '/' AS path
    FROM upstream_callers uc
    JOIN edges e ON uc.id = e.target AND e.kind = 'CALLS'
    WHERE uc.depth < 5
      AND INSTR(uc.path, '/' || e.source || '/') == 0
)
SELECT count(*) FROM upstream_callers WHERE depth > 0;
EOF
)
if [ "${UPSTREAM_ROWS}" -ne 3 ]; then
    echo "FAILED: Expected 3 upstream callers, got ${UPSTREAM_ROWS}" >&2
    exit 1
fi

# 6. Verify cycle-safe Downstream Callees CTE query
DOWNSTREAM_ROWS=$("${SQLITE_BIN}" "${TMP_DB}" << 'EOF'
WITH RECURSIVE downstream_callees(id, depth, path) AS (
    SELECT
        'sym:4' AS id,
        0 AS depth,
        '/sym:4/' AS path
    UNION ALL
    SELECT
        e.target AS id,
        dc.depth + 1 AS depth,
        dc.path || e.target || '/' AS path
    FROM downstream_callees dc
    JOIN edges e ON dc.id = e.source AND e.kind = 'CALLS'
    WHERE dc.depth < 5
      AND INSTR(dc.path, '/' || e.target || '/') == 0
)
SELECT count(*) FROM downstream_callees WHERE depth > 0;
EOF
)
if [ "${DOWNSTREAM_ROWS}" -ne 3 ]; then
    echo "FAILED: Expected 3 downstream callees, got ${DOWNSTREAM_ROWS}" >&2
    exit 1
fi

# 7. Verify Governance and Pitfall lookup
GOVERNANCE_ROWS=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM edges WHERE target = 'sym:1' AND kind IN ('GOVERNS', 'WARNS', 'COVERS');")
if [ "${GOVERNANCE_ROWS}" -ne 3 ]; then
    echo "FAILED: Expected 3 governance links for sym:1, got ${GOVERNANCE_ROWS}" >&2
    exit 1
fi

# 8. Verify PRAGMA busy_timeout setting
BUSY_TIMEOUT=$({ cat "${SCHEMA_FILE}"; echo "PRAGMA busy_timeout;"; } | "${SQLITE_BIN}" "${TMP_DB}" | awk 'END { print }')
if [ "${BUSY_TIMEOUT}" != "5000" ]; then
    echo "FAILED: Expected busy_timeout 5000, got ${BUSY_TIMEOUT}" >&2
    exit 1
fi

# 9. Verify indexed_files table and index operations
"${SQLITE_BIN}" "${TMP_DB}" << 'EOF'
INSERT INTO indexed_files (file, mtime, hash)
VALUES ('backend/core/cascadeCore.ts', 1726910000.5, 'hash_initial_123');
EOF

INDEXED_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM indexed_files WHERE file = 'backend/core/cascadeCore.ts' AND mtime = 1726910000.5 AND hash = 'hash_initial_123';")
if [ "${INDEXED_COUNT}" != "1" ]; then
    echo "FAILED: Expected 1 indexed_files record, got ${INDEXED_COUNT}" >&2
    exit 1
fi

# Verify upsert replace on file primary key
"${SQLITE_BIN}" "${TMP_DB}" << 'EOF'
INSERT OR REPLACE INTO indexed_files (file, mtime, hash)
VALUES ('backend/core/cascadeCore.ts', 1726920000.0, 'hash_updated_456');
EOF

UPDATED_HASH=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT hash FROM indexed_files WHERE file = 'backend/core/cascadeCore.ts';")
if [ "${UPDATED_HASH}" != "hash_updated_456" ]; then
    echo "FAILED: Expected updated hash hash_updated_456, got ${UPDATED_HASH}" >&2
    exit 1
fi

MTIME_INDEX_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_indexed_files_mtime';")
if [ "${MTIME_INDEX_COUNT}" != "1" ]; then
    echo "FAILED: Expected idx_indexed_files_mtime index to exist, got ${MTIME_INDEX_COUNT}" >&2
    exit 1
fi

# 10. Verify edge cleanup triggers on symbol deletion
# Delete sym:4 and verify edges with source or target sym:4 are purged
"${SQLITE_BIN}" "${TMP_DB}" "DELETE FROM symbols WHERE id = 'sym:4';"

SYM4_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM symbols WHERE id = 'sym:4';")
SYM4_FTS=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM fts_symbols WHERE symbol_id = 'sym:4';")
SYM4_EDGES=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM edges WHERE source = 'sym:4' OR target = 'sym:4';")

if [ "${SYM4_COUNT}" != "0" ] || [ "${SYM4_FTS}" != "0" ] || [ "${SYM4_EDGES}" != "0" ]; then
    echo "FAILED: sym:4 deletion failed to purge symbols, fts_symbols, or edges" >&2
    exit 1
fi

# Delete sym:1: connected to multiple edges as source and target
"${SQLITE_BIN}" "${TMP_DB}" "DELETE FROM symbols WHERE id = 'sym:1';"
SYM1_EDGES=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM edges WHERE source = 'sym:1' OR target = 'sym:1';")
SYM1_FTS=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM fts_symbols WHERE symbol_id = 'sym:1';")

if [ "${SYM1_EDGES}" != "0" ] || [ "${SYM1_FTS}" != "0" ]; then
    echo "FAILED: sym:1 deletion failed to purge edges or fts_symbols" >&2
    exit 1
fi

# 11. Verify cascading edge cleanup on doc deletion
# Seed fresh governance edges pointing to sym:2 to test rule and pitfall edge purging
"${SQLITE_BIN}" "${TMP_DB}" << 'EOF'
INSERT INTO edges (source, target, kind) VALUES ('rule:peek-tracking', 'sym:2', 'GOVERNS');
INSERT INTO edges (source, target, kind) VALUES ('pitfall:levenshtein-threshold', 'sym:2', 'WARNS');
INSERT INTO edges (source, target, kind) VALUES ('doc:cascade-protocol', 'sym:2', 'COVERS');
EOF

DOC_EDGE_PRE=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM edges WHERE source IN ('doc:cascade-protocol', 'rule:peek-tracking', 'pitfall:levenshtein-threshold');")
if [ "${DOC_EDGE_PRE}" != "3" ]; then
    echo "FAILED: Expected 3 pre-existing doc, rule, or pitfall edges, got ${DOC_EDGE_PRE}" >&2
    exit 1
fi

# Delete parent doc: cascading deletion purges rules, pitfalls, edges, and fts_docs entries
"${SQLITE_BIN}" "${TMP_DB}" "PRAGMA foreign_keys = ON; DELETE FROM docs WHERE id = 'doc:cascade-protocol';"

DOC_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM docs WHERE id = 'doc:cascade-protocol';")
RULES_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM rules WHERE doc_id = 'doc:cascade-protocol';")
PITFALLS_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM pitfalls WHERE doc_id = 'doc:cascade-protocol';")
DOC_EDGES=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM edges WHERE source IN ('doc:cascade-protocol', 'rule:peek-tracking', 'pitfall:levenshtein-threshold') OR target IN ('doc:cascade-protocol', 'rule:peek-tracking', 'pitfall:levenshtein-threshold');")
FTS_DOCS_COUNT=$("${SQLITE_BIN}" "${TMP_DB}" "SELECT count(*) FROM fts_docs WHERE doc_id = 'doc:cascade-protocol';")

if [ "${DOC_COUNT}" != "0" ]; then
    echo "FAILED: doc:cascade-protocol was not deleted from docs" >&2
    exit 1
fi
if [ "${RULES_COUNT}" != "0" ]; then
    echo "FAILED: cascading deletion failed for rules" >&2
    exit 1
fi
if [ "${PITFALLS_COUNT}" != "0" ]; then
    echo "FAILED: cascading deletion failed for pitfalls" >&2
    exit 1
fi
if [ "${DOC_EDGES}" != "0" ]; then
    echo "FAILED: edge cleanup triggers failed to purge doc, rule, or pitfall edges" >&2
    exit 1
fi
if [ "${FTS_DOCS_COUNT}" != "0" ]; then
    echo "FAILED: fts_docs sync triggers failed to purge doc entries" >&2
    exit 1
fi

echo "VERIFICATION PASSED: All tables, FTS5 indexes, triggers, and cycle-safe CTE queries executed cleanly."
exit 0

