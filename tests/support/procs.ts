import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const HUNG_TREE = 'sleep 300 & echo $! > pids; sleep 300 & echo $! >> pids; wait';

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function treePids(dir: string): number[] {
  const file = join(dir, 'pids');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(Number) : [];
}
