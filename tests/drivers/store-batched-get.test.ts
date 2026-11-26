import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { exec } from '../support/exec';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { moduleCall } from '../support/sh';
import { fresh } from '../support/snapshot';
import { DRIVERS, sqliteAvailable } from '../support/stage';
import { docsStore, plantScript, store } from '../support/store';
import { answer, refused } from '../support/wire';

const LIBRARY = '.contexture/storage/scripts/library';
const RICH = Buffer.from('say "hi" \\ back\\n\ttab\rcr\u0001one\u001fus\u007fdel çay\nnext line');
const RICH_JSON = 'say \\"hi\\" \\\\ back\\\\n\\ttab\\rcr\\u0001one\\u001fus\u007fdel çay\\nnext line';
const ASKED = ['workspace/u_n-1', 'workspace/a', 'workspace/missing', 'workspace/binary', 'workspace/q.uote', 'workspace/a'];
const ASKED_ANSWER = '{"namespace":"docs","items":[{"key":"workspace/u_n-1","value":"turkce\\n"},{"key":"workspace/a","value":"a\\n"},{"key":"workspace/missing","missing":true},{"key":"workspace/binary","value_b64":"YQBi/w=="},{"key":"workspace/q.uote","value":"quote\\n"},{"key":"workspace/a","value":"a\\n"}]}\n';

const lib = (sb: string, fn: string, args: string[] = []) => moduleCall(sb, 'docs', join(sb, LIBRARY), fn, args, { input: '', env: { CTX_STORE_ROOT: sb }, root: 'extensions' });

