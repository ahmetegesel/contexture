import { cpSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '@support/exec';
import { stage } from '@support/stage';
import { MODULE, PLUGIN } from '../support/corpus';

// the docs module installed under the alias corpus: its part hook, its unit hooks, and its
// search rows reach the module by its installed name, so the alias needs no change in its code
let ws: string;
const ctx = (args: readonly string[]): Promise<Run> => exec('./.contexture/ctx', args, { cwd: ws, env: { GIT_CEILING_DIRECTORIES: dirname(ws) } });

let installed: Run;
beforeAll(async () => {
  ws = stage('posix', 'docs-alias');
  installed = await ctx(['package', 'install', '--as=docs=corpus', PLUGIN]);
});

describe('the docs module installed under an alias', { concurrent: false }, () => {
  it('[modules-r13, modules-r15] the install hook seeds the corpus conventions through the alias', async () => {
    expect(installed.code, installed.stderr).toBe(0);
    expect(installed.stdout).toContain('docs install: seeded workspace conventions');
    expect((await ctx(['corpus', 'query', 'workspace', 'conventions'])).stdout).toContain('Universal workspace conventions');
  });

  it('[docs-module-r-yyfxd, the-engine-r-ha7uc] the search rows name the alias as their module, address owner, and read, so the alias group answers ok under ctx search', async () => {
    const r = await ctx(['search', 'Conventional Commits', '--module=corpus', '--json']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    const group = JSON.parse(r.stdout).groups[0] as { module: string; alias?: string; status: string; rows: { module: string; address: string; read: string }[] };
    expect([group.module, group.alias, group.status]).toEqual(['corpus', 'docs', 'ok']);
    const row = group.rows[0];
    expect(row?.module).toBe('corpus');
    expect(row?.address).toMatch(/^corpus#workspace\/conventions\//);
    expect(row?.read).toBe(`ctx corpus get ${row?.address.slice('corpus#'.length)}`);
    const read = await ctx(['corpus', 'get', row?.address.slice('corpus#'.length) ?? '']);
    expect([read.code, read.stdout]).toEqual([0, expect.stringContaining('Conventional Commits')]);
    const text = await ctx(['corpus', 'search', 'Conventional Commits']);
    expect(text.stdout.split('\n')[0]).toMatch(/^corpus search "Conventional Commits": \d+ match/);
    expect(text.stdout).toMatch(/^ {2}\S+ corpus#workspace\/conventions\//m);
    expect(text.stdout).toContain('read one: ctx corpus get <repo>/<slug>/<key> (the address after corpus#)');
    expect(text.stdout).not.toMatch(/docs#/);
  });

  it('[modules-r5, modules-r13] the unit hooks nudge through the alias: a task start and the load\'s last page nudge the task, no hook failing', async () => {
    expect((await ctx(['unit', 'bootstrap', 'alias-demo', 'the alias hook case'])).code).toBe(0);
    expect((await ctx(['unit', 'task', 'add', 'alias-demo', 'alias-task', '--objective=Run the alias case'])).code).toBe(0);
    const start = await ctx(['unit', 'task', 'start', 'alias-demo', 'alias-task']);
    expect(start.code, start.stderr).toBe(0);
    expect(start.stderr).not.toMatch(/hook failed|unknown command/);
    expect(start.stdout).toContain("[CONTEXT NUDGE: Task 'alias-task']");
    let last: Run | undefined;
    for (let page = 1; page <= 20 && !last?.stdout.includes('load complete:'); page++) {
      last = await ctx(['unit', 'load', 'alias-demo', String(page)]);
      expect(last.stderr).not.toMatch(/hook failed|unknown command/);
    }
    expect(last?.stdout).toContain("[CONTEXT NUDGE: Task 'alias-task']");
  });

  it('[modules-r10, modules-r15] a plain docs installed beside the alias keeps its own store: its install seeds its own conventions, and a removal through it never reaches the alias', async () => {
    const copy = join(ws, 'catalog/docs-copy');
    cpSync(MODULE, join(copy, '.contexture/extensions/modules/docs'), { recursive: true, filter: (src) => src !== join(MODULE, 'laws') });
    cpSync(join(PLUGIN, 'docs/workspace/conventions.md'), join(copy, 'docs/workspace/conventions.md'));
    writeFileSync(join(copy, 'manifest'), '# summary: a module only copy of the docs module\n# version: 1.0.0\n# kind: feature\n# part: module modules/docs\n');
    const plain = await ctx(['package', 'install', copy]);
    expect(plain.code, plain.stderr).toBe(0);
    expect(plain.stdout).toContain('docs install: seeded workspace conventions');
    expect(plain.stdout).not.toContain('already present');
    expect(existsSync(join(ws, 'corpus/workspace/conventions.md'))).toBe(true);
    expect(existsSync(join(ws, 'docs/workspace/conventions.md'))).toBe(true);
    expect((await ctx(['docs', 'remove', 'workspace', 'conventions'])).code).toBe(0);
    expect((await ctx(['docs', 'query', 'workspace', 'conventions'])).code).toBe(1);
    expect((await ctx(['corpus', 'query', 'workspace', 'conventions'])).stdout).toContain('Universal workspace conventions');
  });
});
