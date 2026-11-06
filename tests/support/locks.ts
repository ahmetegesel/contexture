import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathPlant } from './plants';
import { sandbox } from './sandbox';

export type Holder = 'live' | 'dead' | 'pidless';

const TRUE = ['/usr/bin/true', '/bin/true'].find((p) => existsSync(p));
const CAT = ['/bin/cat', '/usr/bin/cat'].find((p) => existsSync(p));

export function sleepShim(): Record<string, string> {
  if (!TRUE) throw new Error('no true binary for the sleep shim');
  const dir = sandbox('sleep-shim');
  symlinkSync(TRUE, join(dir, 'sleep'));
  return { PATH: `${dir}:${process.env.PATH ?? ''}` };
}

export function readOnlyLockShim(): Record<string, string> {
  return pathPlant('mkdir', '/bin/mkdir "$@" || exit\nfor a in "$@"; do case "$a" in *.lock) chmod 555 "$a" ;; esac; done');
}

export function catShim(): { env: Record<string, string>; reads: () => string[] } {
  if (!CAT) throw new Error('no cat binary for the cat shim');
  const log = join(sandbox('cat-log'), 'reads');
  const env = pathPlant('cat', `for a in "$@"; do printf '%s\\n' "$a" >> "${log}"; done\nexec "${CAT}" "$@"`);
  return { env, reads: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l !== '') : []) };
}

function exitedPid(): number {
  return Number(spawnSync('sh', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim());
}

export const unitLock = (unit: string): string => join('unit', `${unit}.lock`);

export const namespaceLock = (namespace: string): string => `store-${namespace}.lock`;

export function lockPath(sb: string, lock: string): string {
  return join(sb, '.contexture', 'tmp', 'locks', lock);
}

export function holdLock(sb: string, lock: string, holder: Holder): () => void {
  const dir = lockPath(sb, lock);
  mkdirSync(dir, { recursive: true });
  if (holder !== 'pidless') writeFileSync(join(dir, 'pid'), `${holder === 'live' ? process.pid : exitedPid()}\n`);
  return () => rmSync(dir, { recursive: true, force: true });
}
