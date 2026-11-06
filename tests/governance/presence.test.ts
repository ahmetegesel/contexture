import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../vitest.config.mjs';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { put } from '../support/tree';
import { text, walk } from './walk';

const UNIT = join(ROOT, 'base/.contexture/modules/unit');
const UNIT_VERBS = join(ROOT, 'tests/unit-verbs');
const HOOKS = join(ROOT, 'tests/hooks');

const scripts = (): string[] =>
  readdirSync(join(UNIT, 'scripts'))
    .filter((n) => !n.startsWith('.'))
    .sort()
    .map((n) => join(UNIT, 'scripts', n));

function shippedVerbs(): string[] {
  return scripts()
    .filter((f) => /^# summary: /m.test(text(f)))
    .map((f) => f.slice(f.lastIndexOf('/') + 1))
    .sort();
}

function declaredVerbs(): string[] {
  const line = text(join(UNIT_VERBS, 'verb-surface.test.ts')).match(/^export const DECLARED = \[(.*)\];$/m)?.[1] ?? '';
  return line.split(',').map((v) => v.trim().replace(/'/g, '')).filter(Boolean);
}

function derivedPoints(): string[] {
  const points = new Set<string>();
  for (const f of scripts()) {
    for (const m of text(f).matchAll(/fire_hooks\("([a-z-]*)"/g)) points.add(m[1]);
    for (const m of text(f).matchAll(/vb_hook ([a-z-]*)/g)) points.add(m[1]);
  }
  for (const m of text(join(UNIT, 'scripts/refresh')).matchAll(/_hooks ([a-z-]*)/g)) points.add(m[1]);
  return [...points].sort();
}

type Project = { test?: { name?: string; root?: string; include?: string[] } };

function testFiles(root: string, include: readonly string[]): string[] {
  return include.flatMap((glob) => walk(join(root, glob.slice(0, glob.indexOf('/**')))).filter((f) => f.endsWith('.test.ts')));
}

describe.concurrent('presence: every shipped surface has its tests', () => {
  it('every shipped unit verb is declared in the unit-verbs verb surface test', () => {
    expect(declaredVerbs()).toEqual(shippedVerbs());
    expect(shippedVerbs().length).toBeGreaterThan(15);
  });

  it('each shipped unit verb is called by a unit-verbs test beside the verb surface', () => {
    const bodies = readdirSync(UNIT_VERBS)
      .filter((n) => n.endsWith('.test.ts') && n !== 'verb-surface.test.ts')
      .map((n) => text(join(UNIT_VERBS, n)));
    expect(shippedVerbs().filter((v) => !bodies.some((b) => b.includes(`'${v}'`)))).toEqual([]);
  });

  it('the derived hook points are the shipped six', () => {
    expect(derivedPoints()).toEqual(['close', 'load-post', 'load-pre', 'refresh', 'stamp', 'task-landing']);
  });

  it('every hook point has a case in the hooks project and a fixture hook', () => {
    const cases = text(join(HOOKS, 'around-verbs.test.ts'));
    const fixtures = walk(join(HOOKS, 'fixtures')).map(text).join('\n');
    expect(derivedPoints().filter((p) => !cases.includes(p))).toEqual([]);
    expect(derivedPoints().filter((p) => !fixtures.includes(`# ctx-hook: ${p}`))).toEqual([]);
  });

  it('every declared vitest project holds at least one test file', () => {
    const projects = (config.test?.projects ?? []) as Project[];
    expect(projects.length).toBeGreaterThan(10);
    const empty = projects.filter((p) => testFiles(p.test?.root ?? join(ROOT, 'tests'), p.test?.include ?? []).length === 0).map((p) => p.test?.name);
    expect(empty).toEqual([]);
  });

  it('the project file count reads an empty project as empty', () => {
    const dir = sandbox('presence');
    put(join(dir, 'area/helper.ts'), '');
    expect(testFiles(dir, ['area/**/*.test.ts'])).toEqual([]);
    put(join(dir, 'area/deep/one.test.ts'), '');
    expect(testFiles(dir, ['area/**/*.test.ts'])).toHaveLength(1);
  });
});
