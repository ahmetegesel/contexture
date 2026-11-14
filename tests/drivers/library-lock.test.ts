import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { libraryLock, lockPath, namespaceLock } from '../support/drawer';
import { exec } from '../support/exec';
import { holdLock, sleepShim } from '../support/locks';
import { shFunction } from '../support/sh';
import { fresh, seed } from '../support/snapshot';
import { DRIVERS, fts5Available } from '../support/stage';
import { batchPayload } from '../support/store';

const LIBRARY = '.contexture/storage/scripts/library';
const LIBPROBE = 'namespace: libprobe\nroot: libprobe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n';
const WAIT_S = 60;
const SHIMMED_MS = (WAIT_S * 1000 * 3) / 4;

const sh = (sb: string, script: string, env: Record<string, string> = {}) =>
  shFunction(sb, join(sb, LIBRARY), 'eval', [script], { env: { CTX_STORE_ROOT: sb, ...env } });

async function until(test: () => boolean, ms = 10_000): Promise<void> {
  const t0 = performance.now();
  while (!test()) {
    if (performance.now() - t0 > ms) throw new Error('the condition never held');
    await new Promise((r) => setTimeout(r, 20));
  }
}

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'fts5' && !fts5Available())(`the library lock on ${driver}`, { concurrent: true }, () => {
    let snap: string;
    beforeAll(async () => {
      snap = await seed(async (sb) => void dataFile(sb, 'modules', 'libprobe', LIBPROBE), driver, 'library-lock');
    });

    it('[the-engine-r-uv5a3] lib_lock takes the namespace\'s lock in its own family holding the shell pid, LIB_LOCK names it, and lib_unlock removes it', async () => {
      const sb = fresh(snap);
      const r = await sh(sb, 'lib_lock libprobe || exit $?; printf "%s\\n%s\\n" "$LIB_LOCK" "$$"; cat "$LIB_LOCK/pid"; lib_unlock; printf "[%s]\\n" "$LIB_LOCK"');
      expect([r.code, r.stderr]).toEqual([0, '']);
      const [held, shell, pid, after] = r.stdout.split('\n');
      expect(held).toBe(lockPath(sb, libraryLock('libprobe')));
      expect(pid).toBe(shell);
      expect(after).toBe('[]');
      expect(existsSync(lockPath(sb, libraryLock('libprobe')))).toBe(false);
    });

    it('[the-engine-r-uv5a3] a second holder of the same namespace waits until the first releases', async () => {
      const sb = fresh(snap);
      const log = join(sb, 'order.log');
      const first = sh(sb, `lib_lock libprobe || exit $?; echo first-in >> "${log}"; sleep 1; echo first-out >> "${log}"; lib_unlock`);
      await until(() => existsSync(lockPath(sb, libraryLock('libprobe'))));
      const second = sh(sb, `lib_lock libprobe || exit $?; echo second-in >> "${log}"; lib_unlock`);
      const [a, b] = await Promise.all([first, second]);
      expect([a.code, a.stderr, b.code, b.stderr]).toEqual([0, '', 0, '']);
      expect(readFileSync(log, 'utf8')).toBe('first-in\nfirst-out\nsecond-in\n');
    });

    it(`[the-engine-r-uv5a3, the-engine-r18] a live holder refuses the next ERR_STORAGE_LOCKED after its ${WAIT_S} s wait, in seconds under the sleep shim, and the holder keeps its lock`, async () => {
      const sb = fresh(snap);
      const release = holdLock(sb, libraryLock('libprobe'), 'live');
      const t0 = performance.now();
      const r = await sh(sb, 'lib_lock libprobe', sleepShim());
      expect(performance.now() - t0).toBeLessThan(SHIMMED_MS);
      expect([r.code, r.stdout, r.stderr]).toEqual([2, '', `lib.lock: error: the library lock of 'libprobe' is held (${WAIT_S} s timeout) (ERR_STORAGE_LOCKED)\n`]);
      expect(existsSync(lockPath(sb, libraryLock('libprobe')))).toBe(true);
      release();
    });

    it('[the-engine-r-uv5a3, the-engine-r18] a lock whose holder pid is gone is removed at once and the lock is taken', async () => {
      const sb = fresh(snap);
      holdLock(sb, libraryLock('libprobe'), 'dead');
      const r = await sh(sb, 'lib_lock libprobe && cat "$LIB_LOCK/pid" && test "$(cat "$LIB_LOCK/pid")" = "$$" && lib_unlock');
      expect([r.code, r.stderr]).toEqual([0, '']);
      expect(existsSync(lockPath(sb, libraryLock('libprobe')))).toBe(false);
    });

    it('[the-engine-r-uv5a3, the-engine-r18] a pid-less lock is removed after its grace and the lock is taken', async () => {
      const sb = fresh(snap);
      holdLock(sb, libraryLock('libprobe'), 'pidless');
      const r = await sh(sb, 'lib_lock libprobe && lib_unlock', sleepShim());
      expect([r.code, r.stderr]).toEqual([0, '']);
      expect(existsSync(lockPath(sb, libraryLock('libprobe')))).toBe(false);
    });

    it('[the-engine-r-uv5a3] store_put, store_batch, store_get, and store_delete inside a held library lock complete: the driver\'s namespace lock is another folder', async () => {
      const sb = fresh(snap);
      writeFileSync(join(sb, 'batch.in'), batchPayload([{ action: 'put', key: 'x/z', head: 'none', value: 'batched\n' }]));
      const r = await sh(sb, [
        'lib_lock libprobe || exit $?',
        `test ! -e "${lockPath(sb, namespaceLock('libprobe'))}" || exit 9`,
        'printf "held\\n" | store_put libprobe x/y || exit $?',
        `store_batch libprobe < "${join(sb, 'batch.in')}" || exit $?`,
        'store_get libprobe x/y || exit $?',
        'store_delete libprobe x/y || exit $?',
        'lib_unlock',
      ].join('\n'));
      expect([r.code, r.stderr]).toEqual([0, '']);
      expect(r.stdout).toBe([
        '{"namespace":"libprobe","key":"x/y","op":"write"}',
        '{"namespace":"libprobe","actions":1}',
        'held',
        '{"namespace":"libprobe","key":"x/y","op":"remove"}',
        '',
      ].join('\n'));
    });

    it('[the-engine-r-uv5a3] a live driver namespace lock of the same name leaves the library lock free, and another namespace\'s library lock never blocks', async () => {
      const sb = fresh(snap);
      const driverHeld = holdLock(sb, namespaceLock('libprobe'), 'live');
      const otherHeld = holdLock(sb, libraryLock('other'), 'live');
      const r = await sh(sb, 'lib_lock libprobe && lib_unlock', sleepShim());
      expect([r.code, r.stderr]).toEqual([0, '']);
      driverHeld();
      otherHeld();
    });
  });
}

