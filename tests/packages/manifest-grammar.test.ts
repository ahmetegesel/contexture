import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { out } from '../support/packages';
import { stage } from '../support/stage';
import { put } from '../support/tree';

let sb: string;
const manifest = (name: string, lines: readonly string[]): string => put(join(sb, 'pkgmf', name), lines.map((l) => `# ${l}\n`).join(''));
const pkgv = (file: string, field: string) => ctx(sb, '_package', file, field);

const HEAD = ['summary: x', 'version: 1.0.0'];
const REFUSED: [string, string[]][] = [
  ['a requires line', [...HEAD, 'kind: feature', 'part: module modules/x', 'requires: base>=1']],
  ['an unknown field', [...HEAD, 'kind: feature', 'part: module modules/x', 'unknown: y']],
  ['a missing summary', ['version: 1.0.0', 'kind: feature', 'part: module modules/x']],
  ['a missing version', ['summary: x', 'kind: feature', 'part: module modules/x']],
  ['a missing kind', [...HEAD, 'part: module modules/x']],
  ['a manifest with no part', [...HEAD, 'kind: feature']],
  ['an unknown kind', [...HEAD, 'kind: other', 'part: module modules/x']],
  ['a feature package with a driver line', [...HEAD, 'kind: feature', 'driver: fakedrv', 'part: module modules/x']],
  ['a driver package without a driver line', [...HEAD, 'kind: driver', 'part: driver storage/drivers/fakedrv']],
  ['a driver part that does not match the name', [...HEAD, 'kind: driver', 'driver: fakedrv', 'part: driver storage/drivers/other']],
  ['an unknown part type', [...HEAD, 'kind: feature', 'part: other modules/x']],
  ['a duplicate part path', [...HEAD, 'kind: feature', 'part: module modules/x', 'part: module modules/x']],
  ['a part path with ..', [...HEAD, 'kind: feature', 'part: module modules/../x']],
  ['an absolute part path', [...HEAD, 'kind: feature', 'part: module /modules/x']],
  ['a trailing-slash part path', [...HEAD, 'kind: feature', 'part: rhythms rhythms/']],
  ['a doubled-slash part path', [...HEAD, 'kind: feature', 'part: rhythms rhythms//x']],
  ['a module part deeper than one folder', [...HEAD, 'kind: feature', 'part: module modules/x/y']],
  ['a rhythms part outside rhythms/', [...HEAD, 'kind: feature', 'part: rhythms other/x']],
  ['a bare requires line', [...HEAD, 'kind: feature', 'part: module modules/x', 'requires:']],
];

beforeAll(() => {
  sb = stage('posix', 'pkg-grammar');
});

describe.concurrent('ctx _package: the package manifest grammar', () => {
  it('[the-engine-r23, modules-r16] a feature manifest validates and reads its summary, version, kind, no driver, and parts', async () => {
    const f = manifest('feature', ['summary: a feature fixture package', 'version: 1.2.3', 'kind: feature', 'part: module modules/alpha', 'part: laws modules/alpha/laws', 'part: rhythms rhythms']);
    expect((await pkgv(f, 'validate')).code).toBe(0);
    expect(out(await pkgv(f, 'summary'))).toBe('a feature fixture package');
    expect(out(await pkgv(f, 'version'))).toBe('1.2.3');
    expect(out(await pkgv(f, 'kind'))).toBe('feature');
    expect(out(await pkgv(f, 'driver'))).toBe('');
    expect(out(await pkgv(f, 'parts'))).toBe('module modules/alpha\nlaws modules/alpha/laws\nrhythms rhythms');
  });

  it('[the-engine-r23, modules-r16] a driver manifest validates and reads its kind and driver name', async () => {
    const f = manifest('driver', ['summary: a driver fixture package', 'version: 2.0.0', 'kind: driver', 'driver: fakedrv', 'part: driver storage/drivers/fakedrv']);
    expect((await pkgv(f, 'validate')).code).toBe(0);
    expect(out(await pkgv(f, 'kind'))).toBe('driver');
    expect(out(await pkgv(f, 'driver'))).toBe('fakedrv');
  });

  it.each(REFUSED)('[the-engine-r23, modules-r16] %s refuses rc1', async (label, lines) => {
    const f = manifest(label.replace(/[^a-z]+/g, '-'), lines);
    expect((await pkgv(f, 'validate')).code).toBe(1);
  });

  it('[modules-r16, plugins-r9] a templates part refuses rc1 naming the retired type', async () => {
    const f = manifest('retiredtemplate', [...HEAD, 'kind: feature', 'part: templates templates']);
    const r = await pkgv(f, 'validate');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unknown part type 'templates'");
  });
});
