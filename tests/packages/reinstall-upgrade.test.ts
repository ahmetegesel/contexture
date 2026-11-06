import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { addFile, addModule, extPath, installPkg, newPkg, out, recordText } from '../support/packages';
import { stage } from '../support/stage';
import { put } from '../support/tree';

async function installed(): Promise<{ sb: string; pa: string }> {
  const sb = stage('posix', 'pkg-upgrade');
  const pa = newPkg(sb, 'pkga');
  addModule(pa, 'alpha', 'docs');
  addFile(pa, 'rhythms/alpha.md', 'the alpha rhythm');
  expect((await installPkg(sb, pa)).code).toBe(0);
  return { sb, pa };
}

describe.concurrent('package-install: the re-install is an update (the-engine-r22, modules-r15)', () => {
  it('an upgrade lands the new files, removes the stale unchanged one, and records the package version and kind', async () => {
    const { sb, pa } = await installed();
    const alpha = join(pa, '.contexture/extensions/modules/alpha');
    put(join(alpha, 'module'), '# summary: the alpha fixture module, updated\n# version: 9.9.9\n# description:\n# The updated fixture module.\n');
    put(join(alpha, 'scripts/bye'), '#!/bin/sh\n# summary: say bye from alpha\necho "bye from alpha"\n', 0o755);
    rmSync(join(pa, '.contexture/extensions/rhythms/alpha.md'));
    addFile(pa, 'rhythms/beta.md', 'the beta rhythm');
    expect((await installPkg(sb, pa, '1.1.0')).code).toBe(0);
    expect((await ctx(sb, 'help')).stdout).toContain('the alpha fixture module, updated');
    expect(out(await ctx(sb, 'alpha', 'bye'))).toBe('bye from alpha');
    expect(existsSync(extPath(sb, 'rhythms/alpha.md'))).toBe(false);
    expect(existsSync(extPath(sb, 'rhythms/beta.md'))).toBe(true);
    const rec = recordText(sb, 'pkga');
    expect(rec).toContain('version 1.1.0');
    expect(rec).toContain('kind feature');
    expect(rec).not.toContain('rhythms/alpha.md');
  });

  it('a re-install that drops a changed file preserves it, reports it, and keeps it recorded', async () => {
    const { sb, pa } = await installed();
    addFile(pa, 'rhythms/keep.md', 'the kept rhythm');
    expect((await installPkg(sb, pa)).code).toBe(0);
    writeFileSync(extPath(sb, 'rhythms/keep.md'), 'locally edited\n');
    rmSync(join(pa, '.contexture/extensions/rhythms/keep.md'));
    const r = await installPkg(sb, pa);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('preserved .contexture/extensions/rhythms/keep.md');
    expect(readFileSync(extPath(sb, 'rhythms/keep.md'), 'utf8')).toBe('locally edited\n');
    expect(recordText(sb, 'pkga')).toContain('rhythms/keep.md');
  });

  it('an upgrade dropping a whole module prunes its emptied folders, so a later re-add installs and dispatches', async () => {
    const { sb, pa } = await installed();
    addModule(pa, 'gamma');
    expect((await installPkg(sb, pa)).code).toBe(0);
    rmSync(join(pa, '.contexture/extensions/modules/gamma'), { recursive: true });
    expect((await installPkg(sb, pa)).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/gamma'))).toBe(false);
    addModule(pa, 'gamma');
    expect((await installPkg(sb, pa)).code).toBe(0);
    expect(out(await ctx(sb, 'gamma', 'hello'))).toBe('hello from gamma');
  });
});
