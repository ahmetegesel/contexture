import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  cacheDir: process.env.RUNNER_DIR,
  test: {
    root: here('.'),
    include: ['*.fixture.ts'],
    pool: 'forks',
    testTimeout: 1_000,
    setupFiles: process.env.RUNNER_SWEEP === 'off' ? [] : [here('../../support/setup.ts')],
  },
});
