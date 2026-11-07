import { appendFileSync, mkdirSync, renameSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { sqlite } from '@support/sqlite';
import { astDocIndex, compilerApi, count, fallbackReachable, MODULE, NO_NODE_SQLITE, sqliteFts5, TYPESCRIPT } from '../support/graph';

const unitDoc = (slug: string) =>
  [
    `@doc structural ${slug}`,
    '  repo: workspace',
    `  description: "${slug} probe"`,
    '  sources: [src/**]',
    `  keywords: [${slug}]`,
    '@contract',
    `  - rule: "${slug} holds"`,
    `    evidence: "${slug}Work"`,
    '',
  ].join('\n');

const fn = (name: string) => `export function ${name}(): number {\n  return 1;\n}\n`;

function write(repo: string, files: Record<string, string>): string {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(repo, rel, '..'), { recursive: true });
    writeFileSync(join(repo, rel), text);
  }
  return repo;
}

const twoDocs = (repo: string) => write(repo, { 'docs/workspace/alpha.md': unitDoc('alpha'), 'docs/workspace/beta.md': unitDoc('beta') });

function sourcesRepo(label: string): string {
  const repo = write(sandbox(label), { 'src/orders/order.ts': fn('orderWork'), 'tools/a.ts': fn('toolWork') });
  mkdirSync(join(repo, 'node_modules'));
  symlinkSync(TYPESCRIPT, join(repo, 'node_modules/typescript'));
  return repo;
}

function later(repo: string, db: string, rel: string, text = ''): void {
  if (text) appendFileSync(join(repo, rel), text);
  const t = new Date(statSync(db).mtimeMs + 10_000);
  utimesSync(join(repo, rel), t, t);
}

const query = (cwd: string, db: string, ...args: string[]) => exec(join(MODULE, 'bin/graph-query'), [...args, '--db', db], { cwd });
const docs = (db: string) => count(db, 'SELECT count(*) FROM docs;');
const symbolsIn = (db: string, prefix: string) => count(db, `SELECT count(*) FROM symbols WHERE file LIKE '${prefix}%';`);

async function indexed(repo: string, args: string[]): Promise<void> {
  const r = await astDocIndex(repo, args);
  expect(r.code, r.stderr).toBe(0);
}

describe.skipIf(!sqliteFts5)('the recorded repository root', { concurrent: true }, () => {
  it('[ast-doc-graph-r1] a full index records the repository root and the source scan root as absolute paths, one row a later full index replaces', async () => {
    const repo = twoDocs(sandbox('recorded-row'));
    mkdirSync(join(repo, 'src'));
    const db = join(repo, 'graph.db');
    await indexed(repo, ['--clean', '--src-dir', 'src']);
    expect(sqlite(db, "SELECT repo_root || '|' || src_root FROM graph_meta;").trim()).toBe(`${repo}|${repo}/src`);
    await indexed(repo, []);
    expect(sqlite(db, "SELECT repo_root || '|' || src_root FROM graph_meta;").trim()).toBe(`${repo}|${repo}`);
  });

  function outsideDb(label: string): { repo: string; other: string; db: string } {
    const repo = twoDocs(sandbox(`${label}-repo`));
    const other = write(sandbox(`${label}-db`), { 'docs/workspace/alpha.md': unitDoc('alpha') });
    mkdirSync(join(other, '.contexture'));
    return { repo, other, db: join(other, 'graph.db') };
  }

  it('[ast-doc-graph-r16] a database kept outside its repository, queried where the database folder holds only some of the indexed docs, answers from the recorded root and keeps them all', async () => {
    const { repo, db } = outsideDb('recorded-outside');
    await indexed(repo, ['--clean', '--db', db]);
    const r = await query(repo, db, 'stats');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n')).toContain('  DOCS: 2');
    expect(docs(db)).toBe(2);
  });

  it('[ast-doc-graph-r1] a delta whose repository root differs from the recorded one refuses rc 1 naming both and leaves the graph', async () => {
    const { repo, other, db } = outsideDb('recorded-other');
    await indexed(repo, ['--clean', '--db', db]);
    const r = await astDocIndex(other, ['--delta', '--db', db]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`the graph records the repository root ${repo}, not ${other}`);
    expect(docs(db)).toBe(2);
  });

  it('[ast-doc-graph-r1, ast-doc-graph-r16] a repository moved with its graph: a query names the absent recorded root and answers from the graph, and a delta there refuses until a full index records the new root', async () => {
    const base = sandbox('recorded-moved');
    const [before, after] = [join(base, 'before'), join(base, 'after')];
    twoDocs(before);
    await indexed(before, ['--clean']);
    renameSync(before, after);
    const db = join(after, 'graph.db');
    later(after, db, 'docs/workspace/beta.md', '\n');
    const q = await query(after, db, 'stats');
    expect(q.code).toBe(0);
    expect(q.stderr).toBe(`[ast-doc-graph: the repository root the graph records, ${before}, is absent; answering from the graph as it stands. Run a full ast-doc-index of the repository to rebuild it]\n`);
    expect(q.stdout.split('\n')).toContain('  DOCS: 2');
    const d = await astDocIndex(after, ['--delta']);
    expect(d.code).toBe(1);
    expect(d.stderr).toContain(`the graph records the repository root ${before}, not ${after}`);
    await indexed(after, []);
    await indexed(after, ['--delta']);
  });

  it.skipIf(!fallbackReachable)('[ast-doc-graph-r1] on the sqlite3 command fallback a full index records the roots and a delta against another root refuses as on the built-in branch (needs a node that NODE_OPTIONS=--no-experimental-sqlite keeps from loading node:sqlite)', async () => {
    const { repo, other, db } = outsideDb('recorded-fallback');
    const full = await astDocIndex(repo, ['--clean', '--db', db], { env: NO_NODE_SQLITE });
    expect(full.code, full.stderr).toBe(0);
    expect(sqlite(db, "SELECT repo_root || '|' || src_root FROM graph_meta;").trim()).toBe(`${repo}|${repo}`);
    const r = await astDocIndex(other, ['--delta', '--db', db], { env: NO_NODE_SQLITE });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`the graph records the repository root ${repo}, not ${other}`);
    expect(docs(db)).toBe(2);
  });

  it('[ast-doc-graph-r16] a graph without the record, built before it, keeps the guessed root: a query in its repository still syncs a dirty doc', async () => {
    const repo = twoDocs(sandbox('recorded-none'));
    const db = join(repo, 'graph.db');
    await indexed(repo, ['--clean']);
    sqlite(db, 'DROP TABLE IF EXISTS graph_meta;');
    later(repo, db, 'docs/workspace/beta.md', '  - rule: "beta also holds"\n    evidence: "betaWork"\n');
    const r = await query(repo, db, 'stats');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n')).toContain('  RULES: 3');
  });
});

