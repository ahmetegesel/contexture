import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile } from '@support/data-file';
import { ROOT_USER, chmodPlant } from '@support/plants';
import { sandbox } from '@support/sandbox';
import { sqlite } from '@support/sqlite';
import { fts5Available, stage } from '@support/stage';
import { store } from '@support/store';
import { answer, refused } from '@support/wire';

const RECORD_TABLES = ['units', 'tasks', 'findings', 'journal_items', 'lane_items', 'lanes', 'preambles', 'search_documents', 'lines'];
const STORE_TABLES = ['store', 'store_changes', 'store_docs', 'store_docs_schema'];

function at(dbName: string) {
  const sb = stage('fts5');
  dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
  const dir = sandbox('db');
  const db = join(dir, dbName);
  return { db, dir, s: store(sb, 'fts5', { CTX_STORAGE_SQLITE_PATH: db }) };
}

const version = (db: string) => sqlite(db, 'PRAGMA user_version;').trim();
const tables = (db: string) => sqlite(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;").split('\n').filter(Boolean);
const backups = (dir: string, db: string) => readdirSync(dir).filter((n) => ![basename(db), `${basename(db)}-wal`, `${basename(db)}-shm`, `${basename(db)}-journal`].includes(n));
const digest = (db: string) => createHash('sha256').update(Buffer.concat([db, `${db}-wal`].filter(existsSync).map((p) => readFileSync(p)))).digest('hex');

const schemaRefusal = (v: number) => `the store is at schema ${v}; this driver reads 5 and has no upgrade path: move the store aside and re-enter the record into a fresh one through the ctx verbs`;
const health = async (s: ReturnType<typeof store>) => answer(await s.op('storage.health', []), 'storage.health');

describe.skipIf(!fts5Available())('the fts5 store schema', { concurrent: true }, () => {
  it('[the-engine-r16] an absent store: the first write lays schema 5, store-only, with no backup', async () => {
    const { db, dir, s } = at('new.db');
    answer(await s.put('docs', 'workspace/new', 'schema probe\n'), 'store.put');
    expect(version(db)).toBe('5');
    expect(backups(dir, db)).toEqual([]);
    expect(tables(db).filter((t) => RECORD_TABLES.includes(t))).toEqual([]);
    for (const t of STORE_TABLES) expect(tables(db)).toContain(t);
  });

  it('an empty file: the first write lays schema 5 with no backup', async () => {
    const { db, dir, s } = at('empty.db');
    mkdirSync(dir, { recursive: true });
    writeFileSync(db, '');
    answer(await s.put('docs', 'workspace/new', 'schema probe\n'), 'store.put');
    expect(version(db)).toBe('5');
    expect(backups(dir, db)).toEqual([]);
  });

  it('a store at version 5: a read leaves the file byte for byte', async () => {
    const { db, dir, s } = at('v5.db');
    answer(await s.put('docs', 'workspace/new', 'schema probe\n'), 'store.put');
    sqlite(db, 'PRAGMA wal_checkpoint(TRUNCATE);');
    const before = digest(db);
    expect((await s.get('docs', 'workspace/new')).stdout).toBe('schema probe\n');
    expect(digest(db)).toBe(before);
    expect(backups(dir, db)).toEqual([]);
  });

  it.each([4, 0, 6])('[plugins-r8] a store at version %i: get, list, and put refuse rc 2 naming it, the file untouched, no backup', async (v) => {
    const { db, dir, s } = at(`v${v}.db`);
    sqlite(db, `CREATE TABLE sessions (unit TEXT PRIMARY KEY); INSERT INTO sessions VALUES ('old-unit'); PRAGMA user_version = ${v};`);
    const pre = readFileSync(db);
    refused(await s.list('docs'), 'store.list', 2, 'ERR_STORAGE_SCHEMA', schemaRefusal(v));
    refused(await s.get('docs', 'workspace/new'), 'store.get', 2, 'ERR_STORAGE_SCHEMA', schemaRefusal(v));
    refused(await s.put('docs', 'workspace/new', 'schema probe\n'), 'store.put', 2, 'ERR_STORAGE_SCHEMA', schemaRefusal(v));
    expect(readFileSync(db).equals(pre)).toBe(true);
    expect(backups(dir, db)).toEqual([]);
    if (v === 4) {
      expect(answer(await s.op('storage.health', []), 'storage.health')).toEqual({
        driver: 'fts5', health: 'error', detail: 'database at schema 4; this driver reads 5 and has no upgrade path', store: 'present',
      });
    }
  });
});

describe.skipIf(!fts5Available())('the fts5 storage.health over the database states', { concurrent: true }, () => {
  it('[the-engine-r24] a database holding no key reads degraded with the store absent: a file with no table, and a schema 5 store whose last key was deleted', async () => {
    const { db, s } = at('nokey.db');
    const none = { driver: 'fts5', health: 'degraded', detail: 'database present, no key stored yet', store: 'absent' };
    writeFileSync(db, '');
    expect(await health(s)).toEqual(none);
    answer(await s.put('docs', 'workspace/gone', 'x\n'), 'store.put');
    answer(await s.del('docs', 'workspace/gone'), 'store.delete');
    expect(version(db)).toBe('5');
    expect(await health(s)).toEqual(none);
  });

  it('[the-engine-r24] a file that is not a database reads error, the database unreadable, with the store absent', async () => {
    const { db, s } = at('text.db');
    writeFileSync(db, 'plain text, never an sqlite database\n');
    expect(await health(s)).toEqual({ driver: 'fts5', health: 'error', detail: 'database unreadable', store: 'absent' });
  });

  it.skipIf(ROOT_USER)('[the-engine-r24] a database file the driver cannot write reads error with the store present', async ({ onTestFinished }) => {
    const { db, s } = at('ro.db');
    answer(await s.put('docs', 'workspace/kept', 'x\n'), 'store.put');
    chmodPlant(db, 0o444, 0o644, onTestFinished);
    expect(await health(s)).toEqual({ driver: 'fts5', health: 'error', detail: 'database file not writable', store: 'present' });
  });

  it('[the-engine-r24] a database failing its integrity check reads error with the store present, while its store table still counts', async () => {
    const { db, s } = at('corrupt.db');
    answer(await s.put('docs', 'workspace/kept', 'x\n'), 'store.put');
    sqlite(db, 'PRAGMA wal_checkpoint(TRUNCATE);');
    const page = Number(sqlite(db, 'PRAGMA page_size;'));
    const root = Number(sqlite(db, "SELECT rootpage FROM sqlite_master WHERE name = 'store_docs';"));
    const fd = openSync(db, 'r+');
    writeSync(fd, Buffer.alloc(8, 0xff), 0, 8, (root - 1) * page);
    closeSync(fd);
    expect(sqlite(db, 'SELECT count(*) FROM store;').trim()).toBe('1');
    expect(await health(s)).toEqual({ driver: 'fts5', health: 'error', detail: 'database integrity check failed', store: 'present' });
  });
});

describe.skipIf(!fts5Available())('the fts5 store location', { concurrent: true }, () => {
  it.each([
    ['a workspace-relative path, under the workspace', '.contexture/elsewhere.db'],
    ['an absolute path, as given', 'absolute'],
  ])('[plugins-r12] the storage.database configuration key places the store at %s, never the default file', async (_, path) => {
    const sb = stage('fts5');
    dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
    const db = path === 'absolute' ? join(sandbox('placed'), 'store.db') : join(sb, path);
    appendFileSync(join(sb, '.contexture/config'), `storage.database: ${path === 'absolute' ? db : path}\n`);
    const s = store(sb, 'fts5');
    answer(await s.put('docs', 'workspace/placed', 'placed\n'), 'store.put');
    expect(sqlite(db, "SELECT key FROM store WHERE namespace = 'docs';").trim()).toBe('workspace/placed');
    expect(existsSync(join(sb, '.contexture/sessions.db'))).toBe(false);
    expect((await s.get('docs', 'workspace/placed')).stdout).toBe('placed\n');
  });
});
