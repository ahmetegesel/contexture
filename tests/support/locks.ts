import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lockPath, moveMarker } from './drawer';
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

export function exitedPid(): number {
  return Number(spawnSync('sh', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim());
}

export function holdLock(sb: string, lock: string, holder: Holder): () => void {
  const dir = lockPath(sb, lock);
  mkdirSync(dir, { recursive: true });
  if (holder !== 'pidless') writeFileSync(join(dir, 'pid'), `${holder === 'live' ? process.pid : exitedPid()}\n`);
  return () => rmSync(dir, { recursive: true, force: true });
}

// holdMove plants the storage moving marker as a take leaves it: the target, the source, then
// the holder pid (the test process when live, so CTX_STORAGE_MOVE = process.pid is its token);
// a pid-less holder may also lack its target, as a take stopped before its first write
export function holdMove(sb: string, target: string, holder: Holder, source = 'posix'): () => void {
  const dir = lockPath(sb, moveMarker());
  mkdirSync(dir, { recursive: true });
  if (target !== '') writeFileSync(join(dir, 'target'), `${target}\n`);
  writeFileSync(join(dir, 'source'), `${source}\n`);
  if (holder !== 'pidless') writeFileSync(join(dir, 'pid'), `${holder === 'live' ? process.pid : exitedPid()}\n`);
  return () => rmSync(dir, { recursive: true, force: true });
}

export const moveToken = (): Record<string, string> => ({ CTX_STORAGE_MOVE: String(process.pid) });
