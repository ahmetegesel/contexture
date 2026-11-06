import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ModuleRoot = 'modules' | 'extensions';

export const DOCS_SHAPED = 'namespace: docs\nroot: docs\nsuffix: .md\nkey: <repo>/<slug>\nchanges: true\n';

export function moduleDir(sb: string, root: ModuleRoot, module: string): string {
  return join(sb, '.contexture', root === 'modules' ? 'modules' : 'extensions/modules', module);
}

export function dataFile(sb: string, root: ModuleRoot, module: string, text: string): string {
  const dir = moduleDir(sb, root, module);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'data');
  writeFileSync(file, text);
  return file;
}
