import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile } from '@support/data-file';
import { exec } from '@support/exec';
import { ROOT } from '@support/root';
import { sandbox } from '@support/sandbox';
import { sqlite, fakeSqlite } from '@support/sqlite';
import { sqliteAvailable, stage } from '@support/stage';
import { store } from '@support/store';
import { answer, refused } from '@support/wire';

const PROBE = join(ROOT, 'plugins/storage-sqlite/hooks/probe');

function under(version: string) {
  const sb = stage('sqlite');
  dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
  appendFileSync(join(sb, '.contexture/config'), 'storage.database: store.db\n');
  return store(sb, 'sqlite', fakeSqlite(version));
}

const probe = (env: Record<string, string>) => exec('/bin/sh', [PROBE], { cwd: sandbox('probe'), env });

describe.skipIf(!sqliteAvailable())('the sqlite3 version guard', { concurrent: true }, () => {
  it('[the-engine-r24] the fake sqlite3 reports the version under test and passes every other call through', () => {
    const env = { ...process.env, ...fakeSqlite('3.43.2') };
    expect(spawnSync('sqlite3', [':memory:', 'SELECT sqlite_version();'], { encoding: 'utf8', env }).stdout).toBe('3.43.2\n');
    expect(spawnSync('sqlite3', [':memory:', 'SELECT 40 + 2;'], { encoding: 'utf8', env }).stdout).toBe('42\n');
    expect(sqlite(':memory:', 'SELECT sqlite_version();')).not.toBe('3.43.2\n');
  });

  it('[the-engine-r24] 3.43.2: a store function refuses rc 2 naming the version, and the health reports error', async () => {
    const s = under('3.43.2');
    refused(await s.put('docs', 'workspace/version', 'version probe\n'), 'store.put', 2, 'ERR_DRIVER_NOT_FOUND', 'the sqlite driver needs sqlite3 3.44 or later, this one is 3.43.2');
    const health = answer(await s.op('storage.health', ['docs']), 'storage.health');
    expect([health.health, health.detail]).toEqual(['error', 'sqlite3 3.43.2 is older than the 3.44 the driver needs']);
  });

  it('[the-engine-r24] 3.44.0: a store function answers and the health reports ok', async () => {
    const s = under('3.44.0');
    answer(await s.put('docs', 'workspace/version', 'version probe\n'), 'store.put');
    expect(answer(await s.op('storage.health', ['docs']), 'storage.health')).toMatchObject({ health: 'ok', store: 'present' });
  });
});

describe.skipIf(!sqliteAvailable())('the readiness probe', { concurrent: true }, () => {
  it('[plugins-r3] answers rc 0 at 3.44 or later, naming no other need', async () => {
    const r = await probe(fakeSqlite('3.44.0'));
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'sqlite3 3.44.0 ready\n', '']);
  });

  it('[plugins-r3] answers rc 1 naming the version found below 3.44', async () => {
    const r = await probe(fakeSqlite('3.43.2'));
    expect([r.code, r.stdout, r.stderr]).toEqual([1, 'sqlite3 3.43.2 found; needs 3.44 or later\n', '']);
  });

  it('[plugins-r3] answers rc 1 naming the missing binary where sqlite3 is not on PATH', async () => {
    const r = await probe({ PATH: '/nonexistent' });
    expect([r.code, r.stdout, r.stderr]).toEqual([1, 'sqlite3 not found on PATH (needs 3.44 or later)\n', '']);
  });
});
