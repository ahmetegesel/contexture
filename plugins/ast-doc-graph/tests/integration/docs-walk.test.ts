import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { astDocIndex, compilerApi, count, docsRepo, miniRepo, sqliteFts5 } from '../support/graph';

const GUIDE = [
  '# A guide page quoting the grammar',
  '',
  '@contract',
  '  - rule: "A quoted grammar rule"',
  '    evidence: "quotedWork"',
  '',
  '! [high/bug] guide-p1: A quoted bang pitfall',
  '',
].join('\n');

describe.skipIf(!sqliteFts5)('the docs walk', { concurrent: true }, () => {
  it.each([[[]], [['--clean']]])('[ast-doc-graph-r7] a rule or pitfall block before any @doc line is skipped with one warning naming its file, and the rest of the corpus indexes (%j)', async (args) => {
    const repo = docsRepo('walk-unitless');
    writeFileSync(join(repo, 'docs/guide.md'), GUIDE);
    const r = await astDocIndex(repo, args);
    expect(r.code, r.stderr).toBe(0);
    for (const line of ['  DOCS: 1', '  RULES: 2', '  PITFALLS: 1']) expect(r.stdout.split('\n')).toContain(line);
    const named = r.stderr.split('\n').filter((l) => l.includes('guide.md'));
    expect(named).toEqual(['Warning: skipping 2 rule or pitfall entries before any @doc line in docs/guide.md']);
    expect(count(join(repo, 'graph.db'), "SELECT count(*) FROM rules WHERE doc_id = 'doc:orders:order-flow';")).toBe(2);
  });

  it.skipIf(!compilerApi()).each<[string, (repo: string) => void]>([
    ['no docs folder and no markdown under the root', (repo) => rmSync(join(repo, 'docs'), { recursive: true })],
    ['a docs folder holding no markdown', (repo) => {
      rmSync(join(repo, 'docs'), { recursive: true });
      mkdirSync(join(repo, 'docs/orders'), { recursive: true });
      writeFileSync(join(repo, 'docs/orders/notes.txt'), 'not markdown\n');
    }],
  ])('[ast-doc-graph-r2] a repository with %s indexes its code and an empty docs side, rc 0', async (_shape, shape) => {
    const repo = miniRepo('walk-nomd');
    shape(repo);
    const r = await astDocIndex(repo, ['--clean']);
    expect(r.code, r.stderr).toBe(0);
    for (const line of ['  DOCS: 0', '  RULES: 0', '  PITFALLS: 0']) expect(r.stdout.split('\n')).toContain(line);
    expect(count(join(repo, 'graph.db'), "SELECT count(*) FROM symbols WHERE qname = 'validateCart';")).toBe(1);
  });
});
