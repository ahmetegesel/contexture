import { appendFileSync, copyFileSync, mkdirSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { sqlite } from '@support/sqlite';
import { astDocIndex, compilerApi, count, docsRepo, fallbackReachable, graphQuery, miniRepo, MODULE, NO_NODE_SQLITE, sqliteFts5, TYPESCRIPT } from '../support/graph';

const db = (sb: string) => join(sb, 'graph.db');

function edit(sb: string, rel: string, text: string): void {
  const path = join(sb, rel);
  appendFileSync(path, text);
  const later = new Date(statSync(db(sb)).mtimeMs + 10_000);
  utimesSync(path, later, later);
}

const hasSymbol = (sb: string, qname: string) => count(db(sb), `SELECT count(*) FROM symbols WHERE qname = '${qname}';`) === 1;

describe.skipIf(!sqliteFts5 || !compilerApi())('the delta index and the just-in-time freshness', { concurrent: true }, () => {
  async function indexedMini(): Promise<string> {
    const sb = miniRepo('mini-delta');
    const r = await astDocIndex(sb, ['--clean']);
    if (r.code !== 0) throw new Error(`ast-doc-index: rc ${r.code}: ${r.stderr}`);
    return sb;
  }

  it('VP11 [ast-doc-graph-r1, ast-doc-graph-r6] --delta on one file adds its new symbol, keeps an unrelated one, and refreshes its indexed_files row', async () => {
    const sb = await indexedMini();
    const before = sqlite(db(sb), "SELECT mtime FROM indexed_files WHERE file = 'src/orders/validate.ts';").trim();
    edit(sb, 'src/orders/validate.ts', '\nexport function checkCart(cart: Cart): boolean {\n  return validateCart(cart);\n}\n');
    const r = await astDocIndex(sb, ['--delta', 'src/orders/validate.ts']);
    expect(r.code, r.stderr).toBe(0);
    expect(hasSymbol(sb, 'checkCart')).toBe(true);
    expect(hasSymbol(sb, 'CartStore.save')).toBe(true);
    expect(sqlite(db(sb), "SELECT mtime FROM indexed_files WHERE file = 'src/orders/validate.ts';").trim()).not.toBe(before);
  });

  it('VP12 [ast-doc-graph-r16] a query micro-syncs one dirty file before it answers', async () => {
    const sb = await indexedMini();
    edit(sb, 'src/cart/store.ts', '\nexport function emptyCart(): number[] {\n  return [];\n}\n');
    expect(hasSymbol(sb, 'emptyCart')).toBe(false);
    const r = await graphQuery(sb, db(sb), 'symbol', 'emptyCart');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('LOCATION: src/cart/store.ts:');
    expect(hasSymbol(sb, 'emptyCart')).toBe(true);
  });

  it('VP13 [ast-doc-graph-r16] three dirty files print the advisory and sync nothing', async () => {
    const sb = await indexedMini();
    edit(sb, 'src/cart/store.ts', '\nexport const one = 1;\n');
    edit(sb, 'src/orders/price.ts', '\nexport const two = 2;\n');
    edit(sb, 'src/orders/validate.ts', '\nexport const three = 3;\n');
    const r = await graphQuery(sb, db(sb), 'stats');
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('[ast-doc-graph: 3 files modified since last index. Run ast-doc-index --delta to refresh]');
    expect(hasSymbol(sb, 'one')).toBe(false);
  });

  it('[ast-doc-graph-r16] null check: a clean graph prints no advisory and syncs nothing', async () => {
    const sb = await indexedMini();
    const r = await graphQuery(sb, db(sb), 'stats');
    expect([r.code, r.stderr]).toEqual([0, '']);
  });

  it.skipIf(!fallbackReachable)('[ast-doc-graph-r6] a delta on the sqlite3 command fallback keeps the derived edges the built-in delta keeps, prints the same summary, and applies the schema (needs a node that NODE_OPTIONS=--no-experimental-sqlite keeps from loading node:sqlite)', async () => {
    const [builtIn, fallback] = await Promise.all([indexedMini(), indexedMini()]);
    sqlite(db(fallback), 'DROP INDEX idx_edges_kind;');
    const runs = await Promise.all(
      [[builtIn, {}], [fallback, NO_NODE_SQLITE]].map(([sb, env]) => {
        edit(sb as string, 'src/orders/validate.ts', '\n');
        return astDocIndex(sb as string, ['--delta', 'src/orders/validate.ts'], { env: env as Record<string, string> });
      }),
    );
    for (const r of runs) expect(r.code, r.stderr).toBe(0);
    const edges = (sb: string) => sqlite(db(sb), 'SELECT kind, source, target FROM edges ORDER BY kind, source, target;');
    expect(edges(fallback)).toBe(edges(builtIn));
    expect(count(db(fallback), "SELECT count(*) FROM edges e JOIN symbols s ON s.id = e.target WHERE e.kind IN ('GOVERNS', 'COVERS') AND s.qname = 'validateCart';")).toBe(2);
    expect(count(db(fallback), "SELECT count(*) FROM sqlite_master WHERE name = 'idx_edges_kind';")).toBe(1);
    const summary = (out: string) => out.split('\n').filter((l) => !l.startsWith('  DATABASE: '));
    expect(summary(runs[1].stdout)).toEqual(summary(runs[0].stdout));
  });
});

describe.skipIf(!sqliteFts5 || !compilerApi() || !fallbackReachable)('a wide graph on the sqlite3 command fallback (needs a node that NODE_OPTIONS=--no-experimental-sqlite keeps from loading node:sqlite)', { concurrent: true }, () => {
  it('[ast-doc-graph-r6, ast-doc-graph-r9] a delta reads the whole graph past 1 MB, so a bare name two methods carry stays ambiguous and governs neither, as on the built-in branch', async () => {
    const repo = sandbox('fallback-wide');
    mkdirSync(join(repo, 'node_modules'));
    symlinkSync(TYPESCRIPT, join(repo, 'node_modules/typescript'));
    mkdirSync(join(repo, 'src/a'), { recursive: true });
    mkdirSync(join(repo, 'src/b'));
    mkdirSync(join(repo, 'docs/workspace'), { recursive: true });
    writeFileSync(join(repo, 'src/a/run.ts'), 'export class A {\n  runWork(): number {\n    return 1;\n  }\n}\n');
    writeFileSync(join(repo, 'src/b/run.ts'), 'export class B {\n  runWork(): number {\n    return 2;\n  }\n}\n');
    writeFileSync(join(repo, 'docs/workspace/wide.md'), '@doc structural wide\n  repo: workspace\n  description: "wide probe"\n  sources: [lib/**]\n  keywords: [wide]\n@contract\n  - rule: "runWork stays ambiguous"\n    evidence: "runWork"\n');
    const full = await astDocIndex(repo, ['--clean']);
    expect(full.code, full.stderr).toBe(0);
    sqlite(db(repo), `WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < 4999) INSERT INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring) SELECT 'sym:src/pad/pad.ts:pad' || i, 'pad' || i, 'pad' || i, 'function', 'src/pad/pad.ts', 1, 2, NULL, '${'a padding docstring '.repeat(15)}' FROM n; PRAGMA wal_checkpoint(TRUNCATE);`);
    const fallback = join(sandbox('fallback-wide-db'), 'graph.db');
    copyFileSync(db(repo), fallback);
    edit(repo, 'src/b/run.ts', '\n');
    for (const [target, env] of [[db(repo), {}], [fallback, NO_NODE_SQLITE]] as const) {
      const r = await exec(join(MODULE, 'bin/ast-doc-index'), ['--repo-root', repo, '--db', target, '--delta', 'src/b/run.ts'], { cwd: repo, env });
      expect(r.code, r.stderr).toBe(0);
    }
    const governs = (target: string) => sqlite(target, "SELECT source || ' ' || target FROM edges WHERE kind = 'GOVERNS' ORDER BY 1;");
    expect(governs(db(repo))).toBe('');
    expect(governs(fallback)).toBe('');
  });
});

describe.skipIf(!sqliteFts5)('a failed inline delta', { concurrent: true }, () => {
  it('[ast-doc-graph-r16] prints one stderr line naming the failure and the delta to run, and the query answers rc 0 from the graph as it stands', async () => {
    const sb = docsRepo('sync-failed');
    const full = await astDocIndex(sb, ['--clean']);
    expect(full.code, full.stderr).toBe(0);
    edit(sb, 'docs/orders/order-flow.md', '\n');
    const stray = sandbox('sync-failed-stray');
    const r = await exec(join(MODULE, 'bin/graph-query'), ['stats', '--db', db(sb)], { cwd: sb, env: { CTX_ROOT: stray } });
    expect(r.code).toBe(0);
    expect(r.stdout.split('\n')).toContain('  RULES: 2');
    expect(r.stderr).toBe(
      `[ast-doc-graph: the inline delta index failed (rc 1: Error: ast-doc-index runs inside a contexture drawer: CTX_ROOT names ${stray}, which holds no .contexture folder); answering from the graph as it stands. Run ast-doc-index --delta to refresh]\n`,
    );
  });
});
