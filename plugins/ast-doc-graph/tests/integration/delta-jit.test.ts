import { appendFileSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { sqlite } from '@support/sqlite';
import { astDocIndex, compilerApi, count, graphQuery, miniRepo, sqliteFts5 } from '../support/graph';

const db = (sb: string) => join(sb, 'graph.db');

function edit(sb: string, rel: string, text: string): void {
  const path = join(sb, rel);
  appendFileSync(path, text);
  const later = new Date(statSync(db(sb)).mtimeMs + 10_000);
  utimesSync(path, later, later);
}

const hasSymbol = (sb: string, qname: string) => count(db(sb), `SELECT count(*) FROM symbols WHERE qname = '${qname}';`) === 1;

describe.skipIf(!sqliteFts5 || !compilerApi())('the delta index and the just-in-time freshness', { concurrent: true }, () => {
  let indexed: string;
  beforeAll(async () => {
    indexed = miniRepo('mini-delta');
    const r = await astDocIndex(indexed, '--clean');
    if (r.code !== 0) throw new Error(`ast-doc-index: rc ${r.code}: ${r.stderr}`);
  });

  it('VP11 --delta on one file adds its new symbol, keeps an unrelated one, and refreshes its indexed_files row', async () => {
    const sb = fresh(indexed);
    const before = sqlite(db(sb), "SELECT mtime FROM indexed_files WHERE file = 'src/orders/validate.ts';").trim();
    edit(sb, 'src/orders/validate.ts', '\nexport function checkCart(cart: Cart): boolean {\n  return validateCart(cart);\n}\n');
    const r = await astDocIndex(sb, '--delta', 'src/orders/validate.ts');
    expect(r.code, r.stderr).toBe(0);
    expect(hasSymbol(sb, 'checkCart')).toBe(true);
    expect(hasSymbol(sb, 'CartStore.save')).toBe(true);
    expect(sqlite(db(sb), "SELECT mtime FROM indexed_files WHERE file = 'src/orders/validate.ts';").trim()).not.toBe(before);
  });

  it('VP12 a query micro-syncs one dirty file before it answers', async () => {
    const sb = fresh(indexed);
    edit(sb, 'src/cart/store.ts', '\nexport function emptyCart(): number[] {\n  return [];\n}\n');
    expect(hasSymbol(sb, 'emptyCart')).toBe(false);
    const r = await graphQuery(sb, db(sb), 'symbol', 'emptyCart');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('LOCATION: src/cart/store.ts:');
    expect(hasSymbol(sb, 'emptyCart')).toBe(true);
  });

  it('VP13 three dirty files print the advisory and sync nothing', async () => {
    const sb = fresh(indexed);
    edit(sb, 'src/cart/store.ts', '\nexport const one = 1;\n');
    edit(sb, 'src/orders/price.ts', '\nexport const two = 2;\n');
    edit(sb, 'src/orders/validate.ts', '\nexport const three = 3;\n');
    const r = await graphQuery(sb, db(sb), 'stats');
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('[ast-doc-graph: 3 files modified since last index. Run ast-doc-index --delta to refresh]');
    expect(hasSymbol(sb, 'one')).toBe(false);
  });

  it('null check: a clean copy prints no advisory and syncs nothing', async () => {
    const sb = fresh(indexed);
    const r = await graphQuery(sb, db(sb), 'stats');
    expect([r.code, r.stderr]).toEqual([0, '']);
  });
});
