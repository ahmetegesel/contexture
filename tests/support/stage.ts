import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PRERELEASE, probeFts5, probeSqlite } from './probe';
import { ROOT } from './root';
import { sandbox } from './sandbox';

export { probeFts5, probeSqlite };

export type Driver = 'posix' | 'sqlite';
const ALL: readonly Driver[] = ['posix', 'sqlite'];
const SELECTED = PRERELEASE ? ALL.join(',') : (process.env.VITEST_DRIVERS ?? ALL.join(','));
export const DRIVERS: readonly Driver[] = ALL.filter((d) => SELECTED.split(',').includes(d));

const BASE = join(ROOT, 'base');
const SQLITE_DRIVER = join(ROOT, 'plugins/storage-sqlite/.contexture/extensions/storage/drivers/sqlite');
// the legacy layer path stays unshipped until the idea legacy-sunset retires the composer's cleanup
const UNSHIPPED = [join('.contexture', 'tmp'), 'AGENTS.generated.md', join('.contexture', 'laws', 'AGENTS.generated.md')];

let sqlite: boolean | undefined;
export function sqliteAvailable(): boolean {
  sqlite ??= DRIVERS.includes('sqlite') && probeSqlite();
  return sqlite;
}

function shipped(src: string): boolean {
  const rel = relative(BASE, src);
  return !UNSHIPPED.some((u) => rel === u || rel.startsWith(u + sep));
}

export function stage(driver: Driver = 'posix', label = 'stage'): string {
  const sb = sandbox(`${label}-${driver}`);
  cpSync(BASE, sb, { recursive: true, filter: shipped });
  mkdirSync(join(sb, '.contexture', 'tmp'), { recursive: true });
  if (driver === 'sqlite') {
    cpSync(SQLITE_DRIVER, join(sb, '.contexture/extensions/storage/drivers/sqlite'), { recursive: true });
    writeFileSync(join(sb, '.contexture', 'config'), 'storage.driver: sqlite\n');
  }
  return sb;
}
