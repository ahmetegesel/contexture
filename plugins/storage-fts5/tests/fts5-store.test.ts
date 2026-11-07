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
        dataFile(sb, 'modules', 'exactonly', 'namespace: exactonly\nroot: exact-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nmodes: exact\n');
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

  describe('ranked search', () => {
    async function ranked(ns: string, mode: string, query: string) {
      const r = await store(fresh(searched), 'fts5').search(ns, mode, '20', q(query));
      return answer(r, 'store.search');
    }

    it.each(['hybrid', 'trigram'])('[plugins-r8] answers %s over the derived documents with the entity identity and a positive score', async (mode) => {
      const a = await ranked('searchdoc', mode, 'needle');
      expect([a.namespace, a.query, a.mode, a.total_matches]).toEqual(['searchdoc', 'needle', mode, 3]);
      expect(a.results).toContainEqual(expect.objectContaining({ key: 'u1/backlog', entity_type: 'task', entity_id: 'beta' }));
      if (mode === 'hybrid') for (const r of a.results) expect(r.score).toBeGreaterThan(0);
    });

    it.each([['flatdoc', 'f1/x'], ['genericdoc', 'g1/x'], ['jsondoc', 'j1/x']])('[plugins-r8] ranks the %s module as one body document', async (ns, key) => {
      const a = await ranked(ns, 'hybrid', 'needle');
      expect(a.results).toEqual([expect.objectContaining({ key, entity_type: 'document', entity_id: key, section: 'body' })]);
      expect(a.results[0].score).toBeGreaterThan(0);
    });

    it('[modules-r10] refuses a mode the module does not declare, by name', async () => {
      refused(await store(fresh(searched), 'fts5').search('exactonly', 'hybrid', '20', q('needle')), 'store.search', 1, 'ERR_CAPABILITY_UNSUPPORTED',
        "mode 'hybrid' is not declared by namespace 'exactonly'; declared modes: exact");
    });

    it('[plugins-r8] answers a query holding a double quote on one line, a lone quote with no rows', async () => {
      const quoted = await ranked('searchdoc', 'hybrid', 'needle"');
      expect([quoted.query, quoted.total_matches]).toEqual(['needle"', 3]);
      const lone = await ranked('searchdoc', 'hybrid', '"');
      expect([lone.query, lone.total_matches, lone.results]).toEqual(['"', 0, []]);
    });

    it('[plugins-r8, modules-r10] re-derives a namespace whose search schema changed before it ranks', async () => {
      const sb = fresh(searched);
      const before = answer(await store(sb, 'fts5').search('searchdoc', 'hybrid', '20', q('ACTIVE')), 'store.search');
      expect(before.results.map((r: { entity_type: string }) => r.entity_type)).toContain('session');
      dataFile(sb, 'modules', 'searchdoc', SEARCH_DATA.searchdoc.replace('document: <unit>/state state session -', 'document: <unit>/state state unit_state -'));
      const after = answer(await store(sb, 'fts5').search('searchdoc', 'hybrid', '20', q('ACTIVE')), 'store.search');
      expect(after.results.map((r: { entity_type: string }) => r.entity_type)).toContain('unit_state');
      expect(after.results.map((r: { entity_type: string }) => r.entity_type)).not.toContain('session');
    });
  });

  describe('the change log', () => {
    async function logged() {
      const sb = fresh(docs);
      const s = store(sb, 'fts5');
      answer(await s.put('docs', 'workspace/x', 'x\n'), 'store.put');
      answer(await s.put('docs', 'workspace/x', 'x2\n', '--op=replace', '--head=abc'), 'store.put');
      answer(await s.del('docs', 'workspace/x'), 'store.delete');
      return { sb, s };
    }
    const strip = (a: { changes: Record<string, unknown>[] }) => a.changes.map(({ at, ...rest }) => (expect(at).toMatch(/^\d{4}-\d\d-\d\dT/), rest));

    it('[plugins-r8] answers the rows of the asked heads in order with every field, a head window, and no heads as an empty list', async () => {
      const { s } = await logged();
      expect(strip(answer(await s.changes('docs'), 'store.changes'))).toEqual([]);
      expect(strip(answer(await s.op('store.changes', ['docs'], 'head=none\nhead=abc\n'), 'store.changes'))).toEqual([
        { seq: 1, key: 'workspace/a', op: 'write', head: 'none', prior: 'absent' },
        { seq: 2, key: 'workspace/x', op: 'write', head: 'none', prior: 'absent' },
        { seq: 3, key: 'workspace/x', op: 'replace', head: 'abc', prior: 'present' },
        { seq: 4, key: 'workspace/x', op: 'remove', head: 'none', prior: 'present' },
      ]);
      expect(strip(answer(await s.op('store.changes', ['docs'], 'head=abc\n'), 'store.changes')).map((c) => c.seq)).toEqual([3]);
    });

    it('[plugins-r8, the-engine-r9] refuses a malformed head, an unknown payload line, and a namespace without a log', async () => {
      const { sb, s } = await logged();
      refused(await s.op('store.changes', ['docs'], 'head=zz\n'), 'store.changes', 1, 'ERR_INVALID_ARGUMENT', "a head is a commit id or none: 'zz'");
      refused(await s.op('store.changes', ['docs'], 'what=1\n'), 'store.changes', 1, 'ERR_INVALID_ARGUMENT', "unknown payload line 'what=1' (head=<sha> lines only)");
      dataFile(sb, 'modules', 'probe', 'namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n');
      refused(await s.changes('probe'), 'store.changes', 1, 'ERR_CAPABILITY_UNSUPPORTED', "the namespace 'probe' declares no change log (changes: false)");
    });

    it('[plugins-r8] logs nothing for a refused write', async () => {
      const { sb, s } = await logged();
      const n = changeCount(sb);
      refused(await s.put('docs', 'a/b/c', 'x\n'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', "key 'a/b/c' does not match the namespace pattern '<repo>/<slug>'");
      refused(await s.put('docs', 'workspace/A', 'x\n'), 'store.put', 1, 'ERR_ENTITY_EXISTS',
        "key 'workspace/A' folds onto 'workspace/a' under ASCII case; keys differing only by case never coexist in namespace 'docs'");
      refused(await s.put('docs', 'workspace/y', 'x\n', '--op=bad/op'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', "malformed op 'bad/op'");
      expect(changeCount(sb)).toBe(n);
    });

    it('[plugins-r8] lands one change row per batch action in order, prior at its position', async () => {
      const { sb, s } = await logged();
      answer(await s.put('docs', 'workspace/bat1', 'one\n'), 'store.put');
      const seq = Number(sqlite(db(sb), 'SELECT max(seq) FROM store_changes;'));
      answer(await s.batch('docs', [
        { action: 'put', key: 'workspace/bat3', head: '0123abcd', value: 'three\n' },
        { action: 'delete', key: 'workspace/bat1', head: 'none' },
        { action: 'put', key: 'workspace/bat1', head: 'none', value: 'again\n' },
      ]), 'store.batch');
      expect(rows(sb, `SELECT op || '|' || key || '|' || prior || '|' || head FROM store_changes WHERE seq > ${seq} ORDER BY seq;`)).toEqual([
        'put|workspace/bat3|absent|0123abcd', 'delete|workspace/bat1|present|none', 'put|workspace/bat1|absent|none',
      ]);
    });
  });

  describe('a planted trigger', () => {
    it('[the-engine-r18, the-engine-r19] aborts a put whole: the old value and the log survive, and the retry lands', async () => {
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

    it('[the-engine-r18, the-engine-r19, the-engine-r21] rolls a batch back when its second action fails, names action 2, and logs nothing', async () => {
      const sb = fresh(docs);
      const s = store(sb, 'fts5');
      const n = changeCount(sb);
      sqlite(db(sb), "CREATE TRIGGER plant_store BEFORE INSERT ON store WHEN NEW.key = 'workspace/boom' BEGIN SELECT RAISE(ABORT, 'planted'); END;");
      refused(await s.batch('docs', [{ action: 'put', key: 'workspace/bat5', head: 'none', value: 'one\n' }, { action: 'put', key: 'workspace/boom', head: 'none', value: 'two\n' }]),
        'store.batch', 2, 'ERR_STORAGE_WRITE', "action 2 (put 'workspace/boom'): the storage write of key 'workspace/boom' failed");
      refused(await s.get('docs', 'workspace/bat5'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/bat5' not found in namespace 'docs'");
      expect(changeCount(sb)).toBe(n);
    });
  });
});
