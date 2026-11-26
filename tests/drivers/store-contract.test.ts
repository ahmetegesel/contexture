import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile } from '../support/data-file';
import { RECORD_ROOT, namespaceLock } from '../support/drawer';
import { holdLock, sleepShim } from '../support/locks';
import { ROOT_USER, chmodPlant, pathPlant } from '../support/plants';
import { sandbox } from '../support/sandbox';
import { NEEDLE_ROWS, SEARCH_DATA, SEARCH_VALUES, modeList, searchAnswer } from '../support/search-fixture';
import { fresh } from '../support/snapshot';
import { DRIVERS, sqliteAvailable, stage } from '../support/stage';
import { DOCS_KEYS, docsStore, listAnswer, plantScript, store } from '../support/store';
import { answer, refused, refusedLike } from '../support/wire';

const ALL_KEYS = DOCS_KEYS.map(([k]) => k);

const CARDS = {
  posix: `${JSON.stringify({ driver: 'posix', version: '4.0.0', contract: '4', store: ['list', 'get', 'put', 'delete', 'batch', 'scan'], search_modes: modeList('exact'), optional: ['store', 'store.promote'] })}\n`,
  sqlite: `${JSON.stringify({ driver: 'sqlite', version: '4.0.0', contract: '4', store: ['list', 'get', 'put', 'delete', 'batch', 'scan'], search_modes: modeList('exact'), optional: ['store'] })}\n`,
};

const HEALTH_ABSENT = {
  posix: { driver: 'posix', health: 'degraded', detail: 'the storage layer is not made yet for the namespace (the first write makes it)', store: 'absent' },
  sqlite: { driver: 'sqlite', health: 'degraded', detail: 'database not created yet (will be initialized on the first write)', store: 'absent' },
};

