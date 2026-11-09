import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addFile, addModule, extPath, install, installPkg, isExec, newPkg, recordPath, recordText, uninstall, writeManifest } from '../support/packages';
import { chmodPlant, ROOT_USER } from '../support/plants';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-overlay');
const files = (state: string): string => state.split('\n').filter((l) => !l.includes('/ ')).join('\n');

describe.concurrent('package-install: the overlay, the record, and the modes', () => {
  it.skipIf(ROOT_USER)('[the-engine-r22, modules-r15] a read-only extension root refuses rc2 and writes nothing; a writable one installs', async ({ onTestFinished }) => {
    const sb = sandbox();
    const ro = newPkg(sb, 'pkgro');
    addModule(ro, 'ro');
    mkdirSync(extPath(sb), { recursive: true });
    chmodPlant(extPath(sb), 0o555, 0o755, onTestFinished);
    const before = treeState(extPath(sb));
    const r = await installPkg(sb, ro);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('not writable');
    expect(treeState(extPath(sb))).toBe(before);
    expect(existsSync(extPath(sb, 'modules/ro/module'))).toBe(false);
    chmodSync(extPath(sb), 0o755);
    expect((await install(sb, ro)).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/ro/module'))).toBe(true);
    expect((await uninstall(sb, ro)).code).toBe(0);
  });

  it('[the-engine-r22, modules-r15, plugins-r1] installs only the extension tree, records paths, modes, and law fragments, and keeps the modes', async () => {
    const sb = sandbox();
    const pa = newPkg(sb, 'pkga');
    addModule(pa, 'alpha', 'docs');
    addFile(pa, 'rhythms/alpha.md', 'the alpha rhythm');
    const r = await installPkg(sb, pa);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('installed pkga');
    for (const f of ['module', 'laws', 'data']) expect(existsSync(extPath(sb, `modules/alpha/${f}`))).toBe(true);
    expect(isExec(extPath(sb, 'modules/alpha/scripts/hello'))).toBe(true);
    expect(isExec(extPath(sb, 'modules/alpha/module'))).toBe(false);
    for (const meta of ['AGENTS.workspace.md', 'README.md', 'docs/workspace/conventions.md', 'tests']) expect(existsSync(join(sb, meta))).toBe(false);
    const rec = recordText(sb, 'pkga');
    expect(rec).toContain('package pkga');
    expect(rec).toContain('version 1.0.0');
    expect(rec).toContain('file rwxr-xr-x ');
    expect(rec).toContain('file rw-r--r-- ');
    expect(rec).toContain('law .contexture/extensions/modules/alpha/laws');
  });
});

describe.concurrent('package-install: the six package shapes', () => {
  it('[modules-r16, plugins-r9] a module-only feature package installs and records its kind', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-module');
    addModule(p, 'shaped');
    expect((await installPkg(sb, p)).code).toBe(0);
    expect(recordText(sb, 'shape-module')).toContain('kind feature');
  });

  it('[modules-r16, plugins-r9] a module, laws, and rhythms package lands its module and rhythm and no templates folder', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-docs');
    addModule(p, 'shapedocs');
    addFile(p, 'rhythms/shapedocs.md', 'a shaped rhythm');
    expect((await installPkg(sb, p)).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/shapedocs/module'))).toBe(true);
    expect(existsSync(extPath(sb, 'rhythms/shapedocs.md'))).toBe(true);
    expect(existsSync(extPath(sb, 'templates'))).toBe(false);
  });

  it('[modules-r16, plugins-r9, the-engine-r23] a driver package records its kind and driver name and lands the driver executable', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-driver');
    addFile(p, 'storage/drivers/shapedrv/driver', '#!/bin/sh\nexit 0', 0o755);
    expect((await installPkg(sb, p)).code).toBe(0);
    const rec = recordText(sb, 'shape-driver');
    expect(rec).toContain('kind driver');
    expect(rec).toContain('driver shapedrv');
    expect(isExec(extPath(sb, 'storage/drivers/shapedrv/driver'))).toBe(true);
  });

  it('[modules-r16, plugins-r9] a filters-only package lands its filter part', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-filters');
    addFile(p, 'modules/shapefilters/filters/shape.awk', '#!/usr/bin/awk -f\n# command: ^shapefilters$\n# format-only: shape\n{ print "SHAPED" }', 0o755);
    expect((await installPkg(sb, p)).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/shapefilters/filters/shape.awk'))).toBe(true);
  });

  it('[modules-r16, plugins-r9] a rhythms-only package lands its rhythm part', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-rhythms');
    addFile(p, 'rhythms/shaped-ritual.md', 'a shaped-only rhythm');
    expect((await installPkg(sb, p)).code).toBe(0);
    expect(existsSync(extPath(sb, 'rhythms/shaped-ritual.md'))).toBe(true);
  });

  it('[modules-r16, plugins-r9] a laws-only package lands and records its law fragment', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-laws');
    addFile(p, 'laws/shaped.law', '@append @laws\n  shaped-law: a shaped-only law');
    expect((await installPkg(sb, p)).code).toBe(0);
    expect(existsSync(extPath(sb, 'laws/shaped.law'))).toBe(true);
    expect(recordText(sb, 'shape-laws')).toContain('law .contexture/extensions/laws/shaped.law');
  });
});

