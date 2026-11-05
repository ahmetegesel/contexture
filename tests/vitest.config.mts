import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    globalSetup: ['support/global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    projects: [
      {
        extends: true,
        test: { name: 'harness', include: ['harness/**/*.test.ts'] },
      },
    ],
  },
});
