import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../vitest.config.mjs';
import { ROOT } from '../support/root';

const NO_SUITE: Record<string, string> = {
  'starter-rhythms': 'a rhythms payload with no code: its install and its rhythms in ctx rhythm list are proven by the packages project (real-catalog)',
};

type Project = { test?: { name?: string } };

const projects = (): string[] => ((config.test?.projects ?? []) as Project[]).map((p) => p.test?.name ?? '');
const catalog = (): string[] =>
  readdirSync(join(ROOT, 'plugins'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
const scripts = (): Record<string, string> => JSON.parse(readFileSync(join(ROOT, 'tests/package.json'), 'utf8')).scripts;

const unaccounted = (plugins: readonly string[], names: readonly string[], reasons: Record<string, string>): string[] =>
  plugins.filter((p) => !names.includes(p) && !(p in reasons));

describe.concurrent('every plugin and every project is reachable by convention', () => {
  it('[plugins-r3] every catalog plugin has its own project or a named no-suite reason', () => {
    expect(catalog().length).toBeGreaterThan(3);
    expect(unaccounted(catalog(), projects(), NO_SUITE)).toEqual([]);
  });

  it('[plugins-r3] a no-suite reason names a catalog plugin that has no project', () => {
    expect(Object.keys(NO_SUITE).filter((p) => !catalog().includes(p) || projects().includes(p))).toEqual([]);
  });

  it('[plugins-r3] null check: a plugin with neither a project nor a reason reads unaccounted', () => {
    expect(unaccounted([...catalog(), 'zz-plugin'], projects(), NO_SUITE)).toEqual(['zz-plugin']);
  });

  it('every project has its own test:<project> script, which selects it', () => {
    expect(projects().length).toBeGreaterThan(10);
    const selects = (n: string): boolean => new RegExp(`^vitest run( --project \\S+)* --project ${n}( |$)`).test(scripts()[`test:${n}`] ?? '');
    expect(projects().filter((n) => !selects(n))).toEqual([]);
    expect(selects('zz-project')).toBe(false);
  });
});
