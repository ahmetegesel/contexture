import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile } from '@support/data-file';
import { sqlite, fakeSqlite } from '@support/sqlite';
import { fts5Available, stage } from '@support/stage';
import { store } from '@support/store';
import { answer, refused } from '@support/wire';

function under(version: string) {
  const sb = stage('fts5');
  dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
  return store(sb, 'fts5', { ...fakeSqlite(version), CTX_STORAGE_SQLITE_PATH: join(sb, 'store.db') });
}

describe.skipIf(!fts5Available())('the sqlite3 version guard', { concurrent: true }, () => {
  it('[the-engine-r24] the fake sqlite3 reports the version under test and passes every other call through', () => {
    const env = { ...process.env, ...fakeSqlite('3.43.2') };
    expect(spawnSync('sqlite3', [':memory:', 'SELECT sqlite_version();'], { encoding: 'utf8', env }).stdout).toBe('3.43.2\n');
    expect(spawnSync('sqlite3', [':memory:', 'SELECT 40 + 2;'], { encoding: 'utf8', env }).stdout).toBe('42\n');
    expect(sqlite(':memory:', 'SELECT sqlite_version();')).not.toBe('3.43.2\n');
  });

  it('[the-engine-r24] 3.43.2: a store function refuses rc 2 naming the version, and the health reports error', async () => {
    const s = under('3.43.2');
    refused(await s.put('docs', 'workspace/version', 'version probe\n'), 'store.put', 2, 'ERR_DRIVER_NOT_FOUND', 'the fts5 driver needs sqlite3 3.44 or later, this one is 3.43.2');
    const health = answer(await s.op('storage.health', ['docs']), 'storage.health');
    expect([health.health, health.detail]).toEqual(['error', 'sqlite3 3.43.2 is older than the 3.44 the driver needs']);
  });

  it('[the-engine-r24] 3.44.0: a store function answers and the health reports ok', async () => {
    const s = under('3.44.0');
    answer(await s.put('docs', 'workspace/version', 'version probe\n'), 'store.put');
    expect(answer(await s.op('storage.health', ['docs']), 'storage.health')).toMatchObject({ health: 'ok', store: 'present' });
  });
});
