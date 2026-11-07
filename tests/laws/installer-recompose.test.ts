import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compose, count, layer, layerBytes, layerPath } from '../support/laws';
import { install, uninstall } from '../support/packages';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { firstByteDifference, put } from '../support/tree';

function lawPackage(): string {
  const pkg = join(sandbox('lawfix-catalog'), 'lawfix');
  const mod = join(pkg, '.contexture/extensions/modules/pkgfix');
  put(join(mod, 'module'), '# summary: the pkgfix law fixture module\n# version: 0.1.0\n# description:\n# A fixture module proving the installer recompose.\n');
  put(join(mod, 'laws'), '@append @laws\n  pkgfix-law: the installer fixture law\n');
  put(join(pkg, 'manifest'), '# summary: the law install fixture package\n# version: 0.1.0\n# kind: feature\n# part: module modules/pkgfix\n');
  return pkg;
}


describe.concurrent('the installer recompose', () => {
  it('[modules-r19] recomposes the layer when a law-bearing package installs, and restores it byte for byte when it uninstalls', async () => {
    const sb = stage('posix', 'laws-install');
    expect((await compose(sb)).code).toBe(0);
    const before = layerBytes(sb)!;
    const installed = await install(sb, lawPackage());
    expect(installed.code).toBe(0);
    expect(existsSync(join(sb, '.contexture/extensions/modules/pkgfix/module'))).toBe(true);
    expect(count(layer(sb), /^@module pkgfix$/)).toBe(1);
    expect(count(layer(sb), /^ {2}pkgfix-law: the installer fixture law$/)).toBe(1);
    expect(firstByteDifference(layerBytes(sb)!, before)).not.toBe(-1);
    expect(installed.stderr).toContain('compose: composed AGENTS.generated.md');
    expect((await compose(sb, '--check')).code).toBe(0);

    expect((await uninstall(sb, 'lawfix')).code).toBe(0);
    expect(existsSync(join(sb, '.contexture/extensions/modules/pkgfix/module'))).toBe(false);
    expect(count(layer(sb), /^@module pkgfix$/)).toBe(0);
    expect(layer(sb)).not.toContain('pkgfix-law');
    expect(firstByteDifference(layerBytes(sb)!, before)).toBe(-1);
  });

  it('[modules-r19] fails the install rc2 when the recompose refuses a duplicate law slug, leaving the layer untouched', async () => {
    const sb = stage('posix', 'laws-install-dup');
    expect((await compose(sb)).code).toBe(0);
    const before = layerBytes(sb)!;
    writeFileSync(join(sb, 'AGENTS.workspace.md'), '@append @laws\n  pkgfix-law: the overlay twin\n');
    const r = await install(sb, lawPackage());
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("duplicate law slug 'pkgfix-law'");
    expect(r.stderr).toContain('the law layer did not recompose');
    expect(firstByteDifference(layerBytes(sb)!, before)).toBe(-1);
  });

  it('[modules-r19] fails the install rc2 in a payload without the composer, naming the missing composer, the overlay and its record in place and no layer', async () => {
    const sb = stage('posix', 'laws-install-nocompose');
    rmSync(join(sb, '.contexture/laws/compose'));
    const r = await install(sb, lawPackage());
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('ctx: compose: missing composer: .contexture/laws/compose');
    expect(r.stderr).toContain('the law layer did not recompose');
    expect(existsSync(join(sb, '.contexture/extensions/modules/pkgfix/module'))).toBe(true);
    expect(existsSync(join(sb, '.contexture/extensions/.state/lawfix.files'))).toBe(true);
    expect(existsSync(layerPath(sb))).toBe(false);
  });
});
