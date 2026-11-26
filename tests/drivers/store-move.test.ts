import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { RECORD_ROOT, SQLITE_DB, declaredRoot, leaks } from '../support/drawer';
import { exec, launch, type Run } from '../support/exec';
import { holdMove, moveToken } from '../support/locks';
import { plantDriver } from '../support/planted';
import { alive } from '../support/procs';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { fresh, seedSteps } from '../support/snapshot';
import { sqliteAvailable } from '../support/stage';
import { type Action, batchPayload, listAnswer } from '../support/store';
import { put } from '../support/tree';
import { waitFor } from '../support/unit';
import { answer, unb64 } from '../support/wire';

const NAMESPACES = ['docs', 'notebook', 'store', 'unit'] as const;
type Namespace = (typeof NAMESPACES)[number];
const DOCS_DATA = readFileSync(join(ROOT, 'plugins/docs-discipline/.contexture/extensions/modules/docs/data'), 'utf8');
const STORE_ROOT = declaredRoot(join(ROOT, 'base/.contexture/modules/store/data'));
const DOCS_ROOT = declaredRoot(join(ROOT, 'plugins/docs-discipline/.contexture/extensions/modules/docs/data'));
const KEPT = ", kept by package 'pkg-a'";
const MIB = 1024 * 1024;

const pad = (i: number): string => String(i).padStart(2, '0');
const ALL_BYTES = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
const ARTIFACTS = ['state', 'backlog', 'knowledge', 'journal', 'lanes/l1/recipe', 'lanes/l1/journal', 'lanes/l1/report'];

function bytes(n: number, seed: number): Buffer {
  const b = Buffer.alloc(n);
  let x = seed >>> 0;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    b[i] = x >>> 24;
  }
  return b;
}

const SEED: Record<Namespace, Action[]> = {
  docs: Array.from({ length: 20 }, (_, i) => ({ action: 'put', key: `workspace/d${pad(i + 1)}`, value: `@doc d${i + 1}\n` })),
  notebook: Array.from({ length: 20 }, (_, i) => ({ action: 'put', key: `k${pad(i + 1)}/x`, value: `note ${i + 1}\n` })),
  store: Array.from({ length: 20 }, (_, i) => ({ action: 'put', key: `containers/c${pad(i + 1)}`, value: `description: c${i + 1}\n` })),
  unit: ['u1', 'u2', 'u3'].flatMap((u) =>
    ARTIFACTS.map((a): Action => ({
      action: 'put',
      key: `${u}/${a}`,
      value: `${u}/${a}` === 'u1/lanes/l1/journal' ? '' : `${u}/${a}` === 'u2/knowledge' ? ALL_BYTES : `${u} ${a}\nline two\n`,
    })),
  ),
};
const COUNT: Record<Namespace, number> = { docs: 20, notebook: 20, store: 20, unit: 21 };

const resolver = (sb: string) => join(sb, '.contexture/storage/scripts/driver-resolver');
const rsv = (sb: string, args: readonly string[], input: string | Buffer = '', env: Record<string, string> = {}): Promise<Run> =>
  exec(resolver(sb), args, { cwd: sb, input, env: { CTX_ROOT: sb, ...env } });
const engine = (sb: string) => join(sb, '.contexture/storage/scripts/store-move');
const move = (sb: string, args: readonly string[], env: Record<string, string> = {}): Promise<Run> =>
  exec(engine(sb), args, { cwd: sb, env: { CTX_ROOT: sb, ...env }, timeout: 300_000 });

function configure(sb: string, driver?: string, database?: string): void {
  const lines = [driver && `storage.driver: ${driver}`, database && `storage.database: ${database}`].filter(Boolean);
  writeFileSync(join(sb, '.contexture/config'), lines.map((l) => `${l}\n`).join(''));
}

// kept: the kept data declaration a package uninstall answered keep leaves
function kept(sb: string, ns: string, data: string): void {
  const dir = join(sb, '.contexture/extensions/.state/retained', ns);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'data'), data);
  writeFileSync(join(dir, 'origin'), `package pkg-a\nversion 1.0.0\nmodule ${ns} memos\n`);
}

