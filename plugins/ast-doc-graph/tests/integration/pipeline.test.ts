import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { sqlite } from '@support/sqlite';
import { astDocIndex, compilerApi, count, graphQuery, miniRepo, sqliteFts5 } from '../support/graph';

describe.skipIf(!sqliteFts5 || !compilerApi())('the full index of the mini repository', { concurrent: true }, () => {
  let indexed: string;
  beforeAll(async () => {
    indexed = miniRepo('mini-indexed');
    const r = await astDocIndex(indexed, '--clean');
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

  it('the cycle priceCart and roundTotal reads once each way', async () => {
    const sb = fresh(indexed);
    const r = await graphQuery(sb, db(sb), 'callers', 'priceCart', '--no-sync');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('roundTotal');
    expect(r.stdout).toContain('validateCart');
  });
});
