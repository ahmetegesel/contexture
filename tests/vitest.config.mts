import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const pluginProject = (name: string) => ({
  extends: true,
  resolve: { alias: { '@support': here('./support') } },
  test: { name, root: here(`../plugins/${name}`), include: ['tests/**/*.test.ts'] },
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
        test: { name: 'drivers', include: ['drivers/**/*.test.ts'] },
      },
      pluginProject('storage-fts5'),
    ],
  },
});
