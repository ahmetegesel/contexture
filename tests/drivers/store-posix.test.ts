import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { driverPath } from '../support/driver';
import { exec, launch } from '../support/exec';
import { FALLBACK_ROOT, RECORD_ROOT, namespaceLock } from '../support/drawer';
import { holdLock } from '../support/locks';
import { ROOT_USER, chmodPlant, pathPlant, shimPath } from '../support/plants';
import { alive } from '../support/procs';
import { sandbox } from '../support/sandbox';
import { SEARCH_DATA } from '../support/search-fixture';
import { fresh } from '../support/snapshot';
import { stage } from '../support/stage';
import { DOCS_KEYS, docsStore, listAnswer, store } from '../support/store';
import { waitFor } from '../support/unit';
import { answer, refused } from '../support/wire';

function plant(sb: string, rel: string, bytes: string | Buffer): void {
  mkdirSync(dirname(join(sb, rel)), { recursive: true });
  writeFileSync(join(sb, rel), bytes);
}

async function healthOf(sb: string, namespace: string): Promise<{ driver: string; health: string; detail: string; store: string }> {
  const a = answer(await store(sb, 'posix').op('storage.health', [namespace]), 'storage.health');
  expect(a.detail, 'a health detail names no folder').not.toContain('/');
  return a;
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
    dataFile(sb, 'modules', 'minimal', 'key: <a>/<b>\n');
    answer(await store(sb, 'posix').put('minimal', 'a/b', 'x\n'), 'store.put');
    expect(readFileSync(join(sb, 'minimal/a/b'), 'utf8')).toBe('x\n');
  });

  it('[modules-r10] maps the unit keys under the declared record root and never lists a stray file there', async () => {
    const sb = fresh(empty);
    const s = store(sb, 'posix');
    answer(await s.put('unit', 'storage/state', 'x\n'), 'store.put');
    answer(await s.put('unit', 'storage/lanes/foo/report', 'unit-lane\n'), 'store.put');
    expect(existsSync(join(sb, RECORD_ROOT, 'storage/state.md'))).toBe(true);
    expect(existsSync(join(sb, RECORD_ROOT, 'storage/lanes/foo/report.md'))).toBe(true);
    plant(sb, join(RECORD_ROOT, 'stray.md'), 'stray\n');
    expect((await s.list('unit')).stdout).toBe(listAnswer('unit', ['storage/lanes/foo/report', 'storage/state']));
  });

  it('[the-engine-r8] refuses a ranked mode by its registry, exact alone, even on a namespace declaring a search schema', async () => {
    const sb = fresh(empty);
    dataFile(sb, 'modules', 'searchdoc', SEARCH_DATA.searchdoc);
    const s = store(sb, 'posix');
    refused(await s.search('searchdoc', 'hybrid', '20', 'query=needle\n'), 'store.search', 1, 'ERR_CAPABILITY_UNSUPPORTED', "mode 'hybrid' is not registered; registered modes: exact");
  });

  it('[the-engine-r19, modules-r10] scans planted files bytewise, admitting only the pattern\'s keys, a binary value in base64', async () => {
    const sb = fresh(empty);
    dataFile(sb, 'modules', 'scanprobe', 'root: scan-root\nsuffix: .txt\nkey: <a>/<b>\n');
    const values: [string, Buffer][] = [['x/B', Buffer.from('B\n')], ['x/a', Buffer.from('a\n')], ['x/aa', Buffer.from('aa\n')], ['x/bin', Buffer.from([0x61, 0, 0x62, 0xff])]];
    for (const [key, value] of values) plant(sb, `scan-root/${key}.txt`, value);
    plant(sb, 'scan-root/x/y/z.txt', 'three segments\n');
    plant(sb, 'scan-root/top.txt', 'one segment\n');
    expect((await store(sb, 'posix').scan('scanprobe')).stdout).toBe(
      `${JSON.stringify({ namespace: 'scanprobe', items: values.map(([key, v]) => ({ key, value_b64: v.toString('base64') })) })}\n`);
  });

  it.skipIf(ROOT_USER)('[the-engine-r21] refuses a scan meeting an unreadable file, naming its key, with no partial answer', async ({ onTestFinished }) => {
    const sb = fresh(empty);
    dataFile(sb, 'modules', 'scanprobe', 'root: scan-root\nsuffix: .txt\nkey: <a>/<b>\n');
    plant(sb, 'scan-root/x/a.txt', 'a\n');
    plant(sb, 'scan-root/x/ro.txt', 'unreadable\n');
    chmodPlant(join(sb, 'scan-root/x/ro.txt'), 0o000, 0o600, onTestFinished);
    refused(await store(sb, 'posix').scan('scanprobe'), 'store.scan', 2, 'ERR_STORAGE_READ', "cannot read key 'x/ro' in namespace 'scanprobe'");
  });

  it.skipIf(ROOT_USER)('[the-engine-r21] refuses a get of an unreadable key file with its one refusal line, naming no folder', async ({ onTestFinished }) => {
    const sb = fresh(empty);
    plant(sb, 'docs/workspace/ro.md', 'unreadable\n');
    chmodPlant(join(sb, 'docs/workspace/ro.md'), 0o000, 0o600, onTestFinished);
    const r = await store(sb, 'posix').get('docs', 'workspace/ro');
    expect(r.stderr).not.toContain('docs/workspace');
    refused(r, 'store.get', 2, 'ERR_STORAGE_READ', "cannot read key 'workspace/ro' in namespace 'docs'");
  });

  it('[the-engine-r24] reports its health over the declared root: degraded before it is made, ok and absent while it holds no key or only residue, ok and present once written, locked whatever the presence', async () => {
    const sb = stage('posix');
    const health = () => healthOf(sb, 'unit');
    expect(await health()).toEqual({ driver: 'posix', health: 'degraded', detail: 'the storage layer is not made yet for the namespace (the first write makes it)', store: 'absent' });
    mkdirSync(join(sb, RECORD_ROOT));
    const empty = { driver: 'posix', health: 'ok', detail: 'the storage layer is writable and holds no key of the namespace yet', store: 'absent' };
    expect(await health()).toEqual(empty);
    plant(sb, join(RECORD_ROOT, 'stray.md'), 'one segment, never a key\n');
    plant(sb, join(RECORD_ROOT, 'u/.tmp.plant'), 'a killed writer residue\n');
    expect(await health()).toEqual(empty);
    const release = holdLock(sb, namespaceLock('unit'), 'live');
    expect(await health()).toEqual({ driver: 'posix', health: 'locked', detail: "the storage layer's namespace 'unit' is locked by a writer", store: 'absent' });
    release();
    answer(await store(sb, 'posix').put('unit', 'u/state', 'x\n'), 'store.put');
    expect(await health()).toEqual({ driver: 'posix', health: 'ok', detail: 'the storage layer is writable and unlocked for the namespace', store: 'present' });
    holdLock(sb, namespaceLock('unit'), 'live');
    expect(await health()).toEqual({ driver: 'posix', health: 'locked', detail: "the storage layer's namespace 'unit' is locked by a writer", store: 'present' });
  });

  it.skipIf(ROOT_USER)('[the-engine-r24] reports an unwritable root as error with its true presence, ahead of a held lock', async ({ onTestFinished }) => {
    const sb = stage('posix');
    const root = join(sb, RECORD_ROOT);
    mkdirSync(root);
    chmodPlant(root, 0o555, 0o755, onTestFinished);
    expect(await healthOf(sb, 'unit')).toEqual({ driver: 'posix', health: 'error', detail: 'the storage layer is not writable for the namespace', store: 'absent' });
    chmodSync(root, 0o755);
    answer(await store(sb, 'posix').put('unit', 'u/state', 'x\n'), 'store.put');
    chmodSync(root, 0o555);
    holdLock(sb, namespaceLock('unit'), 'live');
    expect(await healthOf(sb, 'unit')).toEqual({ driver: 'posix', health: 'error', detail: 'the storage layer is not writable for the namespace', store: 'present' });
  });

  it.skipIf(ROOT_USER)('[the-engine-r24] reports an unreadable root as error with the store absent', async ({ onTestFinished }) => {
    const sb = stage('posix');
    answer(await store(sb, 'posix').put('unit', 'u/state', 'x\n'), 'store.put');
    chmodPlant(join(sb, RECORD_ROOT), 0o311, 0o755, onTestFinished);
    expect(await healthOf(sb, 'unit')).toEqual({ driver: 'posix', health: 'error', detail: 'the storage layer is not readable for the namespace', store: 'absent' });
  });

  it('[the-engine-r24] follows a declared root other than the namespace, and reads no other namespace\'s root', async () => {
    const sb = stage('posix');
    dataFile(sb, 'modules', 'deeproot', 'root: nested/deep-root\nsuffix: .txt\nkey: <a>/<b>\n');
    const health = () => healthOf(sb, 'deeproot');
    expect((await health()).health).toBe('degraded');
    mkdirSync(join(sb, 'deeproot'));
    plant(sb, 'deeproot/a/b.txt', 'the default root, never the declared one\n');
    expect((await health()).health).toBe('degraded');
    mkdirSync(join(sb, 'nested/deep-root'), { recursive: true });
    expect(await health()).toMatchObject({ health: 'ok', store: 'absent' });
    answer(await store(sb, 'posix').put('deeproot', 'a/b', 'x\n'), 'store.put');
    expect(existsSync(join(sb, 'nested/deep-root/a/b.txt'))).toBe(true);
    expect(await health()).toMatchObject({ health: 'ok', store: 'present' });
    expect((await healthOf(sb, 'unit')).health).toBe('degraded');
  });

  it.skipIf(ROOT_USER)('a writer with USER unset and the drawer\'s scratch folder unwritable lands its put through the per-user lock folder', async ({ onTestFinished }) => {
    const sb = stage('posix');
    dataFile(sb, 'modules', 'minimal', 'key: <a>/<b>\n');
    const temp = sandbox('no-user-temp');
    chmodPlant(join(sb, '.contexture/tmp'), 0o555, 0o755, onTestFinished);
    const r = await exec('env', ['-u', 'USER', driverPath(sb, 'posix'), 'store.put', 'minimal', 'a/b'], { cwd: sb, input: 'x\n', env: { TMPDIR: temp } });
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe('{"namespace":"minimal","key":"a/b"}\n');
    expect(readFileSync(join(sb, 'minimal/a/b'), 'utf8')).toBe('x\n');
  });
});

