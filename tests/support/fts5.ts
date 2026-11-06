import { spawnSync } from 'node:child_process';

export const PRERELEASE = process.env.VITEST_PRERELEASE === '1';

export function probeFts5(path = process.env.PATH ?? ''): boolean {
  const r = spawnSync('sqlite3', [':memory:', 'CREATE VIRTUAL TABLE t USING fts5(x);'], {
    stdio: 'ignore',
    env: { PATH: path, LC_ALL: 'C' },
  });
  return r.status === 0;
}
