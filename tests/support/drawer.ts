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

export function declaredRoots(dataFile: string): string[] {
  const fallback = field(dataFile, 'fallback_root');
  return [declaredRoot(dataFile), ...(fallback ? [fallback] : [])];
}

export function parseRecordRoot(dataFile: string = UNIT_DATA): string {
  const root = field(dataFile, 'root');
  if (root === '') throw new Error(`the unit data file declares no record root: ${dataFile}`);
  return root;
}

export const RECORD_ROOT = parseRecordRoot();

export function parseFallbackRoot(dataFile: string = UNIT_DATA): string {
  const root = field(dataFile, 'fallback_root');
  if (root === '') throw new Error(`the unit data file declares no fallback root: ${dataFile}`);
  return root;
}

export const FALLBACK_ROOT = parseFallbackRoot();

export const FTS5_DB = '.contexture/sessions.db';

export const unitLock = (unit: string): string => join('unit', `${unit}.lock`);

export const namespaceLock = (namespace: string): string => `store-${namespace}.lock`;

export function lockPath(sb: string, lock: string): string {
  return join(sb, '.contexture', 'tmp', 'locks', lock);
}

const escRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const LOCK_SEGMENTS = lockPath('/', unitLock('u')).split('/').filter(Boolean);

export const RECORD_LEAK = new RegExp(
  [RECORD_ROOT, FALLBACK_ROOT, FTS5_DB.split('/').pop() ?? '', LOCK_SEGMENTS.slice(1, 3).join('/'), LOCK_SEGMENTS.slice(2, 4).join('/')]
    .map(escRe)
    .concat(['lanes\\/[^ ]*\\/(recipe|journal|report)', '(state|backlog|journal|knowledge|recipe|report)\\.md', 'session folder', '\\.contexture\\/(extensions\\/)?modules\\/'])
    .join('|'),
);

export const unquoted = (line: string): string => line.replace(/["'`\\]/g, '');

export const leaks = (line: string): boolean => RECORD_LEAK.test(unquoted(line));
