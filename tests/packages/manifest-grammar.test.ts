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
  ['a driver package without a driver line', [...HEAD, 'kind: driver', 'format: 1', 'part: driver storage/drivers/fakedrv']],
  ['a driver part that does not match the name', [...HEAD, 'kind: driver', 'driver: fakedrv', 'format: 1', 'part: driver storage/drivers/other']],
  ['an unknown part type', [...HEAD, 'kind: feature', 'part: other modules/x']],
  ['a duplicate part path', [...HEAD, 'kind: feature', 'part: module modules/x', 'part: module modules/x']],
  ['a part path with ..', [...HEAD, 'kind: feature', 'part: module modules/../x']],
  ['an absolute part path', [...HEAD, 'kind: feature', 'part: module /modules/x']],
  ['a trailing-slash part path', [...HEAD, 'kind: feature', 'part: rhythms rhythms/']],
  ['a doubled-slash part path', [...HEAD, 'kind: feature', 'part: rhythms rhythms//x']],
  ['a module part deeper than one folder', [...HEAD, 'kind: feature', 'part: module modules/x/y']],
  ['a rhythms part outside rhythms/', [...HEAD, 'kind: feature', 'part: rhythms other/x']],
  ['a bare requires line', [...HEAD, 'kind: feature', 'part: module modules/x', 'requires:']],
  ['an empty category line', [...HEAD, 'kind: feature', 'part: module modules/x', 'category:']],
  ['a malformed category slug', [...HEAD, 'kind: feature', 'part: module modules/x', 'category: UpperCase']],
  ['a category starting with a digit', [...HEAD, 'kind: feature', 'part: module modules/x', 'category: 1cat']],
  ['a duplicate category', [...HEAD, 'kind: feature', 'part: module modules/x', 'category: docs', 'category: vcs']],
  ['an empty pitch line', [...HEAD, 'kind: feature', 'part: module modules/x', 'pitch:']],
  ['a duplicate pitch', [...HEAD, 'kind: feature', 'part: module modules/x', 'pitch: a', 'pitch: b']],
  ['an empty when line', [...HEAD, 'kind: feature', 'part: module modules/x', 'when:']],
  ['a duplicate when', [...HEAD, 'kind: feature', 'part: module modules/x', 'when: a', 'when: b']],
  ['an empty needs line', [...HEAD, 'kind: feature', 'part: module modules/x', 'needs:']],
  ['a duplicate needs', [...HEAD, 'kind: feature', 'part: module modules/x', 'needs: a', 'needs: b']],
  ['an empty tags line', [...HEAD, 'kind: feature', 'part: module modules/x', 'tags:']],
  ['a malformed uppercase tag', [...HEAD, 'kind: feature', 'part: module modules/x', 'tags: docs Upper']],
  ['a duplicate tag', [...HEAD, 'kind: feature', 'part: module modules/x', 'tags: docs corpus docs']],
  ['a duplicate tags line', [...HEAD, 'kind: feature', 'part: module modules/x', 'tags: a', 'tags: b']],
  ['an inline description value', [...HEAD, 'kind: feature', 'part: module modules/x', 'description: inline text']],
];

beforeAll(() => {
  sb = stage('posix', 'pkg-grammar');
});

