import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PRERELEASE, probeFts5 } from './fts5';
import { ROOT } from './root';
import { sandbox } from './sandbox';

export { probeFts5 };

export type Driver = 'posix' | 'fts5';
const ALL: readonly Driver[] = ['posix', 'fts5'];
const SELECTED = PRERELEASE ? ALL.join(',') : (process.env.VITEST_DRIVERS ?? ALL.join(','));
export const DRIVERS: readonly Driver[] = ALL.filter((d) => SELECTED.split(',').includes(d));

const BASE = join(ROOT, 'base');
const FTS5_DRIVER = join(ROOT, 'plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5');
// the legacy layer path stays unshipped until the idea legacy-sunset retires the composer's cleanup
const UNSHIPPED = [join('.contexture', 'tmp'), 'AGENTS.generated.md', join('.contexture', 'laws', 'AGENTS.generated.md')];

let fts5: boolean | undefined;
export function fts5Available(): boolean {
  fts5 ??= DRIVERS.includes('fts5') && probeFts5();
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
