import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const dir = process.env.RUNNER_DIR ?? here('.');

export default defineConfig({
  cacheDir: process.env.RUNNER_DIR,
  test: {
    name: 'rules-fixture',
    root: here('.'),
    include: ['rules-*.fixture.ts'],
    pool: 'forks',
    reporters: [
      [
        here('../../support/rules.ts'),
        {
          projects: (process.env.RUNNER_PROJECTS ?? 'rules-fixture').split(','),
          outputFile: join(dir, 'rules.json'),
          reasons: join(dir, 'reasons.txt'),
        },
      ],
    ],
  },
});
