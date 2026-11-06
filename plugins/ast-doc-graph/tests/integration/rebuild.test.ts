import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '@support/exec';
import { sqlite } from '@support/sqlite';
import { astDocIndex, docsRepo, fallbackReachable, MODULE, NO_NODE_SQLITE, SCHEMA, sqliteFts5 } from '../support/graph';

const snapshot = (db: string): string =>
  sqlite(db, "SELECT 'docs', count(*) FROM docs UNION ALL SELECT 'rules', count(*) FROM rules UNION ALL SELECT 'pitfalls', count(*) FROM pitfalls UNION ALL SELECT 'edges', count(*) FROM edges UNION ALL SELECT 'files', count(*) FROM indexed_files UNION ALL SELECT 'search', count(*) FROM fts_docs;");

async function failedLoadLeavesTheGraph(env: Record<string, string>): Promise<void> {
  const repo = docsRepo('rebuild-atomic');
  const full = await astDocIndex(repo, ['--clean']);
  expect(full.code, full.stderr).toBe(0);
  const db = join(repo, 'graph.db');
  const before = snapshot(db);
  const rules = join(repo, 'rules.jsonl');
  writeFileSync(rules, `${JSON.stringify({ id: 'rule:none:x', doc_id: 'doc:none', statement: 'A rule of no unit', evidence_symbols: [], evidence_raw: null, detail: null, anti: null, good: null })}\n`);
  const r = await exec(join(MODULE, 'loader/index-graph.sh'), ['--db', db, '--rules', rules, '--project-root', repo, '--schema', SCHEMA], { cwd: repo, env });
  expect(r.code).toBe(1);
  expect(r.stderr).toContain('FOREIGN KEY constraint failed');
  expect(snapshot(db)).toBe(before);
}

describe.skipIf(!sqliteFts5)('a full load rebuilds the graph in one transaction', { concurrent: true }, () => {
  it('[ast-doc-graph-r6] a load that fails leaves the graph as it was', () => failedLoadLeavesTheGraph({}));

  it.skipIf(!fallbackReachable)('[ast-doc-graph-r6] on the sqlite3 command fallback a load that fails leaves the graph as it was (needs a node that NODE_OPTIONS=--no-experimental-sqlite keeps from loading node:sqlite)', () =>
    failedLoadLeavesTheGraph(NO_NODE_SQLITE));
});
