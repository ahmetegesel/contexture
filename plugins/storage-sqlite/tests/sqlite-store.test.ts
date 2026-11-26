import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile } from '@support/data-file';
import { SQLITE_DB } from '@support/drawer';
import { pathPlant } from '@support/plants';
import { sandbox } from '@support/sandbox';
import { SEARCH_DATA, SEARCH_VALUES } from '@support/search-fixture';
import { fresh, seed } from '@support/snapshot';
import { sqlite } from '@support/sqlite';
import { sqliteAvailable } from '@support/stage';
import { listAnswer, store } from '@support/store';
import { answer, refused } from '@support/wire';

const db = (sb: string) => join(sb, SQLITE_DB);
const rows = (sb: string, sql: string) => sqlite(db(sb), sql).split('\n').filter(Boolean);
const q = (query: string) => `query=${query}\n`;

const COUNTED = ['sqlite3', 'awk', 'sed', 'cat', 'od', 'base64', 'mktemp', 'rm', 'mkdir', 'rmdir', 'dirname', 'head', 'grep', 'tr', 'wc'] as const;

// countingPlant: every external command the driver spawns from COUNTED logs its name, then runs the real one
function countingPlant(): { env: Record<string, string>; count: () => number } {
  const dir = sandbox('count-plant');
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  for (const name of COUNTED) {
    const real = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();
    if (!real) continue;
    writeFileSync(join(dir, name), `#!/bin/sh\nprintf '%s\\n' ${name} >> "${log}"\nexec "${real}" "$@"\n`, { mode: 0o755 });
  }
  return { env: { PATH: `${dir}:${process.env.PATH ?? ''}` }, count: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).length };
}

