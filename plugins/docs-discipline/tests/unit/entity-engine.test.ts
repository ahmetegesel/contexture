import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { corpusDir, ENGINE_FIXTURES, matches, TESTS } from '../support/corpus';
import { entities } from '../support/engines';

const EXPECTED = join(TESTS, 'unit/expected/search');

let corpus: string;
let engine: string;
beforeAll(() => {
  corpus = corpusDir('entity-corpus');
  engine = corpusDir('entity-engine', ENGINE_FIXTURES);
});

describe('the entity engine searching the staged corpus, against committed expected output', { concurrent: true }, () => {
  it.each([
    ['word', 'checkout'],
    ['phrase', 'checkout handoff'],
    ['symbol', 'validateCart'],
  ])('[docs-module-r-yyfxd] %s: one row per matching entity, its first matching line the snippet', async (name, query) => {
    const r = await entities(corpus, { mode: 'search', query, limit: 50 });
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(matches(r.stdout, join(EXPECTED, `${name}.txt`)));
  });

  it('[docs-module-r-yyfxd] --json answers {query, mode, total, rows}, each row in the shared shape, total counting every match before the limit', async () => {
    const all = JSON.parse((await entities(corpus, { mode: 'search', query: 'checkout', limit: 50, json: true })).stdout);
    const two = JSON.parse((await entities(corpus, { mode: 'search', query: 'checkout', limit: 2, json: true })).stdout);
    expect(Object.keys(all)).toEqual(['query', 'mode', 'total', 'rows']);
    expect([all.query, all.mode]).toEqual(['checkout', 'exact']);
    expect(all.total).toBe(all.rows.length);
    expect(all.total).toBeGreaterThan(2);
    expect([two.total, two.rows]).toEqual([all.total, all.rows.slice(0, 2)]);
    for (const row of all.rows) {
      expect(Object.keys(row)).toEqual(['module', 'container', 'type', 'id', 'address', 'snippet', 'read']);
      expect(row.module).toBe('docs');
      expect(row.address).toBe(`docs#${row.container}/${row.id}`);
      expect(row.read).toBe(`ctx docs get ${row.container}/${row.id}`);
      expect(row.id).not.toMatch(/[ \t"]/);
    }
  });

  it('[docs-module-r-yyfxd] the types: an id keyed pitfall, a rule, an entry keyed by one token, and the header for a line no keyed entity holds; --type keeps one', async () => {
    const rows = JSON.parse((await entities(corpus, { mode: 'search', query: 'checkout', limit: 200, json: true })).stdout).rows as { type: string; id: string }[];
    expect(rows).toContainEqual(expect.objectContaining({ type: 'pitfall', id: 'order-flow-p1' }));
    expect(rows).toContainEqual(expect.objectContaining({ type: 'doc', id: 'header' }));
    const pitfalls = JSON.parse((await entities(corpus, { mode: 'search', query: 'checkout', type: 'pitfall', limit: 200, json: true })).stdout).rows as { type: string }[];
    expect(pitfalls.length).toBeGreaterThan(0);
    expect(pitfalls.every((r) => r.type === 'pitfall')).toBe(true);
  });

  it('[docs-module-r-yyfxd] a term no line carries answers zero rows, rc 0, in both forms', async () => {
    const text = await entities(corpus, { mode: 'search', query: 'zzqqxx' });
    expect([text.code, text.stdout, text.stderr]).toEqual([0, 'docs search "zzqqxx": 0 matches\n', '']);
    const json = await entities(corpus, { mode: 'search', query: 'zzqqxx', json: true });
    expect(json.stdout).toBe('{"query":"zzqqxx","mode":"exact","total":0,"rows":[]}\n');
  });

  it('[docs-module-r-yyfxd] finds a multibyte word under LC_ALL=C, a keyless legacy rule landing on the header entity whose first match is the snippet', async () => {
    const r = await entities(engine, { mode: 'search', query: 'değil', limit: 50 });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('  doc docs#etr/turkish/header: description: "Bir kuralın değil, bir notun yeri"\n');
    expect(r.stdout).not.toContain('Kayıt değil');
  });

  it('EC4 [docs-module-r-yyfxd] keeps a backslash in the search text literal, a real tab matching nothing', async () => {
    const r = await entities(engine, { mode: 'search', query: 'zz\\tqq' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('The marker reads zz\\tqq on disk');
    const tab = await entities(engine, { mode: 'search', query: 'zz\tqq' });
    expect(tab.stdout).toBe('docs search "zz\tqq": 0 matches\n');
  });
});
