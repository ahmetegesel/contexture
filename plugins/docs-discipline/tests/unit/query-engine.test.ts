import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { corpusDir, ENGINE_FIXTURES, matches, TESTS } from '../support/corpus';
import { query, type Query } from '../support/engines';

const EXPECTED = join(TESTS, 'unit/expected/query');

let corpus: string;
let engine: string;
beforeAll(() => {
  corpus = corpusDir('query-corpus');
  engine = corpusDir('query-engine', ENGINE_FIXTURES);
});

const CASES: [string, Query][] = [
  ['index', { mode: 'index' }],
  ['projection', { repo: 'demo-orders', slug: 'order-flow' }],
  ['section', { repo: 'demo-orders', slug: 'order-flow', section: 'pitfalls' }],
  ['owner-claimed', { mode: 'file', repo: 'demo-orders', file: 'projects/demo-orders/src/order/validate.ts' }],
  ['owner-root-file', { mode: 'file', repo: 'workspace', file: 'AGENTS.workspace.md' }],
  ['search-word', { mode: 'search', search: 'checkout' }],
  ['search-phrase', { mode: 'search', search: 'checkout handoff' }],
  ['search-symbol', { mode: 'search', search: 'validateCart' }],
  ['rules-repo', { mode: 'rules', repo: 'workspace' }],
  ['rules-category', { mode: 'rules', repo: 'workspace', category: 'docs' }],
  ['pitfalls', { mode: 'pitfalls' }],
  ['pitfalls-high', { mode: 'pitfalls', severity: 'high' }],
  ['edges-http', { mode: 'edge', channel: 'http' }],
];

describe('the query engine over the staged corpus, against committed expected output', { concurrent: true }, () => {
  it.each(CASES)('%s', async (name, q) => {
    const r = await query(corpus, q);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).not.toBe('');
    expect(r.stdout).toBe(matches(r.stdout, join(EXPECTED, `${name}.txt`)));
  });

  it.each<[string, Query]>([
    ['an unclaimed path', { mode: 'file', repo: 'demo-orders', file: 'nowhere/unclaimed.ts' }],
    ['a term with no hit', { mode: 'search', search: 'zzqqxx' }],
    ['an absent section', { repo: 'demo-orders', slug: 'order-flow', section: 'nosuchsection' }],
    ['an absent channel', { mode: 'edge', channel: 'nosuchchannel' }],
  ])('prints nothing for %s (the verb maps the miss to rc 1)', async (_, q) => {
    const r = await query(corpus, q);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });
});

describe('the query engine over the engine fixtures', { concurrent: true }, () => {
  it('EC2 lists @pitfalls entries only, never an overview caveat', async () => {
    const r = await query(engine, { mode: 'pitfalls', repo: 'etest' });
    expect(r.stdout).toContain('idone-r1');
    expect(r.stdout).not.toContain('over-c1');
  });

  it('EC3 credits a pitfall that ends a doc to that doc', async () => {
    const r = await query(engine, { mode: 'pitfalls', repo: 'etest' });
    expect(r.stdout.split('\n')).toContain('! [LOW/bug] idone-r1: A pitfall (idtwo.md)');
    expect(r.stdout).not.toContain('(over.md)');
  });

  it('finds a multibyte word under LC_ALL=C', async () => {
    const r = await query(engine, { mode: 'search', repo: 'etr', search: 'değil' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Kayıt değil, belge yazılır');
    expect(r.stdout).toContain('Bir kuralın değil, bir notun yeri');
  });

  it('EC4 keeps a backslash in the search text literal', async () => {
    const r = await query(engine, { mode: 'search', repo: 'etest', search: 'zz\\tqq' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('The marker reads zz\\tqq on disk');
    const tab = await query(engine, { mode: 'search', repo: 'etest', search: 'zz\tqq' });
    expect(tab.stdout).toBe('');
  });
});
