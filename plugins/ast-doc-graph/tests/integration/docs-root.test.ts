import { appendFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '@support/exec';
import { ROOT } from '@support/root';
import { sqlite } from '@support/sqlite';
import { sqliteAvailable, stage } from '@support/stage';
import { astDocIndex, compilerApi, count, FIXTURES, graphQuery, miniRepo, NO_NODE_SQLITE, fallbackReachable, sqliteFts5, TYPESCRIPT } from '../support/graph';

// the docs walk follows the docs namespace's declared root, read through the drawer's storage
// library: under posix at the drawer root the docs side is the one a root docs walk gives, a
// corpus edit refreshes, a removal leaves; roots the library cannot list refuse, a root outside
// the repository leaves the side empty, and a store driver keeps no doc there

const db = (repo: string) => join(repo, 'graph.db');
const DRAWER_DOCS = '.contexture/docs';

// a drawer's storage core and its builtin modules, whose data files the core lists
function withStorageCore(repo: string): void {
  for (const part of ['storage', 'modules']) cpSync(join(ROOT, 'base/.contexture', part), join(repo, '.contexture', part), { recursive: true });
}

// the mini repository with the storage core and a docs data file declaring the drawer root, its
// corpus moved there, and an adopter's own page beside it in the docs folder
function drawerRepo(label: string, data = `root: ${DRAWER_DOCS}\nsuffix: .md\nkey: <repo>/<slug>\n`): string {
  const repo = miniRepo(label);
  withStorageCore(repo);
  mkdirSync(join(repo, '.contexture/extensions/modules/docs'), { recursive: true });
  writeFileSync(join(repo, '.contexture/extensions/modules/docs/data'), data);
  mkdirSync(join(repo, DRAWER_DOCS), { recursive: true });
  renameSync(join(repo, 'docs/orders'), join(repo, DRAWER_DOCS, 'orders'));
  mkdirSync(join(repo, 'docs/notes'), { recursive: true });
  writeFileSync(join(repo, 'docs/notes/page.md'), '@doc capability page\n  repo: notes\n  description: "an adopter page"\n  sources: [src/**]\n');
  return repo;
}

async function indexed(repo: string, ...args: string[]): Promise<string> {
  const r = await astDocIndex(repo, ['--clean', ...args]);
  if (r.code !== 0) throw new Error(`ast-doc-index: rc ${r.code}: ${r.stderr}`);
  return repo;
}

const rows = (repo: string, sql: string): string[] => sqlite(db(repo), sql).trim().split('\n').filter(Boolean);
const docEdges = (repo: string): string[] => rows(repo, "SELECT source || ' ' || kind || ' ' || target FROM edges WHERE kind IN ('GOVERNS', 'WARNS', 'COVERS') ORDER BY 1;");
const docsRoot = (repo: string): string => sqlite(db(repo), "SELECT coalesce(docs_root, '<null>') FROM graph_meta;").trim();

function later(repo: string, rel: string): void {
  const t = new Date(statSync(db(repo)).mtimeMs + 10_000);
  utimesSync(join(repo, rel), t, t);
}

describe.skipIf(!sqliteFts5 || !compilerApi())('the docs walk at the declared root', { concurrent: true }, () => {
  it('[ast-doc-graph-r2, ast-doc-graph-r8, ast-doc-graph-r1] under posix at the drawer root the docs side equals root docs: the same unit ids, rules, pitfalls, and GOVERNS, WARNS, and COVERS edges, the adopter page unread, the walk folder recorded', async () => {
    const [control, drawer] = await Promise.all([indexed(miniRepo('root-control')), indexed(drawerRepo('root-drawer'))]);
    expect(rows(drawer, 'SELECT id FROM docs ORDER BY id;')).toEqual(['doc:orders:order-flow']);
    expect(rows(drawer, 'SELECT id FROM docs ORDER BY id;')).toEqual(rows(control, 'SELECT id FROM docs ORDER BY id;'));
    expect(rows(drawer, 'SELECT id FROM rules ORDER BY id;')).toEqual(rows(control, 'SELECT id FROM rules ORDER BY id;'));
    expect(rows(drawer, 'SELECT id FROM pitfalls ORDER BY id;')).toEqual(rows(control, 'SELECT id FROM pitfalls ORDER BY id;'));
    expect(docEdges(drawer).length).toBeGreaterThan(0);
    expect(docEdges(drawer)).toEqual(docEdges(control));
    expect(rows(drawer, "SELECT file FROM indexed_files WHERE file LIKE '%.md' ORDER BY file;")).toEqual([`${DRAWER_DOCS}/orders/order-flow.md`]);
    expect(rows(drawer, "SELECT source FROM edges WHERE kind = 'DEFINES' AND target LIKE 'doc:%';")).toEqual([`${DRAWER_DOCS}/orders/order-flow.md`]);
    expect([docsRoot(drawer), docsRoot(control)]).toEqual([DRAWER_DOCS, 'docs']);
  });

  it('[ast-doc-graph-r16] a corpus edit at the drawer root refreshes through the query\'s inline delta', async () => {
    const repo = await indexed(drawerRepo('root-fresh'));
    const doc = join(DRAWER_DOCS, 'orders/order-flow.md');
    appendFileSync(join(repo, doc), '\n@contract\n  - rule: "A refreshed rule holds"\n    evidence: "priceCart"\n');
    later(repo, doc);
    expect(count(db(repo), "SELECT count(*) FROM rules WHERE statement = 'A refreshed rule holds';")).toBe(0);
    const r = await graphQuery(repo, db(repo), 'stats');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toBe('');
    expect(count(db(repo), "SELECT count(*) FROM rules WHERE statement = 'A refreshed rule holds';")).toBe(1);
    expect(rows(repo, 'SELECT id FROM docs;')).toEqual(['doc:orders:order-flow']);
  });

  it('[ast-doc-graph-r1, ast-doc-graph-r6] a doc removed from the drawer root leaves the graph on a delta', async () => {
    const repo = await indexed(drawerRepo('root-removed'));
    rmSync(join(repo, DRAWER_DOCS, 'orders/order-flow.md'));
    const r = await astDocIndex(repo, ['--delta']);
    expect(r.code, r.stderr).toBe(0);
    expect(count(db(repo), 'SELECT count(*) FROM docs;')).toBe(0);
    expect(count(db(repo), 'SELECT count(*) FROM rules;')).toBe(0);
    expect(rows(repo, "SELECT file FROM indexed_files WHERE file LIKE '%.md';")).toEqual([]);
  });

  it('[ast-doc-graph-r2, ast-doc-graph-r5] roots the storage library cannot list stop the index rc 2 with its line, before any database is written', async () => {
    const repo = drawerRepo('root-broken');
    mkdirSync(join(repo, '.contexture/modules/broken'), { recursive: true });
    writeFileSync(join(repo, '.contexture/modules/broken/data'), 'root: /outside\nkey: <a>\n');
    const r = await astDocIndex(repo, ['--clean']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^Error: the docs root cannot be read: store\.roots: error: a module's data file cannot be read, so no root list is answered \(.+\) \(ERR_STORAGE_READ\)$/m);
    expect(existsSync(db(repo))).toBe(false);
  });

  it('[ast-doc-graph-r2] a repository outside the docs namespace\'s root gets an empty docs side and one notice, its code indexed', async () => {
    const workspace = drawerRepo('root-outside');
    const child = join(workspace, 'projects/child');
    cpSync(join(FIXTURES, 'mini-repo'), child, { recursive: true });
    mkdirSync(join(child, 'node_modules'));
    symlinkSync(TYPESCRIPT, join(child, 'node_modules/typescript'));
    const r = await astDocIndex(child, ['--clean'], { cwd: workspace, env: { CTX_ROOT: workspace } });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr.split('\n').filter((l) => l.startsWith('Notice:'))).toEqual([`Notice: the docs namespace's root lies outside the repository root ${child}, so the graph's docs side stays empty`]);
    expect(r.stdout.split('\n')).toContain('  DOCS: 0');
    expect(count(db(child), "SELECT count(*) FROM symbols WHERE qname = 'validateCart';")).toBe(1);
    expect(docsRoot(child)).toBe('');
  });

  it('[ast-doc-graph-r2] a drawer declaring no docs namespace keeps the generic walk of the docs folder', async () => {
    const repo = miniRepo('root-undeclared');
    withStorageCore(repo);
    await indexed(repo);
    expect(rows(repo, 'SELECT id FROM docs;')).toEqual(['doc:orders:order-flow']);
    expect(docsRoot(repo)).toBe('docs');
  });

  it.each([[{}], [NO_NODE_SQLITE]])('[ast-doc-graph-r1, ast-doc-graph-r16] a graph whose graph_meta lacks the docs root answers its queries and gains the column on its next load (%j)', async (env) => {
    if (Object.keys(env).length && !fallbackReachable) return;
    const repo = await indexed(drawerRepo('root-oldmeta'));
    sqlite(db(repo), 'CREATE TABLE gm AS SELECT repo_root, src_root FROM graph_meta; DROP TABLE graph_meta; CREATE TABLE graph_meta (repo_root TEXT NOT NULL, src_root TEXT NOT NULL); INSERT INTO graph_meta SELECT repo_root, src_root FROM gm; DROP TABLE gm;');
    expect(rows(repo, "SELECT name FROM pragma_table_info('graph_meta');")).toEqual(['repo_root', 'src_root']);
    const q = await graphQuery(repo, db(repo), 'stats');
    expect(q.code, q.stderr).toBe(0);
    expect(q.stderr).toBe('');
    appendFileSync(join(repo, 'src/cart/store.ts'), '\nexport const touched = 1;\n');
    later(repo, 'src/cart/store.ts');
    const d = await astDocIndex(repo, ['--delta'], { env });
    expect(d.code, d.stderr).toBe(0);
    expect(rows(repo, "SELECT name FROM pragma_table_info('graph_meta');")).toEqual(['repo_root', 'src_root', 'docs_root']);
    expect(docsRoot(repo)).toBe('<null>');
    const f = await astDocIndex(repo, [], { env });
    expect(f.code, f.stderr).toBe(0);
    expect(docsRoot(repo)).toBe(DRAWER_DOCS);
  });
});

describe.skipIf(!sqliteFts5 || !compilerApi() || !sqliteAvailable())('the docs walk under a store driver', () => {
  it('[ast-doc-graph-p2] the corpus lives in the store, so the declared root holds no doc and the docs side is empty, its code indexed', async () => {
    const repo = stage('sqlite', 'root-store');
    const install = await exec('./.contexture/ctx', ['package', 'install', join(ROOT, 'plugins/docs-discipline')], { cwd: repo });
    expect(install.code, install.stdout + install.stderr).toBe(0);
    expect((await exec('./.contexture/ctx', ['docs', 'query', '--index'], { cwd: repo })).stdout).toContain('index complete: 1 entries');
    cpSync(join(FIXTURES, 'mini-repo/src'), join(repo, 'src'), { recursive: true });
    mkdirSync(join(repo, 'node_modules'));
    symlinkSync(TYPESCRIPT, join(repo, 'node_modules/typescript'));
    expect(existsSync(join(repo, DRAWER_DOCS))).toBe(false);
    const r = await astDocIndex(repo, ['--clean']);
    expect(r.code, r.stderr).toBe(0);
    for (const line of ['  DOCS: 0', '  RULES: 0', '  PITFALLS: 0']) expect(r.stdout.split('\n')).toContain(line);
    expect(count(db(repo), "SELECT count(*) FROM symbols WHERE qname = 'validateCart';")).toBe(1);
    expect(docsRoot(repo)).toBe(DRAWER_DOCS);
  });
});
