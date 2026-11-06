import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, type Run } from './exec';

export interface Pair {
  name: string;
  filter: string;
  input: string;
  expected: string;
}

const names = (dir: string, ext: string): string[] =>
  readdirSync(dir)
    .filter((n) => n.endsWith(ext))
    .map((n) => n.slice(0, -ext.length))
    .sort();

export const filterNames = (filtersDir: string): string[] => names(filtersDir, '.awk');

export function owner(caseName: string, filters: readonly string[]): string {
  return filters.filter((f) => caseName.startsWith(`${f}-`)).reduce((best, f) => (f.length > best.length ? f : best), '');
}

export function pairs(filtersDir: string, fixturesDir: string): Pair[] {
  const filters = filterNames(filtersDir);
  return names(fixturesDir, '.in')
    .filter((c) => owner(c, filters) !== '')
    .map((c) => ({ name: c, filter: owner(c, filters), input: join(fixturesDir, `${c}.in`), expected: join(fixturesDir, `${c}.expected`) }));
}

export function viaFilter(sb: string, filter: string, input: string, env: Record<string, string> = {}): Promise<Run> {
  return exec('./.contexture/ctx', ['run', `--filter=${filter}`], { cwd: sb, input: readFileSync(input), env });
}
