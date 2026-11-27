import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SQLITE_DB } from '../support/drawer';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { catalogCopy } from '../support/packages';
import { sqliteAvailable, stage } from '../support/stage';
import { put, treeState } from '../support/tree';

const SLOW = { timeout: 1_200_000 };
const ctx = (sb: string, args: readonly string[]): Promise<Run> => exec('./.contexture/ctx', args, { cwd: sb, timeout: 600_000 });
const scan = async (sb: string, driver: string, ns: string): Promise<string> =>
  (await exec('./.contexture/storage/scripts/driver-resolver', [`--driver=${driver}`, 'store.scan', ns], { cwd: sb, env: { CTX_ROOT: sb } })).stdout;
const conf = (sb: string): string => (existsSync(join(sb, '.contexture/config')) ? readFileSync(join(sb, '.contexture/config'), 'utf8') : '');
const tree = (sb: string): string => treeState(sb).split('\n').filter((l) => !l.startsWith('.contexture/tmp') && !l.startsWith('plugins/')).join('\n');
const DB = SQLITE_DB;

async function seeded(label: string): Promise<string> {
  const sb = stage('posix', label);
  catalogCopy(sb, 'storage-sqlite');
  expect((await ctx(sb, ['unit', 'bootstrap', 'demo', 'a unit to move'])).code).toBe(0);
  expect((await ctx(sb, ['unit', 'record', 'demo', '--what=an event to move'])).code).toBe(0);
  return sb;
}

describe.skipIf(!sqliteAvailable())('storage-sqlite moves the record through the driver package lifecycle', { concurrent: true }, () => {
  it('[the-engine-r17, plugins-r9] an install over a seeded record moves it into the database byte equal and its uninstall moves it back, the finish hook backing the database up under the run\'s stamp', SLOW, async () => {
    const sb = await seeded('sqlite-life');
    const before = await scan(sb, 'posix', 'unit');
    const r = await ctx(sb, ['package', 'install', 'storage-sqlite', '--delete-old']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('unit: 4 keys copied, dumps equal\n');
    expect(conf(sb)).toMatch(/^storage\.driver: sqlite$/m);
    expect(existsSync(join(sb, DB))).toBe(true);
    expect(await scan(sb, 'sqlite', 'unit')).toBe(before);
    expect(JSON.parse(await scan(sb, 'posix', 'unit')).items).toEqual([]);
    const u = await ctx(sb, ['package', 'uninstall', 'storage-sqlite', '--backup-old']);
    expect(u.code, u.stderr).toBe(0);
    const stamp = /the 'sqlite' driver's own storage, the old copy, moved into the backup stamped ([0-9]{8}-[0-9]{6}-[0-9]+)\n/.exec(u.stdout)?.[1];
    expect(stamp, u.stdout).toBeDefined();
    expect(await scan(sb, 'posix', 'unit')).toBe(before);
    expect(existsSync(join(sb, DB))).toBe(false);
    expect(readdirSync(join(sb, `.contexture/backups/move-${stamp}/@sqlite`))).toContain(basename(SQLITE_DB));
    expect(conf(sb)).not.toMatch(/storage\.driver/);
  });

  it('[the-engine-r17] the prepare hook refuses a database already at the location and an absent folder, writing nothing', SLOW, async () => {
    const sb = await seeded('sqlite-prepare');
    put(join(sb, DB), 'an old database\n');
    const before = tree(sb);
    const r = await ctx(sb, ['package', 'install', 'storage-sqlite', '--backup-old']);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toBe("package-install: the install failed at the driver's prepare (it refused: a database already sits at the configured location and a move fills an empty store only: move it away, or name another location with --driver-config=database=<path>); the install is undone\n");
    expect(tree(sb)).toBe(before);
    const away = await ctx(sb, ['package', 'install', 'storage-sqlite', '--backup-old', '--driver-config=database=nowhere/store.db']);
    expect([away.code, away.stdout]).toEqual([2, '']);
    expect(away.stderr).toContain('(it refused: the folder of the configured database location does not exist: make it, or name another location with --driver-config=database=<path>)');
    expect(tree(sb)).toBe(before);
    expect(conf(sb)).toBe('');
  });

  it('[the-engine-r17] a failure after the copy runs the cleanup hook, which removes the database and its side files the move made', SLOW, async () => {
    const sb = await seeded('sqlite-cleanup');
    writeFileSync(join(sb, '.contexture/config'), Buffer.from('# \xff a note\n', 'latin1'));
    const before = tree(sb);
    const r = await ctx(sb, ['package', 'install', 'storage-sqlite', '--backup-old']);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^package-install: the install failed at the switch \(.*\); unwound: unit 4 written, 4 deleted; the install is undone\n$/);
    for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) expect(existsSync(join(sb, f)), f).toBe(false);
    expect(tree(sb)).toBe(before);
  });
});
