import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile } from '@support/data-file';
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

describe.skipIf(!fts5Available())('the fts5 store schema', { concurrent: true }, () => {
  it('an absent store: the first write lays schema 5, store-only, with no backup', async () => {
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

  it.each([4, 0, 6])('a store at version %i: get, list, and put refuse rc 2 naming it, the file untouched, no backup', async (v) => {
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