describe('the library lock refusals', { concurrent: true }, () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => void dataFile(sb, 'modules', 'libprobe', LIBPROBE), 'posix', 'library-lock-refusals');
  });

  it.each([
    ['the empty namespace', '', ''],
    ['a slash', 'a/b', 'a/b'],
    ['a parent climb', '../x', '../x'],
    ['an uppercase letter', 'Upper', 'Upper'],
    ['a leading dot', '.hidden', '.hidden'],
    ['a leading dash', '-x', '-x'],
    ['a blank', 'a b', 'a b'],
    ['a newline', 'a\nb', 'a\\nb'],
  ])('[the-engine-r-uv5a3] a malformed namespace (%s) refuses rc 1 with one line, no lock folder made', async (_name, ns, shown) => {
    const sb = fresh(snap);
    const r = await sh(sb, 'lib_lock "$NS"', { NS: ns });
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `lib.lock: error: malformed namespace '${shown}' (ERR_INVALID_ARGUMENT)\n`]);
    expect(existsSync(lockPath(sb, 'lib'))).toBe(false);
  });

  it.for(['sh', 'dash'])('[the-engine-r-uv5a3] under %s in a locale whose ranges collate case together an uppercase namespace still refuses, no lock folder made', async (shell, { skip }) => {
    if (shell === 'dash' && !existsSync('/bin/dash')) skip();
    const sb = fresh(snap);
    const r = await exec(shell, ['-c', '. "$1" && lib_lock Upper', 'sh', join(sb, LIBRARY)], { cwd: sb, env: { CTX_STORE_ROOT: sb, LC_ALL: 'en_US.UTF-8' } });
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "lib.lock: error: malformed namespace 'Upper' (ERR_INVALID_ARGUMENT)\n"]);
    expect(existsSync(lockPath(sb, 'lib'))).toBe(false);
  });

  it('[the-engine-r-uv5a3] a process holding a library lock refuses a second one at once, rc 1, and keeps the first', async () => {
    const sb = fresh(snap);
    const r = await sh(sb, 'lib_lock libprobe || exit $?; lib_lock libprobe; rc=$?; test -d "$LIB_LOCK" || exit 9; lib_unlock; exit $rc');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "lib.lock: error: this process already holds a library lock; release it before taking the lock of 'libprobe' (ERR_INVALID_ARGUMENT)\n"]);
    expect(existsSync(lockPath(sb, libraryLock('libprobe')))).toBe(false);
  });

  it('[the-engine-r-uv5a3] a lock folder that cannot be made refuses rc 2 ERR_STORAGE_WRITE with one line', async () => {
    const sb = fresh(snap);
    mkdirSync(dirname(lockPath(sb, 'lib')), { recursive: true });
    writeFileSync(lockPath(sb, 'lib'), 'a file in the folder\'s place\n');
    const r = await sh(sb, 'lib_lock libprobe');
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', "lib.lock: error: cannot create the library lock folder of 'libprobe' (ERR_STORAGE_WRITE)\n"]);
  });

  it('[the-engine-r-uv5a3] lib_unlock with no lock held is a no-op rc 0', async () => {
    const r = await sh(fresh(snap), 'lib_unlock && lib_unlock');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });
});