describe('the posix scan reads a namespace in one pass', { concurrent: true }, () => {
  const CAP = 16 * 1024 * 1024;
  const REAL_OD = spawnSync('sh', ['-c', 'command -v od'], { encoding: 'utf8' }).stdout.trim();
  const scanAnswer = (ns: string, items: readonly (readonly [string, Buffer])[]) =>
    `${JSON.stringify({ namespace: ns, items: [...items].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, v]) => ({ key, value_b64: v.toString('base64') })) })}\n`;
  const notice = "store.scan: notice: namespace 'unit' was read from its deprecated fallback root\n";
  const scratchOf = (sb: string) => readdirSync(join(sb, '.contexture/tmp')).filter((n) => n !== 'locks').sort();
  // od logging the type of every read: the one pass reads -tx1, the storage core's encoder -tu1
  // a key; with refuse, the one pass read fails, so the scan is read key by key
  const odLog = (log: string, refuse: boolean) =>
    pathPlant('od', `printf '%s\\n' "$3" >> '${log}'\n${refuse ? 'case "$3" in -tx1) exit 1 ;; esac\n' : ''}exec '${REAL_OD}' "$@"`);
  const reads = (log: string) => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
  const pattern = (n: number) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 7919 + (i >> 8)) % 256));
  let empty: string;
  beforeAll(async () => {
    empty = await docsStore('posix', false);
  });

  it('[the-engine-r19, the-engine-r-b3r6t] answers byte for byte what its key by key read answers: every byte value, empty, NUL, invalid UTF-8, a 16 MiB value, the key caps, a deep key, the fallback root\'s shadowing', { timeout: 300_000 }, async () => {
    const sb = fresh(empty);
    const seg200 = `a${'b'.repeat(199)}`;
    const k512 = `u4/${'c'.repeat(200)}/${'d'.repeat(200)}/${'e'.repeat(107)}`;
    const deep = `u5/${Array.from({ length: 100 }, (_, i) => `s${i + 1}`).join('/')}`;
    expect([seg200.length, k512.length]).toEqual([200, 512]);
    const items: [string, Buffer][] = [
      ['u1/state', Buffer.from(Array.from({ length: 256 }, (_, i) => i))],
      ['u1/backlog', Buffer.alloc(0)],
      ['u1/knowledge', Buffer.from([0, 0, 0])],
      ['u1/journal', Buffer.from([0x61, 0, 0x62, 0, 0x0a, 0])],
      ['u1/lanes/l1/report', Buffer.from([0xff, 0xfe, 0xc3, 0x28, 0xa0, 0xa1, 0x20, 0xe2, 0x82, 0x0a])],
      ['u1/lanes/l2/big', pattern(CAP)],
      ...[1, 2, 3, 4, 5, 6, 15, 16, 17, 31, 32, 33, 47, 48, 49, 50].map((n): [string, Buffer] => [`u2/p/n${n}`, pattern(n)]),
      [`u3/${seg200}`, Buffer.from('a segment at the cap\n')],
      [k512, Buffer.from('a key at the cap\n')],
      [deep, Buffer.from('a deep key\n')],
    ];
    for (const [key, v] of items) plant(sb, `${RECORD_ROOT}/${key}.md`, v);
    for (const rel of [`u4/${'c'.repeat(200)}/${'d'.repeat(200)}/${'f'.repeat(108)}`, `u3/${'g'.repeat(201)}`, 'Bad Key/state', 'u6/.hidden']) plant(sb, `${RECORD_ROOT}/${rel}.md`, 'refused\n');
    plant(sb, `${RECORD_ROOT}/u7/state.txt`, 'another suffix\n');
    const fallback: [string, Buffer][] = [['f1/state', Buffer.from('only in the fallback\n')], ['zz/state', Buffer.from('the last key\n')]];
    for (const [key, v] of fallback) plant(sb, `${FALLBACK_ROOT}/${key}.md`, v);
    plant(sb, `${FALLBACK_ROOT}/u1/state.md`, 'shadowed by the root\n');
    plant(sb, `${FALLBACK_ROOT}/f2/state.md`, 'the root holds a folder of this name\n');
    mkdirSync(join(sb, RECORD_ROOT, 'f2/state.md'), { recursive: true });
    plant(sb, `${FALLBACK_ROOT}/f3/state.md`, 'the root holds a link of this name\n');
    plant(sb, 'linked/f3.md', 'the link\'s target\n');
    mkdirSync(join(sb, RECORD_ROOT, 'f3'));
    symlinkSync(join(sb, 'linked/f3.md'), join(sb, RECORD_ROOT, 'f3/state.md'));
    const expected = scanAnswer('unit', [...items, ...fallback, ['f3/state', Buffer.from('the link\'s target\n')]]);
    const onePass = join(sandbox('scan-one-pass'), 'od.log');
    const keyByKey = join(sandbox('scan-key-by-key'), 'od.log');
    const [one, keyed] = await Promise.all([store(sb, 'posix', odLog(onePass, false)).scan('unit'), store(sb, 'posix', odLog(keyByKey, true)).scan('unit')]);
    expect([one.code, one.stderr]).toEqual([0, notice]);
    expect(one.stdout === expected, 'the one pass answers the reference').toBe(true);
    expect(keyed.stdout === one.stdout, 'the key by key read answers the one pass byte for byte').toBe(true);
    expect([keyed.code, keyed.stderr]).toEqual([0, notice]);
    expect(reads(onePass).filter((t) => t !== '-tx1'), 'the one pass ran no per key encoder').toEqual([]);
    expect(reads(keyByKey).filter((t) => t === '-tu1').length, 'the key by key read encoded every item').toBe(items.length + fallback.length + 1);
  });

  it('[the-engine-r19] runs the same external commands over 40 keys as over 3, never a process per key, and over thousands one od, awk, and wc pair more a run of paths', { timeout: 180_000 }, async () => {
    const shims = shimPath();
    const keyed = (n: number, wide: number) => {
      const sb = fresh(empty);
      const keys = Array.from({ length: n }, (_, i) => `workspace/k${String(i).padStart(4, '0')}${'x'.repeat(wide)}`);
      for (const k of keys) plant(sb, `docs/${k}.md`, `value of ${k}\n`);
      return { sb, keys };
    };
    const calls = async ({ sb, keys }: { sb: string; keys: string[] }) => {
      const log = join(sb, 'calls.log');
      writeFileSync(log, '');
      const r = await store(sb, 'posix', { PATH: shims, SHIM_LOG: log }).scan('docs');
      expect(answer(r, 'store.scan').items.map((i: { key: string }) => i.key)).toEqual(keys);
      return readFileSync(log, 'utf8').split('\n').filter(Boolean).sort();
    };
    const lots = keyed(2000, 60);
    const [few, many, all] = await Promise.all([calls(keyed(3, 60)), calls(keyed(40, 60)), calls(lots)]);
    expect(few.length, 'the instrument counts the scan\'s commands').toBeGreaterThan(5);
    expect(many).toEqual(few);
    const per = (log: string[], name: string) => log.filter((c) => c === name).length;
    expect(per(few, 'od')).toBe(1);
    const runs = per(all, 'od');
    const bytes = lots.keys.reduce((s, k) => s + `./docs/${k}.md`.length + 1, 0);
    expect(runs, `${bytes} bytes of paths`).toBeGreaterThanOrEqual(Math.ceil(bytes / 32768));
    expect(runs).toBeLessThanOrEqual(Math.ceil(bytes / (32768 - 200)));
    expect(all).toEqual([...few, ...Array.from({ length: runs - 1 }, () => ['awk', 'od', 'wc', 'wc']).flat()].sort());
  });

  it('[the-engine-r19] scans a value of 2 MiB and one byte in time linear in its size, its base64 the core encoder\'s', async () => {
    const sb = fresh(empty);
    const value = pattern(2 * 1024 * 1024 + 1);
    plant(sb, 'docs/workspace/big.md', value);
    const t0 = Date.now();
    const r = await store(sb, 'posix').scan('docs');
    const took = Date.now() - t0;
    expect(r.stdout === scanAnswer('docs', [['workspace/big', value]])).toBe(true);
    expect(took, `the scan took ${took} ms`).toBeLessThan(30_000);
  });

  it.each([
    ['fails after its first line', 'exit 1'],
    ['succeeds after its first line', 'exit 0'],
  ])('[the-engine-r19, the-engine-r21] a key by key read whose encoder\'s od %s refuses rc 2 naming the key, never answering part of the value', async (_, end) => {
    const sb = fresh(empty);
    plant(sb, 'docs/workspace/a.md', pattern(100));
    const od = pathPlant('od', `case "$3" in -tx1) exit 1 ;; -tu1) '${REAL_OD}' "$@" | head -n 1; ${end} ;; esac\nexec '${REAL_OD}' "$@"`);
    refused(await store(sb, 'posix', od).scan('docs'), 'store.scan', 2, 'ERR_STORAGE_READ', "cannot read key 'workspace/a' in namespace 'docs'");
  });

  it.each([
    ['two values swapping places, the read\'s length unchanged', '(cd docs/workspace && mv a.md t && mv b.md a.md && mv t b.md)'],
    ['a value grown', "printf 'grown by a write between the sizing and the read\\n' > docs/workspace/a.new && mv docs/workspace/a.new docs/workspace/a.md"],
  ])('[the-engine-r21] answers every value whole when a write lands between a run\'s sizing and its read: %s', async (_, write) => {
    const sb = fresh(empty);
    plant(sb, 'docs/workspace/a.md', 'short\n');
    plant(sb, 'docs/workspace/b.md', 'a much longer value than the other one\n');
    const mark = join(sandbox('scan-write'), 'done');
    const plantEnv = pathPlant('od', `if [ "$3" = -tx1 ] && [ ! -f '${mark}' ]; then : > '${mark}'; ${write}; fi\nexec '${REAL_OD}' "$@"`);
    const r = await store(sb, 'posix', plantEnv).scan('docs');
    expect(existsSync(mark), 'the write landed inside the run').toBe(true);
    expect(r.stdout).toBe(scanAnswer('docs', ['a', 'b'].map((k): [string, Buffer] => [`workspace/${k}`, readFileSync(join(sb, `docs/workspace/${k}.md`))])));
  });

  it.each([
    ['SIGINT', true, 130],
    ['SIGTERM', false, 143],
  ] as const)('[the-engine-r28] a scan under %s (to its group: %s) while a run reads its values stops at once, exits %s, and leaves no temp and no process', { timeout: 180_000 }, async (sig, group, code) => {
    const sb = fresh(empty);
    plant(sb, 'docs/workspace/big.md', pattern(CAP));
    const t0 = Date.now();
    answer(await store(sb, 'posix').scan('docs'), 'store.scan');
    const whole = Date.now() - t0;
    const before = scratchOf(sb);
    const mark = join(sandbox('scan-signal'), 'reading');
    const run = launch(driverPath(sb, 'posix'), ['store.scan', 'docs'], { cwd: sb, input: '', group, env: pathPlant('od', `[ "$3" = -tx1 ] && : > '${mark}'\nexec '${REAL_OD}' "$@"`) });
    expect(await waitFor(() => existsSync(mark), 60_000), 'the run reads its values').toBe(true);
    await new Promise((done) => setTimeout(done, 200));
    const t1 = Date.now();
    run.signal(sig);
    const r = await run.result;
    const stopped = Date.now() - t1;
    expect([r.code, r.stdout]).toEqual([code, '']);
    expect(stopped, `stopped in ${stopped} ms, a whole scan ${whole} ms`).toBeLessThan(whole / 2);
    expect(scratchOf(sb)).toEqual(before);
    expect(await waitFor(() => !alive(-(run.child.pid as number)), 5_000), 'no process of the scan is left').toBe(true);
  });
});
