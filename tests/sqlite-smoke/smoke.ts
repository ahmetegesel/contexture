import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { FALLBACK_ROOT, SQLITE_DB, RECORD_ROOT, declaredRoots } from '../support/drawer';
import { exec } from '../support/exec';
import { probeSqlite, stage } from '../support/stage';
import { unit } from '../support/unit';

export function needSqlite(): void {
  expect(probeSqlite(), 'sqlite3 3.44 or later on PATH: the pre-release set fails without it, since a skipped bypass guard proves nothing').toBe(true);
}

export function sqliteStage(label: string): string {
  needSqlite();
  return stage('sqlite', label);
}

function dataFiles(sb: string): string[] {
  return ['.contexture/modules', '.contexture/extensions/modules'].flatMap((root) => {
    const dir = join(sb, root);
    return existsSync(dir) ? readdirSync(dir).map((m) => join(dir, m, 'data')).filter((f) => existsSync(f)) : [];
  });
}

export function namespaceRoots(sb: string): string[] {
  return dataFiles(sb).flatMap(declaredRoots).filter(Boolean).sort();
}

export const residue = (sb: string): string[] => namespaceRoots(sb).filter((root) => existsSync(join(sb, root)));

export async function storeKeys(sb: string, ns: string): Promise<string[]> {
  const r = await exec('.contexture/storage/scripts/driver-resolver', ['exec', 'store.list', ns], { cwd: sb });
  expect(r.code, r.stderr).toBe(0);
  return JSON.parse(r.stdout).keys;
}

export async function inSqliteStore(sb: string, ns: string, keys: readonly string[]): Promise<void> {
  expect(existsSync(join(sb, SQLITE_DB)), 'the store is the SQLite database').toBe(true);
  expect(namespaceRoots(sb)).toEqual(expect.arrayContaining([RECORD_ROOT, FALLBACK_ROOT]));
  expect(residue(sb), 'a namespace root folder under a SQLite store is a posix residue').toEqual([]);
  expect(await storeKeys(sb, ns)).toEqual(expect.arrayContaining([...keys]));
}

export interface Recorded {
  code: number;
  listed: boolean;
  residue: string[];
}

export async function recordAndList(sb: string, unitSlug: string, slug: string, what: string): Promise<Recorded> {
  const r = await unit(sb, 'record', unitSlug, `--slug=${slug}`, `--what=${what}`);
  const list = await unit(sb, 'entry', 'list', unitSlug);
  return { code: r.code, listed: list.code === 0 && list.stdout.includes(slug), residue: residue(sb) };
}