describe.skipIf(!sqliteFts5 || !compilerApi())('the recorded source root', { concurrent: true }, () => {
  it("[ast-doc-graph-r1, ast-doc-graph-r16] a graph built with --src-dir stays inside it: a newer file outside joins neither a bare delta nor a query's inline delta, while one inside still syncs", async () => {
    const repo = sourcesRepo('recorded-src');
    const db = join(repo, 'graph.db');
    await indexed(repo, ['--clean', '--src-dir', 'src']);
    later(repo, db, 'tools/a.ts', fn('toolMore'));
    await indexed(repo, ['--delta']);
    expect(symbolsIn(db, 'tools/')).toBe(0);
    later(repo, db, 'tools/a.ts', '\n');
    const quiet = await query(repo, db, 'stats');
    expect([quiet.code, quiet.stderr]).toEqual([0, '']);
    expect(symbolsIn(db, 'tools/')).toBe(0);
    later(repo, db, 'src/orders/order.ts', fn('orderMore'));
    const synced = await query(repo, db, 'stats');
    expect([synced.code, synced.stderr]).toEqual([0, '']);
    expect(count(db, "SELECT count(*) FROM symbols WHERE qname = 'orderMore';")).toBe(1);
    expect(symbolsIn(db, 'tools/')).toBe(0);
  });

  it('[ast-doc-graph-r1] a delta naming a TypeScript file outside the recorded source root skips it with a warning', async () => {
    const repo = sourcesRepo('recorded-named');
    const db = join(repo, 'graph.db');
    await indexed(repo, ['--clean', '--src-dir', 'src']);
    const r = await astDocIndex(repo, ['--delta', 'tools/a.ts']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toBe(`Warning: outside the graph's source root ${repo}/src, skipping: tools/a.ts\n`);
    expect(symbolsIn(db, 'tools/')).toBe(0);
  });

  it('[ast-doc-graph-r1] a delta given a --src-dir other than the recorded source root refuses rc 1 naming both and leaves the graph', async () => {
    const repo = sourcesRepo('recorded-srcdir-other');
    const db = join(repo, 'graph.db');
    await indexed(repo, ['--clean', '--src-dir', 'src']);
    later(repo, db, 'tools/a.ts', '\n');
    const r = await astDocIndex(repo, ['--delta', '--src-dir', 'tools']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`the graph records the source root ${repo}/src, not ${repo}/tools`);
    expect(symbolsIn(db, 'tools/')).toBe(0);
    expect(symbolsIn(db, 'src/')).toBe(1);
  });
});
