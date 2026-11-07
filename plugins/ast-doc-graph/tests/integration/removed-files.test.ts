import { mkdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import { sqlite } from '@support/sqlite';
import { astDocIndex, compilerApi, count, fallbackReachable, graphQuery, miniRepo, NO_NODE_SQLITE, sqliteFts5 } from '../support/graph';

const unitDoc = (slug: string, header = '') =>
  [
    `@doc structural ${slug}`,
    '  repo: workspace',
    `  description: "${slug} probe"`,
    '  sources: [src/**]',
    `  keywords: [${slug}]`,
    header,
    '@contract',
    `  - rule: "${slug} holds"`,
    `    id: ${slug}-r1`,
    `    evidence: "${slug}Work"`,
    '',
    '@pitfalls',
    `  - id: ${slug}-p1`,
    `    summary: "${slug} trips"`,
    '    class: gotcha',
    '    severity: medium',
    '    trigger: "a trigger"',
    '    consequence: "a consequence"',
    `    evidence: "${slug}Work"`,
    '',
  ].join('\n');

function twoDocs(label: string, beta = 'docs/workspace/beta.md'): string {
  const repo = sandbox(label);
  mkdirSync(join(repo, 'docs/workspace'), { recursive: true });
  writeFileSync(join(repo, 'docs/workspace/alpha.md'), unitDoc('alpha'));
  writeFileSync(join(repo, beta), unitDoc('beta'));
  return repo;
}

const db = (repo: string) => join(repo, 'graph.db');

function rowsOf(repo: string, unit: string, file: string): number[] {
  return [
    count(db(repo), `SELECT count(*) FROM docs WHERE id = '${unit}';`),
    count(db(repo), `SELECT count(*) FROM rules WHERE doc_id = '${unit}';`),
    count(db(repo), `SELECT count(*) FROM pitfalls WHERE doc_id = '${unit}';`),
    count(db(repo), `SELECT count(*) FROM fts_docs WHERE doc_id = '${unit}';`),
    count(db(repo), `SELECT count(*) FROM indexed_files WHERE file = '${file}';`),
  ];
}

async function indexed(repo: string, args: string[] = ['--clean']): Promise<void> {
  const r = await astDocIndex(repo, args);
  expect(r.code, r.stderr).toBe(0);
}

const runs: [string, (repo: string, removed: string) => Promise<void>][] = [
  ['a full run without --clean', (repo) => indexed(repo, [])],
  ['a bare delta', (repo) => indexed(repo, ['--delta'])],
  ['a delta naming the removed file', async (repo, removed) => {
    const r = await astDocIndex(repo, ['--delta', removed]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).not.toContain('skipping');
  }],
  ["a query's inline delta", async (repo) => {
    const r = await graphQuery(repo, db(repo), 'stats');
    expect([r.code, r.stderr]).toEqual([0, '']);
  }],
];

describe.skipIf(!sqliteFts5)('a removed corpus doc leaves the graph', { concurrent: true }, () => {
  it.each(runs)('[ast-doc-graph-r1] two docs, one removed, then %s: DOCS 1, the removed unit with its rules, pitfalls, search rows, and indexed row gone', async (_run, run) => {
    const repo = twoDocs('removed-doc');
    await indexed(repo);
    expect(rowsOf(repo, 'doc:workspace:beta', 'docs/workspace/beta.md')).toEqual([1, 1, 1, 3, 1]);
    rmSync(join(repo, 'docs/workspace/beta.md'));
    await run(repo, 'docs/workspace/beta.md');
    expect(count(db(repo), 'SELECT count(*) FROM docs;')).toBe(1);
    expect(rowsOf(repo, 'doc:workspace:beta', 'docs/workspace/beta.md')).toEqual([0, 0, 0, 0, 0]);
    expect(rowsOf(repo, 'doc:workspace:alpha', 'docs/workspace/alpha.md')).toEqual([1, 1, 1, 3, 1]);
  });

  it.each(runs.slice(1, 3))('[ast-doc-graph-r1] a removed depth-1 doc, whose unit id comes from its header, leaves after %s', async (_run, run) => {
    const repo = twoDocs('removed-flat', 'docs/beta.md');
    await indexed(repo);
    expect(rowsOf(repo, 'doc:workspace:beta', 'docs/beta.md')).toEqual([1, 1, 1, 3, 1]);
    rmSync(join(repo, 'docs/beta.md'));
    await run(repo, 'docs/beta.md');
    expect(rowsOf(repo, 'doc:workspace:beta', 'docs/beta.md')).toEqual([0, 0, 0, 0, 0]);
  });

  it.each(runs.slice(1))('[ast-doc-graph-r1] a removed doc whose unit id comes from its header and differs from its file name leaves after %s', async (_run, run) => {
    const repo = twoDocs('removed-header');
    writeFileSync(join(repo, 'docs/guide.md'), unitDoc('user-guide'));
    await indexed(repo);
    expect(rowsOf(repo, 'doc:workspace:user-guide', 'docs/guide.md')).toEqual([1, 1, 1, 3, 1]);
    rmSync(join(repo, 'docs/guide.md'));
    await run(repo, 'docs/guide.md');
    expect(rowsOf(repo, 'doc:workspace:user-guide', 'docs/guide.md')).toEqual([0, 0, 0, 0, 0]);
    expect(count(db(repo), 'SELECT count(*) FROM docs;')).toBe(2);
  });

  it('[ast-doc-graph-r1] a unit two files hold stays while one of them remains', async () => {
    const repo = twoDocs('removed-shared');
    writeFileSync(join(repo, 'docs/one.md'), unitDoc('shared'));
    writeFileSync(join(repo, 'docs/two.md'), unitDoc('shared'));
    await indexed(repo);
    rmSync(join(repo, 'docs/one.md'));
    await indexed(repo, ['--delta']);
    expect(count(db(repo), "SELECT count(*) FROM docs WHERE id = 'doc:workspace:shared';")).toBe(1);
    rmSync(join(repo, 'docs/two.md'));
    await indexed(repo, ['--delta']);
    expect(count(db(repo), "SELECT count(*) FROM docs WHERE id = 'doc:workspace:shared';")).toBe(0);
  });

  it('[ast-doc-graph-r1] a renamed doc reads as the old removed and the new added after a bare delta, its time unchanged', async () => {
    const repo = twoDocs('renamed-doc');
    await indexed(repo);
    renameSync(join(repo, 'docs/workspace/beta.md'), join(repo, 'docs/workspace/gamma.md'));
    await indexed(repo, ['--delta']);
    expect(rowsOf(repo, 'doc:workspace:beta', 'docs/workspace/beta.md')).toEqual([0, 0, 0, 0, 0]);
    expect(rowsOf(repo, 'doc:workspace:gamma', 'docs/workspace/gamma.md')).toEqual([1, 1, 1, 3, 1]);
  });

  it('[ast-doc-graph-r1] a full run records every markdown file it walks, so a later delta finds nothing to do and leaves the database untouched', async () => {
    const repo = twoDocs('recorded-docs');
    writeFileSync(join(repo, 'docs/workspace/notes.md'), '# Notes without a unit\n');
    await indexed(repo);
    expect(count(db(repo), "SELECT count(*) FROM indexed_files WHERE file = 'docs/workspace/notes.md';")).toBe(1);
    const before = statSync(db(repo)).mtimeMs;
    const r = await astDocIndex(repo, ['--delta']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
    expect(statSync(db(repo)).mtimeMs).toBe(before);
  });

  it('[ast-doc-graph-r1] a named file the graph never held and the disk lacks is still warned and skipped', async () => {
    const repo = twoDocs('named-unknown');
    await indexed(repo);
    const r = await astDocIndex(repo, ['--delta', 'docs/workspace/nope.md']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toContain('Warning: target file not found, skipping: docs/workspace/nope.md');
    expect(count(db(repo), 'SELECT count(*) FROM docs;')).toBe(2);
  });

  it.skipIf(!fallbackReachable)('[ast-doc-graph-r1] on the sqlite3 command fallback a bare delta removes a removed doc, a depth-1 one and one whose unit id comes from its header among them (needs a node that NODE_OPTIONS=--no-experimental-sqlite keeps from loading node:sqlite)', async () => {
    const repo = twoDocs('removed-doc-fallback', 'docs/beta.md');
    writeFileSync(join(repo, 'docs/workspace/gamma.md'), unitDoc('gamma'));
    writeFileSync(join(repo, 'docs/guide.md'), unitDoc('user-guide'));
    await indexed(repo);
    rmSync(join(repo, 'docs/beta.md'));
    rmSync(join(repo, 'docs/workspace/gamma.md'));
    rmSync(join(repo, 'docs/guide.md'));
    const r = await astDocIndex(repo, ['--delta'], { env: NO_NODE_SQLITE });
    expect(r.code, r.stderr).toBe(0);
    expect(rowsOf(repo, 'doc:workspace:beta', 'docs/beta.md')).toEqual([0, 0, 0, 0, 0]);
    expect(rowsOf(repo, 'doc:workspace:gamma', 'docs/workspace/gamma.md')).toEqual([0, 0, 0, 0, 0]);
    expect(rowsOf(repo, 'doc:workspace:user-guide', 'docs/guide.md')).toEqual([0, 0, 0, 0, 0]);
    expect(rowsOf(repo, 'doc:workspace:alpha', 'docs/workspace/alpha.md')).toEqual([1, 1, 1, 3, 1]);
  });

  async function removesMany(env: Record<string, string>): Promise<void> {
    const repo = twoDocs('removed-many');
    await indexed(repo);
    sqlite(db(repo), "WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 24999) INSERT INTO indexed_files (file, mtime, hash) SELECT 'docs/workspace/archive/a-folder-long-enough-to-fill-a-command-line/entry-' || i || '.md', 0, '' FROM n;");
    rmSync(join(repo, 'docs/workspace/beta.md'));
    const r = await astDocIndex(repo, ['--delta'], { env });
    expect(r.code, r.stderr).toBe(0);
    expect(count(db(repo), 'SELECT count(*) FROM indexed_files;')).toBe(1);
    expect(rowsOf(repo, 'doc:workspace:beta', 'docs/workspace/beta.md')).toEqual([0, 0, 0, 0, 0]);
  }

  it('[ast-doc-graph-r1] a delta that removes more files than one command line holds removes them all', () => removesMany({}));

  it.skipIf(!fallbackReachable)('[ast-doc-graph-r1] on the sqlite3 command fallback a delta removes them all too, its read of the indexed files passing 1 MB (needs a node that NODE_OPTIONS=--no-experimental-sqlite keeps from loading node:sqlite)', () =>
    removesMany(NO_NODE_SQLITE));

  it('[ast-doc-graph-r1] a delta whose repository root holds none of the indexed files refuses rc 1 and leaves the graph', async () => {
    const repo = twoDocs('other-root');
    await indexed(repo);
    const other = sandbox('other-root-elsewhere');
    mkdirSync(join(other, '.contexture'));
    const r = await astDocIndex(other, ['--delta', '--db', db(repo)]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`every file the graph indexed is absent under ${other}`);
    expect(count(db(repo), 'SELECT count(*) FROM docs;')).toBe(2);
  });
});

describe.skipIf(!sqliteFts5 || !compilerApi())('a removed or renamed TypeScript source leaves the graph', { concurrent: true }, () => {
  const symbolsIn = (repo: string, file: string) => count(db(repo), `SELECT count(*) FROM symbols WHERE file = '${file}';`);
  const edgesOf = (repo: string, file: string) =>
    count(db(repo), `SELECT count(*) FROM edges WHERE source = '${file}' OR target = '${file}' OR source LIKE 'sym:${file}:%' OR target LIKE 'sym:${file}:%';`);

  it.each(runs)("[ast-doc-graph-r1] a removed source's symbols, edges, and indexed row leave after %s", async (_run, run) => {
    const repo = miniRepo('removed-ts');
    await indexed(repo);
    expect(symbolsIn(repo, 'src/cart/store.ts')).toBeGreaterThan(0);
    rmSync(join(repo, 'src/cart/store.ts'));
    await run(repo, 'src/cart/store.ts');
    expect(symbolsIn(repo, 'src/cart/store.ts')).toBe(0);
    expect(edgesOf(repo, 'src/cart/store.ts')).toBe(0);
    expect(count(db(repo), "SELECT count(*) FROM indexed_files WHERE file = 'src/cart/store.ts';")).toBe(0);
    expect(count(db(repo), "SELECT count(*) FROM symbols WHERE qname = 'validateCart';")).toBe(1);
  });

  it.each(runs)('[ast-doc-graph-r1] a source renamed with its time unchanged moves its rows after %s, its governance kept', async (_run, run) => {
    const repo = miniRepo('renamed-ts');
    await indexed(repo);
    renameSync(join(repo, 'src/orders/validate.ts'), join(repo, 'src/orders/check.ts'));
    await run(repo, 'src/orders/validate.ts');
    expect(symbolsIn(repo, 'src/orders/validate.ts')).toBe(0);
    expect(edgesOf(repo, 'src/orders/validate.ts')).toBe(0);
    expect(sqlite(db(repo), "SELECT file FROM symbols WHERE qname = 'validateCart';").trim()).toBe('src/orders/check.ts');
    expect(count(db(repo), "SELECT count(*) FROM edges e JOIN symbols s ON s.id = e.target WHERE e.kind IN ('GOVERNS', 'COVERS') AND s.qname = 'validateCart';")).toBe(2);
  });

  it.skipIf(!fallbackReachable)('[ast-doc-graph-r1] on the sqlite3 command fallback a bare delta removes a removed source and moves a renamed one as the built-in branch does (needs a node that NODE_OPTIONS=--no-experimental-sqlite keeps from loading node:sqlite)', async () => {
    const [builtIn, fallback] = [miniRepo('removed-ts-builtin'), miniRepo('removed-ts-fallback')];
    for (const repo of [builtIn, fallback]) {
      await indexed(repo);
      rmSync(join(repo, 'src/cart/store.ts'));
      renameSync(join(repo, 'src/orders/validate.ts'), join(repo, 'src/orders/check.ts'));
    }
    await indexed(builtIn, ['--delta']);
    const r = await astDocIndex(fallback, ['--delta'], { env: NO_NODE_SQLITE });
    expect(r.code, r.stderr).toBe(0);
    const graph = (repo: string) => sqlite(db(repo), "SELECT kind, source, target FROM edges UNION ALL SELECT 'symbol', id, file FROM symbols UNION ALL SELECT 'file', file, '' FROM indexed_files ORDER BY 1, 2, 3;");
    expect(graph(fallback)).toBe(graph(builtIn));
    expect(symbolsIn(fallback, 'src/cart/store.ts')).toBe(0);
    expect(sqlite(db(fallback), "SELECT file FROM symbols WHERE qname = 'validateCart';").trim()).toBe('src/orders/check.ts');
  });

  it('[ast-doc-graph-r1] a delta adds an unindexed file only inside the folders the graph covers, so a --src-dir graph never widens', async () => {
    const repo = miniRepo('scoped-ts');
    mkdirSync(join(repo, 'tools'));
    writeFileSync(join(repo, 'tools/extra.ts'), 'export function extraWork(): number {\n  return 1;\n}\n');
    await indexed(repo, ['--clean', '--src-dir', 'src']);
    writeFileSync(join(repo, 'src/orders/added.ts'), 'export function addedWork(): number {\n  return 2;\n}\n');
    const old = new Date(statSync(db(repo)).mtimeMs - 60_000);
    for (const f of ['src/orders/added.ts', 'tools/extra.ts']) utimesSync(join(repo, f), old, old);
    await indexed(repo, ['--delta']);
    expect(symbolsIn(repo, 'src/orders/added.ts')).toBe(1);
    expect(symbolsIn(repo, 'tools/extra.ts')).toBe(0);
  });
});
