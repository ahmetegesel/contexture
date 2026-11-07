import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addFile, addModule, extPath, install, installPkg, newPkg, writeManifest } from '../support/packages';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-refuse');
const manifestText = (lines: readonly string[]): string => lines.map((l) => `# ${l}\n`).join('');

describe.concurrent('package-install: the manifest refusals at install', () => {
  it('[the-engine-r23, modules-r16] a package without a manifest refuses rc1 naming it', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkg-nomanifest');
    addModule(p, 'nomf');
    const r = await install(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('no package manifest');
  });

  it('[the-engine-r23, modules-r16] a manifest with requires refuses rc1 naming the rule', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkg-badmanifest');
    addModule(p, 'badmf');
    writeFileSync(join(p, 'manifest'), manifestText(['summary: x', 'version: 1.0.0', 'kind: feature', 'part: module modules/badmf', 'requires: base>=1']));
    const r = await install(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('requires is reserved and refused');
  });

  it('[the-engine-r23, modules-r16, modules-r15] a payload path outside the declared parts refuses rc1 naming it', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkg-uncovered');
    addModule(p, 'covered');
    writeManifest(p);
    addFile(p, 'extra/x', 'x');
    const r = await install(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('payload path outside the declared parts');
  });

  it('[the-engine-r23, modules-r16, modules-r15] a declared part that is absent refuses rc1 naming it', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkg-missingpart');
    addModule(p, 'missingpart');
    writeFileSync(join(p, 'manifest'), manifestText(['summary: missing part fixture', 'version: 1.0.0', 'kind: feature', 'part: module modules/missingpart', 'part: rhythms rhythms']));
    const r = await install(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('declared part is missing: rhythms rhythms');
  });

  it('[the-engine-r23, modules-r16, modules-r15] a module folder not declared as a module part refuses rc1 naming it', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkg-nomoduledecl');
    addModule(p, 'undeclared');
    writeFileSync(join(p, 'manifest'), manifestText(['summary: undeclared module fixture', 'version: 1.0.0', 'kind: feature', 'part: filters modules/undeclared']));
    const r = await install(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('is not declared as a module part');
  });

  it('[the-engine-r23, modules-r16, modules-r15] a feature package carrying a driver path refuses rc1 naming the mismatch', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkg-featuredriver');
    addFile(p, 'storage/drivers/hidden/driver', '#!/bin/sh\nexit 0', 0o755);
    writeFileSync(join(p, 'manifest'), manifestText(['summary: feature with a driver path', 'version: 1.0.0', 'kind: feature', 'part: laws storage/drivers/hidden/driver']));
    const r = await install(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('a feature package carries no driver part');
  });
});

