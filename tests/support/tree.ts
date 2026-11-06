import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export function put(path: string, text: string | Buffer, mode = 0o644): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, { mode });
  return path;
}

export function treeState(dir: string): string {
  if (!existsSync(dir)) return '';
  const lines: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      const rel = relative(dir, p);
      const mode = (st.mode & 0o777).toString(8);
      if (st.isDirectory()) {
        lines.push(`${rel}/ ${mode}`);
        walk(p);
      } else {
        lines.push(`${rel} ${mode} ${createHash('sha1').update(readFileSync(p)).digest('hex')}`);
      }
    }
  };
  walk(dir);
  return lines.join('\n');
}

export function firstByteDifference(actual: Buffer, expected: Buffer): number {
  const n = Math.min(actual.length, expected.length);
  for (let i = 0; i < n; i++) if (actual[i] !== expected[i]) return i;
  return actual.length === expected.length ? -1 : n;
}
