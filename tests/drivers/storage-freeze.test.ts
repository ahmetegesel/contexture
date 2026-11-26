import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { lockPath, moveMarker, namespaceLock } from '../support/drawer';
import { exec, launch, type Run } from '../support/exec';
import { exitedPid, holdLock, holdMove, moveToken, sleepShim } from '../support/locks';
import { ROOT_USER, chmodPlant, pathPlant, shimPath } from '../support/plants';
import { alive } from '../support/procs';
import { sandbox } from '../support/sandbox';
import { fresh, seed } from '../support/snapshot';
import { DRIVERS, type Driver, sqliteAvailable, stage } from '../support/stage';
import { batchPayload, listAnswer } from '../support/store';
import { waitFor } from '../support/unit';
import { answer, refused } from '../support/wire';

const FROZEN = 'storage is being moved to another driver; retry after the move ends';
const LOCKED = 'ERR_STORAGE_LOCKED';
const DRAIN_CEILING = 300_000;
const resolver = (sb: string) => join(sb, '.contexture/storage/scripts/driver-resolver');
const rsv = (sb: string, args: readonly string[], input: string | Buffer = '', env: Record<string, string> = {}, timeout?: number): Promise<Run> =>
  exec(resolver(sb), args, { cwd: sb, input, env: { CTX_ROOT: sb, ...env }, timeout });
const marker = (sb: string) => lockPath(sb, moveMarker());
const held = (sb: string): Record<string, string> | undefined =>
  existsSync(marker(sb)) ? Object.fromEntries(readdirSync(marker(sb)).sort().map((f) => [f, readFileSync(join(marker(sb), f), 'utf8')])) : undefined;
const staged = (sb: string) => readdirSync(join(sb, '.contexture/tmp')).filter((n) => n.startsWith('store-gate.'));
const own = (message: string, code: string) => `driver-resolver: ERROR: ${message} (${code})\n`;
const other = (driver: Driver): string => (driver === 'posix' ? 'sqlite' : 'posix');
const PID = String(process.pid);

function frozen(r: Run, fn: string): void {
  refused(r, fn, 2, LOCKED, FROZEN);
}

// a sleep plant that counts the polls a take pauses for, each pause returning at once
function sleepCount(): { env: Record<string, string>; count: () => number } {
  const log = join(sandbox('sleep-count'), 'log');
  const env = pathPlant('sleep', `printf 'x\\n' >> "${log}"`);
  return { env, count: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0) };
}

const MV = 'key: <c>/<id>\n';

function seeded(driver: Driver, label: string): Promise<string> {
  return seed(async (sb) => {
    dataFile(sb, 'modules', 'mv', MV);
    answer(await rsv(sb, ['store.put', 'mv', 'a/one'], 'one\n'), 'store.put');
  }, driver, label);
}

async function unchanged(sb: string, env: Record<string, string> = {}): Promise<void> {
  expect((await rsv(sb, ['store.list', 'mv'], '', env)).stdout).toBe(listAnswer('mv', ['a/one']));
  expect((await rsv(sb, ['store.get', 'mv', 'a/one'], '', env)).stdout).toBe('one\n');
  expect(staged(sb), 'no staged payload is left').toEqual([]);
}

const WRITES: readonly [fn: string, args: string[], input: string][] = [
  ['store.put', ['store.put', 'mv', 'a/two'], 'two\n'],
  ['store.delete', ['store.delete', 'mv', 'a/one'], ''],
  ['store.batch', ['store.batch', 'mv'], batchPayload([{ action: 'put', key: 'a/two', value: 'two\n' }])],
  ['store.batch', ['store.batch', 'mv'], batchPayload([{ action: 'delete', key: 'a/one' }])],
  ['store.promote', ['store.promote', 'mv', 'a/'], ''],
  ['storage.sweep', ['storage.sweep', 'mv'], ''],
  ['storage.sweep', ['storage.sweep', 'mv', '--delete'], ''],
  ['store.changes', ['store.changes', 'mv'], ''],
  ['store.put', ['exec', 'store.put', 'mv', 'a/two'], 'two\n'],
];

