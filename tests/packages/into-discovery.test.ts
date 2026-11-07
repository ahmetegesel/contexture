import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { exec } from '../support/exec';
import { addFile, addModule, extPath, installPkg, isExec, newPkg, out, recordText, uninstall } from '../support/packages';
import { stage } from '../support/stage';
import { put } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-discovery');
const resolve = (sb: string, driver: string) =>
  exec('./.contexture/storage/scripts/driver-resolver', ['resolve'], { cwd: sb, env: { CTX_STORAGE_DRIVER: driver } });
const lines = (text: string): string[] => text.replace(/\n+$/, '').split('\n');

const RITUAL = 'fixture-ritual (.contexture/extensions/rhythms/fixture-ritual.md) | use when: a fixture needs the rhythm index | activation: propose';
const WORKSPACE_RITUAL = 'workspace-ritual (.contexture/rhythms/workspace-ritual.md) | use when: the workspace half is proven | activation: propose';

describe.concurrent('package-install into discovery: the engine, the resolver, and the rhythm index see the overlay', () => {
  it('[the-engine-r1, modules-r14] the installed module lists beside the base lane module and its verb dispatches', async () => {
    const sb = sandbox();
    const pa = newPkg(sb, 'pkga');
    addModule(pa, 'alpha', 'docs');
    expect((await installPkg(sb, pa)).code).toBe(0);
    const help = (await ctx(sb, 'help')).stdout;
    expect(help).toContain('the alpha fixture module');
    expect(help).toContain('subagent lane management');
    expect(out(await ctx(sb, 'alpha', 'hello'))).toBe('hello from alpha');
  });

  it('[the-engine-r1] a module-only package lists its module', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-module');
    addModule(p, 'shaped');
    expect((await installPkg(sb, p)).code).toBe(0);
    expect((await ctx(sb, 'help')).stdout).toContain('the shaped fixture module');
  });

  it('[the-engine-r19, the-engine-r23] a driver package resolves by its name from the extension root and never lists as a module', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-driver');
    addFile(p, 'storage/drivers/shapedrv/driver', '#!/bin/sh\nexit 0', 0o755);
    expect((await installPkg(sb, p)).code).toBe(0);
    expect(out(await resolve(sb, 'shapedrv'))).toBe(join(realpathSync(sb), '.contexture/extensions/storage/drivers/shapedrv/driver'));
    expect((await ctx(sb, 'help', '--all')).stdout).not.toContain('shapedrv');
  });

  it('[the-engine-r10, the-engine-r1] a filters-only package resolves its filter from the extension root and stays unlisted', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'shape-filters');
    addFile(p, 'modules/shapefilters/filters/shape.awk', '#!/usr/bin/awk -f\n# command: ^shapefilters$\n# format-only: shape\n{ print "SHAPED" }', 0o755);
    expect((await installPkg(sb, p)).code).toBe(0);
    const run = await exec('./.contexture/ctx', ['run', '--filter=shape'], { cwd: sb, input: 'shapefilters fixture\n' });
    expect(out(run)).toBe('SHAPED');
    expect((await ctx(sb, 'help')).stdout).not.toContain('shapefilters');
  });

  it('[the-engine-r22, modules-r20] the rhythm index reads the extension root after the workspace, the law fragment is recorded, and the uninstall leaves the index', async () => {
    const sb = sandbox();
    const ri = newPkg(sb, 'pkgri');
    addModule(ri, 'rifixture');
    addFile(ri, 'rhythms/fixture-ritual.md', '@rhythm fixture-ritual\n  use when: a fixture needs the rhythm index\n  activation: propose');
    expect((await installPkg(sb, ri)).code).toBe(0);
    expect(out(await ctx(sb, 'unit', 'index'))).toBe(RITUAL);
    const rec = recordText(sb, 'pkgri');
    expect(rec).toContain('law .contexture/extensions/modules/rifixture/laws');
    const law = rec.split('\n').find((l) => l.startsWith('law '))!.slice(4);
    expect(existsSync(join(sb, law))).toBe(true);
    expect(readFileSync(join(sb, law), 'utf8')).toContain('rifixture-law');
    put(join(sb, '.contexture/rhythms/workspace-ritual.md'), '@rhythm workspace-ritual\n  use when: the workspace half is proven\n');
    const both = lines((await ctx(sb, 'unit', 'index')).stdout);
    expect(both[0]).toBe(WORKSPACE_RITUAL);
    expect(both.at(-1)).toBe(RITUAL);
    rmSync(join(sb, '.contexture/rhythms'), { recursive: true });
    expect((await uninstall(sb, ri)).code).toBe(0);
    expect((await ctx(sb, 'unit', 'index')).stdout).not.toContain('fixture-ritual');
  });

  it('[the-engine-r19, the-engine-r22, the-engine-r23] a driver package lands executable, resolves from the extension root, records its kind and name, stays unlisted, and uninstalls', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgdrv');
    addFile(p, 'storage/drivers/fakedrv/driver', '#!/bin/sh\nexit 0', 0o755);
    expect((await installPkg(sb, p)).code).toBe(0);
    expect(isExec(extPath(sb, 'storage/drivers/fakedrv/driver'))).toBe(true);
    expect(out(await resolve(sb, 'fakedrv'))).toBe(join(realpathSync(sb), '.contexture/extensions/storage/drivers/fakedrv/driver'));
    const rec = recordText(sb, 'pkgdrv');
    expect(rec).toContain('kind driver');
    expect(rec).toContain('driver fakedrv');
    expect((await ctx(sb, 'help', '--all')).stdout).not.toContain('fakedrv');
    expect((await uninstall(sb, p)).code).toBe(0);
  });
});
