import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { newPkg, writeManifest } from '../support/packages';
import { stage } from '../support/stage';
import { put } from '../support/tree';

const ctx = (sb: string, args: string[]): Promise<Run> => exec('./.contexture/ctx', args, { cwd: sb });

// memoPkg: a package carrying a module named memo whose search verb answers one row naming
// the module by its installed folder, so an aliased install answers under its alias
function memoPkg(sb: string, name: string): string {
  const p = newPkg(sb, name);
  const dir = join(p, '.contexture/extensions/modules/memo');
  put(join(dir, 'module'), `# summary: the memo search fixture of ${name}\n# version: 1.0.0\n`);
  put(join(dir, 'scripts/search'), [
    '#!/bin/sh',
    '# summary: search the memos',
    'm=${CTX_MODULE_DIR##*/}',
    `printf '{"query":"needle","mode":"exact","total":1,"rows":[{"module":"%s","container":"%s/c","type":"memo","id":"one","address":"%s#c/one","snippet":"a needle","read":"ctx %s get c/one"}]}\\n' "$m" "$m" "$m" "$m"`,
    '',
  ].join('\n'), 0o755);
  writeManifest(p);
  return p;
}

describe('an aliased module in the help and the search fan-out', () => {
  it('[the-engine-r4, the-engine-r22] ctx help and the module table name an alias with its origin and package, the first token still the installed name, and stay silent when the record area cannot be read', async () => {
    const sb = stage('posix', 'alias-help');
    expect((await ctx(sb, ['package', 'install', memoPkg(sb, 'pkg-a')])).code).toBe(0);
    expect((await ctx(sb, ['package', 'install', '--as=memo=memo2', memoPkg(sb, 'pkg-b')])).code).toBe(0);
    const help = await ctx(sb, ['help']);
    expect([help.code, help.stderr]).toEqual([0, '']);
    expect(help.stdout).toMatch(/^ {2}memo2 +the memo search fixture of pkg-b \(alias of memo from package pkg-b\)$/m);
    expect(help.stdout).toMatch(/^ {2}memo +the memo search fixture of pkg-a$/m);
    const table = await ctx(sb, ['memo2', 'help']);
    expect(table.stdout.split('\n')[0]).toBe('ctx memo2: the memo search fixture of pkg-b (alias of memo from package pkg-b)');
    const state = join(sb, '.contexture/extensions/.state');
    chmodSync(state, 0o000);
    try {
      const blind = await ctx(sb, ['help']);
      expect([blind.code, blind.stderr]).toEqual([0, '']);
      expect(blind.stdout).toMatch(/^ {2}memo2 +the memo search fixture of pkg-b$/m);
    } finally {
      chmodSync(state, 0o755);
    }
  });

  it('[the-engine-r-ha7uc] the search group of an aliased module carries the alias key, its text header names the origin, and --module takes the installed name or, when no module holds it, the one alias of an origin', async () => {
    const sb = stage('posix', 'alias-search');
    expect((await ctx(sb, ['package', 'install', memoPkg(sb, 'pkg-a')])).code).toBe(0);
    expect((await ctx(sb, ['package', 'install', '--as=memo=memo2', memoPkg(sb, 'pkg-b')])).code).toBe(0);
    const all = await ctx(sb, ['search', 'needle', '--json']);
    expect(all.code).toBe(0);
    const groups = JSON.parse(all.stdout).groups as { module: string; alias?: string; status: string; rows?: { module: string }[] }[];
    const memo = groups.find((g) => g.module === 'memo');
    const memo2 = groups.find((g) => g.module === 'memo2');
    expect(memo && 'alias' in memo).toBe(false);
    expect([memo2?.alias, memo2?.status, memo2?.rows?.[0]?.module]).toEqual(['memo', 'ok', 'memo2']);
    expect(Object.keys(memo2 ?? {}).slice(0, 3)).toEqual(['module', 'alias', 'status']);
    const text = await ctx(sb, ['search', 'needle', '--module=memo2']);
    expect(text.stdout.split('\n')[0]).toBe('memo2 (alias of memo): 1 of 1');
    const named = JSON.parse((await ctx(sb, ['search', 'needle', '--module=memo', '--json'])).stdout).groups.map((g: { module: string }) => g.module);
    expect(named).toEqual(['memo']);
    expect((await ctx(sb, ['package', 'uninstall', 'pkg-a'])).code).toBe(0);
    const byOrigin = JSON.parse((await ctx(sb, ['search', 'needle', '--module=memo', '--json'])).stdout).groups.map((g: { module: string; alias?: string }) => `${g.module} ${g.alias}`);
    expect(byOrigin).toEqual(['memo2 memo']);
    expect((await ctx(sb, ['package', 'install', '--as=memo=memo3', memoPkg(sb, 'pkg-c')])).code).toBe(0);
    const twice = await ctx(sb, ['search', 'needle', '--module=memo']);
    expect([twice.code, twice.stdout, twice.stderr]).toEqual([1, '', 'ctx search: module memo is installed under several aliases (memo2 memo3); name one\n']);
  });
});
