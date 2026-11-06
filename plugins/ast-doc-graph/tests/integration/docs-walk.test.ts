import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { astDocIndex, count, docsRepo, sqliteFts5 } from '../support/graph';

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
});
