import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile } from '@support/data-file';
import { FTS5_DB } from '@support/drawer';
import { pathPlant } from '@support/plants';
import { SEARCH_DATA, SEARCH_VALUES } from '@support/search-fixture';
import { fresh, seed } from '@support/snapshot';
import { sqlite } from '@support/sqlite';
import { fts5Available } from '@support/stage';
import { listAnswer, store } from '@support/store';
import { answer, refused } from '@support/wire';

const db = (sb: string) => join(sb, FTS5_DB);
const rows = (sb: string, sql: string) => sqlite(db(sb), sql).split('\n').filter(Boolean);
const changeCount = (sb: string) => Number(sqlite(db(sb), 'SELECT count(*) FROM store_changes;'));
const q = (query: string) => `query=${query}\n`;

describe.skipIf(!fts5Available())('the fts5 store', { concurrent: true }, () => {
  let docs: string;
  let searched: string;
  beforeAll(async () => {
    [docs, searched] = await Promise.all([
      seed(async (sb) => {
        dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
        answer(await store(sb, 'fts5').put('docs', 'workspace/a', 'a\n'), 'store.put');
      }, 'fts5', 'fts5-docs'),
      seed(async (sb) => {
        dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
        dataFile(sb, 'modules', 'exactonly', 'root: exact-root\nsuffix: .txt\nkey: <a>/<b>\n');
        const s = store(sb, 'fts5');
        for (const ns of Object.keys(SEARCH_DATA)) {
          dataFile(sb, 'modules', ns, SEARCH_DATA[ns]);
          for (const [key, value] of SEARCH_VALUES[ns]) answer(await s.put(ns, key, value), 'store.put');
        }
      }, 'fts5', 'fts5-search'),
    ]);
  });

  it('[modules-r10] never lists or scans a planted row the pattern does not admit', async () => {
    const sb = fresh(docs);
    sqlite(db(sb), "INSERT INTO store (namespace, key, value, updated_at) VALUES ('docs', 'top', x'78', 't'), ('docs', 'workspace/deep/x', x'78', 't');");
    const s = store(sb, 'fts5');
    expect((await s.list('docs')).stdout).toBe(listAnswer('docs', ['workspace/a']));
    expect((await s.scan('docs')).stdout).toBe('{"namespace":"docs","items":[{"key":"workspace/a","value_b64":"YQo="}]}\n');
  });

  it('[the-engine-r21] a get whose value read fails prints its one refusal line, never the reader\'s own line naming the scratch', async () => {
    const sb = fresh(docs);
    const cat = ['/bin/cat', '/usr/bin/cat'].find((p) => existsSync(p));
    if (!cat) throw new Error('no cat binary for the value read plant');
    const plant = pathPlant('cat', `case "$1" in */key) printf 'cat: %s: Permission denied\\n' "$1" >&2; exit 1 ;; esac\nexec "${cat}" "$@"`);
    const r = await store(sb, 'fts5', plant).get('docs', 'workspace/a');
    expect(r.stderr).not.toContain('cat:');
    refused(r, 'store.get', 2, 'ERR_STORAGE_READ', "cannot read key 'workspace/a' in namespace 'docs'");
  });

  it('[the-engine-r19] stores an empty value as a zero-length blob', async () => {
    const sb = fresh(docs);
    answer(await store(sb, 'fts5').put('docs', 'workspace/empty', ''), 'store.put');
    expect(rows(sb, "SELECT length(value) FROM store WHERE namespace = 'docs' AND key = 'workspace/empty';")).toEqual(['0']);
  });

  describe('the contract 4 trim', () => {
    it('[plugins-r8, the-engine-r8] refuses a ranked mode with posix\'s line, exact being the one registered mode, even on a namespace declaring a search schema', async () => {
      const s = store(fresh(searched), 'fts5');
      for (const mode of ['hybrid', 'trigram', 'fuzzy']) {
        refused(await s.search('searchdoc', mode, '20', q('needle')), 'store.search', 1, 'ERR_CAPABILITY_UNSUPPORTED', `mode '${mode}' is not registered; registered modes: exact`);
      }
      expect(answer(await s.search('searchdoc', 'exact', '20', q('needle')), 'store.search').total_matches).toBeGreaterThan(0);
    });

    it('[plugins-r8, the-engine-r19] refuses the retired stamps as posix refuses them: an extra argument to a put or a delete and a head= batch line', async () => {
      const sb = fresh(docs);
      const s = store(sb, 'fts5');
      refused(await s.put('docs', 'workspace/y', 'x\n', '--op=write'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--op=write'");
      refused(await s.del('docs', 'workspace/a', '--head=none'), 'store.delete', 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--head=none'");
      refused(await s.batch('docs', 'action=put\nkey=workspace/y\nhead=none\nvalue_b64=eA==\n'), 'store.batch', 1, 'ERR_INVALID_ARGUMENT', "action 1 (put 'workspace/y'): unknown payload line 'head=none'");
      refused(await s.op('store.changes', ['docs']), 'store.changes', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'store.changes'");
      refused(await s.get('docs', 'workspace/y'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/y' not found in namespace 'docs'");
    });

    it('[plugins-r8] writes no change row: the schema 5 table stays empty across puts, deletes, and a batch, while the values land', async () => {
      const sb = fresh(docs);
      const s = store(sb, 'fts5');
      answer(await s.put('docs', 'workspace/x', 'x1\n'), 'store.put');
      answer(await s.put('docs', 'workspace/x', 'x2\n'), 'store.put');
      answer(await s.del('docs', 'workspace/x'), 'store.delete');
      answer(await s.batch('docs', [{ action: 'put', key: 'workspace/b1', value: 'one\n' }, { action: 'delete', key: 'workspace/a' }]), 'store.batch');
      expect(changeCount(sb)).toBe(0);
      expect((await s.list('docs')).stdout).toBe(listAnswer('docs', ['workspace/b1']));
    });
  });

  describe('a planted trigger', () => {
    it('[the-engine-r18, the-engine-r19] aborts a put whole: the old value survives, and the retry lands', async () => {
      const sb = fresh(docs);
      const s = store(sb, 'fts5');
      answer(await s.put('docs', 'workspace/atomic', 'atomic-old\n'), 'store.put');
      const n = changeCount(sb);
      sqlite(db(sb), "CREATE TRIGGER boom BEFORE INSERT ON store WHEN NEW.key = 'workspace/atomic' BEGIN SELECT RAISE(ABORT, 'planted'); END;");
      refused(await s.put('docs', 'workspace/atomic', 'atomic-new\n'), 'store.put', 2, 'ERR_STORAGE_WRITE', "the storage write of key 'workspace/atomic' failed");
      expect((await s.get('docs', 'workspace/atomic')).stdout).toBe('atomic-old\n');
      expect(changeCount(sb)).toBe(n);
      sqlite(db(sb), 'DROP TRIGGER boom;');
      answer(await s.put('docs', 'workspace/atomic', 'atomic-new\n'), 'store.put');
      expect((await s.get('docs', 'workspace/atomic')).stdout).toBe('atomic-new\n');
    });

    it('[the-engine-r18, the-engine-r19, the-engine-r21] rolls a batch back when its second action fails, names action 2, and writes nothing', async () => {
      const sb = fresh(docs);
      const s = store(sb, 'fts5');
      const n = changeCount(sb);
      sqlite(db(sb), "CREATE TRIGGER plant_store BEFORE INSERT ON store WHEN NEW.key = 'workspace/boom' BEGIN SELECT RAISE(ABORT, 'planted'); END;");
      refused(await s.batch('docs', [{ action: 'put', key: 'workspace/bat5', value: 'one\n' }, { action: 'put', key: 'workspace/boom', value: 'two\n' }]),
        'store.batch', 2, 'ERR_STORAGE_WRITE', "action 2 (put 'workspace/boom'): the storage write of key 'workspace/boom' failed");
      refused(await s.get('docs', 'workspace/bat5'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/bat5' not found in namespace 'docs'");
      expect(changeCount(sb)).toBe(n);
    });
  });
});