async function load(sb: string, ns: string, actions: readonly Action[], driver = 'posix'): Promise<void> {
  answer(await rsv(sb, [`--driver=${driver}`, 'store.batch', ns], batchPayload(actions)), 'store.batch');
}

const snap = seedSteps('store-move', [
  {
    name: 'base',
    build: async (sb) => {
      configure(sb);
      dataFile(sb, 'extensions', 'docs', DOCS_DATA);
      kept(sb, 'notebook', 'key: <a>/<b>\n');
      for (const ns of NAMESPACES) await load(sb, ns, SEED[ns]);
    },
  },
  {
    name: 'big',
    from: 'base',
    build: async (sb) => load(sb, 'store', [{ action: 'put', key: 'containers/big', value: bytes(6 * MIB, 7) }]),
  },
  {
    name: 'wide',
    from: 'base',
    build: async (sb) =>
      load(sb, 'store', [
        { action: 'put', key: 'containers/v1', value: bytes(5 * MIB, 11) },
        { action: 'put', key: 'containers/v2', value: bytes(4 * MIB, 13) },
        ...Array.from({ length: 200 }, (_, i): Action => ({ action: 'put', key: `wide/w${String(i + 1).padStart(3, '0')}`, value: `w${i}\n` })),
      ]),
  },
], 'sqlite');

async function scans(sb: string, driver?: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const ns of NAMESPACES) {
    const r = await rsv(sb, [...(driver ? [`--driver=${driver}`] : []), 'store.scan', ns]);
    expect([r.code, r.stderr.replace(/^.*notice.*\n/gm, '')], `${ns} scan`).toEqual([0, '']);
    out[ns] = r.stdout;
  }
  return out;
}

async function listed(sb: string, driver: string, ns: string): Promise<string[]> {
  return answer(await rsv(sb, [`--driver=${driver}`, 'store.list', ns]), 'store.list').keys;
}

function copied(counts: Record<Namespace, number>): string {
  const lines = NAMESPACES.map((ns) => `${ns}: ${counts[ns]} keys copied, dumps equal${ns === 'notebook' ? KEPT : ''}\n`);
  const total = NAMESPACES.reduce((n, ns) => n + counts[ns], 0);
  return `${lines.join('')}copied ${total} keys in 4 namespaces\n`;
}

function checked(counts: Record<Namespace, number>): string {
  const lines = NAMESPACES.map((ns) => `${ns}: ${counts[ns]} keys, dumps equal through the configured driver${ns === 'notebook' ? KEPT : ''}\n`);
  const total = NAMESPACES.reduce((n, ns) => n + counts[ns], 0);
  return `${lines.join('')}checked ${total} keys in 4 namespaces\n`;
}

function refusal(r: Run, cmd: string, rc: number, code: string, message: string, details: readonly string[] = []): void {
  expect(r.code, `${cmd} rc [${r.stderr}]`).toBe(rc);
  const err = r.stderr.split('\n').filter((l) => !l.includes(': note: '));
  expect(err).toEqual([`store-move ${cmd}: error: ${message} (${code})`, ...details.map((d) => `  ${d}`), '']);
}

function pathless(sb: string, ...runs: Run[]): void {
  for (const r of runs) {
    for (const line of `${r.stdout}${r.stderr}`.split('\n')) {
      expect(line.includes(sb), `a line names the sandbox: ${line}`).toBe(false);
      expect(line.includes('.contexture'), `a line names the drawer: ${line}`).toBe(false);
      expect(leaks(line), `a line names a record path: ${line}`).toBe(false);
    }
  }
}

const runFolder = (sb: string) => join(sb, '.contexture/tmp/store-move');

