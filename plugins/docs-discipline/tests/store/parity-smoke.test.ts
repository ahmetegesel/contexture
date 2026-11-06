import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { fts5Available } from '@support/stage';
import { docs, fts5Corpus, TESTS } from '../support/corpus';

const expected = (path: string): string => readFileSync(join(TESTS, 'unit/expected', path), 'utf8');
const asTheVerbPrints = (engine: string): string => engine.replace(/\n+$/, '\n');

describe.skipIf(!fts5Available())('the read verbs on the fts5 store answer what the engines answer over files', { concurrent: true }, () => {
  let corpus: string;
  beforeAll(async () => {
    corpus = await fts5Corpus('corpus');
  });

  it.each([
    ['the index', ['query', '--index'], 'query/index.txt'],
    ['a projection', ['query', 'demo-orders', 'order-flow'], 'query/projection.txt'],
    ['a search', ['query', '--search', 'checkout'], 'query/search-word.txt'],
    ['the rules of a repo', ['query', 'workspace', '--rules'], 'query/rules-repo.txt'],
    ['the pitfalls', ['query', '--pitfalls'], 'query/pitfalls.txt'],
    ['the nudge of the sample backlog', ['nudge', 'backlog.md', 'demo-orders', 'demo-web', 'workspace'], 'nudge/sample-backlog.txt'],
  ])('%s', async (_, args, file) => {
    const r = await docs(fresh(corpus), args);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(asTheVerbPrints(expected(file)));
  });

  it('the whole audit is silent', async () => {
    const r = await docs(fresh(corpus), ['audit', 'demo-orders', 'demo-web', 'workspace']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it('S1 the check runs in its store mode: STALE DOC where the files driver prints the blanket', async () => {
    const delta = 'M\tprojects/demo-orders/src/order/validate.ts\nM\tdocs/workspace/system-map.md\n';
    expect(expected('check/11-workspace-doc-rides.txt')).toContain('FRESH (BLANKET): demo-orders > order-flow');
    const r = await docs(fresh(corpus), ['check', 'demo-orders', 'demo-web', 'workspace'], { input: delta });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: demo-orders/order-flow');
    expect(r.stdout + r.stderr).not.toContain('BLANKET');
  });
});
