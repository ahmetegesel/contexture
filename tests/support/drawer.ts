import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './root';

export const UNIT_DATA = join(ROOT, 'base/.contexture/modules/unit/data');

function field(dataFile: string, name: string): string {
  const line = readFileSync(dataFile, 'utf8')
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .find((l) => new RegExp(`^[ \\t]*${name}[ \\t]*:`).test(l));
  return line?.slice(line.indexOf(':') + 1).trim() ?? '';
}

export function declaredRoot(dataFile: string): string {
  return field(dataFile, 'root') || field(dataFile, 'namespace');
}

export function parseRecordRoot(dataFile: string = UNIT_DATA): string {
  const root = field(dataFile, 'root');
  if (root === '') throw new Error(`the unit data file declares no record root: ${dataFile}`);
  return root;
}

export const RECORD_ROOT = parseRecordRoot();

export const FTS5_DB = '.contexture/sessions.db';

export const unitLock = (unit: string): string => join('unit', `${unit}.lock`);

export const namespaceLock = (namespace: string): string => `store-${namespace}.lock`;

export function lockPath(sb: string, lock: string): string {
  return join(sb, '.contexture', 'tmp', 'locks', lock);
}