function targets(sb: string, name: string, keys: readonly string[]): { file: string; paths: string[] } {
  const dir = join(sb, 'into', name);
  mkdirSync(dir, { recursive: true });
  const paths = keys.map((_, i) => join(dir, `v${i + 1}`));
  const file = join(dir, 'targets');
  writeFileSync(file, keys.map((k, i) => `${k}\t${paths[i]}\n`).join(''));
  return { file, paths };
}

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'sqlite' && !sqliteAvailable())(`the batched store.get on ${driver}`, { concurrent: true }, () => {
    let empty: string;
    let keyed: string;
    beforeAll(async () => {
      [empty, keyed] = await Promise.all([docsStore(driver, false), docsStore(driver, true)]);
    });

    it('[the-engine-r19] one key answers the raw bytes as before, and two or more answer one compact line, one item per asked key in the asked order', async () => {
      const s = store(fresh(keyed), driver);
      expect((await s.get('docs', 'workspace/binary')).bytes.equals(Buffer.from([0x61, 0x00, 0x62, 0xff]))).toBe(true);
      const r = await s.op('store.get', ['docs', ...ASKED]);
      expect([r.code, r.stderr]).toEqual([0, '']);
      expect(r.stdout).toBe(ASKED_ANSWER);
      expect(JSON.parse(r.stdout).items.map((i: { key: string }) => i.key)).toEqual(ASKED);
    });

    it('[the-engine-r19] a value travels as a JSON string escaping the backslash, the quote, and every control byte, a missing key marked, never refusing the batch', async () => {
      const s = store(fresh(empty), driver);
      answer(await s.put('docs', 'workspace/rich', RICH), 'store.put');
      answer(await s.put('docs', 'workspace/void', ''), 'store.put');
      const r = await s.op('store.get', ['docs', 'workspace/rich', 'workspace/void', 'workspace/gone']);
      expect([r.code, r.stderr]).toEqual([0, '']);
      expect(r.stdout).toBe(`{"namespace":"docs","items":[{"key":"workspace/rich","value":"${RICH_JSON}"},{"key":"workspace/void","value":""},{"key":"workspace/gone","missing":true}]}\n`);
      const none = await s.op('store.get', ['docs', 'workspace/x', 'workspace/y']);
      expect(none.stdout).toBe('{"namespace":"docs","items":[{"key":"workspace/x","missing":true},{"key":"workspace/y","missing":true}]}\n');
    });

    it('[the-engine-r19] an ASCII case twin of a stored key reads missing, the exact key alone answering', async () => {
      const s = store(fresh(keyed), driver);
      const r = await s.op('store.get', ['docs', 'workspace/A', 'workspace/b', 'workspace/B']);
      expect(r.stdout).toBe('{"namespace":"docs","items":[{"key":"workspace/A","missing":true},{"key":"workspace/b","missing":true},{"key":"workspace/B","value":"B\\n"}]}\n');
    });

    it('[the-engine-r19] a case twin of a stored key\'s folder reads missing in a batch, as the one key form refuses it, and a list under that folder prefix lists none', async () => {
      const s = store(fresh(keyed), driver);
      const r = await s.op('store.get', ['docs', 'Workspace/a', 'Workspace/B']);
      expect([r.code, r.stdout, r.stderr]).toEqual([0, '{"namespace":"docs","items":[{"key":"Workspace/a","missing":true},{"key":"Workspace/B","missing":true}]}\n', '']);
      refused(await s.op('store.get', ['docs', 'Workspace/a']), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'Workspace/a' not found in namespace 'docs'");
      expect(await s.op('store.list', ['docs', 'Workspace/'])).toMatchObject({ code: 0, stdout: '{"namespace":"docs","keys":[]}\n', stderr: '' });
    });

    it('[the-engine-r19] a case twin of one folder among the folders a batch spans reads missing, the folder in its stored spelling answering', async () => {
      const s = store(fresh(keyed), driver);
      answer(await s.put('docs', 'other/c', 'c\n'), 'store.put');
      const r = await s.op('store.get', ['docs', 'Workspace/a', 'workspace/a', 'Other/c', 'other/c']);
      expect([r.code, r.stdout, r.stderr]).toEqual([0, '{"namespace":"docs","items":[{"key":"Workspace/a","missing":true},{"key":"workspace/a","value":"a\\n"},{"key":"Other/c","missing":true},{"key":"other/c","value":"c\\n"}]}\n', '']);
    });

    it('[the-engine-r19, the-engine-r21] a value holding a NUL byte its encoder cannot read whole refuses the batch rc 2 naming the key, never packing part of it', async () => {
      const sb = fresh(keyed);
      plantScript(sb, 'store-b64', "printf 'YQ'\nexit 2");
      refused(await store(sb, driver).op('store.get', ['docs', 'workspace/a', 'workspace/binary']), 'store.get', 2, 'ERR_STORAGE_READ', "cannot read key 'workspace/binary' in namespace 'docs'");
    });

    it.each([
      [['docs'], 'store.get takes the namespace and the key'],
      [['docs', 'workspace/a', 'bad key'], "malformed key 'bad key'"],
      [['docs', 'workspace/a', 'workspace'], "key 'workspace' does not match the namespace pattern '<repo>/<slug>'"],
      [['docs', '/workspace/a', 'workspace/a'], "malformed key '/workspace/a'"],
    ] as const)('[the-engine-r9, the-engine-r21] store.get %j refuses rc 1 with the one key form\'s line, nothing on stdout', async (args, message) => {
      refused(await store(fresh(keyed), driver).op('store.get', [...args]), 'store.get', 1, 'ERR_INVALID_ARGUMENT', message);
    });

    it('[the-engine-r19] store_get_into writes each present value byte for byte and names every asked key present or absent, in order', async () => {
      const sb = fresh(keyed);
      const s = store(sb, driver);
      answer(await s.put('docs', 'workspace/rich', RICH), 'store.put');
      const keys = ['workspace/rich', 'workspace/gone', 'workspace/binary', 'workspace/q.uote'];
      const t = targets(sb, 'many', keys);
      const r = await lib(sb, 'store_get_into', [t.file]);
      expect([r.code, r.stdout, r.stderr]).toEqual([0, '1\tworkspace/rich\n0\tworkspace/gone\n1\tworkspace/binary\n1\tworkspace/q.uote\n', '']);
      expect(readFileSync(t.paths[0]!).equals(RICH)).toBe(true);
      expect(readFileSync(t.paths[2]!).equals(Buffer.from([0x61, 0x00, 0x62, 0xff]))).toBe(true);
      expect(readFileSync(t.paths[3]!, 'utf8')).toBe('quote\n');
      const one = targets(sb, 'one', ['workspace/a']);
      expect((await lib(sb, 'store_get_into', [one.file])).stdout).toBe('1\tworkspace/a\n');
      expect(readFileSync(one.paths[0]!, 'utf8')).toBe('a\n');
      const gone = targets(sb, 'gone', ['workspace/gone']);
      expect(await lib(sb, 'store_get_into', [gone.file])).toMatchObject({ code: 0, stdout: '0\tworkspace/gone\n', stderr: '' });
      const bad = targets(sb, 'bad', ['workspace/a', 'workspace']);
      refused(await lib(sb, 'store_get_into', [bad.file]), 'store.get', 1, 'ERR_INVALID_ARGUMENT', "key 'workspace' does not match the namespace pattern '<repo>/<slug>'");
    });
  });
}

