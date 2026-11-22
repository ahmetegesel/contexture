import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '@support/ctx';
import { DOCS_SHAPED, dataFile } from '@support/data-file';
import { driverPath } from '@support/driver';
import { exec } from '@support/exec';
import { FTS5_DB, namespaceLock } from '@support/drawer';
import { holdLock } from '@support/locks';
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
  return { db, dir, sb, s: store(sb, 'fts5', { CTX_STORAGE_SQLITE_PATH: db }) };
}

const version = (db: string) => sqlite(db, 'PRAGMA user_version;').trim();
const tables = (db: string) => sqlite(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;").split('\n').filter(Boolean);
const backups = (dir: string, db: string) => readdirSync(dir).filter((n) => ![basename(db), `${basename(db)}-wal`, `${basename(db)}-shm`, `${basename(db)}-journal`].includes(n));
const digest = (db: string) => createHash('sha256').update(Buffer.concat([db, `${db}-wal`].filter(existsSync).map((p) => readFileSync(p)))).digest('hex');

const schemaRefusal = (v: number) => `the storage layer's database is at schema ${v}; this driver reads 5 and has no upgrade path: move the database aside and re-enter the record into a fresh one through the ctx verbs`;
async function health(s: ReturnType<typeof store>, namespace = 'docs'): Promise<{ driver: string; health: string; detail: string; store: string }> {
  const a = answer(await s.op('storage.health', [namespace]), 'storage.health');
  expect(a.detail, 'a health detail names no folder').not.toContain('/');
  return a;
}

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
      expect(await health(s)).toEqual({
        driver: 'fts5', health: 'error', detail: 'database at schema 4; this driver reads 5 and has no upgrade path', store: 'present',
      });
    }
  });
});

describe.skipIf(!fts5Available() || ROOT_USER)('the fts5 open refusals name no storage location', { concurrent: true }, () => {
  it('[the-engine-r21] a database file the driver cannot read refuses get and list rc 2 ERR_STORAGE_READ, cannot read the store, naming no folder', async ({ onTestFinished }) => {
    const { db, dir, s } = at('unreadable.db');
    answer(await s.put('docs', 'workspace/kept', 'x\n'), 'store.put');
    chmodPlant(db, 0o000, 0o644, onTestFinished);
    for (const [r, fn] of [[await s.get('docs', 'workspace/kept'), 'store.get'], [await s.list('docs'), 'store.list']] as const) {
      expect(r.stderr).not.toContain(dir);
      refused(r, fn, 2, 'ERR_STORAGE_READ', 'cannot read the storage layer\'s database');
    }
  });

  it('[the-engine-r21] an empty database file the driver cannot write refuses the first put rc 2 ERR_STORAGE_WRITE, cannot create the store, naming no folder', async ({ onTestFinished }) => {
    const { db, dir, s } = at('readonly.db');
    writeFileSync(db, '');
    chmodPlant(db, 0o444, 0o644, onTestFinished);
    const r = await s.put('docs', 'workspace/new', 'never lands\n');
    expect(r.stderr).not.toContain(dir);
    refused(r, 'store.put', 2, 'ERR_STORAGE_WRITE', 'cannot create the storage layer\'s database');
    expect(readFileSync(db).length).toBe(0);
  });
});