const READS: readonly [args: string[], input: string][] = [
  [['store.list', 'mv'], ''],
  [['store.get', 'mv', 'a/one'], ''],
  [['store.scan', 'mv'], ''],
  [['store.search', 'mv', 'exact', '0'], 'query=one\n'],
  [['storage.health', 'mv'], ''],
  [['storage.leftovers', 'mv'], ''],
  [['exec', 'capability'], ''],
  [['storage.sweep', 'mv', '--dry-run'], ''],
  [['exec', 'storage.sweep', 'mv', '--delete', '--dry-run'], ''],
];

// a recording driver at the extension tier, configured for the sandbox: it answers the card the
// handshake reads and logs every call it serves
function recorder(): { sb: string; log: () => string[] } {
  const sb = stage('posix', 'freeze-rec');
  dataFile(sb, 'modules', 'mv', MV);
  const dir = join(sb, '.contexture/extensions/storage/drivers/rec');
  mkdirSync(dir, { recursive: true });
  const card = '{"driver":"rec","version":"4.0.0","contract":"4","store":["list","get","put","delete","batch","scan"],"search_modes":[{"name":"exact","description":"a substring"}],"optional":["store"]}';
  writeFileSync(join(dir, 'driver'), [
    '#!/bin/sh',
    `case "$1" in capability) printf '%s\\n' '${card}'; exit 0 ;; esac`,
    `printf '%s\\n' "$*" >> '${join(sb, 'rec.log')}'`,
    'cat > /dev/null',
    "printf '{}\\n'",
    '',
  ].join('\n'), { mode: 0o755 });
  writeFileSync(join(sb, '.contexture/config'), 'storage.driver: rec\n');
  return { sb, log: () => (existsSync(join(sb, 'rec.log')) ? readFileSync(join(sb, 'rec.log'), 'utf8').split('\n').filter(Boolean) : []) };
}

