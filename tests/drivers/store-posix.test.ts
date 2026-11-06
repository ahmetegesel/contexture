import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { SEARCH_DATA } from '../support/search-fixture';
import { fresh } from '../support/snapshot';
import { stage } from '../support/stage';
import { DOCS_KEYS, docsStore, listAnswer, store } from '../support/store';
import { answer, refused } from '../support/wire';

function plant(sb: string, rel: string, bytes: string | Buffer): void {
  mkdirSync(dirname(join(sb, rel)), { recursive: true });
  writeFileSync(join(sb, rel), bytes);
}

describe('the posix store on disk', { concurrent: true }, () => {
  let empty: string;
  beforeAll(async () => {
    empty = await docsStore('posix', false);
  });

  it('[modules-r10] admits only the files the docs pattern names: one segment, three segments, a wrong suffix, and a blank are never keys', async () => {
    const sb = fresh(empty);
    for (const [key, value] of DOCS_KEYS) plant(sb, `docs/${key}.md`, value);
    for (const rel of ['docs/top.md', 'docs/workspace/deep/x.md', 'docs/workspace/notes.txt', 'docs/workspace/bad name.md']) plant(sb, rel, 'x\n');
    expect((await store(sb, 'posix').list('docs')).stdout).toBe(listAnswer('docs', DOCS_KEYS.map(([k]) => k)));
  });

  it('[modules-r10] maps a key to <root>/<key><suffix>, a payload with no trailing newline included', async () => {
    const sb = fresh(empty);
    answer(await store(sb, 'posix').put('docs', 'workspace/nonl', 'no trailing newline'), 'store.put');
    expect(readFileSync(join(sb, 'docs/workspace/nonl.md'), 'utf8')).toBe('no trailing newline');
  });

  it('[modules-r10] maps the minimum declaration to <namespace>/<key> with an empty suffix', async () => {
    const sb = fresh(empty);
    dataFile(sb, 'modules', 'minimal', 'namespace: minimal\nkey: <a>/<b>\n');
    answer(await store(sb, 'posix').put('minimal', 'a/b', 'x\n'), 'store.put');
    expect(readFileSync(join(sb, 'minimal/a/b'), 'utf8')).toBe('x\n');
  });

  it('[modules-r10] maps the unit keys under .contexture/sessions and never lists a stray file there', async () => {
    const sb = fresh(empty);
    const s = store(sb, 'posix');
    answer(await s.put('unit', 'storage/state', 'x\n'), 'store.put');
    answer(await s.put('unit', 'storage/lanes/foo/report', 'unit-lane\n'), 'store.put');
    expect(existsSync(join(sb, '.contexture/sessions/storage/state.md'))).toBe(true);
    expect(existsSync(join(sb, '.contexture/sessions/storage/lanes/foo/report.md'))).toBe(true);
    plant(sb, '.contexture/sessions/stray.md', 'stray\n');
    expect((await s.list('unit')).stdout).toBe(listAnswer('unit', ['storage/lanes/foo/report', 'storage/state']));
  });

  it('[the-engine-r19] keeps no change log, even for a namespace that declares one', async () => {
    refused(await store(fresh(empty), 'posix').changes('docs'), 'store.changes', 1, 'ERR_CAPABILITY_UNSUPPORTED',
      "the posix store keeps no change log; namespace 'docs' reports its delta through its module (changes: true)");
  });

  it('[modules-r10] refuses a ranked mode by name, and a mode the module does not declare by its declaration', async () => {
    const sb = fresh(empty);
    dataFile(sb, 'modules', 'searchdoc', SEARCH_DATA.searchdoc);
    dataFile(sb, 'modules', 'exactonly', 'namespace: exactonly\nroot: exact-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nmodes: exact\n');
    const s = store(sb, 'posix');
    refused(await s.search('searchdoc', 'hybrid', '20', 'query=needle\n'), 'store.search', 1, 'ERR_CAPABILITY_UNSUPPORTED', "mode 'hybrid' is not supported; declared modes: exact");
    refused(await s.search('exactonly', 'hybrid', '20', 'query=needle\n'), 'store.search', 1, 'ERR_CAPABILITY_UNSUPPORTED',
      "mode 'hybrid' is not declared by namespace 'exactonly'; declared modes: exact");
  });

  it('[the-engine-r19, modules-r10] scans planted files bytewise, admitting only the pattern\'s keys, a binary value in base64', async () => {
    const sb = fresh(empty);
    dataFile(sb, 'modules', 'scanprobe', 'namespace: scanprobe\nroot: scan-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n');
    const values: [string, Buffer][] = [['x/B', Buffer.from('B\n')], ['x/a', Buffer.from('a\n')], ['x/aa', Buffer.from('aa\n')], ['x/bin', Buffer.from([0x61, 0, 0x62, 0xff])]];
    for (const [key, value] of values) plant(sb, `scan-root/${key}.txt`, value);
    plant(sb, 'scan-root/x/y/z.txt', 'three segments\n');
    plant(sb, 'scan-root/top.txt', 'one segment\n');
    expect((await store(sb, 'posix').scan('scanprobe')).stdout).toBe(
      `${JSON.stringify({ namespace: 'scanprobe', items: values.map(([key, v]) => ({ key, value_b64: v.toString('base64') })) })}\n`);
  });

  it.skipIf(ROOT_USER)('[the-engine-r21] refuses a scan meeting an unreadable file, naming its key, with no partial answer', async ({ onTestFinished }) => {
    const sb = fresh(empty);
    dataFile(sb, 'modules', 'scanprobe', 'namespace: scanprobe\nroot: scan-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n');
    plant(sb, 'scan-root/x/a.txt', 'a\n');
    plant(sb, 'scan-root/x/ro.txt', 'unreadable\n');
    chmodPlant(join(sb, 'scan-root/x/ro.txt'), 0o000, 0o600, onTestFinished);
    refused(await store(sb, 'posix').scan('scanprobe'), 'store.scan', 2, 'ERR_STORAGE_READ', "cannot read key 'x/ro' in namespace 'scanprobe'");
  });

  it('[the-engine-r24] reports its health: degraded with no sessions folder, ok and absent when empty, ok and present once written', async () => {
    const sb = stage('posix');
    const health = async () => answer(await store(sb, 'posix').op('storage.health', []), 'storage.health');
    expect((await health()).health).toBe('degraded');
    mkdirSync(join(sb, '.contexture/sessions'));
    expect(await health()).toEqual({ driver: 'posix', health: 'ok', detail: 'sessions directory writable, no artifact stored yet', store: 'absent' });
    answer(await store(sb, 'posix').put('unit', 'u/state', 'x\n'), 'store.put');
    expect(await health()).toEqual({ driver: 'posix', health: 'ok', detail: 'sessions directory writable, unlocked', store: 'present' });
  });

  it.skipIf(ROOT_USER)('[the-engine-r24] reports an error when the sessions folder is not writable', async ({ onTestFinished }) => {
    const sb = stage('posix');
    mkdirSync(join(sb, '.contexture/sessions'));
    chmodPlant(join(sb, '.contexture/sessions'), 0o555, 0o755, onTestFinished);
    expect(answer(await store(sb, 'posix').op('storage.health', []), 'storage.health')).toEqual({
      driver: 'posix', health: 'error', detail: 'sessions directory is not writable', store: 'absent',
    });
  });
});
