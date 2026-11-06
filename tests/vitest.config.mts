import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const area = (name: string, include = [`${name}/**/*.test.ts`]) => ({
  extends: true,
  test: { name, include, maxConcurrency: 16 },
});

const holdsTests = (dir: string): boolean =>
  existsSync(dir) && readdirSync(dir, { recursive: true }).some((f) => String(f).endsWith('.test.ts'));

const pluginProjects = readdirSync(here('../plugins'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && holdsTests(here(`../plugins/${d.name}/tests`)))
  .map((d) => d.name)
  .sort()
  .map((name) => ({
    extends: true,
    resolve: { alias: { '@support': here('./support') } },
    test: { name, root: here(`../plugins/${name}`), include: ['tests/**/*.test.ts'], maxConcurrency: 16 },
  }));

const projects = [
  area('harness'),
  area('drivers'),
  area('unit-record'),
  area('unit-verbs'),
  area('governance'),
  area('filters'),
  area('engine'),
  area('hooks'),
  area('laws'),
  area('packages', ['packages/**/*.test.ts', 'fixtures/worked-package/tests/**/*.test.ts']),
  area('base'),
  area('integration'),
  area('sqlite-smoke'),
  ...pluginProjects,
];

const rules = {
  projects: projects.map((p) => p.test.name),
  outputFile: here('./.reports/rules.json'),
  reasons: here('./support/rule-reasons.txt'),
};

export default defineConfig({
  test: {
    pool: 'forks',
    maxWorkers: '50%',
    globalSetup: [here('./support/global-setup.ts')],
    setupFiles: [here('./support/setup.ts')],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: [
      'default',
      ['json', { outputFile: here('./.reports/last.json') }],
      here('./support/timing.ts'),
      ...(process.env.VITEST_PRERELEASE === '1' ? [[here('./support/rules.ts'), rules] as [string, typeof rules]] : []),
    ],
    projects,
  },
});
