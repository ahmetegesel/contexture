import { accessSync, constants, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { stage } from '../support/stage';

const bare = (): string => stage('posix', 'bare');
const runnable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
const modules = (help: string): string[] => {
  const at = help.indexOf('\nmodules:\n');
  return at < 0 ? [] : [...help.slice(at).matchAll(/^ {2}([a-z][a-z0-9-]*) /gm)].map((m) => m[1] ?? '');
};

describe.concurrent('the bare base: the no-plugin boot and help surface', () => {
  it('the stage carries no rhythms, docs, or plugins folder, and the storage core sits in it', () => {
    const sb = bare();
    for (const absent of ['.contexture/rhythms', 'docs', 'plugins']) expect(existsSync(join(sb, absent)), absent).toBe(false);
    expect(runnable(join(sb, '.contexture/storage/scripts/driver-resolver'))).toBe(true);
    expect(existsSync(join(sb, '.contexture/storage/scripts/library'))).toBe(true);
    expect(runnable(join(sb, '.contexture/storage/drivers/posix/driver'))).toBe(true);
  });

  it('[the-engine-r1, modules-r14] help lists the unit module, then the extension-root lane and rhythm modules, and never the storage core', async () => {
    const sb = bare();
    const help = await ctx(sb, 'help');
    expect(help.code).toBe(0);
    expect(modules(help.stdout)).toEqual(['unit', 'lane', 'rhythm']);
    const all = await ctx(sb, 'help', '--all');
    expect(all.code).toBe(0);
    expect(all.stdout).toContain('module unit:');
    expect(all.stdout).toContain('module lane:');
    expect(all.stdout).toContain('module rhythm:');
    expect(all.stdout).not.toContain('module storage:');
  });

  it('[the-engine-r1, the-engine-r4] the lane module dispatches from the extension root', async () => {
    const r = await ctx(bare(), 'lane', 'help');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('create');
  });

  it('[the-engine-r1, modules-r14] an absent extension root is silent and lists no extension module', async () => {
    const sb = bare();
    renameSync(join(sb, '.contexture/extensions'), join(sb, '.contexture/extensions.away'));
    const r = await ctx(sb, 'help');
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(modules(r.stdout)).toEqual(['unit']);
  });

  it('[the-engine-r5] ctx run answers its help, and docs and storage-fts5 are unknown without their plugins', async () => {
    const sb = bare();
    expect((await ctx(sb, 'run', '--help')).code).toBe(0);
    for (const name of ['docs', 'storage-fts5']) {
      const r = await ctx(sb, name, 'help');
      expect(r.code, name).toBe(1);
      expect(r.stderr).toBe(`ctx: unknown command: ${name}\n`);
    }
  });

  it('an empty drawer reads no units yet', async () => {
    const r = await ctx(bare(), 'unit', 'active');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('no units yet');
  });
});

describe.concurrent('the bare base: the rhythm index without rhythms (BG1)', () => {
  it('[modules-r20] an absent rhythms directory answers an empty index rc0 with no stderr', async () => {
    const r = await ctx(bare(), 'unit', 'index');
    expect({ code: r.code, stdout: r.stdout, stderr: r.stderr }).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('[modules-r20] an empty rhythms directory answers the same', async () => {
    const sb = bare();
    mkdirSync(join(sb, '.contexture/rhythms'));
    const r = await ctx(sb, 'unit', 'index');
    expect({ code: r.code, stdout: r.stdout, stderr: r.stderr }).toEqual({ code: 0, stdout: '', stderr: '' });
  });

  it('[modules-r20] an argument still refuses rc1 with the usage line', async () => {
    const r = await ctx(bare(), 'unit', 'index', 'extra');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^Usage: ctx unit index$/m);
  });
});

const CARD = {
  driver: 'posix',
  version: '3.0.0',
  contract: '3',
  store: ['list', 'get', 'put', 'delete', 'changes', 'batch', 'scan'],
  search_modes: ['exact'],
  optional: ['store', 'store.promote'],
};

describe('the bare base: the posix descriptor, the contract 3 store-only card', () => {
  it('[the-engine-r19, the-engine-r24] diagnose names posix with the exact card and a healthy store after a bootstrap; a planted card reads against it', async () => {
    const sb = bare();
    expect((await ctx(sb, 'unit', 'bootstrap', 'baseonly', 'the base-only probe unit')).code).toBe(0);
    const r = await ctx(sb, 'unit', 'diagnose', '--json');
    expect(r.code).toBe(0);
    const d = JSON.parse(r.stdout);
    expect(d.driver.name).toBe('posix');
    expect([d.storage.health, d.storage.store]).toEqual(['ok', 'present']);
    const card = d.driver.descriptor;
    expect(isDeepStrictEqual(card, CARD)).toBe(true);
    const missing = { ...card, store: card.store.filter((s: string) => s !== 'batch') };
    expect(missing.store).toHaveLength(6);
    expect(isDeepStrictEqual(missing, CARD)).toBe(false);
    expect(isDeepStrictEqual({ ...card, functions: ['session.list'] }, CARD)).toBe(false);
  });
});
