import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { sqliteAvailable } from '@support/stage';
import { docs, sqliteCorpus, TESTS } from '../support/corpus';

const expected = (path: string): string => readFileSync(join(TESTS, 'unit/expected', path), 'utf8');
const asTheVerbPrints = (engine: string): string => engine.replace(/\n+$/, '\n');

describe.skipIf(!sqliteAvailable())('the read verbs on the sqlite store answer what the engines answer over files', { concurrent: true }, () => {
  let corpus: string;
  beforeAll(async () => {
    corpus = await sqliteCorpus('corpus');
  });

  it.each([
    ['the index', ['query', '--index'], 'query/index.txt'],
    ['a projection', ['query', 'demo-orders', 'order-flow'], 'query/projection.txt'],
    ['a search', ['search', 'checkout', '--limit=50'], 'search/word.txt'],
    ['the rules of a repo', ['query', 'workspace', '--rules'], 'query/rules-repo.txt'],
    ['the pitfalls', ['query', '--pitfalls'], 'query/pitfalls.txt'],
    ['the nudge of the sample backlog', ['nudge', 'backlog.md', 'demo-orders', 'demo-web', 'workspace'], 'nudge/sample-backlog.txt'],
  ])('[docs-module-r1] %s', async (_, args, file) => {
    const r = await docs(fresh(corpus), args);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(asTheVerbPrints(expected(file)));
  });

  it('[docs-module-r1] the whole audit is silent', async () => {
    const r = await docs(fresh(corpus), ['audit', 'demo-orders', 'demo-web', 'workspace']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it('S1 [docs-module-r13, docs-module-r15] the check runs the git path as under posix: a riding workspace doc freshens by the blanket', async () => {
    const delta = 'M\tprojects/demo-orders/src/order/validate.ts\nM\tdocs/workspace/system-map.md\n';
    expect(expected('check/11-workspace-doc-rides.txt')).toContain('FRESH (BLANKET): demo-orders > order-flow');
    const r = await docs(fresh(corpus), ['check', 'demo-orders', 'demo-web', 'workspace'], { input: delta });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH (BLANKET): demo-orders > order-flow');
    expect(r.stdout).toContain('ARCH-COVERED: 1 file(s)');
  });
});