describe.skipIf(!sqliteAvailable())('the sqlite store', { concurrent: true }, () => {
  let docs: string;
  let searched: string;
  let few: string;
  let many: string;
  beforeAll(async () => {
    const keyed = (n: number, label: string) => seed(async (sb) => {
      dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
      const actions = Array.from({ length: n }, (_, i) => ({ action: 'put' as const, key: `workspace/k${String(i).padStart(3, '0')}`, value: `value ${i} needle\n` }));
      answer(await store(sb, 'sqlite').batch('docs', actions), 'store.batch');
    }, 'sqlite', label);
    [docs, searched, few, many] = await Promise.all([
      seed(async (sb) => {
        dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
        answer(await store(sb, 'sqlite').put('docs', 'workspace/a', 'a\n'), 'store.put');
      }, 'sqlite', 'sqlite-docs'),
      seed(async (sb) => {
        dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
        const s = store(sb, 'sqlite');
        for (const ns of Object.keys(SEARCH_DATA)) {
          dataFile(sb, 'modules', ns, SEARCH_DATA[ns]);
          for (const [key, value] of SEARCH_VALUES[ns]) answer(await s.put(ns, key, value), 'store.put');
        }
      }, 'sqlite', 'sqlite-search'),
      keyed(3, 'sqlite-few'),
      keyed(40, 'sqlite-many'),
    ]);
  });

  it('[modules-r10] never lists or scans a planted row the pattern does not admit', async () => {
    const sb = fresh(docs);
    sqlite(db(sb), "INSERT INTO store (namespace, key, value) VALUES ('docs', 'top', x'78'), ('docs', 'workspace/deep/x', x'78');");
    const s = store(sb, 'sqlite');
    expect((await s.list('docs')).stdout).toBe(listAnswer('docs', ['workspace/a']));
    expect((await s.scan('docs')).stdout).toBe('{"namespace":"docs","items":[{"key":"workspace/a","value_b64":"YQo="}]}\n');
  });

  it('[modules-r10, the-engine-r27] never searches a planted row the key rule or the pattern refuses, as posix searches only the keys it lists', async () => {
    const sb = fresh(docs);
    const s = store(sb, 'sqlite');
    answer(await s.put('docs', 'workspace/b', 'needle kept\n'), 'store.put');
    sqlite(db(sb), "INSERT INTO store (namespace, key, value) VALUES ('docs', 'top', CAST('needle top' AS BLOB)), ('docs', 'workspace/deep/x', CAST('needle deep' AS BLOB)), ('docs', 'workspace/..', CAST('needle dots' AS BLOB));");
    const a = answer(await s.search('docs', 'exact', '0', q('needle')), 'store.search');
    expect([a.total_matches, a.results.map((r: { key: string }) => r.key)]).toEqual([1, ['workspace/b']]);
  });

  it('[the-engine-r19] scans a value of 2 MiB and one byte in time linear in its size, its base64 the core encoder\'s', async () => {
    const sb = fresh(docs);
    const s = store(sb, 'sqlite');
    const value = Buffer.from(Array.from({ length: 2 * 1024 * 1024 + 1 }, (_, i) => (i * 7919 + (i >> 8)) % 256));
    answer(await s.put('docs', 'workspace/big', value), 'store.put');
    const t0 = Date.now();
    const r = await s.scan('docs');
    const took = Date.now() - t0;
    const items = answer(r, 'store.scan').items as { key: string; value_b64: string }[];
    expect(items.find((i) => i.key === 'workspace/big')?.value_b64 === value.toString('base64')).toBe(true);
    expect(took, `the scan took ${took} ms`).toBeLessThan(30_000);
  });

  it('[the-engine-r21] a get whose value read fails prints its one refusal line, never the reader\'s own line naming the scratch', async () => {
    const sb = fresh(docs);
    const cat = ['/bin/cat', '/usr/bin/cat'].find((p) => existsSync(p));
    if (!cat) throw new Error('no cat binary for the value read plant');
    const plant = pathPlant('cat', `case "$1" in */key) printf 'cat: %s: Permission denied\\n' "$1" >&2; exit 1 ;; esac\nexec "${cat}" "$@"`);
    const r = await store(sb, 'sqlite', plant).get('docs', 'workspace/a');
    expect(r.stderr).not.toContain('cat:');
    refused(r, 'store.get', 2, 'ERR_STORAGE_READ', "cannot read key 'workspace/a' in namespace 'docs'");
  });

  it('[the-engine-r19] stores an empty value as a zero-length blob, and scans it as an empty base64 value', async () => {
    const sb = fresh(docs);
    const s = store(sb, 'sqlite');
    answer(await s.put('docs', 'workspace/empty', ''), 'store.put');
    expect(rows(sb, "SELECT length(value) FROM store WHERE namespace = 'docs' AND key = 'workspace/empty';")).toEqual(['0']);
    expect((await s.scan('docs')).stdout).toBe('{"namespace":"docs","items":[{"key":"workspace/a","value_b64":"YQo="},{"key":"workspace/empty","value_b64":""}]}\n');
  });

  it('[the-engine-r19] scans every byte value and every padding length as the storage core\'s encoder writes it', async () => {
    const sb = fresh(docs);
    const s = store(sb, 'sqlite');
    const values = [Buffer.from(Array.from({ length: 256 }, (_, i) => i)), Buffer.from('x'), Buffer.from('xy'), Buffer.from('xyz')];
    answer(await s.batch('docs', values.map((value, i) => ({ action: 'put', key: `workspace/v${i}`, value }))), 'store.batch');
    const items = JSON.parse((await s.scan('docs')).stdout).items as { key: string; value_b64: string }[];
    expect(items.filter((i) => i.key.startsWith('workspace/v')).map((i) => i.value_b64)).toEqual(values.map((v) => v.toString('base64')));
  });

  it('[plugins-r8, the-engine-r8] refuses a ranked mode with posix\'s line, exact being the one registered mode, even on a namespace declaring a search schema', async () => {
    const s = store(fresh(searched), 'sqlite');
    for (const mode of ['hybrid', 'trigram', 'fuzzy']) {
      refused(await s.search('searchdoc', mode, '20', q('needle')), 'store.search', 1, 'ERR_CAPABILITY_UNSUPPORTED', `mode '${mode}' is not registered; registered modes: exact`);
    }
    expect(answer(await s.search('searchdoc', 'exact', '20', q('needle')), 'store.search').total_matches).toBeGreaterThan(0);
  });

  it('[plugins-r8, the-engine-r19] refuses the retired stamps as posix refuses them: an extra argument to a put or a delete, a head= batch line, and the change log function', async () => {
    const sb = fresh(docs);
    const s = store(sb, 'sqlite');
    refused(await s.put('docs', 'workspace/y', 'x\n', '--op=write'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--op=write'");
    refused(await s.del('docs', 'workspace/a', '--head=none'), 'store.delete', 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--head=none'");
    refused(await s.batch('docs', 'action=put\nkey=workspace/y\nhead=none\nvalue_b64=eA==\n'), 'store.batch', 1, 'ERR_INVALID_ARGUMENT', "action 1 (put 'workspace/y'): unknown payload line 'head=none'");
    for (const fn of ['store.changes', 'store.promote', 'storage.leftovers', 'storage.sweep']) {
      refused(await s.op(fn, ['docs']), fn, 2, 'ERR_CAPABILITY_UNSUPPORTED', `unknown function '${fn}'`);
    }
    refused(await s.get('docs', 'workspace/y'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/y' not found in namespace 'docs'");
  });

  it.each(['store.list', 'store.scan', 'store.search'] as const)('[the-engine-r19] %s spawns as many processes over 40 keys as over 3: one sqlite3 call and one pass, never a process per key', async (fn) => {
    const counted = async (snapshot: string) => {
      const sb = fresh(snapshot);
      const plant = countingPlant();
      const s = store(sb, 'sqlite', plant.env);
      const r = fn === 'store.search' ? await s.search('docs', 'exact', '0', q('needle')) : await s.op(fn, ['docs']);
      return { r, n: plant.count() };
    };
    const [a, b] = await Promise.all([counted(few), counted(many)]);
    answer(a.r, fn);
    answer(b.r, fn);
    expect(b.r.stdout.length).toBeGreaterThan(a.r.stdout.length * 5);
    expect(a.n).toBeGreaterThan(0);
    expect(b.n).toBe(a.n);
  });

  describe('a planted trigger', () => {
    it('[the-engine-r18, the-engine-r19] aborts a put whole: the old value survives, and the retry lands', async () => {
      const sb = fresh(docs);
      const s = store(sb, 'sqlite');
      answer(await s.put('docs', 'workspace/atomic', 'atomic-old\n'), 'store.put');
      sqlite(db(sb), "CREATE TRIGGER boom BEFORE INSERT ON store WHEN NEW.key = 'workspace/atomic' BEGIN SELECT RAISE(ABORT, 'planted'); END;");
      refused(await s.put('docs', 'workspace/atomic', 'atomic-new\n'), 'store.put', 2, 'ERR_STORAGE_WRITE', "the storage write of key 'workspace/atomic' failed");
      expect((await s.get('docs', 'workspace/atomic')).stdout).toBe('atomic-old\n');
      sqlite(db(sb), 'DROP TRIGGER boom;');
      answer(await s.put('docs', 'workspace/atomic', 'atomic-new\n'), 'store.put');
      expect((await s.get('docs', 'workspace/atomic')).stdout).toBe('atomic-new\n');
    });

    it('[the-engine-r18, the-engine-r19, the-engine-r21] rolls a batch back when its second action fails, names action 2, and writes nothing', async () => {
      const sb = fresh(docs);
      const s = store(sb, 'sqlite');
      sqlite(db(sb), "CREATE TRIGGER plant_store BEFORE INSERT ON store WHEN NEW.key = 'workspace/boom' BEGIN SELECT RAISE(ABORT, 'planted'); END;");
      refused(await s.batch('docs', [{ action: 'put', key: 'workspace/bat5', value: 'one\n' }, { action: 'put', key: 'workspace/boom', value: 'two\n' }]),
        'store.batch', 2, 'ERR_STORAGE_WRITE', "action 2 (put 'workspace/boom'): the storage write of key 'workspace/boom' failed");
      refused(await s.get('docs', 'workspace/bat5'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/bat5' not found in namespace 'docs'");
      expect(rows(sb, "SELECT count(*) FROM store WHERE namespace = 'docs';")).toEqual(['1']);
    });
  });
});