describe.skipIf(!sqliteAvailable())('store-move between posix and sqlite', { concurrent: true }, () => {
  it('[the-engine-r-mov01] posix to sqlite and back over every namespace, an empty value, a kept namespace, and a 6 MiB value: each leg copies, checks after the switch, and retires the old copy, the way back reading byte equal and the backup restoring by one batch', { timeout: 600_000 }, async () => {
    const sb = fresh(await snap('big'));
    const before = await scans(sb, 'posix');
    const counts = { ...COUNT, store: 21 };

    let t = performance.now();
    const there = await move(sb, ['copy', 'posix', 'sqlite']);
    const thereMs = performance.now() - t;
    expect([there.code, there.stdout, there.stderr]).toEqual([0, copied(counts), '']);
    configure(sb, 'sqlite');
    const check = await move(sb, ['check', 'posix']);
    expect([check.code, check.stdout, check.stderr]).toEqual([0, checked(counts), '']);
    const retire = await move(sb, ['retire', 'posix', 'backup']);
    expect([retire.code, retire.stderr]).toEqual([0, '']);
    const stamp = /^retired 82 keys in 4 namespaces, backup stamped ([0-9]{8}-[0-9]{6}-[0-9]+)$/m.exec(retire.stdout)?.[1];
    expect(stamp, retire.stdout).toBeDefined();
    expect(retire.stdout.split('\n').slice(0, 4)).toEqual(NAMESPACES.map((ns) => `${ns}: ${counts[ns]} keys retired${ns === 'notebook' ? KEPT : ''}`));
    for (const ns of NAMESPACES) expect(await listed(sb, 'posix', ns), `${ns} retired`).toEqual([]);
    const backup = join(sb, '.contexture/backups', `move-${stamp}`);
    for (const ns of NAMESPACES) {
      expect(readFileSync(join(backup, ns, 'scan'), 'utf8')).toBe(before[ns]);
      expect(readFileSync(join(backup, ns, 'count'), 'utf8')).toBe(`${counts[ns]}\n`);
    }

    t = performance.now();
    const back = await move(sb, ['copy', 'sqlite', 'posix']);
    const backMs = performance.now() - t;
    expect([back.code, back.stdout, back.stderr]).toEqual([0, copied(counts), '']);
    configure(sb);
    const recheck = await move(sb, ['check', 'sqlite']);
    expect([recheck.code, recheck.stdout, recheck.stderr]).toEqual([0, checked(counts), '']);
    const reretire = await move(sb, ['retire', 'sqlite', 'delete']);
    expect([reretire.code, reretire.stderr]).toEqual([0, '']);
    expect(reretire.stdout.split('\n').slice(-2)).toEqual(['retired 82 keys in 4 namespaces, no backup kept', '']);
    for (const ns of NAMESPACES) expect(await listed(sb, 'sqlite', ns), `${ns} retired`).toEqual([]);

    expect(await scans(sb, 'posix')).toEqual(before);
    expect(readdirSync(runFolder(sb)), 'the run keeps nothing once retired').toEqual([]);
    pathless(sb, there, check, retire, back, recheck, reretire);
    expect(thereMs, 'the copy into sqlite with a 6 MiB value').toBeLessThan(180_000);
    expect(backMs, 'the copy back into posix with a 6 MiB value').toBeLessThan(180_000);

    for (const ns of NAMESPACES) {
      const items: { key: string; value_b64: string }[] = JSON.parse(readFileSync(join(backup, ns, 'scan'), 'utf8')).items;
      await load(sb, ns, items.map((i) => ({ action: 'put', key: i.key, value: unb64(i.value_b64) })), 'sqlite');
    }
    expect(await scans(sb, 'sqlite')).toEqual(before);
  });

  it('[the-engine-r-mov01] preflight answers the count to copy per namespace and writes nothing: no target database, the source unchanged', async () => {
    const sb = fresh(await snap('base'));
    const before = await scans(sb, 'posix');
    const r = await move(sb, ['preflight', 'posix', 'sqlite']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(`${NAMESPACES.map((ns) => `${ns}: ${COUNT[ns]} keys to copy${ns === 'notebook' ? KEPT : ''}\n`).join('')}ready to copy 81 keys in 4 namespaces\n`);
    expect(existsSync(join(sb, SQLITE_DB)), 'no target database is made').toBe(false);
    expect(await scans(sb, 'posix')).toEqual(before);
  });

  it.each([
    ['blind', 'the dumps differ; the counts differ (source list 20, source scan 20, written 20, target scan 0, target list 0)', Array.from({ length: 20 }, (_, i) => `containers/c${pad(i + 1)}: missing in the target`)],
    ['dropping', 'the dumps differ; the counts differ (source list 20, source scan 20, written 20, target scan 19, target list 19)', ['containers/c01: missing in the target']],
    ['corrupting', 'the dumps differ', ['containers/c01: the value differs']],
    ['adding', 'the dumps differ; the counts differ (source list 20, source scan 20, written 21, target scan 21, target list 21)', ['zz/extra: extra in the target']],
  ] as const)('[the-engine-r-mov01] the %s target fails the verify rc 2, the diagnosis naming each key from the two dumps, the namespaces before it copied', async (plant, why, details) => {
    const sb = fresh(await snap('base'));
    plantDriver(sb, plant, plant, 'sqlite', 'store');
    const r = await move(sb, ['copy', 'posix', plant]);
    expect(r.stdout).toBe(`docs: 20 keys copied, dumps equal\nnotebook: 20 keys copied, dumps equal${KEPT}\n`);
    refusal(r, 'copy', 2, 'ERR_STORAGE_WRITE', `the copy of namespace 'store' fails: ${why}`, details);
    pathless(sb, r);
  });

  it('[the-engine-r-mov01] a scan blind source (its list holding keys, its scan none) passes the dump compare and fails the counts', async () => {
    const sb = fresh(await snap('base'));
    plantDriver(sb, 'scanblind', 'scanblind', 'posix', 'store');
    const r = await move(sb, ['copy', 'scanblind', 'sqlite']);
    refusal(r, 'copy', 2, 'ERR_STORAGE_WRITE', "the copy of namespace 'store' fails: the counts differ (source list 20, source scan 0, written 0, target scan 0, target list 0)");
  });

  it('[the-engine-r-mov01] a wholly blind source (list and scan empty) fails on its storage health reading the store present, before any write', async () => {
    const sb = fresh(await snap('base'));
    plantDriver(sb, 'allblind', 'allblind', 'posix', 'store');
    const r = await move(sb, ['copy', 'allblind', 'sqlite']);
    expect(r.stdout).toBe('');
    refusal(r, 'copy', 2, 'ERR_STORAGE_READ', 'the source lists no key of a namespace whose store its storage health reads present, so it cannot be read whole', ['store']);
    expect(existsSync(join(sb, SQLITE_DB))).toBe(false);
  });

  it('[the-engine-r-mov01] a target already holding keys refuses rc 1 ERR_ENTITY_EXISTS naming each namespace\'s count, nothing written', async () => {
    const sb = fresh(await snap('base'));
    await load(sb, 'docs', [{ action: 'put', key: 'workspace/old', value: 'old\n' }], 'sqlite');
    await load(sb, 'unit', [{ action: 'put', key: 'u9/state', value: 'old\n' }, { action: 'put', key: 'u9/backlog', value: 'old\n' }], 'sqlite');
    const r = await move(sb, ['copy', 'posix', 'sqlite']);
    expect(r.stdout).toBe('');
    refusal(r, 'copy', 1, 'ERR_ENTITY_EXISTS', 'the target already holds keys and a move never merges, counted below', ['docs: 1 keys', 'unit: 2 keys']);
    expect(await listed(sb, 'sqlite', 'store')).toEqual([]);
    expect(await listed(sb, 'sqlite', 'docs')).toEqual(['workspace/old']);
  });

  it('[the-engine-r-mov01] a source key outside the core key rule and one outside the document rules refuse rc 1, each named on its own line', async () => {
    const sb = fresh(await snap('base'));
    await load(sb, 'unit', [{ action: 'put', key: 'u1/other', value: 'x\n' }]);
    plantDriver(sb, 'listing', 'listing', 'posix', 'docs');
    const r = await move(sb, ['preflight', 'listing', 'sqlite']);
    expect(r.stdout).toBe('');
    refusal(r, 'preflight', 1, 'ERR_INVALID_ARGUMENT', 'the source holds keys the move cannot carry, named below; rename or remove them and run again', [
      "docs: 'zz/Bad Key' is outside the key rule",
      "unit: 'u1/other' is outside the namespace's document rules",
    ]);
  });

  it('[the-engine-r-mov01, the-engine-r-lf7vr] a posix source holding refused keys refuses rc 1 by counts, each namespace pointing to its sweep or to the human\'s own act; a killed writer\'s temp is only noted', async () => {
    const sb = fresh(await snap('base'));
    put(join(sb, RECORD_ROOT, 'u1', 'bad name.md'), 'x\n');
    put(join(sb, STORE_ROOT, 'containers', 'bad name'), 'x\n');
    put(join(sb, DOCS_ROOT, 'workspace', 'bad name.md'), 'x\n');
    put(join(sb, STORE_ROOT, 'containers', '.c05Ab12Cd'), 'half\n');
    const r = await move(sb, ['preflight', 'posix', 'sqlite']);
    expect(r.stdout).toBe('');
    refusal(r, 'preflight', 1, 'ERR_INVALID_ARGUMENT', "the source's posix store holds keys the move cannot carry, counted below; clear them and run again", [
      "docs: refused keys 1, keys outside the document rules 0; no sweep serves this namespace, so clearing them is the human's own act",
      'store: refused keys 1, keys outside the document rules 0; preview the sweep with ctx store check --leftovers --sweep --dry-run',
      'unit: refused keys 1, keys outside the document rules 0; preview the sweep with ctx unit migrate --sweep --dry-run --all',
    ]);
    expect(r.stderr).toContain("store-move preflight: note: store: the source's posix store also holds remnants 1 (5 bytes) beside its records; the move leaves them in place\n");
    pathless(sb, r);
  });

  it('[the-engine-r-mov01] a killed writer\'s temp in an empty suffix namespace is never copied', async () => {
    const sb = fresh(await snap('base'));
    put(join(sb, STORE_ROOT, 'containers', '.c05Ab12Cd'), 'half\n');
    const r = await move(sb, ['copy', 'posix', 'sqlite']);
    expect([r.code, r.stdout]).toEqual([0, copied(COUNT)]);
    expect(await listed(sb, 'sqlite', 'store')).toEqual(SEED.store.map((a) => a.key));
  });

  it('[the-engine-r-mov01] a namespace named like the preflight\'s own findings (blind, keys, left, say, target) preflights and copies as any other', async () => {
    const sb = fresh(await snap('base'));
    const names = ['blind', 'keys', 'left', 'say', 'target'];
    for (const ns of names) {
      dataFile(sb, 'modules', ns, 'key: <a>\n');
      await load(sb, ns, [{ action: 'put', key: 'a1', value: `${ns}\n` }]);
    }
    const all = [...NAMESPACES, ...names].sort();
    const n = (ns: string): number => (names.includes(ns) ? 1 : COUNT[ns as Namespace]);
    const keptBy = (ns: string): string => (ns === 'notebook' ? KEPT : '');
    const pre = await move(sb, ['preflight', 'posix', 'sqlite']);
    expect([pre.code, pre.stdout, pre.stderr]).toEqual([0, `${all.map((ns) => `${ns}: ${n(ns)} keys to copy${keptBy(ns)}\n`).join('')}ready to copy 86 keys in 9 namespaces\n`, '']);
    const r = await move(sb, ['copy', 'posix', 'sqlite']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${all.map((ns) => `${ns}: ${n(ns)} keys copied, dumps equal${keptBy(ns)}\n`).join('')}copied 86 keys in 9 namespaces\n`, '']);
  });

  it.each([
    [{ CTX_STORAGE_SQLITE_PATH: 'elsewhere.db' }, 'CTX_STORAGE_SQLITE_PATH'],
    [{ CTX_STORAGE_DRIVER: 'sqlite', CTX_STORAGE_MOVE: '1' }, 'CTX_STORAGE_DRIVER'],
  ])('[the-engine-r-mov01] a storage variable other than the token refuses every command rc 1, named, before any read', async (env, name) => {
    const sb = fresh(await snap('base'));
    for (const args of [['preflight', 'posix', 'sqlite'], ['copy', 'posix', 'sqlite'], ['check', 'posix'], ['unwind', 'sqlite'], ['retire', 'posix', 'delete']]) {
      refusal(await move(sb, args, env), args[0], 1, 'ERR_INVALID_ARGUMENT',
        `the environment sets ${name}; a storage variable other than the move's token can point a driver elsewhere, so unset it and run again`);
    }
    expect(existsSync(join(sb, SQLITE_DB))).toBe(false);
  });

  it('[the-engine-r-mov01, the-engine-r-cj0ey] a namespace listing that leaves a module out refuses rc 2 quoting the reader\'s first reason', async () => {
    const sb = fresh(await snap('base'));
    dataFile(sb, 'modules', 'broken', 'key: <a>\nbogus: x\n');
    const r = await move(sb, ['copy', 'posix', 'sqlite']);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^store-move copy: error: the namespace listing left a module out: .*bogus.* \(ERR_STORAGE_READ\)\n$/);
  });

  it('[the-engine-r-mov01] check catches a source write that slipped in after the copy, naming the key', async () => {
    const sb = fresh(await snap('base'));
    expect((await move(sb, ['copy', 'posix', 'sqlite'])).code).toBe(0);
    await load(sb, 'store', [{ action: 'put', key: 'containers/late', value: 'late\n' }]);
    configure(sb, 'sqlite');
    const r = await move(sb, ['check', 'posix']);
    expect(r.stdout).toBe(`docs: 20 keys, dumps equal through the configured driver\nnotebook: 20 keys, dumps equal through the configured driver${KEPT}\n`);
    refusal(r, 'check', 2, 'ERR_STORAGE_WRITE',
      "the check of namespace 'store' fails: the dumps differ; the counts differ (source list 21, source scan 21, copied 20, configured driver scan 20, configured driver list 20)",
      ['containers/late: missing in the target']);
  });

  it('[the-engine-r-mov01] check catches a target the configured driver resolves elsewhere, and refuses while the configured driver is still the source', async () => {
    const sb = fresh(await snap('base'));
    expect((await move(sb, ['copy', 'posix', 'sqlite'])).code).toBe(0);
    refusal(await move(sb, ['check', 'posix']), 'check', 1, 'ERR_INVALID_ARGUMENT', "the configured driver is still the source 'posix'; switch the storage driver before the check");
    configure(sb, 'sqlite', '.contexture/tmp/elsewhere.db');
    const r = await move(sb, ['check', 'posix']);
    expect(r.stdout).toBe('');
    expect(r.code).toBe(2);
    expect(r.stderr.split('\n')[0]).toBe(
      "store-move check: error: the check of namespace 'docs' fails: the dumps differ; the counts differ (source list 20, source scan 20, copied 20, configured driver scan 0, configured driver list 0) (ERR_STORAGE_WRITE)");
    expect(r.stderr.split('\n').filter((l) => l.endsWith(': missing in the target'))).toHaveLength(20);
  });

  it('[the-engine-r-mov01] check and retire refuse a run that holds no copy or no passed check', async () => {
    const sb = fresh(await snap('base'));
    configure(sb, 'sqlite');
    refusal(await move(sb, ['check', 'posix']), 'check', 1, 'ERR_INVALID_ARGUMENT', "this run holds no copy from 'posix'; run store-move copy in the same run first");
    refusal(await move(sb, ['retire', 'posix', 'backup']), 'retire', 1, 'ERR_INVALID_ARGUMENT', "this run holds no passed check of the source 'posix'; run store-move check first");
    expect(await listed(sb, 'posix', 'unit')).toHaveLength(21);
  });

  it('[the-engine-r-mov01] unwind deletes exactly the keys the run wrote, sparing a key it did not write, and refuses a driver that is not the run\'s target', async () => {
    const sb = fresh(await snap('base'));
    expect((await move(sb, ['copy', 'posix', 'sqlite'])).code).toBe(0);
    await load(sb, 'unit', [{ action: 'put', key: 'zz/kept', value: 'mine\n' }], 'sqlite');
    refusal(await move(sb, ['unwind', 'posix']), 'unwind', 1, 'ERR_INVALID_ARGUMENT', "this run wrote into 'sqlite', not 'posix'; unwind the run's own target");
    expect(await listed(sb, 'posix', 'unit')).toHaveLength(21);
    const r = await move(sb, ['unwind', 'sqlite']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(`${NAMESPACES.map((ns) => `${ns}: ${COUNT[ns]} keys unwound\n`).join('')}unwound 81 keys in 4 namespaces\n`);
    for (const ns of ['docs', 'notebook', 'store']) expect(await listed(sb, 'sqlite', ns)).toEqual([]);
    expect(await listed(sb, 'sqlite', 'unit')).toEqual(['zz/kept']);
    expect((await move(sb, ['unwind', 'sqlite'])).stdout).toBe('unwound 0 keys in 0 namespaces\n');
    expect(await scans(sb, 'posix')).toEqual(await scans(fresh(await snap('base')), 'posix'));
  });

  it('[the-engine-r-mov01] a refused batch stops the copy rc 2 naming the namespace and the keys written so far, and the unwind leaves every target namespace listing no key', async () => {
    const sb = fresh(await snap('wide'));
    plantDriver(sb, 'refusing', 'refusing', 'sqlite', 'store');
    const r = await move(sb, ['copy', 'posix', 'refusing']);
    expect(r.stdout).toBe(`docs: 20 keys copied, dumps equal\nnotebook: 20 keys copied, dumps equal${KEPT}\n`);
    refusal(r, 'copy', 2, 'ERR_STORAGE_WRITE', "copying namespace 'store' stopped after 21 of 222 keys were written: the planted refusal");
    expect(await listed(sb, 'sqlite', 'store')).toHaveLength(21);
    const u = await move(sb, ['unwind', 'refusing']);
    expect([u.code, u.stdout, u.stderr]).toEqual([0, 'docs: 20 keys unwound\nnotebook: 20 keys unwound\nstore: 21 keys unwound\nunit: 0 keys unwound\nunwound 61 keys in 4 namespaces\n', '']);
    for (const ns of NAMESPACES) expect(await listed(sb, 'sqlite', ns), ns).toEqual([]);
  });

  it('[the-engine-r-mov01] the copy writes in batches of at most 200 actions and 8 MiB of values, a value that does not fit opening its own batch', async () => {
    const sb = fresh(await snap('wide'));
    const dir = plantDriver(sb, 'counting', 'counting', 'sqlite', 'store');
    const r = await move(sb, ['copy', 'posix', 'counting']);
    expect(r.code).toBe(2);
    const log = readFileSync(join(dir, 'log'), 'utf8').trim().split('\n').map((l) => l.split(' ').map(Number));
    expect(log.map(([n]) => n)).toEqual([21, 200, 1]);
    for (const [n, b] of log) expect(n === 1 || b <= 8 * MIB, `a batch of ${n} actions holds ${b} bytes`).toBe(true);
    expect(log[0][1]).toBeGreaterThan(5 * MIB);
    expect(log[1][1]).toBeGreaterThan(4 * MIB);
  });

  it('[the-engine-r-mov01] the run folder exported as CTX_SCRATCH_ROOT keeps the written keys across commands: an unwind in another run folder finds nothing, in the run\'s own it empties the target', async () => {
    const sb = fresh(await snap('base'));
    const run = sandbox('move-run');
    const other = sandbox('move-other');
    expect((await move(sb, ['copy', 'posix', 'sqlite'], { CTX_SCRATCH_ROOT: run })).code).toBe(0);
    expect(readdirSync(run).sort()).toEqual([...NAMESPACES.map((ns) => `copied.${ns}`), 'move', ...NAMESPACES.map((ns) => `written.${ns}`)].sort());
    expect(readFileSync(join(run, 'written.docs'), 'utf8')).toBe(SEED.docs.map((a) => `${a.key}\n`).join(''));
    expect((await move(sb, ['unwind', 'sqlite'], { CTX_SCRATCH_ROOT: other })).stdout).toBe('unwound 0 keys in 0 namespaces\n');
    expect(await listed(sb, 'sqlite', 'docs')).toHaveLength(20);
    expect((await move(sb, ['unwind', 'sqlite'], { CTX_SCRATCH_ROOT: run })).stdout).toContain('unwound 81 keys in 4 namespaces\n');
    for (const ns of NAMESPACES) expect(await listed(sb, 'sqlite', ns)).toEqual([]);
  });

  it('[the-engine-r-mov01, the-engine-r-mvf01] under a held freeze the copy refuses without the token and the whole move runs with it: copy, check, and retire', async () => {
    const sb = fresh(await snap('base'));
    const release = holdMove(sb, 'sqlite', 'live', 'posix');
    try {
      const no = await move(sb, ['copy', 'posix', 'sqlite']);
      expect(no.stdout).toBe('');
      refusal(no, 'copy', 2, 'ERR_STORAGE_WRITE', "copying namespace 'docs' stopped after 0 of 20 keys were written: storage is being moved to another driver; retry after the move ends");
      expect((await move(sb, ['unwind', 'sqlite'], moveToken())).code).toBe(0);
      const r = await move(sb, ['copy', 'posix', 'sqlite'], moveToken());
      expect([r.code, r.stdout]).toEqual([0, copied(COUNT)]);
      configure(sb, 'sqlite');
      expect((await move(sb, ['check', 'posix'], moveToken())).code).toBe(0);
      const retire = await move(sb, ['retire', 'posix', 'delete'], moveToken());
      expect([retire.code, retire.stderr]).toEqual([0, '']);
      for (const ns of NAMESPACES) expect(await listed(sb, 'posix', ns)).toEqual([]);
      expect(await listed(sb, 'sqlite', 'unit')).toHaveLength(21);
    } finally {
      release();
    }
  });

  it.each([['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]] as const)('[the-engine-r-mov01] a %s stops the batch in flight at once, removes the work folder, and keeps the written keys for the unwind, its caller holding stdin open', async (sig, code) => {
    const sb = fresh(await snap('base'));
    const dir = plantDriver(sb, 'hanging', 'hanging', 'sqlite', 'docs');
    const run = launch(engine(sb), ['copy', 'posix', 'hanging'], { cwd: sb, input: null, env: { CTX_ROOT: sb }, timeout: 60_000 });
    expect(await waitFor(() => existsSync(join(dir, 'pid')), 30_000)).toBe(true);
    const pid = Number(readFileSync(join(dir, 'pid'), 'utf8'));
    run.signal(sig);
    const r = await run.result;
    expect([r.code, r.stdout]).toEqual([code, '']);
    expect(await waitFor(() => !alive(pid), 5_000), 'the batch in flight is stopped').toBe(true);
    expect(readdirSync(runFolder(sb)).filter((n) => n.startsWith('work.'))).toEqual([]);
    expect(readFileSync(join(runFolder(sb), 'written.docs'), 'utf8')).toBe(SEED.docs.map((a) => `${a.key}\n`).join(''));
  });

  it('[the-engine-r-mov01] arguments: a command, its drivers, and the retire answer are checked rc 1 before anything is read', async () => {
    const sb = fresh(await snap('base'));
    const cases: [string[], string, string][] = [
      [[], 'store-move', 'takes a command: preflight, copy, check, unwind, or retire'],
      [['move', 'a', 'b'], 'store-move', "unknown command 'move' (preflight, copy, check, unwind, or retire)"],
      [['copy', 'posix'], 'store-move copy', 'takes <source> <target>'],
      [['check'], 'store-move check', 'takes <source>'],
      [['unwind', 'a', 'b'], 'store-move unwind', 'takes <target>'],
      [['retire', 'posix'], 'store-move retire', 'takes <source> <backup|delete>'],
      [['retire', 'posix', 'keep'], 'store-move retire', "the answer is backup or delete, not 'keep'"],
      [['copy', 'posix', '../x'], 'store-move copy', "malformed driver name '../x'"],
      [['preflight', 'posix', 'posix'], 'store-move preflight', "the source and the target are both 'posix'"],
    ];
    for (const [args, label, message] of cases) {
      const r = await move(sb, args);
      expect([r.code, r.stdout, r.stderr], args.join(' ')).toEqual([1, '', `${label}: error: ${message} (ERR_INVALID_ARGUMENT)\n`]);
    }
    const r = await move(sb, ['copy', 'posix', 'nosuch']);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^store-move copy: error: the storage driver 'nosuch' cannot be used: [^/]* \(ERR_DRIVER_NOT_FOUND\)\n$/);
  });
});
