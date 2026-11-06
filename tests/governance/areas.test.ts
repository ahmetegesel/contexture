import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import config from '../vitest.config.mjs';
import { AREAS, EVERY, projectsOf } from '../support/areas';
import { ROOT } from '../support/root';

type Project = { test?: { name?: string } };
const projects = ((config.test?.projects ?? []) as Project[]).map((p) => p.test?.name ?? '');

const tracked = (): string[] => {
  const r = spawnSync('git', ['ls-files', 'base', 'plugins', 'tests'], { cwd: ROOT, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout.split('\n').filter(Boolean);
};

describe.concurrent('the changed-files map selects a project for every tracked path', () => {
  it('every tracked path under base/, plugins/, and tests/ selects at least one project', () => {
    const paths = tracked();
    expect(paths.length).toBeGreaterThan(300);
    expect(paths.filter((p) => projectsOf(p).length === 0)).toEqual([]);
  });

  it('null check: a planted path outside every glob selects nothing', () => {
    expect(projectsOf('base/.contexture/zz-unmapped')).toEqual([]);
    expect(projectsOf('base/.contexture/modules/unit/scripts/zz-verb')).toContain('unit-verbs');
  });

  it('a plugin manifest or payload change selects governance, which holds the plugin version check; plugin tests do not', () => {
    expect(projectsOf('plugins/storage-fts5/manifest')).toContain('governance');
    expect(projectsOf('plugins/toolchain-filters/.contexture/extensions/modules/toolchain-filters/filters/x')).toContain('governance');
    expect(projectsOf('plugins/starter-rhythms/.contexture/extensions/rhythms/x.md')).toContain('governance');
    expect(projectsOf('plugins/toolchain-filters/tests/x.test.ts')).not.toContain('governance');
  });

  it('the map names only declared projects, and every declared project is reachable from it', () => {
    const named = new Set(AREAS.flatMap(([, ps]) => ps));
    expect([...named].filter((p) => p !== EVERY && !projects.includes(p))).toEqual([]);
    expect(projects.filter((p) => !named.has(p))).toEqual([]);
  });
});