async function healthOf(s: ReturnType<typeof store>, namespace: string): Promise<{ driver: string; health: string; detail: string; store: string }> {
  const a = answer(await s.op('storage.health', [namespace]), 'storage.health');
  expect(a.detail, 'a health detail names no folder').not.toContain('/');
  return a;
}

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'sqlite' && !sqliteAvailable())(`the store contract on ${driver}`, { concurrent: true }, () => {
    let empty: string;
    let keyed: string;
    beforeAll(async () => {
      [empty, keyed] = await Promise.all([docsStore(driver, false), docsStore(driver, true)]);
    });

    describe('reads', () => {
      it('[the-engine-r19] a fresh store lists no keys', async () => {
        expect((await store(fresh(empty), driver).list('docs')).stdout).toBe(listAnswer('docs', []));
      });

      it('[the-engine-r19] lists the admitted keys in bytewise order', async () => {
        const r = await store(fresh(keyed), driver).list('docs');
        answer(r, 'store.list');
        expect(r.stdout).toBe(listAnswer('docs', ALL_KEYS));
      });

      it.each([
        ['workspace/a', ['workspace/a', 'workspace/aa']],
        ['workspace/aa', ['workspace/aa']],
        ['nothing/', []],
        ['', ALL_KEYS],
      ])('[the-engine-r19] narrows the list to the literal prefix %j', async (prefix, keys) => {
        expect((await store(fresh(keyed), driver).list('docs', prefix)).stdout).toBe(listAnswer('docs', keys));
      });

      it('[the-engine-r19] returns a value\'s bytes exactly, a NUL and an invalid UTF-8 byte included', async () => {
        const r = await store(fresh(keyed), driver).get('docs', 'workspace/binary');
        expect(r.code).toBe(0);
        expect(r.stderr).toBe('');
        expect(r.bytes.equals(DOCS_KEYS[3][1])).toBe(true);
        expect(r.bytes.equals(Buffer.from([0x61, 0x00, 0x62, 0xfe]))).toBe(false);
      });

      it('[the-engine-r19] scans every admitted key bytewise with its raw value in base64', async () => {
        const r = await store(fresh(keyed), driver).scan('docs');
        answer(r, 'store.scan');
        expect(r.stdout).toBe(`${JSON.stringify({ namespace: 'docs', items: DOCS_KEYS.map(([key, v]) => ({ key, value_b64: v.toString('base64') })) })}\n`);
      });

      it('[the-engine-r19, the-engine-r21] scans an empty namespace as an empty item list, and refuses a bad scan', async () => {
        const s = store(fresh(empty), driver);
        expect((await s.scan('docs')).stdout).toBe('{"namespace":"docs","items":[]}\n');
        refused(await s.scan(), 'store.scan', 1, 'ERR_INVALID_ARGUMENT', 'store.scan takes one argument, the namespace');
        refused(await s.scan('Bad!'), 'store.scan', 1, 'ERR_INVALID_ARGUMENT', "malformed namespace 'Bad!'");
        refused(await s.scan('nosuch'), 'store.scan', 1, 'ERR_ENTITY_NOT_FOUND', "namespace 'nosuch' is declared by no module data file");
      });
    });

    describe('writes', () => {
      it('[the-engine-r9, the-engine-r19] puts a binary payload and a payload with no trailing newline byte for byte', async () => {
        const s = store(fresh(empty), driver);
        for (const [key, value] of [['workspace/bin', DOCS_KEYS[3][1]], ['workspace/nonl', Buffer.from('no trailing newline')]] as const) {
          expect((await s.put('docs', key, value)).stdout).toBe(`${JSON.stringify({ namespace: 'docs', key })}\n`);
          expect((await s.get('docs', key)).bytes.equals(value)).toBe(true);
        }
      });

      it('[the-engine-r9, the-engine-r19] answers the namespace and the key and keeps quotes, tabs, and backslashes in the value', async () => {
        const s = store(fresh(empty), driver);
        const rich = 'with quotes " and a tab\tand a backslash \\ and a newline\n';
        expect((await s.put('docs', 'workspace/q.uote', rich)).stdout).toBe('{"namespace":"docs","key":"workspace/q.uote"}\n');
        expect((await s.get('docs', 'workspace/q.uote')).stdout).toBe(rich);
      });

      it('[the-engine-r19, the-engine-r21] deletes answering the namespace and the key, then get and delete refuse not found', async () => {
        const s = store(fresh(keyed), driver);
        expect((await s.del('docs', 'workspace/a')).stdout).toBe('{"namespace":"docs","key":"workspace/a"}\n');
        refused(await s.get('docs', 'workspace/a'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/a' not found in namespace 'docs'");
        refused(await s.del('docs', 'workspace/a'), 'store.delete', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/a' not found in namespace 'docs'");
      });

      it('[the-engine-r19] refuses an ASCII case twin, acts on the exact key alone, and the exact key still deletes', async () => {
        const s = store(fresh(empty), driver);
        answer(await s.put('docs', 'workspace/Alpha', 'Alpha\n'), 'store.put');
        refused(await s.put('docs', 'workspace/alpha', 'alpha\n'), 'store.put', 1, 'ERR_ENTITY_EXISTS',
          "key 'workspace/alpha' folds onto 'workspace/Alpha' under ASCII case; keys differing only by case never coexist in namespace 'docs'");
        refused(await s.get('docs', 'workspace/ALPHA'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/ALPHA' not found in namespace 'docs'");
        expect((await s.get('docs', 'workspace/Alpha')).stdout).toBe('Alpha\n');
        answer(await s.del('docs', 'workspace/Alpha'), 'store.delete');
      });

      it('[the-engine-r19, the-engine-r-kvr01] a key outside the ASCII alphabet refuses as malformed, so no non-ASCII fold or normalization twin can be stored', async () => {
        const s = store(fresh(empty), driver);
        for (const key of ['workspace/Σ', 'workspace/türkçe', 'workspace/q"uote']) {
          refused(await s.put('docs', key, 'v\n'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', `malformed key '${key}'`);
        }
        expect((await s.list('docs')).stdout).toBe(listAnswer('docs', []));
      });

      it('[the-engine-r19, the-engine-r-kvr01] refuses a put whose leading run of segments folds onto a stored run of another spelling, alone and in a batch, against stored keys and within one batch', async () => {
        const sb = stage(driver, 'run-twin');
        dataFile(sb, 'modules', 'runs', 'key: <p...>\nsuffix: .md\n');
        const s = store(sb, driver);
        answer(await s.put('runs', 'a/x', 'x\n'), 'store.put');
        answer(await s.put('runs', 'k', 'k\n'), 'store.put');
        refused(await s.put('runs', 'A/y', 'y\n'), 'store.put', 1, 'ERR_ENTITY_EXISTS',
          "key 'A/y' folds onto 'a' under ASCII case at its leading segments 'A'; keys whose leading segments differ only by case never coexist in namespace 'runs'");
        refused(await s.put('runs', 'a/X/z', 'z\n'), 'store.put', 1, 'ERR_ENTITY_EXISTS',
          "key 'a/X/z' folds onto 'a/x' under ASCII case at its leading segments 'a/X'; keys whose leading segments differ only by case never coexist in namespace 'runs'");
        refused(await s.put('runs', 'a/X', 'X\n'), 'store.put', 1, 'ERR_ENTITY_EXISTS',
          "key 'a/X' folds onto 'a/x' under ASCII case; keys differing only by case never coexist in namespace 'runs'");
        refused(await s.batch('runs', [{ action: 'put', key: 'b/1', value: '1' }, { action: 'put', key: 'A/q', value: 'q' }]), 'store.batch', 1, 'ERR_ENTITY_EXISTS',
          "action 2 (put 'A/q'): key 'A/q' folds onto 'a' under ASCII case at its leading segments 'A'; keys whose leading segments differ only by case never coexist in namespace 'runs'");
        refused(await s.batch('runs', [{ action: 'put', key: 'c/1', value: '1' }, { action: 'put', key: 'C/2', value: '2' }]), 'store.batch', 1, 'ERR_ENTITY_EXISTS',
          "action 2 (put 'C/2'): key 'C/2' folds onto 'c' under ASCII case at its leading segments 'C'; keys whose leading segments differ only by case never coexist in namespace 'runs'");
        answer(await s.batch('runs', [{ action: 'delete', key: 'k' }, { action: 'put', key: 'K', value: 'K' }]), 'store.batch');
        expect((await s.list('runs')).stdout).toBe(listAnswer('runs', ['K', 'a/x']));
      });

      it('[the-engine-r9, the-engine-r19] keeps an empty value as zero bytes and a value past 1 MB byte for byte', async () => {
        const s = store(fresh(empty), driver);
        const big = Buffer.from(Array.from({ length: 1_200_000 }, (_, i) => (i * 131) % 256));
        for (const [key, value] of [['workspace/empty', Buffer.alloc(0)], ['workspace/big', big]] as const) {
          answer(await s.put('docs', key, value), 'store.put');
          const r = await s.get('docs', key);
          expect(r.code).toBe(0);
          expect(r.bytes.length).toBe(value.length);
          expect(r.bytes.equals(value)).toBe(true);
        }
      });
    });

    describe('the key rule and the wire refusals', () => {
      it.each(['/workspace/x', 'workspace/../x', 'workspace/./x', 'workspace/a b', 'workspace/a\tb', 'workspace/x/', 'workspace/x\\y',
        'workspace/.x', 'workspace/_x', 'workspace/-x', 'workspace/x:y', 'workspace/x+y', 'workspace//x', `workspace/${'a'.repeat(201)}`])(
        '[the-engine-r21, the-engine-r-kvr01] refuses the malformed key %j', async (key) => {
          refused(await store(fresh(empty), driver).put('docs', key, 'x\n'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', `malformed key '${key}'`);
        });

      it('[the-engine-r-kvr01] holds every allowed byte, a segment opening with a digit, and a 200 byte segment, each listed and read back', async () => {
        const s = store(fresh(empty), driver);
        const keys = ['0pen/x', 'workspace/A.Z_a-z.09', `workspace/${'b'.repeat(200)}`];
        for (const key of keys) answer(await s.put('docs', key, `${key}\n`), 'store.put');
        expect((await s.list('docs')).stdout).toBe(listAnswer('docs', keys));
        for (const key of keys) expect((await s.get('docs', key)).stdout).toBe(`${key}\n`);
      });

      it.each(['workspace', 'a/b/c', 'workspace/x/y'])('[modules-r10, the-engine-p4] refuses %j outside the module pattern before touching the store', async (key) => {
        refused(await store(fresh(empty), driver).put('docs', key, 'x\n'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', `key '${key}' does not match the namespace pattern '<repo>/<slug>'`);
      });

      it.each([
        ['store.put', ['docs', 'workspace/x', '--bogus'], 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--bogus'"],
        ['store.put', ['docs', 'workspace', '--bogus'], 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--bogus'"],
        ['store.put', ['docs', 'workspace/x', '--op=write'], 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--op=write'"],
        ['store.put', ['docs', 'workspace/x', '--head=none'], 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--head=none'"],
        ['store.delete', ['docs', 'workspace/x', '--op=remove'], 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--op=remove'"],
        ['store.list', ['docs', 'extra', 'another'], 1, 'ERR_INVALID_ARGUMENT', 'store.list takes the namespace and an optional key prefix'],
        ['store.list', ['docs', 'bad prefix'], 1, 'ERR_INVALID_ARGUMENT', "malformed key prefix 'bad prefix'"],
        ['store.list', ['docs', '/workspace'], 1, 'ERR_INVALID_ARGUMENT', "malformed key prefix '/workspace'"],
        ['store.list', ['docs', 'workspace/../x'], 1, 'ERR_INVALID_ARGUMENT', "malformed key prefix 'workspace/../x'"],
        ['store.get', ['docs'], 1, 'ERR_INVALID_ARGUMENT', 'store.get takes the namespace and the key'],
        ['store.put', ['docs'], 1, 'ERR_INVALID_ARGUMENT', 'store.put takes the namespace and the key'],
        ['store.delete', ['docs'], 1, 'ERR_INVALID_ARGUMENT', 'store.delete takes the namespace and the key'],
        ['store.changes', ['docs'], 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'store.changes'"],
        ['store.list', ['nosuch'], 1, 'ERR_ENTITY_NOT_FOUND', "namespace 'nosuch' is declared by no module data file"],
        ['store.list', ['Bad!'], 1, 'ERR_INVALID_ARGUMENT', "malformed namespace 'Bad!'"],
        ['nosuch.op', [], 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'nosuch.op'"],
      ] as const)('[the-engine-r9, the-engine-r21] %s %j refuses its one fixed line', async (fn, args, rc, code, message) => {
        refused(await store(fresh(empty), driver).op(fn, args, 'x\n'), fn, rc, code, message);
      });
    });

    describe('module data files through the driver', () => {
      it('[modules-r10, the-engine-r19] serves a second module\'s data file and filters the list by its pattern', async () => {
        const sb = fresh(empty);
        dataFile(sb, 'modules', 'probe', 'root: probe-root\nsuffix: .txt\nkey: <a>/<b>\n');
        const s = store(sb, driver);
        expect((await s.put('probe', 'x/y', 'x\n')).stdout).toBe('{"namespace":"probe","key":"x/y"}\n');
        expect((await s.list('probe')).stdout).toBe(listAnswer('probe', ['x/y']));
      });

      it('[modules-r10, modules-r15, the-engine-r-cj0ey] an aliased docs beside a plain docs keeps two stores apart: the alias stores under its installed name, never under the root its data file declares', async () => {
        const sb = fresh(empty);
        dataFile(sb, 'extensions', 'docs2', DOCS_SHAPED);
        mkdirSync(join(sb, '.contexture/extensions/.state'), { recursive: true });
        writeFileSync(join(sb, '.contexture/extensions/.state/docs-pro.files'), 'package docs-pro\nversion 1.0.0\nkind feature\nmodule docs2 docs\n');
        const s = store(sb, driver);
        answer(await s.put('docs', 'workspace/a', 'plain\n'), 'store.put');
        answer(await s.put('docs2', 'workspace/a', 'aliased\n'), 'store.put');
        expect((await s.get('docs', 'workspace/a')).stdout).toBe('plain\n');
        expect((await s.get('docs2', 'workspace/a')).stdout).toBe('aliased\n');
        answer(await s.del('docs2', 'workspace/a'), 'store.delete');
        expect((await s.list('docs2')).stdout).toBe(listAnswer('docs2', []));
        expect((await s.list('docs')).stdout).toBe(listAnswer('docs', ['workspace/a']));
      });

      it('[modules-r10] maps the reader\'s refusals: a malformed declaration rc 1, an undeclared namespace not found', async () => {
        const sb = fresh(empty);
        dataFile(sb, 'modules', 'probe', 'key: <a>/<b>\nmode: fast\n');
        refused(await store(sb, driver).list('probe'), 'store.list', 1, 'ERR_INVALID_ARGUMENT', "unknown field 'mode' in the data file");
      });

      it('[modules-r10, the-engine-r19] serves the minimum declaration with its defaults, and a changes line refuses as an unknown field', async () => {
        const sb = fresh(empty);
        dataFile(sb, 'modules', 'minimal', 'key: <a>/<b>\n');
        const s = store(sb, driver);
        expect((await s.put('minimal', 'a/b', 'x\n')).stdout).toBe('{"namespace":"minimal","key":"a/b"}\n');
        expect((await s.get('minimal', 'a/b')).stdout).toBe('x\n');
        expect((await s.list('minimal')).stdout).toBe(listAnswer('minimal', ['a/b']));
        dataFile(sb, 'modules', 'minimal', 'key: <a>/<b>\nchanges: false\n');
        refused(await s.list('minimal'), 'store.list', 1, 'ERR_INVALID_ARGUMENT', "unknown field 'changes' in the data file: the change log left the storage contract, so remove the changes line");
      });

      it('[modules-r10] admits the unit module\'s <unit>/<path...> keys at any depth and refuses a bare unit', async () => {
        const s = store(fresh(empty), driver);
        expect((await s.put('unit', 'storage/state', 'x\n')).stdout).toBe('{"namespace":"unit","key":"storage/state"}\n');
        answer(await s.put('unit', 'storage/lanes/foo/report', 'unit-lane\n'), 'store.put');
        expect((await s.list('unit')).stdout).toBe(listAnswer('unit', ['storage/lanes/foo/report', 'storage/state']));
        expect((await s.get('unit', 'storage/lanes/foo/report')).stdout).toBe('unit-lane\n');
        refused(await s.put('unit', 'storage', 'x\n'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', "key 'storage' does not match the namespace pattern '<unit>/<path...>'");
      });
    });

    describe('search', () => {
      const q = (query: string) => `query=${query}\n`;

      it('[the-engine-r19, the-engine-r27, modules-r10] answers the shared exact rule over a document set', async () => {
        const sb = fresh(empty);
        dataFile(sb, 'modules', 'searchdoc', SEARCH_DATA.searchdoc);
        const s = store(sb, driver);
        for (const [key, value] of SEARCH_VALUES.searchdoc) answer(await s.put('searchdoc', key, value), 'store.put');
        const r = await s.search('searchdoc', 'exact', '20', q('needle'));
        answer(r, 'store.search');
        expect(r.stdout).toBe(searchAnswer('searchdoc', 'needle', 3, NEEDLE_ROWS));
      });

      it.each([
        [['exact', '5'], '', 'missing the query payload'],
        [['exact', '5'], 'query=\n', 'the search query is empty'],
        [['exact', '5'], 'query=x\nbogus=1\n', "unknown payload line 'bogus=1' (query= only)"],
        [['exact', '5'], 'query=x\nquery=y\n', "duplicate payload line 'query='"],
        [['exact', 'abc'], 'query=x\n', "--limit takes a number, 0 for every result: 'abc'"],
        [['exact', '5', 'extra'], 'query=x\n', 'store.search takes the namespace, the mode, and an optional limit'],
      ] as const)('[the-engine-r9, the-engine-r21] refuses the search wire %j %j', async (args, input, message) => {
        refused(await store(fresh(keyed), driver).op('store.search', ['docs', ...args], input), 'store.search', 1, 'ERR_INVALID_ARGUMENT', message);
      });

      it('[the-engine-r8] refuses a mode the driver does not register, naming its registry', async () => {
        refused(await store(fresh(keyed), driver).search('docs', 'fuzzy', '5', q('x')), 'store.search', 1, 'ERR_CAPABILITY_UNSUPPORTED',
          "mode 'fuzzy' is not registered; registered modes: exact");
      });

      it('[the-engine-r21] re-frames a failing search engine as the store.search line alone', async () => {
        const sb = fresh(keyed);
        const restore = plantScript(sb, 'store-search', 'printf "store-search: error: planted search read failure (ERR_STORAGE_READ)\\n" >&2\nexit 2');
        refused(await store(sb, driver).search('docs', 'exact', '20', q('a')), 'store.search', 2, 'ERR_STORAGE_READ', 'planted search read failure');
        restore();
        answer(await store(sb, driver).search('docs', 'exact', '20', q('a')), 'store.search');
      });
    });

    describe('batch', () => {
      it('[the-engine-r19] applies puts and deletes in order and answers the action count', async () => {
        const s = store(fresh(empty), driver);
        answer(await s.put('docs', 'workspace/bat1', 'one\n'), 'store.put');
        answer(await s.put('docs', 'workspace/bat2', 'two\n'), 'store.put');
        expect((await s.batch('docs', [
          { action: 'put', key: 'workspace/bat3', value: 'three\n' },
          { action: 'delete', key: 'workspace/bat1' },
          { action: 'put', key: 'workspace/bat2', value: 'one\n' },
        ])).stdout).toBe('{"namespace":"docs","actions":3}\n');
        expect((await s.get('docs', 'workspace/bat3')).stdout).toBe('three\n');
        refused(await s.get('docs', 'workspace/bat1'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/bat1' not found in namespace 'docs'");
        expect((await s.get('docs', 'workspace/bat2')).stdout).toBe('one\n');
      });

      it('[the-engine-r19, the-engine-r21] names a semantic failure at action 2 and leaves action 1 unwritten', async () => {
        const s = store(fresh(empty), driver);
        refused(await s.batch('docs', [{ action: 'put', key: 'workspace/bat4', value: 'two\n' }, { action: 'delete', key: 'workspace/bat9' }]),
          'store.batch', 1, 'ERR_ENTITY_NOT_FOUND', "action 2 (delete 'workspace/bat9'): key 'workspace/bat9' not found in namespace 'docs'");
        refused(await s.get('docs', 'workspace/bat4'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/bat4' not found in namespace 'docs'");
      });

      it.each([
        ['action=bogus\nkey=workspace/bat6\n', "action 1 (bogus '?'): unknown action 'bogus' (put or delete)"],
        ['action=put\nkey=workspace/bat6\n', "action 1 (put 'workspace/bat6'): a put carries no value"],
        ['action=delete\nkey=workspace/bat2\nvalue_b64=aGk=\n', "action 1 (delete 'workspace/bat2'): a delete carries no value"],
        ['', "action 1 (? '?'): the batch carries no actions"],
        ['key=workspace/b\naction=put\nvalue_b64=eA==\n', "action 1 (? '?'): a payload line outside an action"],
        ['action=put\nkey=workspace/b\nvalue_b64=***\n', "action 1 (put 'workspace/b'): malformed base64 value"],
        ['bogus=1\naction=put\nkey=workspace/b\nvalue_b64=eA==\n', "action 1 (? '?'): unknown payload line 'bogus=1'"],
        ['action=put\nkey=workspace/b\nhead=none\nvalue_b64=eA==\n', "action 1 (put 'workspace/b'): unknown payload line 'head=none'"],
      ])('[the-engine-r9, the-engine-r21] refuses the malformed batch %j with its action context', async (input, message) => {
        refused(await store(fresh(empty), driver).batch('docs', input), 'store.batch', 1, 'ERR_INVALID_ARGUMENT', message);
      });

      it.each([
        ['key=workspace/c', "duplicate payload line 'key='"],
        ['value_b64=eA==', "duplicate payload line 'value_b64='"],
        ['bogus=1', "unknown payload line 'bogus=1'"],
      ])('[the-engine-r9, the-engine-r21] names the 1-based action of a refused %s line inside it', async (line, message) => {
        refused(await store(fresh(empty), driver).batch('docs', `action=put\nkey=workspace/a\nvalue_b64=eA==\naction=put\nkey=workspace/b\nvalue_b64=eA==\n${line}\n`),
          'store.batch', 1, 'ERR_INVALID_ARGUMENT', `action 2 (put 'workspace/b'): ${message}`);
      });

      it('[the-engine-r9] strips a carriage return from every payload line', async () => {
        const s = store(fresh(empty), driver);
        expect((await s.batch('docs', 'action=put\r\nkey=workspace/crlf\r\nvalue_b64=eA==\r\n')).stdout).toBe('{"namespace":"docs","actions":1}\n');
        expect((await s.get('docs', 'workspace/crlf')).stdout).toBe('x');
      });
    });

    describe('faults the driver re-frames', () => {
      it('[the-engine-r21] a failing value read leaves no partial scan answer: posix names the key its encoder failed on, sqlite refuses its one read whole', async () => {
        const sb = fresh(keyed);
        if (driver === 'posix') {
          plantScript(sb, 'store-b64', 'printf "store-b64: planted encoder failure\\n" >&2\nexit 2');
          refused(await store(sb, driver).scan('docs'), 'store.scan', 2, 'ERR_STORAGE_READ', "cannot read key 'workspace/B' in namespace 'docs'");
          return;
        }
        const real = spawnSync('sh', ['-c', 'command -v sqlite3'], { encoding: 'utf8' }).stdout.trim();
        const plant = pathPlant('sqlite3', `case "$*" in *"hex(value)"*) printf 'Error: planted read failure\\n' >&2; exit 1 ;; esac\nexec "${real}" "$@"`);
        refused(await store(sb, driver, plant).scan('docs'), 'store.scan', 2, 'ERR_STORAGE_READ', 'the storage read failed');
      });
    });

    describe('the card and the health', () => {
      it('[the-engine-r15, the-engine-r19] answers its contract 4 descriptor card', async () => {
        const r = await store(fresh(empty), driver).op('capability', []);
        answer(r, 'capability');
        expect(r.stdout).toBe(CARDS[driver]);
      });

      it('[the-engine-r-b3r6t, the-engine-r19] store.promote: posix answers none for a namespace with no fallback root; sqlite declares no promotion and answers its unknown function line', async () => {
        const r = await store(fresh(empty), driver).op('store.promote', ['docs', 'workspace/']);
        if (driver === 'posix') expect(answer(r, 'store.promote')).toEqual({ namespace: 'docs', prefix: 'workspace/', state: 'none' });
        else refused(r, 'store.promote', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'store.promote'");
      });

      it('[the-engine-r24] reports the store absent on a fresh stage, then present and ok once a value lands', async () => {
        const sb = stage(driver);
        const s = store(sb, driver);
        expect(await healthOf(s, 'unit')).toEqual(HEALTH_ABSENT[driver]);
        answer(await s.put('unit', 'probe/state', 'x\n'), 'store.put');
        const after = await healthOf(s, 'unit');
        expect(Object.keys(after)).toEqual(['driver', 'health', 'detail', 'store']);
        expect([after.driver, after.health, after.store]).toEqual([driver, 'ok', 'present']);
      });

      it('[the-engine-r24] reports locked while a writer holds the unit namespace lock, and ok once it is released or its holder is gone', async () => {
        const sb = stage(driver);
        const s = store(sb, driver);
        answer(await s.put('unit', 'probe/state', 'x\n'), 'store.put');
        const health = () => healthOf(s, 'unit');
        const release = holdLock(sb, namespaceLock('unit'), 'live');
        expect(await health()).toEqual({ driver, health: 'locked', detail: "the storage layer's namespace 'unit' is locked by a writer", store: 'present' });
        release();
        expect((await health()).health).toBe('ok');
        holdLock(sb, namespaceLock('unit'), 'pidless');
        expect((await health()).health).toBe('locked');
        holdLock(sb, namespaceLock('unit'), 'dead');
        expect((await health()).health).toBe('ok');
      });

      it.each([
        ['no argument', [], 'ERR_INVALID_ARGUMENT', 'storage.health takes the namespace'],
        ['an extra argument', ['unit', 'extra'], 'ERR_INVALID_ARGUMENT', "unexpected argument 'extra'"],
        ['a malformed namespace', ['Bad!'], 'ERR_INVALID_ARGUMENT', "malformed namespace 'Bad!'"],
        ['an undeclared namespace', ['nosuch'], 'ERR_ENTITY_NOT_FOUND', "namespace 'nosuch' is declared by no module data file"],
      ])('[the-engine-r24] refuses %s rc 1 before any probe', async (_, args, code, message) => {
        refused(await store(fresh(empty), driver).op('storage.health', args), 'storage.health', 1, code, message);
      });

      it('[the-engine-r24] refuses rc 2 ERR_STORAGE_READ when the core cannot read the declaration or stage its reader\'s stderr', async () => {
        const sb = fresh(empty);
        const restore = plantScript(sb, 'store-data', 'printf "store-data: planted unreadable drawer\\n" >&2\nexit 2');
        refused(await store(sb, driver).op('storage.health', ['unit']), 'storage.health', 2, 'ERR_STORAGE_READ', 'planted unreadable drawer');
        restore();
        refused(await store(sb, driver, pathPlant('mktemp', 'exit 1')).op('storage.health', ['unit']), 'storage.health', 2, 'ERR_STORAGE_READ', "cannot create the driver's scratch file");
      });

      it('[the-engine-r24] scopes presence and the lock to the named namespace: a docs key and a held docs lock leave unit absent and unlocked', async () => {
        const sb = fresh(keyed);
        if (driver === 'posix') mkdirSync(join(sb, RECORD_ROOT), { recursive: true });
        const s = store(sb, driver);
        expect(await healthOf(s, 'unit')).toMatchObject({ health: 'ok', store: 'absent' });
        expect(await healthOf(s, 'docs')).toMatchObject({ health: 'ok', store: 'present' });
        const release = holdLock(sb, namespaceLock('docs'), 'live');
        expect(await healthOf(s, 'unit')).toMatchObject({ health: 'ok', store: 'absent' });
        expect(await healthOf(s, 'docs')).toEqual({ driver, health: 'locked', detail: "the storage layer's namespace 'docs' is locked by a writer", store: 'present' });
        release();
        holdLock(sb, namespaceLock('unit'), 'live');
        expect(await healthOf(s, 'unit')).toMatchObject({ health: 'locked', store: 'absent' });
        expect(await healthOf(s, 'docs')).toMatchObject({ health: 'ok', store: 'present' });
      });

      it.skipIf(ROOT_USER)('[the-engine-r24] finds the lock by the one folder rule: with the drawer\'s scratch folder unwritable, under the per-user folder in the system temp', async ({ onTestFinished }) => {
        const sb = fresh(keyed);
        const temp = sandbox('lock-temp');
        const s = store(sb, driver, { TMPDIR: temp });
        answer(await s.put('docs', 'workspace/held', 'x\n'), 'store.put');
        holdLock(sb, namespaceLock('docs'), 'live');
        chmodPlant(join(sb, '.contexture/tmp'), 0o555, 0o755, onTestFinished);
        expect((await healthOf(s, 'docs')).health).toBe('ok');
        const lock = join(temp, `contexture-${process.env.USER ?? ''}`, 'locks', namespaceLock('docs'));
        mkdirSync(lock, { recursive: true });
        writeFileSync(join(lock, 'pid'), `${process.pid}\n`);
        expect((await healthOf(s, 'docs')).health).toBe('locked');
        refusedLike(await store(sb, driver, { ...sleepShim(), TMPDIR: temp }).put('docs', 'workspace/held', 'y\n'), 'store.put', 2, 'ERR_STORAGE_LOCKED');
      });
    });
  });
}