describe('the storage moving freeze at the dispatch, over a recording driver', { concurrent: true }, () => {
  it.each(WRITES)('[the-engine-r-mvf01, the-engine-r21] under a live holder %s refuses at once rc 2 with its own line, and no driver runs', async (fn, args, input) => {
    const r = recorder();
    holdMove(r.sb, 'posix', 'live', 'rec');
    const t0 = performance.now();
    frozen(await rsv(r.sb, args, input), fn);
    expect(performance.now() - t0, 'the freeze never polls').toBeLessThan(20_000);
    expect(r.log(), 'the recording driver never ran').toEqual([]);
    expect(staged(r.sb)).toEqual([]);
  });

  it('[the-engine-r-mvf01] under a live holder every read reaches the driver, the sweep\'s dry run among them', async () => {
    const r = recorder();
    holdMove(r.sb, 'posix', 'live', 'rec');
    for (const [args, input] of READS) expect((await rsv(r.sb, args, input)).code, args.join(' ')).toBe(0);
    expect(r.log()).toEqual([
      'store.list mv',
      'store.get mv a/one',
      'store.scan mv',
      'store.search mv exact 0',
      'storage.health mv',
      'storage.leftovers mv',
      'storage.sweep mv --dry-run',
      'storage.sweep mv --delete --dry-run',
    ]);
  });
});

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'sqlite' && !sqliteAvailable())(`the storage moving freeze on ${driver}`, { concurrent: true }, () => {
    let base: string;
    let shims: string;
    beforeAll(async () => {
      base = await seeded(driver, `freeze-${driver}`);
      shims = shimPath();
    });

    it('[the-engine-r-mvf01] under a live holder every write refuses rc 2 whichever driver it addresses, before and after the storage.driver switch, and the store reads unchanged', async () => {
      const sb = fresh(base);
      holdMove(sb, other(driver), 'live', driver);
      for (const [fn, args, input] of WRITES) frozen(await rsv(sb, args, input), fn);
      for (const env of [{}, { CTX_STORAGE_DRIVER: other(driver) }, { CTX_STORAGE_DRIVER: driver }]) frozen(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n', env), 'store.put');
      for (const flag of [`--driver=${driver}`, `--driver=${other(driver)}`]) frozen(await rsv(sb, [flag, 'store.put', 'mv', 'a/two'], 'two\n'), 'store.put');
      writeFileSync(join(sb, '.contexture/config'), `storage.driver: ${other(driver)}\n`);
      frozen(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n'), 'store.put');
      frozen(await rsv(sb, ['store.batch', 'mv'], batchPayload([{ action: 'delete', key: 'a/one' }])), 'store.batch');
      writeFileSync(join(sb, '.contexture/config'), `storage.driver: ${driver}\n`);
      await unchanged(sb);
    });

    it('[the-engine-r-mvf01] under a live holder the reads answer exactly as with no marker', async () => {
      const free = fresh(base);
      const sb = fresh(base);
      holdMove(sb, other(driver), 'live', driver);
      for (const [args, input] of READS) {
        const [a, b] = await Promise.all([rsv(free, args, input), rsv(sb, args, input)]);
        expect([b.code, b.stdout, b.stderr], args.join(' ')).toEqual([a.code, a.stdout, a.stderr]);
      }
      expect((await rsv(sb, ['store.get', 'mv', 'a/one'])).code).toBe(0);
    });

    it('[the-engine-r-mvf01] a marker whose holder is gone freezes nothing and stays for the next take; a pid-less one counts as held', async () => {
      const sb = fresh(base);
      holdMove(sb, other(driver), 'dead', driver);
      answer(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n'), 'store.put');
      expect(held(sb)?.target, 'the writer never removes the marker').toBe(`${other(driver)}\n`);
      const pidless = fresh(base);
      holdMove(pidless, other(driver), 'pidless', driver);
      frozen(await rsv(pidless, ['store.put', 'mv', 'a/two'], 'two\n', moveToken()), 'store.put');
      frozen(await rsv(pidless, [`--driver=${other(driver)}`, 'store.put', 'mv', 'a/two'], 'two\n', { CTX_STORAGE_MOVE: '' }), 'store.put');
      await unchanged(pidless);
    });

    it('[the-engine-r-mvf01] the holder\'s token passes only toward the marker\'s target; a token naming another pid passes nowhere', async () => {
      const sb = fresh(base);
      holdMove(sb, driver, 'live', other(driver));
      answer(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n', moveToken()), 'store.put');
      frozen(await rsv(sb, ['store.put', 'mv', 'a/three'], 'three\n', { CTX_STORAGE_MOVE: '1' }), 'store.put');
      frozen(await rsv(sb, ['store.put', 'mv', 'a/three'], 'three\n'), 'store.put');
      frozen(await rsv(sb, ['--driver=nosuch', 'store.put', 'mv', 'a/three'], 'three\n', moveToken()), 'store.put');
      expect((await rsv(sb, ['store.list', 'mv'])).stdout).toBe(listAnswer('mv', ['a/one', 'a/two']));
    });

    // the external commands a call runs, by name, under a PATH of logging shims
    async function calls(sb: string, args: readonly string[], input: string): Promise<string[]> {
      const log = join(sb, 'calls.log');
      const r = await rsv(sb, args, input, { PATH: shims, SHIM_LOG: log });
      expect(r.code, r.stderr).toBe(0);
      return readFileSync(log, 'utf8').split('\n').filter(Boolean).sort();
    }

    it('[the-engine-r-mvf01] cost: a write past a dead holder\'s marker runs the external commands of a write with no marker, and a read under a live holder those of a read with none', async () => {
      const [none, dead, read, frozenRead] = [fresh(base), fresh(base), fresh(base), fresh(base)];
      holdMove(dead, other(driver), 'dead', driver);
      holdMove(frozenRead, other(driver), 'live', driver);
      const [w0, w1, r0, r1] = await Promise.all([
        calls(none, ['store.put', 'mv', 'a/two'], 'two\n'),
        calls(dead, ['store.put', 'mv', 'a/two'], 'two\n'),
        calls(read, ['store.get', 'mv', 'a/one'], ''),
        calls(frozenRead, ['store.get', 'mv', 'a/one'], ''),
      ]);
      expect(w0.length, 'the instrument counts the write\'s commands').toBeGreaterThan(3);
      expect(w1).toEqual(w0);
      expect(r1).toEqual(r0);
    });

    it('[the-engine-r-mvf01] move-freeze takes the marker (target, source, then the holder pid), move-state reads it held, and move-release ends it', async () => {
      const sb = fresh(base);
      const take = await rsv(sb, ['move-freeze', PID, 'posix'], '', sleepShim());
      expect([take.code, take.stdout, take.stderr]).toEqual([0, '', '']);
      expect(held(sb)).toEqual({ pid: `${PID}\n`, source: `${driver}\n`, target: 'posix\n' });
      expect((await rsv(sb, ['move-state'])).stdout).toBe('held posix\n');
      frozen(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n'), 'store.put');
      const release = await rsv(sb, ['move-release', PID]);
      expect([release.code, release.stdout, release.stderr]).toEqual([0, '', '']);
      expect(held(sb)).toBeUndefined();
      expect((await rsv(sb, ['move-state'])).stdout).toBe('free\n');
      answer(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n'), 'store.put');
    });

    it('[the-engine-r-mvf01] move-freeze refuses a malformed or dead holder rc 1, a target the resolver cannot resolve rc 2, and a live holder\'s marker rc 2 at once, each in one line naming no path', async () => {
      const sb = fresh(base);
      const dead = String(exitedPid());
      const cases: [string[], number, string][] = [
        [['move-freeze'], 1, own('move-freeze takes the holder pid and the target driver', 'ERR_INVALID_ARGUMENT')],
        [['move-freeze', 'abc', 'posix'], 1, own("malformed holder pid 'abc'", 'ERR_INVALID_ARGUMENT')],
        [['move-freeze', '0', 'posix'], 1, own("malformed holder pid '0'", 'ERR_INVALID_ARGUMENT')],
        [['move-freeze', '', 'posix'], 1, own("malformed holder pid ''", 'ERR_INVALID_ARGUMENT')],
        [['move-freeze', dead, 'posix'], 1, own(`the holder pid '${dead}' names no live process`, 'ERR_INVALID_ARGUMENT')],
        [['move-freeze', PID, 'nosuch'], 2, own("storage driver 'nosuch' not found in the core drivers, the extension drivers, workspace drivers, module drivers, or PATH", 'ERR_DRIVER_NOT_FOUND')],
      ];
      for (const [args, rc, line] of cases) {
        const r = await rsv(sb, args);
        expect([r.code, r.stdout, r.stderr], args.join(' ')).toEqual([rc, '', line]);
        expect(held(sb)).toBeUndefined();
      }
      holdMove(sb, 'sqlite', 'live', driver);
      const before = held(sb);
      const t0 = performance.now();
      const r = await rsv(sb, ['move-freeze', PID, 'posix']);
      expect([r.code, r.stdout, r.stderr]).toEqual([2, '', own("storage is already being moved to driver 'sqlite'; one move at a time", LOCKED)]);
      expect(performance.now() - t0, 'one move at a time refuses at once').toBeLessThan(20_000);
      expect(held(sb)).toEqual(before);
    });

    it.skipIf(ROOT_USER)('[the-engine-r-mvf01] a lock folder that cannot be written refuses the take rc 2 ERR_STORAGE_WRITE, nothing frozen and nothing written in the system temp', async ({ onTestFinished }) => {
      const sb = fresh(base);
      const locks = dirname(marker(sb));
      mkdirSync(locks, { recursive: true });
      chmodPlant(locks, 0o555, 0o755, onTestFinished);
      const systemp = sandbox('freeze-systemp');
      const r = await rsv(sb, ['move-freeze', PID, 'posix'], '', { TMPDIR: systemp });
      expect([r.code, r.stdout, r.stderr]).toEqual([2, '', own("the drawer's lock folder cannot hold the storage moving marker", 'ERR_STORAGE_WRITE')]);
      expect(readdirSync(systemp)).toEqual([]);
      expect(readdirSync(locks)).toEqual([]);
      expect((await rsv(sb, ['move-state'])).stdout).toBe('free\n');
    });

    it('[the-engine-r-mvf01] a take reports a dead holder\'s marker naming its target, removes it, and takes the freeze; a pid-less one after ten polls of grace', async () => {
      const notice = (t: string) => `driver-resolver: notice: a crashed move to driver '${t}' left its freeze, removed now; that move needs its recovery\n`;
      const dead = fresh(base);
      holdMove(dead, 'sqlite', 'dead', driver);
      const d = sleepCount();
      const r = await rsv(dead, ['move-freeze', PID, 'posix'], '', d.env);
      expect([r.code, r.stdout, r.stderr]).toEqual([0, '', notice('sqlite')]);
      expect(held(dead)).toEqual({ pid: `${PID}\n`, source: `${driver}\n`, target: 'posix\n' });
      const pidless = fresh(base);
      holdMove(pidless, 'sqlite', 'pidless', driver);
      const p = sleepCount();
      const q = await rsv(pidless, ['move-freeze', PID, 'posix'], '', p.env);
      expect([q.code, q.stdout, q.stderr]).toEqual([0, '', notice('sqlite')]);
      expect(p.count() - d.count(), 'the pid-less marker\'s grace pauses').toBe(9);
      const bare = fresh(base);
      holdMove(bare, '', 'pidless', driver);
      const b = await rsv(bare, ['move-freeze', PID, 'posix'], '', sleepShim());
      expect([b.code, b.stderr]).toEqual([0, 'driver-resolver: notice: a crashed take left its freeze before naming its target, removed now\n']);
      expect(held(bare)?.pid).toBe(`${PID}\n`);
    });

    it('[the-engine-r-mvf01] move-release removes only the named holder\'s marker: an absent one answers rc 0, another holder\'s stays', async () => {
      const sb = fresh(base);
      expect([(await rsv(sb, ['move-release', PID])).code, held(sb)]).toEqual([0, undefined]);
      holdMove(sb, 'sqlite', 'live', driver);
      const before = held(sb);
      for (const [args, line] of [
        [['move-release', '1'], own("the storage moving freeze is not held by pid '1'", 'ERR_INVALID_ARGUMENT')],
        [['move-release', 'x'], own("malformed holder pid 'x'", 'ERR_INVALID_ARGUMENT')],
        [['move-release'], own('move-release takes the holder pid', 'ERR_INVALID_ARGUMENT')],
      ] as const) {
        const r = await rsv(sb, args);
        expect([r.code, r.stdout, r.stderr], args.join(' ')).toEqual([1, '', line]);
        expect(held(sb)).toEqual(before);
      }
      const pidless = fresh(base);
      holdMove(pidless, 'sqlite', 'pidless', driver);
      expect((await rsv(pidless, ['move-release', PID])).code).toBe(1);
      expect(held(pidless)).toBeDefined();
      expect((await rsv(sb, ['move-release', PID])).code).toBe(0);
      expect(held(sb)).toBeUndefined();
    });

    it('[the-engine-r-mvf01] move-state answers free, held <target>, or stale <target> in one line, a pid-less marker held', async () => {
      const state = async (sb: string) => {
        const r = await rsv(sb, ['move-state']);
        expect([r.code, r.stderr]).toEqual([0, '']);
        return r.stdout;
      };
      const sb = fresh(base);
      expect(await state(sb)).toBe('free\n');
      for (const [holder, target, line] of [['live', 'sqlite', 'held sqlite\n'], ['dead', 'sqlite', 'stale sqlite\n'], ['pidless', 'sqlite', 'held sqlite\n'], ['pidless', '', 'held\n']] as const) {
        const release = holdMove(sb, target, holder, driver);
        expect(await state(sb), `${holder} ${target}`).toBe(line);
        release();
      }
      const r = await rsv(sb, ['move-state', 'x']);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', own('move-state takes no argument', 'ERR_INVALID_ARGUMENT')]);
    });

    it('[the-engine-r-mvf01] the take drains: under a live namespace lock it waits, and answers once the lock is released', { timeout: DRAIN_CEILING }, async () => {
      const sb = fresh(base);
      const release = holdLock(sb, namespaceLock('mv'), 'live');
      let done = false;
      const take = rsv(sb, ['move-freeze', PID, 'posix'], '', {}, DRAIN_CEILING - 10_000).then((r) => {
        done = true;
        return r;
      });
      expect(await waitFor(() => existsSync(join(marker(sb), 'pid')), 30_000)).toBe(true);
      await new Promise((r) => setTimeout(r, 3_000));
      expect(done, 'the take waits while the namespace lock is held').toBe(false);
      frozen(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n'), 'store.put');
      release();
      const r = await take;
      expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
      expect(held(sb)?.pid).toBe(`${PID}\n`);
    });

    it('[the-engine-r-mvf01] the take refuses past the shared 600 polls under the sleep shim, naming the namespace, and removes its marker', { timeout: DRAIN_CEILING }, async () => {
      const sb = fresh(base);
      holdLock(sb, namespaceLock('mv'), 'live');
      const r = await rsv(sb, ['move-freeze', PID, 'posix'], '', sleepShim(), DRAIN_CEILING - 10_000);
      expect([r.code, r.stdout, r.stderr]).toEqual([2, '', own("the storage layer's namespace 'mv' is still locked by a writer (60 s timeout)", LOCKED)]);
      expect(held(sb)).toBeUndefined();
      expect((await rsv(sb, ['move-state'])).stdout).toBe('free\n');
    });

    it.each([['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]] as const)('[the-engine-r-mvf01] a %s to the take alone stops its drain at once, removes its marker, and leaves no process, its caller holding stdin open', async (sig, code) => {
      const sb = fresh(base);
      const release = holdLock(sb, namespaceLock('mv'), 'live');
      const run = launch(resolver(sb), ['move-freeze', PID, 'posix'], { cwd: sb, input: null, group: false, timeout: 60_000, env: { CTX_ROOT: sb } });
      expect(await waitFor(() => existsSync(join(marker(sb), 'pid')), 30_000)).toBe(true);
      await new Promise((r) => setTimeout(r, 300));
      run.signal(sig);
      const r = await run.result;
      release();
      expect(r.code).toBe(code);
      expect(held(sb)).toBeUndefined();
      expect(await waitFor(() => !alive(-(run.child.pid as number)), 5_000), 'the take\'s group empties').toBe(true);
    });
  });
}

describe.skipIf(!sqliteAvailable())('the move\'s own writes between two drivers', { concurrent: true }, () => {
  for (const [source, target] of [['posix', 'sqlite'], ['sqlite', 'posix']] as const) {
    describe(`${source} to ${target}`, { concurrent: true }, () => {
      let base: string;
      beforeAll(async () => {
        base = await seed(async (sb) => {
          dataFile(sb, 'modules', 'mv', MV);
          writeFileSync(join(sb, '.contexture/config'), `storage.driver: ${source}\n`);
          answer(await rsv(sb, ['store.put', 'mv', 'a/one'], 'one\n'), 'store.put');
          answer(await rsv(sb, [`--driver=${target}`, 'store.put', 'mv', 'a/old'], 'old\n'), 'store.put');
          answer(await rsv(sb, [`--driver=${target}`, 'store.delete', 'mv', 'a/old']), 'store.delete');
        }, 'sqlite', `freeze-${source}-${target}`);
      });
      const at = (sb: string, driver: string, ...args: string[]) => rsv(sb, [`--driver=${driver}`, ...args]);

      it('[the-engine-r-mvf01] the holder\'s token passes toward the target by flag or environment; another process toward the target refuses, with or without an override', async () => {
        const sb = fresh(base);
        holdMove(sb, target, 'live', source);
        answer(await rsv(sb, [`--driver=${target}`, 'store.put', 'mv', 'a/one'], 'one\n', moveToken()), 'store.put');
        answer(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n', { ...moveToken(), CTX_STORAGE_DRIVER: target }), 'store.put');
        expect((await at(sb, target, 'store.list', 'mv')).stdout).toBe(listAnswer('mv', ['a/one', 'a/two']));
        expect((await at(sb, source, 'store.list', 'mv')).stdout).toBe(listAnswer('mv', ['a/one']));
        frozen(await rsv(sb, [`--driver=${target}`, 'store.put', 'mv', 'a/three'], 'three\n'), 'store.put');
        frozen(await rsv(sb, ['store.put', 'mv', 'a/three'], 'three\n', { CTX_STORAGE_DRIVER: target }), 'store.put');
        frozen(await rsv(sb, [`--driver=${target}`, 'store.put', 'mv', 'a/three'], 'three\n', { CTX_STORAGE_MOVE: '1' }), 'store.put');
        frozen(await rsv(sb, ['store.put', 'mv', 'a/three'], 'three\n', moveToken()), 'store.put');
      });

      it('[the-engine-r-mvf01] toward the source the holder\'s delete only batch passes; its put, its delete, and a batch holding a put refuse, nothing staged left', async () => {
        const sb = fresh(base);
        holdMove(sb, target, 'live', source);
        frozen(await rsv(sb, ['store.delete', 'mv', 'a/one'], '', moveToken()), 'store.delete');
        frozen(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n', moveToken()), 'store.put');
        frozen(await rsv(sb, ['store.batch', 'mv'], batchPayload([{ action: 'delete', key: 'a/one' }, { action: 'put', key: 'a/two', value: 'two\n' }]), moveToken()), 'store.batch');
        frozen(await rsv(sb, ['store.batch', 'mv'], '\n', moveToken()), 'store.batch');
        frozen(await rsv(sb, ['store.batch', 'mv'], batchPayload([{ action: 'delete', key: 'a/one' }])), 'store.batch');
        await unchanged(sb, { CTX_STORAGE_DRIVER: source });
        answer(await rsv(sb, ['store.batch', 'mv'], batchPayload([{ action: 'delete', key: 'a/one' }]), moveToken()), 'store.batch');
        expect((await at(sb, source, 'store.list', 'mv')).stdout).toBe(listAnswer('mv', []));
        expect(staged(sb)).toEqual([]);
      });

      it('[the-engine-r-mvf01] after the storage.driver switch the freeze still holds: another process refuses, the holder writes the target and retires the source by delete only batches', async () => {
        const sb = fresh(base);
        holdMove(sb, target, 'live', source);
        writeFileSync(join(sb, '.contexture/config'), `storage.driver: ${target}\n`);
        frozen(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n'), 'store.put');
        frozen(await rsv(sb, [`--driver=${source}`, 'store.batch', 'mv'], batchPayload([{ action: 'delete', key: 'a/one' }])), 'store.batch');
        answer(await rsv(sb, ['store.put', 'mv', 'a/two'], 'two\n', moveToken()), 'store.put');
        frozen(await rsv(sb, [`--driver=${source}`, 'store.put', 'mv', 'a/two'], 'two\n', moveToken()), 'store.put');
        answer(await rsv(sb, [`--driver=${source}`, 'store.batch', 'mv'], batchPayload([{ action: 'delete', key: 'a/one' }]), moveToken()), 'store.batch');
        expect((await at(sb, source, 'store.list', 'mv')).stdout).toBe(listAnswer('mv', []));
        expect((await at(sb, target, 'store.list', 'mv')).stdout).toBe(listAnswer('mv', ['a/two']));
      });
    });
  }
});
