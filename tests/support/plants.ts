import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './sandbox';

export const ROOT_USER = process.getuid?.() === 0;

const MKTEMP = ['/usr/bin/mktemp', '/bin/mktemp'].find((p) => existsSync(p));
const SLEEP = ['/bin/sleep', '/usr/bin/sleep'].find((p) => existsSync(p));

// sweepGate <dir>: a sleep plant holding the posix sweep between two batches. The driver
// sleeps its gap (0.2 s, the lock released) before every batch after its first, so the call
// that sleeps 0.2 marks the gate's folder with its pid and waits there until a signal stops it
// (up to 300 s); a mark proves the sweep moved its first batch and stands before a later one,
// work left. The plant lies in <dir>, so a check over the processes naming <dir> sees it too.
export function sweepGate(dir: string): { env: Record<string, string>; reached: () => boolean } {
  if (!SLEEP) throw new Error('no sleep binary for the sweep gate');
  const bin = join(dir, 'sweep-gate');
  const marks = join(bin, 'marks');
  mkdirSync(marks, { recursive: true });
  writeFileSync(join(bin, 'sleep'), [
    '#!/bin/sh',
    'if [ "$*" = 0.2 ]; then',
    `  : > "${marks}/$$"`,
    '  n=0',
    `  while [ "$n" -lt 3000 ]; do "${SLEEP}" 0.1; n=$((n + 1)); done`,
    'fi',
    `exec "${SLEEP}" "$@"`,
    '',
  ].join('\n'), { mode: 0o755 });
  return { env: { PATH: `${bin}:${process.env.PATH ?? ''}` }, reached: () => readdirSync(marks).length > 0 };
}

export function chmodPlant(path: string, mode: number, back: number, onTestFinished: (fn: () => void) => void): void {
  chmodSync(path, mode);
  onTestFinished(() => chmodSync(path, back));
}

export function pathPlant(name: string, script: string): Record<string, string> {
  const dir = sandbox(`${name}-plant`);
  writeFileSync(join(dir, name), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return { PATH: `${dir}:${process.env.PATH ?? ''}` };
}

export function mktempPlant(after: string): Record<string, string> {
  if (!MKTEMP) throw new Error('no mktemp binary for the mktemp plant');
  return pathPlant('mktemp', `p=$("${MKTEMP}" "$@") || exit\n${after}\nprintf '%s\\n' "$p"`);
}
