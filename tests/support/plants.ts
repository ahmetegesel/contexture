import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './sandbox';

export const ROOT_USER = process.getuid?.() === 0;

const MKTEMP = ['/usr/bin/mktemp', '/bin/mktemp'].find((p) => existsSync(p));

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
