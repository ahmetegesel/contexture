import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sandbox } from './sandbox';

export const ROOT_USER = process.getuid?.() === 0;

export function chmodPlant(path: string, mode: number, back: number, onTestFinished: (fn: () => void) => void): void {
  chmodSync(path, mode);
  onTestFinished(() => chmodSync(path, back));
}

export function pathPlant(name: string, script: string): Record<string, string> {
  const dir = sandbox(`${name}-plant`);
  writeFileSync(join(dir, name), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return { PATH: `${dir}:${process.env.PATH ?? ''}` };
}