describe.concurrent('ctx _package: the package manifest grammar', () => {
  it('[the-engine-r23, modules-r16] a feature manifest validates and reads its summary, version, kind, no driver, and parts, printing empty optional fields when absent', async () => {
    const f = manifest('feature', ['summary: a feature fixture package', 'version: 1.2.3', 'kind: feature', 'part: module modules/alpha', 'part: laws modules/alpha/laws', 'part: rhythms rhythms']);
    expect((await pkgv(f, 'validate')).code).toBe(0);
    expect(out(await pkgv(f, 'summary'))).toBe('a feature fixture package');
    expect(out(await pkgv(f, 'version'))).toBe('1.2.3');
    expect(out(await pkgv(f, 'kind'))).toBe('feature');
    expect(out(await pkgv(f, 'driver'))).toBe('');
    expect(out(await pkgv(f, 'parts'))).toBe('module modules/alpha\nlaws modules/alpha/laws\nrhythms rhythms');
    for (const opt of ['category', 'pitch', 'when', 'needs', 'tags', 'description']) {
      const r = await pkgv(f, opt);
      expect(r.code).toBe(0);
      expect(out(r)).toBe('');
    }
  });

  it('[the-engine-r23, modules-r16] optional metadata fields validate, normalize tags, and preserve description block lines', async () => {
    const f = manifest('optional', [
      'summary: an optional metadata fixture',
      'version: 1.0.0',
      'kind: feature',
      'part: module modules/beta',
      'category: code-intel',
      'pitch:  fast queryable index  ',
      'when: you have TypeScript sources',
      'needs: sqlite3 3.44+',
      'tags:   ast   graph   sqlite-3  ',
      'description:',
      'First paragraph line.',
      '',
      'Second paragraph line.',
    ]);
    expect((await pkgv(f, 'validate')).code).toBe(0);
    expect(out(await pkgv(f, 'category'))).toBe('code-intel');
    expect(out(await pkgv(f, 'pitch'))).toBe('fast queryable index');
    expect(out(await pkgv(f, 'when'))).toBe('you have TypeScript sources');
    expect(out(await pkgv(f, 'needs'))).toBe('sqlite3 3.44+');
    expect(out(await pkgv(f, 'tags'))).toBe('ast graph sqlite-3');
    expect((await pkgv(f, 'description')).stdout).toBe('First paragraph line.\n\nSecond paragraph line.\n');
  });

  it('[the-engine-r23, modules-r16] a non-hash line inside the description block refuses rc1, and # key lines after description stay description text', async () => {
    const f = put(join(sb, 'pkgmf', 'bad-desc'), '# summary: s\n# version: 1.0.0\n# kind: feature\n# part: module modules/x\n# description:\n# line 1\nnot-a-comment\n');
    expect((await pkgv(f, 'validate')).code).toBe(1);
    const last = manifest('desc-last', [...HEAD, 'kind: feature', 'part: module modules/x', 'description:', 'body line', 'category: docs']);
    expect((await pkgv(last, 'validate')).code).toBe(0);
    expect(out(await pkgv(last, 'category'))).toBe('');
    expect((await pkgv(last, 'description')).stdout).toBe('body line\ncategory: docs\n');
  });

  it('[the-engine-r23, modules-r16] a driver manifest validates and reads its kind, driver name, and storage format version', async () => {
    const f = manifest('driver', ['summary: a driver fixture package', 'version: 2.0.0', 'kind: driver', 'driver: fakedrv', 'format: 12', 'part: driver storage/drivers/fakedrv']);
    expect((await pkgv(f, 'validate')).code).toBe(0);
    expect(out(await pkgv(f, 'kind'))).toBe('driver');
    expect(out(await pkgv(f, 'driver'))).toBe('fakedrv');
    expect(out(await pkgv(f, 'format'))).toBe('12');
    const feature = manifest('feature-format', [...HEAD, 'kind: feature', 'part: module modules/x']);
    const r = await pkgv(feature, 'format');
    expect([r.code, r.stdout]).toEqual([0, '\n']);
  });

  const DRIVER = [...HEAD, 'kind: driver', 'driver: fakedrv', 'part: driver storage/drivers/fakedrv'];
  it.each([
    ['an empty format', [...DRIVER, 'format: '], 'line 6: the format is empty'],
    ['a bare format line', [...DRIVER, 'format:'], 'line 6: the format is empty'],
    ['a zero format', [...DRIVER, 'format: 0'], 'line 6: the format is zero (a positive whole number)'],
    ['a format of zeros', [...DRIVER, 'format: 00'], 'line 6: the format is zero (a positive whole number)'],
    ['a format with a leading zero', [...DRIVER, 'format: 06'], "line 6: malformed format '06' (a positive whole number)"],
    ['a negative format', [...DRIVER, 'format: -1'], "line 6: malformed format '-1' (a positive whole number)"],
    ['a fractional format', [...DRIVER, 'format: 1.5'], "line 6: malformed format '1.5' (a positive whole number)"],
    ['a format holding a word', [...DRIVER, 'format: six'], "line 6: malformed format 'six' (a positive whole number)"],
    ['a format with no space after its colon', [...DRIVER, 'format:6'], "line 6: malformed field line (expected '# <field>: <value>')"],
    ['a duplicate format', [...DRIVER, 'format: 6', 'format: 7'], 'line 7: duplicate # format:'],
    ['a driver package without a format line', DRIVER, 'a driver package carries no # format: line'],
    ['a feature package with a format line', [...HEAD, 'kind: feature', 'format: 3', 'part: module modules/x'], 'line 4: a feature package carries no # format: line'],
  ])('[the-engine-r23, modules-r16] %s refuses rc1 naming its line', async (label, lines, message) => {
    const f = manifest(`format-${label.replace(/[^a-z]+/g, '-')}`, lines);
    for (const field of ['validate', 'format']) {
      const r = await pkgv(f, field);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `package-file: error: ${message}\n`]);
    }
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
