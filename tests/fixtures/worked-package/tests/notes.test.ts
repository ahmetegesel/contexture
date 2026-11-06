import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx, ctxIn } from '../../../support/ctx';
import { extPath, out, recordPath, wrapper } from '../../../support/packages';
import { ROOT } from '../../../support/root';
import { fresh, seed } from '../../../support/snapshot';
import { stage } from '../../../support/stage';

const PACKAGE = join(ROOT, 'tests/fixtures/worked-package');
const pkgIn = (sb: string): string => join(sb, 'catalog/worked-package');

function catalog(sb: string): string {
  cpSync(PACKAGE, pkgIn(sb), { recursive: true });
  return pkgIn(sb);
}

let installed: string;
beforeAll(async () => {
  installed = await seed(async (sb) => {
    expect((await wrapper(sb, catalog(sb), 'install')).code).toBe(0);
  }, 'posix', 'worked-installed');
});

describe.concurrent('the worked example package: notes, from manifest to uninstall', () => {
  it('[modules-r18] the module and package manifests validate and read as authored', async () => {
    const sb = stage('posix', 'worked-manifests');
    const p = catalog(sb);
    const mod = join(p, '.contexture/extensions/modules/notes/module');
    expect((await ctx(sb, '_module', mod, 'validate')).code).toBe(0);
    expect(out(await ctx(sb, '_module', mod, 'summary'))).toBe('the worked example notes module: put, show, and keys over the module store');
    expect((await ctx(sb, '_module', mod, 'description')).stdout).toContain('worked example');
    expect((await ctx(sb, '_package', join(p, 'manifest'), 'validate')).code).toBe(0);
    expect(out(await ctx(sb, '_package', join(p, 'manifest'), 'kind'))).toBe('feature');
    expect(out(await ctx(sb, '_package', join(p, 'manifest'), 'parts'))).toBe('module modules/notes');
  });

  it('[modules-r18, modules-r13] the install lands the module, its laws, data, and part hook, lists it, and the hook seeds the welcome note through the verb', async () => {
    const sb = stage('posix', 'worked-install');
    const r = await wrapper(sb, catalog(sb), 'install');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('installed worked-package');
    for (const f of ['module', 'laws', 'data', 'install']) expect(existsSync(extPath(sb, `modules/notes/${f}`))).toBe(true);
    expect((await ctx(sb, 'help')).stdout).toContain('the worked example notes module');
    expect(r.stdout).toContain('seeded the welcome note');
    expect((await ctx(sb, 'notes', 'show', 'welcome/readme')).stdout).toContain('A note reaches the module store through the notes verbs');
  });

  it('[modules-r18] the verbs put, show, and list notes over the posix store and refuse a malformed key', async () => {
    const sb = fresh(installed);
    const put = await ctxIn(sb, 'the first test note\n', 'notes', 'put', 'demo/first');
    expect(put.code).toBe(0);
    expect(put.stdout).toBe('saved demo/first\n');
    expect(out(await ctx(sb, 'notes', 'show', 'demo/first'))).toBe('the first test note');
    const keys = (await ctx(sb, 'notes', 'keys')).stdout;
    expect(keys).toContain('"demo/first"');
    expect(keys).toContain('"welcome/readme"');
    expect(existsSync(join(sb, 'notes/demo/first'))).toBe(true);
    expect(readFileSync(join(sb, 'notes/demo/first'), 'utf8')).toBe('the first test note\n');
    const bad = await ctxIn(sb, 'x\n', 'notes', 'put', 'demo');
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('ERR_INVALID_ARGUMENT');
  });

  it('[modules-r18] a re-install never overwrites a present note', async () => {
    const sb = fresh(installed);
    expect((await ctxIn(sb, 'an edited welcome\n', 'notes', 'put', 'welcome/readme')).code).toBe(0);
    const r = await wrapper(sb, pkgIn(sb), 'install');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('already present; left unchanged');
    expect(out(await ctx(sb, 'notes', 'show', 'welcome/readme'))).toBe('an edited welcome');
  });

  it('[modules-r18] the uninstall removes the module and its record and leaves the store data', async () => {
    const sb = fresh(installed);
    expect((await ctxIn(sb, 'the first test note\n', 'notes', 'put', 'demo/first')).code).toBe(0);
    expect((await wrapper(sb, pkgIn(sb), 'uninstall')).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/notes/module'))).toBe(false);
    expect(existsSync(recordPath(sb, 'worked-package'))).toBe(false);
    expect(existsSync(join(sb, 'notes/demo/first'))).toBe(true);
    expect(readFileSync(join(sb, 'notes/demo/first'), 'utf8')).toBe('the first test note\n');
    expect((await ctx(sb, 'notes', 'show', 'demo/first')).code).toBe(1);
  });
});
