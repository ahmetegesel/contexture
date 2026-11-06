import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import { corpusDir, ENGINE_FIXTURES, matches, OWNER_FIXTURES, TESTS } from '../support/corpus';
import { check, query, type Query } from '../support/engines';

const EXPECTED = join(TESTS, 'unit/expected/query');

let corpus: string;
let engine: string;
let owners: string;
beforeAll(() => {
  corpus = corpusDir('query-corpus');
  engine = corpusDir('query-engine', ENGINE_FIXTURES);
  owners = corpusDir('query-owner', OWNER_FIXTURES);
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
  it.each(CASES)('[docs-module-r5] %s', async (name, q) => {
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
  ])('[docs-module-r5] prints nothing for %s (the verb maps the miss to rc 1)', async (_, q) => {
    const r = await query(corpus, q);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });
});

describe('the query engine over the engine fixtures', { concurrent: true }, () => {
  it('EC2 [docs-module-r5] lists @pitfalls entries only, never an overview caveat', async () => {
    const r = await query(engine, { mode: 'pitfalls', repo: 'etest' });
    expect(r.stdout).toContain('idone-r1');
    expect(r.stdout).not.toContain('over-c1');
  });

  it('EC3 [docs-module-r5] credits a pitfall that ends a doc to that doc', async () => {
    const r = await query(engine, { mode: 'pitfalls', repo: 'etest' });
    expect(r.stdout.split('\n')).toContain('! [LOW/bug] idone-r1: A pitfall (idtwo.md)');
    expect(r.stdout).not.toContain('(over.md)');
  });

  it('[docs-module-r5] finds a multibyte word under LC_ALL=C', async () => {
    const r = await query(engine, { mode: 'search', repo: 'etr', search: 'değil' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Kayıt değil, belge yazılır');
    expect(r.stdout).toContain('Bir kuralın değil, bir notun yeri');
  });

  it('EC4 [docs-module-r5] keeps a backslash in the search text literal', async () => {
    const r = await query(engine, { mode: 'search', repo: 'etest', search: 'zz\\tqq' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('The marker reads zz\\tqq on disk');
    const tab = await query(engine, { mode: 'search', repo: 'etest', search: 'zz\tqq' });
    expect(tab.stdout).toBe('');
  });
});

describe('the query engine --file: the most specific owner by the check glob predicate', { concurrent: true }, () => {
  it.each([
    ['a broad glob of an earlier doc loses to the exact source of a later doc', '.contexture/extensions/modules/docs/scripts/gate', 'ops', 'operational'],
    ['a narrower glob of a later doc beats plugins/**', 'plugins/docs-discipline/README.md', 'pb-narrow', 'structural'],
    ['the fewest wildcards break a tie on the literal part', 'lib/x/run.sh', 'w2', 'capability'],
    ['corpus order breaks a full tie, a bare folder name claiming nothing below it', 'src/x.ts', 't-b', 'capability'],
    ['a repo-prefixed path reads as its repo-relative form', 'eown/lib/x/run.sh', 'w2', 'capability'],
  ])('[docs-module-r6] %s', async (_, file, slug, kind) => {
    const r = await query(owners, { mode: 'file', repo: 'eown', file });
    expect([r.code, r.stderr]).toEqual([0, '']);
    const [head, summary, doc, ...rest] = r.stdout.split('\n');
    expect([head, doc, rest]).toEqual([`OWNER: ${slug} (${kind}) [eown]`, `DOC: docs/eown/${slug}.md`, ['']]);
    expect(summary).toMatch(/^SUMMARY: \S/);
  });

  it.each([
    ["a child repository's exact source beats a workspace glob, the stripped prefix counted as literal", 'projects/demo/src/x.ts', 'da', 'capability', 'demo'],
    ["a workspace doc's exact child path beats the child repository's glob", 'projects/demo/lib/y.ts', 'wa', 'structural', 'workspace'],
  ])('[docs-module-r6] without a repo argument %s', async (_, file, slug, kind, repo) => {
    const r = await query(owners, { mode: 'file', file });
    expect([r.code, r.stderr]).toEqual([0, '']);
    const [head, , doc] = r.stdout.split('\n');
    expect([head, doc]).toEqual([`OWNER: ${slug} (${kind}) [${repo}]`, `DOC: docs/${repo}/${slug}.md`]);
  });

  it('[docs-module-r6] the one-repo form keeps its answer for a prefixed child path', async () => {
    const r = await query(owners, { mode: 'file', repo: 'workspace', file: 'projects/demo/src/x.ts' });
    expect(r.stdout.split('\n')[0]).toBe('OWNER: wa (structural) [workspace]');
  });

  it('[docs-module-r6] a workspace doc reads a path as given, as the check does: a folder named workspace keeps its prefix', async () => {
    const dir = sandbox('query-workspace-strip');
    mkdirSync(join(dir, 'docs/workspace'), { recursive: true });
    writeFileSync(join(dir, 'docs/workspace/wl.md'), '@doc capability wl\n  repo: workspace\n  description: "Claims the root lib folder."\n  sources: [lib/*.ts]\n');
    for (const file of ['workspace/lib/a.ts', 'projects/workspace/lib/a.ts']) {
      for (const repo of ['workspace', undefined]) {
        const r = await query(dir, { mode: 'file', repo, file });
        expect([file, repo, r.code, r.stdout, r.stderr]).toEqual([file, repo, 0, '', '']);
      }
      const c = await check(dir, `M\t${file}\n`);
      expect([c.code, c.stdout.match(/^UNCOVERED: .*$/gm)]).toEqual([1, [`UNCOVERED: ${file}`]]);
    }
    const owned = await query(dir, { mode: 'file', repo: 'workspace', file: 'lib/a.ts' });
    expect(owned.stdout.split('\n')[0]).toBe('OWNER: wl (capability) [workspace]');
  });

  it('[docs-module-r6] a path that holds a source only as a substring has no owner', async () => {
    const r = await query(owners, { mode: 'file', repo: 'eown', file: 'xplugins/docs-discipline/.contexture/extensions/modules/docs/scripts/gate' });
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });
});