describe('the batched store.get on posix alone', { concurrent: true }, () => {
  let keyed: string;
  beforeAll(async () => {
    keyed = await docsStore('posix', true);
  });

  it.skipIf(ROOT_USER)('[the-engine-r19, the-engine-r21] a present key that cannot be read refuses the batch rc 2 with the one key form\'s line, nothing on stdout', async ({ onTestFinished }) => {
    const sb = fresh(keyed);
    const s = store(sb, 'posix');
    answer(await s.put('docs', 'workspace/ro', 'ro\n'), 'store.put');
    chmodPlant(join(sb, 'docs/workspace/ro.md'), 0o000, 0o644, onTestFinished);
    const r = await s.op('store.get', ['docs', 'workspace/a', 'workspace/ro', 'workspace/aa']);
    expect(r.stderr).not.toContain('docs/workspace');
    refused(r, 'store.get', 2, 'ERR_STORAGE_READ', "cannot read key 'workspace/ro' in namespace 'docs'");
  });

  it('[the-engine-r19] a batched get whose value paths pass the system\'s argument limit answers every item, the codec sizing and reading them in runs', { timeout: 120_000 }, async () => {
    const sb = fresh(keyed);
    const max = Number((await exec('getconf', ['ARG_MAX'], { cwd: sb, input: '' })).stdout.trim());
    expect(max, 'the argument limit reads').toBeGreaterThan(0);
    const path = (key: string) => join(sb, 'docs', `${key}.md`);
    const n = Math.ceil((1.25 * max) / (path('workspace/k000000').length + 1));
    const keys = Array.from({ length: n }, (_, i) => `workspace/k${String(i).padStart(6, '0')}`);
    for (const key of keys) writeFileSync(path(key), `value of ${key}\n`);
    const r = await store(sb, 'posix').op('store.get', ['docs', ...keys]);
    expect([r.code, r.stderr]).toEqual([0, '']);
    const items: { key: string; value?: string }[] = JSON.parse(r.stdout).items;
    expect(items.length).toBe(n);
    expect(items.filter((item, i) => item.key !== keys[i] || item.value !== `value of ${keys[i]}\n`)).toEqual([]);
  });

  it('[the-engine-r-b3r6t] a key served from the declared fallback root answers with the one notice line, the root\'s copy shadowing', async () => {
    const sb = fresh(keyed);
    dataFile(sb, 'modules', 'legacy', 'root: new-root\nfallback_root: old-root\nkey: <u>/<a>\n');
    mkdirSync(join(sb, 'old-root/a'), { recursive: true });
    mkdirSync(join(sb, 'old-root/b'), { recursive: true });
    mkdirSync(join(sb, 'new-root/a'), { recursive: true });
    writeFileSync(join(sb, 'old-root/a/state'), 'old a\n');
    writeFileSync(join(sb, 'old-root/b/state'), 'old b\n');
    writeFileSync(join(sb, 'old-root/b/note'), 'old note\n');
    writeFileSync(join(sb, 'new-root/a/state'), 'new a\n');
    const r = await store(sb, 'posix').op('store.get', ['legacy', 'a/state', 'b/state', 'b/note', 'c/state']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('{"namespace":"legacy","items":[{"key":"a/state","value":"new a\\n"},{"key":"b/state","value":"old b\\n"},{"key":"b/note","value":"old note\\n"},{"key":"c/state","missing":true}]}\n');
    expect(r.stderr).toBe("store.get: notice: namespace 'legacy' was read from its deprecated fallback root\n");
    const quiet = await store(sb, 'posix').op('store.get', ['legacy', 'a/state', 'c/state']);
    expect([quiet.code, quiet.stderr]).toEqual([0, '']);
  });
});
