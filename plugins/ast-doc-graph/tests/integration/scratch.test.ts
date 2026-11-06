import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mktempPlant } from '@support/plants';
import { sandbox } from '@support/sandbox';
import { astDocIndex, docsRepo, sqliteFts5 } from '../support/graph';

const DOC = 'docs/orders/order-flow.md';

const listing = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).sort() : ['<absent>']);

function madeFolders(label: string): { env: Record<string, string>; folders: () => string[] } {
  const mark = join(sandbox(`${label}-mark`), 'made');
  return {
    env: mktempPlant(`printf '%s\\n' "$p" >> "${mark}"`),
    folders: () => (existsSync(mark) ? readFileSync(mark, 'utf8').trim().split('\n') : []),
  };
}

function editLater(repo: string): void {
  const path = join(repo, DOC);
  appendFileSync(path, '\n');
  const later = new Date(statSync(join(repo, 'graph.db')).mtimeMs + 10_000);
  utimesSync(path, later, later);
}

async function fullThenDelta(repo: string, env: Record<string, string>): Promise<void> {
  const full = await astDocIndex(repo, ['--clean'], { env });
  expect(full.code, full.stderr).toBe(0);
  expect(full.stdout).toContain('DOCS: 1');
  editLater(repo);
  const delta = await astDocIndex(repo, ['--delta'], { env });
  expect(delta.code, delta.stderr).toBe(0);
  expect(delta.stdout).toContain('UPDATED_DOCS: 1');
}

describe.skipIf(!sqliteFts5)('the index stages its intermediate streams in one per-run folder', { concurrent: true }, () => {
  it("[ast-doc-graph-r4] a full and a delta index each use a fresh folder inside the drawer's .contexture/tmp, remove it, and keep no cache", async () => {
    const repo = docsRepo('scratch-drawer');
    const made = madeFolders('scratch-drawer');
    await fullThenDelta(repo, made.env);
    const folders = made.folders();
    expect(folders).toHaveLength(2);
    for (const f of folders) {
      expect(dirname(f)).toBe(join(repo, '.contexture/tmp'));
      expect(existsSync(f)).toBe(false);
    }
    expect(listing(join(repo, '.contexture'))).toEqual(['tmp']);
    expect(listing(join(repo, '.contexture/tmp'))).toEqual([]);
  });

  it('[ast-doc-graph-r4, the-engine-r20] with CTX_SCRATCH_ROOT set, each run makes its folder inside that root, never the root itself, and leaves the root and the repository as found', async () => {
    const repo = docsRepo('scratch-root');
    const root = sandbox('scratch-verb-root');
    writeFileSync(join(root, 'keep'), 'the parent verb\n');
    const made = madeFolders('scratch-root');
    await fullThenDelta(repo, { ...made.env, CTX_SCRATCH_ROOT: root });
    const folders = made.folders();
    expect(folders).toHaveLength(2);
    for (const f of folders) {
      expect(dirname(f)).toBe(root);
      expect(existsSync(f)).toBe(false);
    }
    expect(listing(root)).toEqual(['keep']);
    expect(listing(join(repo, '.contexture'))).toEqual(['tmp']);
    expect(listing(join(repo, '.contexture/tmp'))).toEqual([]);
  });

  it.each<[string, (sb: string, repo: string) => Record<string, string>]>([
    ['CTX_SCRATCH_ROOT under a regular file', (sb, repo) => {
      mkdirSync(join(repo, '.contexture/tmp'), { recursive: true });
      writeFileSync(join(sb, 'file'), '');
      return { CTX_SCRATCH_ROOT: join(sb, 'file/root') };
    }],
    ["the drawer's .contexture/tmp held by a regular file", (_sb, repo) => {
      mkdirSync(join(repo, '.contexture'), { recursive: true });
      writeFileSync(join(repo, '.contexture/tmp'), '');
      return {};
    }],
  ])('[ast-doc-graph-r4, ast-doc-graph-r5] a scratch folder it cannot make refuses rc 2 naming it, before the database: %s', async (_case, plant) => {
    const sb = sandbox('scratch-unmade');
    const cwd = sandbox('scratch-unmade-cwd');
    const repo = docsRepo('scratch-unmade-repo');
    const env = plant(sb, repo);
    const base = env.CTX_SCRATCH_ROOT ?? join(repo, '.contexture/tmp');
    const r = await astDocIndex(repo, ['--clean'], { cwd, env });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`cannot create a scratch folder inside ${base}`);
    expect(existsSync(join(repo, 'graph.db'))).toBe(false);
  });

  it('[ast-doc-graph-r3, ast-doc-graph-r5] a repository root that holds no .contexture refuses rc 1 naming the need, before any write', async () => {
    const cwd = sandbox('drawer-none-cwd');
    const repo = docsRepo('drawer-none');
    const r = await astDocIndex(repo, ['--clean'], { cwd });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ast-doc-index runs inside a contexture drawer: run it through ctx (ctx ast-doc-graph index), or from a repository root that holds its .contexture folder');
    expect(listing(repo)).toEqual(['docs']);
    expect(listing(join(cwd, '.contexture/tmp'))).toEqual([]);
  });

  it("[ast-doc-graph-r3, ast-doc-graph-r4] under ctx the drawer is CTX_ROOT: a repository without its own .contexture indexes, its folder inside CTX_ROOT's .contexture/tmp, made when absent", async () => {
    const cwd = sandbox('drawer-ctx-cwd');
    const drawer = sandbox('drawer-ctx-root');
    mkdirSync(join(drawer, '.contexture'));
    const repo = docsRepo('drawer-ctx');
    const made = madeFolders('drawer-ctx');
    const r = await astDocIndex(repo, ['--clean'], { cwd, env: { ...made.env, CTX_ROOT: drawer } });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('DOCS: 1');
    expect(made.folders().map(dirname)).toEqual([join(drawer, '.contexture/tmp')]);
    expect(listing(join(drawer, '.contexture/tmp'))).toEqual([]);
    expect(listing(repo)).toEqual(['docs', 'graph.db']);
  });

  it('[ast-doc-graph-r3, ast-doc-graph-r5] a CTX_ROOT that holds no .contexture refuses rc 1 naming it, before any write', async () => {
    const cwd = sandbox('drawer-stray-cwd');
    const stray = sandbox('drawer-stray-root');
    const repo = docsRepo('drawer-stray');
    const r = await astDocIndex(repo, ['--clean'], { cwd, env: { CTX_ROOT: stray } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`CTX_ROOT names ${stray}, which holds no .contexture folder`);
    expect(listing(stray)).toEqual([]);
    expect(listing(repo)).toEqual(['docs']);
  });

  it('[ast-doc-graph-r4] a caller-named --cache-dir keeps the streams after the run and no per-run folder is made', async () => {
    const repo = docsRepo('scratch-cache-dir');
    const cache = join(sandbox('scratch-cache'), 'streams');
    const made = madeFolders('scratch-cache-dir');
    const r = await astDocIndex(repo, ['--clean', '--cache-dir', cache], { env: made.env });
    expect(r.code, r.stderr).toBe(0);
    expect(listing(cache)).toEqual(['docs.jsonl', 'edges.jsonl', 'md_files.txt', 'pitfalls.jsonl', 'rules.jsonl', 'symbols.jsonl', 'ts_files.txt']);
    expect(made.folders()).toEqual([]);
    expect(listing(join(repo, '.contexture'))).toEqual(['tmp']);
  });
});
