import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { FALLBACK_ROOT, FTS5_DB, RECORD_ROOT } from '../support/drawer';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { fresh, seed } from '../support/snapshot';
import { fts5Available, stage } from '../support/stage';
import { batchPayload, listAnswer, store } from '../support/store';
import { answer, refused } from '../support/wire';

const LEGACY = 'namespace: legacy\nroot: new-root\nfallback_root: old-root\nsuffix: .md\nkey: <u>/<path...>\n';
const notice = (fn: string) => `${fn}: notice: namespace 'legacy' was read from its deprecated fallback root\n`;

function plant(sb: string, rel: string, text: string): void {
  mkdirSync(dirname(join(sb, rel)), { recursive: true });
  writeFileSync(join(sb, rel), text);
}

function twoRoots(sb: string): void {
  plant(sb, 'new-root/a/state.md', 'new a\n');
  plant(sb, 'old-root/a/state.md', 'old a\n');
  plant(sb, 'old-root/b/state.md', 'old b\n');
}

describe('the posix fallback root: reads after the root, writes to the root alone, and the promotion', { concurrent: true }, () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      dataFile(sb, 'modules', 'legacy', LEGACY);
    }, 'posix', 'fallback');
  });

  it('[the-engine-r-b3r6t] a get reads the root first, then the fallback, with one notice line only when the fallback served the key', async () => {
    const sb = fresh(snap);
    twoRoots(sb);
    const s = store(sb, 'posix');
    expect(await s.get('legacy', 'a/state')).toMatchObject({ code: 0, stdout: 'new a\n', stderr: '' });
    expect(await s.get('legacy', 'b/state')).toMatchObject({ code: 0, stdout: 'old b\n', stderr: notice('store.get') });
  });

  it('[the-engine-r-b3r6t] a list answers the union once per key in bytewise order, the notice only when a key came from the fallback alone', async () => {
    const sb = fresh(snap);
    twoRoots(sb);
    const s = store(sb, 'posix');
    expect(await s.list('legacy')).toMatchObject({ code: 0, stdout: listAnswer('legacy', ['a/state', 'b/state']), stderr: notice('store.list') });
    expect(await s.list('legacy', 'a/')).toMatchObject({ code: 0, stdout: listAnswer('legacy', ['a/state']), stderr: '' });
    expect(await s.list('legacy', 'b/')).toMatchObject({ code: 0, stdout: listAnswer('legacy', ['b/state']), stderr: notice('store.list') });
  });

  it('[the-engine-r-b3r6t] a list over a fallback alone, the root not made, still answers its keys', async () => {
    const sb = fresh(snap);
    plant(sb, 'old-root/b/state.md', 'old b\n');
    expect(await store(sb, 'posix').list('legacy')).toMatchObject({ code: 0, stdout: listAnswer('legacy', ['b/state']), stderr: notice('store.list') });
  });

  it('[the-engine-r-b3r6t] a scan and an exact search read each key where a get would, with one notice line', async () => {
    const sb = fresh(snap);
    twoRoots(sb);
    const s = store(sb, 'posix');
    const scan = await s.scan('legacy');
    expect([scan.code, scan.stderr]).toEqual([0, notice('store.scan')]);
    const items = JSON.parse(scan.stdout).items.map((i: { key: string; value_b64: string }) => [i.key, Buffer.from(i.value_b64, 'base64').toString()]);
    expect(items).toEqual([['a/state', 'new a\n'], ['b/state', 'old b\n']]);
    const search = await s.search('legacy', 'exact', '0', 'query=old\n');
    expect([search.code, search.stderr]).toEqual([0, notice('store.search')]);
    expect(JSON.parse(search.stdout).results.map((r: { entity_id: string }) => r.entity_id)).toEqual(['b/state']);
  });

  it('[the-engine-r-b3r6t] a refusal on a namespace with a fallback keeps its one line and prints no notice', async () => {
    const sb = fresh(snap);
    twoRoots(sb);
    refused(await store(sb, 'posix').get('legacy', 'b/missing'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'b/missing' not found in namespace 'legacy'");
  });

  it('[the-engine-r-b3r6t] a put writes the root alone, and the root\'s copy then shadows the fallback\'s', async () => {
    const sb = fresh(snap);
    twoRoots(sb);
    const s = store(sb, 'posix');
    answer(await s.put('legacy', 'b/state', 'new b\n'), 'store.put');
    expect(readFileSync(join(sb, 'new-root/b/state.md'), 'utf8')).toBe('new b\n');
    expect(readFileSync(join(sb, 'old-root/b/state.md'), 'utf8')).toBe('old b\n');
    expect(await s.get('legacy', 'b/state')).toMatchObject({ code: 0, stdout: 'new b\n', stderr: '' });
  });

  it('[the-engine-r-b3r6t] a delete removes the key from both roots, so no old value resurfaces, and a fallback alone key deletes too', async () => {
    const sb = fresh(snap);
    twoRoots(sb);
    const s = store(sb, 'posix');
    answer(await s.del('legacy', 'a/state'), 'store.delete');
    expect([existsSync(join(sb, 'new-root/a/state.md')), existsSync(join(sb, 'old-root/a/state.md'))]).toEqual([false, false]);
    refused(await s.get('legacy', 'a/state'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'a/state' not found in namespace 'legacy'");
    answer(await s.del('legacy', 'b/state'), 'store.delete');
    expect(existsSync(join(sb, 'old-root/b/state.md'))).toBe(false);
  });

  it('[the-engine-r-b3r6t] a batch puts to the root alone and its delete removes both copies', async () => {
    const sb = fresh(snap);
    twoRoots(sb);
    const s = store(sb, 'posix');
    answer(await s.batch('legacy', batchPayload([{ action: 'delete', key: 'a/state' }, { action: 'put', key: 'b/journal', value: 'j\n' }, { action: 'delete', key: 'b/state' }])), 'store.batch');
    expect(['new-root/a/state.md', 'old-root/a/state.md', 'old-root/b/state.md', 'old-root/b/journal.md'].map((p) => existsSync(join(sb, p)))).toEqual([false, false, false, false]);
    expect(readFileSync(join(sb, 'new-root/b/journal.md'), 'utf8')).toBe('j\n');
  });

  it('[the-engine-r-b3r6t] store.promote moves a whole prefix from the fallback to the root in one rename, its residue with it, making the root', async () => {
    const sb = fresh(snap);
    plant(sb, 'old-root/b/state.md', 'old b\n');
    plant(sb, 'old-root/b/lanes/l/report.md', 'report\n');
    plant(sb, 'old-root/b/.tmp.residue', 'a killed writer residue\n');
    const s = store(sb, 'posix');
    expect(answer(await s.op('store.promote', ['legacy', 'b/']), 'store.promote')).toEqual({ namespace: 'legacy', prefix: 'b/', state: 'moved' });
    expect(['new-root/b/state.md', 'new-root/b/lanes/l/report.md', 'new-root/b/.tmp.residue'].map((p) => existsSync(join(sb, p)))).toEqual([true, true, true]);
    expect(existsSync(join(sb, 'old-root/b'))).toBe(false);
    expect(await s.get('legacy', 'b/state')).toMatchObject({ code: 0, stdout: 'old b\n', stderr: '' });
  });

  it('[the-engine-r-b3r6t] store.promote answers none when the fallback holds nothing for the prefix or the namespace declares no fallback', async () => {
    const sb = fresh(snap);
    plant(sb, 'new-root/a/state.md', 'new a\n');
    dataFile(sb, 'modules', 'plain', 'namespace: plain\nkey: <u>/<path...>\n');
    const s = store(sb, 'posix');
    expect(answer(await s.op('store.promote', ['legacy', 'a/']), 'store.promote')).toEqual({ namespace: 'legacy', prefix: 'a/', state: 'none' });
    expect(answer(await s.op('store.promote', ['plain', 'a/']), 'store.promote')).toEqual({ namespace: 'plain', prefix: 'a/', state: 'none' });
  });

  it('[the-engine-r-b3r6t] store.promote refuses rc 1 ERR_ENTITY_EXISTS when the root already holds the prefix, moving nothing', async () => {
    const sb = fresh(snap);
    twoRoots(sb);
    refused(await store(sb, 'posix').op('store.promote', ['legacy', 'a/']), 'store.promote', 1, 'ERR_ENTITY_EXISTS', "key prefix 'a/' is held in both roots of namespace 'legacy'");
    expect([readFileSync(join(sb, 'new-root/a/state.md'), 'utf8'), readFileSync(join(sb, 'old-root/a/state.md'), 'utf8')]).toEqual(['new a\n', 'old a\n']);
  });

  it.each([
    ['a prefix without its slash', ['legacy', 'b'], "malformed key prefix 'b' (whole key segments ending in a slash)"],
    ['a dot segment', ['legacy', '../b/'], "malformed key prefix '../b/' (whole key segments ending in a slash)"],
    ['a missing prefix', ['legacy'], 'store.promote takes the namespace and a key prefix ending in a slash'],
  ])('[the-engine-r-b3r6t] store.promote refuses %s rc 1', async (_, args, message) => {
    refused(await store(fresh(snap), 'posix').op('store.promote', args), 'store.promote', 1, 'ERR_INVALID_ARGUMENT', message);
  });

  it('[the-engine-r24] the health counts the fallback: a namespace held only in its fallback reads ok and present, neither root made reads degraded', async () => {
    const sb = fresh(snap);
    expect(answer(await store(sb, 'posix').op('storage.health', ['legacy']), 'storage.health')).toMatchObject({ health: 'degraded', store: 'absent' });
    plant(sb, 'old-root/b/state.md', 'old b\n');
    expect(answer(await store(sb, 'posix').op('storage.health', ['legacy']), 'storage.health')).toEqual({ driver: 'posix', health: 'ok', detail: 'the store is writable and unlocked', store: 'present' });
  });

  it.skipIf(ROOT_USER)('[the-engine-r24] an unwritable fallback root reads error with its presence, an unreadable one error with the store absent', async ({ onTestFinished }) => {
    const sb = fresh(snap);
    plant(sb, 'new-root/a/state.md', 'new a\n');
    plant(sb, 'old-root/b/state.md', 'old b\n');
    chmodPlant(join(sb, 'old-root'), 0o555, 0o755, onTestFinished);
    expect(answer(await store(sb, 'posix').op('storage.health', ['legacy']), 'storage.health')).toEqual({ driver: 'posix', health: 'error', detail: 'the store is not writable', store: 'present' });
    chmodPlant(join(sb, 'old-root'), 0o311, 0o755, onTestFinished);
    expect(answer(await store(sb, 'posix').op('storage.health', ['legacy']), 'storage.health')).toEqual({ driver: 'posix', health: 'error', detail: 'the store is not readable', store: 'absent' });
  });
});

describe.skipIf(!fts5Available())('the fts5 store and the posix roots', () => {
  it('[the-engine-r-b3r6t, plugins-p3] files planted under the record\'s root and its fallback root stay invisible to fts5, and its database keeps its name', async () => {
    const sb = stage('fts5', 'fallback-fts5');
    for (const root of [RECORD_ROOT, FALLBACK_ROOT]) plant(sb, `${root}/u/state.md`, `planted under ${root}\n`);
    const s = store(sb, 'fts5');
    expect(await s.list('unit')).toMatchObject({ code: 0, stdout: listAnswer('unit', []), stderr: '' });
    refused(await s.get('unit', 'u/state'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'u/state' not found in namespace 'unit'");
    answer(await s.put('unit', 'v/state', 'stored\n'), 'store.put');
    expect(await s.list('unit')).toMatchObject({ code: 0, stdout: listAnswer('unit', ['v/state']), stderr: '' });
    expect(existsSync(join(sb, FTS5_DB))).toBe(true);
    expect(existsSync(join(sb, RECORD_ROOT, 'v'))).toBe(false);
  });
});