describe.skipIf(!fts5Available())('the fts5 storage.health over the database states', { concurrent: true }, () => {
  it('[the-engine-r24] a file with no table reads degraded with the store absent: the store is not made yet', async () => {
    const { db, s } = at('notable.db');
    writeFileSync(db, '');
    expect(await health(s)).toEqual({ driver: 'fts5', health: 'degraded', detail: 'database present, its schema not laid yet (the first store read or write lays it)', store: 'absent' });
    answer(await s.op('store.list', ['docs']), 'store.list');
    expect(version(db)).toBe('5');
    expect(await health(s)).toMatchObject({ health: 'ok', store: 'absent' });
  });

  it('[the-engine-r24] a schema 5 store holding no key of the namespace reads ok with the store absent: its last key deleted, or only another namespace\'s keys', async () => {
    const { db, s } = at('nokey.db');
    const none = { driver: 'fts5', health: 'ok', detail: 'database present and writable, no key of the namespace stored yet', store: 'absent' };
    answer(await s.put('docs', 'workspace/gone', 'x\n'), 'store.put');
    answer(await s.del('docs', 'workspace/gone'), 'store.delete');
    expect(version(db)).toBe('5');
    expect(await health(s)).toEqual(none);
    answer(await s.put('docs', 'workspace/kept', 'x\n'), 'store.put');
    expect(await health(s)).toEqual({ driver: 'fts5', health: 'ok', detail: 'database present and writable', store: 'present' });
    expect(await health(s, 'unit')).toEqual(none);
  });

  it('[the-engine-r24] counts the named namespace\'s keys and its lock alone: a held unit lock reads locked with the store absent over a docs-only store', async () => {
    const { sb, s } = at('scoped.db');
    answer(await s.put('docs', 'workspace/kept', 'x\n'), 'store.put');
    holdLock(sb, namespaceLock('unit'), 'live');
    expect(await health(s, 'unit')).toEqual({ driver: 'fts5', health: 'locked', detail: "the storage layer's namespace 'unit' is locked by a writer", store: 'absent' });
    expect(await health(s)).toMatchObject({ health: 'ok', store: 'present' });
  });

  it('[the-engine-r24] a file that is not a database reads error, the database unreadable, with the store absent', async () => {
    const { db, s } = at('text.db');
    writeFileSync(db, 'plain text, never an sqlite database\n');
    expect(await health(s)).toEqual({ driver: 'fts5', health: 'error', detail: 'database unreadable', store: 'absent' });
  });

  it.skipIf(ROOT_USER)('[the-engine-r24] a database file the driver cannot write reads error with the namespace\'s true presence, ahead of a held lock', async ({ onTestFinished }) => {
    const { db, sb, s } = at('ro.db');
    answer(await s.put('docs', 'workspace/kept', 'x\n'), 'store.put');
    chmodPlant(db, 0o444, 0o644, onTestFinished);
    holdLock(sb, namespaceLock('docs'), 'live');
    expect(await health(s)).toEqual({ driver: 'fts5', health: 'error', detail: 'database file not writable', store: 'present' });
    expect(await health(s, 'unit')).toEqual({ driver: 'fts5', health: 'error', detail: 'database file not writable', store: 'absent' });
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
    expect(existsSync(join(sb, FTS5_DB))).toBe(false);
    expect((await s.get('docs', 'workspace/placed')).stdout).toBe('placed\n');
  });

  it('[plugins-r12] a relative storage.database value resolves against the workspace root, so a call from a folder under it writes the same store', async () => {
    const sb = stage('fts5');
    dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
    appendFileSync(join(sb, '.contexture/config'), 'storage.database: .contexture/elsewhere.db\n');
    mkdirSync(join(sb, 'sub/folder'), { recursive: true });
    answer(await exec('sh', ['-c', 'cd sub/folder && exec "$0" store.put docs workspace/nested', driverPath(sb, 'fts5')], { cwd: sb, input: 'nested\n' }), 'store.put');
    expect(sqlite(join(sb, '.contexture/elsewhere.db'), "SELECT key FROM store WHERE namespace = 'docs';").trim()).toBe('workspace/nested');
    expect(existsSync(join(sb, 'sub/folder/.contexture'))).toBe(false);
  });

  it('[plugins-r12] reads quoted and commented storage.database, legacy session.storage.database, and storage.conf fallback while ignoring subkeys', async () => {
    const sb1 = stage('fts5');
    dataFile(sb1, 'extensions', 'docs', DOCS_SHAPED);
    appendFileSync(
      join(sb1, '.contexture/config'),
      'storage.database.extra: .contexture/wrong.db\nstorage.database = ".contexture/my custom.db" # inline comment\n',
    );
    const s1 = store(sb1, 'fts5');
    answer(await s1.put('docs', 'workspace/q', 'quoted\n'), 'store.put');
    expect(sqlite(join(sb1, '.contexture/my custom.db'), "SELECT key FROM store WHERE namespace = 'docs';").trim()).toBe('workspace/q');
    expect(existsSync(join(sb1, FTS5_DB))).toBe(false);

    const sb2 = stage('fts5');
    dataFile(sb2, 'extensions', 'docs', DOCS_SHAPED);
    appendFileSync(join(sb2, '.contexture/config'), "session.storage.database: '.contexture/legacy-cfg.db' # legacy\n");
    const s2 = store(sb2, 'fts5');
    answer(await s2.put('docs', 'workspace/leg', 'legacy\n'), 'store.put');
    expect(sqlite(join(sb2, '.contexture/legacy-cfg.db'), "SELECT key FROM store WHERE namespace = 'docs';").trim()).toBe('workspace/leg');
    expect(existsSync(join(sb2, FTS5_DB))).toBe(false);

    const sb3 = stage('fts5');
    dataFile(sb3, 'extensions', 'docs', DOCS_SHAPED);
    writeFileSync(join(sb3, '.contexture/storage.conf'), 'session.storage.database = ".contexture/conf-fallback.db" # fallback\n');
    const s3 = store(sb3, 'fts5');
    answer(await s3.put('docs', 'workspace/fb', 'fallback\n'), 'store.put');
    expect(sqlite(join(sb3, '.contexture/conf-fallback.db'), "SELECT key FROM store WHERE namespace = 'docs';").trim()).toBe('workspace/fb');
    expect(existsSync(join(sb3, FTS5_DB))).toBe(false);
  });

  it('[plugins-r12] ctx store config declares database without default path leak and drives storage.database set/get/unset', async () => {
    const sb = stage('fts5');
    dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
    const dbFileName = FTS5_DB.split('/').pop()!;

    const schemaText = await ctx(sb, 'store', 'config', 'schema');
    expect([schemaText.code, schemaText.stderr]).toEqual([0, '']);
    expect(schemaText.stdout).toContain('database: optional path');
    expect(schemaText.stdout).not.toContain(FTS5_DB);
    expect(schemaText.stdout).not.toContain(dbFileName);

    const schemaJson = await ctx(sb, 'store', 'config', 'schema', '--json');
    expect([schemaJson.code, schemaJson.stderr]).toEqual([0, '']);
    const parsedSchema = JSON.parse(schemaJson.stdout);
    const dbEntry = parsedSchema.schemas[0].keys.find((k: { key: string }) => k.key === 'database');
    expect(dbEntry).toMatchObject({ key: 'database', full_key: 'storage.database', presence: 'optional', type: 'path' });
    expect(dbEntry).not.toHaveProperty('default');
    expect(schemaJson.stdout).not.toContain(dbFileName);

    const setRes = await ctx(sb, 'store', 'config', 'set', 'database', '.contexture/configured.db');
    expect([setRes.code, setRes.stderr]).toEqual([0, '']);
    const getRes = await ctx(sb, 'store', 'config', 'get', 'database');
    expect([getRes.code, getRes.stdout, getRes.stderr]).toEqual([0, '.contexture/configured.db\n', '']);

    const s = store(sb, 'fts5');
    answer(await s.put('docs', 'workspace/cfg', 'via config\n'), 'store.put');
    expect(sqlite(join(sb, '.contexture/configured.db'), "SELECT key FROM store WHERE namespace = 'docs';").trim()).toBe('workspace/cfg');
    expect(existsSync(join(sb, FTS5_DB))).toBe(false);

    const unsetRes = await ctx(sb, 'store', 'config', 'unset', 'database');
    expect([unsetRes.code, unsetRes.stderr]).toEqual([0, '']);
    const getAfter = await ctx(sb, 'store', 'config', 'get', 'database');
    expect(getAfter.code).toBe(1);
  });

  it('[plugins-r12] resolves relative MODULE_DIR/../../../../config-lib when workspace lacks config-lib, and falls back inline when config-lib is absent', async () => {
    // 1. Sub-workspace has .contexture/config without config-lib, while driver's MODULE_DIR/../../../../config-lib exists
    const sb = stage('fts5');
    const subWs = join(sb, 'sub/ws');
    mkdirSync(join(subWs, '.contexture/modules'), { recursive: true });
    symlinkSync(join(sb, '.contexture/storage'), join(subWs, '.contexture/storage'));
    dataFile(subWs, 'extensions', 'docs', DOCS_SHAPED);
    // Use an escaped quote that cfg_get_file decodes properly (distinguishing config-lib from the simple inline fallback)
    writeFileSync(join(subWs, '.contexture/config'), 'storage.database: ".contexture/sub \\"q\\".db"\n');
    const viaModLib = await exec(driverPath(sb, 'fts5'), ['store.put', 'docs', 'workspace/modlib'], { cwd: subWs, input: 'modlib\n' });
    answer(viaModLib, 'store.put');
    expect(sqlite(join(subWs, '.contexture/sub "q".db'), "SELECT key FROM store WHERE namespace = 'docs';").trim()).toBe('workspace/modlib');

    // 2. When config-lib is absent everywhere, the inline fallback still reads storage.database and storage.conf
    const sbNoLib = stage('fts5');
    dataFile(sbNoLib, 'extensions', 'docs', DOCS_SHAPED);
    rmSync(join(sbNoLib, '.contexture/config-lib'));
    appendFileSync(join(sbNoLib, '.contexture/config'), 'storage.database: ".contexture/inline.db" # comment\n');
    const s = store(sbNoLib, 'fts5');
    answer(await s.put('docs', 'workspace/inline', 'inline\n'), 'store.put');
    expect(sqlite(join(sbNoLib, '.contexture/inline.db'), "SELECT key FROM store WHERE namespace = 'docs';").trim()).toBe('workspace/inline');
    expect(existsSync(join(sbNoLib, FTS5_DB))).toBe(false);
  });
});
