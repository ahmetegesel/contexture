#!/usr/bin/env sh
# Test verification script for ast-doc-graph SQLite DDL and CTE queries.
# Strictly zero external dependencies: uses /usr/bin/sqlite3.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA_FILE="${SCRIPT_DIR}/schema.sql"
SQLITE_BIN="/usr/bin/sqlite3"
if [ ! -x "${SQLITE_BIN}" ]; then
    SQLITE_BIN="$(command -v sqlite3 || true)"
fi
if [ -z "${SQLITE_BIN}" ]; then
    echo "ERROR: sqlite3 binary not found." >&2
    exit 1
fi

TMP_DB=$(mktemp "/tmp/ast_doc_graph_test_XXXXXX.db")
trap 'rm -f "${TMP_DB}"' EXIT INT TERM

# 1. Apply schema DDL
"${SQLITE_BIN}" "${TMP_DB}" < "${SCHEMA_FILE}"

# 2. Insert test data
"${SQLITE_BIN}" "${TMP_DB}" << 'EOF'
-- Seed documents
INSERT INTO docs (id, repo, kind, summary, sources, keywords)
VALUES (
    'doc:cascade-protocol',
    'bilingo-mvp',
    'protocol',
    'Cascade protocol execution lifecycle and state transitions',
    '["backend/core/cascadeCore.ts", "backend/services/sessionService.ts"]',
    '["cascade", "session", "lifecycle"]'
);

-- Seed rules
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

-- Seed pitfalls
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

-- Seed symbols
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
    65,
    '() => void',
    'Simulates gym session runs'
);

-- Seed call graph edges with mutual recursion cycle between sym:1 and sym:2
INSERT INTO edges (source, target, kind) VALUES ('sym:4', 'sym:3', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:3', 'sym:1', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:1', 'sym:2', 'CALLS');
INSERT INTO edges (source, target, kind) VALUES ('sym:2', 'sym:1', 'CALLS');

-- Seed governance edges
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

echo "VERIFICATION PASSED: All tables, FTS5 indexes, triggers, and cycle-safe CTE queries executed cleanly."
exit 0
