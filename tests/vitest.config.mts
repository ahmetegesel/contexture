import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const pluginProject = (name: string) => ({
  extends: true,
  resolve: { alias: { '@support': here('./support') } },
  test: { name, root: here(`../plugins/${name}`), include: ['tests/**/*.test.ts'], maxConcurrency: 16 },
});

export default defineConfig({
  test: {
    pool: 'forks',
    globalSetup: [here('./support/global-setup.ts')],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    projects: [
      {
        extends: true,
        test: { name: 'harness', include: ['harness/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'drivers', include: ['drivers/**/*.test.ts'], maxConcurrency: 16 },
      },
      {
        extends: true,
        test: { name: 'unit-record', include: ['unit-record/**/*.test.ts'], maxConcurrency: 16, sequence: { groupOrder: 1 } },
      },
      {
        extends: true,
        test: { name: 'unit-verbs', include: ['unit-verbs/**/*.test.ts'], maxConcurrency: 16, sequence: { groupOrder: 1 } },
      },
      pluginProject('storage-fts5'),
      {
        extends: true,
        test: { name: 'governance', include: ['governance/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'filters', include: ['filters/**/*.test.ts'], maxConcurrency: 16 },
      },
      pluginProject('toolchain-filters'),
      pluginProject('docs-discipline'),
      pluginProject('ast-doc-graph'),
      {
        extends: true,
        test: { name: 'engine', include: ['engine/**/*.test.ts'], maxConcurrency: 16 },
      },
      {
        extends: true,
        test: { name: 'hooks', include: ['hooks/**/*.test.ts'], maxConcurrency: 16 },
      },
      {
        extends: true,
        test: { name: 'laws', include: ['laws/**/*.test.ts'], maxConcurrency: 16 },
      },
      {
        extends: true,
        test: { name: 'packages', include: ['packages/**/*.test.ts', 'fixtures/worked-package/tests/**/*.test.ts'], maxConcurrency: 16 },
      },
    ],
  },
});
