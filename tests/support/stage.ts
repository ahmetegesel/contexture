import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT } from './root';
import { sandbox } from './sandbox';

export type Driver = 'posix' | 'fts5';
export const DRIVERS: readonly Driver[] = ['posix', 'fts5'];

const BASE = join(ROOT, 'base');
const FTS5_DRIVER = join(ROOT, 'plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5');
const UNSHIPPED = [join('.contexture', 'tmp'), join('.contexture', 'laws', 'AGENTS.generated.md')];

export function probeFts5(path = process.env.PATH ?? ''): boolean {
  const r = spawnSync('sqlite3', [':memory:', 'CREATE VIRTUAL TABLE t USING fts5(x);'], {
    stdio: 'ignore',
    env: { PATH: path, LC_ALL: 'C' },
  });
  return r.status === 0;
}

let fts5: boolean | undefined;
export function fts5Available(): boolean {
  fts5 ??= probeFts5();
  return fts5;
}

function shipped(src: string): boolean {
  const rel = relative(BASE, src);
  return !UNSHIPPED.some((u) => rel === u || rel.startsWith(u + sep));
}

export function stage(driver: Driver = 'posix', label = 'stage'): string {
  const sb = sandbox(`${label}-${driver}`);
  cpSync(BASE, sb, { recursive: true, filter: shipped });
  mkdirSync(join(sb, '.contexture', 'tmp'), { recursive: true });
  if (driver === 'fts5') {
    cpSync(FTS5_DRIVER, join(sb, '.contexture/extensions/storage/drivers/fts5'), { recursive: true });
    writeFileSync(join(sb, '.contexture', 'config'), 'storage.driver: fts5\n');
  }
  return sb;
}
