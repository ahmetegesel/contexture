import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { sqlite } from '@support/sqlite';
import { astDocIndex, compilerApi, count, fallbackReachable, graphQuery, miniRepo, NO_NODE_SQLITE, sqliteFts5 } from '../support/graph';

describe.skipIf(!sqliteFts5 || !compilerApi())('the full index of the mini repository', { concurrent: true }, () => {
  let indexed: string;
  beforeAll(async () => {
    indexed = miniRepo('mini-indexed');
    const r = await astDocIndex(indexed, ['--clean']);
    if (r.code !== 0) throw new Error(`ast-doc-index: rc ${r.code}: ${r.stderr}`);
  });
  const db = (sb: string) => join(sb, 'graph.db');

  it('VP1 VP2 indexes every source symbol, the call edges, and the corpus doc with its rules and pitfall', () => {
    const sb = fresh(indexed);
    const names = sqlite(db(sb), 'SELECT qname FROM symbols ORDER BY qname;').trim().split('\n');
    for (const n of ['validateCart', 'priceCart', 'roundTotal', 'CartStore.save']) expect(names).toContain(n);
    expect(count(db(sb), "SELECT count(*) FROM docs;")).toBe(1);
    expect(count(db(sb), "SELECT count(*) FROM rules;")).toBe(2);
    expect(count(db(sb), "SELECT count(*) FROM pitfalls;")).toBe(1);
    expect(count(db(sb), "SELECT count(*) FROM indexed_files WHERE file LIKE 'src/%';")).toBe(3);
  });

  it('derives the governance edges from the evidence and the doc sources', () => {
    const sb = fresh(indexed);
    const kinds = (kind: string) => sqlite(db(sb), `SELECT s.qname FROM edges e JOIN symbols s ON s.id = e.target WHERE e.kind = '${kind}' ORDER BY s.qname;`).trim().split('\n');
    expect(kinds('GOVERNS')).toEqual(['roundTotal', 'validateCart']);
    expect(kinds('WARNS')).toEqual(['priceCart']);
    expect(kinds('COVERS')).not.toContain('CartStore.save');
  });

  it('VP3 the symbol view joins the location, a caller, the governing doc, and its rule', async () => {
    const sb = fresh(indexed);
    const r = await graphQuery(sb, db(sb), 'symbol', 'validateCart', '--no-sync');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('LOCATION: src/orders/validate.ts:');
    expect(r.stdout).toContain('@governing_rules');
    expect(r.stdout).toContain('A cart is validated before it is priced');
  });

  async function repeatedFullRuns(env: Record<string, string>): Promise<void> {
    const sb = fresh(indexed);
    const once = await graphQuery(sb, db(sb), 'search', 'cart', '--no-sync');
    expect(once.stdout).toContain('validateCart');
    for (const _run of [1, 2]) {
      const r = await astDocIndex(sb, [], { env });
      expect(r.code, r.stderr).toBe(0);
    }
    expect(count(db(sb), 'SELECT count(*) FROM fts_symbols;')).toBe(count(db(sb), 'SELECT count(*) FROM symbols;'));
    expect(count(db(sb), "SELECT count(*) FROM fts_docs WHERE entity_type = 'doc';")).toBe(count(db(sb), 'SELECT count(*) FROM docs;'));
    const again = await graphQuery(sb, db(sb), 'search', 'cart', '--no-sync');
    expect(again.stdout).toBe(once.stdout);
  }

  it('[ast-doc-graph-r6] repeated full runs without --clean keep one search row per symbol and unit, so search reads as it did after one run', () => repeatedFullRuns({}));

  it.skipIf(!fallbackReachable)('[ast-doc-graph-r6] the sqlite3 command fallback keeps one search row per symbol and unit over repeated full runs (needs a node that NODE_OPTIONS=--no-experimental-sqlite keeps from loading node:sqlite)', () =>
    repeatedFullRuns(NO_NODE_SQLITE));

  it('the cycle priceCart and roundTotal reads once each way', async () => {
    const sb = fresh(indexed);
    const r = await graphQuery(sb, db(sb), 'callers', 'priceCart', '--no-sync');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('roundTotal');
    expect(r.stdout).toContain('validateCart');
  });
});
