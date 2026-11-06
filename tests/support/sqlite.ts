import { spawnSync } from 'node:child_process';
import { pathPlant } from './plants';

export function sqlite(db: string, sql: string): string {
  const r = spawnSync('sqlite3', [db, sql], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', LC_ALL: 'C' } });
  if (r.status !== 0) throw new Error(`sqlite3 ${db}: ${r.stderr}`);
  return r.stdout;
}

export function fakeSqlite(version: string): Record<string, string> {
  const real = spawnSync('sh', ['-c', 'command -v sqlite3'], { encoding: 'utf8' }).stdout.trim();
  return pathPlant('sqlite3', [
    'for a in "$@"; do case "$a" in *"sqlite_version()"*)',
    `  "${real}" "$@" | sed 's/3\\.[0-9]*\\.[0-9]*$/${version}/'; exit $? ;; esac; done`,
    `exec "${real}" "$@"`,
  ].join('\n'));
}
