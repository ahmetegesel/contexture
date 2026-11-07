import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../support/root';

export function walk(dir: string, skip: (path: string) => boolean = () => false): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (skip(p)) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}

export const text = (path: string): string => readFileSync(path, 'utf8');

export function kids(dir: string): string[] {
  try {
    return readdirSync(dir).sort().map((n) => join(dir, n));
  } catch {
    return [];
  }
}

export function moduleDirs(root: string): string[] {
  return [
    ...kids(join(root, 'base/.contexture/modules')),
    ...kids(join(root, 'base/.contexture/extensions/modules')),
    ...kids(join(root, 'plugins')).flatMap((p) => kids(join(p, '.contexture/extensions/modules'))),
    ...kids(join(root, 'tests/fixtures/worked-package/.contexture/extensions/modules')),
  ];
}

export const git = (root: string, ...args: string[]) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });

export function atTop(root: string = ROOT): boolean {
  const top = git(root, 'rev-parse', '--show-toplevel');
  return top.status === 0 && realpathSync(top.stdout.trim()) === realpathSync(root);
}