describe.concurrent('package-install: the collision classes', () => {
  it('[modules-r15, the-engine-r22] a core path refuses rc1 and writes nothing there', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgcore');
    addFile(p, 'rhythms/core.md', 'the core-path fixture rhythm');
    put(join(p, '.contexture/modules/x/module'), '# summary: x\n');
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('core path refused');
    expect(existsSync(join(sb, '.contexture/modules/x'))).toBe(false);
  });

  it.each([
    ['the record root', 'units', 'u/state.md'],
    ['the law sources', 'laws', 'planted.md'],
  ])('[modules-r15, the-engine-r22] a package carrying %s refuses rc1 as a core path and writes nothing there', async (_, folder, file) => {
    const sb = sandbox();
    const p = newPkg(sb, `pkg-${folder}`);
    addFile(p, 'rhythms/core.md', 'the core-path fixture rhythm');
    put(join(p, '.contexture', folder, file), 'x\n');
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`core path refused: .contexture/${folder} (a package overlays .contexture/extensions/ only)`);
    expect(existsSync(join(sb, '.contexture', folder, file))).toBe(false);
  });

  it('[modules-r15, the-engine-r22] a path outside the extension root refuses rc1', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgout');
    addFile(p, 'rhythms/out.md', 'the outside-path fixture rhythm');
    put(join(p, '.contexture/other/x'), 'x\n');
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('outside the extension root');
  });

  it('[modules-r15, the-engine-r22] an existing non-recorded file refuses rc1 and keeps its bytes', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgex');
    addFile(p, 'rhythms/taken.md', 'the package rhythm');
    put(extPath(sb, 'rhythms/taken.md'), 'the workspace rhythm\n');
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('existing non-recorded file');
    expect(readFileSync(extPath(sb, 'rhythms/taken.md'), 'utf8')).toBe('the workspace rhythm\n');
  });

  it("[modules-r15, the-engine-r22] another package's file refuses rc1 naming the recording package and keeps its bytes", async () => {
    const sb = sandbox();
    const one = newPkg(sb, 'pkgshared1');
    addFile(one, 'rhythms/shared.md', 'from package one');
    expect((await installPkg(sb, one)).code).toBe(0);
    const two = newPkg(sb, 'pkgshared2');
    addFile(two, 'rhythms/shared.md', 'from package two');
    const r = await installPkg(sb, two);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("another package's file");
    expect(r.stderr).toContain('pkgshared1');
    expect(readFileSync(extPath(sb, 'rhythms/shared.md'), 'utf8')).toBe('from package one\n');
  });

  it.each([
    ['the unit builtin', 'pkgbuiltin', 'unit', 'collides with a builtin'],
    ['the lane builtin', 'pkgbuiltinlane', 'lane', 'collides with a builtin'],
    ['a reserved name', 'pkgreserved', 'refresh', 'reserved name'],
  ])('[modules-r15, modules-r14] a module named after %s refuses rc1 naming its class', async (_label, pkg, module, message) => {
    const sb = sandbox();
    const p = newPkg(sb, pkg);
    addModule(p, module);
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(message);
  });

  it('[modules-r15, modules-r14] a workspace module name refuses rc1 naming its class', async () => {
    const sb = sandbox();
    put(join(sb, '.contexture/modules/wsmod/module'), '# summary: a workspace fixture module\n');
    const p = newPkg(sb, 'pkgws');
    addModule(p, 'wsmod');
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('collides with a workspace module');
  });

  it('[modules-r15] a driver named posix refuses rc1 naming the core posix driver', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgdriver');
    addFile(p, 'storage/drivers/posix/driver', '#!/bin/sh\nexit 0', 0o755);
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('core posix driver');
  });

  it('[modules-r15, modules-r10] a namespace declared twice in one package refuses rc1', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgdupns');
    addModule(p, 'one', 'dupns');
    addModule(p, 'two', 'dupns');
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('more than one module');
  });

  it('[modules-r15, modules-r10] a namespace a workspace module declares refuses rc1 naming the owner', async () => {
    const sb = sandbox();
    put(join(sb, '.contexture/modules/wsns/module'), '# summary: a workspace namespace fixture\n');
    put(join(sb, '.contexture/modules/wsns/data'), 'namespace: taken\nkey: <a>/<b>\n');
    const p = newPkg(sb, 'pkgtaken');
    addModule(p, 'takenmod', 'taken');
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("declared by module 'wsns'");
  });

  it('[modules-r15] a malformed module manifest refuses rc1 naming the module', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgmalformed');
    put(join(p, '.contexture/extensions/modules/bad/module'), '# summary: a malformed manifest\n# requires: base>=1.0.0\n');
    put(join(p, '.contexture/extensions/modules/bad/scripts/x'), '#!/bin/sh\n# summary: x\necho x\n');
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("malformed module 'bad'");
  });
});

describe.concurrent('package-install: a driver name that already resolves ahead of the extension root (N16)', () => {
  it.each([
    ['the core', '.contexture/storage/drivers/fakedrv/driver', 'already resolves in the core'],
    ['the workspace', '.contexture/drivers/fakedrv/driver', 'already resolves in the workspace'],
    ['a module', '.contexture/modules/m/drivers/fakedrv', 'already resolves in a module'],
  ])('N16 [modules-r15]: a driver resolving in %s refuses rc1 and writes nothing', async (_label, ahead, message) => {
    const sb = sandbox();
    put(join(sb, ahead), '#!/bin/sh\nexit 0\n', 0o755);
    const p = newPkg(sb, 'pkgahead');
    addFile(p, 'storage/drivers/fakedrv/driver', '#!/bin/sh\nexit 0', 0o755);
    const before = treeState(extPath(sb));
    const r = await installPkg(sb, p);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`driver name 'fakedrv' ${message}`);
    expect(treeState(extPath(sb))).toBe(before);
  });

  it('N16 [modules-r15]: null check: with nothing ahead the same driver package installs', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgahead');
    addFile(p, 'storage/drivers/fakedrv/driver', '#!/bin/sh\nexit 0', 0o755);
    expect((await installPkg(sb, p)).code).toBe(0);
  });
});