describe.concurrent('package-install: the mid-write rollback and the payload path rules (N14, N15)', () => {
  it.skipIf(ROOT_USER)('N14 [the-engine-r22, modules-r15]: an update whose later move fails restores every moved file and the record, rc2', async ({ onTestFinished }) => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgrb');
    addModule(p, 'alpha');
    addFile(p, 'rhythms/x.md', 'the x rhythm');
    expect((await installPkg(sb, p)).code).toBe(0);
    put(join(p, '.contexture/extensions/modules/alpha/module'), '# summary: the alpha fixture module, updated\n# version: 2.0.0\n');
    addFile(p, 'rhythms/x.md', 'the x rhythm, updated');
    writeManifest(p, '2.0.0');
    chmodPlant(extPath(sb, 'rhythms'), 0o555, 0o755, onTestFinished);
    const before = treeState(extPath(sb));
    const r = await install(sb, p);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('cannot install rhythms/x.md');
    expect(treeState(extPath(sb))).toBe(before);
    expect(recordText(sb, 'pkgrb')).toContain('version 1.0.0');
  });

  it.skipIf(ROOT_USER)('N14 [the-engine-r22, modules-r15]: a fresh install whose later move fails removes every moved file and writes no record, rc2', async ({ onTestFinished }) => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgrb');
    addModule(p, 'alpha');
    addFile(p, 'rhythms/x.md', 'the x rhythm');
    mkdirSync(extPath(sb, 'rhythms'), { recursive: true });
    chmodPlant(extPath(sb, 'rhythms'), 0o555, 0o755, onTestFinished);
    const before = treeState(extPath(sb));
    const r = await installPkg(sb, p);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('cannot install rhythms/x.md');
    expect(existsSync(recordPath(sb, 'pkgrb'))).toBe(false);
    expect(files(treeState(extPath(sb)))).toBe(files(before));
  });

  it.skipIf(ROOT_USER)('N14 [the-engine-r22, modules-r15]: a failed fresh install leaves no folder of its own, so the package installs once the fault is gone', async ({ onTestFinished }) => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgrb');
    addModule(p, 'alpha');
    addFile(p, 'rhythms/x.md', 'the x rhythm');
    mkdirSync(extPath(sb, 'rhythms'), { recursive: true });
    chmodPlant(extPath(sb, 'rhythms'), 0o555, 0o755, onTestFinished);
    const before = treeState(extPath(sb));
    expect((await installPkg(sb, p)).code).toBe(2);
    expect(treeState(extPath(sb))).toBe(before);
    chmodSync(extPath(sb, 'rhythms'), 0o755);
    const again = await install(sb, p);
    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toContain('installed pkgrb');
  });

  it.skipIf(ROOT_USER)('N14 [the-engine-r22, modules-r15]: a payload file that cannot be staged refuses rc2 and leaves the extension tree as it was', async ({ onTestFinished }) => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgrb');
    addModule(p, 'alpha');
    addFile(p, 'rhythms/x.md', 'the x rhythm');
    writeManifest(p);
    chmodPlant(join(p, '.contexture/extensions/rhythms/x.md'), 0o000, 0o644, onTestFinished);
    const before = treeState(extPath(sb));
    const r = await install(sb, p);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('cannot stage rhythms/x.md');
    expect(treeState(extPath(sb))).toBe(before);
  });

  it('N15 [modules-r15]: a payload path carrying a blank refuses rc1 and writes nothing', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgblank');
    addFile(p, 'rhythms/a b.md', 'a blank in the name');
    const before = treeState(extPath(sb));
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("malformed payload path 'rhythms/a b.md' (no blanks or control characters)");
    expect(treeState(extPath(sb))).toBe(before);
  });
});
